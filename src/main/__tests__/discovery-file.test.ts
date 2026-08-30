import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DISCOVERY_DIRS, CLEANUP_SIGNALS, discoveryPathsIn, writeDiscoveryFiles,
  removeDiscoveryFiles, installDiscoveryExitNet,
} from '../discovery-file';

/**
 * O28 — the discovery file must not outlive the process it names.
 *
 * ⚠ WHAT THIS FILE CAN AND CANNOT PROVE, because the difference has cost this
 * repo a wrong answer before. These rows drive INJECTED seams: they prove the
 * net registers what it says it registers, cleans up once, re-raises, and
 * uninstalls. They do NOT prove that a real process, given a real SIGTERM,
 * leaves no file on disk — a fake `process.on` cannot establish that, and the
 * node suite cannot send a signal to itself without killing the runner.
 *
 * That property is proven by `npm run harness:discovery-exit-net`
 * (`scratchpad/discovery-exit-net-proof.mjs`), which spawns a real child,
 * SIGTERMs it, and reads the disk — including the RED control that reproduces
 * the pre-O28 bug and the SIGKILL row that states the limit no writer covers.
 */

function fakeSeams() {
  const listeners = new Map<string, Array<(...a: never[]) => void>>();
  const raised: string[] = [];
  return {
    listeners,
    raised,
    seams: {
      on: (e: string, f: (...a: never[]) => void) => {
        listeners.set(e, [...(listeners.get(e) ?? []), f]);
      },
      off: (e: string, f: (...a: never[]) => void) => {
        listeners.set(e, (listeners.get(e) ?? []).filter((x) => x !== f));
      },
      raise: (sig: NodeJS.Signals) => { raised.push(sig); },
    },
    fire: (e: string) => { for (const f of [...(listeners.get(e) ?? [])]) (f as () => void)(); },
    count: () => [...listeners.values()].reduce((n, a) => n + a.length, 0),
  };
}

describe('the discovery file is written and removed at the paths Aurora publishes', () => {
  it('publishes to both the current and the legacy path', () => {
    const home = mkdtempSync(join(tmpdir(), 'disc-'));
    const paths = discoveryPathsIn(home);
    expect(paths).toEqual(DISCOVERY_DIRS.map((d) => join(home, d, 'mcp.json')));
    const written = writeDiscoveryFiles(home, '{"port":1}');
    expect(written).toEqual(paths);
    expect(paths.every(existsSync)).toBe(true);
    expect(readFileSync(paths[0], 'utf8')).toBe('{"port":1}');
    removeDiscoveryFiles(paths);
    expect(paths.some(existsSync)).toBe(false);
    rmSync(home, { recursive: true, force: true });
  });

  it('reports a path it could not write instead of dropping it silently', () => {
    const home = mkdtempSync(join(tmpdir(), 'disc-'));
    // Make the first directory a FILE, so mkdirSync on it fails.
    mkdirSync(join(home, DISCOVERY_DIRS[0]), { recursive: true });
    rmSync(join(home, DISCOVERY_DIRS[0]), { recursive: true });
    writeFileSync(join(home, DISCOVERY_DIRS[0]), 'in the way');
    const logged: string[] = [];
    const written = writeDiscoveryFiles(home, '{}', (m) => logged.push(m));
    expect(written).toHaveLength(DISCOVERY_DIRS.length - 1);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(DISCOVERY_DIRS[0]);
    rmSync(home, { recursive: true, force: true });
  });

  it('removal is idempotent and never throws — it runs on exit paths', () => {
    const home = mkdtempSync(join(tmpdir(), 'disc-'));
    const paths = writeDiscoveryFiles(home, '{}');
    expect(() => { removeDiscoveryFiles(paths); removeDiscoveryFiles(paths); }).not.toThrow();
    expect(() => removeDiscoveryFiles(['/definitely/not/here/mcp.json'])).not.toThrow();
    rmSync(home, { recursive: true, force: true });
  });
});

