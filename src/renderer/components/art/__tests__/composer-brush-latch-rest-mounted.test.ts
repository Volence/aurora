// ART-BRUSH-LATCH-REST: EVERY INPUT OF AN ART-FACET TILE-SPACE STROKE IS THE
// ONE IT WAS PRESSED WITH, RUN THROUGH THE COMPOSER'S OWN POINTER HOOK.
// (docs/reviews/2026-09-25-art-brush-latch-rest.md)
//
// Hub ruling, empyrean docs/OVERSEER-LOG.md 2026-09-25T07:43:58Z: "YES, latch at
// the press ... a stroke's inputs latch when it starts. Same conditions:
// red-first mid-stroke case". The collision WORD's rows are
// composer-brush-word-latch-mounted.test.ts; these are the rest, one per input
// the composer's three tile-space brushes read:
//   the collision brush's PLANE (O1 of the word-latch packet);
//   the tile stamp's tile, palette line, priority, X flip and Y flip, and the
//   palette-apply brush's line (O2).
// Each change is made through the setter (or, for the flips, the X/Y key
// handler) its control calls, between two cells of one held stroke. One more
// row covers O3 of that packet: a stroke whose tool is switched to collision
// under the held button never paints a latch left over from an earlier
// collision stroke. Since ART-STROKE-FOLLOWUPS (a) latched the TOOL too (hub
// ruling 2026-09-25T08:55:30Z), that stroke stays a tile-stamp stroke to its end
// and paints no collision at all; the tool's own rows are
// composer-tool-latch-mounted.test.ts.
//
// These rows mount the real `ComposerCanvas` with the no-DOM harness
// (`src/test/render-hooked.ts`) and drive the `hostPointer` it hands to
// `PixelViewport`, re-read after every change, because PixelViewport routes each
// event to the hook it is rendered with at that moment. Every expected cell is
// built by the tree's own `stampTile` / `applyPaletteLineToDocCell` /
// `collisionPaintWord` over the values the stores held at the press.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { useProjectStore } from '../../../state/projectStore';
import { useEditorStore } from '../../../state/editorStore';
import { useArtStore } from '../../../state/artStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useToastStore } from '../../../state/toastStore';
import { documentHistoryHub } from '../../../state/history-hub';
import {
  createDoc, stampTile, applyPaletteLineToDocCell, cloneComposerDoc, type ComposerDoc, type ComposerCell,
} from '../../../../core/art/composer-buffer';
import { packCollisionCell, selectedCollisionWord } from '../../../../core/collision/collision-cell-word';
import { collisionPaintWord } from '../../../../core/editing/collision-word';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../../core/model/s4-types';
import PixelViewport, { type HostPointer } from '../../art-shared/PixelViewport';

// ── the fixture ────────────────────────────────────────────────────────────────

function section() {
  return {
    index: 0, name: 's0',
    tileGrid: {
      widthTiles: SECTION_TILES_WIDE, heightTiles: SECTION_TILES_HIGH,
      nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    },
    objects: [], rings: [], tiles: null, paletteRef: null, bgLayoutRef: null,
  };
}

function project() {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: Array.from({ length: 8 }, () => ({ pixels: new Uint8Array(64) })) },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section()] }],
    }],
    chunkLibrary: [], bgLibrary: [],
  };
}

/** Every 16px collision cell of the document holds this before a stroke. */
const FILL = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
/** Every 8px nametable cell holds atlas tile SEED_TILE on line 0, no flips, no priority. */
const SEED_TILE = 7;

/** An 8x2-tile doc-local document: eight 8px cells (and four 16px collision cells) per row. */
function openDoc(): ComposerDoc {
  const doc = createDoc(8, 2);
  doc.collisionA.fill(FILL);
  doc.collisionB.fill(FILL);
  for (const c of doc.cells) { c.atlasTile = SEED_TILE; c.pal = 0; c.hf = false; c.vf = false; c.pri = false; }
  useArtStore.getState().openDocument({ doc, chunkId: null, liveTileIndex: null, name: 'brush', dirty: false });
  return doc;
}

// ── the mount ──────────────────────────────────────────────────────────────────

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

async function mountComposer(): Promise<void> {
  win = installWindowStub();
  const mod = await import('../ComposerCanvas');
  mounted = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
}

/** The pointer hook the composer hands PixelViewport NOW. Loud when absent: with
 *  no hook the viewport would run the pixel engine, and nothing here would paint. */
function host(): HostPointer {
  const hp = mounted!.find(PixelViewport).props.hostPointer as HostPointer | null;
  expect(hp, 'the premise: a tile-space tool is armed, so the composer routes pointer events to its host hook').not.toBeNull();
  return hp!;
}

