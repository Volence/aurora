// WHICH SCHEMA NODE A CONSTANT IS ACTUALLY READ FROM - proved by moving the
// node, not by comparing the number it yields.
//
// ═══ WHY THIS FILE EXISTS, WHICH IS A VACUITY THIS PARCEL FOUND IN ITSELF ═══
//
// This contract has THREE 0..15 shift spaces: a layer's plain `dsa`/`dsb`,
// `$defs/layerDeform`'s `own.shift_a`/`shift_b`, and the anchor's `at.dsa`/`dsb`.
// The anchor parcel could prove its two constants were separate derivations by
// comparing values, because `channel` is 0..3 and the shifts are 0..15 - the
// numbers differ, so pooling them showed up as a failing assertion.
//
// HERE ALL THREE SPACES ARE 0..15. So the obvious row - "assert the constant
// equals `$defs.layer.properties.dsa`'s minimum and maximum" - PASSES with
// `EFFECTS_LAYER_SHIFT_BOUNDS = EFFECTS_ANCHOR_SHIFT_BOUNDS` substituted for it,
// which is precisely the defect it claims to prevent. That row is in
// scene-ui.test.ts and it is worth keeping (it catches a mistyped path), but on
// its own it is a check that covers most of the field and is silently wrong in
// the corner that matters.
//
// The only thing that distinguishes three nodes holding equal numbers is
// MOVING ONE. Each row below deep-clones the committed schema, perturbs exactly
// one node, re-imports the module against it, and asserts which constants
// followed and which did NOT. A pooled constant fails the "did not follow" half.
//
// ⚠ THE PERTURBATION IS OF THE SCHEMA, WHICH THE ANCHOR PACKET'S §5 WARNS
// AGAINST - for its own gates, and correctly: both sides of those rows derive
// from the schema, so a contract amendment moves them together and the row stays
// honest. That reasoning does not apply here because these rows do not compare
// the module against the schema. They compare the module against ITSELF under a
// perturbation, asking a question the contract's current numbers cannot answer:
// three constants that agree today, do they agree by construction or by
// coincidence? Nothing in the committed contract can be read to find that out.

import { describe, it, expect, vi, afterEach } from 'vitest';

import COMMITTED from '../aurora-effects-scene.schema.json';

const SCHEMA_MODULE = '../aurora-effects-scene.schema.json';

/** The module's constants, evaluated against a schema with one node moved. */
async function importAgainst(
  perturb: (schema: any) => void,
): Promise<typeof import('../scene-ui')> {
  const perturbed = JSON.parse(JSON.stringify(COMMITTED));
  perturb(perturbed);
  vi.resetModules();
  vi.doMock(SCHEMA_MODULE, () => ({ default: perturbed }));
  return import('../scene-ui');
}

afterEach(() => {
  vi.doUnmock(SCHEMA_MODULE);
  vi.resetModules();
});

/**
 * The value all three spaces carry today. Read from the committed schema so
 * this file has no typed-in 15 either; it is the number whose AGREEMENT across
 * three nodes is the hazard these rows exist to measure.
 */
const SHARED_MAX = (COMMITTED as any).$defs.layer.properties.dsa.maximum;

