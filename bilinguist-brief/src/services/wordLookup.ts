import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', sv: 'Swedish', tr: 'Turkish', hu: 'Hungarian',
};

const PAST_TENSE_NAME: Partial<Record<LanguageCode, string>> = {
  fr: 'passé composé',
  de: 'Präteritum',
  es: 'pretérito indefinido',
  it: 'passato prossimo',
  sv: 'preteritum',
  en: 'simple past',
  tr: 'geçmiş zaman',
};

const VERB_PRONOUNS: Partial<Record<LanguageCode, string[]>> = {
  fr: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'],
  de: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'],
  es: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'],
  it: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'],
  sv: ['jag', 'du', 'han/hon', 'vi', 'ni', 'de'],
  en: ['I', 'you', 'he/she', 'we', 'you (pl)', 'they'],
  tr: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'],
};

export type WordType = 'verb' | 'noun' | 'adjective' | 'adverb' | 'phrase' | 'other';

export interface WordMeta {
  isRegular?: boolean | null;
  auxiliary?: string | null;
  verbClass?: string | null;
  isSeparable?: boolean | null;
}

export interface WordExplanation {
  wordType: WordType;
  explanation: string;
  example: string;
  pronunciation: string;
  verbTable?: Record<string, string> | null;
  verbTablePast?: Record<string, string> | null;
  forms?: Record<string, string> | null;
  tip?: string | null;
  meta?: WordMeta | null;
  level?: string | null;
}

export async function explainWord(
  word: string,
  sentence: string,
  language: LanguageCode,
  level: LanguageLevel
): Promise<WordExplanation | null> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const pronouns = VERB_PRONOUNS[language] ?? VERB_PRONOUNS.fr!;
  const langName = LANGUAGE_NAMES[language];
  const pastTenseName = PAST_TENSE_NAME[language] ?? 'simple past';

  const prompt = `A language learner studying ${langName} at ${level} level tapped the word "${word}" in this sentence:

"${sentence}"

Identify the word type and reply ONLY with a JSON object — no markdown, no preamble:
{
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in this context in English, 1-2 sentences, suited to ${level} level",
  "example": "A new ${langName} example sentence using this word",
  "pronunciation": "IPA pronunciation of ${word}",
  "verbTable": if verb, present tense conjugation as {"${pronouns[0]}": "...", "${pronouns[1]}": "...", "${pronouns[2]}": "...", "${pronouns[3]}": "...", "${pronouns[4]}": "...", "${pronouns[5]}": "..."} — otherwise null,
  "verbTablePast": if verb, ${pastTenseName} conjugation as {"${pronouns[0]}": "...", "${pronouns[1]}": "...", "${pronouns[2]}": "...", "${pronouns[3]}": "...", "${pronouns[4]}": "...", "${pronouns[5]}": "..."} — otherwise null,
  "forms": if noun, {"gender": "masculine/feminine/neuter", "plural": "plural form", "article": "definite article (e.g. le/la/der/die/das/il/la/den)"} — if adjective, {"feminine": "feminine form", "comparative": "comparative form", "superlative": "superlative form"} — otherwise null,
  "tip": a short memorable tip about this word — etymology hint, common learner mistake, or memory hook — or null,
  "meta": if verb {"isRegular": true/false, "auxiliary": the auxiliary verb for compound tenses e.g. "haben"/"sein"/"avoir"/"être"/"essere"/"avere" (null if not applicable), "verbClass": verb group e.g. "-er"/"-ir"/"-re" for French, "-are"/"-ere"/"-ire" for Italian, "Group 1"/"Group 2"/"Group 3" for Swedish, "-en"/"-ern" for German (null if not applicable), "isSeparable": true/false for German separable verbs (null for all other languages)} — otherwise null,
  "level": the CEFR difficulty level of this word — one of "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    return JSON.parse(raw.slice(start, end + 1)) as WordExplanation;
  } catch {
    return null;
  }
}
