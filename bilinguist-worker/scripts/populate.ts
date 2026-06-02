/**
 * Bilinguist Dictionary Pre-population Script
 *
 * Calls Claude API for each word in STARTER_WORDS, then POSTs the result
 * to the deployed worker's admin endpoint to store it in D1.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   export WORKER_URL=https://bilinguist-brief.YOUR_SUBDOMAIN.workers.dev
 *   export WORKER_ADMIN_KEY=your_admin_secret
 *   npx tsx scripts/populate.ts --lang de
 *   npx tsx scripts/populate.ts --lang fr
 *   npx tsx scripts/populate.ts --lang all
 *
 * Flags:
 *   --lang <de|fr|es|it|sv|all>   Which language(s) to process
 *   --dry-run                     Print what would be sent without calling APIs
 *   --delay <ms>                  Delay between Claude calls (default 400ms)
 */

import Anthropic from '@anthropic-ai/sdk';

// ── Starter word lists ────────────────────────────────────────────────────────
// News-vocabulary focused. Common words get cached fastest in production anyway,
// but this seeds the DB so day-one users get cache hits immediately.

const STARTER_WORDS: Record<string, string[]> = {
  de: [
    // Core verbs
    'sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen',
    'sagen', 'machen', 'gehen', 'kommen', 'sehen', 'wissen', 'denken', 'nehmen', 'geben',
    'stehen', 'bringen', 'halten', 'lassen', 'finden', 'bleiben', 'heißen', 'zeigen',
    'führen', 'sprechen', 'brauchen', 'entscheiden', 'bestätigen', 'ankündigen', 'fordern',
    'erklären', 'berichten', 'beschließen', 'warnen', 'unterstützen', 'ablehnen',
    // News nouns
    'Regierung', 'Minister', 'Staat', 'Land', 'Jahr', 'Zeit', 'Mensch', 'Welt', 'Leben',
    'Frage', 'Weise', 'Arbeit', 'Stadt', 'Recht', 'Teil', 'Zahl', 'Schule', 'Wirtschaft',
    'Partei', 'Präsident', 'Kanzler', 'Parlament', 'Gericht', 'Polizei', 'Armee',
    'Wahl', 'Krieg', 'Frieden', 'Krise', 'Vertrag', 'Gesetz', 'Grenze', 'Konflikt',
    'Bevölkerung', 'Haushalt', 'Investition', 'Inflation', 'Wachstum', 'Arbeitslosigkeit',
    // Adjectives
    'groß', 'gut', 'neu', 'alt', 'hoch', 'lang', 'klein', 'jung', 'wichtig', 'möglich',
    'richtig', 'stark', 'schwer', 'offen', 'frei', 'früh', 'kurz', 'spät', 'erst',
    'letzt', 'international', 'national', 'politisch', 'wirtschaftlich', 'militärisch',
  ],

  fr: [
    // Core verbs
    'être', 'avoir', 'faire', 'aller', 'venir', 'voir', 'savoir', 'pouvoir', 'vouloir',
    'devoir', 'dire', 'prendre', 'donner', 'trouver', 'mettre', 'rester', 'partir',
    'tenir', 'passer', 'sembler', 'appeler', 'parler', 'laisser', 'permettre', 'montrer',
    'annoncer', 'déclarer', 'décider', 'demander', 'soutenir', 'rejeter', 'confirmer',
    'avertir', 'accuser', 'négocier', 'proposer', 'approuver', 'critiquer',
    // News nouns
    'gouvernement', 'ministre', 'pays', 'État', 'monde', 'année', 'temps', 'personne',
    'question', 'vie', 'travail', 'ville', 'droit', 'partie', 'nombre', 'école',
    'économie', 'parti', 'président', 'premier ministre', 'parlement', 'tribunal',
    'police', 'armée', 'élection', 'guerre', 'paix', 'crise', 'traité', 'loi',
    'frontière', 'conflit', 'population', 'budget', 'investissement', 'inflation',
    // Adjectives
    'grand', 'bon', 'nouveau', 'vieux', 'haut', 'long', 'petit', 'jeune', 'important',
    'possible', 'dernier', 'premier', 'fort', 'difficile', 'ouvert', 'libre',
    'international', 'national', 'politique', 'économique', 'militaire', 'social',
  ],

  es: [
    'ser', 'estar', 'tener', 'hacer', 'ir', 'venir', 'ver', 'saber', 'poder', 'querer',
    'deber', 'decir', 'dar', 'tomar', 'poner', 'quedar', 'pasar', 'hablar', 'llevar',
    'anunciar', 'declarar', 'decidir', 'pedir', 'apoyar', 'rechazar', 'confirmar',
    'gobierno', 'ministro', 'país', 'estado', 'mundo', 'año', 'persona', 'vida',
    'trabajo', 'ciudad', 'derecho', 'economía', 'partido', 'presidente', 'parlamento',
    'policía', 'ejército', 'elección', 'guerra', 'paz', 'crisis', 'ley', 'frontera',
    'grande', 'bueno', 'nuevo', 'viejo', 'importante', 'posible', 'último', 'primero',
    'internacional', 'nacional', 'político', 'económico', 'militar', 'social',
  ],

  it: [
    'essere', 'avere', 'fare', 'andare', 'venire', 'vedere', 'sapere', 'potere', 'volere',
    'dovere', 'dire', 'prendere', 'dare', 'stare', 'parlare', 'lasciare', 'trovare',
    'annunciare', 'dichiarare', 'decidere', 'chiedere', 'sostenere', 'rifiutare',
    'governo', 'ministro', 'paese', 'stato', 'mondo', 'anno', 'persona', 'vita',
    'lavoro', 'città', 'diritto', 'economia', 'partito', 'presidente', 'parlamento',
    'polizia', 'esercito', 'elezione', 'guerra', 'pace', 'crisi', 'legge', 'confine',
    'grande', 'buono', 'nuovo', 'vecchio', 'importante', 'possibile', 'ultimo', 'primo',
    'internazionale', 'nazionale', 'politico', 'economico', 'militare', 'sociale',
  ],

  sv: [
    'vara', 'ha', 'göra', 'gå', 'komma', 'se', 'veta', 'kunna', 'vilja', 'måste',
    'säga', 'ta', 'ge', 'stå', 'bli', 'hålla', 'hitta', 'lämna', 'verka', 'tala',
    'tillkännage', 'förklara', 'besluta', 'begära', 'stödja', 'avvisa', 'bekräfta',
    'regering', 'minister', 'land', 'stat', 'värld', 'år', 'människa', 'liv',
    'arbete', 'stad', 'rätt', 'ekonomi', 'parti', 'president', 'riksdag',
    'polis', 'armé', 'val', 'krig', 'fred', 'kris', 'lag', 'gräns',
    'stor', 'bra', 'ny', 'gammal', 'viktig', 'möjlig', 'sista', 'första',
    'internationell', 'nationell', 'politisk', 'ekonomisk', 'militär', 'social',
  ],
};

