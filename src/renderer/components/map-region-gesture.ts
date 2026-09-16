// THE REGION DRAG, AS A MACHINE THE NODE SUITE CAN DRIVE — editor spec §3.2
// (the world-space marquee) and §3.3 (one command per gesture, ordinary undo),
// build-plan row 8, second half.
//
// PURE: plain data in, plain data out. No React, no store, no canvas, no I/O.
// `MapViewport.tsx` owns the pointer events, the zoom and the toast; everything
// it would otherwise have decided INLINE lives here, which is the same split
// `map-band-stamp.ts` and `map-flip.ts` already make in this directory and the
// reason either of them can be tested at all.
//
// ⚠ THE ARITHMETIC IS NOT HERE. Snapping, hit-testing and the carve are
// `src/core/editing/region-marquee.ts` (step 8A) and `region-geometry.ts` under
// it; this module holds a DRAG — the three facts a press fixes and the one fact
// a move updates — and turns a finished one into a command. Nothing below
// re-derives a rectangle the core already knows how to compute.
//
// ═══ THREE OUTCOMES, AND "NOTHING HAPPENED" IS NOT "I REFUSED" ═════════════
//
// `regionDragCommand` answers `command`, `none` or `refused`, never a nullable
// command. A press that did not move and a press the layer would not honour are
// different events to the author: one wants silence and the other wants a
// sentence. Collapsing them into `null` is how a refusal becomes invisible —
// the thing §3.2's `overId` field was already added to prevent one step down.
//
// ═══ A DRAW WITH NO SELECTION IS REACHABLE, AND IT IS REFUSED ══════════════
//
// §3.2's table says a plain drag with no selection makes "a new region with
// that rect". THE LANDED CONTRACT CANNOT EXPRESS ONE: `preset` is `required`
// per region and there is no act-level preset to inherit (§2.3), so a region
// Aurora minted by itself would need a preset Aurora invented. Copying a
// neighbour's would give the new region somebody else's identity silently,
// which is worse than refusing.
//
// So the draw is sent to `applyRegionGestureToDocument` with a minted id and NO
// template, the layer refuses it with its own reason, and this module hands
// that reason up unchanged plus the one sentence that says what to do instead.
// The refusal is the LAYER'S, not a second copy written here — 8A put it there
// and a duplicate would be the sentence that goes stale.

import {
  applyRegionGesture,
  applyRegionGestureToDocument,
  effectiveRegionSnap,
  moveRegionRect,
  regionPieces,
  regionPressAt,
  resizeRegionRect,
  snapRegionRect,
  type RegionEdge,
  type RegionGesture,
  type RegionPress,
} from '../../core/editing/region-marquee';
import type { Rect, RegionPiece } from '../../core/editing/region-geometry';
import type { Region, RegionsDocument } from '../../core/formats/regions/document';
import type { SetRegionsCommand } from '../../core/editing/commands';
import { cloneRegionsDocument } from '../../core/formats/regions/act-regions';

/** A world point, in the shape `MapViewport.screenToWorld` returns one. */
export interface WorldPoint { x: number; y: number }

/**
 * A region drag in flight.
 *
 * `rect` is the ONLY field a move updates; everything else is fixed at the
 * press. That is the preview-through-a-ref shape the guide drag and the screen
 * frame both use in `MapViewport`: a mousemove is not a React render, the
 * document is untouched until release, and the undo stack therefore gets ONE
 * entry for the gesture rather than one per pixel of travel.
 */
export interface RegionDrag {
  /** What the press asked for: draw, move or resize, and of which piece. */
  press: RegionPress;
  /** Where the press landed, in world px, UNSNAPPED (a move snaps its delta). */
  pressWorld: WorldPoint;
  /** The pressed piece's rectangle as it was at the press. Null for a draw. */
  startRect: Rect | null;
  /**
   * The id a DRAW writes into: the selected region, or a minted one.
   *
   * Minted rather than left null so the refusal above is the LAYER's refusal
   * about a real id, and not a special case this module invented to avoid
   * asking.
   */
  drawId: string;
  /** The rectangle the gesture describes RIGHT NOW. The preview draws this. */
  rect: Rect;
  /** True once the cursor has actually moved off the press point. */
  moved: boolean;
}

/**
 * The id a draw with no selection would create.
 *
 * `region_N` for the lowest N the document does not already use, which keeps it
 * inside the contract's `^[a-z][a-z0-9_]{0,31}$` for any N a person will reach.
 * It exists so the refusal names something; nothing ever writes it today.
 */
