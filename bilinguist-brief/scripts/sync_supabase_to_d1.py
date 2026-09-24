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


def fetch_all_rows(supa, lang, since=None):
    """Fetch word_dictionary rows for a language. `since` (an ISO timestamp)
    restricts to rows touched after that time — via the table's own
    auto-updated `updated_at` trigger, so this catches edits to existing
    lemmas (e.g. a collision merge), not just new inserts. Callers that
    don't pass it get the full table, exactly as before."""
    rows = []
    page_size = 1000
    start = 0
    while True:
        q = (
            supa.table("word_dictionary")
            .select("language,word,lemma,word_type,translation,level,ipa,"
                    "explanation,example_sentence,tip,data,updated_at")
            .eq("language", lang)
        )
        if since:
            q = q.gt("updated_at", since)
        r = (
            q.order("id")
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


# Pre-2026-09-18 batches wrote full case tables under "cases" (nouns) /
# "case_declensions" (adjectives) instead of the "declensions" array the app
# actually reads (entry.meta.declensions in WordPopup.tsx) — build_meta()
# below used to just drop these keys, silently discarding real, already-
# generated data for ~2,750 German words. This converts them into the same
# shape the live pipeline produces, matching WordPopup.tsx's splitDeclTable:
# a table whose keys end in " sg"/" pl" renders as a two-column singular/
# plural view; any other shape renders as a flat list.
_NOUN_CASE_KEYS = [
    ("NOM sg", "nominative_singular"), ("NOM pl", "nominative_plural"),
    ("AKK sg", "accusative_singular"), ("AKK pl", "accusative_plural"),
    ("DAT sg", "dative_singular"),     ("DAT pl", "dative_plural"),
    ("GEN sg", "genitive_singular"),   ("GEN pl", "genitive_plural"),
]

# case_declensions is strong-declension only (no weak/mixed, no plural) —
# label by gender since there's no sg/pl axis to split on.
_ADJ_CASE_KEYS = [
    ("Nominative (m)", "nominative_masculine_strong"), ("Nominative (f)", "nominative_feminine_strong"), ("Nominative (n)", "nominative_neuter_strong"),
    ("Accusative (m)", "accusative_masculine_strong"), ("Accusative (f)", "accusative_feminine_strong"), ("Accusative (n)", "accusative_neuter_strong"),
    ("Dative (m)", "dative_masculine_strong"),         ("Dative (f)", "dative_feminine_strong"),         ("Dative (n)", "dative_neuter_strong"),
    ("Genitive (m)", "genitive_masculine_strong"),     ("Genitive (f)", "genitive_feminine_strong"),     ("Genitive (n)", "genitive_neuter_strong"),
]


def _legacy_cases_to_declensions(data):
    cases = data.get("cases")
    if isinstance(cases, dict) and cases:
        table = {label: cases[key] for label, key in _NOUN_CASE_KEYS if cases.get(key)}
        if table:
            return [{"label": "DEKLINIERT", "table": table}]
    case_declensions = data.get("case_declensions")
    if isinstance(case_declensions, dict) and case_declensions:
        table = {label: case_declensions[key] for label, key in _ADJ_CASE_KEYS if case_declensions.get(key)}
        if table:
            return [{"label": "DEKLINIERT", "table": table}]
    return None


def build_meta(data, tenses_array=None):
    if not isinstance(data, dict):
        data = {}
    # 2026-09-18: populate_word_workflow.js runs the app's own
    # generateWordData() prompt verbatim, which already returns `meta` in
    # exactly the shape the app expects (isRegular/auxiliary/verbClass/
    # isSeparable) — stored under the distinct key "app_meta" (not "meta",
    # to avoid any ambiguity with legacy rows' differently-shaped data) so
    # it can be told apart from the pre-2026-09-18 flat-field rows. Prefer
    # it outright when present; no reconstruction needed.
    app_meta = data.get("app_meta")
    if isinstance(app_meta, dict) and app_meta:
        meta = dict(app_meta)
        if tenses_array:
            meta["tenses"] = tenses_array
        declensions = data.get("declensions") or _legacy_cases_to_declensions(data)
        if declensions:
            meta["declensions"] = declensions
        example_marked = data.get("exampleMarked")
        if isinstance(example_marked, str) and example_marked:
            meta["exampleMarked"] = example_marked
        return meta if meta else None

    meta = {k: v for k, v in data.items() if k not in ("tenses", "cases", "case_declensions")}
    declensions = data.get("declensions") or _legacy_cases_to_declensions(data)
    if declensions:
        meta["declensions"] = declensions
    if tenses_array:
        meta["tenses"] = tenses_array
    return meta if meta else None


def build_forms(word_type, data):
    if not isinstance(data, dict):
        return None
    # Same as build_meta() above — prefer the app-shaped `forms` object
    # (already exactly {gender,plural,article,definite,indefinite} for a
    # noun or {feminine,masculine,comparative,superlative} for an
    # adjective) over reconstructing it from flat legacy fields.
    app_forms = data.get("app_forms")
    if isinstance(app_forms, dict) and app_forms:
        return app_forms
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

    # 2026-09-18: app-shaped `forms` (see build_forms() above) — every
    # string value in it (plural, feminine, comparative, ...) is a real
    # single-token surface form worth its own word_forms row, same as the
    # legacy flat-field extraction below does for older rows.
    app_forms = data.get("app_forms")
    if isinstance(app_forms, dict):
        forms.update(v for v in app_forms.values() if isinstance(v, str))

    if word_type == "verb":
        # Flat fields alongside `tenses` on every verb across all 6 languages
        # (e.g. fr "ajouter": past_participle="ajouté", present_participle=
        # "ajoutant"). The three gendered/number-agreed participle fields
        # (past_participle_feminine/masculine_plural/feminine_plural) were
        # added to the generation schema on 2026-09-11 to cover past
        # participles used as adjectives (e.g. "acceptée", "accueillis") —
        # they were sitting in word_dictionary.data but never reached here,
        # so those surface forms never got a word_forms row even though the
        # data existed. This is why they kept showing as "truly new" through
        # multiple population rounds that day: it was never a generation
        # gap, it was this extraction never picking the fields up.
        for key in (
            "past_participle", "present_participle",
            "past_participle_feminine", "past_participle_masculine_plural",
            "past_participle_feminine_plural",
            "zu_infinitive", "joined_present_form",
        ):
            v = data.get(key)
            if isinstance(v, str):
                forms.add(v)
    elif word_type == "adjective":
        # masculine_plural/feminine_plural were added the same day, for the
        # same reason — see the verb branch's comment above.
        for key in ("feminine", "masculine", "comparative", "superlative",
                    "masculine_plural", "feminine_plural"):
            v = data.get(key)
            if isinstance(v, str):
                forms.add(v)
        nested = data.get("forms")
        if isinstance(nested, dict):
            forms.update(v for v in nested.values() if isinstance(v, str))
        case_declensions = data.get("case_declensions")
        if isinstance(case_declensions, dict):
            forms.update(v for v in case_declensions.values() if isinstance(v, str))
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

    # 2026-09-18: `declensions` (the app's own [{label, table}, ...] shape —
    # German noun/adjective case tables, French/Spanish/Italian/Swedish
    # plural or comparison forms) replaces the old flat `cases`/
    # `case_declensions` fields for newly-generated entries. Pull every
    # table value out as a candidate surface form too, same as the old
    # fields did, so e.g. a German genitive noun form still gets its own
    # word_forms row and is tappable in running text.
    declensions = data.get("declensions")
    if isinstance(declensions, list):
        for block in declensions:
            table = block.get("table") if isinstance(block, dict) else None
            if isinstance(table, dict):
                forms.update(v for v in table.values() if isinstance(v, str))

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

    # 2026-09-18: the population prompt now asks Haiku for `tenses` already
    # shaped as the app's own [{label, table}, ...] array (matching
    # generateWordData()'s buildTensesInstruction verbatim) instead of the
    # old flat {"PRESENT": {...}} dict. Handle both — old rows in Supabase
    # still have the flat dict shape, new rows have the array shape.
    raw_tenses = data.get("tenses")
    if isinstance(raw_tenses, list) and raw_tenses:
        tenses_array = raw_tenses
    elif word_type == "verb" and isinstance(raw_tenses, dict):
        tenses_array = tenses_dict_to_array(raw_tenses)
    else:
        tenses_array = None

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
