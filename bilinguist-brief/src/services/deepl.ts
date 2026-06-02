import type { LanguageCode } from '../store/useSettingsStore';
import { consumeTranslation } from './apiUsage';

const DEEPL_SOURCE_LANG: Partial<Record<LanguageCode, string>> = {
  fr: 'FR',
  de: 'DE',
  sv: 'SV',
  en: 'EN',
  it: 'IT',
  es: 'ES',
};

export interface TranslationResult {
  translation: string;
  detectedSourceLang?: string;
  error?: string;
}

export async function translateWord(
  word: string,
  sourceLanguage: LanguageCode
): Promise<TranslationResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_DEEPL_API_KEY;
  if (!apiKey) return { translation: '', error: 'no_key' };

  // Check monthly translation cap before calling the API
  const allowed = await consumeTranslation();
  if (!allowed) return { translation: '', error: 'cap_reached' };

  // DeepL Free API keys end with ':fx' (e.g. "abc123:fx").
  // Pro keys are plain UUIDs. Using the wrong endpoint returns 403.
  const isFreePlan = apiKey.endsWith(':fx');
  const baseUrl = isFreePlan
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [word],
        source_lang: DEEPL_SOURCE_LANG[sourceLanguage] ?? 'FR',
        target_lang: 'EN-GB',
      }),
    });

    if (!res.ok) return { translation: '', error: `api_${res.status}` };

    const data = await res.json();
    const translation = data.translations?.[0]?.text;
    if (!translation) return { translation: '', error: 'empty_response' };

    return { translation, detectedSourceLang: data.translations?.[0]?.detected_source_language };
  } catch {
    return { translation: '', error: 'network_error' };
  }
}
