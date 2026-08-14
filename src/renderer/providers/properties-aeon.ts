// Aeon port for the neutral shared/PropertiesPanel.
//
// This is where every aeon-shaped read the old panel made now lives: sections,
// the BG library, the zone tileset, the object/ring placement arrays. The rows
// come out already formatted, because a row of strings is the largest thing the
// two engines can agree on (see shared/properties-model.ts).
//
// It is also where the panel's one write lives. `executeCommand` throws for a
// non-aeon focused document, which is precisely why it may not be reached from
// the neutral side.

import React from 'react';
import type { PropertiesPort, PropertySection, PropertyRow } from '../components/shared/properties-model';
import type { Act, BgLibraryEntry, Section, Zone } from '../../core/model/s4-types';
import type { SetSectionBgCommand } from '../../core/editing/commands';
import type { ToolId } from '../../core/project/adapter';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useEditorStore, executeCommand, type Selection } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';

/**
 * Exactly what the rows read, and no more.
 *
 * Narrowed with `Pick` rather than taken whole (the house pattern from
 * map-status-classic's ScopeDoc): it states the dependency precisely, it lets
 * the test build honest fixtures without casting a dozen unrelated fields away,
 * and a rename of `bgLayoutRef` or `gridWidth` breaks the build here instead of
 * leaving a green test over a panel that shows nothing.
 */
export interface AeonPropertiesInput {
  readonly projectName: string;
  readonly bgLibrary: readonly Pick<BgLibraryEntry, 'id' | 'name'>[];
  readonly zone: Pick<Zone, 'name' | 'tileset'> | null;
  readonly act: Pick<Act, 'id' | 'gridWidth' | 'gridHeight'>;
  /** The slot at `activeSectionIndex`; null when that slot is empty. */
  readonly section: Pick<Section, 'objects' | 'rings' | 'bgLayoutRef'> | null;
  readonly activeSectionIndex: number;
  readonly selection: Selection | null;
  /**
   * Render the read-only "Selected Object" block when an object is selected.
   * Off by default, and asked for only by the LAYOUT facet.
   *
   * The block used to be unconditional; plan 3 deleted it because the Objects
   * facet gained a real editor (shared/ObjectInspector), which made a read-only
   * copy of the same four values beside an editable form exactly the dead
   * chrome panel design forbids. True there — but Layout offers the `select`
   * tool too, and there the deleted block was the ONLY thing that displayed
   * what you had picked. So it comes back where that gap is, and stays gone
   * where the editor already answers the question.
   *
   * An argument threaded from the mount site rather than a facetFor(activeId)
   * lookup: the mount site is where the decision is legible.
   */
  readonly showObjectSelection: boolean;
  readonly tool: ToolId;
  readonly selectedTileIndex: number;
  readonly selectedPaletteLine: number;
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
  /** Receives the raw <select> value; '' is the act default. */
  onBackgroundChange(value: string): void;
}

const row = (label: string, value: string): PropertyRow => ({ label, value });

/**
 * The panel's ONE write, as a value rather than an effect: what picking a
 * background off the drop-down means, separated from dispatching it.
 *
 * Two rules live here and nowhere else, which is why it is not inlined in the
 * hook. A `<select>`'s only way to say "no value" is the empty string, and the
 * model's is `null` — so '' maps back to the act default. And re-picking the
 * option already selected must issue NOTHING: onChange fires for it, and a
 * command either way would push an undo entry that visibly does nothing.
 *
 * Returns the command instead of running it so the decision is testable without
 * a focused aeon document — `executeCommand` throws without one.
 */
export function aeonBackgroundCommand(
  sectionIndex: number,
  currentRef: string | null,
  value: string,
): SetSectionBgCommand | null {
  const newRef = value === '' ? null : value;
  if (newRef === currentRef) return null;
  return {
    type: 'set-section-bg',
    description: `Section ${sectionIndex} background`,
    sectionIndex,
    oldRef: currentRef,
    newRef,
  };
}

/**
 * The whole panel, as sections. A transcription of what the pre-neutral
 * components/PropertiesPanel.tsx rendered — the section order, the row order and
 * the exact strings are all load-bearing, and providers/__tests__ pins them.
 */
