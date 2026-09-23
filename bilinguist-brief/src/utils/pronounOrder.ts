// Postgres jsonb reorders object keys by (length, then alphabetically) on
// storage — not the grammatical order a verb table was written in. Every
// tense table read from the DB is affected regardless of source (live
// /word fetch via the worker, or the on-device word_forms cache read
// directly), so pronoun order has to be fixed at render time, not upstream.
//
// Built from an audit of real dictionary rows (2026-09) covering every
// pronoun-key spelling actually in use per language, including subjunctive
// "que"/"che"-prefixed moods and tables that split a combined pronoun
// ("il/elle") into separate keys ("il", "elle").
const PRONOUN_ORDER: Record<string, string[]> = {
  de: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie', 'sie'],
  fr: [
    'je', 'tu', 'il/elle', 'il', 'elle', 'on', 'nous', 'vous', 'ils/elles', 'ils', 'elles',
    "que je", 'que tu', "qu'il/elle", 'que nous', 'que vous', "qu'ils/elles",
  ],
  es: [
    'yo', 'tú', 'él/ella', 'él/ella/usted',
    'nosotros', 'nosotros/as', 'vosotros', 'vosotros/as',
    'ellos/ellas', 'ellos/ellas/ustedes',
  ],
  it: [
    'io', 'tu', 'lui/lei', 'noi', 'voi', 'loro',
    'che io', 'che tu', 'che lui/lei', 'che noi', 'che voi', 'che loro',
  ],
  pt: ['eu', 'tu', 'tu/você', 'ele/ela', 'ele', 'nós', 'vós', 'eles/elas', 'eles'],
  sv: ['jag', 'du', 'han/hon/den', 'han', 'hon', 'vi', 'ni', 'de'],
};

/**
 * Sorts a verb tense table's pronoun entries into standard grammatical
 * order (1st/2nd/3rd singular, then 1st/2nd/3rd plural). A key not in the
 * known list for that language (an unseen data variant) is pushed to the
 * end, after every recognized pronoun, keeping its original relative order
 * — never dropped, just not repositioned.
 */
export function sortPronounEntries(
  language: string,
  table: Record<string, string>,
): [string, string][] {
  const order = PRONOUN_ORDER[language];
  const entries = Object.entries(table);
  if (!order) return entries;
  const rank = new Map(order.map((p, i) => [p, i]));
  return entries
    .map((entry, i) => ({ entry, i, rank: rank.get(entry[0]) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.entry);
}
