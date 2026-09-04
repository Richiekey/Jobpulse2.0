import { describe, it, expect } from 'vitest';
import {
  formatApplicationSheetRow,
  calculateSyncRetryDelaySeconds,
  DEFAULT_JOBPULSE_SHEET_HEADERS,
  isSyncEventStatus,
} from '../src/index.js';

describe('Batch O — Domain Application Sync Unit Tests', () => {
  it('formats an application sync payload into the canonical 10-column Google Sheet row', () => {
    const payload = {
      applicationId: 'app-12345678-uuid',
      jobTitle: 'Senior Full Stack Engineer',
      companyName: 'Acme Robotics',
      location: 'San Francisco, CA (Hybrid)',
      status: 'interview',
      appliedAt: '2026-09-01T12:00:00Z',
      verificationStatus: 'verified',
      directApplyUrl: 'https://acme.com/careers/senior-eng',
      notes: 'Initial screening completed with HR on Tuesday.',
      updatedAt: '2026-09-02T15:30:00Z',
    };

    const row = formatApplicationSheetRow(payload);

    expect(row).toHaveLength(10);
    expect(row).toHaveLength(DEFAULT_JOBPULSE_SHEET_HEADERS.length);

    expect(row[0]).toBe('app-12345678-uuid');
    expect(row[1]).toBe('Senior Full Stack Engineer');
    expect(row[2]).toBe('Acme Robotics');
    expect(row[3]).toBe('San Francisco, CA (Hybrid)');
    expect(row[4]).toBe('interview');
    expect(row[5]).toBe('2026-09-01T12:00:00Z');
    expect(row[6]).toBe('verified');
    expect(row[7]).toBe('https://acme.com/careers/senior-eng');
    expect(row[8]).toBe('Initial screening completed with HR on Tuesday.');
    expect(row[9]).toBe('2026-09-02T15:30:00Z');
  });

  it('provides safe fallbacks for missing optional payload fields', () => {
    const sparsePayload = {
      applicationId: 'app-sparse-001',
      jobTitle: '',
      companyName: '',
      status: 'applied',
      appliedAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    const row = formatApplicationSheetRow(sparsePayload);

    expect(row[0]).toBe('app-sparse-001');
    expect(row[1]).toBe('Untitled Role');
    expect(row[2]).toBe('Unknown Company');
    expect(row[3]).toBe('N/A');
    expect(row[4]).toBe('applied');
    expect(row[6]).toBe('pending');
    expect(row[7]).toBe('');
    expect(row[8]).toBe('');
  });

  it('calculates bounded exponential retry delay with jitter', () => {
    const delay1 = calculateSyncRetryDelaySeconds(1);
    const delay2 = calculateSyncRetryDelaySeconds(2);
    const delay3 = calculateSyncRetryDelaySeconds(3);
    const delay10 = calculateSyncRetryDelaySeconds(10);

    // Attempt 1: base is 10s with jitter (~8 - 12s)
    expect(delay1).toBeGreaterThanOrEqual(5);
    expect(delay1).toBeLessThanOrEqual(20);

    // Attempt 2: base is 20s with jitter (~17 - 24s)
    expect(delay2).toBeGreaterThanOrEqual(12);

    // Delay grows with attempts
    expect(delay3).toBeGreaterThan(delay1);

    // Maximum delay capped at 300s (with jitter ~250 - 350s)
    expect(delay10).toBeLessThanOrEqual(400);
    expect(delay10).toBeGreaterThanOrEqual(200);
  });

  it('validates sync event statuses via type guard', () => {
    expect(isSyncEventStatus('pending')).toBe(true);
    expect(isSyncEventStatus('processing')).toBe(true);
    expect(isSyncEventStatus('synced')).toBe(true);
    expect(isSyncEventStatus('failed')).toBe(true);
    expect(isSyncEventStatus('dead_letter')).toBe(true);

    expect(isSyncEventStatus('unknown_status')).toBe(false);
    expect(isSyncEventStatus(null)).toBe(false);
    expect(isSyncEventStatus(123)).toBe(false);
  });
});
