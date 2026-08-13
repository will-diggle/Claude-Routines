"""
Test: run TODAY'S real Stage 1-4 (scrape, select, gather winners, fact-check) exactly as
production does, then Stage 5 (native EN, "longer") with the settled configuration --
plain-text output (no forced JSON), exact-210-words instruction -- across every real winning
story. JSON-vs-plain-text was already decided (plain-text won modestly, avg |dev| 24.3 vs
28.0 on a 7-story A/B) -- this just confirms the settled approach on fresh headlines.

Reuses bilinguist_scrape.main(), bilinguist_gather.main() (--select-only, then --from
selection.json --facts-input winners, matching generate-briefings.yml exactly), and
bilinguist_factcheck.main() unmodified. Only Stage 5 uses the test overrides. Everything
writes to local files in this directory (scraped_headlines_*.json, factbase_*.json,
corrections_*.json) -- never touches the data repo, the live app, or any Supabase/D1 write.

    python test_real_headlines_native_check.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

BRIEF_DATE = os.environ.get(
    "BRIEF_DATE",
    __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d"),
)
os.environ["BRIEF_DATE"] = BRIEF_DATE

SCRIPT_DIR = Path(__file__).parent


def run_stage(label: str, fn, *args, **kwargs) -> None:
    print(f"\n{'#' * 10} {label} {'#' * 10}\n")
    fn(*args, **kwargs)


def stage1_scrape() -> None:
    import bilinguist_scrape
    sys.argv = ["bilinguist_scrape.py"]
    bilinguist_scrape.main()


def stage2_select() -> None:
    import bilinguist_gather
    sys.argv = ["bilinguist_gather.py", "--select-only"]
    bilinguist_gather.main()
    src = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    dst = SCRIPT_DIR / "selection.json"
    dst.write_bytes(src.read_bytes())


def stage3_gather() -> None:
    import bilinguist_gather
    sys.argv = ["bilinguist_gather.py", "--from", str(SCRIPT_DIR / "selection.json"),
                "--facts-input", "winners"]
    bilinguist_gather.main()


def stage4_factcheck() -> None:
    import bilinguist_factcheck
    sys.argv = ["bilinguist_factcheck.py"]
    bilinguist_factcheck.main()


# ── Stage 5 (settled config): exact-210 + plain-text no-JSON output ────────────────────────
EXACT_210_RULE = (
    "Write exactly 210 words. Count every word before submitting. If your count is not "
    "210, revise the article and count again until it is. This is a precise target, not a "
    "range -- 208 or 213 is a miss, not close enough."
)

# No self-check word count field: it always just echoed the target number back rather than
# reflecting a genuine recount (confirmed across many test runs) -- pure token waste that
# also distracts the model from the actual task.
PLAIN_OUTPUT_FORMAT = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "Output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these two fields."
)


def parse_plain(raw: str) -> tuple[str, str]:
    m = re.search(r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*)", raw, re.DOTALL)
    if not m:
        return "", raw.strip()
    return m.group(1).strip(), m.group(2).strip()


def stage5_native(client: "genai.Client", story: dict) -> dict:
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE["longer"]
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    w.NATIVE_WORD_RULE["longer"] = EXACT_210_RULE
    prompt = w.build_native_prompt("en", [story], "longer")
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE["longer"] = orig_rule

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
                print(f"[{story.get('slug')}] attempt {attempt} failed ({e}) — "
                      f"retrying in {delay}s…", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[{story.get('slug')}] non-retryable error: {e}", file=sys.stderr)
                return {"slug": story.get("slug"), "error": str(e)}

    if not response:
        return {"slug": story.get("slug"), "error": "all retries failed"}
    raw = response.text or ""
    if not raw:
        return {"slug": story.get("slug"), "error": "no response"}
    headline, body = parse_plain(raw)
    actual = len(body.split())
    return {
        "slug": story.get("slug"), "genre": story.get("genre"),
        "headline": headline, "body": body,
        "actual_words": actual, "deviation": actual - 210,
    }


def main() -> None:
    run_stage("STAGE 1 — Scrape (real, today)", stage1_scrape)
    run_stage("STAGE 2 — Select (real, today)", stage2_select)
    run_stage("STAGE 3 — Gather facts for winners (real, today)", stage3_gather)
    run_stage("STAGE 4 — Fact-check (real, today)", stage4_factcheck)

    factbase_path = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    with open(factbase_path, encoding="utf-8") as f:
        doc = json.load(f)
    factbase = doc.get("factbase", [])
    factcheck = doc.get("factcheck", {})

    print(f"\n{'#' * 10} STAGE 5 — Native EN, exact-210 + plain-text, {len(factbase)} stories {'#' * 10}\n")
    client = genai.Client()
    results = []
    for story in factbase:
        r = stage5_native(client, story)
        results.append(r)
        if "error" in r:
            print(f"[{r['slug']}] ERROR: {r['error']}", file=sys.stderr)
            continue
        print(f"\n{'=' * 20} {r['slug']} — {r['actual_words']} words "
              f"(target 210, deviation {r['deviation']:+d}) {'=' * 20}\n")
        print(f"Headline: {r['headline']}\n")
        print(r["body"])

    ok = [r for r in results if "error" not in r]
    print(f"\n{'#' * 10} SUMMARY {'#' * 10}\n")
    print(f"Stories: {len(results)} | succeeded: {len(ok)} | failed: {len(results) - len(ok)}")
    if ok:
        avg_abs_dev = sum(abs(r["deviation"]) for r in ok) / len(ok)
        avg_words = sum(r["actual_words"] for r in ok) / len(ok)
        print(f"Average word count: {avg_words:.1f} (target 210)")
        print(f"Average absolute deviation from 210: {avg_abs_dev:.1f} words")
        for r in ok:
            print(f"  {r['slug']}: {r['actual_words']} words (dev {r['deviation']:+d})")

    print(f"\n[factcheck] stories_checked={factcheck.get('stories_checked', 'n/a')} "
          f"corrections={len(factcheck.get('corrections', []))}")
    for c in factcheck.get("corrections", []):
        print(f"  - {c}")


if __name__ == "__main__":
    main()
