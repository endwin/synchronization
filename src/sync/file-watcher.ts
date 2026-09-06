import * as fs from 'fs';
import * as path from 'path';

export interface FileWatcherOptions {
  debounceMs?: number;
  onFileChange: (filePath?: string, baseDir?: string) => void;
}

const IGNORE_PATTERNS = [
  /^\.git/i,
  /^node_modules/i,
  /\.tmp$/i,
  /^~\$/,
  /Thumbs\.db$/i,
  /^\.DS_Store$/i
];

function shouldIgnore(filename: string): boolean {
  if (!filename) return false;
  const basename = path.basename(filename);
  return IGNORE_PATTERNS.some(p => p.test(filename) || p.test(basename));
}

export class RealtimeFileWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private onFileChange: (filePath?: string, baseDir?: string) => void;

  constructor(options: FileWatcherOptions) {
    this.debounceMs = options.debounceMs ?? 3000;
    this.onFileChange = options.onFileChange;
  }

  handleEvent(eventType: string, filename: string | null, baseDir?: string): void {
    if (!filename || shouldIgnore(filename)) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onFileChange(filename, baseDir);
    }, this.debounceMs);
  }

  start(directoryPaths: string | string[]): void {
    const rawPaths = Array.isArray(directoryPaths) ? directoryPaths : [directoryPaths];
    const targetPaths = rawPaths
      .map(p => (p || '').trim())
      .filter(p => p.length > 0 && fs.existsSync(p));

    const newPathSet = new Set(targetPaths);

    // Stop watchers no longer in targetPaths
    for (const [watchedPath, watcher] of this.watchers.entries()) {
      if (!newPathSet.has(watchedPath)) {
        try {
          watcher.close();
        } catch {}
        this.watchers.delete(watchedPath);
      }
    }

    // Start watchers for new paths
    for (const dirPath of targetPaths) {
      if (this.watchers.has(dirPath)) continue;

      try {
        const watcher = fs.watch(
          dirPath,
          { recursive: true },
          (eventType, filename) => {
            this.handleEvent(eventType, filename ? filename.toString() : null, dirPath);
          }
        );

        watcher.on('error', (err) => {
          console.error(`File watcher error on ${dirPath}:`, err);
        });

        this.watchers.set(dirPath, watcher);
      } catch (err) {
        console.error(`Failed to watch directory ${dirPath}:`, err);
      }
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {}
    }
    this.watchers.clear();
  }

  isWatching(): boolean {
    return this.watchers.size > 0;
  }

  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }
}
