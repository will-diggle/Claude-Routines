"""
A/B/C test: same English native prompt (real production build_native_prompt, same 338-word
fact-base fixture), word band overridden to the literal 200-220 requested, sent to three
backends -- Gemini Flash, Claude Sonnet, Claude Haiku -- to compare writing quality and word
count head-to-head on identical input. No Gemini Pro in this one (that's what production
and the other native tests already use).

3 calls total. Standalone -- no pipeline stages, never touches the data repo or the live app.

    python test_native_en_3way.py
"""

import json
import sys

from google import genai

import bilinguist_write as W

with open("test_fixtures/single_story_factbase.json", encoding="utf-8") as f:
    _FIXTURE = json.load(f)
STORY = _FIXTURE["factbase"][0]

# Override the native/longer word band to the literal 200-220 requested, for a fair,
# identical-target comparison across all three backends. Restored after building the
# prompt so nothing else in the module is affected.
_ORIG_BAND = W.WORDS_PER_ARTICLE["Native"]["longer"]
W.WORDS_PER_ARTICLE["Native"]["longer"] = "200–220"
PROMPT = W.build_native_prompt("en", [STORY], "longer")
W.WORDS_PER_ARTICLE["Native"]["longer"] = _ORIG_BAND

BACKENDS = [
    ("Gemini Flash", "gemini"),
    ("Claude Sonnet", "claude"),
    ("Claude Haiku", "claude"),
]


def run_gemini(client: "genai.Client", model: str, label: str) -> None:
    raw, finish = W.call_gemini(
        client, model, PROMPT, f"test/en-native-{label}",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    _report(label, raw, finish)


def run_claude(model: str, label: str) -> None:
    raw, finish = W.call_claude(
        model, PROMPT, f"test/en-native-{label}",
        schema=W._SCHEMA_ARTICLE, max_output_tokens=4096,
    )
    _report(label, raw, finish)


def _report(label: str, raw: str, finish: str) -> None:
    if not raw:
        print(f"[{label}] ERROR: no response (finish_reason={finish})", file=sys.stderr)
        return
    parsed = W.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    headline = parsed.get("headline", "")
    print(f"\n{'=' * 20} {label} — RESULT ({len(body.split())} words) {'=' * 20}\n")
    print(f"Headline: {headline}\n")
    print(body)


if __name__ == "__main__":
    print(f"\n{'=' * 20} PROMPT SENT (identical to all three) {'=' * 20}\n")
    print(PROMPT)

    genai_client = genai.Client()

    run_gemini(genai_client, "gemini-2.5-flash", "Gemini Flash")
    run_claude(W.CLAUDE_MODEL_MAIN, "Claude Sonnet")
    run_claude(W.CLAUDE_MODEL_BEGINNER, "Claude Haiku")
