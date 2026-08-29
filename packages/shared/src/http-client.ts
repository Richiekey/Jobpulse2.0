import net from 'node:net';
import { withRetry } from './backoff.js';
import { logger } from './logger.js';

export interface HttpClientOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  followRedirects?: boolean;
  maxRedirectHops?: number;
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

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'metadata.google.internal',
  '169.254.169.254',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed treated as dangerous
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // Loopback
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata
  if (a === 0) return true;

  return false;
}

export function assertSafeUrl(urlStr: string): void {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SSRF_REJECTED: Unapproved protocol ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new Error(`SSRF_REJECTED: Blocked hostname ${hostname}`);
  }
  const ipVer = net.isIP(hostname);
  if (ipVer === 4 && isPrivateIPv4(hostname)) {
    throw new Error(`SSRF_REJECTED: Private IPv4 range blocked ${hostname}`);
  }
  if (ipVer === 6) {
    throw new Error(`SSRF_REJECTED: Direct IPv6 connection restricted ${hostname}`);
  }
}

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
    initialUrl: string,
    options: HttpClientOptions = {}
  ): Promise<HttpResponse<T>> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxSizeBytes = options.maxSizeBytes ?? this.defaultMaxSizeBytes;
    const followRedirects = options.followRedirects !== false;
    const maxRedirectHops = options.maxRedirectHops ?? 5;

    return withRetry(
      async () => {
        let currentUrl = initialUrl;
        let hops = 0;

        while (true) {
          // SSRF Defense on EVERY URL hop (M09.4, M13.4)
          assertSafeUrl(currentUrl);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const requestHeaders = new Headers({
            'User-Agent': this.getRandomUserAgent(),
            Accept: 'application/json, text/html, application/xhtml+xml, */*',
            ...options.headers,
          });

          try {
            const response = await fetch(currentUrl, {
              method: 'GET',
              headers: requestHeaders,
              signal: controller.signal,
              redirect: 'manual', // Manually inspect and validate redirect chain
            });

            clearTimeout(timeoutId);

            // Handle Redirects
            if ([301, 302, 303, 307, 308].includes(response.status) && followRedirects) {
              const location = response.headers.get('location');
              if (!location) {
                throw new Error(`HTTP_ERROR: Redirect status ${response.status} missing Location header`);
              }

              hops++;
              if (hops > maxRedirectHops) {
                throw new Error(`MAX_REDIRECTS: Exceeded max redirect hops (${maxRedirectHops})`);
              }

              currentUrl = new URL(location, currentUrl).toString();
              continue;
            }

            if (response.status === 429) {
              const retryAfterHeader = response.headers.get('Retry-After');
              const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
              throw new Error(`RATE_LIMITED: 429 encountered, retry after ${retryAfterSec}s`);
            }

            if (response.status >= 500) {
              throw new Error(`SERVER_ERROR: Status ${response.status} from ${currentUrl}`);
            }

            if (!response.ok && response.status !== 404) {
              throw new Error(`HTTP_ERROR: Status ${response.status} from ${currentUrl}`);
            }

            // Check Content-Length header
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
              url: currentUrl,
            };
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        }
      },
      {
        maxRetries: options.maxRetries ?? 2,
        shouldRetry: (err) => {
          if (err instanceof Error) {
            if (err.message.includes('SSRF_REJECTED')) return false;
            if (err.message.includes('Status 404')) return false;
            if (err.message.includes('PAYLOAD_TOO_LARGE')) return false;
          }
          return true;
        },
        onRetry: (err, attempt, delayMs) => {
          logger.warn(`Retrying HTTP GET to ${initialUrl}`, {
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
