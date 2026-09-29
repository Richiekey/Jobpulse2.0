import { RetentionService } from '../src/engine/retention.js';

async function main() {
  console.log("Starting controlled purge of raw payloads older than 1 day...");
  
  let totalDeleted = 0;
  let keepGoing = true;

  while (keepGoing) {
    const result = await RetentionService.executeRetentionCleanup({ 
      payloadRetentionDays: 1, 
      jobRetentionDays: 14,
      payloadBatchSize: 1000, // Larger batch
      maxBatches: 1 // Single batch per RPC
    });
    
    console.log(`Deleted ${result.payloadsDeleted} payloads in this iteration...`);
    totalDeleted += result.payloadsDeleted;

    if (result.payloadsDeleted === 0) {
      keepGoing = false;
    }
  }

  console.log(`Finished purge. Total payloads deleted: ${totalDeleted}`);
}

main().catch(console.error);