/** Press X or Y through the keydown handler the composer registered on window. */
function flipKey(k: 'x' | 'y'): void {
  const ran = win!.dispatch('keydown', {
    key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    repeat: false, target: null, preventDefault: () => {},
  });
  expect(ran, 'no keydown listener is registered: the composer never mounted its handler').toBeGreaterThan(0);
}

/** The pixel at the middle of 8px tile (tx, 0). */
const at = (tx: number) => ({ x: tx * 8 + 4, y: 4 });
const EV = {} as React.PointerEvent;

const wordNow = (): number => {
  const st = useEditorStore.getState();
  return selectedCollisionWord({
    shape: st.selectedCollisionProfile, entryFlipX: st.selectedCollisionEntryFlipX,
    userXFlip: st.selectedCollisionXFlip, yFlip: st.selectedCollisionYFlip, solidity: st.selectedCollisionSolidity,
  });
};

/** The flips the tile stamp holds, tracked beside the key presses this file makes
 *  (the composer keeps them in a ref no test can read; both start `false` on
 *  mount, and only `flipKey` toggles them). */
const flips = { hf: false, vf: false };

/** What one tile-space brush paints into a row-0 cell given the stores (and the
 *  tracked flips) as they are NOW, built by the tree's own writers over a copy
 *  of the seeded document. */
function nametableCellNow(t: 'tile-stamp' | 'palette-apply', seed: ComposerDoc, cx: number): ComposerCell {
  const s = useArtStore.getState();
  const d = cloneComposerDoc(seed);
  if (t === 'tile-stamp') stampTile(d, cx, 0, { tile: s.brushTile, pal: s.paletteLine, hf: flips.hf, vf: flips.vf, pri: s.stampPriority });
  else applyPaletteLineToDocCell(d, cx, 0, s.paletteLine);
  return { ...d.cells[cx] };
}

const row0 = (doc: ComposerDoc): ComposerCell[] => doc.cells.slice(0, 8).map((c) => ({ ...c }));

interface NametableRow {
  name: string;
  tool: 'tile-stamp' | 'palette-apply';
  change: () => void;
}

const NAMETABLE_ROWS: NametableRow[] = [
  { name: 'the stamp tile (a tileset pick, setBrushTile)', tool: 'tile-stamp',
    change: () => useArtStore.getState().setBrushTile(2) },
  { name: 'the stamp palette line (setPaletteLine)', tool: 'tile-stamp',
    change: () => useArtStore.getState().setPaletteLine(2) },
  { name: 'the stamp priority (setStampPriority)', tool: 'tile-stamp',
    change: () => useArtStore.getState().setStampPriority('off') },
  { name: 'the stamp X flip (the X key)', tool: 'tile-stamp',
    change: () => { flipKey('x'); flips.hf = !flips.hf; } },
  { name: 'the stamp Y flip (the Y key)', tool: 'tile-stamp',
    change: () => { flipKey('y'); flips.vf = !flips.vf; } },
  { name: 'the palette-apply line (setPaletteLine)', tool: 'palette-apply',
    change: () => useArtStore.getState().setPaletteLine(2) },
];

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useProjectStore.setState({
    config: { basePath: '/composer-brush-latch-rest', zones: [] } as never,
    project: project() as never,
  });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'level:ojz:act1' });
  useToastStore.setState({ toasts: [] });
  const art = useArtStore.getState();
  art.setBrushTile(1);
  art.setPaletteLine(1);
  art.setStampPriority('on');
  const ed = useEditorStore.getState();
  ed.setCollisionPaintPlane('a');
  ed.pickCollisionShape(9, false);
  ed.setSelectedCollisionXFlip(false);
  ed.setSelectedCollisionYFlip(false);
  ed.setSelectedCollisionSolidity('all');
  flips.hf = false;
  flips.vf = false;
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  useArtStore.getState().closeDocument();
  useArtStore.getState().setTool('pencil');
  win?.restore();
  win = null;
  useProjectStore.getState().reset();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
});

