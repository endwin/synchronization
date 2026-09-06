import { describe, it, expect } from 'vitest';
import { calculateSyncPlan } from '../../src/sync/sync-engine';
import { SyncedItemRecord } from '../../src/sync/sync-state';

describe('calculateSyncPlan', () => {
  it('should identify new files for upload', () => {
    const local = new Map([
      ['new.txt', { relativePath: 'new.txt', size: 100, mtime: 1000 }]
    ]);
    const remote = new Map();

    const plan = calculateSyncPlan(local, remote);
    expect(plan.length).toBe(1);
    expect(plan[0].action).toBe('upload');
    expect(plan[0].reason).toBe('new');
  });

  it('should identify modified files (different size or newer mtime)', () => {
    const local = new Map([
      ['size_diff.txt', { relativePath: 'size_diff.txt', size: 200, mtime: 1000 }],
      ['time_diff.txt', { relativePath: 'time_diff.txt', size: 100, mtime: 5000 }]
    ]);
    const remote = new Map([
      ['size_diff.txt', { relativePath: 'size_diff.txt', size: 150, mtime: 1000 }],
      ['time_diff.txt', { relativePath: 'time_diff.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote);
    expect(plan.filter(i => i.action === 'upload').length).toBe(2);
  });

  it('should skip identical files', () => {
    const local = new Map([
      ['same.txt', { relativePath: 'same.txt', size: 100, mtime: 1000 }]
    ]);
    const remote = new Map([
      ['same.txt', { relativePath: 'same.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote);
    expect(plan[0].action).toBe('skip');
    expect(plan[0].reason).toBe('identical');
  });

  it('should never delete remote files when deleteOnRemote is false (Safe Backup)', () => {
    const local = new Map();
    const remote = new Map([
      ['deleted_on_local.txt', { relativePath: 'deleted_on_local.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote, { deleteOnRemote: false });
    expect(plan.length).toBe(0); // Nothing to upload or delete
  });

  it('should delete remote files when deleteOnRemote is true (Mirror Deletion)', () => {
    const local = new Map();
    const remote = new Map([
      ['deleted_on_local.txt', { relativePath: 'deleted_on_local.txt', size: 100, mtime: 1000 }]
    ]);

    const plan = calculateSyncPlan(local, remote, { deleteOnRemote: true });
    expect(plan.length).toBe(1);
    expect(plan[0].action).toBe('delete');
    expect(plan[0].reason).toBe('deleted_on_local');
    expect(plan[0].relativePath).toBe('deleted_on_local.txt');
  });

  it('should mark for delete_local when file was deleted in backup folder and deleteOnLocal is true', () => {
    const local = new Map([
      ['existing_file.txt', { relativePath: 'existing_file.txt', size: 100, mtime: 1000 }]
    ]);
    // Remote does NOT have existing_file.txt (user deleted it on NAS)
    const remote = new Map();

    const lastState = new Map<string, SyncedItemRecord>([
      ['existing_file.txt', { relativePath: 'existing_file.txt', size: 100, mtime: 1000, lastSyncedAt: 999 }]
    ]);

    const plan = calculateSyncPlan(local, remote, { deleteOnLocal: true, lastState });
    expect(plan.length).toBe(1);
    expect(plan[0].action).toBe('delete_local');
    expect(plan[0].reason).toBe('deleted_on_remote');
    expect(plan[0].relativePath).toBe('existing_file.txt');
  });

  it('should upload instead of delete_local if a new file is created locally (not in lastState)', () => {
    const local = new Map([
      ['brand_new_file.txt', { relativePath: 'brand_new_file.txt', size: 200, mtime: 2000 }]
    ]);
    const remote = new Map();
    const lastState = new Map<string, SyncedItemRecord>();

    const plan = calculateSyncPlan(local, remote, { deleteOnLocal: true, lastState });
    expect(plan.length).toBe(1);
    expect(plan[0].action).toBe('upload');
    expect(plan[0].reason).toBe('new');
  });
});
