export * from './registry.js';
export * from './adapter.interface.js';
export * from './adapters/greenhouse.adapter.js';
export * from './adapters/lever.adapter.js';
export * from './adapters/ashby.adapter.js';
export * from './adapters/jobright.adapter.js';

import type { ATSAdapter } from './adapter.interface.js';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter.js';
import { LeverAdapter } from './adapters/lever.adapter.js';
import { AshbyAdapter } from './adapters/ashby.adapter.js';
import { JobrightAdapter } from './adapters/jobright.adapter.js';

export function getAdapterForSource(adapterName: string): ATSAdapter | null {
  switch (adapterName.toLowerCase()) {
    case 'greenhouse':
      return new GreenhouseAdapter();
    case 'lever':
      return new LeverAdapter();
    case 'ashby':
      return new AshbyAdapter();
    case 'jobright':
      return new JobrightAdapter();
    default:
      return null;
  }
}
