import type React from 'react';

/**
 * Screen-reader-only CSS properties for visually hiding elements
 * while preserving accessibility for assistive technologies (WCAG 2.1).
 * Matches the canonical `.sr-only` utility in globals.css.
 */
export const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
};
