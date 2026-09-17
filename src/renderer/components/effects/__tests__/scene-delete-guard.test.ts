// DELETING A BOUND SCENE — DELETE-SCENE-NO-GUARD, 2026-09-17.
//
// The preset half of this question has been guarded since EFFECTS-W1 defect 11
// (`preset-delete-guard.test.ts`, and the region installer added on 2026-09-17).
// The SCENE half had NO guard at all, in either mode: `deleteSceneCommand`
// refuses only when there is no such scene, and the button's other door,
// `deleteSceneGuarded`, asks a CONFIRM when there is a FILE to lose. That is a
// different question — am I destroying a file — and a confirm is what
// `deletePresetRefusal`'s own ruling rejected as an answer to this one ("a
// confirm asks are you sure about a consequence the author cannot see").
// Nothing asked which sections' `sceneRef`, or which regions' `sceneRef`, still
// named the document about to go; aeon's generator then refuses the build by
// name for the dangling ref.
//
// ⚠ THESE ROWS READ SOURCE AND CALL THE PROVIDER. Whether the button is really
// greyed on screen and the sentence really painted is the CDP harness's claim,
// not this file's: Node/Vitest here cannot see React or a canvas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  deleteSceneRefusal, sectionsBindingScene, regionsBindingScene,
  REGION_SCENE_BINDING_ROW, SCENE_REF_ACT_DEFAULT, sceneRefOptions,
} from '../../../providers/effects-aeon';
import { deletePresetRefusal } from '../../../providers/effects-preset';
import { BINDING_LABELS } from '../../../providers/regions-aeon';
import { parseRegionsDocument } from '../../../../core/formats/regions/document';
import type { EffectsSceneLibrary } from '../../../../core/formats/effects/scene';

const panel = readFileSync(join(__dirname, '..', 'EffectsScenePanel.tsx'), 'utf8');
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// The SIBLING PANEL, read for one purpose only: it carries a verdict that IS
// suppressed in region mode, so the structural extraction `[gate]` uses can be
// shown to find a suppressor before it is trusted to report the absence of one.
const presetPanel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sec = (sceneRef: string | null) => ({ sceneRef });

describe('a scene nothing binds deletes exactly as before (DELETE-SCENE-NO-GUARD)', () => {
  it('[av] no binding, no refusal: this is a guard, not a wall', () => {
    // ANTI-VACUOUS for every row below: a predicate that refused everything
    // would satisfy them all and make Delete useless.
    expect(deleteSceneRefusal([sec(null), sec('other')], 'mine')).toBeNull();
    expect(deleteSceneRefusal([], 'mine')).toBeNull();
    expect(deleteSceneRefusal([null, null], 'mine')).toBeNull();
  });
});

