// THE REGIONS PANEL — editor spec §3.4's list, bindings rows, badges and status
// line. NO PAINTING: the marquee, carve, add/move/resize and the map overlay are
// step 8, and nothing here draws on the canvas.
//
// ═══ IT RENDERS WHAT `providers/regions-aeon.ts` DERIVED, AND DECIDES NOTHING ═
//
// Every sentence on screen — every badge, every status row, every background
// label — is produced by a pure function with a node test behind it. This file
// is arrangement only. That split is what makes the CDP harness's job "did the
// app put the derived string on screen" rather than "is the string right", which
// are two questions the node suite cannot answer at the same time (it cannot see
// React at all).
//
// ═══ THE THREE STATES OF `ActRegionsState` ARE THREE SCREENS ═══════════════
//
// `none` / `open` / `refused` are distinguishable HERE, not only in the model.
// A `regions.json` Aurora refused is not an act without regions: the save
// neither overwrites nor removes it, so a panel saying "no regions yet" over a
// file on disk would invite the author to build a second one and then wonder why
// nothing saved. The refused screen names the file and what the codec said.

import React from 'react';
import { Panel, CollapsibleSection, SectionBody, Select, NumberField } from '../ui';
import { Field, Hint, Card, Row, NOTE, WARN } from '../effects/column-layout';
import { T } from '../ui/theme';
import AeonPropertiesPanel from '../AeonPropertiesPanel';
import { useProjectStore, getCurrentAct, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { sceneRefOptions, unassignableSceneRef } from '../../providers/effects-aeon';
import type { AnyCommand } from '../../../core/editing/commands';
import type { RegionRect } from '../../../core/formats/regions/document';
import {
  regionBindingCommand,
  regionBindingRows,
  regionsPanelState,
  setRegionBinding,
  type RegionBindingKey,
  type RegionBindingRow,
  type RegionListRow,
  type RegionStatusRow,
  type RegionsPanelState,
} from '../../providers/regions-aeon';
import { cloneRegionsDocument } from '../../../core/formats/regions/act-regions';
import { planActMigration } from '../../providers/regions-migrate';
import { BG_ACT_SENTINEL } from '../../../core/formats/regions/validate';

/**
 * The list body's scroller.
 *
 * `variant="list"` is a promise with two halves (ui/CollapsibleSection): the
 * section takes a share of what the content sections leave, AND SCROLLS INSIDE
 * IT. The section supplies the share; this supplies the scroller. Declaring the
 * variant without it leaves `overflow: visible` content sized by the DATA inside
 * a box sized by the COLUMN — which draws straight over the Bindings and Status
 * sections beneath, the 954px overhang panel-scrollers.test.ts was written for.
 *
 * `minHeight: 0` and no number: the ceiling arrives from the column, which is
 * what lets a short list stay short and a long one shrink.
 */
const LIST_BODY: React.CSSProperties = { overflowY: 'auto', minHeight: 0 };

/**
 * Run a command, or do nothing when the provider decided there was none.
 *
 * The null guard is the same one `EffectsScenePanel.run` carries and for the
 * same reason: a `<select>` fires onChange for the option already selected, and
 * without this every such event would push an undo entry that visibly does
 * nothing.
 */
function run(command: AnyCommand | null): void {
  if (!command) return;
  const level = getActiveLevel(useProjectStore.getState());
  if (!level) return;
  executeCommand(command, level);
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * One region row.
 *
 * TWO LINES, and the second one is the 2026-09-16 background ruling's: the
 * background this region resolves to is named IN WORDS on every row, in every
 * act, including today's all-shared launch state where every row says the same
 * thing. Never conditional on there being a second background, never signalled
 * by absence — the ruling's own reasons 1 and 4.
 */
function RegionRow({ row, selected, onSelect }: {
  row: RegionListRow; selected: boolean; onSelect: () => void;
}) {
  return (
    <Card selected={selected} onClick={onSelect} domId={`region-row-${row.id}`}
          title={`${row.id}: ${row.rect.w} by ${row.rect.h} at ${row.rect.x}, ${row.rect.y}`}>
      <div data-region-row={row.id} style={{ paddingBottom: T.s2 }}>
        <div style={{ display: 'flex', gap: T.s2, alignItems: 'baseline' }}>
          <span style={{ fontWeight: T.wSemibold }}>{row.label}</span>
          <span style={{ ...NOTE, marginBottom: 0 }}>{row.id}</span>
          <span style={{ ...NOTE, marginBottom: 0, marginLeft: 'auto' }}>
            {row.rect.w}x{row.rect.h}
          </span>
        </div>
        {/* THE RULING'S LINE. `data-region-bg` is what an instrument addresses;
            the text is `regionBgLabel`'s, never composed here. */}
        <div data-region-bg={row.id}
             style={{ ...(row.bg.missing ? WARN : NOTE), marginBottom: 0 }}>
          bg {row.bg.text}
        </div>
        {row.overlaps.length > 0 && (
          // §3.4's "hidden" is impossible under the Q1 ruling (regions are
          // disjoint, so nothing can be covered). THIS is the hazard the ruling
          // created in its place: two regions holding one pixel, where the
          // engine's answer depends on its own scan order.
          <div data-region-overlap={row.id} style={{ ...WARN, marginBottom: 0 }}>
            overlaps {row.overlaps.join(', ')}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * The fixed bottom row, labelled "act" — §3.4's word, and the one part of that
 * sentence the landed contract still has a referent for.
 *
 * NOT SELECTABLE and not editable: there is no `defaults` object in
 * `regions.json` to edit. What it shows is what a region's NULL inherits from,
 * which lives on the act (`Act.sceneRef`), on nothing at all (raster), and on
 * the act's own background.
 */
function ActRow({ state }: { state: Extract<RegionsPanelState, { kind: 'open' }> }) {
  const { actRow, defaults } = state;
  return (
    <Card title="The act's own values. A region binding left null inherits these.">
      <div data-region-row="act" style={{ paddingBottom: T.s2 }}>
        <div style={{ display: 'flex', gap: T.s2, alignItems: 'baseline' }}>
          <span style={{ fontWeight: T.wSemibold }}>act</span>
          <span style={{ ...NOTE, marginBottom: 0 }}>{actRow.actId}</span>
        </div>
        <div data-region-bg="act" style={{ ...NOTE, marginBottom: 0 }}>bg {actRow.bg.text}</div>
        <div style={{ ...NOTE, marginBottom: 0 }}>
          scene {defaults.sceneRef ?? 'default'} · raster none · no act preset
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The four bindings rows
// ---------------------------------------------------------------------------

/** The options one binding's picker offers. Built per key — see each branch. */
function BindingControl({ state, regionId, row }: {
  state: Extract<RegionsPanelState, { kind: 'open' }>;
  regionId: string;
  row: RegionBindingRow;
}) {
  const doc = state.doc;
  const onChange = (v: string) =>
    run(regionBindingCommand(doc, regionId, row.key, v === '' ? null : v));

  if (row.key === 'preset') {
    // ⚠ THE VOCABULARY IS AEON'S, AND IT CAN BE UNREADABLE. `presetRecords:
    // null` means Aurora could not read `<zone>_effects.emp`, which is NOT an
    // empty vocabulary. Offering an empty list would silently let the author
    // clear a binding aeon declares; the control is disabled and says why.
    if (state.presetRecords === null) {
      return (
        <Select value={row.value ?? ''} onChange={onChange} disabled
                title="The effects library could not be read, so Aurora does not know which
 EffectsPreset records exist."
                style={{ flex: 1, minWidth: 0 }}>
          <option value={row.value ?? ''}>{row.value ?? '(none)'}</option>
        </Select>
      );
    }
    // A value the library does not declare stays in the list as its own option:
    // a plain `<select>` with an unknown value shows the FIRST option, which
    // would be a quiet lie about what the build will use (the same reason
    // `unassignableSceneRef` exists next door).
    const names = state.presetRecords.includes(row.value ?? '')
      ? state.presetRecords
      : [...(row.value === null ? [] : [row.value]), ...state.presetRecords];
    return (
      <Select value={row.value ?? ''} onChange={onChange} style={{ flex: 1, minWidth: 0 }}
              title="Which EffectsPreset record in the game's effects library this region binds
 (regions rule 3). Required: there is no act-level preset to inherit.">
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
    );
  }

  if (row.key === 'scene') {
    // THE EFFECTS PANEL'S OWN PICKER, re-targeted from a section to a region
    // (§3.4). `''` is its inherit option and `sceneRefOptions` labels it
    // "Act default", which is the vocabulary this app already uses.
    return (
      <Select value={row.value ?? ''} onChange={onChange} style={{ flex: 1, minWidth: 0 }}
              title="Which effects scene this region uses (sceneRef). Act default means the
 act's own scene.">
        {sceneRefOptions(useProjectStore.getState().project?.effectsScenes
          ?? { scenes: [], unreadable: [], notices: [], loadedPaths: [] })
          .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    );
  }

  if (row.key === 'raster') {
    const ids = useProjectStore.getState().project?.effectsPresets.presets.map((p) => p.id) ?? [];
    const all = row.value !== null && !ids.includes(row.value) ? [row.value, ...ids] : ids;
    return (
      <Select value={row.value ?? ''} onChange={onChange} style={{ flex: 1, minWidth: 0 }}
              title="Which raster preset DOCUMENT this region binds (rasterRef). Act default
 means none.">
        <option value="">Act default</option>
        {all.map((id) => <option key={id} value={id}>{id}</option>)}
      </Select>
    );
  }

  // ═══ `bg layout` IS ENGINE-GATED UNTIL PART 2 (§2.3 rule 6, step 11) ═══
  //
  // The generator REFUSES any value other than `@act` or null while the engine
  // has no consumer, so a picker offering the BG library here would author a
  // value the build rejects. It is DISABLED WITH THE REASON ON IT rather than
  // hidden: a control that is absent reads as "not built", which is the exact
  // register the background ruling's reason 1 forbids.
  return (
    <Select value={row.value ?? ''} onChange={onChange} disabled style={{ flex: 1, minWidth: 0 }}
            title="Engine-gated until part 2 lands: the generator refuses any bg.layoutRef
 other than @act or null, so this picker stays locked (editor spec step 11).">
      <option value="">Act default</option>
      <option value={BG_ACT_SENTINEL}>{BG_ACT_SENTINEL}</option>
      {row.value !== null && row.value !== BG_ACT_SENTINEL
        && <option value={row.value}>{row.value}</option>}
    </Select>
  );
}

/**
 * One binding row: its control, its badge, and — when the value is explicit and
 * the binding is nullable — its "revert to inherited" control.
 *
 * §3.4: "Editing an inherited row makes it explicit … and a 'revert to
 * inherited' control appears on the row, so a detachment is never invisible."
 * The control appears on EVERY explicit nullable row, not only on ones detached
 * in this session: a document loaded from disk arrives explicit and its author
 * needs the same way back.
 */
function BindingRow({ state, regionId, row }: {
  state: Extract<RegionsPanelState, { kind: 'open' }>;
  regionId: string;
  row: RegionBindingRow;
}) {
  const warning = row.key === 'scene' && row.value !== null
    ? unassignableSceneRef(
      useProjectStore.getState().project?.effectsScenes
        ?? { scenes: [], unreadable: [], notices: [], loadedPaths: [] },
      row.value)
    : null;
  return (
    <div data-binding-row={row.key}>
      <Field label={row.label}>
        <BindingControl state={state} regionId={regionId} row={row} />
      </Field>
      <Row>
        {/* THE BADGE. §7 row 6's gate reads this node's text, and the text is
            `regionBindingRows`', never composed here. */}
        <span data-binding-badge={row.key} style={{ ...NOTE, marginBottom: 0 }}>{row.badge}</span>
        {row.canRevert && (
          <button type="button" data-binding-revert={row.key}
                  onClick={() => run(regionBindingCommand(state.doc, regionId, row.key, null))}
                  style={{ marginLeft: T.s2, font: 'inherit' }}>
            revert to inherited
          </button>
        )}
      </Row>
      {warning && <Hint under tone="warning">{warning}</Hint>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The selected region
// ---------------------------------------------------------------------------

/**
 * The rect, as four numbers.
 *
 * ⚠ THIS IS THE ONLY EDITING GESTURE IN STEP 6, and it is numeric on purpose:
 * §7 row 6 says "no painting yet: regions are created from the migration or by
 * typing rect numbers". The marquee, move, resize and carve are step 8.
 *
 * ONE COMMAND PER COMMITTED FIELD, on §3.3's "one command per gesture": typing
 * `2048` is one edit, not four.
 */
function RectFields({ state, regionId, rect }: {
  state: Extract<RegionsPanelState, { kind: 'open' }>;
  regionId: string; rect: RegionRect;
}) {
  const set = (key: keyof RegionRect, value: number) => {
    if (rect[key] === value) return;
    const next = cloneRegionsDocument(state.doc);
    const region = next.regions.find((r) => r.id === regionId);
    if (!region) return;
    region.rect = { ...region.rect, [key]: value };
    run({
      type: 'set-regions',
      description: `Set ${regionId} rect ${key}`,
      sectionIndex: -1,
      oldDocument: cloneRegionsDocument(state.doc),
      newDocument: next,
    });
  };
  return (
    <Field label="rect">
      <div data-region-rect={regionId} style={{ display: 'flex', gap: T.s2, flexWrap: 'wrap' }}>
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} style={{ ...NOTE, marginBottom: 0, display: 'flex', gap: 2 }}>
            {k}
            <NumberField value={rect[k]} onChange={(v) => set(k, v)}
                         title={`${k}, in world pixels`} width={54} />
          </label>
        ))}
      </div>
    </Field>
  );
}

function SelectedRegion({ state }: { state: Extract<RegionsPanelState, { kind: 'open' }> }) {
  const region = state.selected;
  if (!region) {
    return (
      <Hint style={{ marginBottom: 0 }}>
        No region selected. Pick one from the list above to see its bindings.
      </Hint>
    );
  }
  const rows = regionBindingRows(region, state.defaults);
  return (
    <div data-region-detail={region.id}>
      <Row><span style={{ fontWeight: T.wSemibold }}>{region.name ?? region.id}</span></Row>
      <RectFields state={state} regionId={region.id} rect={region.rect} />
      {rows.map((r) => (
        <BindingRow key={r.key} state={state} regionId={region.id} row={r} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Migration from sections (editor spec §4)
// ---------------------------------------------------------------------------

/**
 * The one door to `migrate-sections` in the UI, shown on the screen the
 * migration is FOR: an act with no regions document.
 *
 * ⚠ IT PLANS ON CLICK AND SHOWS WHAT THE PLAN SAID, both halves. A migration
 * that refused silently would leave an author clicking a button that does
 * nothing — and the refusals are the interesting output far more often than the
 * success is, because every one of them names a thing about the act that has to
 * change first (a descriptor Aurora could not read, a section with no preset, a
 * descriptor row whose edges did not resolve).
 *
 * The NOTES are shown on success for the same reason: `bgLayoutRef` and
 * `paletteRef` are read and DROPPED, and an author who bound a background to a
 * section deserves to be told that binding did not survive rather than to
 * discover it the next time they open the act.
 */
function MigrateSections(): React.ReactElement {
  const act = useProjectStore((s) => getCurrentAct(s));
  const zoneId = useProjectStore((s) => s.currentZoneId);
  const [refusals, setRefusals] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [done, setDone] = React.useState<number | null>(null);
  if (!act || !zoneId) return <></>;
  const onClick = () => {
    const offer = planActMigration(act, zoneId, act.rasterWiring);
    setRefusals(offer.plan.refusals);
    setNotes(offer.plan.notes);
    setDone(offer.command === null ? null : offer.plan.document!.regions.length);
    run(offer.command);
  };
  return (
    <div data-regions-migrate>
      <button type="button" data-migrate-sections onClick={onClick} style={{ font: 'inherit' }}>
        Migrate sections
      </button>
      <Hint under style={{ marginBottom: 0 }}>
        One undo step: builds a region per run of sections sharing a preset,
        scene and raster, plus one per off-grid descriptor row, and clears all
        four refs on every section sidecar. bgLayoutRef and paletteRef are
        DROPPED: the regions file has no field for them.
      </Hint>
      {done !== null && (
        <Hint under data-migrate-done style={{ marginBottom: 0 }}>
          Migrated: {done} {done === 1 ? 'region' : 'regions'}.
        </Hint>
      )}
      {refusals.map((r, i) => (
        <Hint under tone="warning" key={i} data-migrate-refusal>{r}</Hint>
      ))}
      {notes.map((n, i) => (
        <Hint under key={i} data-migrate-note>{n}</Hint>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The status line
// ---------------------------------------------------------------------------

/**
 * §2.5 live.
 *
 * ⚠ `unmeasurable` IS ITS OWN REGISTER and is never drawn as a pass. It means a
 * rule did not run — rule 4 needs constants from aeon's act descriptor that
 * Aurora does not read — and a green tick there would be a claim nobody made.
 */
function StatusRows({ rows }: { rows: RegionStatusRow[] }) {
  return (
    <div data-region-status>
      {rows.map((r) => (
        <div key={r.id} data-status-row={r.id}
             style={{
               ...(r.tone === 'warning' ? WARN : NOTE),
               marginBottom: T.s2,
               ...(r.tone === 'unmeasurable' ? { fontStyle: 'italic' } : {}),
             }}>
          {r.tone === 'unmeasurable' ? 'NOT CHECKED: ' : ''}{r.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The column
// ---------------------------------------------------------------------------

export default function RegionsPanel(): React.ReactElement {
  // The history clock: an undo restores a document this panel is rendering, and
  // nothing else in the subscription list would notice.
  useHistoryVersion();
  const act = useProjectStore((s) => getCurrentAct(s));
  const project = useProjectStore((s) => s.project);
  const selectedRegionId = useEditorStore((s) => s.selectedRegionId);
  const setSelectedRegionId = useEditorStore((s) => s.setSelectedRegionId);
  const state = regionsPanelState(act, project, selectedRegionId);

  return (
    <Panel width={280} scroll column="aeon-regions">
      <CollapsibleSection id="aeon.regions.list" title="Regions" variant="list">
        <SectionBody style={LIST_BODY}>
          {state.kind === 'no-project' && (
            <Hint style={{ marginBottom: 0 }}>No act is open.</Hint>
          )}
          {state.kind === 'none' && (
            // "NO FILE" AND "A FILE AURORA REFUSED" ARE DIFFERENT SCREENS. This
            // is the first: nothing on disk, and a save creates nothing.
            <>
              <Hint style={{ marginBottom: T.s2 }}>
                {state.actId} has no regions.json. Regions arrive from
                &quot;Migrate sections&quot; below, or from painting (step 8,
                not built yet).
              </Hint>
              <MigrateSections />
            </>
          )}
          {state.kind === 'refused' && (
            <Hint tone="warning" style={{ marginBottom: 0 }}>
              {state.actId} HAS a regions document and Aurora refused it:{' '}
              {state.path} ({state.reason}). Nothing here is editable and the
              save will neither overwrite nor remove that file. Fix the file.
            </Hint>
          )}
          {state.kind === 'open' && (
            <>
              {state.rows.map((row) => (
                <RegionRow key={row.id} row={row}
                           selected={row.id === selectedRegionId}
                           onSelect={() => setSelectedRegionId(row.id)} />
              ))}
              <ActRow state={state} />
            </>
          )}
        </SectionBody>
      </CollapsibleSection>

      {state.kind === 'open' && (
        <CollapsibleSection id="aeon.regions.bindings" title="Bindings">
          <SectionBody><SelectedRegion state={state} /></SectionBody>
        </CollapsibleSection>
      )}

      {state.kind === 'open' && (
        <CollapsibleSection id="aeon.regions.status" title="Status">
          <SectionBody><StatusRows rows={state.status} /></SectionBody>
        </CollapsibleSection>
      )}

      {/* Properties is the facet's generic aeon readout, outside the job, on
          exactly the terms the Effects column states. */}
      <CollapsibleSection id="aeon.props" title="Properties" defaultCollapsed>
        <AeonPropertiesPanel />
      </CollapsibleSection>
    </Panel>
  );
}

// Re-exported so the facet module does not have to reach through the default.
export { regionsPanelState, setRegionBinding };
export type { RegionBindingKey };
