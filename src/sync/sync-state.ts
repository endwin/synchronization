import * as fs from 'fs';
import * as path from 'path';

export interface SyncedItemRecord {
  relativePath: string;
  size: number;
  mtime: number;
  lastSyncedAt: number;
}

export interface FolderSyncStateRecord {
  folderId: string;
  lastSyncTime: number;
  items: Record<string, SyncedItemRecord>;
}

export class SyncStateManager {
  private filePath: string;
  private state: Record<string, FolderSyncStateRecord>;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
  }

  private load(): Record<string, FolderSyncStateRecord> {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
    return {};
  }

  public save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save sync-state:', err);
    }
  }

  public getFolderState(folderId: string): Map<string, SyncedItemRecord> {
    const map = new Map<string, SyncedItemRecord>();
    const folderRecord = this.state[folderId];
    if (folderRecord && folderRecord.items) {
      for (const [relPath, item] of Object.entries(folderRecord.items)) {
        map.set(relPath, item);
      }
    }
    return map;
  }

  public updateFolderState(
    folderId: string,
    currentFiles: Map<string, { size: number; mtime: number }>
  ): void {
    const now = Date.now();
    const items: Record<string, SyncedItemRecord> = {};

    for (const [relPath, file] of currentFiles) {
      items[relPath] = {
        relativePath: relPath,
        size: file.size,
        mtime: file.mtime,
        lastSyncedAt: now
      };
    }

    this.state[folderId] = {
      folderId,
      lastSyncTime: now,
      items
    };

    this.save();
  }

  public removeFolderState(folderId: string): void {
    if (this.state[folderId]) {
      delete this.state[folderId];
      this.save();
    }
  }

  public clearAll(): void {
    this.state = {};
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {}
  }
}
