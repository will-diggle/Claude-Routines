"""
populate_separable_verbs.py
===========================
Reads separable_de_missing.json (verbs not yet in Supabase) and generates
full dictionary entries for each one using Claude Haiku, then writes them
to Supabase via the same upsert logic as dict_writer.py.

Fans out in parallel batches of BATCH_SIZE verbs — each batch is one Haiku
call. Concurrent calls are capped at MAX_CONCURRENT to avoid rate limits.

Usage:
    python populate_separable_verbs.py [--dry-run] [--limit N]

    --dry-run   Generate entries but do not write to Supabase
    --limit N   Only process the first N verbs (for testing)
"""

import asyncio
import json
import sys
import time
from pathlib import Path

import anthropic
from supabase import create_client

SCRIPT_DIR = Path(__file__).parent

# Load .env from parent directory if ANTHROPIC_API_KEY not already set
import os as _os
_env_path = SCRIPT_DIR.parent / ".env"
if _env_path.exists() and not _os.environ.get("ANTHROPIC_API_KEY"):
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            if _k.strip() not in _os.environ:
                _os.environ[_k.strip()] = _v.strip()

SUPABASE_URL = _os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = _os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = None  # read from ANTHROPIC_API_KEY env var

MISSING_PATH  = SCRIPT_DIR / "separable_de_remaining.json"
LOOKUP_PATH   = SCRIPT_DIR / "separable_de.json"
PROGRESS_PATH = SCRIPT_DIR / "populate_separable_progress.json"

BATCH_SIZE     = 25   # verbs per Haiku call
MAX_CONCURRENT = 8    # parallel Haiku calls at once
MODEL          = "claude-haiku-4-5-20251001"

DRY_RUN = "--dry-run" in sys.argv
LIMIT   = None
for i, arg in enumerate(sys.argv):
    if arg == "--limit" and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])


SYSTEM_PROMPT = """\
You are a German dictionary entry generator. For each German separable verb given,
produce a JSON dictionary entry suitable for a language-learning app.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing text.

Each entry must have exactly these fields:
{
  "lemma": "<infinitive, lowercase>",
  "translation": "<concise English translation, e.g. 'to get up'>",
  "level": "<CEFR level: A1, A2, B1, B2, C1, or C2>",
  "ipa": "<IPA pronunciation of the infinitive, e.g. /ˈʔaufˌʃteːən/>",
  "explanation": "<one sentence English explanation of the verb's meaning>",
  "example_sentence": "<one natural German sentence using the verb in present tense with the prefix detached>",
  "example_translation": "<English translation of the example sentence>",
  "tip": "<one short mnemonic or usage tip for learners, or null>",
  "conjugations": {
    "PRÄSENS":    {"ich": "", "du": "", "er/sie/es": "", "wir": "", "ihr": "", "sie/Sie": ""},
    "IMPERATIV":  {"du": "", "ihr": "", "Sie": ""},
    "PERFEKT":    {"ich": "", "du": "", "er/sie/es": "", "wir": "", "ihr": "", "sie/Sie": ""},
    "PRÄTERITUM": {"ich": "", "du": "", "er/sie/es": "", "wir": "", "ihr": "", "sie/Sie": ""},
    "KONJUNKTIV II": {"ich": "", "du": "", "er/sie/es": "", "wir": "", "ihr": "", "sie/Sie": ""}
  },
  "is_separable": true,
  "separable_prefix": "<the detachable prefix>",
  "verb_root": "<the base verb after removing the prefix>"
}

Fill ALL conjugation slots. For PERFEKT use "habe/bin + participle" form for ich.
Level guide: A1-A2 = very common everyday verbs, B1-B2 = intermediate, C1-C2 = advanced/rare.
"""


def make_user_prompt(batch: list[tuple[str, str]]) -> str:
    lines = "\n".join(f"- {inf} (prefix: {pfx})" for inf, pfx in batch)
    return f"Generate dictionary entries for these {len(batch)} German separable verbs:\n{lines}"


