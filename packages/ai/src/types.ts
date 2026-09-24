/**
 * JobPulse 2.0 AI Career Tools Types
 */

export type LLMProvider = 'gemini' | 'groq' | 'deepseek' | 'openai' | 'mock';

export interface LLMRequestOptions {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  preferredProviders?: LLMProvider[];
  fetchFn?: typeof fetch;
}

export interface LLMResponse {
  content: string;
  provider: LLMProvider;
  model: string;
  tokensUsed?: number;
}

export interface CandidateContact {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface WorkExperienceItem {
  role?: string;
  company?: string;
  location?: string;
  period?: string;
  highlights?: string[];
}

export interface EducationItem {
  degree?: string;
  institution?: string;
  year?: string;
}

export interface ResumeSkills {
  languages?: string[];
  frameworks?: string[];
  toolsAndCloud?: string[];
}

export interface ResumeData {
  atsScore?: number;
  matchingKeywords?: string[];
  missingKeywords?: string[];
  candidate?: CandidateContact;
  summary?: string;
  experience?: WorkExperienceItem[];
  skills?: ResumeSkills;
  education?: EducationItem[];
  certifications?: string[];
}

export interface TailorResumeInput {
  jobTitle: string;
  companyName?: string;
  jobDescription: string;
  masterResume?: string;
  candidateInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    skills?: string[];
    headline?: string;
    [key: string]: any;
  };
}

export interface CoverLetterInput {
  jobTitle: string;
  companyName?: string;
  jobDescription: string;
  tailoredResume?: any;
  candidateInfo?: any;
}

export interface QaAssistantInput {
  question: string;
  jobTitle?: string;
  companyName?: string;
  jobDescription?: string;
  tailoredResume?: any;
  candidateInfo?: any;
}
