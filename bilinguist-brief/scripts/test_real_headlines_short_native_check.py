"""
Test: does an exact-word-count instruction work for native EN "short" the same way it did for
"longer"? Production's short target is 95-115 words (WORDS_PER_ARTICLE["Native"]["short"]) --
midpoint 105. This runs TODAY'S real Stage 1-4 (scrape, select, gather winners, fact-check)
exactly as production does, then Stage 5 (native EN, "short") with plain-text output (the
format the longer A/B settled on) and "write exactly 105 words" in place of the current
95-115 range instruction, across every real winning story.

Reuses bilinguist_scrape.main(), bilinguist_gather.main() (--select-only, then --from
selection.json --facts-input winners, matching generate-briefings.yml exactly), and
bilinguist_factcheck.main() unmodified. Only Stage 5 uses the test override. Everything
writes to local files in this directory -- never touches the data repo, the live app, or any
Supabase/D1 write.

    python test_real_headlines_short_native_check.py
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
TARGET = 105


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


# ── Stage 5 (test override): exact-105 + plain-text no-JSON output ─────────────────────────
EXACT_105_RULE = (
    f"Write exactly {TARGET} words. Count every word before submitting. If your count is not "
    f"{TARGET}, revise the article and count again until it is. This is a precise target, not "
    f"a range -- {TARGET - 2} or {TARGET + 3} is a miss, not close enough."
)

PLAIN_OUTPUT_FORMAT = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "First, draft the article. Count its words by actually going through it and counting --"
    " not estimating. If the count is outside the word count range given above, revise the "
    "draft and count again. Repeat until the count is genuinely inside the range.\n\n"
    "Once it is, output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n"
    "SELF-CHECK WORD COUNT: <the exact number of words you counted in the body above>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these three fields."
)


def parse_plain(raw: str) -> tuple[str, str, str]:
    m = re.search(
        r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*?)\n*SELF-CHECK WORD COUNT:\s*(\d+)",
        raw, re.DOTALL)
    if not m:
        m2 = re.search(r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*)", raw, re.DOTALL)
        if not m2:
            return "", raw.strip(), ""
        return m2.group(1).strip(), m2.group(2).strip(), ""
    return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()


def stage5_native_short(client: "genai.Client", story: dict) -> dict:
    import bilinguist_write as w
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE["short"]
    w.OUTPUT_FORMAT_SINGLE = PLAIN_OUTPUT_FORMAT
    w.NATIVE_WORD_RULE["short"] = EXACT_105_RULE
    prompt = w.build_native_prompt("en", [story], "short")
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE["short"] = orig_rule

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
    headline, body, self_check = parse_plain(raw)
    actual = len(body.split())
    return {
        "slug": story.get("slug"), "genre": story.get("genre"),
        "headline": headline, "body": body,
        "actual_words": actual, "self_reported": self_check, "deviation": actual - TARGET,
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

    print(f"\n{'#' * 10} STAGE 5 — Native EN short, exact-{TARGET} + plain-text, "
          f"{len(factbase)} stories {'#' * 10}\n")
    client = genai.Client()
    results = []
    for story in factbase:
        r = stage5_native_short(client, story)
        results.append(r)
        print(f"\n{'=' * 20} {story.get('slug')} {'=' * 20}")
        if "error" in r:
            print(f"  ERROR: {r['error']}", file=sys.stderr)
            continue
        print(f"  {r['actual_words']} words (target {TARGET}, dev {r['deviation']:+d}, "
              f"self-reported {r['self_reported'] or 'none'}) — {r['headline']}")
        print(f"\n  {r['body']}")

    ok = [r for r in results if "error" not in r]
    print(f"\n{'#' * 10} SUMMARY — short-form, exact-{TARGET}, {len(factbase)} stories {'#' * 10}\n")
    print(f"Succeeded: {len(ok)}/{len(results)}")
    if ok:
        avg_words = sum(r["actual_words"] for r in ok) / len(ok)
        avg_dev = sum(abs(r["deviation"]) for r in ok) / len(ok)
        print(f"Average words: {avg_words:.1f} (target {TARGET})")
        print(f"Average |deviation| from {TARGET}: {avg_dev:.1f}")
        for r in ok:
            print(f"  {r['slug']}: {r['actual_words']} words (dev {r['deviation']:+d}, "
                  f"self-reported {r['self_reported'] or 'none'})")

    print(f"\n[factcheck] stories_checked={factcheck.get('stories_checked', 'n/a')} "
          f"corrections={len(factcheck.get('corrections', []))}")
    for c in factcheck.get("corrections", []):
        print(f"  - {c}")


if __name__ == "__main__":
    main()
