"""
test_new_genre_selection.py
============================
Standalone test: scrapes candidate outlets for two proposed new genres (UK,
broadened from UK POLITICS; and US, new) and runs them through the REAL
selection prompt (gemini_prompt_select.md) and REAL cross-reference scoring
logic (copied verbatim from bilinguist_gather.py, not reimplemented) --
so the ranked stories printed here are exactly what production would produce
if these outlets were wired in for real.

Does NOT touch GENRE_CONFIG, GENRE_FEEDS, or any production stage. Writes
nothing back anywhere. Pure read-only test, run manually via its own
isolated workflow.

Usage: python test_new_genre_selection.py
Requires: GEMINI_API_KEY
"""

from __future__ import annotations

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests
from google import genai
from google.genai import types

BRIEF_DATE = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
REQUEST_TIMEOUT = 15
HEADLINES_PER_OUTLET = 5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# ── Candidate outlets, confirmed working by direct testing 2026-09-05 ────────
GENRE_OUTLETS = {
    "UK": {
        "BBC": "http://feeds.bbci.co.uk/news/uk/rss.xml",
        "Guardian": "https://www.theguardian.com/uk-news/rss",
        "Independent": "https://www.independent.co.uk/news/uk/rss",
        "FT": "https://www.ft.com/world/uk?format=rss",
    },
    "US": {
        "New York Times": "https://rss.nytimes.com/services/xml/rss/nyt/US.xml",
        "Washington Post": "https://feeds.washingtonpost.com/rss/national",
        "NPR": "https://feeds.npr.org/1001/rss.xml",
        "CBS News": "https://www.cbsnews.com/latest/rss/us",
        "NBC News": "https://feeds.nbcnews.com/nbcnews/public/news",
        "The Hill": "https://thehill.com/homenews/feed/",
        "Axios": "https://api.axios.com/feed/",
    },
}

GENRE_DESCRIPTIONS = {
    "UK": "Significant UK news — politics, society, economy, major national events. "
          "Broadened from UK Politics: not politics-only.",
    "US": "Significant US news — politics, society, economy, major national events.",
}

# ── Verbatim from bilinguist_scrape.py (fetch_rss) — not reimplemented, copied ──
def fetch_rss(url: str, limit: int = HEADLINES_PER_OUTLET) -> list[str]:
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    titles: list[str] = []
    for item in root.findall(".//item"):
        el = item.find("title")
        if el is not None and el.text and el.text.strip():
            titles.append(el.text.strip())
        if len(titles) >= limit:
            break
    return titles[:limit]


# ── Verbatim from bilinguist_gather.py (_same_headline, score_story) ─────────
def _same_headline(a, b) -> bool:
    def toks(t):
        t = re.sub(r"[^\w\s]", " ", str(t).lower())
        return {w for w in t.split() if len(w) > 3}
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return True
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.5


CARRYING_POINTS = 1.0
POSITION_BONUS = {1: 2.5, 2: 2.0, 3: 1.5, 4: 1.0, 5: 0.5}


def score_story(story: dict, index: dict) -> tuple[float, list, list]:
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
    total = sum(CARRYING_POINTS + POSITION_BONUS.get(p, 0.0) for p in best.values())
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


def scrape_genre(genre: str) -> dict:
    index = {}
    for name, url in GENRE_OUTLETS[genre].items():
        try:
            headlines = fetch_rss(url)
            index[name] = headlines
            print(f"[test] {genre}/{name}: {len(headlines)} headlines scraped")
        except Exception as e:
            print(f"[test] {genre}/{name}: FAILED — {e}", file=sys.stderr)
            index[name] = []
    return {k: v for k, v in index.items() if v}


def run_selection(genre: str, index: dict) -> list[dict]:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(script_dir, "gemini_prompt_select.md"), encoding="utf-8") as f:
        raw_prompt = f.read()

    prompt = (raw_prompt
              .replace("{DATE}", BRIEF_DATE)
              .replace("{GENRE}", genre)
              .replace("{GENRE_DESCRIPTION}", GENRE_DESCRIPTIONS[genre])
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


def main():
    for genre in ("UK", "US"):
        print(f"\n{'=' * 60}\n{genre}\n{'=' * 60}")
        index = scrape_genre(genre)
        if not index:
            print(f"[test] {genre}: no outlets returned headlines — skipping selection")
            continue

        stories = run_selection(genre, index)
        print(f"\n[test] {genre}: Gemini grouped {len(stories)} distinct stories")

        scored = []
        for story in stories:
            total, verified, problems = score_story(story, index)
            scored.append((total, story, verified, problems))
        scored.sort(key=lambda t: t[0], reverse=True)

        for rank, (total, story, verified, problems) in enumerate(scored, 1):
            print(f"\n  #{rank}  score={total}  {story.get('headline')}")
            print(f"       slug: {story.get('slug')}")
            print(f"       verified sources ({len(verified)}): "
                  + ", ".join(f"{v['outlet']}#{v['position']}" for v in verified))
            if problems:
                print(f"       PROBLEMS: {problems}")


if __name__ == "__main__":
    main()
