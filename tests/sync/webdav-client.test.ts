import { describe, it, expect } from 'vitest';
import { SynologyWebDAVClient, buildWebDavUrl } from '../../src/sync/webdav-client';

describe('buildWebDavUrl', () => {
  it('should inject port when not present in URL', () => {
    expect(buildWebDavUrl('https://nas.example.com', 5006)).toBe('https://nas.example.com:5006');
  });

  it('should override existing port with custom port', () => {
    expect(buildWebDavUrl('https://nas.example.com:5005', 5006)).toBe('https://nas.example.com:5006');
    expect(buildWebDavUrl('http://192.168.0.10:5005', 8443)).toBe('http://192.168.0.10:8443');
  });

  it('should auto-prepend https for port 5006 if scheme missing', () => {
    expect(buildWebDavUrl('nas.example.com', 5006)).toBe('https://nas.example.com:5006');
  });

  it('should auto-prepend http for port 5005 if scheme missing', () => {
    expect(buildWebDavUrl('192.168.0.10', 5005)).toBe('http://192.168.0.10:5005');
  });

  it('should preserve URL pathname with custom port', () => {
    expect(buildWebDavUrl('https://nas.example.com/webdav', 5006)).toBe('https://nas.example.com:5006/webdav');
  });
});

describe('SynologyWebDAVClient', () => {
  it('should initialize with provided config and options and set effectiveUrl', () => {
    const client = new SynologyWebDAVClient({
      url: 'https://nas.example.com',
      port: 5006,
      username: 'user',
      password: 'pwd',
      allowInsecureSSL: true
    });
    expect(client).toBeDefined();
    expect(client.effectiveUrl).toBe('https://nas.example.com:5006');
    expect(typeof client.deleteFile).toBe('function');
  });

  it('should handle testConnection failure gracefully', async () => {
    const client = new SynologyWebDAVClient({
      url: 'https://invalid-host-that-does-not-exist.local:5006',
      username: 'user',
      password: 'pwd'
    });
    const result = await client.testConnection();
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });
});

