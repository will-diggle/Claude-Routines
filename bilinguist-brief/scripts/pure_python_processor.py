#!/usr/bin/env python3.9
"""
Pure Python processor for remaining 1,450 dictionary forms.
No external APIs - just morphology rules + templates.
Fast, deterministic, free.
"""

import json
import re
from collections import defaultdict

# ============================================================================
# MORPHOLOGY RULES - Lemmatization
# ============================================================================

def lemmatize_french(surface_form):
    """Convert French surface form to lemma"""
    form = surface_form.lower()

    # Verb conjugations -> infinitive
    if form.endswith(('ais', 'ait', 'ions', 'iez', 'aient')):  # -ER verb imperfect
        return form[:-3] + 'er'
    if form.endswith(('ai', 'as', 'a', 'ont')):  # -ER past simple
        return form[:-2] + 'er' if not form.endswith(('ont',)) else form[:-3] + 'er'
    if form.endswith(('ent', 'ez', 'es')):  # -ER present/plural
        return form[:-1] if form.endswith(('ent', 'es')) else form[:-2] + 'er'

    # Noun plurals -> singular
    if form.endswith('s') and len(form) > 2:
        return form[:-1]

    # Adjectives - check for feminine
    if form.endswith('e') and len(form) > 3:
        return form

    return form

def lemmatize_german(surface_form):
    """Convert German surface form to lemma"""
    form = surface_form.lower()

    # Verb conjugations
    if form.endswith(('te', 'test', 'ten', 'tet')):  # Preterite
        return form[:-2] + 'en' if form.endswith('te') else form[:-3] + 'en'
    if form.endswith(('e', 'est', 'en', 'et')):  # Present
        if form.endswith('en'):
            return form
        return form[:-1] + 'en'

    # Noun cases/plurals -> base
    if form.endswith('n') and len(form) > 3:
        return form[:-1]
    if form.endswith('e') and len(form) > 3:
        return form[:-1]
    if form.endswith('s'):
        return form[:-1]

    return form

def lemmatize_spanish(surface_form):
    """Convert Spanish surface form to lemma"""
    form = surface_form.lower()

    # Verb conjugations -> infinitive
    if form.endswith(('aba', 'abas', 'aban')):  # Imperfect -ar
        return form[:-3] + 'ar'
    if form.endswith(('é', 'aste', 'ó', 'amos', 'asteis', 'aron')):  # Preterite
        return form[:-2] + 'ar' if form.endswith(('é', 'ó')) else form[:-4] + 'ar'
    if form.endswith(('o', 'as', 'amos', 'áis')):  # Present
        if form.endswith('amos'):
            return form
        return form[:-1] + 'ar'

    # Participles -> infinitive
    if form.endswith('ando'):
        return form[:-4] + 'ar'
    if form.endswith('ado'):
        return form[:-3] + 'ar'

    # Noun plurals -> singular
    if form.endswith('s') and len(form) > 2:
        return form[:-1]

    # Adjectives - feminine -> masculine
    if form.endswith('a') and len(form) > 3:
        base = form[:-1]
        if not base.endswith('o'):
            return form

    return form

def lemmatize_italian(surface_form):
    """Convert Italian surface form to lemma"""
    form = surface_form.lower()

    # Verb conjugations -> infinitive
    if form.endswith(('ava', 'avi', 'avamo', 'avate', 'avano')):  # Imperfect
        return form[:-3] + 'are'
    if form.endswith(('ato', 'ata', 'ati', 'ate')):  # Past participle
        return form[:-3] + 'are'
    if form.endswith(('o', 'i', 'iamo', 'ate')):  # Present
        return form[:-1] + 'are' if form[-1] in 'oi' else form

    # Noun plurals/cases -> singular
    if form.endswith('i') and len(form) > 3:
        return form[:-1]
    if form.endswith('e') and len(form) > 3:
        return form[:-1]

    return form

def lemmatize_swedish(surface_form):
    """Convert Swedish surface form to lemma"""
    form = surface_form.lower()

    # Swedish has minimal inflection
    # Verb past -> present
    if form.endswith('ade'):
        return form[:-3] + 'a'

    # Plural -> singular (typically -ar, -er, -or -> singular)
    if form.endswith(('ar', 'er', 'or')) and len(form) > 4:
        base = form[:-1]
        if not base.endswith(('ar', 'er', 'or')):
            return form[:-1]

    return form

# ============================================================================
# CONJUGATION/DECLENSION TEMPLATES
# ============================================================================

