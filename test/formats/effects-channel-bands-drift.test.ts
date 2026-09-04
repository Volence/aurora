// The vendored CHANNEL-BANDS drift gate — the preset schema gate's twin, for
// the one runtime document Aurora vendors from AEON rather than from empyrean.
//
// It answers four separate questions, and they are separate on purpose:
//
//   1. Is the vendored copy the blob Aurora pinned?   (byte identity)
//   2. Does the sidecar describe the file on disk?    (no hand-edited provenance)
//   3. Is that pin still what aeon publishes?         (CURRENCY — the question a
//                                                      pinned blob can never
//                                                      answer about itself)
//   4. Is the pinned revision PUBLISHED, not local-only?
//
// (1), (2) and the interlock rows at the foot need no peer repo at all and are
// the property this vendoring exists to make checkable. (3) and (4) read aeon
// at a COMMITTED revision through git objects — never through the sibling
// working tree, which on this machine is a live lane checkout — name the
// revision in every message, FAIL on drift, and SKIP LOUDLY when they cannot
// run. A failure in (3) or (4) is NOT an Aurora regression: aeon's generated
// sidecar moved and the pin needs re-vendoring. The message says how.
//
// ⚠ WHY THIS FILE AND NOT test/formats/aeon-fixture-currency.test.ts. That
// file's table is scoped to `test/fixtures`, where a vendored document is a
// TEST FIXTURE. This one is not: `aeon-effects-channel-bands.json` is imported
// by `src/core/formats/effects/channel-bands.ts` and read at RUNTIME to compute
// the warning under the Travel select, so it lives beside the two schemas in
// `src/core/formats/effects/` and takes the SCHEMA's gate shape
// (`effects-preset-schema-drift.test.ts`), including its own published-revision
// row. Nothing here is a second copy of the fixture machinery; it is the same
// four questions asked about a file in a different population.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { peerRepo, resolveRev, readAtRev, isAncestor, gitBlobSha } from '../support/peer-repo';
import {
  EFFECTS_CHANNEL_BANDS, EFFECTS_CHANNEL_BANDS_GAME, anchorTravelPx,
  EFFECTS_CHANNEL_BAND_EDGE_HI, EFFECTS_CHANNEL_BAND_EDGE_LO,
} from '../../src/core/formats/effects/channel-bands';
import { ANCHOR_AMP_RUNGS } from '../../src/core/formats/effects/preset';

const BANDS_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aeon-effects-channel-bands.json',
);
const PROVENANCE_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aeon-effects-channel-bands.provenance.json',
);

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  aeon: { path: string; revision: string; blob: string; branch_that_answers_currency: string };
  vendored: { path: string; git_blob: string; bytes: number };
};

const BYTES = readFileSync(BANDS_PATH, 'utf8');

/** Prefix every cross-repo message with this so nobody triages it as ours. */
const NOT_OURS = 'NOT AN AURORA REGRESSION — the vendored aeon channel-bands sidecar is stale.';

