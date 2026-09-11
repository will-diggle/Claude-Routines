"""
daily_extract.py
=================
The deterministic (non-agent) half of the daily population pipeline:
fetch today's brief bundle, extract per-language candidate words (reusing
build_day_batches.py's already-correct extraction — native journalism is
{length: [articles]}, NOT {articles: [...]} — a bug fixed once already this
project, see the comment on extract_words_for_lang), filter to truly-new
words against word_forms, split truly-new into "proper nouns / loanwords"
(capitalized mid-sentence in the original text) vs "genuine vocabulary",
and write everything the Workflow half needs to disk.

German is excluded from the proper-noun heuristic: German capitalizes
EVERY noun, not just proper nouns, so "capitalized mid-sentence" would
flag hundreds of ordinary words as names. German proper nouns instead flow
through the normal population pass like any other truly-new word.

Usage:
    python3 daily_extract.py                  # today, all 6 languages
    python3 daily_extract.py --tag 0911        # explicit date tag (testing)
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
ENV_FILE = SCRIPT_DIR.parent / ".env"
LANGUAGES = ["fr", "de", "es", "it", "sv", "pt"]
PROPER_NOUN_HEURISTIC_LANGUAGES = ["fr", "es", "it", "sv", "pt"]  # no 'de'
WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)
SENT_SPLIT = re.compile(r"(?<=[.!?»])\s+")
CHUNK = 150
BATCH_SIZE = 25


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)


def fetch_today_bundle(tag: str) -> dict:
    out_path = OUTPUT_DIR / f"brief_{tag}.json"
    if out_path.exists():
        # Reuse the already-saved bundle for this tag — re-fetching "latest"
        # would silently pull a NEWER day's brief if real time has moved on
        # since this tag's population run started (e.g. resuming a stopped
        # run the next morning), corrupting the word/candidate lists.
        print(f"Reusing saved bundle for tag={tag} ({out_path})")
        with open(out_path, encoding="utf-8") as f:
            return json.load(f)
    data_url = os.environ["EXPO_PUBLIC_DATA_URL"].rstrip("/")
    url = f"{data_url}/latest"
    with urllib.request.urlopen(url, timeout=30) as resp:
        bundle = json.loads(resp.read().decode("utf-8"))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False)
    return bundle


def extract_words_for_lang(bundle: dict, lang: str) -> set:
    """Every unique surface form across the WHOLE brief for this language —
    native journalism AND every CEFR level's simplified rewrite. Native
    journalism is bundle["nativeJournalism"][lang] = {"short": [...], "longer": [...]}
    — a dict of length -> article list DIRECTLY, not {"articles": [...]}.
    Getting this wrong silently drops 100+ native-journalism articles
    (confirmed the hard way — see 2026-09-11 session notes)."""
    words = set()

    def scan(articles):
        for article in articles:
            text = f"{article.get('headline', '')} {article.get('body', '')}"
            for m in WORD_RE.finditer(text):
                token = m.group(0).lower()
                if len(token) >= 2:
                    words.add(token)

    native_lengths = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in native_lengths.values():
        scan(articles)

    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            scan(section.get("articles", []))

    return words


def count_all_tokens(bundle: dict, lang: str) -> int:
    """Raw token count INCLUDING repeats — for the total-words-written stat,
    cross-checked against the pipeline's own ntfy notification total."""
    total = 0

    def count(articles):
        nonlocal total
        for article in articles:
            text = f"{article.get('headline', '')} {article.get('body', '')}"
            total += sum(1 for m in WORD_RE.finditer(text) if len(m.group(0)) >= 2)

    native_lengths = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in native_lengths.values():
        count(articles)

    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            count(section.get("articles", []))

    return total


def collect_all_text(bundle: dict, lang: str) -> list:
    texts = []
    native_lengths = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in native_lengths.values():
        for a in articles:
            texts.append(f"{a.get('headline','')} {a.get('body','')}")
    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            for a in section.get("articles", []):
                texts.append(f"{a.get('headline','')} {a.get('body','')}")
    return texts


def capitalized_midsentence_words(text: str) -> set:
    found = set()
    for sentence in SENT_SPLIT.split(text):
        words_with_pos = list(WORD_RE.finditer(sentence))
        for i, m in enumerate(words_with_pos):
            w = m.group(0)
            if i == 0:
                continue
            if w[0].isupper() and len(w) >= 2:
                found.add(w.lower())
    return found


def fetch_existing_lemmas(supa, lang: str) -> set:
    lemmas = set()
    start, page = 0, 1000
    while True:
        r = supa.table("word_dictionary").select("lemma").eq("language", lang).order("id").range(start, start + page - 1).execute()
        batch = r.data
        if not batch:
            break
        lemmas.update(row["lemma"].lower() for row in batch if row.get("lemma"))
        if len(batch) < page:
            break
        start += page
    return lemmas


