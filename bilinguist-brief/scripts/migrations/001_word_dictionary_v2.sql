-- Migration: word_dictionary v2
-- Drops the old flat-column table and creates a new JSONB-based schema.
-- Run once in the Supabase SQL editor BEFORE running bilinguist_excel_import.py.
--
-- The `data` JSONB column stores all language/word-class-specific grammatical
-- information (conjugation tables, case forms, declension, etc.) so we don't
-- need hundreds of language-specific flat columns.

DROP TABLE IF EXISTS word_dictionary CASCADE;

CREATE TABLE word_dictionary (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  word_id             TEXT UNIQUE,                      -- e.g. de_v_001 (from Excel) or auto-generated
  language            TEXT NOT NULL,                    -- de / fr / es / it / sv / tr / ar
  word                TEXT NOT NULL,                    -- surface form as it appears in text
  lemma               TEXT NOT NULL,                    -- base/dictionary form
  word_type           TEXT NOT NULL DEFAULT 'other',    -- verb / noun / adjective / adverb / other
  frequency_rank      INTEGER,
  translation         TEXT,
  level               TEXT,                             -- A1 / A2 / B1 / B2 / C1 / C2
  ipa                 TEXT,
  explanation         TEXT,
  example_sentence    TEXT,
  example_translation TEXT,
  tip                 TEXT,
  word_family         TEXT,
  common_collocations TEXT,
  governed_prepositions TEXT,
  source              TEXT DEFAULT 'gemini',            -- excel / gemini / haiku / fallback
  data                JSONB,                            -- all grammatical data (tenses, cases, forms, meta)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- One row per (language, lemma, word_type): allows same lemma to be both verb and noun
  UNIQUE (language, lemma, word_type)
);

-- Fast lookup by lemma (primary key path)
CREATE INDEX idx_wdict_lang_lemma ON word_dictionary (language, lower(lemma));

-- Lookup by surface form (for words that appear inflected in articles)
CREATE INDEX idx_wdict_lang_word  ON word_dictionary (language, lower(word));

-- Filter by language + word type
CREATE INDEX idx_wdict_lang_type  ON word_dictionary (language, word_type);

-- GIN index on JSONB for full-text queries within data
CREATE INDEX idx_wdict_data ON word_dictionary USING gin (data);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER word_dictionary_updated_at
  BEFORE UPDATE ON word_dictionary
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
