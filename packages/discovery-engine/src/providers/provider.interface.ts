import { DiscoveryCandidate } from '../types.js';

export interface DiscoveryOptions {
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface DiscoveryProvider {
  readonly name: string;
  discover(options?: DiscoveryOptions): Promise<DiscoveryCandidate[]>;
}
