# Production prompts — locked. Edit bilinguist_prompts_test.py instead.
# bilinguist_write.py imports from here unless --test is passed.

# Per-level CEFR descriptions. build_writing_prompt injects ONLY the target level.
# Deliberately bare: the model already knows what a CEFR level implies, and spelling
# out grammatical rules was tested and produced WORSE output — it optimises for rule
# compliance over natural writing. Do not "improve" these into rule lists.
LEVEL_DESCRIPTIONS: dict[str, str] = {
    "A1": "A1", "A2": "A2", "B1": "B1", "B2": "B2", "C1": "C1", "C2": "C2",
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

# One outlet per language, injected as {OUTLET}. The native prompt used to list all eight
# and let the model pick its own line — the same shape as the "IF German is English" bug
# that VARIANT_RULES below was created to fix. Only the relevant one is now shown.
NATIVE_OUTLETS: dict[str, str] = {
    "fr": "Le Monde",
    "de": "Der Spiegel",
    "en": "The Economist (British English throughout — never American)",
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

# Paragraph shape by length. Shared by the native prompt and the level rewrite.
STRUCTURE_BY_LENGTH: dict[str, str] = {
    "short": ("STRUCTURE: ONE continuous paragraph. No line breaks anywhere."),
    "longer": ("STRUCTURE: 2–3 paragraphs, separated by \\n\\n (two JSON newline escapes) "
               "and nowhere else."),
}


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

# How much has to go, by length. Measured 2026-08-10: native short is 85-100 and the
# short levels want 65-80, a ~20% trim that needs no facts dropped — but the old single
# instruction said "you must cut" regardless, and B's short order scores were its weakest
# (fr 6/7, de 5/7) while every longer combo hit 7/7. Native longer is 250-270 against
# 110-130, a ~55% cut where facts must go, and stopping earlier in the same sequence is
# the original design ("Concise: facts 1-2. Balanced: 1-4. Long-form: 1-6").
REWRITE_CUT_RULES: dict[str, str] = {
    "short": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words. The source is only slightly longer than "
        "this.\n"
        "- Keep EVERY fact. Reach the count by tightening the phrasing, not by dropping "
        "anything.\n"
        "- Never invent, never generalise to fill space, never merge two facts into a "
        "vaguer one."
    ),
    "longer": (
        "WORD COUNT: {WORD_MIN}–{WORD_MAX} words. The source is much longer than this, so "
        "you must stop earlier in the story.\n"
        "- Keep the opening facts in their order and end where the count runs out. Never "
        "reorder.\n"
        "- Within the facts you keep, cut adjectives, secondary detail and background "
        "before cutting anything load-bearing.\n"
        "- Never invent, never generalise to fill space, never merge two facts into a "
        "vaguer one."
    ),
}


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

The article below was written by a native journalist in {LANGUAGE}. Rewrite it in {LANGUAGE} at {LEVEL_DESCRIPTION}. This is a change of reading level — not a translation, not a summary, not a new article.

KEEP, EXACTLY:
- The ORDER of the facts. The article opens on the same fact and proceeds in the same sequence. Never reorder.
- Every number, name, place and organisation, verbatim.
- Every attribution — who said or reported what.
- The distinction between what is verified and what is unconfirmed.

{CUT_RULE}

{STRUCTURE}
{VARIANT_RULE}
QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
Never name a news outlet, wire service or social-media channel.
Copy "slug" and "genre" verbatim from the source article.

{OUTPUT_FORMAT}
[SOURCE ARTICLE BELOW]
"""

PROMPT_3_HEADER = """\
You are a staff journalist writing for {OUTLET}, the most respected news outlet in {LANGUAGE}.

Write the story below as a complete, polished news article of {WORD_MIN}–{WORD_MAX} words, using only the fact-base. No concessions to learners. Write with authority, clarity, and precision. This is real journalism.

WORD COUNT — STRICT REQUIREMENT:
The body must be between {WORD_MIN} and {WORD_MAX} words. Count every word before submitting.
You have the material. This story's fact-base is several hundred words of notes — ample for {WORD_MIN} words of prose. Reaching the count is ordinary journalism, not padding: attribute every claim to the person or institution that made it, follow the sequence of events, and carry the context and consequences that are already in the notes.
Never reach the count by generalising ("his tenure will be closely watched"), by restating a fact you have already given, or by supplying context you were not given. An invented fact is a worse failure than a short article — but with these notes, a short article should not be necessary.
Do not exceed {WORD_MAX} words — trim the least essential detail. Never cut mid-thought.
Structure those words across 2–3 paragraphs:
  - First paragraph: core facts — who, what, when, where.
  - Second paragraph: context and significance.
  - Third paragraph (optional): reaction, wider implications, or outlook.

{OUTPUT_FORMAT}

JSON SAFETY:
- The "body" MUST contain 2–3 paragraphs. Separate paragraphs with \\n\\n (two JSON newline escapes). Example: "body": "First paragraph prose.\\n\\nSecond paragraph prose." — exactly this format. No other line breaks within a paragraph.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…»
  Italian: «…»
  English: "…"
  Swedish: "…"
  Hungarian: „…" (same low-high curly style as German)

WRITING RULES:
- Write in {LANGUAGE}. British English only if English.
- Write original prose from the facts. Never copy source phrasing.
- Use only facts from the fact-base.
- ATTRIBUTION: attribute claims to the people and institutions that made them — named officials, ministries, spokespeople, companies. Never name a news outlet, wire service, newspaper or social-media channel in the article. The fact-base records which outlet reported a thing so you know how firm it is, not so you can cite it. If a claim is unconfirmed, say so plainly — "the reports are unverified" — without naming who failed to verify it.
- FACT ORDER: follow the "what_happened" sequence exactly. Do not reorder.
- GLOSSARY:
  * LITERAL (numbers, specific names, the "genre" field): reproduce exactly. Names not translated. The "genre" field is a system key — copy it VERBATIM from the fact-base in English (e.g. "GLOBAL NEWS", "POLITICS"). Never translate it.
  * SEMANTIC (descriptive terms in headline/body): translate naturally and consistently. Never leave English inside a non-English headline or body.
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to named sources. Parallel treatment of opposing parties. Bias hides in grammar — agency, passive voice, loaded verbs. Keep it even.
- Headlines: exactly as a chief sub-editor would write them. Punchy, precise, informative. Never clickbait.

[FACTBASE BELOW]
"""

PROMPT_3_SHORT_HEADER = """\
You are a staff journalist writing for {OUTLET}, the most respected news outlet in {LANGUAGE}.

Write the story below as a tight, polished news brief of {WORD_MIN}–{WORD_MAX} words, using only the fact-base — a compact digest piece. No level constraints. No concessions to learners. Write with authority and precision.

WORD COUNT — STRICT REQUIREMENT:
The body must be between {WORD_MIN} and {WORD_MAX} words. Count every word before submitting.
If you are under {WORD_MIN}, add the next most important fact from the fact-base — a figure, a named source, or a consequence. Do not stop short because the fact-base is terse.
Do not exceed {WORD_MAX} words — cut the least essential detail. Never pad with empty phrases, never invent facts.
Use 1–2 paragraphs. Lead sentence covers the core fact (who, what, when); the rest adds the most important context.

{OUTPUT_FORMAT}

JSON SAFETY:
- The "body" is a SINGLE continuous paragraph. No line breaks whatsoever.
- Use the target language's typographic quotation marks — never straight ASCII quotes:
  French: « … » with non-breaking spaces
  German: „…" (low curly opening U+201E, high curly closing U+201C)
  Spanish: «…»
  Italian: «…»
  English: "…"
  Swedish: "…"
  Hungarian: „…" (same low-high curly style as German)

POLITICAL TITLES — CRITICAL: use ONLY the title given in the fact-base. Do not alter political titles based on your training data.
- Never add "former" or "ex-" to a title unless the fact-base explicitly says the person has left office.
- If the fact-base says "President Trump", write "President Trump" — never "former President".
- A head of government who announced resignation is still the incumbent until a named successor has taken office.

WRITING RULES:
- Write in {LANGUAGE}. British English only if English.
- Write original prose from the facts. Never copy source phrasing.
- Use only facts from the fact-base.
- ATTRIBUTION: attribute claims to the people and institutions that made them — named officials, ministries, spokespeople, companies. Never name a news outlet, wire service, newspaper or social-media channel in the article. The fact-base records which outlet reported a thing so you know how firm it is, not so you can cite it. If a claim is unconfirmed, say so plainly — "the reports are unverified" — without naming who failed to verify it.
- FACT ORDER: follow the "what_happened" sequence. Lead with the core fact; add key context in order.
- GLOSSARY:
  * LITERAL (numbers, specific names, the "genre" field): reproduce exactly. Names not translated. The "genre" field is a system key — copy it VERBATIM from the fact-base in English (e.g. "GLOBAL NEWS", "POLITICS"). Never translate it.
  * SEMANTIC (descriptive terms in headline/body): translate naturally and consistently. Never leave English inside a non-English headline or body.
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to named sources.
- Headlines: exactly as a chief sub-editor would write them. Punchy, precise, informative. Never clickbait.

[FACTBASE BELOW]
"""

PROMPT_4_HEADER = """\
You are a CEFR language assessment specialist. You will receive a set of news articles written in {LANGUAGE} by a native journalist. Assess each article and return a structured verdict.

For each article assess:

1. CEFR LEVEL — which level best describes the reading difficulty for a language learner?
   A1 / A2 / B1 / B2 / C1 / C2
   Base your assessment on: sentence length and complexity, vocabulary range, use of tenses, subordinate clauses, idiomatic language, nominalisations, overall register. Be consistent — near-identical prose should receive the same grade across sessions.

2. LENGTH BAND:
   short: under 100 words
   medium: 100–180 words
   longer: over 180 words

CALIBRATION EXAMPLES — anchor your grading against these two reference texts. Both are in French; the same complexity principles apply across all languages:

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

Be decisive. One level per article, one length band per article. The app uses these verdicts to dynamically reposition the native article in the level selector — consistency matters more than nuance.

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
