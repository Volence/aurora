// MAKING CRAM SIGHTED — defect 13's colour half (EW-COLOUR-PICKER).
//
// The cold-read walkthrough (docs/reviews/2026-09-02-effects-cold-walkthrough.md)
// measured two things about this surface, a12 and a13: `colours` wanted a decimal
// integer with no swatch anywhere, and `addr = 74` had no human rendering at all.
// The parcel adds a swatch beside the list and a `line N · entry M` gloss beside
// the address, and the load-bearing constraint is that IT ADDS — the wire format
// does not move and the raw controls stay.
//
// ═══ WHAT THESE ROWS CAN AND CANNOT PROVE ═══
//
// There is no React here. Nothing below proves a swatch was PAINTED, that it is
// the colour the word decodes to on screen, or that clicking it opens sliders —
// that is `scratchpad/band-preset-harness.mjs` section 7, driving the real app
// under CDP. What these rows own is the DOCUMENT: that one gesture changes one
// entry and nothing else, that an unchanged word builds no command (and so burns
// no undo slot), that the bytes an untouched preset serializes to are identical,
// and that the derived sentences say what they claim to.
//
// ⚠ EVERY EXPECTATION ABOUT WHERE AN ADDRESS LANDS IS DERIVED, NOT TYPED.
// `cramLocation` is cross-checked against the contract's own shift formulas in
// core/formats/__tests__/cram-geometry.test.ts; the rows here build their
// expected strings from `CRAM_LINE_ENTRIES` and `CRAM_WORD_BYTES` so a change to
// the geometry reddens here too instead of silently re-baselining.
//
// PLANTS THIS CATCHES (run, on disk, red, restored — see the packet):
//   • `colours[at] = word` -> `colours[0] = word`      … the one-entry rows go red
//   • `end <= CRAM_LINE_ENTRIES` -> `end < CRAM_LINE_ENTRIES` … the boundary row goes red
//   • the `<ColourSwatches .../>` mount deleted from the panel … the mount row goes red

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addrGloss, colourSwatchTitle, setColourCommand, cramSpanAdvisory,
  setColoursCommand, parseColours, newPreset, bandSubject, CRAM_LINES,
} from '../effects-preset';
import {
  cramLocation, CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, CRAM_LINE_COUNT, fmtGenesisWord,
  decodeGenesisColor, encodeGenesisColor,
} from '../../../core/formats/palette';
import { serializeEffectsPreset } from '../../../core/formats/effects/preset';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { SetEffectsPresetCommand } from '../../../core/editing/commands';

const ID = 'colour_probe';

function library(p: EffectsPreset): EffectsPresetLibrary {
  return { presets: [p], unreadable: [], notices: [] };
}

/** A preset whose one band writes `colours` at `addr`. */
function cramPreset(addr: number, colours: number[]): EffectsPreset {
  const p = newPreset(ID);
  p.bands[0].on = { cram: { addr, colours: colours.slice() } };
  return p;
}

function after(c: SetEffectsPresetCommand | null): EffectsPreset {
  expect(c, 'the gesture produced no command where the row expected a change').not.toBeNull();
  expect(c!.newPreset).not.toBeNull();
  return c!.newPreset!;
}

// ═══════════════════════════════════════════════════════════════════════════
// a13 — `addr` gets a human rendering
// ═══════════════════════════════════════════════════════════════════════════

