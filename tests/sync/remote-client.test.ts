import { describe, it, expect } from 'vitest';
import { createRemoteClient, shouldIgnoreRemote } from '../../src/sync/remote-client';
import { SynologyWebDAVClient } from '../../src/sync/webdav-client';
import { SambaClientWrapper } from '../../src/sync/smb-client';
import { FtpClientWrapper } from '../../src/sync/ftp-client';

describe('RemoteClient & Factory', () => {
  describe('shouldIgnoreRemote', () => {
    it('should ignore Synology and system metadata paths', () => {
      expect(shouldIgnoreRemote('@eaDir')).toBe(true);
      expect(shouldIgnoreRemote('folder/@eaDir/photo.jpg')).toBe(true);
      expect(shouldIgnoreRemote('#recycle/deleted.txt')).toBe(true);
      expect(shouldIgnoreRemote('.DS_Store')).toBe(true);
      expect(shouldIgnoreRemote('sub/.DS_Store')).toBe(true);
      expect(shouldIgnoreRemote('desktop.ini')).toBe(true);
      expect(shouldIgnoreRemote('Thumbs.db')).toBe(true);
      expect(shouldIgnoreRemote('sub/Thumbs.db')).toBe(true);
    });

    it('should not ignore standard files and folders', () => {
      expect(shouldIgnoreRemote('documents/report.pdf')).toBe(false);
      expect(shouldIgnoreRemote('data.csv')).toBe(false);
      expect(shouldIgnoreRemote('images/logo.png')).toBe(false);
    });
  });

  describe('createRemoteClient factory', () => {
    it('should create SynologyWebDAVClient for webdav or undefined', () => {
      const client1 = createRemoteClient({
        protocol: 'webdav',
        url: 'https://nas.example.com:5006',
        username: 'user',
        password: 'pwd'
      });
      expect(client1).toBeInstanceOf(SynologyWebDAVClient);

      const client2 = createRemoteClient({
        url: 'https://nas.example.com:5006',
        username: 'user',
        password: 'pwd'
      });
      expect(client2).toBeInstanceOf(SynologyWebDAVClient);
    });

    it('should create SambaClientWrapper for smb protocol', () => {
      const client = createRemoteClient({
        protocol: 'smb',
        url: '\\\\192.168.0.10\\share',
        username: 'user',
        password: 'pwd'
      });
      expect(client).toBeInstanceOf(SambaClientWrapper);
    });

    it('should create FtpClientWrapper for ftp protocol', () => {
      const client = createRemoteClient({
        protocol: 'ftp',
        url: 'ftp.example.com',
        port: 21,
        username: 'user',
        password: 'pwd'
      });
      expect(client).toBeInstanceOf(FtpClientWrapper);
    });

    it('should create FtpClientWrapper for ftps protocol', () => {
      const client = createRemoteClient({
        protocol: 'ftps',
        url: 'ftps.example.com',
        port: 21,
        username: 'user',
        password: 'pwd'
      });
      expect(client).toBeInstanceOf(FtpClientWrapper);
    });
  });

  describe('Connection test failure handling', () => {
    it('FtpClientWrapper handles unreachable host gracefully', async () => {
      const client = new FtpClientWrapper({
        protocol: 'ftp',
        url: '127.0.0.1',
        port: 65432,
        username: 'nobody',
        password: 'pwd'
      });
      const res = await client.testConnection();
      expect(res.success).toBe(false);
      expect(res.message).toBeDefined();
    });

    it('SambaClientWrapper handles non-existent UNC path gracefully', async () => {
      const client = new SambaClientWrapper({
        protocol: 'smb',
        url: '\\\\invalid-host-99999\\nonexistent-share',
        username: 'nobody',
        password: 'pwd'
      });
      const res = await client.testConnection();
      expect(res.success).toBe(false);
      expect(res.message).toBeDefined();
    });
  });
});
