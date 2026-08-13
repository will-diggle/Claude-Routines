"""
Test: short-form (105 words) EN native -> DE/FR/IT translation fidelity. Same
single-source-of-truth architecture as the long-form translation test, but for "short"
length -- checks whether facts, fact order, and word count survive translation at the
tighter short-form target.

Reuses the two hardcoded, already-vetted fact-bases from test_native_exact_210.py (Trump
plane-swap, Jensen Huang/Nvidia) instead of scraping/gathering fresh -- these facts are
already collated and don't need re-fetching for a mechanism test like this. 2 native EN
calls + 6 translation calls (DE/FR/IT x 2 stories) = 8 Gemini calls total. Standalone --
no pipeline stages, never touches the data repo or the live app.

    python test_short_translate_check.py
"""

import json
import re
import sys
import time

from google import genai
from google.genai import types

from test_native_exact_210 import TRUMP_STORY, JENSEN_STORY

TARGET_SHORT = 105
LANGS = ("de", "fr", "it")

EXACT_105_RULE = (
    f"Write exactly {TARGET_SHORT} words. Count every word before submitting. If your "
    f"count is not {TARGET_SHORT}, revise the article and count again until it is. This "
    f"is a precise target, not a range -- {TARGET_SHORT - 2} or {TARGET_SHORT + 3} is a "
    "miss, not close enough."
)

# No self-check fields (word count or fact count): both always just echoed back a number
# close to the stated target rather than reflecting a genuine count (confirmed across many
# test runs) -- pure token waste that also distracts the model from the actual task.
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


def write_native_short(client: "genai.Client", story: dict) -> dict:
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE["short"]
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    w.NATIVE_WORD_RULE["short"] = EXACT_105_RULE
    prompt = w.build_native_prompt("en", [story], "short")
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE["short"] = orig_rule

    raw = _generate(client, prompt, f"en/{story.get('slug')}")
    if not raw:
        return {"slug": story.get("slug"), "error": "no response"}
    r = parse_plain(raw)
    actual = len(r["body"].split())
    return {
        "slug": story.get("slug"), "headline": r["headline"], "body": r["body"],
        "actual_words": actual, "deviation": actual - TARGET_SHORT,
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
        "actual_words": actual,
        "target_words": target, "deviation_from_en": actual - target,
    }


def main() -> None:
    client = genai.Client()
    stories = [TRUMP_STORY, JENSEN_STORY]

    print(f"\n{'#' * 10} Short-form EN native + DE/FR/IT translation, {len(stories)} stories {'#' * 10}\n")
    for story in stories:
        en = write_native_short(client, story)
        if "error" in en:
            print(f"\n[{story.get('slug')}] EN ERROR: {en['error']}", file=sys.stderr)
            continue
        print(f"\n{'=' * 20} {story.get('slug')} — EN native ({en['actual_words']} words, "
              f"target {TARGET_SHORT}, dev {en['deviation']:+d}) {'=' * 20}\n")
        print(f"Headline: {en['headline']}\n")
        print(en["body"])

        for lang in LANGS:
            tr = translate(client, lang, en)
            if "error" in tr:
                print(f"\n[{story.get('slug')}/{lang}] ERROR: {tr['error']}", file=sys.stderr)
                continue
            print(f"\n{'-' * 15} {lang.upper()} translation ({tr['actual_words']} words, "
                  f"target {tr['target_words']}, dev {tr['deviation_from_en']:+d}) {'-' * 15}\n")
            print(f"Headline: {tr['headline']}\n")
            print(tr["body"])

    print(
        "\nNOTE: no self-reported counts (word or fact) -- they always echoed back a number "
        "close to the target rather than a genuine count, so they're dropped. Read the "
        "printed DE/FR/IT bodies above against the EN body to manually check fact presence, "
        "order, and no invention/omission, including political titles (e.g. 'former President')."
    )


if __name__ == "__main__":
    main()
