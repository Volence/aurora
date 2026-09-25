// ART-STROKE-FOLLOWUPS (a), TOOL-LATCH: THE TOOL OF AN ART-FACET TILE-SPACE
// STROKE IS THE ONE IT WAS PRESSED WITH.
// (docs/reviews/2026-09-25-art-stroke-followups.md)
//
// Hub ruling, empyrean docs/OVERSEER-LOG.md 2026-09-25T08:55:30Z: "the tool is a
// stroke input, so it latches at the press on (a)'s ground (a stroke's inputs
// latch when it starts), under the same conditions as O1/O2". Row 207's rows
// (composer-brush-latch-rest-mounted.test.ts) latch every other input; these
// rows switch the TOOL under the held button, through `setTool` (what the tool
// rail and the tool keys call), and ask that the rest of the stroke does what
// the press's tool does.
//
// These rows mount the real `ComposerCanvas` with the no-DOM harness
// (`src/test/render-hooked.ts`) and route each pointer event the way
// PixelViewport does with the hook it is rendered with at that moment
// (`src/renderer/components/art-shared/PixelViewport.tsx`): a move of a held
// host stroke reaches `hostPointer.move` only while `hostPointer` is set
// (`if (hostDrawing.current && hostPointer)`), otherwise it falls to the pixel
// engine, which never took this press and does nothing; the release reaches
// `hostPointer?.up`, so it is lost when the hook is gone. Every expected cell is
// built by the tree's own `stampTile` / `collisionPaintWord` over the values the
// stores held at the press.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { useProjectStore } from '../../../state/projectStore';
import { useEditorStore } from '../../../state/editorStore';
import { useArtStore, type ArtTool } from '../../../state/artStore';
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
  useArtStore.getState().openDocument({ doc, chunkId: null, liveTileIndex: null, name: 'tool', dirty: false });
  return doc;
}

// ── the mount and the routing ──────────────────────────────────────────────────

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

async function mountComposer(): Promise<void> {
  win = installWindowStub();
  const mod = await import('../ComposerCanvas');
  mounted = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
}

/** The pointer hook the composer hands PixelViewport NOW (null: the pixel engine). */
const hook = (): HostPointer | null => mounted!.find(PixelViewport).props.hostPointer as HostPointer | null;

/** The pixel at the middle of 8px tile (tx, 0). */
const at = (tx: number) => ({ x: tx * 8 + 4, y: 4 });
const EV = {} as React.PointerEvent;

/** One held stroke, routed as PixelViewport routes it (see the header). */
const stroke = {
  down(tx: number) {
    const hp = hook();
    expect(hp, 'the premise: a tile-space tool is armed, so the press goes to the composer\'s host hook').not.toBeNull();
    hp!.down(at(tx), EV);
  },
  move(tx: number) { hook()?.move(at(tx), EV); },
  up() { hook()?.up(null, EV); },
};

const wordNow = (): number => {
  const st = useEditorStore.getState();
  return selectedCollisionWord({
    shape: st.selectedCollisionProfile, entryFlipX: st.selectedCollisionEntryFlipX,
    userXFlip: st.selectedCollisionXFlip, yFlip: st.selectedCollisionYFlip, solidity: st.selectedCollisionSolidity,
  });
};

/** What the tile stamp paints into row-0 cell `cx` with the stores as they are NOW. */
function stampedNow(seed: ComposerDoc, cx: number): ComposerCell {
  const s = useArtStore.getState();
  const d = cloneComposerDoc(seed);
  stampTile(d, cx, 0, { tile: s.brushTile, pal: s.paletteLine, hf: false, vf: false, pri: s.stampPriority });
  return { ...d.cells[cx] };
}
/** What the palette-apply brush paints into row-0 cell `cx` with the stores as they are NOW. */
function relinedNow(seed: ComposerDoc, cx: number): ComposerCell {
  const d = cloneComposerDoc(seed);
  applyPaletteLineToDocCell(d, cx, 0, useArtStore.getState().paletteLine);
  return { ...d.cells[cx] };
}

