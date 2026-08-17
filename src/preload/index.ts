import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, unwrapBinaryRead } from '../shared/ipc-types';
import type { RecentProject, GuardedWriteFile, GuardedWriteResult, ReadManyEntry } from '../shared/ipc-types';
import { AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL } from '../shared/agent-protocol';
import type { AgentRequestEnvelope, AgentResponseEnvelope } from '../shared/agent-protocol';

const api = {
  readBinaryFile: (basePath: string, relativePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_BINARY_FILE, basePath, relativePath)
      .then(unwrapBinaryRead),

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

  listProjectFiles: (basePath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_PROJECT_FILES, basePath),

  pathExists: (basePath: string, relativePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.PATH_EXISTS, basePath, relativePath),

  listDir: (basePath: string, relativeDir: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_DIR, basePath, relativeDir),

  fileMtime: (basePath: string, relativePath: string): Promise<number | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_MTIME, basePath, relativePath),

  readManyFiles: (basePath: string, relativePaths: string[]): Promise<ReadManyEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_MANY, basePath, relativePaths),

  writeGuarded: (basePath: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_GUARDED, basePath, files),

  // Env-guarded paint instrumentation (AURORA_PERF=1). The flag is read from the
  // process env here (the renderer process inherits main's env), exposed as a
  // static boolean so the classic viewport can no-op with zero overhead when off.
  // `perfLog` posts one summary line per act load to the main-process terminal.
  perfEnabled: process.env.AURORA_PERF === '1',
  perfLog: (line: string): void => { ipcRenderer.send(IPC_CHANNELS.PERF_LOG, line); },

  /**
   * Answer main's "may I close?" — the window-close guard.
   *
   * The renderer is the only side that knows whether anything is unsaved, so
   * main asks and waits. `respond(false)` keeps the window open; `true` lets it
   * go. Registered once at startup (shell/close-guard.ts).
   */
  onCloseRequest: (callback: (respond: (mayClose: boolean) => void) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.CLOSE_REQUEST, () => {
      callback((mayClose: boolean) => {
        ipcRenderer.send(IPC_CHANNELS.CLOSE_RESPONSE, mayClose);
      });
    });
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronAPI = typeof api;

const agentBridge = {
  onRequest: (callback: (envelope: AgentRequestEnvelope) => void): void => {
    ipcRenderer.on(AGENT_REQUEST_CHANNEL, (_event, envelope: AgentRequestEnvelope) => callback(envelope));
  },
  respond: (envelope: AgentResponseEnvelope): void => {
    ipcRenderer.send(AGENT_RESPONSE_CHANNEL, envelope);
  },
};

contextBridge.exposeInMainWorld('agentBridge', agentBridge);

export type AgentBridge = typeof agentBridge;
