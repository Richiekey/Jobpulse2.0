import { describe, it, expect } from 'vitest';
import { CompanyNormalizer } from '../src/entities/company.js';

describe('Company Slug Migration Collision & Determinism (Finding A & Finding 2)', () => {
  it('resolves duplicate company names deterministically with numeric suffixes matching SQL logic', () => {
    const rawCompanyNames = [
      'OpenAI',
      'Open AI',
      'OpenAI, Inc.',
      'OpenAI Technologies',
      'Example',
      'Example Tech',
      'Example Technology Group',
      '---', // Empty/punctuation-only fallback
    ];

    const assignedSlugs = new Set<string>();
    const slugMap: Record<string, string> = {};

    for (const name of rawCompanyNames) {
      const uniqueSlug = CompanyNormalizer.generateUniqueSlug(name, assignedSlugs);
      assignedSlugs.add(uniqueSlug);
      slugMap[name] = uniqueSlug;
    }

    // Assert determinism
    expect(slugMap['OpenAI']).toBe('openai');
    expect(slugMap['Open AI']).toBe('open-ai');
    expect(slugMap['OpenAI, Inc.']).toBe('openai-inc');
    expect(slugMap['OpenAI Technologies']).toBe('openai-technologies');
    expect(slugMap['Example']).toBe('example');
    expect(slugMap['Example Tech']).toBe('example-tech');
    expect(slugMap['---']).toBe('company');

    // Test exact collision on identical base slug
    const duplicateNames = ['Acme Corp', 'Acme Corp', 'Acme Corp'];
    const dupSlugs = new Set<string>();
    const resultDups: string[] = [];

    for (const d of duplicateNames) {
      const slug = CompanyNormalizer.generateUniqueSlug(d, dupSlugs);
      dupSlugs.add(slug);
      resultDups.push(slug);
    }

    expect(resultDups).toEqual(['acme-corp', 'acme-corp-2', 'acme-corp-3']);
  });

  it('preserves existing assigned slugs without overwriting', () => {
    const existingDatabaseSlugs = new Set(['stripe', 'netflix', 'google', 'custom-slug-123']);

    // Attempting to generate a slug for a company named 'Stripe' when 'stripe' is already taken
    const newStripeSlug = CompanyNormalizer.generateUniqueSlug('Stripe', existingDatabaseSlugs);
    expect(newStripeSlug).toBe('stripe-2');

    // Attempting to generate a slug for an unassigned company
    const vercelSlug = CompanyNormalizer.generateUniqueSlug('Vercel', existingDatabaseSlugs);
    expect(vercelSlug).toBe('vercel');
  });
});
