"""
Test: does giving A1 an explicit, native-reported subset of facts fix the fact-alignment
and safety gaps discussed?

Two problems with writing A1 straight from the raw fact-base, independent of native:
  1. Native doesn't use every fact either (word budget), and its selection is its own
     judgment call each time -- nothing guarantees A1's independent selection matches it.
     Text-matching native's finished prose back against the fact-base afterward doesn't
     work reliably either, since native paraphrases/translates facts.
  2. PROMPT_LEARNER_TEMPLATE (the production factbase-direct path) currently carries none
     of the safety rules built up this session -- no FACT ORDER rule, no TITLE_RULE
     (political titles), no GLOSS_RULE, no ATTRIBUTION_RULE, no GRAMMAR_RULE_A1.

This test fixes both, stage by stage:
  1. Write native from the fact-base (real bilinguist_write.build_native_prompt), with
     what_happened items pre-labelled [0]..[8] and an added required "facts_used" field
     asking native to report which indices it actually drew on, in order. This is the only
     reliable way to know native's selection.
  2. Slice the fact-base down to exactly that reported subset, in native's own order, then
     write A1 directly from that subset -- not from native's prose, not from the raw
     fact-base -- carrying the same safety rules the rewrite path already has (FACT ORDER,
     TITLE_RULE_STRICT, GLOSS_RULE_BEGINNER, ATTRIBUTION_RULE_BEGINNER, GRAMMAR_RULE_A1).

Uses the real Trump plane-swap fact-base fixture (test_fixtures/single_story_factbase.json).
2 languages (DE, FR) x 2 stages (native, A1) = 4 Gemini calls total. Standalone -- no
fixture/factbase files written, no pipeline stages, never touches the data repo or the
live app.

    python test_a1_facts_used_de_fr.py
"""

import json
import sys

from google import genai

import bilinguist_prompts as P
import bilinguist_write as W

with open("test_fixtures/single_story_factbase.json", encoding="utf-8") as f:
    _FIXTURE = json.load(f)
STORY = _FIXTURE["factbase"][0]

# Label each what_happened item with its index so native can reference it unambiguously
# in facts_used, without needing a separate ID scheme.
_LABELED_WHAT_HAPPENED = [f"[{i}] {fact}" for i, fact in enumerate(STORY["what_happened"])]

_SCHEMA_NATIVE_WITH_FACTS = {
    "type": "object",
    "properties": {
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":      {"type": "string"},
                    "slug":       {"type": "string"},
                    "headline":   {"type": "string"},
                    "body":       {"type": "string"},
                    "facts_used": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["genre", "slug", "headline", "body", "facts_used"],
            },
        },
    },
    "required": ["articles"],
}

# Not part of TITLE_RULE_STRICT (which only says "don't simplify titles") -- this is the
# separate universal WRITING RULES bullet from PROMPT_NATIVE_TEMPLATE (added af9c953) that
# actually prevents the "former President" class of error. Ported verbatim since
# PROMPT_LEARNER_TEMPLATE (the production factbase-direct path) never had it either.
POLITICAL_TITLES_RULE = (
    "- POLITICAL TITLES — CRITICAL, every genre, not just politics stories: use ONLY the "
    "title given in the facts below. Never alter a political title from your own training "
    "data.\n"
    "  * Never add \"former\" or \"ex-\" unless the facts explicitly say the person has "
    "left office.\n"
    "  * If the facts say \"President Trump\", write \"President Trump\" — never \"former "
    "President\". This applies wherever the person appears, including stories not "
    "primarily about politics.\n"
    "  * A head of government who has announced resignation is still the incumbent until a "
    "named successor has taken office."
)

FACTS_USED_INSTRUCTION = (
    "ALSO REPORT: \"facts_used\" — an array of the [N] index numbers from what_happened "
    "that you actually drew on to write this article, in the order you used them. This is "
    "how the fact selection is passed downstream to the CEFR level articles below native — "
    "report it accurately.\n\n"
)


