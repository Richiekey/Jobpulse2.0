import { describe, it, expect } from 'vitest';
import { evaluateBatchPrerequisites } from '../scripts/run-batch-gates';

describe('Batch T — Generic Batch Sequence Evaluator Tests', () => {
  const mockSequenceData = {
    currentBatch: 'T',
    batches: {
      R: { name: 'Operational Intelligence', status: 'CERTIFIED', prerequisites: [] },
      S: { name: 'AI Layer', status: 'PAUSED', prerequisites: ['R'] },
      T: {
        name: 'Implementation Sequence & Gates Governance',
        status: 'IN_PROGRESS',
        prerequisites: [
          { batch: 'R', status: 'CERTIFIED' },
          { batch: 'S', status: 'PAUSED' },
        ],
      },
      U: {
        name: 'Product UX/UI',
        status: 'BLOCKED',
        prerequisites: [{ batch: 'T', status: 'CERTIFIED' }],
      },
      V: {
        name: 'Production Reliability',
        status: 'BLOCKED',
        prerequisites: [{ batch: 'U', status: 'CERTIFIED' }],
      },
    },
  };

  it('Batch T: executable when prerequisite R is CERTIFIED and S is PAUSED', () => {
    const res = evaluateBatchPrerequisites('T', mockSequenceData);
    expect(res.executable).toBe(true);
    expect(res.permittedNextBatch).toBe('U');
    expect(res.reason).toContain('All prerequisites satisfied');
  });

  it('Batch S: fails closed when target batch is explicitly PAUSED', () => {
    const res = evaluateBatchPrerequisites('S', mockSequenceData);
    expect(res.executable).toBe(false);
    expect(res.reason).toContain('explicitly PAUSED');
    expect(res.reason).toContain('Gate execution is prohibited');
  });

  it('Batch U: blocked when prerequisite T is IN_PROGRESS (not CERTIFIED)', () => {
    const res = evaluateBatchPrerequisites('U', mockSequenceData);
    expect(res.executable).toBe(false);
    expect(res.reason).toContain("Prerequisite batch T has status 'IN_PROGRESS', but 'CERTIFIED' is required");
  });

  it('Batch V: blocked when prerequisite U is only PERMITTED (not CERTIFIED)', () => {
    const seqWithPermittedU = {
      ...mockSequenceData,
      batches: {
        ...mockSequenceData.batches,
        T: { ...mockSequenceData.batches.T, status: 'CERTIFIED' },
        U: { ...mockSequenceData.batches.U, status: 'PERMITTED' },
      },
    };

    // U is PERMITTED, but V strictly requires U = CERTIFIED
    const res = evaluateBatchPrerequisites('V', seqWithPermittedU);
    expect(res.executable).toBe(false);
    expect(res.reason).toContain("Prerequisite batch U has status 'PERMITTED', but 'CERTIFIED' is required");
  });

  it('Batch V: unlocked when prerequisite U becomes CERTIFIED', () => {
    const seqWithCertifiedU = {
      ...mockSequenceData,
      batches: {
        ...mockSequenceData.batches,
        T: { ...mockSequenceData.batches.T, status: 'CERTIFIED' },
        U: { ...mockSequenceData.batches.U, status: 'CERTIFIED' },
      },
    };

    const res = evaluateBatchPrerequisites('V', seqWithCertifiedU);
    expect(res.executable).toBe(true);
    expect(res.reason).toContain('All prerequisites satisfied');
  });

  it('Unknown batch: fails closed with error when batch not defined', () => {
    const res = evaluateBatchPrerequisites('Z_UNKNOWN', mockSequenceData);
    expect(res.executable).toBe(false);
    expect(res.reason).toContain('not found in batch-sequence.json');
  });
});
