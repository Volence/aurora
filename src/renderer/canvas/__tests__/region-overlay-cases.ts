// THE REGIONS OVERLAY'S SCENARIOS, shared by the golden's one-off generator and
// the rows that read the golden (`region-overlay-middrag.test.ts`, ROADMAP §5.1
// row 208).
//
// NOT A TEST FILE: no `.test.` in the name, so vitest does not collect it. It
// builds its drags through `beginRegionDrag` / `updateRegionDrag` and its drag
// pieces through `regionDragPreview`, all three of which exist on the master the
// golden was recorded from (6072f9df), so the SAME scenario runs on both trees.
//
// THE DOCUMENT: three regions tiling a 640x448 act.
//
//     west  (0,0)-(320,448)      east  (320,0)-(640,224)
//                                south (320,224)-(640,448)
//
// THE DRAG: `west` selected, a press at (400,96) inside EAST, which is not the
// selected region's rectangle, so §3.2 makes it a DRAW of `west`, dragged to
// (496,192). Both ends are on the 16 px snap grid, so the rectangle is
// (400,96)-(496,192) whether the snap rounds or floors. It lies wholly inside
// east and touches south nowhere: east is TRIMMED (a hole punched in it), south
// is not, west gains a second, disjoint rectangle.

import type { RegionsDocument } from '../../../core/formats/regions/document';
import type { Rect, RegionPiece } from '../../../core/editing/region-geometry';
import {
  beginRegionDrag, regionDragPreview, updateRegionDrag, type RegionDrag,
} from '../../components/map-region-gesture';
import type { RegionOverlayInput, RegionOverlayRegion, RegionViewport } from '../region-overlay';

export const CASE_ACT: Rect = { x: 0, y: 0, w: 640, h: 448 };

export const CASE_VP: RegionViewport = { x: 0, y: 0, width: 640, height: 448, zoom: 1 };

export const CASE_DOC: RegionsDocument = {
  schema: 1,
  act: 'case_act1',
  regions: [
    { id: 'west', name: 'Forest', preset: 'P_WEST', rect: { x: 0, y: 0, w: 320, h: 448 } },
    { id: 'east', name: 'Night', preset: 'P_EAST', rect: { x: 320, y: 0, w: 320, h: 224 } },
    { id: 'south', name: 'Cave', preset: 'P_SOUTH', rect: { x: 320, y: 224, w: 320, h: 224 } },
  ],
} as RegionsDocument;

/** The hole the drag punches in east, stated by hand from the header, NOT read
 *  back from the code under test. */
export const CASE_DRAG_RECT: Rect = { x: 400, y: 96, w: 96, h: 96 };

export const CASE_REGIONS: RegionOverlayRegion[] = [
  { id: 'west', label: 'Forest', bgText: 'act', bgMissing: false },
  { id: 'east', label: 'Night', bgText: 'MISSING deep_forest', bgMissing: true },
  { id: 'south', label: 'Cave', bgText: 'act', bgMissing: false },
];

/** The live drag of the header, built through the viewport's own machine at zoom 1. */
export function caseDrag(): RegionDrag {
  const d0 = beginRegionDrag(CASE_DOC, { x: 400, y: 96 }, 'west', 1);
  return updateRegionDrag(d0, { x: 496, y: 192 }, false);
}

const docPieces = (): RegionPiece[] =>
  CASE_DOC.regions.map((r) => ({ id: r.id, rect: { ...r.rect } }));

export interface FullCase { name: string; dpr: number; input: RegionOverlayInput }

/**
 * Every FULL overlay the map draws with the regions tint ON, before and during
 * a drag. Row 208's promise is that none of these change by a single call.
 */
export function fullCases(): FullCase[] {
  const base = (over: Partial<RegionOverlayInput>): RegionOverlayInput => ({
    act: CASE_ACT, pieces: docPieces(), regions: CASE_REGIONS, selectedId: null, ...over,
  });
  const dragPieces = regionDragPreview(CASE_DOC, caseDrag());
  return [
    { name: 'at rest, nothing selected', dpr: 1, input: base({}) },
    { name: 'at rest, west selected', dpr: 1, input: base({ selectedId: 'west' }) },
    {
      name: 'at rest, a hole where south was',
      dpr: 1,
      input: base({ pieces: docPieces().filter((p) => p.id !== 'south') }),
    },
    {
      name: 'mid-drag with the tint ON: the preview pieces, west selected',
      dpr: 1,
      input: base({ pieces: dragPieces, selectedId: 'west' }),
    },
    {
      name: 'mid-drag with the tint ON, at dpr 1.35',
      dpr: 1.35,
      input: base({ pieces: dragPieces, selectedId: 'west' }),
    },
  ];
}
