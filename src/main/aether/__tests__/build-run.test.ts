import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../build-run';

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

function fakeClient(opts: { failOn?: string; romPath?: string } = {}) {
  const calls: string[] = [];
  return {
    calls,
    status: 'connected' as const,
    hasMethod: () => true,
    resolve: async () => 0,
    loadSymbols: async (path: string) => {
      calls.push(`load_symbols:${path}`);
      if (opts.failOn === 'load_symbols') throw new Error('listing does not bind to the loaded ROM');
      return {};
    },
    call: async (method: string, params?: Record<string, unknown>) => {
      calls.push(`${method}:${params?.path ?? ''}`);
      if (opts.failOn === method) throw new Error('reload refused');
      if (method === 'emulator/status') return { romPath: opts.romPath ?? '/engine/s4.bin' };
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

  it('does not force DEBUG when the emulator is on the release ROM', async () => {
    const dir = scriptDir('echo "DEBUG=[$DEBUG]"; exit 0');
    const client = fakeClient({ romPath: '/engine/s4.bin' });
    try {
      const r = await runBuild({ basePath: dir, client: client as never, env: {} });
      expect(r.debugBuild).toBe(false);
      expect(r.output.join('\n')).toContain('DEBUG=[]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('builds the configured flavour when nothing is connected', async () => {
    const dir = scriptDir('echo "DEBUG=[$DEBUG]"; exit 0');
    try {
      const r = await runBuild({ basePath: dir, client: null, env: {} });
      expect(r.output.join('\n')).toContain('DEBUG=[]');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
