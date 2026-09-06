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
  const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1] || (args.includes('--source') ? args[args.indexOf('--source') + 1] : undefined);
  const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1] || (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : undefined);
  const forceDue = args.includes('--force-due') || args.includes('--force');
  const isOnce = args.includes('--once') || Boolean(companyArg) || Boolean(sourceArg);
  const isDaemon = args.includes('--daemon') || !isOnce;

  logger.info('Starting JobPulse Worker Process...', {
    isOnce,
    isDaemon,
    company: companyArg || 'all',
    source: sourceArg || 'all',
    forceDue,
  });

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
      let runId: string | null = null;

      // 1. If targeted company or source is specified, run directly in manual mode
      if (companyArg || sourceArg) {
        logger.info('Executing targeted one-shot scrape run...', { company: companyArg, source: sourceArg, forceDue });
        runId = await runner.run({
          companyIdentifier: companyArg,
          sourceId: sourceArg,
          forceDue: true,
          limitSources: limitArg ? parseInt(limitArg, 10) : undefined,
        });
      } else {
        // 2. Otherwise, first attempt to claim a pending queued scrape run
        logger.info('Checking for pending scrape runs in queue...');
        runId = await runner.pollAndExecutePending();

        if (runId) {
          logger.info(`Claimed and executed queued scrape run: ${runId}`);
        } else {
          // 3. If no pending run exists, execute a scheduled run across due sources
          logger.info('No queued scrape runs found; executing scheduled scrape run across eligible sources...');
          runId = await runner.run({
            executionMode: 'scheduled',
            forceDue,
            limitSources: limitArg ? parseInt(limitArg, 10) : undefined,
          });
        }
      }

      // 4. Also process any pending application sync (Google Sheets) if configured
      try {
        const syncedCount = await syncRunner.pollAndExecutePendingSync();
        if (syncedCount > 0) {
          logger.info(`One-shot worker synced ${syncedCount} applications to Google Sheets.`);
        }
      } catch (syncErr) {
        logger.warn('Non-blocking application sync notice during one-shot run:', { error: String(syncErr) });
      }

      logger.info(`Worker finished one-shot execution cleanly (run ID: ${runId})`);
      completeTask();
      process.exit(0);
    } catch (error) {
      completeTask();
      logger.error('Worker failed one-shot execution:', { error: String(error) });
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

