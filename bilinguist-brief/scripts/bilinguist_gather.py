"""
bilinguist_gather.py
====================
Stages 2 (Select) and 3 (Gather) of the Bilinguist Brief daily pipeline.

Stage 2 groups the scraped headlines and Python ranks them; Stage 3 finds the facts
for the ranked winners. --select-only runs Stage 2 alone; --from runs Stage 3 alone.

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
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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



def _ensure_fields(story: dict) -> dict:
    """Add the array fields silently. For selection-only output, empty is expected."""
    for field in ("what_happened", "attribution", "verified", "contested",
                  "numbers", "proper_nouns", "key_terms"):
        if not isinstance(story.get(field), list):
            story[field] = []
    return story


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




# ── Genres — one Gemini call each ────────────────────────────────────────────
# Previously one call gathered all three genres. When the prompt grew it
# completed Global News and stubbed the rest with placeholder slugs, and the
# pipeline shipped 3 articles per language instead of 7. One call per genre
# gives each its own attention and its own search budget.
GENRE_CONFIG = {
    "GLOBAL NEWS": {
        "count": 3,
        "description": "The day's most significant world/breaking stories. The headlines any informed person would have seen today.",
    },
    "UK POLITICS": {
        "count": 2,
        "description": "Significant UK political developments — government, parliament, parties, elections, policy.",
    },
    "BUSINESS & ECONOMY": {
        "count": 2,
        "description": "Significant market, economic, or corporate developments.",
    },
}


def headlines_for_genre(genre: str) -> dict:
    """{outlet: [headline, ...]} for one genre, from the Stage 1 scrape.

    Global News uses the 11 per-outlet feeds. The other genres use a single
    Google News genre feed whose titles carry their source, so headlines are
    regrouped by source to give the same {outlet: [...]} shape.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, f"scraped_headlines_{BRIEF_DATE}.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if genre == "GLOBAL NEWS":
        return {o["name"]: o.get("headlines", [])
                for o in data.get("outlets", []) if o.get("status") == "ok"}

    index: dict = {}
    for row in (data.get("genres") or {}).get(genre, []):
        index.setdefault(row["source"], []).append(row["headline"])
    return index


def render_headline_block(index: dict) -> str:
    if not index:
        return "(No pre-scraped headlines available for this genre.)"
    lines = []
    for outlet, heads in index.items():
        lines.append(f"  {outlet}:")
        for i, h in enumerate(heads, 1):
            lines.append(f"    {i}. {h}")
    return "\n".join(lines)


# ── Cross-reference scoring (Python does the arithmetic) ─────────────────────
# Gemini groups headlines across languages — that is a semantic judgement Python
# cannot make ("Trump on Gaza" and "Trump strikes Iran" share vocabulary but are
# different events). Gemini therefore reports WHICH headlines it grouped, by
# outlet name and position, and the scoring is done here.
#
# This makes the score exact, and it kills the phantom-outlet bug: outlets that
# were never scraped (Xinhua, Politico Europe both appeared in earlier runs) have
# no entry to look up and are rejected.

CARRYING_POINTS = 1.0                                    # per outlet carrying it
POSITION_BONUS  = {1: 2.5, 2: 2.0, 3: 1.5, 4: 1.0, 5: 0.5}


def load_scraped_index() -> dict:
    """{outlet: [headline, ...]} from the Stage 1 scrape. Empty if unavailable."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, f"scraped_headlines_{BRIEF_DATE}.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {
        o["name"]: o.get("headlines", [])
        for o in data.get("outlets", [])
        if o.get("status") == "ok"
    }


def score_story(story: dict, index: dict) -> tuple[float, list, list]:
    """Return (total, verified_sources, problems) for one Global News story."""
    xref = story.get("cross_reference_score") or {}
    total, verified, problems = 0.0, [], []
    for src in xref.get("sources") or []:
        outlet, pos = src.get("outlet"), src.get("position")
        if outlet not in index:
            problems.append(f"outlet not scraped: {outlet!r}")
            continue
        if not isinstance(pos, int) or not 1 <= pos <= len(index[outlet]):
            problems.append(f"{outlet} position {pos} out of range")
            continue
        total += CARRYING_POINTS + POSITION_BONUS.get(pos, 0.0)
        verified.append({"outlet": outlet, "position": pos,
                         "headline": index[outlet][pos - 1]})
    return round(total, 1), verified, problems


def apply_scores(factbase: list, index: dict) -> None:
    """Score every story in this genre's factbase and re-rank on the computed total."""
    if not index:
        print("[gather] No scraped headlines — leaving cross-reference scores as given",
              file=sys.stderr)
        return

    globals_ = list(factbase)
    for story in globals_:
        total, verified, problems = score_story(story, index)
        xref = story.setdefault("cross_reference_score", {})
        xref["total"] = total
        xref["sources"] = verified
        xref["outlets_covering"] = sorted({v["outlet"] for v in verified})
        for p in problems:
            print(f"[gather] WARNING [{story.get('slug','?')}]: {p}", file=sys.stderr)

    for rank, story in enumerate(
        sorted(globals_, key=lambda s: s["cross_reference_score"]["total"], reverse=True), 1
    ):
        story["cross_reference_score"]["rank"] = rank



