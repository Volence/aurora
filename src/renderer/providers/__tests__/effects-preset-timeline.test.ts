// THE TIMELINE'S EDITING MODEL — what a split IS, and what bounds an edge.
//
// ROADMAP §5.1 row 94. Every rule here belongs to aeon's shipped
// `engine/effects/raster_dsl.emp`, and the rows below are shaped by which KIND
// of rule each one is:
//
//   • THE HARD PAIR — the fire bound (3..223) and `top < bot`. True whatever
//     else the document says, so the DRAG CLAMPS to them and a row can sweep
//     them exhaustively.
//   • THE SOFT PAIR — no two bands on one fire line, and no vertical overlap
//     between bands that share CRAM. Both depend on ANOTHER band's values, so
//     they ADVISE, and the rows have to prove BOTH directions: that a colliding
//     pair is named AND that a legal nesting is left alone. A guard that refused
//     everything would pass every refusal row in this file.
//
// ⚠ WHAT THESE ROWS CANNOT SEE. There is no React and no canvas here, so nothing
// below can tell a working drag from a function that a pointer never reaches.
// The gesture is `scratchpad/timeline-edit-harness.mjs`'s job and it drives the
// real app. Said out loud so a green here is not read as more than it is.
//
// ⚠ AND THE VACUITY TRAP SPECIFIC TO THIS PARCEL: a `splitBandCommand` that
// returned null for everything would satisfy every "refuses" row. The admission
// rows are named as such in their titles, and the sweep in "every legal cut"
// fails on a single null.

import { describe, it, expect } from 'vitest';
import {
  bandCramSpan, bandFireLines, bandEdgeBounds, clampBandEdge, bandEdgeNotice,
  bandCollisionAdvisory, bandSplitRefusal, bandSplitLine, bandSplitMinHeight,
  splitBandCommand, newBand,
  BAND_EDGE_LAW, BAND_ORDER_LAW, BAND_GAP_LAW, BAND_OVERLAP_LAW, BAND_SPLIT_LAW,
} from '../effects-preset';
import { EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX } from '../effects-aeon';
import type {
  EffectsPreset, EffectsPresetBand, EffectsPresetLibrary,
} from '../../../core/formats/effects/preset';

const MIN = EFFECTS_FIRE_LINE_MIN;
const MAX = EFFECTS_FIRE_LINE_MAX;

/** A band over a CRAM span the caller names, so span overlap is authored, not incidental. */
function band(top: number, bot: number, addr = 74, words = 1, sh: boolean | 0 | 1 = false): EffectsPresetBand {
  return { top, bot, sh, on: { cram: { addr, colours: Array.from({ length: words }, () => 0) } } };
}

function preset(bands: EffectsPresetBand[], id = 'edge_test'): EffectsPreset {
  return { schema: 1, id, bands };
}

