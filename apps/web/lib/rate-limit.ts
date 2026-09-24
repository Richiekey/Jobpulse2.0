import { NextRequest, NextResponse } from 'next/server';

/**
 * Sliding window rate limiter for API endpoints (e.g. AI Career Tools).
 * Tracks request counts per client identifier (User ID or client IP).
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Checks if an identifier has exceeded the allowed rate limit within the time window.
 *
 * @param identifier Unique client key (IP or user ID)
 * @param limit Maximum requests allowed in the window (default 15)
 * @param windowMs Window duration in milliseconds (default 60,000ms / 1 min)
 */
export function checkRateLimit(
  identifier: string,
  limit = 15,
  windowMs = 60 * 1000
): { success: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  // Periodic pruning of stale records if map grows large
  if (rateLimitMap.size > 2000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (!record || now > record.resetTime) {
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: limit - 1,
      resetInSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      success: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    };
  }

  record.count += 1;
  return {
    success: true,
    remaining: limit - record.count,
    resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
  };
}

/**
 * Convenience helper to rate limit AI endpoints directly from a NextRequest.
 */
export function enforceAiRateLimit(
  req: NextRequest,
  prefix = 'ai_general',
  limit = 15
): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon_client';
  const rateKey = `${prefix}_${ip}`;
  const rateCheck = checkRateLimit(rateKey, limit);

  if (!rateCheck.success) {
    return NextResponse.json(
      {
        success: false,
        error: `AI rate limit exceeded. Please wait ${rateCheck.resetInSeconds}s before requesting again.`,
        resetInSeconds: rateCheck.resetInSeconds,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateCheck.resetInSeconds),
        },
      }
    );
  }

  return null;
}
