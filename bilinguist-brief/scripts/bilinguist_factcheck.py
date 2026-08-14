"""
bilinguist_factcheck.py
=======================
Stage 4 (Verify) of the Bilinguist Brief daily pipeline.

Reads the factbase produced by Stage 3 (bilinguist_gather.py) and runs a
secondary verification pass using Gemini + Google Search to catch factual
errors before articles are written. One dedicated Gemini+Search call per
story, run in parallel — not one shared call for the whole day's factbase.
Adopted 2026-08-13: batching every story into one call risks the same
attention-dilution problem measured at Stage 3 (a lead story crowding out a
later one in the same response), and a per-story test run caught real
corrections a batched run had missed on the same day's stories.

What it checks for each story:
  - Political titles  (e.g. "Former President" vs "President")
  - Key numbers       (cross-checked against a second source)
  - Core event        (did this actually happen today?)

Outputs (unchanged shape from the batched version, so bilinguist_check.py
does not need to change):
  factbase_YYYY-MM-DD.json      — overwritten with any corrections applied
  corrections_YYYY-MM-DD.json   — summary read by bilinguist_check.py for ntfy
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from google import genai
from google.genai import types


# ── Configuration ────────────────────────────────────────────────────────────

TIMEOUT_SECONDS = 300
TIMEOUT_MS      = TIMEOUT_SECONDS * 1000
BRIEF_DATE      = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
MAX_WORKERS     = 7


# ── Prompt (per story) ──────────────────────────────────────────────────────

FACTCHECK_PROMPT_ONE = """\
You are a fact-checker for Bilinguist Brief, a news app. You receive ONE story's structured \
fact-base and must verify the highest-risk facts using Google Search before the article is \
written.

TODAY'S DATE: {DATE}

KNOWN POLITICAL FACTS — apply these corrections WITHOUT searching, they are verified:
- Donald Trump IS the current President of the United States (re-elected November 2024, \
serving January 2025 – January 2029). If the factbase says "Former President Trump" or \
"ex-President Trump", CORRECT IT to "President Trump". This is a common model error — fix it.
- A head of government who has ANNOUNCED resignation but has NOT yet been replaced by a \
confirmed successor is still the CURRENT incumbent. For example, a Prime Minister who said \
they will resign is still "Prime Minister [Name]" until their successor is formally appointed. \
Do not add "former" or "outgoing" unless a successor has already taken office.

WHAT TO CHECK — search actively:

1. POLITICAL TITLES — any person named who holds (or is described as holding) a \
political role. Search "[name] current role {DATE}" and verify their title is \
accurate TODAY using SEARCH RESULTS ONLY — not your training data, which may be \
outdated. If search results are ambiguous or absent, leave the title alone. \
ALWAYS apply the KNOWN POLITICAL FACTS above regardless of search results.

2. KEY NUMBERS — at least one figure from the "numbers" array. \
Cross-check against a second source. Flag if the figure differs materially.

3. CORE EVENT — the first item in "what_happened". Confirm this event is real \
and occurred within the last 48 hours. Flag if it appears to be a recycled \
older story.

IMPORTANT: Only record a correction if you found EXPLICIT search evidence (not \
training knowledge) that the current text is wrong. If you cannot find a recent \
search result confirming the error, leave it alone. When in doubt, do not correct.

STORY TO CHECK:
{STORY}

Respond with ONLY a valid JSON object — no markdown fences, no preamble:
{{
  "corrections": [
    {{
      "field": "<field containing the error, e.g. what_happened, proper_nouns, numbers>",
      "original": "<the exact substring that is wrong>",
      "corrected": "<the correct replacement string>",
      "reason": "<one sentence — what your search found that proves this is wrong>"
    }}
  ]
}}

If no corrections are needed return: {{"corrections": []}}
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


def apply_corrections_to_story(story: dict, corrections: list[dict]) -> tuple[dict, list[dict]]:
    """Apply each correction by replacing the original substring within any string
    value in the story's fields. Returns (updated_story, applied_corrections)."""
    slug = story.get("slug", "")
    applied = []

    for c in corrections:
        original  = c.get("original", "")
        corrected = c.get("corrected", "")
        field     = c.get("field", "")
        reason    = c.get("reason", "")

        if not original or not corrected or original == corrected:
            continue

        changed = False
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
            applied.append({
                "slug": slug, "field": field,
                "original": original, "corrected": corrected, "reason": reason,
            })
            print(f"[factcheck] ✓ Corrected '{slug}' [{field}]: «{original}» → «{corrected}»")
        else:
            print(f"[factcheck] ⚠ Correction for '{slug}' — original string not found "
                  f"in factbase: «{original}»", file=sys.stderr)

    return story, applied


