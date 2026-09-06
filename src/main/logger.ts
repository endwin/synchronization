import * as fs from 'fs';
import * as path from 'path';

export class DailyLogger {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.ensureDir();
  }

  private ensureDir(): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch {}
  }

  public getLogsDir(): string {
    return this.baseDir;
  }

  public getDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public getTodayLogPath(date: Date = new Date()): string {
    const dateStr = this.getDateString(date);
    return path.join(this.baseDir, `${dateStr}.log`);
  }

  public write(message: string, date: Date = new Date()): string {
    this.ensureDir();
    const logPath = this.getTodayLogPath(date);
    const timeStr = [
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0')
    ].join(':');
    const line = `[${this.getDateString(date)} ${timeStr}] ${message}\n`;
    try {
      fs.appendFileSync(logPath, line, 'utf-8');
    } catch (err) {
      console.error('Failed to write daily log:', err);
    }
    return line;
  }
}
