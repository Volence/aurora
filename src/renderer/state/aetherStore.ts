import { create } from 'zustand';
import type { AetherStatusPayload } from '../../shared/ipc-types';
import { useBusStore } from './busStore';
// A leaf store (no imports of its own beyond zustand), so no cycle. It is here
// for one reason: a connect that fails had NO visible outcome at all — see
// CONNECT_FAILED_PREFIX below.
import { useToastStore } from './toastStore';

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
   * WHICH IMPLEMENTATION ANSWERED — protocol.md §2.1's registry value
   * (`oracle-rs` | `oracle-cpp`). ⚠ NOT `serverName` above, which §2.1 makes a
   * deployment label and forbids discriminating on; the Rust core still reports
   * `oracle-next` there. Undefined until a handshake has completed.
   */
  implementation?: string;
  /** Rendered §2.1 build identity. Provenance for a bug report; never compared. */
  serverBuild?: string;
  /** The identity check's non-fatal complaint, if it had one. */
  identityWarning?: string;
  /**
   * THE RESOLVED UNIX PATH THIS LINK DIALLED — the only field that separates
   * one running emulator from another.
   *
   * `implementation` above names a lineage, so two Aurora windows attached to
   * two different `oracle-rs` processes read identically on it; the socket
   * chain is what actually decides which machine answered
   * (`docs/OVERSEER.md`), and until this reached the renderer nothing on screen
   * could tell those two windows apart. Undefined when nothing is dialled.
   */
  socketPath?: string;
  /**
   * HOW MANY METHODS THE CONNECTED SERVER SERVES, straight from `initialize`.
   * A different question from `implementation`: an installed binary can
   * advertise a different count from the source tree it was built from.
   * Undefined until a handshake has completed.
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
/**
 * Prefix of the toast a REFUSED connect raises (seat B's F4 — see `connect`).
 *
 * Exported so the test asserts the string the store actually emits rather than
 * a copy of it: a row that hardcodes the prose passes forever after the prose
 * is edited to something wrong.
 */
