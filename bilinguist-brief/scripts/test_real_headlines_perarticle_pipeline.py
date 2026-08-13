"""
Test: run every stage per-article (one Gemini prompt per story, never shared) -- gathering,
fact-checking, AND native writing. Long-form, real headlines.

Motivated by a real finding: Stage 3's batched GLOBAL NEWS call (3 stories, one response)
gave the lead story 617 narrative words and starved a later story to 223 -- the model spends
its effort on the first story in a shared context and gives less to the rest. Per-story
calls remove that upstream confound so every story gets a fair, equally-deep fact-base.

Pipeline under test:
  Stage 1 Scrape   -- real, unchanged
  Stage 2 Select   -- real, unchanged (grouping/ranking only, no facts)
  Stage 3 Gather   -- --per-story: one dedicated Gemini+Search call per story, not shared
  Stage 4 Verify   -- one Gemini+Search fact-check call PER STORY, not one call for all
                      (production currently does one shared call for the whole factbase --
                      this test builds a per-story version to compare against)
  Stage 5 Write EN -- one plain-text (no forced JSON) call per story, exact-210 instruction --
                      the settled configuration from the JSON-vs-plain-text A/B

Everything writes to local files in this directory -- never touches the data repo, the live
app, or any Supabase/D1 write. Real Gemini API calls (paid), keep the story count small via
MAX_STORIES if testing repeatedly.

    python test_real_headlines_perarticle_pipeline.py
"""

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from google import genai

BRIEF_DATE = os.environ.get(
    "BRIEF_DATE",
    __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d"),
)
os.environ["BRIEF_DATE"] = BRIEF_DATE

SCRIPT_DIR = Path(__file__).parent
TARGET_WORDS = 210


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


def stage3_gather_per_story() -> None:
    import bilinguist_gather
    sys.argv = ["bilinguist_gather.py", "--from", str(SCRIPT_DIR / "selection.json"),
                "--per-story"]
    bilinguist_gather.main()


# ── Stage 4: per-story fact-check (test-only rewrite of bilinguist_factcheck.py's logic) ───
FACTCHECK_PROMPT_ONE = """\
You are a fact-checker for Bilinguist Brief, a news app. You receive ONE story's structured \
fact-base and must verify the highest-risk facts using Google Search before the article is written.

TODAY'S DATE: {DATE}

KNOWN POLITICAL FACTS — apply these corrections WITHOUT searching, they are verified:
- Donald Trump IS the current President of the United States (re-elected November 2024, \
serving January 2025 - January 2029). If the factbase says "Former President Trump" or \
"ex-President Trump", CORRECT IT to "President Trump". This is a common model error -- fix it.
- A head of government who has ANNOUNCED resignation but has NOT yet been replaced by a \
confirmed successor is still the CURRENT incumbent. Do not add "former" or "outgoing" unless \
a successor has already taken office.

WHAT TO CHECK — search actively:
1. POLITICAL TITLES — any person named who holds a political role. Search "[name] current \
role {DATE}" and verify their title is accurate TODAY using SEARCH RESULTS ONLY.
2. KEY NUMBERS — at least one figure from the "numbers" array. Cross-check against a second source.
3. CORE EVENT — the first item in "what_happened". Confirm this event is real and occurred \
within the last 48 hours.

IMPORTANT: Only record a correction if you found EXPLICIT search evidence the current text \
is wrong. If you cannot find a recent search result confirming the error, leave it alone.

STORY TO CHECK:
{STORY}

Respond with ONLY a valid JSON object -- no markdown fences, no preamble:
{{"corrections": [{{"field": "<field name>", "original": "<exact substring that is wrong>", \
"corrected": "<correct replacement>", "reason": "<one sentence>"}}]}}

If no corrections are needed return: {{"corrections": []}}
"""


def parse_json(raw: str) -> dict | None:
    if not raw:
        return None
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


