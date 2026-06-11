import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFileSync } from 'fs';
import { IPC_CHANNELS } from '../shared/ipc-types';
import { readBinaryFile } from './file-io';
import { getRecentProjects, addRecentProject, removeRecentProject } from './recent-projects';

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.READ_BINARY_FILE, async (_event, basePath: string, relativePath: string) => {
    const buffer = await readBinaryFile(basePath, relativePath);
    return buffer;
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
