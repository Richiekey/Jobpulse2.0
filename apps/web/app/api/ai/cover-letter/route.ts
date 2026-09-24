import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@jobpulse/ai';
import { enforceAiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rateLimitError = enforceAiRateLimit(req, 'ai_cl', 20);
    if (rateLimitError) {
      return rateLimitError;
    }

    const body = await req.json();
    const {
      jobTitle,
      companyName,
      jobDescription,
      tailoredResume,
      candidateInfo,
    } = body;

    if (!jobTitle || !jobDescription) {
      return NextResponse.json(
        { success: false, error: 'Job title and description are required.' },
        { status: 400 }
      );
    }

    const candidateName =
      candidateInfo?.fullName ||
      candidateInfo?.full_name ||
      tailoredResume?.candidate?.name ||
      'Candidate';

    const systemPrompt = `You are a professional executive career coach.
Write an authentic, highly compelling 3 to 4 paragraph cover letter for ${candidateName} applying for "${jobTitle}" at "${companyName || 'the company'}".

Key requirements:
1. First paragraph: Hook the hiring manager with enthusiasm for the company and summarize key value proposition.
2. Second/Third paragraph: Highlight 2-3 specific technical/leadership accomplishments from the resume that directly solve the pain points mentioned in the job description.
3. Final paragraph: Professional call-to-action expressing interest in discussing how the candidate can accelerate the team's objectives.
4. Tone: Confident, articulate, proactive, and tailored (not generic boilerplate).`;

    const userPrompt = `JOB TITLE: ${jobTitle}
COMPANY: ${companyName || 'Target Company'}

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

CANDIDATE BACKGROUND / RESUME:
${typeof tailoredResume === 'string' ? tailoredResume : JSON.stringify(tailoredResume || candidateInfo || {}, null, 2)}

Please write the complete cover letter now.`;

    const llmRes = await callLLM({
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxTokens: 1500,
      jsonMode: false,
    });

    return NextResponse.json({
      success: true,
      coverLetter: llmRes.content,
      provider: llmRes.provider,
      model: llmRes.model,
    });
  } catch (err: unknown) {
    console.error('[JobPulse AI] Cover Letter API error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
