import { createClient, WebDAVClient, FileStat } from 'webdav';
import * as fs from 'fs';
import * as https from 'https';

export interface RemoteFileStat {
  relativePath: string;
  size: number;
  mtime: number;
}

export interface SynologyWebDAVConfig {
  url: string;
  username: string;
  password: string;
  allowInsecureSSL?: boolean;
}

export class SynologyWebDAVClient {
  private client: WebDAVClient;

  constructor(config: SynologyWebDAVConfig) {
    const options: any = {
      username: config.username,
      password: config.password,
    };
    if (config.allowInsecureSSL) {
      options.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    this.client = createClient(config.url, options);
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      await this.client.getDirectoryContents('/');
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async ensureDir(remoteDirPath: string): Promise<void> {
    const cleanPath = remoteDirPath.normalize('NFC').replace(/\\/g, '/');
    const parts = cleanPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath += `/${part}`;
      try {
        const exists = await this.client.exists(currentPath);
        if (!exists) {
          await this.client.createDirectory(currentPath);
        }
      } catch {
        // Ignore if already exists or permission
      }
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const readStream = fs.createReadStream(localPath);
    await this.client.putFileContents(remotePath, readStream, { overwrite: true });
  }

  async listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>> {
    const fileMap = new Map<string, RemoteFileStat>();
    const basePath = remoteBasePath.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');
    const self = this;

    async function walk(targetPath: string) {
      let items: FileStat[] = [];
      try {
        const contents = await self.client.getDirectoryContents(targetPath);
        items = Array.isArray(contents) ? (contents as FileStat[]) : ((contents as any).data as FileStat[]);
      } catch {
        return;
      }

      for (const item of items) {
        if (item.type === 'directory') {
          await walk(item.filename);
        } else {
          let relPath = item.filename;
          if (relPath.startsWith(basePath)) {
            relPath = relPath.slice(basePath.length).replace(/^\/+/, '');
          }
          const normalized = relPath.normalize('NFC').replace(/\\/g, '/');
          const mtime = item.lastmod ? new Date(item.lastmod).getTime() : 0;
          fileMap.set(normalized, {
            relativePath: normalized,
            size: item.size || 0,
            mtime
          });
        }
      }
    }

    await walk(basePath);
    return fileMap;
  }
}
