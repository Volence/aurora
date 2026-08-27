import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../build-run';
import { MethodNotServedError } from '../unserved';

/**
 * These drive a REAL spawn against a throwaway script, because the things worth
 * testing here are exit codes, output capture and the order of the two emulator
 * calls — and a mocked child_process would test the mock. The scripts are tiny
 * and the directory is removed afterwards.
 */
function scriptDir(body: string, name = 'build.sh'): string {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-build-'));
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return dir;
}

/**
 * The methods a healthy server serves for this path. Spelled out rather than
 * `() => true` so a test can take ONE away and see what the runner does — which
 * is the whole subject of the unserved-method rows below.
 */
const SERVED = [
  'emulator/status', 'emulator/pause', 'emulator/resume', 'emulator/reload_rom',
  'emulator/load_symbols', 'emulator/lookup_symbol', 'emulator/read_memory',
  'emulator/write_memory', 'emulator/run_to', 'emulator/run_frames',
];

function fakeClient(opts: {
  failOn?: string; romPath?: string; wasRunning?: boolean;
  /** Methods this server does NOT serve — dropped from the advertised list. */
  unserved?: string[];
  /** Methods advertised but answered with -32601, the advertised-and-unimplemented shape. */
  notFoundOn?: string[];
} = {}) {
  const calls: string[] = [];
  const served = SERVED.filter((m) => !(opts.unserved ?? []).includes(m));
  return {
    calls,
    status: 'connected' as const,
    server: { name: 'oracle-next' },
    hasMethod: (m: string) => served.includes(m),
    resolve: async () => {
      // The real client resolves THROUGH `emulator/lookup_symbol`, so a server
      // that does not serve it cannot resolve anything. A fake whose `resolve`
      // ignored that would hide the very case these rows are about.
      if (!served.includes('emulator/lookup_symbol')) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
      }
      return 0;
    },
    loadSymbols: async (path: string) => {
      calls.push(`load_symbols:${path}`);
      if (opts.failOn === 'load_symbols') throw new Error('listing does not bind to the loaded ROM');
      return {};
    },
    call: async (method: string, params?: Record<string, unknown>) => {
      calls.push(`${method}:${params?.path ?? ''}`);
      if (!served.includes(method)) {
        throw new MethodNotServedError(method, 'advertised-list', 'oracle-next');
      }
      if ((opts.notFoundOn ?? []).includes(method)) {
        // What the wire produces for an ADVERTISED but unimplemented method:
        // the client turns a -32601 reply into the named condition itself.
        throw Object.assign(new Error(`no such method: ${method}`), { code: -32601, method });
      }
      if (opts.failOn === method) throw new Error('reload refused');
      if (method === 'emulator/status') return { romPath: opts.romPath ?? '/engine/s4.bin' };
      if (method === 'emulator/pause') return { wasRunning: opts.wasRunning ?? true };
      return {};
    },
  };
}

