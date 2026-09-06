/**
 * JobPulse 2.0 — Batch T: Mandatory 8-Step Quality Gate & Certification Engine
 * 
 * Execution profiles:
 * - production: pnpm run gates (Standard full gate sequence; fail closed if env missing)
 * - ci:         pnpm run gates:ci (Fast local/PR verification; generates "NOT A PRODUCTION CERTIFICATION")
 * - audit:      pnpm run gates:audit (Authoritative production certification; enforces clean tree & all 8 gates)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { evaluateEnvironmentSafety, EnvironmentSafetyResult } from './environment-safety';

export type GateState = 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIPPED';
export type ExecutionProfile = 'production' | 'ci' | 'audit';

export interface GateResult {
  id: number;
  name: string;
  command: string;
  status: GateState;
  durationMs: number;
  summary: string;
  failureDetails?: string;
}

export interface GitMetadata {
  commitSha: string;
  branch: string;
  isClean: boolean;
  untrackedFiles: string[];
  modifiedFiles: string[];
}

export interface BatchSequenceStatus {
  currentBatch: string;
  prerequisitesMet: boolean;
  permittedNextBatch: string | null;
  details: string;
}

export interface CertificationReport {
  batchName: string;
  executionProfile: ExecutionProfile;
  timestamp: string;
  repository: string;
  git: GitMetadata;
  nodeVersion: string;
  pnpmVersion: string;
  environmentSafety: EnvironmentSafetyResult;
  batchSequence: BatchSequenceStatus;
  totalDurationMs: number;
  gateResults: GateResult[];
  certificationStatus: 'CERTIFIED' | 'NOT CERTIFIED' | 'BLOCKED' | 'NOT A PRODUCTION CERTIFICATION';
  disclaimer: string;
}

const rootDir = process.cwd();

/**
 * Captures Git repository state
 */
export function captureGitState(): GitMetadata {
  try {
    const commitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: rootDir }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: rootDir }).trim();
    const porcelain = execSync('git status --porcelain', { encoding: 'utf-8', cwd: rootDir }).trim();

    const lines = porcelain ? porcelain.split('\n') : [];
    const untrackedFiles = lines.filter(l => l.startsWith('??')).map(l => l.slice(3).trim());
    const modifiedFiles = lines.filter(l => !l.startsWith('??')).map(l => l.slice(3).trim());

    return {
      commitSha,
      branch,
      isClean: lines.length === 0,
      untrackedFiles,
      modifiedFiles,
    };
  } catch (err: any) {
    return {
      commitSha: 'UNKNOWN',
      branch: 'UNKNOWN',
      isClean: false,
      untrackedFiles: [],
      modifiedFiles: [err?.message || 'Git capture failed'],
    };
  }
}

/**
 * Validates batch sequence dependencies from scripts/batch-sequence.json
 */
export function validateBatchSequence(): BatchSequenceStatus {
  const seqFile = path.resolve(rootDir, 'scripts/batch-sequence.json');
  if (!fs.existsSync(seqFile)) {
    return {
      currentBatch: 'T',
      prerequisitesMet: false,
      permittedNextBatch: null,
      details: 'FAIL_CLOSED: scripts/batch-sequence.json missing.',
    };
  }

  try {
    const seqData = JSON.parse(fs.readFileSync(seqFile, 'utf-8'));
    const current = seqData.batches[seqData.currentBatch];
    if (!current) {
      return {
        currentBatch: seqData.currentBatch || 'T',
        prerequisitesMet: false,
        permittedNextBatch: null,
        details: `Current batch ${seqData.currentBatch} not found in sequence.`,
      };
    }

    // For Batch T: prerequisite is Batch R (CERTIFIED). Batch S is explicitly PAUSED per roadmap.
    const rBatch = seqData.batches['R'];
    const sBatch = seqData.batches['S'];
    const rCertified = rBatch && rBatch.status === 'CERTIFIED';
    const sPaused = sBatch && sBatch.status === 'PAUSED';

    if (rCertified && sPaused) {
      return {
        currentBatch: 'T',
        prerequisitesMet: true,
        permittedNextBatch: 'U',
        details: 'Batch R is CERTIFIED; Batch S is explicitly PAUSED; Batch T is permitted to execute.',
      };
    }

    return {
      currentBatch: 'T',
      prerequisitesMet: false,
      permittedNextBatch: null,
      details: `Prerequisites unmet: Batch R status=${rBatch?.status}, Batch S status=${sBatch?.status}`,
    };
  } catch (err: any) {
    return {
      currentBatch: 'T',
      prerequisitesMet: false,
      permittedNextBatch: null,
      details: `Error parsing batch sequence: ${err?.message}`,
    };
  }
}

