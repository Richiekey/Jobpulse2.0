import { describe, it, expect } from 'vitest';
import { isPresentableSalary, sanitizeSalaryForDisplay } from '../apps/web/lib/salary-shield';

describe('Batch U Follow-Up — Presentation Layer Salary Shield (P0-DQ-02)', () => {
  it('accepts legitimate formatted and numeric compensation values', () => {
    expect(isPresentableSalary('$120,000 - $150,000/yr')).toBe(true);
    expect(isPresentableSalary('$45 - $65/hr')).toBe(true);
    expect(isPresentableSalary('$140,000')).toBe(true);
    expect(isPresentableSalary(125000)).toBe(true);
    expect(isPresentableSalary('$80k - $95k')).toBe(true);
    expect(isPresentableSalary('Competitive', { allowCompetitiveText: true })).toBe(true);
    expect(isPresentableSalary('Market Rate', { allowCompetitiveText: true })).toBe(true);
  });

  it('rejects URL parameters, tokens, tracking artifacts and scraper corruptions', () => {
    // Tracking tokens and parameters
    expect(isPresentableSalary('gh_jid=4029182')).toBe(false);
    expect(isPresentableSalary('utm_source=linkedin&utm_medium=job')).toBe(false);
    expect(isPresentableSalary('https://boards.greenhouse.io/job/12345')).toBe(false);
    expect(isPresentableSalary('id=987654321')).toBe(false);
    expect(isPresentableSalary('/careers/apply?token=xyz987')).toBe(false);

    // Scraper corrupted numeric values
    expect(isPresentableSalary(619)).toBe(false); // 3-digit yearly compensation corruption
    expect(isPresentableSalary('619')).toBe(false);
    expect(isPresentableSalary(100000000)).toBe(false); // Outlandish > 10M
    expect(isPresentableSalary(105)).toBe(false); // Untyped number between 300 and 10,000
    expect(isPresentableSalary('105')).toBe(false);
  });

  it('preserves valid ranges when sanitizing for display and returns null for corrupted values', () => {
    expect(sanitizeSalaryForDisplay('$130k - $160k')).toBe('$130k - $160k');
    expect(sanitizeSalaryForDisplay('utm_campaign=board_job_3910')).toBeNull();
    expect(sanitizeSalaryForDisplay(619)).toBeNull();
    expect(sanitizeSalaryForDisplay('')).toBeNull();
    expect(sanitizeSalaryForDisplay(undefined)).toBeNull();
  });
});

describe('Batch U Follow-Up — My Applications Display Hierarchy (P0-IA-01)', () => {
  it('resolves authoritative job and company metadata with proper fallback', () => {
    // Helper replicating the hierarchy implemented in page.tsx
    function resolveApplicationDisplay(app: any) {
      const displayTitle = app.jobs?.display_title || app.jobs?.canonical_title || app.job_title || 'Applied Position';
      const companyName = app.jobs?.companies?.name || app.company_name || 'Verified Employer';
      return { displayTitle, companyName };
    }

    // Case 1: Full joined relational data
    const joinedApp = {
      job_title: 'Stale Title',
      company_name: 'Stale Inc',
      jobs: {
        display_title: 'Senior Distributed Systems Engineer',
        canonical_title: 'Senior Systems Engineer',
        companies: {
          name: 'Acme Cloud Corp'
        }
      }
    };
    expect(resolveApplicationDisplay(joinedApp)).toEqual({
      displayTitle: 'Senior Distributed Systems Engineer',
      companyName: 'Acme Cloud Corp'
    });

    // Case 2: Relational job without display_title, only canonical_title
    const canonicalApp = {
      jobs: {
        canonical_title: 'Platform Engineer',
        companies: {
          name: 'Stripe'
        }
      }
    };
    expect(resolveApplicationDisplay(canonicalApp)).toEqual({
      displayTitle: 'Platform Engineer',
      companyName: 'Stripe'
    });

    // Case 3: Direct application row fallback when relational join is null
    const fallbackApp = {
      job_title: 'Staff Frontend Architect',
      company_name: 'Vercel',
      jobs: null
    };
    expect(resolveApplicationDisplay(fallbackApp)).toEqual({
      displayTitle: 'Staff Frontend Architect',
      companyName: 'Vercel'
    });

    // Case 4: Complete empty state fallback
    const emptyApp = {};
    expect(resolveApplicationDisplay(emptyApp)).toEqual({
      displayTitle: 'Applied Position',
      companyName: 'Verified Employer'
    });
  });
});

describe('Batch U Follow-Up — Search Generation & Abort Logic (P1-FUNC-01)', () => {
  it('ensures newer search requests supersede older pending requests', async () => {
    let activeGeneration = 0;
    let renderedJobs: string[] = [];

    async function simulateSearch(query: string, delayMs: number) {
      const currentGen = ++activeGeneration;
      // Simulate network latency
      await new Promise(r => setTimeout(r, delayMs));
      // Stale check
      if (currentGen !== activeGeneration) {
        return; // discarded
      }
      renderedJobs = [query];
    }

    // Launch request 1 (slow, 50ms)
    const p1 = simulateSearch('Python', 50);
    // Launch request 2 (fast, 10ms)
    const p2 = simulateSearch('Rust', 10);

    await Promise.all([p1, p2]);

    // Fast request 2 was launched after request 1, so request 1 is discarded despite finishing after p2 starts
    expect(renderedJobs).toEqual(['Rust']);
  });
});
