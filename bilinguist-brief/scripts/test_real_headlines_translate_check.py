"""
Test: single-source-of-truth translation, long-form, on TODAY'S real headlines. Confirmed-good
settings carried forward from the native EN tests: exact-word-count instruction + plain-text
(no forced JSON) output. Writes native EN once per real winning story, then translates that
exact English into German and French ("write it as [outlet]'s own journalist would," not a
literal translation) -- checking whether facts, fact order, and word count survive translation.

Runs TODAY'S real Stage 1-4 (scrape, select, gather winners, fact-check) exactly as production
does. Reuses bilinguist_scrape.main(), bilinguist_gather.main(), bilinguist_factcheck.main()
unmodified. Stage 5 (native EN + DE/FR translation) uses the test overrides -- plain-text
output, exact-word-count instructions (210 for EN; translation targets the EN article's own
actual word count, not a fixed number, since translation should mirror the source length).
Everything writes to local files in this directory -- never touches the data repo, the live
app, or any Supabase/D1 write.

    python test_real_headlines_translate_check.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

BRIEF_DATE = os.environ.get(
    "BRIEF_DATE",
    __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d"),
)
os.environ["BRIEF_DATE"] = BRIEF_DATE

SCRIPT_DIR = Path(__file__).parent
LANGS = ("de", "fr")


def run_stage(label: str, fn, *args, **kwargs) -> None:
    print(f"\n{'#' * 10} {label} {'#' * 10}\n")
    fn(*args, **kwargs)


def stage1_scrape() -> None:
    import bilinguist_scrape
    sys.argv = ["bilinguist_scrape.py"]
    bilinguist_scrape.main()


def stage2_select() -> None:
    import bilinguist_gather
    sys.argv = ["bilinguist_gather.py", "--select-only"]
    bilinguist_gather.main()
    src = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    dst = SCRIPT_DIR / "selection.json"
    dst.write_bytes(src.read_bytes())


def stage3_gather() -> None:
    import bilinguist_gather
    sys.argv = ["bilinguist_gather.py", "--from", str(SCRIPT_DIR / "selection.json"),
                "--facts-input", "winners"]
    bilinguist_gather.main()


def stage4_factcheck() -> None:
    import bilinguist_factcheck
    sys.argv = ["bilinguist_factcheck.py"]
    bilinguist_factcheck.main()


# ── Stage 5 (test overrides): exact-210 EN + plain-text no-JSON ────────────────────────────
EXACT_210_RULE = (
    "Write exactly 210 words. Count every word before submitting. If your count is not "
    "210, revise the article and count again until it is. This is a precise target, not a "
    "range -- 208 or 213 is a miss, not close enough."
)

PLAIN_OUTPUT_FORMAT = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "First, draft the article. Count its words by actually going through it and counting --"
    " not estimating. If the count is outside the word count range given above, revise the "
    "draft and count again. Repeat until the count is genuinely inside the range.\n\n"
    "Once it is, output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n"
    "SELF-CHECK WORD COUNT: <the exact number of words you counted in the body above>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these three fields."
)

# Translation -- same plain-text mechanism, targets the EN source's own actual word count
# rather than a fixed number, since a faithful translation should mirror source length, not
# hit an independent target.
TRANSLATE_OUTPUT_FORMAT_TEMPLATE = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "First, draft the article. Count its words by actually going through it and counting -- "
    "not estimating. Your target is {TARGET} words (the English source's own length) -- if "
    "your count is more than 10 words away from {TARGET}, revise and count again.\n\n"
    "Once it is close, output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n"
    "SELF-CHECK WORD COUNT: <the exact number of words you counted in the body above>\n"
    "FACT COUNT: <how many distinct facts from the English source you included>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these four fields."
)

TRANSLATE_PROMPT = """You are a high-end journalist writing for {OUTLET}, the most respected news outlet writing in {LANGUAGE}.

Below is a news article originally written in English. Write it in {LANGUAGE} the way a {OUTLET} journalist would write it natively for their own readers -- NOT a literal, word-for-word translation. Restructure sentences for natural {LANGUAGE} rhythm and idiom.

