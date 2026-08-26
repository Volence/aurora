// The preview arithmetic, held to the CONSUMER — not to itself.
//
// Every expectation here is either (a) read out of the vendored contract JSON in
// this same test, or (b) an independent restatement of the engine's expression
// that must agree with the module's. Nothing is pinned to a number typed in by
// the author of the module under test, because that is the failure mode this
// repo has shipped twice: a wrong value enshrined in a fixture and a test that
// confirms the fixture.
//
// The independent restatement matters most. `bandSlotSource` is derived from
// the TWO DMAs in `BgAnim_Update`; the test below re-derives the same mapping
// from the OTHER direction the engine documents — the pattern translating by
// `step` pixels — and asserts they agree. A single bug would have to be present
// in both derivations, in opposite forms, to hide.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BGANIM_BANK_MASK, BGANIM_COARSE_SHIFT, DRIVER_VALUE_MASK,
  assertBankCountIsPowerOfTwo, bandDriver, bandDriverValue, bandIsTimeVarying,
  bandPatternPx, bandPhase, bandPreviewStates, bandRateShift, bandRestArtMismatch,
  bandSlotSource, bandStep, bandStepKey, bandStepMask, editorPanToCameraPx,
} from '../../src/core/formats/bg-override/bganim-preview';
import { BGANIM_PHASE_BANKS, TILE_PIXELS, TILE_WIDTH_PX, type BgOverrideBand }
  from '../../src/core/formats/bg-override/bg-override';

