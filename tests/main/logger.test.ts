import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DailyLogger } from '../../src/main/logger';

describe('DailyLogger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should format date string properly', () => {
    const logger = new DailyLogger(tempDir);
    const date = new Date(2026, 8, 6, 12, 30, 0); // Month 8 is September
    expect(logger.getDateString(date)).toBe('2026-09-06');
  });

  it('should write logs to date-named file', () => {
    const logger = new DailyLogger(tempDir);
    const testDate = new Date(2026, 8, 6, 14, 25, 30);
    
    logger.write('동기화 시작', testDate);
    logger.write('파일 업로드 완료: test.txt', testDate);

    const logFile = path.join(tempDir, '2026-09-06.log');
    expect(fs.existsSync(logFile)).toBe(true);

    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('[2026-09-06 14:25:30] 동기화 시작');
    expect(content).toContain('파일 업로드 완료: test.txt');
  });

  it('should rotate to new date file when date changes', () => {
    const logger = new DailyLogger(tempDir);
    const day1 = new Date(2026, 8, 6, 23, 59, 0);
    const day2 = new Date(2026, 8, 7, 0, 1, 0);

    logger.write('Day 1 log', day1);
    logger.write('Day 2 log', day2);

    const file1 = path.join(tempDir, '2026-09-06.log');
    const file2 = path.join(tempDir, '2026-09-07.log');

    expect(fs.existsSync(file1)).toBe(true);
    expect(fs.existsSync(file2)).toBe(true);

    expect(fs.readFileSync(file1, 'utf-8')).toContain('Day 1 log');
    expect(fs.readFileSync(file2, 'utf-8')).toContain('Day 2 log');
  });
});
