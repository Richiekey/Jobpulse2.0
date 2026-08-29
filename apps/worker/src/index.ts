import { ScraperRunner } from './engine/runner.js';
import { logger } from '@jobpulse/shared';

async function main() {
  const args = process.argv.slice(2);
  const companyArg = args.find((a) => a.startsWith('--company='))?.split('=')[1] || (args.includes('--company') ? args[args.indexOf('--company') + 1] : undefined);
  const isOnce = args.includes('--once') || Boolean(companyArg);
  const isDaemon = args.includes('--daemon') || !isOnce;

  logger.info('Starting JobPulse Worker Process...', { isOnce, isDaemon, company: companyArg || 'all' });

  const runner = new ScraperRunner({ concurrency: 5 });

  if (isOnce) {
    try {
      const runId = await runner.run({ companyIdentifier: companyArg });
      logger.info(`Worker finished single execution run: ${runId}`);
      process.exit(0);
    } catch (error) {
      logger.error('Worker failed execution:', { error: String(error) });
      process.exit(1);
    }
  } else {
    logger.info('Worker entering continuous polling daemon mode for pending scrape runs...');

    const pollIntervalMs = 5000;
    const pollLoop = async () => {
      try {
        const claimedId = await runner.pollAndExecutePending();
        if (claimedId) {
          logger.info(`Worker completed queued scrape run: ${claimedId}`);
        }
      } catch (err) {
        logger.error('Error in daemon polling cycle:', { error: String(err) });
      }
      setTimeout(pollLoop, pollIntervalMs);
    };

    pollLoop();
  }
}

main().catch((err) => {
  console.error('Fatal crash in worker process:', err);
  process.exit(1);
});
