"""
Stage — Audio Narration (added 2026-09-04, Will's request).

Standalone, purely additive stage. Runs AFTER every existing pipeline stage has
finished -- specifically after Stage 9 (Check & Publish) has already validated
the bundle, and BEFORE the "Push bundle to data repo" workflow step -- so the
audioKey fields this stage adds land in the same commit as everything else,
without this file ever importing, calling, or editing a single line of any
other stage's code, prompt, or logic. It only ever READS output/latest.json
(the bundle every earlier stage already finished writing) and adds one new
field to some of its article objects.

If this script ever seems to need a change outside itself to work -- a new
argument on an existing function, a tweak to how another stage shapes its
output -- that is a signal to stop and flag it, not to make the change, per
Will's explicit instruction. Nothing here should ever require touching
bilinguist_write.py, bilinguist_check.py, bilinguist_prompts.py, or any other
existing stage.

SCOPE (Will's exact spec, 2026-09-04):
  - Only articles with genre == "GLOBAL NEWS".
  - Every active language, every CEFR level actually present in the leveled
    `briefings` structure -- NOT the separate `nativeJournalism` tier (native
    is a different reading experience the app doesn't currently pair with
    per-level audio; leveled articles are the ones a learner scrolls through).
  - Both length variants (short and longer).
  - Skip whatever a previous run for the same date already generated, cheaply
    -- see _r2_object_exists.

TTS: Google Cloud Text-to-Speech, WaveNet tier specifically (not Standard,
Neural2, or Studio -- WaveNet is the decided cost/quality tradeoff: 4M free
characters/month, $4/million after, see cost note in run_audio_narration).
English is fixed to en-GB (never en-US) -- a hard requirement, not a default.
Every other language's voice is chosen by calling Google's own voices.list at
RUNTIME (every invocation), not from a hardcoded guess -- see _voice_for_lang.
This is deliberately different from en-GB: en-GB gets one fixed, human-picked
voice because the requirement said so explicitly ("pick any real
en-GB-Wavenet-* voice"); the other six explicitly said "rather than trusting
any hardcoded list", so those six have no static fallback at all -- if the
live query fails for one of them, that language's articles fail gracefully
(audioKey left None, warning logged) rather than falling back to a guess that
could be stale by the time this actually runs.

CHUNKING: Google's Text-to-Speech has a 5,000-BYTE (not character) limit per
request (confirmed 2026-09-04 against https://cloud.google.com/text-to-speech
/quotas -- "Total bytes per request: 5,000", applies to plain text and SSML
alike since some locales are multi-byte-per-character). Every article in this
pipeline is short enough that this should never actually trigger -- a 300-word
English "longer" article is roughly 1,800-2,000 bytes -- but the requirement
was explicit not to assume that, so _chunk_text_for_tts splits on sentence
boundaries under a conservative 4,500-byte margin (leaves headroom below the
real 5,000 for multi-byte characters in non-English text) and each chunk's
audio is requested separately, then the resulting MP3 byte strings are
concatenated in order. Plain byte concatenation of independently-encoded MP3
frames is the standard practical approach for this (most decoders handle it
fine); it is not lossless studio-grade stitching, and isn't expected to need
to run at all given current word-count targets -- noted here so a future
reader isn't surprised by the simplicity if it ever does trigger.

STORAGE: uploads to Cloudflare R2 via its S3-compatible API (boto3), using the
EXACT file-naming convention the Worker's GET /audio/{key} route already
expects -- {key}.mp3 in the AUDIO_BUCKET bucket (see bilinguist-worker/src/
index.ts, handleAudioStream/handleAudioPost). The Worker does not fix any
internal structure for {key} itself -- it is caller-chosen, looked up as a
flat string -- so the key SCHEME below (date/lang/level/length/slug) is this
stage's own choice, made for two reasons: it's deterministic (the same article
always maps to the same key, which is what makes the "skip if already covered"
check possible) and it's human-legible for debugging the bucket directly.

WHAT THIS STAGE DOES NOT DO, ON PURPOSE:
  - Does not modify the app to read `audioKey` or call GET /audio/{key} --
    that is separate, future, app-side work, exactly like the AUDIO_BUCKET
    binding itself being "enabled separately" per Will's note.
  - Does not create the R2 bucket or provision any credential. Both need a
    human with Cloudflare/Google Cloud dashboard access:
      1. Google Cloud: enable the Text-to-Speech API on some project, create a
         service account with (at minimum) the "Cloud Text-to-Speech User"
         role, generate a JSON key, base64-encode it, and add it as the GitHub
         Actions secret GOOGLE_TTS_CREDENTIALS_B64.
      2. Cloudflare R2: create the bucket (`wrangler r2 bucket create
         bilinguist-audio` -- matching the name already reserved, commented
         out, in bilinguist-worker/wrangler.toml), create an R2 API token
         (Cloudflare dashboard -> R2 -> Manage R2 API Tokens), and add three
         GitHub Actions secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
         R2_SECRET_ACCESS_KEY.
    Until all four secrets exist, this stage detects that at startup, logs a
    clear one-line reason, and exits 0 having done nothing -- never blocks the
    pipeline, and safe to merge and run before that setup is finished.

RESILIENCE: this stage must never fail the daily pipeline. main() catches
every exception at the top level and always exits 0. Any individual article's
synthesis or upload failure is caught per-article, logged as a warning, and
leaves that article's audioKey as None -- one failure never blocks the rest,
and the brief always still publishes on time without audio for that one
combo, same as any other optional enhancement in this pipeline.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

# R2's bucket name is already decided and reserved (commented out) in
# bilinguist-worker/wrangler.toml -- kept as a constant here, not an env var,
# so the two stay in sync by construction rather than by remembering to match
# two separately-configured values.
R2_BUCKET_NAME = "bilinguist-audio"

# Conservative margin below Google's real 5,000-BYTE (not character) limit --
# see module docstring "CHUNKING". Leaves headroom for multi-byte UTF-8
# characters in non-English text so the byte count never gets close to the
# real ceiling even for the language with the longest per-character encoding.
_TTS_MAX_BYTES_PER_REQUEST = 4500

# genre filter -- see bilinguist_gather.py, this exact uppercase string is
# already the convention used throughout the rest of the pipeline.
_TARGET_GENRE = "GLOBAL NEWS"

# English is a hard requirement per spec: en-GB, never en-US, one fixed real
# WaveNet voice (confirmed current 2026-09-04 against https://cloud.google.com
# /text-to-speech/docs/list-voices-and-types, which lists en-GB-Wavenet-A
# through D, F, N, O as currently available). Swappable later after a human
# listens to samples -- this is a starting pick, not a considered final one.
_EN_GB_LANGUAGE_CODE = "en-GB"
_EN_GB_VOICE_NAME = "en-GB-Wavenet-B"

# Every other language's locale, per Will's exact spec (Spanish is Spain, not
# Latin America; Portuguese is Brazilian, not European). No voice NAME is
# listed here on purpose -- see module docstring and _voice_for_lang: those
# are chosen by querying Google's live voices.list at runtime, never from a
# hardcoded guess.
_OTHER_LANGUAGE_CODES = {
    "fr": "fr-FR",
    "de": "de-DE",
    "sv": "sv-SE",
    "it": "it-IT",
    "es": "es-ES",
    "pt": "pt-BR",
}

_voice_cache: dict[str, Optional[str]] = {}


def _r2_credentials_present() -> bool:
    return bool(os.environ.get("R2_ACCOUNT_ID")
                and os.environ.get("R2_ACCESS_KEY_ID")
                and os.environ.get("R2_SECRET_ACCESS_KEY"))


def _google_credentials_present() -> bool:
    """True once GOOGLE_APPLICATION_CREDENTIALS points at a real file --
    materialize_google_credentials() sets this up from the base64 secret
    before this stage's real work starts."""
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(path and Path(path).is_file())


