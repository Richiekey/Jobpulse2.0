import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export interface ApiResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

export class ApiResponse {
  public static generateRequestId(): string {
    return `req_${crypto.randomBytes(8).toString('hex')}`;
  }

  public static success<T>(data: T, meta?: Record<string, unknown>, options?: ApiResponseOptions): NextResponse {
    const requestId = this.generateRequestId();
    return NextResponse.json(
      {
        success: true,
        data,
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          ...meta,
        },
      },
      {
        status: options?.status || 200,
        headers: options?.headers,
      }
    );
  }

  public static error(
    userMessage: string,
    internalError?: unknown,
    statusCode = 500
  ): NextResponse {
    const requestId = this.generateRequestId();

    // Log full detailed error server-side for internal telemetry & debugging
    if (internalError) {
      console.error(`[API_ERROR][${requestId}] Status: ${statusCode} | Message: ${userMessage}`, {
        error: internalError instanceof Error ? internalError.stack || internalError.message : internalError,
        timestamp: new Date().toISOString(),
      });
    }

    // Client response only receives sanitized user-safe error and traceable requestId
    return NextResponse.json(
      {
        success: false,
        error: userMessage,
        requestId,
      },
      { status: statusCode }
    );
  }
}
