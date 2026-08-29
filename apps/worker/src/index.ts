import { ScraperRunner } from './engine/runner.js';
import { logger } from '@jobpulse/shared';

async function main() {
  const args = process.argv.slice(2);
  const companyArg = args.find((a) => a.startsWith('--company='))?.split('=')[1];

  logger.info('Starting JobPulse Worker Process...');

  const runner = new ScraperRunner({ concurrency: 5 });

  try {
    const runId = await runner.run({ companyIdentifier: companyArg });
    logger.info(`Worker finished job batch: ${runId}`);
    process.exit(0);
  } catch (error) {
    logger.error('Worker failed execution:', { error: String(error) });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal crash in worker:', err);
  process.exit(1);
});
