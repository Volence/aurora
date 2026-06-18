import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-types';
import type { RecentProject } from '../shared/ipc-types';
import { AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL } from '../shared/agent-protocol';
import type { AgentRequestEnvelope, AgentResponseEnvelope } from '../shared/agent-protocol';

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

  listProjectFiles: (basePath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_PROJECT_FILES, basePath),
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
