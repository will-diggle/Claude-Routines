import type { LanguageCode } from '../store/useSettingsStore';

const PHRASES: Record<LanguageCode, string[]> = {
  en: ['Well done!', 'Perfect!', 'Brilliant!', 'Outstanding!', 'Superb!', 'Incredible!', 'Amazing!', 'Top job!', 'Fantastic!', 'Sensational!'],
  fr: ['Bravo !',    'Parfait !', 'Brillant !', 'Excellent !', 'Superbe !', 'Incroyable !', 'Formidable !', 'Magnifique !', 'Fantastique !', 'Génial !'],
  de: ['Gut gemacht!', 'Perfekt!', 'Großartig!', 'Ausgezeichnet!', 'Hervorragend!', 'Unglaublich!', 'Wunderbar!', 'Klasse!', 'Spitze!', 'Phänomenal!'],
  sv: ['Bra jobbat!', 'Perfekt!', 'Lysande!', 'Utmärkt!', 'Superb!', 'Otroligt!', 'Fantastiskt!', 'Briljant!', 'Suveränt!', 'Enastående!'],
  it: ['Ben fatto!', 'Perfetto!', 'Brillante!', 'Eccellente!', 'Superbo!', 'Incredibile!', 'Fantastico!', 'Magnifico!', 'Spettacolare!', 'Straordinario!'],
  pt: ['Muito bem!', 'Perfeito!', 'Brilhante!', 'Excelente!', 'Ótimo!', 'Incrível!', 'Fantástico!', 'Maravilhoso!', 'Sensacional!', 'Arrasou!'],
  es: ['¡Bien hecho!', '¡Perfecto!', '¡Brillante!', '¡Sobresaliente!', '¡Estupendo!', '¡Increíble!', '¡Fantástico!', '¡Maravilloso!', '¡Genial!', '¡Espectacular!'],
  tr: ['Çok iyi!', 'Mükemmel!', 'Muhteşem!', 'Olağanüstü!', 'Harika!', 'İnanılmaz!', 'Fantastik!', 'Fevkalade!', 'Bravo!', 'Süper!'],
  hu: ['Szép munka!', 'Tökéletes!', 'Brilliáns!', 'Kiváló!', 'Nagyszerű!', 'Hihetetlen!', 'Fantasztikus!', 'Csodálatos!', 'Zseniális!', 'Remek!'],
  ar: ['أحسنت!', 'ممتاز!', 'رائع!', 'متميز!', 'عظيم!', 'لا يُصدق!', 'رائع جداً!', 'مذهل!', 'بارع!', 'أبدعت!'],
};

/** Flat pool of all phrases across all languages — used for continuous random cycling. */
export const ALL_CONGRATS_POOL: string[] = Object.values(PHRASES).flat();

/**
 * Flat pool of phrases for just the languages given — used for the cycling
 * praise on the end-of-game screen, so it only ever congratulates the reader in
 * languages they actually use (their active brief languages plus any language
 * they've saved words in), never in one they've never touched.
 * Falls back to English if none of the given languages have phrases.
 */
export function buildCongratsPool(languages: LanguageCode[]): string[] {
  const pool = languages.flatMap((lang) => PHRASES[lang] ?? []);
  return pool.length > 0 ? pool : PHRASES.en;
}

/** Returns one congratulations phrase per active language, all at the same random intensity. */
export function getCongratsLines(languages: LanguageCode[]): string[] {
  const idx = Math.floor(Math.random() * 10);
  const langs = languages.length > 0 ? languages : ['en' as LanguageCode];
  return langs.map((lang) => PHRASES[lang]?.[idx] ?? PHRASES.en[idx]);
}
