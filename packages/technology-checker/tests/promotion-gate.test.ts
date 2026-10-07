import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore } from '../src/state-store.js';
import { DiscoveryQueueProcessor } from '../src/queue-processor.js';
import { DomainCircuitBreaker } from '@jobpulse/discovery-engine';

describe('Promotion Gate (canPromote)', () => {
  let store: InMemoryStateStore;
  let circuitBreaker: DomainCircuitBreaker;
  let processor: DiscoveryQueueProcessor;

  beforeEach(() => {
    store = new InMemoryStateStore();
    circuitBreaker = new DomainCircuitBreaker({ failureThreshold: 2, resetAfterMs: 60000 });
    processor = new DiscoveryQueueProcessor(store, undefined, { circuitBreaker });
  });

  const baseValidRecord = {
    id: 'test-1',
    domain: 'valid-target.com',
    company_name: 'Valid Target',
    ats_provider: 'greenhouse',
    discovery_status: 'SUCCESS',
    verification_status: 'verified',
    adapter_status: 'ready',
    board_identifier: 'valid-target',
    crawl_job_count: 10,
    crawl_eligible_job_count: 5,
    crawl_rejected_job_count: 5,
    promotion_status: null,
    company_source_id: null,
    first_discovered_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    priority_score: 80,
  };

  it('approves promotion when all gate conditions are satisfied', () => {
    const result = processor.canPromote(baseValidRecord as any);
    expect(result.eligible).toBe(true);
  });

  it('rejects promotion if status is not SUCCESS', () => {
    const record = { ...baseValidRecord, discovery_status: 'CRAWL_QUEUED' };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('must be SUCCESS');
  });

  it('rejects promotion if already promoted or linked to company_source_id', () => {
    const record1 = { ...baseValidRecord, promotion_status: 'promoted' };
    expect(processor.canPromote(record1 as any).eligible).toBe(false);

    const record2 = { ...baseValidRecord, company_source_id: 'some-uuid' };
    expect(processor.canPromote(record2 as any).eligible).toBe(false);
  });

  it('rejects promotion if verification_status is not verified or probable', () => {
    const record = { ...baseValidRecord, verification_status: 'unresolved' };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('verification');
  });

  it('approves promotion if verification_status is probable', () => {
    const record = { ...baseValidRecord, verification_status: 'probable' };
    expect(processor.canPromote(record as any).eligible).toBe(true);
  });

  it('rejects promotion if adapter_status is not ready', () => {
    const record = { ...baseValidRecord, adapter_status: 'unavailable' };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason?.toLowerCase()).toContain('adapter');
  });

  it('rejects promotion if board_identifier is missing or empty', () => {
    const record = { ...baseValidRecord, board_identifier: '' };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('board_identifier');
  });

  it('rejects promotion if trial crawl produced 0 jobs', () => {
    const record = { ...baseValidRecord, crawl_job_count: 0 };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('0 jobs');
  });

  it('rejects promotion if trial crawl produced 0 eligible jobs', () => {
    const record = { ...baseValidRecord, crawl_eligible_job_count: 0 };
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('0 eligible jobs');
  });

  it('rejects promotion if crawl_job_count is missing', () => {
    const record = { ...baseValidRecord };
    delete (record as any).crawl_job_count;
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Missing crawl_job_count');
  });

  it('rejects promotion if crawl_eligible_job_count is missing', () => {
    const record = { ...baseValidRecord };
    delete (record as any).crawl_eligible_job_count;
    const result = processor.canPromote(record as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Missing crawl_eligible_job_count');
  });

  it('rejects promotion if circuit breaker is open for the domain', () => {
    circuitBreaker.recordFailure('valid-target.com');
    circuitBreaker.recordFailure('valid-target.com');
    expect(circuitBreaker.isOpen('valid-target.com')).toBe(true);

    const result = processor.canPromote(baseValidRecord as any);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Circuit breaker is currently open');
  });
});
