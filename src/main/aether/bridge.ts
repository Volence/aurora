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
import { pushPaletteWords } from './push-palette';
import { warpTo } from './warp';
import { runBuild } from './build-run';
import { PAL_BASE_SYMBOL, PAL_BASE_DIRTY_SYMBOL } from '../../core/aether/palette-push';

let client: AetherClient | null = null;
let win: BrowserWindow | null = null;
let lastError: string | undefined;
let paletteAvailable = false;

function publish(): void {
  const payload: AetherStatusPayload = {
    status: client?.status ?? 'disconnected',
    serverName: client?.server.name,
    serverVersion: client?.server.version,
    error: lastError,
    palette: paletteAvailable,
  };
  win?.webContents.send(IPC_CHANNELS.AETHER_STATUS, payload);
}

/**
 * Probe the two symbols live palette needs, once per connection, so the UI can
 * grey the control out instead of discovering the gap mid-drag. A release ROM
 * carries them today; a stripped one would not, and neither would an engine
 * that renamed them.
 */
async function probePalette(c: AetherClient): Promise<boolean> {
  try {
    await c.resolve(PAL_BASE_SYMBOL);
    await c.resolve(PAL_BASE_DIRTY_SYMBOL);
    return true;
  } catch { return false; }
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
        paletteAvailable = false;
        if (client === c) client = null;
      }
      publish();
    });
    publish();

    try {
      await c.connect();
      paletteAvailable = await probePalette(c);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      paletteAvailable = false;
      client = null;
    }
    publish();
    return statusPayload(resolved.path);
  });

  ipcMain.handle(IPC_CHANNELS.AETHER_DISCONNECT, async (): Promise<AetherStatusPayload> => {
    client?.disconnect();
    client = null;
    paletteAvailable = false;
    lastError = undefined;
    publish();
    return statusPayload();
  });

  ipcMain.handle(
    IPC_CHANNELS.AETHER_BUILD,
    async (_e, basePath: string, raw: Record<string, unknown> | undefined): Promise<AetherBuildResult> => {
      // The build runs whether or not an emulator is connected — an artist
      // without one still wants to know their level assembles.
      const r = await runBuild({
        basePath, raw, client,
        onOutput: (chunk) => win?.webContents.send(IPC_CHANNELS.AETHER_BUILD_OUTPUT, chunk),
      });
      return {
        ok: r.ok, exitCode: r.exitCode, output: r.output, reloaded: r.reloaded,
        reloadError: r.reloadError, missingEnv: r.missingEnv,
        command: [r.plan.command, ...r.plan.args].join(' '),
        debugBuild: r.debugBuild,
        restoredTo: r.restoredTo,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AETHER_WARP,
    async (_e, x: number, y: number): Promise<AetherWarpResult> => {
      if (!client) return { warped: false, error: 'not connected' };
      const r = await warpTo(client, x, y);
      return { warped: r.warped, gate: r.gate, error: r.error, landed: r.landed, clamped: r.clamped };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AETHER_PUSH_PALETTE,
    async (_e, line: number, words: number[]): Promise<{ pushed: boolean; error?: string }> => {
      if (!client) return { pushed: false, error: 'not connected' };
      // The renderer hands CRAM words; they go to the wire as-is rather than
      // round-tripping through 8-bit colour and back.
      const r = await pushPaletteWords(client, line, words);
      return { pushed: r.pushed, error: r.error };
    },
  );
}

function statusPayload(socketPath?: string): AetherStatusPayload {
  return {
    status: client?.status ?? 'disconnected',
    serverName: client?.server.name,
    serverVersion: client?.server.version,
    socketPath,
    error: lastError,
    palette: paletteAvailable,
  };
}

/** Test/teardown seam — drops the link without going through IPC. */
export function resetAetherBridge(): void {
  client?.disconnect();
  client = null;
  win = null;
  lastError = undefined;
  paletteAvailable = false;
}
