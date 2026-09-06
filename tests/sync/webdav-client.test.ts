import { describe, it, expect, vi } from 'vitest';
import { SynologyWebDAVClient } from '../../src/sync/webdav-client';

describe('SynologyWebDAVClient', () => {
  it('should initialize with provided config and options', () => {
    const client = new SynologyWebDAVClient({
      url: 'https://nas.example.com:5006',
      username: 'user',
      password: 'pwd',
      allowInsecureSSL: true
    });
    expect(client).toBeDefined();
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