def materialize_google_credentials() -> bool:
    """Decode GOOGLE_TTS_CREDENTIALS_B64 (a GitHub Actions secret) into a real
    JSON key file and point GOOGLE_APPLICATION_CREDENTIALS at it, exactly the
    way google-cloud-texttospeech's client expects to find credentials.
    Returns False (never raises) if the secret isn't set -- see module
    docstring for what a human needs to provision first."""
    b64 = os.environ.get("GOOGLE_TTS_CREDENTIALS_B64")
    if not b64:
        return False
    try:
        raw = base64.b64decode(b64)
        fd, path = tempfile.mkstemp(prefix="gcp-tts-", suffix=".json")
        with os.fdopen(fd, "wb") as f:
            f.write(raw)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = path
        return True
    except Exception as e:                                        # noqa: BLE001
        print(f"[audio] could not materialize Google credentials ({e})",
              file=sys.stderr)
        return False


def _r2_client():
    """boto3 client against R2's S3-compatible endpoint. Only ever called
    once credentials are confirmed present -- see _r2_credentials_present."""
    import boto3
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _r2_key(date: str, lang: str, level: str, length: str, slug: str) -> str:
    """Deterministic key -- same (date, lang, level, length, slug) always maps
    to the same key, which is what makes _r2_object_exists a real idempotency
    check across re-runs for the same date, not just a coincidence."""
    return f"{date}/{lang}/{level}/{length}/{slug}"


