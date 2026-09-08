// A GESTURE THAT OUTLIVED THE THING IT GRABBED MUST WRITE NOTHING.
//
// A drag in flight survived a keyboard act switch. `App.tsx` focuses another tab
// on the number keys (a WINDOW keydown, no pointer event), the level pane is not
// keyed so nothing remounts, and every read of the subject goes through
// `getSectionByIndex`, which resolves the act FRESH. So from the switch onward
// the drag wrote an unrelated object in the new act: once per mousemove with no
// command at all, and then the release put the old act's start coordinates into
// it through a real move command, losing the original move too (lens sweep,
// DRAG-SURVIVES-ACT-SWITCH, critical).
//
// `MapViewport`'s handlers live inside React effects the node suite cannot
// reach, so the DECISION is a pure function (map-gesture-witness.ts) and the
// component acts on its verdict. That is the map-escape.ts precedent.
//
// THE CONTROL THAT MATTERS is the identical-VALUE row: two different objects
// with the same coordinates must read as stale, because the witness is identity.
// A value witness would be worse than nothing here, since this gesture writes
// live and its subject's value changes on every mousemove by design.
//
// THE FILE HAS THREE PARTS. The pure verdict; then THE MECHANISM MEASURED
// against the real `projectStore`, because the defect rests on a claim about the
// artifact (after the act changes, the held index still resolves, and resolves
// somebody else) and a claim about an artifact should be measured rather than
// argued from reading; then A SOURCE SCAN over the comment-stripped .tsx (the
// panel-headings / panel-scrollers precedent, sharing their one reader), because
// a pure verdict nobody asks for is decoration, and the four carriers the sweep
// named each had to start carrying a witness for the verdict to be answerable at
// all.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gestureStatus, gestureIsStale, gestureStaleReason, type GestureStatus } from '../map-gesture-witness';
import { useProjectStore, getCurrentAct } from '../../state/projectStore';
import { createSection } from '../../../core/model/s4-types';
import type { ObjectPlacement } from '../../../core/model/s4-types';
// The repo's one comment-stripping source reader; a second copy of
// `stripComments` is the drift these scans exist to catch.
import { code, COMPONENTS } from './helpers/section-panels';

const SECTION = { name: 'a section' };
const OTHER_SECTION = { name: 'another act\'s section at the same index' };
const ROW = { x: 16, y: 32 };

describe('gestureStatus: the act moved under a drag', () => {
  it('is intact when the act, the section and the row are all the ones it grabbed', () => {
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
    )).toBe('intact');
  });

  it('reports the act switch as the act switch, not as a section change', () => {
    // Both changed, which is what an act switch really does. The author (and the
    // next reader of a bug report) needs the cause, not the consequence.
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
      { actKey: 'ghz/act2', section: OTHER_SECTION, subject: { x: 16, y: 32 } },
    )).toBe('act-changed');
  });

  it('sees a ZONE switch that kept the act id: act1 exists in every zone', () => {
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
      { actKey: 'mz/act1', section: OTHER_SECTION, subject: ROW },
    )).toBe('act-changed');
  });

  it('is stale when the section at its index is a different section, or gone', () => {
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: null },
      { actKey: 'ghz/act1', section: OTHER_SECTION, subject: null },
    )).toBe('section-changed');
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: null },
      { actKey: 'ghz/act1', section: null, subject: null },
    )).toBe('section-changed');
  });

  it('is stale when the row it grabbed was REPLACED by one with identical values', () => {
    // The control for choosing identity over value. An undo that rebuilds the
    // rows, or a different act whose object happens to sit at the same
    // coordinates, is not the row this gesture grabbed.
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
      { actKey: 'ghz/act1', section: SECTION, subject: { x: 16, y: 32 } },
    )).toBe('subject-changed');
  });

  it('is stale when the row is gone: a shorter list still answers at that index', () => {
    const rows: Array<{ x: number; y: number }> = [];
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: ROW },
      { actKey: 'ghz/act1', section: SECTION, subject: rows[3] ?? null },
    )).toBe('subject-gone');
  });

  it('stays intact while the gesture itself moves the row it grabbed', () => {
    // The reason a JSON witness (which is right for the guide drag, whose
    // preview never touches the document) is wrong for this one.
    const live = { x: 16, y: 32 };
    const was = { actKey: 'ghz/act1', section: SECTION, subject: live };
    live.x = 999;
    live.y = -4;
    expect(gestureStatus(was, { actKey: 'ghz/act1', section: SECTION, subject: live })).toBe('intact');
  });

  it('treats a gesture that grabbed no single row (a stroke, a marquee) as intact on a null subject', () => {
    expect(gestureStatus(
      { actKey: 'ghz/act1', section: SECTION, subject: null },
      { actKey: 'ghz/act1', section: SECTION, subject: null },
    )).toBe('intact');
  });
});

