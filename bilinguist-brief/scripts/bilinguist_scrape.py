"""
bilinguist_scrape.py
====================
Stage 1 (Scrape) of the Bilinguist Brief daily pipeline.

Fetches top headlines from 12 major news outlets via their public RSS feeds.
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
        # World section alone cannot see a UK or US story; the front page alone
        # cannot see half the world stories. Read both -- see fetch_merged().
        "rss": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "feeds": [
            "https://feeds.bbci.co.uk/news/world/rss.xml",
            "https://feeds.bbci.co.uk/news/rss.xml",
        ],
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
        # Path narrowed to /ausland. The whole-domain query returned Elbe water
        # levels, Schalke, pensions and a paywalled Bahn quiz — German domestic
        # stories no other outlet carries, so they can never earn breadth points
        # and simply waste slots. /ausland fills all five with stories that can
        # actually cross-reference.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:spiegel.de/ausland&hl=de&gl=DE&ceid=DE:de",
    },
    {
        "name": "NHK World",
        # Path narrowed to /en/news. Without it Google indexed NHK TV programme
        # pages as articles — "A Cat's-Eye View of Japan" and "BIZ STREAM" took
        # positions 1 and 2, the highest-scoring slots, pushing real stories down.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:www3.nhk.or.jp/nhkworld/en/news&hl=en-US&gl=US&ceid=US:en",
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
        "name": "El País",
        # Added to balance an Anglo-American-heavy pool — Le Monde and Der Spiegel
        # were the only EU papers. /internacional returns five genuinely
        # international stories that cross-reference against the others; the
        # whole-domain query would surface Spanish domestic news that nothing
        # else covers and so can never score.
        # Corriere /esteri and El Mundo were tested and were softer; Politico
        # Europe had the best signal but returns only 3 items.
        "rss": "https://news.google.com/rss/search?q=when:24h+site:elpais.com/internacional&hl=es&gl=ES&ceid=ES:es",
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
        print(f"[1-scrape] Guardian scrape returned only {len(headlines)} plausible "
              f"headlines — falling back to RSS", file=sys.stderr)
        return []
    return headlines[:HEADLINES_PER_OUTLET]


def fetch_rss(url: str, limit: int = None) -> list[str]:
    """Fetch an RSS feed and return the top N headline strings."""
    limit = HEADLINES_PER_OUTLET if limit is None else limit
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    titles: list[str] = []

    # RSS 2.0: channel/item/title
    for item in root.findall(".//item"):
        el = item.find("title")
        if el is not None and el.text and el.text.strip():
            titles.append(el.text.strip())
        if len(titles) >= limit:
            break

    # Atom fallback: entry/title
    if not titles:
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall(".//atom:entry", ns):
            el = entry.find("atom:title", ns)
            if el is not None and el.text and el.text.strip():
                titles.append(el.text.strip())
            if len(titles) >= limit:
                break

    return titles[:limit]



# ── Merged feeds ─────────────────────────────────────────────────────────────
# No single RSS feed reproduces an outlet's front page. The BBC proves it: on
# 2026-08-26 Dolly Parton's death led the site and was the FIRST item of
# /news/rss.xml, but /news/world/rss.xml -- the only feed we read -- did not carry
# it at all, so five outlets scored the day's biggest story and the BBC scored zero.
# Swapping to the front page is not the answer either: in that same feed the Canada
# tariffs story sat at position 22 and the US-Iran sanctions story was absent from
# all 33 items, so we would have traded two published stories for one.
#
# Reading both and keeping each headline's BEST position across them costs nothing
# (RSS is free, no API call) and loses neither. Outlets read this way get a deeper
# cap, since two feeds genuinely offer more real candidates than one -- positions
# past 5 earn no bonus but still carry their breadth point.
MERGED_HEADLINES_PER_OUTLET = 8


def fetch_merged(urls: list[str]) -> list[str]:
    """Read several feeds for one outlet; order by best position across them."""
    best: dict[str, tuple[int, int, str]] = {}       # key -> (position, feed_idx, title)
    for feed_idx, url in enumerate(urls):
        try:
            titles = fetch_rss(url, limit=HEADLINES_PER_OUTLET)
        except Exception as e:
            print(f"[1-scrape]   merged feed {feed_idx + 1} failed: {e}", file=sys.stderr)
            continue
        for pos, title in enumerate(titles, 1):
            key = " ".join(title.lower().split())
            if key not in best or (pos, feed_idx) < best[key][:2]:
                best[key] = (pos, feed_idx, title)
    ordered = sorted(best.values(), key=lambda t: (t[0], t[1]))
    return [t[2] for t in ordered[:MERGED_HEADLINES_PER_OUTLET]]


# ── Genre feeds (UK Politics, Business & Economy) ────────────────────────────
# These genres have no per-outlet scrape and so were free-searched by Gemini,
# making their cross-reference scores unverifiable. Chasing individual outlet
# feeds did not work: BBC politics is JS-rendered, Sky and iNews run 46-63h
# behind, and Standard / Spectator / PoliticsHome / New Statesman all 404 or 403.
#
# One Google News topic search covers more ground than any of them. A single
# request returned Guardian, Telegraph, Independent, FT, New Statesman and
# HuffPost UK, all inside 19h — including outlets whose own feeds are broken.
# Each title carries its source as a " - Source" suffix, so outlet and position
# still come through for scoring.
GENRE_FEEDS = {
    "UK POLITICS": "https://news.google.com/rss/search?q=when:24h+UK+politics&hl=en-GB&gl=GB&ceid=GB:en",
    # Business uses Google's curated business section, not a keyword search.
    # "when:24h business economy" pulled global trade press (Aaj English TV, Bali
    # Discovery, GMK Center) and scored 0 allowed sources.
    #
    # gl=US, not gl=GB. The GB edition is the UK business page: it was returning Octopus
    # Energy, Thames Water, Harvey Nichols and a Travelodge story — domestic business, not
    # world business. The US edition returns Intel's $15bn share sale, Boeing selling its
    # eVTOL arm, Berkshire earnings and yen intervention.
    "BUSINESS & ECONOMY": "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
}
GENRE_HEADLINES = 8   # more than Global News: one feed carries every outlet

# Google mixes non-news domains into topic searches (facebook.com appeared at #9
# in testing). Only these may contribute to a score.
#
# The list was built for UK outlets, so when Business moved to the US edition it was
# discarding the world business press it had just gained — 2 of the first 5 headlines were
# dropped, including Barron's. The international business desks below were added for that.
# Its job is to block non-news domains, not to block real newsrooms.
ALLOWED_SOURCES = {
    "The Guardian", "The Telegraph", "The Independent", "Financial Times",
    "BBC", "BBC News", "Sky News", "The Times", "New Statesman", "The Spectator",
    "Reuters", "Associated Press", "AP News", "Bloomberg", "CNBC",
    "The Economist", "HuffPost UK", "Evening Standard", "iNews", "PoliticsHome",
    "Daily Mail", "The Mirror", "Express", "Wall Street Journal", "CNN",
    "The i Paper", "The Irish News", "The National Scot", "Belfast Telegraph",
    # International business press. Added when Business moved to the US edition — without
    # these the feed loses most of what makes it world rather than UK news.
    "Barron's", "MarketWatch", "Fortune", "Nikkei Asia", "Nikkei",
    "WSJ",   # Google labels the Journal "WSJ" in this feed, not "Wall Street Journal"
    "South China Morning Post", "Investor's Business Daily", "Business Insider",
    "Yahoo Finance", "Axios", "Quartz", "Financial Post",
    # Google reports some outlets by domain rather than title — both forms count.
    "telegraph.co.uk", "theguardian.com", "bbc.co.uk", "ft.com",
    "independent.co.uk", "thetimes.co.uk", "Bloomberg.com", "standard.co.uk",
    "barrons.com", "marketwatch.com", "cnbc.com", "reuters.com", "wsj.com",
}
# Deliberately NOT allowlisted: Fox Business appears in the US business feed and is a real
# business desk, but the brief's whole neutrality framing argues against a politically
# slanted source feeding story selection. Add it if you disagree — one line.


def split_source(title: str) -> tuple[str, str]:
    """Google News titles end with ' - Source'. Returns (headline, source)."""
    if " - " in title:
        head, src = title.rsplit(" - ", 1)
        return head.strip(), src.strip()
    return title.strip(), ""


def fetch_genre(url: str) -> list[dict]:
    """Fetch a genre feed, returning [{headline, source}] from allowed sources."""
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    out, dropped = [], []
    for item in root.findall(".//item"):
        el = item.find("title")
        if el is None or not el.text:
            continue
        headline, source = split_source(el.text)
        if source not in ALLOWED_SOURCES:
            dropped.append(source or "(no source)")
            continue
        out.append({"headline": headline, "source": source})
        if len(out) >= GENRE_HEADLINES:
            break
    if dropped:
        print(f"[1-scrape]   dropped {len(dropped)} non-allowlisted: "
              f"{sorted(set(dropped))[:6]}", file=sys.stderr)
    return out


def main() -> None:
    print(f"[1-scrape] Starting headline scrape — {datetime.now(timezone.utc).isoformat()}")
    print(f"[1-scrape] Date: {BRIEF_DATE} | Outlets: {len(OUTLETS)}")

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
                    print(f"[1-scrape] {name}: front-page HTML (editorial order)")
            if not headlines and outlet.get("feeds"):
                headlines = fetch_merged(outlet["feeds"])
                if headlines:
                    print(f"[1-scrape] {name}: merged {len(outlet['feeds'])} feeds "
                          f"(best position across them)")
            if not headlines:
                headlines = fetch_rss(rss_url)
            if headlines:
                print(f"[1-scrape] ✓ {name} ({len(headlines)} headlines)")
                for i, h in enumerate(headlines, 1):
                    print(f"    {i}. {h[:100]}")
                results.append({"name": name, "status": "ok", "headlines": headlines})
                success_count += 1
            else:
                print(f"[1-scrape] ✗ {name}: feed returned no items", file=sys.stderr)
                results.append({"name": name, "status": "empty", "headlines": []})
        except Exception as e:
            print(f"[1-scrape] ✗ {name}: {e}", file=sys.stderr)
            results.append({"name": name, "status": "failed", "headlines": []})

    # ── Genre feeds ──────────────────────────────────────────────────────────
    genres: dict = {}
    for genre, url in GENRE_FEEDS.items():
        try:
            rows = fetch_genre(url)
            genres[genre] = rows
            print(f"[1-scrape] ✓ {genre} ({len(rows)} headlines)")
            for i, r in enumerate(rows, 1):
                print(f"    {i}. [{r['source']}] {r['headline'][:80]}")
        except Exception as e:
            print(f"[1-scrape] ✗ {genre}: {e}", file=sys.stderr)
            genres[genre] = []

    print(f"[1-scrape] Done: {success_count}/{len(OUTLETS)} outlets scraped successfully")

    if success_count == 0:
        print("[1-scrape] ERROR: No outlets scraped — aborting", file=sys.stderr)
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
        "genres": genres,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[1-scrape] Written to {output_path}")


if __name__ == "__main__":
    main()
