import { logger } from '@jobpulse/shared';

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates that all required worker environment variables are present, non-empty,
 * and not set to default repository placeholder values.
 */
export function validateWorkerEnvironment(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const errors: string[] = [];

  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  if (!supabaseUrl || !supabaseUrl.trim()) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is required and cannot be empty.');
  } else if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP/HTTPS URL.');
  }

  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  const anonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const effectiveKey = serviceRoleKey || anonKey;

  if (!effectiveKey || !effectiveKey.trim()) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');
  } else if (
    effectiveKey.includes('your_') ||
    effectiveKey.includes('YOUR-') ||
    effectiveKey === 'your_supabase_service_role_key_here'
  ) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY contains unconfigured placeholder credentials.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Manages active task execution counters and coordinates graceful drainage
 * upon SIGTERM or SIGINT termination signals.
 */
export class GracefulShutdownManager {
  private isShuttingDown = false;
  private activeTasks = 0;
  private hardTimeoutMs: number;
  private drainCheckIntervalMs: number;

  constructor(options: { hardTimeoutMs?: number; drainCheckIntervalMs?: number } = {}) {
    // 30-second hard safety timeout for production containers/pods
    this.hardTimeoutMs = options.hardTimeoutMs ?? 30_000;
    this.drainCheckIntervalMs = options.drainCheckIntervalMs ?? 250;
  }

  public registerTask(): () => void {
    if (this.isShuttingDown) {
      throw new Error('Worker is shutting down; cannot accept new tasks.');
    }
    this.activeTasks++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeTasks = Math.max(0, this.activeTasks - 1);
      }
    };
  }

  public getActiveTaskCount(): number {
    return this.activeTasks;
  }

  public isShutdownRequested(): boolean {
    return this.isShuttingDown;
  }

  public async initiateShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn(`Shutdown already in progress; repeated ${signal} received.`);
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful worker shutdown (active tasks: ${this.activeTasks})...`);

    const startTime = Date.now();

    return new Promise<void>((resolve) => {
      const checkDrain = () => {
        const elapsed = Date.now() - startTime;

        if (this.activeTasks === 0) {
          logger.info(`All worker tasks completed cleanly in ${elapsed}ms.`);
          resolve();
          return;
        }

        if (elapsed >= this.hardTimeoutMs) {
          logger.error(
            `Hard shutdown timeout of ${this.hardTimeoutMs}ms exceeded with ${this.activeTasks} tasks still active. Forcing exit.`
          );
          resolve();
          return;
        }

        setTimeout(checkDrain, this.drainCheckIntervalMs);
      };

      checkDrain();
    });
  }
}
