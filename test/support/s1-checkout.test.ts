/**
 * THE GUARD MODULE HAD NO TEST, AND THAT IS HOW IT CAME TO GUARD THE WRONG LIST.
 *
 * `test/support/s1-checkout.ts` is what every act-level row in this repository
 * asks "does this checkout hold what I read?". Before this file its correctness
 * was argued in its docblock and nothing executed the argument — the same shape
 * that let `sibling-root`'s predecessor ship a silently disagreeing second copy
 * (see `sibling-root.test.ts`'s header).
 *
 * WHAT IT WAS WRONG ABOUT, measured 2026-09-02 (O45,
 * `docs/reviews/2026-09-02-o45-partial-checkout-file-guards.md`). `whenS1Act`
 * derives an act's inputs by filtering `enumerateProfileEntries` on
 * `gating && zone && act`. The shared collision tables have NO owning act, so
 * they are `gating: false` — correctly, since `gating` means "makes THE OWNING
 * ACT unavailable" — and every such filter misses them. `read()` needs them for
 * all eighteen acts. A real s1disasm checkout missing only `collide/Angle
 * Map.bin` therefore failed 33 rows, EIGHT of them straight through a
 * `whenS1Act(...)` guard that had just answered, truthfully, about the wrong
 * list, on `required collision table 'collision.angleMap' did not resolve` —
 * a profile key naming no file, no tree and no variable.
 *
 * ⚠ THE ROWS BELOW TOUCH NO PEER CHECKOUT. Every fake tree is built from
 * `enumerateProfileEntries(s1Profile)` — the same enumeration the adapter
 * resolves — so they measure the real relationship between the guard and the
 * adapter on a machine with no disassembly at all, and they cannot go green by
 * naming a path that happens to be right here.
 *
 * ⚠ AND `S1_GLOBAL_REQUIRED_KEYS` IS MEASURED, NOT TRUSTED. The first block
 * drops each global entry in turn and records which ones make `read()` refuse
 * BY NAME; the measured set must equal the exported constant. So adding a
 * `global(...)` call in `buildPaths` without adding its key to the constant
 * reopens exactly the O45 gap and goes red here.
 */

import { describe, it, expect } from 'vitest';

import type { FileAccess } from '../../src/core/project/adapter';
import {
  s1Adapter, enumerateProfileEntries, S1_GLOBAL_REQUIRED_KEYS,
} from '../../src/core/project/s1';
import { s1Profile } from '../../src/core/project/profiles/s1';
import { s1ActRequiredFiles } from './s1-checkout';

const ENTRIES = enumerateProfileEntries(s1Profile);
const GLOBAL_ENTRIES = ENTRIES.filter((e) => e.zone === undefined);

/** A stand-in root, so a refusal's "which tree" half has something to name. */
const FAKE_ROOT = '/nonexistent/o45-fake-s1disasm';

/**
 * An in-memory FileAccess holding a file at EVERY profile entry's path, minus
 * the FILES the named entries point at. Built from the profile, never
 * hand-listed, so a profile change cannot leave it behind.
 *
 * ⚠ OMISSION IS BY PATH, NOT BY KEY, and the difference is not pedantry — the
 * first draft of this file omitted by key and the row went green for the wrong
 * reason. `artnem/8x8 - GHZ1.nem` is the path of `ghz.act1.tiles.0` AND of two
 * other acts' entries, so dropping one key left the file on the tree, the act
 * stayed available, and the refusal under test never fired: what came back was
 * `Nemesis input too short for a header` from decoding a zero-byte stand-in.
 * A checkout is missing FILES, so that is what this removes.
 */
