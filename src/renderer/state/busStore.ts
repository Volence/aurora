import { create } from 'zustand';

/**
 * Aether bus connection status, surfaced in the status bar as
 * `Aether ◇ <status>` (Empyrean chrome convention). Aurora is not yet a bus
 * *client* — the Aether adapter + Oracle client land in a later workstream;
 * until then this reports `offline`. When the client connects it calls
 * `setBusStatus('connected')` and the indicator turns emerald.
 */
export type BusStatus = 'offline' | 'connecting' | 'connected';

interface BusState {
  status: BusStatus;
  peer: string | null; // e.g. 'Oracle' once connected
  setBusStatus: (status: BusStatus, peer?: string | null) => void;
}

export const useBusStore = create<BusState>((set) => ({
  status: 'offline',
  peer: null,
  setBusStatus: (status, peer = null) => set({ status, peer }),
}));
