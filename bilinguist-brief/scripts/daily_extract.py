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
# Source text mixes straight (') and curly (’) apostrophes inconsistently
# (e.g. "qu’il s’abstiendrait" uses curly) — matching only straight left
# curly-apostrophe elisions like "s’abstiendrait" truncated to a bare, never-
# coverable stem ("abstiendrait", dropping the reflexive "s’"). Both are
# accepted here so a word's real, complete surface form is what gets checked
# and populated, not an artifact of which apostrophe character the source
# happened to use.
WORD_RE = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)?", re.UNICODE)
SENT_SPLIT = re.compile(r"(?<=[.!?»])\s+")
# Known, still-unfixed upstream bug: some accented characters in published
# article text get replaced by a literal newline+"H"+newline sequence (e.g.
# "arrivé" -> "arriv" + "\nH\n"). Any WORD_RE token touching this sequence is
# a truncated fragment of the real word, not a genuinely missing word — see
# 2026-09-11 session notes. Populating dictionary entries for these fragments
# is nonsensical, so they're excluded from candidates entirely rather than
# treated as truly-new vocabulary.
CORRUPTION_RE = re.compile(r"\nH\n")
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
    corrupted = set()

    def scan(articles):
        for article in articles:
            text = f"{article.get('headline', '')} {article.get('body', '')}"
            corruption_spans = [m.span() for m in CORRUPTION_RE.finditer(text)]
            for m in WORD_RE.finditer(text):
                token = m.group(0).lower()
                if len(token) < 2:
                    continue
                if corruption_spans:
                    ws, we = m.span()
                    if any(we == cs or ws == ce for cs, ce in corruption_spans):
                        corrupted.add(token)
                        continue
                words.add(token)

    native_lengths = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in native_lengths.values():
        scan(articles)

    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            scan(section.get("articles", []))

    if corrupted:
        # A token seen ONLY as a corruption-adjacent fragment is dropped; one
        # also seen cleanly elsewhere in the brief is kept (real evidence it's
        # a genuine word). No silent loss — logged so the gap stays visible.
        still_bad = corrupted - words
        if still_bad:
            words -= still_bad
            print(f"  [{lang}] dropped {len(still_bad)} corrupted-text fragment(s): {sorted(still_bad)}")
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


def normalize_apostrophe(word: str) -> str:
    """Generated/stored forms always use a straight apostrophe; source brief
    text mixes straight and curly inconsistently. Comparing on the same
    normalized form avoids treating "s'abstiendrait" (generated) and
    "s’abstiendrait" (extracted from text) as two different words."""
    return word.replace("’", "'")


def fetch_word_forms(supa, lang: str, words: list) -> set:
    """Returns the subset of `words` that are covered — checked via the
    apostrophe-normalized form, but each returned value is the ORIGINAL
    (possibly curly-apostrophe) input word, so callers can still filter
    their own original candidate list by membership."""
    normalized_to_original = {}
    for w in words:
        normalized_to_original.setdefault(normalize_apostrophe(w), []).append(w)
    normalized_words = list(normalized_to_original.keys())

    found_normalized = set()
    for i in range(0, len(normalized_words), CHUNK):
        chunk = normalized_words[i:i + CHUNK]
        r = supa.table("word_forms").select("word").eq("language", lang).in_("word", chunk).execute()
        found_normalized.update(row["word"] for row in r.data)

    found = set()
    for norm in found_normalized:
        found.update(normalized_to_original.get(norm, []))
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
        truly_new_raw = sorted(w for w in candidates if w not in found_in_word_forms)

        # Elided-contraction false positives: "d'achat", "l'administration",
        # "qu'il" etc. are ONE token to this regex-based extraction, but the
        # app's real (spaCy-based) tokenizer splits them into the elision
        # prefix (de/le-la/que/...) and the content word, and looks up the
        # content word alone. So a word like "d'achat" isn't really missing
        # if "achat" itself is already covered — checking that content word
        # is what a real tap in the app actually resolves against. Only
        # applies when the SUFFIX after the apostrophe is itself a real
        # multi-letter word (not another elision, not empty).
        elision_suffix_covered = set()
        candidates_with_apostrophe = [w for w in truly_new_raw if ("'" in w or "’" in w)]
        if candidates_with_apostrophe:
            suffixes = {}
            for w in candidates_with_apostrophe:
                suffix = re.split(r"['’]", w)[-1]
                if len(suffix) >= 2:
                    suffixes[w] = suffix
            suffix_found = fetch_word_forms(supa, lang, sorted(set(suffixes.values())))
            elision_suffix_covered = {w for w, suf in suffixes.items() if suf in suffix_found}

        truly_new = sorted(w for w in truly_new_raw if w not in elision_suffix_covered)

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
