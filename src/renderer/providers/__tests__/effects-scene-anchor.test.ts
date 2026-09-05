// `scene.anchor` — the control and the writer, checked without React.
//
// WHAT THIS FILE IS REALLY FOR. The key it authors has a TOP-OF-RANGE SENTINEL:
// `dsa`/`dsb` are 0..15 and 15 means NO DEFORM, so a control that clamps toward
// its maximum authors the exact opposite of what the gesture asked for, and the
// document validates, builds and renders a flat plane. Every row below is
// either about that inversion or about the second one beside it — `channel`
// shares the object and has NO sentinel, so a clamp there authors a real
// channel that is not the one asked for.
//
// The expectations are derived from `EFFECTS_ANCHOR_*`, which are themselves
// derived from the schema, so a contract amendment moves both sides together;
// where a row needs to know something the schema cannot say (that 15 means "no
// deform"), it says so against the raw schema walked by hand, never against a
// number typed here.

import { describe, it, expect } from 'vitest';
import {
  ANCHOR_ROW, ANCHOR_SEED, anchorValue, anchorEnabled, anchorLine,
  anchorShiftOptions, anchorShiftLadder, anchorChannelOptions,
  anchorToggleCommand, setAnchorChannelCommand, setAnchorShiftCommand,
  anchorDeformAdvisories, rowRemapPreconditions, curveAnchorDeformAdvisory,
  sceneDeformAdvisories,
  type AnchorShiftField,
} from '../effects-aeon';
import {
  EFFECTS_ANCHOR_SHIFT_BOUNDS, EFFECTS_ANCHOR_CHANNEL_BOUNDS, EFFECTS_ANCHOR_NONE,
  EFFECTS_ROW_REMAP_GENERATOR_REFUSALS, newEffectsScene,
} from '../../../core/formats/effects/scene-ui';
import {
  parseEffectsScene, serializeEffectsScene,
  type EffectsScene, type EffectsSceneLibrary,
} from '../../../core/formats/effects/scene';
import { EFFECTS_CHANNEL_BANDS } from '../../../core/formats/effects/channel-bands';
import rawSchema from '../../../core/formats/effects/aurora-effects-scene.schema.json';

const S = rawSchema as unknown as Record<string, any>;
const SHIFT_FIELDS: readonly AnchorShiftField[] = ['dsa', 'dsb'];

function library(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [] };
}

/** The document a command would land — what the store writes to disk. */
function applied(cmd: ReturnType<typeof anchorToggleCommand>): EffectsScene {
  expect(cmd, 'the command was null — nothing was authored').not.toBeNull();
  const next = cmd!.newScene;
  expect(next, 'the command carries no document').not.toBeNull();
  return next!;
}

