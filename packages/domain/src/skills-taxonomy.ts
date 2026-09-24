/**
 * JobPulse Technical Skills Taxonomy & Extraction Engine
 *
 * Extracts tech skills and role categories from job descriptions and titles
 * using word-boundary pattern matching against a curated taxonomy of ~200 technical skills.
 */

export const SKILLS_TAXONOMY: Record<string, string[]> = {
  languages: [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'Go', 'Golang', 'Rust',
    'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R',
    'Elixir', 'Clojure', 'Haskell', 'Perl', 'Lua', 'Dart', 'Objective-C',
    'MATLAB', 'Julia', 'Solidity', 'SQL', 'GraphQL', 'HTML', 'CSS',
    'Bash', 'Shell', 'PowerShell',
  ],
  frontend: [
    'React', 'Next.js', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'SvelteKit',
    'Remix', 'Astro', 'Gatsby', 'jQuery', 'Tailwind', 'TailwindCSS',
    'Bootstrap', 'Material UI', 'Chakra UI', 'Styled Components',
    'Redux', 'Zustand', 'MobX', 'Webpack', 'Vite', 'Storybook',
  ],
  backend: [
    'Node.js', 'Express', 'Fastify', 'NestJS', 'Django', 'Flask',
    'FastAPI', 'Spring', 'Spring Boot', 'Rails', 'Ruby on Rails',
    'Laravel', 'ASP.NET', '.NET', 'Gin', 'Echo', 'Fiber',
    'gRPC', 'REST', 'RESTful', 'WebSocket', 'Microservices',
  ],
  data: [
    'PostgreSQL', 'Postgres', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    'DynamoDB', 'Cassandra', 'CockroachDB', 'Supabase', 'Firebase',
    'SQLite', 'Oracle', 'SQL Server', 'MariaDB', 'Neo4j',
    'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'dbt',
    'Apache Spark', 'Spark', 'Kafka', 'Airflow', 'Flink',
    'Hadoop', 'Hive', 'Presto', 'Trino', 'ETL',
    'Data Warehouse', 'Data Lake', 'Data Pipeline',
  ],
  ml_ai: [
    'Machine Learning', 'Deep Learning', 'NLP',
    'Natural Language Processing', 'Computer Vision',
    'TensorFlow', 'PyTorch', 'Scikit-learn', 'Keras', 'Hugging Face',
    'LLM', 'Large Language Model', 'GPT', 'Generative AI', 'Gen AI',
    'Transformer', 'BERT', 'Reinforcement Learning',
    'Neural Network', 'MLOps', 'Feature Engineering',
    'Model Training', 'Model Deployment', 'A/B Testing',
    'Recommendation Systems', 'RAG', 'Vector Database',
    'LangChain', 'OpenAI', 'Anthropic', 'Claude', 'Gemini',
  ],
  cloud: [
    'AWS', 'Amazon Web Services', 'Azure', 'Google Cloud', 'GCP',
    'Heroku', 'Vercel', 'Netlify', 'Cloudflare', 'DigitalOcean',
    'S3', 'EC2', 'Lambda', 'ECS', 'EKS', 'SQS', 'SNS',
    'CloudFormation', 'CDK',
  ],
  devops: [
    'Docker', 'Kubernetes', 'K8s', 'Terraform', 'Ansible', 'Pulumi',
    'CI/CD', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI',
    'ArgoCD', 'Helm', 'Prometheus', 'Grafana', 'Datadog',
    'New Relic', 'PagerDuty', 'Linux', 'Nginx', 'Apache',
    'Infrastructure as Code', 'IaC', 'SRE', 'Site Reliability',
  ],
  security: [
    'Cybersecurity', 'Security', 'OAuth', 'SAML', 'SSO',
    'Penetration Testing', 'Pen Testing', 'SOC', 'SIEM',
    'Encryption', 'Zero Trust', 'IAM', 'RBAC',
    'Compliance', 'GDPR', 'SOC 2', 'HIPAA', 'PCI',
  ],
  tools: [
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence',
    'Slack', 'Figma', 'Notion', 'Linear', 'Asana',
    'Postman', 'Swagger', 'OpenAPI',
  ],
  mobile: [
    'React Native', 'Flutter', 'iOS', 'Android',
    'SwiftUI', 'Jetpack Compose', 'Expo',
  ],
  concepts: [
    'Agile', 'Scrum', 'System Design', 'API Design',
    'Object-Oriented', 'OOP', 'Functional Programming',
    'Event-Driven', 'Domain-Driven Design', 'DDD',
    'Test-Driven Development', 'TDD', 'Unit Testing',
    'Integration Testing', 'End-to-End Testing',
  ],
};