describe('aeon channel bands — vendored copy drift gate', () => {
  it('the vendored sidecar is byte-identical to the pinned aeon blob', () => {
    // Anti-vacuous: we hashed a real document, not an empty or missing file, and
    // one that carries the two things the feature is computed from.
    const doc = JSON.parse(BYTES) as { schema: string; channels: Record<string, unknown> };
    expect(doc.schema).toBe('aeon-effects-channel-bands/1');
    expect(Object.keys(doc.channels).length).toBeGreaterThan(0);
    expect(PROV.aeon.blob, 'the sidecar records no 40-hex aeon blob').toMatch(/^[0-9a-f]{40}$/);
    // `gitBlobSha` is git's own object id, so this compares against the SAME
    // object aeon stores rather than against a hash only Aurora computes.
    expect(gitBlobSha(BYTES)).toBe(PROV.aeon.blob);
  });

  it('the provenance sidecar describes the file actually on disk', () => {
    expect(PROV.aeon.revision, 'no 40-hex aeon revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.aeon.path).toBe('games/sonic4/data/generated/effects_channel_bands.json');
    expect(PROV.vendored.path).toBe('src/core/formats/effects/aeon-effects-channel-bands.json');
    expect(PROV.vendored.git_blob).toBe(PROV.aeon.blob);
    expect(PROV.vendored.bytes).toBe(Buffer.byteLength(BYTES, 'utf8'));
  });

  /**
   * The module must be reading the vendored file, not a restatement of it —
   * the preset schema gate's `toEqual(onDisk)` row, in the shape this module
   * allows (it exposes a parsed, frozen view rather than the raw document).
   */
  it('the module reads the vendored file, not a restatement', () => {
    const doc = JSON.parse(BYTES) as {
      game: string;
      channels: Record<string, { lo: number; hi: number; lines: number; source: string }>;
      edges: Record<string, { behaviour: string; note: string }>;
    };
    expect(EFFECTS_CHANNEL_BANDS_GAME).toBe(doc.game);
    expect([...EFFECTS_CHANNEL_BANDS.keys()].sort((a, b) => a - b))
      .toEqual(Object.keys(doc.channels).map(Number).sort((a, b) => a - b));
    for (const [key, v] of Object.entries(doc.channels)) {
      expect(EFFECTS_CHANNEL_BANDS.get(Number(key)))
        .toEqual({ channel: Number(key), lo: v.lo, hi: v.hi, lines: v.lines, source: v.source });
    }
    expect(EFFECTS_CHANNEL_BAND_EDGE_HI)
      .toEqual({ behaviour: doc.edges.hi.behaviour, note: doc.edges.hi.note });
    expect(EFFECTS_CHANNEL_BAND_EDGE_LO)
      .toEqual({ behaviour: doc.edges.lo.behaviour, note: doc.edges.lo.note });
  });

  /**
   * ═══ THE INTERLOCK BETWEEN TWO CONTRACTS PUBLISHED BY TWO REPOS ═══
   *
   * The fit rule is aeon's (`2 * (256 >> amp_shift)`, in this sidecar's
   * `how_to_use`). The ladder the panel LABELS a sweep with is empyrean's
   * (`peak excursion 256 >> amp_shift px`, in the preset schema, doubled by
   * `preset.ts`). Nothing compared them before this parcel.
   *
   * ⚠ AND THE FACTOR OF 2 IS NOT DECORATION. aeon's own `how_to_use` said
   * `256 >> amp_shift` — PEAK, not peak-to-peak — until aeon 8d217dd4. A fit
   * test built on that wording is wrong by 2x in the PERMISSIVE direction: it
   * stays silent on sweeps that certainly do not fit, which is the failure
   * nobody reports. So this row asserts the formula against the ladder on every
   * rung, and asserts the ladder is not empty.
   */
  it('aeon\'s fit formula and the preset schema\'s amplitude ladder agree on every rung', () => {
    expect(ANCHOR_AMP_RUNGS.length).toBe(7);
    for (const r of ANCHOR_AMP_RUNGS) {
      expect(r.peak_to_peak_px, `amp_shift ${r.amp_shift}`).toBe(anchorTravelPx(r.amp_shift));
      // ...and it really is TWICE the peak, so a formula that had lost its 2
      // could not satisfy both halves of this row at once.
      expect(r.peak_to_peak_px).toBe(r.peak_px * 2);
    }
    // The contract's own numbers, spelled out: 256 >> 2 = 64 peak = 128 travel,
    // down to 256 >> 8 = 1 peak = 2 travel.
    expect(ANCHOR_AMP_RUNGS.map((r) => anchorTravelPx(r.amp_shift)))
      .toEqual([128, 64, 32, 16, 8, 4, 2]);
  });

  /**
   * `lines` is the file's own INCLUSIVE count, and `channel-bands.ts` refuses to
   * load a document where it is not. Asserted here on the committed bytes so a
   * re-vendor that changes the counting convention fails with the reason named,
   * rather than shifting every fit verdict by one.
   */
  it('every declared band\'s `lines` is the INCLUSIVE count over [lo, hi]', () => {
    expect(EFFECTS_CHANNEL_BANDS.size).toBeGreaterThan(0);
    for (const b of EFFECTS_CHANNEL_BANDS.values()) {
      expect(b.lines, `channel ${b.channel}`).toBe(b.hi - b.lo + 1);
    }
  });
});

describe('CURRENCY: is the vendored channel-bands sidecar still what aeon publishes?', () => {
  const aeon = peerRepo('aeon');
  const TIP = PROV.aeon.branch_that_answers_currency;

  it(`matches ${PROV.aeon.path} at aeon ${TIP}`, (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) — '
        + `CANNOT MEASURE whether the pin ${PROV.aeon.revision} for `
        + 'src/core/formats/effects/aeon-effects-channel-bands.json is still current');
      return;
    }
    const tip = resolveRev(aeon, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} — CANNOT MEASURE `
        + `currency of pin ${PROV.aeon.revision}`);
      return;
    }
    const at = readAtRev(aeon, tip, PROV.aeon.path);
    // Not a skip: the revision resolved, so this WAS measured, and the source
    // document vanishing at aeon's tip is drift of the loudest kind.
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    // CONTENT, not commit SHAs — aeon's ordinary commits must not turn us red.
    expect(
      at.text,
      `${NOT_OURS}\n`
      + `  pinned at aeon ${PROV.aeon.revision} (blob ${PROV.aeon.blob})\n`
      + `  aeon ${TIP} is now ${tip} (blob ${at.blob})\n`
      + `  ${PROV.aeon.path} changed between them.\n`
      + `  Re-vendor:  git -C ${aeon} show ${tip}:${PROV.aeon.path} > ${PROV.vendored.path}\n`
      + '  then update the provenance sidecar (revision, revision_subject, blob, bytes,\n'
      + '  git_blob, pin_history_current_last). channel-bands.ts throws at load if a\n'
      + '  load-bearing sentence moved, so the module will tell you what else changed —\n'
      + '  in particular whether the fit is still ONE-DIRECTIONAL and still peak-to-peak.',
    ).toBe(BYTES);
  });

  it('the pinned aeon revision is PUBLISHED, not local-only', (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) — '
        + `CANNOT MEASURE whether ${PROV.aeon.revision} is reachable from ${TIP}`);
      return;
    }
    const tip = resolveRev(aeon, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} — CANNOT MEASURE `
        + `reachability of ${PROV.aeon.revision}`);
      return;
    }
    expect(
      isAncestor(aeon, PROV.aeon.revision, tip),
      `${NOT_OURS}\n  ${PROV.aeon.revision} is NOT reachable from aeon ${TIP} (${tip}) — `
      + 'local-only, or the branch was rewritten; a peer cannot check a pin at a SHA they '
      + 'cannot fetch',
    ).toBe(true);
  });
});
