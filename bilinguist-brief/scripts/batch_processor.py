#!/usr/bin/env python3.9
"""
Efficient batch processor for remaining dictionary forms.
Uses direct API calls (not agents) to process 1,450 remaining forms.
Generates minimal JSON, expands with templates, loads to Supabase.
"""

import json
import sys
from anthropic import Anthropic

client = Anthropic()

# Load all forms
with open('output/missing_words.json', 'r', encoding='utf-8') as f:
    all_words = json.load(f)

# Already processed count per language
PROCESSED = {'fr': 50, 'de': 50, 'es': 75, 'it': 75, 'sv': 75}

def get_remaining_forms(lang, batch_num, batch_size=300):
    """Get remaining forms for language, in batches"""
    forms = all_words[lang]
    start = PROCESSED[lang] + (batch_num * batch_size)
    end = min(start + batch_size, len(forms))

    if start >= len(forms):
        return None

    return forms[start:end]

def process_batch(lang, forms):
    """Process a batch of forms using direct API call"""

    forms_str = json.dumps(forms)

    prompt = f"""Process these {len(forms)} {lang.upper()} surface forms and output ONLY a JSON array.

Forms: {forms_str}

For each unique lemma output:
{{"lemma": "root", "word_type": "verb|noun|adjective|adverb|other", "translation": "English", "level": "A1-C2", "example_sentence": "native", "example_translation": "English", "explanation": "brief", "verified": false}}

Output: JSON array ONLY, no markdown."""

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    result_text = response.content[0].text

    # Extract JSON array
    start = result_text.find('[')
    end = result_text.rfind(']') + 1

    if start < 0 or end <= start:
        print(f"ERROR: No JSON found in response")
        return None

    json_str = result_text[start:end]
    entries = json.loads(json_str)

    # Add language field
    for entry in entries:
        entry['language'] = lang

    return entries

def main():
    """Main processing loop"""

    print("="*60)
    print("BATCH PROCESSOR: Remaining 1,450 Forms")
    print("="*60)

    all_entries = []

    for lang in ['fr', 'de', 'es', 'it', 'sv']:
        print(f"\nProcessing {lang.upper()}...")

        batch_num = 0
        while True:
            forms = get_remaining_forms(lang, batch_num, batch_size=300)
            if not forms:
                break

            print(f"  Batch {batch_num + 1}: {len(forms)} forms...", end=" ", flush=True)

            try:
                entries = process_batch(lang, forms)
                if entries:
                    all_entries.extend(entries)
                    print(f"✓ {len(entries)} entries")
                else:
                    print("✗ Failed to extract JSON")
                    break
            except Exception as e:
                print(f"✗ Error: {str(e)[:60]}")
                break

            batch_num += 1

    # Save all entries
    total = len(all_entries)
    print(f"\n{'='*60}")
    print(f"TOTAL ENTRIES GENERATED: {total}")
    print(f"{'='*60}")

    if total > 0:
        with open('batch_remaining_all.json', 'w', encoding='utf-8') as f:
            json.dump(all_entries, f, ensure_ascii=False, indent=2)
        print("Saved to batch_remaining_all.json")

        # Print summary by language
        by_lang = {}
        for entry in all_entries:
            lang = entry['language']
            by_lang[lang] = by_lang.get(lang, 0) + 1

        print("\nBreakdown by language:")
        for lang in sorted(by_lang.keys()):
            print(f"  {lang.upper()}: {by_lang[lang]}")

    return total

if __name__ == "__main__":
    total = main()
    sys.exit(0 if total > 0 else 1)
