import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SyncFolderPair {
  id: string;
  localPath: string;
  remotePath: string;
  deleteOnRemote: boolean;
  deleteOnLocal: boolean;
  enabled: boolean;
}

export interface AppConfig {
  nas: {
    url: string;
    username: string;
    password: string;
    allowInsecureSSL: boolean;
    remotePath?: string; // legacy support
  };
  sync: {
    folders: SyncFolderPair[];
    intervalMinutes: number;
    realtimeSync: boolean;
    autoStart?: boolean;
    localPath?: string; // legacy support
  };
}

interface StoredConfig {
  nas: {
    url: string;
    username: string;
    encryptedPassword?: string;
    password?: string; // for backward compatibility before migration
    allowInsecureSSL: boolean;
    remotePath?: string;
  };
  sync: {
    folders?: SyncFolderPair[];
    localPath?: string;
    intervalMinutes: number;
    realtimeSync: boolean;
    autoStart?: boolean;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  nas: {
    url: 'https://',
    username: '',
    password: '',
    allowInsecureSSL: true,
  },
  sync: {
    folders: [],
    intervalMinutes: 30,
    realtimeSync: false,
    autoStart: false,
  }
};

function getSafeStorage() {
  try {
    const electron = require('electron');
    if (electron && electron.safeStorage && electron.safeStorage.isEncryptionAvailable()) {
      return electron.safeStorage;
    }
  } catch {}
  return null;
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const safeStorage = getSafeStorage();
  if (safeStorage) {
    return safeStorage.encryptString(plainText).toString('base64');
  }

  // Fallback cipher for environments without Electron safeStorage
  const key = crypto.createHash('sha256').update('synology-sync-store-fallback-key').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `enc:${iv.toString('base64')}:${encrypted}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  const safeStorage = getSafeStorage();
  if (safeStorage && !cipherText.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(cipherText, 'base64'));
    } catch {
      // Fallback
    }
  }

  try {
    if (cipherText.startsWith('enc:')) {
      const parts = cipherText.slice(4).split(':');
      if (parts.length === 2) {
        const key = crypto.createHash('sha256').update('synology-sync-store-fallback-key').digest();
        const iv = Buffer.from(parts[0], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(parts[1], 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    }
  } catch {}
  return '';
}

export class ConfigStore {
  private filePath: string;
  private config: AppConfig;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: StoredConfig = JSON.parse(raw);

        let password = '';
        if (parsed.nas?.encryptedPassword) {
          password = decryptSecret(parsed.nas.encryptedPassword);
        } else if (parsed.nas?.password) {
          password = parsed.nas.password;
        }

        let folders: SyncFolderPair[] = [];
        if (Array.isArray(parsed.sync?.folders)) {
          folders = parsed.sync.folders.map(f => ({
            ...f,
            deleteOnRemote: Boolean(f.deleteOnRemote),
            deleteOnLocal: Boolean(f.deleteOnLocal)
          }));
        } else if (parsed.sync?.localPath) {
          // Migrate legacy single folder
          folders = [{
            id: 'default',
            localPath: parsed.sync.localPath,
            remotePath: parsed.nas?.remotePath || '/home/Backup',
            deleteOnRemote: false,
            deleteOnLocal: false,
            enabled: true
          }];
        }

        return {
          nas: {
            ...DEFAULT_CONFIG.nas,
            ...(parsed.nas || {}),
            password
          },
          sync: {
            ...DEFAULT_CONFIG.sync,
            ...(parsed.sync || {}),
            folders,
            realtimeSync: parsed.sync?.realtimeSync ?? DEFAULT_CONFIG.sync.realtimeSync,
            autoStart: parsed.sync?.autoStart ?? DEFAULT_CONFIG.sync.autoStart
          }
        };
      }
    } catch {}
    return { ...DEFAULT_CONFIG, sync: { ...DEFAULT_CONFIG.sync, folders: [] } };
  }

  public reload(): AppConfig {
    this.config = this.load();
    return this.get();
  }

  get(): AppConfig {
    return {
      ...this.config,
      sync: {
        ...this.config.sync,
        folders: [...this.config.sync.folders],
        // backward compatibility getters
        localPath: this.config.sync.folders[0]?.localPath || '',
      },
      nas: {
        ...this.config.nas,
        remotePath: this.config.sync.folders[0]?.remotePath || '/home/Backup',
      }
    };
  }

  save(newConfig: Partial<AppConfig>): void {
    const existing = this.config;

    let updatedFolders = existing.sync.folders;
    if (newConfig.sync && 'folders' in newConfig.sync && Array.isArray(newConfig.sync.folders)) {
      updatedFolders = newConfig.sync.folders;
    } else if (newConfig.sync?.localPath) {
      // Legacy single path update
      updatedFolders = [{
        id: existing.sync.folders[0]?.id || 'default',
        localPath: newConfig.sync.localPath,
        remotePath: newConfig.nas?.remotePath || existing.sync.folders[0]?.remotePath || '/home/Backup',
        deleteOnRemote: existing.sync.folders[0]?.deleteOnRemote ?? false,
        deleteOnLocal: existing.sync.folders[0]?.deleteOnLocal ?? false,
        enabled: true
      }];
    }

    const incomingNas: Partial<AppConfig['nas']> = newConfig.nas || {};
    const effectivePassword = (incomingNas.password !== undefined && incomingNas.password !== '')
      ? incomingNas.password
      : existing.nas.password;

    this.config = {
      nas: {
        ...existing.nas,
        ...incomingNas,
        password: effectivePassword
      },
      sync: {
        ...existing.sync,
        ...(newConfig.sync || {}),
        folders: updatedFolders
      }
    };

    let encryptedPassword = encryptSecret(this.config.nas.password);
    if (!encryptedPassword) {
      try {
        if (fs.existsSync(this.filePath)) {
          const rawDisk = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
          if (rawDisk.nas?.encryptedPassword) {
            encryptedPassword = rawDisk.nas.encryptedPassword;
          }
        }
      } catch {}
    }

    const storedData: StoredConfig = {
      nas: {
        url: this.config.nas.url,
        username: this.config.nas.username,
        encryptedPassword,
        allowInsecureSSL: this.config.nas.allowInsecureSSL
      },
      sync: {
        folders: this.config.sync.folders,
        intervalMinutes: this.config.sync.intervalMinutes,
        realtimeSync: this.config.sync.realtimeSync,
        autoStart: this.config.sync.autoStart
      }
    };

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(storedData, null, 2), 'utf-8');
  }
}
