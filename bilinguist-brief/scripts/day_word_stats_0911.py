"""
day_word_stats_0911.py
=======================
Same methodology used for 2026-09-10: total word tokens (raw, incl.
repeats), unique words, words already covered, and truly-new words still
needing population — for 2026-09-11's brief, all languages, all CEFR
levels + native journalism.

"Truly new" = a candidate word (from build_day_batches.py's per-language
output, already excludes exact word_dictionary lemma matches) that ALSO
isn't an inflected form of any already-stored lemma (checked against
word_forms.word, the full expanded reverse-index).
"""
import json
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"
WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)
LANGUAGES = ["fr", "de", "es", "it", "sv", "pt"]


def _load_env_file(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)
from supabase import create_client  # noqa: E402
supa = create_client(os.environ["EXPO_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

with open(SCRIPT_DIR / "output" / "brief_0911.json", encoding="utf-8") as f:
    bundle = json.load(f)


def extract_all_tokens(bundle: dict, lang: str) -> list:
    """Every word TOKEN (repeats included) across native journalism + every
    CEFR level's rewrite — mirrors build_day_batches.py's source coverage."""
    tokens = []

    def scan(articles):
        for article in articles:
            text = f"{article.get('headline', '')} {article.get('body', '')}"
            for m in WORD_RE.finditer(text):
                t = m.group(0).lower()
                if len(t) >= 2:
                    tokens.append(t)

    nj = bundle.get("nativeJournalism", {}).get(lang)
    if isinstance(nj, dict):
        scan(nj.get("articles", []))

    briefings = bundle.get("briefings", {}).get(lang, {})
    for level, by_length in briefings.items():
        if not isinstance(by_length, dict):
            continue
        for length, edition in by_length.items():
            if isinstance(edition, dict):
                scan(edition.get("articles", []))

    return tokens


CHUNK = 150
grand_total = grand_unique = grand_candidates = grand_truly_new = 0

print(f"{'lang':<5} {'total':>7} {'unique':>7} {'candidates':>11} {'truly_new':>10}")
for lang in LANGUAGES:
    tokens = extract_all_tokens(bundle, lang)
    total = len(tokens)
    unique_words = set(tokens)
    unique = len(unique_words)

    with open(SCRIPT_DIR / "output" / f"w0911_{lang}.json", encoding="utf-8") as f:
        data = json.load(f)
    candidates = sorted({w for batch in data["batches"] for w in batch})

    found_in_word_forms = set()
    for i in range(0, len(candidates), CHUNK):
        chunk = candidates[i:i + CHUNK]
        res = supa.table("word_forms").select("word").eq("language", lang).in_("word", chunk).execute()
        found_in_word_forms.update(r["word"] for r in res.data)

    truly_new = [w for w in candidates if w not in found_in_word_forms]

    print(f"{lang:<5} {total:>7} {unique:>7} {len(candidates):>11} {len(truly_new):>10}")

    grand_total += total
    grand_unique += unique
    grand_candidates += len(candidates)
    grand_truly_new += len(truly_new)

    with open(SCRIPT_DIR / "output" / f"truly_new_0911_{lang}.json", "w", encoding="utf-8") as f:
        json.dump(truly_new, f, ensure_ascii=False, indent=2)

print(f"\n{'TOTAL':<5} {grand_total:>7} {grand_unique:>7} {grand_candidates:>11} {grand_truly_new:>10}")
print(f"\nTotal words written today (all languages, incl. repeats): {grand_total}")
print(f"Unique words: {grand_unique}")
print(f"Already populated (unique minus truly-new): {grand_unique - grand_truly_new}")
print(f"Truly new words needing population: {grand_truly_new}")
