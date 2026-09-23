#!/usr/bin/env python3
"""
Generate vocabulary entries using Claude Haiku.
Replaces the Workflow execution for unattended scheduled task.
"""

import json
import sys
import os
import anthropic
from pathlib import Path

def get_vocab_prompt(lang, idx):
    """Generate the prompt for vocabulary population."""
    return f"""You are populating a language-learning dictionary. Read the file scripts/output/final0917_{lang}.json — it's a JSON array of batches (arrays of words); read batch index {idx} (0-based) from that array. That batch is your word list for language "{lang}".

For EVERY word in that batch, produce one dictionary entry with this exact schema:
{{
  "word": "<the exact surface form as given>",
  "lemma": "<dictionary/citation form — the TRUE base form: infinitive for a verb (never a conjugated or participle form), singular for a noun, masculine singular for an adjective>",
  "word_type": "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "determiner" | "preposition" | "conjunction" | "other",
  "translation": "<concise English translation>",
  "level": "A1"|"A2"|"B1"|"B2"|"C1",
  "ipa": "<IPA pronunciation>",
  "explanation": "<1-2 sentence learner-friendly explanation>",
  "example_sentence": "<one natural example sentence in {lang}>",
  "example_translation": "<its English translation>",
  "tip": "<a short memory/usage tip, or empty string>",
  "word_family": "<a few related words, comma-separated>",
  "common_collocations": "<common phrases using this word, comma-separated>",
  "governed_prepositions": "<prepositions this word governs, or empty string>",
  "data": {{ ... word_type-specific fields }}
}}

"data" field shape by word_type — fill in EVERY applicable field:

VERB:
  "tenses": {{ "<TENSE NAME IN CAPS>": {{ "<pronoun>": "<conjugated form>", ... }}, ... }}
  "auxiliary": "<auxiliary verb or null>"
  "is_regular": true|false
  "is_reflexive": true|false
  "past_participle": "<masculine singular / base form>"
  "present_participle": "<present participle / gerund>"
  IMPORTANT — only for fr/es/it/pt: ALSO include
  "past_participle_feminine": "<feminine singular form>"
  "past_participle_masculine_plural": "<masculine plural form>"
  "past_participle_feminine_plural": "<feminine plural form>"
  (for de/sv, omit these three fields)
  ONLY for German verbs, additionally include:
  "is_separable": true|false
  "separable_prefix": "<the separable prefix, or null>"
  "zu_infinitive": "<the zu-infinitive form>"
  "joined_present_form": "<for separable verbs only, or null>"

NOUN:
  "gender": "masculine"|"feminine"|"neuter"|"common"
  "article_definite": "<definite article>"
  "article_indefinite": "<indefinite article>"
  "plural": "<plural form>"
  "singular": "<singular form>"
  ONLY for German nouns, additionally include:
  "cases": {{ "nominative_singular": "...", ... all 8 cases }}
  ONLY for Swedish nouns, additionally include:
  "forms": {{ "singular_indefinite": "...", "singular_definite": "...", "plural_indefinite": "...", "plural_definite": "..." }}

ADJECTIVE:
  "masculine": "<masculine singular>"
  "feminine": "<feminine singular>"
  "masculine_plural": "<masculine plural>"
  "feminine_plural": "<feminine plural>"
  "comparative": "<comparative form>"
  "superlative": "<superlative form>"
  ONLY for Swedish adjectives, additionally include:
  "forms": {{ "common_singular_indefinite": "...", ... }}
  ONLY for German adjectives, additionally include:
  "case_declensions": {{ "nominative_masculine_strong": "...", ... all 12 strong forms }}

OTHER word types: "data" can be {{}} or include any relevant inflected forms.

Be linguistically accurate. Return via structured output with an "entries" array — one entry per word, same order."""

