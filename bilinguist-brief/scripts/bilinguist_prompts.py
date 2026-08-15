# Production prompts — locked. Edit bilinguist_prompts_test.py instead.
# bilinguist_write.py imports from here unless --test is passed.

# Per-level CEFR descriptions. build_writing_prompt injects ONLY the target level.
# Deliberately bare: the model already knows what a CEFR level implies, and spelling
# out grammatical rules was tested and produced WORSE output — it optimises for rule
# compliance over natural writing. Do not "improve" these into rule lists.
LEVEL_DESCRIPTIONS: dict[str, str] = {
    "A1": "A1 (Beginner)", "A2": "A2 (Elementary)", "B1": "B1 (Intermediate)",
    "B2": "B2 (Upper Intermediate)", "C1": "C1 (Advanced)", "C2": "C2 (Proficient)",
}

# Per-length instruction. Only the relevant length is shown per call.
#
# These used to carry "if you are under {WORD_MIN}, add another fact…" plus a
# paragraph-by-paragraph structure and three lines arguing for length. All of it was
# there because the factbase was too thin to fill the target, so the model had to be
# pushed. Splitting selection from fact-finding removed that: A2/longer came in at
# 112–131 against a 110–130 target on 2026-08-10, the healthiest band in the run. So
# the padding instructions no longer earn their place and are gone.
#
# Paragraph guidance applies to "longer" only — a short article is one paragraph.
LENGTH_INSTRUCTIONS: dict[str, str] = {
    "short":  "The body must be between {WORD_MIN} and {WORD_MAX} words. Count every word before submitting.",
    "longer": (
        "The body must be between {WORD_MIN} and {WORD_MAX} words. Count every word before submitting.\n"
        "Use 2–3 paragraphs."
    ),
}

# ── Per-language word-density factors ────────────────────────────────────────
# One word count cannot fit five languages. Measured across two runs and both lengths on
# 2026-08-10, each language's output sits at a stable ratio to the group mean:
#
#            short  longer
#     fr      1.08    1.11     French and Italian need ~9% more words for the same content
#     it      1.09    1.08     (de, des, à la, qui est …)
#     en      0.98    0.98     English sits on the mean
#     de      0.93    0.93     German and Swedish compound, so ~8% fewer
#     sv      0.92    0.89     (Rüstungsindustrie is one word)
#
# The canonical band in WORDS_PER_ARTICLE is multiplied by these, so French is asked for
# 229-251 where German is asked for 195-214 — instead of both being asked for 210-230 and
# one of them always being wrong. WORD_TARGETS_LANG still takes precedence where set:
# Turkish and Arabic deviate far more than a factor (agglutination), so they stay explicit.
LANGUAGE_WORD_FACTOR: dict[str, float] = {
    "fr": 1.09,
    "it": 1.08,
    "es": 1.08,   # no native data yet — assumed to behave like Italian. Revisit once measured.
    "en": 0.98,
    # Bumped 0.93 -> 0.96 on 2026-08-15: real output was landing at or just under the floor
    # in every German combo that day (never over it), including one real miss (B1/short,
    # 85w vs an 88w floor) -- the old factor was leaving no headroom anywhere. Every other
    # combo had real margin to the ceiling, so this is a low-risk nudge, not a guess; still
    # worth re-checking against the next run's real numbers.
    "de": 0.96,
    # Bumped 0.90 -> 0.94 on 2026-08-15, same reasoning as German: real output was at or
    # under the floor everywhere that day, never over it, with the worst miss (B1/short,
    # 78w vs an 86w floor, 9.3% under) bigger than German's -- a larger bump to match.
    "sv": 0.94,
}


def word_band(band: str, lang: str = "") -> tuple[int, int]:
    """Canonical "210-230" plus a language, to that language's actual target."""
    parts = str(band).replace("\u2013", "-").split("-")
    lo, hi = int(parts[0].strip()), int(parts[-1].strip())
    f = LANGUAGE_WORD_FACTOR.get(lang, 1.0)
    return round(lo * f), round(hi * f)


# Per-(language, level) override of LANGUAGE_WORD_FACTOR, for cases where a language's
# general factor is right everywhere except one specific level. Italian A1 (both lengths)
# was landing 5-7% under its floor on 2026-08-15 while Italian A2/B1/Native were all
# comfortably green -- lowering LANGUAGE_WORD_FACTOR["it"] itself would have broken those.
# A1 tends to run shorter than other levels in every language (simpler grammar leaves less
# room to fill the count), so a level-specific override is the correct lever, not a
# language-wide one. Checked before LANGUAGE_WORD_FACTOR in word_band_for_level(); absent
# entries fall through to the language's normal factor.
LEVEL_WORD_FACTOR_OVERRIDE: dict[str, dict[str, float]] = {
    "it": {"A1": 1.00},
}


def word_band_for_level(band: str, lang: str, level: str) -> tuple[int, int]:
    """Like word_band(), but checks LEVEL_WORD_FACTOR_OVERRIDE for this exact
    (lang, level) first. Use this wherever a level is known (Stage 7 rewrites);
    word_band() stays level-agnostic for Stage 5 native, which has no level."""
    override = LEVEL_WORD_FACTOR_OVERRIDE.get(lang, {}).get(level)
    if override is None:
        return word_band(band, lang)
    parts = str(band).replace("\u2013", "-").split("-")
    lo, hi = int(parts[0].strip()), int(parts[-1].strip())
    return round(lo * override), round(hi * override)


# One outlet per language, injected as {OUTLET}. The native prompt used to list all eight
# and let the model pick its own line — the same shape as the "IF German is English" bug
# that VARIANT_RULES below was created to fix. Only the relevant one is now shown.
NATIVE_OUTLETS: dict[str, str] = {
    "fr": "Le Monde",
    "de": "Der Spiegel",
    "en": "The Telegraph (British English throughout — never American)",
    "sv": "Dagens Nyheter",
    "es": "El País",
    "it": "Corriere della Sera",
    "hu": "HVG",
    "ar": "Al Jazeera (Modern Standard Arabic / الفصحى only — no dialect, no transliteration)",
    "tr": "Cumhuriyet",
}
# Any language without an entry falls back to this rather than naming a wrong outlet.
NATIVE_OUTLET_FALLBACK = "the most respected national daily"


# Per-language rules injected only when relevant. Fixes the "IF German is English" bug.
VARIANT_RULES: dict[str, str] = {
    "ar": "Write exclusively in Modern Standard Arabic (الفصحى). No dialect. No transliteration. Western numerals (0–9).",
    "en": "Write in British English throughout.",
}

# One correct line per language. The native prompt used to show all seven to everyone, and
# four of them (German, Hungarian, English, Swedish) demonstrated the straight ASCII quotes
# the same rule forbids.
QUOTE_RULES: dict[str, str] = {
    "fr": "« … » (U+00AB … U+00BB) with non-breaking spaces",
    "de": "„…“ (U+201E opening, U+201C closing)",
    "es": "«…» (U+00AB … U+00BB)",
    "it": "«…» (U+00AB … U+00BB)",
    "en": "“…” (U+201C opening, U+201D closing)",
    "sv": "”…” (U+201D for both)",
    "hu": "„…” (U+201E opening, U+201D closing)",
    "tr": "“…” (U+201C opening, U+201D closing)",
    "ar": "«…» (U+00AB … U+00BB)",
}
QUOTE_RULE_FALLBACK = "the target language's own typographic quotation marks"

# Level rewrite only. Was a fixed "2-3 paragraphs" by length, independent of the cut rule —
# a heavily-cut A1 rewrite might not have enough material left to fill that, contradicting
# the cut instruction to stop earlier. Since this is a rewrite of the native article, not a
# from-scratch write, matching the source's own paragraph count avoids the contradiction.
PROMPT_LEVEL_STRUCTURE = (
    "STRUCTURE: Keep the same number of paragraphs as the source article, separated by "
    "\\n\\n (two JSON newline escapes) and nowhere else."
)


# One story per call — a bare object, no array to over-fill.
OUTPUT_FORMAT_SINGLE = (
    'OUTPUT FORMAT: {"genre":"...","slug":"...","headline":"...","body":"..."}\n'
    'Return ONE object, not a list. Copy "slug" and "genre" verbatim from the fact-base story.'
)

# Legacy batched path only: several stories in one call, so an array is correct.
OUTPUT_FORMAT_ARRAY = (
    'OUTPUT FORMAT: {"articles":[{"genre":"...","slug":"...","headline":"...","body":"..."}]}\n'
    'One entry per fact-base story. Copy "slug" and "genre" verbatim from each story.'
)

