-- Bilinguist Words Dictionary
-- Run once to initialise: wrangler d1 execute bilinguist-words --file schema.sql --remote

CREATE TABLE IF NOT EXISTS words (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Lookup key (always lowercase + trimmed)
  word          TEXT    NOT NULL,
  language      TEXT    NOT NULL,
  -- Structured data from Claude
  lemma         TEXT,                          -- base/dictionary form of the word
  word_type     TEXT,                          -- 'verb' | 'noun' | 'adjective' | 'adverb' | 'phrase' | 'other'
  translation   TEXT,                          -- English translation
  explanation   TEXT,                          -- English explanation, context-appropriate
  example       TEXT,                          -- example sentence in source language
  pronunciation TEXT,                          -- IPA
  verb_present  TEXT,                          -- JSON: {"je": "suis", "tu": "es", ...} or NULL
  verb_past     TEXT,                          -- JSON: past tense table or NULL
  forms         TEXT,                          -- JSON: noun {gender,plural,article} or adj {feminine,comparative,superlative}
  tip           TEXT,                          -- memory hook / etymology note
  meta          TEXT,                          -- JSON: verb regularity, auxiliary, separable, etc.
  level         TEXT,                          -- CEFR level: A1 A2 B1 B2 C1 C2
  -- Stats
  lookup_count  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(word, language)
);

CREATE INDEX IF NOT EXISTS idx_words_lookup   ON words(word, language);
CREATE INDEX IF NOT EXISTS idx_words_popular  ON words(language, lookup_count DESC);
