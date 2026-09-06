import * as fs from 'fs/promises';
import * as path from 'path';

export interface ScannedFile {
  relativePath: string;
  size: number;
  mtime: number;
}

const IGNORE_PATTERNS = [
  /^\.git$/i,
  /^node_modules$/i,
  /^logs$/i,
  /\.log$/i,
  /\.tmp$/i,
  /^~\$/,
  /^Thumbs\.db$/i,
  /^\.DS_Store$/i
];

function shouldIgnore(name: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(name));
}

export async function scanLocalDirectory(baseDir: string): Promise<Map<string, ScannedFile>> {
  const fileMap = new Map<string, ScannedFile>();

  async function walk(currentDir: string, relativeDir: string) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const normalizedRelPath = relPath.normalize('NFC').replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await walk(fullPath, normalizedRelPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          fileMap.set(normalizedRelPath, {
            relativePath: normalizedRelPath,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs)
          });
        } catch {
          // Skip locked files
        }
      }
    }
  }

  await walk(baseDir, '');
  return fileMap;
}
