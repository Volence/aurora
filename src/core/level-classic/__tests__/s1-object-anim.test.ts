// s1-object-anim — the layout-preview clock/frame-selection logic.
//
// EXPECTATIONS ARE DERIVED, NEVER HAND-TYPED:
//   • sync rates come from the transcribed SyncAnimEntry rows and are locked
//     against the SHIPPED timeline conversion (syncedTimelineAnims stores the
//     raw byte N−1 for a true period N; Timeline.tsx plays duration+1) — the
//     audit's 12.5% bug was a missed +1, so the +1 here is verified against
//     that code path, not re-asserted by hand;
//   • scripted durations/frames come from parsing the REAL `_anim/*.asm` files
//     with the shipped parseS1DisasmAnimScript;
//   • frame-at-tick is compared against an INDEPENDENT tick-by-tick simulator
//     of Timeline.tsx's playback loop (acc += 1 tick; advance when acc reaches
//     duration+1), never against the closed-form implementation itself.
//
// The real-s1disasm blocks follow the s1-anim-art.test.ts precedent
// (describe.skipIf when the disasm is absent), with a loud warning so the skip
// is never silent.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  S1_PREVIEW_ANIMS, buildScriptPreview, buildSyncPreview, objectAnimStateKey,
  previewStepIndexAt, resolvePreviewAnim, stepHoldTicks,
  type PreviewAnim,
} from '../s1-object-anim';
import { S1_OBJECT_ANIMS, resolveObjectAnims } from '../../project/profiles/s1-object-anims';
import { parseS1DisasmAnimScript } from '../../import/anim-import';
import { syncedTimelineAnims } from '../../../renderer/components/sprite/export-sprite';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);
const S1_PRESENT = referenceCheckout(S1_PINNED);
if (!S1_PRESENT) {
  // eslint-disable-next-line no-console
  console.warn('s1-object-anim.test: s1disasm not found, so the real-script derivation rows are SKIPPED');
}

/** Read + parse one `_anim/*.asm` with the shipped parser; problems must be empty. */
function parseAnimFile(animAsm: string) {
  const text = fs.readFileSync(path.join(S1DIR, animAsm), 'utf-8');
  const { anims, problems } = parseS1DisasmAnimScript(text);
  expect(problems, `${animAsm} parse problems`).toEqual([]);
  return anims;
}

/**
 * Tick-by-tick reference simulation of Timeline.tsx's playback loop for a
 * looping animation: each step holds (duration + 1) ticks (the timer counts
 * D..0 then advances), position cycles through `order`. Returns the step index
 * shown at game frame t. Deliberately structured like the rAF loop (acc/pos),
 * NOT like previewStepIndexAt's closed form.
 */
function simulateTimeline(durations: number[], order: number[], t: number): number {
  let pos = 0;
  let acc = 0;
  for (let tick = 0; tick < t; tick++) {
    acc += 1;
    if (acc >= durations[order[pos]] + 1) {
      acc = 0;
      pos = (pos + 1) % order.length;
    }
  }
  return order[pos];
}

const frameAt = (anim: PreviewAnim, t: number) => anim.steps[previewStepIndexAt(anim, t)].frame;

