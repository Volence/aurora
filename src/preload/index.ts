import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, unwrapBinaryRead, unwrapWriteOutcome } from '../shared/ipc-types';
import type { RecentsState } from '../shared/recents';
import type { GuardedWriteFile, GuardedWriteResult, ReadManyEntry, DeleteOutcome, DirListing, PathProbe, AetherStatusPayload, AetherWarpResult, AetherBuildResult } from '../shared/ipc-types';
import { AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL } from '../shared/agent-protocol';
import type { AgentRequestEnvelope, AgentResponseEnvelope } from '../shared/agent-protocol';

const api = {
  readBinaryFile: (basePath: string, relativePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_BINARY_FILE, basePath, relativePath)
      .then(unwrapBinaryRead),

  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY),

  // A RecentsState, not a bare array: an empty `projects` means opposite things
  // depending on `read`, and the renderer is the surface that has to say so.
  // Route these through renderer/state/recents.ts rather than calling them raw,
  // so the refusal is worded in one place.
  getRecentProjects: (): Promise<RecentsState> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_PROJECTS),

  addRecentProject: (path: string, name: string): Promise<RecentsState> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_RECENT_PROJECT, path, name),

  removeRecentProject: (path: string): Promise<RecentsState> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMOVE_RECENT_PROJECT, path),

  saveFile: (defaultName: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, defaultName, data),

  /**
   * Write one project-relative file. RESOLVES when the bytes landed and THROWS
   * otherwise, including for the deliberate refusal of a path that escapes the
   * project -- which used to arrive as a `false` that eight of ten callers
   * dropped. See WriteOutcome in shared/ipc-types.ts for the measurement and the
   * argument; `unwrapWriteOutcome` is the conversion, and it is the twin of
   * `unwrapBinaryRead` above.
   *
   * The return type is `void` ON PURPOSE. There is no longer a boolean to test,
   * so a caller still holding a `=== false` branch fails to compile rather than
   * keeping a branch that can never fire again.
   */
  writeBinaryFile: (basePath: string, relativePath: string, data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_BINARY_FILE, basePath, relativePath, data)
      .then(unwrapWriteOutcome),

  selectFile: (title: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_FILES, title, filters),

  listProjectFiles: (basePath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_PROJECT_FILES, basePath),

  // Three answers, not two - see PathProbe. Renamed from `pathExists` with the
  // meaning, so a caller that still wants a yes/no has to look at what it is
  // throwing away.
  probePath: (basePath: string, relativePath: string): Promise<PathProbe> =>
    ipcRenderer.invoke(IPC_CHANNELS.PATH_PROBE, basePath, relativePath),

  // A DirListing, not a bare `string[]`. Renamed from `listDir` with the meaning
  // (the same move `probePath` above made when it stopped being `pathExists`):
  // an empty array used to mean "the directory is empty", "there is no such
  // directory", "I could not read it" and "I refused to look at that path"
  // alike, and both effects libraries answered every one of those with the
  // silence they reserve for the first two. See DirListing in shared/ipc-types.
  probeDir: (basePath: string, relativeDir: string): Promise<DirListing> =>
    ipcRenderer.invoke(IPC_CHANNELS.DIR_PROBE, basePath, relativeDir),

  fileMtime: (basePath: string, relativePath: string): Promise<number | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_MTIME, basePath, relativePath),

  readManyFiles: (basePath: string, relativePaths: string[]): Promise<ReadManyEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_MANY, basePath, relativePaths),

  writeGuarded: (basePath: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.WRITE_GUARDED, basePath, files),

  /** Remove ONE project-relative file. See main/file-io.ts deleteProjectFile. */
  deleteFile: (basePath: string, relativePath: string): Promise<DeleteOutcome> =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_FILE, basePath, relativePath),

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

  // --- the outbound Aether link (playtest loop) --------------------------
  // Connect is explicit and user-driven; nothing here fires on launch.
  aetherConnect: (): Promise<AetherStatusPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.AETHER_CONNECT),
  aetherDisconnect: (): Promise<AetherStatusPayload> =>
    ipcRenderer.invoke(IPC_CHANNELS.AETHER_DISCONNECT),
  aetherPushPalette: (
    line: number, words: number[], kind?: 'aeon' | 'classic',
  ): Promise<{ pushed: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AETHER_PUSH_PALETTE, line, words, kind),
  // `projectType` + `projectDir` route play-from-cursor: the classic path pokes
  // v_player and needs the disassembly on disk to derive obX/obY from, because
  // those are equates and no symbol lookup can answer them.
  aetherWarp: (
    x: number, y: number, projectType?: 'aeon' | 'classic', projectDir?: string,
  ): Promise<AetherWarpResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AETHER_WARP, x, y, projectType, projectDir),
  aetherBuild: (
    basePath: string, raw?: Record<string, unknown>, projectType?: 'aeon' | 'classic',
  ): Promise<AetherBuildResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AETHER_BUILD, basePath, raw, projectType),
  onAetherBuildOutput: (callback: (chunk: string) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.AETHER_BUILD_OUTPUT, (_e, chunk: string) => callback(chunk));
  },
  onAetherStatus: (callback: (s: AetherStatusPayload) => void): void => {
    ipcRenderer.on(IPC_CHANNELS.AETHER_STATUS, (_e, s: AetherStatusPayload) => callback(s));
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
