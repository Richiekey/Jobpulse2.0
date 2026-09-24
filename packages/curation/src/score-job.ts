/**
 * JobPulse Curation Scoring Engine
 *
 * Scores candidate jobs (0 - 100) against an target persona/resume criteria:
 * 1. Title Alignment (up to 40 pts)
 * 2. Skills Overlap (up to 40 pts)
 * 3. Freshness (up to 20 pts)
 * 4. Excluded Keyword Penalties (-45 pts per match)
 */

import type { CurationCriteria, RawJob, ScoredJob } from './types.js';

const KNOWN_SKILLS = [
  'react', 'next.js', 'vue', 'angular', 'typescript', 'javascript', 'python',
  'golang', 'go', 'rust', 'java', 'c++', 'c#', '.net', 'sql', 'postgresql',
  'mysql', 'mongodb', 'redis', 'kafka', 'graphql', 'docker', 'kubernetes',
  'aws', 'gcp', 'azure', 'ci/cd', 'terraform', 'django', 'fastapi', 'node.js',
  'express', 'flask', 'pytorch', 'tensorflow', 'spark', 'hadoop', 'airflow',
  'tailwind', 'html', 'css', 'git', 'linux', 'rest', 'api', 'microservices'
];

const KNOWN_ROLES = [
  'full stack', 'frontend', 'backend', 'software engineer', 'devops',
  'cloud engineer', 'data engineer', 'data scientist', 'machine learning',
  'ai engineer', 'security engineer', 'mobile developer', 'ios', 'android',
  'product manager', 'engineering manager', 'architect', 'qa engineer'
];

/**
 * Extract technical skills and roles from unstructured resume or prompt text.
 */
export function extractResumeKeywords(text: string): { skills: string[]; roles: string[] } {
  if (!text) return { skills: [], roles: [] };

  const lower = text.toLowerCase();

  const matchedSkills = KNOWN_SKILLS.filter((s) => {
    if (s.length <= 2) {
      const reg = new RegExp(`\\b${s}\\b`, 'i');
      return reg.test(text);
    }
    return lower.includes(s);
  });

  const matchedRoles = KNOWN_ROLES.filter((r) => lower.includes(r));

  return { skills: matchedSkills, roles: matchedRoles };
}

/**
 * Normalizes job title from diverse schema representations.
 */
export function resolveJobTitle(job: RawJob): string {
  return (job.title || job.canonical_title || job.display_title || '').trim();
}

/**
 * Normalizes company name from diverse schema representations.
 */
export function resolveCompanyName(job: RawJob): string {
  if (job.company_name) return job.company_name.trim();
  if (job.companies) {
    if (Array.isArray(job.companies)) {
      return (job.companies[0]?.name || 'Unknown').trim();
    }
    return (job.companies.name || 'Unknown').trim();
  }
  return 'Unknown';
}

/**
 * Normalizes source ATS platform from diverse schema representations.
 */
export function resolveJobSource(job: RawJob): string {
  return (job.source || job.ats_platform_slug || 'OTHER').toUpperCase();
}

/**
 * Compute compatibility score between a job and target curation criteria.
 */
export function scoreJob(job: RawJob, criteria: CurationCriteria = {}): ScoredJob {
  let titleScore = 0;
  let skillsScore = 0;
  let freshnessScore = 0;
  let penalty = 0;

  const rawTitle = resolveJobTitle(job);
  const jobTitle = rawTitle.toLowerCase();
  const rawDesc = job.description || job.requirements || '';
  const skillsArray = Array.isArray(job.skills) ? job.skills : [];
  const jobDesc = `${jobTitle} ${rawDesc} ${skillsArray.join(' ')}`.toLowerCase();

  const targetRoles = criteria.targetRoles && criteria.targetRoles.length > 0
    ? criteria.targetRoles.map((r) => r.toLowerCase().trim()).filter(Boolean)
    : ['software engineer', 'developer', 'engineer', 'full stack', 'backend', 'frontend'];

  const targetSkills = criteria.skills && criteria.skills.length > 0
    ? criteria.skills.map((s) => s.toLowerCase().trim()).filter(Boolean)
    : ['react', 'typescript', 'python', 'javascript', 'sql', 'node.js', 'docker', 'aws'];

  const excluded = (criteria.excludedKeywords || []).map((e) => e.toLowerCase().trim()).filter(Boolean);

  // 1. Title Alignment (Up to 40 pts)
  for (const role of targetRoles) {
    if (jobTitle.includes(role)) {
      titleScore = 40;
      break;
    }
    const roleWords = role.split(/\s+/).filter(Boolean);
    const matchCount = roleWords.filter((w) => jobTitle.includes(w)).length;
    if (matchCount > 0 && roleWords.length > 0) {
      titleScore = Math.max(titleScore, (matchCount / roleWords.length) * 30);
    }
  }
  if (titleScore === 0 && (jobTitle.includes('engineer') || jobTitle.includes('developer') || jobTitle.includes('architect'))) {
    titleScore = 20;
  }

  // 2. Skills Overlap (Up to 40 pts)
  const matchedSkillsList: string[] = [];
  targetSkills.forEach((skill) => {
    if (skill.length <= 2) {
      const reg = new RegExp(`\\b${skill}\\b`, 'i');
      if (reg.test(jobDesc)) matchedSkillsList.push(skill);
    } else if (jobDesc.includes(skill)) {
      matchedSkillsList.push(skill);
    }
  });

  if (targetSkills.length > 0) {
    const ratio = matchedSkillsList.length / Math.min(targetSkills.length, 6);
    skillsScore = Math.min(40, Math.round(ratio * 40));
  } else {
    skillsScore = 25;
  }

  // 3. Freshness (Up to 20 pts)
  const dateStr = job.posted_at || job.created_at || job.first_seen_at;
  if (dateStr) {
    const timeMs = new Date(dateStr).getTime();
    if (!isNaN(timeMs)) {
      const daysOld = (Date.now() - timeMs) / (1000 * 60 * 60 * 24);
      if (daysOld <= 2) freshnessScore = 20;
      else if (daysOld <= 7) freshnessScore = 15;
      else if (daysOld <= 14) freshnessScore = 10;
      else if (daysOld <= 30) freshnessScore = 5;
    } else {
      freshnessScore = 10;
    }
  } else {
    freshnessScore = 10;
  }

  // 4. Excluded Keywords Penalty (-45 per match)
  for (const ex of excluded) {
    if (jobTitle.includes(ex) || jobDesc.includes(ex)) {
      penalty += 45;
    }
  }

  const rawTotal = Math.max(0, Math.min(100, Math.round(titleScore + skillsScore + freshnessScore - penalty)));

  return {
    ...job,
    company_name: resolveCompanyName(job),
    title: rawTitle,
    source: resolveJobSource(job),
    matchScore: rawTotal,
    matchingSkills: matchedSkillsList,
    scoreBreakdown: {
      titleScore: Math.round(titleScore),
      skillsScore: Math.round(skillsScore),
      freshnessScore: Math.round(freshnessScore),
      penalty,
    },
  };
}
