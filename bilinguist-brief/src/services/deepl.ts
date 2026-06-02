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
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${src}|en`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { translation: '', error: `api_${res.status}` };

    const data = await res.json();
    if (data.responseStatus !== 200) return { translation: '', error: `error_${data.responseStatus}` };

    const translation = data.responseData?.translatedText;
    if (!translation) return { translation: '', error: 'empty_response' };

    return { translation };
  } catch {
    return { translation: '', error: 'network_error' };
  }
}
