import { create } from 'zustand';

/**
 * Aether bus connection status, surfaced in the status bar as
 * `Aether ◇ <status>` (Empyrean chrome convention).
 *
 * This was a placeholder reporting `offline` until Aurora became a bus CLIENT.
 * It now is: `aetherStore.apply` drives this from the real outbound link's
 * status pushes, and `peer` carries the server that answered the handshake
 * (oracle-next). The badge turns emerald when that link is up.
 *
 * Kept as its own store rather than folded into `aetherStore` because the
 * status bar is engine-neutral and must not import the client's surface — the
 * same rule that moved the indicator out of MapStatusBar in the first place.
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
