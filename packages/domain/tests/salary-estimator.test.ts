import { describe, it, expect } from 'vitest';
import { SalaryEstimator } from '../src/salary-estimator.js';

describe('SalaryEstimator Engine', () => {
  it('returns null for missing or empty title', () => {
    expect(SalaryEstimator.estimateJobSalary(null)).toBeNull();
    expect(SalaryEstimator.estimateJobSalary('')).toBeNull();
    expect(SalaryEstimator.estimateJobSalary('   ')).toBeNull();
  });

  it('estimates mid-level software engineer base salary in US', () => {
    const res = SalaryEstimator.estimateJobSalary('Software Engineer', 'United States');
    expect(res).not.toBeNull();
    expect(res!.currency).toBe('$');
    expect(res!.period).toBe('yearly');
    expect(res!.min).toBe(120_000);
    expect(res!.max).toBe(170_000);
    expect(res!.formatted).toBe('~$120k - $170k/yr (est.)');
  });

  it('estimates senior engineer with Tier 1 US hub premium (SF/NYC)', () => {
    const res = SalaryEstimator.estimateJobSalary('Senior Backend Engineer', 'San Francisco, CA');
    expect(res).not.toBeNull();
    expect(res!.currency).toBe('$');
    // base 120k-170k * 1.28 * 1.18 = ~181k - 256k -> rounded to nearest 5k
    expect(res!.min).toBeGreaterThan(170_000);
    expect(res!.max).toBeGreaterThan(240_000);
    expect(res!.confidence).toBe('High');
  });

  it('estimates AI / ML specialist salary premium', () => {
    const res = SalaryEstimator.estimateJobSalary('Machine Learning Engineer');
    expect(res).not.toBeNull();
    expect(res!.min).toBeGreaterThanOrEqual(145_000);
    expect(res!.max).toBeGreaterThanOrEqual(210_000);
  });

  it('estimates hourly compensation for intern roles', () => {
    const res = SalaryEstimator.estimateJobSalary('Software Engineer Intern');
    expect(res).not.toBeNull();
    expect(res!.period).toBe('hourly');
    expect(res!.min).toBe(40);
    expect(res!.max).toBe(65);
    expect(res!.currency).toBe('$');
    expect(res!.formatted).toBe('~$40 - $65/hr (est.)');
  });

  it('localizes currency and salary for United Kingdom roles', () => {
    const res = SalaryEstimator.estimateJobSalary('Full Stack Developer', 'London, United Kingdom');
    expect(res).not.toBeNull();
    expect(res!.currency).toBe('£');
    expect(res!.formatted).toContain('£');
    // Base 120k * 0.65 = 78k -> rounded to 80k
    expect(res!.min).toBeLessThan(100_000);
  });

  it('localizes currency and salary for European roles', () => {
    const res = SalaryEstimator.estimateJobSalary('Frontend Developer', 'Berlin, Germany');
    expect(res).not.toBeNull();
    expect(res!.currency).toBe('€');
    expect(res!.formatted).toContain('€');
  });

  it('localizes currency and salary for Canadian roles', () => {
    const res = SalaryEstimator.estimateJobSalary('DevOps Engineer', 'Toronto, Canada');
    expect(res).not.toBeNull();
    expect(res!.currency).toBe('CAD $');
    expect(res!.formatted).toContain('CAD $');
  });
});