def fetch_word_forms(supa, lang: str, words: list) -> set:
    found = set()
    words = list(words)
    for i in range(0, len(words), CHUNK):
        chunk = words[i:i + CHUNK]
        r = supa.table("word_forms").select("word").eq("language", lang).in_("word", chunk).execute()
        found.update(row["word"] for row in r.data)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default=None, help="Date tag, e.g. 0911. Defaults to today (UTC).")
    args = ap.parse_args()

    tag = args.tag or datetime.now(timezone.utc).strftime("%m%d")
    print(f"=== Daily extraction for tag={tag} ===")

    from supabase import create_client
    supa = create_client(os.environ["EXPO_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    print("Fetching today's brief bundle...")
    bundle = fetch_today_bundle(tag)
    print(f"Bundle date: {bundle.get('date')}")

    summary = {}
    all_job_descriptors = []
    pn_job_descriptors = []

    for lang in LANGUAGES:
        total_tokens = count_all_tokens(bundle, lang)
        unique_words = extract_words_for_lang(bundle, lang)

        existing_lemmas = fetch_existing_lemmas(supa, lang)
        candidates = sorted(w for w in unique_words if w not in existing_lemmas)

        found_in_word_forms = fetch_word_forms(supa, lang, candidates)
        truly_new = sorted(w for w in candidates if w not in found_in_word_forms)

        # Split truly-new into proper-noun-heuristic hits vs genuine vocabulary
        if lang in PROPER_NOUN_HEURISTIC_LANGUAGES:
            capitalized = set()
            for text in collect_all_text(bundle, lang):
                capitalized |= capitalized_midsentence_words(text)
            proper_nouns = sorted(set(truly_new) & capitalized)
            genuine = sorted(set(truly_new) - capitalized)
        else:
            proper_nouns = []
            genuine = truly_new

        summary[lang] = {
            "total_tokens": total_tokens,
            "unique_words": len(unique_words),
            "candidates": len(candidates),
            "truly_new": len(truly_new),
            "proper_nouns": len(proper_nouns),
            "genuine_vocab": len(genuine),
        }

        # Write batch files + job descriptors for the two Workflow passes
        genuine_batches = [genuine[i:i + BATCH_SIZE] for i in range(0, len(genuine), BATCH_SIZE)]
        with open(OUTPUT_DIR / f"final{tag}_{lang}.json", "w", encoding="utf-8") as f:
            json.dump(genuine_batches, f, ensure_ascii=False)
        for idx in range(len(genuine_batches)):
            all_job_descriptors.append({"lang": lang, "idx": idx})

        pn_batches = [proper_nouns[i:i + BATCH_SIZE] for i in range(0, len(proper_nouns), BATCH_SIZE)]
        with open(OUTPUT_DIR / f"final_pn_{tag}_{lang}.json", "w", encoding="utf-8") as f:
            json.dump(pn_batches, f, ensure_ascii=False)
        for idx in range(len(pn_batches)):
            pn_job_descriptors.append({"lang": lang, "idx": idx})

        print(f"{lang}: {total_tokens} tokens, {len(unique_words)} unique, "
              f"{len(truly_new)} truly-new ({len(genuine)} vocab / {len(proper_nouns)} proper nouns)")

    grand_total = sum(s["total_tokens"] for s in summary.values())
    grand_unique = sum(s["unique_words"] for s in summary.values())
    grand_truly_new = sum(s["truly_new"] for s in summary.values())
    grand_genuine = sum(s["genuine_vocab"] for s in summary.values())
    grand_pn = sum(s["proper_nouns"] for s in summary.values())

    print(f"\nTOTAL (6 languages, excl. English): {grand_total} words written, "
          f"{grand_unique} unique, {grand_truly_new} truly-new "
          f"({grand_genuine} vocab / {grand_pn} proper nouns)")
    print("(Cross-check this total-words-written figure against today's ntfy notification —")
    print(" this now includes native journalism correctly, so it should match closely.)")

    with open(OUTPUT_DIR / f"jobs_{tag}.json", "w", encoding="utf-8") as f:
        json.dump(all_job_descriptors, f)
    with open(OUTPUT_DIR / f"pn_jobs_{tag}.json", "w", encoding="utf-8") as f:
        json.dump(pn_job_descriptors, f)
    with open(OUTPUT_DIR / f"summary_{tag}.json", "w", encoding="utf-8") as f:
        json.dump({"tag": tag, "date": bundle.get("date"), "per_language": summary,
                    "grand_total_tokens": grand_total, "grand_unique": grand_unique,
                    "grand_truly_new": grand_truly_new, "grand_genuine": grand_genuine,
                    "grand_proper_nouns": grand_pn}, f, indent=2)

    print(f"\nWrote {len(all_job_descriptors)} genuine-vocab job descriptors -> output/jobs_{tag}.json")
    print(f"Wrote {len(pn_job_descriptors)} proper-noun job descriptors -> output/pn_jobs_{tag}.json")


if __name__ == "__main__":
    main()
