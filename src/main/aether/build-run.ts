/**
 * Build & Run — save, build, reload the running emulator.
 *
 * The decisions live in `core/aether/build-plan.ts` (pure, tested); this is the
 * process work: spawn, collect output, and on success hand the emulator the
 * fresh listing and ROM.
 *
 * ORDER MATTERS, AND IT IS `reload_rom` THEN `load_symbols`. Measured against a
 * live server rather than reasoned about, because the first version of this
 * file confidently had it the other way round:
 *
 *   load_symbols(new listing) with the OLD rom loaded
 *     -> REFUSED, "does not describe the loaded ROM: no deb2 symbol"
 *   reload_rom(new rom)
 *     -> succeeds, and DROPS the stale listing, with the caveat
 *        "load the listing for the new build before resolving anything"
 *   load_symbols(new listing)
 *     -> binding: match
 *
 * The server validates a listing against the image *currently loaded*, so the
 * new ROM has to be in place first. Its own caveat says as much; the earlier
 * ordering would have refused every post-build listing and left the client
 * resolving against symbols that had just been dropped.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { AetherClient } from './client';
import { buildPlanFor, summariseBuildOutput, type BuildPlan } from '../../core/aether/build-plan';

export interface BuildRunResult {
  ok: boolean;
  /** Process exit code, or null when it was killed / never started. */
  exitCode: number | null;
  /** The lines worth showing — errors kept preferentially, in order. */
  output: string[];
  /** Set when the build ran but the emulator step failed afterwards. */
  reloadError?: string;
  /** True when the emulator was reloaded; false when no link was connected. */
  reloaded: boolean;
  /** Which ROM was actually reloaded — the running one, not the configured guess. */
  romPath?: string;
  /** True when the build was run in DEBUG flavour to match the running ROM. */
  debugBuild?: boolean;
  /** Required env vars that were absent — the usual cause of an instant exit 1. */
  missingEnv: string[];
  plan: BuildPlan;
}

export interface BuildRunOptions {
  basePath: string;
  raw?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  /** Null when nothing is connected — the build still runs and simply doesn't reload. */
  client: AetherClient | null;
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function runBuild(opts: BuildRunOptions): Promise<BuildRunResult> {
  // WHICH ROM IS RUNNING DECIDES WHICH BUILD TO RUN — asked before spawning,
  // not after.
  //
  // `./build.sh` emits `s4.bin`; `DEBUG=1 ./build.sh` emits `s4.debug.bin`
  // (build.sh:37 suffixes the artifact name). The emulator is frequently on the
  // debug ROM, because that is the one carrying the warp mailbox. Building the
  // release flavour and then reloading the debug ROM reloads a file the build
  // never touched — so the game comes back byte-identical and the edit appears
  // to have done nothing, which is exactly what the owner saw.
  let runningRom: string | null = null;
  if (opts.client && opts.client.status === 'connected') {
    try {
      const status = await opts.client.call('emulator/status') as { romPath?: string };
      runningRom = status?.romPath ?? null;
    } catch { /* not fatal: fall back to the configured flavour */ }
  }
  const plan = buildPlanFor({
    basePath: opts.basePath,
    raw: opts.raw,
    env: opts.env ?? process.env,
  });

  // DEBUG IS THE DEFAULT (owner's call, 2026-08-19). Someone driving a build
  // from the editor is developing, and the debug ROM is the one carrying the
  // equipment — asserts, the warp mailbox, boot autoplay. Shipping a release
  // ROM is a deliberate act, not the thing you get by pressing a key while
  // editing a level.
  //
  // The RUNNING ROM overrides it, and only in one direction: if the emulator is
  // on `s4.bin`, building debug would leave the reload pointing at a file the
  // build never touched — the exact defect this whole path just had. Correctness
  // beats preference there, and the result says which flavour ran.
  //
  // An explicit `buildEnv.DEBUG` in project.json beats both: stated config
  // outranks anything inferred. A UI toggle is the natural next step.
  const explicitDebug = plan.envOverrides.DEBUG;
  const wantsDebug = explicitDebug !== undefined
    ? explicitDebug === '1'
    : runningRom !== null
      ? runningRom.endsWith('.debug.bin')
      : true;
  plan.envOverrides.DEBUG = wantsDebug ? '1' : '0';

  return new Promise<BuildRunResult>((resolve) => {
    let output = '';
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      env: { ...(opts.env ?? process.env), ...plan.envOverrides } as NodeJS.ProcessEnv,
      // A build is a shell script; give it a pipe so its output can be streamed
      // to a panel rather than buffered until it exits.
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
    });

    const collect = (chunk: Buffer): void => {
      const s = chunk.toString('utf8');
      output += s;
      opts.onOutput?.(s);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    // A command that does not exist never emits an exit code, only an error —
    // reporting that as a silent failure is how "nothing happened when I
    // pressed Ctrl+B" happens.
    child.on('error', (e) => {
      output += `\n${plan.command}: ${e.message}\n`;
      resolve({
        ok: false, exitCode: null, output: summariseBuildOutput(output),
        reloaded: false, missingEnv: plan.missingEnv, plan, debugBuild: wantsDebug,
      });
    });

    child.on('close', (code) => {
      void (async () => {
        const base = {
          exitCode: code, output: summariseBuildOutput(output),
          missingEnv: plan.missingEnv, plan,
          // A fact about the BUILD, so it is reported whether or not anything
          // was reloaded afterwards.
          debugBuild: wantsDebug,
        };
        if (code !== 0) {
          // A FAILED BUILD MUST NOT RELOAD. The ROM on disk is the previous
          // build's, so reloading would put the artist in a game that silently
          // does not contain the change they just made.
          resolve({ ...base, ok: false, reloaded: false });
          return;
        }
        if (!opts.client || opts.client.status !== 'connected') {
          resolve({ ...base, ok: true, reloaded: false });
          return;
        }
        try {
          // RELOAD WHAT IS ACTUALLY LOADED, not what the config guesses.
          //
          // The plan's default is `s4.bin`, but the emulator may well be
          // running `s4.debug.bin` — which is exactly the case that matters,
          // since the warp mailbox is DEBUG-only. Reloading the configured
          // default there would swap the debug ROM for the release one and
          // silently remove the symbols a feature depends on, with a cheerful
          // "Build succeeded" toast on top.
          //
          // `emulator/status` reports `romPath`, so the running machine is
          // asked rather than assumed. The listing is derived from it, which
          // keeps `s4.bin`/`s4.lst` and `s4.debug.bin`/`s4.debug.lst` paired
          // without a second config field to get out of step.
          const romPath = runningRom ?? join(plan.cwd, plan.romPath);
          const symbolsPath = romPath.endsWith('.bin')
            ? `${romPath.slice(0, -4)}.lst`
            : join(plan.cwd, plan.symbolsPath);

          await opts.client.call('emulator/reload_rom', { path: romPath });
          await opts.client.loadSymbols(symbolsPath);
          resolve({ ...base, ok: true, reloaded: true, romPath });
        } catch (e) {
          // The build succeeded; only the handoff failed. Saying so is the
          // difference between "your build is broken" and "the emulator did not
          // pick it up", which are different problems with different fixes.
          resolve({
            ...base, ok: true, reloaded: false,
            reloadError: e instanceof Error ? e.message : String(e),
          });
        }
      })();
    });
  });
}