KEEP, EXACTLY:
- Every fact in the article, and the order they appear in. Never add, drop or reorder facts.
- Every number, name, place and organisation, verbatim.

POLITICAL TITLES — CRITICAL: use ONLY the title given in the English source. Never alter a political title from your own training data. Never add "former" or "ex-" unless the source explicitly says the person has left office.

QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.

{OUTPUT_FORMAT}

[ENGLISH ARTICLE BELOW]
Headline: {headline}
Body: {body}
"""


def parse_plain(raw: str) -> dict:
    # Extract each field independently rather than one mega-regex -- more tolerant of
    # field-order drift or a missing field than a single strict pattern would be.
    result = {"headline": "", "body": "", "self_reported": "", "fact_count": ""}
    m_headline = re.search(r"HEADLINE:\s*(.+?)\n", raw)
    if m_headline:
        result["headline"] = m_headline.group(1).strip()
    m_body = re.search(
        r"BODY:\s*\n?(.*?)(?=\n*SELF-CHECK WORD COUNT:|\Z)", raw, re.DOTALL)
    if m_body:
        result["body"] = m_body.group(1).strip()
    m_self = re.search(r"SELF-CHECK WORD COUNT:\s*(\d+)", raw)
    if m_self:
        result["self_reported"] = m_self.group(1)
    m_fact = re.search(r"FACT COUNT:\s*(\d+)", raw)
    if m_fact:
        result["fact_count"] = m_fact.group(1)
    if not result["body"]:
        result["body"] = raw.strip()
    return result


def _generate(client: "genai.Client", prompt: str, label: str) -> str:
    response = None
    for attempt in range(1, 4):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            break
        except Exception as e:
            err = str(e)
            if any(c in err for c in ["503", "429"]) and attempt < 3:
                delay = [15, 30][attempt - 1]
                print(f"[{label}] attempt {attempt} failed ({e}) — retrying in {delay}s…", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[{label}] non-retryable error: {e}", file=sys.stderr)
                return ""
    return response.text if response else ""


def write_native_en(client: "genai.Client", story: dict) -> dict:
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE["longer"]
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    w.NATIVE_WORD_RULE["longer"] = EXACT_210_RULE
    prompt = w.build_native_prompt("en", [story], "longer")
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE["longer"] = orig_rule

    raw = _generate(client, prompt, f"en/{story.get('slug')}")
    if not raw:
        return {"slug": story.get("slug"), "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {
        "slug": story.get("slug"), "genre": story.get("genre"),
        "headline": r["headline"], "body": r["body"],
        "actual_words": actual, "self_reported": r["self_reported"],
        "deviation": actual - 210,
        "n_facts_available": len(story.get("what_happened") or []),
    }


def translate(client: "genai.Client", lang: str, en_article: dict) -> dict:
    import bilinguist_write as w
    lang_name = w.LANGUAGE_NAMES.get(lang, lang)
    outlet = w.NATIVE_OUTLETS.get(lang, w.NATIVE_OUTLET_FALLBACK)
    quote_rule = w.QUOTE_RULES.get(lang, w.QUOTE_RULE_FALLBACK)
    target = en_article["actual_words"]

    prompt = TRANSLATE_PROMPT.format(
        LANGUAGE=lang_name, OUTLET=outlet, QUOTE_RULE=quote_rule,
        OUTPUT_FORMAT=TRANSLATE_OUTPUT_FORMAT_TEMPLATE.format(TARGET=target),
        headline=en_article.get("headline", ""), body=en_article.get("body", ""),
    )
    raw = _generate(client, prompt, f"{lang}/{en_article.get('slug')}")
    if not raw:
        return {"slug": en_article.get("slug"), "lang": lang, "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {
        "slug": en_article.get("slug"), "lang": lang, "headline": r["headline"], "body": r["body"],
        "actual_words": actual, "self_reported": r["self_reported"],
        "fact_count_reported": r["fact_count"],
        "target_words": target, "deviation_from_en": actual - target,
    }


def main() -> None:
    run_stage("STAGE 1 — Scrape (real, today)", stage1_scrape)
    run_stage("STAGE 2 — Select (real, today)", stage2_select)
    run_stage("STAGE 3 — Gather facts for winners (real, today)", stage3_gather)
    run_stage("STAGE 4 — Fact-check (real, today)", stage4_factcheck)

    factbase_path = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    with open(factbase_path, encoding="utf-8") as f:
        doc = json.load(f)
    factbase = doc.get("factbase", [])
    factcheck = doc.get("factcheck", {})

    # Limited scope: only the top-ranked GLOBAL NEWS stories, to keep this test cheap and
    # fast (translation isn't genre-specific, and today's Gemini API has been unstable --
    # fewer calls means less exposure to transient 503s/disconnects).
    max_stories = int(os.environ.get("MAX_STORIES", "2"))
    only_genre = os.environ.get("ONLY_GENRE", "GLOBAL NEWS")
    if only_genre:
        factbase = [s for s in factbase if s.get("genre") == only_genre]
    factbase = factbase[:max_stories]

    print(f"\n{'#' * 10} STAGE 5 — EN native + DE/FR translation, {len(factbase)} stories "
          f"(genre={only_genre or 'any'}, max={max_stories}) {'#' * 10}\n")
    client = genai.Client()
    all_results = []
    for story in factbase:
        en = write_native_en(client, story)
        all_results.append({"story": story.get("slug"), "en": en, "translations": {}})
        if "error" in en:
            print(f"\n[{story.get('slug')}] EN ERROR: {en['error']}", file=sys.stderr)
            continue
        print(f"\n{'=' * 20} {story.get('slug')} — EN native ({en['actual_words']} words, "
              f"target 210, dev {en['deviation']:+d}, {en['n_facts_available']} facts available) {'=' * 20}\n")
        print(f"Headline: {en['headline']}\n")
        print(en["body"])

        for lang in LANGS:
            tr = translate(client, lang, en)
            all_results[-1]["translations"][lang] = tr
            if "error" in tr:
                print(f"\n[{story.get('slug')}/{lang}] ERROR: {tr['error']}", file=sys.stderr)
                continue
            print(f"\n{'-' * 15} {lang.upper()} translation ({tr['actual_words']} words, "
                  f"target {tr['target_words']} [=EN], dev {tr['deviation_from_en']:+d}, "
                  f"self-reported {tr['self_reported'] or 'none'}, "
                  f"fact-count reported {tr['fact_count_reported'] or 'none'}) {'-' * 15}\n")
            print(f"Headline: {tr['headline']}\n")
            print(tr["body"])

    print(f"\n{'#' * 10} SUMMARY — translation fidelity, {len(factbase)} stories {'#' * 10}\n")
    print(f"{'slug':<40} {'EN words':>9} {'DE words':>9} {'DE dev':>7} {'FR words':>9} {'FR dev':>7}")
    for r in all_results:
        en = r["en"]
        if "error" in en:
            print(f"{r['story']:<40} {'ERR':>9}")
            continue
        de = r["translations"].get("de", {})
        fr = r["translations"].get("fr", {})
        de_w = de.get("actual_words", "ERR")
        de_d = f"{de['deviation_from_en']:+d}" if "error" not in de else "ERR"
        fr_w = fr.get("actual_words", "ERR")
        fr_d = f"{fr['deviation_from_en']:+d}" if "error" not in fr else "ERR"
        print(f"{r['story']:<40} {en['actual_words']:>9} {de_w!s:>9} {de_d:>7} {fr_w!s:>9} {fr_d:>7}")

    print(f"\n[factcheck] stories_checked={factcheck.get('stories_checked', 'n/a')} "
          f"corrections={len(factcheck.get('corrections', []))}")
    for c in factcheck.get("corrections", []):
        print(f"  - {c}")

    print(
        "\nNOTE: 'fact-count reported' is the model's own self-report — treat it the same way "
        "self-reported word counts have tested: as unverified until cross-checked by reading "
        "the bodies. Read the printed DE/FR bodies above against the EN body to manually check "
        "fact presence, order, and no invention/omission."
    )


if __name__ == "__main__":
    main()