function library(p: EffectsPreset): EffectsPresetLibrary {
  return { presets: [p], unreadable: [], notices: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// The two spans a band occupies — CRAM bytes, and screen lines it FIRES on
// ═══════════════════════════════════════════════════════════════════════════

describe('what a band occupies', () => {
  it('a cram band spans two bytes per colour from addr — the LENGTH is the size', () => {
    expect(bandCramSpan(band(10, 20, 74, 3))).toEqual({ start: 74, end: 80 });
  });

  it('a pal_region band spans two bytes per `count`, from its own addr', () => {
    const b: EffectsPresetBand = {
      top: 10, bot: 20, sh: false,
      on: { pal_region: { addr: 96, slot: 0, pal_line: 3, entry: 0, count: 4 } },
    };
    expect(bandCramSpan(b)).toEqual({ start: 96, end: 104 });
  });

  it('a plain band fires TWICE — its two edges, and nothing between them', () => {
    expect(bandFireLines(band(40, 60))).toEqual([40, 60]);
  });

  it('an S/H band fires THREE times: the de-mix sits at bot-1, INSIDE its own interval', () => {
    // aeon `band()`: `[f_on_sh, fire(bot - 1, [reg_sh_off()]), fire(bot, ...)]`.
    // The extra line never widens the band's footprint — which is why it can only
    // matter to a NEIGHBOUR, and why the collision walk reads this list.
    expect(bandFireLines(band(40, 60, 74, 1, true))).toEqual([40, 59, 60]);
    expect(Math.min(...bandFireLines(band(40, 60, 74, 1, true)))).toBe(40);
    expect(Math.max(...bandFireLines(band(40, 60, 74, 1, true)))).toBe(60);
  });

  it('and it collapses rather than repeating a line when bot-1 IS top', () => {
    expect(bandFireLines(band(40, 41, 74, 1, true))).toEqual([40, 41]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE HARD PAIR — what a drag may reach, swept
// ═══════════════════════════════════════════════════════════════════════════

describe('what bounds an edge', () => {
  it('the floor is the PROVIDER\'s fire bound, not a second copy of 3', () => {
    // A band's edges and a vsplit's fire are the same engine `ensure`. If this
    // module grew its own literal, this row is what notices.
    expect(bandEdgeBounds(band(50, 100), 'top').min).toBe(MIN);
    expect(bandEdgeBounds(band(50, 100), 'bot').max).toBe(MAX);
  });

  it('top is held UNDER bot, and bot is held OVER top — the order rule, both ways', () => {
    expect(bandEdgeBounds(band(50, 100), 'top').max).toBe(99);
    expect(bandEdgeBounds(band(50, 100), 'bot').min).toBe(51);
  });

  it('a band whose bot is off the bottom is held by the FIRE ceiling, not by bot', () => {
    // The two rules can both be candidates for one edge and they give different
    // answers; naming the wrong one sends the author to change the wrong field.
    expect(bandEdgeBounds(band(50, 400), 'top').max).toBe(MAX);
    expect(bandEdgeBounds(band(50, 100), 'top').max).toBe(99);
  });

  it('SWEPT: every legal line for either edge is reachable, and nothing outside is', () => {
    const b = band(MIN, MAX);
    for (let v = MIN - 4; v <= MAX + 4; v++) {
      const top = clampBandEdge(b, 'top', v);
      const bot = clampBandEdge(b, 'bot', v);
      expect(top).toBeGreaterThanOrEqual(MIN);
      expect(top).toBeLessThanOrEqual(MAX - 1);
      expect(bot).toBeGreaterThanOrEqual(MIN + 1);
      expect(bot).toBeLessThanOrEqual(MAX);
      if (v >= MIN && v <= MAX - 1) expect(top).toBe(v);
      if (v >= MIN + 1 && v <= MAX) expect(bot).toBe(v);
    }
  });

  it('a fractional pointer asks for the NEAREST line, not the floor of it', () => {
    // `stripYToLine` is fractional on purpose; a guide dropped on 66.6 is asking
    // for 67. Truncating instead would bias every drag one line upward.
    expect(clampBandEdge(band(50, 100), 'top', 66.6)).toBe(67);
    expect(clampBandEdge(band(50, 100), 'top', 66.4)).toBe(66);
  });
});

describe('the sentence a held edge says', () => {
  it('SAYS NOTHING while the drag is legal — swept over the whole legal band', () => {
    // The majority case, and a requirement rather than a nicety: an advisory
    // that is always on screen is read as decoration within a day.
    const b = band(MIN, MAX);
    for (let v = MIN; v <= MAX - 1; v++) expect(bandEdgeNotice(b, 'top', v)).toBeNull();
    for (let v = MIN + 1; v <= MAX; v++) expect(bandEdgeNotice(b, 'bot', v)).toBeNull();
  });

  it('names the FIRE law at the fire bound, in the engine\'s own numbers', () => {
    const n = bandEdgeNotice(band(50, 100), 'top', MIN - 1);
    expect(n?.rule).toBe('fire');
    expect(n?.limit).toBe(MIN);
    expect(n?.text).toContain(`${MIN}..${MAX}`);
    expect(n?.text).toContain(BAND_EDGE_LAW);
  });

  it('names the ORDER law when the OTHER EDGE is what stopped it', () => {
    const n = bandEdgeNotice(band(50, 100), 'top', 150);
    expect(n?.rule).toBe('order');
    expect(n?.limit).toBe(99);
    expect(n?.text).toContain(BAND_ORDER_LAW);
    // ⚠ THE DISCRIMINATING HALF: it must NOT say the fire law here. A message
    // that named 3..223 would send the author to move a bound that is not the
    // one holding them.
    expect(n?.text).not.toContain(`${MIN}..${MAX}`);
  });

  it('and the fire ceiling wins over the order rule when it is the tighter one', () => {
    expect(bandEdgeNotice(band(50, 400), 'top', MAX + 10)?.rule).toBe('fire');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SOFT PAIR — and BOTH directions of each
// ═══════════════════════════════════════════════════════════════════════════

describe('what one band collides with in the rest of the preset', () => {
  it('ABUTTING BANDS ARE REFUSED — bot == the next top is one fire line, not a tight fit', () => {
    // The rule that decides what a split is. `compose` merges same-line fires
    // into ONE record and `raster_program` refuses it: "the restore's fire
    // carries the restore ONLY".
    const p = preset([band(40, 80), band(80, 120)]);
    expect(bandCollisionAdvisory(p, 0)).toContain('both fire on screen line 80');
    expect(bandCollisionAdvisory(p, 0)).toContain(BAND_GAP_LAW);
    expect(bandCollisionAdvisory(p, 1)).toContain('screen line 80');
  });

  it('ONE CLEAR LINE IS ENOUGH — the ADMISSION that makes the row above mean something', () => {
    expect(bandCollisionAdvisory(preset([band(40, 80), band(81, 120)]), 0)).toBeNull();
    expect(bandCollisionAdvisory(preset([band(40, 80), band(81, 120)]), 1)).toBeNull();
  });

  it('an S/H band\'s DE-MIX line collides too — the fire a two-edge model cannot see', () => {
    // {100,140,sh} fires at 100, 139 and 140. A neighbour whose top is 139 shares
    // a line with a fire neither band's `top`/`bot` mentions.
    const p = preset([band(100, 140, 74, 1, true), band(139, 180, 200, 1)]);
    expect(bandCollisionAdvisory(p, 0)).toContain('screen line 139');
    // ...and with the S/H off, the same pair is legal, which is what proves the
    // row above is measuring `sh` and not the pair.
    expect(bandCollisionAdvisory(preset([band(100, 140), band(139, 180, 200, 1)]), 0)).toBeNull();
  });

  it('OVERLAPPING BANDS OVER SHARED CRAM are refused, with the ownership rule', () => {
    const p = preset([band(40, 120, 74, 2), band(60, 100, 76, 2)]);
    const s = bandCollisionAdvisory(p, 0);
    expect(s).toContain('overlap vertically');
    expect(s).toContain(BAND_OVERLAP_LAW);
    expect(s).toContain('CRAM bytes 76..77');
  });

  it('BUT NESTING OVER DISJOINT CRAM IS LEGAL, and is left alone — the second admission', () => {
    // ⚠ THE ROW THAT STOPS THIS BECOMING A WALL. `check_band_ownership` is a
    // PER-CRAM-ENTRY walk: two bands that never touch the same entry are not its
    // business, and an editor that refused this would refuse a program the engine
    // builds. This is why the collision is an advisory and not a clamp.
    expect(bandCollisionAdvisory(preset([band(40, 120, 74, 2), band(60, 100, 200, 2)]), 0)).toBeNull();
  });

  it('says nothing at all about a lone band', () => {
    expect(bandCollisionAdvisory(preset([band(40, 80)]), 0)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SPLIT
// ═══════════════════════════════════════════════════════════════════════════

describe('what a split is', () => {
  it('the minimum height is DERIVED from the two inequalities, not written down', () => {
    // upper needs `top < cut`, lower needs `cut + 1 < bot`.
    const need = bandSplitMinHeight();
    expect(bandSplitRefusal(band(50, 50 + need))).toBeNull();
    expect(bandSplitRefusal(band(50, 50 + need - 1))).not.toBeNull();
    expect(bandSplitRefusal(band(50, 50 + need - 1))).toContain(BAND_SPLIT_LAW);
  });

  it('cuts at the requested line, and LEAVES THAT LINE CLEAR', () => {
    const p = preset([band(40, 120)]);
    const cmd = splitBandCommand(library(p), p.id, 0, 80);
    expect(cmd).not.toBeNull();
    const bands = cmd!.newPreset!.bands;
    expect(bands).toHaveLength(2);
    expect(bands[0]).toMatchObject({ top: 40, bot: 80 });
    expect(bands[1]).toMatchObject({ top: 81, bot: 120 });
    // The cut line itself belongs to no band: the upper covers 40..79 and the
    // lower covers 81..119, so line 80 shows the base palette.
    expect(bands[0].bot).toBe(80);
    expect(bands[1].top).toBe(81);
  });

  it('THE PRODUCT DOES NOT COLLIDE WITH ITSELF — swept over every legal cut', () => {
    // ⚠ THE LOAD-BEARING ROW. A split is the one gesture that CREATES a
    // neighbouring pair, so a split whose halves shared a fire line would author
    // a program that parks the raster counter — silently, in the engine's own
    // words. Every legal cut of a tall band is checked against the same walk the
    // advisory uses, and a single null command fails the sweep.
    const p = preset([band(40, 120)]);
    let cuts = 0;
    for (let cut = 41; cut <= 118; cut++) {
      const cmd = splitBandCommand(library(p), p.id, 0, cut);
      expect(cmd).not.toBeNull();
      const next = cmd!.newPreset!;
      expect(bandCollisionAdvisory(next, 0)).toBeNull();
      expect(bandCollisionAdvisory(next, 1)).toBeNull();
      cuts++;
    }
    expect(cuts).toBe(78);
  });

  it('and an S/H split does not collide either — the de-mix line is inside its own half', () => {
    const p = preset([band(100, 140, 74, 1, true)]);
    for (let cut = 101; cut <= 138; cut++) {
      const next = splitBandCommand(library(p), p.id, 0, cut)!.newPreset!;
      expect(bandCollisionAdvisory(next, 0)).toBeNull();
      expect(bandCollisionAdvisory(next, 1)).toBeNull();
    }
  });

  it('carries the ON op and `sh` to BOTH halves, as a COPY rather than a shared object', () => {
    const p = preset([band(40, 120, 96, 3, 1)]);
    const next = splitBandCommand(library(p), p.id, 0, 80)!.newPreset!;
    expect(next.bands[1].on).toEqual(next.bands[0].on);
    expect(next.bands[1].on).not.toBe(next.bands[0].on);
    expect(next.bands[1].sh).toBe(1);
    expect(bandCramSpan(next.bands[1])).toEqual({ start: 96, end: 102 });
  });

  it('THE BAND ID CANNOT COLLIDE: the halves share `sa` and differ in `top`', () => {
    // aeon derives `band_id = top * 128 + sa` and the ownership walk refuses two
    // bands with one id. The halves share the ON op, so `sa` is equal and the id
    // is separated by `top` alone — which the cut guarantees differs.
    const p = preset([band(40, 120, 96, 3)]);
    const next = splitBandCommand(library(p), p.id, 0, 80)!.newPreset!;
    const idOf = (b: EffectsPresetBand): number => b.top * 128 + bandCramSpan(b)!.start;
    expect(idOf(next.bands[0])).not.toBe(idOf(next.bands[1]));
  });

  it('inserts the lower half IMMEDIATELY AFTER the upper, leaving other bands where they were', () => {
    const p = preset([band(10, 30, 200), band(40, 120), band(150, 180, 210)]);
    const next = splitBandCommand(library(p), p.id, 1, 80)!.newPreset!;
    expect(next.bands.map((b) => [b.top, b.bot]))
      .toEqual([[10, 30], [40, 80], [81, 120], [150, 180]]);
  });

  it('holds a cut outside the band inside the band, rather than refusing it', () => {
    expect(bandSplitLine(band(40, 120), 0)).toBe(41);
    expect(bandSplitLine(band(40, 120), 999)).toBe(118);
    expect(bandSplitLine(band(40, 120), 80.6)).toBe(81);
  });

  it('REFUSES a band with no line to give, and the refusal reaches the command', () => {
    const short = preset([band(50, 50 + bandSplitMinHeight() - 1)]);
    expect(splitBandCommand(library(short), short.id, 0, 51)).toBeNull();
    expect(splitBandCommand(library(short), short.id, 99, 51)).toBeNull();
    expect(splitBandCommand(library(short), 'not_a_preset', 0, 51)).toBeNull();
  });

  it('IS ONE UNDO STEP, and its old side is the WHOLE document it replaces', () => {
    // Both halves and the insert are one `set-effects-preset` swap, so one undo
    // puts the band back — the same shape every other control on this document
    // already has.
    const p = preset([band(40, 120)]);
    const cmd = splitBandCommand(library(p), p.id, 0, 80)!;
    expect(cmd.type).toBe('set-effects-preset');
    expect(cmd.oldPreset!.bands).toHaveLength(1);
    expect(cmd.newPreset!.bands).toHaveLength(2);
    expect(cmd.description).toContain('Split band 0');
    expect(cmd.description).toContain('line 80');
  });

  it('the panel\'s own seed band is splittable — a default an author cannot use is a defect', () => {
    expect(bandSplitRefusal(newBand())).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// What is deliberately NOT transcribed
// ═══════════════════════════════════════════════════════════════════════════

describe('the numbers this module refuses to copy out of the engine', () => {
  it('no cycle figure, no scanline budget, no band count reaches an exported sentence', () => {
    // The engine's height minimum is cost-keyed on purpose ("they re-price
    // themselves the day the model does"). A number copied here would be a
    // copied pin that goes stale with nothing going red — and the engine's own
    // `ensure` is what carries the measurement to the author.
    const prose = [
      BAND_EDGE_LAW, BAND_ORDER_LAW, BAND_GAP_LAW, BAND_OVERLAP_LAW, BAND_SPLIT_LAW,
    ].join(' ');
    expect(prose).not.toMatch(/cyc|cycle|RASTER_SCANLINE|op_work_cyc|488|624/);
    // The two numbers it MAY name are the two that live in shipped engine code,
    // and it names them by importing them.
    expect(BAND_EDGE_LAW).toContain(`${MIN}..${MAX}`);
  });
});
