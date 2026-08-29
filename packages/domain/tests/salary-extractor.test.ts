import { describe, it, expect } from 'vitest';
import { SalaryExtractor } from '../src/salary-extractor';

describe('SalaryExtractor — Normalization, Extraction & Equity (Batch H)', () => {
  describe('Structured Salary Normalization', () => {
    it('normalizes yearly salary ranges correctly', () => {
      const result = SalaryExtractor.normalize(120000, 160000, 'USD', 'yearly', 'Competitive base + equity');
      expect(result.salaryMin).toBe(120000);
      expect(result.salaryMax).toBe(160000);
      expect(result.annualizedMin).toBe(120000);
      expect(result.annualizedMax).toBe(160000);
      expect(result.currency).toBe('USD');
      expect(result.hasSalary).toBe(true);
      expect(result.equityMentioned).toBe(true);
    });

    it('annualizes hourly rates to standard yearly equivalents (x2080 hours)', () => {
      const result = SalaryExtractor.normalize(75, 95, 'USD', 'hourly', 'No equity');
      expect(result.salaryMin).toBe(75);
      expect(result.salaryMax).toBe(95);
      expect(result.interval).toBe('hourly');
      expect(result.annualizedMin).toBe(156000); // 75 * 2080
      expect(result.annualizedMax).toBe(197600); // 95 * 2080
      expect(result.hasSalary).toBe(true);
      expect(result.equityMentioned).toBe(false);
    });

    it('annualizes monthly rates to standard yearly equivalents (x12 months)', () => {
      const result = SalaryExtractor.normalize(8000, 10000, 'EUR', 'monthly');
      expect(result.salaryMin).toBe(8000);
      expect(result.salaryMax).toBe(10000);
      expect(result.interval).toBe('monthly');
      expect(result.annualizedMin).toBe(96000);
      expect(result.annualizedMax).toBe(120000);
      expect(result.currency).toBe('EUR');
    });

    it('swaps inverted min and max values safely', () => {
      const result = SalaryExtractor.normalize(180000, 140000, 'USD', 'yearly');
      expect(result.salaryMin).toBe(140000);
      expect(result.salaryMax).toBe(180000);
    });
  });

  describe('Unstructured Text Extraction', () => {
    it('extracts standard formatted salary range "$140,000 - $180,000 / year"', () => {
      const text = 'We offer an attractive compensation package of $140,000 - $180,000 / year plus RSUs and 401(k).';
      const result = SalaryExtractor.extractFromText(text);

      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(140000);
      expect(result.salaryMax).toBe(180000);
      expect(result.annualizedMin).toBe(140000);
      expect(result.annualizedMax).toBe(180000);
      expect(result.currency).toBe('USD');
      expect(result.interval).toBe('yearly');
      expect(result.equityMentioned).toBe(true);
    });

    it('extracts abbreviated "k" salary ranges "£85k - £115k per year"', () => {
      const text = 'Salary: £85k - £115k per year with stock options.';
      const result = SalaryExtractor.extractFromText(text);

      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(85000);
      expect(result.salaryMax).toBe(115000);
      expect(result.currency).toBe('GBP');
      expect(result.equityMentioned).toBe(true);
    });

    it('extracts hourly rates "$65 - $85 / hr"', () => {
      const text = 'Compensation: $65 - $85 / hr based on experience.';
      const result = SalaryExtractor.extractFromText(text);

      expect(result.hasSalary).toBe(true);
      expect(result.salaryMin).toBe(65);
      expect(result.salaryMax).toBe(85);
      expect(result.interval).toBe('hourly');
      expect(result.annualizedMin).toBe(135200);
      expect(result.annualizedMax).toBe(176800);
    });

    it('detects equity keywords (RSU, stock options, token grant)', () => {
      expect(SalaryExtractor.hasEquityMention('Generous equity package and token grant')).toBe(true);
      expect(SalaryExtractor.hasEquityMention('Includes 50,000 stock options')).toBe(true);
      expect(SalaryExtractor.hasEquityMention('Standard salary with no variable compensation')).toBe(false);
    });

    it('returns empty salary object when no salary is mentioned', () => {
      const text = 'We are looking for a Senior Developer with 5 years experience in React and Node.js.';
      const result = SalaryExtractor.extractFromText(text);

      expect(result.hasSalary).toBe(false);
      expect(result.salaryMin).toBeNull();
      expect(result.salaryMax).toBeNull();
      expect(result.annualizedMin).toBeNull();
      expect(result.equityMentioned).toBe(false);
    });
  });
});
