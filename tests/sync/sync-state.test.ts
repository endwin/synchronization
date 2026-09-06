import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SyncStateManager } from '../../src/sync/sync-state';

describe('SyncStateManager', () => {
  let tempStateFile: string;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    tempStateFile = path.join(dir, 'sync-state.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempStateFile)) {
      fs.unlinkSync(tempStateFile);
    }
  });

  it('should return empty map when state file does not exist', () => {
    const manager = new SyncStateManager(tempStateFile);
    const state = manager.getFolderState('folder-1');
    expect(state.size).toBe(0);
  });

  it('should update and persist folder sync state on disk', () => {
    const manager = new SyncStateManager(tempStateFile);
    const files = new Map<string, { size: number; mtime: number }>();
    files.set('doc.pdf', { size: 1024, mtime: 1700000000 });
    files.set('sub/notes.txt', { size: 512, mtime: 1700000100 });

    manager.updateFolderState('folder-1', files);

    // Re-instantiate from disk
    const reloaded = new SyncStateManager(tempStateFile);
    const loadedState = reloaded.getFolderState('folder-1');

    expect(loadedState.size).toBe(2);
    expect(loadedState.get('doc.pdf')?.size).toBe(1024);
    expect(loadedState.get('sub/notes.txt')?.mtime).toBe(1700000100);
  });

  it('should remove folder state when folder is deleted', () => {
    const manager = new SyncStateManager(tempStateFile);
    const files = new Map<string, { size: number; mtime: number }>();
    files.set('test.txt', { size: 10, mtime: 1000 });
    manager.updateFolderState('folder-1', files);

    expect(manager.getFolderState('folder-1').size).toBe(1);

    manager.removeFolderState('folder-1');
    expect(manager.getFolderState('folder-1').size).toBe(0);

    const reloaded = new SyncStateManager(tempStateFile);
    expect(reloaded.getFolderState('folder-1').size).toBe(0);
  });
});
