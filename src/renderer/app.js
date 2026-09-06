document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const nasUrlInput = document.getElementById('nasUrl');
  const nasUsernameInput = document.getElementById('nasUsername');
  const nasPasswordInput = document.getElementById('nasPassword');
  const allowInsecureSSLInput = document.getElementById('allowInsecureSSL');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const testResultMsg = document.getElementById('testResultMsg');

  const localPathInput = document.getElementById('localPath');
  const remotePathInput = document.getElementById('remotePath');
  const btnSelectFolder = document.getElementById('btnSelectFolder');

  const syncIntervalSelect = document.getElementById('syncInterval');
  const realtimeSyncInput = document.getElementById('realtimeSync');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const btnStartSync = document.getElementById('btnStartSync');

  const globalStatusBadge = document.getElementById('globalStatusBadge');
  const progressCurrentFile = document.getElementById('progressCurrentFile');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');

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

  // Load initial config
  try {
    const config = await window.electronAPI.getConfig();
    if (config) {
      if (config.nas) {
        nasUrlInput.value = config.nas.url || '';
        nasUsernameInput.value = config.nas.username || '';
        nasPasswordInput.value = config.nas.password || '';
        allowInsecureSSLInput.checked = config.nas.allowInsecureSSL !== false;
        remotePathInput.value = config.nas.remotePath || '/home/Backup';
      }
      if (config.sync) {
        localPathInput.value = config.sync.localPath || '';
        syncIntervalSelect.value = (config.sync.intervalMinutes ?? 30).toString();
        realtimeSyncInput.checked = Boolean(config.sync.realtimeSync);
      }
    }
  } catch (err) {
    appendLog(`[오류] 설정 불러오기 실패: ${err.message}`);
  }

  // Select local folder
  btnSelectFolder.addEventListener('click', async () => {
    try {
      const selected = await window.electronAPI.selectLocalFolder();
      if (selected) {
        localPathInput.value = selected;
      }
    } catch (err) {
      appendLog(`[오류] 폴더 선택 실패: ${err.message}`);
    }
  });

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
    return {
      nas: {
        url: nasUrlInput.value.trim(),
        username: nasUsernameInput.value.trim(),
        password: nasPasswordInput.value.trim(),
        remotePath: remotePathInput.value.trim() || '/home/Backup',
        allowInsecureSSL: allowInsecureSSLInput.checked
      },
      sync: {
        localPath: localPathInput.value.trim(),
        intervalMinutes: parseInt(syncIntervalSelect.value, 10) || 0,
        realtimeSync: realtimeSyncInput.checked
      }
    };
  }

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

  // Start Sync Now
  btnStartSync.addEventListener('click', async () => {
    try {
      btnStartSync.disabled = true;
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
      btnStartSync.disabled = false;
    }
  });

  // Listen to sync progress
  window.electronAPI.onSyncProgress((progress) => {
    if (progress.percent !== undefined) {
      progressBarFill.style.width = `${progress.percent}%`;
      progressPercent.textContent = `${progress.percent}%`;
    }
    if (progress.currentFile) {
      progressCurrentFile.textContent = `전송 중: ${progress.currentFile} (${progress.completed}/${progress.total})`;
    }
    if (progress.status === 'completed') {
      setStatus('동기화 완료', 'success');
      progressCurrentFile.textContent = `완료됨 (${progress.completed}개 업로드)`;
      btnStartSync.disabled = false;
      setTimeout(() => setStatus('대기 중'), 5000);
    }
  });

  // Listen to logs
  window.electronAPI.onLog((msg) => {
    appendLog(msg);
  });

  // Clear logs
  btnClearLogs.addEventListener('click', () => {
    logConsole.innerHTML = '';
  });
});
