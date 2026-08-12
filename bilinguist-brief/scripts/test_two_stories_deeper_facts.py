"""
Test: the re-tuned gemini_prompt_facts.md (10-16 points, 200-300 narrative words -- the
middle-ground pullback from the 12-18/250-350 version that overshot to 451 words / a
293-word article) on TWO different real stories, each as its own individual call -- no
batching, matching the real per-article production architecture. 4 Gemini calls total:
2 individual fact-gather calls + 2 individual native-write calls (Gemini Flash).

Story 1: the same Trump plane-swap story used throughout this session, for a clean
before/after against the 250-350 version.
Story 2: a genuinely different real story (Jensen Huang/Nvidia AI financing, BUSINESS &
ECONOMY) pulled from today's live production bundle, to check the tuning isn't overfit to
one story.

Uses the real, unmodified gather_facts_for_genre() (live search) and build_native_prompt()
for both. Standalone -- no factbase file written, no pipeline stages, never touches the
data repo or the live app.

    python test_two_stories_deeper_facts.py
"""

import json
import sys

from google import genai

import bilinguist_gather as G
import bilinguist_write as W

with open("test_fixtures/single_story_factbase.json", encoding="utf-8") as f:
    _FIXTURE = json.load(f)
_OLD_TRUMP_STORY = _FIXTURE["factbase"][0]

STORY_1 = {
    "slug": _OLD_TRUMP_STORY["slug"],
    "genre": _OLD_TRUMP_STORY["genre"],
    "headline": _OLD_TRUMP_STORY.get("headline"),
    "cross_reference_score": _OLD_TRUMP_STORY.get("cross_reference_score"),
}

# Real story, different genre/topic, pulled from today's live bundle (which strips
# cross_reference_score before shipping) -- search grounding works from slug/headline alone.
STORY_2 = {
    "slug": "jensen-huang-ai-financing-china-risk",
    "genre": "BUSINESS & ECONOMY",
    "headline": "Nvidia unveils $500bn AI fund amid China market fears",
    "cross_reference_score": {"sources": []},
}


def gather_one(client: "genai.Client", story: dict) -> dict:
    print(f"\n{'=' * 20} GATHER — {story['slug']} (individual call) {'=' * 20}\n")
    results = G.gather_facts_for_genre(client, story["genre"], [story], model="gemini-2.5-flash")
    if not results or not results[0].get("what_happened"):
        print(f"[gather] ERROR: no facts returned for {story['slug']}", file=sys.stderr)
        return {}
    new_story = results[0]
    narrative_fields = ("what_happened", "attribution", "verified", "contested")
    n = sum(len(str(x).split()) for f in narrative_fields for x in new_story.get(f, []))
    print(f"\n{story['slug']}: {len(new_story.get('what_happened', []))} what_happened "
          f"points, {n} narrative words\n")
    print(json.dumps(new_story, ensure_ascii=False, indent=2))
    return new_story


def write_native_one(client: "genai.Client", story: dict) -> None:
    if not story:
        return
    prompt = W.build_native_prompt("en", [story], "longer")
    print(f"\n{'=' * 20} NATIVE EN (Gemini Flash) — {story['slug']} (individual call) — PROMPT SENT {'=' * 20}\n")
    print(prompt)

    raw, finish = W.call_gemini(
        client, "gemini-2.5-flash", prompt, f"test/en-native-{story['slug']}",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    if not raw:
        print(f"[{story['slug']}] ERROR: no native response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    print(f"\n{'=' * 20} NATIVE EN (Gemini Flash) — {story['slug']} — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(f"Headline: {parsed.get('headline', '')}\n")
    print(body)


if __name__ == "__main__":
    genai_client = genai.Client()

    new_story_1 = gather_one(genai_client, STORY_1)
    write_native_one(genai_client, new_story_1)

    new_story_2 = gather_one(genai_client, STORY_2)
    write_native_one(genai_client, new_story_2)