describe('gestureStatus: an absent witness is never trusted', () => {
  it('answers no-witness when BOTH sides are absent, rather than intact', () => {
    // The cheapest way for this whole module to become decoration: a field
    // renamed on the gesture struct, both operands degrade to undefined, and
    // undefined === undefined agrees that nothing moved. Forever.
    expect(gestureStatus(
      { actKey: undefined as unknown as string, section: undefined, subject: undefined },
      { actKey: undefined as unknown as string, section: undefined, subject: undefined },
    )).toBe('no-witness');
  });

  it('answers no-witness for each missing field on its own', () => {
    const now = { actKey: 'ghz/act1', section: SECTION, subject: ROW };
    expect(gestureStatus({ actKey: null, section: SECTION, subject: ROW }, now)).toBe('no-witness');
    expect(gestureStatus({ actKey: 'ghz/act1', section: null, subject: ROW }, now)).toBe('no-witness');
    expect(gestureStatus({ actKey: 'ghz/act1', section: SECTION, subject: undefined }, now)).toBe('no-witness');
  });

  it('gestureIsStale is the same verdict as one bit', () => {
    const was = { actKey: 'ghz/act1', section: SECTION, subject: ROW };
    expect(gestureIsStale(was, { actKey: 'ghz/act1', section: SECTION, subject: ROW })).toBe(false);
    expect(gestureIsStale(was, { actKey: 'ghz/act2', section: SECTION, subject: ROW })).toBe(true);
  });
});