def entry_to_supabase_row(entry: dict) -> dict:
    conj = entry.get("conjugations") or {}
    data = {
        "is_separable":     True,
        "separable_prefix": entry.get("separable_prefix", ""),
        "verb_root":        entry.get("verb_root", ""),
        "conjugations":     conj,
    }
    return {
        "language":            "de",
        "word":                entry["lemma"],
        "lemma":               entry["lemma"],
        "word_type":           "verb",
        "translation":         entry.get("translation", ""),
        "level":               entry.get("level"),
        "ipa":                 entry.get("ipa"),
        "explanation":         entry.get("explanation"),
        "example_sentence":    entry.get("example_sentence"),
        "example_translation": entry.get("example_translation"),
        "tip":                 entry.get("tip"),
        "source":              "haiku",
        "data":                data,
    }


async def process_batch(
    client: anthropic.AsyncAnthropic,
    batch: list[tuple[str, str]],
    batch_idx: int,
    semaphore: asyncio.Semaphore,
) -> list[dict]:
    async with semaphore:
        try:
            resp = await client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": make_user_prompt(batch)}],
            )
            raw = resp.content[0].text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            entries = json.loads(raw)
            if not isinstance(entries, list):
                entries = [entries]
            print(f"[batch {batch_idx:03d}] OK — {len(entries)} entries")
            return entries
        except Exception as e:
            print(f"[batch {batch_idx:03d}] ERROR — {e}", file=sys.stderr)
            return []


def load_progress() -> set[str]:
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH, encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_progress(done: set[str]) -> None:
    with open(PROGRESS_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(done), f, ensure_ascii=False, indent=2)


async def main():
    import os

    api_key = os.environ.get("ANTHROPIC_API_KEY") or ANTHROPIC_API_KEY
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    # Load missing verbs
    with open(MISSING_PATH, encoding="utf-8") as f:
        missing: list[str] = json.load(f)

    # Load prefix lookup
    with open(LOOKUP_PATH, encoding="utf-8") as f:
        lookup: dict[str, str] = json.load(f)

    # Resume support — skip already-done lemmas
    done = load_progress()
    todo = [v for v in missing if v not in done]

    if LIMIT:
        todo = todo[:LIMIT]

    print(f"[pop] {len(missing)} missing verbs, {len(done)} already done, {len(todo)} to process")
    if DRY_RUN:
        print("[pop] DRY RUN — no writes to Supabase")

    if not todo:
        print("[pop] Nothing to do.")
        return

    # Build (infinitive, prefix) pairs
    pairs = [(v, lookup.get(v, "")) for v in todo]

    # Chunk into batches
    batches = [pairs[i:i + BATCH_SIZE] for i in range(0, len(pairs), BATCH_SIZE)]
    print(f"[pop] {len(batches)} batches of up to {BATCH_SIZE} verbs, {MAX_CONCURRENT} concurrent")

    aclient = anthropic.AsyncAnthropic(api_key=api_key)
    supa = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    written = 0
    failed  = 0
    started = time.monotonic()

    tasks = [
        process_batch(aclient, batch, i, semaphore)
        for i, batch in enumerate(batches)
    ]

    for coro in asyncio.as_completed(tasks):
        entries = await coro
        for entry in entries:
            lemma = entry.get("lemma", "").strip().lower()
            if not lemma:
                continue
            if not DRY_RUN:
                try:
                    row = entry_to_supabase_row(entry)
                    supa.table("word_dictionary").upsert(
                        row, on_conflict="language,lemma,word_type"
                    ).execute()
                    done.add(lemma)
                    written += 1
                    if written % 50 == 0:
                        save_progress(done)
                        elapsed = time.monotonic() - started
                        print(f"[pop] {written} written ({elapsed:.0f}s elapsed)...")
                except Exception as e:
                    print(f"[pop] FAIL {lemma}: {e}", file=sys.stderr)
                    failed += 1
            else:
                print(f"[dry] {lemma}: {entry.get('translation', '?')} [{entry.get('level', '?')}]")
                written += 1

    save_progress(done)
    elapsed = time.monotonic() - started
    print(f"\n[pop] {'DRY RUN — ' if DRY_RUN else ''}Done in {elapsed:.1f}s.")
    print(f"  Written: {written:>6,}")
    print(f"  Failed:  {failed:>6,}")
    print(f"  Remaining: {len(missing) - len(done):>6,}")


if __name__ == "__main__":
    asyncio.run(main())