function getPnpmVersion(): string {
  try {
    return execSync('pnpm -v', { encoding: 'utf-8', cwd: rootDir }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Runs a command and returns status, duration, and output
 */
function executeGateCommand(command: string): { status: GateState; durationMs: number; summary: string; failureDetails?: string } {
  const start = Date.now();
  console.log(`\n▶ [EXEC] ${command}`);

  try {
    const res = spawnSync(command, {
      shell: true,
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes max per gate
    });

    const durationMs = Date.now() - start;
    const stdout = res.stdout || '';
    const stderr = res.stderr || '';

    if (res.status === 0) {
      const summary = (stdout.trim().split('\n').slice(-3).join(' ') || 'Completed successfully.').slice(0, 300);
      return { status: 'PASS', durationMs, summary };
    } else {
      const errorOutput = (stderr || stdout).trim();
      const summary = `Command failed with exit code ${res.status}`;
      const failureDetails = errorOutput.slice(-1500); // Last 1500 chars of failure
      return { status: 'FAIL', durationMs, summary, failureDetails };
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      status: 'FAIL',
      durationMs,
      summary: `Execution threw exception: ${err?.message}`,
      failureDetails: err?.stack || err?.message,
    };
  }
}

export async function runBatchGates() {
  const args = process.argv.slice(2);
  const isCi = args.includes('--ci');
  const isAudit = args.includes('--audit');
  const allowDirty = args.includes('--allow-dirty');

  const profile: ExecutionProfile = isAudit ? 'audit' : isCi ? 'ci' : 'production';

  console.log('================================================================================');
  console.log(` JobPulse 2.0 — Batch T Gate Engine`);
  console.log(` Execution Profile: ${profile.toUpperCase()}`);
  console.log('================================================================================');

  const startTime = Date.now();
  const git = captureGitState();
  const envSafety = evaluateEnvironmentSafety();
  const batchSeq = validateBatchSequence();
  const nodeVersion = process.version;
  const pnpmVersion = getPnpmVersion();

  console.log(`Git Commit:     ${git.commitSha} (${git.branch})`);
  console.log(`Working Tree:   ${git.isClean ? 'CLEAN' : 'DIRTY (' + (git.modifiedFiles.length + git.untrackedFiles.length) + ' modified/untracked files)'}`);
  console.log(`Target Safety:  ${envSafety.safe ? 'PERMITTED (' + envSafety.projectRef + ')' : 'UNSAFE / BLOCKED: ' + envSafety.reason}`);
  console.log(`Batch Sequence: ${batchSeq.prerequisitesMet ? 'VALID (' + batchSeq.details + ')' : 'BLOCKED: ' + batchSeq.details}`);

  // Fail-closed checks in audit mode
  let auditBlocked = false;
  let auditBlockReason = '';

  if (profile === 'audit') {
    if (!git.isClean && !allowDirty) {
      auditBlocked = true;
      auditBlockReason = 'Audit certification requires a clean git working tree. Commit changes or pass --allow-dirty with an explicit justification.';
    } else if (!envSafety.safe) {
      auditBlocked = true;
      auditBlockReason = `Audit certification blocked by environment safety: ${envSafety.reason}`;
    } else if (!envSafety.hasCredentials) {
      auditBlocked = true;
      auditBlockReason = 'Audit certification requires authenticated test credentials (SUPABASE_TEST_SERVICE_ROLE_KEY missing).';
    } else if (!batchSeq.prerequisitesMet) {
      auditBlocked = true;
      auditBlockReason = `Audit certification blocked by batch sequence: ${batchSeq.details}`;
    }
  }

  if (auditBlocked) {
    console.warn(`\n⚠️  [AUDIT_BLOCKED] ${auditBlockReason}`);

    const blockedResults: GateResult[] = [
      { id: 1, name: 'Typecheck Integrity', command: 'pnpm run typecheck', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 2, name: 'Unit & Domain Test Suites', command: 'pnpm run test', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 3, name: 'Integration (Authenticated PostgREST)', command: 'pnpm run test:authenticated', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 4, name: 'Production Build', command: 'pnpm --filter @jobpulse/web build', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 5, name: 'Migration & Schema Integrity', command: 'npx tsx scripts/check-schema-integrity.mjs --audit', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 6, name: 'Security & Tenant Isolation Boundary', command: 'npx vitest run tests/batch-t-security-boundary.test.ts', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 7, name: 'Observability & Operational Truthfulness', command: 'npx vitest run tests/batch-t-observability-truth.test.ts', status: 'BLOCKED', durationMs: 0, summary: auditBlockReason },
      { id: 8, name: 'Evidence & Certification Synthesis', command: 'internal:generate_report', status: 'BLOCKED', durationMs: 0, summary: `Certification BLOCKED: ${auditBlockReason}` },
    ];

    const report: CertificationReport = {
      batchName: 'Batch T — Implementation Sequence & Gates Governance',
      executionProfile: profile,
      timestamp: new Date().toISOString(),
      repository: 'Richiekey/Jobpulse2.0',
      git,
      nodeVersion,
      pnpmVersion,
      environmentSafety: envSafety,
      batchSequence: batchSeq,
      totalDurationMs: Date.now() - startTime,
      gateResults: blockedResults,
      certificationStatus: 'BLOCKED',
      disclaimer: 'Evidence metadata generated by automated gate harness. Commit SHA provides commit point-in-time reference. Not a cryptographic digital signature.',
    };

    const jsonReportPath = path.resolve(rootDir, '.gates-report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

    const auditsDir = path.resolve(rootDir, 'docs/audits');
    if (!fs.existsSync(auditsDir)) fs.mkdirSync(auditsDir, { recursive: true });
    const mdReportPath = path.resolve(auditsDir, 'BATCH_T_CERTIFICATION_EVIDENCE.md');
    fs.writeFileSync(mdReportPath, `# JobPulse 2.0 — Batch T Quality Gate & Certification Evidence\n\n**Batch:** ${report.batchName}  \n**Execution Profile:** \`${profile.toUpperCase()}\`  \n**Certification Status:** **\`BLOCKED\`**  \n**Reason:** ${auditBlockReason}\n\n## Repository State\n- **Git Commit SHA:** \`${git.commitSha}\`\n- **Branch:** \`${git.branch}\`\n- **Working Tree:** ${git.isClean ? 'CLEAN' : 'DIRTY (' + (git.modifiedFiles.length + git.untrackedFiles.length) + ' uncommitted changes)'}\n\n## Safety & Credentials\n- **Safe:** ${envSafety.safe ? 'YES' : 'NO'}\n- **Project Ref:** ${envSafety.projectRef || 'NONE'}\n- **Has Credentials:** ${envSafety.hasCredentials ? 'YES' : 'NO'}\n- **Reason:** ${envSafety.reason}\n`);

    console.log('\n================================================================================');
    console.log(' GATE RUN COMPLETE: BLOCKED');
    console.log(` Reason: ${auditBlockReason}`);
    console.log(` JSON Report: ${jsonReportPath}`);
    console.log(` Markdown Report: ${mdReportPath}`);
    console.log('================================================================================\n');
    process.exit(1);
  }

  const results: GateResult[] = [];

  // ---------------------------------------------------------------------------
  // GATE 1: TYPECHECK
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 1/8] Typecheck Integrity...');
  const g1 = executeGateCommand('pnpm run typecheck');
  results.push({ id: 1, name: 'Typecheck Integrity', command: 'pnpm run typecheck', ...g1 });
  console.log(`[GATE 1] Result: ${g1.status} (${g1.durationMs}ms)`);

  // ---------------------------------------------------------------------------
  // GATE 2: UNIT & DOMAIN TESTS
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 2/8] Package Unit & Domain Test Suites...');
  const g2 = executeGateCommand('pnpm run test');
  results.push({ id: 2, name: 'Unit & Domain Test Suites', command: 'pnpm run test', ...g2 });
  console.log(`[GATE 2] Result: ${g2.status} (${g2.durationMs}ms)`);

  // ---------------------------------------------------------------------------
  // GATE 3: INTEGRATION
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 3/8] Genuine Authenticated Integration Suite...');
  if (profile === 'ci' && !envSafety.safe) {
    results.push({
      id: 3,
      name: 'Integration (Authenticated PostgREST)',
      command: 'pnpm run test:authenticated',
      status: 'SKIPPED',
      durationMs: 0,
      summary: 'Skipped in CI profile (no remote database credentials provided).',
    });
    console.log('[GATE 3] Result: SKIPPED (CI Profile)');
  } else if (!envSafety.safe) {
    results.push({
      id: 3,
      name: 'Integration (Authenticated PostgREST)',
      command: 'pnpm run test:authenticated',
      status: 'BLOCKED',
      durationMs: 0,
      summary: `Blocked by environment safety policy: ${envSafety.reason}`,
      failureDetails: envSafety.reason,
    });
    console.log(`[GATE 3] Result: BLOCKED (${envSafety.reason})`);
  } else {
    const g3 = executeGateCommand('pnpm run test:authenticated');
    results.push({ id: 3, name: 'Integration (Authenticated PostgREST)', command: 'pnpm run test:authenticated', ...g3 });
    console.log(`[GATE 3] Result: ${g3.status} (${g3.durationMs}ms)`);
  }

  // ---------------------------------------------------------------------------
  // GATE 4: PRODUCTION BUILD
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 4/8] Production Build & Asset Packaging...');
  const g4 = executeGateCommand('pnpm --filter @jobpulse/web build');
  results.push({ id: 4, name: 'Production Build', command: 'pnpm --filter @jobpulse/web build', ...g4 });
  console.log(`[GATE 4] Result: ${g4.status} (${g4.durationMs}ms)`);

  // ---------------------------------------------------------------------------
  // GATE 5: MIGRATION & SCHEMA INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 5/8] Migration & Schema Integrity...');
  const schemaCmd = profile === 'audit' ? 'npx tsx scripts/check-schema-integrity.mjs --audit' : 'npx tsx scripts/check-schema-integrity.mjs';
  const g5 = executeGateCommand(schemaCmd);
  results.push({ id: 5, name: 'Migration & Schema Integrity', command: schemaCmd, ...g5 });
  console.log(`[GATE 5] Result: ${g5.status} (${g5.durationMs}ms)`);

  // ---------------------------------------------------------------------------
  // GATE 6: SECURITY & RLS
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 6/8] Security & Tenant Isolation Boundary...');
  if (profile === 'ci' && !envSafety.safe) {
    results.push({
      id: 6,
      name: 'Security & Tenant Isolation Boundary',
      command: 'npx vitest run tests/batch-t-security-boundary.test.ts',
      status: 'SKIPPED',
      durationMs: 0,
      summary: 'Skipped in CI profile (no remote database credentials provided).',
    });
    console.log('[GATE 6] Result: SKIPPED (CI Profile)');
  } else if (!envSafety.safe) {
    results.push({
      id: 6,
      name: 'Security & Tenant Isolation Boundary',
      command: 'npx vitest run tests/batch-t-security-boundary.test.ts',
      status: 'BLOCKED',
      durationMs: 0,
      summary: `Blocked by environment safety policy: ${envSafety.reason}`,
      failureDetails: envSafety.reason,
    });
    console.log(`[GATE 6] Result: BLOCKED (${envSafety.reason})`);
  } else {
    const g6 = executeGateCommand('npx vitest run tests/batch-t-security-boundary.test.ts');
    results.push({ id: 6, name: 'Security & Tenant Isolation Boundary', command: 'npx vitest run tests/batch-t-security-boundary.test.ts', ...g6 });
    console.log(`[GATE 6] Result: ${g6.status} (${g6.durationMs}ms)`);
  }

  // ---------------------------------------------------------------------------
  // GATE 7: OBSERVABILITY & TRUTHFULNESS
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 7/8] Observability & Semantic Truthfulness...');
  if (profile === 'ci' && !envSafety.safe) {
    results.push({
      id: 7,
      name: 'Observability & Operational Truthfulness',
      command: 'npx vitest run tests/batch-t-observability-truth.test.ts',
      status: 'SKIPPED',
      durationMs: 0,
      summary: 'Skipped in CI profile (no remote database credentials provided).',
    });
    console.log('[GATE 7] Result: SKIPPED (CI Profile)');
  } else if (!envSafety.safe) {
    results.push({
      id: 7,
      name: 'Observability & Operational Truthfulness',
      command: 'npx vitest run tests/batch-t-observability-truth.test.ts',
      status: 'BLOCKED',
      durationMs: 0,
      summary: `Blocked by environment safety policy: ${envSafety.reason}`,
      failureDetails: envSafety.reason,
    });
    console.log(`[GATE 7] Result: BLOCKED (${envSafety.reason})`);
  } else {
    const g7 = executeGateCommand('npx vitest run tests/batch-t-observability-truth.test.ts');
    results.push({ id: 7, name: 'Observability & Operational Truthfulness', command: 'npx vitest run tests/batch-t-observability-truth.test.ts', ...g7 });
    console.log(`[GATE 7] Result: ${g7.status} (${g7.durationMs}ms)`);
  }

  // ---------------------------------------------------------------------------
  // GATE 8: EVIDENCE & CERTIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n[GATE 8/8] Evidence Generation & Certification Status Evaluation...');
  const totalDurationMs = Date.now() - startTime;

  // Compute final certification status
  let finalStatus: CertificationReport['certificationStatus'];

  const hasFails = results.some(r => r.status === 'FAIL');
  const hasBlocks = results.some(r => r.status === 'BLOCKED') || !envSafety.safe || !batchSeq.prerequisitesMet;
  const hasSkips = results.some(r => r.status === 'SKIPPED');

  if (profile === 'ci') {
    finalStatus = hasFails ? 'FAIL' : 'NOT A PRODUCTION CERTIFICATION';
  } else if (hasFails) {
    finalStatus = 'FAIL';
  } else if (hasBlocks) {
    finalStatus = 'BLOCKED';
  } else if (hasSkips) {
    // In production or audit mode, skips are not allowed for certification
    finalStatus = 'NOT CERTIFIED';
  } else if (envSafety.safe && envSafety.hasCredentials && batchSeq.prerequisitesMet) {
    if (profile === 'audit' && !git.isClean && !allowDirty) {
      finalStatus = 'BLOCKED';
    } else {
      finalStatus = 'CERTIFIED';
    }
  } else {
    finalStatus = 'NOT CERTIFIED';
  }

  results.push({
    id: 8,
    name: 'Evidence & Certification Synthesis',
    command: 'internal:generate_report',
    status: finalStatus === 'CERTIFIED' || finalStatus === 'NOT A PRODUCTION CERTIFICATION' ? 'PASS' : finalStatus === 'BLOCKED' ? 'BLOCKED' : 'FAIL',
    durationMs: Date.now() - startTime - totalDurationMs,
    summary: `Synthesized report with status: ${finalStatus}`,
  });

  const report: CertificationReport = {
    batchName: 'Batch T — Implementation Sequence & Gates Governance',
    executionProfile: profile,
    timestamp: new Date().toISOString(),
    repository: 'Richiekey/Jobpulse2.0',
    git,
    nodeVersion,
    pnpmVersion,
    environmentSafety: envSafety,
    batchSequence: batchSeq,
    totalDurationMs,
    gateResults: results,
    certificationStatus: finalStatus,
    disclaimer: 'Evidence metadata generated by automated gate harness. Commit SHA provides commit point-in-time reference. Not a cryptographic digital signature.',
  };

  // Write JSON report
  const jsonReportPath = path.resolve(rootDir, '.gates-report.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

  // Write Markdown audit evidence
  const auditsDir = path.resolve(rootDir, 'docs/audits');
  if (!fs.existsSync(auditsDir)) {
    fs.mkdirSync(auditsDir, { recursive: true });
  }

  const mdReportPath = path.resolve(auditsDir, 'BATCH_T_CERTIFICATION_EVIDENCE.md');
  const mdContent = `# JobPulse 2.0 — Batch T Quality Gate & Certification Evidence

**Batch:** ${report.batchName}  
**Execution Profile:** \`${report.executionProfile.toUpperCase()}\`  
**Certification Status:** **\`${report.certificationStatus}\`**  
**Execution Timestamp:** ${report.timestamp}  
**Total Duration:** ${(report.totalDurationMs / 1000).toFixed(2)}s  

---

## 1. Repository & Execution Environment
- **Repository:** \`${report.repository}\`
- **Git Commit SHA:** \`${report.git.commitSha}\` (metadata point-in-time reference)
- **Branch / Ref:** \`${report.git.branch}\`
- **Working Tree:** ${report.git.isClean ? 'Clean (0 uncommitted changes)' : 'Dirty (' + (report.git.modifiedFiles.length + report.git.untrackedFiles.length) + ' uncommitted changes)'}
- **Runtime:** Node \`${report.nodeVersion}\`, pnpm \`${report.pnpmVersion}\`
- **Environment Safety:** ${report.environmentSafety.safe ? 'PERMITTED (Target ref: `' + report.environmentSafety.projectRef + '`)' : 'BLOCKED (' + report.environmentSafety.reason + ')'}
- **Batch Sequence:** ${report.batchSequence.prerequisitesMet ? 'VALID (' + report.batchSequence.details + ')' : 'BLOCKED (' + report.batchSequence.details + ')'}

---

## 2. Gate Results Summary

| Gate | Name | Command | Status | Duration | Summary |
|---|---|---|---|---|---|
${report.gateResults.map(r => `| **Gate ${r.id}** | ${r.name} | \`${r.command}\` | **\`${r.status}\`** | ${(r.durationMs / 1000).toFixed(2)}s | ${r.summary.replace(/\|/g, '/')} |`).join('\n')}

