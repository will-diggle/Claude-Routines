"""
bilinguist_factcheck.py
=======================
Stage 1B of the Bilinguist Brief daily pipeline.

Reads the factbase produced by Stage 1 (bilinguist_gather.py) and runs a
secondary verification pass using Gemini + Google Search to catch factual
errors before articles are written.

What it checks for each story:
  - Political titles  (e.g. "Former President" vs "President")
  - Key numbers       (cross-checked against a second source)
  - Core event        (did this actually happen today?)

Outputs:
  factbase_YYYY-MM-DD.json      — overwritten with any corrections applied
  corrections_YYYY-MM-DD.json   — summary read by bilinguist_check.py for ntfy
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from google import genai
from google.genai import types


# ── Configuration ────────────────────────────────────────────────────────────

TIMEOUT_SECONDS = 300
TIMEOUT_MS      = TIMEOUT_SECONDS * 1000
BRIEF_DATE      = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ── Prompt ────────────────────────────────────────────────────────────────────

FACTCHECK_PROMPT = """\
You are a fact-checker for Bilinguist Brief, a news app. You receive a structured \
fact-base of today's news stories and must verify the highest-risk facts using \
Google Search before articles are written.

TODAY'S DATE: {DATE}

WHAT TO CHECK for each story — search actively:

KNOWN POLITICAL FACTS — apply these corrections WITHOUT searching, they are verified:
- Donald Trump IS the current President of the United States (re-elected November 2024, \
serving January 2025 – January 2029). If the factbase says "Former President Trump" or \
"ex-President Trump", CORRECT IT to "President Trump". This is a common model error — fix it.
- A head of government who has ANNOUNCED resignation but has NOT yet been replaced by a \
confirmed successor is still the CURRENT incumbent. For example, a Prime Minister who said \
they will resign is still "Prime Minister [Name]" until their successor is formally appointed. \
Do not add "former" or "outgoing" unless a successor has already taken office.

1. POLITICAL TITLES — any person named who holds (or is described as holding) a \
political role. Search "[name] current role {DATE}" and verify their title is \
accurate TODAY using SEARCH RESULTS ONLY — not your training data, which may be \
outdated. If search results are ambiguous or absent, leave the title alone. \
ALWAYS apply the KNOWN POLITICAL FACTS above regardless of search results.

2. KEY NUMBERS — at least one figure per story from the "numbers" array. \
Cross-check against a second source. Flag if the figure differs materially.

3. CORE EVENT — the first item in "what_happened". Confirm this event is real \
and occurred within the last 48 hours. Flag if it appears to be a recycled \
older story.

IMPORTANT: Only record a correction if you found EXPLICIT search evidence (not \
training knowledge) that the current text is wrong. If you cannot find a recent \
search result confirming the error, leave it alone. When in doubt, do not correct.

FACTBASE TO CHECK:
{FACTBASE}

Respond with ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "stories_checked": <integer — number of stories you verified>,
  "corrections": [
    {{
      "slug": "<story slug>",
      "field": "<field containing the error, e.g. what_happened, proper_nouns, numbers>",
      "original": "<the exact substring that is wrong>",
      "corrected": "<the correct replacement string>",
      "reason": "<one sentence — what your search found that proves this is wrong>"
    }}
  ]
}}

If no corrections are needed return: {{"stories_checked": <N>, "corrections": []}}
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_json(raw: str) -> dict | None:
    if not raw:
        return None
    start = raw.find("{")
    end   = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError as e:
        print(f"[factcheck] JSON parse error: {e}", file=sys.stderr)
        return None


