// PASTE-STATUS-BAR-HINT and PASTE-SAME-ZONE-ART-ONLY-SHIFT, the two items left
// open (O-1, O-2) by docs/reviews/2026-09-12-paste-hint-and-chosen.md, whose
// rows sit beside this file in paste-hint-and-chosen.test.ts.
//
// ═══ THE ORACLE ═══
//
// What a paste click does is decided in MapViewport's paste branch, in two
// checks, in this order:
//
//     refusal = pasteRefusal(pasteFit(clip, open tile set, open project),
//                            effectivePasteLayers(clip, layers))
//     if refusal: toast it, leave paste mode           (REFUSED)
//     if effectivePasteLayers(clip, layers) === null: toast, write nothing
//                                                      (NOTHING)
//     else: paste                                      (LANDS)
//
// where `layers` is Alt+click art only, Shift+click collision only, and a plain
// click the Paste layers setting. `verdict` below is those two checks over the
// same stores the bar and the panel read, and `gestureLayers` is that modifier
// mapping (held to the click's own `pasteClickLayers` by the sibling file's seam
// row). Every expectation here is one of those, never a typed copy of a line.
//
// ═══ THE INSTRUMENT ═══
//
// Two surfaces state what a paste click does while pasting: the Paste panel's
// hint line (MarqueePasteOptions) and the map status bar's trailing span. Both
// are rendered for real: `renderHooked` runs the panel body, and the aeon bar
// component the map facets mount (`mapFacet(...).StatusBar`, which IS
// AeonMapStatusBar), over the real stores. The bar hands its port to the neutral
// MapStatusBar, which holds no hook, so calling it IS rendering it; the span
// read is the one it paints. What neither can see is paint and width: those are
// foreground questions (tagged in the packet).
//
// A line is read segment by segment (`readHint`, the `·`-separated parts): the
// gestures a segment names, and whether it names them as refused, as pasting
// nothing, or as pasting.

import { describe, it, expect, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import MarqueePasteOptions from '../MarqueePasteOptions';
import MapStatusBar from '../shared/MapStatusBar';
import { statusLabel } from '../shared/map-status-model';
import { mapFacet } from '../../workspace/facet-registry';
import { TOOL_IDS } from '../../workspace/tool-meta';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import {
  copyChunkToClipboard, pasteFit, pasteRefusal, effectivePasteLayers, PASTE_HINT,
} from '../../../core/editing/map-clipboard';
import type { MapClipboard, PasteLayers } from '../../../core/editing/map-clipboard';
import { createChunkDef } from '../../../core/model/s4-types';

// ── the fixture (the sibling files', restated: they export nothing) ─────────────

type El = React.ReactElement<Record<string, unknown>>;
type Ts = { tiles: Array<{ pixels: Uint8Array }> };

const LAYERS: PasteLayers[] = ['both', 'art', 'collision'];

const tileset = (): Ts => ({ tiles: [{ pixels: new Uint8Array(64).fill(3) }] });
const SOURCE = tileset();
const OTHER = tileset();
const zone = (id: string, ts: Ts) => ({ id, name: id, tileset: ts, acts: [] });
/** The project the copy was made in: zone a holds the copy's tile set, zone b another. */
const HERE = [zone('a', SOURCE), zone('b', OTHER)];
/** Another load under the same ids: fresh tile sets with identical pixels. */
const ELSEWHERE = [zone('a', tileset()), zone('b', tileset())];

/** A block-aligned copy (carries collision), and an odd one (art only). */
const withCollision = (): MapClipboard => copyChunkToClipboard(createChunkDef('c', 'c', 4, 4), SOURCE as never);
const artOnly = (): MapClipboard => copyChunkToClipboard(createChunkDef('o', 'o', 3, 3), SOURCE as never);

const CLIPS: ReadonlyArray<[string, () => MapClipboard]> = [['with collision', withCollision], ['art only', artOnly]];
const PLACES: ReadonlyArray<[string, typeof HERE, string]> = [
  ['home', HERE, 'a'], ['another zone', HERE, 'b'], ['another project', ELSEWHERE, 'b'],
];

/** The aeon port reads the chunk library's length and the BG library, so the
 *  fixture project carries both (one chunk, so the stamp's line names it). */
function openZone(zones: typeof HERE, zoneId: string): void {
  useProjectStore.setState({
    project: { zones, chunkLibrary: [{ id: 'grass' }], bgLibrary: [] } as never,
    currentZoneId: zoneId, currentActId: null,
  });
}

/** The state Ctrl+V leaves when it arms. After the zone (a zone change clears
 *  `pasting`) and after the tool (so does `setTool`). */
function arm(clip: MapClipboard, sticky: PasteLayers): void {
  useEditorStore.getState().setPasteLayers(sticky);
  useEditorStore.setState({ mapClipboard: clip, marquee: null });
  useEditorStore.getState().setPasting(true);
}

// ── the click's gestures, and its verdict on each ──────────────────────────────

type Gesture = 'click' | 'alt' | 'shift';
const GESTURES: Gesture[] = ['click', 'alt', 'shift'];

/** The layers each gesture writes: MapViewport's modifier mapping. */
const gestureLayers = (g: Gesture, sticky: PasteLayers): PasteLayers =>
  g === 'alt' ? 'art' : g === 'shift' ? 'collision' : sticky;

type Verdict = 'lands' | 'refused' | 'nothing';

/** The click's two checks, in its order, over the stores. */
function verdict(clip: MapClipboard, layers: PasteLayers): Verdict {
  const pstate = useProjectStore.getState();
  const writes = effectivePasteLayers(clip, layers);
  if (pasteRefusal(pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project), writes) !== null) return 'refused';
  return writes === null ? 'nothing' : 'lands';
}

