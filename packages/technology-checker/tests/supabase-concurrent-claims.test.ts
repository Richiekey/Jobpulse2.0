import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { SupabaseStateStore } from '../src/state-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../../apps/web/.env.test.local'));
loadEnvFile(path.resolve(__dirname, '../../../apps/web/.env.test'));
loadEnvFile(path.resolve(__dirname, '../../../tests/.env.test.local'));

const testUrl = process.env['SUPABASE_TEST_URL'] || process.env['NEXT_PUBLIC_SUPABASE_TEST_URL'] || 'http://127.0.0.1:54321';
const testServiceRoleKey = process.env['SUPABASE_TEST_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY'];

describe('SupabaseStateStore - Concurrent Claiming (MC-1 / Integration)', () => {
  let db: SupabaseClient;
  let store: SupabaseStateStore;

  beforeAll(() => {
    if (!testServiceRoleKey) {
      console.warn('Skipping Supabase Integration test: SUPABASE_TEST_SERVICE_ROLE_KEY not set.');
      return;
    }
    db = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    store = new SupabaseStateStore(db);
  });

  it('atomically claims a candidate so a concurrent worker cannot steal it', async () => {
    if (!testServiceRoleKey) return; // skip

    // 1. Insert a test record
    const recordId = await store.insertRecord({
      domain: `concurrent-test-${Date.now()}.com`,
      company_name: 'Concurrent Claim Test',
      ats_provider: 'ashby',
      discovery_status: 'SUCCESS',
      priority_score: 999, // Force it to the top
    });

    // 2. Concurrently attempt to claim
    const [claimed1, claimed2] = await Promise.all([
      store.claimCandidates('SUCCESS', 'worker-1', 1, 10),
      store.claimCandidates('SUCCESS', 'worker-2', 1, 10),
    ]);

    // 3. Exactly one worker should get the record
    const worker1GotIt = claimed1.some((r) => r.id === recordId);
    const worker2GotIt = claimed2.some((r) => r.id === recordId);

    expect(worker1GotIt !== worker2GotIt).toBe(true);
    expect(worker1GotIt && worker2GotIt).toBe(false);

    // 4. Verify epoch was incremented
    const claimedRecord = worker1GotIt ? claimed1.find(r => r.id === recordId) : claimed2.find(r => r.id === recordId);
    expect(claimedRecord?.claim_epoch).toBe(1);

    // 5. Test renewal
    const owningWorker = worker1GotIt ? 'worker-1' : 'worker-2';
    const nonOwningWorker = worker1GotIt ? 'worker-2' : 'worker-1';

    const failEpoch = await store.renewClaim(recordId, nonOwningWorker);
    expect(failEpoch).toBeNull(); // Should fail for the wrong worker

    const newEpoch = await store.renewClaim(recordId, owningWorker);
    expect(newEpoch).toBe(2); // Should succeed and return epoch=2

    // Cleanup
    await store.releaseClaim(recordId, owningWorker);
  });
});