def factcheck_one_story(client: genai.Client, story: dict) -> tuple[dict, list[dict], bool]:
    """Returns (story, applied_corrections, ok). ok=False means this story's check
    itself failed (no response / unparseable) -- distinct from ok=True with zero
    corrections, which means the check ran and found nothing to fix."""
    slug = story.get("slug", "?")
    prompt = FACTCHECK_PROMPT_ONE.format(
        DATE=BRIEF_DATE, STORY=json.dumps(story, ensure_ascii=False, indent=2))
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.1,
    )

    response = None
    for attempt in range(1, 4):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt, config=config)
            break
        except Exception as e:
            err = str(e)
            if any(c in err for c in ["503", "429", "disconnected"]) and attempt < 3:
                delay = [15, 30][attempt - 1]
                print(f"[factcheck/{slug}] attempt {attempt} failed ({e}) — "
                      f"retrying in {delay}s…", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[factcheck/{slug}] non-retryable error: {e}", file=sys.stderr)
                return story, [], False

    if not response:
        print(f"[factcheck/{slug}] all attempts failed — leaving story unchanged", file=sys.stderr)
        return story, [], False

    raw = response.text or ""
    parsed = parse_json(raw)
    if not parsed:
        print(f"[factcheck/{slug}] could not parse JSON response — skipping corrections",
              file=sys.stderr)
        return story, [], False

    corrections = parsed.get("corrections", [])
    story, applied = apply_corrections_to_story(story, corrections)
    return story, applied, True


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

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("[factcheck] ERROR: GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    print(f"[4-verify] Stage 4 — fact-checking {len(factbase)} stories from "
          f"{factbase_path.name}, one call each")

    client = genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT_MS))
    with ThreadPoolExecutor(max_workers=min(len(factbase), MAX_WORKERS)) as ex:
        results = list(ex.map(lambda s: factcheck_one_story(client, s), factbase))

    updated_factbase = [r[0] for r in results]
    applied = [c for r in results for c in r[1]]
    ok_count = sum(1 for r in results if r[2])
    stories_checked = len(factbase)

    print(f"[factcheck] {stories_checked} stories checked ({ok_count} succeeded) — "
          f"{len(applied)} correction(s) applied")

    # Write the corrected factbase back
    factbase_doc["factbase"] = updated_factbase
    factbase_doc["factcheck"] = {
        "run_at":          datetime.now(timezone.utc).isoformat(),
        "stories_checked": stories_checked,
        "corrections":     applied,
    }
    with open(factbase_path, "w", encoding="utf-8") as f:
        json.dump(factbase_doc, f, ensure_ascii=False, indent=2)
    print(f"[factcheck] Factbase updated — {factbase_path.name}")

    # Write corrections summary for bilinguist_check.py. If every single story's check
    # failed (e.g. a full Gemini outage), flag it as an error rather than reporting a
    # silently clean 0-corrections pass -- bilinguist_check.py surfaces this "error" key.
    corrections_out = {
        "date":             BRIEF_DATE,
        "stories_checked":  stories_checked,
        "corrections_count": len(applied),
        "corrections":       applied,
    }
    if ok_count == 0:
        corrections_out["error"] = "All per-story fact-checks failed — fact-check skipped"
    out_path = script_dir / f"corrections_{BRIEF_DATE}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(corrections_out, f, ensure_ascii=False, indent=2)
    print(f"[factcheck] Corrections written to {out_path.name}")

    if ok_count == 0:
        print("[factcheck] Done — every story's fact-check failed, factbase left unchanged.",
              file=sys.stderr)
    elif applied:
        print(f"[factcheck] Done — {len(applied)} correction(s) applied.")
    else:
        print("[factcheck] Done — factbase verified clean, no corrections needed.")


if __name__ == "__main__":
    main()
