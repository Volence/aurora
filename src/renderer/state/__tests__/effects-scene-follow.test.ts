// SCENE-SELECTION-SNAPS-BACK: the scene selection follows a change of the
// active section and nothing else.
//
// Two layers, both over real code:
//   - the pure step (`sceneSelectionFollowStep`, providers/effects-aeon), one
//     row per field of the identity, so dropping any field from the comparison
//     reddens exactly the row about it;
//   - the subscription (`installEffectsSceneFollow`) over the REAL project and
//     editor stores and the REAL history hub. These are the P1..P4 properties
//     of docs/reviews/2026-09-12-scene-selection-snaps-back.md.
//
// ⚠ WHAT THIS FILE CANNOT SEE. The defect was a React effect running on a
// panel MOUNT. There is no mount here; the subscription has no mount to run on,
// which is the point of the design, but a regression that put the follow back
// into a component would not be caught by these rows. The runtime proof is
// `harness:raster-timeline`: rows 6a and 6b and the row-7 stop are red on master
// and green on the fix. `harness:effects-scene-selection` holds C2's arrival and
// section follow.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useEditorStore } from '../editorStore';
import { documentHistoryHub } from '../history-hub';
import { installEffectsSceneFollow } from '../effects-scene-follow';
import {
  sceneSelectionFollowStep, sameSectionIdentity, type SectionIdentity,
} from '../../providers/effects-aeon';
import type { S4Project } from '../../../core/model/s4-types';
import type { EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import type { UndoStack } from '../../../core/editing/undo-stack';

// ── fixture ──────────────────────────────────────────────────────────────────

const SCENES = ['depth', 'floor', 'start', 'water'];
const library = (ids: string[] = SCENES): EffectsSceneLibrary =>
  ({ scenes: ids.map((id) => ({ id, layers: [] })), unreadable: [] }) as unknown as EffectsSceneLibrary;

/** acts: zone id -> act id -> each section's sceneRef, in section order. */
function project(basePath: string,
  acts: Record<string, Record<string, (string | null)[]>>, ids: string[] = SCENES): S4Project {
  return {
    basePath,
    zones: Object.entries(acts).map(([zid, byAct]) => ({
      id: zid,
      acts: Object.entries(byAct).map(([aid, refs]) => ({
        id: aid, sections: refs.map((sceneRef) => ({ sceneRef })),
      })),
    })),
    effectsScenes: library(ids),
    chunkLibrary: [],               // `addChunks` spreads it (the P4 row below)
  } as unknown as S4Project;
}

// Section 0 binds `start`, 3 binds `floor`, 4 binds `depth`, 5 the act default,
// 6 a ref no readable scene claims. `water` is bound by nobody: the scene an
// author picks by hand.
const REFS: (string | null)[] = ['start', null, null, 'floor', 'depth', null, 'gone', null, 'floor'];
const TWO_ACTS = { ojz: { act1: REFS, act2: [...REFS] }, ghz: { act1: [...REFS] } };

function open(p: S4Project, zone = 'ojz', act = 'act1'): void {
  useProjectStore.setState({ project: p, currentZoneId: zone, currentActId: act });
}
const selected = (): string | null => useEditorStore.getState().selectedEffectsSceneId;
const pick = (id: string): void => useEditorStore.getState().setSelectedEffectsSceneId(id);
const toSection = (i: number): void => useEditorStore.getState().setActiveSectionIndex(i);

// A real hub listener needs a real registered stack to notify from.
let fireHistory: () => void = () => { throw new Error('no stack registered'); };
const DOC = 'test-scene-follow:doc';

let stop: (() => void) | null = null;
beforeEach(() => {
  useProjectStore.getState().reset();
  useEditorStore.setState({ activeSectionIndex: 0, selectedEffectsSceneId: null, effectsSubTab: 'parallax' });
  documentHistoryHub.registerFactory('test-scene-follow:', () => ({
    onChange: (cb: () => void) => { fireHistory = cb; return () => {}; },
    clear: () => {},
  }) as unknown as UndoStack);
  documentHistoryHub.historyFor(DOC);
});
afterEach(() => {
  stop?.();
  stop = null;
  documentHistoryHub.dispose(DOC);
});

// ── the pure step ────────────────────────────────────────────────────────────

const ID: SectionIdentity = {
  projectPath: '/p', zoneId: 'ojz', actId: 'act1', sectionIndex: 0, sceneRef: 'start',
};

describe('sceneSelectionFollowStep: follow a CHANGE of section, never a repeat of one', () => {
  it('the first step ever is an arrival and follows', () => {
    expect(sceneSelectionFollowStep(null, ID, library(), null)).toBe('start');
  });

  it('the SAME identity never moves the selection, whatever is selected', () => {
    expect(sceneSelectionFollowStep({ ...ID }, ID, library(), 'water')).toBeNull();
    expect(sameSectionIdentity({ ...ID }, ID)).toBe(true);
  });

  // One row per field: a comparison that forgot any of them would call a
  // different section "the same one" and keep a stale pick across it.
  const changed: [keyof SectionIdentity, SectionIdentity[keyof SectionIdentity]][] = [
    ['projectPath', '/other-checkout'],
    ['zoneId', 'ghz'],
    ['actId', 'act2'],
    ['sectionIndex', 4],
    ['sceneRef', 'floor'],
  ];
  for (const [field, value] of changed) {
    it(`a different ${field} is a different section and follows`, () => {
      const next = { ...ID, [field]: value } as SectionIdentity;
      expect(sameSectionIdentity(ID, next)).toBe(false);
      expect(sceneSelectionFollowStep(ID, next, library(), 'water')).toBe(next.sceneRef);
    });
  }

  it('nothing to follow to: the act default, an unreadable ref, no library', () => {
    expect(sceneSelectionFollowStep(ID, { ...ID, sceneRef: null }, library(), 'water')).toBeNull();
    expect(sceneSelectionFollowStep(ID, { ...ID, sceneRef: 'gone' }, library(), 'water')).toBeNull();
    expect(sceneSelectionFollowStep(null, ID, null, 'water')).toBeNull();
  });

  it('already on the section\'s scene: no write', () => {
    expect(sceneSelectionFollowStep(null, ID, library(), 'start')).toBeNull();
  });
});

// ── the subscription, over the real stores ───────────────────────────────────

describe('installEffectsSceneFollow: P2, the section is followed', () => {
  it('arrival: a project already open when it installs is followed', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    expect(selected()).toBe('start');
  });

  it('arrival: opening a project after it installs is followed', () => {
    stop = installEffectsSceneFollow();
    expect(selected()).toBeNull();
    open(project('/p', TWO_ACTS));
    expect(selected()).toBe('start');
  });

  it('changing the active section follows, from a scene the author picked', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    toSection(4);
    expect(selected()).toBe('depth');
  });

  it('a section change that comes BACK to where it started still follows (A -> B -> A)', () => {
    // The case a "compare at the next mount" design cannot see: the author
    // changes section on another sub-tab and comes back before Parallax mounts.
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    toSection(3);
    toSection(0);
    expect(selected()).toBe('start');
  });

  it('SECTION ASSIGNMENT follows: an in-place sceneRef edit is seen through the history hub', () => {
    const p = project('/p', TWO_ACTS);
    open(p);
    stop = installEffectsSceneFollow();
    pick('water');
    // What `set-section-scene` does: mutate the act, then the stack notifies.
    const s0 = p.zones[0].acts[0].sections[0];
    if (!s0) throw new Error('fixture: section 0 is missing');
    s0.sceneRef = 'floor';
    expect(selected()).toBe('water');       // no store changed identity yet
    fireHistory();
    expect(selected()).toBe('floor');
  });

  it('a section bound to nothing leaves the selection where it is', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    toSection(5);
    expect(selected()).toBe('water');
    toSection(6);                            // `gone`: no readable scene claims it
    expect(selected()).toBe('water');
  });
});

