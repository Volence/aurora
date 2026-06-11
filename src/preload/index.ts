import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-types';
import type { RecentProject } from '../shared/ipc-types';

const api = {
  readBinaryFile: (basePath: string, relativePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_BINARY_FILE, basePath, relativePath),

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),

  getRecentProjects: (): Promise<RecentProject[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_PROJECTS),

  addRecentProject: (path: string, name: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_RECENT_PROJECT, path, name),

  removeRecentProject: (path: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_RECENT_PROJECT, path),

  saveFile: (defaultName: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, defaultName, data),

  writeBinaryFile: (basePath: string, relativePath: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_BINARY_FILE, basePath, relativePath, data),

  selectFile: (title: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILES, title, filters),
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;
