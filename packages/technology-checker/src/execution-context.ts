import { StateStore } from './state-store.js';
import { DiscoveryRateLimiter, DomainCircuitBreaker } from '@jobpulse/discovery-engine';
import { RetryClassifier } from './retry-classifier.js';

export interface PipelineLogger {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  debug?(message: string, meta?: Record<string, any>): void;
}

export interface PipelineExecutionContextOptions {
  store: StateStore;
  rateLimiter?: DiscoveryRateLimiter;
  circuitBreaker?: DomainCircuitBreaker;
  retryClassifier?: RetryClassifier;
  dryRun?: boolean;
  workerId?: string;
  maxVerificationAttempts?: number;
  maxTrialCrawlAttempts?: number;
  claimDurationMinutes?: number;
  logger?: PipelineLogger;
}

export class PipelineExecutionContext {
  public readonly store: StateStore;
  public readonly rateLimiter: DiscoveryRateLimiter;
  public readonly circuitBreaker: DomainCircuitBreaker;
  public readonly retryClassifier: RetryClassifier;
  public readonly dryRun: boolean;
  public readonly workerId: string;
  public readonly maxVerificationAttempts: number;
  public readonly maxTrialCrawlAttempts: number;
  public readonly claimDurationMinutes: number;
  public readonly logger: PipelineLogger;

  constructor(options: PipelineExecutionContextOptions) {
    this.store = options.store;
    this.rateLimiter = options.rateLimiter ?? new DiscoveryRateLimiter();
    this.circuitBreaker = options.circuitBreaker ?? new DomainCircuitBreaker();
    this.retryClassifier = options.retryClassifier ?? new RetryClassifier();
    this.dryRun = options.dryRun ?? false;
    this.workerId = options.workerId ?? `worker-${Math.random().toString(36).substring(2, 9)}`;
    this.maxVerificationAttempts = options.maxVerificationAttempts ?? 3;
    this.maxTrialCrawlAttempts = options.maxTrialCrawlAttempts ?? 3;
    this.claimDurationMinutes = options.claimDurationMinutes ?? 10;
    this.logger = options.logger ?? {
      info: (msg, meta) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: msg, ...meta })),
      warn: (msg, meta) => console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message: msg, ...meta })),
      error: (msg, meta) => console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: msg, ...meta })),
      debug: (msg, meta) => console.debug?.(JSON.stringify({ timestamp: new Date().toISOString(), level: 'debug', message: msg, ...meta })),
    };
  }
}
