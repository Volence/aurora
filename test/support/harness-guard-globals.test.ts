/**
 * O52 — THE SHARED GLOBAL FILES A HARNESS RUN MUST GIVE BACK.
 *
 * `lib/harness-guard.mjs` has snapshotted and restored `~/.aurora/mcp.json` and
 * `~/.sonic-level-editor/mcp.json` around every launch since O16. It did NOT
 * know about a third file with exactly the same shape:
 * `~/.config/<app>/recent-projects.json` — one ten-entry list, in no repo,
 * written by every harness that opens a project, cleaned by nobody.
 *
 * WHAT THAT COST, AND WHY THIS FILE IS A `npm test` ROW AND NOT ONLY A HARNESS
 * ROW. The O50 census's 89 runs unshifted 89 temp projects onto that list and
 * evicted all ten of the owner's own entries; they cannot be reconstructed. The
 * live half of the evidence is in `scratchpad/harness-guard-proof.mjs`, which
 * launches a real app — and which `npm test` does not run. A guard whose only
 * proof needs an Electron and an X server is a guard the suite cannot defend, so
 * the parts that are pure functions of the module are asserted here, where a
 * rename or a dropped list entry fails the suite.
 *
 * ⚠ EVERY ROW BELOW WORKS IN A `mkdtemp`. Nothing here reads, writes or deletes
 * a file under the real `$HOME` — a test for a guard against clobbering the
 * owner's data must not clobber the owner's data to prove it.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const GUARD = resolve(__dirname, '../../scratchpad/lib/harness-guard.mjs');
const PKG = resolve(__dirname, '../../package.json');
const RECENTS_SOURCE = resolve(__dirname, '../../src/main/recent-projects.ts');

interface Run { status: number; stdout: string; stderr: string }

/**
 * Evaluate `body` against the guard module in a child process with `HOME` and
 * `XDG_CONFIG_HOME` pointed at a throwaway directory, so the module's own
 * top-level path derivation runs — the thing under test — against a home the
 * row owns.
 */