const CONTRACT = JSON.parse(readFileSync(
  join(__dirname, '../../src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));

function band(over: Partial<BgOverrideBand> = {}): BgOverrideBand {
  const cols = over.cols ?? 8;
  const rows = over.rows ?? 4;
  const n = cols * rows;
  return {
    cols, rows, pattern_px: cols * 8,
    phases: Array.from({ length: BGANIM_PHASE_BANKS },
      (_, b) => Array.from({ length: n }, (_, t) => Array.from({ length: TILE_PIXELS },
        (_, p) => (b * 7 + t * 3 + p) & 0xF))),
    ...over,
  } as BgOverrideBand;
}

describe('the constants are derived from the contract, not written down', () => {
  it('the bank count comes from the contract and the masks come from the bank count', () => {
    expect(BGANIM_PHASE_BANKS).toBe(CONTRACT.constants.BGANIM_PHASE_BANKS.value);
    expect(BGANIM_BANK_MASK).toBe(BGANIM_PHASE_BANKS - 1);
    expect(BGANIM_COARSE_SHIFT).toBe(Math.log2(BGANIM_PHASE_BANKS));
    expect(Number.isInteger(BGANIM_COARSE_SHIFT)).toBe(true);
    // The engine spells these as `and.w #BGANIM_BANKS-1` and `lsr.w #3`. If the
    // contract's bank count ever moves, these two must move with it or the
    // preview shows a phase the ROM cannot reach.
    expect(1 << BGANIM_COARSE_SHIFT).toBe(BGANIM_PHASE_BANKS);
    expect(() => assertBankCountIsPowerOfTwo()).not.toThrow();
  });

  it('the driver-value mask is one 68000 word', () => {
    expect(DRIVER_VALUE_MASK).toBe(CONTRACT.constants.LAYOUT_WORD_MAX.value);
    expect(DRIVER_VALUE_MASK).toBe(0xFFFF);
  });

  it('step_mask is pattern_px-1, and pattern_px is cols*TILE_WIDTH_PX', () => {
    expect(TILE_WIDTH_PX).toBe(CONTRACT.constants.TILE_WIDTH_PX.value);
    for (const cols of [1, 2, 4, 8, 16]) {
      const b = band({ cols });
      expect(bandPatternPx(b)).toBe(cols * TILE_WIDTH_PX);
      expect(bandStepMask(b)).toBe(cols * TILE_WIDTH_PX - 1);
      // The emitter asserts pattern_px == cols*8 and then computes
      // step_mask = pattern_px - 1; a document field is never consulted.
      expect(bandStepMask({ ...b, pattern_px: 9999 } as BgOverrideBand))
        .toBe(cols * TILE_WIDTH_PX - 1);
    }
  });

  it('an absent rate_shift resolves to the contract default, an absent driver likewise', () => {
    expect(bandRateShift(band())).toBe(CONTRACT.bandKeys.rate_shift.default);
    expect(bandDriver(band())).toBe(CONTRACT.bandKeys.driver.default);
    expect(bandRateShift(band({ rate_shift: 0 }))).toBe(0);
    expect(bandDriver(band({ driver: 'timer' }))).toBe('timer');
  });
});

describe('the step expression is the engine\'s', () => {
  it('step = (driver >> rate_shift) & step_mask', () => {
    const b = band({ cols: 8 });                  // pattern 64px, mask 63
    expect(bandStep(0, 2, bandStepMask(b))).toBe(0);
    expect(bandStep(3, 2, bandStepMask(b))).toBe(0);   // sub-step: no motion
    expect(bandStep(4, 2, bandStepMask(b))).toBe(1);
    expect(bandStep(255, 2, bandStepMask(b))).toBe(63);
    expect(bandStep(256, 2, bandStepMask(b))).toBe(0); // wraps at pattern_px<<shift
  });

  it('the phase splits into a bank and whole columns, and they recompose to `step` px', () => {
    for (let step = 0; step < 64; step++) {
      const { bank, coarseColumns } = bandPhase(step);
      expect(bank).toBe(step % BGANIM_PHASE_BANKS);
      expect(coarseColumns).toBe(Math.floor(step / BGANIM_PHASE_BANKS));
      // The runtime header's own claim: 1px per step, 8 banks per column.
      expect(coarseColumns * TILE_WIDTH_PX + bank).toBe(step);
    }
  });

  it('the slot mapping agrees with the OTHER derivation the engine documents', () => {
    // Independent restatement. The DMA derivation says dest column j is fed by
    // art column (j + coarse) mod cols. The header says the pattern translates
    // toward -x by `step` pixels — so the pixel at band-local x comes from art
    // pixel x + step, whose COLUMN is floor((x + step) / 8) mod cols. At the
    // left edge of dest column j (x = 8j) with the fine phase already carried by
    // the bank, that is (j + coarse) mod cols. Re-derived here from x, not from
    // the DMA, and required to agree slot for slot.
    for (const [cols, rows] of [[8, 4], [4, 2], [16, 1], [2, 8]] as const) {
      for (let step = 0; step < cols * TILE_WIDTH_PX; step++) {
        const { coarseColumns } = bandPhase(step);
        for (let t = 0; t < cols * rows; t++) {
          const destCol = Math.floor(t / rows);
          const row = t % rows;
          const fromPixels = Math.floor(
            ((destCol * TILE_WIDTH_PX + (step - (step & BGANIM_BANK_MASK))) % (cols * TILE_WIDTH_PX))
            / TILE_WIDTH_PX);
          expect(bandSlotSource(t, { cols, rows }, coarseColumns))
            .toBe(fromPixels * rows + row);
        }
      }
    }
  });

  it('at step 0 every slot maps to itself — the rest state is the identity', () => {
    const { coarseColumns } = bandPhase(0);
    for (let t = 0; t < 32; t++) expect(bandSlotSource(t, { cols: 8, rows: 4 }, coarseColumns)).toBe(t);
  });
});

describe('drivers name a scalar source, never an axis', () => {
  const inputs = { cameraXPx: 100, cameraYPx: 200, gameFrame: 300 };

  it('each driver reads its own scalar, masked to a word', () => {
    expect(bandDriverValue('camera_x', inputs)).toBe(100);
    expect(bandDriverValue('camera_y', inputs)).toBe(200);
    expect(bandDriverValue('timer', inputs)).toBe(300);
    expect(bandDriverValue('camera_x', { ...inputs, cameraXPx: 0x1_0005 })).toBe(5);
  });

  it('the driver names are exactly the consumer\'s', () => {
    const names = Object.keys(CONTRACT.drivers).filter((k) => !k.startsWith('$'));
    for (const n of names) expect(() => bandDriverValue(n, inputs)).not.toThrow();
    expect(() => bandDriverValue('camera_z', inputs)).toThrow(/unknown BgAnim driver/);
  });

  it('only `timer` is time-varying — camera_y is NOT vertical motion, and NOT a clock', () => {
    expect(bandIsTimeVarying(band({ driver: 'timer' }))).toBe(true);
    expect(bandIsTimeVarying(band({ driver: 'camera_x' }))).toBe(false);
    expect(bandIsTimeVarying(band({ driver: 'camera_y' }))).toBe(false);
    // The default driver is a camera one, so a band with no `driver` key is
    // clockless: the common case must not start a rAF.
    expect(bandIsTimeVarying(band())).toBe(false);
  });

  it('a camera band\'s step is a pure function of the pan, and a timer band\'s is not', () => {
    const cam = [band({ driver: 'camera_x' })];
    const a = bandPreviewStates(cam, { cameraXPx: 40, cameraYPx: 0, gameFrame: 0 });
    const b = bandPreviewStates(cam, { cameraXPx: 40, cameraYPx: 0, gameFrame: 9999 });
    expect(bandStepKey(a)).toBe(bandStepKey(b));         // time moved, phase did not
    const c = bandPreviewStates(cam, { cameraXPx: 44, cameraYPx: 0, gameFrame: 0 });
    expect(bandStepKey(c)).not.toBe(bandStepKey(a));     // one rate_shift of pan did

    const tim = [band({ driver: 'timer' })];
    const t0 = bandPreviewStates(tim, { cameraXPx: 0, cameraYPx: 0, gameFrame: 0 });
    const t1 = bandPreviewStates(tim, { cameraXPx: 9999, cameraYPx: 9999, gameFrame: 0 });
    expect(bandStepKey(t1)).toBe(bandStepKey(t0));       // panning does not move a timer band
    const t2 = bandPreviewStates(tim, { cameraXPx: 0, cameraYPx: 0, gameFrame: 4 });
    expect(bandStepKey(t2)).not.toBe(bandStepKey(t0));
  });
});

describe('the editor pan maps onto Camera_X/Y', () => {
  it('truncates to the integer pixel BEFORE the shift', () => {
    // The runtime reads the 16.16 HIGH word: sub-pixel camera motion does not
    // advance a band at all. Truncating after the shift would smear phase.
    expect(editorPanToCameraPx(7.99)).toBe(7);
    expect(editorPanToCameraPx(8)).toBe(8);
    const mask = bandStepMask(band({ cols: 8 }));
    expect(bandStep(editorPanToCameraPx(7.99), 2, mask))
      .toBe(bandStep(editorPanToCameraPx(7.0), 2, mask));
  });

  it('floors at 0 and wraps at one word', () => {
    expect(editorPanToCameraPx(-5)).toBe(0);
    expect(editorPanToCameraPx(Number.NaN)).toBe(0);
    expect(editorPanToCameraPx(65536)).toBe(0);
    expect(editorPanToCameraPx(65537.5)).toBe(1);
  });

  it('is NOT scaled by zoom — vpX is already unzoomed world px', () => {
    // Guards the ruling's §4 prediction, which was the other way round. If a
    // zoom factor is ever reintroduced here it must be argued at the call site,
    // not slipped in: this row would fail.
    expect(editorPanToCameraPx(512)).toBe(512);
  });
});

describe('the step key is what gates a repaint', () => {
  it('holds still across a whole rate_shift window and moves at its edge', () => {
    const b = [band({ driver: 'timer', rate_shift: 2 })];
    const keyAt = (f: number) => bandStepKey(bandPreviewStates(b, { cameraXPx: 0, cameraYPx: 0, gameFrame: f }));
    const changes = [];
    for (let f = 1; f <= 240; f++) if (keyAt(f) !== keyAt(f - 1)) changes.push(f);
    // 240 game frames = 4s at 60Hz; at rate_shift 2 that is 240/4 = 60 steps.
    expect(changes.length).toBe(240 >> 2);
    expect(changes.every((f, i) => f === (i + 1) * 4)).toBe(true);
  });

  it('two bands both appear in the key, so either one moving repaints', () => {
    const bands = [band({ driver: 'timer' }), band({ driver: 'camera_x' })];
    const k = bandStepKey(bandPreviewStates(bands, { cameraXPx: 0, cameraYPx: 0, gameFrame: 0 }));
    expect(k.split(',')).toHaveLength(2);
  });

  it('slot bases are WALKED, not read from the slot_base key', () => {
    const states = bandPreviewStates(
      [band({ cols: 8, rows: 4, slot_base: 999 }), band({ cols: 4, rows: 2 })],
      { cameraXPx: 0, cameraYPx: 0, gameFrame: 0 });
    expect(states.map((s) => s.slotBase)).toEqual([0, 32]);
    expect(states.map((s) => s.tileCount)).toEqual([32, 8]);
  });
});

describe('the substitution licence — the prefix identity against the DISPLAYED blob', () => {
  const b = band({ cols: 2, rows: 2 });
  const asTiles = (rows: number[][]) => rows.map((pixels) => ({ pixels: Uint8Array.from(pixels) }));

  it('passes when the blob holds the band\'s rest art at its own slots', () => {
    const blob = asTiles([...b.phases[0], ...b.phases[0]]);
    expect(bandRestArtMismatch(b, 0, blob)).toBeNull();
    expect(bandRestArtMismatch(b, 4, blob)).toBeNull();
  });

  it('fails, with a reason, on a blob holding different art', () => {
    const blob = asTiles(b.phases[0].map((t, i) => (i === 2 ? t.map((p) => p ^ 1) : t)));
    expect(bandRestArtMismatch(b, 0, blob)).toMatch(/slot 2 on screen is not the band's rest art/);
  });

  it('fails when the blob is too short to reach the band\'s slots', () => {
    expect(bandRestArtMismatch(b, 0, asTiles(b.phases[0].slice(0, 2))))
      .toMatch(/does not reach the band's slots 0\.\.3/);
  });

  it('fails on a malformed phases[0] rather than reading past it', () => {
    const broken = { ...b, phases: [b.phases[0].slice(0, 1), ...b.phases.slice(1)] } as BgOverrideBand;
    expect(bandRestArtMismatch(broken, 0, asTiles(b.phases[0]))).toMatch(/holds 1 tile/);
  });
});
