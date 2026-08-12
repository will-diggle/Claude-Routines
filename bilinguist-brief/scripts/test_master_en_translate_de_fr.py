"""
Test: single-source-of-truth architecture. English native is written once (with facts_used
reported), German and French are TRANSLATED from that English master ("write it as
Der Spiegel/Le Monde's own journalist would," not literal translation) instead of composed
independently -- guaranteeing every language carries the identical facts, in the identical
order. Then A1 is tried two ways per language, to compare:
  (a) rewrite of the translated native article (production's arm-B mechanism)
  (b) written directly from the English master's fact list (test_a1_facts_used_de_fr's
      arm, reused here)

7 Gemini calls total: 1 native EN + 2 translate (DE/FR) + 2 A1-from-translated-native +
2 A1-from-English-facts. Uses the same fixture as every other test this session. Standalone
-- no pipeline stages, never touches the data repo or the live app.

    python test_master_en_translate_de_fr.py
"""

import sys

from google import genai

import bilinguist_prompts as P
import bilinguist_write as W
import test_a1_facts_used_de_fr as T  # reuses STORY, build_a1_from_facts_prompt, POLITICAL_TITLES_RULE

W._NATIVE_GRADES = {"de": "C1", "fr": "C1", "en": "C1"}

TRANSLATE_PROMPT = """You are a high-end journalist writing for {OUTLET}, the most respected news outlet writing in {LANGUAGE}.

Below is a news article originally written in English. Write it in {LANGUAGE} the way a {OUTLET} journalist would write it natively for their own readers -- NOT a literal, word-for-word translation. Restructure sentences for natural {LANGUAGE} rhythm and idiom.

KEEP, EXACTLY:
- Every fact in the article, and the order they appear in. Never add, drop or reorder facts.
- Every number, name, place and organisation, verbatim.

{POLITICAL_TITLES_RULE}

QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.

WORD COUNT: roughly the same length as the source article -- natural journalism, not padding and not excessive cutting.

OUTPUT FORMAT: {{"genre":"...","slug":"...","headline":"...","body":"..."}}
Return ONE object, not a list. Copy "slug" and "genre" verbatim from the source article.

[ENGLISH ARTICLE BELOW]
Headline: {headline}
Body: {body}
"""


def run_native_en(client: "genai.Client") -> tuple[dict, list]:
    prompt = T.build_native_prompt_with_facts("en", T.STORY, "longer")
    print(f"\n{'=' * 20} EN NATIVE — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, W.MODEL_3, prompt, "test/en-native-master", stage="3",
        schema=T._SCHEMA_NATIVE_WITH_FACTS, max_output_tokens=8192,
    )
    if not raw:
        print(f"[en] ERROR: no native response (finish_reason={finish})", file=sys.stderr)
        return {}, []
    parsed = W.parse_llm_json(raw) or {}
    articles = parsed.get("articles") or []
    if not articles:
        print("[en] ERROR: no native article returned", file=sys.stderr)
        return {}, []
    art = articles[0]
    facts_used = art.get("facts_used") or []
    print(f"\n{'=' * 20} EN NATIVE — RESULT ({len(art.get('body', '').split())} words) {'=' * 20}\n")
    print(art.get("body", ""))
    print(f"\nfacts_used: {facts_used}")
    return art, facts_used


def run_translate(client: "genai.Client", lang: str, en_article: dict) -> dict:
    lang_name = W.LANGUAGE_NAMES.get(lang, lang)
    outlet = W.NATIVE_OUTLETS.get(lang, W.NATIVE_OUTLET_FALLBACK)
    quote_rule = P.QUOTE_RULES.get(lang, P.QUOTE_RULE_FALLBACK)
    political_titles = T.POLITICAL_TITLES_RULE

    prompt = TRANSLATE_PROMPT.format(
        LANGUAGE=lang_name, OUTLET=outlet, QUOTE_RULE=quote_rule,
        POLITICAL_TITLES_RULE=political_titles,
        headline=en_article.get("headline", ""), body=en_article.get("body", ""),
    )
    print(f"\n{'=' * 20} {lang.upper()} TRANSLATED NATIVE — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, W.MODEL_3, prompt, f"test/{lang}-translate", stage="3",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    if not raw:
        print(f"[{lang}] ERROR: no translation response (finish_reason={finish})", file=sys.stderr)
        return {}
    parsed = W.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    print(f"\n{'=' * 20} {lang.upper()} TRANSLATED NATIVE — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)
    return parsed


def run_a1_from_native_rewrite(client: "genai.Client", lang: str, native_article: dict) -> None:
    if not native_article:
        print(f"[{lang}] no translated native — skipping A1-from-rewrite", file=sys.stderr)
        return
    prompt = W.build_rewrite_prompt(lang, "A1", "longer", native_article)
    print(f"\n{'=' * 20} {lang.upper()} A1 (rewrite of translated native) — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, W.MODEL_2S, prompt, f"test/{lang}-A1-rewrite",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=4096,
    )
    if not raw:
        print(f"[{lang}] ERROR: no A1 response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw)
    body = (parsed or {}).get("body", "")
    print(f"\n{'=' * 20} {lang.upper()} A1 (rewrite of translated native) — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)


def run_a1_from_english_facts(client: "genai.Client", lang: str, fact_subset: list) -> None:
    if not fact_subset:
        print(f"[{lang}] no facts_used — skipping A1-from-facts", file=sys.stderr)
        return
    prompt = T.build_a1_from_facts_prompt(lang, fact_subset)
    print(f"\n{'=' * 20} {lang.upper()} A1 (direct from English master's facts) — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, W.MODEL_2S, prompt, f"test/{lang}-A1-facts",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=4096,
    )
    if not raw:
        print(f"[{lang}] ERROR: no A1 response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw)
    body = (parsed or {}).get("body", "")
    print(f"\n{'=' * 20} {lang.upper()} A1 (direct from English master's facts) — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)


if __name__ == "__main__":
    genai_client = genai.Client()

    en_article, facts_used = run_native_en(genai_client)
    fact_subset = [T.STORY["what_happened"][i] for i in facts_used
                   if 0 <= i < len(T.STORY["what_happened"])]

    for lang in ("de", "fr"):
        translated = run_translate(genai_client, lang, en_article)
        run_a1_from_native_rewrite(genai_client, lang, translated)
        run_a1_from_english_facts(genai_client, lang, fact_subset)