describe('the anchor deform ladders — the sentinel is a NAMED CHOICE, never a rung', () => {
  it('offers exactly the field\'s own legal shifts, once each', () => {
    for (const field of SHIFT_FIELDS) {
      const { min, max } = EFFECTS_ANCHOR_SHIFT_BOUNDS[field];
      const shifts = anchorShiftOptions(field).map((o) => o.shift);
      expect(new Set(shifts).size, `${field} repeats a shift`).toBe(shifts.length);
      expect([...shifts].sort((a, b) => a - b))
        .toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
    }
  });

  /**
   * REQUIREMENT 4, HALF ONE: a control driven to its extreme must not author the
   * sentinel by accident.
   *
   * "Driven to its extreme" is spelled as the two things a person can actually
   * do to a `<select>` — take the LAST option, and take the option that means
   * the most motion. Neither is the sentinel. The row also asserts the ladder's
   * ORDER, because the reason the extreme is safe is that the list runs least
   * motion first: the far end of a drag is the loudest setting, and the
   * sentinel is at the other end wearing a name.
   */
  it('has an extreme that is the LOUDEST setting, not the sentinel', () => {
    for (const field of SHIFT_FIELDS) {
      const { min, max } = EFFECTS_ANCHOR_SHIFT_BOUNDS[field];
      const options = anchorShiftOptions(field);
      const last = options[options.length - 1];
      expect(last.shift, `${field}: the end of the list is the sentinel`).not.toBe(max);
      expect(last.shift, `${field}: the end of the list is not the loudest shift`).toBe(min);
      expect(last.off).toBe(false);
      // The ladder BELOW the off entry is strictly descending in shift, i.e.
      // strictly ascending in motion. A list that drifted back into shift order
      // would put the sentinel's neighbour at the loud end.
      const ladder = anchorShiftLadder(field).map((o) => o.shift);
      expect(ladder).toEqual([...ladder].sort((a, b) => b - a));
      expect(ladder).not.toContain(max);
      expect(ladder.length).toBe(max - min);
    }
  });

  it('names the sentinel for what it DOES, exactly once, at the top', () => {
    for (const field of SHIFT_FIELDS) {
      const options = anchorShiftOptions(field);
      const off = options.filter((o) => o.off);
      expect(off.length, `${field} has ${off.length} off entries`).toBe(1);
      expect(options[0].off, `${field}'s off entry is not first`).toBe(true);
      expect(off[0].shift).toBe(EFFECTS_ANCHOR_SHIFT_BOUNDS[field].max);
      // NAMED, not numbered: the label says what it does. The number is in the
      // title for anyone who needs it, and nowhere else.
      expect(off[0].label).toMatch(/^off\b/);
      expect(off[0].label).not.toMatch(new RegExp(`\\b${off[0].shift}\\b`));
      expect(off[0].title).toMatch(/NO-DEFORM sentinel/);
      // ANTI-VACUOUS: the rungs are NOT labelled "off", so the row above is
      // distinguishing two things that really are different on screen.
      for (const rung of anchorShiftLadder(field)) expect(rung.label).not.toMatch(/off/);
    }
  });

  /**
   * THE TWO FIELDS ARE TWO LADDERS. They are the same numbers today; the row is
   * that each is built from its OWN bounds, so a contract that moved one and
   * not the other cannot leave a ladder quietly testing the wrong sentinel.
   * Asserted by walking the raw schema twice, by hand.
   */
  it('builds each field\'s ladder from that field\'s own schema node', () => {
    const at = S.properties.anchor.oneOf.find((b: any) => b?.properties?.at).properties.at;
    for (const field of SHIFT_FIELDS) {
      const node = at.properties[field];
      const options = anchorShiftOptions(field);
      expect(options.find((o) => o.off)!.shift, `${field} off`).toBe(node.maximum);
      expect(options[options.length - 1].shift, `${field} loudest`).toBe(node.minimum);
      // Every title names its own field, so a ladder rendered under the wrong
      // label is visible rather than merely wrong.
      for (const o of options) expect(o.title).toContain(`anchor.at.${field}`);
    }
  });
});

describe('the channel row — an ORDINAL whose top is not an off', () => {
  it('offers every channel the schema admits, ascending', () => {
    const { min, max } = EFFECTS_ANCHOR_CHANNEL_BOUNDS;
    expect(anchorChannelOptions().map((o) => o.channel))
      .toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
  });

  it('carries aeon\'s declared band for a channel that has one, and says so when it does not', () => {
    for (const o of anchorChannelOptions()) {
      const band = EFFECTS_CHANNEL_BANDS.get(o.channel);
      if (band === undefined) {
        expect(o.title).toMatch(/declares no screen band/);
      } else {
        expect(o.label).toContain(`${band.lo}`);
        expect(o.label).toContain(`${band.hi}`);
        expect(o.title).toContain(band.source);
      }
    }
    // ANTI-VACUOUS: this game declares at least one band, so the branch that
    // formats one is really exercised.
    expect(EFFECTS_CHANNEL_BANDS.size).toBeGreaterThan(0);
  });

  it('has NO off entry — the channel\'s off is the whole anchor being absent', () => {
    // The trap this row exists against: `channel` sits in the same object as two
    // fields whose top means "none", and it would read as symmetric. It is not.
    for (const o of anchorChannelOptions()) expect(o.label).not.toMatch(/off|none/i);
    expect(anchorChannelOptions().map((o) => o.channel))
      .toContain(EFFECTS_ANCHOR_CHANNEL_BOUNDS.max);
  });
});

