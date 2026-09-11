// CENSUS B-F3: AFTER A DIRTY LEVEL TAB IS CLOSED, SOMETHING ON SCREEN STILL
// SAYS UNSAVED WORK EXISTS.
// Packets: docs/reviews/2026-09-11-uxpair-census.md §2.4 (the finding, at
// master) and docs/reviews/2026-09-11-uxpair-tail.md (this fix).
//
// THE MECHANISM, read from source before anything here was written. Closing a
// level tab runs `requestCloseTab` (tab-activation/dispatch.ts): the session
// reducer drops the tab (core/shell/session.ts `closeTab`, a pure filter) and
// `disposeStacksForClosedTab` KEEPS the undo stack while the act is dirty. Nothing
// unloads the act: the classic edit stays in `useClassicLevelStore` (`doc` +
// `dirty`), the aeon one in `useEditorStore` (`dirty` / `dirtyActs`). Owner card
// d-38 ruled that this close does not prompt, and nothing here changes that. What
// was missing was a surface: the tab's dot was the only place the app said
// "unsaved", and the close took it away.
//
// THE PREDICATE EVERY ROW READS is "the rule a surface renders from says
// unsaved": `hasUnsavedWork` (window title), `explorerRowDirty` /
// `explorerGroupDirty` (Explorer rows and group header). No jsdom here, so the
// pixels are the foreground run's (packet §4); the last describe holds the seam
// from each component to its rule by reading the source as text.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestCloseTab } from '../tab-activation';
import {
  hasUnsavedWork, unsavedKinds, unsavedElsewhereMessage, explorerRowDirty, explorerGroupDirty,
  tabHasDirtyDot, type DirtySnapshot,
} from '../dirty-tabs';
import { currentDirtySnapshot } from '../dirty-snapshot';
import { classicLevelTab } from '../tabs';
import { classicExplorerGroups, aeonExplorerGroups } from '../explorer-data';
import { windowTitle, UNSAVED_TITLE_MARKER } from '../window-title';
import { useSessionStore } from '../../state/sessionStore';
import { useProjectStore } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useEditorStore } from '../../state/editorStore';
import { documentHistoryHub } from '../../state/history-hub';

const CLEAN: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false,
  dirtySpriteDocIds: [], dirtyCanvasDocIds: [], artDirty: false,
};

const NO_CANVASES = { names: [], skipped: [] };
const GHZ1_REF = { zone: 'ghz', act: 1, label: 'GHZ 1', available: true };
const GHZ2_REF = { zone: 'ghz', act: 2, label: 'GHZ 2', available: true };

/** The Levels group exactly as the Explorer builds it for a classic project. */
function classicLevelsGroup() {
  const g = classicExplorerGroups([GHZ1_REF, GHZ2_REF], null, false, NO_CANVASES).find((x) => x.id === 'levels');
  if (!g) throw new Error('classicExplorerGroups built no levels group: the fixture no longer measures the Explorer');
  return g;
}

// ---------------------------------------------------------------------------
// THE FINDING, driven through the real close.
// ---------------------------------------------------------------------------

