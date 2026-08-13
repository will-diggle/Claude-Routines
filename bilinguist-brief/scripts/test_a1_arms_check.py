"""
Test: A1, two ways, across DE/FR/IT, on the two known stories -- which produces better A1?
  Arm A ("simplify"): rewrite the already-translated native article down to A1
                       (production's real path: build_rewrite_prompt, carries GRAMMAR_RULE_A1)
  Arm B ("from facts"): write A1 directly from the English fact-base in the target language
                       (production's real fallback path: build_writing_prompt +
                       PROMPT_LEARNER_TEMPLATE -- but that template has NO {GRAMMAR_RULE}
                       placeholder at all, so production never gives this arm the positive-
                       hints grammar rule. To keep this a fair A-vs-B test of "simplify vs
                       write from facts" rather than "has the grammar rule vs doesn't," this
                       test appends GRAMMAR_RULE_A1 to arm B's prompt too -- test-only, not a
                       production change.

Builds on the confirmed-good pipeline: EN native (plain-text, exact-210, long-form) -> DE/FR/IT
translation (plain-text, target = EN source length) -> both A1 arms per language. Reuses the
two hardcoded, already-vetted fact-bases (Trump plane-swap, Jensen Huang/Nvidia) -- no
scraping/gathering needed for this mechanism test.

2 EN native + 6 translations + 12 A1 calls (2 stories x 3 langs x 2 arms) = 20 Gemini calls.
Standalone -- no pipeline stages, never touches the data repo or the live app.

    python test_a1_arms_check.py
"""

import json
import re
import sys
import time

from google import genai
from google.genai import types

from test_native_exact_210 import TRUMP_STORY, JENSEN_STORY

LANGS = ("de", "fr", "it")

# build_rewrite_prompt's cut-rule ("same"/"trim"/"reduce"/"cut") depends on how many CEFR
# levels below native the target is. Without this, native_grade is None and the "reduce"
# branch (2+ levels down) never triggers, understating how much A1 needs to simplify.
_NATIVE_GRADE_ASSUMED = "C1"

EXACT_210_RULE = (
    "Write exactly 210 words. Count every word before submitting. If your count is not "
    "210, revise the article and count again until it is. This is a precise target, not a "
    "range -- 208 or 213 is a miss, not close enough."
)

PLAIN_OUTPUT_FORMAT = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "Output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these two fields."
)

TRANSLATE_OUTPUT_FORMAT_TEMPLATE = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "Your target is {TARGET} words.\n\n"
    "Output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these two fields."
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
    result = {"headline": "", "body": ""}
    m_headline = re.search(r"HEADLINE:\s*(.+?)\n", raw)
    if m_headline:
        result["headline"] = m_headline.group(1).strip()
    m_body = re.search(r"BODY:\s*\n?(.*)", raw, re.DOTALL)
    if m_body:
        result["body"] = m_body.group(1).strip()
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


def write_native(client: "genai.Client", story: dict) -> dict:
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
        "headline": r["headline"], "body": r["body"], "actual_words": actual,
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
        "slug": en_article.get("slug"), "lang": lang, "genre": en_article.get("genre"),
        "headline": r["headline"], "body": r["body"], "actual_words": actual,
    }


def a1_simplify_native(client: "genai.Client", lang: str, native_article: dict) -> dict:
    """Arm A: rewrite the translated native article down to A1 (production's real path)."""
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    prompt = w.build_rewrite_prompt(lang, "A1", "longer", native_article)
    w.OUTPUT_FORMAT_SINGLE = orig_format

    raw = _generate(client, prompt, f"{lang}/A1-simplify/{native_article.get('slug')}")
    if not raw:
        return {"arm": "simplify", "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {"arm": "simplify", "headline": r["headline"], "body": r["body"], "actual_words": actual}


def a1_from_facts(client: "genai.Client", lang: str, story: dict) -> dict:
    """Arm B: write A1 directly from the English fact-base (production's real fallback
    path) -- with GRAMMAR_RULE_A1 appended, since PROMPT_LEARNER_TEMPLATE has no
    {GRAMMAR_RULE} placeholder in production and would otherwise get no grammar hint at all,
    confounding this comparison."""
    import bilinguist_write as w
    import bilinguist_prompts as p
    orig_format = w.OUTPUT_FORMAT_SINGLE
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    prompt = w.build_writing_prompt(w.PROMPT_2S_HEADER, lang, "A1", "longer", [story])
    w.OUTPUT_FORMAT_SINGLE = orig_format

    grammar_rule = p.GRAMMAR_RULE_A1.format(
        LEVEL_DESCRIPTION=p.LEVEL_DESCRIPTIONS.get("A1", "A1"),
        LANGUAGE=w.LANGUAGE_NAMES.get(lang, lang),
    )
    # Insert right after the WORD COUNT block, before OUTPUT FORMAT, matching where the
    # rewrite path places it relative to other rules.
    prompt = prompt.replace("OUTPUT FORMAT", f"{grammar_rule}\n\nOUTPUT FORMAT", 1)

    raw = _generate(client, prompt, f"{lang}/A1-facts/{story.get('slug')}")
    if not raw:
        return {"arm": "from_facts", "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {"arm": "from_facts", "headline": r["headline"], "body": r["body"], "actual_words": actual}


def main() -> None:
    import bilinguist_write as w
    w._NATIVE_GRADES = {lang: _NATIVE_GRADE_ASSUMED for lang in LANGS}

    client = genai.Client()
    stories = [TRUMP_STORY, JENSEN_STORY]

    print(f"\n{'#' * 10} A1 arms: simplify-native vs write-from-facts, "
          f"{len(stories)} stories x {len(LANGS)} languages {'#' * 10}\n")

    for story in stories:
        en = write_native(client, story)
        if "error" in en:
            print(f"\n[{story.get('slug')}] EN ERROR: {en['error']}", file=sys.stderr)
            continue
        print(f"\n{'=' * 20} {story.get('slug')} — EN native ({en['actual_words']} words) {'=' * 20}\n")
        print(en["body"])

        for lang in LANGS:
            native_lang = translate(client, lang, en)
            if "error" in native_lang:
                print(f"\n[{story.get('slug')}/{lang}] translation ERROR: {native_lang['error']}", file=sys.stderr)
                continue

            simplify = a1_simplify_native(client, lang, native_lang)
            from_facts = a1_from_facts(client, lang, story)

            print(f"\n{'#' * 6} {lang.upper()} — {story.get('slug')} {'#' * 6}\n")

            if "error" in simplify:
                print(f"  [SIMPLIFY  ] ERROR: {simplify['error']}", file=sys.stderr)
            else:
                print(f"  [SIMPLIFY  ] {simplify['actual_words']} words — {simplify['headline']}")
            if "error" in from_facts:
                print(f"  [FROM-FACTS] ERROR: {from_facts['error']}", file=sys.stderr)
            else:
                print(f"  [FROM-FACTS] {from_facts['actual_words']} words — {from_facts['headline']}")

            if "error" not in simplify:
                print(f"\n  --- SIMPLIFY body ---\n  {simplify['body']}")
            if "error" not in from_facts:
                print(f"\n  --- FROM-FACTS body ---\n  {from_facts['body']}")

    print(
        "\nNOTE: A1 word target is 210-235 (longer). Read both arms' bodies for grammar-rule "
        "compliance (present tense/simple past only, no passive, no embedded clauses, no "
        "complex relative pronouns), fact fidelity vs the source, and political-title "
        "compliance (titles must stay verbatim even at A1)."
    )


if __name__ == "__main__":
    main()
