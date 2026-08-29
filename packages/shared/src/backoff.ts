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

      const delayMs = calculateBackoffDelay(attempt, options);
      if (options.onRetry) {
        options.onRetry(error, attempt, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}
