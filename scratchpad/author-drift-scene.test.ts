// ONE-OFF AUTHORING STEP for the on-screen drift proof. Not a test of anything —
// it is a vitest file only because vitest is the TypeScript runner this repo has.
//
// WHY IT GOES THROUGH AURORA'S CODEC INSTEAD OF WRITING JSON BY HAND: the seam
// under test is Aurora's export -> aeon's generator. Hand-writing the JSON walks
// around the exact join the proof exists to exercise, and would still produce a
// green-looking ROM.
//
// WHY A CONTROL LAYER IS AUTHORED HERE RATHER THAN BORROWED FROM THE SHIPPED
// SCENE (aeon's correction, 2026-09-02): the shipped hand-authored OJZ scene has
// all four bands at Rate(-32), so "a layer on the same plane that must not move"
// does not exist in it — the nearest candidate drifts at the SAME rate and would
// read as a passing control while proving nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { parseEffectsScene, serializeEffectsScene } from '../src/core/formats/effects/scene';
import { driftPxPerFrameToRate } from '../src/core/formats/effects/scene-ui';

const SCENE = process.env.DRIFT_SCENE_PATH!;
const DRIFT_LAYER = Number(process.env.DRIFT_LAYER ?? '2');
const PX_PER_FRAME = Number(process.env.DRIFT_PX ?? '-1');

describe('author a drift scene through Aurora export', () => {
  it('writes one drifting layer and leaves the rest as a control', () => {
    const scene = parseEffectsScene(readFileSync(SCENE, 'utf8'), 'ojz_act1_start');

    const rate = driftPxPerFrameToRate(PX_PER_FRAME);
    // Sign is load-bearing and a dropped sign passes a magnitude check.
    expect(Math.sign(rate)).toBe(Math.sign(PX_PER_FRAME));
    expect(Math.abs(rate)).toBe(Math.abs(PX_PER_FRAME) * 256);

    const layers = scene.layers as any[];
    expect(layers.length).toBeGreaterThan(DRIFT_LAYER);
    layers[DRIFT_LAYER].drift = { rate };
    // Every OTHER layer must carry no drift — this is the control and its
    // absence is asserted, not assumed.
    layers.forEach((l, i) => { if (i !== DRIFT_LAYER) expect(l.drift ?? undefined).toBeUndefined(); });

    const out = serializeEffectsScene(scene as any);
    writeFileSync(SCENE, out);

    // Re-read through the parser: what landed on disk is what we meant.
    const back = parseEffectsScene(readFileSync(SCENE, 'utf8'), 'ojz_act1_start');
    expect((back.layers as any[])[DRIFT_LAYER].drift).toEqual({ rate });
    const others = (back.layers as any[]).filter((_, i) => i !== DRIFT_LAYER);
    expect(others.every((l) => (l.drift ?? undefined) === undefined)).toBe(true);

    console.log(`AUTHORED: layer ${DRIFT_LAYER} drift rate=${rate} (${PX_PER_FRAME} px/frame); `
      + `${others.length} control layer(s) with no drift -> ${SCENE}`);
  });
});
