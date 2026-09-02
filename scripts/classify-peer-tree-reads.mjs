#!/usr/bin/env node
/**
 * WHICH ROWS ARE DECIDED BY A PEER LANE'S UNCOMMITTED EDITS — measured, not read.
 *
 * ROADMAP row 78 / `docs/OVERSEER.md` bar 19. On this machine every sibling repo
 * is another lane's LIVE checkout, so a test that opens one has its colour
 * decided by whatever that peer has typed and not committed. This instrument
 * answers, for every test file that names `s1disasm`, WHICH of three things it
 * actually does — and it answers by EXPERIMENT, because every cheaper method
 * available here reports a false zero:
 *
 *   · grepping for `readFileSync` finds the call, not the ASSERTION, and bar 19's
 *     corollary (b) is precisely that a read which merely LOOKS routed is the
 *     failure mode;
 *   · monkeypatching `fs` does not work at all under vitest. Measured 2026-09-02:
 *     a setup file that replaced `fs.readFileSync` saw `NAMED_SEEN=0` from a test
 *     doing `import { readFileSync } from 'node:fs'` — Node's ESM facade snapshots
 *     the named export, so the patch catches only `fs.readFileSync` property
 *     calls, which is not how this tree is written. A tracer built that way would
 *     have printed a confident, empty class A.
 *   · `strace` is not installed on this machine.
 *
 * SO THE INSTRUMENT PERTURBS THE INPUT AND WATCHES THE COLOUR. It never touches
 * the peer checkout: it makes its own copies and points `S1DISASM_DIR` at them.
 *
 *   base    a plain copy of the peer's working tree. THE CONTROL.
 *   canary  base, with the peer's currently-MODIFIED files reset to their
 *           committed content. A row that moves here is decidable RIGHT NOW by
 *           another lane's uncommitted work — the live canary.
 *   swap    base, with every file's content replaced by that of another file
 *           with the SAME EXTENSION. A REALISTIC poison: every path still
 *           exists, every file is still a valid file of its format, and only the
 *           data is wrong. This is what an ordinary peer edit looks like — the
 *           two canary files are themselves a same-format content change that
 *           also changed length (235→512, 1147→2931 bytes).
 *   scram   base, with every file's content replaced by same-length deterministic
 *           noise. A DESTRUCTIVE poison. Deliberately SECOND, not first: a total
 *           break names itself, so it finds the least (memory: "poison must
 *           resemble reality"). It exists only to separate "reads bytes and
 *           asserts on them" from "reads bytes and only requires them to parse".
 *   empty   `S1DISASM_DIR` at an EMPTY directory — the recipe the suite-paths
 *           contract mandates, since a variable naming an ABSENT directory is a
 *           hard error by design rather than a skip.
 *   canary+ base, with the peer's two modified files given EACH OTHER's content.
 *           THE POSITIVE CONTROL ON THE CANARY CHANNEL, and it is not optional.
 *           `canary` came back empty on the first run; an empty differential is
 *           indistinguishable from a differential that was never applied, so this
 *           run confines a change KNOWN to be same-format and realistic to
 *           exactly those two paths. If `canary+` also moves nothing, the zero is
 *           a property of the files; if it moves rows, the zero is a property of
 *           the peer's particular edits — two different findings, and without
 *           this run neither can be claimed.
 *
 * THE CLASSES, defined by what the experiment can actually see:
 *
 *   A  moves under `swap`  — READS PEER BYTES AND ASSERTS ON THEM. The exposure.
 *   C  moves under `scram` but not `swap` — reads bytes, but only needs them to
 *      parse. Weakly exposed: a realistic peer edit does not move it, a corrupt
 *      one does.
 *   B  moves under `empty` only — resolves the path, reads no content that any
 *      assertion depends on (existence checks, skip guards, path-shape rows).
 *   D  moves under none of them — names `s1disasm` without depending on it at
 *      all (comments, helper modules, rows whose fixtures are already vendored).
 *
 * ⚠ WHAT B CANNOT DISTINGUISH, said plainly rather than papered over. A row that
 * reads bytes and asserts something true of ALL bytes (`buffer.length > 0`) is
 * invariant under both poisons and lands in B. B therefore means "no observable
 * content dependence", not "provably opens no file". That is the honest reading
 * of what a differential can see, and it is the operationally useful one: a row
 * no input change can move is not a row a peer's edit decides.
 *
 * ⚠ A CONTROL RUN IS MANDATORY AND IS RUN. `base` is executed TWICE and the two
 * result sets must be identical; a suite with a nondeterministic row would make
 * every delta below unreadable, and "the difference is real" is exactly the claim
 * a second baseline is owed (memory: "before/after numbers launder").
 *
 * USAGE
 *   node scripts/classify-peer-tree-reads.mjs [--out <dir>] [--keep]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';

import { AURORA_DIR, requireSiblingPath } from '../test/support/sibling-root.mjs';

const PEER = 's1disasm';

/** Files under `src/` and `test/` that name the peer at all — the population. */
function population() {
  const out = execFileSync('git', ['grep', '-l', '-E', 's1disasm|S1DISASM_DIR', '--', 'src', 'test'], {
    cwd: AURORA_DIR, encoding: 'utf8',
  });
  return out.split('\n').filter((l) => l.length > 0).sort();
}

