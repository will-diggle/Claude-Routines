"""
bilinguist_gather.py
====================
Stage 1 of the Bilinguist Brief daily pipeline.

Calls Google Gemini 2.5 Pro via the Flex service tier to gather today's
news and produce a structured, neutral JSON fact-base.

Flex tier: 50% discount on input/output tokens.
Response time: 1–15 minutes (acceptable for background editorial deadline).
Web search: enabled via Google Search grounding tool.

Usage:
    python bilinguist_gather.py

Requirements:
    pip install google-genai
    export GEMINI_API_KEY=your_key_from_aistudio.google.com
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone

from google import genai
from google.genai import types


# ── Configuration ────────────────────────────────────────────────────────────

PROMPT_FILE     = "gemini_prompt_brief.md"
TIMEOUT_SECONDS = 1200
TIMEOUT_MS      = TIMEOUT_SECONDS * 1000
RETRYABLE_CODES = {503, 429}

# Attempt plan — tried in order until one succeeds.
# Each entry: (model_id, service_tier_or_None, display_label, max_retries, retry_delays_secs)
ATTEMPT_PLAN = [
    ("gemini-2.5-flash", None, "Standard", 4, [15, 30,  60, 120]),   # ~3.7 min
    ("gemini-2.5-pro",   None, "Standard", 4, [15, 30,  60, 120]),   # ~3.7 min
]

# Date is read from BRIEF_DATE env var (set once by the workflow at job start)
# so gather and write always agree even when the pipeline crosses midnight UTC.
BRIEF_DATE = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_prompt(path: str) -> str:
    """Load the system prompt from a local markdown file."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(script_dir, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(
            f"Prompt file not found: {full_path}\n"
            "Make sure gemini_prompt_brief.md is in the scripts/ directory."
        )
    with open(full_path, "r", encoding="utf-8") as f:
        return f.read()


def inject_date(prompt: str) -> str:
    """Replace the {DATE} placeholder with today's UTC date."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return prompt.replace("{DATE}", today)


def inject_scraped_headlines(prompt: str) -> str:
    """Replace {SCRAPED_HEADLINES} with pre-scraped outlet headlines if available."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    scraped_path = os.path.join(script_dir, f"scraped_headlines_{BRIEF_DATE}.json")

    if not os.path.exists(scraped_path):
        print("[gather] WARNING: No scraped headlines file found — Gemini will search itself", file=sys.stderr)
        return prompt.replace("{SCRAPED_HEADLINES}", "(No pre-scraped headlines available — search each outlet yourself using the fallback method.)")

    with open(scraped_path, "r", encoding="utf-8") as f:
        scraped = json.load(f)

    outlets = scraped.get("outlets", [])
    lines = []
    for outlet in outlets:
        name = outlet["name"]
        status = outlet.get("status", "unknown")
        headlines = outlet.get("headlines", [])
        if status == "ok" and headlines:
            lines.append(f"  {name}:")
            for i, h in enumerate(headlines, 1):
                lines.append(f"    {i}. {h}")
        else:
            lines.append(f"  {name}: [{status}]")

    succeeded = scraped.get("outlets_succeeded", 0)
    attempted = scraped.get("outlets_attempted", 0)
    note = scraped.get("note", "")
    header = f"Scraped at {scraped.get('scraped_at', 'unknown')} ({succeeded}/{attempted} outlets succeeded). {note}"
    block = header + "\n\n" + "\n".join(lines)

    print(f"[gather] Injected scraped headlines: {succeeded}/{attempted} outlets")
    return prompt.replace("{SCRAPED_HEADLINES}", block)


