import { ScannedFile } from './file-scanner';
import { RemoteFileStat } from './webdav-client';
import { SyncedItemRecord } from './sync-state';

export type SyncAction = 'upload' | 'skip' | 'delete' | 'delete_local';
export interface SyncItem {
  relativePath: string;
  action: SyncAction;
  reason: 'new' | 'modified_size' | 'modified_mtime' | 'identical' | 'deleted_on_local' | 'deleted_on_remote';
  localSize: number;
  localMtime: number;
}

export interface SyncPlanOptions {
  deleteOnRemote?: boolean;
  deleteOnLocal?: boolean;
  lastState?: Map<string, SyncedItemRecord>;
}

export function calculateSyncPlan(
  localFiles: Map<string, ScannedFile>,
  remoteFiles: Map<string, RemoteFileStat>,
  options?: SyncPlanOptions
): SyncItem[] {
  const plan: SyncItem[] = [];

  for (const [relPath, local] of localFiles) {
    const remote = remoteFiles.get(relPath);

    if (!remote) {
      // If deleteOnLocal is true and the file was previously recorded in lastState,
      // then it was deleted in the backup folder (remote NAS)!
      if (options?.deleteOnLocal && options?.lastState && options.lastState.has(relPath)) {
        plan.push({
          relativePath: relPath,
          action: 'delete_local',
          reason: 'deleted_on_remote',
          localSize: local.size,
          localMtime: local.mtime
        });
      } else {
        // Otherwise, it is a newly added local file to upload
        plan.push({
          relativePath: relPath,
          action: 'upload',
          reason: 'new',
          localSize: local.size,
          localMtime: local.mtime
        });
      }
    } else if (local.size !== remote.size) {
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'modified_size',
        localSize: local.size,
        localMtime: local.mtime
      });
    } else if (local.mtime > remote.mtime + 2000) { // 2s tolerance for file system mtime
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'modified_mtime',
        localSize: local.size,
        localMtime: local.mtime
      });
    } else {
      plan.push({
        relativePath: relPath,
        action: 'skip',
        reason: 'identical',
        localSize: local.size,
        localMtime: local.mtime
      });
    }
  }

  if (options?.deleteOnRemote) {
    for (const [relPath] of remoteFiles) {
      if (!localFiles.has(relPath)) {
        plan.push({
          relativePath: relPath,
          action: 'delete',
          reason: 'deleted_on_local',
          localSize: 0,
          localMtime: 0
        });
      }
    }
  }

  return plan;
}
