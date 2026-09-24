export * from './registry.js';
export * from './adapter.interface.js';
export * from './adapters/oracle.adapter.js';
export * from './adapters/successfactors.adapter.js';
export * from './adapters/icims.adapter.js';
export * from './adapters/smartrecruiters.adapter.js';
export * from './adapters/workday.adapter.js';
export * from './adapters/greenhouse.adapter.js';
export * from './adapters/lever.adapter.js';
export * from './adapters/ashby.adapter.js';
export * from './adapters/jobright.adapter.js';
export * from './adapters/jobright-detail-enriched.adapter.js';
export * from './adapters/workable.adapter.js';
export * from './adapters/bamboohr.adapter.js';
export * from './adapters/rippling.adapter.js';
export * from './adapters/jobvite.adapter.js';
export * from './adapters/recruitee.adapter.js';
export * from './adapters/applytojob.adapter.js';
export * from './adapters/teamtailor.adapter.js';
export * from './adapters/breezy.adapter.js';
export * from './adapters/personio.adapter.js';
export * from './adapters/adp.adapter.js';
export * from './discovery/ats-detector.js';
export * from './discovery/source-validator.js';

import type { ATSAdapter } from './adapter.interface.js';
import { ATSAdapterRegistry } from './registry.js';
import { GreenhouseAdapter } from './adapters/greenhouse.adapter.js';
import { LeverAdapter } from './adapters/lever.adapter.js';
import { AshbyAdapter } from './adapters/ashby.adapter.js';
import { JobrightDetailEnrichedAdapter } from './adapters/jobright-detail-enriched.adapter.js';
import { WorkdayAdapter } from './adapters/workday.adapter.js';
import { SmartRecruitersAdapter } from './adapters/smartrecruiters.adapter.js';
import { iCIMSAdapter } from './adapters/icims.adapter.js';
import { SuccessFactorsAdapter } from './adapters/successfactors.adapter.js';
import { OracleAdapter } from './adapters/oracle.adapter.js';
import { WorkableAdapter } from './adapters/workable.adapter.js';
import { BambooHRAdapter } from './adapters/bamboohr.adapter.js';
import { RipplingAdapter } from './adapters/rippling.adapter.js';
import { JobviteAdapter } from './adapters/jobvite.adapter.js';
import { RecruiteeAdapter } from './adapters/recruitee.adapter.js';
import { ApplyToJobAdapter } from './adapters/applytojob.adapter.js';
import { TeamtailorAdapter } from './adapters/teamtailor.adapter.js';
import { BreezyAdapter } from './adapters/breezy.adapter.js';
import { PersonioAdapter } from './adapters/personio.adapter.js';
import { ADPAdapter } from './adapters/adp.adapter.js';

// Auto-register core ATS adapters into the registry
ATSAdapterRegistry.register('greenhouse', () => new GreenhouseAdapter());
ATSAdapterRegistry.register('lever', () => new LeverAdapter());
ATSAdapterRegistry.register('ashby', () => new AshbyAdapter());
ATSAdapterRegistry.register('jobright', () => new JobrightDetailEnrichedAdapter());
ATSAdapterRegistry.register('workday', () => new WorkdayAdapter());
ATSAdapterRegistry.register('smartrecruiters', () => new SmartRecruitersAdapter());
ATSAdapterRegistry.register('icims', () => new iCIMSAdapter());
ATSAdapterRegistry.register('successfactors', () => new SuccessFactorsAdapter());
ATSAdapterRegistry.register('oracle', () => new OracleAdapter());
ATSAdapterRegistry.register('workable', () => new WorkableAdapter());
ATSAdapterRegistry.register('bamboohr', () => new BambooHRAdapter());
ATSAdapterRegistry.register('rippling', () => new RipplingAdapter());
ATSAdapterRegistry.register('jobvite', () => new JobviteAdapter());
ATSAdapterRegistry.register('recruitee', () => new RecruiteeAdapter());
ATSAdapterRegistry.register('applytojob', () => new ApplyToJobAdapter());
ATSAdapterRegistry.register('teamtailor', () => new TeamtailorAdapter());
ATSAdapterRegistry.register('breezy', () => new BreezyAdapter());
ATSAdapterRegistry.register('personio', () => new PersonioAdapter());
ATSAdapterRegistry.register('adp', () => new ADPAdapter());

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
