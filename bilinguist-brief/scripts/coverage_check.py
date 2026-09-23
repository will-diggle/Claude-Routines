"""
coverage_check.py
=================
Reads today's brief bundle and checks how many unique words are already
covered in the word_dictionary database.

"Covered" means the surface word's lemma (root form) has an entry in the DB.
Uses the tokenMap embedded in the brief if available; otherwise falls back to
a direct surface-word lookup against both the `word` and `lemma` columns.

Usage:
    python coverage_check.py [--date YYYY-MM-DD]
"""

import argparse
import json
import sys
from pathlib import Path
from collections import defaultdict

import regex as uregex
from supabase import create_client

SCRIPT_DIR = Path(__file__).parent
ENV_FILE   = SCRIPT_DIR.parent / ".env"
OUTPUT_DIR = SCRIPT_DIR / "output"

_WORD_RE = uregex.compile(r"\p{L}+(?:'\p{L}+)?", uregex.UNICODE)

LANG_NAMES = {
    "fr": "French", "de": "German", "en": "English",
    "sv": "Swedish", "es": "Spanish", "it": "Italian",
    "tr": "Turkish", "hu": "Hungarian", "ar": "Arabic",
}

# Parts of speech we skip for coverage — function words not worth tracking
SKIP_POS = {"PRON", "DET", "PUNCT", "NUM", "CONJ", "ADP"}

# Common stop words per language (articles, pronouns, prepositions) to exclude
# from the "missing" list — they're not learnable vocab items
STOP_WORDS = {
    "fr": {"le","la","les","un","une","des","de","du","et","en","à","au","aux",
           "il","elle","ils","elles","je","tu","nous","vous","on","se","ce","que",
           "qui","ne","pas","plus","très","bien","aussi","mais","ou","car","donc",
           "or","ni","y","en","par","pour","sur","sous","dans","avec","sans"},
    "de": {"der","die","das","den","dem","des","ein","eine","einen","einem","einer",
           "eines","und","oder","aber","auch","nicht","noch","schon","ich","du","er",
           "sie","es","wir","ihr","in","an","auf","bei","für","mit","nach","von",
           "vor","zu","über","unter","zwischen","ist","war","hat","haben","sein"},
    "es": {"el","la","los","las","un","una","unos","unas","de","del","al","en","que",
           "y","o","pero","sin","con","por","para","se","le","lo","les","me","te",
           "nos","os","su","sus","mi","tu","muy","más","no","sí","ya","hay","como"},
    "it": {"il","lo","la","i","gli","le","un","una","di","del","della","dei","degli",
           "delle","in","a","da","su","per","tra","fra","e","o","ma","non","che",
           "si","mi","ti","ci","vi","li","lo","la","ne","è","sono","ha","ho"},
    "sv": {"en","ett","den","det","de","och","i","på","till","av","för","med","är",
           "var","som","att","sig","han","hon","vi","ni","de","inte","men","eller"},
    "en": {"the","a","an","in","on","at","to","for","of","and","or","but","is","are",
           "was","were","be","been","have","has","had","will","would","could","should",
           "it","its","this","that","these","those","he","she","they","we","you","i"},
    "tr": {"ve","bir","bu","da","de","ile","için","olan","olarak","ise"},
    "hu": {"a","az","és","hogy","nem","is","csak","de","már","még","mint","egy"},
}


def load_env():
    env = {}
    if not ENV_FILE.exists():
        return env
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def extract_words_from_bundle(bundle: dict) -> dict[str, set[str]]:
    """
    Returns {lang: set_of_surface_words} from all articles.
    If a tokenMap exists, uses it (and skips function-word POS).
    Otherwise extracts raw word tokens.
    """
    words_by_lang: dict[str, set[str]] = defaultdict(set)

    def _add_article(article: dict, lang: str):
        token_map = article.get("tokenMap")
        if token_map:
            # Use Gemini-annotated lemmas directly — best accuracy
            for t in token_map:
                if t.get("pos") not in SKIP_POS and t.get("lemma"):
                    words_by_lang[lang].add(t["lemma"].lower())
        else:
            # Fall back to raw surface words
            text = article.get("headline","") + " " + article.get("body","")
            for w in _WORD_RE.findall(text):
                words_by_lang[lang].add(w.lower())

    for lang, lang_data in bundle.get("briefings", {}).items():
        for level_data in lang_data.values():
            for briefing in level_data.values():
                for article in briefing.get("articles", []):
                    _add_article(article, lang)

    for lang, articles in bundle.get("nativeJournalism", {}).items():
        for article in articles:
            _add_article(article, lang)

    return dict(words_by_lang)


