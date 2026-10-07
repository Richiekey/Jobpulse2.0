import { describe, it, expect } from 'vitest';
import { RetryClassifier } from '../src/retry-classifier.js';

describe('RetryClassifier (MC-4)', () => {
  const classifier = new RetryClassifier({
    maxTransientAttempts: 3,
    baseBackoffMs: 1000,
    maxBackoffMs: 10000,
  });

  describe('Transient Errors', () => {
    it('classifies HTTP 429 rate limit as TRANSIENT with backoff when under limit', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const decision = classifier.classify(error, 'trial_crawl', 1);

      expect(decision.classification).toBe('TRANSIENT');
      expect(decision.shouldRetry).toBe(true);
      expect(decision.nextRetryDelayMs).toBeGreaterThan(500);
      expect(decision.reason).toContain('rate-limiting');
    });

    it('classifies HTTP 503 as TRANSIENT', () => {
      const error = new Error('HTTP 503 Service Unavailable');
      const decision = classifier.classify(error, 'verification', 2);

      expect(decision.classification).toBe('TRANSIENT');
      expect(decision.shouldRetry).toBe(true);
    });

    it('classifies network timeouts (ETIMEDOUT, ECONNRESET) as TRANSIENT', () => {
      const error = new Error('connect ETIMEDOUT 192.168.1.1:443');
      const decision = classifier.classify(error, 'trial_crawl', 1);

      expect(decision.classification).toBe('TRANSIENT');
      expect(decision.shouldRetry).toBe(true);
    });

    it('classifies circuit breaker open as TRANSIENT', () => {
      const error = new Error('Circuit breaker open for domain example.com');
      const decision = classifier.classify(error, 'verification', 1);

      expect(decision.classification).toBe('TRANSIENT');
      expect(decision.shouldRetry).toBe(true);
    });

    it('transitions to FATAL when maxTransientAttempts exceeded', () => {
      const error = { status: 429, message: 'Too Many Requests' };
      const decision = classifier.classify(error, 'trial_crawl', 3);

      expect(decision.classification).toBe('FATAL');
      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextRetryDelayMs).toBe(0);
      expect(decision.reason).toContain('Max attempts exceeded');
    });
  });

  describe('Fatal Errors', () => {
    it('classifies HTTP 404 as FATAL without retry', () => {
      const error = { status: 404, message: 'Not Found' };
      const decision = classifier.classify(error, 'verification', 1);

      expect(decision.classification).toBe('FATAL');
      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextRetryDelayMs).toBe(0);
    });

    it('classifies board not found as FATAL', () => {
      const error = new Error('ATS board not found: non-existent-board');
      const decision = classifier.classify(error, 'adapter_resolution', 1);

      expect(decision.classification).toBe('FATAL');
      expect(decision.shouldRetry).toBe(false);
    });

    it('classifies schema / parse errors as FATAL', () => {
      const error = new Error('Invalid HTML payload / unparseable response');
      const decision = classifier.classify(error, 'trial_crawl', 1);

      expect(decision.classification).toBe('FATAL');
      expect(decision.shouldRetry).toBe(false);
    });
  });

  describe('Terminal State / DB Conflict Errors', () => {
    it('classifies Postgres 23505 unique violation as TERMINAL_STATE', () => {
      const error = { code: '23505', message: 'duplicate key value violates unique constraint uq_company_source' };
      const decision = classifier.classify(error, 'promotion', 1);

      expect(decision.classification).toBe('TERMINAL_STATE');
      expect(decision.shouldRetry).toBe(false);
      expect(decision.nextRetryDelayMs).toBe(0);
      expect(decision.reason).toContain('already exists');
    });

    it('classifies HTTP 409 conflict as TERMINAL_STATE', () => {
      const error = { status: 409, message: 'Conflict: resource already reconciled' };
      const decision = classifier.classify(error, 'promotion', 1);

      expect(decision.classification).toBe('TERMINAL_STATE');
      expect(decision.shouldRetry).toBe(false);
    });
  });

  describe('Backoff Calculation', () => {
    it('calculates exponential backoff with jitter and respects max cap', () => {
      const delay1 = classifier.calculateBackoff(1);
      const delay2 = classifier.calculateBackoff(2);
      const delay3 = classifier.calculateBackoff(3);

      expect(delay1).toBeGreaterThanOrEqual(800);
      expect(delay2).toBeGreaterThanOrEqual(1600);
      expect(delay3).toBeGreaterThanOrEqual(3200);

      // Respects maxBackoffMs cap (10000)
      const delay10 = classifier.calculateBackoff(10);
      expect(delay10).toBeLessThanOrEqual(13000); // 10000 + 20% max jitter
    });
  });
});
