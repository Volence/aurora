/**
 * THE DISCOVERY FILE — and why its PRESENCE means nothing.
 *
 * Aurora publishes the port it serves MCP and the Aether bus on to
 * `~/.aurora/mcp.json` (and, during the rename window, the legacy
 * `~/.sonic-level-editor/mcp.json`). A tool that wants to talk to the running
 * editor reads the file and connects to the port it names.
 *
 * ⚠ **THE FILE OUTLIVES THE PROCESS IT NAMES.** Removal used to hang off
 * Electron's `will-quit` alone, which is the GRACEFUL exit and nothing else. A
 * SIGTERM — the normal way a CDP harness ends a run, and the normal way a
 * session manager ends an app — terminates node without running `will-quit`,
 * without running `exit` handlers, and with the file still on disk naming a pid
 * that no longer exists. Measured on this machine 2026-08-31: the file named
 * `pid 1383435` and `/proc/1383435` did not exist. A previous session closed
 * that as a one-time cleanup; the cause was here, and it recurred every run.
 *
 * That is this parcel's defect class exactly: **an artifact that asserts a
 * liveness it cannot know.** `[ -S socket ]` reporting a corpse as a server is
 * the canonical instance; a discovery file naming a dead pid is the same thing
 * in a different costume. Two halves, and both are needed:
 *
 *   THE WRITER removes its file on abrupt exits too, which is what this module
 *   does. `installDiscoveryExitNet` covers the process-level paths Electron's
 *   own lifecycle does not: `exit` (normal quit, `process.exit`, an uncaught
 *   exception) plus SIGINT / SIGTERM / SIGHUP, which kill node outright unless
 *   something is listening.
 *
 *   THE READER never treats presence as liveness, because SIGKILL and a power
 *   cut are not coverable by any writer and never will be. The file records
 *   `pid` precisely so a reader can check; `scratchpad/lib/harness-guard.mjs`
 *   is where the in-repo readers do it.
 *
 * ── Re-raising, and why the handlers are not just cleanup ──────────────────
 *
 * Installing a SIGINT/SIGTERM listener in node SUPPRESSES the default
 * termination. A handler that only cleaned up would leave the app immune to
 * Ctrl-C — trading a stale file for an unkillable editor. So each signal
 * handler removes itself, cleans up, and re-raises the SAME signal, which then
 * lands on the default disposition. The exit path is left exactly as it was.
 *
 * The seams (`on`, `off`, `raise`) are injected for the same reason the socket
 * is injected in `aether/client.ts`: a test must be able to drive the signal
 * path without terminating the test runner, and a real-signal proof lives in
 * `scratchpad/discovery-exit-net-proof.mjs`, which SIGTERMs a real process.
 */

import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Aurora's discovery file moved from `~/.sonic-level-editor/` to `~/.aurora/`
 * with the rename. Both are written during the transition window so existing
 * bus/MCP clients pointing at the legacy path keep finding us; drop the legacy
 * entry once every client resolves `~/.aurora/mcp.json`.
 */
export const DISCOVERY_DIRS: readonly string[] = Object.freeze(['.aurora', '.sonic-level-editor']);

/** Every path this process would publish to, given a home directory. */
export function discoveryPathsIn(home: string): string[] {
  return DISCOVERY_DIRS.map((sub) => join(home, sub, 'mcp.json'));
}

/**
 * Write the discovery file to every path, and return the ones that took.
 *
 * A path that could not be written is REPORTED, not silently dropped: the
 * consequence is a client that cannot find this editor, and a console line is
 * the only chance anybody has of connecting the two.
 */
export function writeDiscoveryFiles(
  home: string,
  contents: string,
  log: (msg: string, err: unknown) => void = (m, e) => console.error(m, e),
): string[] {
  const written: string[] = [];
  for (const p of discoveryPathsIn(home)) {
    try {
      mkdirSync(join(p, '..'), { recursive: true });
      writeFileSync(p, contents);
      written.push(p);
    } catch (err) {
      log(`[mcp] could not write discovery file at ${p}:`, err);
    }
  }
  return written;
}

/** Remove them. Idempotent, and never throws — this runs on exit paths. */
export function removeDiscoveryFiles(paths: readonly string[]): void {
  for (const p of paths) {
    try { rmSync(p); } catch { /* already gone, or never written */ }
  }
}

/** The signals that kill node outright when nothing is listening. */
export const CLEANUP_SIGNALS: readonly NodeJS.Signals[] = Object.freeze(
  ['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[],
);

export interface ExitNetSeams {
  on?: (event: string, fn: (...a: never[]) => void) => void;
  off?: (event: string, fn: (...a: never[]) => void) => void;
  /** Re-deliver the signal after cleanup, so the default disposition still applies. */
  raise?: (sig: NodeJS.Signals) => void;
}

/**
 * Install the abrupt-exit net. Returns an uninstall function.
 *
 * ⚠ WHAT THIS CANNOT COVER, said out loud: SIGKILL, a segfault, and the power
 * going out. No writer can, which is exactly why the reader half is not
 * optional and why "the file exists" must never be read as "the app is up".
 */
export function installDiscoveryExitNet(
  cleanup: () => void,
  seams: ExitNetSeams = {},
): () => void {
  const on = seams.on ?? ((e, f) => { process.on(e as NodeJS.Signals, f as () => void); });
  const off = seams.off ?? ((e, f) => { process.off(e as NodeJS.Signals, f as () => void); });
  const raise = seams.raise ?? ((sig: NodeJS.Signals) => { process.kill(process.pid, sig); });

  let done = false;
  const once = () => { if (done) return; done = true; cleanup(); };

  const onExit = () => { once(); };
  const handlers: Array<[string, (...a: never[]) => void]> = [['exit', onExit]];
  on('exit', onExit);

  for (const sig of CLEANUP_SIGNALS) {
    const h = () => {
      // Remove FIRST so the re-raise lands on the default disposition rather
      // than on this handler again — an infinite loop is a worse bug than the
      // file this is cleaning up.
      uninstall();
      once();
      raise(sig);
    };
    handlers.push([sig, h]);
    on(sig, h);
  }

  function uninstall(): void {
    for (const [e, h] of handlers) off(e, h);
  }
  return uninstall;
}
