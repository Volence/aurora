// THE FIRST ROWS THAT RUN `MapViewport`'s OWN CODE.
//
// ═══ WHAT THE LENS ROW CLAIMED, AND WHICH HALF WAS TRUE ═══
//
// MAPVIEWPORT-UNTESTED said no test loads the largest file in the app, on two
// enumerations that agreed. Measured here, the load half is FALSE:
// `facet-registry.ts:18` imports `MapViewport`, and four test files import that
// registry, so the module is evaluated by the suite today. (Planting a top-level
// `throw` in MapViewport.tsx reddens exactly facet-modules, facet-visibility,
// map-status-classic and classic-art-dock.) Both enumerations looked for a DIRECT
// import from a test file and neither followed the transitive edge.
//
// The half that mattered was true, and it is the half this file is about: the
// module was evaluated and the COMPONENT WAS NEVER CALLED. Every line inside the
// function body — including four fixes landed in one evening — was reachable only
// by reading it.
//
// ═══ WHY A COMPONENT CAN RUN HERE WITH NO DOM ═══
//
// This is not jsdom and it is not a dependency. Three small pieces, each of which
// says what it refuses:
//
//   • `src/test/render-hooked.ts` already supplied the reconciler's missing half
//     (a hook dispatcher) for `NumberField`. This parcel added the two hooks a
//     store-driven component needs: `useSyncExternalStore`, which is what every
//     `useEditorStore(...)` call reaches through zustand — the harness stopped at
//     MapViewport.tsx:550 without it — and `unmount()`, which runs the effect
//     cleanups. The second is not hygiene: an unmount is BEHAVIOUR here, because
//     a facet switch unmounts this component mid-gesture and the cleanup is what
//     commits it.
//   • `src/test/window-stub.ts` supplies the four browser globals MapViewport's
//     effects reach for, as data a row can read back.
//   • `src/test/element-stub.ts` performs the commit step React never does here:
//     it fills the tree's refs with host stubs carrying a DECLARED rect, so the
//     component's own `screenToWorld` maps a client coordinate to a world one.
//
// ═══ SO WHAT THESE ROWS ARE, AND WHAT THEY ARE NOT ═══
//
// They are the component's real handlers, over the real stores, hit-testing with
// the component's real arithmetic and issuing real commands onto the real undo
// stack. They are NOT a browser: nothing paints, nothing lays out, no event
// propagates, and the rect a row declares is not one a browser measured. A claim
// that depends on a pixel or on layout is unanswerable here and belongs in a
// foreground CDP pass.
//
// EVERY FIX-NAMED ROW BELOW WAS SHOWN RED with that fix taken out on disk, one at
// a time; the commit message records which row caught which revert.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../test/window-stub';
import { attachRefs, type HostStub } from '../../../test/element-stub';
import { useProjectStore } from '../../state/projectStore';
import { useEditorStore, focusedHistory } from '../../state/editorStore';
import { useSessionStore } from '../../state/sessionStore';
import { useViewStore } from '../../state/viewStore';
import { useToastStore } from '../../state/toastStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { switchFacet } from '../../workspace/facet-tools';
import { documentHistoryHub } from '../../state/history-hub';
import type { ObjectPlacement, Section } from '../../../core/model/s4-types';
import {
  unpackNametableWord, packNametableWord, SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE,
} from '../../../core/model/s4-types';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import {
  BG_OVERRIDE_CONSUMER_OUT_DIR, LAYOUT_TILE_INDEX_MASK, type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../../core/formats/bg-override/bg-anim-band';
import { packCollisionCell, unpackCollisionCell } from '../../../core/collision/collision-cell-word';
import { SECTION_PLANE_WORDS } from '../../../core/collision/collision-cell-resolve';
import { readCrossover, handOffFrom } from '../../../core/collision/layer-transition';
import { snapMarquee, effectiveGranularity, type MapClipboard } from '../../../core/editing/map-clipboard';
import { selectionToChunk } from '../../../core/editing/selection-to-chunk';
import { SCREEN_WIDTH } from '../../../core/model/screen';

// ── the fixture ────────────────────────────────────────────────────────────────

const OBJ = (x: number, y: number): ObjectPlacement => ({ x, y, typeId: 'monitor', subtype: 0 });

/**
 * THE BACKGROUND PLANE, and it is the reason this fixture grew.
 *
 * `paintBgTile` is unreachable without one: `worldToBgTile` asks
 * `sectionRenderer.getBg()` and returns null when nothing is loaded, so every
 * BG-stroke row over the old fixture passed by painting nothing. The plane has
 * to be loaded by the COMPONENT'S OWN `reloadBg`, not by the test — that is the
 * path that decides which array is on screen (`resolveDisplayedBg`), and a test
 * that called `sectionRenderer.loadBg` itself would be asserting against a plane
 * the component never resolved.
 *
 * So the acts carry `bgLayout`/`bgTiles`, which is `resolveDisplayedBg`'s third
 * arm (`source: 'act'`) — the arm `set-bg-tiles` with a null `bgRef` resolves at
 * commit time, and therefore the arm BG-STROKE-WRONG-ACT is actually about.
 *
 * `BG_WIDTH` is 64 (core/formats/bg-tiles.ts) and `reloadBg` derives the height
 * as `layout.length / BG_WIDTH`, so the length must be a multiple of 64 or the
 * plane silently comes out zero rows high and every paint lands out of bounds.
 * Two rows is enough to give row 1 a distinct index from row 0.
 *
 * ⚠ THE FILL VALUE IS PER-ACT AND IS LOAD-BEARING. act1's plane reads 0x0011
 * everywhere and act2's reads 0x0022, so a stroke that commits into the wrong
 * act is a WRONG VALUE and not merely a wrong array identity — the same reason
 * the two acts' objects sit at different coordinates.
 *
 * `BG_WIDTH` is IMPORTED, not retyped: a local 64 that drifted from the
 * constant would make every BG row here paint out of bounds and pass by doing
 * nothing.
 */
const BG_COLS = BG_WIDTH;
const BG_ROWS = 2;
const BG_FILL = { act1: 0x0011, act2: 0x0022 } as const;
/** The same per-act trick on the FOREGROUND plane. See `section()`. */
const FG_FILL = { act1: 0x0101, act2: 0x0202 } as const;

/** A layout the component's `reloadBg` will hand to `SectionRenderer.loadBg`. */
function bgLayout(fill: number): Uint16Array {
  return new Uint16Array(BG_COLS * BG_ROWS).fill(fill);
}

/** Enough BG art that a nametable word has something to index. Nothing draws:
 *  the suite's `OffscreenCanvas` is a no-op stub (src/test/offscreen-canvas-stub.ts). */
function bgTiles(): Array<{ pixels: Uint8Array }> {
  return [0, 1, 2, 3].map(() => ({ pixels: new Uint8Array(64) }));
}

/**
 * A section with objects and a FOREGROUND nametable, at the shape `MapViewport`
 * and the tile commands both read. Nothing here draws anything real.
 *
 * ⚠ THE NAMETABLE IS SIZED FROM THE ENGINE CONSTANTS, and it did not used to be.
 * `worldToSectionTile` computes `row * SECTION_TILES_WIDE + col` — 256, not the
 * `widthTiles` this object declares — so an under-sized array takes every write
 * past row 0 SILENTLY (an out-of-range store into a typed array is dropped, not
 * thrown). A row that painted down a column would have watched nothing happen
 * and passed. `widthTiles`/`heightTiles` are declared to match for the same
 * reason: two numbers describing one array must not disagree.
 *
 * The fill is per-act (`0x0101` / `0x0202`) so a write into the wrong act's
 * section is a wrong VALUE and not merely a wrong array identity, and so the
 * `oldNt !== newNt` guard at the top of the paint branch is not sitting on the
 * zero it would also produce for "nothing was picked".
 */
function section(objects: ObjectPlacement[], fgFill = 0): Section {
  return {
    index: 0,
    name: 's0',
    tileGrid: {
      widthTiles: SECTION_TILES_WIDE,
      heightTiles: SECTION_TILES_HIGH,
      nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH).fill(fgFill),
    },
    objects,
    rings: [],
    tiles: null,
    paletteRef: null,
    bgLayoutRef: null,
  } as unknown as Section;
}

/**
 * A TWO-ACT PROJECT, because half of what is under test is what happens when the
 * act changes UNDER a gesture, and one act cannot pose that question. Both acts
 * carry a section at index 0 with one object, at DIFFERENT coordinates, so a
 * write that lands in the wrong act shows up as a value and not only as an
 * identity.
 *
 * ⚠ `gridWidth` / `gridHeight` ARE LOAD-BEARING AND WERE THE FIRST THING THIS
 * FILE GOT WRONG. `MapViewport` calls `sectionRenderer.setGrid(act.gridWidth,
 * act.gridHeight)`, and `sectionWorldOffset` computes `index % gridWidth`. An act
 * without them makes that `NaN`, every object hit-test compares against `NaN`,
 * and every pointer row passes by selecting nothing. A fixture that omits them
 * does not fail — it goes quiet.
 */
function twoActProject(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [
        {
          id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
          sections: [section([OBJ(64, 64)], FG_FILL.act1)],
          bgLayout: bgLayout(BG_FILL.act1), bgTiles: bgTiles(),
        },
        {
          id: 'act2', name: 'act2', gridWidth: 1, gridHeight: 1,
          sections: [section([OBJ(600, 400)], FG_FILL.act2)],
          bgLayout: bgLayout(BG_FILL.act2), bgTiles: bgTiles(),
        },
      ],
    }],
    chunkLibrary: [],
  } as never;
}

/** Focus an act the way the shell does: the project's current act AND its tab. */
function focusAct(actId: string): void {
  useProjectStore.getState().setCurrentAct('ojz', actId);
  useSessionStore.setState({ activeId: `level:ojz:${actId}` });
}

/** The one section's objects in `actId`, or a throw naming what was missing —
 *  `sections[i]` is legitimately nullable in the model, and an `undefined` here
 *  would read back as "the objects are gone", which is the finding several of
 *  these rows exist to detect. */
function objectsIn(actId: string): ObjectPlacement[] {
  const act = useProjectStore.getState().project?.zones[0]?.acts.find((a) => a.id === actId);
  const sec = act?.sections[0];
  if (!sec) throw new Error(`map-viewport-mounted: no section 0 in ${actId}; the fixture moved`);
  return sec.objects;
}

/** Both acts' single object, as the pair every act-switch row reads. */
const bothActs = () => ({
  act1: { x: objectsIn('act1')[0].x, y: objectsIn('act1')[0].y },
  act2: { x: objectsIn('act2')[0].x, y: objectsIn('act2')[0].y },
});

// ── the events ─────────────────────────────────────────────────────────────────

/** A `keydown` as MapViewport's handler reads one: a key, three modifier bits, a
 *  target it runs `isTypingTarget` over, and a `preventDefault` a row can see. */
function keydown(
  key: string,
  mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
) {
  return {
    key,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    altKey: mods.altKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    target: null,
    preventDefault: () => undefined,
  };
}

/** A left-button mouse event at a client point, with a `preventDefault` flag a
 *  row can read back. */
function mouse(clientX: number, clientY: number, over: Record<string, unknown> = {}) {
  let prevented = false;
  return {
    button: 0,
    buttons: 1,
    clientX,
    clientY,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    currentTarget: null,
    target: null,
    preventDefault: () => { prevented = true; },
    wasPrevented: () => prevented,
    ...over,
  };
}

// ── the mount ──────────────────────────────────────────────────────────────────

/** The rect every row declares itself to be looking through: origin at the client
 *  origin, so a client coordinate IS a world coordinate at zoom 1 and viewport 0.
 *  Chosen so the fixture's own object coordinates read as screen coordinates. */
const VIEWPORT = { left: 0, top: 0, width: 640, height: 480 };

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;
let hosts: HostStub[] = [];

interface Surface {
  h: Hooked<object>;
  /** The container div's React props: its four pointer handlers live here. */
  on(): Record<string, (e: unknown) => void>;
  /** The container div's own host stub — the native wheel listener is on it. */
  container(): HostStub;
}

/**
 * Mount the map with its refs filled at `rect`.
 *
 * `rect` defaults to VIEWPORT, whose origin IS the client origin, so there a
 * client coordinate and a container-local one are the same number. That is
 * convenient and it is also a blind spot: every `clientX - rect.left` in the
 * component is invisible at VIEWPORT. A row about a hit test or a placement in
 * local space passes an offset rect (map-coverage-3's OFFSET) to see it.
 */
async function mountMap(rect: typeof VIEWPORT = VIEWPORT): Promise<Surface> {
  win = installWindowStub();
  const mod = await import('../MapViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  const attached = attachRefs(h.el(), rect);
  hosts = attached.all();
  // A render after the refs are filled, because `useAttachedEffect` decides from
  // the ELEMENT and has to see it appear: this is the pass that attaches the
  // native wheel listener.
  h.setProps({});
  return {
    h,
    on: () => (h.el() as unknown as { props: Record<string, (e: unknown) => void> }).props,
    container: () => attached.byTag('div')[0],
  };
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.getState().reset();
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
  useEditorStore.getState().setSelection(null);
  useEditorStore.getState().setTool('select');
  useProjectStore.setState({ project: twoActProject() });
  focusAct('act1');
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  hosts = [];
  win?.restore();
  win = null;
  useEditorStore.getState().setSelection(null);
});

// ══════════════════════════════════════════════════════════════════════════════
// THE HARNESS IS ALIVE.
//
// Every row below is a claim about a handler that exists only if these are true,
// so they are asserted rather than assumed. A file that quietly stopped mounting
// the component, or whose refs stopped being filled, would pass every remaining
// row by doing nothing — the geometry row is the one that catches the second
// case, because an unfilled canvas ref makes `screenToWorld` answer the origin.
// ══════════════════════════════════════════════════════════════════════════════

