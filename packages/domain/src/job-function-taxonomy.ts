/**
 * Job Function Taxonomy — Deterministic Classification Engine
 *
 * Classification signal priority (per user decision):
 *   1. Explicit ATS department/category metadata
 *   2. Strong title match
 *   3. Strong skill combination
 *   4. Description signals
 *   5. "Other" fallback
 *
 * No LLM in the ingestion hot path.
 */

export interface JobFunctionCategory {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface ClassificationResult {
  slug: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'ats_metadata' | 'title_match' | 'skill_match' | 'description_match' | 'fallback';
}

// Top-level categories
const TOP_LEVEL: JobFunctionCategory[] = [
  { slug: 'software-engineering',    name: 'Software Engineering',     parentSlug: null },
  { slug: 'data-ai-ml',             name: 'Data / AI / ML',           parentSlug: null },
  { slug: 'cybersecurity-cloud',    name: 'Cybersecurity / Cloud',    parentSlug: null },
  { slug: 'product',                name: 'Product',                  parentSlug: null },
  { slug: 'design',                 name: 'Design',                   parentSlug: null },
  { slug: 'business-operations',    name: 'Business / Operations',    parentSlug: null },
  { slug: 'sales-marketing',        name: 'Sales / Marketing',        parentSlug: null },
  { slug: 'finance-accounting',     name: 'Finance / Accounting',     parentSlug: null },
  { slug: 'hr-people',              name: 'HR / People',              parentSlug: null },
  { slug: 'customer-support',       name: 'Customer Support / Success', parentSlug: null },
  { slug: 'legal',                  name: 'Legal',                    parentSlug: null },
  { slug: 'healthcare',             name: 'Healthcare',               parentSlug: null },
  { slug: 'education',              name: 'Education',                parentSlug: null },
  { slug: 'research',               name: 'Research',                 parentSlug: null },
  { slug: 'other',                  name: 'Other',                    parentSlug: null },
];

// Sub-function categories
const SUB_FUNCTIONS: JobFunctionCategory[] = [
  // Software Engineering
  { slug: 'software-frontend',       name: 'Frontend',          parentSlug: 'software-engineering' },
  { slug: 'software-backend',        name: 'Backend',           parentSlug: 'software-engineering' },
  { slug: 'software-fullstack',      name: 'Full Stack',        parentSlug: 'software-engineering' },
  { slug: 'software-mobile',         name: 'Mobile',            parentSlug: 'software-engineering' },
  { slug: 'software-devops',         name: 'DevOps',            parentSlug: 'software-engineering' },
  { slug: 'software-infrastructure', name: 'Infrastructure',    parentSlug: 'software-engineering' },
  { slug: 'software-sre',            name: 'SRE',               parentSlug: 'software-engineering' },
  { slug: 'software-embedded',       name: 'Embedded',          parentSlug: 'software-engineering' },
  { slug: 'software-qa',             name: 'QA / Testing',      parentSlug: 'software-engineering' },
  // Data / AI / ML
  { slug: 'data-science',            name: 'Data Science',      parentSlug: 'data-ai-ml' },
  { slug: 'data-engineering',        name: 'Data Engineering',  parentSlug: 'data-ai-ml' },
  { slug: 'data-ml',                 name: 'Machine Learning',  parentSlug: 'data-ai-ml' },
  { slug: 'data-ai-engineering',     name: 'AI Engineering',    parentSlug: 'data-ai-ml' },
  { slug: 'data-analytics',          name: 'Analytics',         parentSlug: 'data-ai-ml' },
  { slug: 'data-research',           name: 'Research Scientist', parentSlug: 'data-ai-ml' },
  // Cybersecurity / Cloud
  { slug: 'security-engineering',    name: 'Security Engineering', parentSlug: 'cybersecurity-cloud' },
  { slug: 'cloud-engineering',       name: 'Cloud Engineering',    parentSlug: 'cybersecurity-cloud' },
  { slug: 'devsecops',               name: 'DevSecOps',            parentSlug: 'cybersecurity-cloud' },
];

const ALL_CATEGORIES = [...TOP_LEVEL, ...SUB_FUNCTIONS];

interface TitlePattern {
  pattern: RegExp;
  slug: string;
  confidence: 'high' | 'medium';
}

// Ordered by specificity — more specific patterns first
const TITLE_PATTERNS: TitlePattern[] = [
  // Software Engineering sub-functions (specific first)
  { pattern: /\b(frontend|front[\s-]?end|ui\s+engineer|ui\s+developer)\b/i, slug: 'software-frontend', confidence: 'high' },
  { pattern: /\b(backend|back[\s-]?end|server\s+engineer|api\s+engineer)\b/i, slug: 'software-backend', confidence: 'high' },
  { pattern: /\b(full[\s-]?stack|fullstack)\b/i, slug: 'software-fullstack', confidence: 'high' },
  { pattern: /\b(mobile|ios|android|react\s+native|flutter|swift\s+developer|kotlin\s+developer)\b/i, slug: 'software-mobile', confidence: 'high' },
  { pattern: /\b(devops|dev\s+ops|ci\/cd|release\s+engineer|build\s+engineer)\b/i, slug: 'software-devops', confidence: 'high' },
  { pattern: /\b(infrastructure\s+engineer|platform\s+engineer)\b/i, slug: 'software-infrastructure', confidence: 'high' },
  { pattern: /\b(sre|site\s+reliability|reliability\s+engineer)\b/i, slug: 'software-sre', confidence: 'high' },
  { pattern: /\b(embedded|firmware)\b/i, slug: 'software-embedded', confidence: 'high' },
  { pattern: /\b(qa\b|quality\s+assurance|test\s+engineer|sdet|test\s+automation|automation\s+engineer)\b/i, slug: 'software-qa', confidence: 'high' },

  // Data / AI / ML sub-functions
  { pattern: /\b(data\s+scientist|data\s+science)\b/i, slug: 'data-science', confidence: 'high' },
  { pattern: /\b(data\s+engineer|etl\s+engineer|data\s+pipeline)\b/i, slug: 'data-engineering', confidence: 'high' },
  { pattern: /\b(machine\s+learning|ml\s+engineer|deep\s+learning)\b/i, slug: 'data-ml', confidence: 'high' },
  { pattern: /\b(ai\s+engineer|artificial\s+intelligence|llm|nlp\s+engineer|computer\s+vision)\b/i, slug: 'data-ai-engineering', confidence: 'high' },
  { pattern: /\b(analytics\s+engineer|bi\s+analyst|business\s+intelligence|data\s+analyst)\b/i, slug: 'data-analytics', confidence: 'high' },
  { pattern: /\b(research\s+scientist|research\s+engineer)\b/i, slug: 'data-research', confidence: 'high' },

  // Cybersecurity / Cloud
  { pattern: /\b(devsecops)\b/i, slug: 'devsecops', confidence: 'high' },
  { pattern: /\b(cloud\s+security\s+engineer|security\s+engineer|cybersecurity|infosec|soc\s+analyst|penetration|iam\s+engineer|appsec|security\s+analyst)\b/i, slug: 'security-engineering', confidence: 'high' },
  { pattern: /\b(cloud\s+engineer|cloud\s+architect)\b/i, slug: 'cloud-engineering', confidence: 'high' },

  // Product
  { pattern: /\b(ai\s+product\s+manager|product\s+manager|product\s+owner|product\s+lead|product\s+director|technical\s+product\s+manager|product\s+operations)\b/i, slug: 'product', confidence: 'high' },

  // Design
  { pattern: /\b(product\s+designer|ux\s+designer|ui\s+designer|ux\s+researcher|graphic\s+designer|design\s+lead|visual\s+designer|interaction\s+designer|brand\s+designer)\b/i, slug: 'design', confidence: 'high' },

  // Business / Operations & Technical Program Management
  { pattern: /\b(technical\s+program\s+manager|tpm\b|program\s+manager|project\s+manager|operations\s+manager|operations\s+analyst|chief\s+of\s+staff|strategy\s+analyst)\b/i, slug: 'business-operations', confidence: 'high' },
  { pattern: /\b(business\s+analyst)\b/i, slug: 'business-operations', confidence: 'medium' },

  // Sales / Marketing & Sales/Solutions Engineering
  { pattern: /\b(sales\s+engineer|solutions\s+engineer|solution\s+architect)\b/i, slug: 'sales-marketing', confidence: 'high' },
  { pattern: /\b(account\s+executive|sales\s+development|business\s+development|sdr\b|bdr\b|growth\s+manager|growth\s+marketing)\b/i, slug: 'sales-marketing', confidence: 'high' },
  { pattern: /\b(marketing\s+manager|content\s+marketing|demand\s+gen|marketing\s+director|marketing\s+lead)\b/i, slug: 'sales-marketing', confidence: 'high' },

  // Finance / Accounting
  { pattern: /\b(accountant|financial\s+analyst|finance\s+manager|controller|treasury|fp&a|revenue\s+analyst|cfo)\b/i, slug: 'finance-accounting', confidence: 'high' },

  // HR / People
  { pattern: /\b(recruiter|talent\s+acquisition|hr\s+manager|people\s+operations|human\s+resources|compensation\s+analyst|benefits|hrbp)\b/i, slug: 'hr-people', confidence: 'high' },

  // Customer Support / Success
  { pattern: /\b(customer\s+success|customer\s+support|technical\s+support|support\s+engineer|client\s+success|help\s+desk)\b/i, slug: 'customer-support', confidence: 'high' },

  // Legal
  { pattern: /\b(legal\s+counsel|paralegal|compliance|general\s+counsel|attorney|lawyer|corporate\s+counsel)\b/i, slug: 'legal', confidence: 'high' },

  // Healthcare
  { pattern: /\b(nurse|physician|clinical|medical|pharmacist|health\s+specialist|therapist)\b/i, slug: 'healthcare', confidence: 'medium' },

  // Education
  { pattern: /\b(teacher|professor|instructor|curriculum|education\s+specialist)\b/i, slug: 'education', confidence: 'medium' },

  // Research (not UX/market research)
  { pattern: /\b(researcher|research\s+fellow|postdoc)\b/i, slug: 'research', confidence: 'medium' },

  // Generic Software Engineering (catch-all for "engineer"/"developer" titles)
  { pattern: /\b(software\s+engineer|software\s+developer|engineer|developer|programmer|swe\b|sde\b)\b/i, slug: 'software-engineering', confidence: 'medium' },
];

// ATS metadata department/category → slug mapping
const DEPARTMENT_MAP: Record<string, string> = {
  'engineering': 'software-engineering',
  'software engineering': 'software-engineering',
  'product engineering': 'software-engineering',
  'technology': 'software-engineering',
  'r&d': 'software-engineering',
  'data': 'data-ai-ml',
  'data science': 'data-science',
  'data engineering': 'data-engineering',
  'machine learning': 'data-ml',
  'artificial intelligence': 'data-ai-engineering',
  'analytics': 'data-analytics',
  'security': 'cybersecurity-cloud',
  'information security': 'cybersecurity-cloud',
  'cybersecurity': 'cybersecurity-cloud',
  'cloud': 'cloud-engineering',
  'product': 'product',
  'product management': 'product',
  'design': 'design',
  'ux': 'design',
  'operations': 'business-operations',
  'sales': 'sales-marketing',
  'marketing': 'sales-marketing',
  'growth': 'sales-marketing',
  'finance': 'finance-accounting',
  'accounting': 'finance-accounting',
  'human resources': 'hr-people',
  'people': 'hr-people',
  'talent': 'hr-people',
  'recruiting': 'hr-people',
  'customer success': 'customer-support',
  'support': 'customer-support',
  'customer experience': 'customer-support',
  'legal': 'legal',
  'compliance': 'legal',
  'healthcare': 'healthcare',
  'education': 'education',
  'research': 'research',
};

// Skill combination signals → slug
const SKILL_SIGNALS: { skills: string[]; minMatch: number; slug: string }[] = [
  { skills: ['react', 'vue', 'angular', 'css', 'html', 'tailwind', 'next.js', 'svelte'], minMatch: 2, slug: 'software-frontend' },
  { skills: ['node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'rails', 'postgresql', 'mysql', 'mongodb'], minMatch: 2, slug: 'software-backend' },
  { skills: ['ios', 'android', 'swift', 'kotlin', 'react native', 'flutter'], minMatch: 1, slug: 'software-mobile' },
  { skills: ['terraform', 'ansible', 'jenkins', 'ci/cd', 'docker', 'kubernetes', 'helm'], minMatch: 3, slug: 'software-devops' },
  { skills: ['pytorch', 'tensorflow', 'scikit-learn', 'deep learning', 'neural network'], minMatch: 2, slug: 'data-ml' },
  { skills: ['pandas', 'spark', 'airflow', 'dbt', 'snowflake', 'bigquery', 'etl'], minMatch: 2, slug: 'data-engineering' },
  { skills: ['tableau', 'looker', 'power bi', 'sql', 'analytics'], minMatch: 2, slug: 'data-analytics' },
  { skills: ['aws', 'azure', 'gcp', 'cloud', 'ec2', 's3', 'lambda'], minMatch: 3, slug: 'cloud-engineering' },
  { skills: ['figma', 'sketch', 'adobe', 'prototyping', 'wireframe', 'design system'], minMatch: 2, slug: 'design' },
];

export class JobFunctionTaxonomy {
  /**
   * Returns all top-level function categories.
   */
  public static getTopLevelCategories(): JobFunctionCategory[] {
    return TOP_LEVEL;
  }

  /**
   * Returns all categories including sub-functions.
   */
  public static getAllCategories(): JobFunctionCategory[] {
    return ALL_CATEGORIES;
  }

  /**
   * Returns the sub-functions for a given parent slug.
   */
  public static getSubFunctions(parentSlug: string): JobFunctionCategory[] {
    return SUB_FUNCTIONS.filter((c) => c.parentSlug === parentSlug);
  }

  /**
   * Returns the parent slug for a given sub-function slug.
   * If the slug is already top-level, returns itself.
   */
  public static getParentSlug(slug: string): string {
    const cat = ALL_CATEGORIES.find((c) => c.slug === slug);
    return cat?.parentSlug ?? slug;
  }

  /**
   * Resolves a slug to its top-level parent (for feed filtering by broad category).
   */
  public static resolveTopLevel(slug: string): string {
    const cat = ALL_CATEGORIES.find((c) => c.slug === slug);
    if (!cat) return 'other';
    if (cat.parentSlug === null) return cat.slug;
    return cat.parentSlug;
  }

  /**
   * Checks if a slug is a valid category (top-level or sub-function).
   */
  public static isValidSlug(slug: string): boolean {
    return ALL_CATEGORIES.some((c) => c.slug === slug);
  }

  /**
   * Returns the display name for a slug.
   */
  public static getDisplayName(slug: string): string {
    const cat = ALL_CATEGORIES.find((c) => c.slug === slug);
    return cat?.name ?? 'Other';
  }

  /**
   * Classifies a job into a function category using the priority signal chain:
   *   1. ATS department/category metadata
   *   2. Title pattern match
   *   3. Skill combination match
   *   4. Description signals
   *   5. "Other" fallback
   */
  public static classify(
    title: string,
    options?: {
      department?: string | null;
      category?: string | null;
      skills?: string[];
      description?: string;
    }
  ): ClassificationResult {
    // Signal 1: ATS metadata (department or category)
    const atsCategory = options?.department || options?.category;
    if (atsCategory) {
      const normalizedDept = atsCategory.toLowerCase().trim();
      const mappedSlug = DEPARTMENT_MAP[normalizedDept];
      if (mappedSlug) {
        return { slug: mappedSlug, confidence: 'high', source: 'ats_metadata' };
      }
      // Try partial matching
      for (const [key, slug] of Object.entries(DEPARTMENT_MAP)) {
        if (normalizedDept.includes(key) || key.includes(normalizedDept)) {
          return { slug, confidence: 'medium', source: 'ats_metadata' };
        }
      }
    }

    // Signal 2: Title pattern match
    for (const { pattern, slug, confidence } of TITLE_PATTERNS) {
      if (pattern.test(title)) {
        return { slug, confidence, source: 'title_match' };
      }
    }

    // Signal 3: Skill combination match
    if (options?.skills && options.skills.length > 0) {
      const lowerSkills = options.skills.map((s) => s.toLowerCase());
      for (const signal of SKILL_SIGNALS) {
        const matches = signal.skills.filter((s) => lowerSkills.some((ls) => ls.includes(s)));
        if (matches.length >= signal.minMatch) {
          return { slug: signal.slug, confidence: 'medium', source: 'skill_match' };
        }
      }
    }

    // Signal 4: Description keyword signals (limited to first 500 chars for perf)
    if (options?.description) {
      const descSnippet = options.description.slice(0, 500).toLowerCase();
      for (const { pattern, slug } of TITLE_PATTERNS.slice(0, 20)) {
        if (pattern.test(descSnippet)) {
          return { slug, confidence: 'low', source: 'description_match' };
        }
      }
    }

    // Signal 5: Fallback
    return { slug: 'other', confidence: 'low', source: 'fallback' };
  }
}