---

## 3. Detailed Failure Diagnostic (if any)
${report.gateResults.filter(r => r.status === 'FAIL' || r.status === 'BLOCKED').map(r => `### Gate ${r.id}: ${r.name} (${r.status})
- **Command:** \`${r.command}\`
- **Summary:** ${r.summary}
\`\`\`
${r.failureDetails || 'No additional stack trace captured.'}
\`\`\`
`).join('\n') || 'Zero failures detected. All evaluated gates satisfied requirements.'}

---

## 4. Governance & Sequence Rule Verification
- **Sequence:** \`S [PAUSED] → T → U → V → W → X → Y\`
- **Batch T Status:** ${report.certificationStatus === 'CERTIFIED' ? 'CERTIFIED' : 'PENDING'}
- **Batch U Permitted:** ${report.certificationStatus === 'CERTIFIED' ? 'YES (Unlocked)' : 'NO (Blocked until T is certified)'}

---

## 5. Certification Audit Disclaimer
> ${report.disclaimer}
`;

  fs.writeFileSync(mdReportPath, mdContent);

  console.log('\n================================================================================');
  console.log(` GATE RUN COMPLETE: ${finalStatus}`);
  console.log(` Total Time: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(` JSON Report: ${jsonReportPath}`);
  console.log(` Markdown Report: ${mdReportPath}`);
  console.log('================================================================================\n');

  if (finalStatus === 'FAIL' || finalStatus === 'BLOCKED') {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run-batch-gates.ts')) {
  runBatchGates().catch((err) => {
    console.error('Fatal gate engine error:', err);
    process.exit(1);
  });
}
