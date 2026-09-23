#!/usr/bin/env python3
"""
Split proper nouns from daily vocabulary candidates.

Uses tokenMap POS tags (PROPN) to identify proper nouns, then:
1. Collects all PROPN surface forms from the brief's tokenMaps
2. Intersects them with each language's vocabulary word list
3. Moves matching words to final_pn_{tag}_{lang}.json files
4. Rebuilds final_{tag}_{lang}.json and jobs_{tag}.json to exclude proper nouns
5. Creates pn_jobs_{tag}.json for proper noun batches
"""

import json
import sys
from pathlib import Path

def get_propn_surfaces(brief, lang):
    """Extract all PROPN surface forms from brief tokenMap for a language."""
    propn_forms = set()

    if lang not in brief.get('briefings', {}):
        return propn_forms

    lang_briefings = brief['briefings'][lang]

    for level in lang_briefings:
        for length_type in lang_briefings[level]:
            articles = lang_briefings[level][length_type].get('articles', [])
            for article in articles:
                tokenMap = article.get('tokenMap', [])
                for token in tokenMap:
                    if token.get('pos') == 'PROPN':
                        surface = token.get('surface', '').strip()
                        if surface:
                            propn_forms.add(surface)

    return propn_forms

def batch_words(words, batch_size=25):
    """Split words into batches of batch_size."""
    batches = []
    for i in range(0, len(words), batch_size):
        batches.append(words[i:i+batch_size])
    return batches

def main():
    if len(sys.argv) > 1:
        tag = sys.argv[1]
    else:
        # Default to 0917 (today's date)
        tag = "0917"

    print(f"=== Splitting proper nouns for tag={tag} ===")

    # Load brief
    brief_path = Path(f"output/brief_{tag}.json")
    if not brief_path.exists():
        print(f"Error: {brief_path} not found")
        sys.exit(1)

    with open(brief_path) as f:
        brief = json.load(f)

    # Process each language
    languages = ['fr', 'de', 'es', 'it', 'sv', 'pt']

    for lang in languages:
        final_path = Path(f"output/final{tag}_{lang}.json")
        if not final_path.exists():
            continue

        with open(final_path) as f:
            batched_words = json.load(f)

        # Flatten batches to individual words
        vocab_words = []
        for batch in batched_words:
            vocab_words.extend(batch)

        # Get PROPN surface forms for this language
        propn_surfaces = get_propn_surfaces(brief, lang)
        if not propn_surfaces:
            print(f"{lang}: no PROPN found, keeping all {len(vocab_words)} vocab words")
            continue

        # Separate proper nouns from vocabulary
        pn_words = [w for w in vocab_words if w in propn_surfaces]
        vocab_only = [w for w in vocab_words if w not in propn_surfaces]

        print(f"{lang}: {len(pn_words)} proper nouns, {len(vocab_only)} remaining vocab")

        # Write separated files (re-batch them)
        if pn_words:
            pn_batches = batch_words(pn_words, batch_size=25)
            with open(f"output/final_pn_{tag}_{lang}.json", 'w') as f:
                json.dump(pn_batches, f)

        # Rewrite vocab file (excluding proper nouns, re-batched)
        vocab_batches = batch_words(vocab_only, batch_size=5)
        with open(final_path, 'w') as f:
            json.dump(vocab_batches, f)

    # Rebuild jobs files
    print("\nRebuilding job descriptors...")

    # Rebuild main vocab jobs - directly from batches without re-batching
    vocab_jobs = []
    for lang in languages:
        final_path = Path(f"output/final{tag}_{lang}.json")
        if not final_path.exists():
            continue

        with open(final_path) as f:
            batches = json.load(f)

        if not batches:
            continue

        for batch_idx, batch in enumerate(batches):
            vocab_jobs.append({
                "lang": lang,
                "idx": batch_idx,
                "words": batch
            })

    with open(f"output/jobs_{tag}.json", 'w') as f:
        json.dump(vocab_jobs, f)

    print(f"Wrote {len(vocab_jobs)} vocab job descriptors -> output/jobs_{tag}.json")

    # Build proper noun jobs
    pn_jobs = []
    for lang in languages:
        pn_path = Path(f"output/final_pn_{tag}_{lang}.json")
        if not pn_path.exists():
            continue

        with open(pn_path) as f:
            batches = json.load(f)

        if not batches:
            continue

        for batch_idx, batch in enumerate(batches):
            pn_jobs.append({
                "lang": lang,
                "idx": batch_idx,
                "words": batch
            })

    if pn_jobs:
        with open(f"output/pn_jobs_{tag}.json", 'w') as f:
            json.dump(pn_jobs, f)
        print(f"Wrote {len(pn_jobs)} proper noun job descriptors -> output/pn_jobs_{tag}.json")
    else:
        print(f"No proper nouns to process for {tag}")

if __name__ == "__main__":
    main()
