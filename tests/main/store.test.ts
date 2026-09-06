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
