import { describe, it, expect } from 'vitest';
import { ApiResponse } from '../lib/api-response.js';

describe('ApiResponse Sanitization & Security (P1.16)', () => {
  it('generates secure unique request IDs with req_ prefix', () => {
    const req1 = ApiResponse.generateRequestId();
    const req2 = ApiResponse.generateRequestId();

    expect(req1).toMatch(/^req_[0-9a-f]{16}$/);
    expect(req2).toMatch(/^req_[0-9a-f]{16}$/);
    expect(req1).not.toBe(req2);
  });

  it('formats success responses with metadata and request IDs', async () => {
    const res = ApiResponse.success({ message: 'Success' }, { total: 100 });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.message).toBe('Success');
    expect(json.meta.total).toBe(100);
    expect(json.meta.requestId).toMatch(/^req_[0-9a-f]{16}$/);
  });

  it('sanitizes internal errors and prevents leaking database error details to client', async () => {
    const rawDbError = new Error('syntax error at or near "SELECT" column "password_hash" does not exist in table users');
    const res = ApiResponse.error('An error occurred while loading your profile.', rawDbError, 500);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('An error occurred while loading your profile.');
    expect(json.requestId).toMatch(/^req_[0-9a-f]{16}$/);

    // Internal SQL error details MUST NOT be exposed in the client response
    expect(JSON.stringify(json)).not.toContain('password_hash');
    expect(JSON.stringify(json)).not.toContain('syntax error');
  });
});
