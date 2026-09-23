#!/usr/bin/env python3
"""Normalize all entries to have consistent schema for Supabase."""

import json

# Required fields for Supabase
REQUIRED_FIELDS = [
    'language', 'lemma', 'word', 'word_type', 'translation',
    'level', 'example_sentence', 'example_translation',
    'explanation', 'verified', 'data'
]

with open('batch_regenerated_001_clean.json', 'r') as f:
    entries = json.load(f)

normalized = []

for entry in entries:
    # Create normalized entry with only required fields
    normalized_entry = {}

    for field in REQUIRED_FIELDS:
        if field in entry:
            normalized_entry[field] = entry[field]
        else:
            # Provide sensible defaults
            if field == 'data':
                normalized_entry[field] = {}
            elif field == 'verified':
                normalized_entry[field] = False
            else:
                normalized_entry[field] = None

    normalized.append(normalized_entry)

# Save normalized file
with open('batch_regenerated_001_normalized.json', 'w') as f:
    json.dump(normalized, f, ensure_ascii=False, indent=2)

print(f"✓ Normalized {len(normalized)} entries")
print(f"  All entries now have {len(REQUIRED_FIELDS)} fields: {', '.join(REQUIRED_FIELDS)}")

# Verify all have same structure
field_counts = [len(set(e.keys())) for e in normalized]
if len(set(field_counts)) == 1:
    print(f"✓ All entries have identical schema")
else:
    print(f"✗ Schema mismatch detected: {set(field_counts)}")
