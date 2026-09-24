import { describe, it, expect } from 'vitest';
import { scoreJob, extractResumeKeywords } from '../src/score-job.js';
import { balanceJobDiversity } from '../src/balance-diversity.js';
import type { RawJob } from '../src/types.js';

describe('JobPulse Curation Scoring Engine', () => {
  it('extracts technical skills and roles from text', () => {
    const text = 'Senior Full Stack Engineer with 5+ years of React, TypeScript, Python, and AWS experience.';
    const { skills, roles } = extractResumeKeywords(text);

    expect(skills).toContain('react');
    expect(skills).toContain('typescript');
    expect(skills).toContain('python');
    expect(skills).toContain('aws');
    expect(roles).toContain('full stack');
  });

  it('scores high-alignment jobs with high scores (80-100)', () => {
    const freshDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const job: RawJob = {
      id: 'job-1',
      title: 'Senior Software Engineer, Full Stack',
      company_name: 'Vercel',
      description: 'Looking for a Senior Software Engineer with strong React, TypeScript, Node.js, and AWS experience.',
      posted_at: freshDate,
      source: 'GREENHOUSE',
    };

    const criteria = {
      targetRoles: ['Software Engineer', 'Full Stack'],
      skills: ['React', 'TypeScript', 'Node.js', 'AWS'],
      excludedKeywords: ['intern', 'contractor'],
    };

    const scored = scoreJob(job, criteria);

    expect(scored.matchScore).toBeGreaterThanOrEqual(80);
    expect(scored.scoreBreakdown.titleScore).toBe(40);
    expect(scored.scoreBreakdown.skillsScore).toBeGreaterThanOrEqual(25);
    expect(scored.scoreBreakdown.freshnessScore).toBe(20);
    expect(scored.scoreBreakdown.penalty).toBe(0);
    expect(scored.matchingSkills).toContain('react');
    expect(scored.matchingSkills).toContain('typescript');
  });

  it('penalizes excluded keywords heavily', () => {
    const freshDate = new Date().toISOString();
    const job: RawJob = {
      id: 'job-2',
      title: 'Software Engineer Intern',
      company_name: 'Acme',
      description: 'Summer internship for React and Python development.',
      posted_at: freshDate,
      source: 'LEVER',
    };

    const criteria = {
      targetRoles: ['Software Engineer'],
      skills: ['React', 'Python'],
      excludedKeywords: ['intern', 'internship'],
    };

    const scored = scoreJob(job, criteria);

    // Matches 'intern' in title and description, and 'internship' in description -> penalty applied
    expect(scored.scoreBreakdown.penalty).toBeGreaterThanOrEqual(45);
    expect(scored.matchScore).toBeLessThan(50);
  });

  it('normalizes V2 Supabase schema shapes (companies object and canonical_title)', () => {
    const job: RawJob = {
      id: 'job-3',
      canonical_title: 'Backend Platform Engineer',
      companies: { name: 'Stripe' },
      description: 'Golang, Kubernetes, and PostgreSQL platform engineering.',
      source_metadata: { ats: 'ashby' },
      ats_platform_slug: 'ashby',
      posted_at: new Date().toISOString(),
    };

    const scored = scoreJob(job, {
      targetRoles: ['Backend', 'Engineer'],
      skills: ['go', 'kubernetes', 'postgresql'],
    });

    expect(scored.company_name).toBe('Stripe');
    expect(scored.title).toBe('Backend Platform Engineer');
    expect(scored.source).toBe('ASHBY');
    expect(scored.matchScore).toBeGreaterThan(60);
  });
});