// ── Language metadata ─────────────────────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', sv: 'Swedish',
};

const PAST_TENSE_NAME: Record<string, string> = {
  fr: 'passé composé', de: 'Präteritum', es: 'pretérito indefinido',
  it: 'passato prossimo', sv: 'preteritum', en: 'simple past',
};

const VERB_PRONOUNS: Record<string, string[]> = {
  fr: ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'],
  de: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'],
  es: ['yo', 'tú', 'él/ella', 'nosotros', 'vosotros', 'ellos/ellas'],
  it: ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'],
  sv: ['jag', 'du', 'han/hon', 'vi', 'ni', 'de'],
  en: ['I', 'you', 'he/she', 'we', 'you (pl)', 'they'],
};

// ── Claude call ───────────────────────────────────────────────────────────────

interface WordResult {
  wordType: string;
  explanation: string;
  example: string;
  pronunciation: string;
  verbTable: Record<string, string> | null;
  verbTablePast: Record<string, string> | null;
  forms: Record<string, string> | null;
  tip: string | null;
}

async function generateWord(
  client: Anthropic,
  word: string,
  lang: string,
): Promise<WordResult | null> {
  const pronouns = VERB_PRONOUNS[lang] ?? VERB_PRONOUNS.fr;
  const langName = LANGUAGE_NAMES[lang];
  const pastName = PAST_TENSE_NAME[lang] ?? 'simple past';
  const [p0, p1, p2, p3, p4, p5] = pronouns;

  const prompt = `A language learner studying ${langName} at B1 level wants to learn the word "${word}".

Reply ONLY with a JSON object — no markdown, no preamble:
{
  "wordType": one of "verb" | "noun" | "adjective" | "adverb" | "phrase" | "other",
  "explanation": "Meaning in English, 1-2 sentences",
  "example": "A ${langName} example sentence using this word",
  "pronunciation": "IPA pronunciation of ${word}",
  "verbTable": if verb, present tense {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "verbTablePast": if verb, ${pastName} {"${p0}": "...", "${p1}": "...", "${p2}": "...", "${p3}": "...", "${p4}": "...", "${p5}": "..."} — otherwise null,
  "forms": if noun {"gender": "masculine/feminine/neuter", "plural": "plural form", "article": "definite article"} — if adjective {"feminine": "feminine form", "comparative": "comparative", "superlative": "superlative"} — otherwise null,
  "tip": a short memorable tip — etymology, learner mistake, or memory hook — or null
}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = (msg.content[0] as { text: string }).text;
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as WordResult;
  } catch (err) {
    console.error(`  Claude error for "${word}":`, err);
    return null;
  }
}

// ── Translate ─────────────────────────────────────────────────────────────────

async function translateWord(word: string, lang: string): Promise<string | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${lang}&tl=en&dt=t&q=${encodeURIComponent(word)}`;
  try {
    const res  = await fetch(url);
    const data = await res.json() as unknown[][];
    return (data?.[0]?.[0] as string[])?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Send to worker ────────────────────────────────────────────────────────────

async function postWord(
  workerUrl: string,
  adminKey: string,
  word: string,
  lang: string,
  translation: string | null,
  result: WordResult,
): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl}/word`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({
        word, language: lang, translation,
        wordType:     result.wordType,
        explanation:  result.explanation,
        example:      result.example,
        pronunciation: result.pronunciation,
        verbTable:    result.verbTable,
        verbTablePast: result.verbTablePast,
        forms:        result.forms,
        tip:          result.tip,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const langArg  = args[args.indexOf('--lang') + 1] ?? 'all';
  const dryRun   = args.includes('--dry-run');
  const delayMs  = parseInt(args[args.indexOf('--delay') + 1] ?? '400', 10);

  const workerUrl  = process.env.WORKER_URL?.replace(/\/$/, '');
  const adminKey   = process.env.WORKER_ADMIN_KEY ?? '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

  if (!dryRun && (!workerUrl || !adminKey || !anthropicKey)) {
    console.error('Set WORKER_URL, WORKER_ADMIN_KEY, and ANTHROPIC_API_KEY env vars');
    process.exit(1);
  }

  const langs = langArg === 'all' ? Object.keys(STARTER_WORDS) : [langArg];
  const client = dryRun ? null : new Anthropic({ apiKey: anthropicKey });

  for (const lang of langs) {
    const words = STARTER_WORDS[lang];
    if (!words) { console.warn(`Unknown language: ${lang}`); continue; }

    console.log(`\n── ${LANGUAGE_NAMES[lang]} (${words.length} words) ──`);
    let ok = 0, fail = 0;

    for (const word of words) {
      if (dryRun) { console.log(`  [dry] ${lang}:${word}`); continue; }

      process.stdout.write(`  ${word}... `);
      const [translation, result] = await Promise.all([
        translateWord(word, lang),
        generateWord(client!, word, lang),
      ]);

      if (!result) { console.log('❌ Claude failed'); fail++; continue; }

      const stored = await postWord(workerUrl!, adminKey, word, lang, translation, result);
      if (stored) { console.log(`✓ ${result.wordType} "${translation ?? '?'}"`); ok++; }
      else        { console.log('❌ worker POST failed'); fail++; }

      await new Promise(r => setTimeout(r, delayMs));
    }

    if (!dryRun) console.log(`\n  ${lang}: ${ok} stored, ${fail} failed`);
  }

  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
