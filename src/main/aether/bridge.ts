/**
 * Main-process owner of the outbound Aether link.
 *
 * The client holds a unix socket, so it lives here and the renderer drives it
 * over IPC. Status travels main→renderer as a push rather than a poll, because
 * the link changes state on its own — the emulator can exit — and a renderer
 * that had to ask would show a stale badge until the next question.
 *
 * Connecting is ALWAYS explicit. Nothing here auto-connects on launch: the
 * editor must work identically with no emulator in sight, and a tool that
 * quietly opens sockets on startup is a tool people stop trusting.
 */

import net from 'node:net';
import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS, type AetherStatusPayload, type AetherWarpResult, type AetherBuildResult } from '../../shared/ipc-types';
import { AetherClient } from './client';
import { resolveSocketPath } from './socket-path';
import { unservedMethodOf } from './unserved';
import { describeBuild } from './server-identity';
import { pushPaletteWords } from './push-palette';
import { warpTo, WarpGateReason } from './warp';
import { s1WarpTo } from './s1-warp';
import { runBuild } from './build-run';
import {
  PAL_BASE_SYMBOL, PAL_BASE_DIRTY_SYMBOL, classicPaletteSymbol, CLASSIC_LINES,
  type PalettePushKind,
} from '../../core/aether/palette-push';
import type { BuildProjectType } from '../../core/aether/build-plan';

let client: AetherClient | null = null;
let win: BrowserWindow | null = null;
let lastError: string | undefined;
let paletteKind: PalettePushKind | null = null;
/**
 * Set when the palette probe could not run because the SERVER lacks the method,
 * as opposed to the ROM lacking the symbols. Both grey the control out; only one
 * of them is the artist's problem.
 */
let paletteUnservedMethod: string | undefined;

function publish(): void {
  win?.webContents.send(IPC_CHANNELS.AETHER_STATUS, statusPayload());
}

export interface PaletteProbe {
  kind: PalettePushKind | null;
  /**
   * Set when the probe could not RUN — the server does not serve the lookup —
   * as opposed to running and finding nothing. Both leave `kind` null and both
   * grey the control out; only one of them is the artist's ROM to fix.
   */
  unservedMethod?: string;
}

/**
 * Probe the symbols live palette needs, once per connection, so the UI can
 * grey the control out instead of discovering the gap mid-drag — and report
 * WHICH family's symbols the running ROM carries, so a classic project's UI
 * does not light up green against an aeon ROM (or vice versa). The loaded
 * listing decides: aeon's `Pal_Base`/`Pal_Base_Dirty` pair, or classic's four
 * `v_palette_line_N`. A stripped ROM, or one whose engine renamed them,
 * resolves neither and the feature stays grey.
 */
export async function probePalette(c: AetherClient): Promise<PaletteProbe> {
  // NOT AN AETHER GAP — a genuine either/or. Failing to resolve `Pal_Base` is
  // how this probe LEARNS the listing is not aeon's, and turning that into an
  // error would break the only detection there is. It stays a fall-through.
  //
  // What must NOT fall through is `lookup_symbol` being unserved: then neither
  // arm can resolve anything, both fail, and the honest answer "no palette
  // symbols in this ROM" is a fabrication — the ROM was never asked. Recorded
  // and reported instead, and the classic arm is not even attempted, because
  // running a probe whose instrument is missing only produces a second wrong
  // negative.
  try {
    await c.resolve(PAL_BASE_SYMBOL);
    await c.resolve(PAL_BASE_DIRTY_SYMBOL);
    return { kind: 'aeon' };
  } catch (e) {
    const u = unservedMethodOf(e);
    if (u !== null) return { kind: null, unservedMethod: u };
    /* else: not an aeon listing — try classic */
  }
  try {
    for (let line = 0; line < CLASSIC_LINES; line++) {
      await c.resolve(classicPaletteSymbol(line));
    }
    return { kind: 'classic' };
  } catch (e) {
    return { kind: null, unservedMethod: unservedMethodOf(e) ?? undefined };
  }
}

