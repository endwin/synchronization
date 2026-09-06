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
    expect(config.sync.realtimeSync).toBe(false);
  });

  it('should persist modified configuration', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({
      sync: { localPath: 'C:/Backup', intervalMinutes: 60, realtimeSync: true }
    });
    const loaded = new ConfigStore(tempConfigFile).get();
    expect(loaded.sync.localPath).toBe('C:/Backup');
    expect(loaded.sync.intervalMinutes).toBe(60);
    expect(loaded.sync.realtimeSync).toBe(true);
  });

  it('should encrypt password on disk and decrypt when retrieved', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({
      nas: {
        url: 'https://nas.example.com',
        username: 'admin',
        password: 'mySecretPassword123!',
        remotePath: '/home/Backup',
        allowInsecureSSL: true
      }
    });

    // Check disk content: plain password MUST NOT exist in raw file
    const rawDiskContent = fs.readFileSync(tempConfigFile, 'utf-8');
    expect(rawDiskContent).not.toContain('mySecretPassword123!');
    expect(rawDiskContent).toContain('encryptedPassword');

    // Check loaded config: password is properly decrypted in memory
    const loadedStore = new ConfigStore(tempConfigFile);
    expect(loadedStore.get().nas.password).toBe('mySecretPassword123!');
  });
});
