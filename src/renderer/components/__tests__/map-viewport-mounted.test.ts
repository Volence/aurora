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
import { documentHistoryHub } from '../../state/history-hub';
import type { ObjectPlacement, Section } from '../../../core/model/s4-types';
import { unpackNametableWord, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import {
  BG_OVERRIDE_CONSUMER_OUT_DIR, LAYOUT_TILE_INDEX_MASK, type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../../core/formats/bg-override/bg-anim-band';
import { packCollisionCell, unpackCollisionCell } from '../../../core/collision/collision-cell-word';
import { SECTION_PLANE_WORDS } from '../../../core/collision/collision-cell-resolve';
import { snapMarquee, effectiveGranularity, type MapClipboard } from '../../../core/editing/map-clipboard';
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

async function mountMap(): Promise<Surface> {
  win = installWindowStub();
  const mod = await import('../MapViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  const attached = attachRefs(h.el(), VIEWPORT);
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
