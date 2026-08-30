/**
 * AN INCOMPLETE CHECKOUT, AND WHY THE MARKER TEST CANNOT SEE IT.
 *
 * `referenceCheckout('s1disasm')` (fixture-tree.ts) answers ONE question for the
 * whole tree: *is this a checkout at all?* It requires `sonic.asm`, `_maps` and
 * `levels`, and that is the right shape for its question — an empty directory, a
 * wrong directory, a clone that died before any content landed.
 *
 * It cannot answer the next question down, and its own header says so: *does
 * this checkout contain what THIS ROW reads?* A tree with the three markers but
 * no `artnem/` passes the marker test, and then every row that opens a Nemesis
 * file fails downstream in that row's own vocabulary —
 *
 *     AssertionError: expected 0 to be greater than 0
 *     AssertionError: expected 'error' to be 'opened'
 *     Error: act ghz/1 unavailable: missing 2 required file(s): ghz.act1.tiles.0, …
 *     TypeError: .toMatch() expects to receive a string, but got object
 *
 * — not one of which names a directory, a checkout, or `artnem`. Measured
 * 2026-08-30 across seven incomplete-checkout scenarios: **22 rows in 13 files**
 * (`docs/reviews/2026-08-30-incomplete-checkout-rows.md`). A misdirected failure
 * costs reverts: a sibling lane spent three of them chasing a symbol-resolution
 * bug that was a missing listing file.
 *
 * WHY PER-ROW AND NOT ONE MORE MARKER. Widening `REFERENCE_MARKERS` to cover
 * everything any row reads would make ONE missing file skip all 306 dependent
 * rows — a far larger silent zero than the defect it fixes. The answer to "does
 * this checkout contain what I read" is different for every row, so the guard
 * has to be per-row. What this module provides is the DERIVATION, so that each
 * row names its own inputs without re-implementing the lookup.
 *
 * THE SKIP/FAIL SPLIT, stated because it is a judgement and not a rule of nature:
 *
 *   - A row that measures AURORA against real data it cannot find measures
 *     nothing, so it SKIPS, naming the file. That is this repo's existing house
 *     answer (`enigma.test.ts`'s `map16/GHZ.eni` guard, `render.test.ts`'s
 *     `levels/ghz1.bin` guard, and fixture-tree's own header: *"SKIPPED, and here
 *     is the specific file I could not read"*).
 *
 *   - A row whose SUBJECT IS the checkout's completeness — `s1Adapter … resolves
 *     100% of profile entries`, `classicProjectStore … report 100%, 18 acts`,
 *     `s1-object-art … every linked art + mappings file exists on disk` — keeps
 *     FAILING, because "the input is missing" is the very proposition it tests.
 *     Those three are the LOUD ANCHOR: they read the whole profile and the whole
 *     object-art link table, so an incomplete checkout can never go quietly green
 *     while the per-row guards skip. Verified per scenario in the review note.
 *
 * ⚠ EVERY PREDICATE HERE IS A DIRECT `existsSync` ON A NAMED PATH, never a read
 * of Aurora's own answer. That is what stops a guard masking a bug: if the file
 * is on disk and Aurora still cannot resolve it, the guard does not fire and the
 * row fails, exactly as before.
 */

import { existsSync } from 'node:fs';

import { enumerateProfileEntries } from '../../src/core/project/s1';
import { s1Profile } from '../../src/core/project/profiles/s1';

import { referenceCheckout, referencePath } from './fixture-tree';

/** Absolute path inside the s1disasm checkout (derived, never typed). */
export function s1Path(...rel: string[]): string {
  return referencePath('s1disasm', ...rel);
}

/** The checkout root, for messages. */
export const S1_ROOT = referencePath('s1disasm');

/**
 * Which of `rels` are not on disk, as ABSOLUTE paths.
 *
 * Absolute on purpose: a relative `artnem/Rings.nem` in a failure message does
 * not say WHICH tree, and `AURORA_S1DISASM_REPO` / `AURORA_PEER_ROOT` mean there
 * is more than one candidate.
 */
export function missingS1Files(rels: readonly string[]): string[] {
  return rels.map((r) => s1Path(r)).filter((p) => !existsSync(p));
}

/**
 * The gating files one act needs, as repo-relative paths, DERIVED from the
 * profile the adapter itself enumerates — never a hand-listed set, so a profile
 * change cannot leave this behind.
 *
 * REV00 fallback honoured the same way `resolveEntry` honours it: an entry
 * counts as present if either of its two candidate paths exists.
 */
export function s1ActRequiredFiles(zone: string, act: number): string[] {
  return enumerateProfileEntries(s1Profile)
    .filter((e) => e.gating && e.zone === zone && e.act === act)
    .map((e) => e.variant.path);
}

/** Which of an act's gating files are absent, as absolute paths (REV00-aware). */
export function missingS1ActFiles(zone: string, act: number): string[] {
  return enumerateProfileEntries(s1Profile)
    .filter((e) => e.gating && e.zone === zone && e.act === act)
    .filter((e) => {
      if (existsSync(s1Path(e.variant.path))) return false;
      return !(e.variant.rev00Path !== undefined && existsSync(s1Path(e.variant.rev00Path)));
    })
    .map((e) => s1Path(e.variant.path));
}

/** How many missing paths a reason line spells out before it summarises. */
const REASON_SHOWS = 4;

/**
 * The reason line. NAMES THE MISSING INPUT — that is the entire property this
 * module exists for, so the paths are in the text, not summarised away, and the
 * line says outright that this is a checkout problem rather than an Aurora one.
 */