/** The test files among them — the rows that can carry a colour. */
function testPopulation() {
  return population().filter((p) => /\.test\.tsx?$/.test(p));
}

// ── the sandboxes ──────────────────────────────────────────────────────────────

/**
 * Every regular file in a tree, repo-relative.
 *
 * `.git` is excluded from the copy entirely: nothing under test reads it, it is
 * a third of the tree's bytes, and copying a peer's object store four times to
 * mutate it is a hazard with no upside.
 */
function walk(root, rel = '', acc = []) {
  for (const name of readdirSync(join(root, rel))) {
    if (rel === '' && name === '.git') continue;
    const r = rel === '' ? name : `${rel}/${name}`;
    const st = statSync(join(root, r));
    if (st.isDirectory()) walk(root, r, acc);
    else if (st.isFile()) acc.push(r);
  }
  return acc;
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  execFileSync('cp', ['-a', `${from}/.`, to]);
}

/**
 * Replace a file's content WITHOUT writing through a hardlink.
 *
 * `cp -a` here makes real copies, but unlinking first is kept as the invariant so
 * that no future speed-up (`cp -al`) can quietly turn a mutation of a sandbox
 * into a mutation of the peer's own inodes.
 */
function replace(path, content) {
  unlinkSync(path);
  writeFileSync(path, content);
}

/** Deterministic same-length noise. Seeded per path so a rerun reproduces it. */
function noise(path, length) {
  const out = Buffer.alloc(length);
  let h = createHash('sha256').update(path).digest();
  for (let i = 0; i < length; i += 32) {
    h.copy(out, i, 0, Math.min(32, length - i));
    h = createHash('sha256').update(h).digest();
  }
  return out;
}

/**
 * `swap`: rotate content within each extension group.
 *
 * `only` restricts the perturbation to files under one top-level entry, which is
 * how ATTRIBUTION is measured: a row that moves when — and only when — `artnem/`
 * is poisoned is a row that reads `artnem/`. The rotation still draws its
 * replacement content from the WHOLE tree, so a subtree with one file per
 * extension is still perturbable.
 *
 * Returns the groups of size 1, which CANNOT be swapped and are therefore the
 * instrument's own blind spot — printed rather than silently absent, because an
 * unswappable file makes any row reading only that file look like class B.
 */
