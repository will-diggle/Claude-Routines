const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

async function loadBatch(batchFile) {
  const filePath = path.join(__dirname, batchFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  let entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`📦 Loaded ${entries.length} entries from ${batchFile}`);

  // Normalize: ensure word field is never null
  entries = entries.map(e => ({
    ...e,
    word: e.word || e.lemma || 'unknown'
  }));

  // Batch upsert in chunks of 50 (smaller batches for upsert)
  const batchSize = 50;
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, Math.min(i + batchSize, entries.length));

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/word_dictionary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(batch)
      });

      if (response.ok) {
        written += batch.length;
        console.log(`✓ Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} entries`);
      } else if (response.status === 409) {
        // Conflict - likely duplicates, try individual inserts with ON CONFLICT
        let batchWritten = 0;
        for (const entry of batch) {
          try {
            const indResponse = await fetch(`${SUPABASE_URL}/rest/v1/word_dictionary`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
              },
              body: JSON.stringify([entry])
            });
            if (indResponse.ok) {
              batchWritten++;
            } else if (indResponse.status === 409) {
              skipped++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
        written += batchWritten;
        console.log(`✓ Batch ${Math.floor(i / batchSize) + 1}: ${batchWritten}/${batch.length} (${skipped} duplicates)`);
      } else {
        const error = await response.text();
        console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed: ${response.status}`);
        console.error(error.substring(0, 200));
        failed += batch.length;
      }
    } catch (error) {
      console.error(`❌ Error in batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      failed += batch.length;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${written} written, ${skipped} skipped (duplicates), ${failed} failed`);
  console.log(`${'='.repeat(60)}`);

  process.exit(failed > 0 ? 1 : 0);
}

const batchFile = process.argv[2] || 'batch_regenerated_001_final.json';
loadBatch(batchFile);
