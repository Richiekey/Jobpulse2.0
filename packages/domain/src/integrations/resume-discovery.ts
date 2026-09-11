/**
 * Resume Discovery Engine
 *
 * Matches a user's generated resume in a configured Google Drive folder
 * based on applicant name and company name. Implements cover letter exclusion,
 * document type filtering, scoring, and deterministic selection.
 */

import { listFilesInFolder, type GoogleDriveFile } from './google-drive.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResumeDiscoveryInput {
  accessToken: string;
  folderId: string;
  applicantName: string;
  companyName: string;
  fetchFn?: typeof fetch;
}

export interface GoogleDriveResumeCandidate {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  score: number;
}

// ─── Cover Letter Exclusion ──────────────────────────────────────────────────

const COVER_LETTER_PATTERNS = [
  'cover letter',
  'coverletter',
  'cover_letter',
];

/**
 * Returns true if the filename indicates this is a cover letter.
 * Matches normalized lowercase filenames against exclusion patterns.
 */
export function isCoverLetter(filename: string): boolean {
  const normalized = filename.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  return COVER_LETTER_PATTERNS.some(
    (pattern) => normalized.includes(pattern.replace(/[-_]/g, ' '))
  );
}

// ─── Supported Document Check ────────────────────────────────────────────────

const SUPPORTED_MIMETYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx']);

/**
 * Validates that a file is a PDF or DOCX based on mimeType and/or file extension.
 */
export function isSupportedDocument(
  mimeType?: string,
  filename?: string
): boolean {
  if (mimeType && SUPPORTED_MIMETYPES.has(mimeType)) {
    return true;
  }
  if (filename) {
    const lower = filename.toLowerCase();
    for (const ext of SUPPORTED_EXTENSIONS) {
      if (lower.endsWith(ext)) return true;
    }
  }
  return false;
}

// ─── Name Normalization ──────────────────────────────────────────────────────

/**
 * Normalizes a candidate filename or applicant name for fuzzy matching.
 * - Strips file extensions (.pdf, .docx)
 * - Strips duplicate suffixes like (2), (28)
 * - Converts to lowercase
 * - Normalizes whitespace and separator chars
 */
export function normalizeCandidateName(str: string): string {
  let s = str;

  // Strip common file extensions
  s = s.replace(/\.(pdf|docx|doc)$/i, '');

  // Strip trailing parenthesized numbers like (2), (28)
  s = s.replace(/\s*\(\d+\)\s*$/, '');

  // Lowercase
  s = s.toLowerCase();

  // Normalize separators to spaces
  s = s.replace(/[-_]/g, ' ');

  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Scores a resume candidate file against the applicant's name and company name.
 *
 * Scoring breakdown:
 *   +50  if applicant name tokens appear in the filename
 *   +30  if company name appears in the filename
 *   +10  if the file is a PDF (preferred format)
 *   +0-10 recency bonus based on modifiedTime
 *
 * Returns 0 if the file fails basic eligibility (cover letter, unsupported type).
 */
export function scoreResumeCandidate(
  candidate: GoogleDriveFile,
  applicantName: string,
  companyName: string
): number {
  const filename = candidate.name || '';

  // Hard disqualifiers
  if (isCoverLetter(filename)) return 0;
  if (!isSupportedDocument(candidate.mimeType, filename)) return 0;

  const normalizedFilename = normalizeCandidateName(filename);
  const normalizedApplicant = normalizeCandidateName(applicantName);
  const normalizedCompany = normalizeCandidateName(companyName);

  let score = 0;

  // Applicant name match: check if all name tokens appear in filename
  if (normalizedApplicant) {
    const nameTokens = normalizedApplicant.split(' ').filter((t) => t.length > 1);
    const allMatch = nameTokens.length > 0 && nameTokens.every(
      (token) => normalizedFilename.includes(token)
    );
    if (allMatch) score += 50;
  }

  // Company name match
  if (normalizedCompany && normalizedFilename.includes(normalizedCompany)) {
    score += 30;
  }

  // Format bonus: prefer PDF
  if (candidate.mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    score += 10;
  }

  // Recency bonus (0-10 points)
  if (candidate.modifiedTime) {
    const ageMs = Date.now() - new Date(candidate.modifiedTime).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) {
      score += 10;
    } else if (ageHours < 24) {
      score += 7;
    } else if (ageHours < 168) { // 7 days
      score += 4;
    } else {
      score += 1;
    }
  }

  return score;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * Discovers the best matching resume in a Google Drive folder.
 *
 * Process:
 * 1. Lists all files in the configured folder
 * 2. Filters out cover letters and unsupported file types
 * 3. Scores remaining candidates on name/company match, format, recency
 * 4. Returns the highest-scoring candidate or null if no match found
 *
 * Deterministic: when scores tie, the most recently modified file wins.
 */
export async function findMatchingResume(
  input: ResumeDiscoveryInput,
  fetchFn?: typeof fetch
): Promise<GoogleDriveResumeCandidate | null> {
  const effectiveFetchFn = input.fetchFn || fetchFn || fetch;

  const files = await listFilesInFolder(
    input.accessToken,
    input.folderId,
    effectiveFetchFn
  );

  if (!files || files.length === 0) {
    return null;
  }

  let bestCandidate: GoogleDriveResumeCandidate | null = null;
  let bestScore = 0;

  for (const file of files) {
    const score = scoreResumeCandidate(file, input.applicantName, input.companyName);
    if (score <= 0) continue;

    // Deterministic tie-breaking: prefer most recently modified
    if (
      score > bestScore ||
      (score === bestScore &&
        file.modifiedTime &&
        bestCandidate?.modifiedTime &&
        new Date(file.modifiedTime).getTime() > new Date(bestCandidate.modifiedTime).getTime())
    ) {
      bestScore = score;
      bestCandidate = {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        score,
      };
    }
  }

  return bestCandidate;
}
