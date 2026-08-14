"""
bilinguist_write.py
===================
Stages 5-8 of the Bilinguist Brief daily pipeline:
  5 Write Native  6 Grade Native  7 Write Levels  8 Grade Levels
(Internal stage keys 3/4a/2S/2B/2M/4b are kept for the cost report.)

Reads the factbase produced by bilinguist_gather.py and:
  2S — Short writing (B1+)  : gemini-2.5-flash  Concurrent  B1+/Native short
  2B — Beginner writing     : gemini-2.5-flash  Concurrent  A1/A2 all lengths
  2M — Medium/long (B1+)    : gemini-2.5-flash  Concurrent  B1+/Native medium (2 batches) + longer (3 batches)
  3  — Native journalism    : gemini-2.5-flash  Concurrent  one per language (2 proactive batches)
  4  — Grading              : gemini-2.5-flash  Sequential  grades Stage 5 output

Proactive splitting (2M and 3): medium→2 batches, longer→3 batches, native→2 batches.
This eliminates MAX_TOKENS cascades by keeping each output stream well within 8192 tokens.

A1/A2 tasks run on gemini-2.5-flash (same model as B1+). Article output for beginner
levels is small enough (~110–190 words × 10 stories) that proactive splitting is not needed.

Outputs:
  scripts/output/YYYY-MM-DD.json   — archived bundle
  scripts/output/latest.json       — overwritten daily (app fetches this)
  scripts/output/costs_YYYY-MM-DD.json — per-stage token usage and GBP cost

Bundle format (DailyBundle) is the contract with the React Native app.

Usage:
    python bilinguist_write.py [--date YYYY-MM-DD]

Requirements:
    pip install google-genai
    export GEMINI_API_KEY=your_key_from_aistudio.google.com
"""

import argparse
import json
import os
import random
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Optional

from google import genai
from google.genai import types



# ── Models ───────────────────────────────────────────────────────────────────

MODEL_BEGINNER = "gemini-2.5-flash"          # A1/A2: same model as B1+ for reliability
MODEL_2S = "gemini-2.5-flash"               # B1+/Native short lengths
MODEL_2M = "gemini-2.5-flash"               # B1+/Native medium and longer
MODEL_3  = "gemini-2.5-pro"                 # Native journalism, one per language
MODEL_4A = "gemini-2.5-flash"               # P4a: grade native journalism → overall CEFR level
MODEL_5B = "gemini-2.5-flash"               # Stage 5b: verify native against the factbase
MODEL_4B = "gemini-2.5-flash"               # P4b: grade CEFR level articles (quality gate)

# ── Writer backend (test only) ────────────────────────────────────────────────
# Grading (4a/4b), fact-check (5b) and gather stay on Gemini always -- this only ever
# swaps which model writes native (stage 3) and CEFR levels (2S/2B/2M). Default is
# Gemini (production); --api claude switches those stages to the Claude API, isolated
# to test workflows. Never used in generate-briefings.yml.
WRITER_BACKEND: str = "gemini"
CLAUDE_MODEL_MAIN     = "claude-sonnet-4-5-20250929"  # native + B1+ levels
CLAUDE_MODEL_BEGINNER = "claude-haiku-4-5-20251001"   # A1/A2 levels


def _resolve_model(gemini_model: str, is_beginner: bool) -> str:
    """Pick the model for a write-stage (3/2S/2B/2M) task, honouring WRITER_BACKEND."""
    if WRITER_BACKEND == "claude":
        return CLAUDE_MODEL_BEGINNER if is_beginner else CLAUDE_MODEL_MAIN
    return gemini_model


def _resolve_verify_grade_model(gemini_model: str) -> str:
    """
    Pick the model for stage 5b (verify native) and stage 8/4b (grade levels), honouring
    WRITER_BACKEND. Unlike _resolve_model, these always use Haiku under Claude -- both are
    checks against known text, not native/B1+ generation, so the cheaper model applies
    regardless of the level being graded. Stage 6/4a (grade native) is NOT covered by this
    -- it stays on Gemini even when WRITER_BACKEND is "claude".
    """
    return CLAUDE_MODEL_BEGINNER if WRITER_BACKEND == "claude" else gemini_model

# Concurrency limit — 4 workers keeps Gemini 2.5 Flash 503 rate low now that the
# level matrix has expanded (~88+ writing calls vs ~50 before). 10 workers caused
# cascade failures; 6 was OK with fewer levels but too aggressive now.
_MAX_WORKERS   = 4
_API_SEMAPHORE = threading.Semaphore(_MAX_WORKERS)

# ── A/B experiment switches (set from CLI in main) ───────────────────────────
# PER_ARTICLE: one API call per (language, level, length, story) instead of one
# call writing every story at once. Set via --per-article.
# SERVICE_TIER: "flex" requests the 50%-discount tier (1-15 min latency,
# sheddable). None = standard. Set via --tier. Applies to every stage unless a
# stage has its own entry in SERVICE_TIER_BY_STAGE, which takes precedence.
PER_ARTICLE: bool = False
SERVICE_TIER: Optional[str] = None

# Flex was on for stages "3" (native), "2B"/"2S"/"2M" (level rewrite), and "4b" (grading) —
# turned off 2026-08-11 for faster iteration while re-testing after the thinking_budget=0
# fix. Re-add entries here (value "flex") to turn it back on per stage; every stage falls
# back to --tier/SERVICE_TIER when absent from this dict.
SERVICE_TIER_BY_STAGE: dict[str, str] = {}

# gemini-2.5-pro rejects thinking_budget=0 outright ("Budget 0 is invalid. This model
# only works in thinking mode.") — confirmed 2026-08-11: every Stage 5 (native) call
# failed on every retry with this exact 400, for all 6 languages, burning ~11 minutes
# before falling through to the factbase-write fallback for every article. Flash is fine
# with budget=0 (default for every other stage); Pro (stage "3") needs a real budget.
# 1024 matches the value gather.py already uses successfully for its own Pro fallback.
THINKING_BUDGET_BY_STAGE: dict[str, int] = {"3": 1024}

# LEVELS_FROM: "factbase" writes each level article from the fact-base (today's
# behaviour, arm A). "native" rewrites the graded native article of the same language,
# length and story down to the target level (arm B). Set via --levels-from.
LEVELS_FROM: str = "factbase"

# ALL_LEVELS: A/B only — write every CEFR level below the native grade instead of just
# the levels in LANGUAGE_LEVELS, so the rewrite is measured across compression ratios
# (A1/longer is 250→110, B1/longer is 250→160). Set via --all-levels.
ALL_LEVELS: bool = False

# SIMPLE_REWRITE: test-pipeline only. When True and LEVELS_FROM == "native", Stage 7 uses
# PROMPT_LEVEL_REWRITE_SIMPLE instead of the real rewrite prompt — no KEEP list, no
# CUT_RULE/GLOSS_RULE/ATTRIBUTION_RULE, just level+word-count. Set via --simple-rewrite.
# Never used in production; wired to a separate workflow that never pushes to the data repo.
SIMPLE_REWRITE: bool = False

# RELAX_TITLES_A1: test-pipeline only. When True and LEVELS_FROM == "native", the real
# rewrite prompt is used (CUT_RULE/GLOSS_RULE/ATTRIBUTION_RULE all still apply) but A1's
# title/name rule is relaxed from strict-verbatim to may-simplify. Isolates whether verbatim
# titles specifically are why A1 keeps grading as A2+, separate from the fully-stripped
# --simple-rewrite test. Set via --relax-titles-a1. Never used in production.
RELAX_TITLES_A1: bool = False

# {(lang, length, slug): native article} — populated when LEVELS_FROM == "native" so a
# level task can find the one article it is rewriting.
_NATIVE_INDEX: dict = {}

# Stage 6's grade per language. The rewrite needs it: how far a level sits BELOW native
# decides whether it can keep every fact or has to carry fewer to have room to simplify.
_NATIVE_GRADES: dict = {}


def _index_native(native_journalism: dict) -> dict:
    idx = {}
    for lang, by_length in (native_journalism or {}).items():
        if not isinstance(by_length, dict):
            continue
        for length, arts in by_length.items():
            for a in arts or []:
                if a.get("slug"):
                    idx[(lang, length, a["slug"])] = a
    return idx


def _set_workers(n: int) -> None:
    """Resize the concurrency cap. Per-article mode fans out to hundreds of small
    calls, and Flex adds minutes of latency each — at 4 workers that serialises
    into hours, so the cap has to move with the mode."""
    global _MAX_WORKERS, _API_SEMAPHORE
    _MAX_WORKERS = n
    _API_SEMAPHORE = threading.Semaphore(n)

# Retry settings for transient API errors.
# Delays are SHORT — jitter below breaks the thundering-herd where all 4 workers
# would otherwise retry at the exact same instant, causing a second 503 wave.
MAX_RETRIES   = 4
RETRY_DELAYS  = [5, 15, 30, 60]   # base seconds; actual sleep = delay × (0.5–1.5)

# If a single-call task returns fewer articles than this, retry (model gave lazy response).
_MIN_ARTICLES_EXPECTED = 5
_THIN_RETRY_LIMIT      = 2

# ── Response schemas ──────────────────────────────────────────────────────────
# Passed as response_schema to GenerateContentConfig on write stages so the API
# engine enforces output structure — replaces prompt-pressure JSON instructions.

_SCHEMA_WRITING = {
    "type": "object",
    "properties": {
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":    {"type": "string"},
                    "slug":     {"type": "string"},
                    "headline": {"type": "string"},
                    "body":     {"type": "string"},
                },
                "required": ["genre", "slug", "headline", "body"],
            },
        },
    },
    "required": ["articles"],
}

# One story per call — the response is a bare object. The array schema below is kept for
# the legacy batched path, which really does write several stories in one call. The
# schema, not the prompt, is what actually constrains Gemini's shape.
_SCHEMA_ARTICLE = {
    "type": "object",
    "properties": {
        "genre":    {"type": "string"},
        "slug":     {"type": "string"},
        "headline": {"type": "string"},
        "body":     {"type": "string"},
    },
    "required": ["genre", "slug", "headline", "body"],
}

_SCHEMA_NATIVE = {
    "type": "object",
    "properties": {
        "articles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":    {"type": "string"},
                    "slug":     {"type": "string"},
                    "headline": {"type": "string"},
                    "body":     {"type": "string"},
                },
                "required": ["genre", "slug", "headline", "body"],
            },
        },
    },
    "required": ["articles"],
}

_SCHEMA_VERIFY = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["ok", "issues"]},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type":     {"type": "string",
                                 "enum": ["INVENTED", "CHANGED", "CONTRADICTED", "WRONG"]},
                    "quote":    {"type": "string"},
                    "factbase": {"type": "string"},
                    "why":      {"type": "string"},
                },
                "required": ["type", "quote", "factbase", "why"],
            },
        },
    },
    "required": ["verdict", "findings"],
}

_SCHEMA_GRADING = {
    "type": "object",
    "properties": {
        "assessments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "genre":     {"type": "string"},
                    "slug":      {"type": "string"},
                    "level":     {"type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"]},
                    "length":    {"type": "string", "enum": ["short", "medium", "longer"]},
                    "reasoning": {"type": "string"},
                },
                "required": ["genre", "slug", "level", "length", "reasoning"],
            },
        },
    },
    "required": ["assessments"],
}

