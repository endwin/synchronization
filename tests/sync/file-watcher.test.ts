import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RealtimeFileWatcher } from '../../src/sync/file-watcher';

describe('RealtimeFileWatcher', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should debounce rapid file changes and trigger callback only once', () => {
    const callback = vi.fn();
    const watcher = new RealtimeFileWatcher({
      debounceMs: 1000,
      onFileChange: callback
    });

    // Simulate events
    watcher.handleEvent('change', 'doc1.txt');
    vi.advanceTimersByTime(500);
    watcher.handleEvent('change', 'doc2.txt');
    vi.advanceTimersByTime(500);
    watcher.handleEvent('change', 'doc3.txt');

    // Callback shouldn't have fired yet due to continuous events resetting debounce
    expect(callback).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    watcher.stop();
  });

  it('should ignore temp files and .git changes', () => {
    const callback = vi.fn();
    const watcher = new RealtimeFileWatcher({
      debounceMs: 500,
      onFileChange: callback
    });

    watcher.handleEvent('change', 'test.tmp');
    watcher.handleEvent('change', '~$word.docx');
    watcher.handleEvent('change', '.git/index');
    watcher.handleEvent('change', 'Thumbs.db');

    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();

    watcher.stop();
  });

  it('should start and stop watching directory cleanly', () => {
    const callback = vi.fn();
    const watcher = new RealtimeFileWatcher({
      debounceMs: 500,
      onFileChange: callback
    });

    expect(watcher.isWatching()).toBe(false);
    watcher.start(tempDir);
    expect(watcher.isWatching()).toBe(true);

    watcher.stop();
    expect(watcher.isWatching()).toBe(false);
  });
});
