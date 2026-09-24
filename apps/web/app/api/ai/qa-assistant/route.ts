import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@jobpulse/ai';
import { enforceAiRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rateLimitError = enforceAiRateLimit(req, 'ai_qa', 30);
    if (rateLimitError) {
      return rateLimitError;
    }

    const body = await req.json();
    const {
      question,
      jobTitle,
      companyName,
      jobDescription,
      tailoredResume,
      candidateInfo,
    } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { success: false, error: 'Screening question is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an expert ATS screening interview assistant.
Generate a concise, impactful, and authentic 1-3 sentence response to the application screening question.

Rules:
1. Ground the answer strictly in the candidate's actual experience and technical skills.
2. Directly answer the question without fluff or introductory filler (e.g., do not start with "Sure! Here is your answer:").
3. Align the response with the target company and role requirements.`;

    const userPrompt = `TARGET ROLE: ${jobTitle || 'Role'}
COMPANY: ${companyName || 'Company'}

APPLICATION QUESTION:
"${question.trim()}"

CANDIDATE PROFILE & RESUME:
${typeof tailoredResume === 'string' ? tailoredResume : JSON.stringify(tailoredResume || candidateInfo || {}, null, 2)}

JOB CONTEXT:
${(jobDescription || '').slice(0, 1500)}

Please provide the direct, optimized answer to paste into the application form:`;

    const llmRes = await callLLM({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 500,
      jsonMode: false,
    });

    return NextResponse.json({
      success: true,
      answer: llmRes.content.trim(),
      provider: llmRes.provider,
      model: llmRes.model,
    });
  } catch (err: unknown) {
    console.error('[JobPulse AI] QA Assistant API error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
