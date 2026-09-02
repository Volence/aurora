#!/usr/bin/env node
/**
 * VENDOR the s1disasm data this suite ASSERTS ON, at a named committed revision.
 *
 * ROADMAP row 78 phase 2. Phase 1 measured which of the 56 test files naming
 * `s1disasm` actually read the peer's bytes AND assert on them — 28 of them,
 * class A (`scripts/classify-peer-tree-reads.mjs`,
 * `docs/reviews/2026-09-02-row78-s1disasm-live-tree.md`). Those rows had their
 * colour decided by whatever another lane had typed into `../s1disasm` and not
 * committed. This script ends that by copying the data INTO this repo.
 *
 * WHY A PIN IS THE RIGHT ANSWER HERE, AND WHERE IT IS THE WRONG ONE.
 * -----------------------------------------------------------------
 * A class-A row asks *"does OUR code handle this document?"* — a property of
 * Aurora, for which a fixed document is not merely acceptable but correct: the
 * input must not move, or the row measures two things at once. Bar 19's
 * corollary (a) is then satisfiable outright — the rows pass with the peer
 * checkout UNREACHABLE, which no `git archive`-at-a-revision shape can do,
 * because that still needs the peer present.
 *
 * ⚠ `_incObj` IS DELIBERATELY NOT VENDORED, and it is 62% of the bytes. One
 * file reads it, for two rows, and those rows ask a CURRENCY question about the
 * peer's source — the load-bearing one is `s1-sync-anims.test.ts`'s *"no fifth
 * consumer hides in _incObj (the table is complete)"*. A vendored copy contains
 * exactly four consumers BY CONSTRUCTION, so that row would pass forever and
 * could never detect the fifth consumer it exists to catch: a vacuous gate in
 * its most convincing costume. Those rows read the peer at a COMMITTED revision
 * instead (`test/support/peer-repo.ts`), and skip loudly when they cannot.
 *
 * WHAT IS COPIED, AND FROM WHERE. Git OBJECTS, never the peer's working tree:
 * `git cat-file blob <sha>` for every path under the subtrees below at the
 * pinned revision. The peer's checkout is opened READ-ONLY and only through
 * `git -C`. Reading blobs rather than files also means no `.gitattributes`
 * filter, no line-ending conversion and no half-saved editor buffer can enter
 * the fixture: the bytes written here hash back to the object id recorded in
 * the provenance sidecar, and this script verifies that before it exits.
 *
 * USAGE
 *   node scripts/vendor-s1-fixtures.mjs [--rev <rev>] [--out <dir>] [--check]
 *
 *   --rev    revision in the peer repo to vendor from (default `origin/AS`,
 *            the peer's published branch — its `origin/HEAD`).
 *   --out    where to write (default `test/fixtures/s1disasm`).
 *   --check  write nothing; verify the existing tree against its sidecar.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { AURORA_DIR, requireSiblingPath } from '../test/support/sibling-root.mjs';

const PEER = 's1disasm';
const DEFAULT_REV = 'origin/AS';
const DEFAULT_OUT = 'test/fixtures/s1disasm';

/**
 * THE SUBTREES, AND WHERE THE LIST COMES FROM — measured attribution, not a
 * guess. `classify-peer-tree-reads.mjs --attribute` poisons ONE top-level peer
 * entry per run and records which rows move; these are exactly the entries that
 * moved a class-A row. `_incObj` moved rows too and is excluded on purpose (see
 * the header). Re-derive by re-running the instrument, never by reading the
 * tests.
 *
 * ⚠ ONE ENTRY IS HERE THAT NO POISON RUN COULD HAVE NAMED, and the reason is a
 * property of the instrument, not an oversight in it. Attribution uses the
 * `swap` poison, and phase 1 says in as many words that class C "is by
 * definition invariant under it" — so no attribution run could ever point at a
 * subtree only class-C/B rows read. `Utility Project Files/SonLVL INI Files` is
 * such a subtree: the S1 profile enumerates 18 animated-tile entries out of it
 * (`GHZ Flower Stalk.unc`, `Flowers at Ending.unc`, `Ending - Flowers.unc`,
 * `MZ Lava.bin`), and without it `s1-adapter`'s *"resolves 100% of profile
 * entries"* and `classicProjectStore`'s *"18 acts, all available"* — the two
 * rows `test/support/s1-checkout.ts` calls the LOUD ANCHOR — fail against the
 * pin. Measured 2026-09-02 by running the whole suite against a trial pin
 * without it: exactly those two rows went red, naming all 18 entries. 75 files,
 * 142 KB. The whole directory rather than the four files it needs today, so a
 * profile gaining a nineteenth entry does not silently need a hand edit here.
 */