describe('a scene a SECTION binds is refused, and the sentence is actionable', () => {
  it('[sec] one section: names it, names the build\'s own failure, and says what to do', () => {
    const why = deleteSceneRefusal([sec(null), sec(null), sec('mine')], 'mine')!;
    expect(why).toMatch(/^Section 2 binds "mine"\./);
    expect(why).toMatch(/aeon's build refuses that by name/);
    // THE ESCAPE, named as a control that exists — the difference between a
    // guard and a dead end. The option's own label, from the one constant the
    // select is built from.
    expect(why).toContain(`"${SCENE_REF_ACT_DEFAULT}"`);
    expect(why).toMatch(/under Section assignment\.$/);
  });

  it('[sec-plural] several sections: all of them, in index order, in English', () => {
    const sections = [sec('mine'), sec(null), sec('mine'), sec('mine')];
    const why = deleteSceneRefusal(sections, 'mine')!;
    expect(why).toMatch(/^Sections 0, 2 and 3 bind "mine"\./);
    expect(why).toMatch(/those bindings naming a document that does not exist/);
    // ⚠ THE LIST SPELLING IS DERIVED FROM THE PRESET REFUSAL, NOT TYPED TWICE.
    // `bindingListWords` could not be imported (effects-preset.ts imports
    // effects-aeon.ts, so the arrow cannot also point back), so the two files
    // each spell the list. This row is what stops them drifting: the preset
    // refusal over the same indices must open with the identical fragment.
    const presetWords = /^(Sections [^"]*) bind "/
      .exec(deletePresetRefusal([{ rasterRef: 'mine' }, { rasterRef: null },
        { rasterRef: 'mine' }, { rasterRef: 'mine' }], 'mine')!)![1];
    expect(why.startsWith(`${presetWords} bind "mine".`)).toBe(true);
  });

  it('[ns-sec] the sections are found by the section\'s own sceneRef, never its rasterRef', () => {
    // THE SECTION-SIDE NAMESPACE PLANT. A section sidecar carries BOTH refs and
    // they are different libraries; a scan over the wrong one would refuse
    // deletions for no reason and miss the binding that dangles.
    const mixed = [
      { sceneRef: 'a', rasterRef: 'z' }, null,
      { sceneRef: null, rasterRef: 'a' }, { sceneRef: 'a', rasterRef: null },
    ];
    expect(sectionsBindingScene(mixed, 'a')).toEqual([0, 3]);
    expect(deleteSceneRefusal(mixed, 'a')).toMatch(/^Sections 0 and 3 bind "a"\./);
    expect(sectionsBindingScene(mixed, 'z')).toEqual([]);
    expect(deleteSceneRefusal(mixed, 'z')).toBeNull();
  });
});

// ═══ REGION MODE ═══
//
// On an act whose regions.json exists (ruling B1: file presence, asked through
// `actHasRegionsFile`) a scene is bound on the REGION rows, and on OJZ act 1 as
// shipped four of them bind one. A section scan alone sees none of that.
//
// ⚠ THE FIELD IS `Region.sceneRef`. Unlike the preset side, there is no second
// field on a `Region` that reads like "a scene": `preset` is the RECORD NAME of
// an EffectsPreset in the GAME's effects library, `rasterRef` is a raster preset
// DOCUMENT id and `bg.layoutRef` a background layout id — three other
// namespaces, none of them a parallax scene. The plant below is kept anyway,
// because the reader is KEY-DRIVEN (`regionBindingValue(region, 'scene')`) and a
// wrong key is a one-word mutation.
describe('deleting a scene a REGION binds is refused (DELETE-SCENE-NO-GUARD)', () => {
  const rect = { x: 0, y: 0, w: 2048, h: 2048 };
  // A region-mode act: `document` non-null is enough for `actHasRegionsFile`.
  const regionAct = (
    regions: Array<{ id: string; sceneRef?: string | null; rasterRef?: string | null;
      preset?: string }>,
  ) => ({
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
  // aeon's OJZ act 1 regions.json, the committed copy (provenance beside it),
  // read through the REAL CODEC rather than a `JSON.parse` this file trusts.
  // Every id below is DERIVED from the file, never typed.
  const OJZ_ACT1 = resolve(__dirname, '../../../../../test/fixtures/regions/ojz_act1.regions.json');
  const ojzDoc = () => parseRegionsDocument(readFileSync(OJZ_ACT1, 'utf8'));
  const ojzAct = () => ({
    regions: { document: ojzDoc(), loadedPath: 'x/regions.json', unreadable: null },
  });
  const ojzBinders = () => ojzDoc().regions
    .filter((r) => (r.sceneRef ?? null) !== null)
    .map((r) => ({ id: r.id, ref: r.sceneRef as string }));

  it('[av-region] a region-mode act whose regions bind other scenes still deletes cleanly', () => {
    // ANTI-VACUOUS, region side: a predicate that refused every delete on a
    // region-mode act would satisfy every positive row below and make Delete
    // useless on OJZ act 1.
    const bound = ojzBinders();
    expect(bound.length).toBeGreaterThan(0);
    expect(bound.map((b) => b.ref)).not.toContain('nothing_binds_me');
    const sections = Array.from({ length: 9 }, () => sec(null));
    expect(deleteSceneRefusal(sections, 'nothing_binds_me', ojzAct())).toBeNull();
    // ...and with no region binding at all, and with no section either.
    expect(deleteSceneRefusal(sections, 'mine', regionAct([{ id: 'a' }]))).toBeNull();
    expect(deleteSceneRefusal([], 'mine', regionAct([{ id: 'a' }]))).toBeNull();
  });

  it('[ojz] one region, on OJZ act 1 as shipped: names the row and the Regions panel', () => {
    const bound = ojzBinders();
    // Derived: a ref exactly one region row carries.
    const solo = bound.find((b) => bound.filter((o) => o.ref === b.ref).length === 1)!;
    expect(solo).toBeDefined();
    const sections = Array.from({ length: 9 }, () => sec(null));
    const why = deleteSceneRefusal(sections, solo.ref, ojzAct())!;
    expect(why).toBe(`Region ${solo.id} binds "${solo.ref}". Deleting it would leave that binding `
      + 'naming a document that does not exist, and aeon\'s build refuses that by name. Select '
      + 'that region in the Regions panel and use "revert to inherited" on its '
      + `${BINDING_LABELS.scene} row, under Bindings, first.`);
    // The pointer is the REGIONS panel, never Section assignment: on this act
    // that select refuses a binding outright.
    expect(why).not.toMatch(/Section assignment/);
  });

  it('[plural] several regions: all of them, once each, in author order', () => {
    // `b` is carved: several entries, one id, one Regions panel row.
    const act = regionAct([
      { id: 'b', sceneRef: 'mine' }, { id: 'a', sceneRef: 'other' },
      { id: 'b', sceneRef: 'mine' }, { id: 'c', sceneRef: 'mine' }, { id: 'd' },
    ]);
    const why = deleteSceneRefusal([sec(null)], 'mine', act)!;
    expect(why).toMatch(/^Regions b and c bind "mine"\./);
    expect(why).toMatch(/those bindings naming a document that does not exist/);
    expect(why).toMatch(/Select those regions in the Regions panel/);
    expect(why).toMatch(/on the scene row, under Bindings, first\.$/);
  });

  it('[unread] a refused regions.json is never a clean bill of health', () => {
    // ⚠ THE LOUD-ON-UNMEASURABLE ROW. `document` null with `unreadable` set is
    // "the file exists and could not be read": whether a region binds this
    // document is UNKNOWN, and answering null would print a clean bill of health
    // derived from a failed read, on the one control whose reason for existing
    // is that a dangling ref is met later as a misattributed build failure.
    const why = deleteSceneRefusal([sec(null)], 'mine', refusedAct());
    expect(why).not.toBeNull();
    expect(why!).toMatch(/^Aurora cannot tell whether a region binds "mine":/);
    expect(why!).toMatch(/regions\.json could not be read/);
    expect(why!).toMatch(/The Regions panel says why the file was refused\./);
    // It must not read as either of the other two answers.
    expect(why!).not.toMatch(/no region binds/);
    expect(why!).not.toMatch(/binds "mine"\. Deleting/);
  });

  it('[ns] the scan reads the region\'s own sceneRef, never preset or rasterRef', () => {
    // THE NAMESPACE PLANT, and see this describe's header for why the pair is
    // asymmetric here. A region whose OTHER two refs carry this id binds no
    // scene, and a guard reading either would refuse this delete for no reason.
    const decoys = regionAct([{ id: 'a', preset: 'mine', rasterRef: 'mine', sceneRef: null }]);
    expect(deleteSceneRefusal([sec(null)], 'mine', decoys)).toBeNull();
    expect(regionsBindingScene(decoys.regions.document, 'mine')).toEqual([]);
    // ...and it does find the sceneRef, so the row above is not green by accident.
    const bound = regionAct([{ id: 'a', preset: 'Other_Record', sceneRef: 'mine' }]);
    expect(deleteSceneRefusal([sec(null)], 'mine', bound)).toMatch(/^Region a binds "mine"\./);
    expect(regionsBindingScene(bound.regions.document, 'mine')).toEqual(['a']);
    // Absent and null are the same "no binding", as everywhere else in the codec.
    expect(deleteSceneRefusal([sec(null)], 'mine', regionAct([{ id: 'a' }]))).toBeNull();
    expect(regionsBindingScene(regionAct([{ id: 'a' }]).regions.document, 'mine')).toEqual([]);
  });

  it('[carve] a carved region is named ONCE: one id, one Regions panel row', () => {
    // `setRegionBinding`'s invariant: a region with several rectangles is
    // several `regions[]` entries sharing an id, all carrying identical
    // bindings, and the panel shows one row for them. Naming it three times
    // would point three times at one control.
    const doc = regionAct([
      { id: 'b', sceneRef: 'mine' }, { id: 'b', sceneRef: 'mine' },
      { id: 'b', sceneRef: 'mine' },
    ]).regions.document;
    expect(doc.regions.length).toBe(3);
    expect(regionsBindingScene(doc, 'mine')).toEqual(['b']);
  });

  it('[both] a leftover section sidecar is reported too, beside the region cause', () => {
    // A region-mode act can carry BOTH a readable regions.json and (illegally) a
    // section sidecar still holding a ref — what `sectionSceneBindRefusal`
    // exists for. Both bindings dangle if the document goes, and clearing the
    // sidecar is the repair for the mode conflict as well, so both are said.
    const act = regionAct([{ id: 'a', sceneRef: 'mine' }]);
    const why = deleteSceneRefusal([sec('mine'), sec(null), sec('mine')], 'mine', act)!;
    expect(why).toMatch(/^Region a binds "mine"\./);
    expect(why).toMatch(/Sections 0 and 2 still carry sceneRef "mine" in their sidecars/);
    expect(why).toMatch(/check_mode_conflict refuses/);
    expect(why).toMatch(/Clearing them under Section assignment is allowed/);
  });

  it('[both-solo] the sidecar cause stands alone when no region binds it', () => {
    // Region mode, readable document, nothing on a region row, a leftover
    // sidecar. The clause must not read as a continuation of a clause that is
    // not there.
    const why = deleteSceneRefusal([sec(null), sec('mine')], 'mine',
      regionAct([{ id: 'a', sceneRef: 'other' }]))!;
    expect(why).toMatch(/^Section 1 still carries sceneRef "mine" in its sidecar/);
    expect(why).toMatch(/Clearing it under Section assignment is allowed/);
  });

  it('[unread-both] a refused document and a leftover sidecar say both things', () => {
    const why = deleteSceneRefusal([sec('mine')], 'mine', refusedAct())!;
    expect(why).toMatch(/^Aurora cannot tell whether a region binds "mine":/);
    expect(why).toMatch(/Section 0 still carries sceneRef "mine" in its sidecar/);
  });

  it('[sec-mode] section mode is untouched: no act, {} and noRegionsLoaded() take the old path', () => {
    // The three-state rule, at the only place this parcel could break it:
    // `noRegionsLoaded()`'s state (no document, no unreadable) is NOT region
    // mode, and a caller with no act at all is not either.
    const sections = [sec(null), sec(null), sec('mine')];
    const old = deleteSceneRefusal(sections, 'mine')!;
    const none = { regions: { document: null, loadedPath: null, unreadable: null } };
    expect(deleteSceneRefusal(sections, 'mine', none)).toBe(old);
    expect(deleteSceneRefusal(sections, 'mine', {})).toBe(old);
    expect(old).toMatch(/^Section 2 binds "mine"\./);
    expect(old).toMatch(/under Section assignment/);
    // ...and the region-mode arm really does say something else, so the row
    // above is not comparing one sentence with itself.
    expect(deleteSceneRefusal(sections, 'mine', regionAct([{ id: 'a', sceneRef: 'mine' }])))
      .not.toBe(old);
  });

  it('[ctrl] both sentences name a control that exists, with words read from source', () => {
    // DERIVED, not typed. The region row label comes from `BINDING_LABELS` (the
    // map the Regions panel's own rows are built from); the escape's words are
    // read out of RegionsPanel.tsx; the section-mode pointer is the
    // CollapsibleSection title this panel actually renders; and the option
    // spelling is the one `sceneRefOptions` puts in the select.
    const regionsPanel = readFileSync(
      join(__dirname, '..', '..', 'regions', 'RegionsPanel.tsx'), 'utf8');
    expect(regionsPanel).toContain('revert to inherited');
    expect(regionsPanel).toContain('title="Bindings"');
    expect(REGION_SCENE_BINDING_ROW).toBe(BINDING_LABELS.scene);
    const region = deleteSceneRefusal([sec(null)], 'mine',
      regionAct([{ id: 'a', sceneRef: 'mine' }]))!;
    expect(region).toContain('"revert to inherited"');
    expect(region).toContain(`${BINDING_LABELS.scene} row`);
    expect(region).toContain('under Bindings');
    // Section mode points BELOW, at the section this panel names, not at a
    // "dropdown above" as the preset refusal does: on this panel the control
    // sits under the scene form, in its own titled section.
    expect(panel).toContain('title="Section assignment"');
    const emptyLibrary: EffectsSceneLibrary =
      { scenes: [], unreadable: [], loadedPaths: [] } as unknown as EffectsSceneLibrary;
    expect(sceneRefOptions(emptyLibrary)[0]).toEqual({ value: '', label: SCENE_REF_ACT_DEFAULT });
    expect(deleteSceneRefusal([sec('mine')], 'mine')!)
      .toContain(`back to "${SCENE_REF_ACT_DEFAULT}" on that section first, under Section `
        + 'assignment.');
  });

  it('[dash] no en dash or em dash in any sentence this guard speaks', () => {
    const texts = [
      deleteSceneRefusal([sec('mine')], 'mine'),
      deleteSceneRefusal([sec('mine'), sec('mine')], 'mine'),
      deleteSceneRefusal([sec(null)], 'mine', regionAct([{ id: 'a', sceneRef: 'mine' }])),
      deleteSceneRefusal([sec(null)], 'mine',
        regionAct([{ id: 'a', sceneRef: 'mine' }, { id: 'b', sceneRef: 'mine' }])),
      deleteSceneRefusal([sec('mine')], 'mine', refusedAct()),
      deleteSceneRefusal([sec('mine')], 'mine', regionAct([{ id: 'a' }])),
    ];
    const codes = texts.flatMap((t) => [...String(t)].map((ch) => ch.codePointAt(0)));
    expect(codes).not.toContain(0x2013);
    expect(codes).not.toContain(0x2014);
  });
});

describe('the scene panel is wired to the guard, from one derivation', () => {
  it('Delete is disabled by the refusal and the refusal is rendered', () => {
    expect(code).toMatch(/disabled=\{deleteRefusal !== null\}/);
    expect(code).toMatch(/\{deleteRefusal !== null && <Hint tone="warning">\{deleteRefusal\}<\/Hint>\}/);
    // ONE derivation for both — the disabled state and the sentence cannot
    // describe different conditions, which is `lastBandRefusal`'s rule.
    expect(code).toMatch(/deleteSceneRefusal\(act\.sections, selected\.id, act\)/);
    // ...and the panel does not re-compare refs of its own.
    expect(code).not.toMatch(/sceneRef === selected\.id/);
  });

  it('[confirm] the file confirm is KEPT, on the same button the refusal disables', () => {
    // THE TWO GUARDS ANSWER DIFFERENT QUESTIONS AND BOTH ARE WANTED. This
    // refusal asks "would deleting this dangle a binding" and DISABLES;
    // `deleteSceneGuarded` asks "am I destroying a file" and CONFIRMS. Because
    // both live on one button, a scene that is bound AND has a file never
    // reaches the confirm: the press cannot happen. Structural, so a later edit
    // cannot move the confirm onto a control the refusal does not cover.
    const button = /<IconButton icon=\{<span>Delete<\/span>\} label=\{`Delete scene[\s\S]*?\/>/
      .exec(code)![0];
    expect(button).toMatch(/disabled=\{deleteRefusal !== null\}/);
    expect(button).toMatch(/void deleteSceneGuarded\(library, selected\.id, run\)/);
  });

  it('[gate] the delete guard is NOT suppressed in region mode', () => {
    // Every section-keyed verdict on this surface is computed only while the
    // region-mode refusal is absent, because a SECTION is not the owner of a
    // binding on a region-mode act. The delete guard is the reading that must
    // run in BOTH modes: it asks whether anything still names the document, and
    // on a region-mode act the answer lives on the region rows. Suppressing it
    // would be the defect, not the fix.
    //
    // ⚠ STRUCTURAL, NOT AN IDENTIFIER SEARCH, and that is the preset parcel's
    // M9 lesson carried across: `not.toMatch(/sceneModeRefusal/)` stays green
    // against a suppressor spelled with any other local. The claim is that the
    // CONDITION that can zero this derivation mentions nothing but the nullity
    // of `act` and `selected`; any added suppressor, whatever it is called, puts
    // a fourth identifier in that set.
    const derivation = /const deleteRefusal = [\s\S]*?;\n/.exec(code)![0];
    expect(derivation).toMatch(/deleteSceneRefusal\(act\.sections, selected\.id, act\)/);
    const cond = /const deleteRefusal = \(([^)]*)\)/.exec(derivation)![1];
    const idents = [...new Set(cond.match(/[A-Za-z_$][\w$]*/g) ?? [])].sort();
    expect(idents).toEqual(['act', 'null', 'selected']);
    // THE INSTRUMENT IS CHECKED BEFORE IT IS TRUSTED. This panel has no
    // region-mode-suppressed derivation to compare against, so the positive
    // control comes from the sibling panel that does: the same extraction over
    // `wiringAdvisory` in BandPresetPanel.tsx DOES find its suppressor, so a
    // regex that matched nothing cannot read here as "no suppressor present".
    const sibling = /const wiringAdvisory = [\s\S]*?;\n/.exec(presetPanel)![0];
    expect(sibling).toMatch(/regionNotice !== null/);
    const siblingCond = /const wiringAdvisory = ([\s\S]*?)\? null/.exec(sibling)![1];
    expect([...new Set(siblingCond.match(/[A-Za-z_$][\w$]*/g) ?? [])].sort())
      .toContain('regionNotice');
    // The act is what carries `regions`, so the guard cannot be handed sections
    // alone and still see the region rows.
    expect(code).toMatch(/deleteSceneRefusal\(act\.sections, selected\.id, act\)/);
  });
});