function buildSwap(root, only = null) {
  const files = walk(root);
  const groups = new Map();
  for (const f of files) {
    const k = extname(f).toLowerCase() || '(none)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const unswappable = [];
  for (const [ext, list] of groups) {
    if (list.length < 2) {
      unswappable.push(...list.map((f) => ({ ext, file: f })));
      continue;
    }
    list.sort();
    const contents = list.map((f) => readFileSync(join(root, f)));
    for (let i = 0; i < list.length; i += 1) {
      if (only !== null && !(list[i] === only || list[i].startsWith(`${only}/`))) continue;
      replace(join(root, list[i]), contents[(i + 1) % list.length]);
    }
  }
  return unswappable;
}

/** The top-level entries of the peer tree that hold at least one file. */
function topLevelEntries(root) {
  return [...new Set(walk(root).map((f) => f.split('/')[0]))].sort();
}

function buildScram(root) {
  for (const f of walk(root)) {
    const p = join(root, f);
    replace(p, noise(f, statSync(p).size));
  }
}

// ── running the suite ──────────────────────────────────────────────────────────

/**
 * One suite run against one tree. Returns `Map<rowId, status>`.
 *
 * `--reporter=json` deliberately replaces the configured reporters: this needs a
 * machine-readable result per row, and the skip-report reporter's own failure
 * mode (it FAILS a run whose skip has no reason) would otherwise be reported here
 * as a peer-content effect.
 */
function runSuite(label, s1dir, outDir) {
  const outFile = join(outDir, `${label}.json`);
  const started = Date.now();
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${outFile}`], {
      cwd: AURORA_DIR,
      env: { ...process.env, S1DISASM_DIR: s1dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    // A non-zero exit is an ORDINARY outcome here — the poisons are meant to turn
    // rows red. The report file is what carries the result, not the exit code.
  }
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  if (!existsSync(outFile)) {
    throw new Error(`run ${label} produced no report at ${outFile} — it did not get far enough to write one`);
  }
  const report = JSON.parse(readFileSync(outFile, 'utf8'));
  const rows = new Map();
  for (const file of report.testResults ?? []) {
    const rel = relative(AURORA_DIR, file.name);
    if ((file.assertionResults ?? []).length === 0) {
      // A file that threw during collection reports no rows at all. That is a
      // real, and severe, colour change; it must not read as "unchanged".
      rows.set(`${rel} :: <WHOLE FILE — no rows collected>`, file.status ?? 'failed');
      continue;
    }
    for (const a of file.assertionResults) {
      rows.set(`${rel} :: ${[...(a.ancestorTitles ?? []), a.title].join(' > ')}`, a.status);
    }
  }
  process.stderr.write(`  ${label}: ${rows.size} rows in ${wall}s\n`);
  return rows;
}

/** Which rows differ between two runs, as `file -> [row, from, to][]`. */
function movedFiles(baseRows, otherRows) {
  const byFile = new Map();
  const keys = new Set([...baseRows.keys(), ...otherRows.keys()]);
  for (const k of keys) {
    const from = baseRows.get(k) ?? '<absent>';
    const to = otherRows.get(k) ?? '<absent>';
    if (from === to) continue;
    const file = k.split(' :: ')[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push([k, from, to]);
  }
  return byFile;
}

// ── main ───────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const keep = argv.includes('--keep');
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]) : mkdtempSync(join(tmpdir(), 'row78-out-'));
  mkdirSync(outDir, { recursive: true });

  const peer = requireSiblingPath(PEER);
  process.stderr.write(`peer   ${peer}\n`);
  process.stderr.write(`out    ${outDir}\n`);

  const peerHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: peer, encoding: 'utf8' }).trim();
  const peerDirty = execFileSync('git', ['status', '--porcelain'], { cwd: peer, encoding: 'utf8' })
    .split('\n').filter((l) => l.length > 0);
  const modified = peerDirty
    .filter((l) => l.startsWith(' M') || l.startsWith('M '))
    .map((l) => l.slice(3).replace(/^"|"$/g, ''));

  const sandbox = mkdtempSync(join(tmpdir(), 'row78-trees-'));
  const T = (n) => join(sandbox, n);

  process.stderr.write('building sandboxes (the peer checkout is READ ONLY throughout)\n');
  copyTree(peer, T('base'));
  copyTree(T('base'), T('canary'));
  copyTree(T('base'), T('canary-plus'));
  copyTree(T('base'), T('swap'));
  copyTree(T('base'), T('scram'));
  mkdirSync(T('empty'), { recursive: true });

  // `canary`: the peer's modified files put BACK to their committed content.
  const canaryProof = [];
  for (const rel of modified) {
    const live = readFileSync(join(T('base'), rel));
    const committed = execFileSync('git', ['show', `${peerHead}:${rel}`], {
      cwd: peer, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024,
    });
    replace(join(T('canary'), rel), committed);
    canaryProof.push(
      `${rel}: live ${live.length}B sha1 ${createHash('sha1').update(live).digest('hex').slice(0, 12)}`
      + ` -> committed ${committed.length}B sha1 ${createHash('sha1').update(committed).digest('hex').slice(0, 12)}`
      + `  ${live.equals(committed) ? '*** IDENTICAL — THIS RUN PERTURBS NOTHING ***' : 'DIFFER'}`,
    );
  }
  // `canary-plus`: the same two paths, given each other's content. The positive
  // control — a change of the same shape, confined to the same two files.
  if (modified.length >= 2) {
    const bodies = modified.map((rel) => readFileSync(join(T('base'), rel)));
    for (let i = 0; i < modified.length; i += 1) {
      replace(join(T('canary-plus'), modified[i]), bodies[(i + 1) % modified.length]);
    }
  }
  const unswappable = buildSwap(T('swap'));
  buildScram(T('scram'));

  process.stderr.write('running\n');
  const base = runSuite('base', T('base'), outDir);
  const base2 = runSuite('base-control', T('base'), outDir);
  const canary = runSuite('canary', T('canary'), outDir);
  const canaryPlus = runSuite('canary-plus', T('canary-plus'), outDir);
  const swap = runSuite('swap', T('swap'), outDir);
  const scram = runSuite('scram', T('scram'), outDir);
  const empty = runSuite('empty', T('empty'), outDir);

  // ── the control ─────────────────────────────────────────────────────────────
  const drift = movedFiles(base, base2);
  const controlOk = drift.size === 0;

  const movedSwap = movedFiles(base, swap);
  const movedScram = movedFiles(base, scram);
  const movedEmpty = movedFiles(base, empty);
  const movedCanary = movedFiles(base, canary);
  const movedCanaryPlus = movedFiles(base, canaryPlus);

  // ── attribution: WHICH peer subtree does each class-A file actually read? ────
  // One extra run per top-level entry, each poisoning only that subtree.
  const attribution = new Map();
  if (argv.includes('--attribute')) {
    for (const entry of topLevelEntries(T('base'))) {
      const tree = T(`only-${entry.replace(/[^A-Za-z0-9._-]+/g, '_')}`);
      copyTree(T('base'), tree);
      buildSwap(tree, entry);
      const moved = movedFiles(base, runSuite(`only-${entry}`, tree, outDir));
      for (const f of moved.keys()) {
        if (!attribution.has(f)) attribution.set(f, []);
        attribution.get(f).push(`${entry} (${moved.get(f).length})`);
      }
      rmSync(tree, { recursive: true, force: true });
    }
  }

  const tests = testPopulation();
  const classOf = (f) => {
    if (movedSwap.has(f)) return 'A';
    if (movedScram.has(f)) return 'C';
    if (movedEmpty.has(f)) return 'B';
    return 'D';
  };

  const L = [];
  const p = (s = '') => L.push(s);

  p('='.repeat(100));
  p('ROW 78 — DO AURORA\'S TESTS READ s1disasm\'s LIVE WORKING TREE?');
  p('='.repeat(100));
  p(`peer checkout       ${peer}`);
  p(`peer HEAD           ${peerHead}`);
  p(`peer working tree   ${peerDirty.length} uncommitted entr(y/ies): ${peerDirty.join(' | ')}`);
  p(`modified & reverted for the canary run: ${modified.length ? modified.join(', ') : '(none)'}`);
  p(`population          ${population().length} file(s) under src/+test/ name the peer; ${tests.length} of them are test files`);
  p();
  p(`CONTROL (base run twice): ${controlOk ? 'IDENTICAL — deltas below are real'
    : `*** ${drift.size} FILE(S) DRIFTED BETWEEN TWO IDENTICAL RUNS — EVERY DELTA BELOW IS UNSAFE ***`}`);
  if (!controlOk) for (const [f, rows] of drift) p(`   ${f}: ${rows.length} row(s)`);
  p();
  p('CLASSES  A = moves under a REALISTIC same-format content swap (reads peer bytes AND asserts on them)');
  p('         C = moves only under DESTRUCTIVE noise (reads bytes; needs them to parse, asserts nothing that shifts)');
  p('         B = moves only when the tree is ABSENT (resolves the path; no observable content dependence)');
  p('         D = moves under none of the three (names the peer without depending on it)');
  p();

  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const f of tests) counts[classOf(f)] += 1;
  p(`COUNTS over the ${tests.length} test files:  A=${counts.A}   B=${counts.B}   C=${counts.C}   D=${counts.D}`);
  p();

  for (const cls of ['A', 'C', 'B', 'D']) {
    const list = tests.filter((f) => classOf(f) === cls);
    p('-'.repeat(100));
    p(`CLASS ${cls} — ${list.length} file(s)`);
    p('-'.repeat(100));
    for (const f of list) {
      const s = movedSwap.get(f)?.length ?? 0;
      const sc = movedScram.get(f)?.length ?? 0;
      const e = movedEmpty.get(f)?.length ?? 0;
      const c = movedCanary.get(f)?.length ?? 0;
      p(`  ${f}`);
      p(`      rows moved:  swap ${s}  scram ${sc}  absent ${e}  CANARY ${c}`);
      if (attribution.size > 0) {
        p(`      READS:       ${(attribution.get(f) ?? ['(nothing this instrument could attribute)']).join(', ')}`);
      }
      for (const [row, from, to] of (movedSwap.get(f) ?? []).slice(0, 3)) {
        p(`      e.g. ${from} -> ${to}   ${row.split(' :: ')[1]}`);
      }
    }
    p();
  }

  p('='.repeat(100));
  p('THE LIVE CANARY — rows decidable RIGHT NOW by the peer lane\'s uncommitted work');
  p('='.repeat(100));
  p('THE PERTURBATION WAS REAL — the bytes, before believing any zero:');
  for (const line of canaryProof) p(`  ${line}`);
  p();
  p(`Reverting ONLY ${modified.join(' and ')} to their committed content moved:`);
  if (movedCanary.size === 0) {
    p('  NOTHING — no row changed colour.');
  } else {
    for (const [f, rows] of movedCanary) {
      p(`  ${f} — ${rows.length} row(s)`);
      for (const [row, from, to] of rows) p(`      ${from} -> ${to}   ${row.split(' :: ')[1]}`);
    }
  }
  p();
  p('POSITIVE CONTROL ON THAT CHANNEL — the same two paths given EACH OTHER\'s content');
  p('(a same-format, size-changing edit of exactly the shape the peer actually made):');
  if (movedCanaryPlus.size === 0) {
    p('  NOTHING moved here either. So the zero above is a property of THESE TWO FILES — no row in');
    p('  this suite asserts on their content at all — rather than a differential that never ran.');
  } else {
    for (const [f, rows] of movedCanaryPlus) {
      p(`  ${f} — ${rows.length} row(s)`);
      for (const [row, from, to] of rows) p(`      ${from} -> ${to}   ${row.split(' :: ')[1]}`);
    }
    p('  So the canary channel DOES carry signal, and the zero above says only that the peer\'s');
    p('  PARTICULAR current edits happen not to move a row — not that these files are safe.');
  }
  p();
  p(`INSTRUMENT BLIND SPOT: ${unswappable.length} file(s) are the only file with their extension, so`);
  p('`swap` could not give them different content. A row reading only one of these can look like B.');
  for (const u of unswappable.slice(0, 20)) p(`   ${u.ext.padEnd(10)} ${u.file}`);
  if (unswappable.length > 20) p(`   … and ${unswappable.length - 20} more`);
  p();
  p(`reports: ${outDir}`);

  const text = `${L.join('\n')}\n`;
  process.stdout.write(text);
  writeFileSync(join(outDir, 'classification.txt'), text);

  if (!keep) rmSync(sandbox, { recursive: true, force: true });
  else process.stderr.write(`sandboxes kept at ${sandbox}\n`);

  // The peer must be exactly as it was found.
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: peer, encoding: 'utf8' })
    .split('\n').filter((l) => l.length > 0);
  const headAfter = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: peer, encoding: 'utf8' }).trim();
  if (after.join('\n') !== peerDirty.join('\n') || headAfter !== peerHead) {
    process.stderr.write('*** THE PEER CHECKOUT CHANGED DURING THIS RUN — the deltas above are not trustworthy ***\n');
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`peer unchanged: HEAD ${headAfter}, ${after.length} porcelain entr(y/ies)\n`);
  if (!controlOk) process.exitCode = 1;
}

main();
