export interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateBackoffDelay(
  attempt: number,
  options: BackoffOptions = {}
): number {
  const {
    baseDelayMs = 500,
    maxDelayMs = 30000,
    factor = 2,
    jitter = true,
  } = options;

  const exponential = baseDelayMs * Math.pow(factor, attempt);
  const capped = Math.min(exponential, maxDelayMs);

  if (!jitter) {
    return capped;
  }

  // Full jitter: random between 0 and capped
  return Math.floor(Math.random() * capped);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions & {
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) {
        break;
      }

      if (options.shouldRetry && !options.shouldRetry(error)) {
        throw error;
      }

      let delayMs = calculateBackoffDelay(attempt, options);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'HttpError') {
        const httpError = error as { retryAfterSec?: number };
        if (typeof httpError.retryAfterSec === 'number' && httpError.retryAfterSec > 0) {
          // Use server-specified delay, but bounded: [1s, 300s]
          const serverDelayMs = Math.max(1000, Math.min(httpError.retryAfterSec * 1000, 300_000));
          // Add small jitter (±10%) to avoid thundering herd
          const jitterMs = Math.floor(serverDelayMs * 0.1 * (Math.random() * 2 - 1));
          delayMs = serverDelayMs + jitterMs;
        }
      }
      // Minimum delay floor: never retry faster than 100ms
      delayMs = Math.max(100, delayMs);

      if (options.onRetry) {
        options.onRetry(error, attempt, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}
