import * as fs from 'fs';
import * as path from 'path';

export interface FileWatcherOptions {
  debounceMs?: number;
  onFileChange: (filePath?: string) => void;
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
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private onFileChange: (filePath?: string) => void;
  private currentDir: string | null = null;

  constructor(options: FileWatcherOptions) {
    this.debounceMs = options.debounceMs ?? 3000;
    this.onFileChange = options.onFileChange;
  }

  handleEvent(eventType: string, filename: string | null): void {
    if (!filename || shouldIgnore(filename)) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onFileChange(filename);
    }, this.debounceMs);
  }

  start(directoryPath: string): void {
    if (this.watcher && this.currentDir === directoryPath) {
      return; // already watching same directory
    }
    this.stop();

    if (!directoryPath || !fs.existsSync(directoryPath)) {
      return;
    }

    try {
      this.currentDir = directoryPath;
      this.watcher = fs.watch(
        directoryPath,
        { recursive: true },
        (eventType, filename) => {
          this.handleEvent(eventType, filename ? filename.toString() : null);
        }
      );

      this.watcher.on('error', (err) => {
        console.error('File watcher error:', err);
      });
    } catch (err) {
      console.error('Failed to start file watcher:', err);
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
    this.currentDir = null;
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }
}
