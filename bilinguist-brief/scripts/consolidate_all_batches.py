#!/usr/bin/env python3
"""Consolidate all batch outputs and prepare for loading."""

import json
import glob
from pathlib import Path

scratchpad = Path('/private/tmp/claude-501/-Users-willdiggle-claude-routines/dd086d7c-e623-4e45-8359-8320b096f658/scratchpad')

all_entries = []
batch_counts = {}

# Load Batch 1 (already in scripts dir)
try:
    with open('batch_regenerated_001_final.json', 'r') as f:
        batch1 = json.load(f)
        all_entries.extend(batch1)
        batch_counts['batch1'] = len(batch1)
        print(f"✓ Batch 1: {len(batch1)} entries")
except Exception as e:
    print(f"✗ Batch 1: {e}")

# Search for and load Batch 2-4 outputs from scratchpad
# Agents typically create files with patterns like:
# - french_dictionary.json, german_dictionary.json, etc.
# - language_dict.json, language_dictionary.json
# - batch outputs with language codes

patterns = {
    'batch2_batch3_batch4': [
        '*.json'  # Catch all JSON files
    ]
}

found_files = set()
for pattern in glob.glob(str(scratchpad / '*.json')):
    fname = Path(pattern).name
    try:
        with open(pattern, 'r') as f:
            content = f.read().strip()
            if content.startswith('['):
                data = json.loads(content)
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    if all(k in data[0] for k in ['language', 'lemma', 'word']):
                        # This looks like a valid dictionary entry file
                        # Filter out entries already in batch1 to avoid dupes
                        batch1_keys = {(e['language'], e['lemma'], e.get('word_type', 'other')) for e in all_entries}
                        new_entries = [e for e in data if (e['language'], e['lemma'], e.get('word_type', 'other')) not in batch1_keys]

                        if new_entries:
                            all_entries.extend(new_entries)
                            found_files.add(fname)
                            print(f"✓ {fname}: {len(new_entries)} new entries (from {len(data)} total)")
    except:
        pass

print(f"\n{'='*60}")
print(f"TOTAL ENTRIES CONSOLIDATED: {len(all_entries)}")
print(f"{'='*60}")

# Normalize schema before saving
REQUIRED_FIELDS = ['language', 'lemma', 'word', 'word_type', 'translation',
                   'level', 'example_sentence', 'example_translation',
                   'explanation', 'data']

normalized = []
for entry in all_entries:
    norm_entry = {}
    for field in REQUIRED_FIELDS:
        if field in entry:
            norm_entry[field] = entry[field]
        else:
            if field == 'data':
                norm_entry[field] = {}
            elif field == 'word':
                norm_entry[field] = entry.get('lemma', 'unknown')
            else:
                norm_entry[field] = None
    normalized.append(norm_entry)

# Save consolidated file
with open('batch_consolidated_all.json', 'w') as f:
    json.dump(normalized, f, ensure_ascii=False, indent=2)

print(f"\nConsolidated entries saved to: batch_consolidated_all.json")

# Summary by language
by_lang = {}
for entry in normalized:
    lang = entry.get('language')
    if lang:
        by_lang[lang] = by_lang.get(lang, 0) + 1

print("\nBreakdown by language:")
for lang in sorted(by_lang.keys()):
    print(f"  {lang.upper()}: {by_lang[lang]} entries")
