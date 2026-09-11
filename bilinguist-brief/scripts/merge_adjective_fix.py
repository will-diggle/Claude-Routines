"""
merge_adjective_fix.py
=======================
Reads the adjective-fix Workflow's journal (each result is {id, additions}
per adjective), fetches each row's CURRENT `data`, merges the additions in
(never overwrites existing fields), and writes back. A plain .update() would
replace the whole `data` column, wiping the masculine/feminine/comparative/
superlative that was already there — this does a real merge.
"""
import json
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"
JOURNAL = "/Users/willdiggle/.claude/projects/-Users-willdiggle-claude-routines/d1ddac9f-2cde-4df1-9a60-2db0c1e60913/subagents/workflows/wf_10f708d8-c11/journal.jsonl"


def _load_env_file(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(ENV_FILE)
from supabase import create_client
supa = create_client(os.environ["EXPO_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# Collect all {id: additions}, last-wins if an id somehow appears twice
by_id = {}
with open(JOURNAL, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        if d.get("type") != "result":
            continue
        for e in d["result"].get("entries", []):
            if e.get("id") and e.get("additions"):
                by_id[e["id"]] = e["additions"]

print(f"{len(by_id)} adjective rows to merge-update")

ok, skipped, failed = 0, 0, 0
ids = list(by_id.keys())
CHUNK = 200
current_data_by_id = {}
for i in range(0, len(ids), CHUNK):
    chunk = ids[i:i + CHUNK]
    r = supa.table("word_dictionary").select("id,data").in_("id", chunk).execute()
    for row in r.data:
        current_data_by_id[row["id"]] = row.get("data") or {}

for wid, additions in by_id.items():
    if wid not in current_data_by_id:
        print(f"[SKIP] id {wid} not found in DB")
        skipped += 1
        continue
    current = dict(current_data_by_id[wid])
    if "forms" in additions and isinstance(additions["forms"], dict):
        # Swedish shape: merge into the nested forms{} rather than replacing it
        current_forms = dict(current.get("forms") or {})
        current_forms.update(additions["forms"])
        current["forms"] = current_forms
    else:
        current.update(additions)
    try:
        supa.table("word_dictionary").update({"data": current}).eq("id", wid).execute()
        ok += 1
    except Exception as e:
        print(f"[FAIL] id {wid}: {e}")
        failed += 1

print(f"\nDone: {ok} merged, {skipped} skipped, {failed} failed")