# P4a schema — single overall CEFR level per language (one call per language)
_SCHEMA_GRADE_NATIVE = {
    "type": "object",
    "properties": {
        "cefr_level": {"type": "string", "enum": ["A1", "A2", "B1", "B2", "C1", "C2"]},
        "reasoning":  {"type": "string"},
    },
    "required": ["cefr_level", "reasoning"],
}


# ── Token-usage tracking (thread-safe) ───────────────────────────────────────

@dataclass
class _StageUsage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0

_usage_lock = threading.Lock()
_stage_usage: dict[str, _StageUsage] = {
    "2S": _StageUsage(),
    "2B": _StageUsage(),
    "2M": _StageUsage(),
    "3":  _StageUsage(),
    "4a": _StageUsage(),  # grade native journalism → overall CEFR level (Flash-Lite)
    "5b": _StageUsage(),  # verify native against the factbase
    "4b": _StageUsage(),  # grade CEFR level articles (Flash-Lite)
}


@dataclass
class _WriteTask:
    stage: str
    lang: str
    level: Optional[str]
    length: Optional[str]
    model: str
    prompt: str
    schema: Optional[dict]
    max_output_tokens: Optional[int]
    template: Optional[str]   # stored for proactive split-batch prompt building
    factbase: Optional[list]  # stored for proactive split-batch prompt building
    n_splits: int = 1         # 1 = single call; >1 = proactive split into N batches

# Gemini 2.5 Flash pricing (USD per 1M tokens) — verify at ai.google.dev/pricing
FLASH_INPUT_USD_PER_M  = 0.30
FLASH_OUTPUT_USD_PER_M = 2.50
FLASH_THINK_USD_PER_M  = 3.50

# Gemini 2.5 Flash Flex pricing (50% discount over standard Flash rates) — Stage 7
FLASH_FLEX_INPUT_USD_PER_M  = FLASH_INPUT_USD_PER_M  * 0.5
FLASH_FLEX_OUTPUT_USD_PER_M = FLASH_OUTPUT_USD_PER_M * 0.5
FLASH_FLEX_THINK_USD_PER_M  = FLASH_THINK_USD_PER_M  * 0.5

# Gemini 2.0 Flash pricing (no thinking tokens) — verify at ai.google.dev/pricing
FLASH2_INPUT_USD_PER_M  = 0.10
FLASH2_OUTPUT_USD_PER_M = 0.40

# Gemini 2.0 Flash-Lite pricing — verify at ai.google.dev/pricing
FLASH_LITE_INPUT_USD_PER_M  = 0.075
FLASH_LITE_OUTPUT_USD_PER_M = 0.30

# Gemini 2.5 Pro standard pricing
PRO_INPUT_USD_PER_M  = 1.25
PRO_OUTPUT_USD_PER_M = 10.00
PRO_THINK_USD_PER_M  = 3.50

# Gemini 2.5 Pro Flex pricing (50 % discount over standard Pro rates)
PRO_FLEX_INPUT_USD_PER_M  = PRO_INPUT_USD_PER_M  * 0.5
PRO_FLEX_OUTPUT_USD_PER_M = PRO_OUTPUT_USD_PER_M * 0.5
PRO_FLEX_THINK_USD_PER_M  = PRO_THINK_USD_PER_M  * 0.5

USD_TO_GBP = 0.79  # approximate — update as needed

# Claude pricing (USD per 1M tokens) — verify at anthropic.com/pricing. Test backend only.
CLAUDE_SONNET_INPUT_USD_PER_M  = 3.00
CLAUDE_SONNET_OUTPUT_USD_PER_M = 15.00
CLAUDE_HAIKU_INPUT_USD_PER_M   = 1.00
CLAUDE_HAIKU_OUTPUT_USD_PER_M  = 5.00


# ── CEFR ordering (used by skip logic in build_combinations) ─────────────────
# Levels in ascending difficulty. P4a grades native journalism to a position in
# this list; P2S/2M then only writes levels strictly below that position.
CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"]

# ── Language / level matrix ───────────────────────────────────────────────────
# Testing phase matrix — add languages/levels here as pipeline is validated.

LANGUAGE_LEVELS: dict[str, list[str]] = {
    "fr": ["A2", "Native"],
    "de": ["A2", "Native"],
    "sv": ["Native"],
    "en": ["Native"],
    "it": ["A2", "Native"],
    "es": ["A2"],
    "tr": [],  # temporarily disabled to cut prompt cost during testing
    "hu": [],  # temporarily disabled to cut prompt cost during testing
    "ar": [],  # temporarily disabled to cut prompt cost during testing
}

LANGUAGE_NAMES: dict[str, str] = {
    "fr": "French",
    "de": "German",
    "en": "English",
    "sv": "Swedish",
    "es": "Spanish",
    "it": "Italian",
    "tr": "Turkish",
    "hu": "Hungarian",
    "ar": "Arabic (Modern Standard)",
}

LEVEL_LABELS: dict[str, str] = {
    "A1":     "Beginner",
    "A2":     "Elementary",
    "B1":     "Intermediate",
    "B2":     "Upper Intermediate",
    "C1":     "Advanced",
    "C2":     "Challenge",
    "Native": "Native",
}

WORDS_PER_ARTICLE: dict[str, dict[str, str]] = {
    # Same LENGTH at every level — only the reading level changes. A learner comparing A2
    # with Native then reads the same story at the same size in simpler language, which is
    # what makes the levels comparable. A1 alone is a little shorter.
    # CANONICAL bands, before the per-language factor in LANGUAGE_WORD_FACTOR. Short was
    # recalibrated on 2026-08-10: native short wrote 104 on average against an inherited
    # 85-100, a band that had never been measured the way longer was.
    # Bumped from 85-105/180-200 on 2026-08-12 -- test run measured the model consistently
    # undershooting the old band (133w/167-186 target in German, 154w/196-218 in French)
    # under the new GRAMMAR_RULE_A1 constraint. Testing whether a higher target moves real
    # output up, or whether the model self-limits content regardless of the ceiling.
    "A1":     {"short": "100–125", "longer": "210–235"},
    "A2":     {"short": "95–115",  "longer": "210–230"},
    "B1":     {"short": "95–115",  "longer": "210–230"},
    "B2":     {"short": "95–115",  "longer": "210–230"},
    "C1":     {"short": "95–115",  "longer": "210–230"},
    "C2":     {"short": "95–115",  "longer": "210–230"},
    # Native is NOT written from this table — the range is hardcoded in
    # PROMPT_3_HEADER / PROMPT_3_SHORT_HEADER. Kept here so the reporting targets in
    # bilinguist_check.py have one place to track. Change all three together.
    "Native": {"short": "95–115",  "longer": "210–230"},
}

# C1 is the native/journalistic writing tier — "Native" maps to C1 prompt level.
NATIVE_WRITING_LEVEL = "C1"

ACTIVE_LANGUAGES = [lang for lang in LANGUAGE_LEVELS if LANGUAGE_LEVELS[lang]]

# Every active language needs a native article, because Stage 7 rewrites it down to each
# level. Spanish lists only A2, so it used to get no native at all and its levels fell
# back to writing from the fact-base — the one language that could not use the pipeline.
# It now gets a native article as an INTERMEDIATE: written, graded and rewritten from,
# but kept out of nativeJournalism so the app does not offer a Spanish Native edition
# (the app decides that tab exists purely by nativeJournalism[lang] being non-empty).
NATIVE_PUBLISHED = [l for l in ACTIVE_LANGUAGES if "Native" in LANGUAGE_LEVELS[l]]
NATIVE_INTERMEDIATE = [l for l in ACTIVE_LANGUAGES if "Native" not in LANGUAGE_LEVELS[l]]


# ── Combination matrix ────────────────────────────────────────────────────────

def _active_levels() -> dict:
    """LANGUAGE_LEVELS, or every CEFR level below native when --all-levels is set.

    Now production behaviour (Will, 2026-08-11): every active language writes every
    CEFR level below its native grade, not just the subset listed in LANGUAGE_LEVELS.
    A language is eligible if it has ANY native article to rewrite from — published
    (NATIVE_PUBLISHED) or intermediate (NATIVE_INTERMEDIATE, e.g. Spanish, which has
    no shipped Native edition but still gets levels rewritten from an internal one).
    Checking "Native" in LANGUAGE_LEVELS missed Spanish entirely, since its entry is
    just ["A2"] — fixed to check actual native availability instead.
    Languages with no native at all are left alone (nothing to rewrite from).
    """
    if not ALL_LEVELS:
        return LANGUAGE_LEVELS
    out = {}
    for lang, levels in LANGUAGE_LEVELS.items():
        if not levels:
            out[lang] = levels                      # disabled language, stays disabled
        elif lang in NATIVE_PUBLISHED or lang in NATIVE_INTERMEDIATE:
            out[lang] = list(CEFR_ORDER)            # CEFR_ORDER already ends with "Native"
        else:
            out[lang] = levels                      # no native to rewrite from
    return out


def build_combinations(
    native_grades: Optional[dict] = None,
) -> tuple[list[tuple[str, str, str]], list[tuple[str, str, str]]]:
    """
    Returns (combos_2s, combos_2m).
    combos_2s → short length for all eligible CEFR levels
    combos_2m → medium + longer for all eligible CEFR levels

    native_grades: dict[lang, cefr_level] from P4a. For each language, levels at
    or above the native grade are skipped — P3 native journalism already covers them.
    "Native" is always excluded here (Stage 5 handles it).
    """
    combos_2s: list[tuple[str, str, str]] = []
    combos_2m: list[tuple[str, str, str]] = []

    for lang, levels in _active_levels().items():
        # Determine the skip threshold from P4a output
        skip_from_idx = len(CEFR_ORDER)  # default: skip nothing
        if native_grades and lang in native_grades:
            native_cefr = native_grades[lang]
            if native_cefr in CEFR_ORDER:
                skip_from_idx = CEFR_ORDER.index(native_cefr)

        for level in levels:
            if level == "Native":
                continue  # always handled by Stage 5
            if level not in CEFR_ORDER:
                continue
            if CEFR_ORDER.index(level) >= skip_from_idx:
                continue  # at or above native grade — skip
            combos_2s.append((lang, level, "short"))
            combos_2m.append((lang, level, "longer"))

    return combos_2s, combos_2m


# ── JSON helpers ──────────────────────────────────────────────────────────────

import re as _re


def parse_plain_article(raw: str, genre: str, slug: str) -> Optional[dict]:
    """Parse the HEADLINE:/BODY: plain-text format (Stage 5 native + translation calls)
    into the same {genre, slug, headline, body} shape the JSON schema path produces."""
    if not raw:
        return None
    m_headline = _re.search(r"HEADLINE:\s*(.+?)\n", raw)
    m_body = _re.search(r"BODY:\s*\n?(.*)", raw, _re.DOTALL)
    headline = m_headline.group(1).strip() if m_headline else ""
    body = m_body.group(1).strip() if m_body else raw.strip()
    if not headline or not body:
        return None
    return {"genre": genre, "slug": slug, "headline": headline, "body": body}


