"""
update_separable_verbs.py
=========================
Reads separable_de.json (the Fable-generated lookup table) and updates
every matching German verb in the Supabase word_dictionary table to set:
  data->is_separable = true
  data->separable_prefix = "<prefix>"
  data->verb_root = "<base verb>"

Also reports how many verbs are in the lookup but not yet in the dictionary
(useful for planning a future Haiku population pass).

Usage:
    python update_separable_verbs.py [--dry-run]
"""

import json
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

# Load .env from parent directory if not already set
import os as _os
_env_path = SCRIPT_DIR.parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            if _k.strip() not in _os.environ:
                _os.environ[_k.strip()] = _v.strip()

SUPABASE_URL = _os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = _os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

LOOKUP_PATH = SCRIPT_DIR / "separable_de.json"   # {infinitive: prefix}

DRY_RUN = "--dry-run" in sys.argv


def main():
    # ── Load lookup table ─────────────────────────────────────────────────────
    with open(LOOKUP_PATH, encoding="utf-8") as f:
        lookup: dict[str, str] = json.load(f)  # {infinitive: prefix}

    print(f"[sep] Loaded {len(lookup):,} separable verbs from lookup table")

    # Derive base verb: strip prefix from front of infinitive
    def base_of(infinitive: str, prefix: str) -> str:
        return infinitive[len(prefix):]

    # ── Connect to Supabase ───────────────────────────────────────────────────
    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Fetch all German verbs (paginated) ────────────────────────────────────
    print("[sep] Fetching German verbs from word_dictionary...")
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        resp = (
            supa.from_("word_dictionary")
            .select("id, lemma, data")
            .eq("language", "de")
            .eq("word_type", "verb")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"[sep] Found {len(all_rows):,} German verbs in DB")

    # ── Match and update ──────────────────────────────────────────────────────
    updated       = 0
    already_set   = 0
    not_separable = 0
    missing       = []  # in lookup but not in DB

    # Build a set of DB lemmas for the "missing" report
    db_lemmas = {row["lemma"].lower() for row in all_rows if row.get("lemma")}

    for row in all_rows:
        lemma = (row.get("lemma") or "").lower().strip()
        if not lemma or lemma not in lookup:
            not_separable += 1
            continue

        prefix = lookup[lemma]
        base   = base_of(lemma, prefix)

        existing_data = row.get("data") or {}

        # Skip if already correctly set (idempotent)
        if existing_data.get("is_separable") and existing_data.get("separable_prefix") == prefix:
            already_set += 1
            continue

        new_data = {
            **existing_data,
            "is_separable":     True,
            "separable_prefix": prefix,
            "verb_root":        base,
        }

        if not DRY_RUN:
            supa.from_("word_dictionary").update({"data": new_data}).eq("id", row["id"]).execute()

        updated += 1
        if updated % 50 == 0:
            print(f"[sep] {'[DRY] ' if DRY_RUN else ''}Updated {updated} so far...")
        if not DRY_RUN and updated % 100 == 0:
            time.sleep(0.2)  # avoid hammering the API

    # ── Find verbs in lookup but absent from DB ───────────────────────────────
    for inf in sorted(lookup.keys()):
        if inf not in db_lemmas:
            missing.append(inf)

    # ── Report ────────────────────────────────────────────────────────────────
    print(f"\n[sep] {'DRY RUN — ' if DRY_RUN else ''}Done.")
    print(f"  Updated:          {updated:>6,}")
    print(f"  Already correct:  {already_set:>6,}")
    print(f"  Not in lookup:    {not_separable:>6,}")
    print(f"  Missing from DB:  {len(missing):>6,}  (verbs to add in a future pass)")

    if missing:
        missing_path = SCRIPT_DIR / "separable_de_missing.json"
        with open(missing_path, "w", encoding="utf-8") as f:
            json.dump(missing, f, ensure_ascii=False, indent=2)
        print(f"  → Missing list written to {missing_path.name}")


if __name__ == "__main__":
    main()