describe('the writer', () => {
  const scene = () => newEffectsScene('waterline', 'Waterline');

  it('turns the anchor on with BOTH planes off, and it round-trips', () => {
    const lib = library([scene()]);
    const next = applied(anchorToggleCommand(lib, 'waterline', true));
    expect(anchorValue(next)).toEqual({ ...ANCHOR_SEED });
    expect(ANCHOR_SEED.dsa).toBe(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max);
    expect(ANCHOR_SEED.dsb).toBe(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max);
    // THROUGH THE REAL CODEC, both ways: this is the whole claim of the parcel's
    // first half — a person authors an anchor and it survives a save and a load.
    const text = serializeEffectsScene(next);
    expect(JSON.parse(text).anchor).toEqual({ at: { ...ANCHOR_SEED } });
    expect(anchorValue(parseEffectsScene(text, 'waterline'))).toEqual({ ...ANCHOR_SEED });
  });

  /**
   * REQUIREMENT 4, HALF TWO: authoring OFF really writes the sentinel.
   *
   * Driven through the ladder's own off entry — the value a person's click
   * produces — not through a literal 15, so the row measures the control and
   * the writer together. And it asserts the value ON DISK, because "the object
   * in memory has a 15 in it" is not the claim; the claim is that aeon's
   * generator will read one.
   */
  it('AUTHORS THE SENTINEL when the off entry is chosen, and writes it to disk', () => {
    for (const field of SHIFT_FIELDS) {
      const seeded = library([scene()]);
      const on = applied(anchorToggleCommand(seeded, 'waterline', true));
      // Start from a LIVE shift, so the off write is a real change and not a
      // no-op that would make this row pass over an unchanged document.
      const loud = anchorShiftLadder(field)[anchorShiftLadder(field).length - 1];
      const lib1 = library([on]);
      const live = applied(setAnchorShiftCommand(lib1, 'waterline', field, loud.shift));
      expect(anchorValue(live)![field]).toBe(loud.shift);

      const offEntry = anchorShiftOptions(field).find((o) => o.off)!;
      const lib2 = library([live]);
      const off = applied(setAnchorShiftCommand(lib2, 'waterline', field, offEntry.shift));
      expect(anchorValue(off)![field]).toBe(EFFECTS_ANCHOR_SHIFT_BOUNDS[field].max);
      expect(JSON.parse(serializeEffectsScene(off)).anchor.at[field])
        .toBe(EFFECTS_ANCHOR_SHIFT_BOUNDS[field].max);
      // And the anchor is STILL DECLARED: this off is one plane's, not the
      // feature's. The two states the schema keeps apart stay apart here.
      expect(anchorEnabled(off)).toBe(true);
      expect(JSON.parse(serializeEffectsScene(off)).anchor).not.toBe(EFFECTS_ANCHOR_NONE);
    }
  });

  it('writes every rung the ladder offers, and the codec accepts all of them', () => {
    for (const field of SHIFT_FIELDS) {
      const seeded = library([scene()]);
      let doc = applied(anchorToggleCommand(seeded, 'waterline', true));
      for (const o of anchorShiftOptions(field)) {
        const lib = library([doc]);
        const cmd = setAnchorShiftCommand(lib, 'waterline', field, o.shift);
        // A no-op is legitimate only when the value is already there.
        doc = cmd === null ? doc : cmd.newScene!;
        expect(anchorValue(doc)![field], `${field} rung ${o.shift}`).toBe(o.shift);
        expect(() => serializeEffectsScene(doc), `${field} rung ${o.shift} refused`).not.toThrow();
      }
    }
  });

  it('writes every channel the row offers', () => {
    const seeded = library([scene()]);
    let doc = applied(anchorToggleCommand(seeded, 'waterline', true));
    for (const o of anchorChannelOptions()) {
      const lib = library([doc]);
      const cmd = setAnchorChannelCommand(lib, 'waterline', o.channel);
      doc = cmd === null ? doc : cmd.newScene!;
      expect(anchorValue(doc)!.channel).toBe(o.channel);
      expect(() => serializeEffectsScene(doc)).not.toThrow();
    }
  });

  /**
   * REQUIREMENT 3: never clamp. A clamp is not merely absent — it is REFUSED,
   * and the refusal is what a caller that went round the form gets.
   *
   * The values probed are the two a clamp would fold: one past the top (which
   * clamps ONTO the sentinel — "as much as possible" answered with "none") and
   * one past the bottom. The row asserts the throw AND that no document was
   * produced, because a clamp that also threw would still be a clamp.
   */
  it('REFUSES an out-of-range shift instead of clamping onto the sentinel', () => {
    for (const field of SHIFT_FIELDS) {
      const { min, max } = EFFECTS_ANCHOR_SHIFT_BOUNDS[field];
      const seeded = library([scene()]);
      const on = applied(anchorToggleCommand(seeded, 'waterline', true));
      const lib = library([on]);
      for (const bad of [max + 1, min - 1, 1.5, Number.NaN]) {
        expect(() => setAnchorShiftCommand(lib, 'waterline', field, bad),
          `anchor.at.${field} accepted ${bad}`)
          .toThrow(/refusing to author/);
      }
      // The document is untouched: nothing was written on the way to the throw.
      expect(anchorValue(lib.scenes[0])![field]).toBe(max);
      // And the refusal SAYS which end is which, so the reader is not left to
      // rediscover the inversion.
      expect(() => setAnchorShiftCommand(lib, 'waterline', field, max + 1))
        .toThrow(new RegExp(`${max} is the NO-DEFORM sentinel`));
    }
  });

  it('REFUSES an out-of-range channel, for the OTHER reason', () => {
    const { min, max } = EFFECTS_ANCHOR_CHANNEL_BOUNDS;
    const seeded = library([scene()]);
    const on = applied(anchorToggleCommand(seeded, 'waterline', true));
    const lib = library([on]);
    for (const bad of [max + 1, min - 1, 2.5]) {
      expect(() => setAnchorChannelCommand(lib, 'waterline', bad), `channel accepted ${bad}`)
        .toThrow(/refusing to author/);
    }
    // The message must NOT talk about a sentinel here — there isn't one, and a
    // copied message would teach the reader a rule this field does not have.
    expect(() => setAnchorChannelCommand(lib, 'waterline', max + 1))
      .toThrow(/every value in that range is a REAL channel/);
  });

  it('turning the anchor off deletes the key, and leaves a SPELLED "none" alone', () => {
    const seeded = library([scene()]);
    const on = applied(anchorToggleCommand(seeded, 'waterline', true));
    const lib = library([on]);
    const off = applied(anchorToggleCommand(lib, 'waterline', false));
    expect('anchor' in off).toBe(false);
    expect(JSON.parse(serializeEffectsScene(off)).anchor).toBeUndefined();

    // A hand-authored `"anchor": "none"` is the SAME document and keeps its
    // spelling — setSceneFieldCommand's rule, checked here because this writer
    // has its own copy of it.
    const spelled = { ...scene(), anchor: EFFECTS_ANCHOR_NONE } as EffectsScene;
    expect(anchorToggleCommand(library([spelled]), 'waterline', false)).toBeNull();
  });

  it('writes nothing at all when there is no anchor to edit', () => {
    // Reaching a shift or a channel on a scene with no anchor is a caller that
    // went round the form; it must not CREATE one, because the seed would then
    // arrive with the caller's shift on it and no channel anybody chose.
    const lib = library([scene()]);
    for (const field of SHIFT_FIELDS) {
      expect(setAnchorShiftCommand(lib, 'waterline', field, 0)).toBeNull();
    }
    expect(setAnchorChannelCommand(lib, 'waterline', EFFECTS_ANCHOR_CHANNEL_BOUNDS.max)).toBeNull();
    expect(anchorValue(lib.scenes[0])).toBeNull();
  });

  it('reads back "none", an absent key and a live anchor as three answers', () => {
    expect(anchorValue({})).toBeNull();
    expect(anchorValue({ anchor: EFFECTS_ANCHOR_NONE as never })).toBeNull();
    expect(anchorValue({ anchor: { at: { channel: 1, dsa: 3, dsb: 4 } } }))
      .toEqual({ channel: 1, dsa: 3, dsb: 4 });
    expect(anchorLine({})).toBeNull();
    expect(anchorLine({ anchor: { at: { channel: 2, dsa: EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max, dsb: 1 } } }))
      .toBe('channel 2 · A off · B ÷2');
  });
});

