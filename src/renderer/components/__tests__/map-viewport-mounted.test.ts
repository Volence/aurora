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

// ── the fixture ────────────────────────────────────────────────────────────────

const OBJ = (x: number, y: number): ObjectPlacement => ({ x, y, typeId: 'monitor', subtype: 0 });

/** A section with objects and nothing else, at the smallest shape `MapViewport`
 *  and the object commands both read. Nothing here draws anything real. */
function section(objects: ObjectPlacement[]): Section {
  return {
    index: 0,
    name: 's0',
    tileGrid: { widthTiles: 8, heightTiles: 8, nametable: new Uint16Array(64) },
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
        { id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section([OBJ(64, 64)])] },
        { id: 'act2', name: 'act2', gridWidth: 1, gridHeight: 1, sections: [section([OBJ(600, 400)])] },
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
