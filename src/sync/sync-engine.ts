import { ScannedFile } from './file-scanner';
import { RemoteFileStat } from './webdav-client';

export type SyncAction = 'upload' | 'skip';
export interface SyncItem {
  relativePath: string;
  action: SyncAction;
  reason: 'new' | 'modified_size' | 'modified_mtime' | 'identical';
  localSize: number;
  localMtime: number;
}

export function calculateSyncPlan(
  localFiles: Map<string, ScannedFile>,
  remoteFiles: Map<string, RemoteFileStat>
): SyncItem[] {
  const plan: SyncItem[] = [];

  for (const [relPath, local] of localFiles) {
    const remote = remoteFiles.get(relPath);

    if (!remote) {
      plan.push({
        relativePath: relPath,
        action: 'upload',
        reason: 'new',
        localSize: local.size,
        localMtime: local.mtime
      });
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

  return plan;
}
