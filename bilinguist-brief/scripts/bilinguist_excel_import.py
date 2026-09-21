"""
bilinguist_excel_import.py
==========================
Bulk-imports all Excel dictionary files into the word_dictionary Supabase table.

Run AFTER executing the SQL migration (001_word_dictionary_v2.sql).

Usage:
    python bilinguist_excel_import.py [--excel-dir PATH] [--dry-run] [--lang LANG]

Options:
    --excel-dir   Path to the directory containing BB_Dictionary_*.xlsx files.
                  Defaults to ~/Downloads/Language Database spreadsheets/
    --dry-run     Parse and validate but do not write to Supabase.
    --lang        Only import this language code (de/fr/es/it/sv/tr).
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: /usr/local/bin/python3.9 -m pip install openpyxl")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
ENV_FILE   = SCRIPT_DIR.parent / ".env"

DEFAULT_EXCEL_DIR = Path.home() / "Downloads" / "Language Database spreadsheets"

EXCEL_FILES = {
    "de": "BB_Dictionary_German.xlsx",
    "fr": "BB_Dictionary_French.xlsx",
    "es": "BB_Dictionary_Spanish.xlsx",
    "it": "BB_Dictionary_Italian.xlsx",
    "sv": "BB_Dictionary_Swedish.xlsx",
    "tr": "BB_Dictionary_Turkish.xlsx",
    "ar": "BB_Dictionary_Arabic.xlsx",
}

SHEET_TO_WORD_TYPE = {
    "Verbs":      "verb",
    "Nouns":      "noun",
    "Adjectives": "adjective",
    "Adverbs":    "adverb",
    "Other":      "other",
}

SKIP_COLS = {"source", "kaikki_found", "audio_filename", "notes",
             "word_id", "language", "word", "lemma", "frequency_rank",
             "translation", "level", "ipa_main", "explanation",
             "example_sentence", "example_translation", "tip",
             "word_family", "common_collocations", "governed_prepositions",
             "governed_postpositions"}


# ── Bool helper ────────────────────────────────────────────────────────────────

def _to_bool(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in ("true", "yes", "1"):
        return True
    if s in ("false", "no", "0", ""):
        return False
    return None


def _str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# ── Tense builders ─────────────────────────────────────────────────────────────

def _tense_de(row: dict, prefix: str, pronouns: list):
    cols = [f"{prefix}_ich", f"{prefix}_du", f"{prefix}_er",
            f"{prefix}_wir", f"{prefix}_ihr", f"{prefix}_sie"]
    t = {}
    for pr, col in zip(pronouns, cols):
        v = _str(row.get(col))
        if v:
            t[pr] = v
    return t or None


def _tense_fr(row: dict, prefix: str, pronouns: list):
    cols = [f"{prefix}_je", f"{prefix}_tu", f"{prefix}_il",
            f"{prefix}_nous", f"{prefix}_vous", f"{prefix}_ils"]
    t = {}
    for pr, col in zip(pronouns, cols):
        v = _str(row.get(col))
        if v:
            t[pr] = v
    return t or None


def _tense_es(row: dict, prefix: str, pronouns: list):
    cols = [f"{prefix}_yo", f"{prefix}_tu", f"{prefix}_el",
            f"{prefix}_nosotros", f"{prefix}_vosotros", f"{prefix}_ellos"]
    t = {}
    for pr, col in zip(pronouns, cols):
        v = _str(row.get(col))
        if v:
            t[pr] = v
    return t or None


def _tense_it(row: dict, prefix: str, pronouns: list):
    cols = [f"{prefix}_io", f"{prefix}_tu", f"{prefix}_lui",
            f"{prefix}_noi", f"{prefix}_voi", f"{prefix}_loro"]
    t = {}
    for pr, col in zip(pronouns, cols):
        v = _str(row.get(col))
        if v:
            t[pr] = v
    return t or None


def _tense_tr(row: dict, prefix: str, pronouns: list):
    cols = [f"{prefix}_ben", f"{prefix}_sen", f"{prefix}_o",
            f"{prefix}_biz", f"{prefix}_siz", f"{prefix}_onlar"]
    t = {}
    for pr, col in zip(pronouns, cols):
        v = _str(row.get(col))
        if v:
            t[pr] = v
    return t or None


# ── Per-language per-sheet data builders ──────────────────────────────────────

DE_VERB_PRONOUNS = ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"]
FR_VERB_PRONOUNS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"]
ES_VERB_PRONOUNS = ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"]
IT_VERB_PRONOUNS = ["io", "tu", "lui/lei", "noi", "voi", "loro"]
TR_VERB_PRONOUNS = ["ben", "sen", "o", "biz", "siz", "onlar"]


def _build_data_de_verb(row: dict) -> dict:
    p = DE_VERB_PRONOUNS
    tenses = {}

    for prefix, label in [
        ("present",     "PRÄSENS"),
        ("simplepast",  "PRÄTERITUM"),
        ("perfect",     "PERFEKT"),
        ("pluperfect",  "PLUSQUAMPERFEKT"),
        ("future1",     "FUTUR I"),
        ("future2",     "FUTUR II"),
        ("subj1",       "KONJUNKTIV I"),
        ("subj2",       "KONJUNKTIV II"),
        ("conditional", "KONDITIONALIS"),
    ]:
        t = _tense_de(row, prefix, p)
        if t:
            tenses[label] = t

    imperative = {}
    for pron, col in [("du", "imperative_du"), ("ihr", "imperative_ihr"), ("Sie", "imperative_sie")]:
        v = _str(row.get(col))
        if v:
            imperative[pron] = v

    return {
        "is_regular":       _to_bool(row.get("is_regular")),
        "auxiliary":        _str(row.get("auxiliary")),
        "is_separable":     _to_bool(row.get("is_separable")),
        "separable_prefix": _str(row.get("separable_prefix")),
        "is_reflexive":     _to_bool(row.get("is_reflexive")),
        "is_transitive":    _to_bool(row.get("is_transitive")),
        "verb_class":       _str(row.get("verb_class")),
        "infinitive":       _str(row.get("infinitive")) or _str(row.get("lemma")),
        "zu_infinitive":    _str(row.get("zu_infinitive")),
        "past_participle":  _str(row.get("past_participle")),
        "present_participle": _str(row.get("present_participle")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_de_noun(row: dict) -> dict:
    cases = {}
    for col in ["nominative_singular", "accusative_singular", "dative_singular", "genitive_singular",
                "nominative_plural",   "accusative_plural",   "dative_plural",   "genitive_plural"]:
        v = _str(row.get(col))
        if v:
            cases[col] = v

    return {
        "gender":             _str(row.get("gender")),
        "article_definite":   _str(row.get("article_definite")),
        "article_indefinite": _str(row.get("article_indefinite")),
        "article_plural":     _str(row.get("article_plural")),
        "is_countable":       _to_bool(row.get("is_countable")),
        "has_plural":         _to_bool(row.get("has_plural")),
        "diminutive":         _str(row.get("diminutive")),
        "cases":              cases or None,
    }


def _build_data_de_adjective(row: dict) -> dict:
    declension = {}
    for col in ["strong_m_nom_sg", "strong_m_acc_sg", "strong_m_dat_sg", "strong_m_gen_sg",
                "strong_f_nom_sg", "strong_f_acc_sg", "strong_f_dat_sg", "strong_f_gen_sg",
                "strong_n_nom_sg", "strong_n_acc_sg", "strong_n_dat_sg", "strong_n_gen_sg",
                "weak_m_nom_sg",   "weak_m_acc_sg",   "weak_m_dat_sg",   "weak_m_gen_sg",
                "weak_f_nom_sg",   "weak_f_acc_sg",   "weak_f_dat_sg",   "weak_f_gen_sg",
                "weak_n_nom_sg",   "weak_n_acc_sg",   "weak_n_dat_sg",   "weak_n_gen_sg",
                "mixed_m_nom_sg",  "mixed_m_acc_sg",  "mixed_m_dat_sg",  "mixed_m_gen_sg",
                "mixed_f_nom_sg",  "mixed_f_acc_sg",  "mixed_f_dat_sg",  "mixed_f_gen_sg",
                "mixed_n_nom_sg",  "mixed_n_acc_sg",  "mixed_n_dat_sg",  "mixed_n_gen_sg",
                "strong_pl",       "weak_pl",          "mixed_pl"]:
        v = _str(row.get(col))
        if v:
            declension[col] = v

    return {
        "comparative":        _str(row.get("comparative")),
        "superlative":        _str(row.get("superlative")),
        "adverbial_form":     _str(row.get("adverbial_form")),
        "can_be_predicative": _to_bool(row.get("can_be_predicative")),
        "can_be_attributive": _to_bool(row.get("can_be_attributive")),
        "declension":         declension or None,
    }


def _build_data_fr_verb(row: dict) -> dict:
    p = FR_VERB_PRONOUNS
    tenses = {}

    for prefix, label in [
        ("present",           "PRÉSENT"),
        ("passe_compose",     "PASSÉ COMPOSÉ"),
        ("imparfait",         "IMPARFAIT"),
        ("passe_simple",      "PASSÉ SIMPLE"),
        ("plus_que_parfait",  "PLUS-QUE-PARFAIT"),
        ("futur",             "FUTUR"),
        ("futur_anterieur",   "FUTUR ANTÉRIEUR"),
        ("conditionnel",      "CONDITIONNEL"),
        ("conditionnel_passe","CONDITIONNEL PASSÉ"),
        ("subjonctif",        "SUBJONCTIF"),
        ("subjonctif_passe",  "SUBJONCTIF PASSÉ"),
    ]:
        t = _tense_fr(row, prefix, p)
        if t:
            tenses[label] = t

    imperative = {}
    for pron, col in [("tu", "imperatif_tu"), ("nous", "imperatif_nous"), ("vous", "imperatif_vous")]:
        v = _str(row.get(col))
        if v:
            imperative[pron] = v

    return {
        "is_regular":         _to_bool(row.get("is_regular")),
        "auxiliary":          _str(row.get("auxiliary")),
        "is_reflexive":       _to_bool(row.get("is_reflexive")),
        "is_pronominal":      _to_bool(row.get("is_pronominal")),
        "is_transitive":      _to_bool(row.get("is_transitive")),
        "verb_class":         _str(row.get("verb_class")),
        "infinitive":         _str(row.get("infinitive")) or _str(row.get("lemma")),
        "past_participle":    _str(row.get("past_participle")),
        "present_participle": _str(row.get("present_participle")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_fr_noun(row: dict) -> dict:
    return {
        "gender":             _str(row.get("gender")),
        "elision":            _to_bool(row.get("elision")),
        "article_definite":   _str(row.get("article_definite")),
        "article_indefinite": _str(row.get("article_indefinite")),
        "article_partitive":  _str(row.get("article_partitive")),
        "singular":           _str(row.get("singular")),
        "plural":             _str(row.get("plural")),
    }


def _build_data_fr_adjective(row: dict) -> dict:
    return {
        "masculine_singular": _str(row.get("masculine_singular")),
        "feminine_singular":  _str(row.get("feminine_singular")),
        "masculine_plural":   _str(row.get("masculine_plural")),
        "feminine_plural":    _str(row.get("feminine_plural")),
        "position":           _str(row.get("position")),
        "comparative":        _str(row.get("comparative")),
        "superlative":        _str(row.get("superlative")),
    }


def _build_data_es_verb(row: dict) -> dict:
    p = ES_VERB_PRONOUNS
    tenses = {}

    for prefix, label in [
        ("presente",              "PRESENTE"),
        ("indefinido",            "PRETÉRITO INDEFINIDO"),
        ("imperfecto",            "IMPERFECTO"),
        ("perfecto",              "PRETÉRITO PERFECTO"),
        ("pluscuamperfecto",      "PLUSCUAMPERFECTO"),
        ("futuro",                "FUTURO"),
        ("futuro_perfecto",       "FUTURO PERFECTO"),
        ("condicional",           "CONDICIONAL"),
        ("condicional_compuesto", "CONDICIONAL COMPUESTO"),
        ("subjuntivo_presente",   "SUBJUNTIVO PRESENTE"),
        ("subjuntivo_imperfecto", "SUBJUNTIVO IMPERFECTO"),
        ("subjuntivo_futuro",     "SUBJUNTIVO FUTURO"),
    ]:
        t = _tense_es(row, prefix, p)
        if t:
            tenses[label] = t

    imperative = {}
    for pron, col in [
        ("tú (afirm.)",       "imperativo_afirmativo_tu"),
        ("usted (afirm.)",    "imperativo_afirmativo_usted"),
        ("nosotros (afirm.)", "imperativo_afirmativo_nosotros"),
        ("vosotros (afirm.)", "imperativo_afirmativo_vosotros"),
        ("ustedes (afirm.)",  "imperativo_afirmativo_ustedes"),
        ("tú (neg.)",         "imperativo_negativo_tu"),
        ("usted (neg.)",      "imperativo_negativo_usted"),
        ("nosotros (neg.)",   "imperativo_negativo_nosotros"),
        ("vosotros (neg.)",   "imperativo_negativo_vosotros"),
        ("ustedes (neg.)",    "imperativo_negativo_ustedes"),
    ]:
        v = _str(row.get(col))
        if v:
            imperative[pron] = v

    return {
        "is_regular":         _to_bool(row.get("is_regular")),
        "auxiliary":          _str(row.get("auxiliary")),
        "is_reflexive":       _to_bool(row.get("is_reflexive")),
        "is_transitive":      _to_bool(row.get("is_transitive")),
        "verb_class":         _str(row.get("verb_class")),
        "stem_change":        _str(row.get("stem_change")),
        "infinitive":         _str(row.get("infinitive")) or _str(row.get("lemma")),
        "past_participle":    _str(row.get("past_participle")),
        "present_participle": _str(row.get("present_participle")),
        "gerundio":           _str(row.get("gerundio")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_es_noun(row: dict) -> dict:
    return {
        "gender":                   _str(row.get("gender")),
        "article_definite":         _str(row.get("article_definite")),
        "article_indefinite":       _str(row.get("article_indefinite")),
        "article_definite_plural":  _str(row.get("article_definite_plural")),
        "singular":                 _str(row.get("singular")),
        "plural":                   _str(row.get("plural")),
    }


def _build_data_es_adjective(row: dict) -> dict:
    return {
        "masculine_singular":      _str(row.get("masculine_singular")),
        "feminine_singular":       _str(row.get("feminine_singular")),
        "masculine_plural":        _str(row.get("masculine_plural")),
        "feminine_plural":         _str(row.get("feminine_plural")),
        "invariable":              _to_bool(row.get("invariable")),
        "position":                _str(row.get("position")),
        "apocope":                 _str(row.get("apocope")),
        "comparative":             _str(row.get("comparative")),
        "superlative_relative":    _str(row.get("superlative_relative")),
        "superlative_absolute_ms": _str(row.get("superlative_absolute_ms")),
        "superlative_absolute_fs": _str(row.get("superlative_absolute_fs")),
        "superlative_absolute_mp": _str(row.get("superlative_absolute_mp")),
        "superlative_absolute_fp": _str(row.get("superlative_absolute_fp")),
    }


def _build_data_it_verb(row: dict) -> dict:
    p = IT_VERB_PRONOUNS
    tenses = {}

    for prefix, label in [
        ("presente",                 "PRESENTE"),
        ("passato_prossimo",         "PASSATO PROSSIMO"),
        ("imperfetto",               "IMPERFETTO"),
        ("passato_remoto",           "PASSATO REMOTO"),
        ("trapassato_prossimo",      "TRAPASSATO PROSSIMO"),
        ("futuro",                   "FUTURO"),
        ("futuro_anteriore",         "FUTURO ANTERIORE"),
        ("condizionale",             "CONDIZIONALE"),
        ("condizionale_passato",     "CONDIZIONALE PASSATO"),
        ("congiuntivo_presente",     "CONGIUNTIVO PRESENTE"),
        ("congiuntivo_passato",      "CONGIUNTIVO PASSATO"),
        ("congiuntivo_imperfetto",   "CONGIUNTIVO IMPERFETTO"),
        ("congiuntivo_trapassato",   "CONGIUNTIVO TRAPASSATO"),
    ]:
        t = _tense_it(row, prefix, p)
        if t:
            tenses[label] = t

    imperative = {}
    for pron, col in [("tu", "imperativo_tu"), ("noi", "imperativo_noi"), ("voi", "imperativo_voi")]:
        v = _str(row.get(col))
        if v:
            imperative[pron] = v

    return {
        "is_regular":         _to_bool(row.get("is_regular")),
        "auxiliary":          _str(row.get("auxiliary")),
        "is_reflexive":       _to_bool(row.get("is_reflexive")),
        "is_transitive":      _to_bool(row.get("is_transitive")),
        "verb_class":         _str(row.get("verb_class")),
        "infinitive":         _str(row.get("infinitive")) or _str(row.get("lemma")),
        "infinito_passato":   _str(row.get("infinito_passato")),
        "past_participle":    _str(row.get("past_participle")),
        "present_participle": _str(row.get("present_participle")),
        "gerundio":           _str(row.get("gerundio")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_it_noun(row: dict) -> dict:
    return {
        "gender":                  _str(row.get("gender")),
        "elision":                 _to_bool(row.get("elision")),
        "article_definite":        _str(row.get("article_definite")),
        "article_indefinite":      _str(row.get("article_indefinite")),
        "article_partitive":       _str(row.get("article_partitive")),
        "article_definite_plural": _str(row.get("article_definite_plural")),
        "singular":                _str(row.get("singular")),
        "plural":                  _str(row.get("plural")),
    }


def _build_data_it_adjective(row: dict) -> dict:
    return {
        "masculine_singular":      _str(row.get("masculine_singular")),
        "feminine_singular":       _str(row.get("feminine_singular")),
        "masculine_plural":        _str(row.get("masculine_plural")),
        "feminine_plural":         _str(row.get("feminine_plural")),
        "invariable":              _to_bool(row.get("invariable")),
        "position":                _str(row.get("position")),
        "comparative":             _str(row.get("comparative")),
        "superlative_relative":    _str(row.get("superlative_relative")),
        "superlative_absolute_ms": _str(row.get("superlative_absolute_ms")),
        "superlative_absolute_fs": _str(row.get("superlative_absolute_fs")),
        "superlative_absolute_mp": _str(row.get("superlative_absolute_mp")),
        "superlative_absolute_fp": _str(row.get("superlative_absolute_fp")),
    }


def _build_data_sv_verb(row: dict) -> dict:
    tenses = {}
    for col, label in [
        ("presens",           "PRESENS"),
        ("preteritum",        "PRETERITUM"),
        ("perfekt",           "PERFEKT"),
        ("pluskvamperfekt",   "PLUSKVAMPERFEKT"),
        ("futurum_ska",       "FUTURUM (ska)"),
        ("futurum_kommer_att","FUTURUM (kommer att)"),
        ("konditionalis",     "KONDITIONALIS"),
    ]:
        v = _str(row.get(col))
        if v:
            tenses[label] = {"—": v}

    return {
        "is_regular":         _to_bool(row.get("is_regular")),
        "auxiliary":          _str(row.get("auxiliary")),
        "is_reflexive":       _to_bool(row.get("is_reflexive")),
        "is_transitive":      _to_bool(row.get("is_transitive")),
        "verb_group":         _str(row.get("verb_group")),
        "infinitive":         _str(row.get("infinitive")) or _str(row.get("lemma")),
        "supine":             _str(row.get("supine")),
        "past_participle":    _str(row.get("past_participle")),
        "present_participle": _str(row.get("present_participle")),
        "imperative":         _str(row.get("imperative")),
        "tenses":    tenses or None,
    }


def _build_data_sv_noun(row: dict) -> dict:
    return {
        "gender":             _str(row.get("gender")),
        "declension_group":   _str(row.get("declension_group")),
        "indefinite_singular": _str(row.get("indefinite_singular")),
        "definite_singular":   _str(row.get("definite_singular")),
        "indefinite_plural":   _str(row.get("indefinite_plural")),
        "definite_plural":     _str(row.get("definite_plural")),
    }


def _build_data_sv_adjective(row: dict) -> dict:
    return {
        "common_singular":    _str(row.get("common_singular")),
        "neuter_singular":    _str(row.get("neuter_singular")),
        "plural_definite":    _str(row.get("plural_definite")),
        "is_invariable":      _to_bool(row.get("is_invariable")),
        "comparative":        _str(row.get("comparative")),
        "superlative":        _str(row.get("superlative")),
        "superlative_definite": _str(row.get("superlative_definite")),
    }


def _build_data_tr_verb(row: dict) -> dict:
    p = TR_VERB_PRONOUNS
    tenses = {}

    for prefix, label in [
        ("geniszaman",   "GENİŞ ZAMAN"),
        ("simdikizaman", "ŞİMDİKİ ZAMAN"),
        ("gelecekzaman", "GELECEK ZAMAN"),
        ("gecmiszaman",  "GEÇMİŞ ZAMAN (-DI)"),
        ("misligecmis",  "ÖĞRENİLEN GEÇMİŞ (-MIŞ)"),
        ("sart",         "ŞART KİPİ"),
        ("gereklilik",   "GEREKLİLİK KİPİ"),
    ]:
        t = _tense_tr(row, prefix, p)
        if t:
            tenses[label] = t

    imperative = {}
    for pron, col in [("sen", "imperative_sen"), ("siz", "imperative_siz")]:
        v = _str(row.get(col))
        if v:
            imperative[pron] = v

    return {
        "is_regular":          _to_bool(row.get("is_regular")),
        "is_reflexive":        _to_bool(row.get("is_reflexive")),
        "is_transitive":       _to_bool(row.get("is_transitive")),
        "verb_root":           _str(row.get("verb_root")),
        "vowel_harmony":       _str(row.get("vowel_harmony_group")),
        "infinitive":          _str(row.get("infinitive")) or _str(row.get("lemma")),
        "negative_infinitive": _str(row.get("negative_infinitive")),
        "present_participle":  _str(row.get("present_participle")),
        "past_participle":     _str(row.get("past_participle")),
        "verbal_noun":         _str(row.get("verbal_noun")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_tr_noun(row: dict) -> dict:
    cases = {}
    for col in ["nominative_singular", "accusative_singular", "dative_singular",
                "locative_singular",   "ablative_singular",   "genitive_singular",
                "nominative_plural",   "accusative_plural",   "dative_plural",
                "locative_plural",     "ablative_plural",     "genitive_plural"]:
        v = _str(row.get(col))
        if v:
            cases[col] = v

    possessive = {}
    for suffix, col in [("1sg", "possessive_1sg"), ("2sg", "possessive_2sg"),
                        ("3sg", "possessive_3sg"), ("1pl", "possessive_1pl"),
                        ("2pl", "possessive_2pl"), ("3pl", "possessive_3pl")]:
        v = _str(row.get(col))
        if v:
            possessive[suffix] = v

    return {
        "noun_root":     _str(row.get("noun_root")),
        "vowel_harmony": _str(row.get("vowel_harmony_group")),
        "cases":         cases or None,
        "possessive":    possessive or None,
    }


def _build_data_tr_adjective(row: dict) -> dict:
    return {
        "adjective_form":      _str(row.get("adjective_form")),
        "can_be_used_as_adverb": _to_bool(row.get("can_be_used_as_adverb")),
        "comparative":         _str(row.get("comparative")),
        "superlative":         _str(row.get("superlative")),
    }


def _build_data_ar_verb(row: dict) -> dict:
    madi_pronouns  = ["أنا", "أنتَ", "أنتِ", "هو", "هي", "أنتما", "هما (م)", "هما (ف)", "نحن", "أنتم", "أنتن", "هم", "هن"]
    madi_cols      = ["madi_ana", "madi_anta", "madi_anti", "madi_huwa", "madi_hiya",
                      "madi_antuma", "madi_huma_m", "madi_huma_f", "madi_nahnu", "madi_antum", "madi_antunna", "madi_hum", "madi_hunna"]
    mudari_cols    = ["mudari_ana", "mudari_anta", "mudari_anti", "mudari_huwa", "mudari_hiya",
                      "mudari_antuma", "mudari_huma_m", "mudari_huma_f", "mudari_nahnu", "mudari_antum", "mudari_antunna", "mudari_hum", "mudari_hunna"]
    subj_pronouns  = ["أنا", "أنتَ", "أنتِ", "هو", "هي", "نحن", "أنتم", "هم"]
    subj_cols      = ["subjunctive_ana", "subjunctive_anta", "subjunctive_anti", "subjunctive_huwa",
                      "subjunctive_hiya", "subjunctive_nahnu", "subjunctive_antum", "subjunctive_hum"]
    juss_cols      = ["jussive_ana", "jussive_anta", "jussive_anti", "jussive_huwa",
                      "jussive_hiya", "jussive_nahnu", "jussive_antum", "jussive_hum"]
    imp_pronouns   = ["أنتَ", "أنتِ", "أنتما", "أنتم", "أنتن"]
    imp_cols       = ["imperative_anta", "imperative_anti", "imperative_antuma", "imperative_antum", "imperative_antunna"]

    def _build(pronouns, cols):
        t = {}
        for pr, col in zip(pronouns, cols):
            v = _str(row.get(col))
            if v:
                t[pr] = v
        return t or None

    tenses = {}
    madi = _build(madi_pronouns, madi_cols)
    if madi:
        tenses["الماضي"] = madi
    mudari = _build(madi_pronouns, mudari_cols)
    if mudari:
        tenses["المضارع المرفوع"] = mudari
    subj = _build(subj_pronouns, subj_cols)
    if subj:
        tenses["المضارع المنصوب"] = subj
    juss = _build(subj_pronouns, juss_cols)
    if juss:
        tenses["المضارع المجزوم"] = juss

    imperative = _build(imp_pronouns, imp_cols)

    return {
        "root":             _str(row.get("root")),
        "verb_form_pattern": _str(row.get("verb_form_pattern")),
        "word_vowelled":    _str(row.get("word_vowelled")),
        "word_unvowelled":  _str(row.get("word_unvowelled")),
        "transliteration":  _str(row.get("transliteration")),
        "verbal_noun":      _str(row.get("verbal_noun")),
        "active_participle": _str(row.get("active_participle")),
        "passive_participle": _str(row.get("passive_participle")),
        "tenses":    tenses or None,
        "imperative": imperative or None,
    }


def _build_data_ar_noun(row: dict) -> dict:
    return {
        "root":             _str(row.get("root")),
        "word_vowelled":    _str(row.get("word_vowelled")),
        "word_unvowelled":  _str(row.get("word_unvowelled")),
        "transliteration":  _str(row.get("transliteration")),
        "gender":           _str(row.get("gender")),
        "singular_indefinite": _str(row.get("singular_indefinite")),
        "singular_definite":   _str(row.get("singular_definite")),
        "singular_nominative": _str(row.get("singular_nominative")),
        "singular_accusative": _str(row.get("singular_accusative")),
        "singular_genitive":   _str(row.get("singular_genitive")),
        "dual_nominative":     _str(row.get("dual_nominative")),
        "dual_accusative_genitive": _str(row.get("dual_accusative_genitive")),
        "broken_plural":       _str(row.get("broken_plural")),
        "broken_plural_vowelled": _str(row.get("broken_plural_vowelled")),
        "sound_plural_m":      _str(row.get("sound_plural_m")),
        "sound_plural_f":      _str(row.get("sound_plural_f")),
        "plural_definite":     _str(row.get("plural_definite")),
    }


def _build_data_ar_adjective(row: dict) -> dict:
    return {
        "root":                 _str(row.get("root")),
        "word_vowelled":        _str(row.get("word_vowelled")),
        "word_unvowelled":      _str(row.get("word_unvowelled")),
        "transliteration":      _str(row.get("transliteration")),
        "masculine_singular":   _str(row.get("masculine_singular")),
        "feminine_singular":    _str(row.get("feminine_singular")),
        "masculine_plural":     _str(row.get("masculine_plural")),
        "feminine_plural":      _str(row.get("feminine_plural")),
        "dual_masculine":       _str(row.get("dual_masculine")),
        "dual_feminine":        _str(row.get("dual_feminine")),
        "masculine_singular_definite": _str(row.get("masculine_singular_definite")),
        "feminine_singular_definite":  _str(row.get("feminine_singular_definite")),
        "elative":              _str(row.get("elative")),
        "root_family":          _str(row.get("root_family")),
    }


def _build_data_adverb(row: dict) -> dict:
    return {
        "adverb_type":         _str(row.get("adverb_type")),
        "formation":           _str(row.get("formation")),
        "position_in_sentence": _str(row.get("position_in_sentence")),
    }


def _build_data_other(row: dict) -> dict:
    return {
        "word_type_detail": _str(row.get("word_type")),
        "related_words":    _str(row.get("related_words")),
    }


# ── Per-language dispatch ──────────────────────────────────────────────────────

DATA_BUILDERS = {
    "de": {
        "verb":      _build_data_de_verb,
        "noun":      _build_data_de_noun,
        "adjective": _build_data_de_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "fr": {
        "verb":      _build_data_fr_verb,
        "noun":      _build_data_fr_noun,
        "adjective": _build_data_fr_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "es": {
        "verb":      _build_data_es_verb,
        "noun":      _build_data_es_noun,
        "adjective": _build_data_es_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "it": {
        "verb":      _build_data_it_verb,
        "noun":      _build_data_it_noun,
        "adjective": _build_data_it_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "sv": {
        "verb":      _build_data_sv_verb,
        "noun":      _build_data_sv_noun,
        "adjective": _build_data_sv_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "tr": {
        "verb":      _build_data_tr_verb,
        "noun":      _build_data_tr_noun,
        "adjective": _build_data_tr_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
    "ar": {
        "verb":      _build_data_ar_verb,
        "noun":      _build_data_ar_noun,
        "adjective": _build_data_ar_adjective,
        "adverb":    _build_data_adverb,
        "other":     _build_data_other,
    },
}


# ── Row reader ─────────────────────────────────────────────────────────────────

def _read_sheet(wb, sheet_name: str):
    if sheet_name not in wb.sheetnames:
        return []
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    result = []
    for row in rows[1:]:
        d = {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
        result.append(d)
    return result


def _clean_data_dict(d: dict) -> dict:
    """Recursively remove None values from a dict."""
    out = {}
    for k, v in d.items():
        if v is None:
            continue
        if isinstance(v, dict):
            cleaned = _clean_data_dict(v)
            if cleaned:
                out[k] = cleaned
        else:
            out[k] = v
    return out


def _excel_row_to_db_row(row: dict, lang: str, word_type: str):
    lemma = _str(row.get("lemma"))
    if not lemma:
        return None
    # word always equals the root/lemma form to avoid surface-form duplicates
    root = lemma.lower()

    builder = DATA_BUILDERS.get(lang, {}).get(word_type, _build_data_other)
    data = _clean_data_dict(builder(row))

    return {
        "word_id":              _str(row.get("word_id")),
        "language":             lang,
        "word":                 root,
        "lemma":                root,
        "word_type":            word_type,
        "frequency_rank":       int(row["frequency_rank"]) if row.get("frequency_rank") else None,
        "translation":          _str(row.get("translation")),
        "level":                _str(row.get("level")),
        "ipa":                  _str(row.get("ipa_main")),
        "explanation":          _str(row.get("explanation")),
        "example_sentence":     _str(row.get("example_sentence")),
        "example_translation":  _str(row.get("example_translation")),
        "tip":                  _str(row.get("tip")),
        "word_family":          _str(row.get("word_family")),
        "common_collocations":  _str(row.get("common_collocations")),
        "governed_prepositions":_str(row.get("governed_prepositions") or row.get("governed_postpositions")),
        "source":               "excel",
        "data":                 data if data else None,
    }


# ── Env loader ────────────────────────────────────────────────────────────────

def _load_env() -> dict:
    env: dict = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


# ── Main ───────────────────────────────────────────────────────────────────────

BATCH_SIZE = 100


def main():
    parser = argparse.ArgumentParser(description="Import Excel dictionaries into Supabase word_dictionary")
    parser.add_argument("--excel-dir", default=str(DEFAULT_EXCEL_DIR), help="Directory containing BB_Dictionary_*.xlsx")
    parser.add_argument("--dry-run",   action="store_true", help="Parse but do not write to Supabase")
    parser.add_argument("--lang",      help="Only import this language code (de/fr/es/it/sv/tr/ar)")
    args = parser.parse_args()

    excel_dir = Path(args.excel_dir)
    dry_run   = args.dry_run
    only_lang = args.lang

    print(f"[import] Excel dir: {excel_dir}")
    print(f"[import] Mode: {'DRY-RUN' if dry_run else 'LIVE'}")

    # ── Supabase client ──────────────────────────────────────────────────────
    supa = None
    if not dry_run:
        env = _load_env()
        supa_url = env.get("EXPO_PUBLIC_SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL", "")
        supa_key = env.get("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not supa_url or not supa_key:
            print("[ERROR] Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
            sys.exit(1)
        from supabase import create_client
        supa = create_client(supa_url, supa_key)
        print("[import] Supabase client initialised")

    total_rows = 0
    total_written = 0
    total_skipped = 0

    langs = [only_lang] if only_lang else list(EXCEL_FILES.keys())

    for lang in langs:
        fname = EXCEL_FILES.get(lang)
        if not fname:
            print(f"[WARN] No Excel file configured for language: {lang}")
            continue

        fpath = excel_dir / fname
        if not fpath.exists():
            print(f"[WARN] File not found: {fpath}")
            continue

        print(f"\n[import] Loading {fpath.name}...")
        wb = openpyxl.load_workbook(fpath, read_only=True, data_only=True)

        # Deduplicate: first row per (lemma, word_type) wins
        seen: dict[tuple, dict] = {}

        for sheet_name, word_type in SHEET_TO_WORD_TYPE.items():
            rows = _read_sheet(wb, sheet_name)
            sheet_count = 0
            for raw_row in rows:
                db_row = _excel_row_to_db_row(raw_row, lang, word_type)
                if not db_row:
                    continue
                key = (db_row["lemma"], word_type)
                if key not in seen:
                    seen[key] = db_row
                    sheet_count += 1
                # else: duplicate lemma in sheet — skip

            print(f"  [{sheet_name}] {sheet_count} unique rows")

        wb.close()

        all_rows = list(seen.values())
        total_rows += len(all_rows)
        print(f"  Total unique rows for {lang}: {len(all_rows)}")

        if dry_run:
            # Print a sample
            for r in all_rows[:3]:
                print(f"    Sample: {r['word_type']} '{r['lemma']}' → {r['translation']}")
                if r.get("data"):
                    tenses = r["data"].get("tenses", {})
                    print(f"           tenses: {list(tenses.keys())[:4]}")
            continue

        # ── Write in batches ─────────────────────────────────────────────────
        for start in range(0, len(all_rows), BATCH_SIZE):
            batch = all_rows[start:start + BATCH_SIZE]
            try:
                resp = supa.table("word_dictionary").upsert(
                    batch,
                    on_conflict="language,lemma,word_type",
                ).execute()
                total_written += len(batch)
                print(f"  [{lang}] wrote rows {start+1}–{start+len(batch)}")
            except Exception as e:
                print(f"  [ERROR] [{lang}] batch {start}–{start+BATCH_SIZE} failed: {e}", file=sys.stderr)
                total_skipped += len(batch)

    print(f"\n[import] Done — {total_rows} rows parsed, {total_written} written, {total_skipped} failed")


if __name__ == "__main__":
    main()
