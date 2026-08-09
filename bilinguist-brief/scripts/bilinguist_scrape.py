"""
bilinguist_scrape.py
====================
Stage 0 of the Bilinguist Brief daily pipeline.

Fetches top headlines from 11 major news outlets via their public RSS feeds.
Outputs scraped_headlines_{DATE}.json for use by bilinguist_gather.py.

No AI involved — pure Python HTTP + RSS parsing.
AFP excluded: no public RSS feed available.
Financial Times excluded from Global News: its front page is business-led, so it
skews the general-news scoring. It remains a named source for the BUSINESS &
ECONOMY genre in gemini_prompt_brief.md, and blocks scrapers (403) in any case.

Usage:
    python bilinguist_scrape.py

Requirements:
    pip install requests
"""

import json
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

BRIEF_DATE = os.environ.get("BRIEF_DATE") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
REQUEST_TIMEOUT = 15
# 5 per outlet. 3 gave the 12 outlets almost no overlap to score against (top
# story 7/36, ranks 2 and 3 routinely tied). 8 was tried and OVERLOADED gather,
# which stubbed out whole genres — bilinguist_gather.py now rejects that outright,
# so 5 is a deliberate middle step. Raise further only with that guard watched.
# NOTE: the scoring ladder in gemini_prompt_brief.md is derived from this number.
HEADLINES_PER_OUTLET = 5

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

OUTLETS = [
    {
        "name": "Reuters",
        # Official RSS discontinued — Google News 24h filter is the reliable workaround
        "rss": "https://news.google.com/rss/search?q=when:24h+site:reuters.com&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "Associated Press (AP)",
        # Official RSS discontinued — Google News 24h filter is the reliable workaround
        "rss": "https://news.google.com/rss/search?q=when:24h+site:apnews.com&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "BBC News",
        "rss": "https://feeds.bbci.co.uk/news/world/rss.xml",
    },
    {
        "name": "The Guardian",
        # Front-page scrape gives true editorial order; RSS is the fallback.
        "scraper": "guardian",
        "rss": "https://www.theguardian.com/world/rss",
    },
    {
        "name": "Le Monde",
        "rss": "https://www.lemonde.fr/rss/une.xml",
    },
    {
        "name": "Der Spiegel",
        # /international is a long-read feature feed spanning ~29 days, not daily
        # news. German-language is fine: headlines are only used for scoring and
        # the prompt states the outlet's language is irrelevant.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:spiegel.de&hl=de&gl=DE&ceid=DE:de",
    },
    {
        "name": "NHK World",
        # Was missing the when:24h filter every other Google News query has, so
        # year-old items were appearing in the top 8.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:www3.nhk.or.jp/nhkworld&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "Al Jazeera",
        # all.xml is a chronological firehose — Messi, cricket and NBA outranked
        # the day's news. Google News 24h gives editorial news ordering.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:aljazeera.com&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "CNN",
        # Official world feed is ABANDONED — it still serves April 2023 items
        # ("Retail spending fell in March", 2022 climate pieces) and had been
        # feeding three-year-old headlines into every brief.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:cnn.com&hl=en-US&gl=US&ceid=US:en",
    },
    {
        "name": "New York Times",
        "rss": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
    },
    {
        "name": "Washington Post",
        # No public RSS — Google News search is the workaround.
        # when:24h added: without it the top 8 spanned ~48h.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:washingtonpost.com&hl=en-US&gl=US&ceid=US:en",
    },
]


# ── Front-page HTML scraping ─────────────────────────────────────────────────
# No RSS feed reproduces an editorial front page. The Guardian's /world/rss is a
# section feed running 34-64h behind, /rss and /uk/rss are chronological firehoses
# of features, and Google News matched only 2 of the front page's top 4. Scraping
# the front page matched 4 of 4, in order.

# Guardian marks each card link with aria-label. The first entries are the
# personalisation carousel (opinion, lifestyle, a "Move highlight stories
# forwards" UI control); the news block follows that marker.
_GUARDIAN_CAROUSEL_END = "Move highlight stories forwards"