function oracle(clip: MapClipboard, sticky: PasteLayers): Record<Verdict, Gesture[]> {
  const of = (v: Verdict) => GESTURES.filter((g) => verdict(clip, gestureLayers(g, sticky)) === v);
  return { lands: of('lands'), refused: of('refused'), nothing: of('nothing') };
}

// ── reading a line ─────────────────────────────────────────────────────────────

/** A plain click is "Click"/"click" not preceded by `+` (so neither Alt+click
 *  nor Shift+click counts as one). */
const MENTION: Record<Gesture, RegExp> = {
  click: /(?<![+\w])[Cc]lick\b/,
  alt: /\bAlt\b/,
  shift: /\bShift\b/,
};
interface Read { advertised: Gesture[]; refused: Gesture[]; nothing: Gesture[] }
function readHint(line: string): Read {
  const segments = line.split(' · ');
  const refusing = (s: string) => /\brefused\b/.test(s);
  const pastesNothing = (s: string) => !refusing(s) && /\bnothing\b/i.test(s);
  const named = (pick: (s: string) => boolean) =>
    GESTURES.filter((g) => segments.some((s) => pick(s) && MENTION[g].test(s)));
  return {
    advertised: named((s) => !refusing(s) && !pastesNothing(s)),
    refused: named(refusing),
    nothing: named(pastesNothing),
  };
}

/** The segment every paste line ends in, from the landed line itself. */
const ESC = PASTE_HINT.split(' · ').at(-1)!;
/** The bar's label in paste mode, from the model. */
const PASTE_LABEL = statusLabel({ tool: 'select', pasting: true }).label;

// ── rendering the two surfaces ─────────────────────────────────────────────────

function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) { for (const c of node) elements(c, out); return out; }
  if (!node || typeof node !== 'object' || !('props' in node)) return out;
  const el = node as El;
  out.push(el);
  elements((el.props as { children?: unknown }).children, out);
  return out;
}

function visibleText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return visibleText(((node as El).props as { children?: unknown }).children);
  }
  return '';
}

let panel: Hooked<Record<string, never>> | null = null;
let bar: Hooked<Record<string, never>> | null = null;

/** The panel's hint line: the one element whose own text carries the Esc
 *  segment. LOUD ON UNMEASURABLE: none, or two, and every row reads nothing. */
function panelHint(): string {
  panel?.unmount();
  panel = renderHooked(MarqueePasteOptions as (p: Record<string, never>) => React.ReactElement, {});
  const hits = elements(panel.el())
    .filter((e) => typeof e.props.children === 'string' && (e.props.children as string).includes(ESC));
  expect(hits, `the panel rendered ${hits.length} paste hint lines, not one`).toHaveLength(1);
  return hits[0].props.children as string;
}

/** The status bar the aeon map facets mount (the un-overridden default slot). */
const AeonMapStatusBar = mapFacet('layout', {}).StatusBar!;

/** The bar's label and its trailing span, as MapStatusBar paints them. */
function barLine(): { label: string; context: string } {
  bar?.unmount();
  bar = renderHooked(AeonMapStatusBar as (p: Record<string, never>) => React.ReactElement, {});
  const el = bar.el() as El;
  expect(el.type, 'the aeon status bar no longer renders the neutral MapStatusBar').toBe(MapStatusBar);
  const footer = (MapStatusBar as unknown as (p: unknown) => El)(el.props);
  const spans = (footer.props.left as El).props.children as El[];
  // LOUD ON UNMEASURABLE: label, plane, zone, scope, context. A sixth span and
  // `spans[4]` is no longer the hint.
  expect(spans, 'the bar\'s left half changed shape, so this reader is not reading the hint').toHaveLength(5);
  return { label: visibleText(spans[0]), context: visibleText(spans[4]) };
}

interface Cell { at: string; clip: MapClipboard; sticky: PasteLayers; o: Record<Verdict, Gesture[]> }

