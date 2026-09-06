const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../apps/web/.env.test.local'));
loadEnvFile(path.resolve(__dirname, '../apps/web/.env.test'));
loadEnvFile(path.resolve(__dirname, '../.env.test.local'));

const PRODUCTION_PROJECT_REF = 'rgwutmthzigjmzsmmjnp';
const TARGET_PROJECT_REF = 'wvyrivmvpcrhwinzmcyy';

const testProjectRef = process.env.SUPABASE_TEST_PROJECT_REF || TARGET_PROJECT_REF;
const mgmtToken = process.env.SUPABASE_TEST_MGMT_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MGMT_TOKEN;

if (!testProjectRef || testProjectRef === PRODUCTION_PROJECT_REF || testProjectRef.includes(PRODUCTION_PROJECT_REF)) {
  console.error('[SECURITY_GATE_VIOLATION] Refusing to run on production project!');
  process.exit(1);
}

if (!mgmtToken) {
  console.error('Error: SUPABASE_ACCESS_TOKEN / SUPABASE_MGMT_TOKEN not configured.');
  process.exit(1);
}

async function run() {
  const sqlPath = path.resolve(__dirname, '../supabase/migrations/20260906000001_batch_r_operational_intelligence.sql');
  const query = fs.readFileSync(sqlPath, 'utf-8');

  console.log(`Applying 20260906000001_batch_r_operational_intelligence.sql to ${testProjectRef}...`);

  const res = await fetch(`https://api.supabase.com/v1/projects/${testProjectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`PostgreSQL query failed (${res.status}): ${errText}`);
    process.exit(1);
  }

  console.log('Migration successfully applied to dedicated non-production project:', testProjectRef);
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
