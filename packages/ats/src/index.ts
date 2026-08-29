export * from './registry.js';
export * from './adapter.interface.js';
export * from './adapters/greenhouse.adapter.js';
export * from './adapters/lever.adapter.js';
export * from './adapters/ashby.adapter.js';
export * from './adapters/jobright.adapter.js';

import type { ATSAdapter } from './adapter.interface.js';
import { ATSAdapterRegistry } from './registry.js';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter.js';
import { LeverAdapter } from './adapters/lever.adapter.js';
import { AshbyAdapter } from './adapters/ashby.adapter.js';
import { JobrightAdapter } from './adapters/jobright.adapter.js';

// Auto-register core ATS adapters into the registry
ATSAdapterRegistry.register('greenhouse', () => new GreenhouseAdapter());
ATSAdapterRegistry.register('lever', () => new LeverAdapter());
ATSAdapterRegistry.register('ashby', () => new AshbyAdapter());
ATSAdapterRegistry.register('jobright', () => new JobrightAdapter());

/**
 * Resolves an ATSAdapter instance via ATSAdapterRegistry.
 * Returns null if the adapter is not found (for legacy callers that check null).
 */
export function getAdapterForSource(adapterName: string): ATSAdapter | null {
  try {
    return ATSAdapterRegistry.getAdapter(adapterName);
  } catch {
    return null;
  }
}
