import { describe, it, expect } from 'vitest';
import { JobFunctionTaxonomy } from '../src/job-function-taxonomy.js';

describe('JobFunctionTaxonomy', () => {
  describe('classify — title match', () => {
    const cases: [string, string][] = [
      // Software Engineering sub-functions
      ['Senior Frontend Engineer', 'software-frontend'],
      ['Front-End Developer', 'software-frontend'],
      ['UI Engineer', 'software-frontend'],
      ['Backend Engineer', 'software-backend'],
      ['Back End Developer', 'software-backend'],
      ['Full Stack Engineer', 'software-fullstack'],
      ['Full-Stack Developer', 'software-fullstack'],
      ['Senior Mobile Engineer', 'software-mobile'],
      ['iOS Developer', 'software-mobile'],
      ['Android Engineer', 'software-mobile'],
      ['React Native Developer', 'software-mobile'],
      ['DevOps Engineer', 'software-devops'],
      ['CI/CD Engineer', 'software-devops'],
      ['Infrastructure Engineer', 'software-infrastructure'],
      ['Platform Engineer', 'software-infrastructure'],
      ['Site Reliability Engineer', 'software-sre'],
      ['SRE Lead', 'software-sre'],
      ['Embedded Systems Engineer', 'software-embedded'],
      ['Firmware Engineer', 'software-embedded'],
      ['QA Engineer', 'software-qa'],
      ['SDET', 'software-qa'],
      ['Test Automation Engineer', 'software-qa'],
      ['Software Engineer', 'software-engineering'],
      ['Software Developer', 'software-engineering'],

      // Data / AI / ML
      ['Data Scientist', 'data-science'],
      ['Senior Data Engineer', 'data-engineering'],
      ['Machine Learning Engineer', 'data-ml'],
      ['ML Engineer', 'data-ml'],
      ['AI Engineer', 'data-ai-engineering'],
      ['NLP Engineer', 'data-ai-engineering'],
      ['Data Analyst', 'data-analytics'],
      ['BI Analyst', 'data-analytics'],
      ['Analytics Engineer', 'data-analytics'],
      ['Research Scientist', 'data-research'],

      // Cybersecurity / Cloud
      ['Security Engineer', 'security-engineering'],
      ['SOC Analyst', 'security-engineering'],
      ['Penetration Tester', 'security-engineering'],
      ['Cloud Engineer', 'cloud-engineering'],
      ['Cloud Architect', 'cloud-engineering'],
      ['DevSecOps Engineer', 'devsecops'],

      // Product
      ['Product Manager', 'product'],
      ['Technical Product Manager', 'product'],
      ['Product Owner', 'product'],

      // Design
      ['Product Designer', 'design'],
      ['UX Designer', 'design'],
      ['UX Researcher', 'design'],

      // Business / Operations
      ['Program Manager', 'business-operations'],
      ['Project Manager', 'business-operations'],
      ['Operations Manager', 'business-operations'],

      // Sales / Marketing
      ['Account Executive', 'sales-marketing'],
      ['Marketing Manager', 'sales-marketing'],
      ['Content Marketing Manager', 'sales-marketing'],

      // Finance / Accounting
      ['Financial Analyst', 'finance-accounting'],
      ['Controller', 'finance-accounting'],

      // HR / People
      ['Recruiter', 'hr-people'],
      ['Talent Acquisition Manager', 'hr-people'],
      ['HR Manager', 'hr-people'],

      // Customer Support / Success
      ['Customer Success Manager', 'customer-support'],
      ['Support Engineer', 'customer-support'],

      // Legal
      ['Legal Counsel', 'legal'],
      ['Compliance Officer', 'legal'],

      // Healthcare
      ['Clinical Research Coordinator', 'healthcare'],

      // Education
      ['Curriculum Designer', 'education'],
    ];

    for (const [title, expectedSlug] of cases) {
      it(`classifies "${title}" as ${expectedSlug}`, () => {
        const result = JobFunctionTaxonomy.classify(title);
        expect(result.slug).toBe(expectedSlug);
        expect(result.source).toBe('title_match');
      });
    }
  });

  describe('classify — ATS metadata', () => {
    it('uses department metadata when available', () => {
      const result = JobFunctionTaxonomy.classify('Specialist III', {
        department: 'Engineering',
      });
      expect(result.slug).toBe('software-engineering');
      expect(result.source).toBe('ats_metadata');
      expect(result.confidence).toBe('high');
    });

    it('uses category metadata', () => {
      const result = JobFunctionTaxonomy.classify('Associate', {
        category: 'Marketing',
      });
      expect(result.slug).toBe('sales-marketing');
      expect(result.source).toBe('ats_metadata');
    });
  });

  describe('classify — skill match', () => {
    it('classifies by skill combination when title is ambiguous', () => {
      const result = JobFunctionTaxonomy.classify('Associate', {
        skills: ['React', 'TypeScript', 'Next.js', 'CSS'],
      });
      expect(result.slug).toBe('software-frontend');
      expect(result.source).toBe('skill_match');
    });

    it('classifies data engineering by skills', () => {
      const result = JobFunctionTaxonomy.classify('Specialist', {
        skills: ['Spark', 'Airflow', 'dbt', 'Python'],
      });
      expect(result.slug).toBe('data-engineering');
      expect(result.source).toBe('skill_match');
    });
  });

  describe('classify — fallback', () => {
    it('returns "other" for unclassifiable titles', () => {
      const result = JobFunctionTaxonomy.classify('Associate Manager Level 3');
      expect(result.slug).toBe('other');
      expect(result.confidence).toBe('low');
      expect(result.source).toBe('fallback');
    });
  });

  describe('taxonomy structure', () => {
    it('has 15 top-level categories', () => {
      expect(JobFunctionTaxonomy.getTopLevelCategories().length).toBe(15);
    });

    it('resolves sub-function to top-level parent', () => {
      expect(JobFunctionTaxonomy.resolveTopLevel('software-frontend')).toBe('software-engineering');
      expect(JobFunctionTaxonomy.resolveTopLevel('data-ml')).toBe('data-ai-ml');
      expect(JobFunctionTaxonomy.resolveTopLevel('product')).toBe('product');
    });

    it('validates known slugs', () => {
      expect(JobFunctionTaxonomy.isValidSlug('software-engineering')).toBe(true);
      expect(JobFunctionTaxonomy.isValidSlug('software-frontend')).toBe(true);
      expect(JobFunctionTaxonomy.isValidSlug('invalid-slug')).toBe(false);
    });

    it('returns sub-functions for a parent', () => {
      const subs = JobFunctionTaxonomy.getSubFunctions('software-engineering');
      expect(subs.length).toBeGreaterThanOrEqual(9);
      expect(subs.some((s) => s.slug === 'software-frontend')).toBe(true);
    });
  });
});
