import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptToken,
  decryptToken,
  resolveEncryptionKey,
} from '../src/security/encryption.js';
import crypto from 'node:crypto';

describe('AES-256-GCM Token Encryption Security (Batch N)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('successfully encrypts and decrypts a sensitive token with default key', () => {
    const sensitiveRefreshToken = '1//0gABC_mock_google_oauth_refresh_token_1234567890';
    const encrypted = encryptToken(sensitiveRefreshToken);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.tag).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(encrypted.ciphertext).not.toContain('mock_google_oauth');

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(sensitiveRefreshToken);
  });

  it('successfully encrypts and decrypts with an explicit 64-char hex key', () => {
    const explicitHexKey = crypto.randomBytes(32).toString('hex');
    const token = 'my_secret_token';

    const encrypted = encryptToken(token, explicitHexKey);
    const decrypted = decryptToken(encrypted, explicitHexKey);

    expect(decrypted).toBe(token);
  });

  it('successfully binds and verifies Additional Authenticated Data (AAD)', () => {
    const token = 'user_token_bound_to_tenant';
    const aad = 'org:00000000-0000-0000-0000-000000000001';

    const encrypted = encryptToken(token, undefined, aad);
    const decrypted = decryptToken(encrypted, undefined, aad);
    expect(decrypted).toBe(token);

    // Mismatched AAD must throw an authentication error
    expect(() => decryptToken(encrypted, undefined, 'org:different-org-id')).toThrow();
  });

  it('fails decryption when ciphertext is tampered with', () => {
    const token = 'confidential_token';
    const encrypted = encryptToken(token);

    // Tamper ciphertext
    const tamperedHex =
      encrypted.ciphertext.slice(0, -2) +
      (encrypted.ciphertext.slice(-2) === 'aa' ? 'bb' : 'aa');

    expect(() =>
      decryptToken({
        ...encrypted,
        ciphertext: tamperedHex,
      })
    ).toThrow();
  });

  it('fails decryption when IV is altered', () => {
    const token = 'confidential_token';
    const encrypted = encryptToken(token);

    const tamperedIv =
      encrypted.iv.slice(0, -2) +
      (encrypted.iv.slice(-2) === '11' ? '22' : '11');

    expect(() =>
      decryptToken({
        ...encrypted,
        iv: tamperedIv,
      })
    ).toThrow();
  });

  it('fails decryption when auth tag is modified', () => {
    const token = 'confidential_token';
    const encrypted = encryptToken(token);

    const tamperedTag =
      encrypted.tag.slice(0, -2) +
      (encrypted.tag.slice(-2) === '99' ? '88' : '99');

    expect(() =>
      decryptToken({
        ...encrypted,
        tag: tamperedTag,
      })
    ).toThrow();
  });

  it('rejects empty plaintext input', () => {
    expect(() => encryptToken('')).toThrow('Cannot encrypt empty plaintext');
  });

  it('rejects malformed encrypted payload on decryption', () => {
    // @ts-expect-error test invalid payload
    expect(() => decryptToken({})).toThrow('Invalid EncryptedPayload');
  });

  it('throws in production if GOOGLE_TOKEN_ENCRYPTION_KEY is not configured', () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';

    expect(() => resolveEncryptionKey()).toThrow(
      'CRITICAL SECURITY ERROR: GOOGLE_TOKEN_ENCRYPTION_KEY must be configured in production.'
    );
  });

  it('throws in production if GOOGLE_TOKEN_ENCRYPTION_KEY is weak or malformed rather than silently downgrading', () => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'short-weak-passphrase';

    expect(() => resolveEncryptionKey()).toThrow(
      'CRITICAL SECURITY ERROR: GOOGLE_TOKEN_ENCRYPTION_KEY must be a valid 256-bit (32-byte) hex or base64 key in production.'
    );
  });

  it('accepts valid 32-byte base64 key in production', () => {
    process.env.NODE_ENV = 'production';
    // Generate valid 32-byte base64 key
    const validBase64 = crypto.randomBytes(32).toString('base64');
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = validBase64;

    const resolved = resolveEncryptionKey();
    expect(resolved).toHaveLength(32);
    expect(resolved).toEqual(Buffer.from(validBase64, 'base64'));
  });

  it('accepts valid 64-character hex key in production', () => {
    process.env.NODE_ENV = 'production';
    const validHex = crypto.randomBytes(32).toString('hex');
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = validHex;

    const resolved = resolveEncryptionKey();
    expect(resolved).toHaveLength(32);
    expect(resolved).toEqual(Buffer.from(validHex, 'hex'));
  });
});
