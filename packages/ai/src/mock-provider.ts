import type { LLMRequestOptions, LLMResponse, ResumeData } from './types.js';

/**
 * Intelligent mock response generator for zero-config development,
 * offline workflows, and deterministic unit testing.
 */
export function generateMockResponse(options: LLMRequestOptions): LLMResponse {
  const { userPrompt, jsonMode } = options;

  if (jsonMode) {
    // Extract contextual hints from prompt if available
    const roleMatch = userPrompt.match(/TARGET ROLE:\s*([^\n\r]+)/i);
    const companyMatch = userPrompt.match(/TARGET COMPANY:\s*([^\n\r]+)/i);
    const nameMatch = userPrompt.match(/Name:\s*([^\n\r]+)/i);
    const emailMatch = userPrompt.match(/Email:\s*([^\n\r]+)/i);
    const locationMatch = userPrompt.match(/Location:\s*([^\n\r]+)/i);

    const targetRole = roleMatch?.[1]?.trim() ?? 'Senior Software Engineer';
    const targetCompany = companyMatch?.[1]?.trim() ?? 'Innovative Technologies Inc.';
    const candidateName = nameMatch?.[1]?.trim() ?? 'Alex Mercer';
    const candidateEmail = emailMatch?.[1]?.trim() ?? 'alex.mercer@example.com';
    const candidateLocation = locationMatch?.[1]?.trim() ?? 'San Francisco, CA (Open to Remote)';

    const mockResume: ResumeData = {
      atsScore: 94,
      matchingKeywords: [
        'TypeScript',
        'React',
        'Next.js',
        'Node.js',
        'System Architecture',
        'CI/CD Pipelines',
        'Distributed Systems',
        'PostgreSQL',
      ],
      missingKeywords: ['Kubernetes', 'GraphQL Federation'],
      candidate: {
        name: candidateName,
        email: candidateEmail,
        phone: '+1 (555) 349-2810',
        location: candidateLocation,
        linkedin: 'linkedin.com/in/alex-mercer-tech',
        github: 'github.com/alexmercer-dev',
        portfolio: 'alexmercer.dev',
      },
      summary: `Accomplished and impact-focused ${targetRole} with 6+ years of experience engineering scalable web applications, modern distributed microservices, and high-performance UI workflows. Proven track record of accelerating product delivery cycles by 35% and elevating system availability to 99.99%. Enthusiastic about bringing technical excellence and user-centric architecture to ${targetCompany}.`,
      experience: [
        {
          role: `Senior Full Stack Engineer`,
          company: 'Apex Cloud Systems',
          location: 'San Francisco, CA (Remote)',
          period: '2023 — Present',
          highlights: [
            `Architected and deployed responsive enterprise web applications using Next.js 15, TypeScript, and React, serving 500k+ monthly active users.`,
            `Spearheaded backend query and ingestion optimizations, reducing p99 API latency from 450ms to 78ms across high-throughput endpoints.`,
            `Designed resilient automated CI/CD deployment pipelines with zero-downtime canary rollouts, cutting release cycles from bi-weekly to daily.`,
          ],
        },
        {
          role: 'Software Engineer',
          company: 'Nexus Digital Labs',
          location: 'New York, NY',
          period: '2020 — 2023',
          highlights: [
            'Engineered reusable component libraries and real-time dashboard analytics, enhancing engineer velocity by 40%.',
            'Implemented robust data validation schemas and resilient OAuth2 authentication flows with role-based access control.',
            'Collaborated with cross-functional product and design teams to launch 4 major customer-facing initiatives on schedule.',
          ],
        },
      ],
      skills: {
        languages: ['TypeScript', 'JavaScript (ES2024)', 'Python', 'SQL (PostgreSQL)', 'HTML5/CSS3'],
        frameworks: ['React', 'Next.js', 'Node.js', 'Express', 'Tailwind CSS', 'Vitest/Jest'],
        toolsAndCloud: ['Git & GitHub', 'Docker', 'AWS / Supabase', 'RESTful APIs', 'CI/CD Actions'],
      },
      education: [
        {
          degree: 'Bachelor of Science in Computer Science',
          institution: 'University of California, Berkeley',
          year: '2020',
        },
      ],
      certifications: [
        'AWS Certified Solutions Architect – Associate',
        'Meta Frontend Developer Professional Certificate',
      ],
    };

    return {
      content: JSON.stringify(mockResume, null, 2),
      provider: 'mock',
      model: 'built-in-template',
    };
  }

  // Cover Letter or Interview Q&A check
  const isInterviewQa = userPrompt.toLowerCase().includes('application question:') || userPrompt.toLowerCase().includes('screening question:');

  if (isInterviewQa) {
    return {
      content: `In my previous role as a senior engineer, I spearheaded the architectural redesign of our primary data processing pipeline, decreasing latency by 42% while scaling to handle 3x data volume. I combine deep technical expertise in TypeScript and cloud-native services with a rigorous focus on measurable business outcomes, enabling me to deliver immediate value to your engineering team.`,
      provider: 'mock',
      model: 'built-in-template',
    };
  }

  // Default: Cover letter fallback
  const roleMatch = userPrompt.match(/JOB TITLE:\s*([^\n\r]+)/i);
  const companyMatch = userPrompt.match(/COMPANY:\s*([^\n\r]+)/i);
  const targetRole = roleMatch?.[1]?.trim() ?? 'Software Engineer';
  const targetCompany = companyMatch?.[1]?.trim() ?? 'Hiring Team';

  return {
    content: `Dear Hiring Team at ${targetCompany},

I am writing to express my strong enthusiasm for the ${targetRole} position at ${targetCompany}. With a proven background in architecting performant full-stack systems, modernizing web applications, and delivering mission-critical features in agile environments, I am excited by the opportunity to contribute directly to your team's upcoming milestones.

Throughout my career, I have focused on building software that balances high technical rigor with real-world user value. At my previous company, I led the development of scalable client-server architectures that reduced end-to-end latency by over 40% while sustaining 99.99% uptime. My hands-on experience across modern TypeScript ecosystems, distributed state management, and automated test pipelines aligns closely with the objectives outlined in your job description.

What particularly excites me about ${targetCompany} is your commitment to technical innovation and engineering excellence. I thrive in collaborative environments where engineers are empowered to take ownership from design through deployment, and I am eager to bring this same dedication to your team.

Thank you for your time and consideration. I would welcome the opportunity to discuss how my technical skills and proactive problem-solving approach can help accelerate ${targetCompany}'s goals.

Sincerely,
Candidate`,
    provider: 'mock',
    model: 'built-in-template',
  };
}
