"""
sync_supabase_to_d1.py
=======================
Pre-warms the Cloudflare D1 `words` cache (the table the live Worker
actually reads on every word-tap) from the already-populated Supabase
`word_dictionary` table.

D1 keys rows by exact surface form (word, language) — UNIQUE(word, language).
Supabase keys rows by lemma (language, lemma, word_type).

For every Supabase lemma row this writes:
  1. one D1 row for the lemma itself (word == lemma)
  2. for verbs only: one D1 row per distinct conjugated surface form found
     in data.tenses, sharing the lemma's translation/explanation/example/tip
     but carrying the FULL tenses table (this matches live Claude behaviour —
     generateWordData() always returns the complete conjugation table
     regardless of which inflected form was tapped).

Noun/adjective inflected forms (cases, comparatives) are NOT expanded in
this pass — only their base/lemma form is synced. Verbs are the dominant
source of repeat-tap surface forms so this covers the large majority of
future cache hits; noun/adjective expansion can be a fast follow.

Never overwrites an existing D1 row (INSERT OR IGNORE) — rows a real user
has already triggered a live Claude lookup for are left untouched.

Usage:
    python3 sync_supabase_to_d1.py --dry-run          # writes SQL files, no D1 calls
    python3 sync_supabase_to_d1.py                     # writes + executes against remote D1
    python3 sync_supabase_to_d1.py --lang de           # single language
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
WORKER_DIR = SCRIPT_DIR.parent.parent / "bilinguist-worker"
OUT_DIR = SCRIPT_DIR / "output" / "d1_sync"

LANGUAGES = ["fr", "de", "es", "it", "sv", "pt"]
ROWS_PER_INSERT = 20    # rows per multi-row VALUES clause — D1 rejects large statements (SQLITE_TOOBIG)
INSERTS_PER_FILE = 100  # ~2,000 rows per wrangler invocation


def sql_str(v):
    if v is None:
        return "NULL"
    s = str(v).replace("'", "''")
    return f"'{s}'"


def sql_json(obj):
    if not obj:
        return "NULL"
    s = json.dumps(obj, ensure_ascii=False).replace("'", "''")
    return f"'{s}'"


def fetch_all_rows(supa, lang):
    rows = []
    page_size = 1000
    start = 0
    while True:
        r = (
            supa.table("word_dictionary")
            .select("language,word,lemma,word_type,translation,level,ipa,"
                    "explanation,example_sentence,tip,data")
            .eq("language", lang)
            .order("id")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = r.data
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return rows


def build_meta(data, tenses_array=None):
    if not isinstance(data, dict):
        data = {}
    meta = {k: v for k, v in data.items() if k not in ("tenses", "cases")}
    if tenses_array:
        meta["tenses"] = tenses_array
    return meta if meta else None


def build_forms(word_type, data):
    if not isinstance(data, dict):
        return None
    if word_type == "noun":
        cases = data.get("cases") or {}
        sv_forms = data.get("forms") if isinstance(data.get("forms"), dict) else {}
        forms = {
            "gender": data.get("gender"),
            "article": data.get("article_definite"),
            "definite": data.get("article_definite"),
            "indefinite": data.get("article_indefinite"),
            "plural": data.get("plural") or cases.get("nominative_plural") or sv_forms.get("plural_indefinite"),
        }
        return {k: v for k, v in forms.items() if v is not None} or None
    if word_type == "adjective":
        sv_forms = data.get("forms") if isinstance(data.get("forms"), dict) else {}
        forms = {
            "feminine": data.get("feminine"),
            "masculine": data.get("masculine"),
            "comparative": data.get("comparative"),
            "superlative": data.get("superlative"),
            "plural": sv_forms.get("plural_indefinite"),
        }
        return {k: v for k, v in forms.items() if v is not None} or None
    return None


def tenses_dict_to_array(tenses_dict):
    array = []
    for label, table in tenses_dict.items():
        if isinstance(table, dict) and table:
            array.append({"label": label, "table": table})
    return array


def extract_additional_forms(word_type, data):
    """Every other single-token inflected surface form Claude already
    generated for this lemma (plurals, feminine/masculine, comparative/
    superlative, case declensions) — captured across all 6 languages'
    actual field shapes:
      adjective: flat feminine/masculine/comparative/superlative (fr/es/it/
        pt/de), or nested forms{} (sv: singular/plural x definite/indefinite)
      noun: flat plural/singular (fr/es/it/pt), nested cases{} (de: 8 case x
        number combos), or nested forms{} (sv, same shape as sv adjectives)
    """
    forms = set()
    if word_type == "verb":
        # Flat fields alongside `tenses` on every verb across all 6 languages
        # (e.g. fr "ajouter": past_participle="ajouté", present_participle=
        # "ajoutant") — these were already read into `meta` for display but
        # never extracted as their own tappable single-word forms.
        for key in ("past_participle", "present_participle"):
            v = data.get(key)
            if isinstance(v, str):
                forms.add(v)
    elif word_type == "adjective":
        for key in ("feminine", "masculine", "comparative", "superlative"):
            v = data.get(key)
            if isinstance(v, str):
                forms.add(v)
        nested = data.get("forms")
        if isinstance(nested, dict):
            forms.update(v for v in nested.values() if isinstance(v, str))
    elif word_type == "noun":
        for key in ("plural", "singular"):
            v = data.get(key)
            if isinstance(v, str):
                forms.add(v)
        cases = data.get("cases")
        if isinstance(cases, dict):
            forms.update(v for v in cases.values() if isinstance(v, str))
        nested = data.get("forms")
        if isinstance(nested, dict):
            forms.update(v for v in nested.values() if isinstance(v, str))
    return forms


def rows_for_lemma(row):
    """Yield one or more D1 row-dicts for a single Supabase word_dictionary row."""
    lang = row["language"]
    lemma = (row["lemma"] or "").strip().lower()
    word_type = row.get("word_type") or "other"
    data = row.get("data") or {}
    if not isinstance(data, dict):
        data = {}

    translation = row.get("translation")
    explanation = row.get("explanation")
    example = row.get("example_sentence")
    pronunciation = row.get("ipa")
    tip = row.get("tip")
    level = row.get("level")

    tenses_array = None
    if word_type == "verb" and isinstance(data.get("tenses"), dict):
        tenses_array = tenses_dict_to_array(data["tenses"])

    forms = build_forms(word_type, data)
    meta = build_meta(data, tenses_array)

    base = {
        "language": lang,
        "lemma": lemma,
        "word_type": word_type,
        "translation": translation,
        "explanation": explanation,
        "example": example,
        "pronunciation": pronunciation,
        "forms": forms,
        "tip": tip,
        "meta": meta,
        "level": level,
    }

    if not lemma:
        return

    yield {**base, "word": lemma}

    seen = {lemma}
    candidate_forms = []
    if tenses_array:
        for tense in tenses_array:
            candidate_forms.extend(tense["table"].values())
    candidate_forms.extend(extract_additional_forms(word_type, data))

    def is_real_word(w):
        return bool(w) and any(c.isalpha() for c in w)

    for form in candidate_forms:
        if not isinstance(form, str):
            continue
        w = form.strip().lower()
        if not is_real_word(w):
            continue
        if " " in w:
            # Compound/periphrastic tenses ("j'ai affirmé", "wirst haben") and
            # multi-word comparative/superlative phrases ("le plus grand")
            # are more than one token in running text — a tap only ever hits
            # one token. The LAST token is always this lemma's own participle
            # or infinitive (never the leading auxiliary/pronoun/qualifier),
            # so it's safe to extract on its own; the rest of the phrase is
            # someone else's word or not tappable as a unit.
            last = w.rsplit(" ", 1)[-1]
            if is_real_word(last) and last not in seen:
                seen.add(last)
                yield {**base, "word": last}
            continue
        if w in seen:
            continue
        seen.add(w)
        yield {**base, "word": w}


def emit_insert(rows):
    cols = ["word", "language", "lemma", "word_type", "translation",
            "explanation", "example", "pronunciation", "forms", "tip",
            "meta", "level"]
    values_clauses = []
    for r in rows:
        vals = [
            sql_str(r["word"]), sql_str(r["language"]), sql_str(r["lemma"]),
            sql_str(r["word_type"]), sql_str(r["translation"]),
            sql_str(r["explanation"]), sql_str(r["example"]),
            sql_str(r["pronunciation"]), sql_json(r["forms"]),
            sql_str(r["tip"]), sql_json(r["meta"]), sql_str(r["level"]),
        ]
        values_clauses.append(f"({', '.join(vals)})")
    return (
        f"INSERT OR IGNORE INTO words ({', '.join(cols)}) VALUES\n"
        + ",\n".join(values_clauses) + ";"
    )


def write_sql_files(all_rows, lang):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = []
    row_chunks = [all_rows[i:i + ROWS_PER_INSERT] for i in range(0, len(all_rows), ROWS_PER_INSERT)]
    inserts = [emit_insert(chunk) for chunk in row_chunks]
    for i in range(0, len(inserts), INSERTS_PER_FILE):
        file_inserts = inserts[i:i + INSERTS_PER_FILE]
        path = OUT_DIR / f"{lang}_{i // INSERTS_PER_FILE:04d}.sql"
        path.write_text("\n\n".join(file_inserts), encoding="utf-8")
        files.append(path)
    return files


def run_wrangler_file(path):
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "bilinguist-words",
         "--remote", "--file", str(path)],
        cwd=str(WORKER_DIR), capture_output=True, text=True,
    )
    return result.returncode, result.stdout, result.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lang", choices=LANGUAGES)
    args = ap.parse_args()

    from supabase import create_client
    sys.path.insert(0, str(SCRIPT_DIR))
    import dict_writer
    supa = create_client(dict_writer.SUPABASE_URL, dict_writer.SUPABASE_KEY)

    langs = [args.lang] if args.lang else LANGUAGES
    grand_total = 0
    grand_lemma_rows = 0
    grand_form_rows = 0

    for lang in langs:
        supa_rows = fetch_all_rows(supa, lang)
        d1_rows = []
        lemma_count = 0
        form_count = 0
        for row in supa_rows:
            entries = list(rows_for_lemma(row))
            if not entries:
                continue
            lemma_count += 1
            form_count += len(entries) - 1
            d1_rows.extend(entries)

        files = write_sql_files(d1_rows, lang)
        grand_total += len(d1_rows)
        grand_lemma_rows += lemma_count
        grand_form_rows += form_count
        print(f"{lang}: {lemma_count} lemmas -> {len(d1_rows)} D1 rows "
              f"({form_count} conjugated-form rows) across {len(files)} SQL files")

        if not args.dry_run:
            for i, f in enumerate(files):
                rc, out, err = run_wrangler_file(f)
                status = "OK" if rc == 0 else "FAIL"
                print(f"  [{status}] {f.name} ({i+1}/{len(files)})")
                if rc != 0:
                    print(f"    stderr: {err[-800:]}")

    print(f"\nTOTAL: {grand_lemma_rows} lemma rows + {grand_form_rows} conjugated-form rows "
          f"= {grand_total} D1 rows across {len(langs)} language(s)")
    if args.dry_run:
        print(f"Dry run — SQL files written to {OUT_DIR}, nothing sent to D1.")


if __name__ == "__main__":
    main()
