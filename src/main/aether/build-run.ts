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
import { existsSync } from 'node:fs';
import type { AetherClient } from './client';
import {
  buildPlanFor, summariseBuildOutput, type BuildPlan, type BuildProjectType,
} from '../../core/aether/build-plan';
import { warpTo } from './warp';
import { bootRestoreTo } from './boot-restore';
import { MethodNotServedError, isMethodNotServed, unservedMethodOf } from './unserved';

export interface BuildRunResult {
  ok: boolean;
  /** Process exit code, or null when it was killed / never started. */
  exitCode: number | null;
  /** The lines worth showing — errors kept preferentially, in order. */
  output: string[];
  /** Set when the build ran but the emulator step failed afterwards. */
  reloadError?: string;
  /**
   * Every Aether method this run needed and the connected server did not serve.
   *
   * A SEPARATE FIELD, not folded into `reloadError`, because "the server cannot
   * do this" and "the call failed" want different answers: the first is fixed by
   * building the method into the server, the second by looking at the emulator.
   * Empty/absent when the whole run only ever met the ordinary failures.
   */
  unservedMethods?: string[];
  /** True when the emulator was reloaded; false when no link was connected. */
  reloaded: boolean;
  /** Which ROM was actually reloaded — the running one, not the configured guess. */
  romPath?: string;
  /** True when the build was run in DEBUG flavour to match the running ROM. */
  debugBuild?: boolean;
  /**
   * Where the player actually LANDED — the engine-published pair, after its
   * own clamping to the act bounds. Never the pre-reload ask.
   */
  restoredTo?: { x: number; y: number };
  /**
   * Which mechanism put the player back. `boot-override` is the norm on a
   * current DEBUG ROM: the position is consumed at level init, so the FIRST
   * painted frame is the destination. `warp` is the fallback for a DEBUG ROM
   * older than the override (visible draw-then-jump, ~20-frame ack).
   */
  restoredVia?: 'boot-override' | 'warp';
  /** FAST shape — deliberately NOT a ship artifact. */
  fast?: boolean;
  /**
   * Milliseconds per phase.
   *
   * Added because the loop measured ~10s wall against a 1.3s build: the
   * interesting number was never the build, and "somewhere in the other 8.7
   * seconds" is not something you can act on.
   *
   * `restore` is whatever mechanism `restoredVia` names actually spent:
   * for the boot override that is run_to-the-init + the three writes + the
   * ack; for the warp fallback it is the old retry-until-gameplay loop. It is
   * NOT a warp-poll figure dressed up as the new mechanism, or vice versa.
   */
  timings?: { build: number; reload: number; restore: number };
  /** Required env vars that were absent — the usual cause of an instant exit 1. */
  missingEnv: string[];
  plan: BuildPlan;
}

export interface BuildRunOptions {
  basePath: string;
  raw?: Record<string, unknown>;
  /**
   * Engine family of the OPEN PROJECT (default 'aeon'). Classic differs in
   * three ways, each measured against s1disasm rather than assumed: no DEBUG
   * flavour exists (build.lua takes no switch, there is no s1built.debug.bin),
   * the listing is named after the source (`sonic.lst`) so it must never be
   * derived from the ROM stem, and there is no position restore — S1 has no
   * boot override and no warp mailbox, so v1 is an honest clean boot
   * (`restoredVia` absent), not a poke at a running machine.
   */
  projectType?: BuildProjectType;
  env?: Record<string, string | undefined>;
  /** Null when nothing is connected — the build still runs and simply doesn't reload. */
  client: AetherClient | null;
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
  /** Restore the player's position after the reload (default true). */
  restorePosition?: boolean;
}

