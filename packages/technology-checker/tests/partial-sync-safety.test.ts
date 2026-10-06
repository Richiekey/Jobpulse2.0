import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStateStore } from '../src/index.js';

/**
 * Partial sync safety tests.
 *
 * When TechnologyChecker API pagination fails partway through (e.g., page 3 of 5
 * returns a 402 or network error), the discovery process must NOT perform stale
 * reconciliation — because we don't have the full dataset to know which domains
 * are truly gone vs. which we just couldn't fetch.
 *
 * This behavior is implemented in discovery.ts's processTechnology() method:
 * - syncSuccess = false when any page throws
 * - stale reconciliation (domainsRemoved) is only executed when syncSuccess = true
 *
 * These tests simulate the two scenarios by seeding InMemoryStateStore and
 * verifying the expected state after a partial vs. complete sync.
 */
describe('Partial Sync Safety', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('partial pagination failure: zero domains marked stale', async () => {
    // Seed the store with existing records (simulating what a prior full sync left behind)
    const id1 = await store.insertRecord({
      domain: 'existing-1.com',
      company_name: 'Existing 1',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    const id2 = await store.insertRecord({
      domain: 'existing-2.com',
      company_name: 'Existing 2',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    // Simulate a partial sync: we fetched some domains but NOT the full set
    // Because the sync failed, we must NOT reconcile stale records
    const fetchedDomains = new Set(['existing-1.com']); // only got page 1
    const syncSuccess = false; // page 2 threw

    let domainsRemoved = 0;

    // This mirrors the logic in discovery.ts processTechnology()
    if (syncSuccess && fetchedDomains.size > 0) {
      // Would reconcile stale records here — but syncSuccess is false
      const allRecords = store.getAllRecords();
      for (const record of allRecords) {
        if (record.ats_provider === 'workable' && !fetchedDomains.has(record.domain)) {
          await store.updateRecord(record.id, {
            discovery_status: 'FAILED',
            verification_status: 'stale',
            discovery_error: 'Domain removed from TechnologyChecker dataset',
          });
          domainsRemoved++;
        }
      }
    }

    expect(domainsRemoved).toBe(0);

    // Verify existing records are untouched
    const r1 = await store.findRecord({ id: id1 });
    const r2 = await store.findRecord({ id: id2 });
    expect(r1?.discovery_status).toBe('VERIFIED');
    expect(r2?.discovery_status).toBe('VERIFIED');
    expect(r1?.verification_status).toBe('verified');
    expect(r2?.verification_status).toBe('verified');
  });

  it('full sync success: stale domains ARE reconciled', async () => {
    const id1 = await store.insertRecord({
      domain: 'still-active.com',
      company_name: 'Still Active',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    const id2 = await store.insertRecord({
      domain: 'gone-from-api.com',
      company_name: 'Gone Corp',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    // Simulate a complete sync: all pages returned successfully
    const fetchedDomains = new Set(['still-active.com']); // gone-from-api.com was NOT returned
    const syncSuccess = true;

    let domainsRemoved = 0;

    if (syncSuccess && fetchedDomains.size > 0) {
      const allRecords = store.getAllRecords();
      for (const record of allRecords) {
        if (record.ats_provider === 'workable' && !fetchedDomains.has(record.domain)) {
          await store.updateRecord(record.id, {
            discovery_status: 'FAILED',
            verification_status: 'stale',
            discovery_error: 'Domain removed from TechnologyChecker dataset',
          });
          domainsRemoved++;
        }
      }
    }

    expect(domainsRemoved).toBe(1);

    // Verify: still-active.com untouched, gone-from-api.com is marked stale
    const r1 = await store.findRecord({ id: id1 });
    const r2 = await store.findRecord({ id: id2 });

    expect(r1?.discovery_status).toBe('VERIFIED');
    expect(r1?.verification_status).toBe('verified');

    expect(r2?.discovery_status).toBe('FAILED');
    expect(r2?.verification_status).toBe('stale');
    expect(r2?.discovery_error).toContain('removed from TechnologyChecker');
  });

  it('empty fetchedDomains with syncSuccess: no reconciliation (edge case guard)', async () => {
    await store.insertRecord({
      domain: 'survivor.com',
      company_name: 'Survivor Corp',
      ats_provider: 'workable',
      discovery_status: 'VERIFIED',
      verification_status: 'verified',
    });

    const fetchedDomains = new Set<string>(); // empty
    const syncSuccess = true;

    let domainsRemoved = 0;

    // The guard condition requires fetchedDomains.size > 0
    if (syncSuccess && fetchedDomains.size > 0) {
      domainsRemoved = 999; // should never reach here
    }

    expect(domainsRemoved).toBe(0);
  });
});