def _r2_object_exists(client, key: str) -> bool:
    """Cheap idempotency check -- a HEAD request, not a download. True means a
    previous run for this exact date already produced this article's audio;
    skip re-synthesizing (and re-paying for) it."""
    try:
        client.head_object(Bucket=R2_BUCKET_NAME, Key=f"{key}.mp3")
        return True
    except Exception:                                             # noqa: BLE001
        # botocore raises ClientError with a 404 on a genuine miss, but also
        # raises on real connectivity problems -- either way, "we don't know
        # it exists" is the safe default: fall through to (re)synthesizing
        # rather than silently skipping an article that actually needs audio.
        return False


def _upload_to_r2(client, key: str, audio_bytes: bytes) -> None:
    client.put_object(
        Bucket=R2_BUCKET_NAME, Key=f"{key}.mp3", Body=audio_bytes,
        ContentType="audio/mpeg",
    )


def _voice_for_lang(tts_client, lang: str) -> Optional[tuple[str, str]]:
    """Returns (language_code, voice_name), or None if unavailable.

    English: fixed, per spec -- see module docstring. Every other language:
    queries Google's live voices.list, cached per lang for the life of this
    process (one run, not across runs -- see module docstring on why no
    hardcoded fallback exists here by design). Picks the alphabetically-first
    WaveNet-tier voice for that locale, so repeated runs within the same
    Google voice-catalogue state stay consistent with each other."""
    if lang == "en":
        return (_EN_GB_LANGUAGE_CODE, _EN_GB_VOICE_NAME)

    language_code = _OTHER_LANGUAGE_CODES.get(lang)
    if not language_code:
        return None

    if lang in _voice_cache:
        cached = _voice_cache[lang]
        return (language_code, cached) if cached else None

    try:
        resp = tts_client.list_voices(language_code=language_code)
        wavenet_voices = sorted(
            v.name for v in resp.voices
            if "Wavenet" in v.name and language_code in v.language_codes
        )
    except Exception as e:                                        # noqa: BLE001
        print(f"[audio] voices.list failed for {language_code} ({e}) — "
              f"{lang} will have no audio this run", file=sys.stderr)
        _voice_cache[lang] = None
        return None

    if not wavenet_voices:
        print(f"[audio] no WaveNet voice found for {language_code} — "
              f"{lang} will have no audio this run", file=sys.stderr)
        _voice_cache[lang] = None
        return None

    chosen = wavenet_voices[0]
    _voice_cache[lang] = chosen
    print(f"[audio] {lang} ({language_code}) → {chosen} "
          f"(chosen live from voices.list, {len(wavenet_voices)} WaveNet "
          f"option(s) available — swap freely after listening to samples)")
    return (language_code, chosen)


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _chunk_text_for_tts(text: str, max_bytes: int = _TTS_MAX_BYTES_PER_REQUEST) -> list[str]:
    """Split `text` into pieces each under `max_bytes` when UTF-8 encoded,
    breaking only at sentence boundaries (never mid-sentence, never
    mid-word) -- see module docstring "CHUNKING". Expected to return a
    single-element list for every real article in this pipeline given
    current word-count targets; built to not assume that, per spec."""
    sentences = _SENTENCE_SPLIT_RE.split(text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate.encode("utf-8")) <= max_bytes:
            current = candidate
        else:
            if current:
                chunks.append(current)
            # A single sentence longer than the limit on its own (never
            # observed in this pipeline's actual output, but not assumed
            # impossible) -- hard-split it rather than send an oversized
            # request that the API would just reject.
            if len(sentence.encode("utf-8")) > max_bytes:
                words = sentence.split()
                piece = ""
                for word in words:
                    cand2 = f"{piece} {word}".strip() if piece else word
                    if len(cand2.encode("utf-8")) <= max_bytes:
                        piece = cand2
                    else:
                        if piece:
                            chunks.append(piece)
                        piece = word
                current = piece
            else:
                current = sentence
    if current:
        chunks.append(current)
    return chunks or [text]


def _synthesize_chunk(tts_client, text: str, language_code: str, voice_name: str) -> bytes:
    from google.cloud import texttospeech
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code=language_code, name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
    )
    response = tts_client.synthesize_speech(
        input=synthesis_input, voice=voice, audio_config=audio_config,
    )
    return response.audio_content


def _synthesize_article(tts_client, headline: str, body: str,
                          language_code: str, voice_name: str) -> bytes:
    """Headline read first, then the body -- narrating the article the same
    way a reader encounters it, not just the body alone."""
    full_text = f"{headline}. {body}".strip()
    chunks = _chunk_text_for_tts(full_text)
    audio_parts = [
        _synthesize_chunk(tts_client, chunk, language_code, voice_name)
        for chunk in chunks
    ]
    return b"".join(audio_parts)


