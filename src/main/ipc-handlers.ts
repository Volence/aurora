import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'fs';
import { IPC_CHANNELS } from '../shared/ipc-types';
import type { GuardedWriteFile } from '../shared/ipc-types';
import { readBinaryFile, readManyFiles, listProjectFiles, probePath, listDir, fileMtime, deleteProjectFile, writeProjectFile } from './file-io';
import { performGuardedWrite } from './guarded-write';
import { readRecents, addRecentProject, removeRecentProject } from './recent-projects';

export function registerIpcHandlers(): void {
  // Env-guarded paint instrumentation sink (AURORA_PERF=1). The renderer only
  // sends when perf is enabled; print each summary line to the launch terminal.
  // Fire-and-forget (.on, not .handle) — cheap, and a no-op when perf is off.
  ipcMain.on(IPC_CHANNELS.PERF_LOG, (_event, line: string) => {
    console.log('[aurora-perf]', line);
  });

  ipcMain.handle(IPC_CHANNELS.READ_BINARY_FILE, async (_event, basePath: string, relativePath: string) => {
    try {
      return await readBinaryFile(basePath, relativePath);
    } catch (err) {
      // Missing files RESOLVE with a marker (see MissingFileMarker): rejecting
      // makes Electron log every optional-file probe as a main-process error.
      // The preload rethrows, so renderer callers still see ENOENT.
      const e = err as NodeJS.ErrnoException;
      if (e?.code === 'ENOENT') return { __missing: e.path ?? `${basePath}/${relativePath}` };
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIST_PROJECT_FILES, async (_event, basePath: string) => {
    return listProjectFiles(basePath);
  });

  ipcMain.handle(IPC_CHANNELS.PATH_PROBE, async (_event, basePath: string, relativePath: string) => {
    return probePath(basePath, relativePath);
  });

  ipcMain.handle(IPC_CHANNELS.LIST_DIR, async (_event, basePath: string, relativeDir: string) => {
    return listDir(basePath, relativeDir);
  });

  ipcMain.handle(IPC_CHANNELS.FILE_MTIME, async (_event, basePath: string, relativePath: string) => {
    return fileMtime(basePath, relativePath);
  });

  ipcMain.handle(IPC_CHANNELS.READ_MANY, async (_event, basePath: string, relativePaths: string[]) => {
    return readManyFiles(basePath, relativePaths);
  });

  // The one deleting channel — see DELETE_FILE in shared/ipc-types.ts and
  // deleteProjectFile in file-io.ts, which own the guard and the outcome shape.
  // Nothing is decided here; this is the seam.
  ipcMain.handle(IPC_CHANNELS.DELETE_FILE, async (_event, basePath: string, relativePath: string) => {
    return deleteProjectFile(basePath, relativePath);
  });

  // Atomic, mtime-guarded classic save (Task 10). The pure cycle lives in
  // guarded-write.ts; this is the thin IPC seam.
  ipcMain.handle(IPC_CHANNELS.WRITE_GUARDED, async (_event, basePath: string, files: GuardedWriteFile[]) => {
    return performGuardedWrite(basePath, files);
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // All three recents channels answer a RecentsState, never a bare array: the
  // renderer has to be able to tell "your list is empty" from "Aurora could not
  // read your list and has left it alone" (see shared/recents.ts).
  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return readRecents();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_RECENT_PROJECT, async (_event, path: string, name: string) => {
    return addRecentProject(path, name);
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_RECENT_PROJECT, async (_event, path: string) => {
    return removeRecentProject(path);
  });

  // The one writing channel. Nothing is decided here: the guard, the atomic
  // tmp-plus-rename and the refusal shape all live in file-io.ts's
  // writeProjectFile, which is where they can be tested without Electron (the
  // same move guarded-write.ts made, and for the same reason). The refusal
  // becomes a throw in the preload, via unwrapWriteOutcome.
  ipcMain.handle(IPC_CHANNELS.WRITE_BINARY_FILE, async (_event, basePath: string, relativePath: string, data: ArrayBuffer) => {
    return writeProjectFile(basePath, relativePath, data);
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_FILES, async (event, title: string, filters: { name: string; extensions: string[] }[]) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      title,
      filters,
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (event, defaultName: string, data: ArrayBuffer) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;

    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });

    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, Buffer.from(data));
    return true;
  });
}
