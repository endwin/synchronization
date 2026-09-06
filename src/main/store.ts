import * as fs from 'fs';
import * as path from 'path';

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
  }
};

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
        const parsed = JSON.parse(raw);
        return {
          nas: { ...DEFAULT_CONFIG.nas, ...(parsed.nas || {}) },
          sync: { ...DEFAULT_CONFIG.sync, ...(parsed.sync || {}) }
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
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf-8');
  }
}
