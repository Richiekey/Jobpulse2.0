import { describe, it, expect } from 'vitest';
import { JobEligibilityPolicy } from '@jobpulse/domain';

describe('JobEligibilityPolicy Comprehensive Test Matrix', () => {
  const FIXED_NOW = new Date('2026-09-07T12:00:00.000Z');

  // Helper function to build job candidates
  function createCandidate(overrides: Partial<Parameters<typeof JobEligibilityPolicy.evaluate>[0]> = {}) {
    return {
      title: 'Senior Software Engineer',
      canonicalTitle: 'Senior Software Engineer',
      displayTitle: 'Senior Software Engineer',
      description: 'Design and build resilient distributed systems in TypeScript and Go.',
      locations: ['San Francisco, CA'],
      workplaceType: 'remote' as const,
      postedAt: '2026-09-01T00:00:00.000Z', // 6 days old
      ...overrides,
    };
  }

  describe('1. Geography Whitelist & Exclusions', () => {
    it('accepts US locations', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['San Francisco, CA'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res1.eligible).toBe(true);
      expect(res1.geographyCategory).toBe('US');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['New York, NY'], workplaceType: 'hybrid' }), FIXED_NOW);
      expect(res2.eligible).toBe(true);
      expect(res2.geographyCategory).toBe('US');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Austin, Texas, United States'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res3.eligible).toBe(true);
      expect(res3.geographyCategory).toBe('US');
    });

    it('accepts Canada locations', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Toronto, Ontario, Canada'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res1.eligible).toBe(true);
      expect(res1.geographyCategory).toBe('CANADA');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Vancouver, BC'], workplaceType: 'hybrid' }), FIXED_NOW);
      expect(res2.eligible).toBe(true);
      expect(res2.geographyCategory).toBe('CANADA');
    });

    it('accepts Europe locations', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['London, England, United Kingdom'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res1.eligible).toBe(true);
      expect(res1.geographyCategory).toBe('EUROPE');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Berlin, Germany'], workplaceType: 'hybrid' }), FIXED_NOW);
      expect(res2.eligible).toBe(true);
      expect(res2.geographyCategory).toBe('EUROPE');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Dublin, Ireland'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res3.eligible).toBe(true);
      expect(res3.geographyCategory).toBe('EUROPE');
    });

    it('strictly excludes Africa', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Lagos, Nigeria'], workplaceType: 'on_site' }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');
      expect(res1.geographyCategory).toBe('EXCLUDED');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Nairobi, Kenya'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Cairo, Egypt'] }), FIXED_NOW);
      expect(res3.eligible).toBe(false);
      expect(res3.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('strictly excludes Asia', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Bangalore, Karnataka, India'] }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Singapore'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Tokyo, Japan'] }), FIXED_NOW);
      expect(res3.eligible).toBe(false);
      expect(res3.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res4 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Manila, Philippines'] }), FIXED_NOW);
      expect(res4.eligible).toBe(false);
      expect(res4.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('strictly excludes Latin America / LATAM', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['São Paulo, Brazil'] }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Mexico City, Mexico'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Buenos Aires, Argentina'] }), FIXED_NOW);
      expect(res3.eligible).toBe(false);
      expect(res3.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('strictly excludes Middle East', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Dubai, United Arab Emirates'] }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Tel Aviv, Israel'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res3 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Riyadh, Saudi Arabia'] }), FIXED_NOW);
      expect(res3.eligible).toBe(false);
      expect(res3.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('strictly excludes Oceania (Australia / New Zealand)', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Sydney, Australia'] }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Auckland, New Zealand'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');
    });
  });

  describe('2. Remote Classification', () => {
    it('classifies and accepts Remote US', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote - US'] }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.remoteCategory).toBe('REMOTE_US');
      expect(res.priorityScore).toBe(3);
    });

    it('classifies and accepts Remote Canada', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote, Canada'] }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.remoteCategory).toBe('REMOTE_CANADA');
      expect(res.priorityScore).toBe(3);
    });

    it('classifies and accepts Remote Europe', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote - Europe'] }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.remoteCategory).toBe('REMOTE_EUROPE');
      expect(res.priorityScore).toBe(3);
    });

    it('classifies and accepts Worldwide Remote', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Worldwide Remote'] }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.remoteCategory).toBe('REMOTE_WORLDWIDE');
      expect(res.priorityScore).toBe(3);
    });

    it('strictly excludes Remote in Africa (e.g. Remote - Africa, Remote - Nigeria)', () => {
      const res1 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote - Africa'] }), FIXED_NOW);
      expect(res1.eligible).toBe(false);
      expect(res1.reason).toBe('EXCLUDED_GEOGRAPHY');
      expect(res1.remoteCategory).toBe('REMOTE_EXCLUDED_REGION');

      const res2 = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote, Nigeria'] }), FIXED_NOW);
      expect(res2.eligible).toBe(false);
      expect(res2.reason).toBe('EXCLUDED_GEOGRAPHY');
      expect(res2.remoteCategory).toBe('REMOTE_EXCLUDED_REGION');
    });

    it('strictly excludes Remote in India / Asia', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote - India'] }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('EXCLUDED_GEOGRAPHY');
      expect(res.remoteCategory).toBe('REMOTE_EXCLUDED_REGION');
    });

    it('strictly excludes Remote in LATAM', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote - LATAM'] }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('EXCLUDED_GEOGRAPHY');
      expect(res.remoteCategory).toBe('REMOTE_EXCLUDED_REGION');
    });

    it('accepts Unknown Remote when no geographic restriction is present', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({ locations: ['Remote'] }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.remoteCategory).toBe('REMOTE_UNKNOWN');
      expect(res.priorityScore).toBe(3);
    });
  });

  describe('3. Technical Roles Taxonomy', () => {
    it('accepts core software engineering titles', () => {
      const titles = [
        'Software Engineer',
        'Senior Software Developer',
        'Full Stack Engineer',
        'Staff Frontend Engineer',
        'Backend Developer',
        'Lead Mobile Engineer',
        'iOS Developer',
        'Android Engineer',
        'DevOps Engineer',
        'Site Reliability Engineer',
        'Platform Engineer',
        'Infrastructure Engineer',
        'Cloud Engineer',
        'QA Automation Engineer',
        'SDET',
        'Embedded Software Engineer',
        'Firmware Engineer',
      ];
      for (const title of titles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Failed for title: ${title}`).toBe(true);
        expect(['software', 'cybersecurity']).toContain(res.roleCategory);
      }
    });

    it('accepts Data / AI / ML roles', () => {
      const titles = [
        'Data Scientist',
        'Senior Data Analyst',
        'Staff Data Engineer',
        'Analytics Engineer',
        'Machine Learning Engineer',
        'AI Engineer',
        'AI Research Scientist',
        'MLOps Engineer',
        'BI Engineer',
        'Data Architect',
        'Computer Vision Engineer',
        'NLP Engineer',
      ];
      for (const title of titles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Failed for title: ${title}`).toBe(true);
        expect(res.roleCategory).toBe('data_ai');
      }
    });

    it('accepts Cybersecurity & Cloud security roles', () => {
      const titles = [
        'Cybersecurity Engineer',
        'Security Engineer',
        'Information Security Engineer',
        'SOC Analyst',
        'Application Security Engineer',
        'Cloud Security Engineer',
        'DevSecOps Engineer',
        'Penetration Tester',
        'Security Researcher',
        'Threat Intelligence Analyst',
        'Security Architect',
      ];
      for (const title of titles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Failed for title: ${title}`).toBe(true);
        expect(res.roleCategory).toBe('cybersecurity');
      }
    });

    it('accepts Computer Science & IT Systems roles', () => {
      const titles = [
        'Computer Scientist',
        'Systems Analyst',
        'Technical Systems Analyst',
        'Database Administrator',
        'Database Engineer',
        'Network Engineer',
        'Solutions Architect',
        'Technical Architect',
        'Enterprise Architect',
      ];
      for (const title of titles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Failed for title: ${title}`).toBe(true);
        expect(res.roleCategory).toBe('it_systems');
      }
    });

    it('accepts genuine technical cross-disciplinary roles', () => {
      const titles = [
        'Technical Product Manager',
        'Technical Program Manager',
        'Developer Advocate',
        'Developer Relations Lead',
        'Technical Support Engineer',
        'Implementation Engineer',
        'Integration Engineer',
        'API Engineer',
        'Blockchain Engineer',
        'Smart Contract Engineer',
      ];
      for (const title of titles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Failed for title: ${title}`).toBe(true);
      }
    });
  });

  describe('4. Non-Technical Role Exclusions', () => {
    it('strictly excludes clear non-technical categories', () => {
      const nonTechTitles = [
        'Marketing Manager',
        'Content Creator',
        'Recruiter',
        'Senior Talent Acquisition Partner',
        'Sales Manager',
        'Account Executive',
        'Financial Analyst',
        'Accountant',
        'HR Manager',
        'Customer Success Manager',
        'Registered Nurse',
        'Elementary School Teacher',
        'Warehouse Associate',
        'Store Manager',
      ];
      for (const title of nonTechTitles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Did not exclude non-technical title: ${title}`).toBe(false);
        expect(res.reason).toBe('NON_TECHNICAL_ROLE');
      }
    });

    it('strictly excludes pseudo-technical non-engineering titles', () => {
      const pseudoTitles = [
        'Technical Sales Manager',
        'Technical Sales Representative',
        'Technical Recruiter',
        'Technical Talent Partner',
        'Technical Writer',
        'Technical Documentation Specialist',
        'Technical Customer Success Manager',
        'Technical CSM',
        'Technical Trainer',
      ];
      for (const title of pseudoTitles) {
        const res = JobEligibilityPolicy.evaluate(createCandidate({ title, canonicalTitle: title }), FIXED_NOW);
        expect(res.eligible, `Did not exclude pseudo-technical title: ${title}`).toBe(false);
        expect(res.reason).toBe('NON_TECHNICAL_ROLE');
      }
    });
  });

  describe('5. Age Invariant Boundaries', () => {
    it('accepts fresh jobs (10 days old)', () => {
      const postedAt = new Date(FIXED_NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const res = JobEligibilityPolicy.evaluate(createCandidate({ postedAt }), FIXED_NOW);
      expect(res.eligible).toBe(true);
    });

    it('accepts jobs within cutoff (29 days old)', () => {
      const postedAt = new Date(FIXED_NOW.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
      const res = JobEligibilityPolicy.evaluate(createCandidate({ postedAt }), FIXED_NOW);
      expect(res.eligible).toBe(true);
    });

    it('accepts boundary job at exactly 30 days old', () => {
      const postedAt = new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const res = JobEligibilityPolicy.evaluate(createCandidate({ postedAt }), FIXED_NOW);
      expect(res.eligible).toBe(true);
    });

    it('excludes jobs older than 30 days (31 days old)', () => {
      const postedAt = new Date(FIXED_NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const res = JobEligibilityPolicy.evaluate(createCandidate({ postedAt }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('TOO_OLD');
    });

    it('excludes very old stale jobs (360 days old)', () => {
      const postedAt = new Date(FIXED_NOW.getTime() - 360 * 24 * 60 * 60 * 1000).toISOString();
      const res = JobEligibilityPolicy.evaluate(createCandidate({ postedAt }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('TOO_OLD');
    });
  });

  describe('6. Combined Invariant Matrix Scenarios', () => {
    it('Software Engineer + US + Remote → Eligible (High Priority)', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Software Engineer',
        canonicalTitle: 'Software Engineer',
        locations: ['Remote - US'],
        workplaceType: 'remote',
      }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.priorityScore).toBe(3);
      expect(res.geographyCategory).toBe('US');
    });

    it('Data Engineer + Canada + Hybrid → Eligible (Medium Priority)', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Data Engineer',
        canonicalTitle: 'Data Engineer',
        locations: ['Toronto, ON, Canada'],
        workplaceType: 'hybrid',
      }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.priorityScore).toBe(2);
      expect(res.geographyCategory).toBe('CANADA');
    });

    it('Cybersecurity Analyst + Germany + Onsite → Eligible (Standard Priority)', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Cybersecurity Analyst',
        canonicalTitle: 'Cybersecurity Analyst',
        locations: ['Munich, Germany'],
        workplaceType: 'on_site',
      }), FIXED_NOW);
      expect(res.eligible).toBe(true);
      expect(res.priorityScore).toBe(1);
      expect(res.geographyCategory).toBe('EUROPE');
    });

    it('Software Engineer + Nigeria + Remote → Excluded', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Software Engineer',
        canonicalTitle: 'Software Engineer',
        locations: ['Remote, Nigeria'],
        workplaceType: 'remote',
      }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('Software Engineer + India + Remote → Excluded', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Software Engineer',
        canonicalTitle: 'Software Engineer',
        locations: ['Remote - India'],
        workplaceType: 'remote',
      }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('EXCLUDED_GEOGRAPHY');
    });

    it('Marketing Manager + US + Remote → Excluded', () => {
      const res = JobEligibilityPolicy.evaluate(createCandidate({
        title: 'Marketing Manager',
        canonicalTitle: 'Marketing Manager',
        locations: ['Remote - US'],
        workplaceType: 'remote',
      }), FIXED_NOW);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('NON_TECHNICAL_ROLE');
    });
  });
});