# ── Optional deepening pass (--deepen) ───────────────────────────────────────
# Gather selects stories by scoring headlines, so a per-story search cannot
# replace that pass — it follows it. Selection stays at one call per genre;
# deepening adds one grounded call per selected story.
#
# The point is source material. Measured 2026-08-09: gather produces ~103 words
# of facts per story (the day's lead had 50) while native articles were asking
# for 250. That gap is what made the writer pad and then invent. More facts per
# story means longer articles become reachable without inventing them.

_DEEPEN_USAGE = {"calls": 0, "prompt_token_count": 0,
                 "candidates_token_count": 0, "thoughts_token_count": 0}

DEEPEN_PROMPT = """You are a news researcher. Below is a fact-base entry for one story, \
gathered from headlines only. Search now and return the SAME JSON structure, substantially \
richer.

TODAY'S DATE: {DATE}

Expand every field with additional VERIFIED detail — names, figures, dates, direct \
consequences, recorded reactions, and the background a reader needs. Aim for at least three \
times the current detail in "what_happened".

RULES:
- Add only facts you can verify by search. Never invent, never speculate.
- Keep the existing points; add to them, do not replace them.
- Keep "slug" and "genre" exactly as given.
- Preserve the verified/contested separation. Anything disputed goes in "contested" with a \
named source.
- Keep the same field names and array-of-strings shape.

Return ONLY the JSON object for this one story.

STORY:
{STORY}
"""


def deepen_story(client, story: dict, model: str) -> dict:
    """One grounded call to enrich a single story. Returns the story unchanged on failure."""
    slug = story.get("slug", "?")
    prompt = (DEEPEN_PROMPT
              .replace("{DATE}", BRIEF_DATE)
              .replace("{STORY}", json.dumps(story, ensure_ascii=False, indent=2)))
    try:
        resp = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.1,
            ),
        )
    except Exception as e:
        print(f"[deepen] {slug}: call failed ({type(e).__name__}) — keeping original",
              file=sys.stderr)
        return story

    um = resp.usage_metadata
    if um:
        _DEEPEN_USAGE["calls"] += 1
        for k in ("prompt_token_count", "candidates_token_count", "thoughts_token_count"):
            _DEEPEN_USAGE[k] += getattr(um, k, 0) or 0

    parsed = parse_llm_json(resp.text or "")
    if not parsed or not parsed.get("what_happened"):
        print(f"[deepen] {slug}: unusable response — keeping original", file=sys.stderr)
        return story

    # Never let deepening change identity or lose the score.
    parsed["slug"] = story.get("slug")
    parsed["genre"] = story.get("genre")
    if "cross_reference_score" in story:
        parsed["cross_reference_score"] = story["cross_reference_score"]

    before, after = story_word_count(story), story_word_count(parsed)
    print(f"[deepen] {slug}: {before} -> {after} words of source")
    return validate_story(parsed)


# Narrative is prose the writer can build sentences from. Glossary is lookup data —
# figures and names that appear verbatim in every language. Counting them together
# overstates how much an article has to work with: the "~103 words per story" figure
# that drove the native target down was an unsplit total, so the real narrative was
# smaller than it looked. Always report the two separately.
NARRATIVE_FIELDS = ("what_happened", "attribution", "verified", "contested")
GLOSSARY_FIELDS  = ("numbers", "proper_nouns", "key_terms")
FACT_FIELDS = NARRATIVE_FIELDS + GLOSSARY_FIELDS


# ── Per-story fact collection (--per-story) ──────────────────────────────────
# The A/B arm. A genre call must select 2-3 stories AND report their facts in one
# response, so each story gets a fraction of the attention and the output budget.
# This gives each story its own call and its own search.
#
# Distinct from --deepen: deepening ADDS to the genre call's facts, so it inherits
# whatever that call produced. This collects each story's facts from scratch, given
# only the story's identity and the real scraped headlines that were grouped into it.
# That is the design that would actually ship if it wins.

_PER_STORY_USAGE = {"calls": 0, "prompt_token_count": 0,
                    "candidates_token_count": 0, "thoughts_token_count": 0}
_USAGE_LOCK = threading.Lock()

# 7 grounded calls run concurrently rather than in sequence. Latency is the binding
# constraint on this pipeline (07:30 delivery), so a serial measurement would make the
# design look more expensive in wall-clock than it actually is.
_PER_STORY_WORKERS = 7

# Enough for 150-250 narrative words plus the glossary, with headroom. A cap also stops a
# single story running away — arm B produced 719 words of glossary for one story uncapped.
PER_STORY_MAX_TOKENS = 3000

