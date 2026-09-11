"""
build_adjective_fix_batches.py
================================
Scopes and batches the retroactive adjective/participle plural-form fix.
Only fr/es/it/pt/sv — German adjectives decline by case (not simple
masculine/feminine/plural like Romance languages) and English adjectives
don't inflect for gender/number at all, so neither has a genuine gap here.

Writes output/adjfix_{lang}.json — batches of {id, lemma, existing_data}
so the enrichment prompt has the current (incomplete) data as context
rather than regenerating from nothing.
"""
import os
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = SCRIPT_DIR.parent / ".env"
LANGUAGES = ["fr", "es", "it", "pt", "sv"]
BATCH_SIZE = 25


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

job_descriptors = []
for lang in LANGUAGES:
    all_adj = []
    start = 0
    while True:
        r = (supa.table("word_dictionary").select("id,lemma,translation,data")
             .eq("word_type", "adjective").eq("language", lang)
             .order("id").range(start, start + 999).execute())
        batch = r.data
        if not batch:
            break
        all_adj.extend(batch)
        if len(batch) < 1000:
            break
        start += 1000

    missing = []
    for r in all_adj:
        data = r.get("data") or {}
        if lang == "sv":
            forms = data.get("forms") if isinstance(data, dict) else None
            if not (isinstance(forms, dict) and len(forms) > 0):
                missing.append(r)
        else:
            if not (isinstance(data, dict) and ("masculine_plural" in data or "feminine_plural" in data)):
                missing.append(r)

    batches = [missing[i:i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]
    with open(SCRIPT_DIR / "output" / f"adjfix_{lang}.json", "w", encoding="utf-8") as f:
        json.dump(batches, f, ensure_ascii=False)
    for idx in range(len(batches)):
        job_descriptors.append({"lang": lang, "idx": idx})
    print(f"{lang}: {len(missing)} adjectives -> {len(batches)} batches")

with open(SCRIPT_DIR / "output" / "adjfix_jobs.json", "w", encoding="utf-8") as f:
    json.dump(job_descriptors, f)
print(f"\nTOTAL: {len(job_descriptors)} batches")
print(json.dumps(job_descriptors))
