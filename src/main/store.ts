import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface AppConfig {
  nas: {
    url: string;
    username: string;
    password: string;
    remotePath: string;
    allowInsecureSSL: boolean;
  };
  sync: {
    localPath: string;
    intervalMinutes: number;
    realtimeSync: boolean;
  };
}

interface StoredConfig {
  nas: {
    url: string;
    username: string;
    encryptedPassword?: string;
    password?: string; // for backward compatibility before migration
    remotePath: string;
    allowInsecureSSL: boolean;
  };
  sync: {
    localPath: string;
    intervalMinutes: number;
    realtimeSync: boolean;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  nas: {
    url: 'https://',
    username: '',
    password: '',
    remotePath: '/home/Backup',
    allowInsecureSSL: true,
  },
  sync: {
    localPath: '',
    intervalMinutes: 30,
    realtimeSync: false,
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

        return {
          nas: {
            ...DEFAULT_CONFIG.nas,
            ...(parsed.nas || {}),
            password
          },
          sync: {
            ...DEFAULT_CONFIG.sync,
            ...(parsed.sync || {}),
            realtimeSync: parsed.sync?.realtimeSync ?? DEFAULT_CONFIG.sync.realtimeSync
          }
        };
      }
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  get(): AppConfig {
    return { ...this.config };
  }

  save(newConfig: Partial<AppConfig>): void {
    this.config = {
      nas: { ...this.config.nas, ...(newConfig.nas || {}) },
      sync: { ...this.config.sync, ...(newConfig.sync || {}) }
    };

    const storedData: StoredConfig = {
      nas: {
        url: this.config.nas.url,
        username: this.config.nas.username,
        encryptedPassword: encryptSecret(this.config.nas.password),
        remotePath: this.config.nas.remotePath,
        allowInsecureSSL: this.config.nas.allowInsecureSSL
      },
      sync: {
        localPath: this.config.sync.localPath,
        intervalMinutes: this.config.sync.intervalMinutes,
        realtimeSync: this.config.sync.realtimeSync
      }
    };

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(storedData, null, 2), 'utf-8');
  }
}
