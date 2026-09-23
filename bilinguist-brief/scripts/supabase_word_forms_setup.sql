-- Run once in the Supabase SQL Editor.
-- 1. Opens public read access to word_dictionary (dictionary data isn't sensitive).
-- 2. Creates word_forms: one row per inflected surface form (not just the lemma),
--    so the app can match exactly what appears in brief text directly.

CREATE POLICY "Public read access" ON word_dictionary FOR SELECT USING (true);

CREATE TABLE word_forms (
  id             bigint generated always as identity primary key,
  word           text not null,
  language       text not null,
  lemma          text not null,
  word_type      text,
  translation    text,
  explanation    text,
  example        text,
  pronunciation  text,
  forms          jsonb,
  tip            text,
  meta           jsonb,
  level          text,
  updated_at     timestamptz not null default now(),
  unique (word, language)
);

CREATE INDEX idx_word_forms_lookup ON word_forms (language, word);

ALTER TABLE word_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON word_forms FOR SELECT USING (true);