def get_pn_prompt(lang, idx):
    """Generate the prompt for proper noun population."""
    return f"""Read the file scripts/output/final_pn_0917_{lang}.json — a JSON array of batches (arrays of words); read batch index {idx} (0-based). These are {lang}-language brief words flagged as LIKELY proper nouns or English loanwords (names, places, organizations) rather than genuine {lang} vocabulary.

For EVERY word in the batch, produce a LIGHTWEIGHT entry — no grammar tables, no conjugations:
{{
  "word": "<the exact surface form as given, lowercased is fine>",
  "lemma": "<the word's proper capitalization, e.g. 'Trump' not 'trump'>",
  "word_type": "proper noun",
  "translation": "<what/who this is, in a few words>",
  "level": "A1",
  "explanation": "<one short factual sentence identifying who/what this is — a person, place, organization, event.>"
}}

Some flagged words WON'T actually be proper nouns. If a word is clearly genuine {lang} vocabulary (not a name), still return an entry but set word_type to its real type (verb/noun/adjective/etc.), lemma to its dictionary root, and give normal explanation.

Be factually accurate about real people/places/organizations.

Return via structured output with an "entries" array, one per word, same order."""

def call_claude_haiku(prompt):
    """Call Claude Haiku API with the given prompt."""
    client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))

    schema = {
        "type": "object",
        "properties": {
            "entries": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "word": {"type": "string"},
                        "lemma": {"type": "string"},
                        "word_type": {"type": "string"},
                        "translation": {"type": "string"},
                        "level": {"type": "string"},
                        "ipa": {"type": "string"},
                        "explanation": {"type": "string"},
                        "example_sentence": {"type": "string"},
                        "example_translation": {"type": "string"},
                        "tip": {"type": "string"},
                        "word_family": {"type": "string"},
                        "common_collocations": {"type": "string"},
                        "governed_prepositions": {"type": "string"},
                        "data": {"type": "object"},
                    },
                },
            },
        },
        "required": ["entries"],
    }

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        # Extract the structured output
        content = response.content[0]
        if hasattr(content, 'text'):
            # Try to parse as JSON
            try:
                return json.loads(content.text)
            except json.JSONDecodeError:
                return {"entries": []}
        return {"entries": []}
    except Exception as e:
        print(f"Error calling Claude: {e}")
        return {"entries": []}

def main():
    # Load jobs
    with open('output/jobs_0917.json') as f:
        vocab_jobs = json.load(f)

    with open('output/pn_jobs_0917.json') as f:
        pn_jobs = json.load(f)

    print(f"=== Generating vocabulary entries ===")
    print(f"Vocab jobs: {len(vocab_jobs)}")
    print(f"PN jobs: {len(pn_jobs)}")
    print()

    # Process vocabulary jobs
    vocab_results = []
    for i, job in enumerate(vocab_jobs):
        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(vocab_jobs)} vocab batches...")

        prompt = get_vocab_prompt(job['lang'], job['idx'])
        result = call_claude_haiku(prompt)
        vocab_results.append({
            "lang": job['lang'],
            "idx": job['idx'],
            "entries": result.get('entries', [])
        })

    print(f"✓ Vocab generation complete: {len(vocab_results)} batches")

    # Process proper noun jobs
    pn_results = []
    for i, job in enumerate(pn_jobs):
        print(f"  {i+1}/{len(pn_jobs)} PN batches...")

        prompt = get_pn_prompt(job['lang'], job['idx'])
        result = call_claude_haiku(prompt)
        pn_results.append({
            "lang": job['lang'],
            "idx": job['idx'],
            "entries": result.get('entries', [])
        })

    print(f"✓ PN generation complete: {len(pn_results)} batches")

    # Save results
    with open('output/result_0917_vocab.json', 'w') as f:
        json.dump(vocab_results, f)

    with open('output/result_0917_pn.json', 'w') as f:
        json.dump(pn_results, f)

    print()
    print(f"Results saved:")
    print(f"  output/result_0917_vocab.json")
    print(f"  output/result_0917_pn.json")

if __name__ == "__main__":
    main()
