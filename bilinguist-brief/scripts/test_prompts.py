"""
Prompt structure tests. Run in CI before any Gemini call is made.

These exist because of a real failure: the native prompt used to be two near-identical
templates, one per length, and POLITICAL TITLES ended up in the short one only. Native
longer — the article people actually read — had no guard against "former President
Trump" for weeks, and nothing failed. A missing section changes the output silently.

    python test_prompts.py
"""

import sys

import bilinguist_prompts as P
import bilinguist_write as W

FAILURES: list = []


def check(cond, msg):
    if not cond:
        FAILURES.append(msg)


# ── every placeholder must be substituted ────────────────────────────────────
STORY = {
    "slug": "a-real-story", "genre": "GLOBAL NEWS",
    "headline": "Something happened", "what_happened": ["a fact"],
    "attribution": [], "verified": [], "contested": [],
    "numbers": ["12"], "proper_nouns": ["Berlin"], "key_terms": ["term"],
    "cross_reference_score": {"rank": 1, "sources": [{"outlet": "Reuters", "position": 1}]},
}
PLACEHOLDERS = ("{LANGUAGE}", "{OUTLET}", "{FRAMING}", "{STRUCTURE}", "{GENRE_RULE}",
                "{WORD_MIN}", "{WORD_MAX}", "{VARIANT_RULE}", "{QUOTE_RULE}",
                "{OUTPUT_FORMAT}", "{LEVEL_DESCRIPTION}", "{LENGTH_INSTRUCTION}",
                "{CUT_RULE}", "{GLOSS_RULE}", "{ATTRIBUTION_RULE}", "{TITLE_RULE}")

for lang in ("en", "fr", "de", "sv", "it", "es"):
    for length in ("short", "longer"):
        p = W.build_native_prompt(lang, [STORY], length)
        for ph in PLACEHOLDERS:
            check(ph not in p, f"native {lang}/{length}: unsubstituted {ph}")
        for level in ("A1", "A2", "B1"):
            lp = W.build_writing_prompt(W.PROMPT_2S_HEADER, lang, level, length, [STORY])
            for ph in PLACEHOLDERS:
                check(ph not in lp, f"level {lang}/{level}/{length}: unsubstituted {ph}")
            rp = W.build_rewrite_prompt(lang, level, length,
                                        {"genre": "GLOBAL NEWS", "slug": "s",
                                         "headline": "h", "body": "b"})
            for ph in PLACEHOLDERS:
                check(ph not in rp, f"rewrite {lang}/{level}/{length}: unsubstituted {ph}")

# ── the native prompt must carry every required section, at BOTH lengths ─────
REQUIRED_NATIVE = [
    "WORD COUNT", "STRUCTURE:", "WRITING RULES", "ATTRIBUTION:", "FACT ORDER:",
    "QUOTATION MARKS:", "GLOSSARY:", "NEUTRALITY:", "HEADLINE:",
    "Never name a news outlet", "OUTPUT FORMAT",
]
for length in ("short", "longer"):
    p = W.build_native_prompt("en", [STORY], length)
    for section in REQUIRED_NATIVE:
        check(section in p, f"native/{length}: missing section {section!r}")

# ── genre blocks: each is injected, and ONLY for its own genre ───────────────
for genre, marker in (("GLOBAL NEWS", "parallel treatment"),
                      ("UK POLITICS", "Distinguish the government"),
                      ("BUSINESS & ECONOMY", "investment-advice")):
    for length in ("short", "longer"):
        p = W.build_native_prompt("en", [dict(STORY, genre=genre)], length)
        check(marker in p, f"native/{length} {genre}: genre block missing ({marker!r})")
        for other, other_marker in (("UK POLITICS", "Distinguish the government"),
                                    ("BUSINESS & ECONOMY", "investment-advice"),
                                    ("GLOBAL NEWS", "parallel treatment")):
            if other != genre:
                check(other_marker not in p,
                      f"native/{length} {genre}: leaked {other} block ({other_marker!r})")

# POLITICAL TITLES is universal WRITING RULES now (was UK-POLITICS-only, which left every
# other genre unprotected — confirmed in production, a GLOBAL NEWS story shipped "former
# President"). Assert it reaches EVERY genre at BOTH lengths, not just politics.
for genre in ("GLOBAL NEWS", "UK POLITICS", "BUSINESS & ECONOMY"):
    for length in ("short", "longer"):
        p = W.build_native_prompt("en", [dict(STORY, genre=genre)], length)
        check("POLITICAL TITLES" in p,
              f"native/{length} {genre}: lost POLITICAL TITLES (should be universal now)")
        check("never \"former President\"" in p or "former President" in p,
              f"native/{length} {genre}: POLITICAL TITLES present but missing the 'former' example")

# ── the level rewrite must never authorise dropping a title ─────────────────
rp = W.build_rewrite_prompt("fr", "A1", "longer",
                            {"genre": "G", "slug": "s", "headline": "h", "body": "b"})
check("Every TITLE, verbatim" in rp, "rewrite: titles are not protected")
check("SIMPLIFY freely" in rp, "rewrite: no guidance that descriptive terms MAY simplify")

# ── the ladder must agree across the three places that hold it ──────────────
import bilinguist_check as C  # noqa: E402
for level, bands in W.WORDS_PER_ARTICLE.items():
    for length, band in bands.items():
        parts = str(band).replace("–", "-").split("-")
        want_canon = (int(parts[0]), int(parts[-1]))
        got_canon = C.WORD_TARGETS.get(level, {}).get(length)
        check(got_canon == want_canon,
              f"canonical ladder mismatch {level}/{length}: "
              f"write.py {want_canon} vs check.py {got_canon}")
        # And the language-adjusted band the prompt asks for must equal the band the
        # report measures against, or the notification contradicts the instruction.
        for lang in ("en", "fr", "de", "sv", "it", "es"):
            asked = P.word_band(band, lang)
            measured = C._target(level, length, lang)
            check(asked == measured,
                  f"band mismatch {lang} {level}/{length}: prompt asks {asked}, "
                  f"check.py measures {measured}")

if FAILURES:
    print(f"{len(FAILURES)} prompt check(s) FAILED:")
    for f in FAILURES:
        print(f"  ✗ {f}")
    sys.exit(1)
print("all prompt checks passed")