describe('the map component runs in this suite', () => {
  it('renders, and its effects register the three window listeners', async () => {
    const s = await mountMap();
    expect(s.h.renders(), 'the component body never ran').toBeGreaterThan(0);
    expect(win!.listenerTypes().sort()).toEqual(['keydown', 'mousemove', 'mouseup']);
  });

  it('fills its refs, so a click hit-tests against real geometry', async () => {
    const s = await mountMap();
    expect(hosts.length, 'no host element was attached').toBeGreaterThan(0);
    // The fixture's object is at world (64,64), which under VIEWPORT is client
    // (64,64). A ref that stayed null answers the origin for every coordinate,
    // and this row would then select nothing.
    s.on().onMouseDown(mouse(64, 64));
    expect(useEditorStore.getState().selection)
      .toMatchObject({ type: 'object', sectionIndex: 0, index: 0 });
  });

  it('takes its listeners away again on unmount', async () => {
    const s = await mountMap();
    expect(win!.listenerCount('keydown')).toBe(1);
    s.h.unmount();
    mounted = null;
    for (const type of ['keydown', 'mouseup', 'mousemove']) {
      expect(win!.listenerCount(type), `the ${type} cleanup did not run`).toBe(0);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX: DELETE-ABOVE-MODIFIER-GUARD (lens sweep, HIGH; landed bc668532)
//
// The only branch on this surface that DESTROYS data tested no modifier at all,
// 54 lines above the guard whose own comment claims it covers every modified key.
// Ctrl+Delete — "delete the previous word" in every text field in the OS — and
// Alt+Backspace both ran `delete-object` against the selection.
//
// `map-chords.test.ts` pins what `resolveMapChord` should ANSWER, and its source
// scan pins that the handler asks it. Neither can see whether an object survives
// the keystroke. These rows fire the event at the real listener and count the
// objects afterwards.
// ══════════════════════════════════════════════════════════════════════════════

describe('a modified Delete does not destroy the selected object', () => {
  beforeEach(() => {
    useEditorStore.getState().setSelection({ type: 'object', sectionIndex: 0, index: 0 } as never);
  });

  it('CONTROL: a bare Delete still deletes it, and lands one undo entry', async () => {
    await mountMap();
    expect(objectsIn('act1')).toHaveLength(1);
    expect(win!.dispatch('keydown', keydown('Delete')), 'nothing was listening').toBe(1);
    expect(objectsIn('act1'), 'the bare key must still work').toHaveLength(0);
    expect(focusedHistory()!.canUndo, 'a destroy must be undoable').toBe(true);
  });

  for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
    for (const key of ['Delete', 'Backspace']) {
      it(`refuses ${mod.replace('Key', '')}+${key}`, async () => {
        await mountMap();
        win!.dispatch('keydown', keydown(key, { [mod]: true }));
        expect(objectsIn('act1'), `${mod}+${key} destroyed the object`).toHaveLength(1);
        expect(focusedHistory()?.canUndo ?? false, 'and put it on the undo stack').toBe(false);
      });
    }
  }

  it('still deletes with Shift held: Shift is not judged, and never was', async () => {
    // The control on the OTHER side. `map-chords.ts` states this deliberately: the
    // hoisted guard never judged Shift either, Shift is a case modifier on the
    // letters this surface binds, and excluding it would be an unreported
    // behaviour change dressed as a fix.
    await mountMap();
    win!.dispatch('keydown', keydown('Delete', { shiftKey: true }));
    expect(objectsIn('act1')).toHaveLength(0);
  });

  it('leaves the selection alone when it refused', async () => {
    // The refusal has to be a full no-op rather than "kept the object, dropped the
    // selection": the branch clears the selection unconditionally once entered, so
    // a fix that only skipped the command would still lose it.
    await mountMap();
    win!.dispatch('keydown', keydown('Delete', { ctrlKey: true }));
    expect(useEditorStore.getState().selection).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX: DRAG-SURVIVES-ACT-SWITCH (lens sweep, critical; landed 8daa197a)
//
// `App.tsx`'s window keydown switches the focused tab on the number keys, which
// can change the open act with NO POINTER EVENT in between. The level pane is
// un-keyed, so MapViewport is never remounted, and every read of the subject goes
// through `getSectionByIndex`, which resolves `getCurrentAct()` fresh. So the
// mouse stayed down, the drag kept running, and from the switch onward it wrote
// the object at the same index in a DIFFERENT ACT.
//
// The measured damage was two-part: per-mousemove writes into the new act's
// object with no command at all, and then a release that put the OLD act's start
// coordinates into it through a real `move-object` command — landing on the undo
// stack under an innocent description and losing the original move as well.
//
// `map-gesture-witness.test.ts` pins the verdict function and `map-teardown`'s
// scan pins that `finishGesture` asks it. What neither can reach is the effect
// that makes an act switch a teardown trigger AT ALL: without it the corruption
// waits for the next mousemove or the release, and both of those already write.
// ══════════════════════════════════════════════════════════════════════════════

describe('a drag does not survive an act switch', () => {
  /**
   * THE SWITCH, AND THEN REACT. `focusAct` is a store write and nothing more —
   * which is exactly what `App.tsx`'s number keys are. `renders()` is React's
   * scheduler standing in: `render-hooked` flushes eagerly but only when
   * something asks, because it has no timer of its own. WITHOUT THIS the
   * act-switch effect has not run yet, and a row about that effect would pass by
   * measuring the moment before the fix gets its chance.
   *
   * The re-render is asserted, not assumed: a component that stopped subscribing
   * to the open act would make every row here vacuous, and this is where that
   * shows.
   */
  function switchActAndSettle(s: Surface, actId: string): void {
    const before = s.h.renders();
    focusAct(actId);
    expect(s.h.renders(), 'the component did not re-render on an act switch')
      .toBeGreaterThan(before);
  }

  /**
   * THE SWITCH WITH REACT DELIBERATELY HELD BACK, for the two rows about the
   * guards at the WRITE SITES rather than the guard in the effect.
   *
   * ═══ WHY THESE TWO ROWS NEED THEIR OWN HELPER ═══
   *
   * `abandonStaleGestures` runs in THREE places — the act-switch effect, the top
   * of `handleMouseMove`, and the top of `finishGesture` — and the last two are
   * consumer-side guards. They are what makes the property hold even if the effect
   * never fires, which is the only reason a NEW call site cannot defeat it. But a
   * row that lets the effect run first has the effect do the work inside its own
   * sample window, and then reports the write-site guard as working whether it
   * exists or not: a control that acts where it was supposed to do nothing.
   *
   * ⚠ AND THE FIRST DRAFT OF THIS FILE FELL EXACTLY INTO THAT. It asserted "the
   * revert has not happened yet" and then reached for the handler through
   * `s.on()` — which calls `el()`, which FLUSHES. The assertion passed and the
   * effect then ran on the very next line. Measured: with the `handleMouseMove`
   * guard commented out on disk, both rows stayed GREEN. The handler has to be
   * captured BEFORE the switch, which is what `held` is for.
   *
   * So the capture and the switch are ONE call, and it returns the only handlers
   * the row may use afterwards. There is no way to write these rows the wrong way
   * round through this helper, which is the point of it existing at all.
   */
  function switchActHoldingReact(
    s: Surface, actId: string,
  ): Record<string, (e: unknown) => void> {
    const held = { ...s.on() };   // captured BEFORE the switch: this read flushes
    focusAct(actId);              // …and nothing after it reads the tree
    return held;
  }

  /** Press on act1's object and drag it, which writes LIVE and commits nothing —
   *  the state the defect needed. Returns the surface. */
  async function dragInFlight(): Promise<Surface> {
    const s = await mountMap();
    s.on().onMouseDown(mouse(64, 64));
    expect(useEditorStore.getState().selection,
      'the press did not grab the object, so nothing below is measuring a drag')
      .toMatchObject({ type: 'object', index: 0 });
    s.on().onMouseMove(mouse(96, 96));
    expect(bothActs().act1, 'a drag must write live: that is the premise of the whole fix')
      .toEqual({ x: 96, y: 96 });
    expect(focusedHistory()?.canUndo ?? false, 'and must not have committed yet').toBe(false);
    return s;
  }

  it('CONTROL: with no switch, the release commits the move once', async () => {
    // The row that catches an over-application. "Drop every gesture" is the wrong
    // rule; an ordinary drag must still land exactly one command.
    const s = await dragInFlight();
    win!.dispatch('mouseup', {});
    expect(bothActs().act1).toEqual({ x: 96, y: 96 });
    expect(focusedHistory()!.canUndo, 'an ordinary drag stopped committing').toBe(true);
    focusedHistory()!.undo();
    expect(bothActs().act1, 'and the one command must undo the whole gesture')
      .toEqual({ x: 64, y: 64 });
  });

  it('the switch ALONE puts the live writes back, with no pointer event', async () => {
    // The load-bearing half, and the one nothing else in the suite can see: the
    // act-switch effect. Without it the object stays at the dragged coordinates
    // with no command — silent data loss — until something else writes.
    const s = await dragInFlight();
    switchActAndSettle(s, 'act2');
    expect(bothActs().act1, 'act1 kept the uncommitted drag after the act changed')
      .toEqual({ x: 64, y: 64 });
    expect(bothActs().act2, 'and act2 must not have been touched at all')
      .toEqual({ x: 600, y: 400 });
    expect(focusedHistory()?.canUndo ?? false, 'a cancelled gesture writes no command')
      .toBe(false);
  });

  it('says why, once, rather than reverting silently', async () => {
    // A revert the author cannot see is indistinguishable from the editor losing
    // the edit. The notice is built at the one place that cancels.
    useToastStore.setState({ toasts: [] });
    const s = await dragInFlight();
    switchActAndSettle(s, 'act2');
    const said = useToastStore.getState().toasts.map((t) => t.message).join(' | ');
    expect(said, 'the cancellation was silent').toContain('the act changed under it');
  });

  it('a mousemove after the switch writes into neither act', async () => {
    // The first half of the measured damage: once per mousemove the NEW act's
    // object took the cursor's coordinates, with no command at all.
    const s = await dragInFlight();
    const held = switchActHoldingReact(s, 'act2');
    held.onMouseMove(mouse(300, 300));
    expect(bothActs(),
      'with the act-switch effect held back, the guard at the top of handleMouseMove is '
      + 'the only thing standing between this move and the document: act1\'s '
      + 'uncommitted drag stays in the file if it is gone')
      .toEqual({ act1: { x: 64, y: 64 }, act2: { x: 600, y: 400 } });
  });

  it('a release after the switch commits nothing to either act', async () => {
    // The second half, and the worse one: the release wrote act A's START
    // coordinates into act B's object through a real move command, which landed on
    // the undo stack under "Move object" and lost act A's move as well.
    const s = await dragInFlight();
    switchActHoldingReact(s, 'act2');
    // The window mouseup listener was captured when its effect attached, so
    // dispatching it reads no tree and lets no effect run: the guard at the top of
    // `finishGesture` is on its own here, which is the arm a new call site to a
    // commit cannot defeat.
    win!.dispatch('mouseup', {});
    expect(focusedHistory()?.canUndo ?? false, 'a move command was committed after the switch')
      .toBe(false);
    expect(bothActs()).toEqual({ act1: { x: 64, y: 64 }, act2: { x: 600, y: 400 } });
  });

  it('and the act it went back to still has an undoable history of its own', async () => {
    // The cancellation must not have poisoned act1's stack: coming back and
    // dragging again is one clean command.
    const s = await dragInFlight();
    switchActAndSettle(s, 'act2');
    switchActAndSettle(s, 'act1');
    s.on().onMouseDown(mouse(64, 64));
    s.on().onMouseMove(mouse(80, 80));
    win!.dispatch('mouseup', {});
    expect(bothActs().act1).toEqual({ x: 80, y: 80 });
    expect(focusedHistory()!.canUndo).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX: UNMOUNT-DISCARDS-STROKE (lens sweep; landed db50962b)
//
// A gesture writes into the document live and becomes ONE command on release. The
// release arrived by two routes, both pointer events: the container's own mouseup
// and a window mouseup for a button that came up outside. A FACET SWITCH IS
// NEITHER — `LevelWorkspace` renders the facet's module as `<Canvas />`, so a tab
// switch that changes facet changes the component TYPE and unmounts MapViewport
// mid-gesture. The window-mouseup effect's cleanup removed its listeners and
// never committed, so the edit sat in the section with no command and no undo
// entry.
//
// `map-teardown.test.ts` asserts the cleanup's TEXT, including that its dep list
// is empty. What a scan cannot reach is whether unmounting the real component
// runs it — a scan passes on an effect that is present and never fires.
// ══════════════════════════════════════════════════════════════════════════════

describe('an unmount is a release', () => {
  it('commits the gesture in flight, exactly once', async () => {
    const s = await mountMap();
    s.on().onMouseDown(mouse(64, 64));
    s.on().onMouseMove(mouse(120, 120));
    expect(bothActs().act1, 'the premise: the write is already in the document')
      .toEqual({ x: 120, y: 120 });
    expect(focusedHistory()?.canUndo ?? false).toBe(false);

    s.h.unmount();
    mounted = null;

    expect(focusedHistory()!.canUndo,
      'the unmount discarded the gesture: the edit is in the section with no command')
      .toBe(true);
    focusedHistory()!.undo();
    expect(bothActs().act1, 'and the command it wrote must undo the whole gesture')
      .toEqual({ x: 64, y: 64 });
  });

  it('CONTROL: an unmount with nothing in flight commits nothing', async () => {
    // "Commit on every teardown" is the wrong rule. This is the row that would
    // catch it being applied where there is no gesture.
    const s = await mountMap();
    s.h.unmount();
    mounted = null;
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
  });

  it('CONTROL: leaving the viewport is a PAUSE, not a commit', async () => {
    // The other over-application, and the one `map-teardown` names: a drag that
    // crosses the edge and comes back is ONE gesture. Committing on mouseleave is
    // the discarded-drag defect running in reverse.
    const s = await mountMap();
    s.on().onMouseDown(mouse(64, 64));
    s.on().onMouseMove(mouse(120, 120));
    s.on().onMouseLeave(mouse(700, 700));
    expect(focusedHistory()?.canUndo ?? false, 'mouseleave committed the gesture').toBe(false);
    // …and the gesture is still live, so the release outside still commits it.
    win!.dispatch('mouseup', {});
    expect(focusedHistory()!.canUndo, 'mouseleave threw the gesture away').toBe(true);
    expect(bothActs().act1).toEqual({ x: 120, y: 120 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX: WHEEL-PREVENTDEFAULT-DEAD (lens sweep; landed e8c41b29)
//
// React registers root `wheel` listeners as PASSIVE, so `preventDefault` in an
// `onWheel` prop is a no-op and the browser's own ctrl+wheel page zoom runs
// anyway — a wheel gesture over the map zoomed the whole application window. The
// repo had already ruled on this (`art-shared/use-anchored-zoom.ts:11-12`) and
// the fix attaches a native `{ passive: false }` listener through
// `use-attached-effect.ts`, because a `useEffect(..., [])` that early-returns on a
// null ref never runs again for a conditionally mounted element.
//
// `map-surface-listeners.test.ts` asserts the source text of all of that. These
// rows assert the outcome: a listener actually ON the container element, which
// only the conditional-mount half delivers, and a wheel event that both suppresses
// the default and moves the zoom.
//
// NOT COVERED HERE, and stated rather than implied: that the real browser treats
// a React `onWheel` as passive. That is the browser fact the fix rests on and it
// is not observable in this suite.
// ══════════════════════════════════════════════════════════════════════════════

describe('the map\'s wheel gesture zooms the map, not the window', () => {
  it('is a listener on the container element itself', async () => {
    const s = await mountMap();
    expect(s.container().listenerCount('wheel'),
      'no native wheel listener: an onWheel prop would be passive and its preventDefault dead')
      .toBe(1);
  });

  it('suppresses the browser default and changes the zoom', async () => {
    const s = await mountMap();
    const before = useViewStore.getState().zoom;
    let prevented = false;
    const ran = s.container().dispatch('wheel', {
      deltaY: -100, clientX: 320, clientY: 240, ctrlKey: true,
      preventDefault: () => { prevented = true; },
    });
    expect(ran, 'nothing was listening on the container').toBe(1);
    expect(prevented, 'the browser\'s own ctrl+wheel page zoom was left to run').toBe(true);
    expect(useViewStore.getState().zoom, 'the map did not zoom').toBeGreaterThan(before);
  });

  it('zooms the other way on the other direction', async () => {
    const s = await mountMap();
    const before = useViewStore.getState().zoom;
    s.container().dispatch('wheel', {
      deltaY: 100, clientX: 320, clientY: 240, ctrlKey: false,
      preventDefault: () => undefined,
    });
    expect(useViewStore.getState().zoom).toBeLessThan(before);
  });

  it('takes the listener off the element on unmount', async () => {
    const s = await mountMap();
    s.h.unmount();
    mounted = null;
    expect(s.container().listenerCount('wheel'),
      'a container that is re-mounted would accumulate listeners').toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FIX: BG-STROKE-WRONG-ACT (lens sweep) — THE HALF THAT WAS HELD BY A SCAN.
//
// `map-surface-listeners.test.ts` asserts the SHAPE of all of this: that
// `paintBgTile` opens a stroke carrying `actKey`/`layout`/`doc`, that the
// continuity guard asks `bgStrokeStatus`, that `abandonStaleGestures` reads the
// stroke, that `revertBgStroke` writes through the plane the stroke HELD. A
// shape can be preserved while the behaviour inverts, and until these rows there
// was nothing in the suite that could tell.
//
// WHY THE FIXTURE HAD TO GROW TO GET HERE, stated because it is the reason this
// stayed a scan: `paintBgTile` returns at `worldToBgTile` without a loaded
// plane, so a BG row over the old fixture painted nothing and passed. The acts
// now carry `bgLayout`/`bgTiles` and the COMPONENT'S OWN `reloadBg` loads them.
//
// ⚠ ONE ARM OF THE SCAN IS NOT REACHABLE FROM HERE AND THAT SCAN ROW MUST STAY:
// the act check inside `endBgStroke`. `abandonStaleGestures` runs first on all
// three teardown routes and always reverts an act-moved BG stroke, so by
// construction no behavioural row can arrive at `endBgStroke` with a stale
// `actKey`. That guard is a consumer-side arm against a FUTURE call site, which
// is exactly the kind of claim only a scan can hold.
// ══════════════════════════════════════════════════════════════════════════════

describe('a background stroke is one command, and does not survive an act switch', () => {
  /** Arm the BG brush the way the Art panel does: the tile tool on the BG layer,
   *  with a pick that is a legal index into the fixture's four-tile blob. */
  function armBgBrush(pick = 2): void {
    useEditorStore.getState().setTool('paint-tile');
    useEditorStore.getState().setEditingLayer('bg');
    useEditorStore.getState().setSelectedBgTileIndex(pick);
  }

  /** The act's own BG plane, by reference — the array `resolveDisplayedBg`
   *  resolves as `source: 'act'` and `set-bg-tiles` reaches at commit time. */
  function plane(actId: string): Uint16Array {
    const act = useProjectStore.getState().project?.zones[0]?.acts.find((a) => a.id === actId);
    if (!act?.bgLayout) {
      throw new Error(`map-viewport-mounted: no bgLayout on ${actId}; the fixture moved`);
    }
    return act.bgLayout;
  }

  /** Which cells of `actId`'s plane are no longer at that act's fill value, with
   *  the words now in them. A stroke's whole footprint, as data. */
  function painted(actId: 'act1' | 'act2'): Array<[number, number]> {
    const fill = BG_FILL[actId];
    const out: Array<[number, number]> = [];
    plane(actId).forEach((w, i) => { if (w !== fill) out.push([i, w]); });
    return out;
  }

  beforeEach(() => { armBgBrush(); });

  it('HARNESS: the component loaded a plane, so a BG paint has somewhere to land', async () => {
    // The row every other row in this block depends on. Without a loaded plane
    // `worldToBgTile` answers null and `paintBgTile` returns before it writes —
    // which is not a failure, it is silence, and it is what made this half a scan.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    expect(painted('act1'),
      'nothing was painted: getBg() answered null and every row below is vacuous')
      .toHaveLength(1);
    // DERIVED, not pinned: the word must NAME THE PICKED TILE. A row pinning a
    // literal would still pass if the brush started writing somebody else's
    // index, which is the ROADMAP-item-47 defect in miniature.
    const [[index, word]] = painted('act1');
    expect(index, 'client (0,0) is world (0,0) is BG cell 0 under this viewport').toBe(0);
    expect(unpackNametableWord(word).tileIndex,
      'the painted word does not name the picked BG tile')
      .toBe(useEditorStore.getState().selectedBgTileIndex);
  });

  it('a drag paints live and lands exactly ONE command on release', async () => {
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    s.on().onMouseMove(mouse(16, 0));
    expect(painted('act1').map(([i]) => i),
      'the stroke must write LIVE: that is the premise the whole fix rests on')
      .toEqual([0, 1, 2]);
    expect(focusedHistory()?.canUndo ?? false,
      'a stroke must not commit per tile: 60 entries on a 200-deep stack for one drag')
      .toBe(false);

    win!.dispatch('mouseup', {});
    expect(focusedHistory()!.canUndo, 'the release committed nothing').toBe(true);
    focusedHistory()!.undo();
    expect(painted('act1'), 'one undo must take the whole gesture back').toHaveLength(0);
  });

  it('a stroke that crosses its own path undoes to BEFORE the gesture', async () => {
    // FIRST value wins. If the entry map took the LAST oldNt, re-painting a cell
    // inside one stroke would make its undo restore what the stroke itself put
    // there — a cell that never goes home, and no error anywhere.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    useEditorStore.getState().setSelectedBgTileIndex(3);
    s.on().onMouseMove(mouse(0, 0));
    expect(unpackNametableWord(plane('act1')[0]).tileIndex, 'the second pick did not land').toBe(3);
    win!.dispatch('mouseup', {});
    focusedHistory()!.undo();
    expect(plane('act1')[0], 'the cell came back as the stroke\'s own first write, not as it was')
      .toBe(BG_FILL.act1);
  });

  it('the act switching under the stroke puts every painted cell back', async () => {
    // THE FINDING. `set-bg-tiles` with a null `bgRef` resolves `level.act.bgLayout`
    // at COMMIT time, so a stroke that outlives its act writes into a plane nobody
    // painted. Nothing about the (source, bgRef) pair moves across this switch —
    // it is ('act', null) on both sides — which is why the witness had to carry
    // the act key and why a pair comparison could not see this at all.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    expect(painted('act1'), 'the premise: two cells are already in the document').toHaveLength(2);

    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders(), 'the component did not re-render on an act switch').toBeGreaterThan(before);

    expect(painted('act1'), 'act1 kept the uncommitted stroke after the act changed').toHaveLength(0);
    expect(painted('act2'), 'and act2\'s plane must not have been touched at all').toHaveLength(0);
    expect(focusedHistory()?.canUndo ?? false, 'a cancelled stroke writes no command').toBe(false);
  });

  it('says why it dropped the stroke, rather than reverting silently', async () => {
    useToastStore.setState({ toasts: [] });
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders()).toBeGreaterThan(before);
    const said = useToastStore.getState().toasts.map((t) => t.message).join(' | ');
    expect(said, 'the cancellation was silent').toContain('Cancelled a gesture in flight');
  });

  it('a paint after the switch writes into NEITHER plane', async () => {
    // The consumer-side arm, with React held back so the act-switch effect cannot
    // do this row's work inside its own sample window. The guard at the top of
    // `handleMouseMove` is on its own here.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    const held = { ...s.on() };   // captured BEFORE the switch: this read flushes
    focusAct('act2');             // …and nothing after it reads the tree
    held.onMouseMove(mouse(16, 0));
    expect(painted('act1'), 'act1\'s uncommitted paint stays in the file').toHaveLength(0);
    expect(painted('act2'), 'the cursor\'s cell was painted into the act that just opened')
      .toHaveLength(0);
  });

  it('CONTROL: the act it came back to still takes a clean stroke of its own', async () => {
    // "Drop every BG stroke" is the wrong rule, and a cancellation must not
    // poison the act's stack. Coming back and painting again is one command.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    focusAct('act2');
    s.h.renders();
    focusAct('act1');
    s.h.renders();
    s.on().onMouseDown(mouse(24, 0));
    win!.dispatch('mouseup', {});
    expect(painted('act1').map(([i]) => i)).toEqual([3]);
    expect(focusedHistory()!.canUndo).toBe(true);
    focusedHistory()!.undo();
    expect(painted('act1')).toHaveLength(0);
  });

  it('CONTROL: an unmount mid-stroke COMMITS it, the way a release does', async () => {
    // A facet switch unmounts this component mid-gesture; the BG stroke is a
    // carrier of the UNMOUNT-DISCARDS-STROKE fix too, and nothing measured that
    // fix on this carrier before.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
    s.h.unmount();
    mounted = null;
    expect(focusedHistory()!.canUndo,
      'the unmount discarded the stroke: the cells are in the plane with no command')
      .toBe(true);
    focusedHistory()!.undo();
    expect(painted('act1')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE KEYBOARD THE MAP LISTENS TO — arrows, zoom, Escape, and the two guards in
// front of all of them.
//
// NOT A FIX. This is the first block here that is coverage rather than
// regression: these are paths an author uses every minute and NOTHING in the
// suite ran them. `map-escape.test.ts` pins `resolveEscape`'s VERDICT as a pure
// function and says in its own header that "MapViewport's Escape branch is
// inside a React effect the node suite cannot reach" — that sentence is what
// these rows retire. A verdict nothing acts on is a passing test and a dead key.
//
// ⚠ THE CAMERA IS PARKED AWAY FROM ITS BOUND, DELIBERATELY. `viewStore.pan`
// clamps with `Math.max(0, …)`, so at the default vpX/vpY of 0 the Left and Up
// arrows are indistinguishable from a key that does nothing at all — a control
// standing exactly where the thing it is controlling for happens. Every
// direction row starts at PARKED and one row keeps the bound, labelled as the
// clamp row it is.
//
// ⚠ AND THE STEP IS NOT PINNED. A row asserting `vpX === 64` would be copied
// from the source it is checking. What is asserted instead is the PROPERTY: the
// two horizontal keys move the camera by equal and opposite amounts, and the
// same key moves it HALF AS FAR IN WORLD SPACE at zoom 2, which is
// `viewStore.pan`'s `dx / state.zoom` and is what makes an arrow key move a
// constant number of SCREEN pixels at every zoom.
// ══════════════════════════════════════════════════════════════════════════════

describe('the map\'s keyboard moves the camera, and two guards stop it', () => {
  /** Off the clamp, and off it far enough that a step in any direction stays off
   *  it. See the block header: 0 is the value `pan` saturates at. */
  const PARKED = { vpX: 256, vpY: 256, zoom: 1 };

  /** A keydown carrying a TARGET and a readable `preventDefault` — the two
   *  fields the shared `keydown` helper fixes at `null` and a no-op. */
  function key(k: string, over: Record<string, unknown> = {}) {
    let prevented = false;
    return {
      ...keydown(k),
      preventDefault: () => { prevented = true; },
      wasPrevented: () => prevented,
      ...over,
    };
  }

  const view = () => useViewStore.getState();

  beforeEach(() => { useViewStore.setState(PARKED); });

  it('the four arrows move the camera, each on its own axis and its own sign', async () => {
    await mountMap();
    const moves: Record<string, { x: number; y: number }> = {};
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      useViewStore.setState(PARKED);
      expect(win!.dispatch('keydown', key(k)), 'nothing was listening').toBe(1);
      moves[k] = { x: view().vpX - PARKED.vpX, y: view().vpY - PARKED.vpY };
    }
    // Opposite and equal, derived rather than pinned.
    expect(moves.ArrowLeft.x, 'Left did not move the camera at all').not.toBe(0);
    expect(moves.ArrowRight.x).toBe(-moves.ArrowLeft.x);
    expect(moves.ArrowUp.y, 'Up did not move the camera at all').not.toBe(0);
    expect(moves.ArrowDown.y).toBe(-moves.ArrowUp.y);
    // …and each key touches ONE axis. A handler that panned both would still
    // pass every equal-and-opposite assertion above.
    expect([moves.ArrowLeft.y, moves.ArrowRight.y], 'a horizontal key moved the camera vertically')
      .toEqual([0, 0]);
    expect([moves.ArrowUp.x, moves.ArrowDown.x], 'a vertical key moved the camera horizontally')
      .toEqual([0, 0]);
    // The direction the repo's own sign convention fixes: Right increases vpX.
    expect(moves.ArrowRight.x, 'Right must scroll the view towards larger world X')
      .toBeGreaterThan(0);
  });

  it('an arrow moves a constant SCREEN distance, so world distance halves at zoom 2', async () => {
    // `viewStore.pan` divides by zoom. Without that a key would jump twice as far
    // across the screen when zoomed in, which is the same class as the wheel
    // anchor bug and is invisible to a row that only tests zoom 1.
    await mountMap();
    useViewStore.setState({ ...PARKED, zoom: 1 });
    win!.dispatch('keydown', key('ArrowRight'));
    const atOne = view().vpX - PARKED.vpX;

    useViewStore.setState({ ...PARKED, zoom: 2 });
    win!.dispatch('keydown', key('ArrowRight'));
    const atTwo = view().vpX - PARKED.vpX;

    expect(atOne, 'the zoom-1 control moved nothing').toBeGreaterThan(0);
    expect(atTwo * 2, 'the pan ignored the zoom: an arrow key would jump twice as far on screen')
      .toBe(atOne);
  });

  it('CLAMP: the camera does not travel past the origin', async () => {
    // The bound the other rows deliberately avoid, asserted where it belongs.
    await mountMap();
    useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
    win!.dispatch('keydown', key('ArrowLeft'));
    win!.dispatch('keydown', key('ArrowUp'));
    expect([view().vpX, view().vpY], 'the camera went negative').toEqual([0, 0]);
  });

  it('the zoom keys zoom in, out, and home', async () => {
    await mountMap();
    win!.dispatch('keydown', key('='));
    const zoomedIn = view().zoom;
    expect(zoomedIn, '= did not zoom in').toBeGreaterThan(PARKED.zoom);

    // ⚠ A FLUSH, AND IT IS NOT HYGIENE. The keyboard effect closes over `zoom`
    // and lists it in its deps, so the registered handler holds the zoom AS OF
    // THE LAST RENDER. In the browser a keystroke is its own task and React has
    // re-rendered in between; here nothing re-renders unless asked, so two
    // dispatches in a row would both compute from the pre-press zoom and the
    // second would look like a dead key. That is an artefact of this harness and
    // NOT a finding — it is called out so a later reader does not file it as one.
    mounted!.setProps({});
    win!.dispatch('keydown', key('-'));
    expect(view().zoom, '- did not undo the zoom in').toBeLessThan(zoomedIn);

    mounted!.setProps({});
    useViewStore.setState({ ...PARKED, zoom: 4 });
    mounted!.setProps({});
    win!.dispatch('keydown', key('0'));
    expect(view().zoom, '0 must go home to 1:1, whatever the zoom was').toBe(1);
  });

  it('every key it acts on suppresses the browser default; one it ignores does not', async () => {
    // The map lives inside a scrolling shell: an arrow key the handler acts on
    // and does NOT swallow scrolls the pane as well as panning the camera.
    await mountMap();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '=', '-', '0']) {
      const e = key(k);
      win!.dispatch('keydown', e);
      expect(e.wasPrevented(), `${k} moved the camera without suppressing the default`).toBe(true);
    }
    // The control on the other side: a key with no branch must be left alone for
    // whatever else is listening. "preventDefault everything" is the wrong rule.
    const untouched = key('q');
    win!.dispatch('keydown', untouched);
    expect(untouched.wasPrevented(), 'an unbound key was swallowed anyway').toBe(false);
  });

  it('GUARD: typing in a text field does not drive the camera', async () => {
    // The reported symptom's exact shape: a map shortcut firing from inside the
    // command palette's search box. `isTypingTarget` is the shared rule
    // (shell/typing-target.ts) and this is the call site that has to honour it.
    await mountMap();
    const before = { ...view() };
    for (const target of [
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'TEXTAREA', type: '' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      win!.dispatch('keydown', key('ArrowRight', { target }));
      win!.dispatch('keydown', key('=', { target }));
    }
    expect([view().vpX, view().zoom],
      'a keystroke aimed at a text field moved the map underneath it')
      .toEqual([before.vpX, before.zoom]);

    // CONTROL, and it is the half that matters: the guard has to be a filter and
    // not an off switch. A range slider is an INPUT the shared rule deliberately
    // does NOT count as typing — it used to, and it swallowed every map key for
    // as long as a slider had focus.
    win!.dispatch('keydown', key('ArrowRight', { target: { tagName: 'INPUT', type: 'range' } }));
    expect(view().vpX, 'a focused slider is still swallowing the map\'s keys')
      .toBeGreaterThan(before.vpX);
  });

  it('GUARD: a sprite-doc tab owns the keyboard, and the map keeps its hands off', async () => {
    // The level pane is keep-alive (display:none) under a sprite or canvas tab,
    // so this window handler STAYS REGISTERED while another editor is on screen.
    // `levelKeysEnabled` is what stops it acting on a document nobody can see.
    await mountMap();
    const before = { ...view() };
    for (const activeId of ['doc:sprite:untitled', 'doc:canvas:scratch']) {
      useSessionStore.setState({ activeId });
      win!.dispatch('keydown', key('ArrowRight'));
      win!.dispatch('keydown', key('='));
    }
    expect([view().vpX, view().zoom], 'the hidden map pane acted on another editor\'s keystrokes')
      .toEqual([before.vpX, before.zoom]);

    // CONTROL: back on the level tab, the same key works. Without this the row
    // above would pass on a handler that had simply stopped being registered.
    focusAct('act1');
    win!.dispatch('keydown', key('ArrowRight'));
    expect(view().vpX).toBeGreaterThan(before.vpX);
  });

  it('Escape acts on the verdict: it drops a paste before a marquee', async () => {
    // `map-escape.test.ts` pins what `resolveEscape` ANSWERS. Nothing until now
    // could see whether the branch DOES anything with the answer — and its own
    // header says this effect was out of the node suite's reach. It is not.
    await mountMap();
    const ed = () => useEditorStore.getState();
    ed().setPasting(true);
    ed().setMarquee({ sectionIndex: 0, startCol: 0, startRow: 0, endCol: 1, endRow: 1 } as never);

    win!.dispatch('keydown', key('Escape'));
    expect(ed().pasting, 'Escape did not drop the paste').toBe(false);
    expect(ed().marquee, 'Escape took the marquee as well: the order is paste FIRST')
      .not.toBeNull();

    win!.dispatch('keydown', key('Escape'));
    expect(ed().marquee, 'the second Escape did not drop the marquee').toBeNull();
  });

  it('CONTROL: Escape with nothing to clear leaves the camera exactly where it was', async () => {
    // ⚠ THE CAMERA IS PARKED AWAY FROM ITS RESET VALUES, and it was not in this
    // row's first draft. At the default zoom of 1 this row could not fail: an
    // Escape branch that reset the view would call `setZoom(1)` on a view
    // already at 1, and the assertion agreed. Measured — an over-application
    // planted on the `case null` arm left all 42 rows GREEN. Off the reset
    // values the same plant reddens this row, which is the whole point of it.
    await mountMap();
    useViewStore.setState({ vpX: 320, vpY: 192, zoom: 2 });
    useEditorStore.getState().setPasting(false);
    useEditorStore.getState().setMarquee(null);
    const before = { ...view() };
    win!.dispatch('keydown', key('Escape'));
    expect(useEditorStore.getState().marquee).toBeNull();
    expect(useEditorStore.getState().pasting).toBe(false);
    expect([view().vpX, view().vpY, view().zoom], 'Escape moved the camera')
      .toEqual([before.vpX, before.vpY, before.zoom]);
  });

  // NOT COVERED HERE, and named rather than left implied: `resolveEscape`'s
  // third arm, the band lens, is gated on `inEffectsFacet()` — a facet this
  // fixture does not open. Its VERDICT is pinned in `map-escape.test.ts`; that
  // the branch acts on it is not, on this arm. Foreground follow-up.
});

// ══════════════════════════════════════════════════════════════════════════════
// THE FOREGROUND TILE STROKE — `recordPaint`, `endPaintStroke`,
// `revertPaintStroke`, and the fourth gesture carrier.
//
// COVERAGE, not regression. The most-used tool on this surface had nothing
// running it. `map-gesture-witness.test.ts` unit-tests the VERDICT function this
// carrier asks; nothing ran the carrier. Its three functions are separate code
// from the BG stroke's three — a different stroke ref, a different command
// (`set-tiles`), a different subject (the SECTION object, not the plane array) —
// so the BG rows above say nothing about them.
//
// THE SUBJECT IS THE SECTION OBJECT AND THAT IS THE WHOLE POINT. `recordPaint`
// spells it out: `sectionIndex` alone cannot see an act switch, because the same
// number resolves in the new act, so one command would carry two acts' cells
// with the other act's old values in it. The fixture's two acts each have a
// section at index 0, which is what poses that question.
// ══════════════════════════════════════════════════════════════════════════════

describe('a foreground tile stroke is one command, and is dropped by an act switch', () => {
  /** The section-0 nametable of `actId`, by reference. */
  function nt(actId: 'act1' | 'act2'): Uint16Array {
    const act = useProjectStore.getState().project?.zones[0]?.acts.find((a) => a.id === actId);
    const grid = act?.sections[0]?.tileGrid;
    if (!grid) throw new Error(`map-viewport-mounted: no tileGrid in ${actId}; the fixture moved`);
    return grid.nametable;
  }

  /** Which cells of `actId`'s foreground are off that act's fill, and to what. */
  function painted(actId: 'act1' | 'act2'): Array<[number, number]> {
    const fill = FG_FILL[actId];
    const out: Array<[number, number]> = [];
    nt(actId).forEach((w, i) => { if (w !== fill) out.push([i, w]); });
    return out;
  }

  beforeEach(() => {
    useEditorStore.getState().setTool('paint-tile');
    useEditorStore.getState().setEditingLayer('fg');
    useEditorStore.getState().setSelectedTileIndex(5);
  });

  it('HARNESS: a press paints the cell under the cursor, with the picked tile', async () => {
    // The liveness row. `worldToSectionTile` returns null off the section grid
    // and the branch returns before it writes — silence, not a failure.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    expect(painted('act1'), 'nothing was painted: the press never reached a section cell')
      .toHaveLength(1);
    const [[index, word]] = painted('act1');
    expect(index, 'client (0,0) is world (0,0) is section cell 0').toBe(0);
    // DERIVED: the word must name the PICKED tile, not a literal copied from here.
    expect(unpackNametableWord(word).tileIndex).toBe(useEditorStore.getState().selectedTileIndex);
  });

  it('a drag down a COLUMN writes every row, not just the first', async () => {
    // ⚠ THIS IS THE ROW THE OLD 64-WORD FIXTURE COULD NOT HAVE FAILED. Row 1 is
    // index `SECTION_TILES_WIDE` = 256, past the end of a 64-word array, and an
    // out-of-range typed-array store is DROPPED rather than thrown. The row
    // would have painted one cell, asserted three, and the fixture — not the
    // component — would have been the thing that failed.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(0, 8));
    s.on().onMouseMove(mouse(0, 16));
    expect(painted('act1').map(([i]) => i),
      'the stroke did not reach the rows below the first')
      .toEqual([0, SECTION_TILES_WIDE, SECTION_TILES_WIDE * 2]);
  });

  it('a drag paints live and lands exactly ONE command on release', async () => {
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    s.on().onMouseMove(mouse(16, 0));
    expect(painted('act1').map(([i]) => i)).toEqual([0, 1, 2]);
    expect(focusedHistory()?.canUndo ?? false,
      'a stroke must not commit per cell').toBe(false);

    win!.dispatch('mouseup', {});
    expect(focusedHistory()!.canUndo, 'the release committed nothing').toBe(true);
    focusedHistory()!.undo();
    expect(painted('act1'), 'one undo must take the whole stroke back').toHaveLength(0);
  });

  it('the act switching under the stroke puts every painted cell back', async () => {
    // THE CARRIER'S OWN HALF OF DRAG-SURVIVES-ACT-SWITCH. `set-tiles` names
    // `sectionIndex`, and index 0 exists in BOTH acts, so a stroke that outlived
    // its act would commit act1's cells and act1's old values against act2's
    // section — losing both acts' truth in one command.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    expect(painted('act1'), 'the premise: two cells are already in the document').toHaveLength(2);

    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders(), 'the component did not re-render on an act switch').toBeGreaterThan(before);

    expect(painted('act1'), 'act1 kept the uncommitted stroke after the act changed').toHaveLength(0);
    expect(painted('act2'), 'and act2\'s section must not have been touched').toHaveLength(0);
    expect(focusedHistory()?.canUndo ?? false, 'a cancelled stroke writes no command').toBe(false);
  });

  it('a paint after the switch writes into NEITHER section', async () => {
    // The consumer-side arm at the top of `handleMouseMove`, with React held
    // back so the act-switch effect cannot do this row's work for it. This is
    // the shape that caught the live `isPaintDragging` defect on the BG carrier.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    const held = { ...s.on() };
    focusAct('act2');
    held.onMouseMove(mouse(16, 0));
    expect(painted('act1'), 'act1\'s uncommitted paint stays in the file').toHaveLength(0);
    expect(painted('act2'), 'the cursor\'s cell was painted into the act that just opened')
      .toHaveLength(0);
  });

  it('CONTROL: an unmount mid-stroke COMMITS it, the way a release does', async () => {
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    s.on().onMouseMove(mouse(8, 0));
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
    s.h.unmount();
    mounted = null;
    expect(focusedHistory()!.canUndo, 'the unmount discarded the stroke').toBe(true);
    focusedHistory()!.undo();
    expect(painted('act1')).toHaveLength(0);
  });

  it('CONTROL: re-painting a cell with what is already there costs no undo entry', async () => {
    // The `oldNt !== newNt` guard at the top of the paint branch. Without it a
    // click on a cell that ALREADY carries the picked word would open a stroke
    // and land a command that undoes nothing — an entry the author has to press
    // Ctrl+Z through twice to get anywhere, which is worse than no entry at all.
    //
    // `EditHistory` exposes no depth, so the depth is MEASURED by undoing to the
    // floor and counting. That is also what makes the row able to fail: a
    // `canUndo` assertion alone reads `true` for one entry and for two.
    const s = await mountMap();
    s.on().onMouseDown(mouse(0, 0));
    win!.dispatch('mouseup', {});
    expect(painted('act1'), 'the first press did not paint, so this row measures nothing')
      .toHaveLength(1);
    const wordThere = nt('act1')[0];

    // The SAME cell, the SAME pick, a second whole press-and-release.
    s.on().onMouseDown(mouse(0, 0));
    win!.dispatch('mouseup', {});
    expect(nt('act1')[0], 'a no-op press changed the cell').toBe(wordThere);

    let depth = 0;
    while (focusedHistory()!.canUndo && depth < 10) { focusedHistory()!.undo(); depth++; }
    expect(depth, 'the no-op press put a second, empty command on the undo stack').toBe(1);
    expect(painted('act1'), 'and that one undo must leave the section as it started')
      .toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// map-coverage-3 STARTS HERE.
//
// Same harness, same rules: every row drives the component's REAL handlers over
// the real stores, and every row was shown red with a mutation applied on disk
// before it was trusted (the commit messages carry which mutation reddened
// which row). Expected values are derived from engine constants or from the
// rule a module states, never copied from the branch under test.
// ══════════════════════════════════════════════════════════════════════════════

/** Every row below resets the notices it reads, so a count is a count. */
function toastsMatching(fragment: string): string[] {
  return useToastStore.getState().toasts.map((t) => t.message).filter((m) => m.includes(fragment));
}

/** How many entries the focused undo stack holds, MEASURED by undoing to the
 *  floor: `EditHistory` exposes no depth, and `canUndo` reads `true` for one
 *  entry and for two. Leaves the document as it was before every entry. */
function undoDepth(): number {
  let depth = 0;
  while (focusedHistory()?.canUndo && depth < 20) { focusedHistory()!.undo(); depth++; }
  return depth;
}

// ── the BG override: a per-GAME document, bound to ONE act ─────────────────────
//
// `resolveDisplayedBg`'s FIRST arm. The override is on screen only on the act
// aeon's injector bakes it into (`actBindsBgOverride`, keyed on the act's
// `stripPath`), so the fixture binds act1 and leaves act2 unbound. An act
// switch therefore moves the displayed background from `override` to `act`,
// which is the event the two gestures below have to survive.

/** Rows the override's plane is tall. Four, so a stamp pressed on row 1 grows
 *  down without touching the plane's edge: the edge is a CLAMP, and a row
 *  whose gesture lands on a clamp cannot tell a dead move from a clipped one. */
const OV_ROWS = 4;
/** The band every stamp row picks: 2x2, four slots, column-major. */
const OV_BAND = { cols: 2, rows: 2 } as const;
/** The blob's length. The band's prefix is slots 0..3; 4 and 5 are static. */
const OV_TILES = 6;
/**
 * Every override cell's word before a gesture: a STATIC slot inside the blob,
 * past the band's prefix. So every stamped word differs from it, and
 * `OV_TILES - 1` (the LAST legal pick) differs from it too, which is what lets
 * the refusal be tested on BOTH sides of its bound rather than far past it.
 */
const OV_FILL = 4;

function overrideDoc(): BgOverrideDocument {
  const slots = OV_BAND.cols * OV_BAND.rows;
  return {
    layout: new Array<number>(BG_WIDTH * OV_ROWS).fill(OV_FILL),
    tiles: Array.from({ length: OV_TILES }, () => new Array<number>(64).fill(0)),
    anims: [{
      cols: OV_BAND.cols, rows: OV_BAND.rows, pattern_px: 8,
      phases: Array.from({ length: 8 }, () =>
        Array.from({ length: slots }, () => new Array<number>(64).fill(0))),
    }],
  };
}

/** Put `doc` on the project and make act1 the act it binds. act2 binds nothing. */
function bindOverride(doc: BgOverrideDocument): void {
  const project = useProjectStore.getState().project as unknown as {
    zones: Array<{ acts: Array<{ stripPath: string | null }> }>;
    bgOverride: unknown;
  };
  project.zones[0].acts[0].stripPath = BG_OVERRIDE_CONSUMER_OUT_DIR;
  project.zones[0].acts[1].stripPath = null;
  project.bgOverride = {
    path: 'editor_bg_override.json', doc, unreadable: null, loadedText: null, notices: [],
  };
}

/** Cells of the override DOCUMENT (the file that ships) off `OV_FILL`, with their words. */
function docPainted(doc: BgOverrideDocument): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  doc.layout.forEach((w, i) => { if (w !== OV_FILL) out.push([i, w]); });
  return out;
}

/**
 * The plane the RENDERER holds, which is the canvas's mirror of the document.
 *
 * ⚠ READ FROM `sectionRenderer.getBg()`, NOT THROUGH `bgOverrideDisplay`. That
 * function re-syncs the mirror FROM the document on every call ("any divergence
 * from the document loses"), so reading through it would erase exactly the
 * divergence a row about the two representations has to see.
 */
async function heldPlane(): Promise<Uint16Array> {
  const { sectionRenderer } = await import('../MapViewport');
  const bg = sectionRenderer.getBg();
  if (!bg) throw new Error('map-viewport-mounted: the renderer holds no BG plane; every override row is vacuous');
  return bg.nametable;
}

/** The act's OWN plane (`act.bgLayout`), for "the act that opened was not touched". */
function actPlane(actId: 'act1' | 'act2'): Uint16Array {
  const act = useProjectStore.getState().project?.zones[0]?.acts.find((a) => a.id === actId);
  if (!act?.bgLayout) throw new Error(`map-viewport-mounted: no bgLayout on ${actId}; the fixture moved`);
  return act.bgLayout;
}

/** A BG cell's client point under VIEWPORT at zoom 1 and camera 0: its centre. */
const bgCell = (col: number, row: number) => mouse(col * 8 + 4, row * 8 + 4);

// ══════════════════════════════════════════════════════════════════════════════
// THE BAND STAMP, the sixth gesture carrier (parcel J; `beginBandStampGesture`
// … `endBandStampGesture`).
//
// COVERAGE. `map-band-stamp.test.ts` drives the pure machine through a fake
// plane, and `map-gesture-witness.test.ts` scans that the carrier has a
// witness ref. Nothing ran the carrier: not the press, not the document it
// writes through, not its commit, and not its arm of `abandonStaleGestures`.
//
// ⚠ THE ROW SHAPE POINTED AT IT IS THE ONE THAT FOUND A LIVE DEFECT on the BG
// carrier: "a move after the switch writes into NEITHER", with React held back
// so the act-switch effect cannot do the row's work inside its own sample
// window. This carrier does NOT set `isPaintDragging`, so the specific hole
// found there (a flag left armed) has no twin here; what can survive a
// cancellation on THIS carrier is the gesture ref itself, and that is what the
// row's mutation plants.
//
// Expected words are DERIVED from the geometry `core/editing/band-stamp.ts`
// states (slot = slotBase + pc * rows + pr, column-major, phase origin at the
// press cell, attribute bits kept), with `slotBase` read off the document by
// the same walk the gesture uses. Not from the gesture's own output.
// ══════════════════════════════════════════════════════════════════════════════

describe('the band stamp writes the override through one writer, and is dropped by an act switch', () => {
  let doc: BgOverrideDocument;

  /** The word the stamp must put at (col,row) for a gesture anchored at `anchor`. */
  function stampWord(col: number, row: number, anchor: { col: number; row: number }): number {
    const slotBase = bandSlotBases(documentBands(doc))[0];
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const pc = mod(col - anchor.col, OV_BAND.cols);
    const pr = mod(row - anchor.row, OV_BAND.rows);
    const attrs = OV_FILL & ~LAYOUT_TILE_INDEX_MASK & 0xFFFF;
    return attrs | ((slotBase + pc * OV_BAND.rows + pr) & LAYOUT_TILE_INDEX_MASK);
  }
  const idx = (col: number, row: number) => row * BG_WIDTH + col;
  /** The press cell every row uses: off both plane edges, so nothing clips. */
  const PRESS = { col: 2, row: 1 };

  beforeEach(() => {
    doc = overrideDoc();
    bindOverride(doc);
    useToastStore.setState({ toasts: [] });
    useEditorStore.getState().setTool('stamp-band');
    useEditorStore.getState().setSelectedBgBand(0);
  });

  it('HARNESS: a press lays one whole pattern into the DOCUMENT and the canvas mirror alike', async () => {
    // The liveness row: without a bound override `beginBandStampGesture`
    // refuses and writes nothing, which is silence and not a failure.
    const s = await mountMap();
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    const expected: Array<[number, number]> = [];
    for (let r = 0; r < OV_BAND.rows; r++) {
      for (let c = 0; c < OV_BAND.cols; c++) {
        const col = PRESS.col + c, row = PRESS.row + r;
        expected.push([idx(col, row), stampWord(col, row, PRESS)]);
      }
    }
    expected.sort((a, b) => a[0] - b[0]);
    expect(docPainted(doc), 'the FILE did not take the pattern: an edit the ROM would never see')
      .toEqual(expected);
    const held = await heldPlane();
    expect(expected.map(([i]) => held[i]),
      'the canvas mirror disagrees with the file: the author would see one picture and ship another')
      .toEqual(expected.map(([, w]) => w));
  });

  it('a drag reshapes live, restores what it left, and lands exactly ONE command', async () => {
    const s = await mountMap();
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    // Along the press row: the rectangle becomes 4x1, so the pattern's second
    // row (laid by the press) LEAVES it and must go back to before the gesture.
    s.on().onMouseMove(bgCell(PRESS.col + 3, PRESS.row));
    const live = [0, 1, 2, 3].map((c) => [idx(PRESS.col + c, PRESS.row),
      stampWord(PRESS.col + c, PRESS.row, PRESS)] as [number, number]);
    expect(docPainted(doc), 'the stamp did not follow the cursor, or kept a cell it left')
      .toEqual(live);
    expect(focusedHistory()?.canUndo ?? false, 'a stamp must not commit per move').toBe(false);

    win!.dispatch('mouseup', {});
    expect(docPainted(doc), 'the release changed the words it committed').toEqual(live);
    expect(undoDepth(), 'the gesture must be ONE undo step').toBe(1);
    expect(docPainted(doc), 'and that one undo must restore every word').toHaveLength(0);
    const held = await heldPlane();
    expect(live.map(([i]) => held[i]), 'the undo restored the file and left the canvas painted')
      .toEqual(live.map(() => OV_FILL));
  });

  it('the act switching under the stamp puts every word back, writes no command, and says so', async () => {
    const s = await mountMap();
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    s.on().onMouseMove(bgCell(PRESS.col + 3, PRESS.row));
    expect(docPainted(doc).length, 'the premise: the stamp is already in the file').toBeGreaterThan(0);
    const act2Before = Array.from(actPlane('act2'));

    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders(), 'the component did not re-render on an act switch').toBeGreaterThan(before);

    expect(docPainted(doc), 'the override kept an uncommitted stamp after its act closed').toHaveLength(0);
    expect(Array.from(actPlane('act2')), 'and the act that opened must not have been touched')
      .toEqual(act2Before);
    expect(focusedHistory()?.canUndo ?? false, 'a cancelled stamp writes no command').toBe(false);
    expect(toastsMatching('no longer the one on screen'), 'the cancellation was silent').toHaveLength(1);
  });

  it('a move after the switch writes into NEITHER background', async () => {
    // React held back, so the guard at the top of `handleMouseMove` is on its
    // own. What must not survive the cancellation on this carrier is the
    // gesture REF: a stamp still armed would take this move and reshape itself
    // into a document that is no longer on screen.
    const s = await mountMap();
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    const act2Before = Array.from(actPlane('act2'));
    const held = { ...s.on() };   // captured BEFORE the switch: this read flushes
    focusAct('act2');             // ...and nothing after it reads the tree
    held.onMouseMove(bgCell(PRESS.col + 5, PRESS.row + 2));
    expect(docPainted(doc), 'the stamp reshaped into the override after its act closed')
      .toHaveLength(0);
    expect(Array.from(actPlane('act2')), 'the cursor\'s cells were written into the act that opened')
      .toEqual(act2Before);
  });

  it('refuses loudly with no band picked, and on an act the override does not bind', async () => {
    const s = await mountMap();
    useEditorStore.getState().setSelectedBgBand(null);
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    win!.dispatch('mouseup', {});
    expect(docPainted(doc), 'a stamp with no band wrote anyway').toHaveLength(0);
    expect(toastsMatching('Pick a band first'), 'the refusal was silent').toHaveLength(1);

    // The other refusal: the plane on screen is not the override at all.
    useToastStore.setState({ toasts: [] });
    useEditorStore.getState().setSelectedBgBand(0);
    focusAct('act2');
    s.h.renders();
    const act2Before = Array.from(actPlane('act2'));
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    win!.dispatch('mouseup', {});
    expect(Array.from(actPlane('act2')), 'slot indices were written into a plane with no bands')
      .toEqual(act2Before);
    expect(docPainted(doc), 'nor into the override, which is not on screen').toHaveLength(0);
    expect(toastsMatching('needs the act\'s BG override'), 'the second refusal was silent').toHaveLength(1);
    expect(focusedHistory()?.canUndo ?? false, 'a refusal is not an undo entry').toBe(false);
  });

  it('says the refusal again on the NEXT press, not once per session', async () => {
    // "Once per gesture" is the rule (bgRefusalShown); a flag that was never
    // cleared would make the second attempt a silent dead tool.
    const s = await mountMap();
    useEditorStore.getState().setSelectedBgBand(null);
    for (let i = 0; i < 2; i++) {
      s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
      win!.dispatch('mouseup', {});
    }
    expect(toastsMatching('Pick a band first'), 'the second press said nothing').toHaveLength(2);
  });

  it('CONTROL: an unmount mid-stamp COMMITS it, the way a release does', async () => {
    const s = await mountMap();
    s.on().onMouseDown(bgCell(PRESS.col, PRESS.row));
    s.on().onMouseMove(bgCell(PRESS.col + 3, PRESS.row));
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
    s.h.unmount();
    mounted = null;
    expect(focusedHistory()?.canUndo ?? false,
      'the unmount discarded the stamp: the words are in the file with no command').toBe(true);
    focusedHistory()!.undo();
    expect(docPainted(doc)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE BG OVERRIDE ARM OF `paintBgTile`: the out-of-blob refusal and its toast.
//
// map-coverage-2 built the `act` arm. This is the `override` arm, and it is the
// one arm with a REFUSAL in it: a word's low bits index the blob the ROM bakes,
// the override's blob is only as long as the document says, and an index past
// its end bakes cleanly and ships whatever art sits at that VRAM slot. The code
// says there is no honest clamp, so the cell is left alone and the reason goes
// on screen, ONCE per gesture.
//
// ⚠ THE BOUND IS TESTED ON BOTH SIDES. The control paints `OV_TILES - 1`, the
// last legal pick, and the refusal rows pick `OV_TILES`, the first illegal one.
// A refusal row picking far past the end would pass on an off-by-one bound.
// ══════════════════════════════════════════════════════════════════════════════

describe('a BG stroke on the override refuses a tile outside the blob, and says so once', () => {
  let doc: BgOverrideDocument;
  const LAST_LEGAL = OV_TILES - 1;
  const FIRST_ILLEGAL = OV_TILES;

  beforeEach(() => {
    doc = overrideDoc();
    bindOverride(doc);
    useToastStore.setState({ toasts: [] });
    useEditorStore.getState().setTool('paint-tile');
    useEditorStore.getState().setEditingLayer('bg');
  });

  it('CONTROL: the last legal pick paints the FILE and the mirror, as one command', async () => {
    useEditorStore.getState().setSelectedBgTileIndex(LAST_LEGAL);
    const s = await mountMap();
    s.on().onMouseDown(bgCell(2, 1));
    s.on().onMouseMove(bgCell(3, 1));
    const cells = [BG_WIDTH + 2, BG_WIDTH + 3];
    expect(docPainted(doc).map(([i]) => i), 'the file did not take the stroke').toEqual(cells);
    for (const [, w] of docPainted(doc)) {
      expect(unpackNametableWord(w).tileIndex, 'the painted word does not name the pick').toBe(LAST_LEGAL);
    }
    const held = await heldPlane();
    expect(cells.map((i) => held[i]), 'the mirror disagrees with the file')
      .toEqual(cells.map((i) => doc.layout[i]));
    expect(toastsMatching('outside this background'), 'a legal pick was refused').toHaveLength(0);

    win!.dispatch('mouseup', {});
    expect(undoDepth(), 'the stroke must be ONE undo step').toBe(1);
    expect(docPainted(doc), 'and its undo must restore the file').toHaveLength(0);
  });

  it('a pick past the blob\'s end paints nothing, commits nothing, and names the blob', async () => {
    useEditorStore.getState().setSelectedBgTileIndex(FIRST_ILLEGAL);
    const s = await mountMap();
    const heldBefore = Array.from(await heldPlane());
    s.on().onMouseDown(bgCell(2, 1));
    s.on().onMouseMove(bgCell(3, 1));
    win!.dispatch('mouseup', {});
    expect(docPainted(doc), 'an out-of-blob index was written into the file').toHaveLength(0);
    expect(Array.from(await heldPlane()), 'or into the mirror').toEqual(heldBefore);
    expect(focusedHistory()?.canUndo ?? false, 'a refusal is not an undo entry').toBe(false);
    const said = toastsMatching('outside this background');
    expect(said, 'the refusal was silent').toHaveLength(1);
    expect(said[0], 'the notice must name the pick').toContain(`Tile ${FIRST_ILLEGAL} `);
    expect(said[0], 'and the blob\'s real length, from the document').toContain(`${OV_TILES}-tile`);
  });

  it('a drag across several cells with a refused pick says it ONCE', async () => {
    // One per gesture, not one per cell: a sixty-cell drag would otherwise bury
    // the author in sixty copies of the same sentence.
    useEditorStore.getState().setSelectedBgTileIndex(FIRST_ILLEGAL);
    const s = await mountMap();
    s.on().onMouseDown(bgCell(2, 1));
    s.on().onMouseMove(bgCell(3, 1));
    s.on().onMouseMove(bgCell(4, 1));
    s.on().onMouseMove(bgCell(5, 1));
    expect(toastsMatching('outside this background'), 'the refusal repeated per cell').toHaveLength(1);
  });

  it('and says it again on the NEXT gesture, not once per session', async () => {
    useEditorStore.getState().setSelectedBgTileIndex(FIRST_ILLEGAL);
    const s = await mountMap();
    for (let i = 0; i < 2; i++) {
      s.on().onMouseDown(bgCell(2, 1));
      s.on().onMouseMove(bgCell(3, 1));
      win!.dispatch('mouseup', {});
    }
    expect(toastsMatching('outside this background'), 'the second gesture was refused silently')
      .toHaveLength(2);
  });

  it('the act switching under an override stroke puts back the FILE, not only the canvas', async () => {
    // `revertBgStroke`'s document arm. The override has two representations of
    // one fact, and a revert through the mirror alone would leave the file
    // carrying words nobody committed: on screen it looks undone, on disk it
    // ships.
    useEditorStore.getState().setSelectedBgTileIndex(LAST_LEGAL);
    const s = await mountMap();
    s.on().onMouseDown(bgCell(2, 1));
    s.on().onMouseMove(bgCell(3, 1));
    expect(docPainted(doc), 'the premise: two cells are in the file').toHaveLength(2);
    const act2Before = Array.from(actPlane('act2'));
    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders()).toBeGreaterThan(before);
    expect(docPainted(doc), 'the FILE kept the uncommitted stroke').toHaveLength(0);
    expect(Array.from(actPlane('act2')), 'and the act that opened was painted').toEqual(act2Before);
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
  });
});

// ── the foreground and collision planes, per act, for the blocks below ────────
//
// ⚠ BOTH COLLISION PLANES ARE SIZED FROM `SECTION_PLANE_WORDS`, the engine
// constant, for the reason the nametable is: an out-of-range typed-array store
// is DROPPED, not thrown, and a row painting past an under-sized plane would
// watch nothing happen. The fills are per act AND per plane, so a write into the
// wrong act or the wrong plane is a wrong VALUE and not merely a wrong array.

const COLL_SHAPE = { act1: { a: 1, b: 2 }, act2: { a: 3, b: 4 } } as const;
const collWord = (shape: number): number =>
  packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' });

function sectionOf(actId: 'act1' | 'act2'): Section {
  const act = useProjectStore.getState().project?.zones[0]?.acts.find((a) => a.id === actId);
  const sec = act?.sections[0];
  if (!sec) throw new Error(`map-viewport-mounted: no section 0 in ${actId}; the fixture moved`);
  return sec;
}

function seedCollision(): void {
  for (const actId of ['act1', 'act2'] as const) {
    const sec = sectionOf(actId);
    sec.collisionEdit = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(COLL_SHAPE[actId].a));
    sec.collisionEditB = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(COLL_SHAPE[actId].b));
  }
}

function collPlane(actId: 'act1' | 'act2', plane: 'a' | 'b'): Uint16Array {
  const sec = sectionOf(actId);
  const words = plane === 'a' ? sec.collisionEdit : sec.collisionEditB;
  if (!words) throw new Error(`map-viewport-mounted: plane ${plane} of ${actId} is unseeded`);
  return words;
}

/** Cells of a collision plane off that act's and that plane's fill. */
function collPainted(actId: 'act1' | 'act2', plane: 'a' | 'b'): Array<[number, number]> {
  const fill = collWord(COLL_SHAPE[actId][plane]);
  const out: Array<[number, number]> = [];
  collPlane(actId, plane).forEach((w, i) => { if (w !== fill) out.push([i, w]); });
  return out;
}

/** Cells of the FOREGROUND nametable off that act's fill. */
function fgPainted(actId: 'act1' | 'act2'): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  sectionOf(actId).tileGrid.nametable.forEach((w, i) => { if (w !== FG_FILL[actId]) out.push([i, w]); });
  return out;
}

/** The four 8px sub-tile indices of the 16px collision cell (cc, cr), ascending. */
const cellSubTiles = (cc: number, cr: number): number[] =>
  [0, 1].flatMap((dr) => [0, 1].map((dc) => (2 * cr + dr) * SECTION_TILES_WIDE + 2 * cc + dc))
    .sort((a, b) => a - b);

/** The client point at the centre of the 8px tile (col,row) under VIEWPORT, zoom 1, camera 0. */
const tileAt = (col: number, row: number, over: Record<string, unknown> = {}) =>
  mouse(col * 8 + 4, row * 8 + 4, over);
/** The client point inside the 16px collision cell (cc,cr), on its top-left tile. */
const collCell = (cc: number, cr: number, over: Record<string, unknown> = {}) =>
  mouse(cc * 16 + 4, cr * 16 + 4, over);

// ══════════════════════════════════════════════════════════════════════════════
// COLLISION PAINT (`paintCollisionCell`), including the both-planes stroke.
//
// COVERAGE. The collision brush shares `recordPaint` / `endPaintStroke` /
// `revertPaintStroke` with the FG stroke, but it is a different KIND of stroke
// with a different command and, in both-planes mode, a SECOND entry map
// (`otherEntries`) that nothing on the FG carrier exercises. Four things here
// are collision-only: the aimed plane, the both-planes write, the mode being
// LATCHED at the press, and the section being claimed at the press even when
// the click changes nothing (CollisionPalette's Reset and Clear act on that
// index).
// ══════════════════════════════════════════════════════════════════════════════

describe('a collision stroke is one command on one or both planes, and is dropped by an act switch', () => {
  /** A shape no fixture plane carries, so every write is a visible change. */
  const PICK = 9;

  beforeEach(() => {
    seedCollision();
    useToastStore.setState({ toasts: [] });
    const ed = useEditorStore.getState();
    ed.setTool('paint-collision');
    ed.setSelectedCollisionProfile(PICK);
    ed.setSelectedCollisionSolidity('all');
    ed.setCollisionPaintPlane('a');
    ed.setCollisionPaintBothPlanes(false);
    ed.setCollisionBrushSize(1);
  });

  afterEach(() => {
    // Arming both-planes turns a lens on as a side effect; it is view state
    // that outlives this block and nothing else here should inherit it.
    useViewStore.getState().setOverlay('showSolidBothPlanes', false);
    useEditorStore.getState().setCollisionPaintBothPlanes(false);
  });

  const shapes = (cells: Array<[number, number]>) => cells.map(([, w]) => unpackCollisionCell(w).shape);

  it('HARNESS: a press paints the 16px cell under the cursor, four sub-tiles, with the picked shape', async () => {
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    expect(collPainted('act1', 'a').map(([i]) => i),
      'nothing was painted: the press never reached a collision cell').toEqual(cellSubTiles(1, 1));
    // DERIVED from the store, not a literal: the painted words must carry the pick.
    expect(shapes(collPainted('act1', 'a')), 'the stroke wrote a shape nobody picked')
      .toEqual(cellSubTiles(1, 1).map(() => useEditorStore.getState().selectedCollisionProfile));
    expect(collPainted('act1', 'b'), 'a plane-A stroke wrote plane B').toHaveLength(0);
  });

  it('a drag paints live and lands exactly ONE command on release', async () => {
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    s.on().onMouseMove(collCell(2, 1));
    s.on().onMouseMove(collCell(3, 1));
    const cells = [...cellSubTiles(1, 1), ...cellSubTiles(2, 1), ...cellSubTiles(3, 1)].sort((a, b) => a - b);
    expect(collPainted('act1', 'a').map(([i]) => i), 'the drag did not paint every cell it crossed')
      .toEqual(cells);
    expect(focusedHistory()?.canUndo ?? false, 'a collision stroke must not commit per cell').toBe(false);
    win!.dispatch('mouseup', {});
    expect(undoDepth(), 'the stroke must be ONE undo step').toBe(1);
    expect(collPainted('act1', 'a'), 'and that one undo must take the whole stroke back').toHaveLength(0);
  });

  it('BOTH PLANES: one stroke writes A and B, and one undo takes BOTH back', async () => {
    // The half-finished second plane is what this brush exists to prevent, so
    // undoing it must not leave geometry on one plane either.
    useEditorStore.getState().setCollisionPaintBothPlanes(true);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    s.on().onMouseMove(collCell(2, 1));
    const cells = [...cellSubTiles(1, 1), ...cellSubTiles(2, 1)].sort((a, b) => a - b);
    expect(collPainted('act1', 'a').map(([i]) => i), 'plane A missed the stroke').toEqual(cells);
    expect(collPainted('act1', 'b').map(([i]) => i), 'plane B missed the stroke').toEqual(cells);
    expect(shapes(collPainted('act1', 'b')), 'plane B took a shape nobody picked')
      .toEqual(cells.map(() => PICK));
    win!.dispatch('mouseup', {});
    expect(undoDepth(), 'a both-planes stroke must still be ONE undo step').toBe(1);
    expect([collPainted('act1', 'a'), collPainted('act1', 'b')],
      'the undo left geometry on one plane').toEqual([[], []]);
  });

  it('the both-planes mode is LATCHED at the press: toggling it mid-drag does not split the stroke', async () => {
    useEditorStore.getState().setCollisionPaintBothPlanes(true);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    useEditorStore.getState().setCollisionPaintBothPlanes(false);
    s.on().onMouseMove(collCell(2, 1));
    expect(collPainted('act1', 'b').map(([i]) => i),
      'the chip toggled mid-drag switched one gesture between one plane and two')
      .toEqual([...cellSubTiles(1, 1), ...cellSubTiles(2, 1)].sort((a, b) => a - b));
  });

  it('the aimed plane is the one written: plane B, and not A', async () => {
    useEditorStore.getState().setCollisionPaintPlane('b');
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    expect(collPainted('act1', 'b').map(([i]) => i), 'plane B was aimed at and not written')
      .toEqual(cellSubTiles(1, 1));
    expect(collPainted('act1', 'a'), 'plane A was written instead').toHaveLength(0);
  });

  it('the act switching under a both-planes stroke puts BOTH planes back, and writes no command', async () => {
    useEditorStore.getState().setCollisionPaintBothPlanes(true);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    s.on().onMouseMove(collCell(2, 1));
    expect(collPainted('act1', 'b').length, 'the premise: plane B is already painted').toBeGreaterThan(0);
    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders(), 'the component did not re-render on an act switch').toBeGreaterThan(before);
    expect(collPainted('act1', 'a'), 'plane A kept the uncommitted stroke').toHaveLength(0);
    expect(collPainted('act1', 'b'), 'plane B kept it: the other-plane half was not reverted').toHaveLength(0);
    expect([collPainted('act2', 'a'), collPainted('act2', 'b')], 'the act that opened was written')
      .toEqual([[], []]);
    expect(focusedHistory()?.canUndo ?? false, 'a cancelled stroke writes no command').toBe(false);
    expect(toastsMatching('Cancelled a gesture in flight'), 'the cancellation was silent').toHaveLength(1);
  });

  it('a paint after the switch writes into NEITHER act\'s collision', async () => {
    // The row shape that found the live defect on the BG carrier, on this one:
    // React held back, the guard at the top of `handleMouseMove` on its own.
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    const held = { ...s.on() };   // captured BEFORE the switch: this read flushes
    focusAct('act2');             // ...and nothing after it reads the tree
    held.onMouseMove(collCell(3, 1));
    expect(collPainted('act1', 'a'), 'act1\'s uncommitted collision stays in the file').toHaveLength(0);
    expect(collPainted('act2', 'a'), 'the cursor\'s cell was painted into the act that just opened')
      .toHaveLength(0);
  });

  it('a press claims its section even when it changes nothing, and costs no undo entry', async () => {
    // CollisionPalette's Reset and Clear are keyed on `activeSectionIndex`, and
    // the success path's claim sits behind four early returns. A click that
    // changed nothing used to leave the index on whatever another tool touched.
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    win!.dispatch('mouseup', {});
    expect(collPainted('act1', 'a'), 'the first press did not paint, so this row measures nothing')
      .toHaveLength(4);
    useEditorStore.getState().setActiveSectionIndex(7);   // "another tool was last here"
    s.on().onMouseDown(collCell(1, 1));                   // the SAME cell, the SAME shape
    win!.dispatch('mouseup', {});
    expect(useEditorStore.getState().activeSectionIndex,
      'a no-op press left the palette\'s destructive buttons aimed at another section').toBe(0);
    expect(undoDepth(), 'the no-op press put an empty command on the undo stack').toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE MARQUEE DRAG AND ITS SNAP (`applyMarqueeSnap`, the Ctrl/Cmd modifier).
//
// COVERAGE. `map-clipboard` pins `snapMarquee` and `effectiveGranularity` as
// pure functions. Nothing drove the drag that calls them: which tile is the
// start, whether the pointer event's own modifier bit is read, whether a Ctrl
// TAP with the hand held still re-snaps (the reason `marqueeDragLast` exists),
// whether a blur un-sticks it, and the marquee's arm of `abandonStaleGestures`.
//
// Expected rects come from `snapMarquee` with the granularity the RULE says is
// in force (`effectiveGranularity`), not from the component's output. The two
// granularities are asserted to DIFFER at the chosen corners first: at corners
// where block and tile agree, every modifier row below would be vacuous.
// ══════════════════════════════════════════════════════════════════════════════

describe('a marquee drag snaps from its start tile, follows the modifier live, and is dropped by an act switch', () => {
  const START = { col: 3, row: 3 };
  const END = { col: 6, row: 4 };
  const rect = (a: { col: number; row: number }, b: { col: number; row: number }, invert: boolean) =>
    ({ sectionIndex: 0, ...snapMarquee(a.col, a.row, b.col, b.row, effectiveGranularity('block', invert)) });
  const marquee = () => useEditorStore.getState().marquee;
  const ctrl = (type: 'keydown' | 'keyup', down: boolean) =>
    ({ ...keydown('Control', { ctrlKey: down }), type });

  beforeEach(() => {
    const ed = useEditorStore.getState();
    ed.setTool('marquee');
    ed.setMarqueeGranularity('block');
    ed.setMarqueeSnapInvert(false);
    ed.setMarquee(null);
  });

  it('ANTI-VACUOUS: block and tile snapping disagree at these corners', () => {
    expect(rect(START, END, false), 'the modifier rows below could not tell the modes apart')
      .not.toEqual(rect(START, END, true));
  });

  it('a drag sets the rect from the START tile to the cursor, snapped to blocks', async () => {
    const s = await mountMap();
    s.on().onMouseDown(tileAt(START.col, START.row));
    expect(marquee(), 'a press is already a (one-block) marquee').toEqual(rect(START, START, false));
    s.on().onMouseMove(tileAt(END.col, END.row));
    expect(marquee(), 'the drag did not resolve from its start tile to the cursor').toEqual(rect(START, END, false));
  });

  it('Ctrl on the pointer event inverts the snap, and the panel is told', async () => {
    const s = await mountMap();
    s.on().onMouseDown(tileAt(START.col, START.row, { ctrlKey: true }));
    s.on().onMouseMove(tileAt(END.col, END.row, { ctrlKey: true }));
    expect(marquee(), 'the pointer\'s own modifier bit was not read').toEqual(rect(START, END, true));
    expect(useEditorStore.getState().marqueeSnapInvert, 'the panel would narrate the wrong mode').toBe(true);
  });

  it('a Ctrl TAP with the hand held still re-snaps at once, and letting go snaps back', async () => {
    // The reason `marqueeDragLast` exists: no mouse motion between the key and
    // the rect. Without it the panel and the rect disagree until a stray pixel.
    const s = await mountMap();
    s.on().onMouseDown(tileAt(START.col, START.row));
    s.on().onMouseMove(tileAt(END.col, END.row));
    expect(marquee()).toEqual(rect(START, END, false));
    expect(win!.dispatch('keydown', ctrl('keydown', true)), 'nothing was listening').toBeGreaterThan(0);
    expect(marquee(), 'the rect waited for the mouse to move before following the key')
      .toEqual(rect(START, END, true));
    win!.dispatch('keyup', ctrl('keyup', false));
    expect(marquee(), 'letting go of Ctrl did not snap back').toEqual(rect(START, END, false));
  });

  it('a window blur mid-chord un-sticks the modifier', async () => {
    // A window that loses focus with the key down never delivers the keyup.
    const s = await mountMap();
    s.on().onMouseDown(tileAt(START.col, START.row));
    s.on().onMouseMove(tileAt(END.col, END.row));
    win!.dispatch('keydown', ctrl('keydown', true));
    expect(marquee()).toEqual(rect(START, END, true));
    expect(win!.dispatch('blur', {}), 'nothing was listening for blur').toBeGreaterThan(0);
    expect(marquee(), 'the rect stayed inverted for a key no finger is holding').toEqual(rect(START, END, false));
    expect(useEditorStore.getState().marqueeSnapInvert).toBe(false);
  });

  it('a move after an act switch does not extend the marquee into the act that opened', async () => {
    // React held back: the marquee's arm of `abandonStaleGestures` alone. Its
    // start carries a SECTION INDEX, and index 0 resolves in both acts.
    //
    // The row asks ONE thing: did the move extend the drag into act2. Whether the
    // committed rect survives the switch is not this arm's job. editorStore's
    // scope subscription clears it at the switch itself (a store listener, which
    // holding React back does not hold back), and its rows are at the end of the
    // paste block. So the rect after the move is compared with the rect the move
    // WOULD write, not with the rect before it, which the subscription has
    // already taken away. (It was `toEqual(before)` while the clear was an effect
    // that a React-held-back row never let run.)
    const s = await mountMap();
    s.on().onMouseDown(tileAt(START.col, START.row));
    s.on().onMouseMove(tileAt(START.col + 1, START.row));
    const before = marquee();
    const cursor = { col: END.col + 10, row: END.row + 6 };
    const extended = rect(START, cursor, false);
    expect(before, 'the premise: a drag in flight with a rect on screen').not.toBeNull();
    expect(extended, 'ANTI-VACUOUS: the move would not have changed the rect').not.toEqual(before);
    const held = { ...s.on() };
    focusAct('act2');
    held.onMouseMove(tileAt(cursor.col, cursor.row));
    expect(marquee(), 'the drag kept extending after the act changed under it').not.toEqual(extended);
  });

  it('an act switch drops the committed marquee AND paste mode', async () => {
    // Pasting into the wrong act is the dangerous half: a clipboard armed in one
    // act must not commit into another on the next click.
    const s = await mountMap();
    useEditorStore.getState().setMarquee(rect(START, END, false));
    useEditorStore.getState().setPasting(true);
    const before = s.h.renders();
    focusAct('act2');
    expect(s.h.renders()).toBeGreaterThan(before);
    expect(marquee(), 'a marquee from the other act survived the switch').toBeNull();
    expect(useEditorStore.getState().pasting, 'paste mode survived the switch').toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PASTE MODE (the `pasting` branches of `handleMouseDown` / `handleMouseMove`).
//
// COVERAGE. `map-clipboard` pins `buildPasteCommand`, `pasteBaseStep` and
// `effectivePasteLayers` as pure functions; `map-escape` pins how Escape leaves
// the mode. Nothing drove the mode: the hover that decides WHERE, the click
// that commits, the modifiers that override the sticky layers for one click,
// the refusal, and the owner's report that a middle drag could not pan in it.
//
// Every hover is on an ODD tile, so the snap is doing work: an unsnapped paste
// would land one tile off, and at an even tile the two are indistinguishable.
// ══════════════════════════════════════════════════════════════════════════════

describe('paste mode commits at the hovered, snapped origin, and a middle drag still pans', () => {
  const CLIP_ART = [0x0033, 0x0034, 0x0035, 0x0036];
  const CLIP_SHAPE = { a: 7, b: 8 } as const;
  const HOVER = { col: 3, row: 3 };

  function clip(artOnly: boolean): MapClipboard {
    // The OPEN zone's own tile set, read at the call: these rows paste where
    // they copied, and a clipboard from any other tile set is refused
    // (PASTE-ACROSS-TILESETS, the nested block at the end of this one).
    const tileset = useProjectStore.getState().project?.zones[0]?.tileset;
    if (!tileset) throw new Error('map-viewport-mounted: the fixture has no zone tile set to copy from');
    return {
      widthTiles: 2, heightTiles: 2, nametable: Uint16Array.from(CLIP_ART),
      collisionA: artOnly ? new Uint16Array(0) : Uint16Array.of(collWord(CLIP_SHAPE.a)),
      collisionB: artOnly ? new Uint16Array(0) : Uint16Array.of(collWord(CLIP_SHAPE.b)),
      artOnly,
      tileset,
    };
  }
  /** The clipboard's art at `base`, as the [index, word] pairs the section must carry. */
  const artAt = (base: { col: number; row: number }): Array<[number, number]> =>
    [0, 1].flatMap((r) => [0, 1].map((c) =>
      [(base.row + r) * SECTION_TILES_WIDE + base.col + c, CLIP_ART[r * 2 + c]] as [number, number]))
      .sort((a, b) => a[0] - b[0]);

  /**
   * THE ONE `document` CALL PASTE MODE MAKES, and nothing else.
   *
   * With paste mode armed, the preview pass rasterises the clipboard into a
   * ghost through `regionPreviewCanvas` (canvas/region-preview.ts), which asks
   * `document.createElement('canvas')`, a 2D context, `createImageData` and
   * `putImageData`. This suite has no DOM, so every row here died with
   * `ReferenceError: document is not defined` the moment paste mode was armed
   * with the map mounted.
   *
   * Scoped to THIS block rather than added to `window-stub.ts`, whose header
   * refuses to grow into a DOM: it serves the one call, throws on any other
   * tag, refuses to shadow a real `document`, and is removed exactly. Nothing
   * paints and no row here asserts on the ghost's pixels; that would be a
   * drawing claim, and drawing claims are foreground-only.
   */
  let hadDocument = false;
  /** Canvases the stub has handed out since install. Only `regionPreviewCanvas`
   *  asks for one in this block, so it counts ghosts rasterised: the one fact
   *  about the ghost this suite can see without pixels. */
  let canvasesMade = 0;
  function installDocumentStub(): void {
    const g = globalThis as unknown as Record<string, unknown>;
    if (g.document !== undefined && g.document !== null) {
      throw new Error('map-viewport-mounted: a real `document` exists; this stub would shadow it');
    }
    hadDocument = 'document' in g;
    canvasesMade = 0;
    g.document = {
      createElement(tag: string) {
        if (tag !== 'canvas') {
          throw new Error(`map-viewport-mounted: document.createElement('${tag}') is not stubbed; `
            + 'a row reaching it is asking a DOM question this suite cannot answer');
        }
        canvasesMade++;
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            createImageData: (w: number, h: number) =>
              ({ width: w, height: h, data: new Uint8ClampedArray(4 * w * h) }),
            putImageData: () => undefined,
          }),
        };
      },
    };
  }
  function removeDocumentStub(): void {
    const g = globalThis as unknown as Record<string, unknown>;
    if (hadDocument) g.document = undefined;
    else delete g.document;
  }

  beforeEach(() => {
    installDocumentStub();
    seedCollision();
    useToastStore.setState({ toasts: [] });
    const ed = useEditorStore.getState();
    ed.setTool('select');          // any tool: paste outranks it. (setTool clears pasting.)
    ed.setMapClipboard(clip(false));
    ed.setPasteLayers('both');
  });

  afterEach(() => {
    useEditorStore.getState().setMapClipboard(null);
    removeDocumentStub();
  });

  /**
   * Mount the map, THEN arm paste mode, which is the order an author does it in.
   *
   * ⚠ THE FIRST DRAFT ARMED IT IN `beforeEach`, BEFORE THE MOUNT, AND EVERY ROW
   * IN THIS BLOCK WENT RED FOR A REASON THAT WAS NOT THE COMPONENT'S. The clear
   * of the marquee and paste mode on an act switch was then a `useEffect` keyed
   * on the open zone and act, and like every effect it also ran on the FIRST
   * render, so paste mode armed before the map existed was dropped by the mount.
   * That clear is now a store subscription that never fires on a mount
   * (MAP-REMOUNT-DROPS-PASTE; the nested block at the end of this one), so the
   * order no longer decides the outcome. It is kept because it is the app's.
   */
  async function mountPasting(): Promise<Surface> {
    const s = await mountMap();
    useEditorStore.getState().setPasting(true);
    return s;
  }

  it('a click pastes art and collision at the even-snapped origin, as ONE undo step, and stays armed', async () => {
    const s = await mountPasting();
    s.on().onMouseMove(tileAt(HOVER.col, HOVER.row));
    const e = tileAt(HOVER.col, HOVER.row);
    s.on().onMouseDown(e);
    // A clipboard with collision lands on the 16px grid: tile 3 floors to 2.
    const base = { col: 2, row: 2 };
    expect(fgPainted('act1'), 'the art did not land at the snapped origin').toEqual(artAt(base));
    const cell = cellSubTiles(base.col >> 1, base.row >> 1);
    expect(collPainted('act1', 'a'), 'plane A did not take the clipboard\'s cell')
      .toEqual(cell.map((i) => [i, collWord(CLIP_SHAPE.a)]));
    expect(collPainted('act1', 'b'), 'plane B did not take the clipboard\'s cell')
      .toEqual(cell.map((i) => [i, collWord(CLIP_SHAPE.b)]));
    expect(e.wasPrevented()).toBe(true);
    expect(useEditorStore.getState().pasting, 'a paste must stay armed for the next one').toBe(true);
    expect(undoDepth(), 'a paste must be ONE undo step').toBe(1);
    expect([fgPainted('act1'), collPainted('act1', 'a'), collPainted('act1', 'b')],
      'and its undo must take art AND collision back').toEqual([[], [], []]);
  });

  it('an ART-ONLY clipboard lands on any tile, not the 16px grid', async () => {
    useEditorStore.getState().setMapClipboard(clip(true));
    const s = await mountPasting();
    s.on().onMouseMove(tileAt(HOVER.col, HOVER.row));
    s.on().onMouseDown(tileAt(HOVER.col, HOVER.row));
    expect(fgPainted('act1'), 'a tile-granular selection was forced onto blocks').toEqual(artAt(HOVER));
    expect([collPainted('act1', 'a'), collPainted('act1', 'b')], 'an art-only paste wrote collision')
      .toEqual([[], []]);
  });

  it('Shift over an art-only clipboard refuses OUT LOUD and writes nothing', async () => {
    useEditorStore.getState().setMapClipboard(clip(true));
    const s = await mountPasting();
    s.on().onMouseMove(tileAt(HOVER.col, HOVER.row));
    const e = tileAt(HOVER.col, HOVER.row, { shiftKey: true });
    s.on().onMouseDown(e);
    expect(toastsMatching('carries no collision'), 'a click that did nothing said nothing').toHaveLength(1);
    expect(fgPainted('act1'), 'a collision-only paste wrote art').toHaveLength(0);
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
    expect(e.wasPrevented()).toBe(true);
  });

  it('Alt pastes the art alone for that one click, and the sticky setting survives', async () => {
    const s = await mountPasting();
    s.on().onMouseMove(tileAt(HOVER.col, HOVER.row));
    s.on().onMouseDown(tileAt(HOVER.col, HOVER.row, { altKey: true }));
    expect(fgPainted('act1'), 'Alt did not paste the art').toEqual(artAt({ col: 2, row: 2 }));
    expect([collPainted('act1', 'a'), collPainted('act1', 'b')], 'Alt pasted collision as well')
      .toEqual([[], []]);
    expect(useEditorStore.getState().pasteLayers, 'a one-click modifier rewrote the sticky setting')
      .toBe('both');
  });

  it('a middle-button drag pans the map in paste mode, and pastes nothing', async () => {
    // The owner's report (2026-08-28): the map froze for the whole of paste
    // mode. PARKED off the pan clamp at 0, so a pan in either direction shows.
    useViewStore.setState({ vpX: 256, vpY: 256, zoom: 1 });
    const s = await mountPasting();
    const middle = { button: 1, buttons: 4 };
    s.on().onMouseDown(mouse(300, 300, middle));
    s.on().onMouseMove(mouse(340, 330, middle));
    const { vpX, vpY } = useViewStore.getState();
    // The same sign convention the keyboard rows pin: the camera moves AGAINST
    // the hand, by the hand's distance at zoom 1 (`pan` divides by the zoom).
    expect([vpX, vpY], 'the middle drag did not move the camera in paste mode')
      .toEqual([256 - 40, 256 - 30]);
    win!.dispatch('mouseup', {});
    expect(fgPainted('act1'), 'the pan pasted').toHaveLength(0);
    expect(focusedHistory()?.canUndo ?? false).toBe(false);
    expect(useEditorStore.getState().pasting, 'and the mode is still armed').toBe(true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE MARQUEE AND AN ARMED PASTE BELONG TO THE ACT, NOT TO THE MOUNT
  // (MAP-REMOUNT-DROPS-PASTE; docs/reviews/2026-09-11-map-remount-clear.md)
  //
  // The act-identity clear was a `useEffect` keyed on the open zone and act,
  // whose comment said it fired "only on an actual act/zone switch". Like every
  // effect it also ran on the FIRST render, so every remount cleared both, and a
  // facet round trip through Art IS a remount: LevelWorkspace renders the facet
  // module's `<Canvas />`, and Art's Canvas is `ArtCanvas`, not the MapViewport
  // that every other aeon facet shares through `mapFacet`.
  //
  // Nested in the paste block for its `document` stub and its armed clipboard:
  // with paste mode on at a mount, the preview pass reaches `regionPreviewCanvas`.
  //
  // THE REMOUNT, AS THIS HARNESS CAN SPELL IT: `takeDown` runs every cleanup and
  // `mountMap` builds a fresh instance whose effects all run as a first render.
  // LevelWorkspace itself is not rendered here; the rows that go through the
  // facet bar call `switchFacet`, the store half of what the bar does.
  // ══════════════════════════════════════════════════════════════════════════

  describe('the marquee and an armed paste belong to the act they were made in, not to the mount', () => {
    const DRAG = { from: { col: 3, row: 3 }, to: { col: 6, row: 4 } };
    const armedRect = () => ({
      sectionIndex: 0,
      ...snapMarquee(DRAG.from.col, DRAG.from.row, DRAG.to.col, DRAG.to.row, effectiveGranularity('block', false)),
    });
    const ed = () => useEditorStore.getState();
    /** A config for the project that is open before a switch, so a switch is one
     *  config for another as it is in the app, not null for one. */
    const giveTheOpenProjectAConfig = () =>
      useProjectStore.setState({ config: { basePath: '/map-remount/first-checkout', zones: [] } as never });

    /**
     * A committed marquee from a real drag, then paste armed by a real Ctrl+V,
     * both with the map on screen as an author does it. Both premises are
     * asserted: a row that expects a clear is vacuous over state never armed.
     */
    async function armBoth(): Promise<Surface> {
      ed().setTool('marquee');            // FIRST: setTool clears `pasting`
      ed().setMarqueeGranularity('block');
      ed().setMarqueeSnapInvert(false);
      ed().setMarquee(null);
      const s = await mountMap();
      s.on().onMouseDown(tileAt(DRAG.from.col, DRAG.from.row));
      s.on().onMouseMove(tileAt(DRAG.to.col, DRAG.to.row));
      win!.dispatch('mouseup', {});
      expect(ed().marquee, 'the drag committed no marquee, so no row below can see a clear')
        .toEqual(armedRect());
      expect(win!.dispatch('keydown', keydown('v', { ctrlKey: true })), 'nothing heard Ctrl+V')
        .toBeGreaterThan(0);
      expect(ed().pasting, 'Ctrl+V did not arm paste mode, so no row below can see a clear').toBe(true);
      return s;
    }

    /** Take the map down the way React does, and its window stub with it. */
    function takeDown(s: Surface): void {
      s.h.unmount();
      mounted = null;
      win!.restore();
      win = null;
    }

    /**
     * A different project opened over this one, in aeon-open.ts's order
     * (`openLoaded`, then the first-act pick), whose first act has the SAME ids
     * as the one open. Only the project changed, so a clear keyed on zone and act
     * alone cannot see it. Two checkouts of one tree are exactly this.
     */
    function openSameIdsProject(): void {
      useProjectStore.getState().openLoaded({
        config: { basePath: '/map-remount/another-checkout', zones: [] },
        project: twoActProject(),
        collisionProfiles: null, capabilities: null, legacyAtlasMerged: false,
      } as never);
      useProjectStore.getState().setCurrentAct('ojz', 'act1');
    }

    it('a facet round trip through Art keeps the committed marquee', async () => {
      const s = await armBoth();
      const tab = useSessionStore.getState().activeId;
      switchFacet(tab, 'art');            // the facet bar: Art's Canvas replaces the map…
      takeDown(s);                        // …which unmounts it
      switchFacet(tab, 'layout');
      await mountMap();                   // and coming back mounts a fresh one
      expect(ed().tool, 'the premise: the marquee tool came back with the facet').toBe('marquee');
      expect(ed().marquee, 'the remount threw away a marquee made in the act that is still open')
        .toEqual(armedRect());
    });

    it('CONTROL: the facet switch ITSELF disarms paste, before any remount', async () => {
      // So the facet bar never brings a paste back, whatever the mount does:
      // `switchFacet` re-scopes the tool through `setTool`, whose rule is that
      // picking a tool means the author is done pasting. The marquee is not in
      // that rule, which is why it is the half an author could see come back.
      await armBoth();
      switchFacet(useSessionStore.getState().activeId, 'art');
      expect(ed().pasting, 'the facet switch left paste mode armed').toBe(false);
      expect(ed().marquee, 'and the switch is not what drops the marquee').toEqual(armedRect());
    });

    it('a remount with no tool change keeps the marquee AND the armed paste', async () => {
      // No shipped path remounts the map without a tool re-scope or a change of
      // act or project (the packet's table), so this is the component's own
      // property rather than an author's path: a mount destroys nothing.
      const s = await armBoth();
      takeDown(s);
      await mountMap();
      expect(ed().marquee, 'the mount cleared the marquee').toEqual(armedRect());
      expect(ed().pasting, 'the mount disarmed paste mode').toBe(true);
    });

    it('an act switch while the map is unmounted still drops both', async () => {
      // The case the mount-time clear was carrying without saying so.
      const s = await armBoth();
      takeDown(s);
      focusAct('act2');
      await mountMap();
      expect(ed().marquee, 'a marquee from act1 is on act2\'s map').toBeNull();
      expect(ed().pasting, 'paste mode from act1 is armed over act2').toBe(false);
    });

    it('a round trip to another act and back while unmounted still drops both', async () => {
      // The act it comes back to IS the act the state was made in. A mounted map
      // clears both at the first switch, so an unmounted one must too. Comparing
      // the act at the next mount with the act the state was armed in cannot see
      // this; that is what this row is for.
      const s = await armBoth();
      takeDown(s);
      focusAct('act2');
      focusAct('act1');
      await mountMap();
      expect(ed().marquee, 'a marquee survived an act switch because the map was not on screen').toBeNull();
      expect(ed().pasting, 'paste mode survived an act switch because the map was not on screen').toBe(false);
    });

    it('a project opened while unmounted, with the SAME zone and act ids, still drops both', async () => {
      giveTheOpenProjectAConfig();
      const s = await armBoth();
      takeDown(s);
      openSameIdsProject();
      await mountMap();
      expect(ed().marquee, 'a marquee from the other project is on this one').toBeNull();
      expect(ed().pasting, 'the other project\'s paste is armed over this one').toBe(false);
    });

    it('a project opened with the map MOUNTED, same zone and act ids, drops both', async () => {
      // The mounted half of the same path. `resetProjectRuntime`
      // (state/project-runtime.ts) clears histories and documents, not these.
      giveTheOpenProjectAConfig();
      const s = await armBoth();
      const before = s.h.renders();
      openSameIdsProject();
      expect(s.h.renders(), 'the map did not re-render on the project change').toBeGreaterThan(before);
      expect(ed().marquee, 'a marquee from the other project survived the open').toBeNull();
      expect(ed().pasting, 'the other project\'s paste stayed armed').toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CLIPBOARD'S WORDS INDEX THE TILE SET THEY WERE COPIED FROM
  // (PASTE-ACROSS-TILESETS; docs/reviews/2026-09-11-paste-across-tilesets.md)
  //
  // A nametable word is a tile NUMBER in the open zone's tile set
  // (`sectionRenderer.prepareTiles(zone.tileset.tiles, ...)`, and the ghost
  // rasterises the clipboard against the same). The clipboard outlives act,
  // zone and project switches on purpose, so a Ctrl+V re-armed in another zone
  // wrote the first zone's tile numbers into the second zone's tile set:
  // different pictures, silently.
  //
  // THE FIXTURE GIVES THE TWO ZONES DIFFERENT TILES AT EVERY INDEX USED, and
  // the rows assert that before trusting anything, so "nothing was written" can
  // never be the vacuous reading of two tile sets that happened to agree. The
  // copy goes through the real marquee drag and the real Ctrl+C, because the
  // tile set a clipboard belongs to is decided at the copy and nowhere else.
  // ══════════════════════════════════════════════════════════════════════════

  describe('a paste is refused where the copied words would index another tile set', () => {
    const OTHER = 'mgz';
    const TILES = 8;
    /** Tile i is solid colour pick(i). The source zone is i and the other zone
     *  15 - i, which differ at every index because 15 is odd. */
    const tilesOf = (pick: (i: number) => number) => ({
      tiles: Array.from({ length: TILES }, (_, i) => ({ pixels: new Uint8Array(64).fill(pick(i)) })),
    });
    const FG_OTHER = 0x0303;
    /** One 16px block, so the copy carries collision as well as art. */
    const COPY = { from: { col: 2, row: 2 }, to: { col: 3, row: 3 } };
    const copyRect = () => ({
      sectionIndex: 0,
      ...snapMarquee(COPY.from.col, COPY.from.row, COPY.to.col, COPY.to.row, effectiveGranularity('block', false)),
    });
    /** Tile numbers 1 to 4, planted where the copy is made, so the clipboard
     *  holds words that are neither a section's fill nor zero. */
    const SOURCE_WORDS = [1, 2, 3, 4].map((t) => packNametableWord(t, 0, false, false, false));
    /** Far from the copy, so a paste in the source act is a visible change
     *  and not the region pasted onto itself. Odd, so the snap does work. */
    const PASTE_AT = { col: 9, row: 5 };
    const ed = () => useEditorStore.getState();

    function zone(id: string) {
      const z = useProjectStore.getState().project?.zones.find((x) => x.id === id);
      if (!z) throw new Error(`map-viewport-mounted: no zone ${id}; the fixture moved`);
      return z;
    }
    function sectionIn(zoneId: string, actId: string): Section {
      const sec = zone(zoneId).acts.find((a) => a.id === actId)?.sections[0];
      if (!sec) throw new Error(`map-viewport-mounted: no section 0 in ${zoneId}/${actId}; the fixture moved`);
      return sec;
    }
    /** Focus an act of ANY zone the way the shell does: the store and the tab. */
    function focusZoneAct(zoneId: string, actId: string): void {
      useProjectStore.getState().setCurrentAct(zoneId, actId);
      useSessionStore.setState({ activeId: `level:${zoneId}:${actId}` });
    }

    beforeEach(() => {
      const p = twoActProject() as unknown as { zones: Array<Record<string, unknown>> };
      p.zones[0].tileset = tilesOf((i) => i);
      p.zones.push({
        id: OTHER, name: 'MGZ', tileset: tilesOf((i) => 15 - i),
        palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
        acts: [{
          id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
          sections: [section([OBJ(64, 64)], FG_OTHER)],
          bgLayout: bgLayout(BG_FILL.act1), bgTiles: bgTiles(),
        }],
      });
      useProjectStore.setState({ project: p as never });
      focusAct('act1');
      seedCollision();
      const other = sectionIn(OTHER, 'act1');
      other.collisionEdit = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(5));
      other.collisionEditB = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(6));
      const src = sectionIn('ojz', 'act1');
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          src.tileGrid.nametable[(COPY.from.row + r) * SECTION_TILES_WIDE + COPY.from.col + c] = SOURCE_WORDS[r * 2 + c];
        }
      }
    });

    /** Every word plane of every section of every act of every zone. */
    type Planes = Array<{ where: string; words: Uint16Array }>;
    function planes(): Planes {
      const out: Planes = [];
      for (const z of useProjectStore.getState().project?.zones ?? []) {
        for (const a of z.acts) {
          a.sections.forEach((sec, i) => {
            if (!sec) return;
            const at = `${z.id}/${a.id}/s${i}`;
            out.push({ where: `${at}/fg`, words: new Uint16Array(sec.tileGrid.nametable) });
            if (sec.collisionEdit) out.push({ where: `${at}/collA`, words: new Uint16Array(sec.collisionEdit) });
            if (sec.collisionEditB) out.push({ where: `${at}/collB`, words: new Uint16Array(sec.collisionEditB) });
          });
        }
      }
      return out;
    }
    const hex = (w: number) => `0x${w.toString(16).padStart(4, '0')}`;
    /** Every word that differs from `before`, named, so a failure says WHAT landed where. */
    function changesSince(before: Planes): string[] {
      const after = planes();
      const out: string[] = [];
      if (after.length !== before.length) out.push(`plane count ${before.length} became ${after.length}`);
      for (const b of before) {
        const a = after.find((x) => x.where === b.where);
        if (!a) { out.push(`${b.where} is gone`); continue; }
        for (let i = 0; i < b.words.length; i++) {
          if (a.words[i] !== b.words[i]) out.push(`${b.where}[${i}] ${hex(b.words[i])} became ${hex(a.words[i])}`);
        }
      }
      return out;
    }

    /** The author's copy: a marquee drag over the planted words, then Ctrl+C,
     *  in the source zone with the map on screen. Both premises asserted. */
    async function copyInSource(): Promise<Surface> {
      ed().setTool('marquee');
      ed().setMarqueeGranularity('block');
      ed().setMarqueeSnapInvert(false);
      ed().setMarquee(null);
      const s = await mountMap();
      s.on().onMouseDown(tileAt(COPY.from.col, COPY.from.row));
      s.on().onMouseMove(tileAt(COPY.to.col, COPY.to.row));
      win!.dispatch('mouseup', {});
      expect(ed().marquee, 'the drag committed no marquee, so nothing below was copied').toEqual(copyRect());
      win!.dispatch('keydown', keydown('c', { ctrlKey: true }));
      expect([...(ed().mapClipboard?.nametable ?? [])], 'Ctrl+C did not copy the planted words')
        .toEqual(SOURCE_WORDS);
      return s;
    }

    /** Hover then press at PASTE_AT, then release: a whole click. `over` carries
     *  the press's modifiers (Shift is "collision only", Alt "art only"). */
    function clickAtPaste(s: Surface, over: Record<string, unknown> = {}) {
      s.on().onMouseMove(tileAt(PASTE_AT.col, PASTE_AT.row));
      const e = tileAt(PASTE_AT.col, PASTE_AT.row, over);
      s.on().onMouseDown(e);
      win!.dispatch('mouseup', {});
      return e;
    }

    /** ANTI-VACUOUS: every copied word names a tile that is a DIFFERENT picture
     *  in the other zone, so a paste there would visibly put the wrong tile down. */
    function assertTheTileSetsDisagree(): void {
      const clip = ed().mapClipboard;
      expect(clip, 'nothing was copied').not.toBeNull();
      for (const w of clip!.nametable) {
        const t = unpackNametableWord(w).tileIndex;
        expect(t, 'a copied word names a tile outside both fixture tile sets').toBeLessThan(TILES);
        expect([...zone(OTHER).tileset.tiles[t].pixels],
          `tile ${t} is the same picture in both zones, so a wrong paste could not show`)
          .not.toEqual([...zone('ojz').tileset.tiles[t].pixels]);
      }
    }

    it('Ctrl+V in a zone with another tile set arms for COLLISION ONLY and says so, and a click that would write TILES is refused out loud, with nothing written', async () => {
      // Arming used to be refused here (PASTE-ACROSS-TILESETS). A collision word
      // indexes the project's one collision bank, not the tile set, so the
      // copy's collision fits this zone and Ctrl+V arms for it
      // (COLLISION-PASTE-ACROSS-TILESETS). The TILES are still refused, at the
      // click, which is where the layers are decided.
      const s = await copyInSource();
      assertTheTileSetsDisagree();
      focusZoneAct(OTHER, 'act1');
      useToastStore.setState({ toasts: [] });
      const before = planes();
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V refused a paste whose collision fits this zone').toBe(true);
      const told = toastsMatching('Only the collision');
      expect(told, 'arming over another tile set did not say only the collision can land').toHaveLength(1);
      expect(told[0], 'the arming notice did not name the gesture that lands').toContain('Shift+click');
      expect(toastsMatching('Not pasted'), 'arming was refused').toHaveLength(0);
      useToastStore.setState({ toasts: [] });
      clickAtPaste(s);
      expect(changesSince(before),
        'the other zone took the copied tile numbers, which are different tiles in its tile set').toEqual([]);
      const said = toastsMatching('Not pasted');
      expect(said, 'the refusal was silent').toHaveLength(1);
      expect(said[0], 'the refusal did not say the tiles were the problem').toContain('another tile set');
      expect(said[0], 'the refusal did not say what a paste here would do').toContain('different tiles');
      expect(focusedHistory()?.canUndo ?? false, 'a refusal put an entry on the undo stack').toBe(false);
    });

    it('a paste armed any other way is refused at the CLICK too, and nothing is written', async () => {
      // The store's own arm, around Ctrl+V, so this row measures the commit's
      // check and not the key's: the write must not trust whoever armed it.
      const s = await copyInSource();
      assertTheTileSetsDisagree();
      focusZoneAct(OTHER, 'act1');
      ed().setPasting(true);
      expect(ed().pasting, 'the premise: paste mode is armed over the other zone').toBe(true);
      useToastStore.setState({ toasts: [] });
      const before = planes();
      const e = clickAtPaste(s);
      expect(changesSince(before),
        'the click wrote the copied tile numbers into a tile set they do not index').toEqual([]);
      expect(toastsMatching('another tile set'), 'the refused click was silent').toHaveLength(1);
      expect(ed().pasting, 'a refused paste stayed armed, so its ghost stays under the cursor').toBe(false);
      expect(e.wasPrevented(), 'the refused click fell through to the tool').toBe(true);
      expect(focusedHistory()?.canUndo ?? false, 'a refusal put an entry on the undo stack').toBe(false);
    });

    /** Where a paste at PASTE_AT lands: the copy carries collision, so the
     *  origin snaps to the 16px grid (`pasteBaseStep` is 2 for such a clipboard). */
    const PASTE_BASE = { col: Math.floor(PASTE_AT.col / 2) * 2, row: Math.floor(PASTE_AT.row / 2) * 2 };
    /** The 2x2 words at PASTE_BASE in one act's section, row-major like SOURCE_WORDS. */
    function wordsAtPaste(zoneId: string, actId: string): number[] {
      const nt = sectionIn(zoneId, actId).tileGrid.nametable;
      return [0, 1].flatMap((r) => [0, 1].map((c) =>
        nt[(PASTE_BASE.row + r) * SECTION_TILES_WIDE + PASTE_BASE.col + c]));
    }

    it('CONTROL: in the act it was copied in, the same gestures paste exactly as before', async () => {
      const s = await copyInSource();
      expect(wordsAtPaste('ojz', 'act1'), 'ANTI-VACUOUS: the paste target already holds the copy')
        .not.toEqual(SOURCE_WORDS);
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V did not arm in the tile set the words came from').toBe(true);
      clickAtPaste(s);
      expect(wordsAtPaste('ojz', 'act1'), 'the paste did not land').toEqual(SOURCE_WORDS);
      expect(toastsMatching('another tile set'), 'a paste into its own tile set was refused').toHaveLength(0);
    });

    it('act to act in ONE zone pastes, because every act of a zone draws with the zone\'s tile set', async () => {
      const s = await copyInSource();
      expect(zone('ojz').acts.map((a) => a.id), 'the premise: two acts under one zone tile set')
        .toEqual(['act1', 'act2']);
      focusZoneAct('ojz', 'act2');
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V refused a paste into another act of the same zone').toBe(true);
      clickAtPaste(s);
      expect(wordsAtPaste('ojz', 'act2'), 'the paste did not land in the other act').toEqual(SOURCE_WORDS);
      expect(toastsMatching('another tile set'), 'act to act in one zone was called another tile set')
        .toHaveLength(0);
    });

    it('a refusal keeps the clipboard: back in the zone it came from, it pastes again', async () => {
      const s = await copyInSource();
      focusZoneAct(OTHER, 'act1');
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      clickAtPaste(s);
      // 'Not pasted', not 'another tile set': the arming notice names the tile
      // set too, and a premise met by a notice would let a paste that was never
      // refused stand in for one that was.
      expect(toastsMatching('Not pasted'), 'the premise: the other zone refused the tiles').toHaveLength(1);
      focusZoneAct('ojz', 'act1');
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'the clipboard did not survive the refusal and the trip back').toBe(true);
      clickAtPaste(s);
      expect(wordsAtPaste('ojz', 'act1'), 'the paste back at the source did not land').toEqual(SOURCE_WORDS);
    });

    it('a project opened over the source, with the SAME zone and act ids, is another project: Ctrl+V is refused for its tiles AND its collision', async () => {
      // Two checkouts of one tree, and a reopen of this one, are this shape: the
      // ids agree and the tile set is a fresh load that may differ on disk.
      const s = await copyInSource();
      const next = twoActProject() as unknown as { zones: Array<Record<string, unknown>> };
      next.zones[0].tileset = tilesOf((i) => 15 - i);
      useProjectStore.getState().openLoaded({
        config: { basePath: '/paste-tileset/another-checkout', zones: [] },
        project: next,
        collisionProfiles: null, capabilities: null, legacyAtlasMerged: false,
      } as never);
      focusZoneAct('ojz', 'act1');
      assertTheTileSetsDisagreeWith(zone('ojz').tileset);
      useToastStore.setState({ toasts: [] });
      const before = planes();
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      const armed = ed().pasting;
      clickAtPaste(s);
      expect(changesSince(before), 'the other checkout took this one\'s tile numbers').toEqual([]);
      expect(armed, 'Ctrl+V armed a paste into another project because the ids matched').toBe(false);
      // Both kinds of word are foreign here (the collision bank is a fresh load
      // too), and the sticky setting pastes both, so the one refusal names both.
      const said = toastsMatching('Not pasted');
      expect(said, 'the refusal was silent').toHaveLength(1);
      expect(said[0], 'the refusal did not say where the copy came from').toContain('another project');
      expect(said[0], 'the refusal did not name the tiles it refused').toContain('tiles');
      expect(said[0], 'the refusal did not name the collision it refused').toContain('collision');
    });

    it('a flip in paste mode keeps the tile set, so the mirrored paste still lands where it was copied', async () => {
      const s = await copyInSource();
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'the premise: Ctrl+V armed').toBe(true);
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('x'));
      const mirrored = [...(ed().mapClipboard?.nametable ?? [])];
      expect(mirrored, 'the premise: X mirrored the pending paste').not.toEqual(SOURCE_WORDS);
      clickAtPaste(s);
      expect(wordsAtPaste('ojz', 'act1'), 'the mirrored paste did not land in its own tile set').toEqual(mirrored);
      expect(toastsMatching('another tile set'), 'a flip made the author\'s own paste foreign').toHaveLength(0);
    });

    it('the tile set is the OPEN zone\'s at the copy: copied in the other zone, it pastes there and is refused in the first', async () => {
      // Every row above copies in the project's FIRST zone, so a capture that
      // took `zones[0]` instead of the open zone would pass all of them.
      const other = sectionIn(OTHER, 'act1');
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          other.tileGrid.nametable[(COPY.from.row + r) * SECTION_TILES_WIDE + COPY.from.col + c] = SOURCE_WORDS[r * 2 + c];
        }
      }
      focusZoneAct(OTHER, 'act1');
      const s = await copyInSource();
      assertTheTileSetsDisagreeWith(zone('ojz').tileset);
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V refused a paste in the zone the copy was made in').toBe(true);
      clickAtPaste(s);
      expect(wordsAtPaste(OTHER, 'act1'), 'the paste did not land in the zone it was copied in')
        .toEqual(SOURCE_WORDS);
      // Back in the first zone the copy's COLLISION fits (one project), so
      // Ctrl+V arms; its TILES do not, so the plain click is refused.
      focusZoneAct('ojz', 'act1');
      const before = planes();
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      clickAtPaste(s);
      expect(changesSince(before), 'the first zone took the other zone\'s tile numbers').toEqual([]);
      const said = toastsMatching('Not pasted');
      expect(said, 'the refusal was silent').toHaveLength(1);
      expect(said[0], 'the refusal did not say the tiles were the problem').toContain('another tile set');
    });

    /** The same anti-vacuous check against a tile set other than the fixture's
     *  second zone: every copied word names a different picture in `target`. */
    function assertTheTileSetsDisagreeWith(target: { tiles: Array<{ pixels: Uint8Array }> }): void {
      const clip = ed().mapClipboard;
      expect(clip, 'nothing was copied').not.toBeNull();
      expect(target, 'the premise: the target is not the tile set the copy came from').not.toBe(clip!.tileset);
      for (const w of clip!.nametable) {
        const t = unpackNametableWord(w).tileIndex;
        expect(t, 'a copied word names a tile outside the target tile set').toBeLessThan(target.tiles.length);
        expect([...target.tiles[t].pixels], `tile ${t} is the same picture in both tile sets`)
          .not.toEqual([...clip!.tileset.tiles[t].pixels]);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // A COLLISION WORD DOES NOT INDEX THE TILE SET
    // (COLLISION-PASTE-ACROSS-TILESETS;
    //  docs/reviews/2026-09-11-collision-paste-across-tilesets.md)
    //
    // Its shape number indexes the project's ONE collision base bank: aeon bakes
    // every section of every zone against the same bank into one shared attr
    // set. So a collision-only paste into another zone of the SAME project puts
    // down exactly the shapes that were copied, and refusing it (with a message
    // about tiles, which it does not write) was wrong. Across PROJECTS the bank
    // can differ, so there it stays refused, and the message is about collision.
    // ════════════════════════════════════════════════════════════════════════

    /** The four tile-indexed plane words the 16px cell at PASTE_BASE covers
     *  (every sub-tile of a cell holds the cell's one word). */
    const PASTE_CELL = cellSubTiles(PASTE_BASE.col >> 1, PASTE_BASE.row >> 1);

    /** What a collision-only paste of the copy at PASTE_AT must change in
     *  `zoneId`/act1, derived from the clipboard and the planes before it, and
     *  nothing else: both planes, at the cell's four sub-tiles. Sorted, like
     *  `changesSince(...).sort()`. Asserts the paste would be VISIBLE first. */
    function collisionOnlyLanding(zoneId: string, before: Planes): string[] {
      const clip = ed().mapClipboard!;
      expect([clip.collisionA.length, clip.collisionB.length],
        'the premise: the copy is exactly one 16px cell per plane').toEqual([1, 1]);
      const out: string[] = [];
      for (const [plane, w] of [['collA', clip.collisionA[0]], ['collB', clip.collisionB[0]]] as const) {
        const was = before.find((p) => p.where === `${zoneId}/act1/s0/${plane}`);
        if (!was) throw new Error(`map-viewport-mounted: ${zoneId}/act1 has no ${plane}; the fixture moved`);
        for (const i of PASTE_CELL) {
          expect(was.words[i], `ANTI-VACUOUS: ${zoneId} ${plane}[${i}] already holds the copied word`).not.toBe(w);
          out.push(`${zoneId}/act1/s0/${plane}[${i}] ${hex(was.words[i])} became ${hex(w)}`);
        }
      }
      return out.sort();
    }

    it('a COLLISION-ONLY (Shift) paste into another zone of the same project lands the copied collision and no tile word', async () => {
      const s = await copyInSource();
      focusZoneAct(OTHER, 'act1');
      const before = planes();
      const expected = collisionOnlyLanding(OTHER, before);
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V refused a paste whose collision means the same shapes in every zone').toBe(true);
      clickAtPaste(s, { shiftKey: true });
      expect(changesSince(before).sort(),
        'the collision-only paste wrote something other than the copied collision').toEqual(expected);
      expect(toastsMatching('Not pasted'), 'a paste that landed was also refused').toHaveLength(0);
      expect(undoDepth(), 'the collision paste is not ONE undo step').toBe(1);
    });

    it('the same paste through the sticky Paste setting (Collision), with no modifier, lands the same way', async () => {
      const s = await copyInSource();
      focusZoneAct(OTHER, 'act1');
      ed().setPasteLayers('collision');
      const before = planes();
      const expected = collisionOnlyLanding(OTHER, before);
      useToastStore.setState({ toasts: [] });
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'Ctrl+V refused a collision-only paste into another zone').toBe(true);
      clickAtPaste(s);
      expect(changesSince(before).sort(),
        'the collision-only paste wrote something other than the copied collision').toEqual(expected);
      expect(toastsMatching('Not pasted'), 'a paste that landed was also refused').toHaveLength(0);
    });

    it('a collision-only paste into ANOTHER PROJECT is refused at the click, in terms of COLLISION, and nothing is written', async () => {
      // The store's own arm, around Ctrl+V, so this row measures the click's
      // check: the write must not trust whoever armed it.
      const s = await copyInSource();
      const next = twoActProject() as unknown as { zones: Array<Record<string, unknown>> };
      next.zones[0].tileset = tilesOf((i) => 15 - i);
      useProjectStore.getState().openLoaded({
        config: { basePath: '/collision-paste/another-checkout', zones: [] },
        project: next,
        collisionProfiles: null, capabilities: null, legacyAtlasMerged: false,
      } as never);
      focusZoneAct('ojz', 'act1');
      const target = sectionIn('ojz', 'act1');
      target.collisionEdit = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(7));
      target.collisionEditB = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(8));
      const before = planes();
      collisionOnlyLanding('ojz', before);   // ANTI-VACUOUS: a paste here would show
      ed().setPasting(true);
      expect(ed().pasting, 'the premise: paste mode is armed over the other project').toBe(true);
      useToastStore.setState({ toasts: [] });
      const e = clickAtPaste(s, { shiftKey: true });
      expect(changesSince(before), 'another project\'s shape numbers were pasted into this one').toEqual([]);
      const said = toastsMatching('Not pasted');
      expect(said, 'the refused click was silent').toHaveLength(1);
      expect(said[0], 'the refusal did not name what it refused').toContain('collision');
      expect(said[0], 'the refusal did not say where the copy came from').toContain('another project');
      expect(said[0], 'a paste that writes no tile word was refused in terms of tiles').not.toContain('tiles');
      expect(ed().pasting, 'a refused paste stayed armed').toBe(false);
      expect(e.wasPrevented(), 'the refused click fell through to the tool').toBe(true);
      expect(focusedHistory()?.canUndo ?? false, 'a refusal put an entry on the undo stack').toBe(false);
    });

    it('armed over another tile set for collision only, the ghost rasterises NO art from the copied tile numbers', async () => {
      // Paste mode can now be armed where the copied tile numbers name other
      // pictures. The ghost draws the clipboard's words against the OPEN zone's
      // tiles, so drawing it here would show art the click refuses to write.
      // What this can see is whether a ghost was rasterised at all
      // (`canvasesMade`); what it would look like is foreground, F-3.
      const s = await copyInSource();
      // CONTROL, and the instrument's proof of life: in the tile set the words
      // index, the same hover builds a ghost.
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'the premise: Ctrl+V armed in the source zone').toBe(true);
      const atSource = canvasesMade;
      s.on().onMouseMove(tileAt(PASTE_AT.col, PASTE_AT.row));
      expect(canvasesMade - atSource,
        'the CONTROL built no ghost, so this instrument cannot see one either way').toBeGreaterThan(0);
      focusZoneAct(OTHER, 'act1');
      win!.dispatch('keydown', keydown('v', { ctrlKey: true }));
      expect(ed().pasting, 'the premise: Ctrl+V armed for collision only in the other zone').toBe(true);
      const atOther = canvasesMade;
      s.on().onMouseMove(tileAt(PASTE_AT.col + 2, PASTE_AT.row + 2));
      expect(canvasesMade - atOther,
        'the ghost rasterised the copied tile numbers against a tile set they do not index').toBe(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// A CHUNK SAVED IN ONE ZONE AND STAMPED IN ANOTHER. KNOWN, AND BLOCKED.
// (CHUNK-STAMP-ACROSS-ZONES; docs/reviews/2026-09-11-chunk-stamp-across-zones.md)
//
// The chunk library is ONE array per project (`S4Project.chunkLibrary`) and a
// `ChunkDef` records no tile set. Its words are tile NUMBERS in whichever zone's
// tile set they were minted against, and every minting path uses the OPEN
// zone's. The stamp tool offers the whole library in every zone, so in a
// project with two zones a chunk saved from zone A's map lands in zone B as
// zone A's numbers, which are other pictures in zone B's tile set.
//
// NOT REFUSED, because there is no honest identity to refuse on: the library is
// saved as one unmarked file and read back with every chunk attributed to the
// first zone (the packet says where). So the first row PINS today's write, and a
// fix has to turn it into a refusal row on purpose. The second row is the
// control any fix must keep: a stamp inside the zone the chunk was saved in
// lands.
//
// THE CHUNK IS MINTED BY THE SAVE-AS-CHUNK BUTTON'S OWN TWO CALLS
// (MarqueePasteOptions.tsx `saveAsChunk`: `selectionToChunk` over the open act's
// section, then `addChunks`), not by a hand-built ChunkDef, so its words are the
// words zone A's map holds. The stamp is the real mounted click. Nothing hovers,
// so the stamp ghost (which needs a `document`) is never drawn: a ghost is a
// drawing claim, and drawing claims are foreground-only.
// ══════════════════════════════════════════════════════════════════════════════

describe('a chunk saved in one zone and stamped in another (KNOWN, BLOCKED: CHUNK-STAMP-ACROSS-ZONES)', () => {
  const OTHER = 'mgz';
  const TILES = 8;
  /** Tile i is solid colour pick(i). Zone ojz is i and zone mgz is 15 - i,
   *  which differ at every index because 15 is odd. */
  const tilesOf = (pick: (i: number) => number) => ({
    tiles: Array.from({ length: TILES }, (_, i) => ({ pixels: new Uint8Array(64).fill(pick(i)) })),
  });
  const FG_OTHER = 0x0303;
  /** One 16px block of ojz/act1, planted with tile numbers 1 to 4. */
  const SOURCE = { col: 2, row: 2, w: 2, h: 2 };
  const SOURCE_WORDS = [1, 2, 3, 4].map((t) => packNametableWord(t, 0, false, false, false));
  const CHUNK_ID = 'saved-in-ojz';
  /** Where the click lands. Odd, so the stamp's own snap (to the chunk's size) does work. */
  const CLICK = { col: 9, row: 5 };
  const ed = () => useEditorStore.getState();

  function zone(id: string) {
    const z = useProjectStore.getState().project?.zones.find((x) => x.id === id);
    if (!z) throw new Error(`map-viewport-mounted: no zone ${id}; the fixture moved`);
    return z;
  }
  function sectionIn(zoneId: string, actId: string): Section {
    const sec = zone(zoneId).acts.find((a) => a.id === actId)?.sections[0];
    if (!sec) throw new Error(`map-viewport-mounted: no section 0 in ${zoneId}/${actId}; the fixture moved`);
    return sec;
  }
  /** Focus an act of ANY zone the way the shell does: the store and the tab. */
  function focusZoneAct(zoneId: string, actId: string): void {
    useProjectStore.getState().setCurrentAct(zoneId, actId);
    useSessionStore.setState({ activeId: `level:${zoneId}:${actId}` });
  }
  function libraryChunk() {
    const c = useProjectStore.getState().project?.chunkLibrary.find((k) => k.id === CHUNK_ID);
    if (!c) throw new Error('map-viewport-mounted: the saved chunk is not in the library; the fixture moved');
    return c;
  }
  /** The chunk-sized words where a click at CLICK stamps: `MapViewport` snaps
   *  the origin to the chunk's own size, so this reads the same snap. */
  function wordsAtStamp(zoneId: string, actId: string): number[] {
    const c = libraryChunk();
    const baseCol = Math.floor(CLICK.col / c.widthTiles) * c.widthTiles;
    const baseRow = Math.floor(CLICK.row / c.heightTiles) * c.heightTiles;
    const nt = sectionIn(zoneId, actId).tileGrid.nametable;
    const out: number[] = [];
    for (let r = 0; r < c.heightTiles; r++) {
      for (let col = 0; col < c.widthTiles; col++) out.push(nt[(baseRow + r) * SECTION_TILES_WIDE + baseCol + col]);
    }
    return out;
  }

  beforeEach(() => {
    const p = twoActProject() as unknown as { zones: Array<Record<string, unknown>> };
    p.zones[0].tileset = tilesOf((i) => i);
    p.zones.push({
      id: OTHER, name: 'MGZ', tileset: tilesOf((i) => 15 - i),
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [section([OBJ(64, 64)], FG_OTHER)],
        bgLayout: bgLayout(BG_FILL.act1), bgTiles: bgTiles(),
      }],
    });
    useProjectStore.setState({ project: p as never });
    focusAct('act1');
    seedCollision();
    const other = sectionIn(OTHER, 'act1');
    other.collisionEdit = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(5));
    other.collisionEditB = new Uint16Array(SECTION_PLANE_WORDS).fill(collWord(6));
    const src = sectionIn('ojz', 'act1');
    for (let r = 0; r < SOURCE.h; r++) {
      for (let c = 0; c < SOURCE.w; c++) {
        src.tileGrid.nametable[(SOURCE.row + r) * SECTION_TILES_WIDE + SOURCE.col + c] = SOURCE_WORDS[r * SOURCE.w + c];
      }
    }
    // The save-as-chunk button, pressed in ojz/act1 (the open act).
    const def = selectionToChunk(src, SOURCE.col, SOURCE.row, SOURCE.w, SOURCE.h, 'Saved in OJZ', CHUNK_ID);
    if (!def) throw new Error('map-viewport-mounted: selectionToChunk refused an aligned block; the fixture moved');
    useProjectStore.getState().addChunks([def]);
    ed().setSelectedChunkId(CHUNK_ID);
    ed().setTool('stamp-chunk');
    useToastStore.setState({ toasts: [] });
  });

  /** ANTI-VACUOUS: every chunk word names a tile that is a DIFFERENT picture in
   *  mgz than in ojz, so a stamp there visibly puts other tiles down. */
  function assertTheTileSetsDisagree(): void {
    for (const w of libraryChunk().nametable) {
      const t = unpackNametableWord(w).tileIndex;
      expect(t, 'a chunk word names a tile outside both fixture tile sets').toBeLessThan(TILES);
      expect([...zone(OTHER).tileset.tiles[t].pixels],
        `tile ${t} is the same picture in both zones, so a wrong stamp could not show`)
        .not.toEqual([...zone('ojz').tileset.tiles[t].pixels]);
    }
  }

  /** Mount the map on whatever act is focused, and click once at CLICK. */
  async function clickStamp(): Promise<void> {
    const s = await mountMap();
    s.on().onMouseDown(tileAt(CLICK.col, CLICK.row));
    win!.dispatch('mouseup', {});
  }

  it('PINNED AS FOUND: a chunk saved in zone A is stamped into zone B as zone A\'s tile numbers, and nothing says so', async () => {
    expect([...libraryChunk().nametable], 'the premise: the library chunk holds the words saved from ojz\'s map')
      .toEqual(SOURCE_WORDS);
    assertTheTileSetsDisagree();
    focusZoneAct(OTHER, 'act1');
    expect(wordsAtStamp(OTHER, 'act1'), 'ANTI-VACUOUS: the target already holds the chunk').not.toEqual(SOURCE_WORDS);
    await clickStamp();
    // THE DEFECT, PINNED. These are ojz tile numbers written into mgz, where
    // they name other pictures. A fix that refuses this stamp must replace this
    // row with a refusal row (nothing written, a toast saying why), not delete it.
    expect(wordsAtStamp(OTHER, 'act1'),
      'the cross-zone stamp no longer writes the chunk: if that is a fix, turn this row into a refusal row')
      .toEqual(SOURCE_WORDS);
    expect(toastsMatching('tile set'), 'the stamp now says something about tile sets: update this pin with the fix')
      .toHaveLength(0);
  });

  it('CONTROL: in the zone the chunk was saved in, another act takes the stamp', async () => {
    focusZoneAct('ojz', 'act2');
    expect(wordsAtStamp('ojz', 'act2'), 'ANTI-VACUOUS: the target already holds the chunk').not.toEqual(SOURCE_WORDS);
    await clickStamp();
    expect(wordsAtStamp('ojz', 'act2'), 'a stamp inside the chunk\'s own zone did not land').toEqual(SOURCE_WORDS);
    expect(toastsMatching('tile set'), 'a stamp inside the chunk\'s own zone was refused').toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE SCREEN FRAME'S DRAG (triage 2026-08-26 row G), on an UNLOCKED view.
//
// COVERAGE. `screen-frame.ts` pins the hit test and the drag arithmetic as pure
// functions. Nothing drove the press that decides whether the frame or the
// tool gets the gesture, the preview through a ref, or the single store write
// on release.
//
// ⚠ THE RECT IS OFFSET FROM THE CLIENT ORIGIN, deliberately, and every earlier
// block in this file cannot say that. At `VIEWPORT` a client coordinate IS a
// canvas coordinate, so a hit test that forgot to subtract `rect.left` would
// pass every row. `OFFSET` makes the two differ.
//
// ⚠ AND THE VIEW IS PARKED OFF ITS DEFAULTS (zoom 2, camera off 0), so a drag
// that ignored the zoom, or measured from the origin, is a wrong number.
//
// FOREGROUND-ONLY and not attempted: the LOCKED-scene arm, where the frame's Y
// is a scene's `v_offset` and the drag commits a document edit. It needs
// `activeGuideScene()`, which is gated on the Effects facet (the predicate
// `inEffectsFacet()` spells), and that is outside this parcel's reach by rule.
// ══════════════════════════════════════════════════════════════════════════════

const OFFSET = { left: 100, top: 40, width: 640, height: 480 };

describe('the screen frame takes a press on its EDGE only, and writes the store once, on release', () => {
  const ANCHOR = { x: 64, y: 64 };
  const VIEW = { vpX: 32, vpY: 32, zoom: 2 };
  /** The client point over world (x,y), through OFFSET and VIEW. */
  const at = (x: number, y: number) =>
    mouse(OFFSET.left + (x - VIEW.vpX) * VIEW.zoom, OFFSET.top + (y - VIEW.vpY) * VIEW.zoom);
  /** On the frame's LEFT edge, a third of the way down. */
  const EDGE = { x: ANCHOR.x, y: ANCHOR.y + 36 };
  /** Deep inside the frame, far from all four edges. */
  const INSIDE = { x: ANCHOR.x + 86, y: ANCHOR.y + 86 };
  const frame = () => useViewStore.getState().screenFrame;

  beforeEach(() => {
    useViewStore.setState(VIEW);
    useViewStore.getState().setOverlay('showScreenFrame', true);
    useViewStore.getState().setScreenFrame(ANCHOR.x, ANCHOR.y);
    const ed = useEditorStore.getState();
    ed.setTool('paint-tile');
    ed.setEditingLayer('fg');
    ed.setSelectedTileIndex(5);
  });

  afterEach(() => {
    useViewStore.getState().setOverlay('showScreenFrame', false);
    useViewStore.getState().setScreenFrame(0, 0);
  });

  it('ANTI-VACUOUS: INSIDE is inside the frame and nowhere near an edge', () => {
    expect(INSIDE.x - ANCHOR.x).toBeGreaterThan(8);
    expect(ANCHOR.x + SCREEN_WIDTH - INSIDE.x).toBeGreaterThan(8);
  });

  it('a press on the edge takes the gesture from the tool', async () => {
    const s = await mountMap(OFFSET);
    const e = at(EDGE.x, EDGE.y);
    s.on().onMouseDown(e);
    expect(fgPainted('act1'), 'the tool painted under a press the frame should have taken').toHaveLength(0);
    expect(e.wasPrevented()).toBe(true);
  });

  it('the drag moves the frame by the WORLD delta, previewing through a ref and writing the store ONCE', async () => {
    const s = await mountMap(OFFSET);
    s.on().onMouseDown(at(EDGE.x, EDGE.y));
    s.on().onMouseMove(at(EDGE.x + 20, EDGE.y + 10));
    expect(frame(), 'the store was written mid-drag: one gesture, many writes').toEqual(ANCHOR);
    win!.dispatch('mouseup', {});
    expect(frame(), 'the release did not land the frame where the hand took it')
      .toEqual({ x: ANCHOR.x + 20, y: ANCHOR.y + 10 });
    expect(focusedHistory()?.canUndo ?? false,
      'an unlocked frame is a session reference, not a document edit').toBe(false);
  });

  it('CONTROL: a press INSIDE the frame belongs to the tool', async () => {
    const s = await mountMap(OFFSET);
    s.on().onMouseDown(at(INSIDE.x, INSIDE.y));
    win!.dispatch('mouseup', {});
    expect(fgPainted('act1'), 'the frame swallowed a press on its interior').toHaveLength(1);
    expect(frame(), 'and moved').toEqual(ANCHOR);
  });

  it('a HIDDEN frame never takes a press, even on its edge', async () => {
    useViewStore.getState().setOverlay('showScreenFrame', false);
    const s = await mountMap(OFFSET);
    s.on().onMouseDown(at(EDGE.x, EDGE.y));
    win!.dispatch('mouseup', {});
    expect(fgPainted('act1'), 'a frame nobody can see stole the press').toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// THE CONTEXT MENU (`handleContextMenu` and its close effect).
//
// COVERAGE. Nothing ran it. What these rows can see: where it opens, in
// CONTAINER-local coordinates (measured through OFFSET, for the reason the
// frame block states); that the browser's own menu is always suppressed, even
// where this one does not open; that a right press never paints; and the three
// ways it closes, including the sprite-tab guard on its Escape.
//
// NOT DRIVEN: the two menu actions. Each opens an Art document through
// `confirmArtDocumentOpen` and then switches facet, and that is a shell flow
// with its own tests, not a map behaviour.
// ══════════════════════════════════════════════════════════════════════════════

describe('the context menu opens where it was asked for, and closes on click-away or Escape', () => {
  /** Every element of `type` in a subtree, as data. */
  function elements(node: unknown, type: string, out: Array<React.ReactElement<Record<string, unknown>>> = []) {
    if (Array.isArray(node)) { for (const c of node) elements(c, type, out); return out; }
    if (!node || typeof node !== 'object') return out;
    const el = node as React.ReactElement<Record<string, unknown>>;
    if (el.type === type) out.push(el);
    const children = (el.props as { children?: unknown } | undefined)?.children;
    if (children !== undefined) elements(children, type, out);
    return out;
  }
  /** The menu box: the one child of the root that holds buttons, or null. */
  function menuOf(s: Surface): React.ReactElement<Record<string, unknown>> | null {
    const rootChildren = (s.h.el().props as { children?: unknown }).children;
    return elements(rootChildren, 'div').find((d) => elements(d.props.children, 'button').length > 0) ?? null;
  }
  const rightClick = (x: number, y: number) => mouse(x, y, { button: 2, buttons: 2 });

  beforeEach(() => {
    const ed = useEditorStore.getState();
    ed.setTool('paint-tile');
    ed.setEditingLayer('fg');
    ed.setSelectedTileIndex(5);
  });

  it('opens at the click, in CONTAINER-local coordinates, with both actions', async () => {
    const s = await mountMap(OFFSET);
    expect(menuOf(s), 'a menu was open before anyone asked').toBeNull();
    const e = rightClick(300, 170);
    s.on().onContextMenu(e);
    expect(e.wasPrevented(), 'the browser\'s own menu was left to open').toBe(true);
    const box = menuOf(s);
    expect(box, 'no menu opened').not.toBeNull();
    expect({ left: (box!.props.style as { left: number }).left, top: (box!.props.style as { top: number }).top },
      'the menu is placed in CLIENT space, off by the container\'s own offset')
      .toEqual({ left: 300 - OFFSET.left, top: 170 - OFFSET.top });
    expect(elements(box!.props.children, 'button').length, 'the menu lost an action').toBe(2);
  });

  it('a right-button press never paints', async () => {
    const s = await mountMap();
    s.on().onMouseDown(mouse(20, 20, { button: 2, buttons: 2 }));
    win!.dispatch('mouseup', {});
    expect(fgPainted('act1'), 'the right button painted under the tool').toHaveLength(0);
  });

  it('the browser menu is suppressed even where this one does not open', async () => {
    const s = await mountMap();
    // On the BG layer the map offers no menu at all.
    useEditorStore.getState().setEditingLayer('bg');
    const onBg = rightClick(100, 60);
    s.on().onContextMenu(onBg);
    expect(onBg.wasPrevented(), 'the browser menu opened over the BG layer').toBe(true);
    expect(menuOf(s), 'a map menu opened over the BG layer').toBeNull();
    // Off the section grid there is no cell to act on.
    useEditorStore.getState().setEditingLayer('fg');
    useViewStore.setState({ vpX: SECTION_TILES_WIDE * 8 * 4, vpY: 0, zoom: 1 });
    const offGrid = rightClick(100, 60);
    s.on().onContextMenu(offGrid);
    expect(offGrid.wasPrevented(), 'the browser menu opened off the grid').toBe(true);
    expect(menuOf(s), 'a menu opened over no cell').toBeNull();
  });

  it('closes on a click anywhere, and on Escape, but not on an Escape meant for a sprite tab', async () => {
    const s = await mountMap();
    s.on().onContextMenu(rightClick(100, 60));
    expect(menuOf(s)).not.toBeNull();
    expect(win!.dispatch('mousedown', {}), 'no click-away listener').toBeGreaterThan(0);
    expect(menuOf(s), 'a click elsewhere left the menu open').toBeNull();

    s.on().onContextMenu(rightClick(100, 60));
    expect(menuOf(s)).not.toBeNull();
    useSessionStore.setState({ activeId: 'doc:sprite:untitled' });
    win!.dispatch('keydown', keydown('Escape'));
    expect(menuOf(s), 'an Escape aimed at the sprite editor closed the hidden map\'s menu').not.toBeNull();
    focusAct('act1');
    win!.dispatch('keydown', keydown('Escape'));
    expect(menuOf(s), 'Escape on the level tab did not close the menu').toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// map-coverage-4 STARTS HERE.
//
// Same harness and the same rules as the rounds above: the component's real
// handlers over the real stores, every row shown red with a mutation on disk
// before it was trusted, and expected values derived from a rule a module
// states or from the engine constants. The packet
// (docs/reviews/2026-09-11-map-coverage-4.md) carries the plant for each row.
// ══════════════════════════════════════════════════════════════════════════════

/** Ascending numeric order, for index lists gathered from several cells. */
const asc = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);

/** Put four FOREGROUND words on the 16px block (cc, cr) of act1's section 0, in
 *  the order `cellSubTiles` lists that block: top-left, top-right, bottom-left,
 *  bottom-right (rows are SECTION_TILES_WIDE apart, so ascending IS that order). */
function plantBlock(cc: number, cr: number, words: readonly number[]): void {
  const nt = sectionOf('act1').tileGrid.nametable;
  cellSubTiles(cc, cr).forEach((i, k) => { nt[i] = words[k]; });
}

// ══════════════════════════════════════════════════════════════════════════════
// COLLISION PAINT, THE THREE MODES map-coverage-3 LEFT: Alt's propagate, a
// brush wider than one block, and the crossover brush with its half-cell span.
//
// COVERAGE. `collisionPaintTargets`, `cellCrossoverIndices` and
// `crossoverSpanForCursor` are pinned as pure functions. What nothing drove is
// the handler that LATCHES each mode at the press and hands it to them: the
// Alt bit off the pointer event, the brush size off the store, the crossover
// brush and its span mode, and the drag cache that decides whether a move is
// "the same cell".
//
// Expected cells are derived from the rule each module STATES (the docblock
// sentence is quoted beside each derivation), never from the handler.
// ══════════════════════════════════════════════════════════════════════════════

describe('collision paint: Alt propagates, a wide brush covers an area, and the crossover brush marks the half it is aimed at', () => {
  const PICK = 9;
  /** Two four-tile patterns no fixture block carries: the FG fill is FG_FILL.act1
   *  on every tile, so a block made of these matches only where it is planted. */
  const P = [0x0041, 0x0042, 0x0043, 0x0044] as const;
  const Q = [0x0051, 0x0052, 0x0053, 0x0054] as const;
  const W = SECTION_TILES_WIDE;
  const painted = () => collPainted('act1', 'a').map(([i]) => i);

  beforeEach(() => {
    seedCollision();
    useToastStore.setState({ toasts: [] });
    const ed = useEditorStore.getState();
    ed.setTool('paint-collision');
    ed.setSelectedCollisionProfile(PICK);
    ed.setSelectedCollisionSolidity('all');
    ed.setCollisionPaintPlane('a');
    ed.setCollisionPaintBothPlanes(false);
    ed.setCollisionBrushSize(1);
    ed.setCollisionCrossoverBrush('keep');
    ed.setCollisionCrossoverSpanMode('cell');
  });

  afterEach(() => {
    const ed = useEditorStore.getState();
    ed.setCollisionBrushSize(1);
    ed.setCollisionCrossoverBrush('keep');
    ed.setCollisionCrossoverSpanMode('cell');
    // Arming an authoring crossover brush turns the crossover lens on as a side
    // effect (editorStore's setter). It is view state and outlives this block.
    useViewStore.getState().setOverlay('showCrossover', false);
  });

  /** Every block of act1's section 0 whose four words are `words`, scanned
   *  directly, so the fixture guard does not borrow the function under test. */
  function blocksCarrying(words: readonly number[]): Array<[number, number]> {
    const nt = sectionOf('act1').tileGrid.nametable;
    const out: Array<[number, number]> = [];
    for (let cr = 0; cr < SECTION_TILES_HIGH / 2; cr++) {
      for (let cc = 0; cc < W / 2; cc++) {
        if (cellSubTiles(cc, cr).every((i, k) => nt[i] === words[k])) out.push([cc, cr]);
      }
    }
    return out;
  }

  it('ANTI-VACUOUS: a planted pattern is on the blocks it was planted on and on no other', () => {
    plantBlock(1, 1, P);
    plantBlock(5, 3, P);
    expect(blocksCarrying(P), 'Alt would have more (or fewer) blocks to reach than the rows below expect')
      .toEqual([[1, 1], [5, 3]]);
  });

  it('CONTROL: without Alt a press paints the clicked block alone, though another block is made of the same tiles', async () => {
    plantBlock(1, 1, P);
    plantBlock(5, 3, P);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    expect(painted(), 'a plain press reached a block it was not aimed at').toEqual(cellSubTiles(1, 1));
  });

  it('ALT paints every block made of the same four tiles, and no other, as ONE undo step', async () => {
    // collision-paint.ts: "brush 1 + propagate (Alt) -> every block in the
    // section with the same tiles (reuse), explicit opt-in."
    plantBlock(1, 1, P);
    plantBlock(5, 3, P);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1, { altKey: true }));
    expect(painted(), 'Alt did not reach the other block made of the same tiles, or reached one that is not')
      .toEqual(asc([...cellSubTiles(1, 1), ...cellSubTiles(5, 3)]));
    win!.dispatch('mouseup', {});
    expect(undoDepth(), 'a propagated press must be ONE undo step').toBe(1);
    expect(painted(), 'and that one undo must take every matching block back').toHaveLength(0);
  });

  it('ALT is LATCHED at the press: a drag keeps propagating after the key comes up', async () => {
    // MapViewport.tsx, at `paintPropagate`: "latched at mousedown ... so
    // toggling Alt mid-drag can't switch a single stroke between local and reuse."
    plantBlock(1, 1, P);
    plantBlock(7, 1, Q);
    plantBlock(9, 4, Q);
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1, { altKey: true }));
    s.on().onMouseMove(collCell(7, 1));   // Alt no longer held on this event
    expect(painted(), 'the stroke stopped propagating when the key came up mid-drag')
      .toEqual(asc([...cellSubTiles(1, 1), ...cellSubTiles(7, 1), ...cellSubTiles(9, 4)]));
  });

  it('a brush of N paints the N by N block area CENTRED on the cell, as ONE undo step', async () => {
    // collision-paint.ts: "brush > 1 -> the N×N block area centred on the cell
    // (clamped to the section)". An odd N centred on a cell reaches (N-1)/2 each way.
    const N = 3;
    const at = { cc: 4, cr: 4 };
    const reach = (N - 1) / 2;
    const cells: number[] = [];
    for (let cr = at.cr - reach; cr <= at.cr + reach; cr++) {
      for (let cc = at.cc - reach; cc <= at.cc + reach; cc++) cells.push(...cellSubTiles(cc, cr));
    }
    expect(cells, 'ANTI-VACUOUS: the area is N by N blocks of four sub-tiles').toHaveLength(N * N * 4);
    useEditorStore.getState().setCollisionBrushSize(N);
    const s = await mountMap();
    s.on().onMouseDown(collCell(at.cc, at.cr));
    expect(painted(), 'the brush did not paint the area around the cell').toEqual(asc(cells));
    win!.dispatch('mouseup', {});
    expect(undoDepth(), 'a brush press must be ONE undo step').toBe(1);
    expect(painted()).toHaveLength(0);
  });

  it('the brush area stops at the section edge: nothing left of column 0 wraps onto the row above', async () => {
    // ⚠ WHY AN EDGE ROW CAN FAIL HERE, when the typed-array hazard says it
    // might not. A block column of -1 is sub-tile column -2, and a store at a
    // NEGATIVE index is dropped silently, which would hide an unclamped brush.
    // But one block row down, (2 * cr) * W - 2 is a real index: the last two
    // columns of the row above. So an unclamped brush at (0, 1) WRITES
    // somewhere visible, and this row is placed where that happens.
    const N = 3;
    useEditorStore.getState().setCollisionBrushSize(N);
    const cells: number[] = [];
    for (let cr = 0; cr <= 2; cr++) for (let cc = 0; cc <= 1; cc++) cells.push(...cellSubTiles(cc, cr));
    const s = await mountMap();
    s.on().onMouseDown(collCell(0, 1));
    expect(painted(), 'the brush wrapped past the section edge, or stopped short of it').toEqual(asc(cells));
  });

  it('HAND-OFF marks every sub-tile of the cell to leave the plane it is painted on: A hands to B, B to A', async () => {
    // layer-transition.ts: "`hand-off` ... the SAME armed brush does the right
    // thing on either plane" (handOffFrom).
    expect(handOffFrom('a'), 'ANTI-VACUOUS: the two planes hand off in different directions')
      .not.toBe(handOffFrom('b'));
    expect(readCrossover(collWord(COLL_SHAPE.act1.a)), 'ANTI-VACUOUS: the fixture carries no mark').toBe('none');
    useEditorStore.getState().setCollisionCrossoverBrush('hand-off');
    const s = await mountMap();
    s.on().onMouseDown(collCell(2, 1));
    win!.dispatch('mouseup', {});
    const a = collPlane('act1', 'a');
    expect(cellSubTiles(2, 1).map((i) => readCrossover(a[i])), 'plane A did not take the hand-off')
      .toEqual(cellSubTiles(2, 1).map(() => handOffFrom('a')));
    expect(cellSubTiles(2, 1).map((i) => unpackCollisionCell(a[i]).shape), 'the geometry did not land with the mark')
      .toEqual(cellSubTiles(2, 1).map(() => PICK));

    useEditorStore.getState().setCollisionPaintPlane('b');
    s.on().onMouseDown(collCell(4, 1));
    win!.dispatch('mouseup', {});
    const b = collPlane('act1', 'b');
    expect(cellSubTiles(4, 1).map((i) => readCrossover(b[i])),
      'plane B took the mark that hands to itself, which the bake refuses')
      .toEqual(cellSubTiles(4, 1).map(() => handOffFrom('b')));
  });

  it('HALF width marks only the 8px column under the cursor, both of its rows, and the geometry stays cell-wide', async () => {
    // layer-transition.ts: "`'left'` / `'right'` name one sub-tile column",
    // and collision-cell.ts: "(both of its rows ...)". The column is the 8px
    // tile column the cursor is over: tile 5 is the RIGHT half of cell 2, tile 8
    // the LEFT half of cell 4.
    const ed = useEditorStore.getState();
    ed.setCollisionCrossoverBrush('hand-off');
    ed.setCollisionCrossoverSpanMode('half');
    const s = await mountMap();
    s.on().onMouseDown(tileAt(5, 2));
    win!.dispatch('mouseup', {});
    s.on().onMouseDown(tileAt(8, 2));
    win!.dispatch('mouseup', {});
    const a = collPlane('act1', 'a');
    const touched = asc([...cellSubTiles(2, 1), ...cellSubTiles(4, 1)]);
    expect(touched.filter((i) => readCrossover(a[i]) !== 'none'), 'the mark is not the column under the cursor')
      .toEqual(asc([2 * W + 5, 3 * W + 5, 2 * W + 8, 3 * W + 8]));
    expect(touched.map((i) => unpackCollisionCell(a[i]).shape), 'a half-width MARK narrowed the GEOMETRY as well')
      .toEqual(touched.map(() => PICK));
  });

  it('a drag from one half of a cell to the other marks BOTH halves', async () => {
    // MapViewport.tsx, at `cellKey`: "THE DRAG CACHE IS KEYED ON THE SPAN TOO.
    // Without it, dragging from one half of a cell to the other inside a
    // single stroke would be 'the same cursor cell, skip'".
    const ed = useEditorStore.getState();
    ed.setCollisionCrossoverBrush('hand-off');
    ed.setCollisionCrossoverSpanMode('half');
    const s = await mountMap();
    s.on().onMouseDown(tileAt(4, 2));   // the left half of cell (2, 1)
    s.on().onMouseMove(tileAt(5, 2));   // the right half of the SAME cell
    win!.dispatch('mouseup', {});
    const a = collPlane('act1', 'a');
    expect(cellSubTiles(2, 1).filter((i) => readCrossover(a[i]) !== 'none'),
      'the second half of the cell was skipped as the same cursor cell')
      .toEqual(cellSubTiles(2, 1));
  });

  it('the crossover brush is LATCHED at the press: changing it mid-drag does not split the stroke', async () => {
    useEditorStore.getState().setCollisionCrossoverBrush('hand-off');
    const s = await mountMap();
    s.on().onMouseDown(collCell(1, 1));
    useEditorStore.getState().setCollisionCrossoverBrush('keep');
    s.on().onMouseMove(collCell(2, 1));
    win!.dispatch('mouseup', {});
    const a = collPlane('act1', 'a');
    expect(cellSubTiles(2, 1).map((i) => readCrossover(a[i])),
      'a brush change mid-drag switched one gesture between marking and not')
      .toEqual(cellSubTiles(2, 1).map(() => handOffFrom('a')));
  });
});

// ── a TWO-SECTION act, for the rows that cross a section boundary ─────────────
//
// ⚠ SIZED FROM THE ENGINE CONSTANTS, for the reason the nametable is. The
// boundary is SECTION_PIXEL_SIZE world pixels in (SectionRenderer lays section
// i at (i % gridWidth) * SECTION_PIXEL_SIZE), and a fixture that typed the
// number would drift from it silently. Section 1 has its own FG fill, so a write
// into the wrong section is a wrong VALUE and not only a wrong array.

const FG_S1 = 0x0111;

/** Make act1 a 2 by 1 grid: section 0 as the fixture has it, section 1 to its right. */
function makeAct1TwoSections(): void {
  const project = useProjectStore.getState().project as unknown as {
    zones: Array<{ acts: Array<Record<string, unknown>> }>;
  };
  const act = project.zones[0].acts[0];
  act.gridWidth = 2;
  act.gridHeight = 1;
  act.sections = [
    section([OBJ(64, 64)], FG_FILL.act1),
    { ...section([], FG_S1), index: 1, name: 's1' },
  ];
}

/** The centre of tile (col, row) of act1's section `sec`, in WORLD pixels. */
const tileCentre = (sec: 0 | 1, col: number, row: number) =>
  ({ x: sec * SECTION_PIXEL_SIZE + col * 8 + 4, y: row * 8 + 4 });

// ══════════════════════════════════════════════════════════════════════════════
// THE MARQUEE CROSSING INTO ANOTHER SECTION.
//
// COVERAGE. map-coverage-3's marquee rows ran on a one-section act, where "the
// section the drag started in" and "the section the cursor is over" cannot
// differ. MapViewport.tsx states the rule at the move branch: "always resolved
// against the drag-START section's local tile space (not whatever section the
// cursor currently sits over), so dragging out of the section still
// extends/clamps the same marquee."
// ══════════════════════════════════════════════════════════════════════════════

describe('a marquee resolves against the section it STARTED in, whichever section the cursor is over', () => {
  /** The camera parked so the section boundary sits mid-VIEWPORT, at client x 320. */
  const VIEW = { vpX: SECTION_PIXEL_SIZE - 320, vpY: 0, zoom: 1 };
  /** The client point over world (x, y), through VIEWPORT and VIEW. */
  const worldAt = (p: { x: number; y: number }) => mouse(p.x - VIEW.vpX, p.y - VIEW.vpY);
  const marquee = () => useEditorStore.getState().marquee;
  const block = effectiveGranularity('block', false);

  beforeEach(() => {
    makeAct1TwoSections();
    useViewStore.setState(VIEW);
    const ed = useEditorStore.getState();
    ed.setTool('marquee');
    ed.setMarqueeGranularity('block');
    ed.setMarqueeSnapInvert(false);
    ed.setMarquee(null);
  });

  it('HARNESS: the renderer lays section 1 at the engine\'s section width, beside section 0', async () => {
    expect(SECTION_PIXEL_SIZE, 'a section is SECTION_TILES_WIDE tiles of 8px').toBe(SECTION_TILES_WIDE * 8);
    await mountMap();
    const { sectionRenderer } = await import('../MapViewport');
    expect([sectionRenderer.sectionAtWorld(SECTION_PIXEL_SIZE - 1, 0), sectionRenderer.sectionAtWorld(SECTION_PIXEL_SIZE, 0)],
      'the two-section act did not reach the renderer, so no row here crosses a boundary')
      .toEqual([0, 1]);
  });

  it('a drag from section 0 into section 1 stays in section 0, and stops at its last column', async () => {
    const start = { col: 250, row: 3 };
    const over = { col: 5, row: 4 };            // in section 1's own tile space
    const cursor = tileCentre(1, over.col, over.row);
    // The cursor in the START section's tile space. Section 0's offset is 0, so
    // that is the world pixel over 8, which lands past the section's last column.
    const inStart = { col: Math.floor(cursor.x / 8), row: Math.floor(cursor.y / 8) };
    const expected = { sectionIndex: 0, ...snapMarquee(start.col, start.row, inStart.col, inStart.row, block) };
    expect(expected, 'ANTI-VACUOUS: resolving against the cursor\'s own section would give another rect')
      .not.toEqual({ sectionIndex: 0, ...snapMarquee(start.col, start.row, over.col, over.row, block) });
    expect(expected.col + expected.w, 'ANTI-VACUOUS: the cursor is past the edge, so the rect must end AT the edge')
      .toBe(SECTION_TILES_WIDE);
    const s = await mountMap();
    s.on().onMouseDown(worldAt(tileCentre(0, start.col, start.row)));
    s.on().onMouseMove(worldAt(cursor));
    expect(marquee(), 'the marquee followed the cursor into section 1, or lost the section it started in')
      .toEqual(expected);
  });

  it('CONTROL: a drag that starts in section 1 resolves in section 1\'s own tile space', async () => {
    // Every other marquee row starts in section 0, whose offset is (0, 0), so a
    // resolution that forgot the offset, or took section 0 always, passes them.
    const s = await mountMap();
    s.on().onMouseDown(worldAt(tileCentre(1, 5, 4)));
    s.on().onMouseMove(worldAt(tileCentre(1, 9, 6)));
    expect(marquee(), 'a marquee drawn in section 1 was placed in section 0\'s tile space')
      .toEqual({ sectionIndex: 1, ...snapMarquee(5, 4, 9, 6, block) });
  });
});
