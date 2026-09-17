// DELETING A BOUND PRESET — EFFECTS-W1 defect 11, and the preview chip (14).
//
// `Delete` removed the preset document with no confirmation and left every
// section binding that named it DANGLING. aeon's generator refuses the build by
// name for that ("rasterRef 'x' names no preset document … Known ids: …"), and
// the walkthrough met that refusal through the FAST wrapper, which replaces it
// with a wrong message about missing out-of-repo donor directories. One
// unguarded click, one misattributed build failure, and no way back to the
// control.
//
// ⚠ THESE ROWS READ SOURCE AND CALL THE PROVIDER. Whether the button is really
// greyed on screen and the sentence really painted is the CDP harness's claim
// (scratchpad/effects-section-picker-harness.mjs and its siblings), not this
// file's.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  deletePresetRefusal, sectionsBindingPreset, regionsBindingPreset,
  REGION_RASTER_BINDING_ROW,
} from '../../../providers/effects-preset';
import { BINDING_LABELS } from '../../../providers/regions-aeon';
import { parseRegionsDocument } from '../../../../core/formats/regions/document';

const panel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8');
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bar = readFileSync(join(__dirname, '..', 'EffectsToolOptions.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sec = (rasterRef: string | null) => ({ rasterRef });

describe('a preset nothing binds deletes exactly as before', () => {
  it('no binding, no refusal: this is a guard, not a wall', () => {
    // ANTI-VACUOUS for every row below: a predicate that refused everything
    // would satisfy them all and make Delete useless.
    expect(deletePresetRefusal([sec(null), sec('other')], 'mine')).toBeNull();
    expect(deletePresetRefusal([], 'mine')).toBeNull();
    expect(deletePresetRefusal([null, null], 'mine')).toBeNull();
  });
});

describe('a preset a section binds is refused, and the sentence is actionable', () => {
  it('one section: names it, names the build\'s own failure, and says what to do', () => {
    const why = deletePresetRefusal([sec(null), sec(null), sec('mine')], 'mine')!;
    expect(why).toMatch(/^Section 2 binds "mine"\./);
    expect(why).toMatch(/aeon's build refuses that by name/);
    // THE ESCAPE, named as a control the author can find — the difference
    // between a guard and a dead end.
    expect(why).toMatch(/Hand-authored raster/);
    expect(why).toMatch(/Section dropdown above/);
  });

  it('several sections: all of them, in index order, in English', () => {
    const why = deletePresetRefusal([sec('mine'), sec(null), sec('mine'), sec('mine')], 'mine')!;
    expect(why).toMatch(/^Sections 0, 2 and 3 bind "mine"\./);
    expect(why).toMatch(/those bindings naming a document that does not exist/);
  });

  it('the sections are found by the SECTION\'s own ref, never by the library', () => {
    // A binding lives in a section sidecar; asking the preset library "is
    // anyone pointing at me" is a question it cannot answer.
    expect(sectionsBindingPreset([sec('a'), null, sec('b'), sec('a')], 'a')).toEqual([0, 3]);
    expect(sectionsBindingPreset([sec('a')], 'b')).toEqual([]);
  });
});

// ═══ REGION MODE (DELETE-PRESET-REGION-BOUND, 2026-09-17) ═══
//
// The guard above asks the SECTIONS only. On an act whose regions.json exists
// (ruling B1: file presence, asked through `actHasRegionsFile`) the raster
// bindings live on the region rows, so on OJZ act 1 a preset document region
// `sec5` binds could be deleted with a clean bill of health and the dangling
// ref met as aeon's build refusing by name.
//
// ⚠ THE FIELD IS `Region.rasterRef`, NOT `Region.preset`. `preset` is the
// RECORD NAME of an EffectsPreset in the GAME's own effects library, required
// and validated by aeon's generator; `rasterRef` is the id of a raster preset
// DOCUMENT, the same namespace `Section.rasterRef` and this panel's library
// name. A guard over `preset` would refuse deletions for no reason and still
// miss the binding that dangles. Row `[ns]` below is the plant for that.
describe('deleting a preset a REGION binds is refused (DELETE-PRESET-REGION-BOUND)', () => {
  const rect = { x: 0, y: 0, w: 2048, h: 2048 };
  // A region-mode act: `document` non-null is enough for `actHasRegionsFile`.
  const regionAct = (regions: Array<{ id: string; rasterRef?: string | null; preset?: string }>) => ({
    regions: {
      document: {
        schema: 1,
        act: 'zz_act1',
        regions: regions.map((r) => ({ preset: 'ZZ_Preset', ...r, rect })),
      },
      loadedPath: 'data/regions.json',
      unreadable: null,
    },
  });
  // State 3 of `ActRegionsState`: the file exists and the read or the codec
  // refused it. Aurora cannot tell what binds anything on this act.
  const refusedAct = () => ({
    regions: {
      document: null,
      loadedPath: null,
      unreadable: { path: 'data/regions.json', reason: 'unexpected end of JSON input' },
    },
  });
  // aeon's OJZ act 1 regions.json, the committed copy (provenance beside it) —
  // the same blob the scene-relation sentence's rows read. Every id below is
  // DERIVED from the file, never typed.
  // Through the REAL CODEC, so these rows depend on a document the app could
  // actually load rather than on a `JSON.parse` this file trusts.
  const OJZ_ACT1 = resolve(__dirname, '../../../../../test/fixtures/regions/ojz_act1.regions.json');
  const ojzDoc = () => parseRegionsDocument(readFileSync(OJZ_ACT1, 'utf8'));
  const ojzAct = () => ({
    regions: { document: ojzDoc(), loadedPath: 'x/regions.json', unreadable: null },
  });
  const ojzBinders = () => ojzDoc().regions
    .filter((r) => (r.rasterRef ?? null) !== null)
    .map((r) => ({ id: r.id, ref: r.rasterRef as string }));

  it('[av] a region-mode act whose regions bind something ELSE still deletes cleanly', () => {
    // ANTI-VACUOUS, and the region-side twin of this file's first row: a
    // predicate that refused every delete on a region-mode act would satisfy
    // every positive row below and make Delete useless on OJZ act 1.
    const bound = ojzBinders();
    expect(bound.length).toBeGreaterThan(0);
    const ids = bound.map((b) => b.ref);
    expect(ids).not.toContain('nothing_binds_me');
    const sections = Array.from({ length: 9 }, () => sec(null));
    expect(deletePresetRefusal(sections, 'nothing_binds_me', ojzAct())).toBeNull();
    // ...and with no region at all, and with no section either.
    expect(deletePresetRefusal(sections, 'mine', regionAct([{ id: 'a' }]))).toBeNull();
    expect(deletePresetRefusal([], 'mine', regionAct([{ id: 'a' }]))).toBeNull();
  });

  it('[ojz] one region, on OJZ act 1 as shipped: names the row and the Regions panel', () => {
    const bound = ojzBinders();
    // Derived: take a ref exactly one region row carries.
    const solo = bound.find((b) => bound.filter((o) => o.ref === b.ref).length === 1)!;
    expect(solo).toBeDefined();
    const sections = Array.from({ length: 9 }, () => sec(null));
    const why = deletePresetRefusal(sections, solo.ref, ojzAct())!;
    expect(why).toBe(`Region ${solo.id} binds "${solo.ref}". Deleting it would leave that binding `
      + 'naming a document that does not exist, and aeon\'s build refuses that by name. Select '
      + `that region in the Regions panel and use "revert to inherited" on its `
      + `${BINDING_LABELS.raster} row, under Bindings, first.`);
    // The pointer is the REGIONS panel, never the Section dropdown: on this act
    // the Section select refuses a binding outright.
    expect(why).not.toMatch(/Section dropdown/);
  });

  it('[plural] several regions: all of them, once each, in author order', () => {
    // `b` is carved: several entries, one id, one Regions panel row.
    const act = regionAct([
      { id: 'b', rasterRef: 'mine' }, { id: 'a', rasterRef: 'other' },
      { id: 'b', rasterRef: 'mine' }, { id: 'c', rasterRef: 'mine' }, { id: 'd' },
    ]);
    const why = deletePresetRefusal([sec(null)], 'mine', act)!;
    expect(why).toMatch(/^Regions b and c bind "mine"\./);
    expect(why).toMatch(/those bindings naming a document that does not exist/);
    expect(why).toMatch(/Select those regions in the Regions panel/);
  });

  it('[unread] a refused regions.json is never a clean bill of health', () => {
    // ⚠ THE LOUD-ON-UNMEASURABLE ROW. `document` null with `unreadable` set is
    // "the file exists and could not be read": whether a region binds this
    // document is UNKNOWN, and answering null here would print a clean bill of
    // health derived from a failed read.
    const why = deletePresetRefusal([sec(null)], 'mine', refusedAct());
    expect(why).not.toBeNull();
    expect(why!).toMatch(/^Aurora cannot tell whether a region binds "mine":/);
    expect(why!).toMatch(/regions\.json could not be read/);
    expect(why!).toMatch(/The Regions panel says why the file was refused\./);
    // It must not read as either of the other two answers.
    expect(why!).not.toMatch(/no region binds/);
    expect(why!).not.toMatch(/binds "mine"\. Deleting/);
  });

  it('[ns] the scan reads the region\'s own rasterRef, never its preset record name', () => {
    // THE NAMESPACE PLANT. `preset` is a record name in the GAME's effects
    // library; the Delete button deletes a DOCUMENT from Aurora's library. A
    // guard over `preset` would refuse this delete for no reason.
    const act = regionAct([{ id: 'a', preset: 'mine', rasterRef: null }]);
    expect(deletePresetRefusal([sec(null)], 'mine', act)).toBeNull();
    expect(regionsBindingPreset(act.regions.document, 'mine')).toEqual([]);
    // ...and it does find the REF, so the rows above are not green by accident.
    const bound = regionAct([{ id: 'a', preset: 'Other_Record', rasterRef: 'mine' }]);
    expect(deletePresetRefusal([sec(null)], 'mine', bound)).toMatch(/^Region a binds "mine"\./);
    expect(regionsBindingPreset(bound.regions.document, 'mine')).toEqual(['a']);
    // Absent and null are the same "no binding", as everywhere else in the codec.
    expect(deletePresetRefusal([sec(null)], 'mine', regionAct([{ id: 'a' }]))).toBeNull();
    expect(regionsBindingPreset(regionAct([{ id: 'a' }]).regions.document, 'mine')).toEqual([]);
  });

  it('[carve] a carved region is named ONCE: one id, one Regions panel row', () => {
    // `setRegionBinding`'s invariant: a region with several rectangles is
    // several `regions[]` entries sharing an id, all carrying identical
    // bindings, and the panel shows one row for them. The sentence points at
    // that row, so naming it three times would point three times at one
    // control.
    const doc = regionAct([
      { id: 'b', rasterRef: 'mine' }, { id: 'b', rasterRef: 'mine' },
      { id: 'b', rasterRef: 'mine' },
    ]).regions.document;
    expect(doc.regions.length).toBe(3);
    expect(regionsBindingPreset(doc, 'mine')).toEqual(['b']);
  });

  it('[both] a leftover section sidecar is reported too, beside the region cause', () => {
    // A region-mode act can carry BOTH a readable regions.json and (illegally)
    // section sidecars still holding refs — the tree `sectionRasterWriteRefusal`
    // exists for. Both bindings dangle if the document goes, and clearing the
    // sidecar is the repair for the mode conflict as well, so both are said.
    const act = regionAct([{ id: 'a', rasterRef: 'mine' }]);
    const why = deletePresetRefusal([sec('mine'), sec(null), sec('mine')], 'mine', act)!;
    expect(why).toMatch(/^Region a binds "mine"\./);
    expect(why).toMatch(/Sections 0 and 2 still carry rasterRef "mine" in their sidecars/);
    expect(why).toMatch(/check_mode_conflict refuses/);
    expect(why).toMatch(/Clearing them in the Section dropdown above is allowed/);
  });

  it('[both-solo] the sidecar cause stands alone when no region binds it', () => {
    // Region mode, readable document, nothing on a region row, a leftover
    // sidecar. The clause must not read as a continuation of a clause that is
    // not there.
    const why = deletePresetRefusal([sec(null), sec('mine')], 'mine',
      regionAct([{ id: 'a', rasterRef: 'other' }]))!;
    expect(why).toMatch(/^Section 1 still carries rasterRef "mine" in its sidecar/);
    expect(why).toMatch(/Clearing it in the Section dropdown above is allowed/);
  });

  it('[unread-both] a refused document and a leftover sidecar say both things', () => {
    const why = deletePresetRefusal([sec('mine')], 'mine', refusedAct())!;
    expect(why).toMatch(/^Aurora cannot tell whether a region binds "mine":/);
    expect(why).toMatch(/Section 0 still carries rasterRef "mine" in its sidecar/);
  });

  it('[sec-mode] section mode is untouched: no act, and no regions file, take the old path', () => {
    // The three-state rule, at the only place this parcel could have broken it:
    // `noRegionsLoaded()`'s state (no document, no unreadable) is NOT region
    // mode, and a caller with no act at all is not either.
    const sections = [sec(null), sec(null), sec('mine')];
    const old = deletePresetRefusal(sections, 'mine')!;
    const none = { regions: { document: null, loadedPath: null, unreadable: null } };
    expect(deletePresetRefusal(sections, 'mine', none)).toBe(old);
    expect(deletePresetRefusal(sections, 'mine', {})).toBe(old);
    expect(old).toMatch(/^Section 2 binds "mine"\./);
    expect(old).toMatch(/Section dropdown above/);
    // ...and the region-mode arm really does say something else, so the row
    // above is not comparing one sentence with itself.
    expect(deletePresetRefusal(sections, 'mine', regionAct([{ id: 'a', rasterRef: 'mine' }])))
      .not.toBe(old);
  });

  it('[ctrl] the region sentence names a control that exists in the Regions panel', () => {
    // DERIVED, not typed: the row label comes from `BINDING_LABELS` (the map
    // the panel's own rows are built from) and the escape's words are read out
    // of RegionsPanel.tsx. A sentence pointing at a control nobody can find is
    // the dead end this guard's ruling forbids.
    const regionsPanel = readFileSync(
      join(__dirname, '..', '..', 'regions', 'RegionsPanel.tsx'), 'utf8');
    expect(regionsPanel).toContain('revert to inherited');
    expect(regionsPanel).toContain('title="Bindings"');
    // The row word in the sentence IS the map the panel's rows are built from,
    // so a rename there fails here instead of sending an author to a row that
    // no longer carries that name.
    expect(REGION_RASTER_BINDING_ROW).toBe(BINDING_LABELS.raster);
    const why = deletePresetRefusal([sec(null)], 'mine',
      regionAct([{ id: 'a', rasterRef: 'mine' }]))!;
    expect(why).toContain('"revert to inherited"');
    expect(why).toContain(`${BINDING_LABELS.raster} row`);
    expect(why).toContain('under Bindings');
  });

  it('[dash] no en dash or em dash in any region-mode sentence', () => {
    const texts = [
      deletePresetRefusal([sec(null)], 'mine', regionAct([{ id: 'a', rasterRef: 'mine' }])),
      deletePresetRefusal([sec(null)], 'mine',
        regionAct([{ id: 'a', rasterRef: 'mine' }, { id: 'b', rasterRef: 'mine' }])),
      deletePresetRefusal([sec('mine')], 'mine', refusedAct()),
      deletePresetRefusal([sec('mine')], 'mine', regionAct([{ id: 'a' }])),
    ];
    const codes = texts.flatMap((t) => [...String(t)].map((ch) => ch.codePointAt(0)));
    expect(codes).not.toContain(0x2013);
    expect(codes).not.toContain(0x2014);
  });
});

describe('the panel is wired to the guard, from one derivation', () => {
  it('Delete is disabled by the refusal and the refusal is rendered', () => {
    expect(code).toMatch(/disabled=\{deleteRefusal !== null\}/);
    expect(code).toMatch(/\{deleteRefusal !== null && <Hint tone="warning">\{deleteRefusal\}<\/Hint>\}/);
    // ONE derivation for both — the disabled state and the sentence cannot
    // describe different conditions, which is `lastBandRefusal`'s rule.
    expect(code).toMatch(/deletePresetRefusal\(act\.sections, selected\.id, act\)/);
    // ...and the panel does not re-compare refs of its own.
    expect(code).not.toMatch(/rasterRef === selected\.id/);
  });

  it('[gate] the delete guard is NOT suppressed in region mode, unlike every verdict beside it', () => {
    // DELETE-PRESET-REGION-BOUND. Every section-keyed verdict on this surface is
    // computed only while `regionNotice` is null, because a SECTION is not the
    // owner of a binding on a region-mode act. The delete guard is the one
    // reading that must run in BOTH modes: it asks whether anything still names
    // the document, and on a region-mode act the answer lives on the region
    // rows. Gating it on `regionNotice` would restore the defect exactly.
    const derivation = /const deleteRefusal = [\s\S]*?;\n/.exec(code)![0];
    expect(derivation).toMatch(/deletePresetRefusal\(act\.sections, selected\.id, act\)/);
    expect(derivation).not.toMatch(/regionNotice/);
    // The act is what carries `regions`, so the guard cannot be handed sections
    // alone and still see the region rows.
    expect(code).toMatch(/const regionNotice = act === null \? null : regionModeRasterNotice\(act\)/);
  });
});

describe('the parallax preview is reachable from the tab it is about (defect 14)', () => {
  it('the Effects bar carries the toggle, and it is the SAME view-store switch', () => {
    // The preview existed, was off by default, lived in the View menu and was
    // never mentioned by this tab; the cold reader found it ten minutes after
    // he needed it. A second, private flag would be worse than the burial —
    // this reads and writes the ONE derivation the View menu's own row uses
    // (providers/parallax-preview). It was `overlays.showCameraPreview` until
    // EW-SHAPE-PREVIEW made the switch tab-scoped and the flag a tri-state; the
    // claim this row makes — one switch, not two — is unchanged.
    expect(bar).toMatch(/useParallaxPreviewOn\(\)/);
    expect(bar).toMatch(/onClick=\{\(\) => toggleParallaxPreview\(\)\}/);
    expect(bar).not.toMatch(/overlays\.showCameraPreview/);
    expect(bar).toMatch(/Parallax preview/);
    // It reflects the current state rather than pretending to be a button.
    expect(bar).toMatch(/<Chip active=\{cameraPreview\}/);
  });

  it('and it says out loud that it is the same switch as the menu\'s', () => {
    // `Play bands` documents the identical duplication in its own tooltip; this
    // follows that precedent rather than inventing a second explanation.
    expect(bar).toMatch(/The same switch as[\s\S]{0,80}View > Compose the background/);
  });
});