describe('JobPulse Diversity & Anti-Monopoly Balancing', () => {
  it('deduplicates identical company + title postings across locations', () => {
    const rawJobs: RawJob[] = [
      { id: '1', title: 'Software Engineer', company_name: 'Google', location: 'New York, NY', source: 'GREENHOUSE' },
      { id: '2', title: 'Software Engineer', company_name: 'Google', location: 'Mountain View, CA', source: 'GREENHOUSE' },
      { id: '3', title: 'Product Manager', company_name: 'Google', location: 'Austin, TX', source: 'GREENHOUSE' },
    ];

    const scored = rawJobs.map((j) => scoreJob(j));
    const result = balanceJobDiversity(scored, { maxJobsPerCompany: 3 });

    // Only one "Google - Software Engineer" should be kept
    expect(result.selectedJobs.length).toBe(2);
    const titles = result.selectedJobs.map((j) => j.title);
    expect(titles.filter((t) => t === 'Software Engineer').length).toBe(1);
    expect(titles).toContain('Product Manager');
  });

  it('enforces company cap to prevent single company feed monopoly', () => {
    const rawJobs: RawJob[] = [];
    // 10 jobs from BigCorp
    for (let i = 1; i <= 10; i++) {
      rawJobs.push({
        id: `bc-${i}`,
        title: `Engineer Role ${i}`,
        company_name: 'BigCorp',
        source: 'WORKDAY',
      });
    }
    // 5 jobs from OtherCorp
    for (let i = 1; i <= 5; i++) {
      rawJobs.push({
        id: `oc-${i}`,
        title: `Engineer Role ${i}`,
        company_name: 'OtherCorp',
        source: 'LEVER',
      });
    }

    const scored = rawJobs.map((j) => scoreJob(j));
    const result = balanceJobDiversity(scored, { maxJobsPerCompany: 3, targetTotalJobs: 6 });

    // In a target of 6 jobs with max 3 per company, BigCorp gets max 3
    const bigCorpCount = result.selectedJobs.filter((j) => j.company_name === 'BigCorp').length;
    expect(bigCorpCount).toBeLessThanOrEqual(3);
    expect(result.selectedJobs.length).toBe(6);
  });

  it('interleaves results by company so consecutive items alternate companies', () => {
    const rawJobs: RawJob[] = [
      { id: '1', title: 'Frontend Engineer 1', company_name: 'Alpha', source: 'GREENHOUSE' },
      { id: '2', title: 'Frontend Engineer 2', company_name: 'Alpha', source: 'GREENHOUSE' },
      { id: '3', title: 'Frontend Engineer 3', company_name: 'Alpha', source: 'GREENHOUSE' },
      { id: '4', title: 'Backend Engineer 1', company_name: 'Beta', source: 'ASHBY' },
      { id: '5', title: 'Backend Engineer 2', company_name: 'Beta', source: 'ASHBY' },
      { id: '6', title: 'Backend Engineer 3', company_name: 'Beta', source: 'ASHBY' },
    ];

    const scored = rawJobs.map((j) => scoreJob(j));
    const result = balanceJobDiversity(scored, { maxJobsPerCompany: 3 });

    expect(result.selectedJobs.length).toBe(6);
    // Company names should alternate: Alpha, Beta, Alpha, Beta, etc.
    const companySeq = result.selectedJobs.map((j) => j.company_name);
    for (let i = 0; i < companySeq.length - 1; i++) {
      expect(companySeq[i]).not.toBe(companySeq[i + 1]);
    }
  });

  it('computes complete DiversitySummary metrics', () => {
    const rawJobs: RawJob[] = [
      { id: '1', title: 'Frontend Dev', company_name: 'Alpha', source: 'GREENHOUSE', role_category: 'frontend' },
      { id: '2', title: 'Backend Dev', company_name: 'Beta', source: 'ASHBY', role_category: 'backend' },
      { id: '3', title: 'Data Scientist', company_name: 'Gamma', source: 'LEVER', role_category: 'data_ai' },
    ];

    const scored = rawJobs.map((j) => scoreJob(j));
    const result = balanceJobDiversity(scored);

    expect(result.summary.totalSelected).toBe(3);
    expect(result.summary.uniqueCompanies).toBe(3);
    expect(result.summary.atsBreakdown['GREENHOUSE']).toBe(1);
    expect(result.summary.atsBreakdown['ASHBY']).toBe(1);
    expect(result.summary.atsBreakdown['LEVER']).toBe(1);
    expect(result.summary.averageScore).toBeGreaterThan(0);
  });
});
