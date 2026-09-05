"""
test_new_genre_selection.py
============================
Standalone test: scrapes candidate outlets for three proposed new/modified
genres (UK, EU, US) AND the real Global News outlets, runs all four through
the REAL selection prompt (gemini_prompt_select.md), and scores each with
the appropriate formula -- Global News keeps its existing, proven formula
unchanged; UK/EU/US use a new formula sized for their much smaller (3-4
outlet) pools, which escalates the breadth bonus to reward full consensus
much more heavily than Global News's linear per-outlet credit does (that
linear model works well across 12 outlets, but flattens the difference
between "1 outlet ran it" and "everyone we check ran it" when the whole
pool is only 3-4 outlets).

Prints, per genre: every story Gemini grouped and scored, THEN specifically
highlights the top N that would actually be selected/reported (N = each
genre's real intended story count), so duplicate stories across genres
can be checked directly -- does a UK/EU/US top pick describe the same
real-world event as one of Global News's top picks?

Does NOT touch GENRE_CONFIG, GENRE_FEEDS, or any production stage. Writes
nothing back anywhere. Pure read-only test, run manually via its own
isolated workflow. No cross-genre dedup logic is implemented yet -- this
round is purely to observe whether duplicates actually occur, per Will's
explicit sequencing (test a few times first, decide the dedup prompt
injection after).

Usage: python test_new_genre_selection.py
Requires: GEMINI_API_KEY
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone

from google import genai
from google.genai import types

# Reuse the REAL Global News scraper wholesale -- same 12 outlets, same
# Guardian front-page scraper, same BBC merged-feed logic -- rather than
# reimplementing any of it, so Global News's results in this test are
# identical to what production would actually produce today.
import bilinguist_scrape as scrape

BRIEF_DATE = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")

# ── Candidate outlets for the new/modified genres, confirmed working ─────────
GENRE_OUTLETS = {
    "UK": {
        "BBC": "http://feeds.bbci.co.uk/news/uk/rss.xml",
        "Guardian": "https://www.theguardian.com/uk-news/rss",
        "Independent": "https://www.independent.co.uk/news/uk/rss",
    },
    "EU": {
        "Der Spiegel": "https://www.spiegel.de/ausland/index.rss",
        "Politico Europe": "https://www.politico.eu/feed/",
        "Guardian": "https://www.theguardian.com/world/europe-news/rss",
    },
    "US": {
        "New York Times": "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        "Washington Post": "https://feeds.washingtonpost.com/rss/national",
        "NPR": "https://feeds.npr.org/1001/rss.xml",
        "BBC": "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    },
}

GENRE_DESCRIPTIONS = {
    "UK": "Significant UK news — politics, society, economy, major national events. "
          "Broadened from UK Politics: not politics-only.",
    "EU": "Significant European news — politics, society, economy, major events across "
          "the continent (not UK-specific, not US-specific).",
    "US": "Significant US news — politics, society, economy, major national events.",
}

# How many top stories each genre actually reports, for highlighting "what
# would ship" -- matches the existing UK POLITICS/BUSINESS precedent (2) for
# the three new/modified genres; Global News keeps its real count (3).
GENRE_STORY_COUNT = {"GLOBAL NEWS": 3, "UK": 2, "EU": 2, "US": 2}

HEADLINES_PER_OUTLET = 5


# ── Global News: verbatim scoring, copied from bilinguist_gather.py ─────────
def _same_headline(a, b) -> bool:
    def toks(t):
        t = re.sub(r"[^\w\s]", " ", str(t).lower())
        return {w for w in t.split() if len(w) > 3}
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return True
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.5


GLOBAL_CARRYING_POINTS = 1.0
GLOBAL_POSITION_BONUS = {1: 2.5, 2: 2.0, 3: 1.5, 4: 1.0, 5: 0.5}


def score_story_global(story: dict, index: dict) -> tuple[float, list, list]:
    return _score(story, index, GLOBAL_CARRYING_POINTS, GLOBAL_POSITION_BONUS,
                  breadth_bonus=None)


# ── UK/EU/US: new formula, sized for 3-4 outlet pools ────────────────────────
# Position: only the top 3 positions earn anything (vs Global News's 5-tier
# ladder down to position 5) -- with far fewer outlets, a story that only
# shows up at position 4-5 somewhere is noise, not signal.
NEW_POSITION_BONUS = {1: 3.0, 2: 2.0, 3: 1.0}

# Breadth bonus, added once per story based on how many distinct outlets
# carried it. Escalating, not flat: the gap between "half the pool agrees"
# and "the whole pool agrees" should be large, because full agreement in a
# 3-4 outlet pool is a much rarer, stronger signal than in Global News's
# 12-outlet pool, where a flat 1.0-per-outlet credit works fine because
# scores are already spread across a wide range. Derived from Will's own
# two data points (2 outlets -> +0.5, 3 outlets -> +2.0; each additional
# outlet's increment grows by 1.0: +0.5, +1.5, +2.5, ...), extended to 4.
NEW_BREADTH_BONUS = {1: 0.0, 2: 0.5, 3: 2.0, 4: 4.5}


def score_story_new(story: dict, index: dict) -> tuple[float, list, list]:
    return _score(story, index, carrying_points=0.0,
                   position_bonus=NEW_POSITION_BONUS,
                   breadth_bonus=NEW_BREADTH_BONUS)


def _score(story: dict, index: dict, carrying_points: float, position_bonus: dict,
           breadth_bonus: dict | None) -> tuple[float, list, list]:
    xref = story.get("cross_reference_score") or {}
    verified, problems = [], []
    for src in xref.get("sources") or []:
        outlet, pos = src.get("outlet"), src.get("position")
        if outlet not in index:
            problems.append(f"outlet not scraped: {outlet!r}")
            continue
        if not isinstance(pos, int) or not 1 <= pos <= len(index[outlet]):
            problems.append(f"{outlet} position {pos} out of range")
            continue
        scraped = index[outlet][pos - 1]
        claimed = (src.get("headline_text") or "").strip()
        if claimed and not _same_headline(claimed, scraped):
            problems.append(
                f"{outlet} #{pos} headline does not match the scrape — "
                f"claimed {claimed[:60]!r}, scraped {str(scraped)[:60]!r}")
            continue
        verified.append({"outlet": outlet, "position": pos, "headline": scraped})

    best: dict[str, int] = {}
    for v in verified:
        o, pos = v["outlet"], v["position"]
        if o not in best or pos < best[o]:
            best[o] = pos
    total = sum(carrying_points + position_bonus.get(p, 0.0) for p in best.values())
    if breadth_bonus is not None:
        total += breadth_bonus.get(len(best), 0.0)
    return round(total, 1), verified, problems


def render_headline_block(index: dict) -> str:
    if not index:
        return "(No pre-scraped headlines available for this genre.)"
    lines = []
    for outlet, heads in index.items():
        lines.append(f"  {outlet}:")
        for i, h in enumerate(heads, 1):
            lines.append(f"    {i}. {h}")
    return "\n".join(lines)


def scrape_global_news() -> dict:
    """Real production scrape, reusing bilinguist_scrape.py's OUTLETS list
    and fetch logic exactly -- same outlets, same merged/guardian handling."""
    index = {}
    for outlet in scrape.OUTLETS:
        name = outlet["name"]
        try:
            headlines = []
            if outlet.get("scraper") == "guardian":
                headlines = scrape.scrape_guardian()
            if not headlines and outlet.get("feeds"):
                headlines = scrape.fetch_merged(outlet["feeds"])
            if not headlines:
                headlines = scrape.fetch_rss(outlet["rss"])
            if headlines:
                index[name] = headlines
                print(f"[test] GLOBAL NEWS/{name}: {len(headlines)} headlines scraped")
        except Exception as e:
            print(f"[test] GLOBAL NEWS/{name}: FAILED — {e}", file=sys.stderr)
    return index


def scrape_genre(genre: str) -> dict:
    index = {}
    for name, url in GENRE_OUTLETS[genre].items():
        try:
            headlines = scrape.fetch_rss(url, limit=HEADLINES_PER_OUTLET)
            index[name] = headlines
            print(f"[test] {genre}/{name}: {len(headlines)} headlines scraped")
        except Exception as e:
            print(f"[test] {genre}/{name}: FAILED — {e}", file=sys.stderr)
    return {k: v for k, v in index.items() if v}


def run_selection(genre: str, description: str, index: dict) -> list[dict]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(script_dir, "gemini_prompt_select.md"), encoding="utf-8") as f:
        raw_prompt = f.read()

    prompt = (raw_prompt
              .replace("{DATE}", BRIEF_DATE)
              .replace("{GENRE}", genre)
              .replace("{GENRE_DESCRIPTION}", description)
              .replace("{SCRAPED_HEADLINES}", render_headline_block(index)))

    client = genai.Client()
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.1,
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=config,
    )
    text = (response.text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    parsed = json.loads(text)
    return parsed.get("factbase", [])


def process_genre(genre: str, description: str, index: dict, scorer) -> list[dict]:
    if not index:
        print(f"[test] {genre}: no outlets returned headlines — skipping")
        return []
    stories = run_selection(genre, description, index)
    print(f"\n[test] {genre}: Gemini grouped {len(stories)} distinct stories")

    scored = []
    for story in stories:
        total, verified, problems = scorer(story, index)
        scored.append({"total": total, "story": story, "verified": verified,
                        "problems": problems})
    scored.sort(key=lambda s: s["total"], reverse=True)

    for rank, s in enumerate(scored, 1):
        print(f"\n  #{rank}  score={s['total']}  {s['story'].get('headline')}")
        print(f"       slug: {s['story'].get('slug')}")
        print(f"       verified sources ({len(s['verified'])}): "
              + ", ".join(f"{v['outlet']}#{v['position']}" for v in s["verified"]))
        if s["problems"]:
            print(f"       PROBLEMS: {s['problems']}")
    return scored


def main():
    results = {}

    print(f"\n{'=' * 60}\nGLOBAL NEWS\n{'=' * 60}")
    gn_index = scrape_global_news()
    results["GLOBAL NEWS"] = process_genre(
        "GLOBAL NEWS", "The day's most significant world/breaking stories.",
        gn_index, score_story_global)

    for genre in ("UK", "EU", "US"):
        print(f"\n{'=' * 60}\n{genre}\n{'=' * 60}")
        index = scrape_genre(genre)
        results[genre] = process_genre(genre, GENRE_DESCRIPTIONS[genre], index,
                                        score_story_new)

    # ── What would actually ship, side by side, for duplicate review ────────
    print(f"\n{'=' * 60}\nWOULD BE REPORTED (top N per genre) — CHECK FOR DUPLICATES\n{'=' * 60}")
    for genre, scored in results.items():
        n = GENRE_STORY_COUNT[genre]
        print(f"\n{genre} (top {n}):")
        for s in scored[:n]:
            print(f"  [{s['total']}] {s['story'].get('headline')}  (slug: {s['story'].get('slug')})")


if __name__ == "__main__":
    main()
