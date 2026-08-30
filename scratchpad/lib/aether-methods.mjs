// WHAT A RUN NEEDS FROM THE EMULATOR — derived from source, so it cannot rot.
//
// ── The defect this replaces (O26) ─────────────────────────────────────────
//
// `classic-playtest-harness.mjs` row 0 read the advertised method count out of
// the server's startup banner and did:
//
//     check('0', '… advertises 35 methods (post-parser-drop binary)',
//       elog.includes('listening on') && methods === '35', …);
//     if (methods !== '35') throw new Error('stale oracle-aether binary — aborting');
//
// A current `oracle-aether` serves 53. It served 52 earlier the same day. The
// count moves every time the oracle lane lands a method, so the pin THREW ON
// EVERY CORRECT BINARY and passed only on a stale one — inverted with respect
// to its own stated purpose, and in the row whose job was to make everything
// below it mean something.
//
// The mistake is not the number. It is that a COUNT IS NOT A CAPABILITY. What a
// run depends on is a SET of methods, the set is readable from source, and the
// server publishes the set it serves in its own `initialize` reply. Derive one,
// check it against the other, and there is nothing left to go stale.
//
// ── Two derivations, deliberately kept apart ───────────────────────────────
//
//   observer  every `observer.call('emulator/…')` site in the harness file
//             itself, plus the indirections a literal scan cannot see (below).
//   client    every `'emulator/…'` literal under `src/main/aether/` (tests
//             excluded) — i.e. every method the APP UNDER TEST can put on this
//             socket. A CDP harness drives the real Aurora, so a method the app
//             issues is a method the run needs even though no harness line
//             names it: the live-palette rows land through `push-palette.ts`,
//             Build & Run through `build-run.ts`'s reload.
//
// Kept apart so a failure says WHICH side wanted the missing method — "the
// harness calls it" and "the app calls it" send a reader to different files.
//
// ── Loud on unmeasurable ───────────────────────────────────────────────────
//
// A scan that matched nothing would make the row pass over an empty set: green
// for the reason that it measured nothing, which is the shape this whole parcel
// is about. Both sides refuse an empty result BY NAME rather than returning it,
// and callers are expected to PRINT the two counts so a zero is visible on the
// face of the output instead of being inferred from a pass.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Indirections a literal scan cannot see, each with the reason it is here.
 * Listed rather than guessed: a regex cannot look through a method name.
 */
export const INDIRECT_METHODS = [
  // AetherClient.resolve(name) issues emulator/lookup_symbol on a cache miss
  // (src/main/aether/client.ts). Harnesses call `observer.resolve('Pal_GHZ')`
  // and never name the method.
  { when: /observer\.resolve\(/, method: 'emulator/lookup_symbol' },
];

/** Every `'emulator/…'` string literal in a blob of source. */
export function methodLiteralsIn(text) {
  return new Set([...text.matchAll(/'(emulator\/[a-z0-9_]+)'/g)].map((m) => m[1]));
}

/**
 * The set a run needs.
 *
 * @param harnessSource the harness file's own text
 * @param clientDir     directory of the Aurora Aether client sources
 * @returns {{observer:Set<string>, client:Set<string>, all:Set<string>, files:string[]}}
 * @throws when either scan comes back empty — UNMEASURABLE is not a pass
 */
export function requiredAetherMethods(harnessSource, clientDir) {
  // Only CALL SITES from the harness, not every literal in the file: its
  // comments name methods on purpose and must not become requirements.
  const observer = new Set(
    [...harnessSource.matchAll(/observer\.call\(\s*'(emulator\/[a-z0-9_]+)'/g)].map((m) => m[1]),
  );
  for (const { when, method } of INDIRECT_METHODS) if (when.test(harnessSource)) observer.add(method);
  if (observer.size === 0) {
    throw new Error("UNMEASURABLE: no `observer.call('emulator/…')` site matched in the harness "
      + 'source — the derivation is broken, and a green row over an empty set would mean nothing');
  }

  let files;
  try { files = readdirSync(clientDir).filter((f) => f.endsWith('.ts')); }
  catch (e) { throw new Error(`UNMEASURABLE: cannot read ${clientDir} (${e.code}) — cannot derive what the app calls`); }
  if (files.length === 0) {
    throw new Error(`UNMEASURABLE: no .ts files under ${clientDir} — cannot derive what the app calls`);
  }
  const client = new Set();
  for (const f of files) for (const m of methodLiteralsIn(readFileSync(join(clientDir, f), 'utf8'))) client.add(m);
  if (client.size === 0) {
    throw new Error(`UNMEASURABLE: ${files.length} client source(s) under ${clientDir} named no `
      + 'emulator/* method — the scan is broken, not the server');
  }

  return { observer, client, all: new Set([...observer, ...client]), files };
}

/**
 * The whole row, as data: what is needed, what is served, what is missing.
 * `served` comes from the server's OWN `initialize` reply — never a banner,
 * never a number recorded anywhere in this repo.
 */
export function methodGap(need, servedMethods) {
  const served = new Set(servedMethods);
  const missing = [...need.all].filter((m) => !served.has(m));
  return {
    missing,
    servedCount: served.size,
    summary: `need ${need.all.size} (${need.observer.size} from the harness's own call sites + `
      + `${need.client.size} from the client sources) · served ${served.size}`
      + (missing.length ? ` · MISSING: ${missing.join(' ')}` : ''),
  };
}
