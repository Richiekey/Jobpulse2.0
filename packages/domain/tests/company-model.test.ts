import { describe, it, expect } from 'vitest';
import { CompanyNormalizer } from '../src/entities/company.js';

describe('Company Model & Normalization (Batch A — S02)', () => {
  it('strips legal entity suffixes and non-alphanumeric characters deterministically', () => {
    expect(CompanyNormalizer.normalizeName('Stripe, Inc.')).toBe('stripe');
    expect(CompanyNormalizer.normalizeName('OpenAI LLC')).toBe('openai');
    expect(CompanyNormalizer.normalizeName('Google Technologies Corp.')).toBe('google');
    expect(CompanyNormalizer.normalizeName('Amazon.com Ltd.')).toBe('amazoncom');
    expect(CompanyNormalizer.normalizeName('Datadog Co.')).toBe('datadog');
  });

  it('generates URL-friendly, deterministic company slugs', () => {
    expect(CompanyNormalizer.generateSlug('Stripe, Inc.')).toBe('stripe-inc');
    expect(CompanyNormalizer.generateSlug('Vercel & Next.js')).toBe('vercel-next-js');
    expect(CompanyNormalizer.generateSlug('  Scale AI  ')).toBe('scale-ai');
  });

  it('extracts clean root domains from arbitrary URLs and strings', () => {
    expect(CompanyNormalizer.extractRootDomain('https://www.stripe.com/careers')).toBe('stripe.com');
    expect(CompanyNormalizer.extractRootDomain('http://openai.com/jobs?source=direct')).toBe('openai.com');
    expect(CompanyNormalizer.extractRootDomain('subdomain.example.co.uk/path')).toBe('subdomain.example.co.uk');
    expect(CompanyNormalizer.extractRootDomain(null)).toBeNull();
    expect(CompanyNormalizer.extractRootDomain('')).toBeNull();
  });
});
