// ART-BRUSH-WORD-LATCH: THE ART FACET'S COLLISION BRUSH KEEPS THE WORD IT WAS
// PRESSED WITH, RUN THROUGH THE COMPOSER'S OWN POINTER HOOK.
// (docs/reviews/2026-09-25-art-brush-word-latch.md)
//
// Hub ruling, empyrean docs/OVERSEER-LOG.md 2026-09-12T18:49:16Z: "(a) of
// 09:39:48Z covers it. Its ground is behavioural consistency (the word latches
// at the press, as size does) ... it owes the same red-first mid-stroke case."
// The map's rows are BRUSH-WORD-LATCH in map-viewport-mounted.test.ts; these are
// the composer's, one per input of `selectedCollisionWord`: the shape and the
// picked entry's mirror flag (one shape button writes both, through
// `pickCollisionShape`), Flip H, Flip V and the floor type. Each change is made
// through the setter its palette control calls, between two cells of one held
// stroke, exactly where a Space on a focused palette button lands it.
//
// These rows mount the real `ComposerCanvas` with the no-DOM harness
// (`src/test/render-hooked.ts`) and drive the `hostPointer` it hands to
// `PixelViewport`: the object PixelViewport routes every pointer event to while a
// tile-space tool is armed. The bits each change must move are derived from the
// encoder one field at a time, so a change that leaves the word alone cannot pass
// as a latch.

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
import { createDoc, type ComposerDoc } from '../../../../core/art/composer-buffer';
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
      tileset: { tiles: Array.from({ length: 4 }, () => ({ pixels: new Uint8Array(64) })) },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section()] }],
    }],
    chunkLibrary: [], bgLibrary: [],
  };
}

/** Every 16px cell of the document holds this before a stroke. */
const FILL = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
const PICK = 9;

/** An 8x2-tile doc-local document: four 16px cells in one row. */
function openDoc(): ComposerDoc {
  const doc = createDoc(8, 2);
  doc.collisionA.fill(FILL);
  doc.collisionB.fill(FILL);
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

/** The pointer hook the composer hands PixelViewport. Loud when absent: with no
 *  hook the viewport would run the pixel engine, and nothing here would paint. */
function host(): HostPointer {
  const hp = mounted!.find(PixelViewport).props.hostPointer as HostPointer | null;
  expect(hp, 'the premise: the collision tool is armed, so the composer routes pointer events to its host hook').not.toBeNull();
  return hp!;
}

/** The pixel at the middle of 8px tile (tx, 0). */
const at = (tx: number) => ({ x: tx * 8 + 4, y: 4 });
const EV = {} as React.PointerEvent;

const brushWordNow = (): number => {
  const st = useEditorStore.getState();
  return selectedCollisionWord({
    shape: st.selectedCollisionProfile, entryFlipX: st.selectedCollisionEntryFlipX,
    userXFlip: st.selectedCollisionXFlip, yFlip: st.selectedCollisionYFlip, solidity: st.selectedCollisionSolidity,
  });
};

const fieldBits = {
  shape: packCollisionCell({ shape: 0xFFFF, xFlip: false, yFlip: false, solidity: 'none' }),
  xFlip: packCollisionCell({ shape: 0, xFlip: true, yFlip: false, solidity: 'none' }),
  yFlip: packCollisionCell({ shape: 0, xFlip: false, yFlip: true, solidity: 'none' }),
  solidity: packCollisionCell({ shape: 0, xFlip: false, yFlip: false, solidity: 'all' }),
} as const;

const WORD_CHANGES: Array<{ name: string; field: keyof typeof fieldBits; change: () => void }> = [
  { name: 'another shape (a shape button, pickCollisionShape)', field: 'shape',
    change: () => useEditorStore.getState().pickCollisionShape(PICK + 1, false) },
  { name: 'the mirrored entry of the same shape (a shape button, pickCollisionShape)', field: 'xFlip',
    change: () => useEditorStore.getState().pickCollisionShape(PICK, true) },
  { name: 'Flip H (setSelectedCollisionXFlip)', field: 'xFlip',
    change: () => useEditorStore.getState().setSelectedCollisionXFlip(true) },
  { name: 'Flip V (setSelectedCollisionYFlip)', field: 'yFlip',
    change: () => useEditorStore.getState().setSelectedCollisionYFlip(true) },
  { name: 'another floor type (a Floor button, setSelectedCollisionSolidity)', field: 'solidity',
    change: () => useEditorStore.getState().setSelectedCollisionSolidity('top') },
];

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useProjectStore.setState({
    config: { basePath: '/composer-brush-word-latch', zones: [] } as never,
    project: project() as never,
  });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'level:ojz:act1' });
  useToastStore.setState({ toasts: [] });
  useArtStore.getState().setTool('collision');
  const ed = useEditorStore.getState();
  ed.setCollisionPaintPlane('a');
  ed.pickCollisionShape(PICK, false);
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

describe('ART-BRUSH-WORD-LATCH: the composer\'s collision brush word is latched at the press', () => {
  it.each(WORD_CHANGES)('ART-BRUSH-WORD-LATCH: $name picked mid-drag leaves the stroke on the pressed word, and the next press takes it', async ({ name, field, change }) => {
    const doc = openDoc();
    await mountComposer();
    const hp = host();
    const w1 = brushWordNow();
    // Cells 0, 1, 2 of plane A are the stroke; cell 3 is never entered.
    hp.down(at(0), EV);
    expect([...doc.collisionA], 'the premise: the press painted cell 0, and only cell 0, with the word selected at the press')
      .toEqual([collisionPaintWord(w1, FILL), FILL, FILL, FILL]);
    change();   // Space on the focused palette button: the drag is held
    const w2 = brushWordNow();
    expect((w1 ^ w2) & fieldBits[field], `ANTI-VACUOUS: ${name} did not move the ${field} bits of the brush word`).not.toBe(0);
    expect(collisionPaintWord(w2, FILL), 'ANTI-VACUOUS: the two words paint the same cell word').not.toBe(collisionPaintWord(w1, FILL));
    hp.move(at(2), EV);
    hp.move(at(4), EV);
    expect([...doc.collisionA], `${name} picked mid-drag changed the word for the rest of the stroke`)
      .toEqual([collisionPaintWord(w1, FILL), collisionPaintWord(w1, FILL), collisionPaintWord(w1, FILL), FILL]);
    expect([...doc.collisionB], 'the stroke wrote plane B, which it was not painting').toEqual([FILL, FILL, FILL, FILL]);
    hp.up(null, EV);
    const id = useArtStore.getState().composerDocId;
    expect(id, 'the premise: a doc-local document owns a stack').not.toBeNull();
    documentHistoryHub.historyFor(id!).undo();
    const live = useArtStore.getState().open!.doc;
    expect([...live.collisionA], 'the premise of the second half: one undo took the whole stroke back').toEqual([FILL, FILL, FILL, FILL]);
    host().down(at(2), EV);
    host().up(null, EV);
    expect([...useArtStore.getState().open!.doc.collisionA], `the NEXT press did not take the word ${name} picked during the last stroke`)
      .toEqual([FILL, collisionPaintWord(w2, FILL), FILL, FILL]);
  });
});
