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

  const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`📦 Loaded ${entries.length} entries from ${batchFile}`);

  // Batch upsert in chunks of 100
  const batchSize = 100;
  let written = 0;
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

      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ Batch ${i / batchSize + 1} failed: ${response.status}`);
        console.error(error);
        failed += batch.length;
      } else {
        written += batch.length;
        console.log(`✓ Batch ${i / batchSize + 1}: ${batch.length} entries`);
      }
    } catch (error) {
      console.error(`❌ Error in batch ${i / batchSize + 1}: ${error.message}`);
      failed += batch.length;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${written} written, ${failed} failed`);
  console.log(`${'='.repeat(60)}`);

  process.exit(failed > 0 ? 1 : 0);
}

const batchFile = process.argv[2] || 'batch_lm_consolidated.json';
loadBatch(batchFile);
