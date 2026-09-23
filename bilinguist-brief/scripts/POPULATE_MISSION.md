# Dictionary Population Mission

You are a multilingual language expert. Your job is to populate a language-learning dictionary database with accurate, rich entries for the words listed in `output/missing_words.json`.

## Your working directory
`/Users/willdiggle/claude-routines/bilinguist-brief/scripts`

## How to work

Process one language at a time. For each language:

1. Read the word list from `output/missing_words.json`
2. Take a batch of ~25 surface forms
3. **First identify the lemma** (root form) for each — many surface forms will share the same root:
   - Verbs → infinitive (e.g. "marchait", "marchions", "marché" → "marcher")
   - Nouns → nominative singular (e.g. "maisons" → "maison", "Bücher" → "Buch")
   - Adjectives → masculine singular base form
   - Deduplicate: if 5 forms all map to "haben", you only write ONE entry for "haben"
4. For each **unique lemma**, generate a complete dictionary entry (see schema below)
5. Write all entries for the batch as a JSON file, then run:
   ```
   /usr/local/bin/python3.9 dict_writer.py /tmp/batch.json
   ```
6. Continue with the next batch until all words in that language are done
7. Move to the next language

## Priority order
French (fr) → German (de) → Spanish (es) → Italian (it) → Swedish (sv)

## Word counts to process
- fr: ~306 surface forms
- de: ~573 surface forms  
- es: ~298 surface forms
- it: ~309 surface forms
- sv: ~289 surface forms

## Entry schema

Each entry is a JSON object:

```json
{
  "language": "fr",
  "lemma": "marcher",
  "word_type": "verb",
  "translation": "to walk",
  "level": "A1",
  "ipa": "maʁ.ʃe",
  "explanation": "To move on foot, to walk. Used in many common expressions.",
  "example_sentence": "Je marche au parc tous les matins.",
  "example_translation": "I walk in the park every morning.",
  "tip": "Regular -er verb. 'Ça marche' also means 'it works/OK'.",
  "word_family": "marche, marcheur, démarche",
  "common_collocations": "marcher vite, marcher à pied, ça marche",
  "governed_prepositions": null,
  "data": {
    "tenses": {
      "PRÉSENT":       {"je": "marche", "tu": "marches", "il/elle": "marche", "nous": "marchons", "vous": "marchez", "ils/elles": "marchent"},
      "PASSÉ COMPOSÉ": {"je": "ai marché", "tu": "as marché", "il/elle": "a marché", "nous": "avons marché", "vous": "avez marché", "ils/elles": "ont marché"},
      "IMPARFAIT":     {"je": "marchais", "tu": "marchais", "il/elle": "marchait", "nous": "marchions", "vous": "marchiez", "ils/elles": "marchaient"},
      "PASSÉ SIMPLE":  {"je": "marchai", "tu": "marchas", "il/elle": "marcha", "nous": "marchâmes", "vous": "marchâtes", "ils/elles": "marchèrent"},
      "FUTUR":         {"je": "marcherai", "tu": "marcheras", "il/elle": "marchera", "nous": "marcherons", "vous": "marcherez", "ils/elles": "marcheront"},
      "CONDITIONNEL":  {"je": "marcherais", "tu": "marcherais", "il/elle": "marcherait", "nous": "marcherions", "vous": "marcheriez", "ils/elles": "marcheraient"},
      "SUBJONCTIF":    {"je": "marche", "tu": "marches", "il/elle": "marche", "nous": "marchions", "vous": "marchiez", "ils/elles": "marchent"}
    },
    "is_regular": true,
    "auxiliary": "avoir",
    "is_reflexive": false,
    "past_participle": "marché",
    "present_participle": "marchant"
  }
}
```

## Tense names and pronoun keys by language

**French (fr)** — pronouns: je, tu, il/elle, nous, vous, ils/elles
Tenses: PRÉSENT, PASSÉ COMPOSÉ, IMPARFAIT, PASSÉ SIMPLE, PLUS-QUE-PARFAIT, FUTUR, CONDITIONNEL, SUBJONCTIF

**German (de)** — pronouns: ich, du, er/sie/es, wir, ihr, sie/Sie
Tenses: PRÄSENS, PRÄTERITUM, PERFEKT, PLUSQUAMPERFEKT, FUTUR I, KONJUNKTIV II

**Spanish (es)** — pronouns: yo, tú, él/ella, nosotros, vosotros, ellos/ellas
Tenses: PRESENTE, PRETÉRITO INDEFINIDO, PRETÉRITO IMPERFECTO, PRETÉRITO PERFECTO, FUTURO, CONDICIONAL, SUBJUNTIVO PRESENTE

**Italian (it)** — pronouns: io, tu, lui/lei, noi, voi, loro
Tenses: PRESENTE, PASSATO PROSSIMO, IMPERFETTO, PASSATO REMOTO, FUTURO, CONDIZIONALE, CONGIUNTIVO PRESENTE

**Swedish (sv)** — use key "—" (single form per tense, no person conjugation)
Tenses: PRESENS, PRETERITUM, PERFEKT, FUTURUM

## Noun data format

```json
"data": {
  "gender": "f",
  "article_definite": "la",
  "article_indefinite": "une",
  "singular": "maison",
  "plural": "maisons"
}
```

German nouns also need cases:
```json
"data": {
  "gender": "n",
  "article_definite": "das",
  "article_indefinite": "ein",
  "cases": {
    "nominative_singular": "das Haus", "accusative_singular": "das Haus",
    "dative_singular": "dem Haus", "genitive_singular": "des Hauses",
    "nominative_plural": "die Häuser", "accusative_plural": "die Häuser",
    "dative_plural": "den Häusern", "genitive_plural": "der Häuser"
  }
}
```

## Adjective data format

```json
"data": {
  "feminine": "grande",
  "masculine": "grand",
  "comparative": "plus grand",
  "superlative": "le plus grand"
}
```

## Important rules

- `word` and `lemma` must both be the ROOT form (infinitive/nominative singular), **not** the inflected surface form
- `word_type` must be exactly one of: verb, noun, adjective, adverb, other
- Skip pure proper nouns, abbreviations under 3 letters, and obvious English loanwords
- For words you're uncertain about, still write the entry but set level to "B2" or "C1"
- Write entries for ALL tenses you know — the more complete the better
- After each batch write, confirm how many were written before moving on

## Verification
The session that set this up will check your work in Supabase. Focus on accuracy over speed.
