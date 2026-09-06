import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { ConfigStore, SyncFolderPair } from './store';
import { createSystemTray } from './tray';
import { DailyLogger } from './logger';
import { SynologyWebDAVClient } from '../sync/webdav-client';
import { scanLocalDirectory } from '../sync/file-scanner';
import { calculateSyncPlan } from '../sync/sync-engine';
import { SyncScheduler } from '../sync/scheduler';
import { RealtimeFileWatcher } from '../sync/file-watcher';

import { SyncStateManager } from '../sync/sync-state';

// Ensure Windows command prompt uses UTF-8 (code page 65001) for Korean characters
if (process.platform === 'win32') {
  try {
    child_process.execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
  process.env.LANG = 'ko_KR.UTF-8';
}

function pruneEmptyLocalDirs(currentDir: string, rootDir: string): void {
  const normCurrent = path.resolve(currentDir);
  const normRoot = path.resolve(rootDir);

  if (!normCurrent.startsWith(normRoot) || normCurrent === normRoot) {
    return;
  }

  try {
    const entries = fs.readdirSync(normCurrent);
    if (entries.length === 0) {
      fs.rmdirSync(normCurrent);
      pruneEmptyLocalDirs(path.dirname(normCurrent), normRoot);
    }
  } catch {}
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;
  let tray: any = null;
  let isSyncing = false;
  let abortSync = false;

  const configPath = path.join(app.getPath('userData'), 'config.json');
  const store = new ConfigStore(configPath);
  const baseDir = app.isPackaged ? path.dirname(process.execPath) : (app.getAppPath() || process.cwd());
  const logsDir = path.join(baseDir, 'logs');
  const dailyLogger = new DailyLogger(logsDir);
  const statePath = path.join(app.getPath('userData'), 'sync-state.json');
  const syncStateManager = new SyncStateManager(statePath);

  function sendLog(msg: string) {
    const now = new Date();
    const time = now.toLocaleTimeString();
    const formatted = `[${time}] ${msg}`;
    console.log(formatted);
    dailyLogger.write(msg, now);
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
    abortSync = false;
    const config = store.get();

    try {
      sendLog('=== 동기화 프로세스 시작 ===');
      if (!config.nas.url) {
        sendLog('⚠️ 시놀로지 NAS 연결 설정이 완료되지 않았습니다.');
        return;
      }

      const folders = config.sync.folders.filter(f => f.enabled !== false && f.localPath && f.remotePath);
      if (folders.length === 0) {
        sendLog('⚠️ 활성화된 동기화 폴더가 없습니다. 폴더를 등록해 주세요.');
        return;
      }

      const client = new SynologyWebDAVClient(config.nas);
      let grandTotalUploaded = 0;
      let grandTotalDeletedRemote = 0;
      let grandTotalDeletedLocal = 0;
      let grandTotalSkipped = 0;

      for (const folder of folders) {
        if (abortSync) {
          sendLog('🛑 사용자에 의해 동기화가 취소되었습니다.');
          break;
        }

        sendLog(`📂 [${folder.localPath} ➔ ${folder.remotePath}] 검사 시작 (NAS삭제: ${folder.deleteOnRemote ? 'ON' : 'OFF'}, 로컬삭제: ${folder.deleteOnLocal ? 'ON' : 'OFF'})`);

        if (!fs.existsSync(folder.localPath)) {
          sendLog(`⚠️ 로컬 폴더가 존재하지 않아 건너뜁니다: ${folder.localPath}`);
          continue;
        }

        const localFiles = await scanLocalDirectory(folder.localPath);
        await client.ensureDir(folder.remotePath);
        const remoteFiles = await client.listRemoteFiles(folder.remotePath);
        const lastState = syncStateManager.getFolderState(folder.id);

        const plan = calculateSyncPlan(localFiles, remoteFiles, {
          deleteOnRemote: folder.deleteOnRemote,
          deleteOnLocal: folder.deleteOnLocal,
          lastState
        });

        const uploadList = plan.filter(item => item.action === 'upload');
        const deleteRemoteList = plan.filter(item => item.action === 'delete');
        const deleteLocalList = plan.filter(item => item.action === 'delete_local');
        const skippedList = plan.filter(item => item.action === 'skip');

        grandTotalSkipped += skippedList.length;
        sendLog(`📊 [${path.basename(folder.localPath)}] 업로드 ${uploadList.length}개, NAS삭제 ${deleteRemoteList.length}개, 로컬삭제 ${deleteLocalList.length}개, 스킵 ${skippedList.length}개`);

        const totalOps = uploadList.length + deleteRemoteList.length + deleteLocalList.length;
        let completedOps = 0;

        // 1. Upload new / modified files
        for (const item of uploadList) {
          if (abortSync) {
            sendLog('🛑 동기화 업로드 작업이 중단되었습니다.');
            break;
          }

          const fullLocalPath = path.join(folder.localPath, item.relativePath);
          const fullRemotePath = `${folder.remotePath}/${item.relativePath}`.replace(/\/+/g, '/');
          const remoteDir = path.dirname(fullRemotePath).replace(/\\/g, '/');

          sendLog(`⬆️ 업로드 [${item.reason}]: ${item.relativePath}`);
          await client.ensureDir(remoteDir);
          await client.uploadFile(fullLocalPath, fullRemotePath);
          completedOps++;
          grandTotalUploaded++;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-progress', {
              percent: Math.round((completedOps / (totalOps || 1)) * 100),
              currentFile: item.relativePath,
              completed: completedOps,
              total: totalOps
            });
          }
        }

        if (abortSync) break;

        // 2. Delete remote files if mirror deletion enabled
        for (const item of deleteRemoteList) {
          if (abortSync) {
            sendLog('🛑 동기화 원격 삭제 작업이 중단되었습니다.');
            break;
          }

          const fullRemotePath = `${folder.remotePath}/${item.relativePath}`.replace(/\/+/g, '/');
          sendLog(`🗑️ 원격 삭제 [로컬에서 삭제됨]: ${item.relativePath}`);
          try {
            await client.deleteFile(fullRemotePath);
          } catch (delErr: any) {
            sendLog(`⚠️ 원격 삭제 실패: ${item.relativePath} (${delErr.message || delErr})`);
          }
          completedOps++;
          grandTotalDeletedRemote++;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-progress', {
              percent: Math.round((completedOps / (totalOps || 1)) * 100),
              currentFile: `[원격 삭제] ${item.relativePath}`,
              completed: completedOps,
              total: totalOps
            });
          }
        }

        if (abortSync) break;

        // 3. Delete local files if deleted in backup folder (deleteOnLocal)
        for (const item of deleteLocalList) {
          if (abortSync) {
            sendLog('🛑 동기화 로컬 삭제 작업이 중단되었습니다.');
            break;
          }

          const fullLocalPath = path.join(folder.localPath, item.relativePath);
          sendLog(`🗑️ 로컬 삭제 [백업폴더에서 삭제됨]: ${item.relativePath}`);
          try {
            if (fs.existsSync(fullLocalPath)) {
              fs.unlinkSync(fullLocalPath);
              pruneEmptyLocalDirs(path.dirname(fullLocalPath), folder.localPath);
            }
          } catch (delErr: any) {
            sendLog(`⚠️ 로컬 삭제 실패: ${item.relativePath} (${delErr.message || delErr})`);
          }
          completedOps++;
          grandTotalDeletedLocal++;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-progress', {
              percent: Math.round((completedOps / (totalOps || 1)) * 100),
              currentFile: `[로컬 삭제] ${item.relativePath}`,
              completed: completedOps,
              total: totalOps
            });
          }
        }

        // 4. Update sync state after operations
        const updatedLocalFiles = await scanLocalDirectory(folder.localPath);
        syncStateManager.updateFolderState(folder.id, updatedLocalFiles);

        if (abortSync) break;
      }

      const totalDeleted = grandTotalDeletedRemote + grandTotalDeletedLocal;
      if (abortSync) {
        sendLog('🛑 동기화가 사용자에 의해 취소되었습니다.');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-progress', {
            percent: 0,
            currentFile: '',
            completed: 0,
            total: 0,
            status: 'cancelled'
          });
        }
      } else {
        sendLog(`✓ 전체 동기화 완료: ${grandTotalUploaded}개 업로드, NAS삭제 ${grandTotalDeletedRemote}개, 로컬삭제 ${grandTotalDeletedLocal}개, ${grandTotalSkipped}개 스킵`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-progress', {
            percent: 100,
            currentFile: '',
            completed: grandTotalUploaded + totalDeleted,
            total: grandTotalUploaded + totalDeleted,
            status: 'completed'
          });
        }
      }
    } catch (err: any) {
      sendLog(`❌ 동기화 실패: ${err.message || err}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-progress', {
          percent: 0,
          currentFile: '',
          completed: 0,
          total: 0,
          status: 'error'
        });
      }
    } finally {
      isSyncing = false;
      abortSync = false;
    }
  }

  const scheduler = new SyncScheduler(executeSync);

  const fileWatcher = new RealtimeFileWatcher({
    debounceMs: 3000,
    onFileChange: (changedFile, baseDir) => {
      sendLog(`⚡ [실시간 감지] 변경 감지됨: ${changedFile || '파일'} (위치: ${baseDir || '로컬'})`);
      executeSync();
    }
  });

  function updateWatcherState() {
    const cfg = store.get();
    if (cfg.sync.realtimeSync) {
      const activePaths = cfg.sync.folders
        .filter(f => f.enabled !== false && f.localPath)
        .map(f => f.localPath);

      if (activePaths.length > 0) {
        sendLog(`⚡ 실시간 감시 활성화: ${activePaths.length}개 폴더 감시 중`);
        fileWatcher.start(activePaths);
        return;
      }
    }
    fileWatcher.stop();
  }

  function createWindow() {
    const iconCandidates = [
      path.join(__dirname, '../../assets/icon.png'),
      path.join(__dirname, '../assets/icon.png'),
      path.join(app.getAppPath(), 'assets/icon.png'),
      path.join(app.getAppPath(), 'dist/assets/icon.png')
    ];
    const iconPath = iconCandidates.find(p => fs.existsSync(p)) || iconCandidates[0];

    const startHidden = process.argv.includes('--hidden');

    mainWindow = new BrowserWindow({
      width: 820,
      height: 840,
      minWidth: 700,
      minHeight: 650,
      show: !startHidden,
      title: 'Synology Sync Manager',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const rendererPathCandidates = [
      path.join(__dirname, '../renderer/index.html'),
      path.join(__dirname, '../../src/renderer/index.html'),
      path.join(app.getAppPath(), 'dist/renderer/index.html')
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
    updateWatcherState();
  }

  function updateAutoStartSetting(enable: boolean) {
    try {
      app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: true,
        args: ['--hidden']
      });
    } catch (err) {
      console.error('Failed to set login item settings:', err);
    }
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    store.reload();

    const initialConfig = store.get();
    if (initialConfig.sync.autoStart !== undefined) {
      updateAutoStartSetting(Boolean(initialConfig.sync.autoStart));
    }

    ipcMain.handle('get-config', () => {
      const current = store.get();
      try {
        current.sync.autoStart = app.getLoginItemSettings().openAtLogin;
      } catch {}
      return current;
    });

    ipcMain.handle('save-config', (_event, cfg) => {
      store.save(cfg);
      scheduler.setIntervalMinutes(cfg.sync?.intervalMinutes ?? 30);
      updateWatcherState();
      if (cfg.sync?.autoStart !== undefined) {
        updateAutoStartSetting(Boolean(cfg.sync.autoStart));
      }
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
      const effectiveNasCfg = {
        ...nasCfg,
        password: nasCfg.password || store.get().nas.password
      };
      sendLog(`NAS 연결 테스트 시도: ${effectiveNasCfg.url}`);
      const client = new SynologyWebDAVClient(effectiveNasCfg);
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

    ipcMain.handle('cancel-sync', () => {
      if (isSyncing) {
        abortSync = true;
        sendLog('⏹️ 동기화 취소 요청을 접수했습니다. 진행 중인 작업을 안전하게 중단합니다...');
        return true;
      }
      return false;
    });

    ipcMain.handle('open-logs-folder', async () => {
      await shell.openPath(dailyLogger.getLogsDir());
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
    fileWatcher.stop();
    (app as any).isQuitting = true;
  });
}
