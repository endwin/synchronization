import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigStore } from './store';
import { createSystemTray } from './tray';
import { SynologyWebDAVClient } from '../sync/webdav-client';
import { scanLocalDirectory } from '../sync/file-scanner';
import { calculateSyncPlan } from '../sync/sync-engine';
import { SyncScheduler } from '../sync/scheduler';

let mainWindow: BrowserWindow | null = null;
let tray: any = null;
let isSyncing = false;

const configPath = path.join(app.getPath('userData'), 'config.json');
const store = new ConfigStore(configPath);

function sendLog(msg: string) {
  const time = new Date().toLocaleTimeString();
  const formatted = `[${time}] ${msg}`;
  console.log(formatted);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-log', formatted);
  }
}

async function executeSync() {
  if (isSyncing) {
    sendLog('이미 동기화 작업이 진행 중입니다. 완료 후 다시 시도하세요.');
    return;
  }
  isSyncing = true;
  const config = store.get();

  try {
    sendLog('=== 동기화 프로세스 시작 ===');
    if (!config.sync.localPath || !config.nas.url) {
      sendLog('⚠️ 로컬 폴더 또는 시놀로지 NAS 연결 설정이 완료되지 않았습니다.');
      return;
    }

    const client = new SynologyWebDAVClient(config.nas);
    sendLog(`로컬 폴더 스캔 중: ${config.sync.localPath}`);
    const localFiles = await scanLocalDirectory(config.sync.localPath);
    sendLog(`로컬 파일 총 ${localFiles.size}개 발견`);

    sendLog(`원격 NAS 폴더 확인 중: ${config.nas.remotePath}`);
    await client.ensureDir(config.nas.remotePath);
    const remoteFiles = await client.listRemoteFiles(config.nas.remotePath);
    sendLog(`NAS 원격 파일 총 ${remoteFiles.size}개 확인됨`);

    const plan = calculateSyncPlan(localFiles, remoteFiles);
    const uploadList = plan.filter(item => item.action === 'upload');
    const skippedList = plan.filter(item => item.action === 'skip');
    sendLog(`분석 결과: 신규/수정 업로드 ${uploadList.length}개, 동일 파일 스킵 ${skippedList.length}개`);

    let completed = 0;
    for (const item of uploadList) {
      const fullLocalPath = path.join(config.sync.localPath, item.relativePath);
      const fullRemotePath = `${config.nas.remotePath}/${item.relativePath}`.replace(/\/+/g, '/');
      const remoteDir = path.dirname(fullRemotePath).replace(/\\/g, '/');

      sendLog(`전송 중 [${item.reason}]: ${item.relativePath}`);
      await client.ensureDir(remoteDir);
      await client.uploadFile(fullLocalPath, fullRemotePath);
      completed++;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-progress', {
          percent: Math.round((completed / uploadList.length) * 100),
          currentFile: item.relativePath,
          completed,
          total: uploadList.length,
          uploadedCount: completed,
          skippedCount: skippedList.length
        });
      }
    }

    sendLog(`✓ 동기화 완료: ${completed}개 파일 업로드 완료 (스킵 ${skippedList.length}개)`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sync-progress', {
        percent: 100,
        currentFile: '',
        completed,
        total: uploadList.length,
        status: 'completed'
      });
    }
  } catch (err: any) {
    sendLog(`❌ 동기화 실패: ${err.message || err}`);
  } finally {
    isSyncing = false;
  }
}

const scheduler = new SyncScheduler(executeSync);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 740,
    minWidth: 640,
    minHeight: 600,
    title: 'Synology Sync Manager',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const rendererPathCandidates = [
    path.join(__dirname, '../renderer/index.html'),
    path.join(__dirname, '../../src/renderer/index.html')
  ];
  const targetHtml = rendererPathCandidates.find(p => fs.existsSync(p)) || rendererPathCandidates[0];
  mainWindow.loadFile(targetHtml);

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  tray = createSystemTray(mainWindow, executeSync);
  scheduler.setIntervalMinutes(store.get().sync.intervalMinutes);
}

app.whenReady().then(() => {
  ipcMain.handle('get-config', () => store.get());

  ipcMain.handle('save-config', (_event, cfg) => {
    store.save(cfg);
    scheduler.setIntervalMinutes(cfg.sync?.intervalMinutes ?? 30);
    sendLog('설정이 저장되었습니다.');
    return true;
  });

  ipcMain.handle('select-local-folder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '동기화할 로컬 폴더 선택'
    });
    return (res.filePaths && res.filePaths[0]) ? res.filePaths[0] : null;
  });

  ipcMain.handle('test-connection', async (_event, nasCfg) => {
    sendLog(`NAS 연결 테스트 시도: ${nasCfg.url}`);
    const client = new SynologyWebDAVClient(nasCfg);
    const result = await client.testConnection();
    if (result.success) {
      sendLog('✓ NAS WebDAV 연결 성공!');
    } else {
      sendLog(`❌ NAS WebDAV 연결 실패: ${result.message}`);
    }
    return result;
  });

  ipcMain.handle('start-sync', () => {
    executeSync();
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
});
