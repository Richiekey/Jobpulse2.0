import { describe, it, expect } from 'vitest';
import { ATSDetector } from '@jobpulse/ats';
import { normalizeDomain } from '../../src/normalization.js';
import { deduplicateCandidates } from '../../src/deduplication.js';
import { DiscoveryCandidate } from '../../src/types.js';

interface BenchmarkCompany {
  name: string;
  domain: string;
  board_url?: string;
  expected_ats: string | null;
  category: 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'workable' | 'no_ats' | 'dead_page';
}

const BENCHMARK_CATALOG: BenchmarkCompany[] = [
  // Greenhouse (6)
  { name: 'Stripe', domain: 'stripe.com', board_url: 'https://boards.greenhouse.io/stripe', expected_ats: 'greenhouse', category: 'greenhouse' },
  { name: 'Figma', domain: 'figma.com', board_url: 'https://boards.greenhouse.io/figma', expected_ats: 'greenhouse', category: 'greenhouse' },
  { name: 'Airbnb', domain: 'airbnb.com', board_url: 'https://boards.greenhouse.io/airbnb', expected_ats: 'greenhouse', category: 'greenhouse' },
  { name: 'DoorDash', domain: 'doordash.com', board_url: 'https://boards.greenhouse.io/doordash', expected_ats: 'greenhouse', category: 'greenhouse' },
  { name: 'Instacart', domain: 'instacart.com', board_url: 'https://boards.greenhouse.io/instacart', expected_ats: 'greenhouse', category: 'greenhouse' },
  { name: 'Reddit', domain: 'reddit.com', board_url: 'https://boards.greenhouse.io/reddit', expected_ats: 'greenhouse', category: 'greenhouse' },

  // Lever (5)
  { name: 'Netflix', domain: 'netflix.com', board_url: 'https://jobs.lever.co/netflix', expected_ats: 'lever', category: 'lever' },
  { name: 'Atlassian', domain: 'atlassian.com', board_url: 'https://jobs.lever.co/atlassian', expected_ats: 'lever', category: 'lever' },
  { name: 'Spotify', domain: 'spotify.com', board_url: 'https://jobs.lever.co/spotify', expected_ats: 'lever', category: 'lever' },
  { name: 'Twitch', domain: 'twitch.tv', board_url: 'https://jobs.lever.co/twitch', expected_ats: 'lever', category: 'lever' },
  { name: 'Palantir', domain: 'palantir.com', board_url: 'https://jobs.lever.co/palantir', expected_ats: 'lever', category: 'lever' },

  // Ashby (5)
  { name: 'Linear', domain: 'linear.app', board_url: 'https://jobs.ashbyhq.com/linear', expected_ats: 'ashby', category: 'ashby' },
  { name: 'Ramp', domain: 'ramp.com', board_url: 'https://jobs.ashbyhq.com/ramp', expected_ats: 'ashby', category: 'ashby' },
  { name: 'OpenAI', domain: 'openai.com', board_url: 'https://jobs.ashbyhq.com/openai', expected_ats: 'ashby', category: 'ashby' },
  { name: 'Vercel', domain: 'vercel.com', board_url: 'https://jobs.ashbyhq.com/vercel', expected_ats: 'ashby', category: 'ashby' },
  { name: 'Retool', domain: 'retool.com', board_url: 'https://jobs.ashbyhq.com/retool', expected_ats: 'ashby', category: 'ashby' },

  // Workday (5)
  { name: 'Microsoft', domain: 'microsoft.com', board_url: 'https://microsoft.myworkdayjobs.com/en-US/External', expected_ats: 'workday', category: 'workday' },
  { name: 'Amazon', domain: 'amazon.com', board_url: 'https://amazon.myworkdayjobs.com/External', expected_ats: 'workday', category: 'workday' },
  { name: 'Adobe', domain: 'adobe.com', board_url: 'https://adobe.myworkdayjobs.com/external_experienced', expected_ats: 'workday', category: 'workday' },
  { name: 'Salesforce', domain: 'salesforce.com', board_url: 'https://salesforce.myworkdayjobs.com/External_Career_Site', expected_ats: 'workday', category: 'workday' },
  { name: 'Target', domain: 'target.com', board_url: 'https://target.myworkdayjobs.com/targetcareers', expected_ats: 'workday', category: 'workday' },

  // SmartRecruiters (4)
  { name: 'Visa', domain: 'visa.com', board_url: 'https://jobs.smartrecruiters.com/Visa', expected_ats: 'smartrecruiters', category: 'smartrecruiters' },
  { name: 'IKEA', domain: 'ikea.com', board_url: 'https://jobs.smartrecruiters.com/IKEA', expected_ats: 'smartrecruiters', category: 'smartrecruiters' },
  { name: 'Bosch', domain: 'bosch.com', board_url: 'https://jobs.smartrecruiters.com/BoschGroup', expected_ats: 'smartrecruiters', category: 'smartrecruiters' },
  { name: 'Ubisoft', domain: 'ubisoft.com', board_url: 'https://jobs.smartrecruiters.com/Ubisoft2', expected_ats: 'smartrecruiters', category: 'smartrecruiters' },

  // Workable (4)
  { name: 'Beeswax', domain: 'beeswax.com', board_url: 'https://apply.workable.com/beeswax', expected_ats: 'workable', category: 'workable' },
  { name: 'TransferGo', domain: 'transfergo.com', board_url: 'https://apply.workable.com/transfergo', expected_ats: 'workable', category: 'workable' },
  { name: 'Synthesia', domain: 'synthesia.io', board_url: 'https://apply.workable.com/synthesia', expected_ats: 'workable', category: 'workable' },
  { name: 'Mindvalley', domain: 'mindvalley.com', board_url: 'https://apply.workable.com/mindvalley', expected_ats: 'workable', category: 'workable' },

  // No-ATS / Bespoke (5)
  { name: 'Apple', domain: 'apple.com', board_url: 'https://jobs.apple.com/en-us/search', expected_ats: null, category: 'no_ats' },
  { name: 'Basecamp', domain: 'basecamp.com', board_url: 'https://basecamp.com/about/jobs', expected_ats: null, category: 'no_ats' },
  { name: 'Craigslist', domain: 'craigslist.org', board_url: 'https://www.craigslist.org/about/craigslist_is_hiring', expected_ats: null, category: 'no_ats' },
  { name: 'Signal', domain: 'signal.org', board_url: 'https://signal.org/work-at-signal', expected_ats: null, category: 'no_ats' },
  { name: 'DuckDuckGo', domain: 'duckduckgo.com', board_url: 'https://duckduckgo.com/hiring', expected_ats: null, category: 'no_ats' },

  // Dead / Non-existent boards (3)
  { name: 'Ghost Co A', domain: 'ghostcoa.invalid', board_url: 'https://ghostcoa.invalid/careers', expected_ats: null, category: 'dead_page' },
  { name: 'Ghost Co B', domain: 'ghostcob.invalid', board_url: 'https://ghostcob.invalid/jobs', expected_ats: null, category: 'dead_page' },
  { name: 'Ghost Co C', domain: 'ghostcoc.invalid', board_url: 'https://ghostcoc.invalid/positions', expected_ats: null, category: 'dead_page' },
];