def build_inflection_map(rows: list[dict]) -> dict[str, str]:
    """
    Build a reverse lookup: inflected_form → lemma, by extracting every
    surface form stored inside each row's data column.

    Covers:
      - The lemma itself
      - The word column (surface form the entry was generated from)
      - Verbs: every conjugated form across all tenses (data→tenses)
      - Verbs: imperative forms, past participle, present participle, zu-infinitive
      - Nouns: singular and plural (data→singular / data→plural)
      - Adjectives: feminine, comparative, superlative (data→feminine etc.)
    """
    inflection_map: dict[str, str] = {}

    def _add(form, lemma):
        if form and lemma:
            # Extract only alpha tokens — "sehe an" → ["sehe", "an"]
            for token in _WORD_RE.findall(form.lower()):
                if len(token) > 1:
                    inflection_map.setdefault(token, lemma)

    for row in rows:
        lemma = (row.get("lemma") or "").lower().strip()
        word  = (row.get("word")  or "").lower().strip()
        if not lemma:
            continue

        _add(lemma, lemma)
        _add(word,  lemma)

        data = row.get("data") or {}
        if not isinstance(data, dict):
            try:
                data = json.loads(data)
            except Exception:
                data = {}

        # ── Verbs: all tense conjugations ────────────────────────────────────
        tenses = data.get("tenses") or {}
        if isinstance(tenses, dict):
            for tense_forms in tenses.values():
                if isinstance(tense_forms, dict):
                    for form in tense_forms.values():
                        _add(form, lemma)

        # ── Verbs: extra forms ────────────────────────────────────────────────
        for key in ("past_participle", "present_participle",
                    "zu_infinitive", "infinitive"):
            _add(data.get(key), lemma)

        imperative = data.get("imperative") or {}
        if isinstance(imperative, dict):
            for form in imperative.values():
                _add(form, lemma)

        # ── Nouns: singular / plural ──────────────────────────────────────────
        for key in ("singular", "plural"):
            _add(data.get(key), lemma)

        # ── Adjectives ────────────────────────────────────────────────────────
        for key in ("feminine", "masculine", "comparative", "superlative",
                    "feminine_plural", "masculine_plural"):
            _add(data.get(key), lemma)

    return inflection_map


