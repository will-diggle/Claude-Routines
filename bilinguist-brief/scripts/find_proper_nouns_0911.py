"""
find_proper_nouns_0911.py
==========================
Identifies likely proper nouns / English loanwords among today's truly-new
words, using the established heuristic: a word that appears capitalized
mid-sentence (not sentence-initial) in the ORIGINAL brief text is very
likely a name (Donald Trump, Berlin, Houthis, ...) rather than a genuine
vocabulary word. These get a lightweight pass (short factual gloss only,
no grammar tables) instead of full population treatment.
"""
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
# German excluded: it capitalizes EVERY noun (Haus, Regierung, ...), not just
# proper nouns, so "capitalized mid-sentence" is not a proper-noun signal
# there at all — it would flag hundreds of ordinary common nouns as names.
LANGUAGES = ["fr", "es", "it", "sv", "pt"]

with open(SCRIPT_DIR / "output" / "brief_0911.json", encoding="utf-8") as f:
    bundle = json.load(f)

SENT_SPLIT = re.compile(r"(?<=[.!?»])\s+")
WORD_RE = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?", re.UNICODE)


def capitalized_midsentence_words(text: str) -> set:
    found = set()
    for sentence in SENT_SPLIT.split(text):
        words_with_pos = list(WORD_RE.finditer(sentence))
        for i, m in enumerate(words_with_pos):
            w = m.group(0)
            if i == 0:
                continue  # sentence-initial capitalization is just grammar, not signal
            if w[0].isupper() and len(w) >= 2:
                found.add(w.lower())
    return found


def collect_all_text(bundle: dict, lang: str) -> list:
    texts = []
    nj = bundle.get("nativeJournalism", {}).get(lang, {})
    for articles in nj.values():
        for a in articles:
            texts.append(f"{a.get('headline','')} {a.get('body','')}")
    levels = bundle.get("briefings", {}).get(lang, {})
    for lengths in levels.values():
        for section in lengths.values():
            for a in section.get("articles", []):
                texts.append(f"{a.get('headline','')} {a.get('body','')}")
    return texts


grand_total = 0
for lang in LANGUAGES:
    with open(SCRIPT_DIR / "output" / f"truly_new_0911_{lang}.json", encoding="utf-8") as f:
        truly_new = set(json.load(f))

    capitalized = set()
    for text in collect_all_text(bundle, lang):
        capitalized |= capitalized_midsentence_words(text)

    proper_nouns = sorted(truly_new & capitalized)
    print(f"{lang}: {len(proper_nouns)} likely proper nouns/loanwords out of {len(truly_new)} truly-new")

    with open(SCRIPT_DIR / "output" / f"proper_nouns_0911_{lang}.json", "w", encoding="utf-8") as f:
        json.dump(proper_nouns, f, ensure_ascii=False, indent=2)
    grand_total += len(proper_nouns)

print(f"\nTOTAL likely proper nouns/loanwords: {grand_total}")
