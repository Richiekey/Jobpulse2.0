import crypto from 'crypto';

export interface PaystackInitializeParams {
  email: string;
  amount: number; // in kobo
  metadata: Record<string, any>;
  callback_url: string;
}

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export class PaystackClient {
  private secretKey: string;
  private baseUrl = 'https://api.paystack.co';

  constructor(secretKey?: string) {
    const key = secretKey || process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      throw new Error('PAYSTACK_SECRET_KEY is not defined');
    }
    this.secretKey = key;
  }

  async initializeTransaction(params: PaystackInitializeParams): Promise<PaystackInitializeResponse> {
    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Paystack initialize failed: ${err}`);
    }

    return response.json();
  }

  verifyWebhookSignature(payload: string, signature: string | null): boolean {
    if (!signature) return false;
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }
}
