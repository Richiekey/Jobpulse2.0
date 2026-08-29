import { describe, it, expect } from 'vitest';
import { SourceScheduler, SourceHealthEngine, type CompanySourceConfig } from '../src/index.js';

describe('SourceScheduler & Schedule-Aware Eligibility (S09 Production Logic)', () => {
  const BASE_TIME = new Date('2026-08-29T12:00:00Z');

  function makeMockSource(overrides: Partial<CompanySourceConfig>): CompanySourceConfig {
    return {
      id: overrides.id || `cs_${Math.random().toString(36).substring(7)}`,
      companyId: overrides.companyId || 'comp_1',
      sourceId: overrides.sourceId || 'src_1',
      sourceIdentifier: overrides.sourceIdentifier || 'test_source',
      sourceUrl: overrides.sourceUrl || null,
      adapterConfig: overrides.adapterConfig || {},
      isActive: overrides.isActive ?? true,
      healthStatus: overrides.healthStatus || 'healthy',
      priority: overrides.priority ?? 100,
      scheduleIntervalMinutes: overrides.scheduleIntervalMinutes ?? 360,
      consecutiveFailures: overrides.consecutiveFailures ?? 0,
      lastCheckedAt: overrides.lastCheckedAt ?? null,
      lastSuccessAt: overrides.lastSuccessAt ?? null,
      lastFailureAt: overrides.lastFailureAt ?? null,
      lastError: overrides.lastError ?? null,
      lastJobCount: overrides.lastJobCount ?? 0,
      discoveryMethod: overrides.discoveryMethod || 'manual',
      createdAt: overrides.createdAt || '2026-08-01T00:00:00Z',
      updatedAt: overrides.updatedAt || '2026-08-01T00:00:00Z',
    };
  }

  it('evaluates never-checked source (last_checked_at = NULL) as DUE', () => {
    const source = makeMockSource({ lastCheckedAt: null });
    expect(SourceScheduler.isSourceDue(source, BASE_TIME)).toBe(true);
  });

  it('evaluates recently-checked source (5 hours ago, 360m interval) as NOT DUE', () => {
    const fiveHoursAgo = new Date(BASE_TIME.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const source = makeMockSource({
      lastCheckedAt: fiveHoursAgo,
      scheduleIntervalMinutes: 360,
    });
    expect(SourceScheduler.isSourceDue(source, BASE_TIME)).toBe(false);
  });

  it('evaluates overdue source (7 hours ago, 360m interval) as DUE', () => {
    const sevenHoursAgo = new Date(BASE_TIME.getTime() - 7 * 60 * 60 * 1000).toISOString();
    const source = makeMockSource({
      lastCheckedAt: sevenHoursAgo,
      scheduleIntervalMinutes: 360,
    });
    expect(SourceScheduler.isSourceDue(source, BASE_TIME)).toBe(true);
  });

  it('evaluates exact boundary (exactly 6 hours ago, 360m interval) as DUE', () => {
    const exactlySixHoursAgo = new Date(BASE_TIME.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const source = makeMockSource({
      lastCheckedAt: exactlySixHoursAgo,
      scheduleIntervalMinutes: 360,
    });
    expect(SourceScheduler.isSourceDue(source, BASE_TIME)).toBe(true);
  });

  it('orders by priority when multiple sources are due', () => {
    const sourceA = makeMockSource({
      id: 'source_a',
      priority: 10,
      lastCheckedAt: null,
    });
    const sourceB = makeMockSource({
      id: 'source_b',
      priority: 20,
      lastCheckedAt: null,
    });

    const ordered = SourceScheduler.filterAndOrderEligibleSources([sourceB, sourceA], {
      currentTime: BASE_TIME,
    });

    expect(ordered.map((s) => s.id)).toEqual(['source_a', 'source_b']);
  });

  it('ensures priority never overrides schedule eligibility (not-due high-priority source is excluded)', () => {
    const fiveHoursAgo = new Date(BASE_TIME.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const sourceA = makeMockSource({
      id: 'source_a',
      priority: 1, // High priority
      lastCheckedAt: fiveHoursAgo, // NOT DUE (5h < 6h)
      scheduleIntervalMinutes: 360,
    });
    const sourceB = makeMockSource({
      id: 'source_b',
      priority: 50, // Lower priority
      lastCheckedAt: null, // DUE
      scheduleIntervalMinutes: 360,
    });

    const eligible = SourceScheduler.filterAndOrderEligibleSources([sourceA, sourceB], {
      currentTime: BASE_TIME,
    });

    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe('source_b');
  });

  it('applies limitSources strictly after due filtering and priority ordering', () => {
    const sources: CompanySourceConfig[] = [];
    for (let i = 1; i <= 20; i++) {
      sources.push(
        makeMockSource({
          id: `source_${i.toString().padStart(2, '0')}`,
          priority: i, // 1 to 20
          lastCheckedAt: null, // All due
        })
      );
    }

    const limited = SourceScheduler.filterAndOrderEligibleSources(sources, {
      currentTime: BASE_TIME,
      limitSources: 5,
    });

    expect(limited).toHaveLength(5);
    expect(limited.map((s) => s.id)).toEqual([
      'source_01',
      'source_02',
      'source_03',
      'source_04',
      'source_05',
    ]);
  });
});

describe('SourceHealthEngine & State Machine (S10 Production Logic)', () => {
  it('calculates health state transitions across 0, 1, 2, 3, 4, 5, 10 consecutive failures using production logic', () => {
    // 0 failures -> healthy (active)
    expect(SourceHealthEngine.calculateNextHealth(0)).toEqual({
      healthStatus: 'healthy',
      isActive: true,
    });

    // 1-2 failures -> degraded (active)
    expect(SourceHealthEngine.calculateNextHealth(1)).toEqual({
      healthStatus: 'degraded',
      isActive: true,
    });
    expect(SourceHealthEngine.calculateNextHealth(2)).toEqual({
      healthStatus: 'degraded',
      isActive: true,
    });

    // 3-4 failures -> failing (active)
    expect(SourceHealthEngine.calculateNextHealth(3)).toEqual({
      healthStatus: 'failing',
      isActive: true,
    });
    expect(SourceHealthEngine.calculateNextHealth(4)).toEqual({
      healthStatus: 'failing',
      isActive: true,
    });

    // 5+ failures -> disabled (inactive)
    expect(SourceHealthEngine.calculateNextHealth(5)).toEqual({
      healthStatus: 'disabled',
      isActive: false,
    });
    expect(SourceHealthEngine.calculateNextHealth(10)).toEqual({
      healthStatus: 'disabled',
      isActive: false,
    });
  });

  it('computes failure database update and increments consecutive failures', () => {
    const errorMsg = 'HTTP 503 Service Unavailable';
    const now = new Date('2026-08-29T12:00:00Z');

    const update = SourceHealthEngine.getFailureUpdate(2, errorMsg, now);
    expect(update).toEqual({
      healthStatus: 'failing', // 2 + 1 = 3 -> failing
      consecutiveFailures: 3,
      isActive: true,
      lastCheckedAt: now.toISOString(),
      lastFailureAt: now.toISOString(),
      lastError: errorMsg,
    });
  });

  it('computes recovery database update when a previously failing source succeeds', () => {
    const now = new Date('2026-08-29T12:00:00Z');
    const update = SourceHealthEngine.getSuccessUpdate(42, now);

    expect(update).toEqual({
      healthStatus: 'healthy',
      consecutiveFailures: 0,
      isActive: true,
      lastCheckedAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      lastJobCount: 42,
      lastError: null,
    });
  });
});
