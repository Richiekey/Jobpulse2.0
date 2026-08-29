import { withRetry } from './backoff.js';
import { logger } from './logger.js';

export interface HttpClientOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  followRedirects?: boolean;
}

export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  url: string;
}

const DEFAULT_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 JobPulseBot/2.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 JobPulseBot/2.0',
];

export class HttpClient {
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxSizeBytes: number;

  constructor(defaults: { timeoutMs?: number; maxSizeBytes?: number } = {}) {
    this.defaultTimeoutMs = defaults.timeoutMs ?? 15000;
    this.defaultMaxSizeBytes = defaults.maxSizeBytes ?? 5 * 1024 * 1024; // 5MB limit
  }

  private getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * DEFAULT_USER_AGENTS.length);
    return DEFAULT_USER_AGENTS[index] || DEFAULT_USER_AGENTS[0]!;
  }

  public async get<T = unknown>(
    url: string,
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxSizeBytes = options.maxSizeBytes ?? this.defaultMaxSizeBytes;

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const requestHeaders = new Headers({
          'User-Agent': this.getRandomUserAgent(),
          Accept: 'application/json, text/html, application/xhtml+xml, */*',
          ...options.headers,
        });

        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: requestHeaders,
            signal: controller.signal,
            redirect: options.followRedirects === false ? 'manual' : 'follow',
          });

          clearTimeout(timeoutId);

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
            throw new Error(`RATE_LIMITED: 429 encountered, retry after ${retryAfterSec}s`);
          }

          if (response.status >= 500) {
            throw new Error(`SERVER_ERROR: Status ${response.status} from ${url}`);
          }

          if (!response.ok && response.status !== 404) {
            throw new Error(`HTTP_ERROR: Status ${response.status} from ${url}`);
          }

          // Check Content-Length header if present
          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
            throw new Error(
              `PAYLOAD_TOO_LARGE: Content-Length ${contentLength} exceeds ${maxSizeBytes} bytes`
            );
          }

          const contentType = response.headers.get('content-type') || '';
          let data: unknown;

          if (contentType.includes('application/json')) {
            data = await response.json();
          } else {
            const text = await response.text();
            if (text.length > maxSizeBytes) {
              throw new Error(`PAYLOAD_TOO_LARGE: Body size exceeds ${maxSizeBytes} bytes`);
            }
            data = text;
          }

          return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: data as T,
            url: response.url || url,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      {
        maxRetries: options.maxRetries ?? 2,
        shouldRetry: (err) => {
          if (err instanceof Error) {
            // Do not retry 404 or explicit client errors other than rate limits
            if (err.message.includes('Status 404')) return false;
            if (err.message.includes('PAYLOAD_TOO_LARGE')) return false;
          }
          return true;
        },
        onRetry: (err, attempt, delayMs) => {
          logger.warn(`Retrying HTTP GET to ${url}`, {
            attempt,
            delayMs,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      }
    );
  }
}

export const httpClient = new HttpClient();