describe('B-F3: a dirty level tab closes, and the unsaved state is still readable', () => {
  const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
  const GHZ1 = classicLevelTab(GHZ1_REF);

  beforeEach(() => {
    useSessionStore.getState().reset();
    documentHistoryHub.clearAll();
    useClassicProjectStore.setState({ status: 'closed' } as never);
    useProjectStore.setState({ project: null } as never);
    useEditorStore.getState().markClean();
  });

  afterEach(() => {
    useClassicProjectStore.setState({ status: 'closed' } as never);
    useClassicLevelStore.setState({ ref: null, dirty: {} } as never);
  });

  it('the Explorer row id IS the tab id, so the row and the tab are asking about one level', () => {
    // Derived from the two builders, not assumed: if either spelling drifts,
    // explorerRowDirty would be asking about a level no tab is named for.
    expect(classicLevelsGroup().items.map((i) => i.id)).toContain(GHZ1.id);
  });

  it('after the close: the tab is GONE, and the window title and the Explorer row still say unsaved', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1], activeId: GHZ1.id });
    useClassicProjectStore.setState({ status: 'open' } as never);
    useClassicLevelStore.setState({ ref: { zone: 'ghz', act: 1 }, dirty: { layout: true } } as never);

    await requestCloseTab(GHZ1.id);

    // The premise, asserted: the tab (and so its dot) is gone, and the close
    // kept the edit rather than discarding it.
    expect(useSessionStore.getState().tabs.map((t) => t.id)).not.toContain(GHZ1.id);
    const snap = currentDirtySnapshot();
    expect(snap.classicDirty).toBe(true);

    // THE RECEIPT. Before this parcel, no rule any mounted surface rendered from
    // returned true here: the only one that did was the tab's, and the tab is gone.
    expect(hasUnsavedWork(snap)).toBe(true);
    expect(windowTitle({ projectName: 'Sonic 1', tabTitle: null, unsaved: hasUnsavedWork(snap) })
      .startsWith(`${UNSAVED_TITLE_MARKER} `)).toBe(true);
    const levels = classicLevelsGroup();
    expect(explorerRowDirty(GHZ1.id, snap)).toBe(true);
    expect(explorerGroupDirty(levels.items, snap)).toBe(true);
    // And ONLY the loaded act: act 2 was never edited.
    expect(explorerRowDirty(classicLevelTab(GHZ2_REF).id, snap)).toBe(false);
  });

  it('CONTROL: a CLEAN level tab closes, and nothing claims unsaved work', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1], activeId: GHZ1.id });
    useClassicProjectStore.setState({ status: 'open' } as never);
    useClassicLevelStore.setState({ ref: { zone: 'ghz', act: 1 }, dirty: {} } as never);

    await requestCloseTab(GHZ1.id);

    const snap = currentDirtySnapshot();
    expect(hasUnsavedWork(snap)).toBe(false);
    expect(windowTitle({ projectName: 'Sonic 1', tabTitle: null, unsaved: hasUnsavedWork(snap) }))
      .toBe('Aurora - Sonic 1');
    expect(explorerGroupDirty(classicLevelsGroup().items, snap)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The rules themselves.
// ---------------------------------------------------------------------------

describe('explorerRowDirty: the Explorer asks the tab strip\'s own question', () => {
  const aeonIds = aeonExplorerGroups(
    [{ id: 'ojz', name: 'OJZ', acts: [{ id: 'act1' }, { id: 'act2' }] }], [], NO_CANVASES,
  ).flatMap((g) => g.items.map((i) => i.id));
  const aeonLevelIds = aeonIds.filter((id) => id.startsWith('level:'));

  it('LOUD WHEN IT CANNOT MEASURE: the aeon builder produced level rows and other rows', () => {
    expect(aeonLevelIds).toEqual(['level:ojz:act1', 'level:ojz:act2']);
    expect(aeonIds.length).toBeGreaterThan(aeonLevelIds.length);
  });

  it('agrees with tabHasDirtyDot on every level row, across the snapshots that dot', () => {
    const snaps: DirtySnapshot[] = [
      CLEAN,
      { ...CLEAN, aeonOpen: true, aeonDirty: true },
      { ...CLEAN, aeonOpen: true, artDirty: true },
      { ...CLEAN, classicOpen: true, classicRef: { zone: 'ojz', act: 1 }, classicDirty: true },
    ];
    for (const s of snaps) {
      for (const id of aeonLevelIds) {
        expect(explorerRowDirty(id, s), `${id} ${JSON.stringify(s)}`).toBe(tabHasDirtyDot(id, 'level', s));
      }
    }
  });

  it('aeon: a dirty project dots EVERY level row, the same honest aggregate the tabs use', () => {
    const s = { ...CLEAN, aeonOpen: true, aeonDirty: true };
    expect(aeonLevelIds.every((id) => explorerRowDirty(id, s))).toBe(true);
  });

  it('never dots a row that is not a level, however much is dirty', () => {
    const everything: DirtySnapshot = {
      ...CLEAN, aeonOpen: true, aeonDirty: true, artDirty: true,
      dirtySpriteDocIds: ['doc:sprite:aeon:ring'], dirtyCanvasDocIds: ['doc:canvas:sky'],
    };
    const nonLevel = [...aeonIds.filter((id) => !id.startsWith('level:')),
      'doc:sprite:aeon:ring', 'doc:canvas:sky', 'recent:/tmp/p', 'obj:37'];
    expect(nonLevel.length).toBeGreaterThan(4);
    for (const id of nonLevel) expect(explorerRowDirty(id, everything), id).toBe(false);
  });
});

describe('hasUnsavedWork: the window title and the Ctrl+S toast read one list', () => {
  const cases: DirtySnapshot[] = [
    CLEAN,
    { ...CLEAN, classicOpen: true, classicRef: { zone: 'ghz', act: 1 }, classicDirty: true },
    { ...CLEAN, aeonOpen: true, aeonDirty: true },
    { ...CLEAN, aeonOpen: true, artDirty: true },
    { ...CLEAN, dirtySpriteDocIds: ['doc:sprite:s1:37'] },
    { ...CLEAN, dirtyCanvasDocIds: ['doc:canvas:sky'] },
  ];

  it('is true exactly when the toast would name something, for every kind', () => {
    for (const s of cases) {
      expect(hasUnsavedWork(s), JSON.stringify(s)).toBe(unsavedElsewhereMessage(s) !== null);
      expect(hasUnsavedWork(s)).toBe(unsavedKinds(s).length > 0);
    }
  });

  it('every kind the toast knows turns it on, and the clean app leaves it off', () => {
    expect(hasUnsavedWork(CLEAN)).toBe(false);
    expect(cases.slice(1).every(hasUnsavedWork)).toBe(true);
  });
});

describe('windowTitle', () => {
  it('a clean app keeps the title it always had', () => {
    expect(windowTitle({ projectName: 'OJZ Project', tabTitle: 'OJZ · act1', unsaved: false }))
      .toBe('Aurora - OJZ Project - OJZ · act1');
    expect(windowTitle({ projectName: undefined, tabTitle: null, unsaved: false })).toBe('Aurora');
  });

  it('unsaved work puts the marker FIRST, where a truncating taskbar keeps it', () => {
    expect(UNSAVED_TITLE_MARKER).toBe('●');
    expect(windowTitle({ projectName: 'OJZ Project', tabTitle: null, unsaved: true }))
      .toBe('● Aurora - OJZ Project');
  });
});

// ---------------------------------------------------------------------------
// THE SEAMS. A pure rule nothing renders from holds nothing.
// ---------------------------------------------------------------------------

describe('each surface renders from its rule', () => {
  const SHELL = join(__dirname, '..');
  const read = (rel: string) => readFileSync(join(SHELL, rel), 'utf8');
  const app = read('../App.tsx');
  const title = read('WindowTitle.tsx');
  const explorer = read('Explorer.tsx');
  const tabStrip = read('TabStrip.tsx');

  it('LOUD WHEN IT CANNOT MEASURE: every file was read', () => {
    for (const t of [app, title, explorer, tabStrip]) expect(t.length).toBeGreaterThan(500);
    expect(app).toContain('export default function App');
  });

  it('the window title: WindowTitle sets it from the rule, and App mounts it and no longer sets it', () => {
    expect(title).toMatch(/document\.title\s*=\s*windowTitle\(/);
    expect(title).toContain('hasUnsavedWork(useDirtySnapshot())');
    // THE MOUNT AS A JSX LINE OF ITS OWN, not the substring. App.tsx's comment
    // names `<WindowTitle />` too, and a plain `toContain` was satisfied by that
    // comment with the mount deleted: measured, the row stayed green over it.
    expect(app).toMatch(/^\s*<WindowTitle \/>\s*$/m);
    expect(app).not.toMatch(/document\.title\s*=/);
  });

  it('the Explorer: each row gets explorerRowDirty, the group header explorerGroupDirty, both drawn as the dot', () => {
    expect(explorer).toContain('const dirtySnap = useDirtySnapshot();');
    expect(explorer).toMatch(/dirty=\{explorerRowDirty\(item\.id, dirtySnap\)\}/);
    expect(explorer).toMatch(/\{dirty && <DirtyDot /);
    expect(explorer).toMatch(/explorerGroupDirty\(g\.items, dirtySnap\) && <DirtyDot /);
  });

  it('the tab strip draws the same dot, and its comment no longer says it is the only place', () => {
    expect(tabStrip).toContain('<DirtyDot title={DIRTY_DOT_TITLE} />');
    expect(tabStrip).not.toContain('THE DOT IS THE ONLY PLACE');
  });
});
