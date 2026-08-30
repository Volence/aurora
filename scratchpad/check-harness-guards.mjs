#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// check-harness-guards — the forty-first harness must not have the hazard
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run check:harness-guards
//
// O16 gave every launcher in scratchpad/ the discovery-file and process-tree
// guards. That is a one-time fix and one-time fixes rot: the next harness
// somebody writes will be copied from whichever file they had open, and if that
// file predates this it will carry the hazard back in.
//
// So this is DERIVED, never a list. It enumerates scratchpad/ (and its lib/),
// classifies every .mjs by what it actually does, and fails if any launcher is
// missing a guard. Nothing here is hardcoded to a filename — adding a harness
// adds a row, and adding an unguarded harness turns this red.
//
// WHAT IT ENFORCES
//
//   G1  Every spawn that becomes an Aurora Electron goes through
//       `spawnGuarded` from lib/harness-guard.mjs. That call is what takes the
//       discovery snapshot before the app can overwrite it, registers the child
//       for the ownership rule, and installs the exit-handler net that kills the
//       tree and restores the files even when the harness throws.
//
//   G2  Nothing anywhere calls `pkill`. `pkill -f 'aurora/dist/main/inde[x].mjs'`
//       was in twenty-eight files and is not an ownership test: it matches the
//       OWNER'S Aurora, and from a worktree it does NOT match the harness's own
//       instance. It killed his editor and spared its own orphan.
//
//   G3  Nothing reads a discovery `mcp.json` by hand. Reading that file to find
//       "the app" can find HIS app; the read must go through
//       `resolveOwnedDiscovery`, which refuses any pid that is not descended
//       from something this harness spawned. lib/harness-guard.mjs is the one
//       place allowed to touch the paths, because it is the thing doing the
//       checking.
//
//   G4  The guard module itself still exports what the other three depend on.
//       Without this the whole check is vacuous the day someone renames an
//       export: every file would "import the guard" and none would be guarded.
//
// AND FOR SHELL SCRIPTS (O23) — five rules that are NOT G1 in a hat. See the
// long note above the shell pass for why widening the file set alone would
// have produced a check that scans `.sh` files and can only return green.
//
//   S1  A `.sh` must not start xvfb-run / Xvfb / electron itself, unless it
//       traps EXIT **and** INT **and** TERM.
//   S2  Every `.mjs` a `.sh` dispatches must be one this check classifies as
//       guarded. A shell script is a launcher by proxy. THIS IS THE RULE WITH
//       TEETH — it fires today.
//   S3  No `pkill` (G2, in shell).
//   S4  No hand-read of `mcp.json` (G3, in shell).
//   S5  A `.sh` that backgrounds a child must trap EXIT+INT+TERM.
//
// LOUD ON UNMEASURABLE. A file this cannot classify — unreadable, or a spawn
// whose arguments it cannot bracket — is reported UNMEASURABLE and FAILS the
// run. A checker that silently skips what it cannot understand is the same
// defect as a guard that asserts nothing: it goes green over the case it could
// not see.