def build_translate_prompt(lang: str, en_article: dict, target_words: str) -> str:
    """Stage 5 translation arm: translate the already-written EN native article into
    `lang` as that language's own outlet would write it, not word-for-word."""
    return (TRANSLATE_PROMPT_TEMPLATE
            .replace("{LANGUAGE}", LANGUAGE_NAMES.get(lang, lang))
            .replace("{OUTLET}", NATIVE_OUTLETS.get(lang, NATIVE_OUTLET_FALLBACK))
            .replace("{QUOTE_RULE}", QUOTE_RULES.get(lang, QUOTE_RULE_FALLBACK))
            .replace("{VARIANT_RULE}", VARIANT_RULES.get(lang, ""))
            .replace("{TARGET}", target_words)
            .replace("{OUTPUT_FORMAT}", OUTPUT_FORMAT_PLAIN_SINGLE)
            .replace("{HEADLINE}", en_article.get("headline", ""))
            .replace("{BODY}", en_article.get("body", "")))


def parse_llm_json(raw: str) -> Optional[dict]:
    """Extract and parse a JSON object, tolerating fences/preamble. Fails soft."""
    if not raw:
        return None
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


# ── Prompt builders ───────────────────────────────────────────────────────────

# ── Prompt selection ──────────────────────────────────────────────────────────
# Pass --test to use bilinguist_prompts_test.py (your edit sandbox).
# Production prompts are locked in bilinguist_prompts.py.
import sys as _sys
if '--test' in _sys.argv:
    from bilinguist_prompts_test import (
        PROMPT_2S_HEADER, PROMPT_2M_HEADER,
        PROMPT_3_HEADER, PROMPT_3_SHORT_HEADER,
        PROMPT_4_HEADER, PROMPT_4A_HEADER,
        LEVEL_DESCRIPTIONS, LENGTH_INSTRUCTIONS, VARIANT_RULES,
        OUTPUT_FORMAT_SINGLE, OUTPUT_FORMAT_ARRAY,
        NATIVE_OUTLETS, NATIVE_OUTLET_FALLBACK,
        PROMPT_5B_VERIFY, PROMPT_LEVEL_REWRITE, PROMPT_LEVEL_REWRITE_SIMPLE, QUOTE_RULES, QUOTE_RULE_FALLBACK, PROMPT_LEVEL_STRUCTURE,
        REWRITE_CUT_RULES, GLOSS_RULE_BEGINNER, GLOSS_RULE_FALLBACK,
        ATTRIBUTION_RULE_BEGINNER, ATTRIBUTION_RULE_FALLBACK,
        TITLE_RULE_STRICT, TITLE_RULE_RELAXED_A1,
        GLOSS_JUDGE_RULE_BEGINNER, GLOSS_JUDGE_RULE_FALLBACK,
        PROMPT_NATIVE_TEMPLATE, NATIVE_FRAMING, STRUCTURE_BY_LENGTH_NATIVE,
        GENRE_RULES, GENRE_RULE_FALLBACK, NATIVE_WORD_RULE,
        LANGUAGE_WORD_FACTOR, word_band,
    )
    print("[write] TEST MODE — using bilinguist_prompts_test.py")
else:
    from bilinguist_prompts import (
        PROMPT_2S_HEADER, PROMPT_2M_HEADER,
        PROMPT_3_HEADER, PROMPT_3_SHORT_HEADER,
        PROMPT_4_HEADER, PROMPT_4A_HEADER,
        LEVEL_DESCRIPTIONS, LENGTH_INSTRUCTIONS, VARIANT_RULES,
        OUTPUT_FORMAT_SINGLE, OUTPUT_FORMAT_ARRAY, OUTPUT_FORMAT_PLAIN_SINGLE,
        TRANSLATE_PROMPT_TEMPLATE,
        NATIVE_OUTLETS, NATIVE_OUTLET_FALLBACK,
        PROMPT_5B_VERIFY, PROMPT_LEVEL_REWRITE, PROMPT_LEVEL_REWRITE_SIMPLE, QUOTE_RULES, QUOTE_RULE_FALLBACK, PROMPT_LEVEL_STRUCTURE,
        REWRITE_CUT_RULES, GLOSS_RULE_BEGINNER, GLOSS_RULE_FALLBACK,
        ATTRIBUTION_RULE_BEGINNER, ATTRIBUTION_RULE_FALLBACK,
        GRAMMAR_RULE_A1, GRAMMAR_RULE_A2, GRAMMAR_RULE_FALLBACK,
        TITLE_RULE_STRICT, TITLE_RULE_RELAXED_A1,
        GLOSS_JUDGE_RULE_BEGINNER, GLOSS_JUDGE_RULE_FALLBACK,
        PROMPT_NATIVE_TEMPLATE, NATIVE_FRAMING, STRUCTURE_BY_LENGTH_NATIVE,
        GENRE_RULES, GENRE_RULE_FALLBACK, NATIVE_WORD_RULE,
        LANGUAGE_WORD_FACTOR, word_band,
    )

# Prompts are now in bilinguist_prompts.py (prod) / bilinguist_prompts_test.py (test).
# Imported above via the --test conditional block.


def build_writing_prompt(template: str, lang: str, level: str, length: str, factbase: list) -> str:
    """Build a complete prompt by injecting variables and appending the factbase."""
    word_count = WORDS_PER_ARTICLE.get(level, WORDS_PER_ARTICLE["C1"])[length]
    lang_name = LANGUAGE_NAMES.get(lang, lang)

    # Canonical band adjusted for this language's word density.
    _lo, _hi = word_band(word_count, lang)
    word_min, word_max = str(_lo), str(_hi)

    length_labels = {"short": "Concise", "medium": "Balanced", "longer": "Long-form"}
    length_label = length_labels.get(length, length)

    level_desc = LEVEL_DESCRIPTIONS.get(level, f"Certified CEFR {level}.")
    length_instr = LENGTH_INSTRUCTIONS.get(length, "")
    length_instr = length_instr.replace("{WORD_MIN}", word_min).replace("{WORD_MAX}", word_max)
    variant_rule = VARIANT_RULES.get(lang, "")

    prompt = template
    prompt = prompt.replace("{LANGUAGE}", lang_name)
    prompt = prompt.replace("{WORD_COUNT}", str(word_count))
    prompt = prompt.replace("{WORD_MIN}", word_min)
    prompt = prompt.replace("{WORD_MAX}", word_max)
    prompt = prompt.replace("{LENGTH_LABEL}", length_label)
    prompt = prompt.replace("{LEVEL_DESCRIPTION}", level_desc)
    prompt = prompt.replace("{LENGTH_INSTRUCTION}", length_instr)
    prompt = prompt.replace("{VARIANT_RULE}", variant_rule)
    prompt = prompt.replace(
        "{OUTPUT_FORMAT}",
        OUTPUT_FORMAT_SINGLE if len(factbase) == 1 else OUTPUT_FORMAT_ARRAY)

    factbase_json = json.dumps(factbase, ensure_ascii=False, separators=(',', ':'))
    prompt += f"\n{factbase_json}"
    return prompt


def build_rewrite_prompt(lang: str, level: str, length: str, source: dict,
                          relax_titles_a1: bool = False) -> str:
    """Arm B: rewrite one native article down to `level`. Returns "" if no source.

    relax_titles_a1: test pipeline only (--relax-titles-a1). Default False keeps production
    byte-identical -- TITLE_RULE_STRICT at every level. When True, A1 only gets
    TITLE_RULE_RELAXED_A1 instead; every other level is unaffected.
    """
    if not source or not source.get("body"):
        return ""
    def _band(lvl):
        return word_band(WORDS_PER_ARTICLE.get(lvl, WORDS_PER_ARTICLE["C1"])[length], lang)

    word_min_i, word_max_i = _band(level)
    src_min, src_max = _band("Native")
    word_min, word_max = str(word_min_i), str(word_max_i)

    # Which instruction the rewrite gets follows the real ratio, not the length. With every
    # level now the same size as native except A1, "you must cut" would be wrong almost
    # everywhere and would make it drop facts for no reason.
    ratio = word_max_i / max(src_max, 1)
    cut_key = "same" if ratio >= 0.95 else ("trim" if ratio >= 0.75 else "cut")

    # A level two or more CEFR steps below native cannot keep every fact at the same word
    # count — simplifying costs words. Stage 8 proved it: 0/7 graded A2 in seven of eight
    # combos, all coming back B1, while the rule said "keep EVERY fact, only the level
    # changes". The level gap overrides the word ratio.
    levels_down = 0
    native_grade = _NATIVE_GRADES.get(lang)
    if native_grade in CEFR_ORDER and level in CEFR_ORDER:
        levels_down = CEFR_ORDER.index(native_grade) - CEFR_ORDER.index(level)
    if levels_down >= 2 and cut_key in ("same", "trim"):
        cut_key = "reduce"

    # CUT_RULE, GLOSS_RULE and ATTRIBUTION_RULE all carry their own {LANGUAGE}/
    # {LEVEL_DESCRIPTION}/{WORD_MIN}/{WORD_MAX}, so they must be injected BEFORE those are
    # substituted or their placeholders survive into the prompt unfilled.
    prompt = (PROMPT_LEVEL_REWRITE
              .replace("{CUT_RULE}", REWRITE_CUT_RULES[cut_key])
              .replace("{TITLE_RULE}",
                       TITLE_RULE_RELAXED_A1 if (relax_titles_a1 and level == "A1")
                       else TITLE_RULE_STRICT)
              .replace("{GLOSS_RULE}",
                       GLOSS_RULE_BEGINNER if level in ("A1", "A2") else GLOSS_RULE_FALLBACK)
              .replace("{ATTRIBUTION_RULE}",
                       ATTRIBUTION_RULE_BEGINNER if level in ("A1", "A2")
                       else ATTRIBUTION_RULE_FALLBACK)
              .replace("{GRAMMAR_RULE}",
                       GRAMMAR_RULE_A1 if level == "A1"
                       else GRAMMAR_RULE_A2 if level == "A2"
                       else GRAMMAR_RULE_FALLBACK)
              .replace("{LEVELS_DOWN}", str(levels_down))
              .replace("{LANGUAGE}", LANGUAGE_NAMES.get(lang, lang))
              .replace("{LEVEL_DESCRIPTION}", LEVEL_DESCRIPTIONS.get(level, level))
              .replace("{WORD_MIN}", word_min).replace("{WORD_MAX}", word_max)
              .replace("{STRUCTURE}", PROMPT_LEVEL_STRUCTURE)
              .replace("{VARIANT_RULE}", VARIANT_RULES.get(lang, ""))
              .replace("{QUOTE_RULE}", QUOTE_RULES.get(lang, QUOTE_RULE_FALLBACK))
              .replace("{OUTPUT_FORMAT}", OUTPUT_FORMAT_SINGLE))
    # Only the fields the rewrite may touch or must copy. The fact-base is deliberately
    # NOT included: arm B tests rewriting, so restoring dropped facts would blur the test.
    payload = {k: source.get(k) for k in ("genre", "slug", "headline", "body")}
    return prompt + "\n" + json.dumps(payload, ensure_ascii=False, indent=2)


