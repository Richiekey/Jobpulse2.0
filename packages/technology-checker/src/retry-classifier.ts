export type PipelineStage = 'verification' | 'adapter_resolution' | 'trial_crawl' | 'promotion';

export type ErrorClassification = 'TRANSIENT' | 'FATAL' | 'TERMINAL_STATE';

export interface RetryDecision {
  classification: ErrorClassification;
  reason: string;
  shouldRetry: boolean;
  nextRetryDelayMs: number;
}

export interface RetryClassifierOptions {
  maxTransientAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  backoffFactor?: number;
  jitterFactor?: number;
}

export class RetryClassifier {
  private readonly maxTransientAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly backoffFactor: number;
  private readonly jitterFactor: number;

  constructor(options: RetryClassifierOptions = {}) {
    this.maxTransientAttempts = options.maxTransientAttempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 30_000; // 30s base
    this.maxBackoffMs = options.maxBackoffMs ?? 3_600_000; // 1 hour max
    this.backoffFactor = options.backoffFactor ?? 2;
    this.jitterFactor = options.jitterFactor ?? 0.2; // +/- 20%
  }

  public classify(
    error: Error | unknown,
    stage: PipelineStage,
    attemptCount: number = 1
  ): RetryDecision {
    const message = this.extractErrorMessage(error).toLowerCase();
    const statusCode = this.extractStatusCode(error);

    // 1. Terminal State: Unique conflicts, already existing records, idempotency collisions
    if (
      statusCode === 409 ||
      message.includes('23505') ||
      message.includes('unique constraint') ||
      message.includes('duplicate key') ||
      message.includes('already exists') ||
      message.includes('already_promoted') ||
      message.includes('terminal_state')
    ) {
      return {
        classification: 'TERMINAL_STATE',
        reason: `Record reached terminal state or already exists: ${message}`,
        shouldRetry: false,
        nextRetryDelayMs: 0,
      };
    }

    // 2. Fatal Errors: 404 Not Found, Invalid ATS / Careers domain, unparseable payload
    if (
      statusCode === 404 ||
      message.includes('not found') ||
      message.includes('board not found') ||
      message.includes('no jobs found') ||
      message.includes('cannot resolve') ||
      message.includes('invalid html') ||
      message.includes('unparseable') ||
      message.includes('schema mismatch') ||
      message.includes('unsupported ats') ||
      message.includes('no_adapter') ||
      message.includes('fatal')
    ) {
      return {
        classification: 'FATAL',
        reason: `Fatal non-recoverable error in stage ${stage}: ${message}`,
        shouldRetry: false,
        nextRetryDelayMs: 0,
      };
    }

    // 3. Transient: Rate limiting, HTTP 429, HTTP 503, 502, 504, Circuit Breaker, network dropouts
    const isRateLimited =
      statusCode === 429 ||
      statusCode === 503 ||
      statusCode === 502 ||
      statusCode === 504 ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('circuit breaker open') ||
      message.includes('circuit_breaker_open') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('eai_again') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      message.includes('aborterror') ||
      message.includes('fetch failed');

    // 4. Auth / Forbidden: if temporary protection (Cloudflare, 403 rate-limit block) -> TRANSIENT, else FATAL
    const isForbidden =
      statusCode === 401 ||
      statusCode === 403 ||
      message.includes('forbidden') ||
      message.includes('unauthorized');

    if (isForbidden && (message.includes('cloudflare') || message.includes('blocked') || message.includes('challenge'))) {
      const shouldRetry = attemptCount < this.maxTransientAttempts;
      return {
        classification: shouldRetry ? 'TRANSIENT' : 'FATAL',
        reason: shouldRetry
          ? `Temporary anti-bot block in stage ${stage}: ${message}`
          : `Max attempts exceeded for stage ${stage} (${attemptCount}/${this.maxTransientAttempts}): ${message}`,
        shouldRetry,
        nextRetryDelayMs: shouldRetry ? this.calculateBackoff(attemptCount) : 0,
      };
    } else if (isForbidden) {
      return {
        classification: 'FATAL',
        reason: `Authentication or access denied in stage ${stage}: ${message}`,
        shouldRetry: false,
        nextRetryDelayMs: 0,
      };
    }

    if (isRateLimited) {
      const shouldRetry = attemptCount < this.maxTransientAttempts;
      return {
        classification: shouldRetry ? 'TRANSIENT' : 'FATAL',
        reason: shouldRetry
          ? `Transient network or rate-limiting error in stage ${stage}: ${message}`
          : `Max attempts exceeded for stage ${stage} (${attemptCount}/${this.maxTransientAttempts}): ${message}`,
        shouldRetry,
        nextRetryDelayMs: shouldRetry ? this.calculateBackoff(attemptCount) : 0,
      };
    }

    // Default fallback: if attemptCount < maxTransientAttempts, give it one retry as TRANSIENT, else FATAL
    if (attemptCount < this.maxTransientAttempts) {
      return {
        classification: 'TRANSIENT',
        reason: `Unclassified error in stage ${stage} (attempt ${attemptCount}): ${message}`,
        shouldRetry: true,
        nextRetryDelayMs: this.calculateBackoff(attemptCount),
      };
    }

    return {
      classification: 'FATAL',
      reason: `Max attempts exceeded for stage ${stage} (${attemptCount}/${this.maxTransientAttempts}): ${message}`,
      shouldRetry: false,
      nextRetryDelayMs: 0,
    };
  }

  public calculateBackoff(attemptCount: number): number {
    const raw = this.baseBackoffMs * Math.pow(this.backoffFactor, Math.max(0, attemptCount - 1));
    const capped = Math.min(this.maxBackoffMs, raw);
    const jitter = capped * this.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(1000, Math.round(capped + jitter));
  }

  private extractErrorMessage(error: unknown): string {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
      return (error as any).message;
    }
    return String(error);
  }

  private extractStatusCode(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const obj = error as Record<string, any>;
    if (typeof obj.status === 'number') return obj.status;
    if (typeof obj.statusCode === 'number') return obj.statusCode;
    if (typeof obj.code === 'number') return obj.code;
    return null;
  }
}
