#!/usr/bin/env python3
"""
warm_db.py — pre-populate the word database from today's brief.

Fetches /latest, extracts every unique word per language, then hits
GET /word for each one. The worker auto-generates missing entries via
Claude Haiku and writes them to D1, so subsequent user taps are instant.

Usage: python3 scripts/warm_db.py
"""

import re
import sys
import time
import json
import urllib.request
import urllib.error
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

WORKER_URL = "https://bilinguist-brief.williamdiggz.workers.dev"
NTFY_URL   = "https://ntfy.sh/bilinguist-brief-db"  # change topic if needed
CONCURRENCY = 6       # parallel requests to the worker
MIN_WORD_LEN = 3      # skip very short tokens (der, du, en, …)
REQUEST_TIMEOUT = 20  # seconds per word lookup

# Languages without a word database — excluded from new-word counts
NO_DB_LANGS = {"tr", "ar", "hu"}

LANG_NAMES = {
    "de": "German", "fr": "French", "es": "Spanish",
    "it": "Italian", "sv": "Swedish", "nl": "Dutch",
    "pt": "Portuguese", "pl": "Polish", "ru": "Russian",
    "ja": "Japanese", "zh": "Chinese", "ko": "Korean",
}

LANG_FLAGS = {
    "de": "🇩🇪", "fr": "🇫🇷", "es": "🇪🇸", "it": "🇮🇹",
    "sv": "🇸🇪", "nl": "🇳🇱", "pt": "🇵🇹", "pl": "🇵🇱",
    "ru": "🇷🇺", "ja": "🇯🇵", "zh": "🇨🇳", "ko": "🇰🇷",
}


def fetch_brief():
    req = urllib.request.Request(
        f"{WORKER_URL}/latest",
        headers={"User-Agent": "warm_db/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def tokenise(text: str):
    """Split body text into lowercase word tokens."""
    raw = re.split(r"[\s ]+", text)
    tokens = set()
    for tok in raw:
        tok = re.sub(r"^[^\w]+|[^\w]+$", "", tok, flags=re.UNICODE)
        parts = tok.split("-")
        for part in parts:
            part = part.lower()
            if (
                len(part) >= MIN_WORD_LEN
                and not part.isdigit()
                and re.search(r"[a-zA-ZÀ-ÿ]", part)
            ):
                tokens.add(part)
    return tokens


def extract_words(brief: dict):
    """
    Returns list of (word, lang, level) tuples — one entry per unique
    (word, lang) pair, using the highest level where the word appeared.
    """
    LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1"]
    seen: dict[tuple, str] = {}

    briefings = brief.get("briefings", {})
    for lang, levels in briefings.items():
        if lang in NO_DB_LANGS:
            continue  # skip languages with no word database
        for level, lengths in levels.items():
            for length, section in lengths.items():
                articles = section.get("articles", [])
                for article in articles:
                    body = article.get("body", "")
                    headline = article.get("headline", "")
                    for word in tokenise(body + " " + headline):
                        key = (word, lang)
                        current = seen.get(key)
                        if current is None:
                            seen[key] = level
                        else:
                            if LEVEL_ORDER.index(level) > LEVEL_ORDER.index(current):
                                seen[key] = level

    return [(word, lang, level) for (word, lang), level in seen.items()]


def lookup_word(word: str, lang: str, level: str):
    """Call the worker /word endpoint. Returns (word, lang, status_str)."""
    url = (
        f"{WORKER_URL}/word"
        f"?w={urllib.parse.quote(word)}"
        f"&lang={lang}"
        f"&level={level}"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "warm_db/1.0"})
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
            cached = data.get("fromCache", False)
            return (word, lang, "cached" if cached else "generated")
    except urllib.error.HTTPError as e:
        return (word, lang, f"http_{e.code}")
    except Exception as e:
        return (word, lang, f"error:{type(e).__name__}")


def send_ntfy(title: str, body: str):
    """Fire a push notification via ntfy.sh."""
    try:
        data = json.dumps({"topic": NTFY_URL.split("/")[-1], "title": title, "message": body}).encode()
        req = urllib.request.Request(
            NTFY_URL,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"  ! ntfy send failed: {e}", file=sys.stderr)


def main():
    print("→ Fetching brief…")
    t0 = time.time()
    brief = fetch_brief()
    date = brief.get("date", "unknown")
    print(f"  Brief date: {date}")

    print("→ Extracting word tokens…")
    words = extract_words(brief)
    print(f"  {len(words)} unique (word, lang) pairs to warm")

    by_lang: dict[str, int] = {}
    for _, lang, _ in words:
        by_lang[lang] = by_lang.get(lang, 0) + 1
    for lang, count in sorted(by_lang.items()):
        print(f"    {lang}: {count} words")

    print(f"\n→ Warming DB with concurrency={CONCURRENCY}…")
    counts = {"cached": 0, "generated": 0, "error": 0}
    # Per-language new word counts (only languages with a DB)
    new_by_lang: dict[str, int] = {}
    done = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {
            pool.submit(lookup_word, word, lang, level): (word, lang)
            for word, lang, level in words
        }
        for fut in as_completed(futures):
            word, lang, status = fut.result()
            done += 1
            if status == "cached":
                counts["cached"] += 1
            elif status == "generated":
                counts["generated"] += 1
                new_by_lang[lang] = new_by_lang.get(lang, 0) + 1
                print(f"  + generated  [{lang}] {word}")
            else:
                counts["error"] += 1
                print(f"  ! {status}  [{lang}] {word}", file=sys.stderr)

            if done % 50 == 0:
                elapsed = time.time() - t0
                print(f"  {done}/{len(words)} done ({elapsed:.0f}s elapsed)")

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed:.1f}s")
    print(f"  cached={counts['cached']}  generated={counts['generated']}  errors={counts['error']}")

    # ── Build and send NTFY notification ──────────────────────────────────────
    total_new = counts["generated"]

    if total_new == 0:
        body_lines = ["All words already cached — nothing new to generate."]
    else:
        body_lines = []
        for lang in sorted(new_by_lang, key=lambda l: -new_by_lang[l]):
            flag = LANG_FLAGS.get(lang, "")
            name = LANG_NAMES.get(lang, lang.upper())
            body_lines.append(f"{flag} {name}: {new_by_lang[lang]} new")

    body_lines.append("")
    body_lines.append(
        f"Total: {total_new} new · {counts['cached']} cached"
        + (f" · {counts['error']} errors" if counts["error"] else "")
        + f" · {elapsed:.0f}s"
    )

    title = f"Bilinguist DB warmed — {date}"
    body  = "\n".join(body_lines)

    print(f"\n→ Sending ntfy notification…")
    print(f"  {title}")
    print(f"  {body}")
    send_ntfy(title, body)
    print("  ✓ sent")


if __name__ == "__main__":
    main()
