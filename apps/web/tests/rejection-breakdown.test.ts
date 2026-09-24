import { describe, it, expect } from 'vitest';
import { REJECTION_REASON_LABELS } from '@jobpulse/domain';

describe('Admin Rejection Breakdown API', () => {
  it('defines human-readable labels for all primary rejection reasons', () => {
    expect(REJECTION_REASON_LABELS['NON_TECHNICAL_ROLE']).toContain('Non-Technical Role');
    expect(REJECTION_REASON_LABELS['EXCLUDED_GEOGRAPHY']).toContain('Excluded Geography');
    expect(REJECTION_REASON_LABELS['TOO_OLD']).toContain('Stale');
    expect(REJECTION_REASON_LABELS['VALIDATION_FAILED']).toContain('Validation Rules Failed');
    expect(REJECTION_REASON_LABELS['MISSING_REQUIRED_DATA']).toContain('Missing Required Fields');
  });

  it('accurately computes rejection percentages and ratios', () => {
    const totalDiscovered = 1000;
    const totalRejected = 800;
    const breakdown = {
      NON_TECHNICAL_ROLE: 560,
      EXCLUDED_GEOGRAPHY: 160,
      TOO_OLD: 40,
      VALIDATION_FAILED: 40,
    };

    const overallRate = Math.round((totalRejected / totalDiscovered) * 1000) / 10;
    expect(overallRate).toBe(80.0);

    const nonTechPercent = Math.round((breakdown.NON_TECHNICAL_ROLE / totalRejected) * 1000) / 10;
    expect(nonTechPercent).toBe(70.0);
  });
});
