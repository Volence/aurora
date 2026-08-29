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
// LOUD ON UNMEASURABLE. A file this cannot classify — unreadable, or a spawn
// whose arguments it cannot bracket — is reported UNMEASURABLE and FAILS the
// run. A checker that silently skips what it cannot understand is the same
// defect as a guard that asserts nothing: it goes green over the case it could
// not see.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const GUARD_REL = './lib/harness-guard.mjs';
const GUARD_ABS = join(DIR, 'lib', 'harness-guard.mjs');

/** Exports the rest of scratchpad/ is entitled to rely on (G4). */
const REQUIRED_EXPORTS = [
  'spawnGuarded', 'killTree', 'killTreeSync', 'descendants', 'isDescendantOf',
  'snapshotDiscovery', 'restoreDiscovery', 'restoreDiscoveryNow', 'readDiscoveryNow', 'setDiscoveryBaseline',
  'resolveOwnedDiscovery', 'ownedRoots', 'DISCOVERY_FILES',
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

function listMjs(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') listMjs(p, acc); continue; }
    if (name.endsWith('.mjs')) acc.push(p);
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

for (const path of listMjs(DIR)) {
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
      + "it matches the OWNER'S Aurora and misses this run's own orphan.");
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
}

// ── report ─────────────────────────────────────────────────────────────────

const byKind = new Map();
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);

console.log(`\n=== ${rows.length} .mjs file(s) under scratchpad/ ===`);
for (const [k, v] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

if (process.env.VERBOSE) {
  console.log('\n--- per file ---');
  for (const r of rows) console.log(`  ${r.rel.padEnd(50)} ${r.kind}`);
}

if (exemptions.length) {
  console.log(`\nDECLARED EXEMPTIONS (${exemptions.length}) — printed every run, on purpose:`);
  for (const e of exemptions) console.log(`  ${e}`);
}
if (unmeasurable.length) {
  console.log(`\nUNMEASURABLE (${unmeasurable.length}) — a file this check could not classify is NOT a pass:`);
  for (const u of unmeasurable) console.log(`  ${u}`);
}
if (fails.length) {
  console.log(`\nFAILING (${fails.length}):`);
  for (const f of fails) console.log(`  ${f}`);
}

const bad = fails.length + unmeasurable.length;
console.log(`\n════ ${rows.length - bad} clean / ${rows.length} classified · ${fails.length} failure(s) · ${unmeasurable.length} unmeasurable ════`);
process.exit(bad ? 1 : 0);
