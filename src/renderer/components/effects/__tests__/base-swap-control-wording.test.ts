// THE BASE-SWAP CARD'S SOURCE — the halves that must reach the panel, the shape
// that must not grow, and the numbers the panel must never spell itself.
//
// ═══ WHAT A SOURCE TEST CAN AND CANNOT SAY ═══
//
// This file reads `BandPresetPanel.tsx` as text. It CANNOT see a pixel, mount a
// component or press a control — that is
// `scratchpad/base-swap-control-harness.mjs` (`npm run harness:base-swap-control`),
// driving the real app under CDP, and the two are deliberately different
// instruments. What a source test CAN hold is structural: which derivation a
// control reads, that a sentence is painted rather than hover-only, and that the
// card has not grown a field the schema refuses or a number the contract owns.
//
// ⚠ THE NUMBER ROWS ARE THE POINT OF THIS FILE. The granule, the worked address
// and its hex are all derived from the vendored schema with module-load guards.
// A copy typed beside a control is a copy that CANNOT go red when the contract
// moves — and this family has produced that defect twice already. A panel that
// spelled the granule itself would keep refusing on the old one after a
// re-vendor, with every node row still green.
//
// ⚠ THE SURFACE IS TWO COMPONENTS SINCE empyrean `8f56c2c`. `base_swap` is a
// LIST, so `BaseSwapCard` is the list container (advisory, add, summary) and
// `BaseSwapBandCard` is one band's fields. Rows about a FIELD read the band
// card; rows about the LIST read the container. A row that read the container
// looking for spinners would find none and go green over the wrong slice, which
// is the mistake this header exists to stop.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE_SWAP_ASYMMETRIES, BASE_SWAP_ASYMMETRIES_SHORT, BASE_SWAP_WHAT_YOU_SEE,
  BASE_SWAP_NAMED_TARGETS, fmtVramBase,
} from '../../../providers/effects-preset';
import {
  EFFECTS_PRESET_BASE_SWAP_KEYS,
  EFFECTS_PRESET_BASE_SWAP_OPTIONAL_KEYS,
  EFFECTS_PRESET_BASE_SWAP_PLANES,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_RASTER_CHANNELS,
} from '../../../../core/formats/effects/preset';

const PANEL = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL, 'utf8');

/**
 * COMMENTS STRIPPED, `band-preset-wording.test.ts`'s slice and its reason: this
 * file's subject is what the panel DOES, and a rule discussed in a comment must
 * not satisfy a row that means "the code reads this derivation". It cuts the
 * other way too — the docblocks quote the granule and the named address by
 * design, and the "does not retype" rows below are about CODE.
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The `BaseSwapCard` function body, BOUNDED AT THE NEXT COMPONENT.
 *
 * ⚠ NOT `slice(at)`. The ramp card's own wording file sliced to end-of-file,
 * which was the same thing as "the ramp card" only while `RampCard` was last —
 * and the day this card was written after it, its field-count row counted seven
 * spinners against the ramp's five keys. Bounded from the start here.
 */
function bodyOf(name: string): string {
  const at = code.indexOf(`function ${name}(`);
  if (at < 0) {
    throw new Error(`${name} is gone from BandPresetPanel.tsx — this file measures it`);
  }
  const rest = code.slice(at);
  // The function's own closing brace: the first `}` in column 0 after it. Every
  // brace inside the body is indented, and this does not depend on what happens
  // to be written next in the file.
  const end = rest.indexOf('\n}\n');
  if (end < 0) throw new Error(`${name} has no closing brace in column 0 — the slice is unbounded`);
  return rest.slice(0, end + 3);
}

/** The LIST container: the advisory, the add control, the whole-list summary. */
const list = bodyOf('BaseSwapCard');
/** ONE band's fields: plane, line, target, restore_line. */
const card = bodyOf('BaseSwapBandCard');

describe('the slice this file measures is bounded', () => {
  it('comment-stripping really removed the prose, and both slices are really distinct', () => {
    expect(code.length).toBeLessThan(panel.length * 0.8);
    expect(card).toContain('<NumberField');
    // ANTI-VACUOUS: neither slice may be the whole panel, or every row below
    // could be satisfied by the ramp card or the band card instead.
    expect(card.length).toBeLessThan(code.length * 0.3);
    expect(list.length).toBeLessThan(code.length * 0.3);
    for (const slice of [card, list]) {
      expect(slice).not.toContain('setRampSpanCommand(');
      expect(slice).not.toContain('setBandFieldCommand(');
    }
    // ⚠ AND THE TWO ARE GENUINELY DIFFERENT SLICES. If `bodyOf` ever returned
    // the same text for both, every row below would be measuring one component
    // twice and the split would be invisible.
    expect(card).not.toBe(list);
    expect(list).not.toContain('<NumberField title={BASE_SWAP_FIELD_TITLES.line}');
  });
});