# Text that is UI furniture rather than a headline. If a scrape returns these the
# page structure has changed and the result must not be trusted.
_UI_NOISE = (
    "log in", "sign in", "menu", "navigation", "skip to", "search",
    "homepage", "link to", "move highlight", "subscribe", "newsletter",
)


def scrape_guardian() -> list[str]:
    """Scrape theguardian.com front page in editorial order.

    Returns [] on any doubt so the caller can fall back to RSS — a silent bad
    scrape would feed UI strings into the cross-reference scoring.
    """
    import re as _re
    from html import unescape

    resp = requests.get("https://www.theguardian.com/", headers=HEADERS,
                        timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    page = resp.text

    labels, seen = [], set()
    for raw in _re.findall(r'aria-label="([^"]{20,180})"', page):
        t = unescape(raw).strip()
        if t not in seen:
            seen.add(t)
            labels.append(t)

    # Start after the personalisation carousel when the marker is present.
    if _GUARDIAN_CAROUSEL_END in labels:
        labels = labels[labels.index(_GUARDIAN_CAROUSEL_END) + 1:]

    headlines = [
        t for t in labels
        if not any(n in t.lower() for n in _UI_NOISE) and len(t.split()) >= 4
    ]

    # Plausibility guard — a redesign should fail loudly, not quietly.
    if len(headlines) < HEADLINES_PER_OUTLET:
        print(f"[scrape] Guardian scrape returned only {len(headlines)} plausible "
              f"headlines — falling back to RSS", file=sys.stderr)
        return []
    return headlines[:HEADLINES_PER_OUTLET]


def fetch_rss(url: str) -> list[str]:
    """Fetch an RSS feed and return the top N headline strings."""
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    titles: list[str] = []

    # RSS 2.0: channel/item/title
    for item in root.findall(".//item"):
        el = item.find("title")
        if el is not None and el.text and el.text.strip():
            titles.append(el.text.strip())
        if len(titles) >= HEADLINES_PER_OUTLET:
            break

    # Atom fallback: entry/title
    if not titles:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall(".//atom:entry", ns):
            el = entry.find("atom:title", ns)
            if el is not None and el.text and el.text.strip():
                titles.append(el.text.strip())
            if len(titles) >= HEADLINES_PER_OUTLET:
                break

    return titles[:HEADLINES_PER_OUTLET]


def main() -> None:
    print(f"[scrape] Starting headline scrape — {datetime.now(timezone.utc).isoformat()}")
    print(f"[scrape] Date: {BRIEF_DATE} | Outlets: {len(OUTLETS)}")

    results: list[dict] = []
    success_count = 0

    for outlet in OUTLETS:
        name = outlet["name"]
        rss_url = outlet["rss"]
        try:
            headlines = []
            if outlet.get("scraper") == "guardian":
                headlines = scrape_guardian()
                if headlines:
                    print(f"[scrape] {name}: front-page HTML (editorial order)")
            if not headlines:
                headlines = fetch_rss(rss_url)
            if headlines:
                print(f"[scrape] ✓ {name} ({len(headlines)} headlines)")
                for i, h in enumerate(headlines, 1):
                    print(f"    {i}. {h[:100]}")
                results.append({"name": name, "status": "ok", "headlines": headlines})
                success_count += 1
            else:
                print(f"[scrape] ✗ {name}: feed returned no items", file=sys.stderr)
                results.append({"name": name, "status": "empty", "headlines": []})
        except Exception as e:
            print(f"[scrape] ✗ {name}: {e}", file=sys.stderr)
            results.append({"name": name, "status": "failed", "headlines": []})

    print(f"[scrape] Done: {success_count}/{len(OUTLETS)} outlets scraped successfully")

    if success_count == 0:
        print("[scrape] ERROR: No outlets scraped — aborting", file=sys.stderr)
        sys.exit(1)

    script_dir = Path(__file__).parent
    output_path = script_dir / f"scraped_headlines_{BRIEF_DATE}.json"

    output = {
        "date": BRIEF_DATE,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "outlets_attempted": len(OUTLETS),
        "outlets_succeeded": success_count,
        "note": "AFP excluded (no public RSS). FT excluded from Global News — business-led front page, kept for the Business & Economy genre.",
        "outlets": results,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[scrape] Written to {output_path}")


if __name__ == "__main__":
    main()
