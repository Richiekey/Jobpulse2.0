import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore } from '../src/state-store.js';

describe('Atomic Claiming & Stale Recovery (MC-1)', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  it('claims unassigned candidates atomically for a given worker', async () => {
    const id1 = await store.insertRecord({
      domain: 'company-a.com',
      company_name: 'Company A',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
      priority_score: 80,
    });
    const id2 = await store.insertRecord({
      domain: 'company-b.com',
      company_name: 'Company B',
      ats_provider: 'ashby',
      discovery_status: 'DISCOVERED',
      priority_score: 90,
    });

    const claimed = await store.claimCandidates('DISCOVERED', 'worker-1', 10, 10);

    expect(claimed.length).toBe(2);
    // Highest priority score first
    expect(claimed[0].id).toBe(id2);
    expect(claimed[0].claimed_by).toBe('worker-1');
    expect(claimed[0].claimed_at).toBeDefined();

    expect(claimed[1].id).toBe(id1);
    expect(claimed[1].claimed_by).toBe('worker-1');
  });

  it('prevents a second worker from claiming currently leased candidates', async () => {
    await store.insertRecord({
      domain: 'claimed-company.com',
      company_name: 'Claimed Company',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
      priority_score: 75,
    });

    // Worker 1 claims it
    const claimedByWorker1 = await store.claimCandidates('DISCOVERED', 'worker-1', 10, 10);
    expect(claimedByWorker1.length).toBe(1);

    // Worker 2 attempts to claim while lease is active
    const claimedByWorker2 = await store.claimCandidates('DISCOVERED', 'worker-2', 10, 10);
    expect(claimedByWorker2.length).toBe(0);
  });

  it('allows claiming candidates whose lease has expired', async () => {
    const expiredClaimTime = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 mins ago
    const id = await store.insertRecord({
      domain: 'expired-lease.com',
      company_name: 'Expired Lease Company',
      ats_provider: 'lever',
      discovery_status: 'DISCOVERED',
      claimed_at: expiredClaimTime,
      claimed_by: 'dead-worker',
      priority_score: 60,
    });

    // 10 minute lease threshold: expired claim should be re-claimable by worker-2
    const claimed = await store.claimCandidates('DISCOVERED', 'worker-2', 10, 10);
    expect(claimed.length).toBe(1);
    expect(claimed[0].id).toBe(id);
    expect(claimed[0].claimed_by).toBe('worker-2');
  });

  it('recovers stale claims back to unassigned state', async () => {
    const expiredClaimTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const id = await store.insertRecord({
      domain: 'stale-claim.com',
      company_name: 'Stale Claim Company',
      ats_provider: 'smartrecruiters',
      discovery_status: 'DISCOVERED',
      claimed_at: expiredClaimTime,
      claimed_by: 'crashed-worker',
    });

    const recoveredCount = await store.recoverStaleClaims(10);
    expect(recoveredCount).toBe(1);

    const record = await store.findRecord({ id });
    expect(record?.claimed_at).toBeNull();
    expect(record?.claimed_by).toBeNull();
  });

  it('releases an active claim cleanly upon task completion', async () => {
    const id = await store.insertRecord({
      domain: 'release-test.com',
      company_name: 'Release Test',
      ats_provider: 'greenhouse',
      discovery_status: 'DISCOVERED',
    });

    await store.claimCandidates('DISCOVERED', 'worker-1', 1, 10);
    const released = await store.releaseClaim(id, 'worker-1');
    expect(released).toBe(true);

    const record = await store.findRecord({ id });
    expect(record?.claimed_at).toBeNull();
    expect(record?.claimed_by).toBeNull();
  });
});
