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
//   G5  (O66) A file that can `process.exit()` must not DROP a `killTree(...)`
//       promise. `killTree` SIGTERMs the app before its first `await` and then
//       waits a bounded grace for it to be GONE before the X server's group is
//       signalled — that order is the O65 ruling, and it is what stops
//       Electron's X connection breaking mid-shutdown (a Chromium CHECK, a
//       SIGTRAP core under systemd-coredump on every run that needed the
//       SIGKILL net; 17 of 17 correlated). A bare `killTree(child);` followed
//       by `process.exit(...)` skips the whole grace: the exit net reaps by
//       SIGKILL from the capture killTree left in `inFlight`, which is exactly
//       the shape that produced the cores. Three harnesses had it on the day
//       this rule was written (section-raster-select, bg-wrap, chunk-links) —
//       red-first. A captured promise (`await`, `return`, `=`, `=>`, an
//       argument) is fine; only the dropped one is the hazard.
//
//   G7  (O52) Nothing hand-rolls the `dist/`-vs-`src/` staleness gate. The
//       eighteen inline copies compared the BUILT tree's bundle against the
//       CALLER'S OWN `src/` — the same question-1/question-2 confusion
//       lib/run-root.mjs exists to end — so from a linked worktree, where those
//       are two directories and `src/` mtimes are checkout time, the gate fired
//       unconditionally and no fresh build could satisfy it. See the rule's own
//       block below for the derivation.
//
//   G6  (O49) A TRACKED harness-like file that NO `package.json` script can
//       reach fails, naming the file and the exact script line to add. See the
//       long note above the G6 pass for the population, the reachability rule,
//       and why the exemption is a written list rather than a filename pattern.
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
  // O52 / HAZARD 1c. The recents file is guarded by being IN the list the
  // snapshot iterates. Rename either name and `snapshotDiscovery` silently goes
  // back to covering two files out of five while every launcher still "imports
  // the guard" — the same dead-code shape the entries below are listed for, and
  // this one has already destroyed the owner's recent-projects list once.
  'RECENT_PROJECT_FILES', 'GUARDED_GLOBAL_FILES', 'APP_NAMES', 'entriesOf',
  // O20's reap. Listed here for the same reason as the rest: rename one of
  // these and killTree's `reap` branch becomes dead code, every launcher still
  // "imports the guard", and the X displays start leaking again silently.
  'displayArtifacts', 'reapDisplays', 'XVFB_TMPDIR_RE',
  // The two the reap's own gates are made of. `boundSocketPaths` must stay
  // exported because its NULL-means-unknown contract is what gate 0 reads, and
  // the proof asserts that contract directly; `NEVER_REAP_DISPLAYS` because a
  // row has to be able to show that no OTHER gate could have covered for it.
  'boundSocketPaths', 'NEVER_REAP_DISPLAYS',
  // O28. The discovery file outlives the process it names, so every printed
  // line carries a liveness verdict. Rename this and `describeDiscovery`
  // quietly goes back to printing a dead pid that reads as a live app —
  // the exact artifact-asserts-liveness defect, in the module written to
  // stop it.
  'livenessOf',
  // O36 / HAZARD 5. `spawnGuarded` injects `--ozone-platform=x11` through
  // `pinOzoneToX11`, because deleting DISPLAY does NOT detach an Electron from
  // the owner's Wayland session and every harness believed it did. Listed here
  // for the same reason as the rest: rename either name and the injection
  // becomes dead code while every launcher still "imports the guard" and every
  // harness silently goes back to measuring the owner's desktop.
  'pinOzoneToX11', 'OZONE_X11_FLAG',
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
 *
 * ⚠ AND THE SECOND VERSION HAD NO REGEX-LITERAL CASE, WHICH DESYNCHRONISED THE
 * WHOLE SCANNER ON ONE APOSTROPHE (O77 §5b, repaired in O79). On
 * `/a row in aeon's band-demo table/` it read the `'` as a string open, ran
 * forward to the next `'` — hundreds of characters and several lines away —
 * and everything in between was emitted VERBATIM under `keepStrings: true`,
 * `//` comments included. band-preset-harness.mjs's own comment saying *"there
 * is no `pkill` on a pattern anywhere in this file"* survived stripping and
 * tripped G2 as a `pkill` CALL. The report was exactly backwards. A regex
 * containing `//` (`/https?:\/\//`) was worse and in the blind direction: the
 * `/` `/` pair read as a line comment and the REST OF THE LINE was deleted.
 *
 * ═══ THE DIVISION-VS-REGEX RULE, AND WHAT IT GETS WRONG ═══
 *
 * A `/` opens a regex iff the preceding significant token cannot END an
 * expression. `prevIsValue` tracks that: it is set after an identifier, a
 * number, a closing string/template/regex, `]`, and `++`/`--`, and cleared
 * after every other punctuator, at start of input, and after the keywords that
 * can be followed by an expression (`return`, `typeof`, `case`, `in`, `of`,
 * `new`, `delete`, `void`, `throw`, `do`, `else`, `yield`, `await`,
 * `instanceof`). `)` is resolved by looking back at what precedes its MATCHING
 * `(`: an `if`/`while`/`for`/`switch`/`catch`/`with` head leaves statement
 * position, so `if (x) /re/.test(y)` is a regex, while `slice(i) / 2` is
 * division. Two further nets, both cheap and both decisive: a regex body
 * cannot contain a raw newline, so a tentative regex that does not close on
 * its own line is RETRACTED and re-read as division; and a `'`/`"` string
 * cannot contain one either, so a quote scan that crosses a newline means the
 * scanner is out of sync and says so instead of running on.
 *
 * THE ONE CASE IT REFUSES TO GUESS is a `/` immediately after `}`, which is a
 * block end (statement position, so a regex) or an object-literal/function-
 * expression end (a value, so division) with no local way to tell. Guessing it
 * either way is how a checker becomes silently blind in a corner, so it is
 * pushed to `notes` and the caller renders it UNMEASURABLE, which fails.
 * Measured over this repo's whole scratchpad/ population: zero occurrences.
 *
 * CASES THE RULE IS KNOWN TO GET WRONG, none of which can hide a token:
 *   · a keyword name used as a PROPERTY (`m.delete / 2`, `x.of / 2`) reads as
 *     the keyword, so the `/` is tried as a regex;
 *   · a `)` that ends a statement-position expression through ASI, or a regex
 *     after a `)` whose `(` is not a control-flow head;
 *   · `return` / `throw` on one line with the `/` on the next (ASI again).
 * Every one of them is a MIS-CLASSIFICATION, not a deletion: the tentative
 * regex either closes on its line and is copied out character-for-character, or
 * does not and is retracted with a note. Measured over all 182 .mjs files in
 * scratchpad/, in both modes: not one of these fires.
 *
 * Regex literals are emitted VERBATIM in BOTH modes, never blanked. That is
 * deliberate and it is what makes this change unable to be blinder than what it
 * replaces: recognising a regex only stops the scanner mistaking its contents
 * for a string or a comment, it never deletes a character that the old scanner
 * kept. A `/` misread AS a regex therefore also costs nothing under
 * `keepStrings: true` — the same characters come out either way.
 *
 * @param notes optional array; ambiguities and desyncs are pushed here. A
 *   caller that passes it MUST treat a non-empty array as unmeasurable.
 */
