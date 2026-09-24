import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as tailorCvHandler } from '../app/api/ai/tailor-cv/route.js';
import { POST as coverLetterHandler } from '../app/api/ai/cover-letter/route.js';
import { POST as qaAssistantHandler } from '../app/api/ai/qa-assistant/route.js';
import { checkRateLimit } from '../lib/rate-limit.js';

describe('AI Career Tools API Routes & Rate Limiter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GROQ_API_KEY'];
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Rate Limiter (lib/rate-limit.ts)', () => {
    it('allows requests within limit and calculates remaining window', () => {
      const id = 'test-client-ip-001';
      const check1 = checkRateLimit(id, 5, 10000);
      expect(check1.success).toBe(true);
      expect(check1.remaining).toBe(4);

      const check2 = checkRateLimit(id, 5, 10000);
      expect(check2.success).toBe(true);
      expect(check2.remaining).toBe(3);
    });

    it('blocks request with success=false when threshold is exceeded', () => {
      const id = 'test-client-burst-999';
      for (let i = 0; i < 3; i++) {
        checkRateLimit(id, 3, 10000);
      }
      const blocked = checkRateLimit(id, 3, 10000);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetInSeconds).toBeGreaterThan(0);
    });
  });

  describe('POST /api/ai/tailor-cv', () => {
    it('returns 400 when jobTitle or jobDescription is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/tailor-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: 'Google' }),
      });

      const res = await tailorCvHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Job title and description are required');
    });

    it('generates tailored resume JSON in zero-config mock mode', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/tailor-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: 'Senior Platform Engineer',
          companyName: 'Cloudflare',
          jobDescription: 'Build next-gen edge computing infrastructure using Rust and TypeScript.',
          candidateInfo: {
            fullName: 'Morgan Hayes',
            email: 'morgan.hayes@example.com',
          },
        }),
      });

      const res = await tailorCvHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.provider).toBe('mock');
      expect(json.data.atsScore).toBeGreaterThanOrEqual(85);
      expect(json.data.candidate.name).toBe('Morgan Hayes');
      expect(json.data.matchingKeywords.length).toBeGreaterThan(0);
      expect(json.data.summary).toContain('Senior Platform Engineer');
      expect(json.data.summary).toContain('Cloudflare');
    });
  });

  describe('POST /api/ai/cover-letter', () => {
    it('returns 400 when missing required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobTitle: 'Frontend Lead' }),
      });

      const res = await coverLetterHandler(req);
      expect(res.status).toBe(400);
    });

    it('generates compelling executive cover letter with target company in mock mode', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: 'Principal Systems Architect',
          companyName: 'Netflix',
          jobDescription: 'Lead distributed streaming architecture and resilient microservices.',
        }),
      });

      const res = await coverLetterHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.provider).toBe('mock');
      expect(json.coverLetter).toContain('Dear Hiring Team at Netflix');
      expect(json.coverLetter).toContain('Principal Systems Architect');
    });
  });

  describe('POST /api/ai/qa-assistant', () => {
    it('returns 400 when question is empty', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/qa-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '   ' }),
      });

      const res = await qaAssistantHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Screening question is required');
    });

    it('generates high-impact interview answer in mock mode', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/qa-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Why are you interested in joining our engineering organization?',
          jobTitle: 'Staff Backend Engineer',
          companyName: 'Uber',
          jobDescription: 'Scale real-time marketplace routing engines.',
        }),
      });

      const res = await qaAssistantHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.provider).toBe('mock');
      expect(json.answer.length).toBeGreaterThan(40);
    });
  });
});