/** Spawn one command to completion, streaming its output. */
function runOne(
  command: string,
  args: string[],
  plan: BuildPlan,
  opts: BuildRunOptions,
  onChunk: (s: string) => void,
): Promise<{ code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: plan.cwd,
      env: { ...(opts.env ?? process.env), ...plan.envOverrides } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
    });
    const collect = (c: Buffer): void => onChunk(c.toString('utf8'));
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (e) => { onChunk(`\n${command}: ${e.message}\n`); resolve({ code: null }); });
    child.on('close', (code) => resolve({ code }));
  });
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
  //
  // AND A SILENT FALLBACK HERE RESTORES THAT BUG. The original `catch` treated
  // every failure as "no answer, use the configured flavour" — correct for a
  // link that died (nothing is going to be reloaded anyway), and WRONG for a
  // server that does not serve `emulator/status`, because then the fallback is
  // a guess that reproduces exactly the defect described above, with a
  // "Build succeeded" toast on top. The two are told apart, and the unserved
  // one refuses the reload rather than guessing.
  const unserved = new Set<string>();
  let runningRom: string | null = null;
  if (opts.client && opts.client.status === 'connected') {
    if (!opts.client.hasMethod('emulator/status')) {
      unserved.add('emulator/status');
    } else {
      try {
        const status = await opts.client.call('emulator/status') as { romPath?: string };
        runningRom = status?.romPath ?? null;
      } catch (e) {
        // Advertised and unimplemented is a real shape — only the reply proves
        // it, which is why this route exists alongside the check above.
        const u = unservedMethodOf(e);
        if (u !== null) unserved.add(u);
        /* else — a dead link: not fatal, and the reload below will not run either */
      }
    }
  }
  const plan = buildPlanFor({
    basePath: opts.basePath,
    raw: opts.raw,
    projectType: opts.projectType,
    env: opts.env ?? process.env,
    exists: (rel) => existsSync(join(opts.basePath, rel)),
  });
  const classic = plan.projectType === 'classic';

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
  //
  // AEON ONLY. Classic has no flavour at all — `build.lua` takes no switch and
  // emits one artifact — so forcing DEBUG into its env would be noise and
  // reporting `debugBuild` would claim a distinction that does not exist there.
  let wantsDebug: boolean | undefined;
  if (!classic) {
    const explicitDebug = plan.envOverrides.DEBUG;
    wantsDebug = explicitDebug !== undefined
      ? explicitDebug === '1'
      : runningRom !== null
        ? runningRom.endsWith('.debug.bin')
        : true;
    plan.envOverrides.DEBUG = wantsDebug ? '1' : '0';
  }

  let output = '';

  // THE LEVEL RE-BAKE, FIRST. `build.sh` never runs the generators (it says so
  // itself), so without this a save-then-build assembles the PREVIOUS level
  // data — successfully, silently, every time. Measured at ~8s against aeon.
  if (plan.prebuild) {
    const pre = await runOne(
      plan.prebuild.command, plan.prebuild.args, plan, opts,
      (s) => { output += s; opts.onOutput?.(s); },
    );
    if (pre.code !== 0) {
      output += `\n${plan.prebuild.command} failed: the level data was NOT re-baked, so a build here would assemble the previous one.\n`;
      return {
        ok: false, exitCode: pre.code, output: summariseBuildOutput(output),
        reloaded: false, missingEnv: plan.missingEnv, plan, debugBuild: wantsDebug,
        unservedMethods: unserved.size > 0 ? [...unserved] : undefined,
      };
    }
  }

  const tBuildStart = Date.now();
  return new Promise<BuildRunResult>((resolve) => {
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
        unservedMethods: unserved.size > 0 ? [...unserved] : undefined,
      });
    });

    child.on('close', (code) => {
      void (async () => {
        const buildMs = Date.now() - tBuildStart;
        let reloadMs = 0, restoreMs = 0;
        const base = {
          exitCode: code, output: summariseBuildOutput(output),
          missingEnv: plan.missingEnv, plan,
          get unservedMethods(): string[] | undefined {
            return unserved.size > 0 ? [...unserved] : undefined;
          },
          // Facts about the BUILD, so they are reported whether or not anything
          // was reloaded afterwards.
          debugBuild: wantsDebug, fast: plan.fast,
          timings: { build: buildMs, reload: 0, restore: 0 },
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
        // REFUSE, DO NOT GUESS. Without `emulator/status` we cannot know which
        // ROM is loaded, so pairing the build flavour with the reload target is
        // a coin flip — and the losing side is the silent no-op this file's
        // header describes. The build still ran and is still reported; only the
        // handoff is refused, and it says why and names the method.
        //
        // The reload sequence's own methods are checked here too, BEFORE the
        // pause: finding a gap after `emulator/pause` succeeded leaves the
        // machine stopped with the old ROM in it, which looks like a hang.
        for (const m of [
          'emulator/pause', 'emulator/reload_rom', 'emulator/load_symbols', 'emulator/resume',
        ] as const) {
          if (!opts.client.hasMethod(m)) unserved.add(m);
        }
        if (unserved.size > 0) {
          const missing = [...unserved];
          resolve({
            ...base, ok: true, reloaded: false,
            unservedMethods: missing,
            reloadError:
              `${opts.client.server?.name ?? 'the connected Aether server'} does not serve ` +
              `${missing.join(', ')}: the build ran, but Aurora refused to reload rather than ` +
              'guess which ROM is loaded (a wrong guess reloads a file the build never touched, ' +
              'and the game comes back byte-identical).',
          });
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
          // …EXCEPT when the project DECLARED a listing path, or is classic.
          // The stem swap encodes an aeon convention (s4.debug.bin pairs with
          // s4.debug.lst); AS names its listing after the SOURCE file, so
          // s1built.bin's listing is sonic.lst and the derivation would hand
          // load_symbols a file that does not exist. Stated config outranks
          // anything inferred.
          const romPath = runningRom ?? join(plan.cwd, plan.romPath);
          const symbolsPath = (plan.symbolsDeclared || classic)
            ? join(plan.cwd, plan.symbolsPath)
            : romPath.endsWith('.bin')
              ? `${romPath.slice(0, -4)}.lst`
              : join(plan.cwd, plan.symbolsPath);

          // `reload_rom` is require_paused (engine.rs:2202) — the same gate as
          // write_memory, and it was missed here exactly as it was missed in the
          // warp. Unpaused it fails with "needs the machine paused", the BUILD
          // still succeeds, and the game keeps running the OLD ROM under a
          // "Build succeeded" toast, so the edit appears to have done nothing.
          // REMEMBER WHERE THE PLAYER WAS, before the reload wipes it.
          //
          // A reload resets the machine, so without this Build & Run costs you
          // your place in the level every time — you rebuild to check one chunk
          // and land back at the act start. Read now, restore after boot, and
          // the whole thing reads as a refresh rather than a restart.
          //
          // CLASSIC: STILL NO RESTORE, AND THE REASON IS NOW A DIFFERENT ONE.
          //
          // S1 has no boot-position override and no warp mailbox. Poking
          // `v_player` on a running machine has since been measured and built
          // — that is `s1-warp.ts`, which answers F7 — so the old note here
          // ("link 4's unmeasured spike") no longer says anything true.
          //
          // What blocks a restore is the SHAPE OF A RELOAD, not the absence of
          // a mechanism. `reload_rom` resets the machine: S1 comes back on the
          // SEGA screen, not in the act. The poke needs a player object that is
          // in a level and past its init — the spike measured that a poke
          // inside the init window is discarded silently — and there is no
          // point in this sequence where such a machine exists. Getting back
          // into the act would mean driving the title screen with simulated
          // input, which is a feature, not a field.
          //
          // So the reload boots clean and the result says so: `restoredVia`
          // absent, exactly the shape a release aeon ROM (no mailbox symbols)
          // already produces. That omission is a truthful report.
          let restoreTo: { x: number; y: number } | null = null;
          if (!classic && opts.restorePosition !== false) {
            try {
              const player = await opts.client.resolve('Player_1');
              const rd = async (addr: number): Promise<number> => {
                const r = await opts.client!.call('emulator/read_memory', {
                  addr: '0x' + (addr >>> 0).toString(16).toUpperCase(), len: 4,
                }) as { bytes: string };
                // SST position is 16.16 fixed; the whole pixel is the high word.
                return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16) >>> 16;
              };
              restoreTo = { x: await rd(player + 0x02), y: await rd(player + 0x06) };
            } catch (e) {
              // NO SYMBOLS, NO RESTORE — still right, and still not worth
              // failing a good build over. But an unserved `lookup_symbol` or
              // `read_memory` is not "this ROM has no symbols": the restore is
              // skipped either way, and only one of them means the user should
              // go and look at their listing. So the behaviour defaults and the
              // REASON does not.
              const u = unservedMethodOf(e);
              if (u !== null) unserved.add(u);
            }
          }

          const tReload = Date.now();
          const pauseResult = await opts.client.call('emulator/pause') as { wasRunning?: boolean };
          const wasRunning = pauseResult?.wasRunning !== false;
          let landed: { x: number; y: number } | undefined;
          let restoredVia: 'boot-override' | 'warp' | undefined;
          let tRestore = 0;
          // Set once the restore has resumed the machine itself; the finally
          // must then NOT resume again (and must never resume a machine that
          // somebody else deliberately stopped — wasRunning is the courtesy).
          let resumedByRestore = false;
          /** Set when an UNSERVED resume left a live machine stopped by us. */
          let resumeLeftPaused = false;
          try {
            await opts.client.call('emulator/reload_rom', { path: romPath });
            await opts.client.loadSymbols(symbolsPath);
            reloadMs = Date.now() - tReload;

            // PUT THE PLAYER BACK — AT BOOT, inside the pre-display window.
            //
            // The engine's boot-position override (ENGINE_ARCHITECTURE.md
            // §4.12b) is consumed by the level init itself, so the first
            // painted frame IS the destination — no draw-then-jump, and none
            // of the old shape's "retry the warp until gameplay begins" loop.
            // The window is the one subtle part: boot zeroes ALL work RAM, so
            // the writes only survive AFTER `run_to` the init's entry — which
            // is why this runs here, before any resume, while the machine is
            // still paused from the reload. `bootRestoreTo` owns the sequence
            // (run_to -> X, Y, flag LAST -> continue) and the ack.
            if (restoreTo) {
              tRestore = Date.now();
              const boot = await bootRestoreTo(opts.client, restoreTo.x, restoreTo.y, { wasRunning });
              resumedByRestore = boot.resumed;
              if (boot.restored) {
                landed = boot.landed;
                restoredVia = 'boot-override';
              }
              restoreMs = Date.now() - tRestore;
            }
          } finally {
            // A reload RESETS the machine, so resuming lets the fresh ROM boot
            // rather than leaving a frozen first frame that looks hung. When
            // the boot restore already resumed (its `continue` step), a second
            // resume here would be redundant at best.
            //
            // "reported below" was only ever true for a throw from the TRY: a
            // resume that fails here has nothing downstream to report it. A dead
            // link is genuinely nothing to say (the machine is gone); an
            // unserved `resume` means we stopped a live machine and cannot start
            // it, so it is recorded and surfaced.
            if (wasRunning && !resumedByRestore) {
              try {
                await opts.client.call('emulator/resume');
              } catch (e) {
                const u = unservedMethodOf(e);
                if (u !== null) { unserved.add(u); resumeLeftPaused = true; }
              }
            }
          }
          // FALLBACK: the warp mailbox, for a DEBUG ROM that predates the
          // boot override (it has Warp_Req_* but no Boot_At_*), or when the
          // boot path could not complete. Old shape, kept verbatim: the warp
          // is consumed by the LEVEL game state, so an attempt made during
          // boot simply never acks — retry with a short budget each time and
          // the first attempt that lands is the moment gameplay began. A ROM
          // with neither mailbox (release) gates out inside warpTo, and the
          // build result simply reports no restore.
          if (restoreTo && !landed) {
            for (let attempt = 0; attempt < 12 && !landed; attempt++) {
              const r = await warpTo(opts.client, restoreTo.x, restoreTo.y, { maxPolls: 40 });
              if (r.warped) {
                landed = r.landed ?? restoreTo;
                restoredVia = 'warp';
              }
            }
            restoreMs = Date.now() - tRestore;
          }
          resolve({
            ...base, ok: true, reloaded: true, romPath,
            restoredTo: landed,
            restoredVia,
            unservedMethods: unserved.size > 0 ? [...unserved] : undefined,
            reloadError: resumeLeftPaused
              ? `${opts.client.server?.name ?? 'the connected Aether server'} does not serve ` +
                'emulator/resume: the ROM was reloaded but the machine was left PAUSED.'
              : undefined,
            timings: { build: buildMs, reload: reloadMs, restore: restoreMs },
          });
        } catch (e) {
          // The build succeeded; only the handoff failed. Saying so is the
          // difference between "your build is broken" and "the emulator did not
          // pick it up", which are different problems with different fixes.
          if (isMethodNotServed(e)) unserved.add((e as MethodNotServedError).method);
          resolve({
            ...base, ok: true, reloaded: false,
            unservedMethods: unserved.size > 0 ? [...unserved] : undefined,
            reloadError: e instanceof Error ? e.message : String(e),
          });
        }
      })();
    });
  });
}
