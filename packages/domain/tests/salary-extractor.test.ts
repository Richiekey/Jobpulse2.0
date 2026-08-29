import { describe, it, expect } from 'vitest';
import { SalaryExtractor, formatSalary } from '../src/salary-extractor';

describe('SalaryExtractor & Formatter (Batch H Remediation)', () => {
  describe('Annualization for all 5 intervals', () => {
    it('annualizes hourly rates correctly (formula: amount * 2080 hrs full-time equivalent)', () => {
      const result = SalaryExtractor.normalize(65, 85, 'USD', 'hourly', 'Standard health benefits');
      expect(result.salaryMin).toBe(65);
      expect(result.salaryMax).toBe(85);
      expect(result.interval).toBe('hourly');
      expect(result.annualizedMin).toBe(135200); // 65 * 2080
      expect(result.annualizedMax).toBe(176800); // 85 * 2080
      expect(result.hasSalary).toBe(true);
      expect(result.equityMentioned).toBe(false);
    });

    it('annualizes daily rates correctly (formula: amount * 260 workdays full-time equivalent)', () => {
      const result = SalaryExtractor.normalize(500, 750, 'GBP', 'daily', 'Contract position');
      expect(result.salaryMin).toBe(500);
      expect(result.salaryMax).toBe(750);
      expect(result.interval).toBe('daily');
      expect(result.annualizedMin).toBe(130000); // 500 * 260
      expect(result.annualizedMax).toBe(195000); // 750 * 260
      expect(result.currency).toBe('GBP');
    });

    it('annualizes weekly rates correctly (formula: amount * 52 weeks full-time equivalent)', () => {
      const result = SalaryExtractor.normalize(2500, 3500, 'USD', 'weekly', 'Weekly stipend');
      expect(result.salaryMin).toBe(2500);
      expect(result.salaryMax).toBe(3500);
      expect(result.interval).toBe('weekly');
      expect(result.annualizedMin).toBe(130000); // 2500 * 52
      expect(result.annualizedMax).toBe(182000); // 3500 * 52
    });

    it('annualizes monthly rates correctly (formula: amount * 12 months)', () => {
      const result = SalaryExtractor.normalize(10000, 15000, 'EUR', 'monthly', 'Monthly compensation');
      expect(result.salaryMin).toBe(10000);
      expect(result.salaryMax).toBe(15000);
      expect(result.interval).toBe('monthly');
      expect(result.annualizedMin).toBe(120000); // 10000 * 12
      expect(result.annualizedMax).toBe(180000); // 15000 * 12
      expect(result.currency).toBe('EUR');
    });

    it('annualizes yearly rates correctly (formula: amount * 1)', () => {
      const result = SalaryExtractor.normalize(140000, 190000, 'USD', 'yearly', 'Competitive base salary');
      expect(result.salaryMin).toBe(140000);
      expect(result.salaryMax).toBe(190000);
      expect(result.interval).toBe('yearly');
      expect(result.annualizedMin).toBe(140000);
      expect(result.annualizedMax).toBe(190000);
    });

    it('swaps inverted min and max values safely', () => {
      const result = SalaryExtractor.normalize(200000, 150000, 'USD', 'yearly', '');
      expect(result.salaryMin).toBe(150000);
      expect(result.salaryMax).toBe(200000);
      expect(result.annualizedMin).toBe(150000);
      expect(result.annualizedMax).toBe(200000);
    });
  });

  describe('Currency Integrity & Absence Semantics', () => {
    it('preserves null currency when currency is omitted (never assuming USD)', () => {
      const result = SalaryExtractor.normalize(100000, 150000, null, 'yearly', '');
      expect(result.currency).toBeNull();
      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(100000);
      expect(result.salaryMax).toBe(150000);
    });

    it('extracts un-denominated numbers without silently tagging USD', () => {
      const result = SalaryExtractor.extractFromText('Salary: 120,000 - 150,000 per year');
      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(120000);
      expect(result.salaryMax).toBe(150000);
      expect(result.currency).toBeNull();
    });
  });

  describe('Unstructured Text Extraction', () => {
    it('extracts standard formatted salary range "$140,000 - $180,000 / year"', () => {
      const result = SalaryExtractor.extractFromText(
        'Base Salary: $140,000 - $180,000 / year. We offer competitive health and dental.'
      );
      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(140000);
      expect(result.salaryMax).toBe(180000);
      expect(result.currency).toBe('USD');
      expect(result.interval).toBe('yearly');
      expect(result.annualizedMin).toBe(140000);
      expect(result.annualizedMax).toBe(180000);
    });

    it('extracts abbreviated "k" salary ranges "£85k - £115k per year"', () => {
      const result = SalaryExtractor.extractFromText(
        'Salary: £85k - £115k per year with stock options.'
      );
      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(85000);
      expect(result.salaryMax).toBe(115000);
      expect(result.currency).toBe('GBP');
      expect(result.interval).toBe('yearly');
      expect(result.equityMentioned).toBe(true);
    });

    it('extracts hourly rates "$65 - $85 / hr"', () => {
      const result = SalaryExtractor.extractFromText(
        'Rate: $65 - $85 / hr based on experience.'
      );
      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(65);
      expect(result.salaryMax).toBe(85);
      expect(result.interval).toBe('hourly');
      expect(result.annualizedMin).toBe(135200);
      expect(result.annualizedMax).toBe(176800);
    });

    it('detects equity keywords and ignores explicit negations', () => {
      const withEquity = SalaryExtractor.extractFromText('Offers $150k/yr plus RSUs and stock options.');
      expect(withEquity.equityMentioned).toBe(true);

      const noEquity = SalaryExtractor.extractFromText('Offers $150k/yr, no equity or token grant provided.');
      expect(noEquity.equityMentioned).toBe(false);
    });

    it('returns empty salary object when no salary is mentioned', () => {
      const result = SalaryExtractor.extractFromText(
        'We are looking for a Senior React Engineer in New York City. Apply now!'
      );
      expect(result.hasSalary).toBe(false);
      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.annualizedMin).toBeNull();
      expect(result.annualizedMax).toBeNull();
      expect(result.equityMentioned).toBe(false);
    });
  });

  describe('Salary Formatting Helper (Interval-Driven, No Heuristics)', () => {
    it('formats hourly rates properly ($50/hr)', () => {
      expect(formatSalary({ min: 50, max: 75, currency: 'USD', interval: 'hourly' })).toBe('$50 - $75/hr');
      expect(formatSalary({ min: 65, max: 65, currency: 'USD', interval: 'hourly' })).toBe('$65/hr');
    });

    it('formats daily rates properly (£1,000/day)', () => {
      expect(formatSalary({ min: 800, max: 1000, currency: 'GBP', interval: 'daily' })).toBe('£800 - £1,000/day');
      expect(formatSalary({ max: 1000, currency: 'GBP', interval: 'daily' })).toBe('Up to £1,000/day');
    });

    it('formats weekly rates properly ($2,500/wk)', () => {
      expect(formatSalary({ min: 2500, max: 3000, currency: 'USD', interval: 'weekly' })).toBe('$2,500 - $3,000/wk');
      expect(formatSalary({ min: 2500, currency: 'USD', interval: 'weekly' })).toBe('From $2,500/wk');
    });

    it('formats monthly rates properly (€4,500/mo)', () => {
      expect(formatSalary({ min: 4500, max: 6000, currency: 'EUR', interval: 'monthly' })).toBe('€4,500 - €6,000/mo');
    });

    it('formats yearly rates with clean k abbreviations ($120k - $150k/yr)', () => {
      expect(formatSalary({ min: 120000, max: 150000, currency: 'USD', interval: 'yearly' })).toBe('$120k - $150k/yr');
      expect(formatSalary({ min: 145000, currency: 'USD', interval: 'yearly' })).toBe('From $145k/yr');
    });

    it('formats numbers without currency symbol when currency is null/missing (no default to $)', () => {
      expect(formatSalary({ min: 120000, max: 150000, currency: null, interval: 'yearly' })).toBe('120k - 150k/yr');
      expect(formatSalary({ min: 50, max: 75, currency: null, interval: 'hourly' })).toBe('50 - 75/hr');
    });

    it('returns null when no salary bounds exist', () => {
      expect(formatSalary({ min: null, max: null })).toBeNull();
      expect(formatSalary({})).toBeNull();
    });
  });
});