describe('Discovery Engine V1 — 40-Company Benchmark Suite', () => {
  it('executes baseline benchmark and records accuracy metrics', () => {
    let testedCount = 0;
    let correctlyDetectedAts = 0;
    let normalizedDomains = 0;

    for (const company of BENCHMARK_CATALOG) {
      testedCount++;

      // 1. Verify domain normalization
      const normDomain = normalizeDomain(company.domain);
      if (normDomain) normalizedDomains++;

      // 2. Verify ATS detection if board_url present
      if (company.board_url) {
        const detection = ATSDetector.detect(company.board_url);
        if (company.expected_ats) {
          if (detection.detected && detection.atsType === company.expected_ats) {
            correctlyDetectedAts++;
          }
        } else {
          // Expected no ATS detected
          if (!detection.detected) {
            correctlyDetectedAts++;
          }
        }
      }
    }

    const atsExpectedCount = BENCHMARK_CATALOG.filter((c) => c.board_url).length;
    const atsAccuracy = correctlyDetectedAts / atsExpectedCount;
    const domainNormRate = normalizedDomains / testedCount;

    // 3. Verify deduplication across raw candidates
    const rawCandidates: DiscoveryCandidate[] = BENCHMARK_CATALOG.map((c) => ({
      company_name: c.name,
      company_domain: c.domain,
      careers_url: c.board_url,
      detected_ats: c.expected_ats,
      job_evidence: [],
      discovered_from: 'benchmark',
      discovered_at: new Date().toISOString(),
      evidence: [],
      confidence: 0.8,
    }));

    // Inject 5 duplicates
    rawCandidates.push(
      { ...rawCandidates[0]!, company_name: 'Stripe Duplicate' },
      { ...rawCandidates[1]!, company_name: 'Figma Inc' },
      { ...rawCandidates[6]!, company_name: 'Netflix US' },
      { ...rawCandidates[11]!, company_name: 'Linear App' },
      { ...rawCandidates[16]!, company_name: 'Microsoft Corp' }
    );

    const deduped = deduplicateCandidates(rawCandidates);
    const dedupRate = (rawCandidates.length - deduped.length) / rawCandidates.length;

    console.log('\n=== Discovery Engine V1 Benchmark Report ===');
    console.log(`Total Companies Evaluated:   ${testedCount}`);
    console.log(`Domain Normalization Rate:   ${(domainNormRate * 100).toFixed(1)}%`);
    console.log(`ATS Detection Accuracy:      ${(atsAccuracy * 100).toFixed(1)}% (${correctlyDetectedAts}/${atsExpectedCount})`);
    console.log(`Deduplication Success Rate:  ${(dedupRate * 100).toFixed(1)}% (5 duplicates merged)`);
    console.log('============================================\n');

    expect(domainNormRate).toBeGreaterThanOrEqual(0.95);
    expect(atsAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(deduped.length).toBe(BENCHMARK_CATALOG.length);
  });
});
