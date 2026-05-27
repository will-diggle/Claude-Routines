/**
 * Counts the total characters across all articles in today's bundle.
 * Run from the bilinguist-brief directory:
 *
 *   node scripts/count-audio-chars.js
 */

const WORKER_URL = 'https://bilinguist-brief.williamdiggz.workers.dev/latest';

async function main() {
  console.log(`Fetching bundle from ${WORKER_URL}…\n`);

  const res = await fetch(`${WORKER_URL}?t=${Date.now()}`);
  if (!res.ok) {
    console.error(`HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }

  const data = await res.json();
  const briefings = data.briefings ?? {};
  const today = data.date ?? 'unknown';

  console.log(`Bundle date : ${today}\n`);

  let totalChars    = 0;
  let totalArticles = 0;

  for (const [lang, levels] of Object.entries(briefings).sort()) {
    for (const [level, lengths] of Object.entries(levels).sort()) {
      for (const [length, briefing] of Object.entries(lengths).sort()) {
        const articles = briefing.articles ?? [];
        const chars = articles.reduce(
          (sum, a) => sum + (a.headline ?? '').length + 2 + (a.body ?? '').length,
          0,
        );
        totalChars    += chars;
        totalArticles += articles.length;
        console.log(
          `  ${lang.toUpperCase().padEnd(3)} ${level.padEnd(7)} (${length.padEnd(6)})` +
          `  ${String(articles.length).padStart(2)} articles   ${chars.toLocaleString().padStart(7)} chars`,
        );
      }
    }
  }

  console.log('\n' + '─'.repeat(58));
  console.log(`  Total articles : ${totalArticles}`);
  console.log(`  Total chars    : ${totalChars.toLocaleString()}`);
  console.log('─'.repeat(58));
  console.log('\nCost to read every article once (ElevenLabs):');

  // ElevenLabs pricing tiers (check elevenlabs.io/pricing for your plan)
  const tiers = [
    { name: 'Starter  ($5/mo)',  rate: 0.30 },
    { name: 'Creator  ($22/mo)', rate: 0.24 },
    { name: 'Pro      ($99/mo)', rate: 0.18 },
  ];
  for (const { name, rate } of tiers) {
    const cost = (totalChars / 1000) * rate;
    console.log(`  ${name}   $${cost.toFixed(3)}`);
  }

  console.log('\nNote: each play of an article costs that many chars.');
  console.log('If 100 users each play 5 articles → multiply by 500.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