describe('the abrupt-exit net', () => {
  /**
   * ONLY WITNESS FOR: coverage of the paths `will-quit` never sees. Before
   * O28 the ONLY removal was Electron's `will-quit`; a SIGTERM terminates node
   * without running it, which is how every harness run left a file naming a
   * dead pid. Asserted as a SET so adding a signal to `CLEANUP_SIGNALS`
   * without registering it fails here.
   */
  it('registers `exit` and every signal that would otherwise kill node outright', () => {
    const f = fakeSeams();
    installDiscoveryExitNet(() => {}, f.seams);
    expect([...f.listeners.keys()].sort()).toEqual(['exit', ...CLEANUP_SIGNALS].sort());
    expect(CLEANUP_SIGNALS).toContain('SIGTERM');   // the one a CDP harness sends
    expect(CLEANUP_SIGNALS).toContain('SIGINT');    // the one Ctrl-C sends
  });

  it('cleans up on `exit`', () => {
    const f = fakeSeams();
    let n = 0;
    installDiscoveryExitNet(() => { n++; }, f.seams);
    f.fire('exit');
    expect(n).toBe(1);
  });

  /**
   * ONLY WITNESS FOR: the re-raise. A handler that swallowed the signal would
   * pass every cleanup row above and leave the app immune to Ctrl-C — a worse
   * bug than the stale file it removes. So the row asserts BOTH that cleanup
   * ran and that the same signal went back out, and that the handler took
   * itself off first (or the re-raise lands on itself, forever).
   */
  it('cleans up, uninstalls itself, and RE-RAISES the same signal', () => {
    for (const sig of CLEANUP_SIGNALS) {
      const f = fakeSeams();
      let n = 0;
      installDiscoveryExitNet(() => { n++; }, f.seams);
      expect(f.count()).toBe(1 + CLEANUP_SIGNALS.length);
      f.fire(sig);
      expect(n).toBe(1);
      expect(f.raised).toEqual([sig]);
      // Every listener gone BEFORE the raise, so the default disposition gets it.
      expect(f.count()).toBe(0);
    }
  });

  it('cleans up exactly once however many paths fire', () => {
    const f = fakeSeams();
    let n = 0;
    installDiscoveryExitNet(() => { n++; }, f.seams);
    f.fire('SIGTERM');
    f.fire('exit');
    f.fire('SIGINT');
    expect(n).toBe(1);
  });

  /**
   * ONLY WITNESS FOR: the net being WIRED. Every row above drives the module
   * directly, and all of them stay green while `startMcpServer` never calls it
   * — a perfectly tested mechanism that nothing installs, which is the
   * "a check nobody runs" shape one layer down. `mcp-server.ts` imports
   * electron and cannot be constructed here, so this reads its source, the way
   * `band-preset-wording.test.ts` reads the panel's.
   *
   * ANTI-VACUOUS: the file is also asserted to contain the function whose body
   * is supposed to carry the call, so a moved/renamed/emptied source fails
   * loudly instead of matching nothing and passing.
   */
  it('startMcpServer actually INSTALLS the net, and stopMcpServer takes it back off', () => {
    const src = readFileSync(join(__dirname, '..', 'mcp-server.ts'), 'utf8');
    expect(src, 'mcp-server.ts no longer defines startMcpServer — this scan is measuring nothing')
      .toContain('export async function startMcpServer');
    expect(src).toContain('export function stopMcpServer');
    expect(src).toContain('installDiscoveryExitNet(');
    expect(src).toContain('removeDiscoveryFiles(');
    // and it publishes through the shared writer, so the paths cannot drift
    // apart from the ones this module removes.
    expect(src).toContain('writeDiscoveryFiles(');
  });

  it('the returned uninstaller removes every listener, so a restart cannot stack them', () => {
    const f = fakeSeams();
    const off = installDiscoveryExitNet(() => {}, f.seams);
    expect(f.count()).toBe(1 + CLEANUP_SIGNALS.length);
    off();
    expect(f.count()).toBe(0);
  });
});
