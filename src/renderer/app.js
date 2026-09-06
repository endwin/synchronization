document.addEventListener('DOMContentLoaded', async () => {
  // NAS Elements
  const nasUrlInput = document.getElementById('nasUrl');
  const nasUsernameInput = document.getElementById('nasUsername');
  const nasPasswordInput = document.getElementById('nasPassword');
  const allowInsecureSSLInput = document.getElementById('allowInsecureSSL');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const testResultMsg = document.getElementById('testResultMsg');

  // Folder Container Elements
  const foldersContainer = document.getElementById('foldersContainer');
  const btnAddFolder = document.getElementById('btnAddFolder');
  const noFoldersNotice = document.getElementById('noFoldersNotice');

  // Controls Elements
  const syncIntervalSelect = document.getElementById('syncInterval');
  const realtimeSyncInput = document.getElementById('realtimeSync');
  const autoStartInput = document.getElementById('autoStart');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnStartSync = document.getElementById('btnStartSync');
  const btnCancelSync = document.getElementById('btnCancelSync');
  const btnResetAll = document.getElementById('btnResetAll');

  // NAS Modal Elements
  const nasModalOverlay = document.getElementById('nasModalOverlay');
  const btnOpenNasModal = document.getElementById('btnOpenNasModal');
  const btnCloseNasModal = document.getElementById('btnCloseNasModal');
  const btnCancelNasModal = document.getElementById('btnCancelNasModal');
  const btnSaveNasModal = document.getElementById('btnSaveNasModal');

  // Status & Progress Elements
  const globalStatusBadge = document.getElementById('globalStatusBadge');
  const progressCurrentFile = document.getElementById('progressCurrentFile');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');

  // Log Elements
  const logConsole = document.getElementById('logConsole');
  const btnClearLogs = document.getElementById('btnClearLogs');

  function appendLog(msg) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = msg;
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
  }

  function setStatus(text, type = '') {
    globalStatusBadge.textContent = text;
    globalStatusBadge.className = `status-badge ${type}`.trim();
  }

  function updateNoFoldersNotice() {
    const count = foldersContainer.querySelectorAll('.folder-row').length;
    noFoldersNotice.style.display = count === 0 ? 'block' : 'none';
  }

  function createFolderRow(folderData = {}) {
    const id = folderData.id || `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const localPath = folderData.localPath || '';
    const remotePath = folderData.remotePath || '/Backup';
    const deleteOnRemote = Boolean(folderData.deleteOnRemote);
    const deleteOnLocal = Boolean(folderData.deleteOnLocal);
    const enabled = folderData.enabled !== false;

    const row = document.createElement('div');
    row.className = 'folder-row';
    row.dataset.id = id;

    row.innerHTML = `
      <div class="folder-row-header">
        <label class="folder-enable-label">
          <input type="checkbox" class="folder-enabled" ${enabled ? 'checked' : ''} />
          <span class="folder-title">동기화 폴더</span>
        </label>
        <button type="button" class="btn-danger-text btn-delete-folder">🗑️ 삭제</button>
      </div>
      <div class="folder-row-body">
        <div class="form-group">
          <label>로컬 폴더</label>
          <div class="input-with-button">
            <input type="text" class="folder-local-path" value="${localPath}" placeholder="로컬 폴더 선택" readonly />
            <button type="button" class="btn btn-secondary btn-sm btn-browse-folder">찾아보기</button>
          </div>
        </div>
        <div class="form-group">
          <label>NAS 원격 저장 폴더</label>
          <input type="text" class="folder-remote-path" value="${remotePath}" placeholder="/Backup" />
        </div>
        <div class="form-group checkbox-group delete-remote-box">
          <label>
            <input type="checkbox" class="folder-delete-remote" ${deleteOnRemote ? 'checked' : ''} />
            ⚠️ <strong>로컬에서 삭제 시 NAS 백업 파일도 함께 삭제</strong> (원격 삭제 동기화)
          </label>
        </div>
        <div class="form-group checkbox-group delete-local-box">
          <label>
            <input type="checkbox" class="folder-delete-local" ${deleteOnLocal ? 'checked' : ''} />
            ⚠️ <strong>백업 폴더(NAS)에서 삭제 시 로컬 폴더 및 파일도 함께 삭제</strong> (로컬 삭제 동기화)
          </label>
        </div>
      </div>
    `;

    // Browse button event
    const btnBrowse = row.querySelector('.btn-browse-folder');
    const localInput = row.querySelector('.folder-local-path');
    const remoteInput = row.querySelector('.folder-remote-path');

    btnBrowse.addEventListener('click', async () => {
      try {
        const selected = await window.electronAPI.selectLocalFolder();
        if (selected) {
          const prevLocal = localInput.value.trim();
          localInput.value = selected;

          // Automatically populate NAS remote subfolder name based on local folder name
          const newFolderName = selected.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
          if (newFolderName) {
            const prevFolderName = prevLocal ? prevLocal.replace(/[/\\]+$/, '').split(/[/\\]/).pop() : '';
            let currentRemote = remoteInput.value.trim();

            if (!currentRemote) {
              currentRemote = '/Backup';
            }

            if (prevFolderName && currentRemote.endsWith('/' + prevFolderName)) {
              remoteInput.value = `${currentRemote.slice(0, -(prevFolderName.length + 1))}/${newFolderName}`;
            } else if (!prevFolderName && (currentRemote === '/Backup' || currentRemote === '/home/Backup' || currentRemote === '/')) {
              const base = currentRemote === '/' ? '' : currentRemote.replace(/\/+$/, '');
              remoteInput.value = `${base}/${newFolderName}`;
            } else if (!currentRemote.endsWith('/' + newFolderName)) {
              remoteInput.value = `${currentRemote.replace(/\/+$/, '')}/${newFolderName}`;
            }
          }
        }
      } catch (err) {
        appendLog(`[오류] 폴더 선택 실패: ${err.message}`);
      }
    });

    // Delete folder button event
    const btnDelete = row.querySelector('.btn-delete-folder');
    btnDelete.addEventListener('click', () => {
      row.remove();
      updateNoFoldersNotice();
    });

    foldersContainer.appendChild(row);
    updateNoFoldersNotice();
  }

  btnAddFolder.addEventListener('click', () => {
    createFolderRow();
  });

  // Load initial config
  try {
    const config = await window.electronAPI.getConfig();
    if (config) {
      if (config.nas) {
        nasUrlInput.value = config.nas.url || '';
        nasUsernameInput.value = config.nas.username || '';
        nasPasswordInput.value = config.nas.password || '';
        allowInsecureSSLInput.checked = config.nas.allowInsecureSSL !== false;
      }
      if (config.sync) {
        syncIntervalSelect.value = (config.sync.intervalMinutes ?? 30).toString();
        realtimeSyncInput.checked = Boolean(config.sync.realtimeSync);
        autoStartInput.checked = Boolean(config.sync.autoStart);

        const folders = Array.isArray(config.sync.folders) ? config.sync.folders : [];
        foldersContainer.innerHTML = '';
        if (folders.length > 0) {
          for (const f of folders) {
            createFolderRow(f);
          }
        } else {
          // Default empty row
          createFolderRow();
        }
      }
    }
  } catch (err) {
    appendLog(`[오류] 설정 불러오기 실패: ${err.message}`);
  }

  // Test NAS Connection
  btnTestConnection.addEventListener('click', async () => {
    testResultMsg.textContent = '연결 확인 중...';
    testResultMsg.className = 'test-result';
    btnTestConnection.disabled = true;

    try {
      const nasConfig = {
        url: nasUrlInput.value.trim(),
        username: nasUsernameInput.value.trim(),
        password: nasPasswordInput.value.trim(),
        allowInsecureSSL: allowInsecureSSLInput.checked
      };

      const res = await window.electronAPI.testConnection(nasConfig);
      if (res.success) {
        testResultMsg.textContent = '✓ 연결 성공';
        testResultMsg.className = 'test-result success';
      } else {
        testResultMsg.textContent = `❌ 실패: ${res.message}`;
        testResultMsg.className = 'test-result error';
      }
    } catch (err) {
      testResultMsg.textContent = `❌ 에러: ${err.message}`;
      testResultMsg.className = 'test-result error';
    } finally {
      btnTestConnection.disabled = false;
    }
  });

  // Save config helper
  function collectConfig() {
    const folderRows = foldersContainer.querySelectorAll('.folder-row');
    const folders = [];

    folderRows.forEach((row) => {
      const id = row.dataset.id;
      const enabled = row.querySelector('.folder-enabled').checked;
      const localPath = row.querySelector('.folder-local-path').value.trim();
      const remotePath = row.querySelector('.folder-remote-path').value.trim();
      const deleteOnRemote = row.querySelector('.folder-delete-remote').checked;
      const deleteOnLocal = row.querySelector('.folder-delete-local').checked;

      if (localPath || remotePath) {
        folders.push({
          id,
          localPath,
          remotePath: remotePath || '/home/Backup',
          deleteOnRemote,
          deleteOnLocal,
          enabled
        });
      }
    });

    return {
      nas: {
        url: nasUrlInput.value.trim(),
        username: nasUsernameInput.value.trim(),
        password: nasPasswordInput.value.trim(),
        allowInsecureSSL: allowInsecureSSLInput.checked
      },
      sync: {
        folders,
        intervalMinutes: parseInt(syncIntervalSelect.value, 10) || 0,
        realtimeSync: realtimeSyncInput.checked,
        autoStart: autoStartInput.checked
      }
    };
  }

  // Modal Event Listeners
  function openNasModal() {
    testResultMsg.textContent = '';
    testResultMsg.className = 'test-result';
    nasModalOverlay.style.display = 'flex';
  }

  function closeNasModal() {
    nasModalOverlay.style.display = 'none';
  }

  btnOpenNasModal.addEventListener('click', openNasModal);
  btnCloseNasModal.addEventListener('click', closeNasModal);
  btnCancelNasModal.addEventListener('click', closeNasModal);

  nasModalOverlay.addEventListener('click', (e) => {
    if (e.target === nasModalOverlay) {
      closeNasModal();
    }
  });

  btnSaveNasModal.addEventListener('click', async () => {
    try {
      btnSaveNasModal.disabled = true;
      const cfg = collectConfig();
      await window.electronAPI.saveConfig(cfg);
      setStatus('설정 저장됨', 'success');
      setTimeout(() => setStatus('대기 중'), 3000);
      closeNasModal();
    } catch (err) {
      appendLog(`[오류] NAS 설정 저장 실패: ${err.message}`);
    } finally {
      btnSaveNasModal.disabled = false;
    }
  });

  btnSaveConfig.addEventListener('click', async () => {
    try {
      btnSaveConfig.disabled = true;
      const cfg = collectConfig();
      await window.electronAPI.saveConfig(cfg);
      setStatus('설정 저장됨', 'success');
      setTimeout(() => setStatus('대기 중'), 3000);
    } catch (err) {
      appendLog(`[오류] 설정 저장 실패: ${err.message}`);
    } finally {
      btnSaveConfig.disabled = false;
    }
  });

  // Reset All Settings
  if (btnResetAll) {
    btnResetAll.addEventListener('click', async () => {
      const ok = confirm('시놀로지 NAS 접속 정보 및 등록된 동기화 폴더 설정을 모두 초기화하시겠습니까?');
      if (!ok) return;

      try {
        btnResetAll.disabled = true;
        await window.electronAPI.resetAllSettings();

        // Reset UI fields
        nasUrlInput.value = '';
        nasUsernameInput.value = '';
        nasPasswordInput.value = '';
        allowInsecureSSLInput.checked = true;
        testResultMsg.textContent = '';
        syncIntervalSelect.value = '30';
        realtimeSyncInput.checked = false;
        autoStartInput.checked = false;

        foldersContainer.innerHTML = '';
        createFolderRow();

        setStatus('초기화 완료', 'success');
        setTimeout(() => setStatus('대기 중'), 3000);
        appendLog('[시스템] 모든 설정(NAS 접속 정보, 동기화 폴더, 동기화 상태)이 성공적으로 초기화되었습니다.');
      } catch (err) {
        appendLog(`[오류] 초기화 실패: ${err.message}`);
      } finally {
        btnResetAll.disabled = false;
      }
    });
  }

  // Start Sync Now
  btnStartSync.addEventListener('click', async () => {
    try {
      btnStartSync.style.display = 'none';
      btnCancelSync.style.display = 'inline-flex';
      btnCancelSync.disabled = false;
      btnCancelSync.textContent = '⏹️ 동기화 취소';
      setStatus('동기화 중...', 'syncing');
      progressBarFill.style.width = '0%';
      progressPercent.textContent = '0%';
      progressCurrentFile.textContent = '스캔 및 비교 분석 중...';

      // Auto save latest config before start
      await window.electronAPI.saveConfig(collectConfig());
      await window.electronAPI.startSync();
    } catch (err) {
      appendLog(`[오류] 동기화 시작 실패: ${err.message}`);
      setStatus('오류 발생', 'error');
      btnStartSync.style.display = 'inline-flex';
      btnStartSync.disabled = false;
      btnCancelSync.style.display = 'none';
    }
  });

  // Cancel Sync
  btnCancelSync.addEventListener('click', async () => {
    try {
      btnCancelSync.disabled = true;
      btnCancelSync.textContent = '취소 요청 중...';
      await window.electronAPI.cancelSync();
    } catch (err) {
      appendLog(`[오류] 동기화 취소 요청 실패: ${err.message}`);
      btnCancelSync.disabled = false;
    }
  });

  // Listen to sync progress
  window.electronAPI.onSyncProgress((progress) => {
    if (progress.percent !== undefined) {
      progressBarFill.style.width = `${progress.percent}%`;
      progressPercent.textContent = `${progress.percent}%`;
    }
    if (progress.currentFile) {
      progressCurrentFile.textContent = `진행 중: ${progress.currentFile} (${progress.completed}/${progress.total})`;
    }
    if (progress.status === 'completed') {
      setStatus('동기화 완료', 'success');
      progressCurrentFile.textContent = `완료됨 (${progress.completed}건 처리)`;
      btnStartSync.style.display = 'inline-flex';
      btnStartSync.disabled = false;
      btnCancelSync.style.display = 'none';
      setTimeout(() => setStatus('대기 중'), 5000);
    } else if (progress.status === 'cancelled') {
      setStatus('동기화 취소됨', 'error');
      progressCurrentFile.textContent = '사용자에 의해 동기화가 취소되었습니다.';
      btnStartSync.style.display = 'inline-flex';
      btnStartSync.disabled = false;
      btnCancelSync.style.display = 'none';
      setTimeout(() => setStatus('대기 중'), 5000);
    } else if (progress.status === 'error') {
      setStatus('오류 발생', 'error');
      btnStartSync.style.display = 'inline-flex';
      btnStartSync.disabled = false;
      btnCancelSync.style.display = 'none';
    }
  });

  // Listen to logs
  window.electronAPI.onLog((msg) => {
    appendLog(msg);
  });

  // Open logs folder
  const btnOpenLogsFolder = document.getElementById('btnOpenLogsFolder');
  if (btnOpenLogsFolder) {
    btnOpenLogsFolder.addEventListener('click', async () => {
      try {
        await window.electronAPI.openLogsFolder();
      } catch (err) {
        appendLog(`[오류] 로그 폴더 열기 실패: ${err.message}`);
      }
    });
  }

  // Clear logs
  btnClearLogs.addEventListener('click', () => {
    logConsole.innerHTML = '';
  });
});