const REGEX_OK_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await',
]);

function stripInert(src, { keepStrings = false } = {}, notes = null) {
  const note = (m) => { if (notes) notes.push(m); };
  const lineAt = (idx) => src.slice(0, idx).split('\n').length;
  let out = '';
  let i = 0;
  const n = src.length;
  // Can the token just consumed END an expression? Decides `/`.
  let prevIsValue = false;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      if (i >= n) { note(`unterminated /* */ comment opened before line ${lineAt(i)}`); break; }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; const start = i; i++;
      while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      if (i >= n || src[i] === '\n') {
        // A single- or double-quoted string cannot cross a newline. Reaching one
        // means this quote was not a string open at all and the scan is out of
        // sync — the exact failure O77 §5b hit. Say so; never run on.
        note(`a ${q === "'" ? 'single' : 'double'}-quoted string opened at line `
          + `${lineAt(start)} never closed on its line — the scanner is out of sync here`);
        out += src.slice(start, i);
        continue;
      }
      i++;
      out += keepStrings ? src.slice(start, i) : '""';
      prevIsValue = true;
      continue;
    }
    if (c === '`') {
      const start = i;
      const end = scanTemplate(src, i);
      if (end < 0) {
        // A template that cannot be bracketed is the SECOND desync source, and
        // it was in here before the regex one: the old scan ran backtick to
        // backtick, so a NESTED template inside a `${}` closed the outer one
        // early and everything after it was read as code. Four files in this
        // population do that. Loud, not guessed.
        note(`a template literal opened at line ${lineAt(start)} could not be bracketed `
          + '(unterminated, or a `${}` this scanner cannot balance)');
        out += src.slice(start); i = n;
        continue;
      }
      i = end;
      out += keepStrings ? src.slice(start, i) : '""';
      prevIsValue = true;
      continue;
    }
    if (c === '/') {
      // `}` is the case with no local answer. Refuse it loudly.
      let k = out.length - 1;
      while (k >= 0 && /\s/.test(out[k])) k--;
      if (k >= 0 && out[k] === '}') {
        note(`a \`/\` follows \`}\` at line ${lineAt(i)} — regex or division cannot be `
          + 'decided here without a parser, and this check will not guess');
        out += c; i++; prevIsValue = false;
        continue;
      }
      // `)` overrides the flag: only a look-back at its matching `(` can say
      // whether it ended a control-flow head (statement position → regex) or a
      // call (value → division).
      const endsWithParen = k >= 0 && out[k] === ')';
      const isValue = endsWithParen ? closeParenIsValue(out) : prevIsValue;
      if (!isValue) {
        const end = scanRegex(src, i);
        if (end > 0) { out += src.slice(i, end); i = end; prevIsValue = true; continue; }
        // Did not close on its line: it was not a regex. Fall through as division.
        note(`a \`/\` at line ${lineAt(i)} read as a regex start by the token before it did `
          + 'not close on its own line — treated as division; verify by hand');
      }
      out += c; i++; prevIsValue = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      out += word; i = j;
      prevIsValue = !REGEX_OK_AFTER_WORD.has(word);
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < n && /[0-9a-fA-FxXoObBeE._]/.test(src[j])) j++;
      out += src.slice(i, j); i = j; prevIsValue = true;
      continue;
    }
    out += c; i++;
    if (!/\s/.test(c)) {
      // `]` and `)` end a value; `++`/`--` do too. Everything else does not.
      // `)` is refined by closeParenIsValue() at the `/` above, which is the
      // only place the distinction matters.
      prevIsValue = c === ']' || c === ')'
        || ((c === '+' || c === '-') && out[out.length - 2] === c);
    }
  }
  return out;
}

