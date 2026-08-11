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
    "de": 0.93,
    "sv": 0.90,
}


def word_band(band: str, lang: str = "") -> tuple[int, int]:
    """Canonical "210-230" plus a language, to that language's actual target."""
    parts = str(band).replace("\u2013", "-").split("-")
    lo, hi = int(parts[0].strip()), int(parts[-1].strip())
    f = LANGUAGE_WORD_FACTOR.get(lang, 1.0)
    return round(lo * f), round(hi * f)


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
    "to know (major countries, well-known world leaders)."
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

# Stage 8 (grading, P4b) only. Only A1/A2 articles ever carry a bracketed gloss (GLOSS_RULE
# above), so this rule is only injected when grading an A1/A2 combo — B1+ prompts stay as
# they were. The grader still isn't told the level (build_grading_prompt decides whether to
# include this on Python's side, from the combo it already knows it's grading, not from
# telling the model anything) — this only stops a gloss aside from inflating the complexity
# judgement, it doesn't confirm a target level to the model.
GLOSS_JUDGE_RULE_BEGINNER = (
    "\n   Some articles gloss a hard name or term in brackets on first mention, e.g. \"die "
    "Bundesbank (Deutschlands Zentralbank)\" — this is a built-in definition for the "
    "learner, not part of the article's own prose. Ignore bracketed glosses entirely when "
    "judging complexity; grade only the surrounding sentence."
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
- Every TITLE, verbatim. A title is a fact, not vocabulary to be simplified. "President Trump" stays "President Trump" — never "the leader of the United States", never "the man in charge of the country". This holds at EVERY level, including A1. If a title is above the reader's level, it stays anyway.{GLOSS_RULE}
- Every attribution — who said or reported what.{ATTRIBUTION_RULE}
- The distinction between what is verified and what is unconfirmed.

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

    "UK POLITICS": """UK POLITICS — precision about office and party:
- POLITICAL TITLES — CRITICAL: use ONLY the title given in the fact-base. Never alter a political title from your own training data.
  * Never add "former" or "ex-" unless the fact-base explicitly says the person has left office.
  * If the fact-base says "President Trump", write "President Trump" — never "former President".
  * A head of government who has announced resignation is still the incumbent until a named successor has taken office.
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

# The merge into one template kept only the LONGER prompt's word-count wording — "your
# fact-base is several hundred words of notes, ample for N words of prose" — which reads as
# encouragement to write long. Native/short went from 114 words to 167 in one run, and every
# short level article inherited it. Short gets its own wording again.
NATIVE_WORD_RULE: dict[str, str] = {
    # Base text VERBATIM from the pre-merge PROMPT_3_SHORT_HEADER (d42c4b1), which measured
    # 91-114 words across five languages. The paragraph-count sentence that used to close this
    # block now lives in STRUCTURE_BY_LENGTH_NATIVE["short"] instead, so paragraph shape has
    # one home, not two.
    "short": (
        "Each article body must be between {WORD_MIN} and {WORD_MAX} words. Count every word "
        "before submitting.\n"
        "If you are under {WORD_MIN}, add the next most important fact from the fact-base — a "
        "figure, a named source, or a consequence. Do not stop short because the fact-base is "
        "terse.\n"
        "Do not exceed {WORD_MAX} words — cut the least essential detail. Never pad with empty "
        "phrases, never invent facts."
    ),
    # VERBATIM from the pre-merge PROMPT_3_HEADER at ff3d19d, same treatment. Measured
    # 183-235 words.
    "longer": (
        "Each article body must be between {WORD_MIN} and {WORD_MAX} words. Count every word "
        "before submitting.\n"
        "You have the material. This story's fact-base is several hundred words of notes — "
        "ample for {WORD_MIN} words of prose. Reaching the count is ordinary journalism, not "
        "padding: attribute every claim to the person or institution that made it, follow the "
        "sequence of events, and carry the context and consequences that are already in the "
        "notes.\n"
        "Never reach the count by generalising (\"his tenure will be closely watched\"), by "
        "restating a fact you have already given, or by supplying context you were not given. "
        "An invented fact is a worse failure than a short article — but with these notes, a "
        "short article should not be necessary.\n"
        "Do not exceed {WORD_MAX} words — trim the least essential detail. Never cut "
        "mid-thought."
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
- Use only facts from the fact-base.
- ATTRIBUTION: attribute claims to the people and institutions that made them — named officials, ministries, spokespeople, companies. Never name a news outlet, wire service, newspaper or social-media channel in the article. The fact-base records which outlet reported a thing so you know how firm it is, not so you can cite it. If a claim is unconfirmed, say so plainly — "the reports are unverified" — without naming who failed to verify it.
- FACT ORDER: follow the "what_happened" sequence exactly. Do not reorder.
- QUOTATION MARKS: {QUOTE_RULE}. Never straight ASCII quotes.
- GLOSSARY:
  * LITERAL (numbers, specific names, titles, the "genre" field): reproduce exactly. Names and titles are not translated or simplified. "genre" is a system key — copy it VERBATIM in English (e.g. "GLOBAL NEWS").
  * SEMANTIC (descriptive terms in headline and body): translate naturally and consistently. Never leave English inside a non-English headline or body.
- NEUTRALITY: honour the verified/contested separation. Attribute contested claims to their named source.
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

OUTPUT FORMAT:
{"verdict":"ok","findings":[]}
or
{"verdict":"issues","findings":[{"type":"CHANGED","quote":"the exact phrase from the article","factbase":"what the fact-base says, or NOTHING","why":"one sentence"}]}

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