export function newRegionId(doc: RegionsDocument): string {
  const taken = new Set(doc.regions.map((r) => r.id));
  for (let n = 1; ; n += 1) {
    const id = `region_${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Begin a drag at a world point.
 *
 * ⚠ `zoom` IS CANVAS PX PER WORLD PX AND MUST BE THE VIEWPORT'S REAL ONE.
 * `regionPressAt` divides the SCREEN-pixel grab band by it (8A's docblock: a
 * fingertip is a property of the device, so in world px the same band is 24
 * screen px of dead zone at zoom 4 and 1.5 unhittable ones at zoom 0.25).
 * Passing 1 here would make every edge unhittable at any zoom but 1, silently.
 */
export function beginRegionDrag(
  doc: RegionsDocument, world: WorldPoint, selectedId: string | null, zoom: number,
): RegionDrag {
  const pieces = regionPieces(doc);
  const press = regionPressAt(pieces, world.x, world.y, selectedId, zoom);
  const startRect = press.pieceIndex >= 0 ? { ...pieces[press.pieceIndex].rect } : null;
  return {
    press,
    pressWorld: { ...world },
    startRect,
    drawId: selectedId ?? newRegionId(doc),
    // A press that never moves still describes SOMETHING: `snapRegionRect`
    // grows a collapsed drag to one snap cell (8A: nothing here ever produces
    // an empty rectangle), and a move or resize starts at the rect it grabbed.
    rect: startRect ?? snapRegionRect(world, world, effectiveRegionSnap(false)),
    moved: false,
  };
}

/**
 * The drag's rectangle after the cursor reaches `world`, with `invert` (Ctrl)
 * choosing the snap. Returns a NEW drag; the caller assigns it back to its ref.
 *
 * The three arms are 8A's three functions and the choice between them was made
 * at the press. A resize with no edge cannot happen (`regionPressAt` only
 * answers `resize` with one) and is treated as a move rather than crashing,
 * because a viewport is not the place to discover an impossible state.
 */
export function updateRegionDrag(
  drag: RegionDrag, world: WorldPoint, invert: boolean,
): RegionDrag {
  const snap = effectiveRegionSnap(invert);
  const moved = drag.moved || world.x !== drag.pressWorld.x || world.y !== drag.pressWorld.y;
  if (drag.press.kind === 'draw' || drag.startRect === null) {
    return { ...drag, moved, rect: snapRegionRect(drag.pressWorld, world, snap) };
  }
  if (drag.press.kind === 'resize' && drag.press.edge !== null) {
    return {
      ...drag,
      moved,
      rect: resizeRegionRect(drag.startRect, drag.press.edge as RegionEdge, world, snap),
    };
  }
  return { ...drag, moved, rect: moveRegionRect(drag.startRect, drag.pressWorld, world, snap) };
}

/**
 * The pieces as this gesture WOULD leave them: the live preview's subject.
 *
 * ⚠ THE PREVIEW IS THE REAL TRANSFORM, not a sketch of it. A drag that is about
 * to trim three regions has to SHOW the trim before the button comes up: the Q1
 * ruling made carve what every draw does, and a gesture whose destructive half
 * only appears after the undo entry is written is the hazard `RegionPress.overId`
 * was added to prevent one layer down. Running the same `applyRegionGesture` the
 * commit will run is what makes the picture and the outcome the same answer.
 *
 * PIECE-LEVEL, so it works even for the draw the DOCUMENT level refuses: a draw
 * with no selection has no preset and cannot become a document, but the author
 * still has to see the rectangle they are dragging.
 */
export function regionDragPreview(doc: RegionsDocument, drag: RegionDrag): RegionPiece[] {
  return applyRegionGesture(regionPieces(doc), regionGestureOf(drag)).pieces;
}

/** The finished gesture this drag is, in the layer's own vocabulary. */
export function regionGestureOf(drag: RegionDrag): RegionGesture {
  if (drag.press.kind === 'draw') return { kind: 'draw', id: drag.drawId, rect: drag.rect };
  return { kind: drag.press.kind, pieceIndex: drag.press.pieceIndex, rect: drag.rect };
}

/** What a finished drag does to the document: one command, nothing, or a refusal. */
export type RegionDragOutcome =
  | {
    kind: 'command';
    /** ONE `SetRegionsCommand` for the WHOLE gesture (spec §3.3). */
    command: SetRegionsCommand;
    /** Ids that lost area. The caller says so; this module does not decide how. */
    trimmedIds: string[];
    /** Ids whose last rectangle went, and which the document no longer holds. */
    removedIds: string[];
  }
  /** The gesture left the document exactly as it was. No command, no complaint. */
  | { kind: 'none' }
  /** The layer would not honour it. No command, and a sentence that must be shown. */
  | { kind: 'refused'; reason: string };

/**
 * The sentence appended to the layer's refusal when a draw had no selection.
 *
 * A CONSTANT so the node row and any harness take the words FROM HERE rather
 * than retyping them; a retyped expectation goes green against a toast that
 * says something else. It does NOT name a control: there is no "new region"
 * button in the panel yet (RegionsPanel.tsx builds none), and promising one
 * would be worse than saying nothing.
 */
/**
 * What the map says when the region tool is armed over an act that has no
 * regions document at all.
 *
 * A CONSTANT beside the other one, for the same reason: the node row and any
 * harness take the words from here. It names the door (`Migrate sections` is
 * the button RegionsPanel actually builds) rather than leaving the author to
 * find out that the only way to get a first region is the migration.
 */
export const NO_REGIONS_HERE = 'This act has no regions document, so there is nothing to give '
  + 'a rectangle to. Use Migrate sections in the Regions panel first.';

export const NO_SELECTION_ADVICE = 'Select a region in the list first, and the drag gives it '
  + 'this rectangle.';

/**
 * ONE FINISHED DRAG, ONE `SetRegionsCommand` (spec §3.3), so a drag that splits
 * three rectangles is ONE undo step.
 *
 * ⚠ THE COMMAND IS BUILT ONCE, HERE, FROM THE ONE DOCUMENT THE LAYER RETURNED.
 * `applyRegionGestureToDocument` does the whole carve in a single transform —
 * that is what 8A's "one body for draw, move and resize" buys — so there is
 * never a second write to fold in and never a batch to reorder.
 *
 * `oldDocument` is CLONED rather than aliased: `SetRegionsCommand` records whole
 * old/new halves and a shared nested object between them is step 5's M1 defect.
 * The new half comes out of the layer already built from fresh objects.
 */
export function regionDragCommand(
  doc: RegionsDocument, drag: RegionDrag, newRegion?: Region,
): RegionDragOutcome {
  const gesture = regionGestureOf(drag);
  const out = applyRegionGestureToDocument(doc, gesture, newRegion);
  if (!out.ok) {
    // THE LAYER'S OWN WORDS, plus the actionable half only where it applies.
    // A draw into a region the author DID select cannot hit this arm, so the
    // advice would be wrong there.
    const advice = gesture.kind === 'draw' && drag.press.id === null
      ? ` ${NO_SELECTION_ADVICE}`
      : '';
    return { kind: 'refused', reason: `${out.reason}${advice}` };
  }
  // A GESTURE THAT CHANGED NOTHING PUSHES NOTHING. A press that did not move,
  // or a move whose snapped delta was zero, comes back through the layer with
  // the same rectangles; an undo entry for it is a step the author has to press
  // Ctrl+Z through twice to get anywhere.
  if (sameRegions(doc, out.document)) return { kind: 'none' };
  return {
    kind: 'command',
    command: {
      type: 'set-regions',
      description: describeRegionGesture(gesture, drag),
      // Act-ambient, like every other whole-document regions command.
      sectionIndex: -1,
      oldDocument: cloneRegionsDocument(doc),
      newDocument: out.document,
    },
    trimmedIds: out.trimmedIds,
    removedIds: out.removedIds,
  };
}

/**
 * Do two documents hold the same regions with the same rectangles, IGNORING
 * THEIR ORDER?
 *
 * ⚠ ORDER-INSENSITIVE ON PURPOSE, AND MEASURED RATHER THAN GUESSED. A move
 * whose snapped delta is zero — which is what a plain CLICK inside the selected
 * region is — goes through the layer's one transform anyway: the pressed piece
 * leaves the set so it cannot carve itself, and `applyDraw` puts it back at the
 * END. So a click comes back holding exactly the same rectangles in a DIFFERENT
 * ORDER, and an order-sensitive comparison here reports it as a change: an undo
 * entry, and a rewritten file on the next save, for a gesture that did nothing.
 *
 * Reading that as "no change" is not a convenience, it is what the ruled model
 * says: `region-geometry.ts`'s header states that there is no painter's order,
 * no layering and no z-index, and that "list order carries no meaning". A
 * permutation of the entries is the same document to the engine, to the
 * generator and to this panel, so it is the same document here.
 */
function sameRegions(a: RegionsDocument, b: RegionsDocument): boolean {
  if (a.regions.length !== b.regions.length) return false;
  const key = (d: RegionsDocument) => d.regions
    .map((r) => `${r.id}|${r.rect.x}|${r.rect.y}|${r.rect.w}|${r.rect.h}`)
    .sort()
    .join('\n');
  return key(a) === key(b);
}

/** The undo entry's words: what the author did, to which region. */
export function describeRegionGesture(gesture: RegionGesture, drag: RegionDrag): string {
  const id = gesture.kind === 'draw' ? gesture.id : (drag.press.id ?? drag.drawId);
  if (gesture.kind === 'move') return `Move ${id} rect`;
  if (gesture.kind === 'resize') return `Resize ${id} rect`;
  if (gesture.kind === 'delete') return `Delete ${id} rect`;
  return `Draw ${id} rect`;
}
