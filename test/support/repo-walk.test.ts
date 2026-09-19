/**
 * ROADMAP row 205 — A GATE IN THIS REPO WALKED OUT OF IT, AND ITS COLOUR
 * BECAME A FACT ABOUT HOW MUCH A PEER LANE HAD BUILT.
 *
 * `scratchpad/check-harness-guards.mjs` followed any symlink whose `statSync`
 * said "directory". `scratchpad/fixtures/aeon-build-pin/` carries four that
 * point at `sigil` and `skdisasm` and is gitignored, so it exists in the
 * owner's checkout and in no worktree: the gate passed everywhere it was
 * developed and died in the one tree that mattered, after a peer lane built
 * and with no commit on either side.
 *
 * ⚠ WHAT THESE ROWS ARE FOR, AND IT IS NOT THE HEAP. A ceiling, an `ELOOP`
 * skip, a depth cap or a timeout all make 181 GB stop hurting and leave the
 * verdict decided by somebody else's tree. So nothing below measures memory or
 * time. Every row asks the property that was actually lost: THE WALK DOES NOT
 * LEAVE THE REPOSITORY, AND SAYS SO WHEN IT DECLINES TO.
 *
 * ⚠ AND THE OPPOSITE FAILURE IS TESTED IN THE SAME FILE. A walk that protects
 * itself by shrinking its subject is the same defect pointing the other way,
 * so the in-repo-link row and the real-tree row below exist to fail when the
 * containment rule starts eating files this repo does carry.
 *
 * ⚠ NOTHING HERE TOUCHES A SIBLING REPO. Every "outside" tree is an
 * `mkdtemp` this file creates and removes. Walking a real peer checkout to
 * prove a fix about not walking real peer checkouts is the defect wearing the
 * proof's clothes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  walkContained, hasStandingOver, contains, OUT_OF_SCOPE_PREFIXES,
} from '../../scratchpad/lib/repo-walk.mjs';
import { clearCallSiteCensus } from '../../scratchpad/lib/harness-guard.mjs';

const SCRATCHPAD = resolve(__dirname, '../../scratchpad');
const REPO = resolve(__dirname, '../..');

/**
 * ONE FIXTURE CARRYING EVERY CLASS OF LINK, because the classes are only
 * meaningful against each other.
 *
 *   root/                      the repository stand-in
 *     subject/                 the directory a gate walks
 *       link-to-outside-dir    to a tree outside root        ESCAPE
 *       link-to-outside-file   to a file outside root        ESCAPE
 *       link-to-elsewhere      to root/elsewhere             FOLLOWED
 *       link-to-inside-dir     to subject/sub                already reachable
 *       sub/link-to-my-root    to subject                    loop
 *
 * The outside tree is deliberately NOT under root: that is the whole relation
 * under test, and it is an `mkdtemp`, never a sibling repo.
 */
let root: string;
let subject: string;
let outside: string;

beforeAll(() => {
  outside = mkdtempSync(join(tmpdir(), 'repo-walk-outside-'));
  mkdirSync(join(outside, 'target', 'deep'), { recursive: true });
  writeFileSync(join(outside, 'target', 'deep', 'peer.mjs'), 'export const fromAnotherRepo = true;\n');
  writeFileSync(join(outside, 'loose.mjs'), 'export const alsoOutside = true;\n');

  root = mkdtempSync(join(tmpdir(), 'repo-walk-root-'));
  mkdirSync(join(root, 'elsewhere'), { recursive: true });
  writeFileSync(join(root, 'elsewhere', 'sibling.mjs'), 'export const elsewhereInTheRepo = true;\n');

  subject = join(root, 'subject');
  mkdirSync(join(subject, 'sub'), { recursive: true });
  writeFileSync(join(subject, 'mine.mjs'), 'export const inside = true;\n');
  writeFileSync(join(subject, 'sub', 'nested.mjs'), 'export const alsoInside = true;\n');
  writeFileSync(join(subject, 'notes.md'), 'not a source file\n');
  symlinkSync(outside, join(subject, 'link-to-outside-dir'));
  symlinkSync(join(outside, 'loose.mjs'), join(subject, 'link-to-outside-file.mjs'));
  symlinkSync(join(root, 'elsewhere'), join(subject, 'link-to-elsewhere'));
  symlinkSync(join(subject, 'sub'), join(subject, 'link-to-inside-dir'));
  symlinkSync(subject, join(subject, 'sub', 'link-to-my-root'));
});

