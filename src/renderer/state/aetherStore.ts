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
  /** A palette symbol family resolved — live palette can actually push. */
  palette: boolean;
  /**
   * WHICH family the running ROM's listing carries ('aeon': the Pal_Base
   * pair; 'classic': v_palette_line_1..4). Pushes gate on it matching the open
   * project, so a classic panel never writes aeon symbols or vice versa.
   */
  paletteKind?: 'aeon' | 'classic';
  /**
   * HOW MANY METHODS THE CONNECTED SERVER SERVES, straight from `initialize`.
   * Two implementations answer the same socket and serve different subsets, so
   * "connected" alone does not say what is on the other end — and an installed
   * binary can advertise a different count from the source tree it was built
   * from. Undefined until a handshake has completed.
   */
  methodCount?: number;
  /** The advertised list itself, for anything that wants to check a specific one. */
  servedMethods?: string[];
  /**
   * Set when the live-palette probe was blocked by the SERVER (no lookup
   * method) rather than by the ROM. The two are indistinguishable from
   * `palette: false` alone, and only one of them is the artist's to fix.
   */
  paletteUnservedMethod?: string;
  /** True while a push is in flight, for the badge's activity dot. */
  pushing: boolean;
  /** Last push failure, shown once rather than logged into the void. */
  pushError?: string;

  apply: (s: AetherStatusPayload) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Coalescing live push. Safe to call on every slider tick. */
  pushPaletteLine: (line: number, words: number[], kind?: 'aeon' | 'classic') => void;
  /**
   * Warp the running game. Returns a human-facing sentence, or null if gated
   * on connection. `kind` only words the symbol-gate sentence: the GATE itself
   * is symbol detection either way (Warp_Req_* absent → refused), but "needs a
   * DEBUG build" is actionable on aeon and false on classic, where no build
   * flavour carries a mailbox at all.
   */
  warp: (x: number, y: number, kind?: 'aeon' | 'classic') => Promise<string | null>;

  // -- Build & Run ---------------------------------------------------------
  buildState: 'idle' | 'building' | 'ok' | 'failed';
  /** Streamed output of the build in flight, plus the summarised result after. */
  buildOutput: string[];
  /** The panel only opens itself on failure; a success is a toast. */
  buildPanelOpen: boolean;
  buildSummary: string | null;
  /** Required env vars the build is missing — the usual cause of an instant exit 1. */
  buildMissingEnv: string[];
  setBuildPanelOpen: (open: boolean) => void;
  appendBuildOutput: (chunk: string) => void;
  build: (
    basePath: string, raw?: Record<string, unknown>, saveMs?: number,
    projectType?: 'aeon' | 'classic',
  ) => Promise<void>;
}

/** Coalescing state, deliberately outside the store: it is not UI. */
let inFlight = false;
/**
 * PER LINE. A single queued slot silently dropped every line but the last,
 * which broke the case where one change touches several lines at once — an
 * undo restoring a whole palette, or the initial push on connect.
 *
 * The kind rides with the words: only one project is open at a time, but a
 * queued push must land against the family it was made for even if the open
 * project changes mid-throttle.
 */
