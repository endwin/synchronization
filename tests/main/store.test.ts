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
    expect(Array.isArray(config.sync.folders)).toBe(true);
    expect(config.sync.folders.length).toBe(0);
  });

  it('should persist and manage multiple sync folders with deleteOnRemote flag', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({
      sync: {
        folders: [
          { id: '1', localPath: 'C:/Folder1', remotePath: '/home/F1', deleteOnRemote: true, enabled: true },
          { id: '2', localPath: 'C:/Folder2', remotePath: '/home/F2', deleteOnRemote: false, enabled: true }
        ],
        intervalMinutes: 60,
        realtimeSync: true
      }
    });

    const loaded = new ConfigStore(tempConfigFile).get();
    expect(loaded.sync.folders.length).toBe(2);
    expect(loaded.sync.folders[0].deleteOnRemote).toBe(true);
    expect(loaded.sync.folders[1].deleteOnRemote).toBe(false);
  });

  it('should migrate legacy single folder config to folders array', () => {
    // Write legacy config
    fs.writeFileSync(tempConfigFile, JSON.stringify({
      nas: { url: 'https://nas.me', remotePath: '/home/OldRemote' },
      sync: { localPath: 'C:/OldLocal', intervalMinutes: 15 }
    }));

    const store = new ConfigStore(tempConfigFile);
    const config = store.get();
    expect(config.sync.folders.length).toBe(1);
    expect(config.sync.folders[0].localPath).toBe('C:/OldLocal');
    expect(config.sync.folders[0].remotePath).toBe('/home/OldRemote');
    expect(config.sync.folders[0].deleteOnRemote).toBe(false);
  });

  it('should encrypt password on disk and decrypt when retrieved', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({
      nas: {
        url: 'https://nas.example.com',
        username: 'admin',
        password: 'mySecretPassword123!',
        allowInsecureSSL: true
      }
    });

    const rawDiskContent = fs.readFileSync(tempConfigFile, 'utf-8');
    expect(rawDiskContent).not.toContain('mySecretPassword123!');
    expect(rawDiskContent).toContain('encryptedPassword');

    const loadedStore = new ConfigStore(tempConfigFile);
    expect(loadedStore.get().nas.password).toBe('mySecretPassword123!');
  });

  it('should reload configuration from disk', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({ sync: { intervalMinutes: 10, realtimeSync: false, folders: [] } });
    expect(store.get().sync.intervalMinutes).toBe(10);

    const current = JSON.parse(fs.readFileSync(tempConfigFile, 'utf-8'));
    current.sync.intervalMinutes = 45;
    fs.writeFileSync(tempConfigFile, JSON.stringify(current));

    store.reload();
    expect(store.get().sync.intervalMinutes).toBe(45);
  });

  it('should retain existing password when saving with empty password', () => {
    const store = new ConfigStore(tempConfigFile);
    store.save({
      nas: {
        url: 'https://nas.example.com',
        username: 'admin',
        password: 'initialPassword',
        allowInsecureSSL: true
      }
    });
    expect(store.get().nas.password).toBe('initialPassword');

    store.save({
      nas: {
        url: 'https://nas.example.com',
        username: 'admin',
        password: '',
        allowInsecureSSL: true
      }
    });
    expect(store.get().nas.password).toBe('initialPassword');
  });
});