def query_db_for_language(supa, lang: str, surface_words: set[str]) -> dict:
    """
    Fetch all entries for this language, build the full inflection map,
    then classify each surface word from the brief as covered or missing.
    """
    # Fetch every row — we need lemma, word, and data
    try:
        resp = supa.table("word_dictionary") \
            .select("lemma, word, data") \
            .eq("language", lang) \
            .execute()
        rows = resp.data
    except Exception as e:
        print(f"  [ERROR] DB query failed for {lang}: {e}", file=sys.stderr)
        return {}

    inflection_map = build_inflection_map(rows)  # inflected_form → lemma
    all_db_lemmas  = {(row.get("lemma") or "").lower() for row in rows if row.get("lemma")}

    covered:   set[str] = set()
    uncovered: set[str] = set()
    stop = STOP_WORDS.get(lang, set())

    for w in surface_words:
        if w in stop or len(w) <= 1:
            continue
        if w in inflection_map:
            covered.add(w)
        else:
            uncovered.add(w)

    return {
        "covered":        covered,
        "uncovered":      uncovered,
        "all_db_lemmas":  all_db_lemmas,
        "inflection_map": inflection_map,
        "total_inflections": len(inflection_map),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to latest")
    args = parser.parse_args()

    bundle_path = OUTPUT_DIR / (f"{args.date}.json" if args.date else "latest.json")
    if not bundle_path.exists():
        print(f"ERROR: Bundle not found at {bundle_path}", file=sys.stderr)
        sys.exit(1)

    with open(bundle_path, encoding="utf-8") as f:
        bundle = json.load(f)

    date = bundle.get("date", "unknown")
    print(f"\n{'='*60}")
    print(f"  WORD COVERAGE CHECK — {date}")
    print(f"{'='*60}\n")

    # Check if we have tokenMaps
    sample = next(
        (a for ld in bundle.get("briefings",{}).values()
           for lvl in ld.values()
           for b in lvl.values()
           for a in b.get("articles",[])), None
    )
    has_token_maps = sample and "tokenMap" in sample
    if has_token_maps:
        print("  ✓ Using embedded tokenMaps (lemma-level accuracy)\n")
    else:
        print("  ⚠ No tokenMaps found — using raw surface words\n"
              "    (run bilinguist_tokenise.py for lemma-level accuracy)\n")

    words_by_lang = extract_words_from_bundle(bundle)

    env = load_env()
    supa_url = env.get("EXPO_PUBLIC_SUPABASE_URL","")
    supa_key = env.get("SUPABASE_SERVICE_ROLE_KEY","")
    if not supa_url or not supa_key:
        print("ERROR: Supabase credentials not found in .env", file=sys.stderr)
        sys.exit(1)

    supa = create_client(supa_url, supa_key)

    total_words_all  = 0
    total_covered_all = 0
    all_uncovered: dict[str, list[str]] = {}

    for lang in sorted(words_by_lang.keys()):
        surface_words = words_by_lang[lang]
        lang_name = LANG_NAMES.get(lang, lang.upper())
        result = query_db_for_language(supa, lang, surface_words)
        if not result:
            continue

        covered   = result["covered"]
        uncovered = result["uncovered"]
        stop = STOP_WORDS.get(lang, set())
        meaningful = {w for w in surface_words if w not in stop and len(w) > 1}
        total     = len(meaningful)
        n_covered = len(covered)
        pct = (n_covered / total * 100) if total else 0

        total_words_all   += total
        total_covered_all += n_covered
        all_uncovered[lang] = sorted(uncovered)

        flag = {"fr":"🇫🇷","de":"🇩🇪","es":"🇪🇸","it":"🇮🇹","sv":"🇸🇪",
                "en":"🇬🇧","tr":"🇹🇷","hu":"🇭🇺","ar":"🇸🇦"}.get(lang,"  ")

        bar_filled = int(pct / 5)
        bar = "█" * bar_filled + "░" * (20 - bar_filled)

        print(f"  {flag} {lang_name:<10} [{bar}] {pct:5.1f}%  "
              f"({n_covered}/{total} words covered, {len(uncovered)} missing)")
        print(f"             DB lemmas: {len(result['all_db_lemmas'])}  |  "
              f"Total inflections indexed: {result['total_inflections']}")
        print()

    overall_pct = (total_covered_all / total_words_all * 100) if total_words_all else 0
    print(f"{'─'*60}")
    print(f"  OVERALL: {overall_pct:.1f}% covered  "
          f"({total_covered_all}/{total_words_all} unique words)\n")

    # Print missing words per language
    print(f"{'='*60}")
    print(f"  WORDS NOT YET IN DATABASE\n")
    for lang in sorted(all_uncovered.keys()):
        missing = all_uncovered[lang]
        if not missing:
            print(f"  {LANG_NAMES.get(lang,lang)}: ✅ all covered!\n")
            continue
        print(f"  {LANG_NAMES.get(lang,lang)} ({len(missing)} missing):")
        # Group into rows of 6
        for i in range(0, min(len(missing), 60), 6):
            print(f"    {', '.join(missing[i:i+6])}")
        if len(missing) > 60:
            print(f"    ... and {len(missing)-60} more")
        print()


if __name__ == "__main__":
    main()
