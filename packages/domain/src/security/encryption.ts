import crypto from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Resolves or derives a 32-byte (256-bit) Buffer from the key input or environment variable.
 */
export function resolveEncryptionKey(explicitKey?: string): Buffer {
  const rawKey = explicitKey || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if (!rawKey) {
    // In production, require explicit secret configuration
    if (isProd) {
      throw new Error(
        'CRITICAL SECURITY ERROR: GOOGLE_TOKEN_ENCRYPTION_KEY must be configured in production.'
      );
    }
    // Fallback key derived deterministically for dev/test environments only
    return crypto.createHash('sha256').update('jobpulse-default-dev-encryption-key-seed-32bytes!').digest();
  }

  // If already 32-byte hex string (64 hex characters)
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  // If base64 string that decodes to 32 bytes
  const base64Buf = Buffer.from(rawKey, 'base64');
  if (base64Buf.length === 32) {
    return base64Buf;
  }

  // In production, reject invalid key formats rather than silently hashing weak material
  if (isProd) {
    throw new Error(
      'CRITICAL SECURITY ERROR: GOOGLE_TOKEN_ENCRYPTION_KEY must be a valid 256-bit (32-byte) hex or base64 key in production.'
    );
  }

  // For non-production development environments, derive a 32-byte key via SHA-256
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext Plaintext to encrypt (e.g. OAuth refresh token)
 * @param key Optional explicit key or secret
 * @param aad Optional Additional Authenticated Data to bind to the ciphertext
 * @returns EncryptedPayload containing ciphertext, iv, and tag (hex-encoded)
 */
export function encryptToken(
  plaintext: string,
  key?: string,
  aad?: string
): EncryptedPayload {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty plaintext');
  }

  const derivedKey = resolveEncryptionKey(key);
  // 12 bytes / 96 bits IV recommended for AES-GCM by NIST SP 800-38D
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypts an EncryptedPayload using AES-256-GCM.
 *
 * @param payload EncryptedPayload with ciphertext, iv, tag
 * @param key Optional explicit key or secret
 * @param aad Optional Additional Authenticated Data that was bound during encryption
 * @returns Decrypted plaintext string
 * @throws Error if authentication tag fails or data is tampered
 */
export function decryptToken(
  payload: EncryptedPayload,
  key?: string,
  aad?: string
): string {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.tag) {
    throw new Error('Invalid EncryptedPayload: ciphertext, iv, and tag are required');
  }

  const derivedKey = resolveEncryptionKey(key);
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);

  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