describe('runBuild', () => {
  it('reports a successful build and its output', async () => {
    const dir = scriptDir('echo building; echo done; exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.output).toContain('building');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports a failing build with its error output, and does NOT reload', async () => {
    const dir = scriptDir('echo "ERROR: collision gate rejected section_3" >&2; exit 1');
    const client = fakeClient();
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.output.join('\n')).toContain('collision gate rejected');
      // THE POINT: the ROM on disk is the previous build's, so reloading would
      // put the artist in a game that silently lacks the change they made.
      // (A `status` call is expected — it happens BEFORE the build, to pick the
      // release/DEBUG flavour that matches the running ROM.)
      expect(client.calls.filter((c) => c.startsWith('emulator/reload_rom'))).toEqual([]);
      expect(client.calls.filter((c) => c.startsWith('load_symbols'))).toEqual([]);
      expect(r.reloaded).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /**
   * MEASURED, not reasoned. Against a live oracle-aether:
   *   load_symbols(new listing) with the old ROM loaded -> REFUSED,
   *     "does not describe the loaded ROM"
   *   reload_rom(new ROM) -> ok, and drops the stale listing with the caveat
   *     "load the listing for the new build before resolving anything"
   *   load_symbols(new listing) -> binding: match
   * The first version of this test asserted the opposite order and passed,
   * because a fake client will happily accept any sequence you ask it for.
   */
  it('reloads the ROM BEFORE loading the new symbols', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient();
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.reloaded).toBe(true);
      // Relative order, not absolute position: the runner also asks
      // `emulator/status` first to learn which ROM is actually loaded, and this
      // test is about reload-before-symbols, not about being call zero.
      const reload = client.calls.findIndex((c) => c.startsWith('emulator/reload_rom:'));
      const symbols = client.calls.findIndex((c) => c.startsWith('load_symbols:'));
      expect(reload).toBeGreaterThanOrEqual(0);
      expect(symbols).toBeGreaterThan(reload);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('builds fine with nothing connected, and says it did not reload', async () => {
    const dir = scriptDir('exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(false);
      expect(r.reloadError).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('separates a good build from a failed handoff', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ failOn: 'emulator/reload_rom' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      // "Your build is broken" and "the emulator did not pick it up" are
      // different problems with different fixes; the result distinguishes them.
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(false);
      expect(r.reloadError).toMatch(/reload refused/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports a missing build command instead of failing silently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aurora-build-'));   // no build.sh at all
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBeNull();
      expect(r.output.join('\n')).toMatch(/ENOENT|build\.sh/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('surfaces the missing environment that explains an instant exit 1', async () => {
    const dir = scriptDir('echo "ERROR: build.sh needs the sigil build binary" >&2; exit 1');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.missingEnv).toEqual(['SIGIL_BUILD', 'SIGIL_EMIT']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('passes project-declared env through to the build', async () => {
    const dir = scriptDir('echo "SIGIL_BUILD=$SIGIL_BUILD"; exit 0');
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {},
        raw: { buildEnv: { SIGIL_BUILD: '/tools/sigil', SIGIL_EMIT: '/tools/emit' } },
      });
      expect(r.output.join('\n')).toContain('SIGIL_BUILD=/tools/sigil');
      expect(r.missingEnv).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('streams output as it arrives rather than only at exit', async () => {
    const dir = scriptDir('echo one; echo two; exit 0');
    const seen: string[] = [];
    try {
      await runBuild({ basePath: dir, client: null, env: {}, onOutput: (s) => seen.push(s) });
      expect(seen.join('')).toContain('one');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and which ROM is actually running', () => {
  /**
   * The plan's default is s4.bin, but the emulator may be running
   * s4.debug.bin — which is the case that matters, because the warp mailbox is
   * DEBUG-only. Reloading the configured default there swaps the debug ROM for
   * the release one and silently removes the symbols a shipped feature depends
   * on, under a cheerful "Build succeeded" toast.
   *
   * Found by the owner's emulator running the debug ROM while this reloaded a
   * hardcoded s4.bin.
   */
  it('reloads the ROM the emulator reports, not the configured default', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.romPath).toBe('/engine/s4.debug.bin');
      expect(client.calls).toContain('emulator/reload_rom:/engine/s4.debug.bin');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('derives the listing from that ROM so the pair cannot drift', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(client.calls).toContain('load_symbols:/engine/s4.debug.lst');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and the build flavour', () => {
  /**
   * `./build.sh` emits s4.bin; `DEBUG=1 ./build.sh` emits s4.debug.bin
   * (build.sh:37 suffixes the artifact). The emulator is often on the DEBUG ROM
   * because that is the one carrying the warp mailbox — so building release and
   * then reloading the debug ROM reloads a file the build never touched, the
   * game comes back byte-identical, and the edit appears to have done nothing.
   *
   * Found by the owner changing a chunk, pressing Build & Run, and watching
   * the game not change.
   */
  it('builds DEBUG when the emulator is running a .debug.bin', async () => {
    const dir = scriptDir('echo "DEBUG=$DEBUG"; exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.debugBuild).toBe(true);
      expect(r.output.join('\n')).toContain('DEBUG=1');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('drops to release when the emulator is on the release ROM', async () => {
    // Correctness beats preference: building debug here would leave the reload
    // pointing at a file the build never touched.
    const dir = scriptDir('echo "DEBUG=[$DEBUG]"; exit 0');
    const client = fakeClient({ romPath: '/engine/s4.bin' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.debugBuild).toBe(false);
      expect(r.output.join('\n')).toContain('DEBUG=[0]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('defaults to DEBUG when nothing is connected', async () => {
    // Someone driving a build from the editor is developing; shipping a release
    // ROM is a deliberate act, not what a keypress gives you.
    const dir = scriptDir('echo "DEBUG=[$DEBUG]"; exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.debugBuild).toBe(true);
      expect(r.output.join('\n')).toContain('DEBUG=[1]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('lets project.json state the flavour explicitly, beating both', async () => {
    const dir = scriptDir('echo "DEBUG=[$DEBUG]"; exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      const r = await runBuild({
        basePath: dir, client: client as never, env: {},
        raw: { buildEnv: { DEBUG: '0' } },
      });
      expect(r.debugBuild).toBe(false);
      expect(r.output.join('\n')).toContain('DEBUG=[0]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and the reload pause gate', () => {
  /**
   * `emulator/reload_rom` is require_paused (engine.rs:2202), the same gate as
   * write_memory — and it was missed here exactly as it was missed in the warp.
   * Unpaused, the reload fails, the build succeeds, and the game keeps running
   * the OLD ROM under a "Build succeeded" toast, so the edit appears to have
   * done nothing. Reported by the owner as "it took 30 seconds and nothing
   * changed", with the error in a toast.
   */
  it('pauses before reloading and resumes afterwards', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ wasRunning: true });
    try {
      await runBuild({ basePath: dir, client: client as never, env: {} });
      const order = client.calls.map((c) => c.split(':')[0]);
      const pause = order.indexOf('emulator/pause');
      const reload = order.indexOf('emulator/reload_rom');
      expect(pause).toBeGreaterThanOrEqual(0);
      expect(reload).toBeGreaterThan(pause);
      expect(order.indexOf('emulator/resume')).toBeGreaterThan(reload);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('leaves a machine that was already paused paused', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ wasRunning: false });
    try {
      await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(client.calls.map((c) => c.split(':')[0])).not.toContain('emulator/resume');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('resumes even when the reload itself fails', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ wasRunning: true, failOn: 'emulator/reload_rom' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(false);
      expect(client.calls.map((c) => c.split(':')[0])).toContain('emulator/resume');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and the level re-bake', () => {
  /**
   * build.sh NEVER runs the level generators — its own tools/regenerate-level.sh
   * says so: "MANUAL re-bake … the build never runs these generators … run this
   * by hand when the editor data changes". So save-then-build assembles the
   * PREVIOUS level data, successfully and silently, every time.
   *
   * Found by the owner stamping a chunk, building, reloading, and seeing the old
   * layout — three times, across three different fixes to the wrong layer.
   */
  it('runs the re-bake before the build when the script exists', async () => {
    const dir = scriptDir('echo BUILD; exit 0');
    writeFileSync(join(dir, 'regen.sh'), '#!/bin/sh\necho REBAKE\n');
    chmodSync(join(dir, 'regen.sh'), 0o755);
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {},
        // Canonical shape: FAST owns staleness itself, so our own step only
        // exists on the path that opts out of it.
        raw: { buildFast: false, prebuildCommand: './regen.sh' },
      });
      const out = r.output.join('\n');
      expect(out).toContain('REBAKE');
      expect(out).toContain('BUILD');
      expect(out.indexOf('REBAKE')).toBeLessThan(out.indexOf('BUILD'));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('does NOT build when the re-bake fails', async () => {
    // Building on a failed re-bake produces a ROM with the old level data and a
    // green result — the worst of both.
    const dir = scriptDir('echo BUILD; exit 0');
    writeFileSync(join(dir, 'regen.sh'), '#!/bin/sh\necho "ERROR: donor missing" >&2\nexit 3\n');
    chmodSync(join(dir, 'regen.sh'), 0o755);
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {},
        raw: { buildFast: false, prebuildCommand: './regen.sh' },
      });
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(3);
      expect(r.output.join('\n')).not.toContain('BUILD');
      expect(r.output.join('\n')).toMatch(/NOT re-baked/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('skips the step when the project turns it off with an empty string', async () => {
    const dir = scriptDir('echo BUILD; exit 0');
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {}, raw: { buildFast: false, prebuildCommand: '' },
      });
      expect(r.ok).toBe(true);
      expect(r.output.join('\n')).toContain('BUILD');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('plans no step at all when the default script is absent', async () => {
    const dir = scriptDir('echo BUILD; exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {}, raw: { buildFast: false } });
      expect(r.plan.prebuild).toBeNull();
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and the FAST shape', () => {
  /**
   * aeon measured the two verification lanes at 92% of the wall (expect-fail
   * 22.7s + pytest 12.4s) against a 1.15s assemble, and shipped
   * `FAST=1 ./build.sh` for the iteration loop — byte-identical output, ~1.3s,
   * and it re-bakes stale editor data itself.
   *
   * That last part is why Aurora's own pre-build step must NOT also run: ours
   * has no staleness detection, so it would re-bake every single time on top of
   * a build that already handles it.
   */
  it('passes FAST=1 and plans no pre-build step of its own', async () => {
    const dir = scriptDir('echo "FAST=[$FAST]"; exit 0');
    writeFileSync(join(dir, 'regen.sh'), '#!/bin/sh\necho REBAKE\n');
    chmodSync(join(dir, 'regen.sh'), 0o755);
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {},
        raw: { prebuildCommand: './regen.sh' },
      });
      expect(r.fast).toBe(true);
      expect(r.plan.prebuild).toBeNull();
      expect(r.output.join('\n')).toContain('FAST=[1]');
      expect(r.output.join('\n')).not.toContain('REBAKE');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('runs the canonical shape, and our own re-bake, when a project opts out', async () => {
    const dir = scriptDir('echo "FAST=[$FAST]"; exit 0');
    writeFileSync(join(dir, 'regen.sh'), '#!/bin/sh\necho REBAKE\n');
    chmodSync(join(dir, 'regen.sh'), 0o755);
    try {
      const r = await runBuild({
        basePath: dir, client: null, env: {},
        raw: { buildFast: false, prebuildCommand: './regen.sh' },
      });
      expect(r.fast).toBe(false);
      expect(r.output.join('\n')).toContain('FAST=[]');
      expect(r.output.join('\n')).toContain('REBAKE');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild and the position restore (boot override + warp fallback)', () => {
  /**
   * A model of the engine's contract rather than an accept-anything recorder
   * (the sequencing details have their own suite in boot-restore.test.ts —
   * this one is about how runBuild WIRES the restore into the reload):
   *
   *  - run_to the init simulates the boot, which ZEROES work RAM — so a
   *    runBuild that regressed to writing before/without run_to fails here.
   *  - the init consumes Boot_At_* single-shot: clamp to the fixture bounds,
   *    publish the CLAMPED pair back, clear the flag as the ack.
   *  - the warp mailbox is consumed while the game RUNS (modelled as: time
   *    passes on any read of a running machine), same clamp/publish/ack.
   *  - write_memory / run_to / run_frames are require_paused, as on the real
   *    server (oracle-aether engine.rs:1401/1290/1263).
   */
  const RSYM: Record<string, number> = {
    Player_1: 0xffb000,
    Boot_At_X: 0xffe508, Boot_At_Y: 0xffe50a, Boot_At_Flag: 0xffe50c,
    Warp_Req_X: 0xffe502, Warp_Req_Y: 0xffe504, Warp_Req_Flag: 0xffe506,
    GameState_OJZScroll_Init: 0xa1724,
  };
  const R_BOUND_X = 0x0900, R_BOUND_Y = 0x0700;
  const rHex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();

  function restoreFake(opts: {
    /** Player pixel position seeded into RAM before the build (16.16 fixed). */
    playerAt: { x: number; y: number };
    /** Which symbols this ROM carries (default: all of RSYM). */
    symbols?: Record<string, number>;
    running?: boolean;
    /** Methods this server does NOT serve — dropped from the advertised list. */
    unserved?: string[];
  }) {
    const symbols = opts.symbols ?? RSYM;
    const ram = new Map<number, number>();
    const log: string[] = [];
    let running = opts.running ?? true;
    let booted = false, initConsumed = false;

    const rd = (a: number) => ram.get(a) ?? 0;
    const wrWord = (a: number, v: number) => { ram.set(a, (v >> 8) & 0xff); ram.set(a + 1, v & 0xff); };
    const rdWord = (a: number) => (rd(a) << 8) | rd(a + 1);
    // Seed the player's 16.16 position: high word = whole pixels. The .8000
    // subpixel is there so a restore of the LOW word would be caught.
    const seed = (off: number, px: number) => { wrWord(symbols.Player_1 + off, px); wrWord(symbols.Player_1 + off + 2, 0x8000); };
    seed(0x02, opts.playerAt.x);
    seed(0x06, opts.playerAt.y);

    const consume = (xs: string, ys: string, fs: string, once: boolean) => {
      if (once && initConsumed) return;
      if (once) initConsumed = true;
      if (rd(symbols[fs]) !== 0) {
        wrWord(symbols[xs], Math.min(rdWord(symbols[xs]), R_BOUND_X));
        wrWord(symbols[ys], Math.min(rdWord(symbols[ys]), R_BOUND_Y));
        ram.set(symbols[fs], 0);
      }
    };
    const tick = () => {
      if (booted) consume('Boot_At_X', 'Boot_At_Y', 'Boot_At_Flag', true);
      if (symbols.Warp_Req_Flag !== undefined) consume('Warp_Req_X', 'Warp_Req_Y', 'Warp_Req_Flag', false);
    };

    const served = SERVED.filter((m) => !(opts.unserved ?? []).includes(m));
    const client = {
      log,
      status: 'connected' as const,
      server: { name: 'oracle-next' },
      hasMethod: (m: string) => served.includes(m),
      resolve: async (name: string): Promise<number> => {
        if (!served.includes('emulator/lookup_symbol')) {
          throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
        }
        const a = symbols[name];
        if (a === undefined) throw new Error(`symbol ${name} did not resolve`);
        return a;
      },
      loadSymbols: async (path: string) => { log.push(`load_symbols:${path}`); return {}; },
      call: async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
        log.push(`${method}:${params?.symbol ?? params?.addr ?? params?.path ?? ''}`);
        // A real client REJECTS an unadvertised method rather than answering it.
      // Without this the fake would serve a method it claims not to have, and
      // any row about the unserved path would be testing the fake.
      if (!served.includes(method)) {
          throw new MethodNotServedError(method, 'advertised-list', 'oracle-next');
        }
        const requirePaused = () => {
          if (running) throw new Error(`${method} needs the machine paused; call emulator/pause first`);
        };
        switch (method) {
          case 'emulator/status': return { romPath: '/engine/s4.debug.bin' };
          case 'emulator/pause': { const was = running; running = false; return { wasRunning: was }; }
          case 'emulator/resume': running = true; tick(); return {};
          case 'emulator/reload_rom': requirePaused(); return {};
          case 'emulator/run_to': requirePaused(); ram.clear(); booted = true; return { reached: true };
          case 'emulator/run_frames': requirePaused(); tick(); return {};
          case 'emulator/write_memory': {
            requirePaused();
            const addr = Number(params!.addr);
            const h = String(params!.bytes).replace(/^0x/i, '');
            for (let i = 0; i < h.length / 2; i++) ram.set(addr + i, Number.parseInt(h.slice(i * 2, i * 2 + 2), 16));
            return {};
          }
          case 'emulator/read_memory': {
            if (running) tick(); // time passes on a running machine
            const addr = Number(params!.addr), len = Number(params!.len ?? 1);
            let h = '';
            for (let i = 0; i < len; i++) h += rd(addr + i).toString(16).padStart(2, '0');
            return { bytes: '0x' + h };
          }
          default: return {};
        }
      },
    };
    return { client, log, isRunning: () => running };
  }

  it('restores via the boot override, inside the pre-resume window', async () => {
    const dir = scriptDir('exit 0');
    const at = { x: 0x0234, y: 0x0567 }; // within the fixture bounds
    const f = restoreFake({ playerAt: at });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.reloaded).toBe(true);
      expect(r.restoredVia).toBe('boot-override');
      // In bounds, so the engine publishes back exactly the saved pixels.
      expect(r.restoredTo).toEqual(at);

      // THE WINDOW: pause -> reload -> symbols -> run_to -> X -> Y -> flag
      // LAST -> resume. Derived from the fixture's own address table.
      const i = (needle: string) => f.log.findIndex((c) => c.startsWith(needle));
      const order = [
        i('emulator/pause'),
        i('emulator/reload_rom:'),
        i('load_symbols:'),
        i('emulator/run_to:'),
        i(`emulator/write_memory:${rHex(RSYM.Boot_At_X)}`),
        i(`emulator/write_memory:${rHex(RSYM.Boot_At_Y)}`),
        i(`emulator/write_memory:${rHex(RSYM.Boot_At_Flag)}`),
        i('emulator/resume'),
      ];
      for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // Exactly one resume: the restore's own continue. A second one would be
      // runBuild resuming a machine its restore already resumed.
      expect(f.log.filter((c) => c.startsWith('emulator/resume')).length).toBe(1);
      // And no warp fallback ran.
      expect(i(`emulator/write_memory:${rHex(RSYM.Warp_Req_Flag)}`)).toBe(-1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('surfaces where the engine says the player LANDED, not what was asked', async () => {
    const dir = scriptDir('exit 0');
    // Saved position beyond the fixture bounds -> the engine clamps and
    // publishes back; the expectation is computed with the same Math.min.
    const at = { x: R_BOUND_X + 0x100, y: R_BOUND_Y + 0x80 };
    const f = restoreFake({ playerAt: at });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.restoredVia).toBe('boot-override');
      expect(r.restoredTo).toEqual({ x: Math.min(at.x, R_BOUND_X), y: Math.min(at.y, R_BOUND_Y) });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('falls back to the warp mailbox on a DEBUG ROM that predates the override', async () => {
    const dir = scriptDir('exit 0');
    const at = { x: 0x0234, y: 0x0567 };
    const noBoot = Object.fromEntries(Object.entries(RSYM)
      .filter(([k]) => !k.startsWith('Boot_At_')));
    const f = restoreFake({ playerAt: at, symbols: noBoot });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.reloaded).toBe(true);
      expect(r.restoredVia).toBe('warp');
      expect(r.restoredTo).toEqual(at); // warpTo's landed — published back by the engine
      // The boot path gated off BEFORE advancing the machine: no run_to.
      expect(f.log.some((c) => c.startsWith('emulator/run_to'))).toBe(false);
      // And runBuild resumed the machine itself (the fallback needs a booting
      // game, and the restore never got as far as resuming).
      expect(f.log.some((c) => c.startsWith('emulator/resume'))).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('restores nothing, and still succeeds, when NEITHER mailbox exists (release ROM)', async () => {
    const dir = scriptDir('exit 0');
    const f = restoreFake({
      playerAt: { x: 0x0100, y: 0x0100 },
      symbols: { Player_1: RSYM.Player_1 }, // position readable; no mailboxes
    });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(true);
      expect(r.restoredTo).toBeUndefined();
      expect(r.restoredVia).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('leaves a machine somebody else stopped STOPPED, and still restores', async () => {
    const dir = scriptDir('exit 0');
    const at = { x: 0x0234, y: 0x0567 };
    const f = restoreFake({ playerAt: at, running: false });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.restoredVia).toBe('boot-override');
      expect(r.restoredTo).toEqual(at);
      expect(f.log.some((c) => c.startsWith('emulator/resume'))).toBe(false);
      expect(f.isRunning()).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('honours restorePosition: false by never touching either mailbox', async () => {
    const dir = scriptDir('exit 0');
    const f = restoreFake({ playerAt: { x: 0x0100, y: 0x0100 } });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {}, restorePosition: false });
      expect(r.reloaded).toBe(true);
      expect(r.restoredTo).toBeUndefined();
      expect(f.log.some((c) => c.startsWith('emulator/run_to'))).toBe(false);
      expect(f.log.some((c) => c.startsWith('emulator/write_memory'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /**
   * THE RESTORE PROBE, and the cutover's second failure mode. Defaulting is
   * still RIGHT here — a build must not fail because the player's position
   * could not be read — so the BEHAVIOUR is unchanged and only the reason stops
   * being silent. "No symbols, no restore" sends the artist to look at their
   * listing; an unserved lookup is not their listing's fault.
   */
  it('still reloads when the position lookup is unserved, and names it instead of losing it', async () => {
    const dir = scriptDir('exit 0');
    const f = restoreFake({ playerAt: { x: 0x0234, y: 0x0567 }, unserved: ['emulator/lookup_symbol'] });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(true);              // the build STILL lands
      expect(r.restoredVia).toBeUndefined();      // the restore is still skipped
      expect(r.unservedMethods ?? []).toContain('emulator/lookup_symbol');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /**
   * The other half of that discrimination. A ROM with no mailbox symbols is the
   * documented reason this catch exists, and it must stay silent — otherwise
   * every release-ROM build starts reporting a capability gap that is not there,
   * and the field stops meaning anything.
   */
  it('reports no unserved methods when a healthy server meets a ROM without symbols', async () => {
    const dir = scriptDir('exit 0');
    // NO SYMBOLS AT ALL, so the position read itself throws an ordinary
    // resolution error and the catch under test is genuinely entered. An earlier
    // version of this row left `Player_1` resolvable, which meant it never
    // reached that catch and was quietly measuring a different gate — a planted
    // violation there came back green and said so.
    const f = restoreFake({ playerAt: { x: 0x0234, y: 0x0567 }, symbols: {} });
    try {
      const r = await runBuild({ basePath: dir, client: f.client as never, env: {} });
      expect(r.reloaded).toBe(true);
      expect(r.restoredVia).toBeUndefined();
      expect(r.unservedMethods).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('runBuild on a classic (S1) project', () => {
  /**
   * A real `lua` spawn against a throwaway build.lua, same policy as the rest
   * of this file: the things under test are which command gets spawned, which
   * env it does NOT get, which listing path the emulator is handed, and that
   * no restore is attempted — and a mocked child_process would test the mock.
   */
  function classicDir(luaBody: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'aurora-classic-build-'));
    writeFileSync(join(dir, 'build.lua'), luaBody);
    return dir;
  }

  /** fakeClient plus a record of which symbols were resolved. */
  function recordingClient(opts: { romPath?: string } = {}) {
    const c = fakeClient(opts);
    const resolves: string[] = [];
    return {
      ...c,
      resolves,
      resolve: async (name: string) => { resolves.push(name); return 0; },
    };
  }

  it('spawns lua build.lua in the project dir, with neither DEBUG nor FAST in its env', async () => {
    // The lua script REPORTS what env it actually received; asserting on the
    // plan alone would not catch build-run re-adding the aeon overrides after
    // planning (which is exactly what it does for aeon).
    const dir = classicDir(
      'print("DEBUG=" .. tostring(os.getenv("DEBUG")))\n'
      + 'print("FAST=" .. tostring(os.getenv("FAST")))\n');
    try {
      const r = await runBuild({ basePath: dir, projectType: 'classic', client: null, env: {} });
      expect(r.ok).toBe(true);
      expect(r.output).toContain('DEBUG=nil');
      expect(r.output).toContain('FAST=nil');
      // No flavour exists on classic, so the result must not claim one either way.
      expect(r.debugBuild).toBeUndefined();
      expect(r.fast).toBe(false);
      expect(r.missingEnv).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('hands load_symbols the SOURCE-named listing, never a ROM-stem derivation', async () => {
    // The emulator reports it is running s1built.bin; the stem swap would hand
    // over "s1built.lst", a file AS never writes. The listing is sonic.lst,
    // named after sonic.asm (s1disasm common.lua:773, `-L`).
    const dir = classicDir('print("ok")');
    const client = recordingClient({ romPath: join(dir, 's1built.bin') });
    try {
      const r = await runBuild({ basePath: dir, projectType: 'classic', client: client as never, env: {} });
      expect(r.reloaded).toBe(true);
      const sym = client.calls.find((c) => c.startsWith('load_symbols:'));
      expect(sym).toBe(`load_symbols:${join(dir, 'sonic.lst')}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // STILL TRUE AFTER PLAY-FROM-CURSOR LANDED ON CLASSIC, and worth saying why.
  // `s1-warp.ts` can now poke `v_player` on a running machine, so "there is no
  // mechanism" stopped being the reason. What stops a restore here is that
  // `reload_rom` RESETS the machine: S1 comes back on the SEGA screen, and the
  // poke needs a player in a level and past its init (a poke inside the init
  // window was measured to be discarded silently). No point in this sequence
  // has such a machine. The absent `restoredVia` is a truthful report, not a
  // gap left unfilled.
  it('attempts NO position restore — a reload resets S1 to the SEGA screen', async () => {
    const dir = classicDir('print("ok")');
    const client = recordingClient({ romPath: join(dir, 's1built.bin') });
    try {
      const r = await runBuild({ basePath: dir, projectType: 'classic', client: client as never, env: {} });
      expect(r.ok).toBe(true);
      // Not a single symbol resolve: no Player_1 read before the reload, no
      // Warp_Req_*/Boot_At_* after it. `restoredVia` absent is the honest
      // report, the same shape a release aeon ROM produces.
      expect(client.resolves).toEqual([]);
      expect(r.restoredVia).toBeUndefined();
      expect(r.restoredTo).toBeUndefined();
      // The reload envelope itself is unchanged: pause -> reload -> resume.
      const order = client.calls;
      expect(order.find((c) => c.startsWith('emulator/reload_rom:'))).toBeTruthy();
      expect(order.filter((c) => c.startsWith('emulator/write_memory'))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a DECLARED symbolsPath beats the ROM-stem derivation on aeon too', async () => {
    // Same rule, other family: stated config outranks anything inferred.
    const dir = scriptDir('exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      await runBuild({
        basePath: dir, client: client as never, env: {},
        raw: { symbolsPath: 'custom/name.lst' }, restorePosition: false,
      });
      const sym = client.calls.find((c) => c.startsWith('load_symbols:'));
      expect(sym).toBe(`load_symbols:${join(dir, 'custom/name.lst')}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('still derives from the running ROM stem when aeon declares nothing', async () => {
    // The behaviour the derivation exists FOR: s4.debug.bin pairs with
    // s4.debug.lst without a second config field to get out of step.
    const dir = scriptDir('exit 0');
    const client = fakeClient({ romPath: '/engine/s4.debug.bin' });
    try {
      await runBuild({ basePath: dir, client: client as never, env: {}, restorePosition: false });
      const sym = client.calls.find((c) => c.startsWith('load_symbols:'));
      expect(sym).toBe('load_symbols:/engine/s4.debug.lst');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

/**
 * THE CUTOVER ROWS, and the one with a bug already behind it.
 *
 * `runBuild` asks `emulator/status` which ROM is loaded, because building the
 * release flavour while the DEBUG ROM is running reloads a file the build never
 * touched — the game comes back byte-identical and the edit appears to have done
 * nothing. That happened, to the owner, once.
 *
 * The original `catch` around that probe fell back to the configured flavour.
 * Right for a dead link (nothing was going to be reloaded anyway); WRONG for a
 * server that does not serve `emulator/status`, where the fallback is a coin
 * flip whose losing side is exactly that bug, under a "Build succeeded" toast.
 */
describe('runBuild against a server that does not serve what it needs', () => {
  it('builds, then REFUSES the reload rather than guessing which ROM is loaded', async () => {
    const dir = scriptDir('echo building; exit 0');
    const client = fakeClient({ unserved: ['emulator/status'] });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });

      // The build is not the casualty — an artist still learns their level
      // assembles, which is the property the no-emulator path already had.
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.output.join('\n')).toContain('building');

      // THE REFUSAL. Not a defaulted flavour, not a silent skip.
      expect(r.reloaded).toBe(false);
      // AND IT NEVER ASKED. The advertised list already said so, so the refusal
      // costs no round trip — which is also the only observable that separates
      // this route from the -32601 one in the next row. Without it, deleting the
      // pre-check entirely leaves this row green.
      expect(client.calls.filter((c) => c.startsWith('emulator/status'))).toEqual([]);
      expect(r.unservedMethods ?? []).toContain('emulator/status');
      expect(r.reloadError).toContain('emulator/status');
      // And it MUST NOT have reloaded on a guess — the whole point.
      expect(client.calls.filter((c) => c.startsWith('emulator/reload_rom'))).toEqual([]);
      expect(client.calls.filter((c) => c.startsWith('load_symbols'))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /**
   * THE OTHER ROUTE. `emulator/status` is advertised here and answers -32601 —
   * the advertised-and-unimplemented shape, which no check of the list can see.
   * A client that only pre-checked would fall straight back into the guess.
   */
  it('refuses the same way when status is ADVERTISED but answers -32601', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ notFoundOn: ['emulator/status'] });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      // ANTI-VACUOUS: the call really was made — this is the reply route, not
      // the list route, and the row would be meaningless if status were skipped.
      expect(client.calls.some((c) => c.startsWith('emulator/status'))).toBe(true);
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(false);
      expect(r.unservedMethods ?? []).toContain('emulator/status');
      expect(client.calls.filter((c) => c.startsWith('emulator/reload_rom'))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /**
   * THE DISCRIMINATION. A dead link is the failure this catch was WRITTEN for,
   * and defaulting is still right there: nothing is going to be reloaded, so a
   * flavour guess costs nothing. Without this row an implementation that
   * refused on every probe failure would pass, and the no-emulator build — the
   * one an artist without an emulator runs — would start reporting a fault.
   */
  it('still defaults quietly when the link is simply not connected', async () => {
    const dir = scriptDir('exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.ok).toBe(true);
      expect(r.reloaded).toBe(false);
      expect(r.unservedMethods).toBeUndefined();
      expect(r.reloadError).toBeUndefined();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses BEFORE pausing when reload_rom is unserved', async () => {
    const dir = scriptDir('exit 0');
    const client = fakeClient({ unserved: ['emulator/reload_rom'] });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.reloaded).toBe(false);
      expect(r.unservedMethods ?? []).toContain('emulator/reload_rom');
      // Discovering the gap after `emulator/pause` would leave a live machine
      // stopped, still running the old ROM, under a "Build succeeded" toast.
      expect(client.calls.filter((c) => c.startsWith('emulator/pause'))).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