const row0 = (doc: ComposerDoc): ComposerCell[] => doc.cells.slice(0, 8).map((c) => ({ ...c }));

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useProjectStore.setState({
    config: { basePath: '/composer-tool-latch', zones: [] } as never,
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

describe('ART-STROKE-FOLLOWUPS (a): the tool of a composer tile-space stroke is latched at the press', () => {
  it.each<{ to: ArtTool }>([{ to: 'collision' }, { to: 'palette-apply' }, { to: 'pencil' }])(
    'TOOL-LATCH: a tile-stamp stroke switched to $to under the held button stamps to its end',
    async ({ to }) => {
      useArtStore.getState().setTool('tile-stamp');
      const doc = openDoc();
      const seed = cloneComposerDoc(doc);
      await mountComposer();
      const stamped = Array.from({ length: 8 }, (_, cx) => stampedNow(seed, cx));
      const untouched = row0(seed);
      // ANTI-VACUOUS: what the switched-to tool would paint differs from the stamp.
      if (to === 'palette-apply') expect(relinedNow(seed, 2), 'ANTI-VACUOUS: palette-apply paints tile 2 like the stamp').not.toEqual(stamped[2]);
      if (to === 'collision') expect(collisionPaintWord(wordNow(), FILL), 'ANTI-VACUOUS: the collision brush paints nothing').not.toBe(FILL);
      stroke.down(0);
      expect(row0(doc), 'the premise: the press stamped tile 0 only').toEqual([stamped[0], ...untouched.slice(1)]);
      useArtStore.getState().setTool(to);   // the tool rail / tool key, button held
      expect(useArtStore.getState().tool, 'ANTI-VACUOUS: the tool did not change').toBe(to);
      stroke.move(2);
      stroke.move(4);
      stroke.up();
      expect(row0(doc), `a tile-stamp stroke switched to ${to} mid-drag did not stamp to its end`)
        .toEqual([...stamped.slice(0, 5), ...untouched.slice(5)]);
      expect([...doc.collisionA], `a tile-stamp stroke switched to ${to} mid-drag wrote collision`).toEqual([FILL, FILL, FILL, FILL]);
      if (to === 'pencil') {
        expect(hook(), 'the released stroke still holds the pointer: a pencil press would go to the tile stamp').toBeNull();
      } else {
        // The NEXT press takes the switched-to tool.
        stroke.down(6);
        stroke.up();
        if (to === 'collision') {
          expect([...doc.collisionA], 'the NEXT press did not paint collision').toEqual([FILL, FILL, FILL, collisionPaintWord(wordNow(), FILL)]);
          expect(row0(doc)[6], 'the NEXT press stamped as well').toEqual(untouched[6]);
        } else {
          expect(row0(doc)[6], 'the NEXT press did not re-line tile 6').toEqual(relinedNow(seed, 6));
        }
      }
    });

  it('TOOL-LATCH: a collision stroke switched to tile-stamp under the held button paints collision to its end', async () => {
    useArtStore.getState().setTool('collision');
    const doc = openDoc();
    const seed = cloneComposerDoc(doc);
    await mountComposer();
    const p = collisionPaintWord(wordNow(), FILL);
    expect(p, 'ANTI-VACUOUS: the collision brush paints nothing').not.toBe(FILL);
    expect(stampedNow(seed, 2), 'ANTI-VACUOUS: the stamp paints tile 2 as it is').not.toEqual(row0(seed)[2]);
    stroke.down(0);
    expect([...doc.collisionA], 'the premise: the press painted collision cell 0 only').toEqual([p, FILL, FILL, FILL]);
    useArtStore.getState().setTool('tile-stamp');
    stroke.move(2);
    stroke.move(4);
    stroke.up();
    expect([...doc.collisionA], 'a collision stroke switched to tile-stamp mid-drag did not paint collision to its end').toEqual([p, p, p, FILL]);
    expect(row0(doc), 'a collision stroke switched to tile-stamp mid-drag stamped tiles').toEqual(row0(seed));
  });
});
