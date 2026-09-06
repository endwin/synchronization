# Synology Sync Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 폴더의 변경 사항을 시놀로지 NAS로 안전하게 백업/동기화(로컬 삭제 시 NAS 보존, 중복 스킵)하는 Node.js + Electron 기반 데스크톱 애플리케이션 구축

**Architecture:** Electron 2-프로세스 아키텍처(메인 프로세스 + 렌더러 프로세스). 메인 프로세스는 시스템 트레이 상주, 설정 관리, WebDAV 클라이언트를 활용한 동기화 엔진 및 스케줄러를 구동하며, 보안 브리지(preload)를 통해 렌더러와 통신하여 상태/로그를 실시간 표시합니다.

**Tech Stack:** Node.js v24, Electron, TypeScript / JavaScript, `webdav`, `vitest`

**Spec:** [docs/superpowers/specs/2026-09-06-synology-sync-design.md](file:///c:/synchronization/docs/superpowers/specs/2026-09-06-synology-sync-design.md)

## Global Constraints
- Target OS: Windows 10/11 (x64)
- Node.js runtime: v24.x (ESM & CJS compatibility)
- WebDAV: HTTPS support, self-signed certificate toggle (`rejectUnauthorized: false`), NFC Unicode path normalization
- Sync Policy: Safe Backup (new/modified files uploaded, identical files skipped, local deletions never delete remote files)

---

### Task 1: Project Scaffolding & Build Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Produces: Project build & test configuration (`npm test`, `npm start`)

- [ ] **Step 1: Write basic project setup test**
```typescript
// tests/setup.test.ts
import { describe, it, expect } from 'vitest';

describe('Project Environment Setup', () => {
  it('should run tests correctly', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Create package.json and install dependencies**
```json
{
  "name": "synology-sync-manager",
  "version": "1.0.0",
  "description": "Desktop sync manager for Synology NAS using WebDAV",
  "main": "dist/main/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "start": "tsc && electron ."
  },
  "dependencies": {
    "webdav": "^5.7.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "electron": "^33.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Run test to verify test setup works**
Run: `npm install && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit scaffolding**
```bash
git add package.json tsconfig.json vitest.config.ts .gitignore tests/setup.test.ts
git commit -m "chore: scaffold project structure with TypeScript and Vitest"
```

---

### Task 2: File Scanner Module (Local Folder Traversal)

**Files:**
- Create: `src/sync/file-scanner.ts`
- Test: `tests/sync/file-scanner.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ScannedFile {
    relativePath: string;
    size: number;
    mtime: number;
  }
  export function scanLocalDirectory(baseDir: string): Promise<Map<string, ScannedFile>>;
  ```

- [ ] **Step 1: Write the failing test for FileScanner**
```typescript
// tests/sync/file-scanner.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanLocalDirectory } from '../../src/sync/file-scanner';

describe('scanLocalDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-scan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scan files recursively and collect size and mtime', async () => {
    fs.writeFileSync(path.join(tempDir, 'root.txt'), 'hello');
    fs.mkdirSync(path.join(tempDir, 'sub'));
    fs.writeFileSync(path.join(tempDir, 'sub', 'child.txt'), 'world!');

    const result = await scanLocalDirectory(tempDir);
    expect(result.size).toBe(2);
    expect(result.get('root.txt')).toBeDefined();
    expect(result.get('root.txt')?.size).toBe(5);
    expect(result.get('sub/child.txt')).toBeDefined();
    expect(result.get('sub/child.txt')?.size).toBe(6);
  });

  it('should ignore temp files and .git folder', async () => {
    fs.writeFileSync(path.join(tempDir, 'valid.txt'), 'data');
    fs.writeFileSync(path.join(tempDir, 'temp.tmp'), 'temp');
    fs.writeFileSync(path.join(tempDir, '~$lock.docx'), 'lock');
    fs.mkdirSync(path.join(tempDir, '.git'));
    fs.writeFileSync(path.join(tempDir, '.git', 'HEAD'), 'ref');

    const result = await scanLocalDirectory(tempDir);
    expect(result.size).toBe(1);
    expect(result.has('valid.txt')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/sync/file-scanner.test.ts`
Expected: FAIL ("Cannot find module '../../src/sync/file-scanner'")

- [ ] **Step 3: Implement scanLocalDirectory**
```typescript
// src/sync/file-scanner.ts
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ScannedFile {
  relativePath: string;
  size: number;
  mtime: number;
}

const IGNORE_PATTERNS = [
  /^\.git$/i,
  /^node_modules$/i,
  /\.tmp$/i,
  /^~\$/,
  /^Thumbs\.db$/i,
  /^\.DS_Store$/i
];

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(name));
}

export async function scanLocalDirectory(baseDir: string): Promise<Map<string, ScannedFile>> {
  const fileMap = new Map<string, ScannedFile>();

  async function walk(currentDir: string, relativeDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const normalizedRelPath = relPath.normalize('NFC').replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await walk(fullPath, normalizedRelPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          fileMap.set(normalizedRelPath, {
            relativePath: normalizedRelPath,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs)
          });
        } catch {
          // Skip files that might be locked
        }
      }
    }
  }

  await walk(baseDir, '');
  return fileMap;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/sync/file-scanner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/sync/file-scanner.ts tests/sync/file-scanner.test.ts
git commit -m "feat: implement local directory scanner with ignore filters and NFC normalization"
```

---

### Task 3: WebDAV Client Wrapper & Connection Management

**Files:**
- Create: `src/sync/webdav-client.ts`
- Test: `tests/sync/webdav-client.test.ts`

**Interfaces:**
- Consumes: `webdav` library
- Produces:
  ```typescript
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
    constructor(config: SynologyWebDAVConfig);
    testConnection(): Promise<{ success: boolean; message?: string }>;
    ensureDir(remoteDirPath: string): Promise<void>;
    uploadFile(localPath: string, remotePath: string): Promise<void>;
    listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>>;
  }
  ```

- [ ] **Step 1: Write the failing test for WebDAVClient**
```typescript
// tests/sync/webdav-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SynologyWebDAVClient } from '../../src/sync/webdav-client';

