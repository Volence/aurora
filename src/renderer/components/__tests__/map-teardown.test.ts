// EVERY WAY A MAP GESTURE CAN END, AND WHICH OF THEM COMMIT.
//
// A paint drag writes into the document live and becomes ONE command on release.
// The release arrived by two routes, both pointer events: the container's own
// mouseup, and a window mouseup for a button that came up outside. A facet switch
// is neither. `LevelWorkspace` renders the facet's module as `<Canvas />`, so a
// tab switch that changes facet changes the component TYPE and unmounts
// MapViewport mid-stroke; the window-mouseup effect's cleanup removed its
// listeners and never committed, so the paint was in the section with no command
// and no undo entry (lens sweep, UNMOUNT-DISCARDS-STROKE). Two triggers need no
// pointer event at all: that tab switch, and MapViewport's OWN keydown handler,
// where saving a marquee as a chunk calls switchFacet to the art facet.
//
// THE SEAM IS THE THING WITH NO TEST. Each route is simple and each was written
// carefully; what nobody owned was the SET of them. So this file enumerates the
// routes rather than checking one.
//
// A SOURCE SCAN, because there is no jsdom here and no way to mount a React
// component in the node suite: an effect cleanup is not reachable from a pure
// module (the map-escape.ts precedent has nothing to extract here, since the
// decision is not "what should the cleanup do", it is "does the cleanup run at
// all"). It reads the comment-stripped .tsx, the panel-headings /
// panel-scrollers precedent.
//
// THE CONTROL IS ROW THREE. "Call finishGesture from every teardown" is the
// wrong rule: mouseleave is deliberately a PAUSE, and committing there would
// re-break the defect the window listener was added to fix. So the rule has to
// be able to fail in both directions, and the row that would catch the
// over-application is here beside the ones that catch the omission.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
// The repo's one comment-stripping source reader.
import { code, COMPONENTS } from './helpers/section-panels';

const MAP_VIEWPORT = join(COMPONENTS, 'MapViewport.tsx');

function mapViewport(): string {
  const src = code(MAP_VIEWPORT);
  if (!src.includes('export default function MapViewport()')) {
    throw new Error('map-teardown scan: MapViewport.tsx did not read back as source. '
      + 'The comment stripper or the path is wrong, so nothing below measured anything.');
  }
  return src;
}

/** Text from `signature` to the brace that closes it, or a throw. */
function blockAt(src: string, signature: string): string {
  const at = src.indexOf(signature);
  if (at < 0) {
    throw new Error(`map-teardown scan: could not find \`${signature}\` in MapViewport.tsx. `
      + 'Re-anchor this rule on whatever replaced it; do not delete the rule.');
  }
  const open = src.indexOf('{', at + signature.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`map-teardown scan: \`${signature}\` has no closing brace. `
    + 'The reader lost its place, so this rule measured nothing.');
}

describe('every teardown route ends the gesture through the one body', () => {
  it('commits on a release inside, a release outside, and an unmount', () => {
    const src = mapViewport();
    // Inside: the container's own handler.
    expect(blockAt(src, 'const handleMouseUp = useCallback((e: React.MouseEvent) => {'))
      .toContain('finishGesture();');
    // Outside: the window listener.
    expect(src).toContain("const onUp = (): void => finishGesture();");
    // Gone: the component itself. This is the route the sweep found open.
    expect(src, 'an unmount must end the gesture: a facet switch unmounts this component mid-stroke')
      .toContain('useEffect(() => () => { finishGestureRef.current(); }, []);');
  });

  it('makes the unmount cleanup unmount ONLY, by construction', () => {
    const src = mapViewport();
    // `[finishGesture]` would mean the same thing today and stop meaning it the
    // day someone adds a dependency to that callback, and the failure would be a
    // gesture committed halfway through an unrelated re-render. The ref is what
    // keeps "runs once, at the end" true whatever happens to the callback.
    expect(src).toContain('const finishGestureRef = useRef(finishGesture);');
    expect(src).toContain('finishGestureRef.current = finishGesture;');
    expect(src, 'the unmount effect must carry an EMPTY dep list')
      .toContain('finishGestureRef.current(); }, []);');
  });

  it('leaves the viewport as a PAUSE: mouseleave still commits nothing', () => {
    // The control. A drag that crosses the edge and comes back is one gesture;
    // committing here is the discarded-drag defect the window listener fixed,
    // running in reverse.
    const leave = blockAt(mapViewport(), 'onMouseLeave={');
    expect(leave, 'mouseleave must not commit: it is a pause').not.toContain('finishGesture');
    expect(leave).not.toContain('endPaintStroke');
    expect(leave).not.toContain('endBgStroke');
    // And it must not go back to throwing the gesture away either.
    expect(leave).not.toContain('dragTarget.current = null');
  });

  it('asks the witness BEFORE it commits anything', () => {
    // The half of this parcel that makes the other half safe: a teardown after
    // an act switch must drop the gesture, not commit act A's edit against the
    // level of act B (map-gesture-witness.ts).
    const finish = blockAt(mapViewport(), 'const finishGesture = useCallback(() => {');
    const ask = finish.indexOf('abandonStaleGestures();');
    expect(ask, 'finishGesture must ask abandonStaleGestures').toBeGreaterThan(-1);
    for (const commit of ['endGuideDrag();', 'endPaintStroke();', 'endBgStroke();', 'executeCommand']) {
      expect(finish.indexOf(commit), `abandonStaleGestures must run before ${commit}`)
        .toBeGreaterThan(ask);
    }
  });
});