describe('the band card has exactly the band\'s own shape — every key, one control', () => {
  /**
   * ⚠ ONE CONTROL PER BAND KEY, AND THE COUNT IS DERIVED FROM THE SCHEMA. The
   * band object is CLOSED, so a control for anything outside
   * `EFFECTS_PRESET_BASE_SWAP_KEYS` + `..._OPTIONAL_KEYS` would author a key the
   * schema refuses — which serialize would catch, but only after the panel had
   * shown an author a field that does nothing.
   *
   * ⚠ THE CONTROLS ARE NO LONGER ALL SPINNERS, and the count has to say so.
   * `plane` is a CLOSED ENUM and gets a `<Select>`; `restore_line` is OPTIONAL
   * and gets a checkbox that adds or removes the key PLUS a spinner. A row that
   * still counted only `<NumberField>` would silently stop covering two of the
   * four keys.
   */
  it('mounts one control per band key — spinners, one select, one presence toggle', () => {
    const keys = [...EFFECTS_PRESET_BASE_SWAP_KEYS, ...EFFECTS_PRESET_BASE_SWAP_OPTIONAL_KEYS];
    expect(keys).toHaveLength(4);
    // line, target, restore_line — three number fields.
    expect([...card.matchAll(/<NumberField\b/g)]).toHaveLength(3);
    // plane — exactly one closed choice, over the schema's own enum.
    expect([...card.matchAll(/<Select\b/g)]).toHaveLength(1);
    expect(card).toMatch(/EFFECTS_PRESET_BASE_SWAP_PLANES\.map\(/);
    expect(card).not.toMatch(/value="PlaneA"|value="PlaneB"/);
    // restore_line — exactly one presence toggle, and it passes `undefined` to
    // REMOVE the key rather than writing a zero.
    expect([...card.matchAll(/type="checkbox"/g)]).toHaveLength(1);
    expect(card).toMatch(/setBaseSwapRestoreLineCommand\([\s\S]*?undefined\)/);
    // Every key is named by a title on some control in this slice.
    for (const k of keys) expect(card, k).toContain(`BASE_SWAP_FIELD_TITLES.${k}`);
  });

  /**
   * NO min/max, aeon's §E.4 — those attributes govern the arrows and `:invalid`
   * and stop no typed value, so a caller that means "this cannot be written"
   * passes `refuse`. Both fields do.
   *
   * AND NO `step` EITHER, which is the difference from the ramp's rate fields: a
   * screen line and a byte address are whole numbers, so the browser's default
   * whole-number arrow is the right one. A `step` of the granule here would be a
   * SNAP wearing an affordance's clothes — the arrows would walk the author from
   * one legal base to the next and quietly hide that a typed value between them
   * is refused, which is the one thing this control exists to say out loud.
   */
  it('every spinner refuses, and none of them ranges or steps', () => {
    const fields = [...card.matchAll(/<NumberField[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(fields).toHaveLength(3);
    for (const f of fields) {
      expect(f, f).not.toMatch(/\bmin=/);
      expect(f, f).not.toMatch(/\bmax=/);
      expect(f, f).not.toMatch(/\bstep=/);
      expect(f, f).toMatch(/refuse=\{/);
      expect(f, f).toMatch(/onRefusal=\{/);
    }
  });

  it('draws nothing per scanline and no preview', () => {
    for (const slice of [card, list]) {
      expect(slice).not.toMatch(/for\s*\(/);
      expect(slice).not.toMatch(/canvas/i);
    }
    // ⚠ `.map(` IS NOW LEGITIMATE IN BOTH SLICES and the row says over WHAT.
    // The container maps the BANDS and the band card maps the PLANE ENUM —
    // neither is a per-scanline draw, and both are lists the schema defines.
    // The rule this row still holds is that nothing iterates screen lines.
    expect([...list.matchAll(/\.map\(/g)]).toHaveLength(1);
    expect(list).toMatch(/baseSwap\.map\(/);
    expect([...card.matchAll(/\.map\(/g)]).toHaveLength(1);
    expect(card).toMatch(/EFFECTS_PRESET_BASE_SWAP_PLANES\.map\(/);
  });
});

describe('the LIST container carries what only the list can say', () => {
  /**
   * ⚠ THE ORDER BREAK IS PAINTED, NOT HIDDEN BEHIND A REFUSAL. An out-of-order
   * document can arrive — the codec accepts one because the contract does — and
   * if the panel only refused edits the author would be locked out of the one
   * surface that could repair it. So the container paints
   * `baseSwapOrderAdvisory` and every control stays live.
   */
  it('paints the standing order advisory and the flattened-program summary', () => {
    expect(list).toContain('baseSwapOrderAdvisory(');
    expect(list).toContain('baseSwapSummary(');
    // The advisory is PAINTED, not a hover title.
    expect(list).toMatch(/\{order !== null && <Hint tone="warning">\{order\}<\/Hint>\}/);
  });

  /** Add and remove are disabled WITH A REASON, from one predicate each. */
  it('add and remove read the same predicate their sentence does', () => {
    expect(list).toContain('addBaseSwapBandRefusal(');
    expect(list).toContain('addBaseSwapBandCommand(');
    expect(list).toContain('lastBaseSwapBandRefusal(');
    expect(card).toContain('removeBaseSwapBandCommand(');
    // The chip's `disabled` and the Hint read ONE value, not two calls that
    // could disagree.
    expect(list).toMatch(/<Chip disabled=\{addWhy !== null\}/);
    expect(list).toMatch(/\{addWhy !== null && <Hint tone="warning"/);
    // ⚠ AND REMOVE ACTS THEN DROPS FOCUS (d-27) — the `key={i}` list-removal
    // shape where a surviving button re-aims at whatever slid into its slot.
    expect(card).toContain('actAndDropFocus(');
  });

  /**
   * ⚠ THE ROW SENTENCE IS THE ONE THING ON THIS SURFACE NOBODY GUESSES. `line`
   * and `restore_line` are BOTH fire lines; the swapped rows are
   * `line+1 .. restore_line-1`. The panel must PAINT that, and must not compute
   * it — `baseSwapInsideRowsText` derives the offsets from the schema's own
   * prose and checks them against the schema's own measured witness.
   */
  it('the swapped-row sentence is painted and comes from the derivation', () => {
    expect(card).toContain('baseSwapInsideRowsText(band)');
    expect(card).toMatch(/<Hint under tone="warning">\{baseSwapInsideRowsText\(band\)\}<\/Hint>/);
    // The panel does NOT do the arithmetic itself anywhere.
    expect(code).not.toMatch(/restore_line\s*-\s*1/);
    expect(code).not.toMatch(/\.line\s*\+\s*1[^)]/);
  });
});

describe('the panel spells no base_swap rule of its own', () => {
  /**
   * ⚠ THE THREE NUMBERS THE PANEL MUST NEVER CARRY: the granule, the worked
   * address and its hex. All three are derived in the codec from the vendored
   * schema with module-load guards, and a literal here would survive a
   * re-vendor that moved any of them — refusing on the old granule while every
   * node row stayed green.
   */
  it('does not retype the granule, any worked address or its hex', () => {
    expect(code).not.toContain(String(EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE));
    expect(code).not.toContain(String(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE.max));
    // ⚠ THE CONTRACT NAMES NO ADDRESS SINCE `8f56c2c`, so this loop is over an
    // EMPTY set — and an empty loop asserts nothing, which is exactly how a
    // "does not retype" row rots into decoration. The count is asserted, so the
    // row states which case it is in rather than passing silently either way.
    expect(BASE_SWAP_NAMED_TARGETS.size).toBe(0);
    for (const [addr, name] of BASE_SWAP_NAMED_TARGETS) {
      expect(code).not.toContain(String(addr));
      expect(code).not.toContain(fmtVramBase(addr));
      expect(code).not.toContain(name);
    }
    // ...and the panel must not spell a VRAM_* name of its own even though the
    // key's prose still mentions two of them as HOME bases the engine writes.
    expect(code).not.toMatch(/VRAM_[A-Z0-9_]+/);
    // ANTI-VACUOUS: the granule really is a non-trivial value, so its absence is
    // a claim about this file and not about arithmetic.
    expect(EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBeGreaterThan(1000);
  });

  it('reads the provider for every refusal, gloss, summary and command', () => {
    for (const fn of [
      'baseSwapLineRefusal(', 'baseSwapTargetRefusal(',
      'baseSwapRestoreLineRefusal(', 'baseSwapTargetGloss(', 'baseSwapBandSummary(',
      'setBaseSwapLineCommand(', 'setBaseSwapTargetCommand(',
      'setBaseSwapPlaneCommand(', 'setBaseSwapRestoreLineCommand(',
    ]) expect(card, fn).toContain(fn);
    // ⚠ THE PANEL NEVER CALLS THE ORDER RULE ITSELF. Refusal and advisory both
    // live in the provider; a panel that re-derived ascent would be a second
    // copy of a rule whose real authority is `fire_lines` at build time.
    expect(card).not.toContain('baseSwapOrderRefusal(');
    expect(card).not.toContain('baseSwapFires(');
    // The titles are the schema's, through the provider.
    for (const k of [...EFFECTS_PRESET_BASE_SWAP_KEYS,
      ...EFFECTS_PRESET_BASE_SWAP_OPTIONAL_KEYS]) {
      expect(card, k).toMatch(new RegExp(`title=\\{BASE_SWAP_FIELD_TITLES\\.${k}\\}`));
    }
    expect(EFFECTS_PRESET_BASE_SWAP_PLANES.length).toBe(2);
  });

  it('does no address arithmetic of its own — no hex, no masking, no rounding', () => {
    expect(card).not.toMatch(/toString\(16\)/);
    expect(card).not.toMatch(/0x[0-9a-fA-F]/);
    // A bitwise mask or a shift would be the panel re-deriving what reg $02
    // keeps and what it drops. (`>>`/`<<` are deliberately NOT matched: a TS
    // generic closes with `>>` and the row would fire on `Record<string, string
    // | null>>`, which is how a true rule ends up relaxed to get green.)
    expect(card).not.toMatch(/&\s*0x|~\s*\(|>>>/);
    expect(card).not.toMatch(/Math\.(round|floor|ceil)/);
    expect(card).not.toMatch(/%/);
  });
});

describe('the two asymmetries reach the panel at both lengths', () => {
  /**
   * `LimitBlock`'s split: the author-length sentence is PAINTED and the contract
   * one is on the same element's `title`. A property an author has to hover to
   * find is a property the panel does not really carry — and these two are the
   * ones a reader arriving from `ramp` gets wrong by assumption, which is how a
   * control parcel ends up building a disabled button around a capability gate
   * that does not exist.
   */
  it('the short half is painted and the contract half is on the same element', () => {
    // ⚠ ON THE LIST CONTAINER since `8f56c2c`: it is a property of the KEY, not
    // of one band, and painting it per band would repeat it once per row.
    expect(list).toMatch(/title=\{BASE_SWAP_ASYMMETRIES\}>\{BASE_SWAP_ASYMMETRIES_SHORT\}</);
    expect(BASE_SWAP_ASYMMETRIES_SHORT).not.toBe(BASE_SWAP_ASYMMETRIES);
    expect(BASE_SWAP_ASYMMETRIES.length).toBeGreaterThan(BASE_SWAP_ASYMMETRIES_SHORT.length);
  });

  it('what an author sees is quoted from the contract, with the paragraph behind it', () => {
    expect(list).toMatch(/title=\{BASE_SWAP_TITLE\}>\{BASE_SWAP_WHAT_YOU_SEE\}</);
    expect(BASE_SWAP_WHAT_YOU_SEE).toMatch(/self-restoring/);
  });

  it('the panel does not retype either sentence', () => {
    expect(code).not.toContain(BASE_SWAP_ASYMMETRIES);
    expect(code).not.toContain(BASE_SWAP_ASYMMETRIES_SHORT);
    expect(code).not.toContain(BASE_SWAP_WHAT_YOU_SEE);
    expect(code).not.toContain('CAP_DENSE_TIER');
  });
});

describe('the card is mounted on the document that carries the channel', () => {
  it('renders on a base_swap document and nowhere else', () => {
    expect(code).toMatch(/\{selected\.base_swap !== undefined && \(/);
    expect(code).toMatch(/<BaseSwapCard library=\{library\} preset=\{selected\}/);
    expect(code).toMatch(/baseSwap=\{selected\.base_swap\}/);
  });

  /**
   * ⚠ AND A CHANNEL WITH NO CARD GETS A SENTENCE. Every declared channel has an
   * editor today, so this leaf paints nothing — which is exactly why a row has
   * to hold it: a fourth arm would otherwise select correctly in the Raster row
   * (that list is derived from the schema) and render an empty section under it.
   */
  it('a channel with no editor here paints a reason, from one predicate', () => {
    expect(code).toMatch(/\{programArmEditorGap\(selected\) !== null && \(/);
    expect(code).toMatch(/<Hint tone="warning">\{programArmEditorGap\(selected\)\}<\/Hint>/);
  });

  /**
   * ⚠ NO CHANNEL IS TESTED AGAINST ANOTHER ANYWHERE IN THIS PANEL. The three
   * defects the third arm opened were all of that shape: a ternary, an if/else
   * and a `!== 'ramp'`. A card mounts on its OWN key being present; nothing here
   * may branch on which of the others it is not.
   */
  it('nothing in the panel branches on one channel versus another', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      expect(code, `a channel comparison against "${c}"`)
        .not.toMatch(new RegExp(`[=!]==\\s*'${c}'`));
    }
    expect(code).not.toMatch(/selected\.ramp !== undefined \?/);
    expect(code).not.toMatch(/selected\.base_swap !== undefined \?/);
    // The dropdown is the schema's list, never a typed pair or triple.
    expect(code).toMatch(/PROGRAM_ARM_OPTIONS\.map\(/);
    expect(code).not.toMatch(/value="base_swap"/);
  });
});