# Some reasoning helps group facts into the verified/contested split; 74% of the bill does
# not. Raise only if output quality visibly drops.
THINKING_BUDGET = 1024

SELECT_PROMPT_FILE = "gemini_prompt_select.md"

PER_STORY_PROMPT = """You are a news researcher building the fact-base entry for ONE story. \
This fact-base is an internal working document, never shown to readers. It is rewritten later \
into several languages and reading levels, so write it in neutral British English.

TODAY'S DATE: {DATE}

These are real headlines about this story, scraped today from major outlets:
{HEADLINES}

Search now and return the fact-base entry for this one story as JSON.

DEPTH — the target, not a ceiling:
- 8-14 points in "what_happened", each a single clause.
- Across all narrative fields, aim for 150-250 words in total.
- Under 150 words the story is under-reported: search again for the detail you are missing —
  a figure, a named reaction, a consequence, the background a reader needs.
- Over 250 words you are padding. Cut the least essential point. Volume is not accuracy.
- At most 25 entries each in "numbers", "proper_nouns" and "key_terms". These are lookup
  data, not prose — a long list is not a better list. Uncapped, one story returned 719
  words of glossary.

FIELDS — all arrays of short strings, one clean point per string, no paragraphs:
- "what_happened": the events in deliberate narrative order — what happened first, then
  next, then the consequences. Every writing call downstream follows this exact order.
- "attribution": who reported or stated what, by name.
- "verified": facts independently confirmed by more than one outlet.
- "contested": disputed, single-source or unconfirmed claims, each attributed to a named
  source. Where outlets disagree on a figure, record the disagreement here with both
  sources rather than picking one.
- "numbers": exact figures as they must appear in every language (e.g. "12,000", "3.5%").
- "proper_nouns": people, organisations, places, spelled canonically.
- "key_terms": the core descriptive terms for the event (e.g. "ceasefire", "evacuation").
- "notification_line": ONE short factual sentence summarising this story for a push
  notification. No opinion, no filler, no call to action.

RULES:
- Add only facts you can verify by search. Never invent, never speculate. If you cannot
  verify something, put it in "contested" with its source, or leave it out.
- Never record verbatim sentences or distinctive phrasing from a source. Convert every
  point into plain factual wording of your own. Only numbers, proper nouns and official
  titles may be verbatim. Quotations appear as reported speech, never as quoted text.
- Use neutral descriptors: "killed", "fighters", "the military", "officials". Avoid loaded
  terms unless quoting a named party, and then attribute explicitly.
- Give parallel treatment to opposing parties where the facts allow.
- POLITICAL TITLES: use the title the person holds on {DATE}, verified by today's search
  results — never a remembered one. Add "former" only if today's results confirm they have
  left office.
- Return "slug" and "genre" exactly as given below. Do not alter them.

Return ONLY the JSON object for this one story.

STORY IDENTITY:
{IDENTITY}
"""


def gather_story(client, story: dict, model: str) -> dict:
    """One grounded call collecting a single story's facts. Returns original on failure."""
    slug = story.get("slug", "?")
    heads = [f"  - {s.get('outlet')}: {s.get('headline')}"
             for s in (story.get("cross_reference_score", {}).get("sources") or [])
             if s.get("headline")]
    identity = {"slug": slug, "genre": story.get("genre"),
                "headline": story.get("headline") or story.get("summary") or ""}
    prompt = (PER_STORY_PROMPT
              .replace("{DATE}", BRIEF_DATE)
              .replace("{HEADLINES}", "\n".join(heads) or "  (none matched)")
              .replace("{IDENTITY}", json.dumps(identity, ensure_ascii=False, indent=2)))
    try:
        resp = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.1,
                # Thinking was ~74% of this stage's cost uncapped (52k thinking tokens
                # against 25k of output, at $3.50/M vs $2.50/M). This is grounded
                # extraction from search results, not a reasoning problem.
                thinking_config=types.ThinkingConfig(thinking_budget=THINKING_BUDGET),
                max_output_tokens=PER_STORY_MAX_TOKENS,
            ),
        )
    except Exception as e:
        print(f"[per-story] {slug}: call failed ({type(e).__name__}) — keeping original",
              file=sys.stderr)
        return story

    um = resp.usage_metadata
    if um:
        with _USAGE_LOCK:
            _PER_STORY_USAGE["calls"] += 1
            for k in ("prompt_token_count", "candidates_token_count", "thoughts_token_count"):
                _PER_STORY_USAGE[k] += getattr(um, k, 0) or 0

    parsed = parse_llm_json(resp.text or "")
    if not parsed or not parsed.get("what_happened"):
        print(f"[per-story] {slug}: unusable response — keeping original", file=sys.stderr)
        return story

    # Identity and score are the genre call's, never the per-story call's.
    parsed["slug"]  = story.get("slug")
    parsed["genre"] = story.get("genre")
    if "cross_reference_score" in story:
        parsed["cross_reference_score"] = story["cross_reference_score"]
    for carry in ("headline", "summary"):
        if carry in story and carry not in parsed:
            parsed[carry] = story[carry]

    bn, bg = story_word_split(story)
    an, ag = story_word_split(parsed)
    print(f"[per-story] {slug}: narrative {bn} -> {an} | glossary {bg} -> {ag}")
    return validate_story(parsed)