describe('addrGloss says where an address lands, in the palette editor\'s words', () => {
  it("renders the walkthrough's `addr = 74` as a line and an entry", () => {
    const at = cramLocation(74)!;
    // DERIVED. The row asserts the gloss carries the location `cramLocation`
    // computed, not two integers typed here — and cram-geometry.test.ts is what
    // pins those integers to the contract.
    expect(addrGloss(74)).toBe(`line ${at.line} · entry ${at.entry}`);
    // …and, so this rendering cannot silently become something else, that the
    // shape really is the one a13 asked for.
    expect(addrGloss(74)).toMatch(/^line \d+ · entry \d+$/);
  });

  it('every in-CRAM even address glosses as its own location and nothing more', () => {
    const total = CRAM_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;
    for (let addr = 0; addr < total; addr += CRAM_WORD_BYTES) {
      const at = cramLocation(addr)!;
      expect(addrGloss(addr), `addr ${addr}`).toBe(`line ${at.line} · entry ${at.entry}`);
    }
  });

  it('names the three abnormal cases instead of printing a plausible location', () => {
    // The wording each case owns, and NOTHING SHARED between them: a matcher that
    // matched a phrase two rules use is the trap that has fired in this repo.
    expect(addrGloss(-1)).toBe('not a CRAM address');
    expect(addrGloss(75)).toMatch(/odd byte, not a word boundary$/);
    const past = CRAM_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;
    expect(addrGloss(past)).toMatch(
      new RegExp(`past CRAM's ${CRAM_LINE_COUNT} lines$`));
    // and each still leads with the location, so an author can act on it
    expect(addrGloss(75)).toMatch(/^line \d+ · entry \d+ — /);
    expect(addrGloss(past)).toMatch(/^line \d+ · entry \d+ — /);
  });

  it('reads the ADDRESS, never a sibling key that claims to agree with it', () => {
    // `pal_region` carries `pal_line`/`entry` of its own, and the schema says they
    // "must AGREE with addr" — which means a document can be open while they do
    // not. A gloss that printed the file's claim would go quiet exactly when the
    // author needs it. `addrGloss` takes one number; there is no key to read.
    expect(addrGloss.length).toBe(1);
    const at = cramLocation(0)!;
    expect(addrGloss(0)).toBe(`line ${at.line} · entry ${at.entry}`);
  });

  it('the line numbers it can print are the lines the mask chips offer', () => {
    // One CRAM, one line count. If `CRAM_LINES` and the gloss ever disagreed, the
    // panel would offer `L0..L3` chips beside an address it called line 6 without
    // comment.
    expect(CRAM_LINES).toEqual(Array.from({ length: CRAM_LINE_COUNT }, (_, i) => i));
    const lastInCram = CRAM_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES - CRAM_WORD_BYTES;
    expect(cramLocation(lastInCram)!.line).toBe(CRAM_LINES[CRAM_LINES.length - 1]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// a12 — every colour gets a swatch, and the swatch says where it goes
// ═══════════════════════════════════════════════════════════════════════════

describe('a swatch names its own destination and its own word, both spellings', () => {
  it('walks the address forward one WORD per colour, not one byte', () => {
    // The trap the unit makes possible: `colours` is a list of WORDS and `addr`
    // is a BYTE address, so colour i lands at `addr + 2i`. Off by this factor and
    // a four-colour band claims to write entries 5,5,6,6.
    const addr = 74;
    const entries = [0, 1, 2, 3].map((i) => cramLocation(addr + i * CRAM_WORD_BYTES)!.entry);
    expect(entries).toEqual([0, 1, 2, 3].map((i) => cramLocation(addr)!.entry + i));
    for (const i of [0, 1, 2, 3]) {
      const at = cramLocation(addr + i * CRAM_WORD_BYTES)!;
      expect(colourSwatchTitle(addr, i, 14))
        .toMatch(new RegExp(`Colour ${i} → line ${at.line} · entry ${at.entry} —`));
    }
  });

  it('carries the decimal the document holds AND the $-form every other surface shows', () => {
    // a12's actual complaint: the author had to know the packing and convert to
    // base 10. The title carries both so neither conversion is theirs to do.
    const t = colourSwatchTitle(74, 0, 3584);
    expect(t).toContain('3584');
    expect(t).toContain(fmtGenesisWord(3584));
    expect(t).toContain('$0E00');
  });

  it('says the list beside it is still the wire value', () => {
    // The row-97 precedent, in the one place an author will hover. If this
    // sentence goes, the swatch starts reading as a replacement for the field.
    expect(colourSwatchTitle(74, 0, 14)).toMatch(/list beside it stays the wire value/);
  });

  it('degrades honestly for an address that has no location', () => {
    expect(colourSwatchTitle(-4, 0, 14)).toContain('not a CRAM address');
    expect(colourSwatchTitle(-4, 0, 14)).not.toMatch(/line -?\d+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The gesture: one colour, one command, one undo step, no other byte touched
// ═══════════════════════════════════════════════════════════════════════════

describe('setColourCommand writes ONE entry and leaves the document otherwise identical', () => {
  it('changes the entry it was given and no other', () => {
    const before = cramPreset(74, [14, 3584, 0, 7]);
    const next = after(setColourCommand(library(before), ID, 0, 2, 0x0e0));
    const cram = (next.bands[0].on as { cram: { colours: number[] } }).cram;
    expect(cram.colours).toEqual([14, 3584, 0x0e0, 7]);
    // …and the rest of the DOCUMENT, byte for byte. A row that only checked the
    // array would miss a command that also rewrote `top` or dropped `sh`.
    const strip = (p: EffectsPreset): string => {
      const c = JSON.parse(JSON.stringify(p)) as EffectsPreset;
      (c.bands[0].on as { cram: { colours: number[] } }).cram.colours = [];
      return serializeEffectsPreset(c);
    };
    expect(strip(next)).toBe(strip(before));
  });

  it('writes a plain decimal integer — the wire format does not move', () => {
    const next = after(setColourCommand(library(cramPreset(74, [0])), ID, 0, 0, 3584));
    const written = (next.bands[0].on as { cram: { colours: number[] } }).cram.colours[0];
    expect(typeof written).toBe('number');
    expect(Number.isInteger(written)).toBe(true);
    // The serialized bytes hold the integer, not a `$0E00` string or an object.
    expect(serializeEffectsPreset(next)).toContain('3584');
    expect(serializeEffectsPreset(next)).not.toContain('$0E00');
  });

  it('the same word again is a NO-OP — the double commit burns no undo slot', () => {
    // `GenesisColorSliders` commits on pointerup AND on the blur that follows.
    // Without this, one drag would be two history entries and an undo would land
    // the author back on the colour they just picked.
    const lib = library(cramPreset(74, [14, 3584]));
    expect(setColourCommand(lib, ID, 0, 1, 3584)).toBeNull();
    expect(setColourCommand(lib, ID, 0, 1, 3585)).not.toBeNull();
  });

  it('refuses an index the list does not reach, rather than extending it', () => {
    // The LENGTH is a second authored quantity — it is the derived restore's word
    // count — and it is authored in the text field. A picker that could grow the
    // array would be a second, silent length control.
    const lib = library(cramPreset(74, [14, 3584]));
    expect(setColourCommand(lib, ID, 0, 2, 7)).toBeNull();
    expect(setColourCommand(lib, ID, 0, -1, 7)).toBeNull();
  });

  it('does nothing to a band whose arm is not cram', () => {
    const p = newPreset(ID);
    p.bands[0].on = { pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 } };
    expect(setColourCommand(library(p), ID, 0, 0, 14)).toBeNull();
  });

  it('an untouched preset round-trips byte-identically through the picker path', () => {
    // The parcel's hard constraint. Reading a colour, decoding it and encoding it
    // back must not perturb the document: `encode(decode(w)) === w` for the bits
    // the hardware displays, and nothing writes unless the word actually changed.
    const before = cramPreset(74, [14, 3584]);
    const bytes = serializeEffectsPreset(before);
    for (const [i, w] of [14, 3584].entries()) {
      const same = encodeGenesisColor(decodeGenesisColor(w));
      expect(same).toBe(w);
      expect(setColourCommand(library(before), ID, 0, i, same)).toBeNull();
    }
    expect(serializeEffectsPreset(before)).toBe(bytes);
  });

  it('the text field still authors the whole list, unchanged by any of this', () => {
    // a12's author kept their field. `parseColours` still takes decimal and hex,
    // and `setColoursCommand` still replaces the array wholesale.
    expect(parseColours('14 3584')).toEqual({ ok: true, colours: [14, 3584] });
    expect(parseColours('0x0e 0xe00')).toEqual({ ok: true, colours: [14, 3584] });
    const next = after(setColoursCommand(library(cramPreset(74, [0])), ID, 0, [14, 3584]));
    expect((next.bands[0].on as { cram: { colours: number[] } }).cram.colours)
      .toEqual([14, 3584]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The two controls are jointly refusable
// ═══════════════════════════════════════════════════════════════════════════

describe('cramSpanAdvisory: a span that runs off the end of its line says so', () => {
  it('is silent while the span fits, and speaks on the first entry past the end', () => {
    // THE BOUNDARY, DERIVED. The last address of a line, with a list exactly long
    // enough to fill it, must be silent; one more colour must not be.
    const at = CRAM_LINE_ENTRIES * CRAM_WORD_BYTES; // line 1, entry 0
    const fits = cramPreset(at, new Array(CRAM_LINE_ENTRIES).fill(0));
    expect(cramSpanAdvisory(fits.bands[0], ID, 0)).toBeNull();
    const over = cramPreset(at, new Array(CRAM_LINE_ENTRIES + 1).fill(0));
    expect(cramSpanAdvisory(over.bands[0], ID, 0)).not.toBeNull();
  });

  it('names the preset and the band, like every other message on this surface', () => {
    // Defect 7: an error that cannot be walked back to a control. `bandSubject`
    // is the one subject-line derivation; this row asserts the advisory uses it
    // rather than composing its own.
    const over = cramPreset(74, new Array(CRAM_LINE_ENTRIES).fill(0));
    const why = cramSpanAdvisory(over.bands[0], ID, 0)!;
    expect(why).toContain(bandSubject(ID, 0));
    // and it says which two things to move — an advisory that only diagnoses
    // leaves the author where the walkthrough was.
    expect(why).toMatch(/Lower the address or shorten the list/);
  });

  it('quotes the engine rule it is about, and only that rule', () => {
    const over = cramPreset(74, new Array(CRAM_LINE_ENTRIES).fill(0));
    const why = cramSpanAdvisory(over.bands[0], ID, 0)!;
    // Wording only THIS rule uses. `stream_cram` appears in several schema
    // descriptions; "span to stay within the line" is this refusal's alone.
    expect(why).toMatch(/span to stay within the line/);
    expect(why).toContain(String(CRAM_LINE_ENTRIES));
  });

  it('says nothing about an arm it does not apply to, or an empty list', () => {
    const p = newPreset(ID);
    p.bands[0].on = { pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 99 } };
    expect(cramSpanAdvisory(p.bands[0], ID, 0)).toBeNull();
    expect(cramSpanAdvisory(cramPreset(74, []).bands[0], ID, 0)).toBeNull();
    expect(cramSpanAdvisory(cramPreset(-4, [0, 0]).bands[0], ID, 0)).toBeNull();
  });

  it('ADVISES — it does not refuse the value, which is aeon E.4\'s line', () => {
    // The panel must still WRITE a span the engine will reject: §E.4 forbids a
    // writer range-checking or clamping, so the author gets the engine's own
    // refusal with its measurement. The advisory is a sentence, and the command
    // that produced the state is not withheld.
    const lib = library(cramPreset(74, [0]));
    const grown = after(setColoursCommand(lib, ID, 0, new Array(CRAM_LINE_ENTRIES).fill(0)));
    expect((grown.bands[0].on as { cram: { colours: number[] } }).cram.colours.length)
      .toBe(CRAM_LINE_ENTRIES);
    expect(cramSpanAdvisory(grown.bands[0], ID, 0)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The panel mounts it — the most a node suite can say about a React component
// ═══════════════════════════════════════════════════════════════════════════

describe('the panel reaches these derivations, and keeps the raw controls', () => {
  // COMMENTS STRIPPED, AND THE SLICE ASSERTED. This panel's own prose discusses
  // every symbol below at length, so an un-stripped `includes()` would stay green
  // after the render call was deleted — the trap band-preset-wording.test.ts
  // documents. Row 1 proves the stripping really happened.
  const panel = readFileSync(
    join(__dirname, '..', '..', 'components', 'effects', 'BandPresetPanel.tsx'), 'utf8');
  const code = panel
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  it('the comment strip removed the prose that names these symbols', () => {
    expect(panel).toMatch(/BBB GGG RRR packing/);   // in the docblock
    expect(code).not.toMatch(/BBB GGG RRR packing/); // and only there
  });

  it('mounts the swatch strip with no guard other than the cram arm itself', () => {
    const line = code.split('\n').find((l) => /<ColourSwatches\b/.test(l));
    expect(line, 'the swatch strip is not mounted at all').toBeDefined();
    // No `&&` on the mount line: the strip renders for every cram band, not for
    // some subset a later edit narrowed it to.
    expect(line!).not.toMatch(/&&\s*<ColourSwatches/);
  });

  it('the raw decimal list field is still there, and still writes the whole list', () => {
    expect(code).toMatch(/parseColours\(/);
    expect(code).toMatch(/setColoursCommand\(/);
    expect(code).toMatch(/placeholder="14 3584"/);
  });

  it('the raw addr spinner is still a NumberField with no min/max', () => {
    // aeon §E.4, and the same assertion band-preset-wording makes about the edge
    // spinners: the gloss is added BESIDE the number, never instead of it, and
    // adding a bound here would be the clamp that ruling forbids.
    expect(code).toMatch(/addrGloss\(/);
    expect(code).not.toMatch(/min=\{/);
    expect(code).not.toMatch(/max=\{/);
  });

  it('spells no CRAM geometry of its own — it asks the provider', () => {
    // The panel's own law: a rule spelled in a component is a rule the advisory
    // beside it can disagree with.
    expect(code).not.toMatch(/>>\s*5/);
    expect(code).not.toMatch(/&\s*15/);
    expect(code).not.toMatch(/CRAM_LINE_ENTRIES/);
  });
});