function inFakeHome(home: string, body: string, env: Record<string, string> = {}): Run {
  const src = `import * as G from ${JSON.stringify(GUARD)};\n${body}\n`;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', src], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: resolve(home, '.config'), ...env },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: out.status ?? -1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

describe('harness-guard: the recent-projects list is a guarded global file', () => {
  /**
   * THE PATH IS THE ONE THE APP ACTUALLY WRITES, derived on both sides.
   *
   * The app writes `join(app.getPath('userData'), 'recent-projects.json')`, and
   * on Linux `userData` is `$XDG_CONFIG_HOME` + `app.getName()`. The BASENAME is
   * read out of `src/main/recent-projects.ts` rather than typed here, so
   * renaming the store in the app and not in the guard fails this row instead of
   * silently un-guarding the file.
   *
   * Two app names matter and each covers a different launcher: `Electron` is
   * every harness (`electron <root>/dist/main/index.mjs` — a FILE argument, so
   * no package.json at the app path and Electron's own default name), and the
   * repo's package.json `name` is `electron .`, which is how the owner runs it.
   */
  it('guards the file the app writes, for BOTH the harness and the owner app names', () => {
    const home = mkdtempSync(resolve(tmpdir(), 'aurora-guard-home-'));
    try {
      const basename = /join\(app\.getPath\('userData'\), '([^']+)'\)/.exec(readFileSync(RECENTS_SOURCE, 'utf8'))?.[1];
      expect(basename, 'the store filename must be readable out of the app source, not typed here')
        .toBe('recent-projects.json');
      const pkgName = (JSON.parse(readFileSync(PKG, 'utf8')) as { name: string }).name;

      const out = inFakeHome(home, 'process.stdout.write(JSON.stringify({ files: G.RECENT_PROJECT_FILES, names: G.APP_NAMES, all: G.GUARDED_GLOBAL_FILES }));');
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as { files: string[]; names: string[]; all: { f: string; kind: string }[] };

      expect(r.files).toContain(resolve(home, '.config/Electron', basename!));
      expect(r.files).toContain(resolve(home, `.config/${pkgName}`, basename!));
      expect(r.names, 'the owner-side name is read from package.json, not hardcoded').toContain(pkgName);
      // …and they are in the ONE list the snapshot iterates, not a parallel one.
      const recents = r.all.filter((e) => e.kind === 'recents').map((e) => e.f);
      expect(recents).toEqual(r.files);
      expect(r.all.filter((e) => e.kind === 'discovery').length,
        'the two mcp.json files must still be in the same list').toBe(2);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  /**
   * SNAPSHOT AND RESTORE, RED THEN GREEN, over the recents file specifically.
   *
   * The RED half is the row that matters: a run mutates the list, and with the
   * restore not called the mutation STANDS — which is what happened 89 times in
   * one night. The GREEN half then shows the same mutation put back byte for
   * byte. Asserting only the green half would pass against a restore that never
   * had anything to undo.
   */
  it('restores the list byte for byte after a run has appended to it', () => {
    const home = mkdtempSync(resolve(tmpdir(), 'aurora-guard-home-'));
    try {
      const dir = resolve(home, '.config/Electron');
      mkdirSync(dir, { recursive: true });
      const OWNER = JSON.stringify([{ path: '/home/owner/proj', name: 'His Project', lastOpened: 1 }], null, 2);
      writeFileSync(resolve(dir, 'recent-projects.json'), OWNER, 'utf8');

      const out = inFakeHome(home, `
        const file = ${JSON.stringify(resolve(dir, 'recent-projects.json'))};
        const fs = await import('node:fs');
        const snap = G.snapshotDiscovery();
        // What a run does to it: its own temp project unshifted onto the front.
        fs.writeFileSync(file, JSON.stringify([{ path: '/tmp/harness-XXXX', name: 'Sonic 4', lastOpened: 2 },
          ...JSON.parse(${JSON.stringify(OWNER)})], null, 2));
        const afterRun = fs.readFileSync(file, 'utf8');
        const done = G.restoreDiscovery(snap);
        const afterRestore = fs.readFileSync(file, 'utf8');
        process.stdout.write(JSON.stringify({ afterRun, afterRestore, done,
          described: G.describeDiscovery(snap) }));`);
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as { afterRun: string; afterRestore: string; done: string[]; described: string };

      expect(r.afterRun, 'RED: the run really did change the file').not.toBe(OWNER);
      expect(r.afterRun).toContain('/tmp/harness-XXXX');
      expect(r.afterRestore, 'GREEN: the owner\'s bytes are back, exactly').toBe(OWNER);
      expect(r.done.some((d) => d.includes('recent-projects.json'))).toBe(true);
      // The printed artifact says how many rows it holds. A recents file has no
      // pid, so the discovery file's liveness verdict would read as
      // "LIVENESS UNKNOWABLE" on every line and mean nothing.
      expect(r.described).toContain('1 recent entry');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  /**
   * A FILE THAT DID NOT EXIST BEFORE THE RUN IS DELETED, not left holding the
   * run's own rows. This is the common case on a fresh machine and it is the one
   * a "write the snapshot back" restore gets wrong: there are no bytes to write.
   */
  it('deletes a list the run itself created', () => {
    const home = mkdtempSync(resolve(tmpdir(), 'aurora-guard-home-'));
    try {
      const file = resolve(home, '.config/Electron/recent-projects.json');
      const out = inFakeHome(home, `
        const fs = await import('node:fs');
        const snap = G.snapshotDiscovery();
        fs.mkdirSync(${JSON.stringify(resolve(home, '.config/Electron'))}, { recursive: true });
        fs.writeFileSync(${JSON.stringify(file)}, '[{"path":"/tmp/harness","name":"x","lastOpened":1}]');
        const existedDuring = fs.existsSync(${JSON.stringify(file)});
        G.restoreDiscovery(snap);
        process.stdout.write(JSON.stringify({ existedDuring, existsAfter: fs.existsSync(${JSON.stringify(file)}) }));`);
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as { existedDuring: boolean; existsAfter: boolean };
      expect(r.existedDuring, 'anti-vacuous: the run really created it').toBe(true);
      expect(r.existsAfter, 'absent before the run means absent after it').toBe(false);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