describe('gestureStaleReason covers every status the type admits', () => {
  it('has a phrase for each stale status and none for intact', () => {
    // The list is DERIVED from the union in the module, not retyped here: a
    // status added later with no phrase would otherwise pass unnoticed and the
    // author-facing notice would say "undefined".
    const src = readFileSync(join(COMPONENTS, 'map-gesture-witness.ts'), 'utf8');
    const union = src.slice(src.indexOf('export type GestureStatus'), src.indexOf(';', src.indexOf('export type GestureStatus')));
    const statuses = [...union.matchAll(/'([a-z-]+)'/g)].map((m) => m[1] as GestureStatus);
    expect(statuses.length, 'the GestureStatus union did not read back from source')
      .toBeGreaterThan(1);
    expect(statuses).toContain('intact');
    for (const status of statuses) {
      const reason = gestureStaleReason(status);
      if (status === 'intact') expect(reason).toBe(null);
      else expect(reason, `no author-facing clause for ${status}`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// THE MECHANISM, MEASURED (not argued from reading the source)
// ---------------------------------------------------------------------------
// The defect rests on one claim about the artifact: after the act changes, a
// gesture's `sectionIndex` STILL RESOLVES, and it resolves something else. If
// that read threw, or answered undefined, the drag would die loudly and there
// would be nothing to fix. So the claim is measured here against the REAL
// `projectStore` and the REAL `getCurrentAct`, which is the exact expression
// `MapViewport.getSectionByIndex` evaluates.
//
// WHAT THIS DOES NOT REPRODUCE, stated so nobody reads more into it: the pointer
// gesture itself. A real mousedown-switch-mousemove needs the running app under
// CDP, and the node suite cannot mount a React component. What is measured here
// is the resolution the gesture depends on, plus the verdict this parcel derives
// from it.

const objectAt = (x: number, y: number): ObjectPlacement => ({ x, y, typeId: 'ring-monitor', subtype: 0 });

/** Two acts in one zone, each with one section carrying one object. */
function twoActProject(): never {
  const a = createSection(0, 'act1 sec0');
  const b = createSection(0, 'act2 sec0');
  a.objects.push(objectAt(100, 100));
  b.objects.push(objectAt(700, 700));
  return {
    zones: [{
      id: 'ghz',
      name: 'GHZ',
      tileset: { tiles: [] },
      palette: { lines: [] },
      acts: [
        { id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [a] },
        { id: 'act2', name: 'act2', gridWidth: 1, gridHeight: 1, sections: [b] },
      ],
    }],
    chunkLibrary: [],
    bgLibrary: [],
  } as never;
}

/** `MapViewport.getSectionByIndex`, character for character on the read path. */
const sectionByIndex = (idx: number) => getCurrentAct(useProjectStore.getState())?.sections[idx] ?? null;
const actKeyNow = () => {
  const st = useProjectStore.getState();
  return (!st.currentZoneId || !st.currentActId) ? null : `${st.currentZoneId}/${st.currentActId}`;
};

describe('the act really does move under a held index', () => {
  it('resolves a DIFFERENT section and a DIFFERENT object at the same index, silently', () => {
    useProjectStore.getState().reset();
    useProjectStore.setState({ project: twoActProject() });
    useProjectStore.getState().setCurrentAct('ghz', 'act1');

    const grabbedSection = sectionByIndex(0)!;
    const grabbedObject = grabbedSection.objects[0];
    const witness = { actKey: actKeyNow(), section: grabbedSection, subject: grabbedObject };
    expect(gestureStatus(witness, { actKey: actKeyNow(), section: sectionByIndex(0), subject: sectionByIndex(0)?.objects[0] }))
      .toBe('intact');

    // The act switch a window keydown performs. No pointer event, no remount.
    useProjectStore.getState().setCurrentAct('ghz', 'act2');

    // THE MEASUREMENT: the same index answers, and answers somebody else.
    const nowSection = sectionByIndex(0);
    expect(nowSection, 'the index still resolves after the switch: this is why the write succeeds')
      .not.toBe(null);
    expect(nowSection).not.toBe(grabbedSection);
    expect(nowSection!.objects[0]).not.toBe(grabbedObject);
    expect(nowSection!.objects[0].x).toBe(700);

    // …and the verdict this parcel derives from it, which is what stops the write.
    expect(gestureStatus(witness, {
      actKey: actKeyNow(), section: nowSection, subject: nowSection!.objects[0],
    })).toBe('act-changed');

    // The control, and the reason the write SUCCEEDED rather than throwing: the
    // index the gesture used to carry on its own is in range on both sides.
    expect(grabbedSection.objects.length).toBeGreaterThan(0);
    expect(nowSection!.objects.length).toBeGreaterThan(0);
    // Act A's row is meanwhile untouched and still reachable through the
    // reference the gesture holds, which is what makes a revert possible after
    // the act carrying it has been closed.
    expect(grabbedObject.x).toBe(100);
    expect(gestureIsStale(
      { actKey: witness.actKey, section: grabbedSection, subject: grabbedObject },
      { actKey: actKeyNow(), section: nowSection, subject: nowSection!.objects[0] },
    )).toBe(true);

    useProjectStore.getState().reset();
  });
});

// ---------------------------------------------------------------------------
// THE WIRING: do the four carriers the sweep named actually carry a witness,
// and is the verdict asked before a write and before a commit?
// ---------------------------------------------------------------------------

const MAP_VIEWPORT = join(COMPONENTS, 'MapViewport.tsx');

function mapViewport(): string {
  const src = code(MAP_VIEWPORT);
  if (!src.includes('export default function MapViewport()')) {
    throw new Error('map-gesture-witness scan: MapViewport.tsx did not read back as source. '
      + 'The comment stripper or the path is wrong, so nothing below measured anything.');
  }
  return src;
}

/** The body of a named function in the component, or a throw. */
function body(src: string, signature: string): string {
  const at = src.indexOf(signature);
  if (at < 0) {
    throw new Error(`map-gesture-witness scan: could not find \`${signature}\` in MapViewport.tsx. `
      + 'Re-anchor this rule on whatever replaced it; do not delete the rule.');
  }
  // Enough to hold the first statements, which is all these rules are about.
  return src.slice(at, at + 1600);
}

describe('MapViewport gestures carry a witness', () => {
  it('gives all four carriers the fields a verdict needs', () => {
    const src = mapViewport();
    // The object/ring drag: the act, the section and the row it grabbed.
    const drag = body(src, 'const dragTarget = useRef<{');
    for (const field of ['actKey: string | null;', 'section: Section;', 'subject: ObjectPlacement | RingPlacement;']) {
      expect(drag, `dragTarget must carry ${field}`).toContain(field);
    }
    // The paint stroke: both arms of the union, tiles and collision.
    const stroke = body(src, 'const paintStroke = useRef<');
    expect(stroke.match(/actKey: string \| null; section: Section;/g)?.length,
      'both arms of the paint stroke union carry the witness').toBe(2);
    // The marquee drag.
    expect(body(src, 'const marqueeDragStart = useRef<')).toContain('actKey: string | null; section: Section');
    // The band stamp: the background it is writing, by identity.
    expect(src).toContain('const bandStampBg = useRef<');
  });

  it('asks the verdict before any write and before any commit, and on the act changing', () => {
    const src = mapViewport();
    // A mousemove writes; a teardown commits. Both ask first, and the act
    // switch itself asks with no pointer event at all.
    expect(body(src, 'const handleMouseMove = useCallback((e: React.MouseEvent) => {'))
      .toContain('abandonStaleGestures();');
    expect(body(src, 'const finishGesture = useCallback(() => {'))
      .toContain('abandonStaleGestures();');
    expect(src).toContain('useEffect(() => { abandonStaleGestures(); }, [currentZoneId, currentActId]);');
    // Three carriers go through the pure verdict; the fourth (the band stamp)
    // compares the background identity triple, which is the same shape.
    expect((src.match(/gestureStatus\(/g) ?? []).length,
      'the drag, the paint stroke and the marquee drag each ask gestureStatus')
      .toBeGreaterThanOrEqual(3);
    expect(src).toContain('bandStampBg.current');
  });

  it('makes a paint run per SECTION OBJECT, so one command cannot span two acts', () => {
    const src = mapViewport();
    const record = body(src, 'const cur = paintStroke.current;');
    expect(record, 'the same-run test must compare the section itself, not just its index')
      .toContain('cur.section === liveSection');
  });

  it('puts back what a dropped gesture had already written', () => {
    const src = mapViewport();
    const abandon = body(src, 'function abandonStaleGestures(): boolean {');
    // The row it grabbed goes back to where it was pressed.
    expect(abandon).toContain('drag.subject.x = drag.startX;');
    expect(abandon).toContain('drag.subject.y = drag.startY;');
    // The stroke's cells go back through the section it actually wrote.
    expect(abandon).toContain('revertPaintStroke(stroke);');
    const revert = body(src, 'function revertPaintStroke(');
    expect(revert, 'the revert must write the section the stroke HELD, not the one at its index')
      .toContain('stroke.section.tileGrid.nametable');
    // And a dropped gesture issues no command: the only honest outcome, since
    // executeCommand resolves the act that is open now.
    expect(abandon).not.toContain('executeCommand');
  });
});