/**
 * Scan a regex literal starting at `src[i] === '/'`. Returns the index one past
 * its closing `/` plus flags, or -1 if it does not close on its own line — a
 * regex body cannot contain a raw newline, so that answer is decisive, not a
 * guess. Handles `\/` and a `/` inside a `[...]` character class.
 */
function scanRegex(src, i) {
  let j = i + 1;
  let inClass = false;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\n') return -1;
    if (ch === '\\') { j++; continue; }
    if (inClass) { if (ch === ']') inClass = false; continue; }
    if (ch === '[') { inClass = true; continue; }
    if (ch === '/') { j++; while (j < src.length && /[a-z]/.test(src[j])) j++; return j; }
  }
  return -1;
}

/**
 * Bracket a template literal starting at `src[i] === '`'`, returning the index
 * one past its closing backtick, or -1.
 *
 * ⚠ A `${}` IS CODE AND CAN HOLD ANOTHER TEMPLATE. The scan this replaced went
 * backtick-to-backtick, so `` `a ${x ? `b's c` : 'd'}` `` ended at the INNER
 * opener and the rest was read as code — the same desync class as the missing
 * regex case, and it is live in four files here (band-trunk-demo ×2,
 * crossover-paint-harness, effects-column-harness). Interiors are balanced by
 * `scanInterp`, which knows strings, comments, nested templates and regexes.
 */
function scanTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') { j += 2; continue; }
    if (ch === '`') return j + 1;
    if (ch === '$' && src[j + 1] === '{') {
      const e = scanInterp(src, j + 1);
      if (e < 0) return -1;
      j = e; continue;
    }
    j++;
  }
  return -1;
}

/** Balance a `${` … `}` interior. `src[i] === '{'`; returns the index one past
 *  the matching `}`, or -1 when a literal inside it cannot be bracketed. */
function scanInterp(src, i) {
  let depth = 0;
  let j = i;
  let lastSig = '';
  while (j < src.length) {
    const ch = src[j]; const d = src[j + 1];
    if (ch === '{') { depth++; j++; lastSig = ch; continue; }
    if (ch === '}') { depth--; j++; if (depth === 0) return j; lastSig = ch; continue; }
    if (ch === '/' && d === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (ch === '/' && d === '*') {
      j += 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
      if (j >= src.length) return -1;
      j += 2; continue;
    }
    if (ch === '`') { const e = scanTemplate(src, j); if (e < 0) return -1; j = e; lastSig = ch; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch; let k = j + 1;
      while (k < src.length && src[k] !== q && src[k] !== '\n') { if (src[k] === '\\') k++; k++; }
      if (k >= src.length || src[k] === '\n') return -1;
      j = k + 1; lastSig = ch; continue;
    }
    if (ch === '/' && !/[A-Za-z0-9_$)\]'"`]/.test(lastSig)) {
      const e = scanRegex(src, j);
      if (e > 0) { j = e; lastSig = '/'; continue; }
    }
    if (!/\s/.test(ch)) lastSig = ch;
    j++;
  }
  return -1;
}

/**
 * The `)` case. `out` ends (modulo whitespace) at a `)`; walk back to its
 * matching `(` and ask what precedes it. A control-flow head — `if`, `while`,
 * `for`, `switch`, `catch`, `with` — leaves the parser in STATEMENT position,
 * where a following `/` is a regex; anything else (a call, a grouping, an arrow
 * parameter list) is a value, where it is division. Returns true for "value",
 * i.e. division. Anything it cannot bracket is treated as a value, which is the
 * status-quo reading and cannot delete a character either way.
 */
