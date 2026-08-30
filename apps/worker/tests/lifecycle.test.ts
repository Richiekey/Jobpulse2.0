import { describe, it, expect, vi } from 'vitest';
import { validateWorkerEnvironment, GracefulShutdownManager } from '../src/lifecycle.js';

describe('Worker Lifecycle & Resilience (Batch I Remediation)', () => {
  describe('Environment Validation (P0-1 & P0-2)', () => {
    it('passes validation when valid Supabase URL, service role key, and worker secret are present', () => {
      const validEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_service_role_token',
        WORKER_SECRET_TOKEN: 'custom_strong_worker_secret_9988',
      };

      const result = validateWorkerEnvironment(validEnv);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing or empty NEXT_PUBLIC_SUPABASE_URL', () => {
      const invalidEnv = {
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_key_123',
        WORKER_SECRET_TOKEN: 'custom_token_123',
      };

      const result = validateWorkerEnvironment(invalidEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_SUPABASE_URL'))).toBe(true);
    });

    it('rejects whitespace-only variables', () => {
      const invalidEnv = {
        NEXT_PUBLIC_SUPABASE_URL: '   ',
        SUPABASE_SERVICE_ROLE_KEY: '   ',
        WORKER_SECRET_TOKEN: '   ',
      };

      const result = validateWorkerEnvironment(invalidEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects invalid URL format for NEXT_PUBLIC_SUPABASE_URL', () => {
      const invalidEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_key_123',
        WORKER_SECRET_TOKEN: 'custom_token_123',
      };

      const result = validateWorkerEnvironment(invalidEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('valid HTTP/HTTPS URL'))).toBe(true);
    });

    it('rejects missing SUPABASE_SERVICE_ROLE_KEY even if NEXT_PUBLIC_SUPABASE_ANON_KEY is present (No Anon Substitute)', () => {
      const anonOnlyEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon_key_only',
        WORKER_SECRET_TOKEN: 'custom_token_123',
      };

      const result = validateWorkerEnvironment(anonOnlyEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('SUPABASE_SERVICE_ROLE_KEY is required'))).toBe(true);
    });

    it('rejects placeholder SUPABASE_SERVICE_ROLE_KEY', () => {
      const placeholderEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'your_supabase_service_role_key_here',
        WORKER_SECRET_TOKEN: 'custom_token_123',
      };

      const result = validateWorkerEnvironment(placeholderEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('placeholder credentials'))).toBe(true);
    });

    it('rejects missing WORKER_SECRET_TOKEN', () => {
      const missingTokenEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_service_role_key',
      };

      const result = validateWorkerEnvironment(missingTokenEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('WORKER_SECRET_TOKEN is required'))).toBe(true);
    });

    it('rejects known default WORKER_SECRET_TOKEN (jp_worker_internal_2026)', () => {
      const defaultTokenEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_service_role_key',
        WORKER_SECRET_TOKEN: 'jp_worker_internal_2026',
      };

      const result = validateWorkerEnvironment(defaultTokenEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('known default or placeholder secret'))).toBe(true);
    });
  });

  describe('Graceful Shutdown & Task Drainage (P2-4 & P1)', () => {
    it('allows task registration and clean release during normal operation', () => {
      const manager = new GracefulShutdownManager();
      expect(manager.getActiveTaskCount()).toBe(0);

      const release1 = manager.registerTask();
      const release2 = manager.registerTask();
      expect(manager.getActiveTaskCount()).toBe(2);

      release1();
      expect(manager.getActiveTaskCount()).toBe(1);

      release2();
      expect(manager.getActiveTaskCount()).toBe(0);
    });

    it('safely handles double release calls without corrupting the active task counter', () => {
      const manager = new GracefulShutdownManager();
      const release = manager.registerTask();
      expect(manager.getActiveTaskCount()).toBe(1);

      release();
      expect(manager.getActiveTaskCount()).toBe(0);

      // Second release call is a no-op and must not decrement below 0
      release();
      expect(manager.getActiveTaskCount()).toBe(0);
    });

    it('drains active tasks when SIGTERM is received and exits cleanly', async () => {
      const manager = new GracefulShutdownManager({ hardTimeoutMs: 2000, drainCheckIntervalMs: 50 });
      const releaseTask = manager.registerTask();
      expect(manager.getActiveTaskCount()).toBe(1);

      // Complete active task after 100ms
      setTimeout(() => {
        releaseTask();
      }, 100);

      const shutdownPromise = manager.initiateShutdown('SIGTERM');
      expect(manager.isShutdownRequested()).toBe(true);

      // Subsequent task registration is rejected
      expect(() => manager.registerTask()).toThrow('Worker is shutting down');

      const result = await shutdownPromise;
      expect(result.clean).toBe(true);
      expect(result.activeTasksRemaining).toBe(0);
      expect(manager.getActiveTaskCount()).toBe(0);
    });

    it('drains multiple concurrent active tasks cleanly', async () => {
      const manager = new GracefulShutdownManager({ hardTimeoutMs: 2000, drainCheckIntervalMs: 50 });
      const release1 = manager.registerTask();
      const release2 = manager.registerTask();
      const release3 = manager.registerTask();
      expect(manager.getActiveTaskCount()).toBe(3);

      setTimeout(() => release1(), 50);
      setTimeout(() => release2(), 100);
      setTimeout(() => release3(), 150);

      const result = await manager.initiateShutdown('SIGTERM');
      expect(result.clean).toBe(true);
      expect(result.activeTasksRemaining).toBe(0);
    });

    it('handles immediate shutdown when zero active tasks are running', async () => {
      const manager = new GracefulShutdownManager();
      expect(manager.getActiveTaskCount()).toBe(0);

      const result = await manager.initiateShutdown('SIGINT');
      expect(result.clean).toBe(true);
      expect(result.activeTasksRemaining).toBe(0);
      expect(manager.isShutdownRequested()).toBe(true);
    });

    it('handles repeated signals without crashing and preserves single shutdown sequence', async () => {
      const manager = new GracefulShutdownManager({ hardTimeoutMs: 500, drainCheckIntervalMs: 20 });
      const shutdownPromise = manager.initiateShutdown('SIGTERM');

      // Second signal while first is draining
      await manager.initiateShutdown('SIGTERM');
      const result = await shutdownPromise;
      expect(result.clean).toBe(true);
      expect(manager.isShutdownRequested()).toBe(true);
    });

    it('distinguishes forced termination after hard safety timeout when tasks do not complete', async () => {
      // 200ms hard timeout with an unfinished task
      const manager = new GracefulShutdownManager({ hardTimeoutMs: 200, drainCheckIntervalMs: 20 });
      const _unreleasedTask = manager.registerTask();
      expect(manager.getActiveTaskCount()).toBe(1);

      const result = await manager.initiateShutdown('SIGTERM');
      expect(result.clean).toBe(false); // Forced termination, not clean drain
      expect(result.activeTasksRemaining).toBe(1);
    });
  });
});
