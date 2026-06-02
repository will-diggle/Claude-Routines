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
  // MyMemory expects raw UTF-8 in the query string — encodeURIComponent
  // converts ü/é/ö etc. to %XX which MyMemory treats as literal text.
  // Only encode characters that would break URL structure.
  const safeWord = word.replace(/[&=?#+]/g, (c) => encodeURIComponent(c));
  const url = `https://api.mymemory.translated.net/get?q=${safeWord}&langpair=${src}|en`;

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