function closeParenIsValue(out) {
  let k = out.length - 1;
  while (k >= 0 && /\s/.test(out[k])) k--;
  if (k < 0 || out[k] !== ')') return false;
  let depth = 0;
  for (; k >= 0; k--) {
    if (out[k] === ')') depth++;
    else if (out[k] === '(') { depth--; if (depth === 0) break; }
  }
  if (k < 0) return true;
  let w = k - 1;
  while (w >= 0 && /\s/.test(out[w])) w--;
  let e = w;
  while (w >= 0 && /[A-Za-z0-9_$]/.test(out[w])) w--;
  const word = out.slice(w + 1, e + 1);
  return !['if', 'while', 'for', 'switch', 'catch', 'with'].includes(word);
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

/**
 * Failures that are ALWAYS fatal, whatever `git ls-files` says about the path
 * they name.
 *
 * ⚠ FOUND BY PLANTING, AND IT MADE G6's EXEMPTION AUDIT VACUOUS. The
 * tracked/untracked split at the bottom of this file is right for a rule about
 * a FILE — the repo cannot fix a launcher it does not carry, so an untracked
 * one is reported and not fatal. It is exactly wrong for a rule about this
 * repo's OWN CONFIGURATION. G6's STALE EXEMPTION fires precisely when the path
 * in `RETIRED_UNREGISTERED` is NOT tracked, so the split filed every stale
 * exemption as "untracked, not fatal": the check that exists to stop the
 * exemption list rotting went GREEN (exit 0) over a planted rotten entry.
 * The failure was printed, and printed is not gated.
 *
 * Anything added here is a claim about package.json or about this file's own
 * lists, not about a file the repo may or may not carry.
 */
const alwaysFatal = new Set();

// G4 first: if the module is wrong, everything below is meaningless.
let guardSrc = null;
try { guardSrc = readFileSync(GUARD_ABS, 'utf8'); }
catch (e) { unmeasurable.push(`lib/harness-guard.mjs unreadable: ${e.message}`); }
if (guardSrc) {
  const missing = REQUIRED_EXPORTS.filter((n) =>
    !new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${n}\\b`).test(guardSrc));
  if (missing.length) {
    // ⚠ O52: G4 COULD NOT FAIL THIS CHECK, and the header two rules up says why
    // it must — "without this the whole check is vacuous the day someone renames
    // an export". FOUND BY PLANTING, exactly as the `alwaysFatal` block above
    // was: renaming `RECENT_PROJECT_FILES` printed
    //     G4 lib/harness-guard.mjs no longer exports: RECENT_PROJECT_FILES
    // and the run exited 0. The tracked/untracked split keys on
    // `msg.replace(/^\s*[GS]\d+ /,'').split(':')[0]`, which for this message is
    // the whole phrase `lib/harness-guard.mjs no longer exports` — not a path
    // `git ls-files` knows — so every G4 failure was filed as "untracked,
    // present in this working tree only" and printed rather than gated. Same
    // shape as the G6 stale-exemption case, one rule over: THE FAILURE WAS
    // PRINTED, AND PRINTED IS NOT GATED. G4 is a claim about this repo's own
    // guard module, never about a file the repo may not carry, so it belongs in
    // `alwaysFatal` for exactly the stated reason.
    const msg = `G4 lib/harness-guard.mjs no longer exports: ${missing.join(', ')}`;
    fails.push(msg);
    alwaysFatal.add(msg);
  }
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
  // LOUD ON A SCANNER IT CANNOT TRUST. `stripInert` refuses to guess a `/`
  // after `}` and reports any quote scan that crosses a newline; either means
  // the token hunts below are running over text this check cannot vouch for, so
  // the file is UNMEASURABLE — never a pass. (O79; the failure it replaces was
  // silent in one direction and exactly backwards in the other.)
  const stripNotes = [];
  // Drained at BOTH strip calls, because there is a `continue` between them and
  // a note dropped on that path is a file this check silently stopped vouching
  // for. Deduped: the two passes see the same source.
  const drainStripNotes = () => {
    while (stripNotes.length) {
      const m = stripNotes.shift();
      const line = `${rel}: the comment/string scanner could not vouch for this file — ${m}`;
      if (!unmeasurable.includes(line)) unmeasurable.push(line);
    }
  };
  const tok = stripInert(raw, { keepStrings: true }, stripNotes);
  drainStripNotes();
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

  // ── G5 (O66): a dropped killTree promise in a file that can process.exit ──
  //
  // Derived from the call shape, not a list. Every `killTree(` (the async
  // helper — `killTreeSync(` is a different identifier and does not match) is
  // read with what precedes it: `await`, `return`, `=`, `=>`, or an opening
  // `(`/`,`/`:`/`?` means the promise is captured by SOMETHING and may settle
  // before an exit; anything else is a dropped promise. A dropped promise is
  // only a hazard when the file can exit before it settles, so the rule fires
  // only in files that call `process.exit(` — a file that sets
  // `process.exitCode` and returns drains its event loop over the grace and is
  // NOT flagged (bg-dangling-ref, effects-bob measured doing exactly that,
  // ORDERED line and all). This is a CALL-SHAPE scan, so it runs over the
  // source with comments AND string bodies stripped: the first cut kept the
  // strings and flagged harness-guard-proof.mjs for the words
  // "`killTree(child.pid)` spelling" inside a check LABEL. (The cost: a call
  // written inside a template literal's `${}` is blanked with the string and
  // not seen — no harness does that, and a launcher's teardown never should.)
  const shape = stripInert(raw, { keepStrings: false }, stripNotes);
  drainStripNotes();
  if (!isGuardModule && !isThisChecker && /\bprocess\.exit\s*\(/.test(shape)) {
    const dropped = [];
    const kt = /(?<![\w.$])killTree\s*\(/g;
    let k;
    while ((k = kt.exec(shape))) {
      const before = shape.slice(0, k.index).replace(/\s+$/, '');
      if (!/(\bawait|\breturn|=>|[=(,:?])$/.test(before)) {
        dropped.push(shape.slice(k.index, k.index + 48).split('\n')[0].trim());
      }
    }
    if (dropped.length) {
      fails.push(`G5 ${rel}: ${dropped.length} dropped killTree promise(s) in a file that calls process.exit() — `
        + `${dropped.map((d) => `\`${d}\``).join(', ')}. The app gets NO grace: process.exit runs before the `
        + 'ordered SIGTERM/wait/then-X-server teardown, the exit net SIGKILLs the app, and that is the '
        + 'shape that left a Chromium SIGTRAP core on every SIGKILL-net run (O65). Spell it `await killTree(child)`.');
    }
  }

  // ── G7 (O52): a hand-rolled staleness gate ───────────────────────────────
  //
  // Eighteen instruments compared `statSync(MAIN).mtimeMs` — the tree the run is
  // AGAINST — with `find ${join(ROOT, 'src')} … stat -c %Y` — the tree the file
  // LIVES IN. One directory in the main checkout; two in a linked worktree,
  // where `src/` mtimes are checkout time, so the gate fired unconditionally
  // however fresh the bundle was. Every agent here works in a worktree, so for
  // them it could refuse and could not pass.
  //
  // DERIVED FROM THE ARTIFACTS OF THE HAND-ROLL, not from a file list: the shell
  // mtime scan (`stat -c %Y`) and the message the throw carried. Both are gone
  // from the tree now — `lib/run-root.mjs` is where the comparison is spelled,
  // and `assertFreshBuild(RUN)` is the only call site shape — so a nineteenth
  // copy pasted out of an old file turns this red instead of quietly costing its
  // author an afternoon. The false-positive check was run over the whole
  // population: `crossover-paint` and `sweep-fix` use `mtimeMs` for other
  // things, and neither matches either pattern.
  const isRunRootModule = path === join(DIR, 'lib', 'run-root.mjs');
  if (!isRunRootModule && !isThisChecker && (/stat -c %Y/.test(tok) || /STALER than src/.test(tok))) {
    fails.push(`G7 ${rel}: hand-rolls the dist/-vs-src/ staleness gate. Its two operands name `
      + 'DIFFERENT TREES the moment the caller lives in a linked worktree — the bundle from '
      + '`runTarget()`, the sources from the caller\'s own location — so it fires unconditionally '
      + 'from every agent worktree and can never pass. Call `assertFreshBuild(RUN)` from '
      + 'lib/run-root.mjs, which asks about ONE tree and refuses loudly when it cannot ask at all.');
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

// ══ G6 (O49) — A HARNESS NOBODY CAN RUN BY NAME ════════════════════════════
//
// Every rule above asks whether a harness is SAFE TO RUN. None asks whether it
// can be run at all, and that is the gap that cost this repo twice in one
// night. On 2026-09-03 there were 145 tracked harness-like files under
// scratchpad/ and 44 of them were reachable by a `package.json` script. The
// other 101 could not be run by name by anyone.
//
// THE PRICE, both recorded in docs/lane-log.jsonl:
//
//   · `vsplit-advisory-harness` sat RED FOR SIX DAYS at 30/31, holding a rule
//     that had been overturned at 7ba5a638. The repair had dropped a parameter
//     so stale call sites would fail to compile — which works for TypeScript
//     and does not reach a .mjs harness. The stated reason nobody saw it:
//     "THE HARNESS WAS NOT IN package.json so nobody could run it."
//   · Registering nine collision-family harnesses (O48c) immediately surfaced a
//     tenth finding: `crossover-paint` had NEVER been runnable on a clean
//     checkout, and its own anti-vacuous row was what said so. Unregistered,
//     nothing swept it, so nothing asked.
//
// A one-time registration pass rots the same way O16's one-time guard pass
// would have. So this is DERIVED: the population comes from `git ls-files`, the
// reachability from the ACTUAL script table in package.json, and adding a
// harness adds a row here whether or not anybody remembers this rule exists.
//
// THE POPULATION is a filename shape — `*-harness.mjs`, `*-probe.mjs`,
// `*-proof.mjs` — and that is deliberate, because it is the shape that decides
// what a person calls a harness when they write one. It is NOT how the
// exemption works; see below.
//
// REACHABLE means some `package.json` script command names the file: directly,
// or through a `.sh` under scratchpad/ that a script dispatches (a shell script
// a script runs is a door with a name on it, exactly like a `node` line). The
// path is matched at a filename boundary, so `marquee-harness.mjs` is not
// satisfied by a script that runs `marquee-flip-harness.mjs`.
//
// ⚠ THE EXEMPTION IS A WRITTEN LIST WITH A REASON PER ENTRY, NOT A PATTERN.
// A pattern (`*-probe.mjs`, say) would be the cheaper spelling and it is the
// wrong one twice over: it makes the exemption INVISIBLE — nobody reading the
// gate learns which files are excused or why — and it silently swallows the
// next real instrument that happens to be named `-probe`. Four of the files
// below ARE named `-harness` and eleven of the excused ones are named `-probe`,
// so no pattern could have drawn this line anyway. Every entry is printed on
// every run, for the same reason G1's single exemption is.
//
// WHAT EARNS AN EXEMPTION: the file does not GATE. A registered script is a
// name you can run and get a verdict from; these exit 0 whatever they measured
// (or non-zero only when the measurement could not be TAKEN — no socket, no
// app), so registering one would add a script that can never go red. That is
// the vacuous-instrument shape this repo keeps paying for, and a green from it
// would be worse than its absence. The classification, with the evidence for
// every one of the 145, is docs/reviews/2026-09-03-harness-registration.md.
//
// THE LIST ITSELF IS CHECKED, because an exemption nobody re-derives is a
// workaround outliving its defect: an entry naming a file that is no longer
// tracked FAILS (stale), and an entry naming a file that IS reachable FAILS
// (dead — it is excusing something that already has a name).
//
// LOUD ON UNMEASURABLE. If `git ls-files` cannot answer, or package.json cannot
// be read or parsed, this rule reports UNMEASURABLE and fails. It never renders
// "I could not enumerate" as "zero unregistered harnesses" — the whole defect
// class here is a check that goes green over what it could not see.

/** The filename shape people reach for when they write a harness. */
const HARNESS_LIKE = /-(harness|probe|proof)\.mjs$/;

/**
 * Tracked harness-like files deliberately left unregistered, with the reason.
 * Repo-relative paths. Every entry is printed on every run.
 *
 * Adding an entry here is a claim that the file does not gate — that it exits 0
 * whatever it measured. If you are tempted to add one for a file that DOES
 * gate, register it instead; that is the entire point of the rule.
 */
const RETIRED_UNREGISTERED = {
  // ── report-only, and an in-repo record says what closed the investigation ──
  'scratchpad/_select-key-probe.mjs':
    'Report-only (exit 0 always). Settled the three real-input facts in '
    + 'docs/reviews/2026-08-27-curve-vsplit-reachable.md §5, which quotes its output verbatim; '
    + 'the standing instrument for that row is harness:curve-vsplit-reachable.',
  'scratchpad/band-lens-harness.mjs':
    'Report-only (exit 0 at the end; exit 1 only when the socket never appears). One half of the '
    + 'band-lens investigation CLOSED 2026-08-27 — docs/OVERSEER-LOG.md names this file and '
    + 'band-step-proof.mjs as its two instruments and marks the tagged question answered.',
  'scratchpad/band-step-proof.mjs':
    'Report-only — prints VERDICT and exits 0 on all three of STEPS / UNDETERMINED / did NOT step. '
    + 'Same closure as band-lens-harness.mjs: docs/OVERSEER-LOG.md, "TAGGED QUESTION CLOSED '
    + '2026-08-27 — the band STEPS, proven with a control run".',
  'scratchpad/band-rate-shift-probe.mjs':
    'Report-only — writes rate-shift.json and exits 0; its non-zero exits are all BLOCKED/no-socket. '
    + 'Answered ROADMAP row 43\'s untested rate_shift tail; packet '
    + 'docs/reviews/2026-08-27-rate-shift-watched.md.',
  'scratchpad/bganim-marquee-resolution-probe.mjs':
    'Report-only on its subject — its exit 3 gates the DECODE being proven, not the marquee '
    + 'percentages it reports. The measurement that gated the gesture; packet '
    + 'docs/reviews/2026-08-26-bganim-marquee-resolution.md.',
  'scratchpad/block-fanout-probe.mjs':
    'Report-only — prints a JSON census, no exit code at all. '
    + 'docs/reviews/2026-08-19-handoff-after-collision.md: "A block fan-out census decided one '
    + 'design question outright."',
  'scratchpad/bus-probe.mjs':
    'Report-only (exit 0) — prints the Aether method list. Superseded as a standing check by '
    + 'harness:aether-method-gate, which derives the method SET the run needs instead of printing '
    + 'a count (O26: "A COUNT IS NOT A CAPABILITY").',
  'scratchpad/effects-strip-delta-probe.mjs':
    'Self-declared in its own header: "This is a MEASUREMENT, not a gate." Step 1 of EW-SHAPE-STRIP; '
    + 'the shipped surface is gated by harness:effects-section-strip, packet '
    + 'docs/reviews/2026-09-02-effects-section-strip.md.',
  'scratchpad/effects-subtabs-geometry-probe.mjs':
    'Self-declared: "A MEASUREMENT. It asserts nothing, so it can be run against master\'s build '
    + 'and against this branch\'s and the two numbers compared." Shipped surface gated by '
    + 'harness:effects-sub-tabs, packet docs/reviews/2026-09-02-effects-sub-tabs.md.',
  'scratchpad/fromtile-typing-probe.mjs':
    'Report-only — prints "VERDICT: NO SNAP / SNAPS" and exits 0 either way. Answered ROADMAP '
    + 'item 40\'s tagged typing wrinkle; that row is DELIVERED 2026-08-27.',
  'scratchpad/guide-aim-probe.mjs':
    'Self-declared in its first line: "DIAGNOSTIC, NOT A GATE." Its only non-zero exit is a '
    + 'PROBE ERROR. Aimed at ROADMAP row 43\'s layer-guide drag.',
  'scratchpad/init-probe.mjs':
    'Report-only (exit 0) — prints the initialize reply\'s keys. docs/OVERSEER-LOG.md: "the parcel '
    + 'is CLOSED ... Probe: `scratchpad/init-probe.mjs`."',
  'scratchpad/label-measure-probe.mjs':
    'Self-declared: "MEASUREMENT PROBE for ROADMAP §5.1 item 17 — no assertions, just numbers." '
    + 'Item 17 is DELIVERED and its standing instrument is harness:object-label.',
  'scratchpad/loop-cell-probe.mjs':
    'Report-only — its only non-zero exit is UNMEASURABLE. '
    + 'docs/reviews/2026-08-19-handoff-after-collision.md: "a layout census showed a shipped '
    + 'warning was unreachable in stock data — which is why a harness row now authors the '
    + 'condition itself."',
  'scratchpad/marquee-paste-probe.mjs':
    'Report-only — diffs the whole canvas and prints a bounding box; non-zero only on PROBE ERROR. '
    + 'Written to diagnose marquee-harness rows 5b/6a; ROADMAP item 74 DELIVERED 2026-08-28 and '
    + 'harness:marquee is the standing instrument.',
  'scratchpad/row8-probe.mjs':
    'Report-only — "no clicks at all", non-zero only on PROBE ERROR. Diagnosed sprite-restore-'
    + 'harness rows 7→8, which exist and assert today (rows 7, 8a, 8b) under harness:sprite-restore.',
  'scratchpad/s1-vplayer-spike-probe.mjs':
    'Report-only on the spike itself — writes s1-vplayer-spike.json and exits 0; its non-zero exits '
    + 'are BLOCKED / UNDETERMINED, i.e. the measurement could not be taken. Item 48\'s gate spike; '
    + 'packet docs/reviews/2026-08-27-s1-vplayer-spike.md.',
  'scratchpad/skipped-cells-probe.mjs':
    'Report-only — prints "[VERDICT] field-on-wire=…" and never gates on it; non-zero only when '
    + 'the discovery file cannot be owned. `skippedCells` shipped at 8efda9d '
    + '(docs/reviews/2026-08-19-handoff-after-collision.md).',
  'scratchpad/storage-flush-probe.mjs':
    'Report-only — no exit code at all. Its own header: "A 40-line control for ONE question the '
    + 'canvas harness could not answer about itself"; cited by '
    + 'docs/superpowers/plans/2026-08-15-canvas-cdp-report.md.',
  'scratchpad/zone-blocks-probe.mjs':
    'Report-only — and note it LOOKS like a gate: it builds a `fails` array (line 90) and never '
    + 'reads it, so a red row exits 0. Its question was answered by '
    + 'docs/superpowers/plans/2026-08-17-classic-collision-editing.md §3 ("Refuse the table '
    + 'growth"). The dead accumulator is recorded in the O49 packet, NOT fixed here.',

  // ── report-only, and NO in-repo record says what closed it (UNCLASSIFIABLE) ──
  // These are excused for the same measured reason as the rest — none of them
  // gates, so a script entry could never go red — but their status is genuinely
  // open, not decided. They are listed separately so nobody reads the section
  // above as covering them. See the O49 packet §4.
  'scratchpad/artmode-repro-harness.mjs':
    'UNCLASSIFIABLE. Report-only: no exit code at all, self-declared "Diagnostic only — it changes '
    + 'nothing and saves nothing." Reproduces two reported Art-mode defects (Chunk>Assign renders '
    + 'black; Paint opens at 24x and ctrl+scroll will not zoom out) and NO doc in this repo records '
    + 'either being fixed. Excused because it cannot go red, not because it is finished.',
  'scratchpad/assign-black-harness.mjs':
    'UNCLASSIFIABLE. Report-only: prints "REPRODUCED: assign went black" or "not reproduced" and '
    + 'exits 0 either way. First hypothesis for the Assign-renders-black report; no recorded closure.',
  'scratchpad/assign-toggle-harness.mjs':
    'UNCLASSIFIABLE. Report-only, and it LOOKS like a gate: it has PASS/FAIL rows and computes '
    + '`bad` on its last line, then never uses it — a failing row exits 0. Second hypothesis for the '
    + 'same report; no recorded closure. The dead tally is recorded in the O49 packet, NOT fixed here.',
  'scratchpad/bo-probe.mjs':
    'UNCLASSIFIABLE. Report-only: "Probe: what state is the freshly booted s4.debug.bin actually '
    + 'in?", non-zero only on a thrown error. No packet, ROADMAP row or lane-log entry names its '
    + 'investigation or its closure; the only doc citing it is the O16 mass-edit table.',
};

{
  // Population: TRACKED files only. An untracked harness cannot be registered
  // by this repo (the same reasoning the tracked/untracked split below uses),
  // so it is out of scope here rather than quietly counted.
  let population = null;
  try {
    population = execFileSync('git', ['ls-files', 'scratchpad'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).filter((f) => HARNESS_LIKE.test(f));
  } catch (e) {
    unmeasurable.push(`G6: \`git ls-files scratchpad\` failed (${e.message}) — the population cannot be `
      + 'enumerated at all, so this run makes NO claim about which harnesses are registered. '
      + 'This is not zero violations.');
  }

  let scripts = null;
  const PKG = join(DIR, '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
    if (pkg.scripts && typeof pkg.scripts === 'object') scripts = pkg.scripts;
    else unmeasurable.push('G6: package.json parsed but has no "scripts" object — cannot ask what is '
      + 'reachable, so this run makes NO claim about registration.');
  } catch (e) {
    unmeasurable.push(`G6: package.json unreadable or unparseable (${e.message}) — cannot ask what is `
      + 'reachable, so this run makes NO claim about registration. This is not zero violations.');
  }

  if (population && scripts) {
    // The script COMMANDS, as text. A `//comment` key holds an array of prose
    // and is not a runnable script; it must not make a file look reachable.
    const commands = Object.entries(scripts)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => ({ name: k, cmd: v }));

    // Match a path at a filename boundary, so `marquee-harness.mjs` is NOT
    // satisfied by a command that runs `marquee-flip-button-harness.mjs`.
    const namesPath = (cmd, p) =>
      new RegExp(`(?<![\\w./-])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w./-])`).test(cmd);

    // One hop: a `.sh` under scratchpad/ that a script dispatches is a door with
    // a name on it. Read each such script once and remember what it names.
    const shReach = new Map();     // basename -> the script name that reaches it
    for (const { name, cmd } of commands) {
      for (const m of cmd.matchAll(/[\w$/.\\-]*scratchpad\/[\w$/.\\-]*\.sh\b/g)) {
        let sh;
        try { sh = readFileSync(join(DIR, '..', m[0]), 'utf8'); }
        catch { continue; }        // a script naming a missing .sh is S-pass business, not G6's
        for (const t of sh.matchAll(/[\w$/.\\-]*?([A-Za-z0-9_.-]+\.mjs)\b/g)) {
          if (!shReach.has(t[1])) shReach.set(t[1], `${name} → ${m[0]}`);
        }
      }
    }

    const reachedBy = (f) => {
      const direct = commands.find((c) => namesPath(c.cmd, f));
      if (direct) return direct.name;
      const viaSh = shReach.get(f.split('/').pop());
      return viaSh ?? null;
    };

    const unreachable = [];
    let reachedCount = 0;
    let viaShCount = 0;
    for (const f of population) {
      const by = reachedBy(f);
      if (by) { reachedCount++; if (by.includes('→')) viaShCount++; continue; }
      if (Object.hasOwn(RETIRED_UNREGISTERED, f)) continue;
      unreachable.push(f);
    }

    // Every G6 message is keyed by the SCRATCHPAD-RELATIVE path, the same shape
    // the other rules use, so the tracked/untracked split below can find it in
    // `git ls-files`. Spelling these `scratchpad/…` would file every one of them
    // as UNTRACKED and quietly make the rule non-fatal.
    const relOf = (f) => f.replace(/^scratchpad\//, '');

    for (const f of unreachable) {
      const slug = f.split('/').pop().replace(HARNESS_LIKE, '');
      fails.push(`G6 ${relOf(f)}: tracked, harness-like, and NO package.json script `
        + 'can reach it — nobody can run it by name, so nothing sweeps it and a red row in it is '
        + `invisible. Add:  "harness:${slug}": "node ${f}"  to package.json (keep the block sorted). `
        + 'If it is report-only — it exits 0 whatever it measured — add it to RETIRED_UNREGISTERED in '
        + 'this file WITH THE REASON instead; a script that can never go red is worse than no script.');
    }

    // The exemption list is itself checked, so it cannot rot into a workaround
    // that outlives its defect.
    const inPopulation = new Set(population);
    for (const [f, why] of Object.entries(RETIRED_UNREGISTERED)) {
      if (!inPopulation.has(f)) {
        // ALWAYS FATAL. This is a claim about THIS FILE'S OWN LIST, not about a
        // file the repo carries — and it fires exactly when the path is not
        // tracked, which is the one condition the untracked split would use to
        // make it non-fatal. Planted and measured: without `alwaysFatal` the
        // whole exemption audit exits 0 over a rotten entry.
        const msg = `G6 ${relOf(f)}: STALE EXEMPTION — RETIRED_UNREGISTERED excuses \`${f}\` and it is not `
          + 'a tracked harness-like file (renamed? deleted?). Delete the entry, or fix the path — an '
          + 'exemption that no longer names anything is a workaround outliving its defect.';
        fails.push(msg); alwaysFatal.add(msg);
        continue;
      }
      const by = reachedBy(f);
      if (by) {
        const msg = `G6 ${relOf(f)}: DEAD EXEMPTION — RETIRED_UNREGISTERED excuses this path, but \`${by}\` `
          + 'already reaches it. One of the two is wrong: either the script should go, or the '
          + 'exemption should. Reason on file: ' + why.slice(0, 80) + '…';
        fails.push(msg); alwaysFatal.add(msg);
      }
    }

    console.log(`\nG6  ${reachedCount}/${population.length} tracked harness-like file(s) reachable by a `
      + `package.json script (${viaShCount} via a dispatched .sh) · `
      + `${Object.keys(RETIRED_UNREGISTERED).length} declared report-only · ${unreachable.length} UNREACHABLE`);
    console.log('    DECLARED REPORT-ONLY, printed every run because an exemption nobody sees is a hole:');
    for (const [f, why] of Object.entries(RETIRED_UNREGISTERED)) {
      console.log(`      ${f}\n        ${why.replace(/\s+/g, ' ')}`);
    }
  }
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
  // `alwaysFatal` is excluded FIRST. Those failures are claims about this
  // repo's own configuration (package.json, this file's exemption list), not
  // about a file the repo may not carry, and G6's STALE EXEMPTION fires exactly
  // when the path it names is untracked — so without this line the split makes
  // that rule non-fatal in precisely the case it exists to catch. Measured, not
  // reasoned: a planted rotten exemption exited 0 before this was here.
  untrackedFails = fails.filter((f) => !alwaysFatal.has(f)
    && !tracked.has(String(f).replace(/^\s*[GS]\d+ /, '').split(':')[0]));
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
