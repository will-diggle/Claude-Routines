"""
merge_audio_keys.py — surgically merge audioKey fields into fresh bilinguist-data
content, without touching anything else.

Added 2026-09-18 after generate-audio.yml clobbered real fact-check fixes three
times in one morning: it cloned bilinguist-data once at job start, ran
bilinguist_audio.py against that snapshot, then blindly copied the whole
processed file back over latest.json/briefings/{date}.json at push time. Any
fix the fact-sweep routine committed to main *during* the TTS run (which takes
several minutes) was silently reverted, because the push step overwrote the
entire file with a copy based on the stale pre-fix snapshot -- not just the
new audioKey field.

This script takes the FRESH file (re-fetched from main immediately before
this runs) and the PROCESSED file (bilinguist_audio.py's output, built from
the earlier, possibly-stale snapshot), and copies ONLY audioKey values -- for
GLOBAL NEWS articles under briefings[lang][level][length].articles[], matched
by slug -- from processed into fresh. Every other field in fresh is left
byte-for-byte as it was. This is what bilinguist_audio.py's own module
docstring already promises ("adds an audioKey field ... nothing else") --
this script is what actually makes that true at the git-push layer, not just
within a single process.
"""
import json
import sys


def index_audio_keys(bundle):
    out = {}
    for lang, levels in bundle.get("briefings", {}).items():
        if not isinstance(levels, dict):
            continue
        for level, lengths in levels.items():
            if not isinstance(lengths, dict):
                continue
            for length, val in lengths.items():
                arts = val.get("articles", val) if isinstance(val, dict) else val
                if not isinstance(arts, list):
                    continue
                for a in arts:
                    if isinstance(a, dict) and a.get("audioKey") and a.get("slug"):
                        out[(lang, level, length, a["slug"])] = a["audioKey"]
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} <fresh.json> <processed.json>")
    fresh_path, processed_path = sys.argv[1], sys.argv[2]

    with open(fresh_path, encoding="utf-8") as f:
        fresh = json.load(f)
    with open(processed_path, encoding="utf-8") as f:
        processed = json.load(f)

    new_keys = index_audio_keys(processed)
    applied = 0

    for lang, levels in fresh.get("briefings", {}).items():
        if not isinstance(levels, dict):
            continue
        for level, lengths in levels.items():
            if not isinstance(lengths, dict):
                continue
            for length, val in lengths.items():
                arts = val.get("articles", val) if isinstance(val, dict) else val
                if not isinstance(arts, list):
                    continue
                for a in arts:
                    if not isinstance(a, dict):
                        continue
                    key = (lang, level, length, a.get("slug"))
                    if key in new_keys and not a.get("audioKey"):
                        a["audioKey"] = new_keys[key]
                        applied += 1

    with open(fresh_path, "w", encoding="utf-8") as f:
        json.dump(fresh, f, ensure_ascii=False, indent=2)

    print(f"[merge_audio_keys] applied {applied} audioKey field(s) into {fresh_path}; "
          f"no other field touched")


if __name__ == "__main__":
    main()
