import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc-handlers';
import { startMcpServer, stopMcpServer } from './mcp-server';
import { IPC_CHANNELS } from '../shared/ipc-types';

// The main bundle is ESM (.mjs), where __dirname doesn't exist.
const moduleDir = dirname(fileURLToPath(import.meta.url));

// GPU escape hatch (must run BEFORE app is ready). On machines whose GL/GPU stack
// fails Chromium's canvas allocations — e.g. NVIDIA drivers logging "Failed to
// allocate NVKMS memory for GEM object" while the classic viewport blits its chunk
// canvases — hardware acceleration turns paints into multi-second stalls. Launch
// with AURORA_NO_GPU=1 to force the whole renderer onto the software compositor.
// The classic viewport is already CPU-canvas resilient (willReadFrequently), so
// this is a last resort for when even that isn't enough (e.g. WebGL surfaces).
if (process.env.AURORA_NO_GPU === '1') {
  app.disableHardwareAcceleration();
}

// Dev/investigation-only: open a Chrome DevTools Protocol endpoint on loopback so
// the headless crash/perf harnesses can drive the renderer. Gated on the env var
// (unset in every normal run), and paired with the VITE_AURORA_DEBUG window.__dbg
// hook. Must be set before app is ready.
if (process.env.AURORA_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.AURORA_DEBUG_PORT);
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Aurora',
    // Aurora mark as the window/taskbar icon (Linux honors the BrowserWindow
    // icon on X11). Resolved relative to the bundle: dist/main → <root>/build.
    icon: join(moduleDir, '../../build/icon.png'),
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

  installCloseGuard(win);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  mainWindow = win;
  return win;
}

/**
 * ASK BEFORE THE WINDOW TAKES THE WORK WITH IT.
 *
 * Every other exit door in Aurora prompts — closing a tab, switching acts,
 * opening a project, applying Setup — which trains the habit precisely where it
 * was missing. And no application menu is set, so Electron's default menu
 * supplies the `close` role on Ctrl+W: the reflexive close-this-tab chord
 * destroyed the window and every unsaved document in it.
 *
 * Main cannot answer "is anything unsaved" — only the renderer can — so it
 * suspends the close and asks. The renderer runs the same dirty snapshot and
 * the same save/discard/cancel dialog the tab-close path uses.
 *
 * A RENDERER THAT NEVER ANSWERS MUST NOT MAKE THE WINDOW UNCLOSABLE. If the
 * answer does not arrive, the close proceeds: a renderer too wedged to reply is
 * also too wedged to save, and an app that cannot be quit is worse than one
 * that quits.
 */
const CLOSE_ANSWER_TIMEOUT_MS = 15_000;

function installCloseGuard(win: BrowserWindow): void {
  let closing = false;   // the answer said yes; let this close through
  let pending = false;   // a question is out; don't ask twice

  win.on('close', (e) => {
    if (closing) return;
    e.preventDefault();
    if (pending) return;
    pending = true;

    const finish = (mayClose: boolean): void => {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      ipcMain.removeListener(IPC_CHANNELS.CLOSE_RESPONSE, onAnswer);
      if (mayClose && !win.isDestroyed()) { closing = true; win.close(); }
    };
    const onAnswer = (event: Electron.IpcMainEvent, mayClose: unknown): void => {
      if (event.sender !== win.webContents) return; // another window's answer
      finish(mayClose === true);
    };
    const timer = setTimeout(() => {
      console.warn('[close] renderer did not answer; closing anyway');
      finish(true);
    }, CLOSE_ANSWER_TIMEOUT_MS);

    ipcMain.on(IPC_CHANNELS.CLOSE_RESPONSE, onAnswer);
    if (win.webContents.isDestroyed()) { finish(true); return; }
    win.webContents.send(IPC_CHANNELS.CLOSE_REQUEST);
  });
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
