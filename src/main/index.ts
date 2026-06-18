import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc-handlers';
import { startMcpServer, stopMcpServer } from './mcp-server';

// The main bundle is ESM (.mjs), where __dirname doesn't exist.
const moduleDir = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Aurora',
    webPreferences: {
      preload: join(moduleDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer's screenshot path uses requestAnimationFrame; Chromium
      // throttles rAF for occluded windows, which would stall agent screenshots.
      backgroundThrottling: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(moduleDir, '../renderer/index.html'));
  }

  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  mainWindow = win;
  return win;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startMcpServer(() => mainWindow).catch(err => console.error('[mcp] failed to start:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => { stopMcpServer(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