/** Every cell of clipboard x place x Layers, armed as Ctrl+V leaves it. */
function* cells(): Generator<Cell> {
  for (const [kind, make] of CLIPS) {
    for (const [where, zones, zoneId] of PLACES) {
      for (const sticky of LAYERS) {
        openZone(zones, zoneId);
        useEditorStore.getState().setTool('select');
        const clip = make();
        arm(clip, sticky);
        yield { at: `${kind}, ${where}, Layers ${sticky}`, clip, sticky, o: oracle(clip, sticky) };
      }
    }
  }
}

afterEach(() => {
  panel?.unmount();
  bar?.unmount();
  panel = null;
  bar = null;
  useEditorStore.setState({ pasting: false, mapClipboard: null, marquee: null, selectedChunkId: null });
  useEditorStore.getState().setPasteLayers('both');
  useEditorStore.getState().setTool('select');
  useProjectStore.getState().reset();
});

// ── PASTE-STATUS-BAR-HINT ──────────────────────────────────────────────────────

describe('the status bar says what a paste click will do here, as the panel does (PASTE-STATUS-BAR-HINT)', () => {
  it('over clipboard x place x Layers, the bar offers every gesture that lands and none the click refuses, and where something lands it names the refused ones as refused', () => {
    // ANTI-VACUOUS FOR THE READER: it reads the landed line as offering all
    // three gestures, so a red below is the line's claim, not a line the reader
    // could not parse.
    expect(readHint(PASTE_HINT), 'the reader cannot see the gestures in the landed line')
      .toEqual({ advertised: GESTURES, refused: [], nothing: [] });
    let refusedCells = 0;
    let n = 0;
    for (const { at, o } of cells()) {
      n++;
      const { label, context } = barLine();
      expect(label, `${at}: the premise, the bar is in paste mode`).toBe(PASTE_LABEL);
      expect(context, `${at}: the bar says nothing while pasting ("${context}")`).toContain(ESC);
      const read = readHint(context);
      expect(read.advertised.filter((g) => o.refused.includes(g)),
        `${at}: the status bar offers a gesture the click refuses ("${context}")`).toEqual([]);
      expect(o.lands.filter((g) => !read.advertised.includes(g)),
        `${at}: the status bar does not offer a gesture that lands ("${context}")`).toEqual([]);
      if (o.lands.length > 0) {
        expect(read.refused, `${at}: the status bar does not name as refused what the click refuses ("${context}")`)
          .toEqual(o.refused);
      }
      if (o.refused.length > 0) refusedCells++;
    }
    expect(n, 'the matrix is not 2 x 3 x 3').toBe(18);
    expect(refusedCells, 'no cell where the click refuses a gesture was measured').toBeGreaterThan(0);
  });

  it('the bar and the panel agree, cell by cell, on which gestures paste, which are refused and which paste nothing, and what they agree on is the click', () => {
    const offered = new Set<string>();
    for (const { at, o } of cells()) {
      const hint = panelHint();
      const { context } = barLine();
      const onBar = readHint(context);
      expect(onBar, `${at}: the bar ("${context}") and the panel ("${hint}") disagree`).toEqual(readHint(hint));
      // What they agree on is not nothing, and not the landed line everywhere:
      // both went empty, or both went back to PASTE_HINT, and this goes red.
      expect(context, `${at}: the bar is empty`).toContain(ESC);
      expect(hint, `${at}: the panel hint is empty`).toContain(ESC);
      expect(onBar.advertised.filter((g) => o.refused.includes(g)), `${at}: both offer a refused gesture`).toEqual([]);
      expect(o.lands.filter((g) => !onBar.advertised.includes(g)), `${at}: both leave out a gesture that lands`).toEqual([]);
      offered.add(onBar.advertised.join('+'));
    }
    // All three, some, and none: a matrix that only ever saw one answer could
    // not tell agreement from two copies of one constant.
    expect([...offered].length, `the offered sets measured: ${[...offered].join(' | ')}`).toBeGreaterThanOrEqual(3);
  });

  it('pasting overrides the armed tool on the bar too: with any tool armed, the stamp included, the bar offers exactly what the click lands', () => {
    openZone(HERE, 'b');
    const clip = withCollision();
    // Every tool read before anything is asserted, so a red names each tool's
    // line rather than stopping at the first.
    const offered: Record<string, string> = {};
    const expected: Record<string, string> = {};
    for (const tool of TOOL_IDS) {
      useEditorStore.getState().setTool(tool);
      useEditorStore.setState({ selectedChunkId: 'grass' });
      arm(clip, 'both');
      const o = oracle(clip, 'both');
      expect(o.lands, 'the premise: in another zone only Shift+click lands').toEqual(['shift']);
      const { label, context } = barLine();
      expect(label, `tool ${tool}: the premise, the bar is in paste mode`).toBe(PASTE_LABEL);
      offered[tool] = `${readHint(context).advertised.join('+')} ("${context}")`;
      expected[tool] = `${o.lands.join('+')} ("${context}")`;
    }
    expect(offered, 'with some tool armed the bar offers what the click does not land').toEqual(expected);
  });
});
