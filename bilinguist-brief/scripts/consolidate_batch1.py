#!/usr/bin/env python3
"""Consolidate Batch 1 dictionary entries from all agents."""

import json
import glob
from pathlib import Path

# Manually aggregated counts from agent notifications
entries = {
    'fr': 93,
    'de': 87,
    'es': 62,
    'it': 83,
    'sv': 76
}

all_entries = []

# Load French entries (already confirmed working)
try:
    with open('batch_fr_regenerated_001.json', 'r') as f:
        fr_entries = json.load(f)
        all_entries.extend(fr_entries)
        print(f"✓ French: {len(fr_entries)} entries loaded")
except Exception as e:
    print(f"✗ French: {e}")

# Search for and load other language outputs from scratchpad
scratchpad_base = Path('/private/tmp/claude-501/-Users-willdiggle-claude-routines/dd086d7c-e623-4e45-8359-8320b096f658/scratchpad')

# Try common patterns for output files
candidates = {
    'de': ['german_dictionary.json', 'german_lemmas_201_573.json', 'german_dict_51_200.json'],
    'es': ['spanish_dictionary_complete.json', 'spanish_dictionary_forms_76-200.json'],
    'it': ['italian_dict.json', 'italian_entries.json'],
    'sv': ['swedish_dict_76_200.json', 'swedish_batch1.json']
}

for lang, files in candidates.items():
    found = False
    for fname in files:
        fpath = scratchpad_base / fname
        if fpath.exists():
            try:
                with open(fpath, 'r') as f:
                    content = f.read().strip()
                    if content.startswith('['):
                        lang_entries = json.loads(content)
                        if isinstance(lang_entries, list) and lang_entries:
                            all_entries.extend(lang_entries)
                            print(f"✓ {lang.upper()}: {len(lang_entries)} entries from {fname}")
                            found = True
                            break
            except Exception as e:
                continue

    if not found:
        print(f"⚠ {lang.upper()}: Output file not found")

print(f"\n{'='*60}")
print(f"TOTAL ENTRIES CONSOLIDATED: {len(all_entries)}")
print(f"{'='*60}")

# Save consolidated file
output_file = 'batch_regenerated_001_consolidated.json'
with open(output_file, 'w') as f:
    json.dump(all_entries, f, ensure_ascii=False, indent=2)

print(f"Saved to {output_file}")

# Summary by language
by_lang = {}
for entry in all_entries:
    lang = entry.get('language')
    by_lang[lang] = by_lang.get(lang, 0) + 1

print("\nBreakdown:")
for lang in sorted(by_lang.keys()):
    print(f"  {lang.upper()}: {by_lang[lang]} entries")