export const CONNECT_FAILED_PREFIX = 'Aether: could not connect. ';

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
      implementation: s.implementation,
      serverBuild: s.serverBuild,
      identityWarning: s.identityWarning,
      socketPath: s.socketPath,
      methodCount: s.methodCount,
      servedMethods: s.servedMethods,
      paletteUnservedMethod: s.paletteUnservedMethod,
    });
    // Drive the status-bar badge, which predates this client and was written
    // waiting for it ("when the client connects it calls setBusStatus").
    //
    // STATUS ONLY. This call used to pass a second argument — `s.serverName ??
    // 'oracle'` — which the badge rendered as the name of the machine it was
    // attached to. Both halves of that were wrong: `serverName` is a deployment
    // label its own producer says is not an identity, and the `'oracle'`
    // fallback was a plausible-looking name manufactured out of nothing. The
    // badge now reads `implementation`, `serverBuild` and `socketPath` off this
    // store directly (see `busStore.ts` for the whole argument).
    useBusStore.getState().setBusStatus(
      s.status === 'connected' ? 'connected' : s.status === 'connecting' ? 'connecting' : 'offline',
    );
  },

  connect: async () => {
    set({ status: 'connecting', error: undefined });
    const s = await window.api.aetherConnect();
    get().apply(s);
    // ACTING ON A CONTROL MUST PRODUCE A VISIBLE RESPONSE — UX seat B, F4.
    //
    // The seat pressed `Aether ◇ offline` in the status bar and waited 5.5s;
    // the before and after screenshots were THE SAME SCREEN, down to the
    // badge's computed colour. It pressed a second time, because the first
    // press had produced nothing a person could see. Still nothing. It learned
    // the connection had been refused only by reading the button's `title`
    // attribute out of the DOM — a channel that requires you to already suspect
    // the failure and hover on the thing you just pressed.
    //
    // The mechanism: a refused connect walks 'disconnected' → 'connecting' →
    // 'disconnected', and the badge renders `status` verbatim, so the label it
    // ends on is character-for-character the one it started from. `error` lands
    // in this store and reaches only the tooltip. SUCCESS never had this
    // problem — the label becomes `connected · …` — which is why the gap
    // survived: the visible half worked on the path people test.
    //
    // ⚠ THE TEXT IS THE PRODUCER'S, RELAYED VERBATIM, not rewritten here. One
    // of the two refusals seat B provoked is excellent (it names the 104-byte
    // unix-socket limit, the remedy, and the offending path) and the other was a
    // raw Node errno (`connect ENOENT /tmp/uxb-dead.sock`) that said nothing
    // about what Aether is or that an emulator must be running. That second
    // one is now worded where it is produced, in the main process
    // (`describeSocketError` in src/main/aether/client.ts, which keeps ENOENT
    // and ECONNREFUSED apart and still names the path). Showing either one at
    // all is this file's half, and it is the half that outranked the wording:
    // neither message was SHOWN.
    if (get().status !== 'connected') {
      const why = get().error;
      useToastStore.getState().addToast(
        // An absent reason is SAID to be absent rather than papered over with a
        // plausible guess: this file's own badge doctrine (AetherStatus.tsx),
        // and reporting blindness as a clean result is this repo's dominant
        // defect class.
        `${CONNECT_FAILED_PREFIX}${why ?? 'the main process reported no reason'}`,
        'error',
      );
    }
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
      // NAME THE ROM THAT WAS RELOADED.
      //
      // The 2026-09-09 defect was a chain of individually honest links: the
      // build succeeded, the reload happened, this toast said both, and the
      // composite told the owner his edit had vanished, because the file that
      // was reloaded came from an unrelated experiment directory. A gate in
      // build-run.ts now refuses that pairing; naming the path is the separable
      // half, and it is what makes the whole class readable in one glance
      // rather than a process sweep.
      //
      // THE PATH, NOT THE BASENAME. Both ROMs in that incident were called
      // `s4.debug.bin`, so a basename would have read identically on the good
      // day and the bad one.
      //
      // The old wording survives as the fallback: a reload reported without a
      // path is a bug in the main process, and "reloaded ." would be a worse
      // way to show it than the sentence that has always been there.
      const reloadedWhat = r.romPath ? `reloaded ${r.romPath}` : 'emulator reloaded';
      const summary = r.ok
        ? (r.reloaded
            ? `Build succeeded (${flavour}): ${reloadedWhat}${r.restoredTo ? `, back at (${r.restoredTo.x}, ${r.restoredTo.y})` : ''}${timing}`
            : r.reloadError
              ? `Build succeeded (${flavour}), but the emulator did not reload: ${r.reloadError}`
              : `Build succeeded (${flavour}): no emulator connected`)
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
    // ONE ROUTING SITE, as `build-and-run.ts` is for builds. The classic path
    // pokes `v_player` and needs the DISASSEMBLY on disk to derive obX/obY
    // from — those are equates, so no symbol lookup can answer them. Read here
    // rather than at each caller so the three F7 entry points (the classic
    // viewport, the agent surface, the debug hook) cannot drift apart on it.
    // Dynamic, to keep the classic project graph out of this module's imports.
    let projectDir: string | undefined;
    if (kind === 'classic') {
      const { useClassicProjectStore } = await import('./classicProjectStore');
      projectDir = useClassicProjectStore.getState().dir ?? undefined;
    }
    const r = await window.api.aetherWarp(x, y, kind, projectDir);
    if (!r.warped) {
      // A ROM without the symbols this path needs cannot be warped, and the
      // fix differs by family: on aeon it is a DEBUG build (that is where the
      // mailbox lives); on classic there is no flavour to build, so the
      // sentence must point at the LISTING instead of sending anyone hunting
      // for a debug ROM that would come back identical.
      if (r.gate === 'no-symbols') {
        return kind === 'classic'
          ? 'Play-from-cursor needs the disassembly\'s symbols: v_player did not resolve against the running ROM. Build s1disasm and reconnect.'
          : 'Warp needs a DEBUG build: this ROM has no warp mailbox';
      }
      // The disassembly, not the ROM and not the server. Its own sentence for
      // its own reason: a rebuild fixes neither of the other two conditions
      // and would not fix this one either.
      if (r.gate === 'no-offsets') {
        return `Play-from-cursor could not read obX/obY from the disassembly: ${r.error ?? 'unknown'}`;
      }
      // A DISCARDED poke is not an error the user should take to the emulator.
      // It has its own sentence in `s1-warp.ts` naming the level-init window,
      // and `from` says where he still is — so pass both through rather than
      // wrapping them in "Warp failed", which points at the wrong thing.
      if (r.from && r.landed) {
        return `Play-from-cursor: ${r.error ?? 'the poke did not take'}`;
      }
      return `Warp failed: ${r.error ?? 'unknown'}`;
    }
    // WHERE HE ACTUALLY IS, never the ask — aeon publishes its clamped
    // destination, classic is asked after the game has had its turn. The
    // wording of the moved case differs because the mechanisms differ: aeon
    // clamps to the act bounds, S1 resolves collision against whatever
    // position it was handed and may put him somewhere else entirely.
    const at = r.landed ? ` to (${r.landed.x}, ${r.landed.y})` : '';
    if (!r.clamped) return `Warped${at}`;
    return kind === 'classic'
      ? `Warped${at}: the game moved him from (${x}, ${y})`
      : `Warped${at}: clamped to the act bounds`;
  },
}));

/** Subscribe to main's status pushes. Call once, at app start. */
export function installAetherStatusListener(): void {
  window.api.onAetherStatus((s) => useAetherStore.getState().apply(s));
  window.api.onAetherBuildOutput((chunk) => useAetherStore.getState().appendBuildOutput(chunk));
}
