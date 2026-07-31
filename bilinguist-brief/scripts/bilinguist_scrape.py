"""
bilinguist_scrape.py
====================
Stage 0 of the Bilinguist Brief daily pipeline.

Fetches top headlines from 9 major news outlets via their public RSS feeds.
Outputs scraped_headlines_{DATE}.json for use by bilinguist_gather.py.

No AI involved — pure Python HTTP + RSS parsing.
AFP excluded: no public RSS feed available.

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
HEADLINES_PER_OUTLET = 3

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

OUTLETS = [
    {
        "name": "Reuters",
        "rss": "https://feeds.reuters.com/reuters/topNews",
    },
    {
        "name": "Associated Press (AP)",
        "rss": "https://feeds.apnews.com/rss/apf-topnews",
    },
    {
        "name": "BBC News",
        "rss": "https://feeds.bbci.co.uk/news/world/rss.xml",
    },
    {
        "name": "The Guardian",
        "rss": "https://www.theguardian.com/world/rss",
    },
    {
        "name": "Financial Times",
        "rss": "https://www.ft.com/rss/home",
    },
    {
        "name": "Le Monde",
        "rss": "https://www.lemonde.fr/rss/une.xml",
    },
    {
        "name": "Der Spiegel",
        "rss": "https://www.spiegel.de/schlagzeilen/index.rss",
    },
    {
        "name": "NHK World",
        "rss": "https://www3.nhk.or.jp/rss/news/cat0.soirees",
    },
    {
        "name": "Al Jazeera",
        "rss": "https://www.aljazeera.com/xml/rss/all.xml",
    },
]


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
        "note": "AFP excluded — no public RSS feed available",
        "outlets": results,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[scrape] Written to {output_path}")


if __name__ == "__main__":
    main()
