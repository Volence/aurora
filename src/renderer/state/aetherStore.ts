import { create } from 'zustand';
import type { AetherStatusPayload } from '../../shared/ipc-types';
import { useBusStore } from './busStore';

/**
 * The renderer's view of the outbound Aether link, and the throttle in front of
 * the live palette push.
 *
 * WHY A THROTTLE. `emulator/write_memory` is `require_paused`, so every push is
 * pause → write → write → resume. A slider drag emitting one push per mouse
 * move would pause and resume the machine dozens of times a second, and each
 * transition emits `stopped`/`resumed` to EVERY subscriber on the bus — tens of
 * events a second that every other client has to ignore. So drags coalesce:
 * at most one push in flight, at most one queued behind it, and the queued one
 * always carries the LATEST colour rather than a backlog of stale ones.
 *
 * The rate is deliberately modest rather than tuned. If it ever looks laggy the
 * fix is a measurement, not a smaller number — oracle-next registered a
 * batch-write with exactly that revival condition.
 */

const MIN_PUSH_INTERVAL_MS = 100;      // ~10Hz

interface AetherState {
  status: AetherStatusPayload['status'];
  serverName?: string;
  serverVersion?: string;
  error?: string;
  /** Both Pal_Base symbols resolved — live palette can actually push. */
  palette: boolean;
  /** True while a push is in flight, for the badge's activity dot. */
  pushing: boolean;
  /** Last push failure, shown once rather than logged into the void. */
  pushError?: string;

  apply: (s: AetherStatusPayload) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Coalescing live push. Safe to call on every slider tick. */
  pushPaletteLine: (line: number, words: number[]) => void;
}

/** Coalescing state, deliberately outside the store: it is not UI. */
let inFlight = false;
let queued: { line: number; words: number[] } | null = null;
let lastPushAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useAetherStore = create<AetherState>((set, get) => ({
  status: 'disconnected',
  palette: false,
  pushing: false,

  apply: (s) => {
    set({
      status: s.status,
      serverName: s.serverName,
      serverVersion: s.serverVersion,
      error: s.error,
      palette: s.palette ?? false,
    });
    // Drive the status-bar badge, which predates this client and was written
    // waiting for it ("when the client connects it calls setBusStatus").
    useBusStore.getState().setBusStatus(
      s.status === 'connected' ? 'connected' : s.status === 'connecting' ? 'connecting' : 'offline',
      s.status === 'connected' ? (s.serverName ?? 'oracle') : null,
    );
  },

  connect: async () => {
    set({ status: 'connecting', error: undefined });
    const s = await window.api.aetherConnect();
    get().apply(s);
  },

  disconnect: async () => {
    const s = await window.api.aetherDisconnect();
    get().apply(s);
  },

  pushPaletteLine: (line, words) => {
    const st = get();
    // Line 0 is the character palette and Pal_Base does not include it; the
    // main side refuses it too, but not bothering the wire is cheaper and keeps
    // the badge from flickering on every line-0 tick.
    if (st.status !== 'connected' || !st.palette || line === 0) return;

    queued = { line, words: [...words] };
    if (inFlight || timer) return;

    const fire = async () => {
      timer = null;
      const next = queued;
      queued = null;
      if (!next) return;
      inFlight = true;
      lastPushAt = Date.now();
      set({ pushing: true });
      try {
        const r = await window.api.aetherPushPalette(next.line, next.words);
        set({ pushError: r.pushed ? undefined : r.error });
      } catch (e) {
        set({ pushError: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = false;
        set({ pushing: false });
        // Whatever arrived during the flight goes out on the next tick, so the
        // last colour the artist chose always lands even if they stop moving.
        if (queued && !timer) timer = setTimeout(fire, MIN_PUSH_INTERVAL_MS);
      }
    };

    const wait = Math.max(0, MIN_PUSH_INTERVAL_MS - (Date.now() - lastPushAt));
    timer = setTimeout(fire, wait);
  },
}));

/** Subscribe to main's status pushes. Call once, at app start. */
export function installAetherStatusListener(): void {
  window.api.onAetherStatus((s) => useAetherStore.getState().apply(s));
}
