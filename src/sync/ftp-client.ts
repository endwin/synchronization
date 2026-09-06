import * as ftp from 'basic-ftp';
import * as path from 'path';
import { RemoteClient, RemoteConnectionConfig, shouldIgnoreRemote } from './remote-client';
import { RemoteFileStat } from './webdav-client';

export class FtpClientWrapper implements RemoteClient {
  private config: RemoteConnectionConfig;
  private activeClient: ftp.Client | null = null;

  constructor(config: RemoteConnectionConfig) {
    this.config = config;
  }

  private parseHostAndPort(): { host: string; port: number } {
    let clean = (this.config.url || '').trim().replace(/^ftps?:\/\//i, '');
    let host = clean;
    let port = this.config.port ? Number(this.config.port) : undefined;

    if (clean.includes('/')) {
      host = clean.split('/')[0];
    }
    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      if ((!port || isNaN(port)) && parts[1]) {
        port = parseInt(parts[1], 10);
      }
    }

    if (!port || isNaN(port)) {
      port = 21;
    }

    return { host, port };
  }

  private async getConnectedClient(): Promise<ftp.Client> {
    if (this.activeClient && !this.activeClient.closed) {
      return this.activeClient;
    }

    const { host, port } = this.parseHostAndPort();
    const client = new ftp.Client();
    client.ftp.verbose = false;

    const isSecure = this.config.protocol === 'ftps';
    await client.access({
      host,
      port,
      user: this.config.username,
      password: this.config.password || '',
      secure: isSecure,
      secureOptions: this.config.allowInsecureSSL ? { rejectUnauthorized: false } : undefined
    });

    this.activeClient = client;
    return client;
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    try {
      const { host, port } = this.parseHostAndPort();
      const isSecure = this.config.protocol === 'ftps';
      await client.access({
        host,
        port,
        user: this.config.username,
        password: this.config.password || '',
        secure: isSecure,
        secureOptions: this.config.allowInsecureSSL ? { rejectUnauthorized: false } : undefined
      });
      await client.pwd();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'FTP connection failed' };
    } finally {
      client.close();
    }
  }

  async ensureDir(remoteDirPath: string): Promise<void> {
    const client = await this.getConnectedClient();
    const cleanPath = remoteDirPath.normalize('NFC').replace(/\\/g, '/');
    if (cleanPath && cleanPath !== '/') {
      await client.ensureDir(cleanPath);
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const client = await this.getConnectedClient();
    const cleanRemote = remotePath.normalize('NFC').replace(/\\/g, '/');
    const remoteDir = path.posix.dirname(cleanRemote);
    if (remoteDir && remoteDir !== '/') {
      await client.ensureDir(remoteDir);
    }
    await client.uploadFrom(localPath, cleanRemote);
  }

  async deleteFile(remotePath: string): Promise<void> {
    const client = await this.getConnectedClient();
    const cleanRemote = remotePath.normalize('NFC').replace(/\\/g, '/');
    try {
      await client.remove(cleanRemote);
    } catch (err: any) {
      if (err?.code !== 550) {
        throw err;
      }
    }
  }

  async deleteDirectory(remoteDirPath: string): Promise<void> {
    const client = await this.getConnectedClient();
    const cleanRemote = remoteDirPath.normalize('NFC').replace(/\\/g, '/');
    try {
      await client.removeDir(cleanRemote);
    } catch (err: any) {
      if (err?.code !== 550) {
        throw err;
      }
    }
  }

  async listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>> {
    const client = await this.getConnectedClient();
    const fileMap = new Map<string, RemoteFileStat>();
    const basePath = remoteBasePath.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');

    async function walk(dir: string) {
      let list: ftp.FileInfo[] = [];
      try {
        list = await client.list(dir || '/');
      } catch {
        return;
      }

      for (const item of list) {
        if (shouldIgnoreRemote(item.name)) {
          continue;
        }
        const itemRemotePath = `${dir}/${item.name}`.replace(/\/+/g, '/');
        if (item.isDirectory) {
          await walk(itemRemotePath);
        } else {
          let relPath = itemRemotePath;
          if (relPath.startsWith(basePath)) {
            relPath = relPath.slice(basePath.length).replace(/^\/+/, '');
          }
          const normalized = relPath.normalize('NFC').replace(/\\/g, '/');
          const mtime = item.rawModifiedAt ? new Date(item.rawModifiedAt).getTime() : Date.now();
          fileMap.set(normalized, {
            relativePath: normalized,
            size: item.size || 0,
            mtime
          });
        }
      }
    }

    await walk(basePath || '/');
    return fileMap;
  }

  async close(): Promise<void> {
    if (this.activeClient && !this.activeClient.closed) {
      this.activeClient.close();
      this.activeClient = null;
    }
  }
}