describe('stepHoldTicks derives from the shipped timeline conversion', () => {
  it('plays every synced entry at its TRUE period (locked against syncedTimelineAnims)', () => {
    let checked = 0;
    for (const [id, link] of Object.entries(S1_OBJECT_ANIMS)) {
      if (!link.sync) continue;
      const timeline = syncedTimelineAnims(link.sync, 64);
      expect(timeline.length, `id ${id} timeline entries`).toBe(link.sync.length);
      for (let i = 0; i < link.sync.length; i++) {
        const entry = link.sync[i];
        const preview = buildSyncPreview(entry)!;
        const tl = timeline[i];
        // Same frames, in the same order.
        expect(preview.steps.map((s) => s.frame)).toEqual(tl.steps.map((s) => s.frameIndex));
        for (let s = 0; s < preview.steps.length; s++) {
          // The timeline stores the RAW byte (framesPerStep − 1) and plays
          // duration+1 ticks; the preview's holdTicks must be that same play
          // length — i.e. the true engine period.
          expect(preview.steps[s].holdTicks, `id ${id} "${entry.name}" step ${s}`)
            .toBe(stepHoldTicks(tl.steps[s].duration));
          expect(preview.steps[s].holdTicks).toBe(entry.framesPerStep);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4); // helix, ring, scattered, giant ring
  });

  it('the Ring spin frame-at-tick matches a tick-accurate timeline simulation', () => {
    const link = resolveObjectAnims(0x25)!;
    const entry = link.sync!.find((s) => s.name === 'spin')!;
    const preview = buildSyncPreview(entry)!;
    const tl = syncedTimelineAnims([entry], 64)[0];
    const durations = tl.steps.map((s) => s.duration);
    const order = tl.steps.map((_, i) => i);
    for (let t = 0; t < 300; t++) {
      const expected = tl.steps[simulateTimeline(durations, order, t)].frameIndex;
      expect(frameAt(preview, t), `ring spin at t=${t}`).toBe(expected);
    }
    // Anti-vacuous: the cycle actually moves (a wrong +1 that still cycles
    // would be caught above; a frozen frame would be caught here).
    expect(new Set(Array.from({ length: 64 }, (_, t) => frameAt(preview, t))).size)
      .toBe(entry.frames.length);
  });
});

describe('synced anims are phase-locked to the shared channel counter', () => {
  it('Ring ($25) and Giant Ring ($4B) share Sync2 and show the same frame at every tick', () => {
    const ring = resolveObjectAnims(0x25)!.sync!.find((s) => s.name === 'spin')!;
    const giant = resolveObjectAnims(0x4b)!.sync!.find((s) => s.name === 'spin')!;
    expect(ring.channel).toBe(giant.channel); // both consume v_ani1_frame
    const a = buildSyncPreview(ring)!;
    const b = buildSyncPreview(giant)!;
    for (let t = 0; t < 200; t++) {
      expect(frameAt(a, t), `t=${t}`).toBe(frameAt(b, t));
    }
  });

  it('two placements of one id read one strip: frame selection has no per-object state', () => {
    // previewStepIndexAt takes only (anim, t): two Rings at the same tick CANNOT
    // disagree. Locked via the state key: one entry per strip, not per object.
    const ring = buildSyncPreview(resolveObjectAnims(0x25)!.sync![0])!;
    const key = objectAnimStateKey([['37', ring]], 12);
    expect(key).toBe(objectAnimStateKey([['37', ring]], 12));
    expect(key).toBe('37=1'); // t=12 → second step (period 8, derived above)
  });
});

describe('script preview control handling (derived from real scripts)', () => {
  it('afEnd loops the whole sequence (Moto Bug .drive vs timeline sim)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
    const anims = parseAnimFile('_anim/Moto Bug.asm');
    const drive = buildScriptPreview(anims, 1)!; // curated locomotion anim
    expect(drive.loopStart).toBe(0);
    expect(anims[1].control?.kind).toBe('loop');
    const raw = anims[1].duration as number;
    const durations = drive.steps.map(() => raw);
    const order = drive.steps.map((_, i) => i);
    for (let t = 0; t < 400; t++) {
      const expected = drive.steps[simulateTimeline(durations, order, t)].frame;
      expect(frameAt(drive, t), `moto drive t=${t}`).toBe(expected);
    }
    // Each step holds (rawDuration + 1) ticks — derived, not hand-typed.
    expect(frameAt(drive, raw)).toBe(drive.steps[0].frame);
    expect(frameAt(drive, raw + 1)).toBe(drive.steps[1].frame);
  });

  it('afBack N re-enters N steps from the end (Newtron .drop)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
    const anims = parseAnimFile('_anim/Newtron.asm');
    expect(anims[1].control).toEqual({ kind: 'back', count: 1 });
    const drop = buildScriptPreview(anims, 1)!;
    expect(drop.loopStart).toBe(drop.steps.length - 1);
    const raw = anims[1].duration as number;
    const introTicks = (drop.steps.length - 1) * stepHoldTicks(raw);
    // Far past the intro, playback holds the final step forever.
    const last = drop.steps[drop.steps.length - 1].frame;
    for (const t of [introTicks, introTicks + 1, introTicks + 500, introTicks + 12345]) {
      expect(frameAt(drop, t), `t=${t}`).toBe(last);
    }
    // And the intro itself plays in order.
    expect(frameAt(drop, 0)).toBe(drop.steps[0].frame);
    expect(frameAt(drop, stepHoldTicks(raw))).toBe(drop.steps[1].frame);
  });

  it('a control that hands off to state code freezes on the last frame (Bumper .touched)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
    const anims = parseAnimFile('_anim/Bumper.asm');
    expect(anims[1].control?.kind).toBe('change');
    const touched = buildScriptPreview(anims, 1)!;
    expect(touched.loopStart).toBe(touched.steps.length - 1);
    expect(frameAt(touched, 100000)).toBe(touched.steps[touched.steps.length - 1].frame);
  });
});

