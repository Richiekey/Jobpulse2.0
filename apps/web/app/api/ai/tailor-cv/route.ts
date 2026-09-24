import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@jobpulse/ai';
import { enforceAiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rateLimitError = enforceAiRateLimit(req, 'ai_cv', 15);
    if (rateLimitError) {
      return rateLimitError;
    }

    const body = await req.json();
    const {
      jobTitle,
      companyName,
      jobDescription,
      masterResume,
      candidateInfo,
    } = body;

    if (!jobTitle || !jobDescription) {
      return NextResponse.json(
        { success: false, error: 'Job title and description are required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an elite Executive Career Strategist and ATS (Applicant Tracking System) Optimization Specialist.
Your mission is to take a candidate's master resume/profile and strategically tailor it for the target position: "${jobTitle}" at "${companyName || 'Target Company'}".

CRITICAL RULES:
1. TRUTHFULNESS: Never fabricate past employers, degrees, or years of tenure. You may highlight relevant skills, adjust bullet point phrasing to echo the job requirements, and elevate relevant projects.
2. ATS OPTIMIZATION: Integrate critical keywords and technical requirements from the Job Description naturally.
3. EXECUTIVE SERIF FORMAT: Output high-impact, metric-driven accomplishments using strong action verbs (Spearheaded, Architected, Accelerated, Reduced, Engineered).
4. ATS MATCH SCORE: Analyze the match between the tailored resume and the job description, calculating a score between 85% and 100%.

YOU MUST RETURN STRICT JSON matching this schema:
{
  "atsScore": number,
  "matchingKeywords": string[],
  "missingKeywords": string[],
  "candidate": {
    "name": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedin": string,
    "github": string,
    "portfolio": string
  },
  "summary": string,
  "experience": [
    {
      "role": string,
      "company": string,
      "location": string,
      "period": string,
      "highlights": string[]
    }
  ],
  "skills": {
    "languages": string[],
    "frameworks": string[],
    "toolsAndCloud": string[]
  },
  "education": [
    {
      "degree": string,
      "institution": string,
      "year": string
    }
  ],
  "certifications": string[]
}`;

    const userPrompt = `TARGET ROLE: ${jobTitle}
TARGET COMPANY: ${companyName || 'Confidential'}

TARGET JOB DESCRIPTION:
${jobDescription.slice(0, 4000)}

CANDIDATE INFORMATION & MASTER RESUME:
Name: ${candidateInfo?.fullName || candidateInfo?.full_name || 'Candidate'}
Email: ${candidateInfo?.email || 'email@example.com'}
Phone: ${candidateInfo?.phone || ''}
Location: ${candidateInfo?.preferred_location || candidateInfo?.location || 'Remote'}
Skills: ${(candidateInfo?.skills || []).join(', ')}
Master Resume Content:
${masterResume || candidateInfo?.headline || 'Experienced professional with demonstrated background in modern technology and software engineering.'}

Please generate the tailored resume JSON now.`;

    const llmRes = await callLLM({
      systemPrompt,
      userPrompt,
      temperature: 0.25,
      maxTokens: 3500,
      jsonMode: true,
    });

    let parsedResult;
    try {
      const cleanJson = llmRes.content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      parsedResult = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('[JobPulse AI] Failed to parse LLM JSON:', parseErr, llmRes.content);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse structured resume data from AI provider.',
          raw: llmRes.content,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsedResult,
      provider: llmRes.provider,
      model: llmRes.model,
    });
  } catch (err: unknown) {
    console.error('[JobPulse AI] Tailor CV API error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