# Stage 5 (native) only, tested across this session's A/B runs: plain text beat forced JSON
# on word-count precision (avg |dev| 24.3 vs 28.0 on a 7-story real A/B) and lets the model
# focus on writing rather than also policing JSON structure.
OUTPUT_FORMAT_PLAIN_SINGLE = (
    "OUTPUT FORMAT — plain text, not JSON:\n"
    "Output ONLY the following, in this exact format:\n"
    "HEADLINE: <the headline, one line>\n"
    "BODY:\n"
    "<the final article body. Paragraphs separated by one blank line.>\n\n"
    "Return nothing else -- no JSON, no markdown, no commentary about your drafting "
    "process, no notes. Just these two fields."
)

# Single-source-of-truth translation (Stage 5): English native is written once per story,
# per length, from the fact-base; every other native language then translates that exact
# English article "as their own outlet's journalist would" rather than writing independently
# from the fact-base. Tested this session (test_real_headlines_translate_check.py): facts,
# fact order and no-hallucination held across two separate real-headline runs. Removes the
# risk of independent per-language drift on terminology/facts that writing from the fact-base
# separately in each language could otherwise introduce.
TRANSLATE_PROMPT_TEMPLATE = """You are a high-end journalist writing for {OUTLET}, the most respected news outlet writing in {LANGUAGE}.

Below is a news article originally written in English. Write it in {LANGUAGE} the way a {OUTLET} journalist would write it natively for their own readers -- NOT a literal, word-for-word translation. Restructure sentences for natural {LANGUAGE} rhythm and idiom.

KEEP, EXACTLY:
- Every fact in the article, and the order they appear in. Never add, drop or reorder facts.
- Every person's name, place name and organisation name, verbatim -- these do not translate.
- Every number, verbatim, INCLUDING its magnitude word (million/billion/trillion). Never convert a trillion figure into an equivalent number of billions, or a billion into millions, even though the arithmetic is correct — "$1.77 trillion" stays "trillion" in {LANGUAGE}, never becomes "1,770 milliards"/"1.77 billones" or similar. Use {LANGUAGE}'s own word for that same magnitude, not a different one.
- Every date exactly as given in the English article — never shorten a full date ("Friday, 14 August 2026") into a vague relative reference ("this Friday", "on Friday") even if that reads more naturally in {LANGUAGE}.
- Every claim's exact strength and certainty, unchanged. If the English article states something as a flat fact, keep it a flat fact. If it attributes a claim to someone, keep the same attribution. If it says a claim was denied, disputed, or contradicted, keep that same word's strength — never soften "police denied this" into "this is unverified", and never harden "an unconfirmed report" into a stated fact.

POLITICAL TITLES -- CRITICAL: translate the title itself into {LANGUAGE} as an ordinary word ("President" -> "{LANGUAGE}'s own word for President", not left in English) -- only the person's NAME stays untranslated. Keep the same rank and status as the English source: never upgrade or downgrade it, never add "former"/"ex-" (or {LANGUAGE}'s equivalent) unless the English source itself says the person has left office.

QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.
{VARIANT_RULE}

Write exactly {TARGET} words -- match the English source's own length. Count every word before submitting.

{OUTPUT_FORMAT}

[ENGLISH ARTICLE BELOW]
Headline: {HEADLINE}
Body: {BODY}
"""


# Learner template. build_writing_prompt substitutes all {placeholders}.
#
# Written in the SINGULAR throughout. Every call carries exactly one story, and the old
# plural framing ("Write news articles… Cover every story from the fact-base") next to a
# plural "articles" array was read as licence to write more than one: fr-A2-longer and
# es-A2-longer shipped 9 articles from 7 stories on 2026-08-10.
#
# The output is a BARE OBJECT, not an {"articles":[…]} array. The array was the licence:
# an array invites more than one entry, and the doubled braces it used to carry ({{…}},
# left over from str.format() while the code uses .replace()) meant the model was also
# being shown invalid JSON as its own output example. build_writing_prompt injects the
# array form via {OUTPUT_FORMAT} only for the legacy batched path, which really does
# write several stories in one call.
PROMPT_LEARNER_TEMPLATE = """\
Write ONE news article in {LANGUAGE} at CEFR {LEVEL_DESCRIPTION} level, from the single story in the fact-base below. Translate organisation names into their established {LANGUAGE} equivalents.

WORD COUNT — STRICT REQUIREMENT:
{LENGTH_INSTRUCTION}

{VARIANT_RULE}
{OUTPUT_FORMAT}
[FACTBASE BELOW]
"""

# Keep these aliases so call sites that still reference them don't break.
# Both now point to the same unified template.
PROMPT_2S_HEADER = PROMPT_LEARNER_TEMPLATE
PROMPT_2M_HEADER = PROMPT_LEARNER_TEMPLATE

# How much has to go, chosen from the ACTUAL ratio between the source and the target —
# not from the length. Since 2026-08-10 every level carries the same word count as native
# except A1, so for A2 and above there is nothing to cut and the old "you must cut"
# wording would make it drop facts for no reason. That was already visible when the rule
# was length-based: arm B's short order scores were its weakest (fr 6/7, de 5/7) while
# every longer combo hit 7/7, and short was the length that needed only a 20% trim.
REWRITE_CUT_RULES: dict[str, str] = {
    # Target is the same size as the source: a pure level change.
    "same": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words — the same length as the source.\n"
        "- Keep EVERY fact. Nothing is dropped and nothing is added. Only the reading "
        "level changes.\n"
        "- Never invent, never generalise, never merge two facts into a vaguer one."
    ),
    # Target is modestly smaller: tighten, do not drop.
    "trim": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words. The source is a little longer than "
        "this.\n"
        "- Keep EVERY fact. Reach the count by tightening the phrasing, not by dropping "
        "anything.\n"
        "- Never invent, never generalise, never merge two facts into a vaguer one."
    ),
    # Two or more CEFR levels below native, at the same word count. Measured 2026-08-10:
    # Stage 8 graded 0/7 articles at A2 in seven of eight combos — they came back B1. The
    # "same" rule above was the cause: keeping every fact of a B2/C1 article inside the same
    # word budget leaves no room to simplify, so the rewrite kept the content and kept the
    # complexity. Simplifying costs words, so at a fixed length it has to carry fewer facts.
    "reduce": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words — the same length as the source, but you "
        "are writing {LEVELS_DOWN} CEFR levels below it.\n"
        "- Simple language needs MORE words to say the same thing, so at this length you must "
        "carry FEWER facts than the source. That is correct, not a loss.\n"
        "- Keep the opening facts in their order and stop earlier in the story. Never reorder.\n"
        "- Spend the words you free up on shorter sentences and commoner words — not on more "
        "facts.\n"
        "- Never invent, never generalise, never merge two facts into a vaguer one."
    ),
    # Target is much smaller: facts have to go, so stop earlier in the same sequence.
    "cut": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words. The source is much longer than this, so "
        "you must stop earlier in the story.\n"
        "- Keep the opening facts in their order and end where the count runs out. Never "
        "reorder.\n"
        "- Within the facts you keep, cut adjectives, secondary detail and background "
        "before cutting anything load-bearing.\n"
        "- Never invent, never generalise, never merge two facts into a vaguer one."
    ),
}


# A1/A2 only. Names, titles and organisations stay verbatim at every level (KEEP, EXACTLY
# above) even when they're above the reader's vocabulary — correct for accuracy, but it
# means an A1 article can carry words no A1 reader knows. Other simplified-news outlets
# (Nachrichtenleicht, VOA Learning English) solve this by glossing the hard term in brackets
# on first mention, in the same simplified language — not by simplifying the term itself.
# B1+ readers don't need this; GLOSS_RULE_FALLBACK is blank for every other level.
GLOSS_RULE_BEGINNER = (
    " As this is a language learner reading at CEFR {LEVEL_DESCRIPTION}, on the FIRST mention "
    "only of a name, title or organisation likely above their level, add a short explanation "
    "in brackets, in {LEVEL_DESCRIPTION} {LANGUAGE} — e.g. \"the Bundesbank (Germany's "
    "central bank)\" written in simple {LANGUAGE}, not English. Do not repeat the explanation "
    "on later mentions of the same term. Do not gloss anything the reader is already likely "
    "to know — major countries, and any current head of state or government (e.g. Donald "
    "Trump), are always familiar; never gloss them. A gloss explains what something IS, "
    "never a person's political status — never write \"(former president)\" or similar next "
    "to a name. If a title needs glossing, explain the institution, not the person's status.\n"
    "The same bracket applies to a precise figure that is hard to picture at this level — a "
    "large sum of money, a percentage, a vote count, a market value. On first mention only, "
    "add a short bracket that puts it in plain terms, in {LEVEL_DESCRIPTION} {LANGUAGE} — "
    "e.g. \"$852 billion (an extremely large amount of money)\", \"63% of the votes (about "
    "two out of three)\". Never round or change the figure itself — the number stays exact, "
    "the bracket only helps the reader picture it. Do not gloss a simple, everyday number "
    "(a date, a small count, an age)."
)
GLOSS_RULE_FALLBACK = ""

