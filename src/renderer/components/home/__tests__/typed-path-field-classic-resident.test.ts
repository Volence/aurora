// CLASSIC-PATH-FIELD-RESIDENT (docs/reviews/2026-09-11-home-path-field.md, section 7 item 1).
//
// The remainder the home-path-field parcel booked: with a Sonic 1 (classic)
// project open, a FAILED open from Home's typed path box comes back with the
// box EMPTY, so a typo has to be retyped. An aeon resident, or no project at
// all, keeps the text.
//
// THE MECHANISM these rows drive, re-derived from source rather than taken from
// the booking:
//   * HomeTab renders OpenByPath at TWO positions: the no-project page and the
//     project page's switch section. It picks between them on
//     `noProject = !classicOpen && !config`.
//   * `classicProjectStore.openDirectory` begins EVERY open with
//     `set({ ...CLOSED, status: 'opening', dir })`, so `classicOpen` goes false
//     before the bridge is even asked. With no aeon `config` underneath, Home
//     flips to its no-project page for the length of the open, and stays there
//     after a failure (the store ends CLOSED with its error).
//     SINCE CLASSIC-FAILED-OPEN-CLOSES-PROJECT (2026-09-12) that is true only
//     of a COLD open: a resident classic project stays open through an open
//     and after a failure, so Home no longer flips for it. The rows below that
//     asserted the flip as a premise now assert its absence, and the flip that
//     remains (a cold open that succeeds) has a row of its own.
//   * An aeon open never clears `config` (setLoading / setError leave it), so an
//     aeon resident never flips.
//   * React keeps a component's state only while the same type sits at the same
//     position under the same parents. The two OpenByPath sites are different
//     positions, so a flip mounts a FRESH field and its `useState('')` is empty.
//
// HOW THIS SUITE SEES IT WITHOUT A DOM. `src/test/render-hooked.ts` runs a real
// component's real hooks against the real stores, but returns its children as
// data and renders none of them. So this file renders HomeTab with it, finds
// the one OpenByPath element in HomeTab's tree, and applies React's
// reconciliation rule itself: the field is identified by its TRAIL (the type
// and slot of every ancestor from HomeTab's root), a new trail mounts a new
// OpenByPath through render-hooked (fresh state, exactly as React would), and
// the old one is unmounted. That rule is the modelled part, and the weaker
// evidence: a foreground pass on a real screen is the confirmation.
//
// The opener is the REAL `useProject.openProjectPath` over the REAL classic
// store, reached through its bridge seam. The bridge is GATED, so a row can look
// at Home while the open is in flight, which is where the flip happens.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type React from 'react';

vi.mock('../../../shell/project-open-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shell/project-open-guard')>()),
  confirmProjectOpen: vi.fn(async () => true),
}));
vi.mock('../../../state/aeon-open', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/aeon-open')>()),
  openAeonProject: vi.fn(async () => true),
}));
vi.mock('../../../state/recents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state/recents')>()),
  loadRecents: vi.fn(async () => []),
  recordRecentProject: vi.fn(async () => []),
}));

import HomeTab, { type HomeTabProps } from '../HomeTab';
import OpenByPath, { type OpenByPathProps } from '../OpenByPath';
import { openProjectPath } from '../../../hooks/useProject';
import { confirmProjectOpen } from '../../../shell/project-open-guard';
import { openAeonProject } from '../../../state/aeon-open';
import {
  useClassicProjectStore,
  __setClassicBridgeForTest,
  __resetClassicBridgeForTest,
} from '../../../state/classicProjectStore';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useProjectStore } from '../../../state/projectStore';
import type { ClassicBridge, ClassicOpenResult } from '../../../state/classic-bridge';
import type { ProjectHandle } from '../../../../core/project/adapter';
import type { LoadedS4Config } from '../../../../core/config/s4-config';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';

// -- the stores' side ---------------------------------------------------------

function classicHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [],
      read: async () => { throw new Error('not used'); },
      write: async () => { throw new Error('not used'); },
    },
  };
}

const OPENED: ClassicOpenResult = { kind: 'opened', handle: classicHandle(), label: 'Sonic 1 Disassembly' };
const NEITHER: ClassicOpenResult = { kind: 'not-classic', aeon: false };

/** A bridge that answers only when released, so a row can look at Home mid-open. */
function gatedBridge(result: ClassicOpenResult): ClassicBridge & { calls: string[]; release(): void } {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return {
    calls,
    open: async (dir: string) => { calls.push(dir); await gate; return result; },
    release: () => release(),
  };
}

