import { DiscoveryCandidate } from '../types.js';
import { DiscoveryRateLimiter, DomainCircuitBreaker } from '../safety.js';

export interface DiscoveryOptions {
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
  rateLimiter?: DiscoveryRateLimiter;
  circuitBreaker?: DomainCircuitBreaker;
}

export interface DiscoveryProvider {
  readonly name: string;
  discover(options?: DiscoveryOptions): Promise<DiscoveryCandidate[]>;
}
