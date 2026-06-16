import type { ElectronAPI, AgentBridge } from '../preload/index';

declare global {
  interface Window {
    api: ElectronAPI;
    agentBridge: AgentBridge;
  }
}