export function incompleteCheckoutReason(what: string, missing: readonly string[]): string {
  const shown = missing.slice(0, REASON_SHOWS).join(', ');
  const more = missing.length > REASON_SHOWS ? ` (+${missing.length - REASON_SHOWS} more)` : '';
  return `SKIPPED, NOT PASSED: cannot measure ${what} — the s1disasm checkout at ${S1_ROOT} `
    + `is INCOMPLETE: ${missing.length} required file(s) absent: ${shown}${more}. `
    + 'It has the top-level markers but not this data, so this row measures nothing. '
    + 'That is an incomplete checkout, not an Aurora defect.';
}

/**
 * `describe`/`it` options that skip, naming every file, when any of `rels` is
 * absent — or when there is no checkout at all (fixture-tree's question, which
 * still has to be asked first, or the reason would blame a missing `artnem/` on
 * a machine that simply has no disassembly).
 */
export function whenS1Files(what: string, rels: readonly string[]): {
  skip: boolean;
  meta: { skipReason: string };
} {
  if (!referenceCheckout('s1disasm')) {
    return {
      skip: true,
      meta: {
        skipReason: `SKIPPED, NOT PASSED: cannot measure ${what} — no s1disasm checkout at `
          + `${S1_ROOT} (see AURORA_S1DISASM_REPO / AURORA_PEER_ROOT), so this row measures nothing`,
      },
    };
  }
  const missing = missingS1Files(rels);
  return {
    skip: missing.length > 0,
    meta: { skipReason: incompleteCheckoutReason(what, missing) },
  };
}

/** The same, for every gating file of one act. */
export function whenS1Act(zone: string, act: number): {
  skip: boolean;
  meta: { skipReason: string };
} {
  const what = `${zone.toUpperCase()} act ${act} through the real adapter`;
  if (!referenceCheckout('s1disasm')) {
    return {
      skip: true,
      meta: {
        skipReason: `SKIPPED, NOT PASSED: cannot measure ${what} — no s1disasm checkout at `
          + `${S1_ROOT} (see AURORA_S1DISASM_REPO / AURORA_PEER_ROOT), so this row measures nothing`,
      },
    };
  }
  const missing = missingS1ActFiles(zone, act);
  return {
    skip: missing.length > 0,
    meta: { skipReason: incompleteCheckoutReason(what, missing) },
  };
}

/** Options for a row that needs EVERY listed act. */
export function whenS1Acts(...acts: readonly (readonly [string, number])[]): {
  skip: boolean;
  meta: { skipReason: string };
} {
  for (const [zone, act] of acts) {
    const o = whenS1Act(zone, act);
    if (o.skip) return o;
  }
  return { skip: false, meta: { skipReason: '' } };
}

/**
 * The files a discovered sprite set names, READ OFF THE SET ITSELF.
 *
 * Structurally typed rather than importing `DiscoveredSpriteSet`, so this module
 * stays free of renderer types; the shape is exactly the four path-bearing
 * fields. Derived, not transcribed: a row that adds a `frameSources` entry gets
 * it in the guard automatically, which is the whole reason this is a function
 * and not a list beside each row.
 */
export interface SpriteSetPaths {
  mappings?: string;
  art?: string;
  dplc?: string;
  frameSources?: readonly { art?: string }[];
}

export function spriteSetFiles(set: SpriteSetPaths): string[] {
  const out = [set.mappings, set.art, set.dplc, ...(set.frameSources ?? []).map((f) => f.art)];
  return out.filter((p): p is string => typeof p === 'string' && p.length > 0);
}

/**
 * Options for a row whose input is a GLOB over a directory — `map256/*.kos`,
 * `artnem/8x8 - *.nem`. The count is what such rows assert on, and
 * `expect(files.length).toBeGreaterThan(0)` is the shape that produced
 * `expected 0 to be greater than 0`: an enumeration of nothing, reported as an
 * arithmetic complaint.
 *
 * ⚠ THE FILTER IS THE TEST'S OWN, not Aurora's, so skipping on an empty match
 * cannot mask an Aurora regression — there is no Aurora code between the
 * directory and the count. A row that also wants to prove Aurora sees the files
 * must keep its own assertion; this only decides whether there was anything to
 * read.
 */
export function whenS1Glob(dir: string, describeGlob: string, matches: readonly string[]): {
  skip: boolean;
  meta: { skipReason: string };
} {
  const abs = s1Path(dir);
  if (!referenceCheckout('s1disasm')) {
    return {
      skip: true,
      meta: {
        skipReason: `SKIPPED, NOT PASSED: cannot measure ${describeGlob} — no s1disasm checkout `
          + `at ${S1_ROOT} (see AURORA_S1DISASM_REPO / AURORA_PEER_ROOT), so this row measures nothing`,
      },
    };
  }
  if (!existsSync(abs)) {
    return {
      skip: true,
      meta: { skipReason: incompleteCheckoutReason(describeGlob, [abs]) },
    };
  }
  if (matches.length === 0) {
    return {
      skip: true,
      meta: {
        skipReason: `SKIPPED, NOT PASSED: cannot measure ${describeGlob} — ${abs} EXISTS but `
          + 'holds no file matching that pattern, so this row has nothing to read and measures '
          + 'nothing. That is an incomplete s1disasm checkout, not an Aurora defect.',
      },
    };
  }
  return { skip: false, meta: { skipReason: '' } };
}