def _count(story: dict, fields) -> int:
    n = 0
    for f in fields:
        v = story.get(f) or []
        n += sum(len(str(x).split()) for x in v) if isinstance(v, list) else len(str(v).split())
    return n


def story_word_count(story: dict) -> int:
    """Total words of source material in one story."""
    return _count(story, FACT_FIELDS)


def story_word_split(story: dict) -> tuple[int, int]:
    """(narrative words, glossary words) — narrative is what caps article length."""
    return _count(story, NARRATIVE_FIELDS), _count(story, GLOSSARY_FIELDS)


FACTS_PROMPT_FILE = "gemini_prompt_facts.md"


def _story_brief(story: dict) -> str:
    """Render one selected story as input to the fact-finding call."""
    heads = [f"    - {s.get('outlet')}: {s.get('headline')}"
             for s in (story.get("cross_reference_score", {}).get("sources") or [])
             if s.get("headline")]
    lines = [f"  slug: {story.get('slug')}",
             f"  what it is: {story.get('headline') or story.get('summary') or ''}",
             "  headlines outlets published about it:"]
    lines += heads or ["    (none matched)"]
    return "\n".join(lines)


def gather_facts_for_genre(client, genre: str, stories: list, model: str,
                           send_all_headlines: bool = False) -> list:
    """One grounded call finding the facts for a genre's already-selected stories.

    Same per-genre batching as production, but the call receives ONLY the winning
    stories and their own grouped headlines — not all 60 scraped headlines, and no
    selection or scoring work. That isolates the input from the batching: if depth
    improves here, the cause was the noise and the competing task, not batch size.
    """
    # send_all_headlines reproduces what production's combined call sees: every scraped
    # headline for the genre, on top of the selected stories. It is the A arm of the test.
    extra = ""
    if send_all_headlines:
        extra = ("\nFOR REFERENCE — every headline scraped for this genre today:\n"
                 + render_headline_block(headlines_for_genre(genre)) + "\n")
    prompt = (load_prompt(FACTS_PROMPT_FILE)
              .replace("{DATE}", BRIEF_DATE)
              .replace("{GENRE}", genre)
              .replace("{STORY_COUNT}", str(len(stories)))
              .replace("{ALL_HEADLINES}", extra)
              .replace("{STORIES}", "\n\n".join(_story_brief(s) for s in stories)))
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.1,
        thinking_config=types.ThinkingConfig(thinking_budget=THINKING_BUDGET),
        # Scales with the batch so a 3-story genre is not squeezed into the same
        # ceiling as a 2-story one.
        max_output_tokens=PER_STORY_MAX_TOKENS * len(stories),
    )

    # Walk the same attempt plan the selection call uses. This function originally had a
    # bare try/except that gave up on the first error, so one transient 503 silently lost
    # a whole genre's facts and the run still exited 0 — which is exactly what happened on
    # 2026-08-10: 5 of 7 stories reached the writing stage with nothing to write from.
    # An unusable or truncated response is retried too, not just a raised exception.
    found: dict = {}
    resp = None
    for attempt_model, tier, label, max_retries, delays in ATTEMPT_PLAN:
        for attempt in range(1, max_retries + 2):
            reason = None
            try:
                resp = client.models.generate_content(
                    model=attempt_model, contents=prompt, config=config)
            except Exception as e:
                resp, reason = None, f"{type(e).__name__}: {e}"
            if resp is not None:
                um = resp.usage_metadata
                if um:
                    with _USAGE_LOCK:
                        _PER_STORY_USAGE["calls"] += 1
                        for k in ("prompt_token_count", "candidates_token_count",
                                  "thoughts_token_count"):
                            _PER_STORY_USAGE[k] += getattr(um, k, 0) or 0
                parsed = parse_llm_json(resp.text or "")
                found = {s.get("slug"): s for s in (parsed or {}).get("factbase", [])
                         if isinstance(s, dict) and s.get("what_happened")}
                if found:
                    break
                reason = "no usable stories in response"
            if attempt <= max_retries:
                delay = delays[attempt - 1]
                print(f"[facts] {genre}: attempt {attempt} failed ({reason}) — "
                      f"retrying in {delay}s", file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[facts] {genre}: {attempt_model} exhausted ({reason})",
                      file=sys.stderr)
        if found:
            if attempt_model != ATTEMPT_PLAN[0][0]:
                print(f"[facts] {genre}: recovered via {attempt_model}")
            break

    if not found:
        print(f"[facts] {genre}: ALL attempts failed — {len(stories)} stories have no facts",
              file=sys.stderr)
        return stories

    out = []
    for story in stories:
        slug = story.get("slug")
        facts = found.get(slug)
        if not facts or not facts.get("what_happened"):
            print(f"[facts] {genre}: no facts returned for '{slug}' — keeping selection only",
                  file=sys.stderr)
            out.append(story)
            continue
        # Identity and score belong to the selection stage, never to this call.
        facts["slug"], facts["genre"] = slug, story.get("genre")
        if "cross_reference_score" in story:
            facts["cross_reference_score"] = story["cross_reference_score"]
        for carry in ("headline", "summary"):
            if carry in story and carry not in facts:
                facts[carry] = story[carry]
        n, g = story_word_split(facts)
        print(f"[facts] {genre}/{slug}: narrative {n} | glossary {g}")
        out.append(validate_story(facts))
    return out


