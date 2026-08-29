import net from 'node:net';

export class SSRFGuard {
  private static readonly BLOCKED_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    'metadata.google.internal',
    '169.254.169.254',
  ]);

  /**
   * Checks if an IPv4 address is in a private/reserved range.
   */
  private static isPrivateIPv4(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed is treated as dangerous
    }

    const [a, b] = parts;
    if (a === undefined || b === undefined) return true;

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;

    return false;
  }

  /**
   * Validates that a target URL is safe to fetch externally.
   */
  public static isSafeUrl(urlString: string): { safe: boolean; reason?: string } {
    try {
      const parsed = new URL(urlString);

      // 1. Protocol check
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Unapproved protocol: ${parsed.protocol}` };
      }

      const hostname = parsed.hostname.toLowerCase();

      // 2. Blocked hostnames
      if (this.BLOCKED_HOSTS.has(hostname)) {
        return { safe: false, reason: `Blocked hostname: ${hostname}` };
      }

      // 3. IP address check
      const ipVersion = net.isIP(hostname);
      if (ipVersion === 4 && this.isPrivateIPv4(hostname)) {
        return { safe: false, reason: `Private IPv4 range blocked: ${hostname}` };
      }
      if (ipVersion === 6) {
        // Disallow arbitrary direct IPv6 fetching in scraper
        return { safe: false, reason: `Direct IPv6 connection restricted: ${hostname}` };
      }

      return { safe: true };
    } catch {
      return { safe: false, reason: 'Malformed URL' };
    }
  }
}