/** A classic project, opened for real through the real opener, and resident. */
async function openClassicResident(dir: string): Promise<void> {
  __setClassicBridgeForTest({ open: async () => OPENED });
  await expect(openProjectPath(dir)).resolves.toBe(true);
  const st = useClassicProjectStore.getState();
  expect(st.status, 'premise: a classic project is resident').toBe('open');
  expect(st.dir).toBe(dir);
}

/** Every promise chain queued so far has run: the mocks resolve on microtasks only. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// -- the modelled screen: HomeTab, and React's rule for the field's identity --

type El = React.ReactElement<Record<string, unknown>>;

function typeName(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.name || 'anonymous';
  return String(type);
}

/**
 * Every OpenByPath in `node`, with its trail. React matches a child to its
 * previous fiber by key if it has one and by index otherwise, and keeps state
 * only when the type at that slot is unchanged all the way down; a nested array
 * occupies one slot of its own. The trail spells exactly that.
 */
function fieldsIn(node: unknown, trail: string, out: { trail: string; el: El }[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      const key = child && typeof child === 'object' && (child as El).key != null ? `k=${(child as El).key}` : String(i);
      fieldsIn(child, `${trail}[${key}]`, out);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  const el = node as El;
  const here = `${trail}<${typeName(el.type)}>`;
  if (el.type === OpenByPath) { out.push({ trail: here, el }); return; }
  fieldsIn(el.props ? (el.props as { children?: unknown }).children : undefined, here, out);
}

interface Screen {
  home: Hooked<HomeTabProps>;
  field: { trail: string; hooked: Hooked<OpenByPathProps> } | null;
  /** How many OpenByPath instances React would have mounted so far. */
  mounts: number;
  /** Every open the field started, so a row can wait for them. */
  inflight: Promise<boolean | undefined>[];
}

const screens: Screen[] = [];

function screen(): Screen {
  const s: Screen = { home: null as unknown as Hooked<HomeTabProps>, field: null, mounts: 0, inflight: [] };
  const onOpenPath = (dir: string): Promise<boolean | undefined> => {
    const p = openProjectPath(dir);
    s.inflight.push(p);
    return p;
  };
  s.home = renderHooked(HomeTab, { onOpenProject: () => {}, onOpenRecent: () => {}, onOpenPath });
  screens.push(s);
  return s;
}

/** Re-render Home and reconcile the field: same trail keeps it, a new trail remounts. */
function commit(s: Screen): Hooked<OpenByPathProps> {
  const found: { trail: string; el: El }[] = [];
  fieldsIn(s.home.el(), '', found);
  expect(found.length, 'Home renders exactly one path field').toBe(1);
  const { trail, el } = found[0];
  const props = el.props as unknown as OpenByPathProps;
  if (s.field && s.field.trail === trail) {
    s.field.hooked.setProps(props);
  } else {
    s.field?.hooked.unmount();
    s.field = { trail, hooked: renderHooked(OpenByPath, props) };
    s.mounts += 1;
  }
  return s.field.hooked;
}

/** Field instances mounted so far, AFTER reconciling what Home renders now. */
function mounted(s: Screen): number {
  commit(s);
  return s.mounts;
}

function value(s: Screen): unknown {
  return commit(s).find('input').props.value;
}

function label(s: Screen): string {
  return commit(s).props().label;
}

function type(s: Screen, text: string): void {
  (commit(s).find('input').props.onChange as (e: unknown) => void)({ target: { value: text } });
  // Loud on unmeasurable: a keystroke that never reached the field would make
  // every "the text survives" below a statement about an empty string.
  expect(value(s), 'premise: the typed text is in the field').toBe(text);
}

function pressEnter(s: Screen): void {
  let prevented = false;
  (commit(s).find('input').props.onKeyDown as (e: unknown) => void)({
    key: 'Enter', preventDefault: () => { prevented = true; },
  });
  expect(prevented, 'premise: Enter was taken as a submit').toBe(true);
}

async function settleOpens(s: Screen): Promise<void> {
  await Promise.allSettled(s.inflight);
  await tick();
}

const RESIDENT = '/p/s1';
const TYPO = '/p/s1-tpyo';
const OTHER = '/p/s1-other';
const NEXT = '/p/typed-while-loading';

// -- the rows ------------------------------------------------------------------

describe('CLASSIC-PATH-FIELD-RESIDENT · Home keeps the typed path across its page flip', () => {
  beforeEach(() => {
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useProjectStore.getState().reset();
    vi.mocked(confirmProjectOpen).mockReset().mockResolvedValue(true);
    vi.mocked(openAeonProject).mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    for (const s of screens.splice(0)) {
      s.field?.hooked.unmount();
      s.home.unmount();
    }
    __resetClassicBridgeForTest();
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useProjectStore.getState().reset();
  });

  it('REPRODUCTION: a classic project resident, a FAILED open keeps the typo in the field', async () => {
    await openClassicResident(RESIDENT);
    const s = screen();
    const before = label(s);
    type(s, TYPO);
    const b = gatedBridge(NEITHER);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    // These premises used to measure the flip ('opening', a second field). The
    // resident project now stays open mid-open, so they pin its absence.
    expect(useClassicProjectStore.getState().status, 'premise: the resident project stays open mid-open').toBe('open');
    expect(b.calls, 'premise: the bridge was asked for the typed path').toEqual([TYPO]);
    expect(label(s), 'premise: Home stays on the project page').toBe(before);
    expect(mounted(s), 'premise: one field throughout').toBe(1);
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().error, 'premise: the open failed').toMatch(/is not a recognized project/);
    expect(value(s), 'the typo survives the failed open').toBe(TYPO);
  });

  it('REPRODUCTION: while a classic switch is in flight, the field still shows what was submitted', async () => {
    await openClassicResident(RESIDENT);
    const s = screen();
    type(s, OTHER);
    const b = gatedBridge(OPENED);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    expect(mounted(s), 'premise: one field throughout (Home no longer flips for a classic resident)').toBe(1);
    expect(value(s), 'the submitted text is still in the field mid-open').toBe(OTHER);
    b.release();
    await settleOpens(s);
  });

  it('REPRODUCTION: text typed WHILE a classic switch is in flight survives its success', async () => {
    await openClassicResident(RESIDENT);
    const s = screen();
    type(s, OTHER);
    const b = gatedBridge(OPENED);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    expect(mounted(s), 'premise: one field throughout (Home no longer flips for a classic resident)').toBe(1);
    type(s, NEXT);
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().dir, 'premise: the switch succeeded').toBe(OTHER);
    expect(mounted(s), 'premise: still one field after the switch').toBe(1);
    expect(value(s), 'what was typed during the open is kept').toBe(NEXT);
  });

  it('the cold open flip: text typed WHILE the open is in flight survives its success', async () => {
    // The flip that remains: with nothing open, Home sits on its no-project page
    // for the whole open and moves to the project page when it succeeds, so
    // React mounts a fresh field there. This is the row that still needs the
    // typed path held by HomeTab rather than by either field.
    const s = screen();
    type(s, OTHER);
    const b = gatedBridge(OPENED);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    expect(useClassicProjectStore.getState().status, 'premise: the open is in flight').toBe('opening');
    expect(mounted(s), 'premise: still the no-project page, one field so far').toBe(1);
    type(s, NEXT);
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().dir, 'premise: the open succeeded').toBe(OTHER);
    expect(mounted(s), 'premise: Home flipped to the project page and mounted a second field').toBe(2);
    expect(value(s), 'what was typed during the open is kept').toBe(NEXT);
  });

  it('a SUCCESSFUL switch between classic projects still empties the field', async () => {
    await openClassicResident(RESIDENT);
    const s = screen();
    type(s, OTHER);
    const b = gatedBridge(OPENED);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().status, 'premise: the switch succeeded').toBe('open');
    expect(useClassicProjectStore.getState().dir).toBe(OTHER);
    expect(value(s), 'the spent path is gone').toBe('');
  });

  it('CONTROL: no project open, a failed open keeps the typo (Home never flips)', async () => {
    const s = screen();
    type(s, TYPO);
    const b = gatedBridge(NEITHER);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    expect(useClassicProjectStore.getState().status, 'premise: the open is in flight').toBe('opening');
    expect(mounted(s), 'premise: one field throughout').toBe(1);
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().error, 'premise: the open failed').toMatch(/is not a recognized project/);
    expect(mounted(s)).toBe(1);
    expect(value(s)).toBe(TYPO);
  });

  it('CONTROL: an aeon project resident, a failed open keeps the typo (Home never flips)', async () => {
    useProjectStore.setState({
      config: { name: 'Aeon Checkout', zones: [], basePath: '/p/aeon' } as unknown as LoadedS4Config,
    });
    const s = screen();
    const before = label(s);
    type(s, TYPO);
    const b = gatedBridge(NEITHER);
    __setClassicBridgeForTest(b);
    pressEnter(s);
    await tick();
    expect(useClassicProjectStore.getState().status, 'premise: the open is in flight').toBe('opening');
    expect(label(s), 'premise: still the project page').toBe(before);
    expect(mounted(s), 'premise: one field throughout').toBe(1);
    b.release();
    await settleOpens(s);
    expect(useClassicProjectStore.getState().error, 'premise: the open failed').toMatch(/is not a recognized project/);
    expect(vi.mocked(openAeonProject)).not.toHaveBeenCalled();
    expect(mounted(s)).toBe(1);
    expect(value(s)).toBe(TYPO);
  });
});