def factcheck_one_story(story: dict) -> tuple[dict, list]:
    from google.genai import types
    client = genai.Client()
    prompt = FACTCHECK_PROMPT_ONE.format(
        DATE=BRIEF_DATE, STORY=json.dumps(story, ensure_ascii=False, indent=2))
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.1)

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
                print(f"[{story.get('slug')}] factcheck attempt {attempt} failed ({e}) — "
                      f"retrying in {delay}s…", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[{story.get('slug')}] factcheck non-retryable: {e}", file=sys.stderr)
                return story, []
    if not response:
        return story, []

    parsed = parse_json(response.text or "")
    corrections = (parsed or {}).get("corrections", [])
    applied = []
    for c in corrections:
        original, corrected = c.get("original", ""), c.get("corrected", "")
        if not original or not corrected or original == corrected:
            continue
        changed = False
        for key, value in story.items():
            if isinstance(value, list):
                new_list = [v.replace(original, corrected) if isinstance(v, str) and original in v else v
                            for v in value]
                if new_list != value:
                    story[key] = new_list
                    changed = True
            elif isinstance(value, str) and original in value:
                story[key] = value.replace(original, corrected)
                changed = True
        if changed:
            applied.append({"slug": story.get("slug"), **c})
            print(f"[factcheck/{story.get('slug')}] ✓ {original} → {corrected}")
    return story, applied


def stage4_factcheck_per_story() -> None:
    factbase_path = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    with open(factbase_path, encoding="utf-8") as f:
        doc = json.load(f)
    factbase = doc.get("factbase", [])

    print(f"[4-verify/per-story] fact-checking {len(factbase)} stories, one call each")
    with ThreadPoolExecutor(max_workers=min(len(factbase), 7)) as ex:
        results = list(ex.map(factcheck_one_story, factbase))

    updated_factbase = [r[0] for r in results]
    all_applied = [c for r in results for c in r[1]]
    doc["factbase"] = updated_factbase
    doc["factcheck"] = {"stories_checked": len(factbase), "corrections": all_applied}
    with open(factbase_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f"[4-verify/per-story] Done — {len(all_applied)} correction(s) applied across "
          f"{len(factbase)} stories.")


# ── Stage 5: native EN, per-article, plain-text (settled config, no forced JSON) ───────────
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
    import re
    m = re.search(
        r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*?)\n*SELF-CHECK WORD COUNT:\s*(\d+)",
        raw, re.DOTALL)
    if not m:
        m2 = re.search(r"HEADLINE:\s*(.+?)\n+BODY:\s*\n?(.*)", raw, re.DOTALL)
        if not m2:
            return "", raw.strip(), ""
        return m2.group(1).strip(), m2.group(2).strip(), ""
    return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()


def write_native_one(client: "genai.Client", story: dict) -> dict:
    from google.genai import types
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
                return {"slug": story.get("slug"), "error": str(e)}

    if not response:
        return {"slug": story.get("slug"), "error": "all retries failed"}
    raw = response.text or ""
    if not raw:
        return {"slug": story.get("slug"), "error": "no response"}
    headline, body, self_check = parse_plain(raw)
    actual = len(body.split())
    return {
        "slug": story.get("slug"), "headline": headline, "body": body,
        "actual_words": actual, "self_reported": self_check,
        "deviation": actual - TARGET_WORDS,
    }


def main() -> None:
    run_stage("STAGE 1 — Scrape (real, today)", stage1_scrape)
    run_stage("STAGE 2 — Select (real, today)", stage2_select)
    run_stage("STAGE 3 — Gather facts, PER-STORY (real, today)", stage3_gather_per_story)
    run_stage("STAGE 4 — Fact-check, PER-STORY (test rewrite)", stage4_factcheck_per_story)

    factbase_path = SCRIPT_DIR / f"factbase_{BRIEF_DATE}.json"
    with open(factbase_path, encoding="utf-8") as f:
        doc = json.load(f)
    factbase = doc.get("factbase", [])
    factcheck = doc.get("factcheck", {})

    max_stories = int(os.environ.get("MAX_STORIES", "4"))
    factbase = factbase[:max_stories]
    print(f"\n[note] limited to {len(factbase)} stories for this test (MAX_STORIES={max_stories})")
    for s in factbase:
        narrative_words = sum(
            len(item.split())
            for field in ("what_happened", "attribution", "verified", "contested")
            for item in (s.get(field) or [])
        )
        print(f"  {s.get('slug')}: {len(s.get('what_happened') or [])} facts, "
              f"{narrative_words} narrative words")

    client = genai.Client()

    print(f"\n{'#' * 10} STAGE 5 — Native EN, PER-ARTICLE ({len(factbase)} calls) {'#' * 10}\n")
    results = []
    for story in factbase:
        r = write_native_one(client, story)
        results.append(r)
        if "error" in r:
            print(f"  {r['slug']}: ERROR {r['error']}", file=sys.stderr)
            continue
        print(f"\n{'=' * 20} {r['slug']} — {r['actual_words']} words "
              f"(target 210, dev {r['deviation']:+d}) {'=' * 20}\n")
        print(f"Headline: {r['headline']}\n")
        print(r["body"])

    ok = [r for r in results if "error" not in r]
    print(f"\n{'#' * 10} SUMMARY — per-article pipeline, {len(factbase)} stories {'#' * 10}\n")
    print(f"Succeeded: {len(ok)}/{len(results)}")
    if ok:
        avg_words = sum(r["actual_words"] for r in ok) / len(ok)
        avg_dev = sum(abs(r["deviation"]) for r in ok) / len(ok)
        print(f"Average words: {avg_words:.1f} (target 210)")
        print(f"Average |deviation| from 210: {avg_dev:.1f}")
        for r in ok:
            print(f"  {r['slug']}: {r['actual_words']} words (dev {r['deviation']:+d})")

    print(f"\n[factcheck] stories_checked={factcheck.get('stories_checked', 'n/a')} "
          f"corrections={len(factcheck.get('corrections', []))}")
    for c in factcheck.get("corrections", []):
        print(f"  - {c}")


if __name__ == "__main__":
    main()
