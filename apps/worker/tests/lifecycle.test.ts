import { describe, it, expect, vi } from 'vitest';
import { validateWorkerEnvironment, GracefulShutdownManager } from '../src/lifecycle.js';

describe('Worker Lifecycle & Resilience (Batch I Remediation)', () => {
  describe('Environment Validation (P0-5)', () => {
    it('passes validation when valid Supabase URL and service role key are present', () => {
      const validEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://rgwutmthzigjmzsmmjnp.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid_service_role_token',
      };

      const result = validateWorkerEnvironment(validEnv);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing or empty NEXT_PUBLIC_SUPABASE_URL', () => {
      const invalidEnv = {
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_key_123',
      };

      const result = validateWorkerEnvironment(invalidEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('NEXT_PUBLIC_SUPABASE_URL'))).toBe(true);
    });

    it('rejects invalid URL format for NEXT_PUBLIC_SUPABASE_URL', () => {
      const invalidEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
        SUPABASE_SERVICE_ROLE_KEY: 'valid_key_123',
      };

      const result = validateWorkerEnvironment(invalidEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('valid HTTP/HTTPS URL'))).toBe(true);
    });

    it('rejects placeholder SUPABASE_SERVICE_ROLE_KEY', () => {
      const placeholderEnv = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://rgwutmthzigjmzsmmjnp.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'your_supabase_service_role_key_here',
      };

      const result = validateWorkerEnvironment(placeholderEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('placeholder credentials'))).toBe(true);
    });
  });

  describe('Graceful Shutdown & Task Drainage (P2-4)', () => {
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

      await shutdownPromise;
      expect(manager.getActiveTaskCount()).toBe(0);
    });

    it('handles immediate shutdown when zero active tasks are running', async () => {
      const manager = new GracefulShutdownManager();
      expect(manager.getActiveTaskCount()).toBe(0);

      await manager.initiateShutdown('SIGINT');
      expect(manager.isShutdownRequested()).toBe(true);
    });

    it('handles repeated signals without crashing', async () => {
      const manager = new GracefulShutdownManager({ hardTimeoutMs: 500, drainCheckIntervalMs: 20 });
      const shutdownPromise = manager.initiateShutdown('SIGTERM');

      // Second signal while first is draining
      await manager.initiateShutdown('SIGTERM');
      await shutdownPromise;
      expect(manager.isShutdownRequested()).toBe(true);
    });
  });
});