def _qualifying_articles(bundle: dict):
    """Yields (lang, level, length, article) for every article this stage is
    in scope for -- leveled `briefings` only (never nativeJournalism), every
    level/length actually present, genre == GLOBAL NEWS only. See module
    docstring SCOPE."""
    briefings = bundle.get("briefings") or {}
    for lang, by_level in briefings.items():
        if not isinstance(by_level, dict):
            continue
        for level, by_length in by_level.items():
            if not isinstance(by_length, dict):
                continue
            for length, briefing in by_length.items():
                articles = (briefing or {}).get("articles") or []
                for article in articles:
                    if (article.get("genre") or "").upper() == _TARGET_GENRE:
                        yield lang, level, length, article


def run_audio_narration(bundle: dict, date: str) -> dict:
    """Mutates `bundle` in place (adds "audioKey" to every qualifying article),
    returns a summary dict for logging/reporting. Never raises -- every
    failure mode short-circuits to leaving audioKey as None for the affected
    article and moving on. See module docstring RESILIENCE."""
    summary = {"considered": 0, "skipped_existing": 0, "generated": 0, "failed": 0}

    if not _google_credentials_present():
        print("[audio] GOOGLE_APPLICATION_CREDENTIALS not set — "
              "GOOGLE_TTS_CREDENTIALS_B64 secret is missing or not yet "
              "provisioned. Skipping audio narration entirely this run.")
        return summary
    if not _r2_credentials_present():
        print("[audio] R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY not "
              "all set — R2 credentials are missing or not yet provisioned. "
              "Skipping audio narration entirely this run.")
        return summary

    try:
        from google.cloud import texttospeech
        tts_client = texttospeech.TextToSpeechClient()
        r2_client = _r2_client()
    except Exception as e:                                        # noqa: BLE001
        print(f"[audio] could not initialise TTS/R2 clients ({e}) — "
              f"skipping audio narration entirely this run", file=sys.stderr)
        return summary

    for lang, level, length, article in _qualifying_articles(bundle):
        summary["considered"] += 1
        slug = article.get("slug") or "unknown-slug"
        key = _r2_key(date, lang, level, length, slug)

        try:
            if _r2_object_exists(r2_client, key):
                article["audioKey"] = key
                summary["skipped_existing"] += 1
                continue

            voice = _voice_for_lang(tts_client, lang)
            if not voice:
                article["audioKey"] = None
                summary["failed"] += 1
                continue
            language_code, voice_name = voice

            headline = article.get("headline") or ""
            body = article.get("body") or ""
            if not body:
                article["audioKey"] = None
                summary["failed"] += 1
                continue

            audio_bytes = _synthesize_article(
                tts_client, headline, body, language_code, voice_name)
            _upload_to_r2(r2_client, key, audio_bytes)
            article["audioKey"] = key
            summary["generated"] += 1

        except Exception as e:                                    # noqa: BLE001
            print(f"[audio] FAILED {lang}/{level}/{length}/{slug}: {e} — "
                  f"leaving audioKey null, continuing", file=sys.stderr)
            article["audioKey"] = None
            summary["failed"] += 1

    return summary


def main() -> None:
    """Never raises, never a non-zero exit -- see module docstring RESILIENCE.
    Reads output/latest.json (same file every other stage already reads/
    writes, same convention as bilinguist_check.py), writes the result back
    to BOTH output/latest.json and output/{date}.json so whichever the
    "Push bundle to data repo" workflow step copies already has audioKey."""
    try:
        script_dir = Path(__file__).parent
        output_dir = script_dir / "output"
        bundle_path = output_dir / "latest.json"

        if not bundle_path.exists():
            print("[audio] output/latest.json not found — nothing to do "
                  "(run bilinguist_write.py first). Skipping.", file=sys.stderr)
            return

        with open(bundle_path, encoding="utf-8") as f:
            bundle = json.load(f)

        date = bundle.get("date") or os.environ.get("BRIEF_DATE")
        if not date:
            print("[audio] bundle has no \"date\" and BRIEF_DATE is unset — "
                  "cannot form a deterministic R2 key. Skipping.", file=sys.stderr)
            return

        materialize_google_credentials()  # no-op, returns False, if secret unset

        t0 = time.time()
        summary = run_audio_narration(bundle, date)
        elapsed = time.time() - t0

        print(f"[audio] {summary['considered']} article(s) in scope — "
              f"{summary['generated']} generated, "
              f"{summary['skipped_existing']} already covered by a previous "
              f"run, {summary['failed']} failed (left null) — {elapsed:.1f}s")

        if summary["generated"] or summary["skipped_existing"]:
            with open(bundle_path, "w", encoding="utf-8") as f:
                json.dump(bundle, f, ensure_ascii=False, indent=2)
            dated_path = output_dir / f"{date}.json"
            if dated_path.exists():
                with open(dated_path, "w", encoding="utf-8") as f:
                    json.dump(bundle, f, ensure_ascii=False, indent=2)

    except Exception as e:                                        # noqa: BLE001
        print(f"[audio] unexpected error, audio narration skipped entirely "
              f"this run: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
