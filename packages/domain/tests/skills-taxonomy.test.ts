import { describe, it, expect } from 'vitest';
import { SkillsTaxonomy } from '../src/skills-taxonomy.js';

describe('SkillsTaxonomy Engine', () => {
  it('extracts technical skills from raw job descriptions', () => {
    const text = `
      We are looking for a Senior Backend Engineer.
      Requirements:
      - 5+ years of Python or Go experience.
      - Strong experience with Docker and Kubernetes (K8s).
      - Proficient in PostgreSQL and Redis.
      - Experience with AWS (Amazon Web Services) including Lambda, S3, and ECS.
      - Experience writing CI/CD pipelines with GitHub Actions.
    `;

    const skills = SkillsTaxonomy.extractSkills(text);

    expect(skills).toContain('Python');
    expect(skills).toContain('Go');
    expect(skills).toContain('Docker');
    expect(skills).toContain('Kubernetes');
    expect(skills).toContain('PostgreSQL');
    expect(skills).toContain('Redis');
    expect(skills).toContain('AWS');
    expect(skills).toContain('GitHub Actions');
    expect(skills).toContain('CI/CD');
  });

  it('normalizes skill aliases to canonical names', () => {
    const text = 'Stack includes Golang, Postgres, K8s, Amazon Web Services, Ruby on Rails, and TailwindCSS.';
    const skills = SkillsTaxonomy.extractSkills(text);

    expect(skills).toContain('Go');
    expect(skills).not.toContain('Golang');

    expect(skills).toContain('PostgreSQL');
    expect(skills).not.toContain('Postgres');

    expect(skills).toContain('Kubernetes');
    expect(skills).not.toContain('K8s');

    expect(skills).toContain('AWS');
    expect(skills).not.toContain('Amazon Web Services');

    expect(skills).toContain('Rails');
    expect(skills).not.toContain('Ruby on Rails');

    expect(skills).toContain('Tailwind');
    expect(skills).not.toContain('TailwindCSS');
  });

  it('respects word boundaries and avoids substring false positives', () => {
    // "Go" should match in "proficient in Go", but "Good" or "Goaway" should NOT match
    const text = 'A good communicator who wants to develop software and go fast in business.';
    const skills = SkillsTaxonomy.extractSkills(text);

    // "go" in lowercase should match Go, but "good" shouldn't match anything non-existent
    expect(skills).toContain('Go');

    // Should not trigger C if only words like "Cat" or "Can" exist
    const text2 = 'Candidates can call our team regarding the role.';
    const skills2 = SkillsTaxonomy.extractSkills(text2);
    expect(skills2).not.toContain('C');
  });

  it('handles multi-word skills properly', () => {
    const text = 'Experience with React Native, Machine Learning, and Large Language Model fine-tuning.';
    const skills = SkillsTaxonomy.extractSkills(text);

    expect(skills).toContain('React Native');
    expect(skills).toContain('Machine Learning');
    expect(skills).toContain('LLM'); // normalized from Large Language Model
  });

  it('detects role categories accurately from titles', () => {
    expect(SkillsTaxonomy.detectRoleCategory('Senior Full Stack Developer')).toBe('Software Engineer');
    expect(SkillsTaxonomy.detectRoleCategory('Lead Data Engineer, Analytics')).toBe('Data Engineer');
    expect(SkillsTaxonomy.detectRoleCategory('Staff Machine Learning Engineer')).toBe('Data Scientist / AI');
    expect(SkillsTaxonomy.detectRoleCategory('Director of Engineering, Platform')).toBe('Engineering Management');
    expect(SkillsTaxonomy.detectRoleCategory('Technical Product Manager - Core')).toBe('Product Manager');
    expect(SkillsTaxonomy.detectRoleCategory('Lead Product Designer (Design Systems)')).toBe('Designer');
    expect(SkillsTaxonomy.detectRoleCategory('Site Reliability Engineer (SRE)')).toBe('DevOps / SRE');
    expect(SkillsTaxonomy.detectRoleCategory('Senior Security Engineer, AppSec')).toBe('Security');
    expect(SkillsTaxonomy.detectRoleCategory('SDET / QA Automation Engineer')).toBe('QA / Testing');
    expect(SkillsTaxonomy.detectRoleCategory('iOS Engineer')).toBe('Mobile');
    expect(SkillsTaxonomy.detectRoleCategory('Office Manager')).toBeNull();
  });
});
