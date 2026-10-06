import { supabase } from '../apps/worker/src/db.js';
import { DiscoveryRunner } from '../apps/worker/src/engine/discovery-runner.js';
import { VerificationRunner } from '../apps/worker/src/engine/verification-runner.js';
import { DiscoveryQueueRunner } from '../apps/worker/src/engine/discovery-queue-runner.js';

import { SupabaseStateStore, InMemoryStateStore } from '@jobpulse/technology-checker';

async function run() {
  console.log('--- Phase 11: Controlled End-to-End Validation (Dry Run) ---');
  
  const discoveryRunner = new DiscoveryRunner();
  const verificationRunner = new VerificationRunner();
  const queueRunner = new DiscoveryQueueRunner();

  const dbStore = new SupabaseStateStore(supabase);
  const sharedStore = new InMemoryStateStore(dbStore);

  try {
    // 1. Run ATS Discovery (TechnologyChecker) in dry-run
    console.log('\n>>> Running ATS Discovery (Dry Run) <<<');
    const discoveryMetrics = await discoveryRunner.runDiscovery({ dryRun: true, store: sharedStore });
    console.log('Discovery Metrics:', discoveryMetrics);

    // 2. Run Verification on pending records
    console.log('\n>>> Running Verification (Dry Run) <<<');
    const verificationMetrics = await verificationRunner.runVerification({ limit: 10, dryRun: true, store: sharedStore });
    console.log('Verification Metrics:', verificationMetrics);

    // 3. Run Queue Processor
    console.log('\n>>> Running Queue Processor (Dry Run) <<<');
    const queueMetrics = await queueRunner.runQueue({ limit: 10, dryRun: true, store: sharedStore });
    console.log('Queue Metrics:', queueMetrics);

    console.log('\n✅ Dry-Run Validation Passed (No exceptions thrown).');
    process.exit(0);
  } catch (error) {
    console.error('❌ Dry-Run Validation Failed:', error);
    process.exit(1);
  }
}

run().catch(console.error);
