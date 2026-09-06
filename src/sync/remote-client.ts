import { SynologyWebDAVClient, RemoteFileStat } from './webdav-client';
import { FtpClientWrapper } from './ftp-client';
import { SambaClientWrapper } from './smb-client';

export type RemoteProtocol = 'webdav' | 'smb' | 'ftp' | 'ftps';

export interface RemoteConnectionConfig {
  protocol?: RemoteProtocol;
  url: string;
  port?: number;
  username: string;
  password?: string;
  allowInsecureSSL?: boolean;
}

export interface RemoteClient {
  testConnection(): Promise<{ success: boolean; message?: string }>;
  ensureDir(remoteDirPath: string): Promise<void>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  deleteFile(remotePath: string): Promise<void>;
  listRemoteFiles(remoteBasePath: string): Promise<Map<string, RemoteFileStat>>;
  deleteDirectory?(remoteDirPath: string): Promise<void>;
  close?(): Promise<void>;
}

export const REMOTE_IGNORE_PATTERNS = [
  /^\.git$/i,
  /^node_modules$/i,
  /^logs$/i,
  /\.log$/i,
  /\.tmp$/i,
  /^~\$/,
  /^Thumbs\.db$/i,
  /^\.DS_Store$/i,
  /^desktop\.ini$/i,
  /^@eaDir$/i,
  /^#recycle$/i
];

export function shouldIgnoreRemote(nameOrPath: string): boolean {
  const normalized = nameOrPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some(seg => REMOTE_IGNORE_PATTERNS.some(p => p.test(seg)));
}

export function createRemoteClient(config: RemoteConnectionConfig): RemoteClient {
  const protocol = config.protocol || 'webdav';

  switch (protocol) {
    case 'ftp':
    case 'ftps':
      return new FtpClientWrapper(config);

    case 'smb':
      return new SambaClientWrapper(config);

    case 'webdav':
    default:
      return new SynologyWebDAVClient({
        url: config.url,
        port: config.port,
        username: config.username,
        password: config.password || '',
        allowInsecureSSL: config.allowInsecureSSL
      });
  }
}
