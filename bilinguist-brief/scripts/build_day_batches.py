"""
build_day_batches.py
=====================
For a given local brief JSON file (already downloaded from the
/briefings/YYYY-MM-DD archive endpoint), extract unique surface-form words
per language, fetch the current word_dictionary lemmas for that language
from Supabase, and write output/w<tag>_<lang>.json in the same
{"batches": [...], "existingLemmas": [...]} shape used by the Haiku
population workflows.

Usage:
    python3 build_day_batches.py output/brief_0904.json 0904 fr,de,es,it,sv,pt
"""
import json
import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
ENV_FILE = SCRIPT_DIR.parent / ".env"

WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)
BATCH_SIZE = 25


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(ENV_FILE)


def _extract_from_articles(articles, words: set) -> None:
    for article in articles:
        text = f"{article.get('headline', '')} {article.get('body', '')}"
        for m in WORD_RE.finditer(text):
            token = m.group(0).lower()
            if len(token) < 2:
                continue
            words.add(token)


def extract_words_for_lang(bundle: dict, lang: str) -> set:
    """Every unique surface form across the WHOLE brief for this language —
    native journalism AND every CEFR level's simplified rewrite (A1-C1).
    Scanning only nativeJournalism (the original behaviour) misses a large
    share of real vocabulary: simplified levels use different, often more
    basic words (e.g. "veut") that sophisticated native text just doesn't —
    those words then never get flagged as needing population at all."""
    words = set()

    native_lengths = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in native_lengths.values():
        _extract_from_articles(articles, words)

    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            _extract_from_articles(section.get("articles", []), words)

    return words


def fetch_existing_lemmas(supa, lang: str):
    lemmas = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            supa.table("word_dictionary")
            .select("lemma")
            .eq("language", lang)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        lemmas.extend(r["lemma"] for r in rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return sorted(set(lemmas))


def main():
    if len(sys.argv) < 4:
        sys.exit("Usage: build_day_batches.py <brief_json_path> <tag> <lang1,lang2,...>")

    brief_path = Path(sys.argv[1])
    tag = sys.argv[2]
    langs = [l.strip() for l in sys.argv[3].split(",") if l.strip()]

    with open(brief_path, encoding="utf-8") as f:
        bundle = json.load(f)

    date = bundle.get("date", "unknown-date")

    SUPABASE_URL = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("Missing Supabase env vars")

    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    OUTPUT_DIR.mkdir(exist_ok=True)

    for lang in langs:
        surface_forms = sorted(extract_words_for_lang(bundle, lang))
        existing_lemmas = fetch_existing_lemmas(supa, lang)
        existing_set = set(existing_lemmas)

        # Candidate surface forms: skip only forms that are ALREADY an
        # exact-match lemma (cheap prefilter) — real lemma-aware dedup
        # against existingLemmas happens in the Haiku worker per-batch,
        # same as the existing mission workflow.
        candidates = [w for w in surface_forms if w not in existing_set]

        batches = [candidates[i:i + BATCH_SIZE] for i in range(0, len(candidates), BATCH_SIZE)]

        out = {"batches": batches, "existingLemmas": existing_lemmas}
        out_path = OUTPUT_DIR / f"w{tag}_{lang}.json"
        out_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

        print(f"{lang}: {len(surface_forms)} surface forms, {len(candidates)} candidates "
              f"({len(batches)} batches), {len(existing_lemmas)} existing lemmas -> {out_path}")

    print(f"\nBrief date: {date}")


if __name__ == "__main__":
    main()