describe('the three 0..15 shift spaces are three derivations, proved by moving one', () => {
  it('ANTI-VACUOUS: the three nodes really do hold the same numbers today', () => {
    const S = COMMITTED as any;
    const own = S.$defs.layerDeform.oneOf.find((b: any) => b?.properties?.own)
      .properties.own.properties.shift_a;
    const anchor = S.properties.anchor.oneOf.find((b: any) => b?.properties?.at)
      .properties.at.properties.dsa;
    // If these ever stop agreeing, a plain value comparison would start being
    // sufficient and this whole file could be reconsidered. While they agree,
    // it is the only instrument that can tell the three apart.
    expect(S.$defs.layer.properties.dsa.maximum).toBe(SHARED_MAX);
    expect(own.maximum).toBe(SHARED_MAX);
    expect(anchor.maximum).toBe(SHARED_MAX);
  });

  /**
   * ⚠ THIS ROW MOVES BOTH LAYER FIELDS, AND THE FIRST DRAFT MOVED ONLY `dsa`.
   * The module refused that schema outright - `EFFECTS_LAYER_SHIFT_NONE`'s own
   * cross-check fired, because a layer whose two fields carry different
   * sentinels has no single "off" for a shared ladder to write. Recorded rather
   * than quietly fixed: the guard caught its author, which is the only evidence
   * a guard is not decorative. The per-field split has its own row below; this
   * one is about the OTHER two shift spaces, so it moves the pair together as a
   * real amendment would.
   */
  it('moving $defs.layer.properties dsa+dsb moves the LAYER bound and NOTHING else', async () => {
    const moved = SHARED_MAX - 8;
    const m = await importAgainst((s) => {
      for (const f of ['dsa', 'dsb']) {
        s.$defs.layer.properties[f].maximum = moved;
        s.$defs.layer.properties[f].default = moved;
      }
    });
    // Followed:
    expect(m.EFFECTS_LAYER_SHIFT_BOUNDS.dsa.max).toBe(moved);
    expect(m.EFFECTS_LAYER_SHIFT_BOUNDS.dsb.max).toBe(moved);
    expect(m.EFFECTS_LAYER_SHIFT_NONE).toBe(moved);
    // Did NOT follow - the half a pooled constant fails:
    expect(m.EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max).toBe(SHARED_MAX);
    expect(m.EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max).toBe(SHARED_MAX);
    expect(m.EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max).toBe(SHARED_MAX);
    expect(m.EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max).toBe(SHARED_MAX);
  });

  it('moving the ANCHOR\'s dsa moves the anchor bound and NOT the layer\'s', async () => {
    const moved = SHARED_MAX - 8;
    const m = await importAgainst((s) => {
      s.properties.anchor.oneOf.find((b: any) => b?.properties?.at)
        .properties.at.properties.dsa.maximum = moved;
    });
    expect(m.EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max).toBe(moved);
    expect(m.EFFECTS_LAYER_SHIFT_BOUNDS.dsa.max).toBe(SHARED_MAX);
    expect(m.EFFECTS_LAYER_SHIFT_NONE).toBe(SHARED_MAX);
  });

  it('moving layerDeform\'s own.shift_a moves THAT bound and not the layer\'s plain one', async () => {
    const moved = SHARED_MAX - 8;
    const m = await importAgainst((s) => {
      s.$defs.layerDeform.oneOf.find((b: any) => b?.properties?.own)
        .properties.own.properties.shift_a.maximum = moved;
    });
    expect(m.EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max).toBe(moved);
    expect(m.EFFECTS_LAYER_SHIFT_BOUNDS.dsa.max).toBe(SHARED_MAX);
    expect(m.EFFECTS_LAYER_SHIFT_NONE).toBe(SHARED_MAX);
  });

  /**
   * THE CROSS-CHECK THAT ONLY THE LAYER'S PAIR CAN HAVE.
   *
   * `EFFECTS_LAYER_SHIFT_NONE` is derived from `maximum` AND asserted equal to
   * `default`, because the control rests on both sentences: the top of the range
   * is what a clamp lands on, and the default is what an absent key already
   * means. A contract that moved one without the other must fail the import
   * rather than leave OFF writing a value that is no longer the absent one.
   */
  it('REFUSES a schema whose layer maximum and default have come apart', async () => {
    await expect(importAgainst((s) => {
      s.$defs.layer.properties.dsb.default = SHARED_MAX - 1;
    })).rejects.toThrow(/default/);
  });

  it('REFUSES a schema where the two layer fields no longer share a sentinel', async () => {
    await expect(importAgainst((s) => {
      s.$defs.layer.properties.dsb.maximum = SHARED_MAX - 1;
      s.$defs.layer.properties.dsb.default = SHARED_MAX - 1;
    })).rejects.toThrow(/no longer share a maximum/);
  });

  /**
   * ANTI-VACUOUS FOR THE WHOLE FILE: the harness really can make the module
   * disagree with the committed contract. Without this row, every "did NOT
   * follow" assertion above would also pass against a mock that silently did
   * nothing at all.
   */
  it('the perturbation harness really reaches the module under test', async () => {
    const m = await importAgainst((s) => {
      s.$defs.layer.properties.dsa.minimum = 3;
    });
    expect(m.EFFECTS_LAYER_SHIFT_BOUNDS.dsa.min).toBe(3);
    expect((COMMITTED as any).$defs.layer.properties.dsa.minimum)
      .not.toBe(3); // and the committed file was not touched
  });
});