function fakeCheckout(omitKeys: readonly string[]): FileAccess {
  const omitPaths = new Set(omitKeys.map((k) => pathOf(k)));
  const paths = new Set<string>(['sonic.asm']);
  for (const e of ENTRIES) if (!omitPaths.has(e.variant.path)) paths.add(e.variant.path);
  return {
    async exists(rel) { return paths.has(rel); },
    async read(rel) {
      if (!paths.has(rel)) throw new Error(`no such file: ${rel}`);
      return new Uint8Array(0);
    },
    async list(relDir) {
      const prefix = relDir === '' || relDir === '.' ? '' : `${relDir.replace(/\/?$/, '/')}`;
      const names = new Set<string>();
      for (const p of paths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },
    rootDir: FAKE_ROOT,
  };
}

/** `read()` GHZ act 1 through the adapter, returning the refusal text or null. */
async function refusalFor(omitKeys: readonly string[]): Promise<string | null> {
  const handle = await s1Adapter.open(fakeCheckout(omitKeys));
  const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
  try {
    await handle.levels!.read(ref);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The entry a key belongs to, so an expectation is derived rather than typed. */
function pathOf(key: string): string {
  const e = ENTRIES.find((x) => x.key === key);
  if (!e) throw new Error(`test bug: no profile entry '${key}'`);
  return e.variant.path;
}

describe('S1_GLOBAL_REQUIRED_KEYS is measured against read(), not asserted', () => {
  it('is exactly the set of GLOBAL entries whose absence makes read() refuse BY NAME', async () => {
    const measured: string[] = [];
    const evidence: Record<string, string> = {};
    for (const e of GLOBAL_ENTRIES) {
      const msg = await refusalFor([e.key]);
      evidence[e.key] = msg === null ? '(read succeeded — not required)' : msg;
      if (msg !== null && msg.includes(e.variant.path)) measured.push(e.key);
    }
    // PRINTS THE ARTIFACT IT JUDGES: every global entry and what read() did.
    // eslint-disable-next-line no-console
    console.log('[O45] global entry → read() refusal:\n'
      + Object.entries(evidence).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
    expect(GLOBAL_ENTRIES.length).toBeGreaterThan(0);
    expect(measured.sort()).toEqual([...S1_GLOBAL_REQUIRED_KEYS].sort());
  });
});

describe('the adapter refuses a missing input by NAME, never by profile key alone', () => {
  it.each([...S1_GLOBAL_REQUIRED_KEYS])(
    'a checkout missing %s: the refusal names the file, the entry and the tree',
    async (key) => {
      const msg = await refusalFor([key]);
      expect(msg, `read() did not refuse at all with '${key}' absent`).not.toBeNull();
      expect(msg).toContain(pathOf(key));   // WHICH FILE
      expect(msg).toContain(key);           // …and the key, for the report
      expect(msg).toContain(FAKE_ROOT);     // WHICH CHECKOUT
      expect(msg).toMatch(/INCOMPLETE/);    // and that this is a tree problem
    },
  );

  it('an ACT-scoped gating miss names the file too, not just ghz.act1.tiles.0', async () => {
    const key = 'ghz.act1.tiles.0';
    const msg = await refusalFor([key]);
    expect(msg).not.toBeNull();
    expect(msg).toContain(pathOf(key));
    expect(msg).toContain(FAKE_ROOT);
    expect(msg).toMatch(/INCOMPLETE/);
  });
});

describe('the act guard covers what read() needs, not only what gates the act', () => {
  it('s1ActRequiredFiles includes every globally required file', () => {
    const files = s1ActRequiredFiles('ghz', 1);
    // eslint-disable-next-line no-console
    console.log(`[O45] s1ActRequiredFiles('ghz',1) = ${files.length} file(s): ${files.join(', ')}`);
    for (const key of S1_GLOBAL_REQUIRED_KEYS) {
      expect(files, `the guard cannot see ${key} (${pathOf(key)})`).toContain(pathOf(key));
    }
  });

  it('still includes the act-scoped gating files it always covered', () => {
    const files = s1ActRequiredFiles('ghz', 1);
    const actGating = ENTRIES
      .filter((e) => e.gating && e.zone === 'ghz' && e.act === 1)
      .map((e) => e.variant.path);
    expect(actGating.length).toBeGreaterThan(0);
    for (const p of actGating) expect(files).toContain(p);
  });

  it('does not claim files of a DIFFERENT act', () => {
    const ghz1 = new Set(s1ActRequiredFiles('ghz', 1));
    const other = ENTRIES.filter((e) => e.gating && e.zone === 'ghz' && e.act === 2);
    expect(other.length).toBeGreaterThan(0);
    // Some paths are legitimately shared between acts; assert only that at
    // least one act-2-only file is absent, which is what "scoped" has to mean.
    const act2Only = other.map((e) => e.variant.path).filter((p) => !ghz1.has(p));
    expect(act2Only.length).toBeGreaterThan(0);
  });
});
