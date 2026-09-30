import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaystackClient } from '../lib/paystack';

describe('Paystack Webhook Security & Client', () => {
  const secretKey = 'test_secret_key';
  const paystack = new PaystackClient(secretKey);

  it('should verify a valid signature', () => {
    const payload = JSON.stringify({ event: 'charge.success', data: { id: 123 } });
    const crypto = require('crypto');
    const validSignature = crypto
      .createHmac('sha512', secretKey)
      .update(payload)
      .digest('hex');

    const result = paystack.verifyWebhookSignature(payload, validSignature);
    expect(result).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = JSON.stringify({ event: 'charge.success', data: { id: 123 } });
    const result = paystack.verifyWebhookSignature(payload, 'invalid_sig');
    expect(result).toBe(false);
  });

  it('should reject empty or missing signature', () => {
    const payload = JSON.stringify({ event: 'charge.success' });
    expect(paystack.verifyWebhookSignature(payload, null)).toBe(false);
    expect(paystack.verifyWebhookSignature(payload, '')).toBe(false);
  });
});