def build_search_log() -> list:
    """Rebuild the per-outlet headline log in Python, from the Stage 1 scrape.

    This used to be a required field of the genre call's JSON — Gemini had to retype all
    60 scraped headlines "as found" before scoring. For Global News that transcription was
    roughly 6,000 characters of a 9,682-character response, so ~80% of the answer was
    bookkeeping and only ~20% was facts, while the other genres (8 headlines) were ~88%
    facts. It is used solely to print a diagnostic list in the morning notification, and
    the headlines were already on disk. So build it here for free.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, f"scraped_headlines_{BRIEF_DATE}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [
        {"outlet": o.get("name", "?"), "stories": o.get("headlines", [])}
        for o in data.get("outlets", [])
        if o.get("status") == "ok"
    ]


def assemble_notification(factbase: list) -> str:
    """Build the push notification from each Global story's own notification_line.

    The genre call used to write this, which needed the facts to be in the same response.
    With fact-finding split out, each story writes its own short topic phrase while
    holding its own facts, and Python combines them into one sentence, in rank order —
    no extra call. Previously each story wrote a full sentence and Python just
    concatenated them, so 3 stories read as 3 separate sentences — too long for a push
    notification. Now it's one sentence covering all of them.
    """
    globals_ = [s for s in factbase if (s.get("genre") or "").upper() == "GLOBAL NEWS"]
    globals_.sort(key=lambda s: (s.get("cross_reference_score") or {}).get("rank", 99))
    phrases = [(s.get("notification_line") or "").strip().rstrip(".!?") for s in globals_]
    phrases = [p for p in phrases if p]
    if not phrases:
        return ""
    if len(phrases) == 1:
        return f"Today: {phrases[0]}."
    return f"Today: {', '.join(phrases[:-1])} and {phrases[-1]}."


# ── Main ──────────────────────────────────────────────────────────────────────

def gather_genre(genre: str, cfg: dict, prompt_file: str,
                 expect_facts: bool = True) -> dict:
    """Run one Gemini call for a single genre. Returns its parsed payload.

    expect_facts=False for selection-only calls: the story records legitimately arrive
    with no facts, so neither the stub check nor the field validator should complain.
    """
    index = headlines_for_genre(genre)
    total_headlines = sum(len(v) for v in index.values())
    print(f"\n[gather] ===== {genre} ({cfg['count']} stories, "
          f"{total_headlines} headlines) =====")

    # 0 headlines means Stage 1 failed for this genre (a scraper outage, not "nothing
    # happened in the world") -- confirmed 2026-08-14: with 0 headlines in, Gemini's
    # selection call still returned "winners", inventing placeholder slugs like
    # "no-business-economy-headlines-provided-for-selection-1" that described the
    # absence of data rather than signalling it. Nothing downstream recognised those as
    # special, so Stage 3 ran real fact-gathering calls against them and Stage 5 wrote
    # full native articles from fabricated content -- genuine invention, not factual
    # drift. Skip the Gemini call entirely rather than trust it to signal "nothing here"
    # through a slug the rest of the pipeline doesn't know to treat differently.
    if total_headlines == 0:
        print(f"[gather] {genre}: 0 headlines scraped -- skipping selection, "
              f"no winners for this genre this run", file=sys.stderr)
        return {"factbase": [], "search_log": [], "parsed": {},
                "usage": {}, "model": None, "index": index}
    # 1. Load and prepare the prompt
    raw_prompt = load_prompt(prompt_file)
    prompt = inject_date(raw_prompt)
    prompt = prompt.replace("{GENRE}", genre)
    prompt = prompt.replace("{STORY_COUNT}", str(cfg["count"]))
    prompt = prompt.replace("{GENRE_DESCRIPTION}", cfg["description"])
    prompt = prompt.replace("{SCRAPED_HEADLINES}", render_headline_block(index))
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
    _scraped_index = load_scraped_index()

    # Reject stubbed stories. When gather is overloaded it completes the genre it
    # finds easiest and fills the rest with placeholders like "uk-politics-story-1"
    # and no content. Nothing downstream can tell those from real stories, so a run
    # once shipped 3 articles per language instead of 7 without any error.
    # In selection-only mode an empty "what_happened" is CORRECT — facts arrive in the
    # next stage — so only the placeholder-slug half of the check applies.
    _PLACEHOLDER = re.compile(r"^(uk-politics|business-economy|global-news)-story-\d+$")
    stubs = [
        s_.get("slug", "?") for s_ in factbase
        if _PLACEHOLDER.match(s_.get("slug", ""))
        or (expect_facts and not s_.get("what_happened"))
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
    elif expect_facts:
        print("[gather] WARNING: global_news_search_log missing from response", file=sys.stderr)

    factbase = ([validate_story(st) for st in factbase] if expect_facts
                else [_ensure_fields(st) for st in factbase])
    for st in factbase:
        st["genre"] = genre
    apply_scores(factbase, index)

    # Python picks the winners, not Gemini. Stage 2 asks the model to group EVERY headline
    # into events -- the one judgement a model is needed for -- and returns every group.
    # The selection is then pure arithmetic on breadth and position.
    #
    # Until 2026-08-26 the prompt told Gemini to return "exactly {STORY_COUNT}" groups
    # ranked by its own sense of "real-world importance", so apply_scores() only ever saw
    # the three the model had already chosen and the scoring was decorative. On 2026-08-26
    # Dolly Parton's death was carried at position 1-4 by the Guardian, CNN, the Washington
    # Post, the NYT and Le Monde -- 14.0 points against the 12.5 of the story that won --
    # and never reached the arithmetic, because Gemini did not nominate it.
    if not expect_facts and index:
        ranked = sorted(factbase,
                        key=lambda st: (st.get("cross_reference_score") or {}).get("total", 0),
                        reverse=True)
        keep, drop = ranked[:cfg["count"]], ranked[cfg["count"]:]
        for st in drop:
            x = st.get("cross_reference_score", {})
            print(f"[gather]   not selected [{x.get('total', 0)}] {st.get('slug', '?')} "
                  f"— {x.get('outlets_covering', [])}", file=sys.stderr)
        for rank, st in enumerate(keep, 1):
            st.setdefault("cross_reference_score", {})["rank"] = rank
        print(f"[gather] {genre}: grouped {len(factbase)} events, kept top {len(keep)} by score")
        factbase = keep

    return {"factbase": factbase, "search_log": search_log, "parsed": parsed,
            "usage": usage_metadata, "model": model, "index": index}


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", default=PROMPT_FILE, help="Path to the Gemini prompt file")
    parser.add_argument("--deepen", action="store_true",
                        help="After selection, make one extra grounded call per story to "
                             "enrich its facts. Selection is unchanged.")
    # A/B correctness: selection is a non-deterministic LLM judgement, so an arm that
    # re-gathers picks different stories and different slugs, and a per-story
    # comparison is then meaningless. --from reuses the other arm's selection verbatim,
    # which makes the two factbases differ ONLY by the deepening pass.
    parser.add_argument("--split", action="store_true",
                        help="The two-stage pipeline in one run: stage 1 selects stories "
                             "only (no facts), stage 2 finds their facts.")
    parser.add_argument("--select-only", action="store_true", dest="select_only",
                        help="Stage 2 (Select) ONLY: group headlines, score in Python, write the "
                             "ranked selection with no facts. For A/B runs, so both arms "
                             "start from one identical selection.")
    parser.add_argument("--facts-input", choices=["winners", "all"], default="winners",
                        dest="facts_input",
                        help="What the fact-finding call receives. 'winners' sends only "
                             "the selected stories and their own grouped headlines. 'all' "
                             "also sends every scraped headline, reproducing what "
                             "production's combined call sees.")
    parser.add_argument("--facts-per", choices=["genre", "story"], default="genre",
                        dest="facts_per",
                        help="With --split: 'genre' keeps production's batching (one call "
                             "per genre, given only that genre's winners) — the default, "
                             "and the tighter comparison against A. 'story' gives every "
                             "story its own call.")
    parser.add_argument("--per-story", action="store_true", dest="per_story",
                        help="Collect each story's facts in its own grounded call, "
                             "replacing the genre call's fact work. Needs --from.")
    parser.add_argument("--from", dest="from_factbase", metavar="PATH",
                        help="Skip selection entirely and load this factbase instead. "
                             "Use with --deepen/--per-story so both A/B arms share one "
                             "selection.")
    args, _ = parser.parse_known_args()

    # --from now means "stage 2 only, on this selection", which is how the A/B holds
    # stage 1 constant: one shared selection run, then each arm does only fact-finding.
    find_facts = bool(args.split or args.per_story or args.from_factbase)
    if args.select_only and find_facts:
        sys.exit("--select-only is stage 1 alone. Do not combine it with a facts flag.")
    if args.deepen and (args.per_story or args.split):
        sys.exit("--deepen is an alternative to --per-story/--split, not a stack.")
    if args.split and args.from_factbase:
        sys.exit("--split does its own selection; --from would override it.")
    if args.select_only:
        args.split = True   # stage 1 uses the selection-only prompt and validator

    pipeline_started_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    print(f"[gather] Starting Bilinguist Brief gathering run — {datetime.now(timezone.utc).isoformat()}")
    print(f"[gather] {len(GENRE_CONFIG)} genres, one Gemini call each")

    factbase, search_log, notification = [], [], ""
    usage_total = {"prompt_token_count": 0, "candidates_token_count": 0,
                   "thoughts_token_count": 0, "total_token_count": 0}
    model_used = ""

    if args.from_factbase:
        with open(args.from_factbase, encoding="utf-8") as f:
            src = json.load(f)
        factbase = src.get("factbase", []) or []
        if not factbase:
            sys.exit(f"[gather] ERROR: no stories in {args.from_factbase}")
        search_log   = src.get("global_news_search_log", []) or []
        notification = src.get("daily_notification", "") or ""
        model_used   = src.get("model", "") or ""
        # Carry the source arm's gather usage forward, so this run's usage_metadata is
        # "their selection + our deepening". A cost diff between the two factbases is
        # then exactly the price of deepening.
        for k in usage_total:
            usage_total[k] += (src.get("usage_metadata") or {}).get(k, 0)
        print(f"[gather] Selection reused from {args.from_factbase} — "
              f"{len(factbase)} stories, no selection calls made")

    # --split runs selection against a prompt that asks for groupings ONLY: no facts, no
    # glossary, no notification, and no 60-headline transcript. Stage 3 then finds the
    # facts for the stories that survived. Selection and fact-finding stop competing for
    # one response, which is what starved Global News (3 stories per call, ~80% of the
    # answer spent retyping headlines).
    prompt_file = SELECT_PROMPT_FILE if args.split else args.prompt
    if args.split:
        print("[gather] STAGE 2 (Select) — grouping and ranking only, no facts")

    for genre, cfg in (() if args.from_factbase else GENRE_CONFIG.items()):
        res = gather_genre(genre, cfg, prompt_file, expect_facts=not args.split)
        factbase.extend(res["factbase"])
        model_used = res["model"]
        for k in usage_total:
            usage_total[k] += (res["usage"] or {}).get(k, 0)
        if genre == "GLOBAL NEWS" and not args.split:
            search_log = res["parsed"].get("global_news_search_log", []) or []
            notification = res["parsed"].get("daily_notification", "") or ""
        for st in res["factbase"]:
            x = st.get("cross_reference_score", {})
            print(f"[gather]   rank {x.get('rank','?')} [{x.get('total','?')}] "
                  f"{st.get('slug','?')} — {x.get('outlets_covering', [])}")

    if args.select_only:
        print(f"[gather] STAGE 2 (Select) done — {len(factbase)} stories ranked, no facts. "
              f"Stage 3 runs separately so every arm shares this selection.")
        search_log = build_search_log()

    if find_facts:
        print(f"\n[gather] STAGE 3 (Gather) — facts for {len(factbase)} selected stories "
              f"(input: {args.facts_input})")
        client = genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT_MS))
        bn = sum(story_word_split(s_)[0] for s_ in factbase)
        bg = sum(story_word_split(s_)[1] for s_ in factbase)
        mode = (f"per genre, input={args.facts_input}" if args.facts_per == "genre"
                else "per story")
        print(f"\n[facts] ===== collecting facts for {len(factbase)} stories — "
              f"{mode} =====")
        _t = time.time()
        model = ATTEMPT_PLAN[0][0]
        if args.facts_per == "genre":
            # Production's batching, kept deliberately: one call per genre, but given
            # ONLY that genre's winning stories and their own grouped headlines. The
            # single change from arm A is what goes in.
            by_genre: dict = {}
            for s_ in factbase:
                by_genre.setdefault(s_.get("genre") or "?", []).append(s_)
            print(f"[facts] one call per genre, {len(by_genre)} genres, "
                  f"winners only: "
                  + ", ".join(f"{g}={len(v)}" for g, v in by_genre.items()))
            with ThreadPoolExecutor(max_workers=len(by_genre)) as ex:
                results = list(ex.map(
                    lambda kv: gather_facts_for_genre(client, kv[0], kv[1], model,
                                                      send_all_headlines=(args.facts_input == "all")),
                    by_genre.items()))
            # Rebuild in the original order so genre grouping and ranking survive.
            # Keyed by (genre, slug): slug alone would let two genres that picked the
            # same slug silently swap facts.
            merged = {(s_.get("genre"), s_.get("slug")): s_
                      for group in results for s_ in group}
            factbase = [merged.get((s_.get("genre"), s_.get("slug")), s_)
                        for s_ in factbase]
        else:
            with ThreadPoolExecutor(max_workers=_PER_STORY_WORKERS) as ex:
                # map() preserves input order, so grouping and ranking survive.
                factbase = list(ex.map(lambda s_: gather_story(client, s_, model), factbase))
        an = sum(story_word_split(s_)[0] for s_ in factbase)
        ag = sum(story_word_split(s_)[1] for s_ in factbase)
        n = max(len(factbase), 1)
        print(f"[facts] narrative: {bn} -> {an} ({an / max(bn,1):.1f}x), "
              f"avg/story {bn // n} -> {an // n}")
        print(f"[facts] glossary:  {bg} -> {ag} ({ag / max(bg,1):.1f}x), "
              f"avg/story {bg // n} -> {ag // n}")
        u = _PER_STORY_USAGE
        cost = (u["prompt_token_count"] / 1e6 * 0.30
                + u["candidates_token_count"] / 1e6 * 2.50
                + u["thoughts_token_count"] / 1e6 * 3.50)
        print(f"[facts] {u['calls']} calls in {time.time() - _t:.0f}s | "
              f"{u['prompt_token_count']:,} in {u['candidates_token_count']:,} out "
              f"{u['thoughts_token_count']:,} think | ${cost:.4f}")
        for k in ("prompt_token_count", "candidates_token_count", "thoughts_token_count"):
            usage_total[k] += u[k]

        # Fail here rather than exiting 0 with a factbase nothing can be written from.
        # gather_facts_for_genre returns the selection unchanged when a genre's call
        # cannot be recovered, so success has to be asserted, not assumed.
        no_facts = [s_.get("slug") for s_ in factbase if not s_.get("what_happened")]
        if no_facts:
            print(f"[gather] ERROR: {len(no_facts)}/{len(factbase)} stories have no facts "
                  f"after all retries: {no_facts}", file=sys.stderr)
            print("[gather] Refusing to write a factbase the writing stages cannot use.",
                  file=sys.stderr)
            sys.exit(1)

        if args.split or args.from_factbase:
            # Both were previously side-effects of the genre call. Neither needs a model.
            search_log = build_search_log()
            notification = assemble_notification(factbase)
            print(f"[gather] search log rebuilt in Python: {len(search_log)} outlets "
                  f"(0 tokens)")
            print(f"[gather] notification assembled from per-story lines: "
                  f"{notification[:120] or '(EMPTY)'}")
            if not notification:
                print("[gather] WARNING: empty notification — no story returned a "
                      "notification_line", file=sys.stderr)

    if args.deepen:
        client = genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT_MS))
        before = sum(story_word_count(s_) for s_ in factbase)
        print(f"\n[deepen] ===== enriching {len(factbase)} stories =====")
        factbase = [deepen_story(client, s_, ATTEMPT_PLAN[0][0]) for s_ in factbase]
        after = sum(story_word_count(s_) for s_ in factbase)
        print(f"[deepen] total source words: {before} -> {after} "
              f"({after / max(before,1):.1f}x), avg/story {after // max(len(factbase),1)}")
        u = _DEEPEN_USAGE
        cost = (u["prompt_token_count"] / 1e6 * 0.30
                + u["candidates_token_count"] / 1e6 * 2.50
                + u["thoughts_token_count"] / 1e6 * 3.50)
        print(f"[deepen] {u['calls']} calls | {u['prompt_token_count']:,} in "
              f"{u['candidates_token_count']:,} out {u['thoughts_token_count']:,} think "
              f"| ${cost:.4f}")
        for k in ("prompt_token_count", "candidates_token_count", "thoughts_token_count"):
            usage_total[k] += u[k]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, f"factbase_{BRIEF_DATE}.json")
    output = {
        "date": BRIEF_DATE,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipeline_started_at": pipeline_started_at,
        "model": model_used,
        "service_tier": "standard",
        "story_count": len(factbase),
        "usage_metadata": usage_total,
        "global_news_search_log": search_log,
        "daily_notification": notification,
        "deepened": bool(args.deepen),
        # Set when selection came from another run, so a comparison can prove both arms
        # scored the same stories rather than assuming it.
        "selection_from": args.from_factbase or None,
        "deepen_usage": dict(_DEEPEN_USAGE) if args.deepen else None,
        "split": bool(args.split),
        "per_story": bool(args.per_story or args.split),
        "per_story_usage": (dict(_PER_STORY_USAGE)
                            if (args.per_story or args.split) else None),
        "factbase": factbase,
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n[gather] Factbase written to '{output_path}'")
    print(f"[gather] Done. {len(factbase)} stories across "
          f"{len(set(s.get('genre') for s in factbase))} genres.")


if __name__ == "__main__":
    main()
