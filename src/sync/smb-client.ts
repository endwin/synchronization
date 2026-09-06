import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { RemoteClient, RemoteConnectionConfig, shouldIgnoreRemote } from './remote-client';
import { RemoteFileStat } from './webdav-client';

export class SambaClientWrapper implements RemoteClient {
  private config: RemoteConnectionConfig;
  private uncRoot: string;

  constructor(config: RemoteConnectionConfig) {
    this.config = config;
    this.uncRoot = this.normalizeUnc(config.url || '');
  }

  private normalizeUnc(raw: string): string {
    let clean = raw.trim().replace(/^smb:\/\//i, '');
    clean = clean.replace(/\//g, '\\');
    if (!clean.startsWith('\\\\')) {
      clean = '\\\\' + clean.replace(/^\\+/, '');
    }
    // Clean any accidental port syntax in UNC path (e.g. \\192.168.0.10:445\share -> \\192.168.0.10\share)
    clean = clean.replace(/^(\\\\[^\\]+)(?::\d+)(\\.*)?$/, '$1$2');
    return clean.replace(/\\+$/, '');
  }

  private authenticateIfWindows(): void {
    if (process.platform === 'win32' && this.config.username) {
      try {
        const parts = this.uncRoot.split('\\').filter(Boolean);
        if (parts.length >= 2) {
          const shareRoot = `\\\\${parts[0]}\\${parts[1]}`;
          child_process.execFileSync('net.exe', [
            'use',
            shareRoot,
            `/user:${this.config.username}`,
            this.config.password || ''
          ], { stdio: 'ignore' });
        }
      } catch {
        // May already be authenticated or using cached Windows credentials
      }
    }
  }

  private resolveRemotePath(remotePath: string): string {
    const cleanRel = remotePath.replace(/^[/\\]+/, '').replace(/\//g, '\\');
    return path.join(this.uncRoot, cleanRel);
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      this.authenticateIfWindows();
      if (!fs.existsSync(this.uncRoot)) {
        return { success: false, message: `Samba 공유 경로를 찾을 수 없습니다: ${this.uncRoot}` };
      }
      fs.readdirSync(this.uncRoot);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Samba connection failed' };
    }
  }

  async ensureDir(remoteDirPath: string): Promise<void> {
    const fullPath = this.resolveRemotePath(remoteDirPath);
    try {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    } catch (err: any) {
      if (err?.code !== 'EEXIST') {
        throw err;
      }
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const fullPath = this.resolveRemotePath(remotePath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(localPath, fullPath);
  }

  async deleteFile(remotePath: string): Promise<void> {
    const fullPath = this.resolveRemotePath(remotePath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async deleteDirectory(remoteDirPath: string): Promise<void> {
    const fullPath = this.resolveRemotePath(remoteDirPath);
    try {
      if (fs.existsSync(fullPath)) {
        fs.rmdirSync(fullPath);
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>> {
    const fileMap = new Map<string, RemoteFileStat>();
    const fullBasePath = this.resolveRemotePath(remoteBasePath);

    if (!fs.existsSync(fullBasePath)) {
      return fileMap;
    }

    const walk = (currentDir: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (shouldIgnoreRemote(entry.name)) {
          continue;
        }

        const entryFullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(entryFullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(entryFullPath);
            const rel = path.relative(fullBasePath, entryFullPath).replace(/\\/g, '/').normalize('NFC');
            fileMap.set(rel, {
              relativePath: rel,
              size: stat.size,
              mtime: stat.mtimeMs
            });
          } catch {}
        }
      }
    };

    walk(fullBasePath);
    return fileMap;
  }
}
