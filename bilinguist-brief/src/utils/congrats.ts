import type { LanguageCode } from '../store/useSettingsStore';

const PHRASES: Record<LanguageCode, string[]> = {
  en: ['Well done!', 'Perfect!', 'Brilliant!', 'Outstanding!', 'Superb!', 'Incredible!', 'Amazing!', 'Top job!', 'Fantastic!', 'Sensational!'],
  fr: ['Bravo !',    'Parfait !', 'Brillant !', 'Excellent !', 'Superbe !', 'Incroyable !', 'Formidable !', 'Magnifique !', 'Fantastique !', 'Génial !'],
  de: ['Gut gemacht!', 'Perfekt!', 'Großartig!', 'Ausgezeichnet!', 'Hervorragend!', 'Unglaublich!', 'Wunderbar!', 'Klasse!', 'Spitze!', 'Phänomenal!'],
  sv: ['Bra jobbat!', 'Perfekt!', 'Lysande!', 'Utmärkt!', 'Superb!', 'Otroligt!', 'Fantastiskt!', 'Briljant!', 'Suveränt!', 'Enastående!'],
  it: ['Ben fatto!', 'Perfetto!', 'Brillante!', 'Eccellente!', 'Superbo!', 'Incredibile!', 'Fantastico!', 'Magnifico!', 'Spettacolare!', 'Straordinario!'],
  es: ['¡Bien hecho!', '¡Perfecto!', '¡Brillante!', '¡Sobresaliente!', '¡Estupendo!', '¡Increíble!', '¡Fantástico!', '¡Maravilloso!', '¡Genial!', '¡Espectacular!'],
  tr: ['Çok iyi!', 'Mükemmel!', 'Muhteşem!', 'Olağanüstü!', 'Harika!', 'İnanılmaz!', 'Fantastik!', 'Fevkalade!', 'Bravo!', 'Süper!'],
  hu: ['Szép munka!', 'Tökéletes!', 'Brilliáns!', 'Kiváló!', 'Nagyszerű!', 'Hihetetlen!', 'Fantasztikus!', 'Csodálatos!', 'Zseniális!', 'Remek!'],
  ar: ['أحسنت!', 'ممتاز!', 'رائع!', 'متميز!', 'عظيم!', 'لا يُصدق!', 'رائع جداً!', 'مذهل!', 'بارع!', 'أبدعت!'],
};

/** Flat pool of all phrases across all languages — used for continuous random cycling. */
export const ALL_CONGRATS_POOL: string[] = Object.values(PHRASES).flat();

/** Returns one congratulations phrase per active language, all at the same random intensity. */
export function getCongratsLines(languages: LanguageCode[]): string[] {
  const idx = Math.floor(Math.random() * 10);
  const langs = languages.length > 0 ? languages : ['en' as LanguageCode];
  return langs.map((lang) => PHRASES[lang]?.[idx] ?? PHRASES.en[idx]);
}
