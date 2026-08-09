import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'fs';
import { IPC_CHANNELS } from '../shared/ipc-types';
import type { GuardedWriteFile } from '../shared/ipc-types';
import { readBinaryFile, readManyFiles, listProjectFiles, pathExists, listDir, fileMtime } from './file-io';
import { performGuardedWrite } from './guarded-write';
import { getRecentProjects, addRecentProject, removeRecentProject } from './recent-projects';

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

  ipcMain.handle(IPC_CHANNELS.PATH_EXISTS, async (_event, basePath: string, relativePath: string) => {
    return pathExists(basePath, relativePath);
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

  ipcMain.handle(IPC_CHANNELS.GET_RECENT_PROJECTS, async () => {
    return getRecentProjects();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_RECENT_PROJECT, async (_event, path: string, name: string) => {
    return addRecentProject(path, name);
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_RECENT_PROJECT, async (_event, path: string) => {
    return removeRecentProject(path);
  });

  ipcMain.handle(IPC_CHANNELS.WRITE_BINARY_FILE, async (_event, basePath: string, relativePath: string, data: ArrayBuffer) => {
    const { resolve, dirname } = await import('path');
    const { writeFileSync, renameSync, mkdirSync } = await import('fs');
    const fullPath = resolve(basePath, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    // Write to a sibling .tmp file first, then atomically rename into place.
    // On POSIX a same-directory rename is atomic, so a crash mid-write cannot
    // corrupt the target (critical for project.json, which bricks the project
    // if partially written).
    const tmpPath = fullPath + '.tmp';
    writeFileSync(tmpPath, Buffer.from(data));
    renameSync(tmpPath, fullPath);
    return true;
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