const SKILL_NORMALIZATIONS: Record<string, string> = {
  'Golang': 'Go',
  'Amazon Web Services': 'AWS',
  'Google Cloud': 'GCP',
  'K8s': 'Kubernetes',
  'Postgres': 'PostgreSQL',
  'Ruby on Rails': 'Rails',
  'TailwindCSS': 'Tailwind',
  'Gen AI': 'Generative AI',
  'Natural Language Processing': 'NLP',
  'Large Language Model': 'LLM',
  'Site Reliability': 'SRE',
  'Infrastructure as Code': 'IaC',
};

// Escape regex special characters e.g. C++, C#, .NET
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledSkillPattern {
  pattern: RegExp;
  canonical: string;
  length: number;
}

// Precompile regex patterns once, sorted by length descending so multi-word tokens match first
// (e.g., "React Native" before "React", "Machine Learning" before "Machine")
const COMPILED_PATTERNS: CompiledSkillPattern[] = [];

for (const skills of Object.values(SKILLS_TAXONOMY)) {
  for (const skill of skills) {
    const escaped = escapeRegex(skill);
    // Boundary check: not immediately preceded or followed by ASCII alphanumeric
    const pattern = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, 'i');
    COMPILED_PATTERNS.push({
      pattern,
      canonical: skill,
      length: skill.length,
    });
  }
}

COMPILED_PATTERNS.sort((a, b) => b.length - a.length);

/**
 * Role Category Definitions & Keywords
 */
export const ROLE_CATEGORIES: Record<string, string[]> = {
  'Software Engineer': [
    'software engineer', 'software developer', 'backend engineer',
    'frontend engineer', 'full stack', 'fullstack', 'full-stack',
    'web developer', 'application developer', 'platform engineer',
    'systems engineer', 'embedded engineer', 'firmware engineer',
  ],
  'Data Engineer': [
    'data engineer', 'data infrastructure', 'analytics engineer',
    'etl developer', 'data pipeline', 'big data engineer',
  ],
  'Data Analyst': [
    'data analyst', 'business analyst', 'analytics analyst',
    'bi analyst', 'business intelligence',
  ],
  'Data Scientist / AI': [
    'data scientist', 'research scientist', 'applied scientist',
    'machine learning engineer', 'ml engineer', 'ai engineer',
    'ai/ml', 'ml/ai', 'ai researcher', 'deep learning engineer',
  ],
  'DevOps / SRE': [
    'devops', 'site reliability', 'sre', 'infrastructure engineer',
    'cloud engineer', 'cloud architect', 'platform architect',
  ],
  'Product Manager': [
    'product manager', 'technical product manager', 'tpm',
    'product owner', 'group product manager', 'principal product manager',
  ],
  'Designer': [
    'product designer', 'ux designer', 'ui designer', 'ux/ui',
    'design systems', 'visual designer', 'interaction designer',
  ],
  'QA / Testing': [
    'qa engineer', 'quality assurance', 'test engineer', 'sdet',
    'automation engineer', 'test automation',
  ],
  'Security': [
    'security engineer', 'cybersecurity', 'application security',
    'appsec', 'infosec', 'security analyst', 'soc analyst',
  ],
  'Mobile': [
    'mobile engineer', 'ios engineer', 'android engineer',
    'mobile developer', 'react native developer', 'flutter developer',
  ],
  'Engineering Management': [
    'engineering manager', 'director of engineering', 'vp of engineering',
    'head of engineering', 'tech lead manager', 'engineering director', 'cto',
  ],
};

export class SkillsTaxonomy {
  /**
   * Extract technical skills from unstructured text (descriptions, requirements, titles).
   * Returns a deduplicated, sorted list of canonical skill names.
   */
  public static extractSkills(text: string | null | undefined): string[] {
    if (!text || typeof text !== 'string') return [];

    const found = new Set<string>();

    for (const { pattern, canonical } of COMPILED_PATTERNS) {
      if (pattern.test(text)) {
        const normalized = SKILL_NORMALIZATIONS[canonical] || canonical;
        found.add(normalized);
      }
    }

    return Array.from(found).sort();
  }

  /**
   * Detect technical role category from a job title.
   */
  public static detectRoleCategory(title: string | null | undefined): string | null {
    if (!title || typeof title !== 'string') return null;

    const lower = title.toLowerCase();

    for (const [category, keywords] of Object.entries(ROLE_CATEGORIES)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          return category;
        }
      }
    }

    return null;
  }
}