/**
 * `ipcMain.handle` throws on a duplicate channel, and `createWindow` runs again
 * on macOS activate (and after a close on any platform). So the handlers are
 * registered once and only the target window is re-pointed.
 */
let handlersRegistered = false;

export function registerAetherBridge(browserWindow: BrowserWindow): void {
  win = browserWindow;
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle(IPC_CHANNELS.AETHER_CONNECT, async (): Promise<AetherStatusPayload> => {
    lastError = undefined;
    const resolved = resolveSocketPath(process.env);
    if (resolved.tooLong) {
      // Say the thing the server cannot: it dies with a bare "shorter than
      // SUN_LEN" naming neither the path nor the limit.
      lastError = resolved.warning ?? 'socket path too long';
      publish();
      return { status: 'disconnected', error: lastError, socketPath: resolved.path };
    }

    if (client && client.status !== 'disconnected') { publish(); return statusPayload(resolved.path); }

    const c = new AetherClient({
      connect: () => net.connect(resolved.path),
      socketPath: resolved.path,
    });
    client = c;
    c.onEvent(() => publish());       // stopped/resumed/romReloaded all move the badge
    // The link can die with nobody asking — the emulator window closes, the
    // process is killed. Without this the UI keeps showing the last state it
    // was told about, which is "connected" forever.
    c.onStatusChange((status) => {
      if (status === 'disconnected') {
        paletteKind = null;
        paletteUnservedMethod = undefined;
        if (client === c) client = null;
      }
      publish();
    });
    publish();

    try {
      await c.connect();
      const probe = await probePalette(c);
      paletteKind = probe.kind;
      paletteUnservedMethod = probe.unservedMethod;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      paletteKind = null;
      paletteUnservedMethod = undefined;
      client = null;
    }
    publish();
    return statusPayload(resolved.path);
  });

  ipcMain.handle(IPC_CHANNELS.AETHER_DISCONNECT, async (): Promise<AetherStatusPayload> => {
    client?.disconnect();
    client = null;
    paletteKind = null;
    paletteUnservedMethod = undefined;
    lastError = undefined;
    publish();
    return statusPayload();
  });

  ipcMain.handle(
    IPC_CHANNELS.AETHER_BUILD,
    async (
      _e, basePath: string, raw: Record<string, unknown> | undefined,
      projectType?: BuildProjectType,
    ): Promise<AetherBuildResult> => {
      // The build runs whether or not an emulator is connected — an artist
      // without one still wants to know their level assembles.
      const r = await runBuild({
        basePath, raw, projectType, client,
        onOutput: (chunk) => win?.webContents.send(IPC_CHANNELS.AETHER_BUILD_OUTPUT, chunk),
      });
      return {
        ok: r.ok, exitCode: r.exitCode, output: r.output, reloaded: r.reloaded,
        reloadError: r.reloadError, missingEnv: r.missingEnv,
        command: [r.plan.command, ...r.plan.args].join(' '),
        debugBuild: r.debugBuild,
        restoredTo: r.restoredTo,
        restoredVia: r.restoredVia,
        fast: r.fast,
        timings: r.timings,
        unservedMethods: r.unservedMethods,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AETHER_WARP,
    async (
      _e, x: number, y: number,
      projectType?: BuildProjectType, projectDir?: string,
    ): Promise<AetherWarpResult> => {
      if (!client) return { warped: false, error: 'not connected' };
      return warpForProject(client, x, y, projectType, projectDir);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AETHER_PUSH_PALETTE,
    async (
      _e, line: number, words: number[], kind?: PalettePushKind,
    ): Promise<{ pushed: boolean; error?: string; unservedMethod?: string }> => {
      if (!client) return { pushed: false, error: 'not connected' };
      // The renderer hands CRAM words; they go to the wire as-is rather than
      // round-tripping through 8-bit colour and back. `kind` is the OPEN
      // PROJECT's family; a mismatched ROM gates on symbol resolution inside.
      const r = await pushPaletteWords(client, line, words, kind);
      return { pushed: r.pushed, error: r.error, unservedMethod: r.unservedMethod };
    },
  );
}

/**
 * THE ONE PLACE THAT DECIDES WHICH play-from-cursor RUNS.
 *
 * Two mechanisms answer F7 now, and they are not interchangeable:
 *
 *   aeon    — write the DEBUG mailbox, wait for the engine to ack, and read the
 *             CLAMPED destination the engine publishes back (`warp.ts`).
 *   classic — poke `v_player`, let the game run, and ask where he actually
 *             ended up (`s1-warp.ts`). S1 has no mailbox in any flavour.
 *
 * THE OPEN PROJECT DECIDES, NOT THE ROM — the rule `probePalette` and
 * `state/build-and-run.ts` already follow. Routing on what the ROM happens to
 * carry would mean an aeon DEBUG ROM connected while a disassembly is open
 * silently gets the mailbox treatment for coordinates out of a different game.
 *
 * Both mechanisms gate POLITELY against the other family's ROM, which is
 * exactly why the routing is worth a test of its own: a mistake here does not
 * crash, it produces "this ROM has no warp mailbox" about a disassembly that
 * was never going to have one — a documented, wrong explanation of a machine
 * that is working fine.
 */
export async function warpForProject(
  c: AetherClient,
  x: number,
  y: number,
  projectType: BuildProjectType | undefined,
  projectDir: string | undefined,
): Promise<AetherWarpResult> {
  if (projectType === 'classic') {
    if (!projectDir) {
      // `obX`/`obY` are equates and live in the disassembly, so with no project
      // directory there is nothing to derive them from. Reported as the OFFSETS
      // gate rather than as "no symbols": the ROM and the server are both fine,
      // and a rebuilt ROM would come back exactly as unable to help.
      return {
        warped: false,
        gate: WarpGateReason.NoOffsets,
        error:
          'play-from-cursor on a classic project needs the disassembly directory, ' +
          'and none was supplied',
      };
    }
    const r = await s1WarpTo(c, x, y, { projectDir });
    // `from` travels ON PURPOSE. It is half of the read-back comparison, and
    // "the poke did not take" without "he is still at (80, 1084)" is half an
    // answer — the half that cannot be acted on.
    return {
      warped: r.warped, gate: r.gate, error: r.error, landed: r.landed, from: r.from,
      clamped: r.clamped, unservedMethod: r.unservedMethod,
    };
  }
  const r = await warpTo(c, x, y);
  return {
    warped: r.warped, gate: r.gate, error: r.error, landed: r.landed, clamped: r.clamped,
    unservedMethod: r.unservedMethod,
  };
}

function statusPayload(socketPath?: string): AetherStatusPayload {
  return {
    status: client?.status ?? 'disconnected',
    serverName: client?.server.name,
    serverVersion: client?.server.version,
    socketPath,
    error: lastError,
    palette: paletteKind !== null,
    paletteKind: paletteKind ?? undefined,
    // WHICH SERVER ANSWERED. Two implementations resolve the same socket and
    // serve different subsets, so "connected" alone does not say what Aurora is
    // talking to — and `serverName` above cannot say either (protocol.md §2.1
    // makes it a deployment label). `implementation` is the discriminator; the
    // build is provenance, rendered and never compared.
    implementation: client?.handshake?.identity.implementation ?? undefined,
    serverBuild: client?.handshake?.identity.serverBuild
      ? describeBuild(client.handshake.identity.serverBuild) : undefined,
    identityWarning: client?.handshake?.identity.warning ?? undefined,
    methodCount: client?.handshake?.methodCount,
    servedMethods: client?.handshake?.methods,
    paletteUnservedMethod,
  };
}

/** Test/teardown seam — drops the link without going through IPC. */
export function resetAetherBridge(): void {
  client?.disconnect();
  client = null;
  win = null;
  lastError = undefined;
  paletteKind = null;
  paletteUnservedMethod = undefined;
}