# A1/A2 only. "Keep every attribution" collides with "write at A1" in every language that
# marks reported speech with its own grammar — French/Italian "que/che" + a distinct verb
# form, German Konjunktiv I ("sagte, X sei..."). The model satisfies the concrete rule
# (keep the attribution) over the vague one (write A1, no grammar spec given) and reaches
# for the correct, natural, but non-A1 construction — measured 2026-08-11: every language
# with grammatical reported speech graded its A1 output as A2+, tight spread, while English
# (no special mood for "said X was Y") did not show the pattern. Fix is not "keep attribution
# less" — it's telling it HOW to keep attribution without the subordinate-clause grammar.
ATTRIBUTION_RULE_BEGINNER = (
    " At {LEVEL_DESCRIPTION}, write attribution as its own short, separate sentence — not a "
    "subordinate clause introduced by \"that\" (or {LANGUAGE}'s equivalent — que/che/dass/"
    "etc.). Instead of \"Officials said that the plane was smaller,\" write \"Officials said "
    "this. The plane was smaller.\" The fact stays exactly the same; only the grammar "
    "changes. This matters because reported-speech subordinate clauses use a verb form or "
    "mood above {LEVEL_DESCRIPTION} in some languages, even when every word in them is "
    "simple."
)
ATTRIBUTION_RULE_FALLBACK = ""

# A1 only, not A2 -- test pipeline (test-a1-grammar-rule), never production yet. Written
# from three real side-by-side rewrites of the same French story on 2026-08-12: the
# passing-as-A1 sample stayed present tense + direct quotes; the failing ones reached for
# passive voice, "lequel"-style relatives, and "dit que X avait fait Y" -- a subordinate
# clause with its own compound tense inside it. ATTRIBUTION_RULE_BEGINNER already handles
# the "that"-clause case; this is broader -- it also blocks passive voice and relative
# pronouns beyond simple qui/que, which ATTRIBUTION_RULE_BEGINNER never covered.
# Bespoke per language, not one French-templated rule with "(or {LANGUAGE}'s equivalent)".
# That version named passé composé, qui/que, and dans lequel/auquel/dont explicitly and left
# every other language to guess a mapping -- English has no separate "imperfect" tense at
# all (that's a Romance-language category), German A1 is conventionally taught Perfekt not
# "passé composé", Swedish's single preteritum already covers what French splits into
# passé composé/imparfait, and Italian/Spanish each have their own compound-vs-simple-past
# split that doesn't line up with French's either. A rule the model can silently reinterpret
# per language isn't actually constraining anything -- confirmed 2026-08-14 on the real
# pipeline: English A1 graded A2 in 5/6 language, with the model reaching for correct
# grammar under its own (unstated) idea of "simple past", not a rule that pinned it down.
# Rewritten 2026-08-14, second pass: the first bespoke-per-language version (below, in
# spirit) still left grey area -- it named specific banned CONSTRUCTIONS ("said that X had
# done Y") rather than banning a whole CATEGORY, so the model found other members of the
# same category it hadn't been told about by name. Confirmed on real A1 output: German used
# a comparative clause with its own verb ("wie er es getan hat") and a "zu"+infinitive
# dependent clause, neither literally named in the old rule; Italian and Spanish used
# "che"/"que" reported-speech clauses in present tense (the old rule's example used a past
# tense, so the model treated present-tense "che" as a different, allowed case) and Spanish
# used the subjunctive triggered by "pedir que". Rewritten as an ALLOWED/BANNED list per
# language: ONE simple relative clause is the only exception ever permitted; every other
# clause with its own conjugated verb is banned by category (reported speech, causal,
# comparative, purpose, whatever it is), not by a list of named examples with gaps between
# them. A2 is now built explicitly as "everything A1 allows, plus X" -- CEFR levels are
# cumulative for a reader, so the rule should be cumulative too, not a second unrelated list.
GRAMMAR_RULE_A1_BY_LANG: dict[str, str] = {
    "fr": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense and the simple passé composé, active voice only. ONE "
        "relative clause per sentence, only with \"qui\"/\"que\", describing a noun. A "
        "direct quote in quotation marks.\n"
        "BANNED, with no exceptions: the imparfait, the plus-que-parfait, the conditionnel, "
        "the subjonctif, any passive construction (rewrite as active). Any relative pronoun "
        "other than \"qui\"/\"que\" (\"dans lequel\", \"auquel\", \"dont\" are all banned). "
        "Any OTHER clause with its own conjugated verb — reported speech (\"a dit que X\"), "
        "causal (\"parce que X a fait Y\"), comparative (\"comme il l'a fait\"), temporal "
        "(\"quand X a fait Y\"), purpose (\"pour faire X\") — these all count as a second "
        "clause; split into two short "
        "sentences or a direct quote instead. One idea, one verb, per sentence, except the "
        "one allowed relative clause. This ban applies to EVERY attributed claim in the "
        "article, not just the first — a longer article has more people saying things, "
        "which is more chances for this exact violation to slip in partway through. Before "
        "finishing, check every sentence with \"a dit\"/\"a déclaré\" and confirm none of "
        "them use a \"que\"-clause."
    ),
    "en": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense and the simple past, active voice only. ONE relative "
        "clause per sentence, only with \"who\"/\"which\"/\"that\", describing a noun. A "
        "direct quote in quotation marks.\n"
        "BANNED, with no exceptions: the past perfect (\"had done\"), the past continuous "
        "used for narration (\"was doing\"), the conditional, the subjunctive, any passive "
        "construction (rewrite as active). Any relative pronoun other than \"who\"/\"which\"/"
        "\"that\" (\"whom\", \"whose\", \"in which\", \"to whom\" are all banned). Any OTHER "
        "clause with its own conjugated verb — reported speech (\"said that X\"), causal "
        "(\"because X did Y\"), comparative (\"as X did\"), temporal (\"when X did Y\"), "
        "purpose (\"in order to X\") — "
        "these all count as a second clause; split into two short sentences or a direct "
        "quote instead. One idea, one verb, per sentence, except the one allowed relative "
        "clause. This ban applies to EVERY attributed claim in the article, not just the "
        "first — a longer article has more people saying things, which is more chances for "
        "this exact violation to slip in partway through. Before finishing, check every "
        "sentence with \"said\"/\"stated\"/\"according to\" and confirm none of them use a "
        "\"that\"-clause."
    ),
    "de": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense (Präsens) and the Perfekt (\"er hat gesagt\"); the "
        "Präteritum of \"haben\"/\"sein\"/modal verbs (\"war\", \"hatte\", \"konnte\") is "
        "also fine. Active voice only. ONE relative clause per sentence, only nominative/"
        "accusative \"der\"/\"die\"/\"das\", describing a noun. A direct quote in "
        "quotation marks.\n"
        "BANNED, with no exceptions: the Präteritum of ordinary verbs, the Plusquamperfekt, "
        "the Konjunktiv, any passive construction (rewrite as active). Any relative pronoun "
        "other than nominative/accusative \"der\"/\"die\"/\"das\" (genitive \"dessen\"/"
        "\"deren\" and prepositional relative clauses are banned). Any OTHER clause with its "
        "own conjugated verb — reported speech (\"sagte, dass X\"), causal (\"weil X das "
        "getan hat\"), comparative (\"wie er es getan hat\"), temporal (\"als X das getan "
        "hat\"), purpose or dependent infinitive clauses (\"um X zu tun\", \"die Freiheit, "
        "zu sprechen\") — these all "
        "count as a second clause; split into two short sentences or a direct quote instead. "
        "One idea, one verb, per sentence, except the one allowed relative clause. Never "
        "report what one person said about what another person said — attribute the final "
        "quote directly to whoever actually said it. This ban applies to EVERY attributed "
        "claim in the article, not just the first — a longer article has more people saying "
        "things, which is more chances for this exact violation to slip in partway through. "
        "Before finishing, check every sentence with \"sagte\"/\"erklärte\" and confirm none "
        "of them use a \"dass\"-clause."
    ),
    "sv": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense (presens) and the simple past (preteritum), active "
        "voice only. ONE relative clause per sentence, only with \"som\", describing a "
        "noun. A direct quote in quotation marks.\n"
        "BANNED, with no exceptions: the perfekt (\"har sagt\"), the pluskvamperfekt, the "
        "conditional (\"skulle\"), any passive construction (the \"-s\" passive or \"bli\" + "
        "participle — rewrite as active). Any relative pronoun other than \"som\". Any OTHER "
        "clause with its own conjugated verb — reported speech (\"sa att X\"), causal "
        "(\"eftersom X gjorde Y\"), comparative (\"som han gjorde\"), temporal (\"när X "
        "gjorde Y\"), purpose (\"för att göra X\") — these all count as a second clause; "
        "split into two short sentences or a "
        "direct quote instead. One idea, one verb, per sentence, except the one allowed "
        "relative clause. This ban applies to EVERY attributed claim in the article, not "
        "just the first — a longer article has more people saying things, which is more "
        "chances for this exact violation to slip in partway through. Before finishing, "
        "check every sentence with \"sa\"/\"uppgav\" and confirm none of them use an "
        "\"att\"-clause."
    ),
    "it": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense and the simple passato prossimo (\"ha detto\"), active "
        "voice only. ONE relative clause per sentence, only with \"che\", describing a "
        "noun. A direct quote in quotation marks.\n"
        "BANNED, with no exceptions: the imperfetto, the trapassato prossimo, the "
        "congiuntivo, the condizionale, any passive construction (\"è stato detto\" — "
        "rewrite as active), any formal or literary command form (e.g. a congiuntivo-derived "
        "imperative like \"Rompa il silenzio\"). Any relative pronoun other than \"che\" "
        "(\"cui\", \"il quale\" are banned). Any OTHER clause with its own conjugated verb "
        "— reported speech (\"ha detto che X\", including present tense: \"dicono che X "
        "parla\" is equally banned), causal (\"perché X ha fatto Y\"), comparative (\"come "
        "ha fatto lui\"), temporal (\"quando X ha fatto Y\"), purpose (\"per fare X\") — "
        "these all count as a second clause; "
        "split into two short sentences or a direct quote instead. One idea, one verb, per "
        "sentence, except the one allowed relative clause. This ban applies to EVERY "
        "attributed claim in the article, not just the first — a longer article has more "
        "people saying things, which is more chances for this exact violation to slip in "
        "partway through. Before finishing, check every sentence with \"ha detto\"/\"ha "
        "dichiarato\" and confirm none of them use a \"che\"-clause."
    ),
    "es": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: the present tense and the simple past (pretérito indefinido/perfecto "
        "simple, \"dijo\", \"ganó\"), active voice only. ONE relative clause per sentence, "
        "only with \"que\", describing a noun. A direct quote in quotation marks.\n"
        "BANNED, with no exceptions: the imperfecto, the pluscuamperfecto, the "
        "condicional, the subjuntivo in any form (including after \"pedir que\", \"querer "
        "que\", \"decir que\" + subjunctive — rephrase as a direct command in quotes "
        "instead), any passive construction (\"fue dicho\" — rewrite as active). Any "
        "relative pronoun other than \"que\" (\"el cual\", \"cuyo\" are banned). Any OTHER "
        "clause with its own conjugated verb — reported speech (\"dijo que X\", including "
        "present tense), causal (\"porque X hizo Y\"), comparative (\"como lo hizo él\"), "
        "temporal (\"cuando X hizo Y\"), purpose (\"para hacer X\") — these all count as a "
        "second clause; split into two "
        "short sentences or a direct quote instead. One idea, one verb, per sentence, except "
        "the one allowed relative clause. This ban applies to EVERY attributed claim in the "
        "article, not just the first — a longer article has more people saying things, "
        "which is more chances for this exact violation to slip in partway through. Before "
        "finishing, check every sentence with \"dijo\"/\"declaró\" and confirm none of them "
        "use a \"que\"-clause."
    ),
}
# Any language without a bespoke entry above falls back to a generic categorical version
# rather than silently getting no grammar rule at all.
GRAMMAR_RULE_A1_FALLBACK = (
    " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
    "ALLOWED: the present tense and {LANGUAGE}'s simple past, active voice only. ONE "
    "relative clause per sentence, using only the simplest relative pronoun, describing a "
    "noun. A direct quote in quotation marks.\n"
    "BANNED, with no exceptions: a compound past-in-the-past, the imperfect/habitual past, "
    "the conditional, the subjunctive, any passive construction (rewrite as active). Any "
    "relative pronoun beyond the simplest form. Any OTHER clause with its own conjugated "
    "verb — reported speech, causal, comparative, purpose — these all count as a second "
    "clause; split into two short sentences or a direct quote instead. One idea, one verb, "
    "per sentence, except the one allowed relative clause."
)

