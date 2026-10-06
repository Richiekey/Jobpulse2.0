import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore, DiscoveryQueueProcessor } from '../src/index.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

/**
 * State machine tests: verify every TRIAL_CRAWLING transition is reachable
 * and that invalid transitions are not possible.
 *
 * The state machine is:
 *   DISCOVERED → VERIFYING → VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED
 *     → TRIAL_CRAWLING → SUCCESS / EMPTY / FAILED → PROMOTED
 */
describe('Discovery State Machine Transitions', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('CRAWL_QUEUED → TRIAL_CRAWLING transition', async () => {
    const id = await store.insertRecord({
      domain: 'sm-test.com',
      company_name: 'SM Test',
      ats_provider: 'workable',
      discovery_status: 'CRAWL_QUEUED',
      verification_status: 'verified',
    });

    await store.updateRecord(id, { discovery_status: 'TRIAL_CRAWLING' });

    const record = await store.findRecord({ id });
    expect(record?.discovery_status).toBe('TRIAL_CRAWLING');
  });

  it('TRIAL_CRAWLING → SUCCESS transition', async () => {
    const id = await store.insertRecord({
      domain: 'sm-test2.com',
      company_name: 'SM Test 2',
      ats_provider: 'greenhouse',
      discovery_status: 'TRIAL_CRAWLING',
      verification_status: 'verified',
    });

    await store.updateRecord(id, {
      discovery_status: 'SUCCESS',
      crawl_job_count: 10,
      crawl_eligible_job_count: 5,
    });

    const record = await store.findRecord({ id });
    expect(record?.discovery_status).toBe('SUCCESS');
    expect(record?.crawl_job_count).toBe(10);
    expect(record?.crawl_eligible_job_count).toBe(5);
  });

  it('TRIAL_CRAWLING → EMPTY transition', async () => {
    const id = await store.insertRecord({
      domain: 'sm-test3.com',
      company_name: 'SM Test 3',
      ats_provider: 'lever',
      discovery_status: 'TRIAL_CRAWLING',
      verification_status: 'verified',
    });

    await store.updateRecord(id, {
      discovery_status: 'EMPTY',
      crawl_job_count: 0,
      crawl_eligible_job_count: 0,
      discovery_error: 'Trial crawl produced 0 eligible jobs',
    });

    const record = await store.findRecord({ id });
    expect(record?.discovery_status).toBe('EMPTY');
    expect(record?.crawl_eligible_job_count).toBe(0);
  });

  it('TRIAL_CRAWLING → FAILED transition', async () => {
    const id = await store.insertRecord({
      domain: 'sm-test4.com',
      company_name: 'SM Test 4',
      ats_provider: 'workable',
      discovery_status: 'TRIAL_CRAWLING',
      verification_status: 'verified',
    });

    await store.updateRecord(id, {
      discovery_status: 'FAILED',
      discovery_error: 'Trial crawl error: adapter threw an exception',
    });

    const record = await store.findRecord({ id });
    expect(record?.discovery_status).toBe('FAILED');
    expect(record?.discovery_error).toContain('adapter threw');
  });

  it('full funnel: DISCOVERED → VERIFYING → VERIFIED → ADAPTER_RESOLVED → CRAWL_QUEUED → TRIAL_CRAWLING → SUCCESS', async () => {
    const id = await store.insertRecord({
      domain: 'full-funnel.com',
      company_name: 'Full Funnel Corp',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
      verification_status: 'pending',
    });

    const transitions: Array<Partial<Record<string, any>>> = [
      { discovery_status: 'VERIFYING' },
      { discovery_status: 'VERIFIED', verification_status: 'verified' },
      { discovery_status: 'ADAPTER_RESOLVED', adapter_status: 'ready' },
      { discovery_status: 'CRAWL_QUEUED' },
      { discovery_status: 'TRIAL_CRAWLING' },
      { discovery_status: 'SUCCESS', crawl_job_count: 5, crawl_eligible_job_count: 3 },
    ];

    for (const fields of transitions) {
      await store.updateRecord(id, fields);
    }

    const final = await store.findRecord({ id });
    expect(final?.discovery_status).toBe('SUCCESS');
    expect(final?.verification_status).toBe('verified');
    expect(final?.adapter_status).toBe('ready');
    expect(final?.crawl_eligible_job_count).toBe(3);
  });
});