def build_rewrite_prompt_simple(lang: str, level: str, length: str, source: dict) -> str:
    """Test-pipeline only (--simple-rewrite). No KEEP list, no CUT_RULE, no GLOSS_RULE, no
    ATTRIBUTION_RULE -- just the bare instruction. Word band computed the same way as the
    real rewrite so the two are comparable on the one thing both must hit."""
    if not source or not source.get("body"):
        return ""
    word_min_i, word_max_i = word_band(WORDS_PER_ARTICLE.get(level, WORDS_PER_ARTICLE["C1"])[length], lang)
    prompt = (PROMPT_LEVEL_REWRITE_SIMPLE
              .replace("{LANGUAGE}", LANGUAGE_NAMES.get(lang, lang))
              .replace("{LEVEL_DESCRIPTION}", LEVEL_DESCRIPTIONS.get(level, level))
              .replace("{WORD_MIN}", str(word_min_i)).replace("{WORD_MAX}", str(word_max_i))
              .replace("{OUTPUT_FORMAT}", OUTPUT_FORMAT_SINGLE))
    payload = {k: source.get(k) for k in ("genre", "slug", "headline", "body")}
    return prompt + "\n" + json.dumps(payload, ensure_ascii=False, indent=2)


def build_native_prompt(lang: str, factbase: list, length: Optional[str] = None) -> str:
    """Build the native prompt for one story (or, in batched mode, several).

    One template for both lengths and every genre; everything that varies is a slot. The
    genre block is chosen from the story itself, so a Business article never carries the
    political-titles rules and a Politics article does.
    """
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    length = length or "longer"

    # Word counts come from WORDS_PER_ARTICLE, not hardcoded in the prompt. They used to
    # live in three places (prompt, table, check.py) and had to be changed together.
    lo, hi = word_band(WORDS_PER_ARTICLE["Native"][length], lang)
    word_min, word_max = str(lo), str(hi)
    # Exact target = the low end of the band -- see NATIVE_WORD_RULE's comment for why.
    word_target = word_min

    # Per-article mode carries exactly one story, so its genre selects the block. Batched
    # mode mixes genres in one call and gets none rather than the wrong one.
    genres = {(s_.get("genre") or "").upper() for s_ in (factbase or [])}
    genre_rule = (GENRE_RULES.get(next(iter(genres)), GENRE_RULE_FALLBACK)
                  if len(genres) == 1 else GENRE_RULE_FALLBACK)

    prompt = (PROMPT_NATIVE_TEMPLATE
              .replace("{LANGUAGE}", lang_name)
              .replace("{OUTLET}", NATIVE_OUTLETS.get(lang, NATIVE_OUTLET_FALLBACK))
              .replace("{FRAMING}", NATIVE_FRAMING.get(length, NATIVE_FRAMING["longer"]))
              .replace("{STRUCTURE}", STRUCTURE_BY_LENGTH_NATIVE.get(
                  length, STRUCTURE_BY_LENGTH_NATIVE["longer"]))
              .replace("{GENRE_RULE}", genre_rule)
              .replace("{WORD_RULE}", NATIVE_WORD_RULE.get(length, NATIVE_WORD_RULE["longer"]))
              .replace("{WORD_TARGET}", word_target)
              .replace("{WORD_MIN}", word_min).replace("{WORD_MAX}", word_max)
              .replace("{VARIANT_RULE}", VARIANT_RULES.get(lang, ""))
              .replace("{QUOTE_RULE}", QUOTE_RULES.get(lang, QUOTE_RULE_FALLBACK))
              .replace("{OUTPUT_FORMAT}",
                       OUTPUT_FORMAT_SINGLE if len(factbase or []) == 1 else OUTPUT_FORMAT_ARRAY))
    factbase_json = json.dumps(factbase, ensure_ascii=False, separators=(',', ':'))
    return prompt + f"\n{factbase_json}"


def build_grading_prompt(lang: str, native_articles: list, level: Optional[str] = None) -> str:
    """Build the P4b grading prompt for one language's CEFR-level articles.

    level is used only to decide whether to include the gloss-ignore instruction (only
    A1/A2 articles ever carry a bracketed gloss) — it is never told to the model, which
    still grades blind.
    """
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = (PROMPT_4_HEADER
              .replace("{LANGUAGE}", lang_name)
              .replace("{GLOSS_JUDGE_RULE}",
                       GLOSS_JUDGE_RULE_BEGINNER if level in ("A1", "A2")
                       else GLOSS_JUDGE_RULE_FALLBACK))
    articles_json = json.dumps({"articles": native_articles}, ensure_ascii=False, indent=2)
    prompt += f"\n{articles_json}"
    return prompt


def build_grade_native_prompt(lang: str, native_articles: list) -> str:
    """Build the P4a prompt: assess overall CEFR level of native journalism batch."""
    lang_name = LANGUAGE_NAMES.get(lang, lang)
    prompt = PROMPT_4A_HEADER.replace("{LANGUAGE}", lang_name)
    articles_json = json.dumps({"articles": native_articles}, ensure_ascii=False, indent=2)
    prompt += f"\n{articles_json}"
    return prompt


# ── Direct API call helper ────────────────────────────────────────────────────

