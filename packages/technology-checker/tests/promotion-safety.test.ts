import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryStateStore, DiscoveryQueueProcessor } from '../src/index.js';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Promotion safety regression tests.
 *
 * The critical invariant: promoteSuccessfulDiscovery() must ONLY find records
 * with discovery_status = 'SUCCESS'. Records in any other status must never
 * be promoted to company_sources.
 */

const mockSupabase = {} as unknown as SupabaseClient;

describe('Promotion Safety', () => {
  let store: InMemoryStateStore;
  let queueProcessor: DiscoveryQueueProcessor;

  beforeEach(() => {
    store = new InMemoryStateStore();
    queueProcessor = new DiscoveryQueueProcessor(store, mockSupabase);
  });

  it('ADAPTER_RESOLVED records are NOT eligible for promotion', async () => {
    await store.insertRecord({
      domain: 'promo-test-1.com',
      company_name: 'Promo Test 1',
      ats_provider: 'workable',
      discovery_status: 'ADAPTER_RESOLVED',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-1',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('CRAWL_QUEUED records are NOT eligible for promotion', async () => {
    await store.insertRecord({
      domain: 'promo-test-2.com',
      company_name: 'Promo Test 2',
      ats_provider: 'workable',
      discovery_status: 'CRAWL_QUEUED',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-2',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('TRIAL_CRAWLING records are NOT eligible for promotion', async () => {
    await store.insertRecord({
      domain: 'promo-test-3.com',
      company_name: 'Promo Test 3',
      ats_provider: 'workable',
      discovery_status: 'TRIAL_CRAWLING',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-3',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('EMPTY records are NOT eligible for promotion', async () => {
    await store.insertRecord({
      domain: 'promo-test-4.com',
      company_name: 'Promo Test 4',
      ats_provider: 'workable',
      discovery_status: 'EMPTY',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-4',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('FAILED records are NOT eligible for promotion', async () => {
    await store.insertRecord({
      domain: 'promo-test-5.com',
      company_name: 'Promo Test 5',
      ats_provider: 'workable',
      discovery_status: 'FAILED',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-5',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('SUCCESS records WITH promotion_status already set are NOT re-promoted', async () => {
    await store.insertRecord({
      domain: 'promo-test-6.com',
      company_name: 'Promo Test 6',
      ats_provider: 'workable',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-6',
      promotion_status: 'promoted',  // Already promoted
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(0);
  });

  it('SUCCESS records with promotion_status=null ARE promoted (dryRun)', async () => {
    await store.insertRecord({
      domain: 'promo-test-7.com',
      company_name: 'Promo Test 7',
      ats_provider: 'workable',
      discovery_status: 'SUCCESS',
      verification_status: 'verified',
      adapter_status: 'ready',
      board_identifier: 'promo-test-7',
      promotion_status: null,
    });

    const metrics = await queueProcessor.promoteSuccessfulDiscovery({ limit: 10, dryRun: true });
    expect(metrics.promoted).toBe(1);
  });
});