def build_native_prompt_with_facts(lang: str, story: dict, length: str) -> str:
    labeled_story = dict(story)
    labeled_story["what_happened"] = _LABELED_WHAT_HAPPENED
    prompt = W.build_native_prompt(lang, [labeled_story], length)
    marker = "OUTPUT FORMAT"
    idx = prompt.index(marker)
    return prompt[:idx] + FACTS_USED_INSTRUCTION + prompt[idx:]


def run_native(client: "genai.Client", lang: str) -> tuple[str, list]:
    prompt = build_native_prompt_with_facts(lang, STORY, "longer")
    print(f"\n{'=' * 20} {lang.upper()} NATIVE — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, W.MODEL_3, prompt, f"test/{lang}-native-facts",
        schema=_SCHEMA_NATIVE_WITH_FACTS, max_output_tokens=8192,
    )
    if not raw:
        print(f"[{lang}] ERROR: no native response (finish_reason={finish})", file=sys.stderr)
        return "", []
    parsed = W.parse_llm_json(raw) or {}
    articles = parsed.get("articles") or []
    if not articles:
        print(f"[{lang}] ERROR: no native article returned", file=sys.stderr)
        return "", []
    art = articles[0]
    body = art.get("body", "")
    facts_used = art.get("facts_used") or []
    print(f"\n{'=' * 20} {lang.upper()} NATIVE — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)
    print(f"\nfacts_used: {facts_used}")
    return body, facts_used


def build_a1_from_facts_prompt(lang: str, fact_subset: list) -> str:
    lang_name = W.LANGUAGE_NAMES.get(lang, lang)
    level_desc = W.LEVEL_DESCRIPTIONS.get("A1", "A1")
    word_min, word_max = W.word_band(W.WORDS_PER_ARTICLE["A1"]["longer"], lang)
    quote_rule = P.QUOTE_RULES.get(lang, P.QUOTE_RULE_FALLBACK)

    gloss_rule = P.GLOSS_RULE_BEGINNER.replace("{LEVEL_DESCRIPTION}", level_desc).replace("{LANGUAGE}", lang_name)
    attribution_rule = P.ATTRIBUTION_RULE_BEGINNER.replace("{LEVEL_DESCRIPTION}", level_desc).replace("{LANGUAGE}", lang_name)
    grammar_rule = P.GRAMMAR_RULE_A1.replace("{LEVEL_DESCRIPTION}", level_desc).replace("{LANGUAGE}", lang_name)

    fact_list_text = "\n".join(f"- {f}" for f in fact_subset)

    return f"""Write ONE news article in {lang_name} at CEFR {level_desc} level, using ONLY the facts listed below. This is the same story native journalism already covered — these are exactly the facts it selected, in the order it used them.

KEEP, EXACTLY:
- The ORDER of the facts below. Do not reorder.
- Every number, name, place and organisation, verbatim.
{P.TITLE_RULE_STRICT}{gloss_rule}
- Every attribution — who said or reported what.{attribution_rule}
{grammar_rule}

{POLITICAL_TITLES_RULE}

Use ALL of the facts below — nothing more, nothing invented, nothing dropped:
{fact_list_text}

WORD COUNT: {word_min}–{word_max} words.

QUOTATION MARKS: {quote_rule}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.

OUTPUT FORMAT: {{"genre":"...","slug":"...","headline":"...","body":"..."}}
Return ONE object, not a list.
"""


def run_a1(client: "genai.Client", lang: str, fact_subset: list) -> None:
    if not fact_subset:
        print(f"[{lang}] no facts_used reported — skipping A1", file=sys.stderr)
        return
    prompt = build_a1_from_facts_prompt(lang, fact_subset)
    print(f"\n{'=' * 20} {lang.upper()} A1 (from native's fact subset) — PROMPT SENT {'=' * 20}\n")
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
    print(f"\n{'=' * 20} {lang.upper()} A1 (from native's fact subset) — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(body)


if __name__ == "__main__":
    genai_client = genai.Client()
    for lang in ("de", "fr"):
        native_body, facts_used = run_native(genai_client, lang)
        fact_subset = [STORY["what_happened"][i] for i in facts_used
                       if 0 <= i < len(STORY["what_happened"])]
        run_a1(genai_client, lang, fact_subset)
