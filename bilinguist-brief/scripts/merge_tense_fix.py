"""
merge_tense_fix.py
===================
Reads the verb-tense-fix Workflow's journal (each result is {id, additions:
{tenses: {...}}} per verb), fetches each row's CURRENT `data`, merges the
new tense table(s) into the existing `data.tenses` dict (never touching
already-present tenses or other data fields), and writes back.
"""
import json
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"
JOURNAL = "/Users/willdiggle/.claude/projects/-Users-willdiggle-claude-routines/d1ddac9f-2cde-4df1-9a60-2db0c1e60913/subagents/workflows/wf_760b49b6-ce5/journal.jsonl"


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

by_id = {}
with open(JOURNAL, encoding="utf-8") as f:
    for line in f:
        d = json.loads(line)
        if d.get("type") != "result":
            continue
        for e in d["result"].get("entries", []):
            if e.get("id") and e.get("additions", {}).get("tenses"):
                by_id[e["id"]] = e["additions"]["tenses"]

print(f"{len(by_id)} verb rows to merge-update")

ids = list(by_id.keys())
current_data_by_id = {}
CHUNK = 200
for i in range(0, len(ids), CHUNK):
    chunk = ids[i:i + CHUNK]
    r = supa.table("word_dictionary").select("id,data").in_("id", chunk).execute()
    for row in r.data:
        current_data_by_id[row["id"]] = row.get("data") or {}

ok, skipped, failed = 0, 0, 0
for wid, new_tenses in by_id.items():
    if wid not in current_data_by_id:
        print(f"[SKIP] id {wid} not found in DB")
        skipped += 1
        continue
    current = dict(current_data_by_id[wid])
    current_tenses = dict(current.get("tenses") or {})
    current_tenses.update(new_tenses)
    current["tenses"] = current_tenses
    try:
        supa.table("word_dictionary").update({"data": current}).eq("id", wid).execute()
        ok += 1
    except Exception as e:
        print(f"[FAIL] id {wid}: {e}")
        failed += 1

print(f"\nDone: {ok} merged, {skipped} skipped, {failed} failed")
