"""
Test: A1 and A2, short and long, across DE/FR/IT, on the two known stories -- extends the
confirmed-good SIMPLIFY approach (rewrite the translated native article down to level) to
A2 for the first time, and to short-form for the first time. Standardises on SIMPLIFY only
(the FROM-FACTS arm was tested and rejected: word count consistently far under target, an
unfixed outlet-naming rule violation, and no vocabulary-gloss support at all).

Also exercises GRAMMAR_RULE_A2 (bilinguist_prompts.py) for the first time -- A2 previously
had no explicit grammar rule in production at all (fell through to the empty
GRAMMAR_RULE_FALLBACK). Written with the same positive-hints structure as GRAMMAR_RULE_A1,
but reflecting what A2 can actually handle (the imperfect, one level of subordinate clause)
while still banning what A1 bans (subjunctive, conditional, complex relative pronouns,
nested clauses).

Pipeline per (story, length): EN native (plain-text, exact-word-count target) -> DE/FR/IT
translation (plain-text, target = EN source length) -> SIMPLIFY rewrite to A1 AND A2.
2 stories x 2 lengths x (1 EN + 3 translations + 3x2 rewrites) = 4 EN + 12 translations +
24 rewrites = 40 Gemini calls total. Reuses the two hardcoded, already-vetted fact-bases
(Trump plane-swap, Jensen Huang/Nvidia). Standalone -- no pipeline stages, never touches the
data repo or the live app.

    python test_a1_a2_lengths_check.py
"""

import re
import sys
import time

from google import genai
from google.genai import types

from test_native_exact_210 import TRUMP_STORY, JENSEN_STORY

LANGS = ("de", "fr", "it")
LEVELS = ("A1", "A2")
LENGTHS = ("short", "longer")

EXACT_RULE_BY_LENGTH = {
    "short": (
        "Write exactly 105 words. Count every word before submitting. If your count is "
        "not 105, revise the article and count again until it is. This is a precise "
        "target, not a range -- 103 or 108 is a miss, not close enough."
    ),
    "longer": (
        "Write exactly 210 words. Count every word before submitting. If your count is "
        "not 210, revise the article and count again until it is. This is a precise "
        "target, not a range -- 208 or 213 is a miss, not close enough."
    ),
}

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


def write_native(client: "genai.Client", story: dict, length: str) -> dict:
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE[length]
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    w.NATIVE_WORD_RULE[length] = EXACT_RULE_BY_LENGTH[length]
    prompt = w.build_native_prompt("en", [story], length)
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE[length] = orig_rule

    raw = _generate(client, prompt, f"en/{length}/{story.get('slug')}")
    if not raw:
        return {"slug": story.get("slug"), "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {
        "slug": story.get("slug"), "genre": story.get("genre"),
        "headline": r["headline"], "body": r["body"], "actual_words": actual,
    }


def translate(client: "genai.Client", lang: str, en_article: dict, length: str) -> dict:
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
    raw = _generate(client, prompt, f"{lang}/{length}/{en_article.get('slug')}")
    if not raw:
        return {"slug": en_article.get("slug"), "lang": lang, "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {
        "slug": en_article.get("slug"), "lang": lang, "genre": en_article.get("genre"),
        "headline": r["headline"], "body": r["body"], "actual_words": actual,
    }


def simplify(client: "genai.Client", lang: str, level: str, length: str, native_article: dict) -> dict:
    """SIMPLIFY: rewrite the translated native article down to `level` (production's real
    path -- build_rewrite_prompt, which now carries GRAMMAR_RULE_A1 or GRAMMAR_RULE_A2)."""
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    prompt = w.build_rewrite_prompt(lang, level, length, native_article)
    w.OUTPUT_FORMAT_SINGLE = orig_format

    raw = _generate(client, prompt, f"{lang}/{level}/{length}/{native_article.get('slug')}")
    if not raw:
        return {"level": level, "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {"level": level, "headline": r["headline"], "body": r["body"], "actual_words": actual}


def main() -> None:
    import bilinguist_write as w
    w._NATIVE_GRADES = {lang: "C1" for lang in LANGS}

    client = genai.Client()
    stories = [TRUMP_STORY, JENSEN_STORY]

    print(f"\n{'#' * 10} A1 + A2, short + long, {len(stories)} stories x {len(LANGS)} "
          f"languages {'#' * 10}\n")

    for story in stories:
        for length in LENGTHS:
            en = write_native(client, story, length)
            if "error" in en:
                print(f"\n[{story.get('slug')}/{length}] EN ERROR: {en['error']}", file=sys.stderr)
                continue
            print(f"\n{'=' * 20} {story.get('slug')} [{length}] — EN native "
                  f"({en['actual_words']} words) {'=' * 20}\n")
            print(en["body"])

            for lang in LANGS:
                native_lang = translate(client, lang, en, length)
                if "error" in native_lang:
                    print(f"\n[{story.get('slug')}/{lang}/{length}] translation ERROR: "
                          f"{native_lang['error']}", file=sys.stderr)
                    continue

                print(f"\n{'#' * 6} {lang.upper()} [{length}] — {story.get('slug')} — "
                      f"native ({native_lang['actual_words']} words) {'#' * 6}\n")
                print(native_lang["body"])

                for level in LEVELS:
                    r = simplify(client, lang, level, length, native_lang)
                    if "error" in r:
                        print(f"\n  [{level}] ERROR: {r['error']}", file=sys.stderr)
                        continue
                    print(f"\n  --- {level} ({r['actual_words']} words) — {r['headline']} ---")
                    print(f"  {r['body']}")

    print(
        "\nNOTE: read each level's body for grammar-rule compliance (A1: present + simple "
        "past only, no imperfect/passive/embedded clauses; A2: present + simple past + "
        "imperfect allowed, one level of subordinate clause allowed, still no "
        "conditional/subjunctive/complex relatives), gloss correctness (no political-status "
        "claims in brackets, no gloss on well-known figures), fact fidelity, and outlet-name "
        "avoidance."
    )


if __name__ == "__main__":
    main()