describe('curation table integrity (every row resolves against the real scripts)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
  it('every script row parses, indexes in range, and yields playable steps', () => {
    for (const [idStr, rule] of Object.entries(S1_PREVIEW_ANIMS)) {
      const id = Number(idStr);
      // Representative placements: the subtype/flip-driven rows get the inputs
      // their init code actually derives from.
      const inputs: [number, boolean][] =
        id === 0x16 ? [[0, false], [2, false]]
          : id === 0x26 ? Array.from({ length: 9 }, (_, s) => [s, false] as [number, boolean])
            : id === 0x6d ? [[0, false], [0, true]]
              : [[0, false]];
      for (const [subtype, yflip] of inputs) {
        const resolved = resolvePreviewAnim(id, subtype, yflip);
        expect(resolved, `id $${id.toString(16)} subtype ${subtype} yflip ${yflip}`).not.toBeNull();
        if (resolved!.kind === 'sync') {
          expect(buildSyncPreview(resolved!.entry)).not.toBeNull();
          continue;
        }
        const anims = parseAnimFile(resolved!.animAsm);
        expect(resolved!.animIndex, `id $${id.toString(16)} anim index`).toBeLessThan(anims.length);
        const preview = buildScriptPreview(anims, resolved!.animIndex);
        expect(preview, `id $${id.toString(16)} preview`).not.toBeNull();
        expect(preview!.steps.length).toBeGreaterThan(0);
        for (const s of preview!.steps) expect(s.holdTicks).toBeGreaterThan(0);
      }
    }
  });

  it('every curated id actually has an anim link, and Sonic ($01) has NO row', () => {
    for (const idStr of Object.keys(S1_PREVIEW_ANIMS)) {
      expect(resolveObjectAnims(Number(idStr)), `id $${Number(idStr).toString(16)}`).toBeDefined();
    }
    expect(S1_PREVIEW_ANIMS[0x01]).toBeUndefined();
    expect(resolvePreviewAnim(0x01, 0, false)).toBeNull();
    // The named static exclusions stay static.
    for (const id of [0x17, 0x37, 0x3e, 0x41, 0x42]) {
      expect(resolvePreviewAnim(id, 0, false), `$${id.toString(16)} is a named exclusion`).toBeNull();
    }
  });

  it('the flip/subtype-driven rows pick the anims their init code derives', () => {
    // Harpoon: obAnim = subtype (0 sideways, 2 upright) — "16 LZ Harpoon.asm":25.
    expect((resolvePreviewAnim(0x16, 2, false) as { animIndex: number }).animIndex).toBe(2);
    // Monitor: obAnim = subtype — "26, 2E Monitors…":62.
    expect((resolvePreviewAnim(0x26, 5, false) as { animIndex: number }).animIndex).toBe(5);
    // Flamethrower: vertical flip → valve anims — "6D SBZ Flamethrower.asm":44.
    expect((resolvePreviewAnim(0x6d, 0, true) as { animIndex: number }).animIndex).toBe(2);
    expect((resolvePreviewAnim(0x6d, 0, false) as { animIndex: number }).animIndex).toBe(0);
  });
});

describe('objectAnimStateKey', () => {
  it('changes exactly when some strip steps', () => {
    const ring = buildSyncPreview(resolveObjectAnims(0x25)!.sync![0])!;
    const strips: [string, PreviewAnim][] = [['37', ring]];
    // Period derived from the entry (8 ticks): key is stable inside a hold and
    // moves across the boundary.
    const period = ring.steps[0].holdTicks;
    expect(objectAnimStateKey(strips, 0)).toBe(objectAnimStateKey(strips, period - 1));
    expect(objectAnimStateKey(strips, 0)).not.toBe(objectAnimStateKey(strips, period));
  });
});
