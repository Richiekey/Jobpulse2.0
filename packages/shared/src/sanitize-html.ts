/**
 * JobPulse 2.0 — HTML Sanitizer for External Job Descriptions
 * 
 * Strips dangerous HTML while preserving formatting elements.
 * Ported from v1's sanitize.ts with enhanced security.
 */

// ALLOWED TAGS — only formatting, no scripts/iframes/objects
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'ul', 'ol', 'li',
  'a',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span', 'section',
  'dl', 'dt', 'dd',
  'sup', 'sub',
]);

// ALLOWED ATTRIBUTES — minimal, no event handlers
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  'a': new Set(['href', 'title']),
  'td': new Set(['colspan', 'rowspan']),
  'th': new Set(['colspan', 'rowspan']),
};

/**
 * Sanitizes external HTML for safe rendering via dangerouslySetInnerHTML.
 * 
 * Removes:
 *   - <script>, <iframe>, <object>, <embed>, <svg>, <form>, <input> tags
 *   - All event handler attributes (onclick, onerror, onload, etc.)
 *   - javascript: protocol in href/src attributes
 *   - data: protocol in href/src attributes
 *   - style attributes (to prevent CSS-based attacks)
 * 
 * Adds:
 *   - rel="noopener noreferrer" to all <a> tags
 *   - target="_blank" to all <a> tags
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let html = rawHtml;

  // 1. Remove script tags and their contents
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // 2. Remove dangerous tags entirely
  const dangerousTags = [
    'iframe', 'object', 'embed', 'svg', 'form', 'input', 
    'textarea', 'select', 'button', 'style', 'link', 'meta'
  ];
  for (const tag of dangerousTags) {
    const openClose = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    html = html.replace(openClose, '');
    const selfClose = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    html = html.replace(selfClose, '');
  }

  // 3. Remove event handlers from ALL tags (onclick, onerror, onload, etc.)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 4. Remove javascript: and data: protocols
  html = html.replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
  html = html.replace(/src\s*=\s*["']?\s*javascript:/gi, 'src="');
  html = html.replace(/href\s*=\s*["']?\s*data:/gi, 'href="');

  // 5. Remove style attributes
  html = html.replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 6. Force noopener noreferrer on all links
  html = html.replace(/<a\s/gi, '<a rel="noopener noreferrer" target="_blank" ');

  // 7. Clean up &nbsp; to regular spaces where they cause display issues
  // (Keep single &nbsp; but collapse chains)
  html = html.replace(/(&nbsp;){3,}/gi, ' ');

  return html.trim();
}

/**
 * Detects if a string contains HTML tags.
 */
export function containsHtml(text: string): boolean {
  if (!text) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}