afterAll(() => {
  rmSync(outside, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

const walk = () => walkContained(subject, ['.mjs'], { root });
const rels = (paths: string[]) => paths.map((p) => p.slice(subject.length + 1)).sort();

describe('walkContained: the walk does not leave its root', () => {
  /**
   * ⚠ THE ANTI-VACUOUS HALF COMES FIRST AND IS NOT DECORATION. "The outside
   * file is absent from the population" is also true of a walker that found
   * nothing, of a fixture that was never built, and of a link that points at
   * nothing. This row reads the outside file THROUGH the link before claiming
   * anything about the walk refusing to, and checks that the walk did find the
   * files it is supposed to find.
   */
  it('does not collect a file that lives behind a link out of the root', () => {
    const throughTheLink = join(subject, 'link-to-outside-dir', 'target', 'deep', 'peer.mjs');
    expect(readFileSync(throughTheLink, 'utf8'),
      'the escape route really is open: this file is readable through the link').toContain('fromAnotherRepo');

    const found = rels(walk().files);
    expect(found, 'the positive control: files this tree does own are still collected')
      .toContain('mine.mjs');
    expect(found.some((f) => f.includes('peer.mjs')),
      'peer.mjs lives outside the root and must not be in the population').toBe(false);
  });

  it('does not collect a FILE symlink whose target is outside the root', () => {
    // A link to a file is the same escape as a link to a directory: it would be
    // read, and its contents would decide a verdict about this tree.
    expect(readFileSync(join(subject, 'link-to-outside-file.mjs'), 'utf8')).toContain('alsoOutside');
    expect(rels(walk().files)).not.toContain('link-to-outside-file.mjs');
  });

  it('REPORTS every escape instead of skipping it quietly', () => {
    const { escaped } = walk();
    const links = escaped.map((e) => e.link.slice(subject.length + 1)).sort();
    expect(links).toEqual(['link-to-outside-dir', 'link-to-outside-file.mjs']);
    for (const e of escaped) {
      expect(e.target, 'the report names where the link went, not just that one existed')
        .toContain(outside);
    }
  });

  /**
   * THE OTHER DIRECTION, and the reason the rule is containment rather than
   * "follow no symlinks". A link inside the root resolves to a file this tree
   * carries; refusing it would shrink the gate's subject to protect its walk.
   */
  it('DOES follow a link that leaves the walked directory but stays in the root', () => {
    // The reason the rule is containment and not "follow no symlinks": that
    // file is in this repository, nothing else in the walk reaches it, and a
    // walk that refused it would be shrinking its subject to protect itself.
    expect(rels(walk().files)).toContain(join('link-to-elsewhere', 'sibling.mjs'));
  });

  it('prefers the real path when a directory is reachable two ways', () => {
    // `readdir` sorts `link-to-inside-dir` ahead of `sub`, so a walk that took
    // whichever name came first would answer with the link. The population has
    // to be a fact about the tree, not about the alphabet.
    const found = rels(walk().files);
    expect(found).toContain(join('sub', 'nested.mjs'));
    expect(found).not.toContain(join('link-to-inside-dir', 'nested.mjs'));
  });

  it('terminates on a link back to an ancestor, and says it found one', () => {
    const { files, revisited } = walk();
    // Without the guard this walk never returns, so arriving here at all is
    // half the assertion. The other half: the loop is named, not swallowed.
    const links = revisited.map((e) => e.link.slice(subject.length + 1)).sort();
    expect(links).toEqual(['link-to-inside-dir', join('sub', 'link-to-my-root')]);
    const counted = rels(files).filter((f) => f.endsWith('mine.mjs'));
    expect(counted, 'and the files behind it are counted once, not once per arrival')
      .toEqual(['mine.mjs']);
  });

  it('reports an unresolvable link with its errno rather than dropping it', () => {
    const d = mkdtempSync(join(tmpdir(), 'repo-walk-eloop-'));
    try {
      symlinkSync(join(d, 'self'), join(d, 'self'));
      const { unreadable, files } = walkContained(d, ['.mjs'], { root: d });
      expect(files).toEqual([]);
      expect(unreadable.map((u) => u.code), 'a self referential link is ELOOP, and it is a fact to report')
        .toEqual(['ELOOP']);
      expect(unreadable[0].path).toContain('self');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('refuses to walk at all without an explicit root', () => {
    // @ts-expect-error the whole point is that the option is not optional
    expect(() => walkContained(subject, ['.mjs'], {})).toThrow(/explicit root/);
  });
});

describe('hasStandingOver: which escapes are this repo\'s problem', () => {
  it('excuses the vendored-copy prefix and nothing that merely starts like it', () => {
    expect(OUT_OF_SCOPE_PREFIXES, 'the exemption is a list, so the row below is about all of it')
      .toEqual(['fixtures/']);
    expect(hasStandingOver('fixtures/aeon-build-pin/.worktrees/sigil')).toBe(false);
    expect(hasStandingOver('fixtures')).toBe(false);
    // ⚠ THE END CONDITION, which a `startsWith` written one character short
    // gets wrong: a sibling whose name begins with the prefix is NOT excused.
    expect(hasStandingOver('fixtures-of-my-own/link')).toBe(true);
    expect(hasStandingOver('handover/link')).toBe(true);
  });
});

describe('contains: the boundary test itself', () => {
  it('accepts the root and what is under it, and rejects a sibling with the same opening', () => {
    expect(contains('/a/b', '/a/b')).toBe(true);
    expect(contains('/a/b', '/a/b/c')).toBe(true);
    expect(contains('/a/b', '/a/bc')).toBe(false);
    expect(contains('/a/b', '/a')).toBe(false);
  });
});

describe('clearCallSiteCensus: a census of THIS directory', () => {
  /**
   * The census walked with `readdirSync(dir, { recursive: true })`, and that
   * follows directory symlinks on node v24. So row 205's defect was in two
   * walkers, and this one fed a sentence that said "under <dir>" while
   * counting somebody else's tree.
   */
  it('counts what is under its directory and not what a link leads to', () => {
    const d = mkdtempSync(join(tmpdir(), 'census-subject-'));
    const away = mkdtempSync(join(tmpdir(), 'census-outside-'));
    try {
      writeFileSync(join(d, 'mine.mjs'), 'localStorage.clear();\n');
      writeFileSync(join(away, 'theirs.mjs'), 'localStorage.clear();\nlocalStorage.clear();\n');
      // Anti-vacuous: the outside tree really does hold call sites, counted by
      // this same function when it is the subject.
      expect(clearCallSiteCensus(away).sites).toBe(2);
      symlinkSync(away, join(d, 'link'));

      const c = clearCallSiteCensus(d);
      expect(c.sites, 'one call site is in this directory; two are not').toBe(1);
      expect(c.files).toBe(1);
      expect(c.declined, 'and the link it refused is counted, never dropped').toBe(1);
    } finally {
      rmSync(d, { recursive: true, force: true });
      rmSync(away, { recursive: true, force: true });
    }
  });

  it('still reports UNREADABLE rather than zero for a directory that is not there', () => {
    const c = clearCallSiteCensus('/definitely/not/here');
    expect(c.sites).toBeNull();
    expect(c.why).toContain('could not be read');
  });
});

describe('the real tree: the subject is not shrunk, and the gate reports its walk', () => {
  /**
   * ⚠ THE ROW THAT FAILS IF THE FIX STARTS EATING THIS REPO'S OWN FILES. The
   * expectations are DERIVED from the tree, not typed: this file is found by
   * the walk it is a test of, and so is the gate the walk was written for.
   */
  it('finds this repo\'s own scratchpad population, including known members', () => {
    const w = walkContained(SCRATCHPAD, ['.mjs', '.sh'], { root: REPO });
    expect(w.files.length, 'a population this small would mean the walk stopped early')
      .toBeGreaterThan(50);
    expect(w.files, 'the gate this rule was written for').toContain(join(SCRATCHPAD, 'check-harness-guards.mjs'));
    expect(w.files, 'and the module holding the rule').toContain(join(SCRATCHPAD, 'lib', 'repo-walk.mjs'));
    for (const f of w.files) {
      expect(contains(REPO, f), `${f} is outside this repository`).toBe(true);
    }
  });

  /**
   * ⚠ THE BOUND ON THIS ROW, STATED: it proves the gate RENDERS a walk census,
   * which is what makes an exclusion visible to a person. It does NOT prove
   * containment under an escape; that is what the fixture rows above are for,
   * and planting a symlink inside this repo's own scratchpad/ while the suite
   * is running is not a trade this file will make.
   */
  it('the gate prints what its walk declined, on every run', () => {
    const run = spawnSync(process.execPath, [join(SCRATCHPAD, 'check-harness-guards.mjs')],
      { encoding: 'utf8', cwd: REPO });
    const line = (run.stdout ?? '').split('\n').find((l) => l.startsWith('WALK '));
    expect(line, `the gate printed no walk census; stderr was: ${run.stderr}`).toBeTruthy();
    expect(line).toMatch(/\d+ file\(s\) under/);
    expect(line, 'the census names every class it declined, including the zeroes')
      .toMatch(/escaping symlink\(s\).*already-walked.*unreadable/);
  });
});