let queued = new Map<number, { words: number[]; kind: 'aeon' | 'classic' }>();
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
      paletteKind: s.paletteKind,
      methodCount: s.methodCount,
      servedMethods: s.servedMethods,
      paletteUnservedMethod: s.paletteUnservedMethod,
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

  pushPaletteLine: (line, words, kind = 'aeon') => {
    const st = get();
    // The push must match the ROM's symbol family: a classic project's lines
    // mean nothing to an aeon listing and vice versa, so a mismatch stays off
    // the wire entirely (the main side would gate NoSymbols anyway; not
    // flickering the badge on every tick is the point of gating here too).
    if (st.status !== 'connected' || !st.palette || st.paletteKind !== kind) return;
    // Line 0 is aeon's character palette and Pal_Base does not include it.
    // Classic's line 0 is an ordinary act line and pushes like any other.
    if (kind === 'aeon' && line === 0) return;

    queued.set(line, { words: [...words], kind });
    if (inFlight || timer) return;

    const fire = async () => {
      timer = null;
      const batch = [...queued.entries()];
      queued = new Map();
      if (!batch.length) return;
      inFlight = true;
      lastPushAt = Date.now();
      set({ pushing: true });
      try {
        let err: string | undefined;
        for (const [l, q] of batch) {
          const r = await window.api.aetherPushPalette(l, q.words, q.kind);
          if (!r.pushed && !err) err = r.error;
        }
        set({ pushError: err });
      } catch (e) {
        set({ pushError: e instanceof Error ? e.message : String(e) });
      } finally {
        inFlight = false;
        set({ pushing: false });
        // Whatever arrived during the flight goes out on the next tick, so the
        // last colour the artist chose always lands even if they stop moving.
        if (queued.size && !timer) timer = setTimeout(fire, MIN_PUSH_INTERVAL_MS);
      }
    };

    const wait = Math.max(0, MIN_PUSH_INTERVAL_MS - (Date.now() - lastPushAt));
    timer = setTimeout(fire, wait);
  },

  buildState: 'idle',
  buildOutput: [],
  buildPanelOpen: false,
  buildSummary: null,
  buildMissingEnv: [],

  setBuildPanelOpen: (open) => set({ buildPanelOpen: open }),

  appendBuildOutput: (chunk) => set((s) => ({
    // Cap while streaming. A full aeon build emits thousands of lines and the
    // panel is a diagnostic, not a log file; the RESULT replaces this with the
    // summarised set (errors kept preferentially) the moment the build ends.
    buildOutput: [...s.buildOutput, ...chunk.split('\n').filter((l) => l.length > 0)].slice(-500),
  })),

  build: async (basePath, raw, saveMs, projectType) => {
    if (get().buildState === 'building') return;      // one build at a time
    // OPEN THE PANEL IMMEDIATELY. A build takes seconds to minutes, and the
    // first version showed nothing at all until it finished — which is
    // indistinguishable from a keybinding that does not work. The owner pressed
    // Ctrl+Shift+B, saw nothing, and reported it as dead; it had in fact built
    // the ROM. Success closes the panel again, so this costs nothing once the
    // build lands.
    set({
      buildState: 'building', buildOutput: [], buildSummary: null,
      buildMissingEnv: [], buildPanelOpen: true,
    });
    try {
      const r = await window.api.aetherBuild(basePath, raw, projectType);
      // Name the FLAVOUR. Release-vs-debug decides which ROM file the build
      // wrote, and getting it wrong is silent: the game reloads and looks
      // untouched. Saying which one ran turns that into something readable.
      // FAST is named in every summary, never silently. It skips the
      // verification lanes, so a FAST ROM must never be mistaken for one you
      // could hand to a player — aeon's own banner says as much and this is the
      // client half of saying it.
      //
      // CLASSIC HAS NO FLAVOURS: build.lua emits one artifact, debugBuild is
      // undefined, and calling it "release" or "fast" would claim a
      // distinction that does not exist there.
      const flavour = projectType === 'classic'
        ? 'classic'
        : `${r.debugBuild ? 'debug' : 'release'}${r.fast ? ', fast' : ''}`;
      // ATTRIBUTED, not totalled. The loop measured ~10s wall against a 1.3s
      // build, and a single number cannot tell you which of save / build /
      // reload / restore to go after.
      const t = r.timings;
      const timing = t
        ? ` · ${[
            saveMs !== undefined ? `save ${(saveMs / 1000).toFixed(1)}s` : null,
            `build ${(t.build / 1000).toFixed(1)}s`,
            t.reload ? `reload ${(t.reload / 1000).toFixed(1)}s` : null,
            t.restore ? `restore ${(t.restore / 1000).toFixed(1)}s` : null,
          ].filter(Boolean).join(' · ')}`
        : '';
      const summary = r.ok
        ? (r.reloaded
            ? `Build succeeded (${flavour}) — emulator reloaded${r.restoredTo ? `, back at (${r.restoredTo.x}, ${r.restoredTo.y})` : ''}${timing}`
            : r.reloadError
              ? `Build succeeded (${flavour}), but the emulator did not reload: ${r.reloadError}`
              : `Build succeeded (${flavour}) — no emulator connected`)
        : `Build failed${r.exitCode === null ? '' : ` (exit ${r.exitCode})`}`;
      set({
        buildState: r.ok ? 'ok' : 'failed',
        buildOutput: r.output,
        buildSummary: summary,
        buildMissingEnv: r.missingEnv,
        // Stays open on failure, closes itself on success — the artist wants
        // the game back, not a wall of assembler output.
        buildPanelOpen: !r.ok,
      });
    } catch (e) {
      set({
        buildState: 'failed',
        buildSummary: `Build could not start: ${e instanceof Error ? e.message : String(e)}`,
        buildPanelOpen: true,
      });
    }
  },

  warp: async (x, y, kind = 'aeon') => {
    if (get().status !== 'connected') return null;
    const r = await window.api.aetherWarp(x, y);
    if (!r.warped) {
      // A ROM without the mailbox simply does not carry the symbols — say
      // that rather than reporting a failure the user cannot act on. On aeon
      // the fix is actionable (build DEBUG); on classic there is no flavour to
      // build — S1 has no warp mailbox at all — so the sentence must not send
      // anyone hunting for one.
      if (r.gate === 'no-symbols') {
        return kind === 'classic'
          ? 'Play-from-cursor is not available on classic — S1 has no warp mailbox (aeon-only for now)'
          : 'Warp needs a DEBUG build — this ROM has no warp mailbox';
      }
      return `Warp failed: ${r.error ?? 'unknown'}`;
    }
    // The engine clamps and publishes where it actually put the player, so the
    // message reports the LANDING rather than the request.
    const at = r.landed ? ` to (${r.landed.x}, ${r.landed.y})` : '';
    return r.clamped ? `Warped${at} — clamped to the act bounds` : `Warped${at}`;
  },
}));

/** Subscribe to main's status pushes. Call once, at app start. */
export function installAetherStatusListener(): void {
  window.api.onAetherStatus((s) => useAetherStore.getState().apply(s));
  window.api.onAetherBuildOutput((chunk) => useAetherStore.getState().appendBuildOutput(chunk));
}
