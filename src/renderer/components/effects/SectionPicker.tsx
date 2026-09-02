// WHICH SECTION AM I EDITING, AND WHAT IS IT BOUND TO. (EFFECTS-W1 defect 4.)
//
// ═══ WHAT WAS WRONG ═══
//
// This tab has TWO per-section bindings — `SECTION ASSIGNMENT` for the scene and
// the `Section <n>` select at the bottom of `RASTER BAND PRESETS` for the raster
// preset — and they sit ~4,000px apart in one 300px column. Both act on "the
// active section", which was set on a DIFFERENT TAB and named nowhere here.
//
// The cold reader spent eight minutes editing scene `ojz_act1_depth` before
// discovering that the section he was on used `ojz_act1_start` (§a18), and could
// not bind another section without leaving for the Layout tab and coming back —
// which nothing said (§a19, §d6).
//
// ═══ WHY IT IS AT THE TOP, AND NOT BESIDE EITHER BINDING ═══
//
// Because it is about BOTH of them. A picker next to the scene binding would
// leave the raster binding 4,000px away silently following it; one next to the
// raster binding would do the same to the scene. The single number both controls
// read (`editorStore.activeSectionIndex`) is a property of the whole column, so
// it is stated once, first, and never collapsed — a `CollapsibleSection` renders
// no children while shut, and an author who collapsed this would be back where
// they started.
//
// ⚠ IT WRITES THE SAME STORE VALUE THE LAYOUT TAB WRITES. There is no second
// notion of "the section being looked at" — the two-sources-of-truth defect this
// column has already met once (ROADMAP item 43). Changing it here and changing
// it on the Layout tab are the same act, which is exactly why this is a picker
// and not a display.

import React from 'react';
import { T, Select } from '../ui';
import { Field, Hint } from './column-layout';
import { useProjectStore, getActiveLevel, getCurrentZone } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import {
  sectionRasterState, sectionRasterAdvisory, rasterChooserName, wiredSections, eligibleSections,
} from '../../../core/formats/effects/section-wiring';

/** A one-word chip for what this section can carry, in the level's terms. */
const STATE_CHIP: Record<string, { label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  wired: { label: 'raster: wired', tone: 'ok' },
  unthreaded: { label: 'raster: needs one aeon line', tone: 'warn' },
  shared: { label: 'raster: preset is shared', tone: 'warn' },
  unbound: { label: 'raster: binds no preset', tone: 'warn' },
  unknown: { label: 'raster: unknown', tone: 'muted' },
};

export default function SectionPicker(): React.ReactElement | null {
  useHistoryVersion();
  useProjectStore((s) => s.project);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const setActiveSectionIndex = useEditorStore((s) => s.setActiveSectionIndex);
  const level = getActiveLevel(useProjectStore.getState());
  const act = level?.act ?? null;
  if (act === null) return null;
  const zoneId = getCurrentZone(useProjectStore.getState())?.id ?? '';
  const chooser = rasterChooserName(zoneId, act.id);

  const section = act.sections[activeSectionIndex] ?? null;
  const state = sectionRasterState(act.rasterWiring, activeSectionIndex);
  const chip = STATE_CHIP[state] ?? STATE_CHIP.unknown;
  const advisory = sectionRasterAdvisory(act.rasterWiring, activeSectionIndex, chooser);

  // Derived, per act, from aeon's own files — never a list in this repository.
  // See core/formats/effects/section-wiring.ts for why.
  const wired = wiredSections(act.rasterWiring, act.sections.length);
  const eligible = eligibleSections(act.rasterWiring, act.sections.length);

  return (
    <div style={{
      borderBottom: `1px solid ${T.border}`,
      padding: `${T.s3} ${T.s3} ${T.s2}`,
      display: 'flex', flexDirection: 'column', gap: T.s1,
    }} data-effects-section-picker="">
      <Field label="Editing section"
        title="Both per-section bindings on this tab — the scene, under LAYERS, and the raster
          preset, at the bottom of RASTER BAND PRESETS — act on THIS section. It is the same
          number the Layout tab's SECTIONS grid sets.">
        <Select
          title="The section both bindings on this tab act on."
          value={String(activeSectionIndex)}
          style={{ flex: 1, minWidth: 0 }}
          onChange={(v) => setActiveSectionIndex(Number(v))}>
          {act.sections.map((s, i) => (
            // AN EMPTY SECTION IS OFFERED AND LABELLED, not hidden. An act's
            // grid can carry holes, and a picker that silently skipped them
            // would renumber the world for the reader.
            <option key={i} value={String(i)}>
              {`Section ${i}${s === null ? ' — empty' : ''}`}
            </option>
          ))}
        </Select>
      </Field>

      {/* THE SENTENCE THE WALKTHROUGH ASKED FOR, in the terms of the two
          bindings it is about: what this section uses today, said once, at the
          top, so eight minutes cannot be spent editing a scene the section does
          not use. Both refs are read from the SECTION, not from either panel's
          selection — those are different questions and reading the wrong one is
          the defect this states away. */}
      <div style={{ fontSize: T.tXs, color: T.textBase, lineHeight: 1.45 }}>
        {section === null ? (
          <>This section is empty — nothing is bound to it.</>
        ) : (
          <>
            scene <code style={{ color: T.textHi }}>{section.sceneRef ?? 'act default'}</code>
            {' · '}
            raster <code style={{ color: T.textHi }}>{section.rasterRef ?? 'hand-authored'}</code>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: T.s2, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{
          fontSize: T.t2xs, fontFamily: T.fontMono,
          color: chip.tone === 'ok' ? T.success : chip.tone === 'warn' ? T.warning : T.textFaint,
        }}>{chip.label}</span>
        {/* THE SET, NOT A SENTENCE ABOUT THE SET. Which sections can carry a
            raster band is a property of the LEVEL DATA and is re-derived on
            every load; printing it here means an author can see the answer
            change when aeon changes the level, instead of reading a number
            somebody wrote down. */}
        {act.rasterWiring.descriptor.parsed && (
          <span style={{ fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono }}>
            {`act: ${wired.length === 0 ? 'none wired' : `wired ${wired.join(',')}`}`}
            {` · own preset ${eligible.length === 0 ? 'none' : eligible.join(',')}`}
          </span>
        )}
      </div>

      {advisory !== null && (
        <Hint tone={state === 'unknown' ? undefined : 'warning'} style={{ marginBottom: 0 }}>
          {advisory}
        </Hint>
      )}
    </div>
  );
}