def apply_corrections(factbase: list[dict], corrections: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Apply each correction by replacing the original substring within any string
    value in the target story's fields. Returns (updated_factbase, applied_corrections).
    """
    applied = []
    slug_index = {story.get("slug"): i for i, story in enumerate(factbase)}

    for c in corrections:
        slug     = c.get("slug", "")
        original = c.get("original", "")
        corrected = c.get("corrected", "")
        field    = c.get("field", "")
        reason   = c.get("reason", "")

        if not slug or not original or not corrected or original == corrected:
            continue

        idx = slug_index.get(slug)
        if idx is None:
            print(f"[factcheck] Slug '{slug}' not found in factbase — skipping", file=sys.stderr)
            continue

        story   = factbase[idx]
        changed = False

        # Walk every array field in the story and do string replacement
        for key, value in story.items():
            if isinstance(value, list):
                new_list = []
                for item in value:
                    if isinstance(item, str) and original in item:
                        new_list.append(item.replace(original, corrected))
                        changed = True
                    else:
                        new_list.append(item)
                story[key] = new_list
            elif isinstance(value, str) and original in value:
                story[key] = value.replace(original, corrected)
                changed = True

        if changed:
            factbase[idx] = story
            applied.append({
                "slug":      slug,
                "field":     field,
                "original":  original,
                "corrected": corrected,
                "reason":    reason,
            })
            print(f"[factcheck] ✓ Corrected '{slug}' [{field}]: «{original}» → «{corrected}»")
        else:
            print(f"[factcheck] ⚠ Correction for '{slug}' — original string not found in factbase: «{original}»", file=sys.stderr)

    return factbase, applied


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(line_buffering=True)  # prevent GitHub Actions log batching
    script_dir = Path(__file__).parent
    factbase_path = script_dir / f"factbase_{BRIEF_DATE}.json"

    if not factbase_path.exists():
        print(f"[factcheck] ERROR: {factbase_path} not found — has bilinguist_gather.py run yet?", file=sys.stderr)
        sys.exit(1)

    with open(factbase_path, encoding="utf-8") as f:
        factbase_doc = json.load(f)

    factbase: list[dict] = factbase_doc.get("factbase", [])
    if not factbase:
        print("[factcheck] Factbase is empty — nothing to check.", file=sys.stderr)
        sys.exit(0)

    print(f"[factcheck] Stage 1B — fact-checking {len(factbase)} stories from {factbase_path.name}")

    # Build the prompt
    factbase_json = json.dumps(factbase, ensure_ascii=False, indent=2)
    prompt = FACTCHECK_PROMPT.format(DATE=BRIEF_DATE, FACTBASE=factbase_json)

    # Call Gemini with Google Search
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[factcheck] ERROR: GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.1,
    )

    response = None
    for attempt in range(1, 4):
        try:
            print(f"[factcheck] Calling Gemini (attempt {attempt}/3)…")
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=config,
            )
            break
        except Exception as e:
            err = str(e)
            if any(c in err for c in ["503", "429"]) and attempt < 3:
                delay = [20, 45][attempt - 1]
                print(f"[factcheck] Attempt {attempt} failed ({e}) — retrying in {delay}s…", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[factcheck] Non-retryable error: {e}", file=sys.stderr)
                break

    if not response:
        print("[factcheck] All attempts failed — writing zero-correction summary and continuing.", file=sys.stderr)
        corrections_out = {
            "date": BRIEF_DATE,
            "stories_checked": 0,
            "corrections_count": 0,
            "corrections": [],
            "error": "Gemini call failed — fact-check skipped",
        }
        out_path = script_dir / f"corrections_{BRIEF_DATE}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(corrections_out, f, ensure_ascii=False, indent=2)
        sys.exit(0)   # non-fatal — pipeline continues

    raw = response.text or ""
    print(f"[factcheck] Response received ({len(raw)} chars)")

    # Log token usage (fields can be None when Gemini returns TOO_MANY_TOOL_CALLS)
    um = response.usage_metadata
    if um:
        print(
            f"[factcheck] Tokens — input: {getattr(um, 'prompt_token_count', None) or 0:,}, "
            f"output: {getattr(um, 'candidates_token_count', None) or 0:,}"
        )

    parsed = parse_json(raw)
    if not parsed:
        print("[factcheck] Could not parse JSON response — skipping corrections.", file=sys.stderr)
        print("[factcheck] Raw (first 500):", raw[:500], file=sys.stderr)
        corrections_out = {
            "date": BRIEF_DATE,
            "stories_checked": 0,
            "corrections_count": 0,
            "corrections": [],
            "error": "JSON parse failed — fact-check output malformed",
        }
        out_path = script_dir / f"corrections_{BRIEF_DATE}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(corrections_out, f, ensure_ascii=False, indent=2)
        sys.exit(0)

    raw_corrections: list[dict] = parsed.get("corrections", [])
    stories_checked: int        = parsed.get("stories_checked", len(factbase))

    print(f"[factcheck] {stories_checked} stories checked — {len(raw_corrections)} correction(s) proposed")

    # Apply corrections to the factbase
    factbase, applied = apply_corrections(factbase, raw_corrections)

    # Write the corrected factbase back
    factbase_doc["factbase"] = factbase
    factbase_doc["factcheck"] = {
        "run_at":          datetime.now(timezone.utc).isoformat(),
        "stories_checked": stories_checked,
        "corrections":     applied,
    }
    with open(factbase_path, "w", encoding="utf-8") as f:
        json.dump(factbase_doc, f, ensure_ascii=False, indent=2)
    print(f"[factcheck] Factbase updated — {factbase_path.name}")

    # Write corrections summary for bilinguist_check.py
    corrections_out = {
        "date":             BRIEF_DATE,
        "stories_checked":  stories_checked,
        "corrections_count": len(applied),
        "corrections":       applied,
    }
    out_path = script_dir / f"corrections_{BRIEF_DATE}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(corrections_out, f, ensure_ascii=False, indent=2)
    print(f"[factcheck] Corrections written to {out_path.name}")

    if applied:
        print(f"[factcheck] Done — {len(applied)} correction(s) applied.")
    else:
        print("[factcheck] Done — factbase verified clean, no corrections needed.")


if __name__ == "__main__":
    main()