import { readdirSync, readFileSync, statSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const GUARD_REL = './lib/harness-guard.mjs';
const GUARD_ABS = join(DIR, 'lib', 'harness-guard.mjs');

/** Exports the rest of scratchpad/ is entitled to rely on (G4). */
const REQUIRED_EXPORTS = [
  'spawnGuarded', 'killTree', 'killTreeSync', 'descendants', 'isDescendantOf',
  'snapshotDiscovery', 'restoreDiscovery', 'restoreDiscoveryNow', 'readDiscoveryNow', 'setDiscoveryBaseline',
  'resolveOwnedDiscovery', 'ownedRoots', 'DISCOVERY_FILES',
  // O20's reap. Listed here for the same reason as the rest: rename one of
  // these and killTree's `reap` branch becomes dead code, every launcher still
  // "imports the guard", and the X displays start leaking again silently.
  'displayArtifacts', 'reapDisplays', 'XVFB_TMPDIR_RE',
  // The two the reap's own gates are made of. `boundSocketPaths` must stay
  // exported because its NULL-means-unknown contract is what gate 0 reads, and
  // the proof asserts that contract directly; `NEVER_REAP_DISPLAYS` because a
  // row has to be able to show that no OTHER gate could have covered for it.
  'boundSocketPaths', 'NEVER_REAP_DISPLAYS',
];

// ── source scanning ────────────────────────────────────────────────────────

/**
 * Strip comments — always — and string BODIES only when asked.
 *
 * ⚠ THE FIRST VERSION OF THIS FUNCTION ALWAYS STRIPPED STRINGS, AND THAT MADE
 * TWO OF THE FOUR GUARDS VACUOUS. Caught by planting the violations rather than
 * by reading the code: `pkill` and `mcp.json` only ever appear INSIDE string
 * literals —
 *
 *     execSync(`pkill -f 'aurora/dist/main/inde[x].mjs' ...`)
 *     join(homedir(), '.aurora', 'mcp.json')
 *
 * — so blanking string bodies deleted the very tokens G2 and G3 exist to find.
 * The check went green over both planted defects. Comments must still go, or
 * the prose in this file's own header (which names all three hazards) would
 * flag every file that documents them.
 *
 * So: `keepStrings: true` for the token hunts (G2, G3), `false` for the
 * structural scan (G1), which needs to see call shapes and would otherwise trip
 * over an `xvfb-run` mentioned in a log line.
 */
function stripInert(src, { keepStrings = false } = {}) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { if (src[i] === '\n') break; i++; } continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; const start = i; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++;
      out += keepStrings ? src.slice(start, i) : '""';
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** The literal text of a call's arguments, `(` through its matching `)`.
 *  Returns null when it cannot bracket the call — which is UNMEASURABLE, not a
 *  pass. */
function callText(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}

/** Does this spawn become an Aurora Electron? The oracle emulator is spawned
 *  the same way and is NOT in scope: it never touches the discovery files. */
const looksLikeAurora = (t) =>
  !/ORACLE_SOCKET|oracle-aether|--socket/.test(t)
  && (/xvfb-run/.test(t) || /dist\/main\/index\.mjs/.test(t) || /\bELECTRON\b/.test(t)
      || /electron/i.test(t));

/** Entries this walk could not classify. NEVER silently dropped: an unreadable
 *  path is UNMEASURABLE, and a gate that cannot see a file must say so rather
 *  than report a clean count over the subset it managed to stat. Found the hard
 *  way -- scratchpad/fixtures/aeon-build-pin/aeon-current is a self-referential
 *  symlink (an untracked fixture, absent from a fresh worktree), and statSync
 *  threw ELOOP, so the gate CRASHED in the main tree while passing in every
 *  worktree it was developed in. */
export const unreadable = [];

function listFiles(dir, exts, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    let st;
    // lstat, not stat: a symlink is classified by the LINK, so a loop or a
    // dangling target is a fact about this entry rather than an exception.
    try { st = lstatSync(p); } catch (e) { unreadable.push(`${p} (${e.code})`); continue; }
    if (st.isSymbolicLink()) {
      // Follow it only far enough to know if it is a directory; a loop is not.
      try { if (statSync(p).isDirectory()) { if (name !== 'node_modules') listFiles(p, exts, acc); continue; } }
      catch (e) { unreadable.push(`${p} (${e.code})`); continue; }
    } else if (st.isDirectory()) { if (name !== 'node_modules') listFiles(p, exts, acc); continue; }
    if (exts.some((e) => name.endsWith(e))) acc.push(p);
  }
  return acc;
}

// ── the run ────────────────────────────────────────────────────────────────

const fails = [];
const unmeasurable = [];
const rows = [];
const exemptions = [];