def parse_llm_json(raw: str) -> dict | None:
    """
    Extract and parse a JSON object from LLM output.
    Tolerates markdown code fences, preamble, and trailing text.
    Fails soft — returns None rather than raising on bad output.
    """
    if not raw:
        return None
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        print("[parse] WARNING: No JSON object found in response.", file=sys.stderr)
        return None
    candidate = raw[start:end + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as e:
        print(f"[parse] WARNING: JSON decode failed — {e}", file=sys.stderr)
        return None



def validate_story(story: dict) -> dict:
    """
    Ensure all required array fields are present.
    Coerces missing or null fields to [] rather than crashing.
    Logs a warning per coerced field so prompt drift is visible.
    """
    array_fields = [
        "what_happened", "attribution", "verified",
        "contested", "numbers", "proper_nouns", "key_terms"
    ]
    for field in array_fields:
        if not isinstance(story.get(field), list):
            print(
                f"[validate] WARNING: story '{story.get('slug', '?')}' "
                f"missing or invalid field '{field}' — coercing to []",
                file=sys.stderr
            )
            story[field] = []
    return story


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", default=PROMPT_FILE, help="Path to the Gemini prompt file")
    args, _ = parser.parse_known_args()
    prompt_file = args.prompt

    pipeline_started_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    print(f"[gather] Starting Bilinguist Brief gathering run — {datetime.now(timezone.utc).isoformat()}")

    # 1. Load and prepare the prompt
    raw_prompt = load_prompt(prompt_file)
    prompt = inject_date(raw_prompt)
    prompt = inject_scraped_headlines(prompt)
    print(f"[gather] Prompt loaded from '{prompt_file}' ({len(prompt)} chars)")

    # 2. Initialise the Gemini client
    client = genai.Client(
        http_options=types.HttpOptions(timeout=TIMEOUT_MS)
    )
    print(f"[gather] Gemini client initialised (timeout: {TIMEOUT_SECONDS}s / {TIMEOUT_MS}ms)")

    plan_labels = " → ".join(f"{m}({t or 'Standard'})" for m, t, *_ in ATTEMPT_PLAN)
    print(f"[gather] Attempt plan: {plan_labels}")

    # 3. Fire the request — walk the attempt plan until one succeeds.
    #    Flex tier is cheapest; Standard tier is the fallback when Flex is saturated.
    #    NOTE: do NOT set response_mime_type='application/json' — disables search grounding.
    response = None
    model    = ATTEMPT_PLAN[0][0]   # updated on each successful attempt entry
    for model, tier, label, max_retries, delays in ATTEMPT_PLAN:
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.1,
            **({"service_tier": tier} if tier else {}),
        )
        print(f"[gather] Trying {model} ({label} tier)...")
        for attempt in range(1, max_retries + 2):   # up to max_retries+1 total attempts
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                )
                break  # success
            except Exception as e:
                err_str = str(e)
                is_retryable = any(str(code) in err_str for code in RETRYABLE_CODES)
                if is_retryable and attempt <= max_retries:
                    delay = delays[attempt - 1]
                    print(
                        f"[gather] Attempt {attempt} failed ({e}). Retrying in {delay}s...",
                        file=sys.stderr,
                    )
                    time.sleep(delay)
                elif is_retryable:
                    print(
                        f"[gather] {model} ({label}) exhausted after {max_retries + 1} attempts — trying next",
                        file=sys.stderr,
                    )
                    break
                else:
                    print(f"[gather] {model} non-retryable error — {e} — trying next", file=sys.stderr)
                    break
        if response:
            print(f"[gather] Success via {model} ({label} tier)")
            break

    if not response:
        print("[gather] ERROR: all models and tiers exhausted without a successful response", file=sys.stderr)
        sys.exit(1)

    # 5. Extract raw text and token usage
    raw_output = response.text
    if not raw_output:
        print("[gather] ERROR: Empty response from Gemini.", file=sys.stderr)
        sys.exit(1)

    print(f"[gather] Response received ({len(raw_output)} chars)")

    usage_metadata: dict = {}
    um = response.usage_metadata
    if um:
        usage_metadata = {
            "prompt_token_count":          getattr(um, "prompt_token_count",          0) or 0,
            "candidates_token_count":      getattr(um, "candidates_token_count",      0) or 0,
            "thoughts_token_count":        getattr(um, "thoughts_token_count",        0) or 0,
            "tool_use_prompt_token_count": getattr(um, "tool_use_prompt_token_count", 0) or 0,
            "total_token_count":           getattr(um, "total_token_count",           0) or 0,
        }
        print(
            f"[gather] Tokens — input: {usage_metadata['prompt_token_count']:,}, "
            f"output: {usage_metadata['candidates_token_count']:,}, "
            f"thinking: {usage_metadata['thoughts_token_count']:,}"
        )

    # 6. Parse JSON
    parsed = parse_llm_json(raw_output)
    if not parsed or not isinstance(parsed.get("factbase"), list):
        print("[gather] ERROR: Response did not contain a valid factbase array.", file=sys.stderr)
        print("[gather] Raw output (first 500 chars):", raw_output[:500], file=sys.stderr)
        sys.exit(1)

    factbase = parsed["factbase"]

    # Reject stubbed stories. When gather is overloaded it completes the genre it
    # finds easiest and fills the rest with placeholders like "uk-politics-story-1"
    # and no content. Nothing downstream can tell those from real stories, so a run
    # once shipped 3 articles per language instead of 7 without any error.
    _PLACEHOLDER = re.compile(r"^(uk-politics|business-economy|global-news)-story-\d+$")
    stubs = [
        s_.get("slug", "?") for s_ in factbase
        if _PLACEHOLDER.match(s_.get("slug", "")) or not s_.get("what_happened")
    ]
    if stubs:
        print(f"[gather] ERROR: {len(stubs)} placeholder/empty stories: {stubs}", file=sys.stderr)
        print("[gather] The model did not complete every genre — refusing to continue.",
              file=sys.stderr)
        sys.exit(1)
    search_log = parsed.get("global_news_search_log", [])
    print(f"[gather] Parsed {len(factbase)} stories from factbase")
    if search_log:
        print(f"[gather] Global News search log ({len(search_log)} outlets):")
        for entry in search_log:
            outlet = entry.get("outlet", "?")
            stories = entry.get("stories", [])
            for i, headline in enumerate(stories, 1):
                print(f"  {outlet} #{i}: {headline}")
    else:
        print("[gather] WARNING: global_news_search_log missing from response", file=sys.stderr)

    # 7. Validate every story
    factbase = [validate_story(story) for story in factbase]

    # 8. Log cross-reference scores for all genres (editorial audit)
    scored_genres = ["GLOBAL NEWS", "UK POLITICS", "BUSINESS & ECONOMY"]
    for genre in scored_genres:
        genre_stories = [s for s in factbase if s.get("genre") == genre]
        if not genre_stories:
            continue
        print(f"[gather] {genre} cross-reference scores:")
        for s in sorted(genre_stories, key=lambda x: x.get("cross_reference_score", {}).get("rank", 99)):
            score = s.get("cross_reference_score", {})
            print(
                f"  Rank {score.get('rank', '?')}: {s.get('slug', '?')} "
                f"— {score.get('total', '?')} outlets: {score.get('outlets_covering', [])}"
            )

    # 9. Write output to file — filename uses BRIEF_DATE so write.py can find it
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, f"factbase_{BRIEF_DATE}.json")
    # Capture the tier from the winning attempt entry
    winning_tier = next(
        (t for m, t, *_ in ATTEMPT_PLAN if m == model), None
    )
    output = {
        "date": BRIEF_DATE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipeline_started_at": pipeline_started_at,
        "model": model,
        "service_tier": winning_tier or "standard",
        "story_count": len(factbase),
        "usage_metadata": usage_metadata,
        "global_news_search_log": search_log,
        "factbase": factbase,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[gather] Factbase written to '{output_path}'")
    print(f"[gather] Done. {len(factbase)} stories across "
          f"{len(set(s.get('genre') for s in factbase))} genres.")


if __name__ == "__main__":
    main()
