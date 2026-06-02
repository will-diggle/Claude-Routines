import type { LanguageCode } from '../store/useSettingsStore';
import { consumeTranslation } from './apiUsage';

const LANG_CODE: Partial<Record<LanguageCode, string>> = {
  fr: 'fr', de: 'de', sv: 'sv', en: 'en', it: 'it', es: 'es',
};

export interface TranslationResult {
  translation: string;
  error?: string;
}

export async function translateWord(
  word: string,
  sourceLanguage: LanguageCode
): Promise<TranslationResult | null> {
  const allowed = await consumeTranslation();
  if (!allowed) return { translation: '', error: 'cap_reached' };

  const src = LANG_CODE[sourceLanguage] ?? 'fr';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=en&dt=t&q=${encodeURIComponent(word)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { translation: '', error: `api_${res.status}` };

    const data = await res.json();
    const translation = data?.[0]?.[0]?.[0];
    if (!translation) return { translation: '', error: 'empty_response' };

    return { translation };
  } catch {
    return { translation: '', error: 'network_error' };
  }
}
