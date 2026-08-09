/// <reference types="vite/client" />
import type { ElectronAPI, AgentBridge } from '../preload/index';

interface ImportMetaEnv {
  /** '1' when launched for the headless debug/perf harnesses (installs window.__dbg). */
  readonly VITE_AURORA_DEBUG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    api: ElectronAPI;
    agentBridge: AgentBridge;
  }
}
