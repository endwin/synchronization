import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';

export function createSystemTray(mainWindow: BrowserWindow, onSyncNow: () => void): Tray {
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAW0lEQVR42mNkQAO/gPg/EP8HYi4GBgYGRkZGhn/o/P/oYgwM////R1ZgxKYAG3Ds2DFcypAV4LMAl424DMAlR1yG4pYlOgtxmoDLK5T6AKsLmBkYGFDVEMwIAF8Wj9f9zRrnAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromBuffer(Buffer.from(iconBase64, 'base64'));
  const tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '지금 즉시 동기화', click: () => onSyncNow() },
    { type: 'separator' },
    { label: '창 열기', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '종료', click: () => { (app as any).isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Synology Sync Manager');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
