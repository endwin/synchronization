import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export function createSystemTray(mainWindow: BrowserWindow, onSyncNow: () => void): Tray {
  const iconCandidates = [
    path.join(__dirname, '../../assets/icon.png'),
    path.join(__dirname, '../assets/icon.png'),
    path.join(app.getAppPath(), 'assets/icon.png'),
    path.join(app.getAppPath(), 'dist/assets/icon.png')
  ];
  const iconPath = iconCandidates.find(p => fs.existsSync(p)) || iconCandidates[0];

  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty() && fs.existsSync(iconPath)) {
    icon = nativeImage.createFromBuffer(fs.readFileSync(iconPath));
  }

  const tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '지금 즉시 동기화', click: () => onSyncNow() },
    { type: 'separator' },
    { label: '창 열기', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: '종료', click: () => { (app as any).isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('koken Sync Manager');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