export function aeonPropertySections(input: AeonPropertiesInput): PropertySection[] {
  const out: PropertySection[] = [];

  // Selection details first. Rings have no editor anywhere, so their readout is
  // unconditional; objects have one in the Objects facet, so theirs is gated on
  // the caller (see showObjectSelection above).
  const selected = input.section
    ? selectedPlacement(input.section, input.selection, input.showObjectSelection)
    : null;
  if (selected?.kind === 'object') {
    out.push({
      title: 'Selected Object',
      rows: [
        row('Section', String(input.activeSectionIndex)),
        row('Type', selected.placement.typeId),
        row('Subtype', String(selected.placement.subtype)),
        row('Position', `${selected.placement.x}, ${selected.placement.y}`),
      ],
    });
  } else if (selected?.kind === 'ring') {
    out.push({
      title: 'Selected Ring',
      rows: [
        row('Section', String(input.activeSectionIndex)),
        row('Position', `${selected.placement.x}, ${selected.placement.y}`),
      ],
    });
  }

  if (input.tool === 'paint-tile' || input.tool === 'paint-block') {
    out.push({
      title: 'Paint Tool',
      rows: [
        row('Tile Index', String(input.selectedTileIndex)),
        row('Palette', String(input.selectedPaletteLine)),
      ],
    });
  }

  const projectRows = [row('Name', input.projectName)];
  if (input.zone) projectRows.push(row('Zone', input.zone.name));
  projectRows.push(row('Act', input.act.id), row('Grid', `${input.act.gridWidth}x${input.act.gridHeight}`));
  out.push({ title: 'Project', rows: projectRows });

  const sectionRows = [row('Index', String(input.activeSectionIndex))];
  if (input.section) {
    sectionRows.push(
      row('Objects', String(input.section.objects.length)),
      row('Rings', String(input.section.rings.length)),
    );
  } else {
    sectionRows.push(row('Status', '(empty)'));
  }
  out.push({
    title: 'Active Section',
    rows: sectionRows,
    // The override belongs to a section that exists; an empty slot has nothing
    // to hang a background on.
    select: input.section
      ? {
        label: 'Background',
        value: input.section.bgLayoutRef ?? '',
        options: [
          { value: '', label: 'Act default' },
          ...input.bgLibrary.map((b) => ({ value: b.id, label: b.name })),
        ],
        onChange: input.onBackgroundChange,
      }
      : undefined,
  });

  if (input.zone) out.push({ title: 'Art', rows: [row('Tiles', String(input.zone.tileset.tiles.length))] });

  out.push({
    title: 'Viewport',
    rows: [
      row('Position', `${Math.round(input.viewport.x)}, ${Math.round(input.viewport.y)}`),
      row('Zoom', `${Math.round(input.viewport.zoom * 100)}%`),
    ],
  });

  return out;
}

type SelectedPlacement =
  | { kind: 'object'; placement: Section['objects'][number] }
  | { kind: 'ring'; placement: Section['rings'][number] };

/**
 * The selected placement, or null. Returns null for a STALE index too: deleting
 * the selected object without clearing the selection is reachable through
 * undo/redo, and a readout of `undefined, undefined` is worse than no readout.
 */
function selectedPlacement(
  section: Pick<Section, 'objects' | 'rings'>,
  selection: Selection | null,
  showObjectSelection: boolean,
): SelectedPlacement | null {
  if (!selection) return null;
  if (selection.type === 'ring') {
    const ring = section.rings[selection.index];
    return ring ? { kind: 'ring', placement: ring } : null;
  }
  if (!showObjectSelection) return null;
  const object = section.objects[selection.index];
  return object ? { kind: 'object', placement: object } : null;
}

export function useAeonPropertiesPort(
  { showObjectSelection = false }: { showObjectSelection?: boolean } = {},
): PropertiesPort {
  const project = useProjectStore((s) => s.project);
  // Subscribe to the ids, then look the zone/act up off getState() — the house
  // pattern (map-status-aeon, PaletteViewer, ArtBrowser). The old panel
  // subscribed to `project` only, so switching act could leave the Project
  // block naming the act you just left until something else re-rendered it.
  // Subscribed for the re-render alone, hence the unbound calls.
  useProjectStore((s) => s.currentZoneId);
  useProjectStore((s) => s.currentActId);
  const vpX = useViewStore((s) => s.vpX);
  const vpY = useViewStore((s) => s.vpY);
  const zoom = useViewStore((s) => s.zoom);
  const selection = useEditorStore((s) => s.selection);
  const tool = useEditorStore((s) => s.tool);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  // Subscriptions, where the old panel read these two off getState(): the armed
  // tile and palette line changed without re-rendering the panel, so the Paint
  // Tool block showed whatever was armed the last time something ELSE it
  // subscribed to moved. Same rows, now not stale.
  const selectedTileIndex = useEditorStore((s) => s.selectedTileIndex);
  const selectedPaletteLine = useEditorStore((s) => s.selectedPaletteLine);
  // Re-read the selected placement's live coordinates after a committed edit and
  // during an in-flight drag (which mutates the object without a command).
  useHistoryVersion();
  useEditorStore((s) => s.liveEditVersion);

  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);

  // Stable across renders: everything it needs is read off getState() at click
  // time, so it never closes over a section that has since been replaced.
  const onBackgroundChange = React.useCallback((value: string) => {
    const index = useEditorStore.getState().activeSectionIndex;
    const level = getActiveLevel(useProjectStore.getState());
    const section = level?.sections[index];
    if (!level || !section) return;
    const command = aeonBackgroundCommand(index, section.bgLayoutRef, value);
    if (command) executeCommand(command, level);
  }, []);

  // Not memoised, on purpose. Aeon mutates its project in place — a placement
  // drag changes `section.objects[n].x` with no new identity anywhere — so there
  // is no dependency list that would be honest here; the repaint clocks read
  // above are the signal, and this rebuild is a handful of strings.
  if (!project || !act) return { sections: [], emptyMessage: 'No act loaded.' };

  return {
    sections: aeonPropertySections({
      projectName: project.name,
      bgLibrary: project.bgLibrary,
      zone: zone ?? null,
      act,
      section: act.sections[activeSectionIndex] ?? null,
      activeSectionIndex,
      selection,
      showObjectSelection,
      tool,
      selectedTileIndex,
      selectedPaletteLine,
      viewport: { x: vpX, y: vpY, zoom },
      onBackgroundChange,
    }),
  };
}
