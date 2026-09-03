import { logger } from '@jobpulse/shared';

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ShutdownResult {
  clean: boolean;
  activeTasksRemaining: number;
  elapsedMs: number;
}

/**
 * Validates that all required worker environment variables are present, non-empty,
 * non-whitespace, and not set to default repository placeholder values.
 * 
 * Strict Invariants:
 * - NEXT_PUBLIC_SUPABASE_URL is required.
 * - SUPABASE_SERVICE_ROLE_KEY is required (ANON KEY CANNOT SUBSTITUTE).
 * - WORKER_SECRET_TOKEN is required and cannot be default/placeholder.
 */
export function validateWorkerEnvironment(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const errors: string[] = [];

  // 1. Validate Supabase URL
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  if (!supabaseUrl || !supabaseUrl.trim()) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is required and cannot be empty or whitespace.');
  } else if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP/HTTPS URL.');
  }

  // 2. Validate Supabase Service Role Key (strictly no anon key fallback)
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['SUPABASE_SECRET_KEY'];
  if (!serviceRoleKey || !serviceRoleKey.trim()) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required for privileged worker operations (anon key cannot substitute).');
  } else if (
    serviceRoleKey.includes('your_') ||
    serviceRoleKey.includes('YOUR-') ||
    serviceRoleKey === 'your_supabase_service_role_key_here'
  ) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY contains unconfigured placeholder credentials.');
  }

  // 3. Validate Worker Secret Token
  const workerSecretToken = env['WORKER_SECRET_TOKEN'];
  if (!workerSecretToken || !workerSecretToken.trim()) {
    errors.push('WORKER_SECRET_TOKEN is required for internal worker authorization.');
  } else if (
    workerSecretToken === 'jp_worker_internal_2026' ||
    workerSecretToken.includes('your_') ||
    workerSecretToken.includes('YOUR-')
  ) {
    errors.push('WORKER_SECRET_TOKEN cannot be a known default or placeholder secret.');
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
  private lastShutdownResult: ShutdownResult | null = null;

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

  public getLastShutdownResult(): ShutdownResult | null {
    return this.lastShutdownResult;
  }

  public async initiateShutdown(signal: string): Promise<ShutdownResult> {
    if (this.isShuttingDown) {
      logger.warn(`Shutdown already in progress; repeated ${signal} received.`);
      return this.lastShutdownResult ?? { clean: false, activeTasksRemaining: this.activeTasks, elapsedMs: 0 };
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful worker shutdown (active tasks: ${this.activeTasks})...`);

    const startTime = Date.now();

    return new Promise<ShutdownResult>((resolve) => {
      const checkDrain = () => {
        const elapsed = Date.now() - startTime;

        if (this.activeTasks === 0) {
          logger.info(`All worker tasks completed cleanly in ${elapsed}ms.`);
          const result: ShutdownResult = { clean: true, activeTasksRemaining: 0, elapsedMs: elapsed };
          this.lastShutdownResult = result;
          resolve(result);
          return;
        }

        if (elapsed >= this.hardTimeoutMs) {
          logger.error(
            `Hard shutdown timeout of ${this.hardTimeoutMs}ms exceeded with ${this.activeTasks} tasks still active. Forcing exit.`
          );
          const result: ShutdownResult = { clean: false, activeTasksRemaining: this.activeTasks, elapsedMs: elapsed };
          this.lastShutdownResult = result;
          resolve(result);
          return;
        }

        setTimeout(checkDrain, this.drainCheckIntervalMs);
      };

      checkDrain();
    });
  }
}
