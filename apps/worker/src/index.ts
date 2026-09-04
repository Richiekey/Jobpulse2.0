import { ScraperRunner } from './engine/runner.js';
import { SyncRunner } from './engine/sync-runner.js';
import { logger } from '@jobpulse/shared';
import { validateWorkerEnvironment, GracefulShutdownManager } from './lifecycle.js';

async function main() {
  // P0-5: Pre-flight validation for required worker environment variables
  const validation = validateWorkerEnvironment();
  if (!validation.isValid) {
    logger.error('FATAL: Worker environment configuration validation failed:', { errors: validation.errors });
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const companyArg = args.find((a) => a.startsWith('--company='))?.split('=')[1] || (args.includes('--company') ? args[args.indexOf('--company') + 1] : undefined);
  const isOnce = args.includes('--once') || Boolean(companyArg);
  const isDaemon = args.includes('--daemon') || !isOnce;

  logger.info('Starting JobPulse Worker Process...', { isOnce, isDaemon, company: companyArg || 'all' });

  const runner = new ScraperRunner({ concurrency: 5 });
  const syncRunner = new SyncRunner({ batchSize: 10 });
  const shutdownManager = new GracefulShutdownManager();

  const handleSignal = async (signal: string) => {
    await shutdownManager.initiateShutdown(signal);
    process.exit(0);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  if (isOnce) {
    const completeTask = shutdownManager.registerTask();
    try {
      const runId = await runner.run({ companyIdentifier: companyArg });
      logger.info(`Worker finished single execution run: ${runId}`);
      completeTask();
      process.exit(0);
    } catch (error) {
      completeTask();
      logger.error('Worker failed execution:', { error: String(error) });
      process.exit(1);
    }
  } else {
    logger.info('Worker entering continuous polling daemon mode for scrape runs and application sync events...');

    const pollIntervalMs = 5000;
    const pollLoop = async () => {
      if (shutdownManager.isShutdownRequested()) {
        return;
      }

      try {
        if (!shutdownManager.isShutdownRequested()) {
          const completeTask = shutdownManager.registerTask();
          try {
            const claimedId = await runner.pollAndExecutePending();
            if (claimedId) {
              logger.info(`Worker completed queued scrape run: ${claimedId}`);
            }

            const syncedCount = await syncRunner.pollAndExecutePendingSync();
            if (syncedCount > 0) {
              logger.info(`Worker synced ${syncedCount} applications to Google Sheets.`);
            }
          } finally {
            completeTask();
          }
        }
      } catch (err) {
        logger.error('Error in daemon polling cycle:', { error: String(err) });
      }

      if (!shutdownManager.isShutdownRequested()) {
        setTimeout(pollLoop, pollIntervalMs);
      }
    };

    pollLoop();
  }
}

main().catch((err) => {
  console.error('Fatal crash in worker process:', err);
  process.exit(1);
});