# A2 is built explicitly as "everything A1 allows, plus X" — a B1+ reader is not confused by
# an A1-level sentence, so the rule should be additive, not a second unrelated list.
GRAMMAR_RULE_A2_BY_LANG: dict[str, str] = {
    "fr": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, passé composé, ONE \"qui\"/"
        "\"que\" relative clause, direct quotes), PLUS the imparfait for background "
        "description and habitual or ongoing past actions, AND one subordinate clause per "
        "sentence of any kind — reported speech, causal, or comparative. Never nest a second "
        "one inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the imparfait at least once "
        "AND MUST include at least one subordinate clause somewhere in the article. If the "
        "article is too short to fit a natural imparfait sentence, TWO subordinate clauses "
        "in different sentences (never nested) satisfies this requirement instead. Writing "
        "only what A1 would write is a failure at this level, even if nothing is technically "
        "wrong — A2 is defined by USING these features, not merely being allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"donc\", \"mais\", \"ou\").\n"
        "BANNED, with no exceptions: the plus-que-parfait, the conditionnel, the subjonctif, "
        "any passive construction. Any relative pronoun beyond \"qui\"/\"que\". More than "
        "one subordinate clause in the same sentence."
    ),
    "en": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, simple past, ONE \"who\"/"
        "\"which\"/\"that\" relative clause, direct quotes), PLUS the past continuous "
        "(\"was doing\") or \"used to\" for background description, habitual, and ongoing "
        "past actions, AND one subordinate clause per sentence of any kind — reported "
        "speech, causal, or comparative. Never nest a second one inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the past continuous OR "
        "\"used to\" at least once AND MUST include at least one subordinate clause "
        "somewhere in the article. If the article is too short to fit a natural background-"
        "tense sentence, TWO subordinate clauses in different sentences (never nested) "
        "satisfies this requirement instead. Writing only what A1 would write is a failure "
        "at this level, even if nothing is technically wrong — A2 is defined by USING these "
        "features, not merely being allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"so\", \"but\", \"or\").\n"
        "BANNED, with no exceptions: the past perfect, the present perfect (\"has done\"), "
        "the conditional, the subjunctive, any passive construction. Any relative pronoun "
        "beyond \"who\"/\"which\"/\"that\". More than one subordinate clause in the same "
        "sentence."
    ),
    "de": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, Perfekt, haben/sein/modal "
        "Präteritum, ONE nominative/accusative \"der\"/\"die\"/\"das\" relative clause, "
        "direct quotes), PLUS the Präteritum of ordinary verbs for background description, "
        "AND one subordinate clause per sentence of any kind — reported speech, causal, "
        "comparative, or a dependent infinitive clause. Never nest a second one inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the Präteritum of an "
        "ordinary verb at least once AND MUST include at least one subordinate clause "
        "somewhere in the article. If the article is too short to fit a natural Präteritum "
        "sentence, TWO subordinate clauses in different sentences (never nested) satisfies "
        "this requirement instead. Writing only what A1 would write is a failure at this "
        "level, even if nothing is technically wrong — A2 is defined by USING these "
        "features, not merely being allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"also\", \"aber\", \"oder\").\n"
        "BANNED, with no exceptions: the Plusquamperfekt, the Konjunktiv, any passive "
        "construction. Any relative pronoun beyond nominative/accusative \"der\"/\"die\"/"
        "\"das\". More than one subordinate clause in the same sentence — this includes "
        "reporting what one person said about what another person said; attribute the final "
        "quote directly instead."
    ),
    "sv": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, preteritum, ONE \"som\" "
        "relative clause, direct quotes), PLUS the perfekt (\"har gjort\") for background "
        "description, experience, or results still relevant now, AND one subordinate clause "
        "per sentence of any kind — reported speech, causal, or comparative. Never nest a "
        "second one inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the perfekt at least once "
        "AND MUST include at least one subordinate clause somewhere in the article. If the "
        "article is too short to fit a natural perfekt sentence, TWO subordinate clauses in "
        "different sentences (never nested) satisfies this requirement instead. Writing "
        "only what A1 would write is a failure at this level, even if nothing is technically "
        "wrong — A2 is defined by USING these features, not merely being allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"så\", \"men\", \"eller\").\n"
        "BANNED, with no exceptions: the pluskvamperfekt, the conditional (\"skulle\"), any "
        "passive construction. Any relative pronoun beyond \"som\". More than one "
        "subordinate clause in the same sentence."
    ),
    "it": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, passato prossimo, ONE \"che\" "
        "relative clause, direct quotes), PLUS the imperfetto for background description "
        "and habitual or ongoing past actions, AND one subordinate clause per sentence of "
        "any kind — reported speech, causal, or comparative. Never nest a second one "
        "inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the imperfetto at least "
        "once AND MUST include at least one subordinate clause somewhere in the article. If "
        "the article is too short to fit a natural imperfetto sentence, TWO subordinate "
        "clauses in different sentences (never nested) satisfies this requirement instead. "
        "Writing only what A1 would write is a failure at this level, even if nothing is "
        "technically wrong — A2 is defined by USING these features, not merely being "
        "allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"quindi\", \"ma\", \"o\").\n"
        "BANNED, with no exceptions: the trapassato prossimo, the congiuntivo, the "
        "condizionale, any passive construction, any formal or literary command form. Any "
        "relative pronoun beyond \"che\". More than one subordinate clause in the same "
        "sentence."
    ),
    "es": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A1 (present tense, pretérito indefinido/perfecto "
        "simple, ONE \"que\" relative clause, direct quotes), PLUS the imperfecto for "
        "background description and habitual or ongoing past actions, AND one subordinate "
        "clause per sentence of any kind — reported speech, causal, or comparative. Never "
        "nest a second one inside it.\n"
        "REQUIRED, not optional: this article MUST actually use the imperfecto at least "
        "once AND MUST include at least one subordinate clause somewhere in the article. If "
        "the article is too short to fit a natural imperfecto sentence, TWO subordinate "
        "clauses in different sentences (never nested) satisfies this requirement instead. "
        "Writing only what A1 would write is a failure at this level, even if nothing is "
        "technically wrong — A2 is defined by USING these features, not merely being "
        "allowed to.\n"
        "MAY use, at your discretion: a second subordinate clause in a different sentence "
        "(never more than one per sentence); a wider range of everyday connectors "
        "(\"así que\", \"pero\", \"o\").\n"
        "BANNED, with no exceptions: the pluscuamperfecto, the pretérito perfecto compuesto "
        "(\"ha hecho\" — use pretérito indefinido instead), the subjuntivo in any form "
        "(including after \"pedir que\"/\"querer que\" — rephrase as a direct command in "
        "quotes instead), the condicional, any passive construction. Any relative pronoun "
        "beyond \"que\". More than one subordinate clause in the same sentence."
    ),
}
GRAMMAR_RULE_A2_FALLBACK = (
    " GRAMMAR at {LEVEL_DESCRIPTION}: use the present tense, {LANGUAGE}'s simple past, AND "
    "its imperfect/habitual-past equivalent for background description and habitual or "
    "ongoing past actions — never a compound past-in-the-past, the conditional, the "
    "subjunctive, or any passive construction; rewrite passives as active sentences. A "
    "simple relative pronoun as the subject/object of its own short clause is fine — never "
    "a complex or prepositional one. ONE level of subordinate clause is fine (e.g. reported "
    "speech) — but never nest a second subordinate clause inside it. Keep each sentence to "
    "one main idea with at most one supporting clause."
)
# B1/B2 previously had no bespoke rule at all (both fell through to the empty
# GRAMMAR_RULE_FALLBACK below), and shared the same word band and the same "reduce" cut
# rule against a C1+ native -- confirmed 2026-08-14 that a B1 and B2 rewrite of the same
# article were nearly indistinguishable, which is why Stage 8 consistently collapsed B2
# down to B1. Same REQUIRED-not-optional structure as A2: MAY use gives an escape hatch a
# cautious rewrite will take, so the differentiator has to be mandatory.
GRAMMAR_RULE_B1_BY_LANG: dict[str, str] = {
    "fr": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely, "
        "a simple conditional (\"si X, Y\" with present or futur simple, not a hypothetical "
        "past), and causal, temporal or purpose subordinate clauses (up to one level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"parce que\", \"quand\", \"depuis que\") AND at least one "
        "simple conditional or future-tense sentence. Writing only what A2 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction; "
        "a second short supporting clause in a sentence (never two subordinate clauses both "
        "carrying new facts).\n"
        "BANNED, with no exceptions: the subjonctif, the conditionnel passé or any "
        "hypothetical-past construction, nesting a subordinate clause inside another "
        "subordinate clause, rare or literary vocabulary."
    ),
    "en": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely, "
        "a simple conditional (\"if X, Y\" with present or will-future, not a hypothetical "
        "past), and causal, temporal or purpose subordinate clauses (up to one level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"because\", \"when\", \"since\") AND at least one simple "
        "conditional or future-tense sentence. Writing only what A2 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction; "
        "a second short supporting clause in a sentence (never two subordinate clauses both "
        "carrying new facts).\n"
        "BANNED, with no exceptions: the third conditional (\"would have\"), nesting a "
        "subordinate clause inside another subordinate clause, rare or literary vocabulary."
    ),
    "de": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely "
        "(Perfekt, Präteritum, Futur), a simple conditional with \"wenn\" (present tense, "
        "not Konjunktiv II), and causal, temporal or purpose subordinate clauses (up to one "
        "level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"weil\", \"als\", \"seitdem\") AND at least one \"wenn\"-"
        "conditional or Futur-tense sentence. Writing only what A2 would write is a failure "
        "at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction "
        "(\"wurde gemacht\"); a second short supporting clause in a sentence (never two "
        "subordinate clauses both carrying new facts).\n"
        "BANNED, with no exceptions: the Konjunktiv II, nesting a subordinate clause inside "
        "another subordinate clause, rare or literary vocabulary."
    ),
    "sv": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely, a "
        "simple conditional with \"om\" (present tense, not the hypothetical \"skulle ha\"), "
        "and causal, temporal or purpose subordinate clauses (up to one level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"eftersom\", \"när\", \"sedan\") AND at least one \"om\"-"
        "conditional or future-tense sentence. Writing only what A2 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction "
        "(the \"-s\" passive); a second short supporting clause in a sentence (never two "
        "subordinate clauses both carrying new facts).\n"
        "BANNED, with no exceptions: the hypothetical \"skulle ha\" construction, nesting a "
        "subordinate clause inside another subordinate clause, rare or literary vocabulary."
    ),
    "it": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely, a "
        "simple conditional with \"se\" (present indicative, not congiuntivo), and causal, "
        "temporal or purpose subordinate clauses (up to one level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"perché\", \"quando\", \"da quando\") AND at least one \"se\"-"
        "conditional or future-tense sentence. Writing only what A2 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction "
        "(\"è stato fatto\"); a second short supporting clause in a sentence (never two "
        "subordinate clauses both carrying new facts).\n"
        "BANNED, with no exceptions: the congiuntivo, the condizionale passato, nesting a "
        "subordinate clause inside another subordinate clause, rare or literary vocabulary."
    ),
    "es": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at A2, PLUS any past/present/future tense freely, a "
        "simple conditional with \"si\" (present indicative, not subjuntivo/condicional), "
        "and causal, temporal or purpose subordinate clauses (up to one level).\n"
        "REQUIRED, not optional: this article MUST include at least one causal or temporal "
        "subordinate clause (\"porque\", \"cuando\", \"desde que\") AND at least one \"si\"-"
        "conditional or future-tense sentence. Writing only what A2 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion, if it reads naturally: a simple passive construction "
        "(\"fue hecho\"); a second short supporting clause in a sentence (never two "
        "subordinate clauses both carrying new facts).\n"
        "BANNED, with no exceptions: the subjuntivo, the condicional compuesto, nesting a "
        "subordinate clause inside another subordinate clause, rare or literary vocabulary."
    ),
}
GRAMMAR_RULE_B1_FALLBACK = (
    " GRAMMAR at {LEVEL_DESCRIPTION}: use any past/present/future tense freely in "
    "{LANGUAGE}, PLUS a simple present-tense conditional and causal/temporal subordinate "
    "clauses (up to one level) — this article MUST include at least one causal or temporal "
    "subordinate clause AND one simple conditional or future-tense sentence. A simple "
    "passive construction may be used if it reads naturally. Never a hypothetical/"
    "counterfactual mood, never nest a subordinate clause inside another, never rare or "
    "literary vocabulary."
)

