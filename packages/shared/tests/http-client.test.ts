import { describe, it, expect } from 'vitest';
import { httpClient } from '../src/http-client.js';

describe('HttpClient SSRF Defense & Protocol Safety (M09.4, M13.4)', () => {
  it('blocks private IPv4 addresses from external fetching', async () => {
    await expect(httpClient.get('http://127.0.0.1:8080/admin')).rejects.toThrow('SSRF_REJECTED');
    await expect(httpClient.get('http://10.0.0.1/secrets')).rejects.toThrow('SSRF_REJECTED');
    await expect(httpClient.get('http://192.168.1.1/router')).rejects.toThrow('SSRF_REJECTED');
    await expect(httpClient.get('http://172.16.0.1/internal')).rejects.toThrow('SSRF_REJECTED');
  });

  it('blocks cloud metadata endpoints (AWS/GCP/Azure link-local)', async () => {
    await expect(httpClient.get('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('SSRF_REJECTED');
    await expect(httpClient.get('http://metadata.google.internal/computeMetadata/v1/')).rejects.toThrow('SSRF_REJECTED');
  });

  it('blocks localhost and loopback hostnames', async () => {
    await expect(httpClient.get('http://localhost:3000/api')).rejects.toThrow('SSRF_REJECTED');
  });

  it('blocks dangerous non-http protocols (file://, ftp://, gopher://)', async () => {
    await expect(httpClient.get('file:///etc/passwd')).rejects.toThrow('SSRF_REJECTED');
    await expect(httpClient.get('ftp://attacker.com/file')).rejects.toThrow('SSRF_REJECTED');
  });

  it('assertSafeUrl throws on private/loopback/metadata URLs and passes on public HTTPS URLs', async () => {
    const { assertSafeUrl } = await import('../src/index.js');
    expect(() => assertSafeUrl('https://boards.greenhouse.io/stripe')).not.toThrow();
    expect(() => assertSafeUrl('http://127.0.0.1:8000')).toThrow('SSRF_REJECTED');
    expect(() => assertSafeUrl('http://localhost:3000')).toThrow('SSRF_REJECTED');
    expect(() => assertSafeUrl('http://169.254.169.254/latest')).toThrow('SSRF_REJECTED');
    expect(() => assertSafeUrl('http://0.0.0.0')).toThrow('SSRF_REJECTED');
  });
});
