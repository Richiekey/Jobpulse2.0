export interface RateLimiterOptions {
  maxConcurrentPerDomain?: number;
  maxConcurrentGlobal?: number;
  requestDelayMs?: number;
}

export class DiscoveryRateLimiter {
  private readonly maxConcurrentPerDomain: number;
  private readonly maxConcurrentGlobal: number;
  private readonly requestDelayMs: number;

  private currentGlobal = 0;
  private domainActive = new Map<string, number>();
  private domainLastRequest = new Map<string, number>();
  private queue: (() => void)[] = [];

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrentPerDomain = options.maxConcurrentPerDomain ?? 2;
    this.maxConcurrentGlobal = options.maxConcurrentGlobal ?? 10;
    this.requestDelayMs = options.requestDelayMs ?? 500;
  }

  async acquire(domain: string): Promise<void> {
    const cleanDomain = domain.toLowerCase().trim();

    while (true) {
      const activeForDomain = this.domainActive.get(cleanDomain) ?? 0;
      const lastRequest = this.domainLastRequest.get(cleanDomain) ?? 0;
      const now = Date.now();
      const delayNeeded = Math.max(0, this.requestDelayMs - (now - lastRequest));

      if (this.currentGlobal < this.maxConcurrentGlobal && activeForDomain < this.maxConcurrentPerDomain) {
        if (delayNeeded > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayNeeded));
        }

        this.currentGlobal++;
        this.domainActive.set(cleanDomain, activeForDomain + 1);
        this.domainLastRequest.set(cleanDomain, Date.now());
        return;
      }

      // Wait in line
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
  }

  release(domain: string): void {
    const cleanDomain = domain.toLowerCase().trim();
    this.currentGlobal = Math.max(0, this.currentGlobal - 1);
    const active = this.domainActive.get(cleanDomain) ?? 1;
    if (active <= 1) {
      this.domainActive.delete(cleanDomain);
    } else {
      this.domainActive.set(cleanDomain, active - 1);
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetAfterMs?: number;
}

export class DomainCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetAfterMs: number;
  private failures = new Map<string, { count: number; lastFailureTime: number }>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetAfterMs = options.resetAfterMs ?? 300_000; // 5 minutes default
  }

  isOpen(domain: string): boolean {
    const cleanDomain = domain.toLowerCase().trim();
    const state = this.failures.get(cleanDomain);
    if (!state) return false;

    // Check if cooldown elapsed
    if (Date.now() - state.lastFailureTime > this.resetAfterMs) {
      this.failures.delete(cleanDomain);
      return false;
    }

    return state.count >= this.failureThreshold;
  }

  recordFailure(domain: string): void {
    const cleanDomain = domain.toLowerCase().trim();
    const state = this.failures.get(cleanDomain) ?? { count: 0, lastFailureTime: Date.now() };
    state.count++;
    state.lastFailureTime = Date.now();
    this.failures.set(cleanDomain, state);
  }

  recordSuccess(domain: string): void {
    const cleanDomain = domain.toLowerCase().trim();
    this.failures.delete(cleanDomain);
  }
}