# B2's differentiator from B1 is passive voice used naturally plus a concessive/contrastive
# clause ("although X, Y") — the two constructions a B1 writer avoids by habit. Required,
# not merely permitted, for the same reason as A2/B1 above.
GRAMMAR_RULE_B2_BY_LANG: dict[str, str] = {
    "fr": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative pronouns (\"dont\", \"lequel\", \"auquel\"), concessive/contrastive "
        "clauses (\"bien que\", \"même si\", \"cependant\"), and a wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"bien que X, Y\" / \"cependant\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: the subjonctif in a common fixed expression; a "
        "complex relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
    "en": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative pronouns (\"whom\", \"whose\", prepositional relative clauses), "
        "concessive/contrastive clauses (\"although\", \"even though\", \"however\"), and a "
        "wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"although X, Y\" / \"however\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: a hypothetical conditional (\"would\"); a complex "
        "relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
    "de": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative pronouns (genitive \"dessen\"/\"deren\", prepositional relative clauses), "
        "concessive/contrastive clauses (\"obwohl\", \"auch wenn\", \"dennoch\"), and a "
        "wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"obwohl X, Y\" / \"dennoch\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: the Konjunktiv II in a common fixed expression; a "
        "complex relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
    "sv": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative constructions (\"vars\", \"vilket\"), concessive/contrastive clauses "
        "(\"även om\", \"trots att\", \"dock\"), and a wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"även om X, Y\" / \"dock\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: the hypothetical \"skulle ha\" in a common fixed "
        "expression; a complex relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
    "it": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative pronouns (\"cui\", \"il quale\"), concessive/contrastive clauses "
        "(\"sebbene\", \"anche se\", \"tuttavia\"), and a wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"sebbene X, Y\" / \"tuttavia\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: the congiuntivo in a common fixed expression; a "
        "complex relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
    "es": (
        " GRAMMAR at {LEVEL_DESCRIPTION} — strict, no exceptions:\n"
        "ALLOWED: everything permitted at B1, PLUS passive voice used naturally, complex "
        "relative pronouns (\"cuyo\", \"el cual\"), concessive/contrastive clauses "
        "(\"aunque\", \"a pesar de que\", \"sin embargo\"), and a wider range of connectors.\n"
        "REQUIRED, not optional: this article MUST include at least one passive "
        "construction where it reads naturally AND at least one concessive/contrastive "
        "clause (\"aunque X, Y\" / \"sin embargo\"). Writing only what B1 would write is a "
        "failure at this level.\n"
        "MAY use, at your discretion: the subjuntivo in a common fixed expression; a "
        "complex relative clause.\n"
        "BANNED, with no exceptions: rare or archaic literary register that a general news "
        "reader would find obscure."
    ),
}
GRAMMAR_RULE_B2_FALLBACK = (
    " GRAMMAR at {LEVEL_DESCRIPTION}: everything permitted at B1 in {LANGUAGE}, PLUS "
    "passive voice used naturally and concessive/contrastive clauses — this article MUST "
    "include at least one passive construction where it reads naturally AND at least one "
    "concessive/contrastive clause. Writing only what B1 would write is a failure at this "
    "level. A common fixed hypothetical/subjunctive expression may be used if natural. "
    "Never rare or archaic literary register."
)

GRAMMAR_RULE_FALLBACK = ""

# Production line, unchanged from before the {TITLE_RULE} extraction — single source of
# truth so the strict production prompt stays byte-identical.
TITLE_RULE_STRICT = (
    "- Every TITLE, verbatim. A title is a fact, not vocabulary to be simplified. "
    "\"President Trump\" stays \"President Trump\" — never \"the leader of the United "
    "States\", never \"the man in charge of the country\". This holds at EVERY level, "
    "including A1. If a title is above the reader's level, it stays anyway. This also "
    "applies inside any bracketed gloss: never add or imply a political status change "
    "(e.g. \"former\") next to a name or title there either."
)

# Test pipeline only (--relax-titles-a1), A1 ONLY — every other level still gets
# TITLE_RULE_STRICT. Isolates one variable the simple-rewrite test couldn't: does A1 grade
# closer to A1 if titles/names may simplify, with everything else (cut rule, structure,
# glossing machinery) left exactly as tuned? Measured 2026-08-11: the fully-stripped simple
# prompt made A1 WORSE (drifted to B1/B2, not closer to A1), which argues against "verbatim
# titles" being the cause on its own — this test isolates that specific claim.
TITLE_RULE_RELAXED_A1 = (
    "- Titles and names MAY be simplified at this level if that makes the sentence "
    "genuinely simpler to read — e.g. \"the US President\" instead of \"President Trump\", "
    "or \"the company\" instead of a full corporate name on a later mention. The underlying "
    "fact must still be correct and identifiable; do not invent a different title or name, "
    "only simplify how it is expressed."
)

# Stage 8 (grading, P4b) only. Only A1/A2 articles ever carry a bracketed gloss (GLOSS_RULE
# above), so this rule is only injected when grading an A1/A2 combo — B1+ prompts stay as
# they were. The grader still isn't told the level (build_grading_prompt decides whether to
# include this on Python's side, from the combo it already knows it's grading, not from
# telling the model anything) — this only stops a gloss aside from inflating the complexity
# judgement, it doesn't confirm a target level to the model.
GLOSS_JUDGE_RULE_BEGINNER = (
    "\n   PRIORITY RULE for this level: grammar and sentence structure are the decisive "
    "signal, not subject matter or numbers. IGNORE every number, percentage, statistic, "
    "date and figure in the article completely when judging the level — whether or not it "
    "is glossed, and no matter how large, precise, or how many of them appear. A hard-news "
    "topic (finance, war, politics) packed with numbers is not, on its own, evidence of a "
    "higher level. Bracketed glosses on names/terms (e.g. \"die Bundesbank (Deutschlands "
    "Zentralbank)\") are also a built-in definition for the learner, not part of the "
    "article's own prose — ignore those too; grade only the surrounding sentence. Ask "
    "yourself: if every number were deleted and every glossed term/figure replaced with an "
    "easy equivalent, would the sentence structure alone read as this level? Grade on that "
    "basis. Only the grammar — tense, clause structure, relative pronouns, sentence "
    "length — should move the level up or down."
)
GLOSS_JUDGE_RULE_FALLBACK = ""

# Stage 7, arm B: rewrite the graded native article down a level instead of writing from
# the fact-base. The native article already selected, ordered and phrased the facts in the
# target language, so this is a level change rather than a translate-and-write.
#
# There is no CHANGE list telling it how to simplify. Spelling out level mechanics was
# tested and made output worse — see the warning above LEVEL_DESCRIPTIONS. "Rewrite it at
# {LEVEL}" is the instruction; KEEP is the whole constraint.
#
# Cutting is FROM THE END, keeping the opening facts. Compressing 250 words to 120 means
# facts must go, so "keep every fact" would be an impossible instruction of exactly the
# kind that produced invention before. Stopping earlier in the same sequence also keeps the
# levels comparable, which was the original design.
PROMPT_LEVEL_REWRITE = """\
You are rewriting one published news article in {LANGUAGE} for a language learner reading at CEFR {LEVEL_DESCRIPTION}.

The article below was written by a native journalist in {LANGUAGE}. Rewrite it in the same language: {LANGUAGE}, but in {LEVEL_DESCRIPTION} {LANGUAGE}. This is a change of reading level — not a translation, not a summary, not a new article.

KEEP, EXACTLY:
- The ORDER of the facts. The article opens on the same fact and proceeds in the same sequence. Never reorder.
- Every number, name, place and organisation, verbatim.
{TITLE_RULE}{GLOSS_RULE}
- Every attribution — who said or reported what.{ATTRIBUTION_RULE}
- The distinction between what is verified and what is unconfirmed.
{GRAMMAR_RULE}

SIMPLIFY freely: descriptive terms, not names. "ceasefire" may become the simplest phrase in {LANGUAGE} that means the same thing. Names, titles and figures may not.

{CUT_RULE}

{STRUCTURE}
{VARIANT_RULE}
QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.
Copy "slug" and "genre" verbatim from the source article.

{OUTPUT_FORMAT}
[SOURCE ARTICLE BELOW]
"""

# Test-pipeline only (--simple-rewrite). Deliberately the opposite of everything above: no
# KEEP list, no CUT_RULE, no GLOSS_RULE, no ATTRIBUTION_RULE — just the bare instruction, to
# see how far a minimal prompt gets versus all of this session's tuning. Never used in
# production; wired to a separate workflow that never pushes to the data repo.
PROMPT_LEVEL_REWRITE_SIMPLE = """\
Rewrite this article into {LEVEL_DESCRIPTION} {LANGUAGE}. Keep the order the same and make it between {WORD_MIN}-{WORD_MAX} words.

{OUTPUT_FORMAT}
[SOURCE ARTICLE BELOW]
"""

# ── Native journalism — ONE template ─────────────────────────────────────────
# Was two near-identical templates, one per length, and they drifted: POLITICAL TITLES
# ended up in the short one only, so native/longer — the article people actually read —
# had no guard against "former President Trump" for weeks. Everything that varies is now
# a slot, so there is one place to edit and nothing to fall out of step.
#
# {GENRE_RULE} is what keeps the genres apart: a Business article never sees the
# political-titles rules, and a Politics article does. Same 70 prompts out; one skeleton in.

NATIVE_FRAMING: dict[str, str] = {
    "short":  "a tight, polished news brief — a compact digest piece",
    "longer": "a complete, polished news article",
}

STRUCTURE_BY_LENGTH_NATIVE: dict[str, str] = {
    "short": ("STRUCTURE: Use 1–2 paragraphs. Lead sentence covers the core fact (who, what, "
              "when); the rest adds the most important context."),
    "longer": ("STRUCTURE: 2–3 paragraphs, separated by \\n\\n (two JSON newline escapes) and "
               "nowhere else.\n"
               "  - First paragraph: core facts — who, what, when, where.\n"
               "  - Second paragraph: context and significance.\n"
               "  - Third paragraph (optional): reaction, wider implications, or outlook."),
}

# One block per genre. Only the relevant one is injected.
GENRE_RULES: dict[str, str] = {
    "GLOBAL NEWS": """GLOBAL NEWS — this story involves parties in conflict or dispute:
- Give parallel treatment to opposing parties. If you name casualties, an actor or a motive for one side, do the same for the other wherever the facts allow.
- Casualty language is plain: "killed", "wounded", "fighters", "the military", "officials". Never "massacre", "terrorists", "regime" unless quoting a named party, and then attribute it explicitly.
- Where sources disagree on a figure, give the range and say who reported what. Never silently pick one.
- Bias hides in grammar — agency, passive voice, loaded verbs. Keep it even.""",

    # POLITICAL TITLES is now a universal WRITING RULES bullet (was UK-POLITICS-only, which
    # left every other genre with zero protection — confirmed 2026-08-12 in production:
    # a Trump story classified GLOBAL NEWS shipped "l'ancien président" in French, since
    # Global News carried no title guard at all). This block keeps only what's genuinely
    # UK-Politics-specific.
    "UK POLITICS": """UK POLITICS — precision about office and party:
- Give a person's full office on first mention, then the short form.
- Name the party where the fact-base gives it and it bears on the story.
- Distinguish the government acting from a named minister speaking. Do not merge them.
- No partisan framing. Report the position, attribute the criticism.""",

    "BUSINESS & ECONOMY": """BUSINESS & ECONOMY — figures carry the story:
- Every figure gets its period and its unit: "turnover fell 11% to £69.4m in the year to March 2025", never "turnover fell sharply".
- Company and institution names exactly as the fact-base gives them.
- Say who a figure comes from — filed accounts, a company statement, an analyst — where the fact-base says.
- No investment-advice register. No "investors should", no forecasting beyond what a named party has forecast.""",
}
GENRE_RULE_FALLBACK = ""

# Switched from a range instruction to an exact-count instruction 2026-08-13, after a
# 7-story real-headlines A/B: exact-210 (a single number, "count and revise until it
# matches") landed noticeably tighter than the old "between X and Y words" range on the
# same fact-bases -- range-based testing repeatedly failed to reliably control output
# length regardless of the stated band, while a single number gave the model something
# concrete to check itself against. {WORD_TARGET} is the LOW end of the language-calibrated
# band (word_band()'s min) -- deliberately below the canonical midpoint, since every range
# test this session showed the model overshooting more often than undershooting; aiming low
# compensates. {WORD_MIN}/{WORD_MAX} are still substituted for reference in the "revise
# until within range" fallback language, not as the primary instruction.
NATIVE_WORD_RULE: dict[str, str] = {
    "short": (
        "Write exactly {WORD_TARGET} words. Count every word before submitting. If your "
        "count is not {WORD_TARGET}, revise the article and count again until it is. This "
        "is a precise target, not a range -- a few words off is a miss, not close enough. "
        "If you are short on material, add the next most important fact from the fact-base "
        "— a figure, a named source, or a consequence — rather than stopping short. Never "
        "pad with empty phrases, never invent facts. Acceptable range if you cannot hit the "
        "target exactly: {WORD_MIN}-{WORD_MAX} words."
    ),
    "longer": (
        "Write exactly {WORD_TARGET} words. Count every word before submitting. If your "
        "count is not {WORD_TARGET}, revise the article and count again until it is. This "
        "is a precise target, not a range -- a few words off is a miss, not close enough.\n"
        "You have the material. This story's fact-base is several hundred words of notes — "
        "ample for {WORD_TARGET} words of prose. Reaching the count is ordinary journalism, "
        "not padding: attribute every claim to the person or institution that made it, "
        "follow the sequence of events, and carry the context and consequences that are "
        "already in the notes.\n"
        "Never reach the count by generalising (\"his tenure will be closely watched\"), by "
        "restating a fact you have already given, or by supplying context you were not "
        "given. An invented fact is a worse failure than a short article — but with these "
        "notes, a short article should not be necessary. Acceptable range if you cannot hit "
        "the target exactly: {WORD_MIN}-{WORD_MAX} words."
    ),
}

PROMPT_NATIVE_TEMPLATE = """\
You are a high-end journalist writing for {OUTLET}, the most respected news outlet writing in {LANGUAGE}.

Write the story below as {FRAMING}, using only the fact-base. Write with authority, clarity and precision. This is real journalism.

WORD COUNT — STRICT REQUIREMENT:
{WORD_RULE}

{STRUCTURE}

{GENRE_RULE}

WRITING RULES:
- Write in {LANGUAGE}. {VARIANT_RULE}
- Write original prose from the facts. Never copy source phrasing. A quotation appears as reported speech — who said what, paraphrased — never as quoted text.
- The fact-base sometimes wraps a phrase in quotation marks with no named speaker attached (no "said"/"stated" nearby) — that marks an informal or colloquial expression, not a verbatim quotation. Paraphrase it in your own words; do not reproduce it in quotation marks.
- Use only facts from the fact-base. This applies to names and quotes specifically, not just events and figures: never introduce a person, organisation, place, or direct quotation that does not appear in the fact-base's own fields ("proper_nouns", "attribution", "what_happened", etc.) — an invented name is exactly as serious an error as an invented number. A quotation must be verbatim from an "attribution" entry; never write a quotation mark around a paraphrase.
- ATTRIBUTION: attribute claims to the people and institutions that made them — named officials, ministries, spokespeople, companies. Never name a news outlet, wire service, newspaper or social-media channel in the article. The fact-base records which outlet reported a thing so you know how firm it is, not so you can cite it. If a claim is unconfirmed, say so plainly — "the reports are unverified" — without naming who failed to verify it.
- FACT ORDER: follow the "what_happened" sequence exactly. Do not reorder.
- DATES: always carry the fact-base's own specific date exactly as given (e.g. "Friday, 14 August 2026", "the week ending August 9"). Never substitute a vague relative reference instead — "this summer", "on Friday", "early August", "this Thursday" are all banned even though they read naturally in journalism. This is the single most common fact-check finding: every other language translates from this article, so a vague date written once here becomes a vague date in six languages.
  * MULTIPLE DATES, ONE EVENT: when the fact-base gives more than one date for the same story — a vote HELD on one day, its RESULT or WINNER ANNOUNCED on a different day; an incident that HAPPENED overnight but was REPORTED the next morning — each date belongs to its own specific action, never to the story as a whole. Read which date the fact-base attaches to which action before writing. Do not default to the most recent date, or the date mentioned first, as if it applied to everything. If you are not sure which action a date belongs to, keep them explicitly separate in the sentence rather than merging them into one "on [day]" for the whole story.
- POLITICAL TITLES — CRITICAL, every genre, not just politics stories: use ONLY the title given in the fact-base. Never alter a political title from your own training data.
  * Never add "former" or "ex-" unless the fact-base explicitly says the person has left office.
  * If the fact-base says "President Trump", write "President Trump" — never "former President". This applies wherever the person appears, including stories not primarily about politics.
  * A head of government who has announced resignation is still the incumbent until a named successor has taken office.
- QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
- GLOSSARY:
  * LITERAL (numbers, specific names, titles, the "genre" field): reproduce exactly. Names and titles are not translated or simplified. "genre" is a system key — copy it VERBATIM in English (e.g. "GLOBAL NEWS").
  * SEMANTIC (descriptive terms in headline and body): translate naturally and consistently. Never leave English inside a non-English headline or body.
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to their named source. Match the fact-base's own certainty language exactly — never soften a stated denial or contradiction into "unverified"/"disputed", and never harden a contested or attributed claim into a flat, unattributed fact. The strength of a claim is itself a fact; changing it is inventing.
  * CONFLICTING NUMBERS, ONE STATISTIC: when the fact-base gives more than one figure for the same statistic (a death toll, a cost, a headcount) — a range, or different sources reporting different numbers — never pick one figure and present it as "at least X" or as the flat number. The lowest figure in a range is not automatically a safe floor: a range of "72 to 141" means the true number could be as low as 72, so "at least 111" (a middle figure treated as a minimum) is wrong, not just imprecise. Attribute each figure to its own source, or state plainly that the count varies/is disputed, matching how the fact-base itself frames the uncertainty.
- UNITS: keep every number's magnitude word (million/billion/trillion) exactly as given in the fact-base. Never convert between them, even when the arithmetic is correct.
- HEADLINE: exactly as a chief sub-editor would write it. Punchy, precise, informative. Never clickbait.

{OUTPUT_FORMAT}
[FACTBASE BELOW]
"""

# Kept so call sites that still name them keep working. Both are now the same template —
# the length difference is injected, not duplicated.
PROMPT_3_HEADER = PROMPT_NATIVE_TEMPLATE
PROMPT_3_SHORT_HEADER = PROMPT_NATIVE_TEMPLATE

# Stage 5b — verify one finished native article against the fact-base it was written from.
# Stage 4 fact-checks the fact-base BEFORE writing, so it cannot see what the writer
# invents. This reads the article and its source notes together and asks what does not
# match. It also searches, so it can catch a fact that is in the notes but simply wrong.
PROMPT_5B_VERIFY = """\
You are a fact-checker. Below is a news article and the fact-base it was written from.

FIRST, what is NOT a finding. Read this before anything else. If a difference is on this list, say nothing about it — a false alarm here is worse than a missed one, because it buries the real findings.

- LANGUAGE. The article is in {LANGUAGE}; the fact-base is in English. Every translated word is correct by definition. "Monday" as "lundi", "Shanghai" as "Shanghái", "kilometres" as "Kilometer", "structures" as "Gebäude" — say nothing.
- NUMBER FORMAT. The same value written the way {LANGUAGE} writes it. 1,200 as "1 200" or "1.200"; 5.0 as "5,0"; 5:30am as "17h30"; 150 miles as "240 km". Same value, different notation — say nothing.
- ANYTHING MISSING. A fact, figure, name or nuance the article leaves out is NEVER a finding. A shorter article is not an error. Never write "the article omits…".
- WORDING. A paraphrase, a synonym, a different sentence order within a paragraph, a shorter or longer phrasing, tone, style, register — say nothing.
- ADDED CLARITY that changes no fact: naming the day of a date the fact-base gives, saying "local time", giving someone's known title. Say nothing.

If the article and the fact-base agree on every VALUE and every CLAIM, return an empty list. Most articles should.

NOW, the only four things to report:

- INVENTED: a claim, figure, name or quote in the article that has NO basis anywhere in the fact-base. Not "stated differently" — absent.
- CHANGED: a number whose VALUE differs, or a name or title that refers to a DIFFERENT thing. 69th written as 70th. £3m written as £5m. A minister given the wrong office.
- CONTRADICTED: the fact-base records something as unverified, disputed, or claimed by one party, and the article states it flatly as fact.
- WRONG: a fact that IS in the fact-base, but your own search shows is false. Search the main figures, names and titles.

For each finding, quote the exact phrase from the article, give what the fact-base says instead, and say in one sentence why the VALUE or CLAIM differs. If your explanation would contain the words "translate", "omits", "format", "wording" or "correctly", it is not a finding — drop it.

For CHANGED, CONTRADICTED and WRONG findings only: also give "corrected" — the exact replacement phrase, in {LANGUAGE}, that would make the sentence accurate if it substituted for "quote" word-for-word in the article. It must fit grammatically in place of "quote" with no other change to the sentence. If no single substring can fix it without rewriting the whole sentence, leave "corrected" empty — do not force one.
For INVENTED findings: never give "corrected" (leave it empty). An invented claim needs the sentence rewritten or removed, not a word swapped — a substring replacement here would produce a grammatically broken sentence.

OUTPUT FORMAT:
{"verdict":"ok","findings":[]}
or
{"verdict":"issues","findings":[{"type":"CHANGED","quote":"the exact phrase from the article","factbase":"what the fact-base says, or NOTHING","why":"one sentence","corrected":"the exact replacement phrase, or empty string"}]}

ARTICLE ({LANGUAGE}, {LENGTH}):
{ARTICLE}

FACT-BASE FOR THIS STORY:
{FACTBASE}
"""

PROMPT_4_HEADER = """\
You are a CEFR language assessment specialist. You will receive a set of news articles written in {LANGUAGE}. Assess each one and return a structured verdict.

You are NOT told what level these articles were written for. Judge only what is in front of you — the verdict is being used to check whether the writer hit its target, so agreeing with an assumed target would make it worthless.

For each article assess:

1. CEFR LEVEL — which level best describes the reading difficulty for a language learner?
   A1 / A2 / B1 / B2 / C1 / C2
   Base your assessment on: sentence length and complexity, vocabulary range, use of tenses, subordinate clauses, idiomatic language, nominalisations, overall register. Be consistent — near-identical prose should receive the same grade across sessions.{GLOSS_JUDGE_RULE}

2. LENGTH BAND:
   short: under 100 words
   medium: 100–180 words
   longer: over 180 words

CALIBRATION EXAMPLES — anchor your grading against these three reference texts. All are in French; the same complexity principles apply across all languages:

A1 — Beginner:
"Le G7 est un groupe de pays. Ces pays parlent de l'argent dans le monde. Ils veulent travailler ensemble. Une personne dit que la réunion est bonne."
Why A1: Very short subject-verb-object sentences (4-8 words). Present tense only, no compound past forms. Only the most common, everyday vocabulary (groupe, argent, monde, personne, bonne). No subordinate clauses, no connectors beyond simple repetition of the subject.

B1 — Intermediate:
"Les dirigeants du G7 se sont réunis pour parler de l'économie mondiale. Ils ont discuté de l'inflation et du commerce international. Les pays membres ont décidé de travailler ensemble pour trouver des solutions. Un porte-parole a dit que les discussions ont été positives."
Why B1: Short subject-verb-object sentences. Common vocabulary. Simple past tense throughout. One fact per sentence. No subordinate clauses, no idiomatic language.

C1 — Advanced:
"Réunis en sommet extraordinaire pour la deuxième fois en six mois, les chefs d'État du G7 ont adopté, non sans heurts diplomatiques, une déclaration commune appelant à une coordination renforcée des politiques monétaires face à une inflation persistante qui continue d'éroder le pouvoir d'achat des ménages dans l'ensemble des économies avancées."
Why C1: Participial opening clause, embedded relative clauses, abstract nominalisations (coordination renforcée, le pouvoir d'achat), journalistic hedging register (non sans heurts), dense multi-clause sentence architecture.

OUTPUT FORMAT:
{"assessments":[{
  "genre":"...",
  "slug":"...",
  "level":"B1",
  "length":"medium",
  "reasoning":"one sentence explaining the level assessment"
}]}

Be decisive. One level per article, one length band per article. Consistency matters more than nuance: near-identical prose should get the same grade every time.

[NATIVE ARTICLES BELOW]
"""

PROMPT_4A_HEADER = """\
You are a CEFR language assessment specialist. You will receive a set of news articles written in {LANGUAGE} by a native journalist.

Assess the collection as a whole and return the single CEFR level that best describes the overall reading difficulty for a language learner.

CEFR levels: A1 / A2 / B1 / B2 / C1 / C2

Base your assessment on: sentence length and complexity, vocabulary range, use of tenses, subordinate clauses, idiomatic language, nominalisations, overall register. Return the dominant level across all articles — the level that fits the majority. Ignore outliers.

OUTPUT FORMAT:
{"cefr_level": "B2", "reasoning": "one sentence explaining the assessment"}

[NATIVE ARTICLES BELOW]
"""
