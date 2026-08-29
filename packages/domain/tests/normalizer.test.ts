import { describe, it, expect } from 'vitest';
import { Normalizer } from '../src/normalizer.js';

describe('Normalizer', () => {
  it('normalizes titles by stripping emojis and trailing metadata tags', () => {
    const res1 = Normalizer.normalizeTitle('🚀 Senior Frontend Engineer (Remote)');
    expect(res1.canonicalTitle).toBe('Senior Frontend Engineer');
    expect(res1.displayTitle).toBe('Senior Frontend Engineer (Remote)');

    const res2 = Normalizer.normalizeTitle('Staff Software Engineer - US #1234');
    expect(res2.canonicalTitle).toBe('Staff Software Engineer');
  });

  it('accurately identifies workplace types', () => {
    expect(Normalizer.normalizeWorkplaceType(null, 'Backend Engineer (Remote)')).toBe('remote');
    expect(Normalizer.normalizeWorkplaceType('Hybrid', 'Frontend Engineer')).toBe('hybrid');
    expect(Normalizer.normalizeWorkplaceType(null, 'DevOps', ['San Francisco, CA (In-Office)'])).toBe('on_site');
    expect(Normalizer.normalizeWorkplaceType(null, 'Engineer', ['London'])).toBe('unspecified');
  });

  it('normalizes employment types', () => {
    expect(Normalizer.normalizeEmploymentType('Full-Time')).toBe('full_time');
    expect(Normalizer.normalizeEmploymentType('Contractor / Freelance')).toBe('contract');
    expect(Normalizer.normalizeEmploymentType('Summer Intern 2026')).toBe('internship');
  });

  it('parses salary ranges accurately', () => {
    const s1 = Normalizer.parseSalary('$140,000 - $180,000 / year');
    expect(s1).toEqual({ min: 140000, max: 180000, currency: 'USD', interval: 'yearly' });

    const s2 = Normalizer.parseSalary('$120k - $150k');
    expect(s2).toEqual({ min: 120000, max: 150000, currency: 'USD', interval: 'yearly' });

    const s3 = Normalizer.parseSalary('£75 - £95 / hour');
    expect(s3).toEqual({ min: 75, max: 95, currency: 'GBP', interval: 'hourly' });
  });

  it('extracts technical skills from job content', () => {
    const skills = Normalizer.extractSkills('Looking for a Senior TypeScript and Next.js developer with PostgreSQL experience.');
    expect(skills).toContain('TypeScript');
    expect(skills).toContain('Next.js');
    expect(skills).toContain('PostgreSQL');
  });
});
