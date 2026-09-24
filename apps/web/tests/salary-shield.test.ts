import { describe, it, expect } from 'vitest';
import { isPresentableSalary, sanitizeSalaryForDisplay } from '../lib/salary-shield';

describe('Salary Shield (Task 0.1 Verification)', () => {
  it('allows plausible yearly salaries with or without currency', () => {
    expect(
      isPresentableSalary({ min: 186000, max: 233000, currency: 'USD', interval: 'yearly' })
    ).toBe(true);
    expect(
      isPresentableSalary({ min: 100000, max: 100000, currency: null, interval: 'yearly' })
    ).toBe(true);
    expect(isPresentableSalary('$150k - $215k/yr')).toBe(true);
  });

  it('rejects corrupted hourly rates (< 10/hr without currency, or < 5/hr with currency)', () => {
    // Corrupted object inputs
    expect(
      isPresentableSalary({ min: 6, max: 23, currency: null, interval: 'hourly' })
    ).toBe(false);
    expect(
      isPresentableSalary({ min: 3, max: 3, currency: 'USD', interval: 'hourly' })
    ).toBe(false);

    // Corrupted string inputs
    expect(isPresentableSalary('6 - 23/hr')).toBe(false);
    expect(isPresentableSalary('3/hr')).toBe(false);
    expect(isPresentableSalary('$3/hr')).toBe(false);
  });

  it('allows legitimate hourly rates', () => {
    expect(
      isPresentableSalary({ min: 45, max: 75, currency: 'USD', interval: 'hourly' })
    ).toBe(true);
    expect(isPresentableSalary('$45 - $75/hr')).toBe(true);
  });

  it('sanitizes salary for display by falling back when corrupted', () => {
    expect(
      sanitizeSalaryForDisplay('6 - 23/hr', { min: 6, max: 23, currency: null, interval: 'hourly' }, null)
    ).toBeNull();

    expect(
      sanitizeSalaryForDisplay('$186k - $233k/yr', { min: 186000, max: 233000, currency: 'USD', interval: 'yearly' }, null)
    ).toBe('$186k - $233k/yr');
  });
});