describe('ART-BRUSH-LATCH-REST: the composer\'s tile-stamp and palette-apply inputs are latched at the press (O2)', () => {
  it.each(NAMETABLE_ROWS)('ART-BRUSH-LATCH-REST: $name changed mid-drag leaves the stroke on the pressed value, and the next press takes it', async ({ name, tool, change }) => {
    useArtStore.getState().setTool(tool);
    const doc = openDoc();
    const seed = cloneComposerDoc(doc);
    await mountComposer();
    const pressed = Array.from({ length: 8 }, (_, cx) => nametableCellNow(tool, seed, cx));
    const untouched = row0(seed);
    // Tiles 0..4 of row 0 are the stroke; tiles 5..7 are never entered.
    host().down(at(0), EV);
    expect(row0(doc), 'the premise: the press painted tile 0, and only tile 0, with the values held at the press')
      .toEqual([pressed[0], ...untouched.slice(1)]);
    change();   // the control is used while the drag is held
    const changed = Array.from({ length: 8 }, (_, cx) => nametableCellNow(tool, seed, cx));
    expect(changed[2], `ANTI-VACUOUS: ${name} does not change what the brush paints`).not.toEqual(pressed[2]);
    host().move(at(2), EV);
    host().move(at(4), EV);
    expect(row0(doc), `${name} changed mid-drag changed the rest of the stroke`)
      .toEqual([...pressed.slice(0, 5), ...untouched.slice(5)]);
    host().up(null, EV);
    host().down(at(6), EV);
    host().up(null, EV);
    expect(row0(doc)[6], `the NEXT press did not take ${name} as changed during the last stroke`).toEqual(changed[6]);
    expect(row0(doc)[7], 'the next press painted past its own tile').toEqual(untouched[7]);
  });
});

describe('ART-BRUSH-LATCH-REST: the composer\'s collision plane is latched at the press (O1)', () => {
  it('ART-BRUSH-LATCH-REST: Plane B picked mid-drag leaves the stroke on plane A, and the next press paints B', async () => {
    useArtStore.getState().setTool('collision');
    const doc = openDoc();
    await mountComposer();
    const w = wordNow();
    expect(collisionPaintWord(w, FILL), 'ANTI-VACUOUS: the brush word paints nothing over the fill').not.toBe(FILL);
    host().down(at(0), EV);
    expect([...doc.collisionA], 'the premise: the press painted plane A cell 0 only').toEqual([collisionPaintWord(w, FILL), FILL, FILL, FILL]);
    useEditorStore.getState().setCollisionPaintPlane('b');   // the Plane B button, drag held
    expect(useEditorStore.getState().collisionPaintPlane, 'ANTI-VACUOUS: the plane did not change').toBe('b');
    host().move(at(2), EV);
    host().move(at(4), EV);
    const p = collisionPaintWord(w, FILL);
    expect([...doc.collisionA], 'Plane B picked mid-drag moved the rest of the stroke off plane A').toEqual([p, p, p, FILL]);
    expect([...doc.collisionB], 'Plane B picked mid-drag painted plane B inside a stroke pressed on A').toEqual([FILL, FILL, FILL, FILL]);
    host().up(null, EV);
    host().down(at(6), EV);
    host().up(null, EV);
    expect([...doc.collisionB], 'the NEXT press did not paint the plane picked during the last stroke').toEqual([FILL, FILL, FILL, p]);
    expect([...doc.collisionA], 'the next press painted plane A as well').toEqual([p, p, p, FILL]);
  });
});

describe('ART-BRUSH-LATCH-REST: a stroke switched to the collision tool under the held button paints no earlier stroke\'s word (O3)', () => {
  it('ART-BRUSH-LATCH-REST: a tile-stamp stroke switched to collision mid-drag paints no collision word, neither an earlier collision stroke\'s nor its own press\'s (the tool is latched)', async () => {
    useArtStore.getState().setTool('collision');
    const doc = openDoc();
    await mountComposer();
    // An earlier collision stroke, on cell 3 only, latches word W0.
    const w0 = wordNow();
    host().down(at(6), EV);
    host().up(null, EV);
    expect([...doc.collisionA], 'the premise: the earlier stroke painted cell 3 with W0').toEqual([FILL, FILL, FILL, collisionPaintWord(w0, FILL)]);
    // A new word is picked between strokes, then a tile-stamp stroke starts.
    useEditorStore.getState().pickCollisionShape(10, false);
    const w1 = wordNow();
    expect(collisionPaintWord(w1, FILL), 'ANTI-VACUOUS: W0 and W1 paint the same cell word').not.toBe(collisionPaintWord(w0, FILL));
    useArtStore.getState().setTool('tile-stamp');
    host().down(at(0), EV);
    // The tool is switched under the held button. The tool is latched at the
    // press (ART-STROKE-FOLLOWUPS (a)), so the rest of the drag stays a stamp.
    useArtStore.getState().setTool('collision');
    host().move(at(2), EV);
    host().move(at(4), EV);
    host().up(null, EV);
    expect([...doc.collisionA], 'the switched stroke painted collision (a latch left over from an earlier collision stroke, or its own word)')
      .toEqual([FILL, FILL, FILL, collisionPaintWord(w0, FILL)]);
    expect(doc.cells.slice(0, 5).map((c) => c.atlasTile), 'the switched stroke did not stamp to its end')
      .toEqual([1, 1, 1, 1, 1]);
  });
});