describe('installEffectsSceneFollow: P1, a pick survives everything that is not a section change', () => {
  it('sub-tab round trips, a scene edit and unrelated editor traffic keep the pick', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    useEditorStore.getState().setEffectsSubTab('colour');
    useEditorStore.getState().setEffectsSubTab('parallax');
    useEditorStore.getState().setEffectsSubTab('tileAnim');
    useEditorStore.getState().setEffectsSubTab('parallax');
    fireHistory();                           // an edit to a scene: same section
    useEditorStore.setState({ collisionBrushSize: 3 });
    expect(selected()).toBe('water');
  });
});

describe('installEffectsSceneFollow: P3, the same NUMBER elsewhere is a different section', () => {
  it('another act, same section index, same sceneRef: follows', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(selected()).toBe('start');
  });

  it('another zone, same act id, same index, same sceneRef: follows', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    useProjectStore.getState().setCurrentAct('ghz', 'act1');
    expect(selected()).toBe('start');
  });

  it('another checkout with the same zone, act and refs: follows', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    open(project('/another-checkout', TWO_ACTS));
    expect(selected()).toBe('start');
  });
});

describe('installEffectsSceneFollow: P4, a re-parse of the same scenes does not yank a pick', () => {
  it('a same-directory reopen (a fresh project object, the same scenes) keeps the pick', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    open(project('/p', TWO_ACTS));
    expect(selected()).toBe('water');
  });

  it('an edit that replaces the project object (addChunks) keeps the pick', () => {
    open(project('/p', TWO_ACTS));
    stop = installEffectsSceneFollow();
    pick('water');
    useProjectStore.getState().addChunks([]);
    expect(selected()).toBe('water');
  });
});

describe('installEffectsSceneFollow: lifecycle', () => {
  it('installing twice is one follower, and uninstalling stops it', () => {
    stop = installEffectsSceneFollow();
    expect(installEffectsSceneFollow()).toBe(stop);
    stop();
    stop = null;
    open(project('/p', TWO_ACTS));
    expect(selected()).toBeNull();
  });
});
