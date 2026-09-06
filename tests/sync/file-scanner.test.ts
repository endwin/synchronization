import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanLocalDirectory } from '../../src/sync/file-scanner';

describe('scanLocalDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-scan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scan files recursively and collect size and mtime', async () => {
    fs.writeFileSync(path.join(tempDir, 'root.txt'), 'hello');
    fs.mkdirSync(path.join(tempDir, 'sub'));
    fs.writeFileSync(path.join(tempDir, 'sub', 'child.txt'), 'world!');

    const result = await scanLocalDirectory(tempDir);
    expect(result.size).toBe(2);
    expect(result.get('root.txt')).toBeDefined();
    expect(result.get('root.txt')?.size).toBe(5);
    expect(result.get('sub/child.txt')).toBeDefined();
    expect(result.get('sub/child.txt')?.size).toBe(6);
  });

  it('should ignore temp files, .git folder, logs directory, and .log files', async () => {
    fs.writeFileSync(path.join(tempDir, 'valid.txt'), 'data');
    fs.writeFileSync(path.join(tempDir, 'temp.tmp'), 'temp');
    fs.writeFileSync(path.join(tempDir, '~$lock.docx'), 'lock');
    fs.writeFileSync(path.join(tempDir, 'app.log'), 'log data');
    fs.mkdirSync(path.join(tempDir, '.git'));
    fs.writeFileSync(path.join(tempDir, '.git', 'HEAD'), 'ref');
    fs.mkdirSync(path.join(tempDir, 'logs'));
    fs.writeFileSync(path.join(tempDir, 'logs', '2026-09-06.log'), 'daily log');

    const result = await scanLocalDirectory(tempDir);
    expect(result.size).toBe(1);
    expect(result.has('valid.txt')).toBe(true);
    expect(result.has('app.log')).toBe(false);
    expect(result.has('logs/2026-09-06.log')).toBe(false);
  });
});