const SUBTREES = [
  '_Constants.asm',
  '_anim',
  '_maps',
  'Utility Project Files/SonLVL INI Files',
  'artnem',
  'artunc',
  'collide',
  'levels',
  'map16',
  'map256',
  'objpos',
  'palette',
  'sonic.asm',
  'startpos',
];

/** Deliberately absent, with the reason carried into the sidecar. */
const NOT_VENDORED = {
  _incObj: 'A CURRENCY QUESTION CANNOT BE ANSWERED BY A PIN. The two rows that read '
    + 'this subtree (src/core/project/profiles/__tests__/s1-sync-anims.test.ts) ask whether '
    + "the peer's source still holds exactly four SynchroAnimate consumers. A vendored copy "
    + 'holds four by construction, so those rows would pass forever and could never detect a '
    + 'fifth. They read ../s1disasm at a committed revision instead, and skip loudly when they '
    + 'cannot. 136 files, 1.32 MB — also 62% of the bytes this pin would otherwise carry.',
};

function git(cwd, args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd, encoding, maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** `git hash-object`'s answer for these exact bytes, computed locally. */
function blobSha(buf) {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`, 'utf8'), buf]))
    .digest('hex');
}

/** Every blob under `SUBTREES` at `rev`, as `{ path, sha, size }`, sorted. */
function listBlobs(peer, rev) {
  const out = git(peer, ['ls-tree', '-r', '--long', '-z', rev, '--', ...SUBTREES]);
  const rows = [];
  for (const rec of out.split('\0')) {
    if (rec.length === 0) continue;
    // `<mode> SP <type> SP <sha> SP* <size> TAB <path>`
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).trim().split(/\s+/);
    const [mode, type, sha, size] = meta;
    if (type !== 'blob') {
      throw new Error(`${rec.slice(tab + 1)} is a ${type}, not a blob — this script only vendors blobs`);
    }
    if (mode === '120000') {
      throw new Error(`${rec.slice(tab + 1)} is a SYMLINK; vendoring it would copy the link text, not the data`);
    }
    rows.push({ path: rec.slice(tab + 1), sha, size: Number(size) });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return rows;
}

/** Every regular file actually on disk under `root`, repo-relative, sorted. */
function walk(root, rel = '', acc = []) {
  for (const name of readdirSync(join(root, rel))) {
    const r = rel === '' ? name : `${rel}/${name}`;
    const st = statSync(join(root, r));
    if (st.isDirectory()) walk(root, r, acc);
    else if (st.isFile()) acc.push(r);
  }
  return acc;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const checkOnly = argv.includes('--check');
  const rev = arg('--rev', DEFAULT_REV);
  const outRel = arg('--out', DEFAULT_OUT);
  const out = resolve(AURORA_DIR, outRel);
  const sidecar = join(out, '.provenance.json');

  const peer = requireSiblingPath(PEER);
  const commit = git(peer, ['rev-parse', '--verify', `${rev}^{commit}`]).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`${rev} did not resolve to a commit in ${peer}`);

  // ⚠ THE PIN MUST BE PUBLISHED. A revision that exists only in this machine's
  // clone looks perfect from here and is unresolvable from anywhere else, so a
  // peer could never re-derive or re-vendor this tree.
  const originHead = git(peer, ['rev-parse', '--verify', 'origin/HEAD']).trim();
  try {
    git(peer, ['merge-base', '--is-ancestor', commit, originHead]);
  } catch {
    throw new Error(
      `${rev} (${commit}) is NOT reachable from origin/HEAD (${originHead}) in ${peer} — `
      + 'it is local-only, and a pin nobody else can fetch is not a pin',
    );
  }

  const blobs = listBlobs(peer, rev);
  const bytes = blobs.reduce((n, b) => n + b.size, 0);
  process.stderr.write(`peer      ${peer}\n`);
  process.stderr.write(`revision  ${rev} -> ${commit}\n`);
  process.stderr.write(`subtrees  ${SUBTREES.join(' ')}\n`);
  process.stderr.write(`blobs     ${blobs.length} file(s), ${(bytes / 1048576).toFixed(3)} MB\n`);
  if (blobs.length === 0) throw new Error('the subtree list matched NOTHING — refusing to write an empty pin');

  if (checkOnly) {
    const prov = JSON.parse(readFileSync(sidecar, 'utf8'));
    const onDisk = walk(out).filter((p) => p !== '.provenance.json' && p !== '.gitattributes');
    const bad = [];
    for (const rel of onDisk) {
      const want = prov.files[rel];
      const got = blobSha(readFileSync(join(out, rel)));
      if (want === undefined) bad.push(`${rel}: on disk but NOT in the sidecar`);
      else if (want !== got) bad.push(`${rel}: sidecar ${want}, on disk ${got}`);
    }
    for (const rel of Object.keys(prov.files)) {
      if (!onDisk.includes(rel)) bad.push(`${rel}: in the sidecar but NOT on disk`);
    }
    process.stdout.write(bad.length === 0
      ? `OK — ${onDisk.length} vendored file(s) hash to the blob ids in ${relative(AURORA_DIR, sidecar)}\n`
      : `DRIFT — ${bad.length} problem(s):\n  ${bad.join('\n  ')}\n`);
    process.exitCode = bad.length === 0 ? 0 : 1;
    return;
  }

  // A fresh tree, so a file DELETED at the new revision cannot survive as a
  // stale fixture that nothing accounts for.
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const files = {};
  for (const b of blobs) {
    const body = git(peer, ['cat-file', 'blob', b.sha], 'buffer');
    const got = blobSha(body);
    // Anti-tautology: this is the peer's OWN object id, recomputed from the
    // bytes about to be written. A mismatch means the extraction mangled them.
    if (got !== b.sha) throw new Error(`${b.path}: wrote bytes hashing to ${got}, expected blob ${b.sha}`);
    const dest = join(out, b.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
    files[b.path] = b.sha;
  }

  // ⚠ `* -text`: nothing here may be line-ending normalised on `git add`. These
  // bytes ARE the pin; a normalising checkout would make every recorded blob id
  // wrong on a machine with `core.autocrlf` set, and the integrity row would
  // fail for a reason that has nothing to do with the data.
  writeFileSync(join(out, '.gitattributes'),
    '# The vendored bytes ARE the pin — never normalise them (see .provenance.json).\n* -text\n');

  const provenance = {
    what: 'Sonic 1 disassembly data VENDORED into this repo so the rows that assert on it '
      + 'are decided by this commit and not by another lane\'s working tree. ROADMAP row 78; '
      + 'docs/reviews/2026-09-02-row78-vendor.md.',
    s1disasm: {
      repo: git(peer, ['remote', 'get-url', 'origin']).trim(),
      branch_that_answers_currency: 'origin/AS',
      revision: commit,
      revision_named: rev,
      how_resolved: `git -C <s1disasm> rev-parse --verify ${rev}^{commit}, checked reachable from origin/HEAD`,
      subtrees: SUBTREES,
      not_vendored: NOT_VENDORED,
    },
    fixture: {
      files: blobs.length,
      bytes,
      extracted_via: 'git -C <s1disasm> cat-file blob <object id> — OBJECTS, never the working tree',
    },
    re_vendor: `node scripts/vendor-s1-fixtures.mjs --rev ${rev}`,
    verify: 'node scripts/vendor-s1-fixtures.mjs --check',
    // Per-file git blob ids. Recomputable from the bytes on disk with
    // sha1("blob <len>\0" + bytes), which is what the integrity row does — so
    // the comparison is against the PEER's object id, not against ourselves.
    files,
  };
  writeFileSync(sidecar, `${JSON.stringify(provenance, null, 2)}\n`);

  process.stdout.write(
    `vendored ${blobs.length} file(s), ${(bytes / 1048576).toFixed(3)} MB from ${PEER} ${commit}\n`
    + `  into ${relative(AURORA_DIR, out)}\n`
    + `  sidecar ${relative(AURORA_DIR, sidecar)}\n`,
  );

  // The peer must be exactly as it was found. Nothing above writes to it; this
  // proves it rather than asserting it.
  const dirty = git(peer, ['status', '--porcelain']).split('\n').filter((l) => l.length > 0);
  process.stderr.write(`peer after: HEAD ${git(peer, ['rev-parse', 'HEAD']).trim()}, `
    + `${dirty.length} porcelain entr(y/ies)\n`);
  if (!existsSync(join(out, 'sonic.asm'))) throw new Error('sonic.asm did not land — the tree is not a checkout');
}

main();
