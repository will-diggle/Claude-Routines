"""
fix_flat_tenses.py
===================
Re-nests verb conjugation tables that were stored as flat top-level keys on
`data` (e.g. data.PRÉSENT.je) instead of under data.tenses (e.g.
data.tenses.PRÉSENT.je), which is the shape src/services/dictionaryService.ts
actually reads. Pure JSON restructuring — no LLM calls.

A top-level key in `data` is treated as a conjugation table (and moved under
"tenses") if its value is a non-empty dict whose values are all plain
strings. Scalar fields (is_regular, auxiliary, is_reflexive, past_participle,
present_participle, conjugation_group, verb_group, imperative, supine, etc.)
are left exactly where they are.

Usage:
    python3 fix_flat_tenses.py            # apply the fix
    python3 fix_flat_tenses.py --dry-run   # report only, no writes
"""
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"


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

SUPABASE_URL = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit(f"Missing Supabase env vars — check {ENV_FILE}")

LANGS = ["fr", "de", "sv", "it", "es", "pt", "tr", "hu", "ar"]


def is_conjugation_table(value) -> bool:
    return isinstance(value, dict) and len(value) > 0 and all(isinstance(v, str) for v in value.values())


def refold(data: dict):
    """Return (new_data, moved_keys) or (None, []) if no change needed."""
    if not isinstance(data, dict):
        return None, []

    existing_tenses = data.get("tenses")
    if isinstance(existing_tenses, dict) and existing_tenses:
        # Already nested — nothing to do (assume clean).
        return None, []

    moved = {}
    rest = {}
    for k, v in data.items():
        if k == "tenses":
            continue  # empty/invalid tenses key, drop it, will be rebuilt
        if is_conjugation_table(v):
            moved[k] = v
        else:
            rest[k] = v

    if not moved:
        return None, []

    new_data = dict(rest)
    new_data["tenses"] = moved
    return new_data, list(moved.keys())


def main():
    dry_run = "--dry-run" in sys.argv

    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    total_checked = 0
    total_fixed = 0
    per_lang = {}

    for lang in LANGS:
        rows = []
        offset = 0
        page = 1000
        while True:
            resp = (
                supa.table("word_dictionary")
                .select("id,lemma,data")
                .eq("language", lang)
                .eq("word_type", "verb")
                .order("id")
                .range(offset, offset + page - 1)
                .execute()
            )
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < page:
                break
            offset += page

        fixed_count = 0
        for row in rows:
            total_checked += 1
            new_data, moved_keys = refold(row.get("data"))
            if new_data is None:
                continue
            fixed_count += 1
            total_fixed += 1
            if dry_run:
                print(f"[DRY] {lang}/{row['lemma']}: would nest {moved_keys}")
            else:
                supa.table("word_dictionary").update({"data": new_data}).eq("id", row["id"]).execute()
                print(f"[OK] {lang}/{row['lemma']}: nested {moved_keys}")

        per_lang[lang] = fixed_count
        print(f"--- {lang}: {fixed_count}/{len(rows)} verb rows fixed ---")

    print()
    print("=" * 50)
    print(f"{'DRY RUN — ' if dry_run else ''}Total verb rows checked: {total_checked}")
    print(f"{'Would fix' if dry_run else 'Fixed'}: {total_fixed}")
    for lang, c in per_lang.items():
        if c:
            print(f"  {lang}: {c}")


if __name__ == "__main__":
    main()
