import type { LanguageCode } from '../store/useSettingsStore';

// Each row is one "intensity level" — same vibe across all languages.
const PHRASES: Record<LanguageCode, string[]> = {
  en: ['Well done!',    'Perfect!',   'Brilliant!',  'Outstanding!',    'Superb!',        'Incredible!'],
  fr: ['Bravo !',       'Parfait !',  'Brillant !',  'Excellent !',     'Superbe !',      'Incroyable !'],
  de: ['Gut gemacht!',  'Perfekt!',   'Großartig!',  'Ausgezeichnet!',  'Hervorragend!',  'Unglaublich!'],
  sv: ['Bra jobbat!',   'Perfekt!',   'Lysande!',    'Utmärkt!',        'Superb!',        'Otroligt!'],
  it: ['Ben fatto!',    'Perfetto!',  'Brillante!',  'Eccellente!',     'Superbo!',       'Incredibile!'],
  es: ['¡Bien hecho!',  '¡Perfecto!', '¡Brillante!', '¡Sobresaliente!', '¡Estupendo!',   '¡Increíble!'],
  tr: ['Çok iyi!',      'Mükemmel!',  'Muhteşem!',   'Olağanüstü!',     'Harika!',        'İnanılmaz!'],
  hu: ['Szép munka!',   'Tökéletes!', 'Brilliáns!',  'Kiváló!',         'Nagyszerű!',     'Hihetetlen!'],
  ar: ['أحسنت!',       'ممتاز!',     'رائع!',        'متميز!',           'عظيم!',           'لا يُصدق!'],
};

/** Returns one congratulations phrase per language, all at the same random intensity. */
export function getCongratsLines(languages: LanguageCode[]): string[] {
  const idx = Math.floor(Math.random() * 6);
  const langs = languages.length > 0 ? languages : ['en' as LanguageCode];
  return langs.map((lang) => PHRASES[lang]?.[idx] ?? PHRASES.en[idx]);
}
