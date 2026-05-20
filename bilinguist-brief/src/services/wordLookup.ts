import type { LanguageCode, LanguageLevel } from '../store/useSettingsStore';

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
};

export interface WordExplanation {
  explanation: string;
  example: string;
  pronunciation: string;
}

export async function explainWord(
  word: string,
  sentence: string,
  language: LanguageCode,
  level: LanguageLevel
): Promise<WordExplanation | null> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `A language learner studying ${LANGUAGE_NAMES[language]} at ${level} level tapped the word "${word}" in this sentence:

"${sentence}"

Reply ONLY with a JSON object — no markdown, no preamble:
{
  "explanation": "Brief meaning of the word in this context (1-2 sentences, in English, appropriate for ${level} level learner)",
  "example": "A new example sentence using this word in ${LANGUAGE_NAMES[language]}",
  "pronunciation": "IPA pronunciation of ${word}"
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
        max_tokens: 400,
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
