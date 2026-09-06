import type { WebDAVClient, FileStat } from 'webdav';
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

const getWebDAVModule = async (): Promise<any> => {
  if (process.env.VITEST) {
    return require('webdav');
  }
  const importFn = new Function('s', 'return import(s)');
  return importFn('webdav');
};

export class SynologyWebDAVClient {
  private clientPromise: Promise<WebDAVClient>;

  constructor(config: SynologyWebDAVConfig) {
    this.clientPromise = (async () => {
      const { createClient } = await getWebDAVModule();
      const options: any = {
        username: config.username,
        password: config.password,
      };
      if (config.allowInsecureSSL) {
        options.httpsAgent = new https.Agent({ rejectUnauthorized: false });
      }
      return createClient(config.url, options);
    })();
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const client = await this.clientPromise;
      await client.getDirectoryContents('/');
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Connection failed' };
    }
  }

  async ensureDir(remoteDirPath: string): Promise<void> {
    const client = await this.clientPromise;
    const cleanPath = remoteDirPath.normalize('NFC').replace(/\\/g, '/');
    const parts = cleanPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath += `/${part}`;
      try {
        const exists = await client.exists(currentPath);
        if (!exists) {
          await client.createDirectory(currentPath);
        }
      } catch {
        // Ignore if already exists or permission
      }
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const client = await this.clientPromise;
    const readStream = fs.createReadStream(localPath);
    await client.putFileContents(remotePath, readStream, { overwrite: true });
  }

  async deleteFile(remotePath: string): Promise<void> {
    const client = await this.clientPromise;
    const cleanPath = remotePath.normalize('NFC').replace(/\\/g, '/');
    try {
      await client.deleteFile(cleanPath);
    } catch (err: any) {
      if (err?.status !== 404 && err?.response?.status !== 404) {
        throw err;
      }
    }
  }

  async listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>> {
    const client = await this.clientPromise;
    const fileMap = new Map<string, RemoteFileStat>();
    const basePath = remoteBasePath.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');

    async function walk(targetPath: string) {
      let items: FileStat[] = [];
      try {
        const contents = await client.getDirectoryContents(targetPath);
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