// G4 first: if the module is wrong, everything below is meaningless.
let guardSrc = null;
try { guardSrc = readFileSync(GUARD_ABS, 'utf8'); }
catch (e) { unmeasurable.push(`lib/harness-guard.mjs unreadable: ${e.message}`); }
if (guardSrc) {
  const missing = REQUIRED_EXPORTS.filter((n) =>
    !new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${n}\\b`).test(guardSrc));
  if (missing.length) fails.push(`G4 lib/harness-guard.mjs no longer exports: ${missing.join(', ')}`);
  console.log(`G4  lib/harness-guard.mjs exports ${REQUIRED_EXPORTS.length - missing.length}/${REQUIRED_EXPORTS.length} required names`
    + `${missing.length ? ` — MISSING ${missing.join(', ')}` : ''}`);
}

/** basename -> kind, filled by the .mjs pass and read by the .sh pass (S2). */
const mjsKind = new Map();

for (const path of listFiles(DIR, ['.mjs'])) {
  const rel = relative(DIR, path);
  if (rel.startsWith('_o16')) continue;            // this parcel's own scaffolding
  const isGuardModule = path === GUARD_ABS;
  const isThisChecker = path === join(DIR, 'check-harness-guards.mjs');

  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (e) { unmeasurable.push(`${rel}: unreadable (${e.message})`); continue; }
  // COMMENTS STRIPPED, STRINGS KEPT — for every scan.
  //
  // ⚠ The first version blanked string bodies here too, and that put a hole
  // straight through G1. A launcher written as
  //
  //     spawn(`${ROOT}/node_modules/.bin/electron`, [`${ROOT}/dist/main/index.mjs`])
  //
  // becomes `spawn("", [""])` with strings blanked — no `xvfb-run`, no
  // `dist/main/index.mjs`, nothing to recognise — so four real Aurora launchers
  // (camera-, crash-, restore-, tool-split-harness) classified as "spawns
  // something else" and G1 would never have failed a bare `spawn` written that
  // way. The oracle EXCLUSION was equally dead for the same reason. Caught by
  // reading the per-file enumeration, not by the check going red.
  //
  // Bracketing a call whose strings are intact can fail on a literal paren
  // inside a string; that returns null and is reported UNMEASURABLE, which is
  // loud. Silently misclassifying is not.
  const tok = stripInert(raw, { keepStrings: true });
  const src = tok;

  // ── find every spawn-ish call ────────────────────────────────────────────
  const launches = [];        // Aurora launches: {guarded:boolean}
  let otherSpawns = 0;
  const re = /(?<![\w.$])(spawnGuarded|spawn|execFile|execFileSync)\s*\(/g;
  let m;
  let bracketFail = false;
  while ((m = re.exec(src))) {
    const t = callText(src, m.index + m[0].length - 1);
    if (t === null) { bracketFail = true; continue; }
    if (looksLikeAurora(t)) launches.push({ guarded: m[1] === 'spawnGuarded', where: m.index });
    else otherSpawns++;
  }
  if (bracketFail) { unmeasurable.push(`${rel}: a spawn call could not be bracketed — cannot classify it`); continue; }

  // `./lib/…` from scratchpad/, `../lib/…` from a subdirectory. Both are the
  // one module; nothing else may satisfy this.
  const importsGuard = /from '\.\.?\/lib\/harness-guard\.mjs'/.test(raw);
  const drivesShared = /from '\.\/canvas-cdp-harness\.mjs'/.test(raw);

  // ── G1 ───────────────────────────────────────────────────────────────────
  //
  // ONE declared exemption exists, and it must be DECLARED IN THE FILE and is
  // PRINTED on every run — an exemption nobody sees is a hole. harness-guard-
  // proof.mjs must launch the app the unguarded way, because the RED half of
  // its evidence IS the unguarded behaviour: a proof that killTree works, built
  // on a launch that could not orphan anything, would prove nothing.
  const exempt = !isThisChecker && /harness-guard:allow-raw-launch/.test(raw);
  if (exempt) exemptions.push(`${rel}: declares allow-raw-launch (${launches.length} raw launch(es))`);
  const unguarded = exempt ? [] : launches.filter((l) => !l.guarded);
  if (unguarded.length) {
    fails.push(`G1 ${rel}: ${unguarded.length} Aurora launch(es) still use bare spawn() — `
      + 'no discovery snapshot, no tree kill, no ownership registration');
  } else if (launches.length && !importsGuard) {
    fails.push(`G1 ${rel}: calls spawnGuarded but never imports ${GUARD_REL} — that is a ReferenceError, not a guard`);
  }

  // ── G2 ───────────────────────────────────────────────────────────────────
  if (!isThisChecker && /\bpkill\b/.test(tok)) {
    fails.push(`G2 ${rel}: calls pkill. A pattern match on a command line is not an ownership test — `
      + "it matches ANY Aurora whose argv carries the main tree's dist path -- another "
      + "agent's harness run (observed killing one three times, 2026-08-16), or a "
      + "production launch from the main tree -- while MISSING this run's own orphan, "
      + "whose worktree path does not match. Backwards in both directions.");
  }

  // ── G3 ───────────────────────────────────────────────────────────────────
  if (!isGuardModule && !isThisChecker && /mcp\.json/.test(tok)) {
    fails.push(`G3 ${rel}: names mcp.json directly. Reading the shared discovery file by hand is how a `
      + "harness finds the OWNER'S app; go through resolveOwnedDiscovery().");
  }

  const kind = isGuardModule ? 'the guard module itself'
    : isThisChecker ? 'this check (reads source; launches nothing)'
    : launches.length ? (unguarded.length ? 'LAUNCHER (UNGUARDED)' : 'LAUNCHER (guarded)')
    : drivesShared ? 'driver (guarded via canvas-cdp-harness)'
    : otherSpawns ? 'spawns something else (oracle emulator or a tool)'
    : 'no launch — not applicable';
  rows.push({ rel, kind, launches: launches.length, otherSpawns });
  // Keyed by basename because a shell script names its target however it likes
  // (`scratchpad/x.mjs`, `"$ROOT/scratchpad/x.mjs"`, `"$HERE/handover/x.mjs"`).
  // A basename collision across subdirectories would make this ambiguous, so
  // that case is recorded and reported UNMEASURABLE rather than resolved by
  // guesswork.
  const base = rel.split('/').pop();
  if (mjsKind.has(base)) mjsKind.set(base, { kind: 'AMBIGUOUS', rel: `${mjsKind.get(base).rel} and ${rel}` });
  else mjsKind.set(base, { kind, rel });
}

// ══ THE SHELL PASS ═════════════════════════════════════════════════════════
//
// O23. Everything above reads `.mjs` and nothing else, so the shell scripts
// sitting in the same directory were invisible to it — `listFiles(DIR,
// ['.mjs'])`, one line, and a whole file class outside the gate.
//
// ⚠ WIDENING THE FILE SET IS NOT THE SAME AS WIDENING THE CHECK, AND DOING
// ONLY THE FIRST IS HOW YOU GET A GATE THAT SCANS MORE AND ASSERTS LESS.
// G1 asks "does this call spawnGuarded?". A shell script has no spawnGuarded
// and never will — the ownership machinery is a Node module — so running G1
// over `.sh` files would classify every one of them "no launch" and return
// green forever. That is the trap, and the answer is not to stretch G1 but to
// ask what a shell script in THIS directory can actually get wrong.
//
// It can get two things wrong, and they are different questions:
//
//   S1  It can start an X server or an Electron ITSELF. Nothing in shell can
//       guard that here: `xvfb-run` has no trap of its own (that is hazard 4),
//       and the descent-based ownership rule lives in Node. So a shell script
//       must delegate the launch and not perform one — unless it installs a
//       trap covering INT, TERM and EXIT, which is the minimum that makes a
//       shell cleanup fire on more than the success path.
//
//   S2  It can DISPATCH TO AN UNGUARDED HARNESS. This is the one with teeth,
//       and it is the actual link between the two halves of this parcel: the
//       four unguarded launchers O20 blames for the leak are `.mjs` files, and
//       two of them are reached only through shell scripts that the gate could
//       not see. A `.sh` is a launcher by proxy, and the right quantity to
//       watch for it is WHICH LAUNCHER IT NAMES — not whether it contains a
//       call it structurally cannot contain.
//
// S3/S4 are the direct analogues of G2/G3 and belong here because shell is
// where `pkill` and a hand-rolled `cat ~/.aurora/mcp.json` are natural to
// write. S5 is the hazard-4 shape itself, stated as a rule.
//
// WHICH OF THESE CAN FIRE TODAY, stated plainly so nobody reads a prohibition
// as a measurement: S2 fires now, on two untracked shell scripts in the
// owner's working tree. S1, S3, S4 and S5 are prohibitions that currently
// hold — every one was verified by planting a violation and watching it go
// red, which is the only reason to believe a green from any of them.

/** Strip `#` comments from shell. Quoting is respected so a `#` inside a
 *  string survives; without that, `grep '#foo'` would truncate the line. */
function stripShComments(src) {
  const out = [];
  for (const line of src.split('\n')) {
    let q = null; let cut = -1;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) { cut = i; break; }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join('\n');
}

const shRows = [];
for (const path of listFiles(DIR, ['.sh'])) {
  const rel = relative(DIR, path);
  // scratchpad/fixtures/ holds whole checked-out copies of OTHER repos, pinned
  // as test data. Their build scripts are not this repo's launchers and this
  // gate has no standing over them.
  if (rel.startsWith('fixtures/')) continue;

  let raw;
  try { raw = readFileSync(path, 'utf8'); }
  catch (e) { unmeasurable.push(`${rel}: unreadable (${e.message})`); continue; }
  const src = stripShComments(raw);

  // ── S1: does it start an X server or an Electron itself? ─────────────────
  //
  // Matched as a COMMAND WORD — start of line, or after a pipe/`&&`/`;`/`(`,
  // or after an env-var prefix. `echo "run xvfb-run yourself"` is prose about
  // a launch, not a launch, and a rule that cannot tell them apart is a rule
  // people route around.
  const CMD = String.raw`(?:^|[\n;&|(]|\$\()\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
  const directLaunch = [];
  for (const [what, re] of [
    ['xvfb-run', new RegExp(`${CMD}(?:\\S*/)?xvfb-run\\b`)],
    ['Xvfb', new RegExp(`${CMD}(?:\\S*/)?Xvfb\\b`)],
    ['electron', new RegExp(`${CMD}(?:\\S*/)?electron\\b`)],
  ]) if (re.test(src)) directLaunch.push(what);
  // A trap is only a guard if it covers the signals. `trap ... EXIT` alone does
  // NOT fire on SIGINT or SIGTERM in POSIX sh, which is the vacuous-guard shape
  // this repo keeps meeting -- and is exactly what /usr/bin/xvfb-run does not
  // even have.
  const trapSigs = new Set();
  for (const m of src.matchAll(/\btrap\s+(?:'[^']*'|"[^"]*"|\S+)\s+([A-Z0-9 ]+)/g)) {
    for (const s of m[1].trim().split(/\s+/)) trapSigs.add(s.replace(/^SIG/, ''));
  }
  const fullTrap = ['EXIT', 'INT', 'TERM'].every((s) => trapSigs.has(s));
  if (directLaunch.length && !fullTrap) {
    fails.push(`S1 ${rel}: starts ${directLaunch.join('/')} itself with no trap covering EXIT+INT+TERM `
      + `(has: ${[...trapSigs].join(' ') || 'no trap at all'}). Shell has no spawnGuarded, and xvfb-run's own `
      + 'cleanup is on its success path only (/usr/bin/xvfb-run:184-192) — so an interrupted run leaks the '
      + 'display lock, the socket and the wrapper tempdir. Delegate the launch to a guarded .mjs.');
  }

  // ── S2: every .mjs it dispatches must itself be guarded ──────────────────
  const targets = new Set();
  for (const m of src.matchAll(/[\w$${}/.\\-]*?([A-Za-z0-9_.-]+\.mjs)\b/g)) targets.add(m[1]);
  const dispatched = [];
  for (const t of targets) {
    const k = mjsKind.get(t);
    if (!k) { unmeasurable.push(`${rel}: dispatches ${t}, which is not a file under scratchpad/ — cannot classify it`); continue; }
    if (k.kind === 'AMBIGUOUS') { unmeasurable.push(`${rel}: dispatches ${t}, and that basename exists twice (${k.rel})`); continue; }
    dispatched.push({ t, ...k });
  }
  const bad = dispatched.filter((d) => /UNGUARDED/.test(d.kind));
  if (bad.length) {
    fails.push(`S2 ${rel}: dispatches ${bad.length} UNGUARDED launcher(s) — ${bad.map((d) => d.rel).join(', ')}. `
      + 'A shell script is a launcher by proxy: it leaves the same orphaned Electron and the same leaked X '
      + 'display as if it had spawned them, and it is how two of those launchers are reached at all.');
  }

  // ── S3 / S4: the shell forms of G2 and G3 ────────────────────────────────
  if (/\bpkill\b/.test(src)) {
    fails.push(`S3 ${rel}: calls pkill. Same reason as G2 — a pattern match on a command line matches the `
      + "OWNER'S Aurora and misses this run's own orphan from a worktree.");
  }
  if (/mcp\.json/.test(src)) {
    fails.push(`S4 ${rel}: names mcp.json. Reading the shared discovery file from shell cannot apply the `
      + 'descent test at all, so it can only find "an app" — very possibly his.');
  }

  // ── S5: hazard 4's own shape, stated as a rule ───────────────────────────
  const backgrounds = /(?:^|[\n;&|(])\s*(?:nohup|setsid)\b/.test(src) || /&\s*$/m.test(src.replace(/&&/g, ''));
  if (backgrounds && !fullTrap) {
    fails.push(`S5 ${rel}: backgrounds a child (& / nohup / setsid) with no trap covering EXIT+INT+TERM `
      + `(has: ${[...trapSigs].join(' ') || 'no trap at all'}). This is hazard 4 exactly: /usr/bin/xvfb-run `
      + 'puts its cleanup after the command instead of in a trap, and that is why every interrupted harness '
      + 'run leaves a display behind.');
  }

  shRows.push({
    rel,
    kind: directLaunch.length ? `LAUNCHES ${directLaunch.join('/')} DIRECTLY${fullTrap ? ' (trapped)' : ' (UNTRAPPED)'}`
      : bad.length ? 'DISPATCHES AN UNGUARDED LAUNCHER'
      : dispatched.length ? `dispatches ${dispatched.length} guarded harness(es)`
      : 'no launch, no dispatch — not applicable',
  });
}

// ── report ─────────────────────────────────────────────────────────────────

const byKind = new Map();
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);

console.log(`\n=== ${rows.length} .mjs file(s) under scratchpad/ ===`);
for (const [k, v] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

const shByKind = new Map();
for (const r of shRows) shByKind.set(r.kind, (shByKind.get(r.kind) ?? 0) + 1);
console.log(`\n=== ${shRows.length} .sh file(s) under scratchpad/ (fixtures/ excluded: other repos' build scripts) ===`);
for (const [k, v] of [...shByKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

if (process.env.VERBOSE) {
  console.log('\n--- per file ---');
  for (const r of rows) console.log(`  ${r.rel.padEnd(50)} ${r.kind}`);
  for (const r of shRows) console.log(`  ${r.rel.padEnd(50)} ${r.kind}`);
}

if (exemptions.length) {
  console.log(`\nDECLARED EXEMPTIONS (${exemptions.length}) — printed every run, on purpose:`);
  for (const e of exemptions) console.log(`  ${e}`);
}
if (unmeasurable.length) {
  console.log(`\nUNMEASURABLE (${unmeasurable.length}) — a file this check could not classify is NOT a pass:`);
  for (const u of unmeasurable) console.log(`  ${u}`);
}
// ── tracked vs untracked ───────────────────────────────────────────────────
//
// An UNTRACKED launcher is exactly as dangerous as a tracked one -- it is a real
// file someone can really run -- so it is never hidden. But the repo cannot FIX
// a file it does not carry, and a gate that is permanently red is a gate people
// learn to ignore. So: tracked failures fail the build; untracked ones are
// reported loudly and do not, with the note that committing one makes it fatal.
//
// Found at landing, not in development: all four of these exist only in the
// owner's working tree (leftover scratch from earlier sessions), so every
// worktree this gate was built in was blind to them. Worktree isolation is what
// makes an agent safe AND what makes it unable to see the tree it protects.
let trackedFails = fails;
let untrackedFails = [];
try {
  const tracked = new Set(
    execFileSync('git', ['ls-files', 'scratchpad'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((f) => f.replace(/^scratchpad\//, '')));
  // `[GS]` — the shell rules use S-codes, and leaving this as `G\d+` would have
  // filed every shell failure under "tracked" by accident (the rule id would
  // stay in the key and never match a path), making an untracked .sh fatal.
  untrackedFails = fails.filter((f) => !tracked.has(String(f).replace(/^\s*[GS]\d+ /, '').split(':')[0]));
  trackedFails = fails.filter((f) => !untrackedFails.includes(f));
} catch (e) {
  // Cannot ask git -> cannot split -> treat every failure as fatal. Never the
  // other way: an unanswerable question does not become a pass.
  unmeasurable.push(`git ls-files failed (${e.message}); every failure treated as tracked`);
}

if (untrackedFails.length) {
  console.log(`\nUNGUARDED BUT UNTRACKED (${untrackedFails.length}) — present in THIS working tree only.`);
  console.log('  Just as able to hijack another Aurora; not fatal because the repo does not carry them.');
  console.log('  Committing one makes it a hard failure.');
  for (const f of untrackedFails) console.log(`  ${f}`);
}

if (trackedFails.length) {
  console.log(`\nFAILING (${trackedFails.length}):`);
  for (const f of trackedFails) console.log(`  ${f}`);
}

const bad = trackedFails.length + unmeasurable.length;
const classified = rows.length + shRows.length;
const clean = classified - trackedFails.length - untrackedFails.length - unmeasurable.length;
// `clean` subtracts the untracked ones too. They are NOT clean -- they are
// unguarded and merely not fatal -- and a headline that counted them as clean
// would be the gate telling the exact lie it exists to catch.
console.log(`\n════ ${clean} clean / ${classified} classified (${rows.length} .mjs + ${shRows.length} .sh) · ${trackedFails.length} failure(s)`
  + `${untrackedFails.length ? ` · ${untrackedFails.length} unguarded-untracked` : ''}`
  + ` · ${unmeasurable.length} unmeasurable ════`);
process.exit(bad ? 1 : 0);
