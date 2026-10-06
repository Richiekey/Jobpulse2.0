import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '@jobpulse/shared';
import { HackerNewsHiringProvider } from '../../src/providers/hn-hiring.provider.js';

describe('HackerNewsHiringProvider', () => {
  it('parses typical HN hiring comments correctly', async () => {
    const provider = new HackerNewsHiringProvider();

    const sampleHit = {
      objectID: '12345',
      title: 'comment',
      created_at: '2026-10-06T12:00:00Z',
      story_id: 99999,
      comment_text: `
        <p>Acme Corp | Senior Backend Engineer | REMOTE (US) | Full-time | $160k-$200k | <a href="https:&#x2F;&#x2F;acme.com" rel="nofollow">https:&#x2F;&#x2F;acme.com</a></p>
        <p>We are building high throughput database systems. Apply at <a href="https:&#x2F;&#x2F;boards.greenhouse.io&#x2F;acme&#x2F;jobs&#x2F;101" rel="nofollow">https:&#x2F;&#x2F;boards.greenhouse.io&#x2F;acme&#x2F;jobs&#x2F;101</a></p>
      `,
    };

    const candidate = await provider.parseComment(sampleHit);
    expect(candidate).not.toBeNull();
    expect(candidate!.company_name).toBe('Acme Corp');
    expect(candidate!.company_domain).toBe('acme.com');
    expect(candidate!.detected_ats).toBe('greenhouse');
    expect(candidate!.ats_url).toBe('https://boards.greenhouse.io/acme/jobs/101');
    expect(candidate!.board_identifier).toBe('acme');
    expect(candidate!.job_evidence.length).toBe(1);
    expect(candidate!.job_evidence[0]!.job_title).toBe('Senior Backend Engineer');
    expect(candidate!.evidence[0]!.provider).toBe('hn-hiring');
  });

  it('handles comments without direct ATS links by capturing company website', async () => {
    const provider = new HackerNewsHiringProvider();

    const sampleHit = {
      objectID: '67890',
      created_at: '2026-10-06T12:00:00Z',
      comment_text: `
        <p>Linear (https:&#x2F;&#x2F;linear.app) - Product Engineer - Remote (Worldwide)</p>
        <p>Check out our open positions at https:&#x2F;&#x2F;linear.app&#x2F;careers</p>
      `,
    };

    const candidate = await provider.parseComment(sampleHit);
    expect(candidate).not.toBeNull();
    expect(candidate!.company_name).toBe('Linear');
    expect(candidate!.company_domain).toBe('linear.app');
    expect(candidate!.careers_url).toBe('https://linear.app/careers');
    expect(candidate!.job_evidence.length).toBe(1);
  });

  it('gracefully ignores non-hiring short comments', async () => {
    const provider = new HackerNewsHiringProvider();

    const shortHit = {
      objectID: '111',
      created_at: '2026-10-06T12:00:00Z',
      comment_text: 'Thanks for the post!',
    };

    expect(await provider.parseComment(shortHit)).toBeNull();
  });

  it('does not invent fake domains from ATS boards', async () => {
    const provider = new HackerNewsHiringProvider();

    const shortHit = {
      objectID: '222',
      created_at: '2026-10-06T12:00:00Z',
      // Contains an ATS link but NO primary company website link
      comment_text: 'Apply here: https://boards.greenhouse.io/myunknownco',
    };

    const candidate = await provider.parseComment(shortHit);
    expect(candidate).toBeNull();
  });

  it('rejects candidate if only generic domains like linkedin are present', async () => {
    const provider = new HackerNewsHiringProvider();
    const hit = {
      objectID: '333',
      created_at: '2026-10-06T12:00:00Z',
      comment_text: '<p>Apply at https://linkedin.com/company/acme/jobs or https://github.com/acme</p>',
    };
    expect(await provider.parseComment(hit)).toBeNull();
  });

  it('resolves actual company domain from ATS board if missing from comment', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: '<html><a href="https://actual-company.com">Homepage</a></html>',
      }),
    } as unknown as HttpClient;

    const provider = new HackerNewsHiringProvider(mockHttpClient);
    const hit = {
      objectID: '444',
      created_at: '2026-10-06T12:00:00Z',
      comment_text: '<p>Software Engineer. Apply: https://boards.greenhouse.io/myco</p>',
    };

    const candidate = await provider.parseComment(hit);
    expect(candidate).not.toBeNull();
    expect(candidate!.company_domain).toBe('actual-company.com');
  });
});