def call_gemini(
    client: genai.Client, model: str, prompt: str, label: str,
    stage: Optional[str] = None,
    schema: Optional[dict] = None,
    max_output_tokens: Optional[int] = None,
    plain: bool = False,
) -> tuple[Optional[str], Optional[str]]:
    """
    Call generate_content() directly with retry logic for transient errors.
    Uses a shared semaphore to cap concurrent inflight requests.
    Records token usage in _stage_usage[stage] when stage is provided.
    Returns (text, finish_reason). finish_reason is None on normal completion
    or "MAX_TOKENS" when the response was truncated.

    plain=True skips response_mime_type/response_schema entirely (plain-text output,
    parsed downstream by parse_plain_article) -- Stage 5 (native) only, tested this
    session to beat forced JSON on word-count precision.
    """
    for attempt in range(MAX_RETRIES + 1):
        try:
            with _API_SEMAPHORE:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        **({} if plain else {
                            "response_mime_type": "application/json",
                            "response_schema": schema,
                        }),
                        max_output_tokens=max_output_tokens,
                        thinking_config=types.ThinkingConfig(
                            thinking_budget=THINKING_BUDGET_BY_STAGE.get(stage, 0)),
                        **({"service_tier": tier} if (tier := SERVICE_TIER_BY_STAGE.get(stage, SERVICE_TIER)) else {}),
                    ),
                )
            # Accumulate token usage for cost tracking
            if stage and stage in _stage_usage:
                um = response.usage_metadata
                if um:
                    inp = getattr(um, "prompt_token_count",     0) or 0
                    out = getattr(um, "candidates_token_count", 0) or 0
                    thi = getattr(um, "thoughts_token_count",   0) or 0
                    with _usage_lock:
                        u = _stage_usage[stage]
                        u.calls           += 1
                        u.input_tokens    += inp
                        u.output_tokens   += out
                        u.thinking_tokens += thi
            # Detect truncation
            finish_reason = None
            if response.candidates:
                fr = response.candidates[0].finish_reason
                if fr is not None:
                    finish_reason = fr.name if hasattr(fr, "name") else str(fr)
            if finish_reason == "MAX_TOKENS":
                print(f"[ERROR] [{label}] MAX_TOKENS — response truncated",
                      file=sys.stderr)
                return response.text, "MAX_TOKENS"
            return response.text, None
        except Exception as e:
            code = getattr(e, "code", None) or getattr(e, "status_code", None)
            if attempt < MAX_RETRIES:
                base = RETRY_DELAYS[attempt]
                delay = base * (0.5 + random.random())  # ±50% jitter breaks thundering herd
                print(f"[{label}] Attempt {attempt + 1} failed (code={code}): {e} — retrying in {delay:.1f}s",
                      file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[ERROR] [{label}] All {MAX_RETRIES + 1} attempts failed: {e}", file=sys.stderr)
                return None, None
    return None, None


_anthropic_client = None


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic()
    return _anthropic_client


def call_claude(
    model: str, prompt: str, label: str,
    stage: Optional[str] = None,
    schema: Optional[dict] = None,
    max_output_tokens: Optional[int] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Claude-backend equivalent of call_gemini(), same (text, finish_reason) contract.
    Claude has no response_schema — structure is forced via a single required tool
    call instead, so parse_llm_json downstream sees the same shape either backend
    produces.
    """
    client = _get_anthropic_client()
    tool = {
        "name": "emit_article",
        "description": "Return the result as structured JSON matching this schema.",
        "input_schema": schema,
    } if schema else None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with _API_SEMAPHORE:
                kwargs = dict(
                    model=model,
                    max_tokens=max_output_tokens or 8192,
                    temperature=0.1,
                    messages=[{"role": "user", "content": prompt}],
                )
                if tool:
                    kwargs["tools"] = [tool]
                    kwargs["tool_choice"] = {"type": "tool", "name": "emit_article"}
                # Streamed, not create(): the SDK refuses a plain create() outright when
                # max_tokens is large enough that it estimates the request could run past
                # 10 minutes, regardless of how long the response actually takes. This is
                # the client's own recommended fix, not a retry-around workaround.
                with client.messages.stream(**kwargs) as stream:
                    response = stream.get_final_message()
            if stage and stage in _stage_usage:
                inp = getattr(response.usage, "input_tokens", 0) or 0
                out = getattr(response.usage, "output_tokens", 0) or 0
                with _usage_lock:
                    u = _stage_usage[stage]
                    u.calls         += 1
                    u.input_tokens  += inp
                    u.output_tokens += out
            finish_reason = "MAX_TOKENS" if response.stop_reason == "max_tokens" else None
            if tool:
                block = next((b for b in response.content if b.type == "tool_use"), None)
                text = json.dumps(block.input) if block else None
            else:
                text = "".join(b.text for b in response.content if b.type == "text")
            if finish_reason == "MAX_TOKENS":
                print(f"[ERROR] [{label}] MAX_TOKENS — response truncated", file=sys.stderr)
                return text, "MAX_TOKENS"
            return text, None
        except Exception as e:
            code = getattr(e, "status_code", None)
            if attempt < MAX_RETRIES:
                base = RETRY_DELAYS[attempt]
                delay = base * (0.5 + random.random())
                print(f"[{label}] Attempt {attempt + 1} failed (code={code}): {e} — retrying in {delay:.1f}s",
                      file=sys.stderr)
                time.sleep(delay)
            else:
                print(f"[ERROR] [{label}] All {MAX_RETRIES + 1} attempts failed: {e}", file=sys.stderr)
                return None, None
    return None, None


def call_llm(
    client: genai.Client, model: str, prompt: str, label: str,
    stage: Optional[str] = None,
    schema: Optional[dict] = None,
    max_output_tokens: Optional[int] = None,
    plain: bool = False,
) -> tuple[Optional[str], Optional[str]]:
    """Dispatch to the active writer backend (Gemini by default, Claude under --api claude)."""
    if WRITER_BACKEND == "claude":
        return call_claude(model, prompt, label, stage=stage, schema=schema,
                            max_output_tokens=max_output_tokens)
    return call_gemini(client, model, prompt, label, stage, schema, max_output_tokens, plain=plain)


# ── Task executor (handles proactive splitting) ───────────────────────────────

def _execute_task(client: genai.Client, task: _WriteTask) -> list[dict]:
    """
    Execute a write task. If n_splits == 1, makes a single API call.
    If n_splits > 1, slices the factbase into N parts, calls each, and merges.
    Returns the merged articles list (empty on total failure).
    """
    label = (f"{task.stage}/{task.lang}-{task.level}-{task.length}"
             if task.level else f"{task.stage}/{task.lang}")

    if task.n_splits == 1:
        # Expected article count is bounded by how many stories this task carries.
        # In per-article mode that is 1, so the thin-response retry must not demand
        # _MIN_ARTICLES_EXPECTED or every single call would retry to its limit.
        expected = min(_MIN_ARTICLES_EXPECTED, len(task.factbase or [])) or 1
        best_articles: list[dict] = []
        for attempt in range(_THIN_RETRY_LIMIT + 1):
            attempt_label = f"{label}-r{attempt + 1}" if attempt > 0 else label
            raw, finish_reason = call_llm(
                client, task.model, task.prompt, attempt_label,
                task.stage, task.schema, task.max_output_tokens,
            )
            if not raw:
                print(f"[ERROR] [{attempt_label}]: no response — output incomplete", file=sys.stderr)
                break
            if finish_reason == "MAX_TOKENS":
                # Truncation is usually transient — a repetition loop or an unlucky
                # verbose generation, not a deterministic overflow. Typical output for
                # these tasks is ~1k tokens against an 8k+ budget, so retrying almost
                # always succeeds. Previously this broke immediately, and one truncated
                # response took the whole day's brief down with it.
                print(f"[WARN] [{attempt_label}] MAX_TOKENS — response truncated, retrying",
                      file=sys.stderr)
                continue
            parsed = parse_llm_json(raw)
            if not parsed:
                print(f"[WARN] [{attempt_label}]: JSON parse failed — retrying", file=sys.stderr)
                continue
            # Per-article calls return a bare object; the batched path returns an array.
            articles = parsed.get("articles")
            if not isinstance(articles, list):
                articles = [parsed] if parsed.get("body") else []
            if len(articles) > len(best_articles):
                best_articles = articles
            if len(best_articles) >= expected:
                break
            if attempt < _THIN_RETRY_LIMIT:
                print(f"[WARN] [{attempt_label}] thin response ({len(articles)} articles < {expected}) — retrying",
                      file=sys.stderr)
        # A task carrying ONE story can only have one correct answer, but the output
        # format is a plural "articles" array, so Gemini sometimes returns two. Nothing
        # capped it, and "keep the longest response" above actively preferred the wrong
        # one — which is how 7 stories became 9 articles in fr/es-A2-longer on
        # 2026-08-10. Trust the slug, fall back to the first article.
        stories = task.factbase or []
        if len(stories) == 1 and len(best_articles) > 1:
            want = (stories[0].get("slug") or "").strip()
            matched = [a for a in best_articles
                       if (a.get("slug") or "").strip() == want]
            print(f"[WARN] [{label}] {len(best_articles)} articles returned for 1 story "
                  f"('{want}') — keeping "
                  f"{'the slug match' if matched else 'the first'}, dropping "
                  f"{len(best_articles) - 1}", file=sys.stderr)
            best_articles = (matched or best_articles)[:1]

        if not best_articles:
            print(f"[ERROR] [{label}]: empty articles list — output incomplete", file=sys.stderr)
        elif len(best_articles) < expected:
            print(f"[WARN] [{label}] still thin after {_THIN_RETRY_LIMIT} retries: {len(best_articles)} articles",
                  file=sys.stderr)
        return best_articles

    # Proactive split: divide factbase into n_splits slices
    factbase = task.factbase or []
    n = task.n_splits
    size = max(1, len(factbase) // n)
    slices = [factbase[i * size:(i + 1) * size] for i in range(n - 1)]
    slices.append(factbase[(n - 1) * size:])
    slices = [s for s in slices if s]  # drop empty tail slices

    all_articles: list[dict] = []
    for i, fb_slice in enumerate(slices):
        if task.stage in ("2S", "2B", "2M"):
            sub_prompt = build_writing_prompt(
                task.template, task.lang, task.level, task.length, fb_slice
            )
        else:  # stage "3"
            sub_prompt = build_native_prompt(task.lang, fb_slice, task.length)
        sub_label = f"{label}-p{i + 1}"
        # Retry truncated/unparseable split parts rather than silently dropping them.
        # A skipped part loses every story in its slice, which is how combos were
        # shipping 4 of 7 articles with nothing flagged as critical.
        part_articles: list[dict] = []
        for attempt in range(_THIN_RETRY_LIMIT + 1):
            attempt_label = f"{sub_label}-r{attempt + 1}" if attempt > 0 else sub_label
            text, reason = call_llm(
                client, task.model, sub_prompt, attempt_label,
                task.stage, task.schema, task.max_output_tokens,
            )
            if reason == "MAX_TOKENS":
                print(f"[WARN] [{attempt_label}] MAX_TOKENS on split part — retrying",
                      file=sys.stderr)
                continue
            if not text:
                print(f"[WARN] [{attempt_label}] no response on split part — retrying",
                      file=sys.stderr)
                continue
            parsed = parse_llm_json(text)
            if not parsed:
                print(f"[WARN] [{attempt_label}] JSON parse failed on split part — retrying",
                      file=sys.stderr)
                continue
            part_articles = parsed.get("articles", [])
            break
        if not part_articles:
            print(f"[ERROR] [{sub_label}] split part failed after retries — "
                  f"{len(fb_slice)} stories lost", file=sys.stderr)
        all_articles.extend(part_articles)

    if not all_articles:
        print(f"[ERROR] [{label}] no articles after {n}-way proactive split", file=sys.stderr)
    return all_articles


def _group_key(task: "_WriteTask") -> tuple:
    return (task.stage, task.lang, task.level, task.length)


def _run_task_group(client: genai.Client, tasks: list) -> dict:
    """
    Execute tasks and return {(stage, lang, level, length): [articles]}.

    Batched mode: one call per task, each writing every story at once.

    Per-article mode: every task is expanded into one call per story and ALL of
    them are submitted to the pool together. Expanding inside _execute_task
    instead would run each task's stories sequentially, which at Flex latency
    would serialise into hours.
    """
    results: dict = {}

    if not PER_ARTICLE:
        with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
            futures = {executor.submit(_execute_task, client, t): t for t in tasks}
            for future in as_completed(futures):
                task = futures[future]
                results[_group_key(task)] = future.result() or []
        return results

    subtasks: list[tuple[tuple, _WriteTask]] = []
    for task in tasks:
        stories = task.factbase or []
        for story in stories:
            if task.stage == "3":
                prompt = build_native_prompt(task.lang, [story], task.length)
            elif LEVELS_FROM == "native":
                src = _NATIVE_INDEX.get((task.lang, task.length, story.get("slug")))
                if SIMPLE_REWRITE:
                    prompt = build_rewrite_prompt_simple(task.lang, task.level, task.length, src)
                else:
                    prompt = build_rewrite_prompt(task.lang, task.level, task.length, src,
                                                   relax_titles_a1=RELAX_TITLES_A1)
                if not prompt:
                    # No native article for this language (Spanish has no Native level),
                    # so fall back to writing from the fact-base rather than dropping the
                    # story. Logged, and reported as excluded from the comparison.
                    print(f"[write] {task.lang}-{task.level}-{task.length}/"
                          f"{story.get('slug')}: no native source — writing from factbase",
                          file=sys.stderr)
                    prompt = build_writing_prompt(
                        task.template, task.lang, task.level, task.length, [story])
            else:
                prompt = build_writing_prompt(
                    task.template, task.lang, task.level, task.length, [story]
                )
            subtasks.append((
                _group_key(task),
                replace(task, prompt=prompt, factbase=[story], n_splits=1,
                        schema=_SCHEMA_ARTICLE),
            ))
        results.setdefault(_group_key(task), [])

    print(f"[write] per-article: {len(tasks)} combos → {len(subtasks)} calls "
          f"(max {_MAX_WORKERS} at a time)")

    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        futures = {executor.submit(_execute_task, client, st): key
                   for key, st in subtasks}
        for future in as_completed(futures):
            key = futures[future]
            articles = future.result() or []
            with lock:
                results[key].extend(articles)

    return results


# ── Cost report ───────────────────────────────────────────────────────────────

def write_costs_report(date: str, script_dir: str) -> dict:
    """
    Reads gather usage from factbase_<date>.json, combines with accumulated stage
    costs, writes output/costs_<date>.json, and returns the cost dict.
    """
    gather_usage: dict = {}
    gather_model = "gemini-2.5-pro"
    gather_tier = "standard"
    factbase_path = os.path.join(script_dir, f"factbase_{date}.json")
    if os.path.exists(factbase_path):
        try:
            with open(factbase_path, encoding="utf-8") as f:
                fb = json.load(f)
            gather_usage = fb.get("usage_metadata", {}) or {}
            gather_model = fb.get("model", "gemini-2.5-pro")
            gather_tier = fb.get("service_tier") or "standard"
        except Exception:
            pass

    costs: dict = {"date": date, "stages": {}, "total_usd": 0.0, "total_gbp": 0.0}

    # Gather stage — price by the model that actually served the request. The attempt
    # plan can fall back between Flash and Pro, and it no longer requests the Flex
    # tier at all, so hardcoding Pro Flex rates misreported this line every run.
    if gather_usage:
        g_in  = gather_usage.get("prompt_token_count",          0) or 0
        g_out = gather_usage.get("candidates_token_count",      0) or 0
        g_thi = gather_usage.get("thoughts_token_count",        0) or 0
        if "flash" in gather_model:
            rate_in, rate_out, rate_thi = (
                FLASH_INPUT_USD_PER_M, FLASH_OUTPUT_USD_PER_M, FLASH_THINK_USD_PER_M
            )
        else:
            rate_in, rate_out, rate_thi = (
                PRO_INPUT_USD_PER_M, PRO_OUTPUT_USD_PER_M, PRO_THINK_USD_PER_M
            )
        if gather_tier == "flex":
            rate_in, rate_out, rate_thi = rate_in * 0.5, rate_out * 0.5, rate_thi * 0.5
        g_usd = (
            (g_in  / 1_000_000) * rate_in
            + (g_out / 1_000_000) * rate_out
            + (g_thi / 1_000_000) * rate_thi
        )
        costs["stages"]["1_gather"] = {
            "model":           gather_model,
            "calls":           1,
            "input_tokens":    g_in,
            "output_tokens":   g_out,
            "thinking_tokens": g_thi,
            "cost_usd":        round(g_usd, 4),
            "cost_gbp":        round(g_usd * USD_TO_GBP, 4),
        }
        costs["total_usd"] += g_usd

    # Stage "3" (native) runs gemini-2.5-pro; every other write/grade stage runs
    # gemini-2.5-flash. Whether a stage is actually on Flex is resolved the same way
    # call_gemini() resolves it — SERVICE_TIER_BY_STAGE.get(stage, SERVICE_TIER) — not
    # hardcoded by stage name. A hardcoded list silently mispriced every run after Flex
    # was turned off per-stage (2026-08-11): the report kept calling stages "(flex)" and
    # billing them at Flex rates even when SERVICE_TIER_BY_STAGE was empty and they
    # actually ran at full standard price.
    for sname, usage in _stage_usage.items():
        is_flex = SERVICE_TIER_BY_STAGE.get(sname, SERVICE_TIER) == "flex"
        if WRITER_BACKEND == "claude" and sname in ("3", "2S", "2B", "2M", "5b", "4b"):
            # Claude has no Flex tier and no thinking cost on these calls. 5b/4b are
            # forced to Haiku regardless of level (checks, not native/B1+ generation).
            if sname in ("2B", "5b", "4b"):
                rates = (CLAUDE_HAIKU_INPUT_USD_PER_M, CLAUDE_HAIKU_OUTPUT_USD_PER_M, 0.0)
                model_name = CLAUDE_MODEL_BEGINNER
            else:
                rates = (CLAUDE_SONNET_INPUT_USD_PER_M, CLAUDE_SONNET_OUTPUT_USD_PER_M, 0.0)
                model_name = CLAUDE_MODEL_MAIN
        elif sname == "3":
            rates = (PRO_FLEX_INPUT_USD_PER_M, PRO_FLEX_OUTPUT_USD_PER_M, PRO_FLEX_THINK_USD_PER_M) \
                if is_flex else (PRO_INPUT_USD_PER_M, PRO_OUTPUT_USD_PER_M, PRO_THINK_USD_PER_M)
            model_name = "gemini-2.5-pro" + (" (flex)" if is_flex else "")
        else:
            rates = (FLASH_FLEX_INPUT_USD_PER_M, FLASH_FLEX_OUTPUT_USD_PER_M, FLASH_FLEX_THINK_USD_PER_M) \
                if is_flex else (FLASH_INPUT_USD_PER_M, FLASH_OUTPUT_USD_PER_M, FLASH_THINK_USD_PER_M)
            model_name = "gemini-2.5-flash" + (" (flex)" if is_flex else "")
        in_usd  = (usage.input_tokens    / 1_000_000) * rates[0]
        out_usd = (usage.output_tokens   / 1_000_000) * rates[1]
        thi_usd = (usage.thinking_tokens / 1_000_000) * rates[2]
        s_usd = in_usd + out_usd + thi_usd
        costs["stages"][sname] = {
            "model":           model_name,
            "calls":           usage.calls,
            "input_tokens":    usage.input_tokens,
            "output_tokens":   usage.output_tokens,
            "thinking_tokens": usage.thinking_tokens,
            "cost_usd":        round(s_usd, 4),
            "cost_gbp":        round(s_usd * USD_TO_GBP, 4),
        }
        costs["total_usd"] += s_usd

    costs["total_usd"] = round(costs["total_usd"], 4)
    costs["total_gbp"] = round(costs["total_usd"] * USD_TO_GBP, 4)

    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    costs_path = os.path.join(output_dir, f"costs_{date}.json")
    with open(costs_path, "w", encoding="utf-8") as f:
        json.dump(costs, f, indent=2)

    print(f"[costs] Total: ${costs['total_usd']:.4f} (£{costs['total_gbp']:.4f})")
    for sname, sdata in costs["stages"].items():
        print(
            f"[costs]   {sname} ({sdata['model']}): {sdata['calls']} calls, "
            f"{sdata['input_tokens']:,} in + {sdata['output_tokens']:,} out"
            f" = ${sdata['cost_usd']:.4f}"
        )

    return costs


# ── Stage runners ─────────────────────────────────────────────────────────────

def run_native_journalism(
    client: genai.Client,
    factbase: list,
) -> dict:
    """Stage 5 (Write Native) — English native is written once per story per length,
    directly from the fact-base. Every other native/intermediate language then translates
    that English article ("as their own outlet's journalist would," not word-for-word)
    rather than writing independently from the fact-base again.

    Adopted 2026-08-14: single-source-of-truth translation was tested this session
    (test_real_headlines_translate_check.py) across two real-headline runs — facts, fact
    order and no-hallucination all held through translation. Writing every language
    independently from the fact-base risked per-language fact drift by construction;
    translating from one already-correct EN article removes that risk structurally.

    Plain-text output (HEADLINE:/BODY:, no forced JSON) throughout this stage — tested
    to modestly beat JSON on word-count precision (avg |dev| 24.3 vs 28.0 words on a
    7-story real A/B) and lets the model focus on the writing task, not JSON structure.
    Confirmed safe to drop here: production's per-article calls always run with
    n_splits=1, so the multi-part JSON-array merge path in _execute_task is never
    exercised by this stage regardless.

    Returns {lang: {short: [articles], longer: [articles]}}."""
    # Honour the language matrix: only write native journalism for active languages
    # that actually list "Native". Previously this used every key in LANGUAGE_LEVELS,
    # so disabled languages (empty level lists) and levels-only languages still had
    # native articles generated, graded, and shipped in the bundle.
    native_langs = NATIVE_PUBLISHED + NATIVE_INTERMEDIATE
    other_langs = [lang for lang in native_langs if lang != "en"]
    if NATIVE_INTERMEDIATE:
        print(f"[3] Native for {NATIVE_PUBLISHED} (published) + "
              f"{NATIVE_INTERMEDIATE} (intermediate, rewritten from but not shipped)")
    if "en" not in native_langs:
        print("[3] ERROR: English is not active — the translation architecture requires "
              "an English native article to translate every other language from",
              file=sys.stderr)
        return {}

    print(f"[3] Writing English native, then translating to {other_langs} "
          f"({len(factbase)} stories × 2 lengths)...")

    def _write_en(story: dict, length: str) -> Optional[dict]:
        prompt = build_native_prompt("en", [story], length)
        prompt = prompt.replace(OUTPUT_FORMAT_SINGLE, OUTPUT_FORMAT_PLAIN_SINGLE, 1)
        label = f"3/en-{length}-{story.get('slug')}"
        for attempt in range(_THIN_RETRY_LIMIT + 1):
            attempt_label = f"{label}-r{attempt + 1}" if attempt > 0 else label
            raw, finish = call_llm(client, _resolve_model(MODEL_3, False), prompt,
                                    attempt_label, "3", None, 8192, plain=True)
            if finish == "MAX_TOKENS":
                print(f"[WARN] [{attempt_label}] MAX_TOKENS — retrying", file=sys.stderr)
                continue
            article = parse_plain_article(raw, story.get("genre", ""), story.get("slug", ""))
            if article:
                return article
            print(f"[WARN] [{attempt_label}] unparseable response — retrying", file=sys.stderr)
        print(f"[ERROR] [{label}]: no usable EN article after retries", file=sys.stderr)
        return None

    def _translate_one(lang: str, story: dict, en_article: dict) -> Optional[dict]:
        target = str(len(en_article["body"].split()))
        prompt = build_translate_prompt(lang, en_article, target)
        label = f"3/{lang}-{story.get('slug')}"
        for attempt in range(_THIN_RETRY_LIMIT + 1):
            attempt_label = f"{label}-r{attempt + 1}" if attempt > 0 else label
            raw, finish = call_llm(client, _resolve_model(MODEL_3, False), prompt,
                                    attempt_label, "3", None, 8192, plain=True)
            if finish == "MAX_TOKENS":
                print(f"[WARN] [{attempt_label}] MAX_TOKENS — retrying", file=sys.stderr)
                continue
            article = parse_plain_article(raw, story.get("genre", ""), story.get("slug", ""))
            if article:
                return article
            print(f"[WARN] [{attempt_label}] unparseable response — retrying", file=sys.stderr)
        print(f"[ERROR] [{label}]: no usable translation after retries", file=sys.stderr)
        return None

    def _process_chain(story: dict, length: str) -> dict:
        """EN must finish before its translations can start; other (story, length)
        chains run concurrently with this one via the outer pool below."""
        out: dict = {}
        en_article = _write_en(story, length)
        if not en_article:
            return out
        out["en"] = en_article
        if other_langs:
            with ThreadPoolExecutor(max_workers=len(other_langs)) as ex:
                futures = {ex.submit(_translate_one, lang, story, en_article): lang
                           for lang in other_langs}
                for fut in as_completed(futures):
                    lang = futures[fut]
                    article = fut.result()
                    if article:
                        out[lang] = article
        return out

    chains = [(story, length) for story in factbase for length in ("short", "longer")]
    native_journalism: dict = {lang: {"short": [], "longer": []} for lang in native_langs}
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as ex:
        futures = {ex.submit(_process_chain, story, length): (story, length)
                   for story, length in chains}
        for fut in as_completed(futures):
            story, length = futures[fut]
            for lang, article in fut.result().items():
                native_journalism[lang][length].append(article)

    for lang in native_langs:
        for length in ("short", "longer"):
            n = len(native_journalism[lang][length])
            if n:
                print(f"[3] {lang}/{length}: {n} articles ✓")
            else:
                print(f"[3] {lang}/{length}: ❌ no articles", file=sys.stderr)

    # Only include languages/lengths that produced at least one article
    return {lang: {ln: arts for ln, arts in lengths.items() if arts}
            for lang, lengths in native_journalism.items() if any(lengths.values())}


def run_grade_native(
    client: genai.Client,
    native_journalism: dict,
) -> dict:
    """
    Stage 6 (Grade Native) — grade native journalism to determine overall CEFR level per language.
    Returns dict[lang → cefr_level_str]. Uses gemini-2.0-flash-lite (classification only).
    """
    # Use the longer variant for grading (more words = more representative of level)
    def _articles_for_grading(lengths: dict) -> list:
        return lengths.get("longer") or lengths.get("short") or []

    langs_with_articles = [
        lang for lang, lengths in native_journalism.items()
        if isinstance(lengths, dict) and _articles_for_grading(lengths)
    ]
    if not langs_with_articles:
        print("[4a] No native articles to grade — skipping", file=sys.stderr)
        return {}

    print(f"[4a] Grading native journalism level for {len(langs_with_articles)} languages...")
    native_grades: dict = {}

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        future_to_lang = {
            executor.submit(
                call_gemini, client, MODEL_4A,
                build_grade_native_prompt(lang, _articles_for_grading(native_journalism[lang])),
                f"4a/{lang}", "4a", _SCHEMA_GRADE_NATIVE,
            ): lang
            for lang in langs_with_articles
        }

        for future in as_completed(future_to_lang):
            lang = future_to_lang[future]
            raw, finish_reason = future.result()
            if not raw:
                print(f"[ERROR] [4a] {lang}: no response — using default B2", file=sys.stderr)
                native_grades[lang] = "B2"
                continue
            parsed = parse_llm_json(raw)
            cefr = parsed.get("cefr_level") if parsed else None
            if not cefr or cefr not in CEFR_ORDER:
                print(f"[ERROR] [4a] {lang}: unparseable level '{cefr}' — using default B2",
                      file=sys.stderr)
                native_grades[lang] = "B2"
                continue
            reasoning = (parsed.get("reasoning") or "")[:120]
            native_grades[lang] = cefr
            print(f"[4a] {lang}: {cefr} — {reasoning}")

    return native_grades


def run_writing_concurrent(
    client: genai.Client,
    factbase: list,
    generated_at: int,
    date: str,
    native_grades: Optional[dict] = None,
) -> dict:
    """
    Stage 7 (Write Levels) — write CEFR level articles.
    Levels at or above native_grades[lang] are skipped (P3 already covers them).
    Returns briefings dict.
    """
    combos_2s, combos_2m = build_combinations(native_grades)

    tasks: list[_WriteTask] = []

    # Short combos — A1/A2 → 2B, B1+ → 2S
    for lang, level, length in combos_2s:
        is_beginner = level in ("A1", "A2")
        stage = "2B" if is_beginner else "2S"
        model = _resolve_model(MODEL_BEGINNER if is_beginner else MODEL_2S, is_beginner)
        prompt = build_writing_prompt(PROMPT_2S_HEADER, lang, level, length, factbase)
        # 16384: short tasks typically emit ~1k tokens, but an occasional runaway
        # generation was hitting the old 8192 ceiling and losing the whole combo.
        tasks.append(_WriteTask(
            stage=stage, lang=lang, level=level, length=length,
            model=model, prompt=prompt, schema=_SCHEMA_WRITING,
            max_output_tokens=16384, template=PROMPT_2S_HEADER, factbase=factbase,
            n_splits=1,
        ))

    # Medium/longer combos — A1/A2 → 2B, B1+ → 2M with proactive splitting
    for lang, level, length in combos_2m:
        is_beginner = level in ("A1", "A2")
        stage = "2B" if is_beginner else "2M"
        model = _resolve_model(MODEL_BEGINNER if is_beginner else MODEL_2M, is_beginner)
        template = PROMPT_2S_HEADER if is_beginner else PROMPT_2M_HEADER
        if is_beginner:
            # German and French produce verbose articles that exhaust the token budget
            # at 2-way splits — use 3 slices (~3 stories each) for those languages.
            _verbose = lang in ("de", "fr")
            n_splits = (3 if _verbose else 2) if length == "longer" else 1
        else:
            n_splits = 3  # longer only — medium removed
        prompt = build_writing_prompt(template, lang, level, length, factbase)
        # 32768 cap: model can write verbose articles (especially German/French) that
        # far exceed the word-count instruction; 16384 was still clipping some split parts
        tasks.append(_WriteTask(
            stage=stage, lang=lang, level=level, length=length,
            model=model, prompt=prompt, schema=_SCHEMA_WRITING,
            max_output_tokens=32768, template=template, factbase=factbase,
            n_splits=n_splits,
        ))

    if not tasks:
        print("[write] No CEFR level combos to generate (all skipped by P4a grades)")
        return {}

    beginner_count = sum(1 for t in tasks if t.stage == "2B")
    print(
        f"[write] Running {len(tasks)} writing requests (max {_MAX_WORKERS} at a time)... "
        f"({beginner_count} beginner, {len(tasks) - beginner_count} standard)"
    )

    briefings: dict = {}

    grouped = _run_task_group(client, tasks)
    if True:
        for (stage, lang, level, length), articles in grouped.items():
            if not articles:
                continue

            briefings.setdefault(lang, {}).setdefault(level, {})[length] = {
                "articles": articles,
                "date": date,
                "language": lang,
                "level": level,
                "length": length,
                "generatedAt": generated_at,
            }
            print(f"[{stage}] {lang}-{level}-{length}: {len(articles)} articles ✓")

    return briefings


def run_verify_native(client: genai.Client, factbase: list, native_journalism: dict) -> dict:
    """Stage 5b (Verify Native) — check each native article against its fact-base entry.

    Stage 4 fact-checks the fact-base BEFORE writing, so it cannot see what the writer
    invents. This reads the finished article and its source notes together. It matters more
    under pipeline B, because every level article is a rewrite of a native one, so an
    invention here reaches every level beneath it.

    One call per article, search enabled so a fact that is in the notes but simply wrong
    can also be caught. Advisory — it never blocks the brief.
    """
    by_slug = {s_.get("slug"): s_ for s_ in (factbase or []) if s_.get("slug")}
    jobs = []
    for lang, by_len in (native_journalism or {}).items():
        if not isinstance(by_len, dict):
            continue
        for length, arts in by_len.items():
            for a in arts or []:
                story = by_slug.get(a.get("slug"))
                if story and a.get("body"):
                    jobs.append((lang, length, a, story))
    if not jobs:
        return {"summary": "", "findings": [], "articles_checked": 0}

    print(f"[5b] Verifying {len(jobs)} native articles against the factbase...")

    def verify(job):
        lang, length, art, story = job
        prompt = (PROMPT_5B_VERIFY
                  .replace("{LANGUAGE}", LANGUAGE_NAMES.get(lang, lang))
                  .replace("{LENGTH}", length)
                  .replace("{ARTICLE}", json.dumps(
                      {"headline": art.get("headline"), "body": art.get("body")},
                      ensure_ascii=False, indent=2))
                  .replace("{FACTBASE}", json.dumps(story, ensure_ascii=False, indent=2)))
        raw, finish = call_llm(client, _resolve_verify_grade_model(MODEL_5B), prompt,
                                 f"5b/{lang}-{length}-{art.get('slug')}", "5b",
                                 _SCHEMA_VERIFY, max_output_tokens=2048)
        if not raw or finish == "MAX_TOKENS":
            return []
        parsed = parse_llm_json(raw) or {}
        out = []
        for f in parsed.get("findings") or []:
            why = (f.get("why") or "").lower()
            # The prompt forbids reporting translations, formatting and omissions, but it
            # does anyway — 4 of 5 findings on 2026-08-10 were exactly those, and each one
            # said so in its own explanation ("correctly translates", "omits the word",
            # "changes the comma to a space"). Drop anything that admits it.
            if any(t in why for t in ("translat", "omits", "omit ", "format",
                                      "decimal separator", "wording", "correctly",
                                      "same value", "conversion of", "abbreviat")):
                continue
            out.append({"lang": lang, "length": length, "slug": art.get("slug"),
                        "type": f.get("type"), "quote": f.get("quote"),
                        "factbase": f.get("factbase"), "why": f.get("why")})
        return out

    findings: list = []
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as ex:
        for res in ex.map(verify, jobs):
            findings.extend(res)

    clean = len(jobs) - len({(f["lang"], f["length"], f["slug"]) for f in findings})
    by_type: dict = {}
    for f in findings:
        by_type[f.get("type") or "?"] = by_type.get(f.get("type") or "?", 0) + 1
    if findings:
        summary = (f"🔎 Native fact-check: {clean}/{len(jobs)} articles clean, "
                   f"{len(findings)} finding(s) — "
                   + ", ".join(f"{k} {v}" for k, v in sorted(by_type.items())))
    else:
        summary = f"🔎 Native fact-check: all {len(jobs)} articles match the factbase ✓"
    print(f"[5b] {summary}")
    for f in findings:
        print(f"[5b]   {f['type']} {f['lang']}/{f['length']}/{f['slug']}: "
              f"\"{(f.get('quote') or '')[:90]}\" — {f.get('why')}", file=sys.stderr)

    return {"summary": summary, "findings": findings, "articles_checked": len(jobs)}


def run_grade_cefr(
    client: genai.Client,
    briefings: dict,
) -> dict:
    """
    Stage 8 (Grade Levels) — grade every level article and record whether it hit the
    level it was written for. This is the per-prompt quality check: did the A2 prompt
    actually produce A2?

    Graded PER (language, level, length) so each verdict can be mapped back to what it
    was supposed to be. It used to flatten every level of a language into one list, and
    since articles share a slug across levels the verdicts were unattributable — the
    stage cost money every morning and produced nothing usable.

    The grader is NOT told the target level. It grades blind and Python compares, so the
    verdict is not just a confirmation of the instruction.

    Returns dict[lang -> [assessment]] where each assessment carries written_level and
    written_length alongside the grader's own verdict.
    """
    combos: list = []
    for lang, levels in briefings.items():
        for level, lengths in (levels or {}).items():
            for length, payload in (lengths or {}).items():
                arts = (payload or {}).get("articles") or []
                if arts:
                    combos.append((lang, level, length, arts))

    if not combos:
        print("[4b] No CEFR articles to grade — skipping", file=sys.stderr)
        return {}

    print(f"[4b] Grading {sum(len(c[3]) for c in combos)} articles across "
          f"{len(combos)} level/length combos...")
    grading: dict = {}
    lock = threading.Lock()

    def grade(combo):
        lang, level, length, arts = combo
        label = f"4b/{lang}-{level}-{length}"
        raw, finish = call_llm(client, _resolve_verify_grade_model(MODEL_4B),
                                 build_grading_prompt(lang, arts, level),
                                 label, "4b", _SCHEMA_GRADING)
        if not raw or finish == "MAX_TOKENS":
            print(f"[ERROR] [{label}]: {'MAX_TOKENS' if finish else 'no response'} — "
                  f"{len(arts)} articles ungraded", file=sys.stderr)
            return lang, []
        parsed = parse_llm_json(raw)
        assessments = (parsed or {}).get("assessments") or []
        if not assessments:
            print(f"[ERROR] [{label}]: empty assessments", file=sys.stderr)
            return lang, []
        # Tag every verdict with what the article was SUPPOSED to be. Without this the
        # verdict is unusable: slugs repeat across levels, so "b1" on slug X says nothing.
        for a in assessments:
            a["written_level"] = level
            a["written_length"] = length
        hit = sum(1 for a in assessments if a.get("level") == level)
        print(f"[4b] {lang}-{level}-{length}: {hit}/{len(assessments)} graded as {level}")
        return lang, assessments

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as executor:
        for lang, assessments in executor.map(grade, combos):
            with lock:
                grading.setdefault(lang, []).extend(assessments)

    return grading


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bilinguist Brief — writing/grading pipeline")
    parser.add_argument("--date", help="Override date (YYYY-MM-DD). Defaults to today UTC.")
    parser.add_argument("--test", action="store_true", help="Use test prompts from bilinguist_prompts_test.py.")
    parser.add_argument("--per-article", action="store_true",
                        help="A/B: one API call per (language, level, length, story) "
                             "instead of one call writing every story at once.")
    parser.add_argument("--workers", type=int, default=_MAX_WORKERS,
                        help=f"Max concurrent API calls (default {_MAX_WORKERS}). "
                             "Raise for --per-article and/or --tier flex.")
    parser.add_argument("--tier", choices=["standard", "flex"], default="standard",
                        help="Gemini service tier. 'flex' is ~50%% cheaper but adds "
                             "1-15 min latency per call and is sheddable.")
    # A/B: stages 5-6 (native + its grade) must run ONCE and be shared, or the arms are
    # writing levels from different native articles and the comparison means nothing.
    parser.add_argument("--stop-after-native", action="store_true", dest="stop_after_native",
                        help="Run stages 5-6 only, write the bundle with nativeJournalism "
                             "and nativeGrades, and stop. For A/B runs.")
    parser.add_argument("--native-from", dest="native_from", metavar="PATH",
                        help="Skip stages 5-6 and load nativeJournalism/nativeGrades from "
                             "this bundle, so both arms share one native pass.")
    parser.add_argument("--all-levels", action="store_true", dest="all_levels",
                        help="Write every CEFR level below the native grade for every "
                             "active language, not just those listed in LANGUAGE_LEVELS. "
                             "Production default since 2026-08-11.")
    parser.add_argument("--levels-from", choices=["factbase", "native"], default="factbase",
                        dest="levels_from",
                        help="How stage 7 writes: 'factbase' writes each level article from "
                             "the fact-base (today's behaviour). 'native' rewrites the graded "
                             "native article of the same language, length and story down to "
                             "the target level.")
    parser.add_argument("--simple-rewrite", action="store_true", dest="simple_rewrite",
                        help="Test pipeline only. With --levels-from native, use a bare "
                             "level+word-count rewrite prompt instead of the real one -- no "
                             "KEEP list, no CUT_RULE/GLOSS_RULE/ATTRIBUTION_RULE. Never use "
                             "in production.")
    parser.add_argument("--relax-titles-a1", action="store_true", dest="relax_titles_a1",
                        help="Test pipeline only. Real rewrite prompt (CUT_RULE/GLOSS_RULE/"
                             "ATTRIBUTION_RULE all still apply), but A1's title/name rule "
                             "relaxes from strict-verbatim to may-simplify. Isolates that "
                             "one variable, separate from --simple-rewrite. Never use in "
                             "production.")
    parser.add_argument("--api", choices=["gemini", "claude"], default="gemini",
                        help="Test pipeline only. Writer backend for stages 3/2S/2B/2M "
                             "(native + CEFR levels). 'claude' uses Claude Sonnet for "
                             "native/B1+ and Claude Haiku for A1/A2. Grading (4a/4b), "
                             "fact-check (5b) and gather stay on Gemini regardless. "
                             "Requires ANTHROPIC_API_KEY. Never use in production.")
    args = parser.parse_args()

    global PER_ARTICLE, SERVICE_TIER, LEVELS_FROM, _NATIVE_INDEX, ALL_LEVELS, _NATIVE_GRADES, SIMPLE_REWRITE, RELAX_TITLES_A1, WRITER_BACKEND
    PER_ARTICLE = args.per_article
    SERVICE_TIER = "flex" if args.tier == "flex" else None
    LEVELS_FROM = args.levels_from
    ALL_LEVELS = args.all_levels
    SIMPLE_REWRITE = args.simple_rewrite
    RELAX_TITLES_A1 = args.relax_titles_a1
    WRITER_BACKEND = args.api
    _set_workers(args.workers)

    # --levels-from native works either way: native comes from --native-from (A/B, where
    # both arms must share one pass) or from this run's own Stage 5 (production, single
    # process). _NATIVE_INDEX is built after native exists, whichever way it arrived.
    if args.stop_after_native and args.native_from:
        sys.exit("--stop-after-native writes the native pass; --native-from loads one.")

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    print(f"[write] Starting writing/grading pipeline — {date}")
    print(f"[write] Mode: {'PER-ARTICLE' if PER_ARTICLE else 'batched'} | "
          f"tier: {args.tier} | workers: {_MAX_WORKERS} | writer backend: {WRITER_BACKEND}")
    _t_pipeline = time.time()
    _stage_secs: dict[str, float] = {}

    # Locate the factbase produced by Stage 3 (Gather)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    factbase_path = os.path.join(script_dir, f"factbase_{date}.json")
    if not os.path.exists(factbase_path):
        print(f"[write] ERROR: Factbase not found at {factbase_path}", file=sys.stderr)
        print("[write] Run bilinguist_gather.py first.", file=sys.stderr)
        sys.exit(1)

    with open(factbase_path, "r", encoding="utf-8") as f:
        gather_output = json.load(f)

    factbase          = gather_output.get("factbase", [])
    search_log        = gather_output.get("global_news_search_log", [])
    daily_notification = gather_output.get("daily_notification", "")
    gather_source     = gather_output.get("model", "gemini")
    # Use the gather stage's start time so the bundle duration covers the full pipeline
    started_at = gather_output.get("pipeline_started_at") or int(datetime.now(timezone.utc).timestamp() * 1000)
    print(f"[write] Loaded {len(factbase)} stories from factbase (source: {gather_source})")

    print(f"[write] Languages: {', '.join(ACTIVE_LANGUAGES)}")
    _lv = _active_levels()
    if ALL_LEVELS:
        print("[write] ALL-LEVELS mode (A/B) — every CEFR level below the native grade")
    for lang in ACTIVE_LANGUAGES:
        print(f"[write]   {lang}: {', '.join(_lv[lang])}")

    # Initialise Gemini client
    client = genai.Client()
    print("[write] Gemini client initialised")

    # ── Stage 5 (Write Native) — runs before the CEFR levels ─────────────────
    if args.native_from:
        with open(args.native_from, encoding="utf-8") as f:
            _src = json.load(f)
        native_journalism = dict(_src.get("nativeJournalism") or {})
        # A published bundle keeps intermediates under a separate key; merge them back so
        # Stage 7 can rewrite from them.
        native_journalism.update(_src.get("nativeIntermediate") or {})
        native_grades     = _src.get("nativeGrades") or {}
        if not native_journalism:
            sys.exit(f"[write] ERROR: no nativeJournalism in {args.native_from}")
        _n = sum(len(v) for by in native_journalism.values() for v in by.values())
        print(f"[write] Native reused from {args.native_from} — {_n} articles, "
              f"grades {native_grades}. Stages 5-6 skipped.")
        _stage_secs["3_native"] = 0.0
        _stage_secs["4a_grade_native"] = 0.0
    else:
        _t = time.time()
        native_journalism = run_native_journalism(client, factbase)
        _stage_secs["3_native"] = time.time() - _t

        # ── Stage 6 (Grade Native) — gates which CEFR levels get written ──────
        # Grades all of a language's articles together: one overall level per language.
        _t = time.time()
        native_grades = run_grade_native(client, native_journalism)
        _stage_secs["4a_grade_native"] = time.time() - _t
    if native_grades:
        print(f"[write] Native grades: {native_grades}")

    # ── Stage 5b (Verify Native) — does native match its fact-base? ──────────
    _t = time.time()
    native_check = run_verify_native(client, factbase, native_journalism)
    _stage_secs["5b_verify_native"] = time.time() - _t

    if LEVELS_FROM == "native":
        _NATIVE_INDEX = _index_native(native_journalism)
        _NATIVE_GRADES = dict(native_grades or {})
        print(f"[write] LEVELS FROM NATIVE — {len(_NATIVE_INDEX)} native articles indexed "
              f"by (language, length, slug)")

    if args.stop_after_native:
        _out = os.path.join(script_dir, "output")
        os.makedirs(_out, exist_ok=True)
        _p = os.path.join(_out, f"native_{date}.json")
        with open(_p, "w", encoding="utf-8") as f:
            json.dump({"date": date, "factbase": factbase,
                       # Intermediates are split out here, not earlier: Stage 6 grades them and Stage 7
        # rewrites from them exactly like any other language.
        "nativeJournalism": {k: v for k, v in native_journalism.items()
                             if k not in NATIVE_INTERMEDIATE},
        "nativeIntermediate": {k: v for k, v in native_journalism.items()
                               if k in NATIVE_INTERMEDIATE},
                       "nativeGrades": native_grades}, f, ensure_ascii=False, indent=2)
        print(f"[write] --stop-after-native: wrote {_p}. Stages 7-8 skipped.")
        write_costs_report(date, script_dir)
        return

    # ── Stage 7 (Write Levels) — CEFR levels below the native grade ──────────
    _t = time.time()
    briefings = run_writing_concurrent(client, factbase, 0, date, native_grades)
    _stage_secs["2_cefr_write"] = time.time() - _t
    # Stamp generatedAt AFTER writing completes so "Published at" reflects when
    # articles finished, not when the pipeline launched.
    generated_at = int(datetime.now(timezone.utc).timestamp() * 1000)
    for _ld in briefings.values():
        for _lvl in _ld.values():
            for _b in _lvl.values():
                _b["generatedAt"] = generated_at

    combos_2s, combos_2m = build_combinations(native_grades)
    total_briefings = sum(
        1
        for lang_data in briefings.values()
        for level_data in lang_data.values()
        for _ in level_data.values()
    )
    print(f"[write] Writing done: {total_briefings} / {len(combos_2s) + len(combos_2m)} briefings assembled")

    # ── Stage 8 (Grade Levels) — grade the CEFR articles written ──────────────
    _t = time.time()
    grading = run_grade_cefr(client, briefings)
    _stage_secs["4b_grade_cefr"] = time.time() - _t

    # ── Cost report (P1–P4b) ──────────────────────────────────────────────────
    print(f"[timing] mode={'per-article' if PER_ARTICLE else 'batched'} "
          f"tier={args.tier} workers={_MAX_WORKERS}")
    for _name, _secs in _stage_secs.items():
        print(f"[timing]   {_name}: {_secs:.1f}s")
    print(f"[timing]   TOTAL write pipeline: {time.time() - _t_pipeline:.1f}s")

    write_costs_report(date, script_dir)

    # ── Assemble DailyBundle ──────────────────────────────────────────────────
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    # Persistent volume counter — increments once per successful daily run.
    # Stored as output/volume.json so it's committed alongside the bundle and
    # survives across pipeline runs. Every device reads the same number.
    volume_path = os.path.join(output_dir, "volume.json")
    try:
        with open(volume_path, "r", encoding="utf-8") as f:
            prev_volume = json.load(f).get("volume", 0)
    except (FileNotFoundError, ValueError):
        prev_volume = 0
    current_volume = prev_volume + 1

    finished_at = int(datetime.now(timezone.utc).timestamp() * 1000)

    bundle = {
        "date": date,
        "startedAt": started_at,
        "generatedAt": generated_at,
        "finishedAt": finished_at,
        "volume": current_volume,
        "daily_notification": daily_notification,
        "global_news_search_log": search_log,
        "factbase": factbase,
        "gatherSource": "gemini",
        "briefings": briefings,
        # Intermediates are split out here, not earlier: Stage 6 grades them and Stage 7
        # rewrites from them exactly like any other language.
        "nativeJournalism": {k: v for k, v in native_journalism.items()
                             if k not in NATIVE_INTERMEDIATE},
        "nativeIntermediate": {k: v for k, v in native_journalism.items()
                               if k in NATIVE_INTERMEDIATE},
        "nativeGrades": native_grades,
        # Stage 5b's verdict, so check.py can report it without recomputing.
        "nativeFactCheck": native_check,
        "grading": grading,
    }

    bundle_json = json.dumps(bundle, ensure_ascii=False, indent=2)
    dated_path  = os.path.join(output_dir, f"{date}.json")
    latest_path = os.path.join(output_dir, "latest.json")

    with open(dated_path,  "w", encoding="utf-8") as f:
        f.write(bundle_json)
    with open(latest_path, "w", encoding="utf-8") as f:
        f.write(bundle_json)

    # Write volume counter so the next run can increment from here
    with open(volume_path, "w", encoding="utf-8") as f:
        json.dump({"volume": current_volume}, f)

    approx_kb = len(bundle_json.encode("utf-8")) // 1024
    print(f"[write] Done — output/{date}.json ({approx_kb} KB) | Vol. {current_volume}")
    print(f"[write] Briefings: {total_briefings} | Native: {sum(len(v) for v in native_journalism.values())} | Gradings: {sum(len(v) for v in grading.values())}")

    # P5 (token maps + dictionary) runs as a separate workflow after this one
    # to avoid competing for Gemini quota during the main writing stage.


if __name__ == "__main__":
    main()