describe('what the new control can now author, and what it must say about it', () => {
  const withAnchor = (over: Partial<{ channel: number; dsa: number; dsb: number }>): EffectsScene => {
    const s = newEffectsScene('waterline');
    s.anchor = { at: { ...ANCHOR_SEED, ...over } };
    return s;
  };

  /**
   * THE SILENT STATE. A live shift with no table to sample is not a build
   * refusal — the scene ships and the plane does not move — so the panel is the
   * only thing that can say it, and it could not be said before this parcel
   * because the shift could not be authored.
   */
  it('warns when an anchored shift has no table to sample', () => {
    expect(anchorDeformAdvisories(withAnchor({ dsb: 1 })))
      .toEqual([expect.stringContaining('flat-paths a live shift with no table')]);
    // …and goes quiet the moment the plane has a table.
    const withTable = withAnchor({ dsb: 1 });
    withTable.deform_bg = { shared: { table: { generator: 'sine', amplitude: 8, period: 64 }, speed: 1 } };
    expect(anchorDeformAdvisories(withTable)).toEqual([]);
    // A pure-boundary anchor has nothing to warn about, and silence there is a
    // fact rather than a gap.
    expect(anchorDeformAdvisories(withAnchor({}))).toEqual([]);
    expect(anchorDeformAdvisories(newEffectsScene('plain'))).toEqual([]);
    // Both planes, independently.
    expect(anchorDeformAdvisories(withAnchor({ dsa: 2, dsb: 2 })).length).toBe(2);
  });

  /**
   * THE BUILD REFUSAL THIS CONTROL MAKES REACHABLE FOR THE FIRST TIME. A curve
   * layer plus an anchor with live shifts is refused by aeon's `scene()`. The
   * advisory already existed (it was written for hand-edited files); this row
   * is that the state is now AUTHORABLE and the existing warning still fires on
   * a document this writer produced.
   */
  it('the curve-plus-live-anchor refusal fires on a document THIS writer produced', () => {
    const s = newEffectsScene('waterline');
    s.layers[0] = { ...s.layers[0], curve: { to: 'FACTOR_1_4' } };
    const lib = library([s]);
    const on = applied(anchorToggleCommand(lib, 'waterline', true));
    // The SEED composes — aeon's own words, "a PURE-BOUNDARY anchor composes
    // with curves" — which is why the seed is the sentinel on both planes.
    expect(curveAnchorDeformAdvisory(on)).toBeNull();
    const lib2 = library([on]);
    const live = applied(setAnchorShiftCommand(lib2, 'waterline', 'dsb', 2));
    expect(curveAnchorDeformAdvisory(live)).toMatch(/the build refuses the pair/);
    // And it reaches the panel through the list it already paints.
    expect(sceneDeformAdvisories(live)).toContain(curveAnchorDeformAdvisory(live));
  });

  /**
   * THE ROW THE PARCEL EXISTS FOR. `rowRemap`'s precondition 2 was unsatisfiable
   * from the editor: the reader produced "this scene declares no anchor" for a
   * key with no writer. Driven through the toggle, so what clears it is the
   * gesture, not a hand-built object.
   */
  it('CLEARS rowRemap precondition 2 — the reason this writer exists', () => {
    const s = newEffectsScene('waterline');
    s.layers[0] = { ...s.layers[0], rowRemap: { plane_y: 64, height_shift: 4 } };
    const before = rowRemapPreconditions(s, 0);
    // BEFORE: the reader's own sentence about the missing key, quoting aeon's
    // precondition 2 verbatim. Matched on both halves — Aurora's diagnosis and
    // the contract's clause — so a message that lost its citation fails here.
    expect(before.some((p) => p.includes('this scene declares no anchor'))).toBe(true);
    expect(before.some((p) => p.includes(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.anchor))).toBe(true);
    const lib = library([s]);
    const on = applied(anchorToggleCommand(lib, 'waterline', true));
    expect(rowRemapPreconditions(on, 0).some((p) => p.includes('declares no anchor'))).toBe(false);
  });

  /**
   * PRECONDITION 1 IS A SEPARATE FACT AND THE SEED DOES NOT CLEAR IT. Saying so
   * out loud, because "the anchor row went green" is exactly the reading that
   * would leave an author with a build that still refuses. Both routes to
   * clearing it are driven here, and the second one is the waterline's.
   */
  it('leaves precondition 1 open until something actually varies, then closes on either route', () => {
    const s = newEffectsScene('waterline');
    s.layers[0] = { ...s.layers[0], rowRemap: { plane_y: 64, height_shift: 4 } };
    const lib = library([s]);
    const on = applied(anchorToggleCommand(lib, 'waterline', true));
    const vary = (p: string[]) => p.some((x) => x.includes('nothing for the remap to vary'));
    expect(vary(rowRemapPreconditions(on, 0)), 'a pure-boundary anchor is not variation')
      .toBe(true);
    expect(rowRemapPreconditions(on, 0).some((p) => p.includes('the anchor\'s dsb is')))
      .toBe(true);

    // Route (c): a curve on the strip.
    const curved = { ...on, layers: [{ ...on.layers[0], curve: { to: 'FACTOR_1_4' as const } }] };
    expect(vary(rowRemapPreconditions(curved, 0))).toBe(false);

    // Route (b): the anchor's own live dsb WITH a deform_bg table — aeon's
    // "which is how the shipped waterline gets its variation".
    const lib2 = library([on]);
    const liveDsb = applied(setAnchorShiftCommand(lib2, 'waterline', 'dsb', 2));
    expect(vary(rowRemapPreconditions(liveDsb, 0)), 'a live dsb with no table is not variation')
      .toBe(true);
    const withTable: EffectsScene = {
      ...liveDsb,
      deform_bg: { shared: { table: { generator: 'sine', amplitude: 64, period: 128 }, speed: 1 } },
    };
    expect(rowRemapPreconditions(withTable, 0)).toEqual([]);
    // The whole document the two routes produce is one aeon's generator will
    // read: it survives the codec's closed-schema write path.
    expect(() => serializeEffectsScene(withTable)).not.toThrow();
  });
});

describe('the row\'s wording carries the facts a control cannot', () => {
  it('names the OTHER off in the toggle\'s hint', () => {
    expect(ANCHOR_ROW.none).toBe(EFFECTS_ANCHOR_NONE);
    expect(ANCHOR_ROW.hint).toMatch(/deforms NEITHER plane is a different thing/);
  });

  it('says where the channel\'s world Y actually lives', () => {
    // The fact the sec7 packet's §4(d) had to discover from a build refusal: the
    // anchor's position is a PRESET key, not a scene key.
    expect(ANCHOR_ROW.bindingHint).toMatch(/patch_world_ys/);
    expect(ANCHOR_ROW.channelTitle).toMatch(/not here/);
  });
});
