import { describe, it, expect } from 'vitest';
import { sanitizeHtml, containsHtml } from '../src/sanitize-html';

describe('HTML Sanitizer for External Job Descriptions (Task 0.2)', () => {
  it('strips script tags and contents completely', () => {
    const raw = "<p><strong>Role</strong></p><script>alert('xss')</script>";
    expect(sanitizeHtml(raw)).toBe('<p><strong>Role</strong></p>');
  });

  it('strips dangerous tags like iframe, object, embed, form, input', () => {
    const raw = "<p>Description</p><iframe src='https://evil.com'></iframe><input type='text' />";
    expect(sanitizeHtml(raw)).toBe('<p>Description</p>');
  });

  it('strips event handler attributes from tags', () => {
    const raw = '<button onclick="evil()" onmouseover="track()">Click me</button>';
    expect(sanitizeHtml(raw)).toBe('');
    const div = '<div onclick="evil()">Safe text</div>';
    expect(sanitizeHtml(div)).toBe('<div>Safe text</div>');
  });

  it('strips javascript: and data: pseudo-protocols from links', () => {
    const raw = '<a href="javascript:alert(1)">Exploit</a>';
    const sanitized = sanitizeHtml(raw);
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).toContain('rel="noopener noreferrer"');
    expect(sanitized).toContain('target="_blank"');
  });

  it('preserves valid formatting tags like p, strong, ul, li, h1-h6', () => {
    const raw = '<h3>Job Requirements</h3><ul><li>5+ years React</li><li>TypeScript</li></ul>';
    expect(sanitizeHtml(raw)).toBe('<h3>Job Requirements</h3><ul><li>5+ years React</li><li>TypeScript</li></ul>');
  });

  it('detects strings containing HTML tags via containsHtml', () => {
    expect(containsHtml('<p>Hello world</p>')).toBe(true);
    expect(containsHtml('<strong>Senior Engineer</strong>')).toBe(true);
    expect(containsHtml('Plain text description without any HTML')).toBe(false);
    expect(containsHtml('')).toBe(false);
  });
});
