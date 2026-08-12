"""
Test: does the deepened gemini_prompt_facts.md (12-18 points, 250-350 narrative words,
explicit instruction to capture quotes and secondary named figures) actually produce a
richer fact-base for this story -- and does a native English article written from it (on
Gemini Flash, not Pro) land closer to its word-count target with real depth, not padding?

Stage 1: real gather_facts_for_genre() (bilinguist_gather.py, unmodified) re-runs fact
-finding for this one story, with today's date and a live Google Search grounded call --
same mechanism production uses, just scoped to one story instead of a whole genre.
Stage 2: real build_native_prompt() (bilinguist_write.py, unmodified) writes native English
from the resulting fact-base on gemini-2.5-flash.

2 Gemini calls total (1 search-grounded fact call + 1 native write). Standalone -- no
factbase file written to disk, no pipeline stages beyond these two, never touches the data
repo or the live app.

    python test_deeper_facts_native_en.py
"""

import json
import sys

from google import genai

import bilinguist_gather as G
import bilinguist_write as W

with open("test_fixtures/single_story_factbase.json", encoding="utf-8") as f:
    _FIXTURE = json.load(f)
OLD_STORY = _FIXTURE["factbase"][0]

# gather_facts_for_genre needs a "selected story" shape: slug, headline, cross_reference_score
# (for the outlet headlines it searches from) -- reuse what the fixture already carries.
SELECTED_STORY = {
    "slug": OLD_STORY["slug"],
    "genre": OLD_STORY["genre"],
    "headline": OLD_STORY.get("headline"),
    "cross_reference_score": OLD_STORY.get("cross_reference_score"),
}


def old_word_counts() -> None:
    narrative_fields = ("what_happened", "attribution", "verified", "contested")
    n = sum(len(str(x).split()) for f in narrative_fields for x in OLD_STORY.get(f, []))
    print(f"\nOLD fact-base: {len(OLD_STORY.get('what_happened', []))} what_happened points, "
          f"{n} narrative words\n")


def run_gather() -> dict:
    print(f"\n{'=' * 20} STAGE 3 — DEEPENED FACT GATHER (live search, real gather_facts_for_genre) {'=' * 20}\n")
    client = genai.Client()
    results = G.gather_facts_for_genre(client, "GLOBAL NEWS", [SELECTED_STORY], model="gemini-2.5-flash")
    if not results or not results[0].get("what_happened"):
        print("[gather] ERROR: no facts returned", file=sys.stderr)
        sys.exit(1)
    new_story = results[0]
    narrative_fields = ("what_happened", "attribution", "verified", "contested")
    n = sum(len(str(x).split()) for f in narrative_fields for x in new_story.get(f, []))
    print(f"\nNEW fact-base: {len(new_story.get('what_happened', []))} what_happened points, "
          f"{n} narrative words\n")
    print(json.dumps(new_story, ensure_ascii=False, indent=2))
    return new_story


def run_native_flash(client: "genai.Client", story: dict) -> None:
    prompt = W.build_native_prompt("en", [story], "longer")
    print(f"\n{'=' * 20} EN NATIVE (Gemini Flash, from deepened facts) — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, "gemini-2.5-flash", prompt, "test/en-native-deepened",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    if not raw:
        print(f"[en] ERROR: no native response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    print(f"\n{'=' * 20} EN NATIVE (Gemini Flash, from deepened facts) — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(f"Headline: {parsed.get('headline', '')}\n")
    print(body)


if __name__ == "__main__":
    old_word_counts()
    new_story = run_gather()
    genai_client = genai.Client()
    run_native_flash(genai_client, new_story)
