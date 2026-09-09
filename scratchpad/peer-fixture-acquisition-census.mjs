#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// HOW THIS REPO'S RUNS ACTUALLY OBTAIN A PEER FIXTURE -- counted, not assumed
// ═══════════════════════════════════════════════════════════════════════════
//
//     node scratchpad/peer-fixture-acquisition-census.mjs
//     node scratchpad/peer-fixture-acquisition-census.mjs --list worktree
//
// WHY IT EXISTS. Aurora's lens ledger row FIXTURE-REVISION-UNSTAMPED says no
// harness records which revision of a sibling repo it ran against. Answering
// that needed the POPULATION first, and the population was not a thing anyone
// had counted: the parcel brief guessed "fresh clones, mkdtemp copies, direct
// reads" and the tree turns out to have a different set. A number typed into a
// review from one afternoon's grep is exactly the count this repo has been
// burned by, so the count lives here where anyone can re-derive it.
//
// ⚠ WHAT THIS IS AND IS NOT. It is a census of MECHANISM: which files name a
// peer, and by what route they reach that peer's bytes. It is a REGEX over
// source with comments stripped, so it can be fooled, and it says nothing about
// whether a row's colour actually depends on those bytes. That second question
// already has a real instrument and it is a differential, not a grep:
// `scripts/classify-peer-tree-reads.mjs` perturbs the input and watches which
// rows move. Read that one for exposure; read this one for shape.
//
// ⚠ THE COUNTS MOVE. They are printed, never pinned in prose. Anything quoting
// a figure from here must say the date it re-ran this.

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

import { AURORA_DIR } from '../test/support/sibling-root.mjs';

/** The four trees this repo keeps executable code in. Same set the peer-path gate walks. */
const ROOTS = ['src', 'test', 'scripts', 'scratchpad'];
const EXTS = ['.mjs', '.mts', '.ts', '.tsx', '.js', '.py', '.sh'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage']);

/**
 * A file NAMES A PEER when it goes through the resolver or reads one of the
 * suite's checkout variables. Derived from the resolver's own vocabulary rather
 * than from a list of repo names, so a new peer is covered without an edit.
 */
const NAMES_PEER = /siblingPath|siblingDefaultPath|requireSiblingPath|checkoutOverride|sibling_path|peerRepo|[A-Z0-9]+_DIR\b|LIVE_AEON|AURORA_[A-Z0-9]+_REPO/;

/** Reaches the bytes through the OBJECT DATABASE: a revision names them. */
const VIA_OBJECTS = /\barchive\b|\bcat-file\b|'show'|"show"|show\s+\$\{|readAtRev|grepAtRev/;

/** Resolves a revision but does not read content with it. */
const VIA_REVPARSE = /rev-parse|resolveRev|isAncestor/;

/** Opens files. Coarse on purpose: see the header. */
const READS_BYTES = /readFileSync|readFile\(|read_text\(|readdirSync|cpSync|\bopen\(/;

/**
 * Already announces its fixture provenance through the shared helper.
 *
 * The CALL form, not the name: the helper itself, its type declaration, its
 * gate and this census all mention `announceFixture` and none of them is a
 * consumer. Counting mentions gave 5 stamped when 3 files call it, which is the
 * shape of over-count this census exists to avoid, so the helper's own files
 * are excluded by path as well.
 */
const STAMPED = /announceFixture\s*\(/;
const HELPER_OWN = /(^|\/)(fixture-provenance\.(mjs|d\.mts)|fixture-provenance\.test\.ts|peer-fixture-acquisition-census\.mjs)$/;

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.includes(extname(e.name))) out.push(p);
  }
  return out;
}

/** Comments removed, so a docblock explaining `git archive` is not counted as doing it. */
function codeOf(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|#)/.test(l))
    .join('\n');
}

const files = [];
for (const r of ROOTS) walk(join(AURORA_DIR, r), files);

const rows = [];
for (const f of files) {
  const rel = relative(AURORA_DIR, f);
  if (HELPER_OWN.test(rel)) continue;
  const code = codeOf(readFileSync(f, 'utf8'));
  if (!NAMES_PEER.test(code)) continue;
  rows.push({
    file: rel,
    objects: VIA_OBJECTS.test(code),
    revparse: VIA_REVPARSE.test(code),
    reads: READS_BYTES.test(code),
    stamped: STAMPED.test(code),
  });
}

/**
 * THE THREE MECHANISMS, and they are not equally exposed.
 *
 *   objects   the bytes came from the object database at a named revision, so a
 *             revision DOES identify them. Staleness here is a stale PIN, which
 *             is visible the moment the run says which pin.
 *   revparse  resolves a revision without reading content by it. Mostly the
 *             resolver, the currency gates and the path checkers.
 *   worktree  names a peer, reads bytes, and never goes through git. THE ROW'S
 *             POPULATION: nothing a revision names, so nothing to compare a
 *             later run against.
 */
const objects = rows.filter((r) => r.objects);
const revparse = rows.filter((r) => !r.objects && r.revparse);
const worktree = rows.filter((r) => !r.objects && !r.revparse && r.reads);
const namesOnly = rows.filter((r) => !r.objects && !r.revparse && !r.reads);

const groups = { objects, revparse, worktree, 'names-only': namesOnly };

const want = process.argv.includes('--list')
  ? process.argv[process.argv.indexOf('--list') + 1]
  : null;

if (want !== null) {
  const g = groups[want];
  if (g === undefined) {
    console.log(`no such group ${JSON.stringify(want)}; try ${Object.keys(groups).join(', ')}`);
    process.exit(2);
  }
  for (const r of g) console.log(`${r.stamped ? 'STAMPED  ' : '         '}${r.file}`);
  process.exit(0);
}

console.log(`peer-fixture acquisition census, ${new Date().toISOString()}`);
console.log(`  roots: ${ROOTS.join(', ')}   extensions: ${EXTS.join(' ')}`);
console.log(`  files naming a peer in CODE: ${rows.length}`);
for (const [name, g] of Object.entries(groups)) {
  console.log(`    ${name.padEnd(12)} ${String(g.length).padStart(4)}   stamped: ${g.filter((r) => r.stamped).length}`);
}
const sum = Object.values(groups).reduce((a, g) => a + g.length, 0);
// The groups must partition the population. A census whose parts do not sum to
// its whole is a false zero waiting to be quoted.
console.log(`  sum of groups: ${sum} (${sum === rows.length ? 'partitions the population' : 'DOES NOT PARTITION -- the classifier is wrong'})`);
console.log(`  stamped overall: ${rows.filter((r) => r.stamped).length}`);
if (sum !== rows.length) process.exit(1);
