"""
A/B test: run TODAY'S real Stage 1-4 (scrape, select, gather winners, fact-check) exactly as
production does, then Stage 5 (native EN, "longer") TWICE per story -- once with forced JSON
output, once with plain-text output -- with every other control held identical: same
fact-base, same exact-210-words instruction, same political-titles/quote/attribution rules.
The only variable that changes between arm A and arm B is the output mechanism. This isolates
whether JSON-vs-plain-text is what's driving word-count compliance, not the word-count
wording (which is held constant across both arms).

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


# ── Stage 5 (test overrides): exact-210 + plain-text no-JSON output ────────────────────────
EXACT_210_RULE = (
    "Write exactly 210 words. Count every word before submitting. If your count is not "
    "210, revise the article and count again until it is. This is a precise target, not a "
    "range -- 208 or 213 is a miss, not close enough."
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


def _build_prompt(w, story: dict, output_format: str) -> str:
    orig_format = w.OUTPUT_FORMAT_SINGLE
    orig_rule = w.NATIVE_WORD_RULE["longer"]
    w.OUTPUT_FORMAT_SINGLE = output_format
    w.NATIVE_WORD_RULE["longer"] = EXACT_210_RULE
    prompt = w.build_native_prompt("en", [story], "longer")
    w.OUTPUT_FORMAT_SINGLE = orig_format
    w.NATIVE_WORD_RULE["longer"] = orig_rule
    return prompt


def stage5_native_json(client: "genai.Client", story: dict) -> dict:
    """Arm A: forced JSON output, same exact-210 rule as arm B."""
    import bilinguist_write as w
    prompt = _build_prompt(w, story, w.OUTPUT_FORMAT_SINGLE)  # keep production's real JSON format
    raw, finish = w.call_gemini(
        client, "gemini-2.5-flash", prompt, f"ab-json/{story.get('slug')}",
        schema=w._SCHEMA_ARTICLE, max_output_tokens=8192,
    )
    if not raw:
        return {"slug": story.get("slug"), "arm": "json", "error": f"no response (finish={finish})"}
    parsed = w.parse_llm_json(raw) or {}
    body = parsed.get("body", "")
    actual = len(body.split())
    return {
        "slug": story.get("slug"), "arm": "json", "genre": story.get("genre"),
        "headline": parsed.get("headline", ""), "body": body,
        "actual_words": actual, "self_reported": "", "deviation": actual - 210,
    }


def stage5_native_plain(client: "genai.Client", story: dict) -> dict:
    """Arm B: plain-text output, same exact-210 rule as arm A."""
    import bilinguist_write as w
    prompt = _build_prompt(w, story, PLAIN_OUTPUT_FORMAT)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    raw = response.text or ""
    if not raw:
        return {"slug": story.get("slug"), "arm": "plain", "error": "no response"}
    headline, body, self_check = parse_plain(raw)
    actual = len(body.split())
    return {
        "slug": story.get("slug"), "arm": "plain", "genre": story.get("genre"),
        "headline": headline, "body": body,
        "actual_words": actual, "self_reported": self_check, "deviation": actual - 210,
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

    print(f"\n{'#' * 10} STAGE 5 A/B — Native EN, exact-210 held constant, "
          f"JSON vs plain-text, {len(factbase)} stories {'#' * 10}\n")
    client = genai.Client()
    json_results, plain_results = [], []
    for story in factbase:
        rj = stage5_native_json(client, story)
        rp = stage5_native_plain(client, story)
        json_results.append(rj)
        plain_results.append(rp)

        print(f"\n{'=' * 20} {story.get('slug')} {'=' * 20}")
        if "error" in rj:
            print(f"  [JSON ] ERROR: {rj['error']}", file=sys.stderr)
        else:
            print(f"  [JSON ] {rj['actual_words']} words (dev {rj['deviation']:+d}) — {rj['headline']}")
        if "error" in rp:
            print(f"  [PLAIN] ERROR: {rp['error']}", file=sys.stderr)
        else:
            print(f"  [PLAIN] {rp['actual_words']} words (dev {rp['deviation']:+d}, "
                  f"self-reported {rp['self_reported'] or 'none'}) — {rp['headline']}")
        if "error" not in rj:
            print(f"\n  --- JSON body ---\n  {rj['body']}")
        if "error" not in rp:
            print(f"\n  --- PLAIN body ---\n  {rp['body']}")

    ok_json = [r for r in json_results if "error" not in r]
    ok_plain = [r for r in plain_results if "error" not in r]

    print(f"\n{'#' * 10} SUMMARY — A/B, {len(factbase)} stories, exact-210 held constant {'#' * 10}\n")
    print(f"JSON arm:  {len(ok_json)}/{len(json_results)} succeeded")
    print(f"PLAIN arm: {len(ok_plain)}/{len(plain_results)} succeeded\n")

    if ok_json:
        avg_words_j = sum(r["actual_words"] for r in ok_json) / len(ok_json)
        avg_dev_j = sum(abs(r["deviation"]) for r in ok_json) / len(ok_json)
        print(f"JSON  — average words: {avg_words_j:.1f} | average |deviation| from 210: {avg_dev_j:.1f}")
    if ok_plain:
        avg_words_p = sum(r["actual_words"] for r in ok_plain) / len(ok_plain)
        avg_dev_p = sum(abs(r["deviation"]) for r in ok_plain) / len(ok_plain)
        print(f"PLAIN — average words: {avg_words_p:.1f} | average |deviation| from 210: {avg_dev_p:.1f}")

    print(f"\n{'slug':<45} {'JSON words':>10} {'PLAIN words':>11} {'JSON dev':>9} {'PLAIN dev':>10}")
    for rj, rp in zip(json_results, plain_results):
        jw = rj.get("actual_words", "ERR")
        pw = rp.get("actual_words", "ERR")
        jd = f"{rj['deviation']:+d}" if "error" not in rj else "ERR"
        pd = f"{rp['deviation']:+d}" if "error" not in rp else "ERR"
        print(f"{rj.get('slug',''):<45} {jw!s:>10} {pw!s:>11} {jd:>9} {pd:>10}")

    print(f"\n[factcheck] stories_checked={factcheck.get('stories_checked', 'n/a')} "
          f"corrections={len(factcheck.get('corrections', []))}")
    for c in factcheck.get("corrections", []):
        print(f"  - {c}")


if __name__ == "__main__":
    main()