def get_fr_verb_conjugations(infinitive):
    """Generate French verb conjugations (regular -er verbs)"""
    stem = infinitive[:-2]  # Remove -er
    return {
        "PRÉSENT": {
            "je": f"{stem}e", "tu": f"{stem}es", "il/elle": f"{stem}e",
            "nous": f"{stem}ons", "vous": f"{stem}ez", "ils/elles": f"{stem}ent"
        },
        "PASSÉ COMPOSÉ": {
            "je": f"ai {infinitive[:-2]}é", "tu": f"as {infinitive[:-2]}é",
            "il/elle": f"a {infinitive[:-2]}é", "nous": f"avons {infinitive[:-2]}é",
            "vous": f"avez {infinitive[:-2]}é", "ils/elles": f"ont {infinitive[:-2]}é"
        },
        "IMPARFAIT": {
            "je": f"{stem}ais", "tu": f"{stem}ais", "il/elle": f"{stem}ait",
            "nous": f"{stem}ions", "vous": f"{stem}iez", "ils/elles": f"{stem}aient"
        }
    }

def get_de_noun_cases(nominative, gender):
    """Generate German noun cases (simplified)"""
    return {
        "nominative_singular": nominative,
        "accusative_singular": nominative,
        "dative_singular": nominative,
        "genitive_singular": f"{nominative}s" if gender == 'm' else nominative,
        "nominative_plural": f"{nominative}e",
        "accusative_plural": f"{nominative}e",
        "dative_plural": f"{nominative}n",
        "genitive_plural": f"{nominative}"
    }

# ============================================================================
# MAIN PROCESSING
# ============================================================================

def process_all_forms():
    """Process all remaining forms"""

    # Load all forms
    with open('output/missing_words.json', 'r', encoding='utf-8') as f:
        all_words = json.load(f)

    processed_counts = {'fr': 50, 'de': 50, 'es': 75, 'it': 75, 'sv': 75}

    all_entries = []
    lemmatizers = {
        'fr': lemmatize_french,
        'de': lemmatize_german,
        'es': lemmatize_spanish,
        'it': lemmatize_italian,
        'sv': lemmatize_swedish
    }

    basic_translations = {
        # Common patterns - these will be marked for verification
        'be': 'to be', 'have': 'to have', 'do': 'to do', 'go': 'to go',
        'that': 'that', 'this': 'this', 'the': 'the', 'a': 'a',
        'and': 'and', 'or': 'or', 'but': 'but', 'not': 'not'
    }

    for lang in ['fr', 'de', 'es', 'it', 'sv']:
        forms = all_words[lang]
        start_idx = processed_counts[lang]
        remaining_forms = forms[start_idx:]

        lemmatizer = lemmatizers[lang]
        seen_lemmas = set()
        lang_entries = []

        print(f"Processing {lang.upper()}: {len(remaining_forms)} forms...")

        for surface_form in remaining_forms:
            lemma = lemmatizer(surface_form)

            # Skip duplicates
            if lemma in seen_lemmas:
                continue
            seen_lemmas.add(lemma)

            # Determine word type by simple rules
            if lemma.endswith(('er', 'ir', 'ar', 'en', 'a')):
                word_type = 'verb' if lemma.endswith(('er', 'en')) else 'verb'
            elif lemma.endswith(('e', 'a', 'o', 'i')):
                word_type = 'noun'
            else:
                word_type = 'other'

            # Create entry
            entry = {
                'language': lang,
                'lemma': lemma,
                'word': lemma,
                'word_type': word_type,
                'translation': basic_translations.get(lemma, '[TO VERIFY]'),
                'level': 'B1',  # Default, needs verification
                'example_sentence': f"[Example needed for {lemma}]",
                'example_translation': "[Translation needed]",
                'explanation': f"{word_type.capitalize()} form",
                'verified': False  # Mark for verification
            }

            # Add basic data structure
            if word_type == 'verb':
                entry['data'] = get_fr_verb_conjugations(lemma) if lang == 'fr' else {}
            elif word_type == 'noun':
                entry['data'] = {'gender': 'unknown'}
            else:
                entry['data'] = {}

            lang_entries.append(entry)

        all_entries.extend(lang_entries)
        print(f"  ✓ Generated {len(lang_entries)} unique entries")

    # Save all entries
    output_file = 'batch_pure_python.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_entries, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"TOTAL ENTRIES: {len(all_entries)}")
    print(f"OUTPUT: {output_file}")
    print(f"{'='*60}")

    # Summary by language
    by_lang = {}
    for entry in all_entries:
        lang = entry['language']
        by_lang[lang] = by_lang.get(lang, 0) + 1

    print("\nBreakdown:")
    for lang in sorted(by_lang.keys()):
        print(f"  {lang.upper()}: {by_lang[lang]:4d} entries")

    print(f"\nNext step: Load to Supabase, then verify with Claude Code agents")

if __name__ == '__main__':
    process_all_forms()