describe('SynologyWebDAVClient', () => {
  it('should initialize with provided config and handle URL formatting', () => {
    const client = new SynologyWebDAVClient({
      url: 'https://nas.example.com:5006',
      username: 'user',
      password: 'pwd',
      allowInsecureSSL: true
    });
    expect(client).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/sync/webdav-client.test.ts`
Expected: FAIL ("Cannot find module '../../src/sync/webdav-client'")

- [ ] **Step 3: Implement SynologyWebDAVClient**
```typescript
// src/sync/webdav-client.ts
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
      const exists = await this.client.exists(currentPath);
      if (!exists) {
        await this.client.createDirectory(currentPath);
      }
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const readStream = fs.createReadStream(localPath);
    await this.client.putFileContents(remotePath, readStream, { overwrite: true });
  }

  async listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>> {
    const fileMap = new Map<string, RemoteFileStat>();
    const basePath = remoteBasePath.normalize('NFC').replace(/\\/g, '/');

    async function walk(targetPath: string) {
      let items: FileStat[] = [];
      try {
        const contents = await this.client.getDirectoryContents(targetPath);
        items = Array.isArray(contents) ? (contents as FileStat[]) : (contents.data as FileStat[]);
      } catch {
        return;
      }

      for (const item of items) {
        if (item.type === 'directory') {
          await walk.call(this, item.filename);
        } else {
          const relPath = item.filename.startsWith(basePath)
            ? item.filename.slice(basePath.length).replace(/^\/+/, '')
            : item.filename;
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

    await walk.call(this, basePath);
    return fileMap;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/sync/webdav-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/sync/webdav-client.ts tests/sync/webdav-client.test.ts
git commit -m "feat: implement Synology WebDAV client with recursive directory creation and listing"
```

---

### Task 4: Sync Diff Engine & Safe Backup Queue

**Files:**
- Create: `src/sync/sync-engine.ts`
- Test: `tests/sync/sync-engine.test.ts`

**Interfaces:**
- Consumes: `ScannedFile` from `file-scanner`, `RemoteFileStat` from `webdav-client`
- Produces:
  ```typescript
  export type SyncAction = 'upload' | 'skip';
  export interface SyncItem {
    relativePath: string;
    action: SyncAction;
    reason: 'new' | 'modified_size' | 'modified_mtime' | 'identical';
    localSize: number;
    localMtime: number;
  }
  export function calculateSyncPlan(
    localFiles: Map<string, ScannedFile>,
    remoteFiles: Map<string, RemoteFileStat>
  ): SyncItem[];
  ```

- [ ] **Step 1: Write the failing test for Sync Diff Engine**
```typescript
// tests/sync/sync-engine.test.ts
import { describe, it, expect } from 'vitest';
import { calculateSyncPlan } from '../../src/sync/sync-engine';

describe('calculateSyncPlan (Safe Backup Rules)', () => {
  it('should identify new files for upload', () => {
    const local = new Map([
      ['new.txt', { relativePath: 'new.txt', size: 100, mtime: 1000 }]
    ]);
    const remote = new Map();

    const plan = calculateSyncPlan(local, remote);
    expect(plan.length).toBe(1);
    expect(plan[0].action).toBe('upload');
    expect(plan[0].reason).toBe('new');
  });

  it('should identify modified files (different size or newer mtime)', () => {
    const local = new Map([
      ['size_diff.txt', { relativePath: 'size_diff.txt', size: 200, mtime: 1000 }],
      ['time_diff.txt', { relativePath: 'time_diff.txt', size: 100, mtime: 2000 }]
    ]);
    const remote = new Map([
      ['size_diff.txt', { relativePath: 'size_diff.txt', size: 150, mtime: 1000 }],
      ['time_diff.txt', { relativePath: 'time_diff.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote);
    expect(plan.filter(i => i.action === 'upload').length).toBe(2);
  });

  it('should skip identical files', () => {
    const local = new Map([
      ['same.txt', { relativePath: 'same.txt', size: 100, mtime: 1000 }]
    ]);
    const remote = new Map([
      ['same.txt', { relativePath: 'same.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote);
    expect(plan[0].action).toBe('skip');
    expect(plan[0].reason).toBe('identical');
  });

  it('should never delete remote files not in local (Safe Backup)', () => {
    const local = new Map();
    const remote = new Map([
      ['deleted_on_local.txt', { relativePath: 'deleted_on_local.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote);
    expect(plan.length).toBe(0); // Nothing to do, remote is safely preserved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/sync/sync-engine.test.ts`
Expected: FAIL ("Cannot find module '../../src/sync/sync-engine'")

- [ ] **Step 3: Implement calculateSyncPlan and SyncEngine**
```typescript
// src/sync/sync-engine.ts
import { ScannedFile } from './file-scanner';
import { RemoteFileStat } from './webdav-client';

export type SyncAction = 'upload' | 'skip';
export interface SyncItem {
  relativePath: string;
  action: SyncAction;
  reason: 'new' | 'modified_size' | 'modified_mtime' | 'identical';
  localSize: number;
  localMtime: number;
}

export function calculateSyncPlan(
  localFiles: Map<string, ScannedFile>,
  remoteFiles: Map<string, RemoteFileStat>
): SyncItem[] {
  const plan: SyncItem[] = [];

  for (const [relPath, local] of localFiles) {
    const remote = remoteFiles.get(relPath);

    if (!remote) {
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'new',
        localSize: local.size,
        localMtime: local.mtime
      });
    } else if (local.size !== remote.size) {
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'modified_size',
        localSize: local.size,
        localMtime: local.mtime
      });
    } else if (local.mtime > remote.mtime + 2000) { // 2s tolerance for file system mtime
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'modified_mtime',
        localSize: local.size,
        localMtime: local.mtime
      });
    } else {
      plan.push({
        relativePath: relPath,
        action: 'skip',
        reason: 'identical',
        localSize: local.size,
        localMtime: local.mtime
      });
    }
  }

  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/sync/sync-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/sync/sync-engine.ts tests/sync/sync-engine.test.ts
git commit -m "feat: implement calculateSyncPlan diffing with safe backup preservation"
```

---

### Task 5: App Configuration Store & Scheduler

**Files:**
- Create: `src/main/store.ts`
- Create: `src/sync/scheduler.ts`
- Test: `tests/main/store.test.ts`
- Test: `tests/sync/scheduler.test.ts`

**Interfaces:**
- Produces:
  ```typescript
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
  export class ConfigStore {
    constructor(configFilePath: string);
    get(): AppConfig;
    save(config: Partial<AppConfig>): void;
  }
  export class SyncScheduler {
    constructor(onTrigger: () => Promise<void>);
    setIntervalMinutes(minutes: number): void;
    start(): void;
    stop(): void;
  }
  ```

- [ ] **Step 1: Write the failing tests for store and scheduler**
```typescript
// tests/main/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigStore } from '../../src/main/store';

describe('ConfigStore', () => {
  let tempConfigFile: string;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));
    tempConfigFile = path.join(dir, 'config.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempConfigFile)) {
      fs.unlinkSync(tempConfigFile);
    }
  });

  it('should load default configuration if file does not exist', () => {
    const store = new ConfigStore(tempConfigFile);
    const config = store.get();
    expect(config.sync.intervalMinutes).toBe(30);
  });

  it('should persist modified configuration', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({ sync: { localPath: 'C:/Backup', intervalMinutes: 60 } as any });
    const loaded = new ConfigStore(tempConfigFile).get();
    expect(loaded.sync.localPath).toBe('C:/Backup');
    expect(loaded.sync.intervalMinutes).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/main/store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ConfigStore and SyncScheduler**
```typescript
// src/main/store.ts
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
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
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
```

```typescript
// src/sync/scheduler.ts
export class SyncScheduler {
  private timer: NodeJS.Timeout | null = null;
  private intervalMinutes: number = 0;
  private onTrigger: () => Promise<void>;

  constructor(onTrigger: () => Promise<void>) {
    this.onTrigger = onTrigger;
  }

  setIntervalMinutes(minutes: number) {
    this.intervalMinutes = minutes;
    this.restart();
  }

  start() {
    if (this.intervalMinutes <= 0) return;
    this.stop();
    this.timer = setInterval(() => {
      this.onTrigger().catch(console.error);
    }, this.intervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  restart() {
    this.stop();
    this.start();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/main/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/main/store.ts src/sync/scheduler.ts tests/main/store.test.ts
git commit -m "feat: implement configuration store and interval scheduler"
```

---

### Task 6: Electron Main Process, Tray & IPC Handlers

**Files:**
- Create: `src/main/index.ts`
- Create: `src/main/tray.ts`
- Create: `src/preload/preload.ts`

**Interfaces:**
- Produces: Electron main window lifecycle, tray menu, contextBridge APIs for UI

- [ ] **Step 1: Create Preload Script**
```typescript
// src/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  selectLocalFolder: () => ipcRenderer.invoke('select-local-folder'),
  testConnection: (nasConfig: any) => ipcRenderer.invoke('test-connection', nasConfig),
  startSync: () => ipcRenderer.invoke('start-sync'),
  onSyncProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('sync-progress', (_event, value) => callback(value));
  },
  onLog: (callback: (logMsg: string) => void) => {
    ipcRenderer.on('sync-log', (_event, value) => callback(value));
  }
});
```

- [ ] **Step 2: Create Tray Controller**
```typescript
// src/main/tray.ts
import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';

export function createSystemTray(mainWindow: BrowserWindow, onSyncNow: () => void): Tray {
  // 16x16 dummy tray icon or data URI icon
  const icon = nativeImage.createEmpty();
  const tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '지금 즉시 동기화', click: () => onSyncNow() },
    { type: 'separator' },
    { label: '창 열기', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '종료', click: () => { (app as any).isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Synology Sync Manager');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
```

- [ ] **Step 3: Create Main Process**
```typescript
// src/main/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { ConfigStore } from './store';
import { createSystemTray } from './tray';
import { SynologyWebDAVClient } from '../sync/webdav-client';
import { scanLocalDirectory } from '../sync/file-scanner';
import { calculateSyncPlan } from '../sync/sync-engine';
import { SyncScheduler } from '../sync/scheduler';

let mainWindow: BrowserWindow | null = null;
const configPath = path.join(app.getPath('userData'), 'config.json');
const store = new ConfigStore(configPath);
let isSyncing = false;

async function executeSync() {
  if (isSyncing) return;
  isSyncing = true;
  const config = store.get();

  function sendLog(msg: string) {
    const time = new Date().toLocaleTimeString();
    mainWindow?.webContents.send('sync-log', `[${time}] ${msg}`);
  }

  try {
    sendLog('동기화 작업을 시작합니다...');
    if (!config.sync.localPath || !config.nas.url) {
      sendLog('설정이 올바르지 않습니다. 로컬 폴더 및 NAS 설정을 확인하세요.');
      return;
    }

    const client = new SynologyWebDAVClient(config.nas);
    sendLog('로컬 폴더를 스캔 중...');
    const localFiles = await scanLocalDirectory(config.sync.localPath);
    sendLog(`로컬 파일 ${localFiles.size}개 발견. 원격 폴더 확인 중...`);

    await client.ensureDir(config.nas.remotePath);
    const remoteFiles = await client.listRemoteFiles(config.nas.remotePath);

    const plan = calculateSyncPlan(localFiles, remoteFiles);
    const uploadList = plan.filter(item => item.action === 'upload');
    sendLog(`업로드 대상: ${uploadList.length}개, 스킵: ${plan.length - uploadList.length}개`);

    let completed = 0;
    for (const item of uploadList) {
      const fullLocalPath = path.join(config.sync.localPath, item.relativePath);
      const fullRemotePath = `${config.nas.remotePath}/${item.relativePath}`.replace(/\/+/g, '/');
      const remoteDir = path.dirname(fullRemotePath).replace(/\\/g, '/');
      
      await client.ensureDir(remoteDir);
      await client.uploadFile(fullLocalPath, fullRemotePath);
      completed++;

      mainWindow?.webContents.send('sync-progress', {
        percent: Math.round((completed / uploadList.length) * 100),
        currentFile: item.relativePath,
        completed,
        total: uploadList.length
      });
    }

    sendLog(`동기화 완료: ${completed}개 파일 업로드 완료.`);
  } catch (err: any) {
    sendLog(`동기화 오류 발생: ${err.message}`);
  } finally {
    isSyncing = false;
  }
}

const scheduler = new SyncScheduler(executeSync);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 700,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  createSystemTray(mainWindow, executeSync);
  scheduler.setIntervalMinutes(store.get().sync.intervalMinutes);
}

app.whenReady().then(() => {
  ipcMain.handle('get-config', () => store.get());
  ipcMain.handle('save-config', (_event, cfg) => {
    store.save(cfg);
    scheduler.setIntervalMinutes(cfg.sync?.intervalMinutes ?? 30);
    return true;
  });
  ipcMain.handle('select-local-folder', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
    return res.filePaths[0] || null;
  });
  ipcMain.handle('test-connection', async (_event, nasCfg) => {
    const client = new SynologyWebDAVClient(nasCfg);
    return await client.testConnection();
  });
  ipcMain.handle('start-sync', () => {
    executeSync();
    return true;
  });

  createWindow();
});
```

- [ ] **Step 4: Build TypeScript and verify syntax**
Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/main/index.ts src/main/tray.ts src/preload/preload.ts
git commit -m "feat: implement Electron main process, system tray, and IPC handlers"
```

---

### Task 7: Renderer UI (Settings, Dashboard & Logs)

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/style.css`
- Create: `src/renderer/app.js`

**Interfaces:**
- Consumes: `window.electronAPI`

- [ ] **Step 1: Create HTML structure**
Create `src/renderer/index.html` containing:
- Header: App Title, Status Indicator
- Card 1: Synology WebDAV Connection Settings (URL, Username, Password, Insecure SSL Checkbox, Test Button)
- Card 2: Folder Settings (Local folder browser, Remote NAS path input)
- Card 3: Sync & Schedule Controls (Interval select, '지금 동기화' button, Progress Bar)
- Card 4: Real-time Log Console

- [ ] **Step 2: Create Modern CSS**
Create `src/renderer/style.css` with clean system font, dark/light cards, responsive inputs, and progress bar animation.

- [ ] **Step 3: Create UI Logic (`src/renderer/app.js`)**
Wire up IPC events: load configs on startup, handle folder selection, handle test connection, handle save, update progress bar, append logs.

- [ ] **Step 4: Commit UI components**
```bash
git add src/renderer/index.html src/renderer/style.css src/renderer/app.js
git commit -m "feat: implement responsive desktop UI with settings, progress bar, and real-time logs"
```

---

### Task 8: End-to-End Build & Execution Verification

**Files:**
- Test all components end-to-end
- Verify TypeScript compilation output in `dist/`
- Verify test suite passes completely

- [ ] **Step 1: Run full test suite**
Run: `npm test`
Expected: All unit tests PASS

- [ ] **Step 2: Build project**
Run: `npm run build`
Expected: `dist/` folder created without TypeScript errors

- [ ] **Step 3: Commit final release package**
```bash
git commit -m "chore: complete initial build and test verification"
```
