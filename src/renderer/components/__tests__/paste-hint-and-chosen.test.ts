// PASTE-HINT-LINE-MISLEADS and ART-ONLY-COLLISION-NO-CHOSEN, the two follow-ups
// booked when PASTE-LAYERS-GREY-OUT landed
// (docs/reviews/2026-09-12-paste-hint-and-chosen.md; the parcel they follow is
// docs/reviews/2026-09-11-paste-layers-grey-out.md, whose rows sit beside this
// file in paste-layers-grey-out.test.ts).
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
//     else: paste                                      (LANDS)
//
// where `layers` is Alt+click art only, Shift+click collision only, and a plain
// click the Paste layers setting. `clickLands` below is those two checks over
// the same stores the panel reads, and `gestureLayers` is that modifier mapping.
// Every expectation in this file is one of those, never a restatement of the
// rule, and a seam row holds the click to both.
//
// ═══ THE INSTRUMENT ═══
//
// `renderHooked` runs the REAL MarqueePasteOptions body over the REAL stores and
// returns its element tree, so these rows read the hint line's actual text and
// each Layers button's actual `disabled` and `style`. What it cannot see is
// paint: how a style looks is a foreground question (tagged in the packet).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import MarqueePasteOptions from '../MarqueePasteOptions';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import {
  copyChunkToClipboard, pasteFit, pasteRefusal, effectivePasteLayers,
  pasteLayerOffer, pasteClickLayers, PASTE_HINT,
} from '../../../core/editing/map-clipboard';
import type { MapClipboard, PasteLayers, PasteFit } from '../../../core/editing/map-clipboard';
import { createChunkDef } from '../../../core/model/s4-types';

// ── the fixture (the grey-out file's, restated: that file exports nothing) ──────

type El = React.ReactElement<Record<string, unknown>>;
type Ts = { tiles: Array<{ pixels: Uint8Array }> };

const LAYERS: PasteLayers[] = ['both', 'art', 'collision'];
const LABEL: Record<PasteLayers, string> = { both: 'Both', art: 'Art', collision: 'Collision' };

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

function openZone(zones: typeof HERE, zoneId: string): void {
  useProjectStore.setState({ project: { zones } as never, currentZoneId: zoneId, currentActId: null });
}

/** The state Ctrl+V leaves when it arms. After the zone: a zone change clears `pasting`. */
function arm(clip: MapClipboard, sticky: PasteLayers): void {
  useEditorStore.getState().setPasteLayers(sticky);
  useEditorStore.setState({ mapClipboard: clip, marquee: null });
  useEditorStore.getState().setPasting(true);
}

function clickRefusal(clip: MapClipboard, layers: PasteLayers): string | null {
  const pstate = useProjectStore.getState();
  return pasteRefusal(
    pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project),
    effectivePasteLayers(clip, layers));
}

// ── the click's gestures ───────────────────────────────────────────────────────

type Gesture = 'click' | 'alt' | 'shift';
const GESTURES: Gesture[] = ['click', 'alt', 'shift'];

/** The layers each gesture writes: MapViewport's modifier mapping. */
const gestureLayers = (g: Gesture, sticky: PasteLayers): PasteLayers =>
  g === 'alt' ? 'art' : g === 'shift' ? 'collision' : sticky;

/** Both of the click's checks: not refused, and something to write. */
function clickLands(clip: MapClipboard, layers: PasteLayers): boolean {
  return clickRefusal(clip, layers) === null && effectivePasteLayers(clip, layers) !== null;
}

// ── reading the tree ───────────────────────────────────────────────────────────

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
  if (Array.isArray(node)) return node.map(visibleText).join('\n');
  if (node && typeof node === 'object' && 'props' in node) {
    return visibleText(((node as El).props as { children?: unknown }).children);
  }
  return '';
}

let h: Hooked<Record<string, never>> | null = null;

function render(): { buttons: Record<PasteLayers, El>; hint: string } {
  h?.unmount();
  h = renderHooked(MarqueePasteOptions as (p: Record<string, never>) => React.ReactElement, {});
  const all = elements(h.el());
  const buttons = {} as Record<PasteLayers, El>;
  for (const v of LAYERS) {
    const hits = all.filter((e) => e.type === 'button' && visibleText(e) === LABEL[v]);
    expect(hits, `the panel rendered ${hits.length} "${LABEL[v]}" buttons, not one`).toHaveLength(1);
    buttons[v] = hits[0];
  }
  // The hint line is the element whose own text ends in the landed hint's
  // "Esc to stop" while pasting. LOUD ON UNMEASURABLE: none, or two, and every
  // row below would be reading nothing.
  const hints = all.filter((e) => typeof e.props.children === 'string' && (e.props.children as string).includes('Esc to stop'));
  if (useEditorStore.getState().pasting) {
    expect(hints, `the panel rendered ${hints.length} paste hint lines, not one`).toHaveLength(1);
  }
  return { buttons, hint: hints.length === 1 ? (hints[0].props.children as string) : '' };
}

/** What the hint line claims, read segment by segment (it is `·`-separated):
 *  the gestures a segment names, and whether that segment says they are
 *  refused. A plain click is "Click"/"click" not preceded by `+` (so neither
 *  Alt+click nor Shift+click counts as one). */
const MENTION: Record<Gesture, RegExp> = {
  click: /(?<![+\w])[Cc]lick\b/,
  alt: /\bAlt\b/,
  shift: /\bShift\b/,
};
function readHint(hint: string): { advertised: Gesture[]; refused: Gesture[]; saying: (g: Gesture) => string } {
  const segments = hint.split(' · ');
  const refusing = (s: string) => /\brefused\b/.test(s);
  const named = (pick: (s: string) => boolean) =>
    GESTURES.filter((g) => segments.some((s) => pick(s) && MENTION[g].test(s)));
  return {
    advertised: named((s) => !refusing(s)),
    refused: named(refusing),
    saying: (g) => segments.filter((s) => !refusing(s) && MENTION[g].test(s)).join(' · '),
  };
}

/** The landed hint's own words for what each landing layer pastes. */
const WHAT: Partial<Record<PasteLayers, string>> = { art: 'art only', collision: 'collision only' };

/** The hint the panel carried before this parcel (MarqueePasteOptions, base 408cbd0e). */
const LANDED_HINT = 'Click to paste · hold Alt for art only, Shift for collision only · '
  + 'X flips it left↔right, Y top↕bottom · Esc to stop';
const LANDED_TAIL = 'X flips it left↔right, Y top↕bottom · Esc to stop';

afterEach(() => {
  h?.unmount();
  h = null;
  useEditorStore.setState({ pasting: false, mapClipboard: null, marquee: null });
  useEditorStore.getState().setPasteLayers('both');
  useProjectStore.getState().reset();
});

// ── PASTE-HINT-LINE-MISLEADS ───────────────────────────────────────────────────

describe('the paste hint line says what a click will actually do here (PASTE-HINT-LINE-MISLEADS)', () => {
  it('in ANOTHER ZONE it names as pasting exactly the gestures the click lands, names the rest as refused, and says what the landing ones paste', () => {
    let refusedSeen = 0;
    for (const sticky of LAYERS) {
      openZone(HERE, 'b');
      const clip = withCollision();
      arm(clip, sticky);
      const lands = GESTURES.filter((g) => clickLands(clip, gestureLayers(g, sticky)));
      const refused = GESTURES.filter((g) => !lands.includes(g));
      // The premise, from the click: something lands here and something does not.
      expect(lands.length, `setting ${sticky}: the premise, the click lands something in another zone`).toBeGreaterThan(0);
      expect(refused.length, `setting ${sticky}: the premise, the click refuses something in another zone`).toBeGreaterThan(0);
      refusedSeen += refused.length;
      const { hint } = render();
      const read = readHint(hint);
      expect(read.advertised, `setting ${sticky}: the hint offers a gesture the click refuses here ("${hint}")`).toEqual(lands);
      expect(read.refused, `setting ${sticky}: the hint does not name as refused what the click refuses ("${hint}")`).toEqual(refused);
      for (const g of lands) {
        const what = WHAT[effectivePasteLayers(clip, gestureLayers(g, sticky))!];
        if (what) expect(read.saying(g), `setting ${sticky}: the hint does not say what ${g} pastes`).toContain(what);
      }
    }
    expect(refusedSeen, 'no refused gesture was measured').toBeGreaterThan(0);
  });

  it('where NOTHING lands (another project; an art-only copy in another zone) the hint offers no gesture at all', () => {
    const cases: Array<[string, typeof HERE, () => MapClipboard]> = [
      ['another project', ELSEWHERE, withCollision],
      ['art only, another zone', HERE, artOnly],
    ];
    for (const [where, zones, make] of cases) {
      for (const sticky of LAYERS) {
        openZone(zones, 'b');
        const clip = make();
        arm(clip, sticky);
        expect(GESTURES.filter((g) => clickLands(clip, gestureLayers(g, sticky))),
          `${where}, setting ${sticky}: the premise, the click lands nothing`).toEqual([]);
        const { hint } = render();
        expect(readHint(hint).advertised, `${where}, setting ${sticky}: the hint offers a gesture that lands nothing ("${hint}")`)
          .toEqual([]);
      }
    }
  });

  it('CONTROL: in the zone the copy was made in, the hint is the one the panel always carried', () => {
    for (const make of [withCollision, artOnly]) {
      for (const sticky of LAYERS) {
        openZone(HERE, 'a');
        const clip = make();
        arm(clip, sticky);
        const { hint } = render();
        expect(hint, `home, art only ${clip.artOnly}, setting ${sticky}: the same-zone hint changed`).toBe(LANDED_HINT);
      }
    }
    // ANTI-VACUOUS FOR THE READER: over the landed hint, `readHint` sees all
    // three gestures offered and none refused, and the click agrees for a
    // clipboard with collision. A reader that saw nothing would pass the rows
    // above on a hint it cannot parse.
    openZone(HERE, 'a');
    const clip = withCollision();
    expect(GESTURES.filter((g) => clickLands(clip, gestureLayers(g, 'both')))).toEqual(GESTURES);
    expect(readHint(LANDED_HINT)).toMatchObject({ advertised: GESTURES, refused: [] });
  });

  it('CONTROL: the flip keys and Esc are true in paste mode anywhere, so every hint keeps them', () => {
    const cases: Array<[typeof HERE, string, () => MapClipboard]> = [
      [HERE, 'a', withCollision], [HERE, 'b', withCollision], [HERE, 'b', artOnly], [ELSEWHERE, 'b', withCollision],
    ];
    for (const [zones, zoneId, make] of cases) {
      for (const sticky of LAYERS) {
        openZone(zones, zoneId);
        arm(make(), sticky);
        expect(render().hint, `zone ${zoneId}, setting ${sticky}: the flip keys or Esc left the hint`).toContain(LANDED_TAIL);
      }
    }
  });
});

describe('the hint comes from the offer, over every fit (added with the fix)', () => {
  // Every fit a PasteFit can hold, the one the map cannot reach included.
  const FITS: ReadonlyArray<[string, PasteFit]> = [
    ['home', { art: true, collision: true }],
    ['another zone', { art: false, collision: true }],
    ['another project', { art: false, collision: false }],
    ['tiles fit, collision does not (unreachable on the map)', { art: true, collision: false }],
  ];
  /** The click's two checks over a fit, rather than over the stores. */
  const landsAt = (clip: MapClipboard, fit: PasteFit, layers: PasteLayers): boolean =>
    pasteRefusal(fit, effectivePasteLayers(clip, layers)) === null && effectivePasteLayers(clip, layers) !== null;

  it('offer.hint names as pasting exactly the gestures the click lands, and every other gesture as refused only where the click refuses it', () => {
    let partial = 0;
    for (const make of [withCollision, artOnly]) {
      const clip = make();
      for (const [where, fit] of FITS) {
        for (const sticky of LAYERS) {
          const offer = pasteLayerOffer(clip, fit, sticky);
          const at = `${where}, art only ${clip.artOnly}, setting ${sticky}`;
          if (LAYERS.every((v) => offer.refusals[v] === null)) {
            // The brief's scope: where every choice lands the line is as it was.
            expect(offer.hint, at).toBe(LANDED_HINT);
            continue;
          }
          const lands = GESTURES.filter((g) => landsAt(clip, fit, gestureLayers(g, sticky)));
          const read = readHint(offer.hint);
          expect(read.advertised, `${at}: "${offer.hint}"`).toEqual(lands);
          expect(offer.hint, `${at}: the flip keys or Esc left the hint`).toContain(LANDED_TAIL);
          if (lands.length > 0) {
            partial++;
            // "Refused" is TRUE of each gesture it names: the click refuses it,
            // and does not merely find nothing to write (a different toast).
            const notLanding = GESTURES.filter((g) => !lands.includes(g));
            expect(read.refused, `${at}: "${offer.hint}"`).toEqual(notLanding);
            for (const g of notLanding) {
              expect(pasteRefusal(fit, effectivePasteLayers(clip, gestureLayers(g, sticky))),
                `${at}: the hint calls ${g} refused where the click has nothing to write instead`).not.toBeNull();
            }
            for (const g of lands) {
              const what = WHAT[effectivePasteLayers(clip, gestureLayers(g, sticky))!];
              if (what) expect(read.saying(g), `${at}: what ${g} pastes`).toContain(what);
            }
          }
        }
      }
    }
    expect(partial, 'no case where some gestures land and some do not was measured').toBeGreaterThan(0);
  });

  it('the seam: the click reads its modifiers through pasteClickLayers, which maps them as this file does; the panel shows offer.hint and holds no hint of its own', () => {
    for (const sticky of LAYERS) {
      expect(pasteClickLayers({ altKey: false, shiftKey: false }, sticky)).toBe(gestureLayers('click', sticky));
      expect(pasteClickLayers({ altKey: true, shiftKey: false }, sticky)).toBe(gestureLayers('alt', sticky));
      expect(pasteClickLayers({ altKey: false, shiftKey: true }, sticky)).toBe(gestureLayers('shift', sticky));
    }
    const squash = (s: string) => s.replace(/\s+/g, '');
    const viewport = squash(readFileSync('src/renderer/components/MapViewport.tsx', 'utf8'));
    expect(viewport, 'the click no longer takes its layers from pasteClickLayers')
      .toContain(squash('const layers: PasteLayers = pasteClickLayers(e, useEditorStore.getState().pasteLayers);'));
    expect(viewport, 'the click maps the modifiers itself again').not.toContain(squash("e.altKey ? 'art'"));
    const panel = readFileSync('src/renderer/components/MarqueePasteOptions.tsx', 'utf8');
    expect(panel, 'the panel does not show the offer\'s hint while pasting').toContain('offer?.hint ?? PASTE_HINT');
    expect(panel, 'the panel carries its own paste hint text').not.toContain('hold Alt for art only');
    expect(PASTE_HINT, 'the default hint is not the one the panel carried').toBe(LANDED_HINT);
  });

  it('no hint carries a dash', () => {
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const make of [withCollision, artOnly]) {
      for (const [, fit] of FITS) {
        for (const sticky of LAYERS) expect(pasteLayerOffer(make(), fit, sticky).hint).not.toMatch(dash);
      }
    }
  });
});

// ── ART-ONLY-COLLISION-NO-CHOSEN ───────────────────────────────────────────────

describe('the author\'s setting stays visible when it is a choice with nothing to write (ART-ONLY-COLLISION-NO-CHOSEN)', () => {
  const dead = (b: El): boolean => b.props.disabled === true;
  /** The panel's title for Collision when there is no collision to paste (the
   *  string it carried before either parcel). */
  const NO_COLLISION_TITLE = 'No collision to paste: this selection is not block-aligned, and collision '
    + 'is stored per 16px block.';
  /** How the grey-out parcel marks the author's own setting where the click
   *  refuses it: Both, set, in another zone. */
  function refusedChosenStyle(): unknown {
    openZone(HERE, 'b');
    const clip = withCollision();
    arm(clip, 'both');
    expect(clickRefusal(clip, 'both'), 'the premise: Both is refused in another zone').not.toBeNull();
    const { buttons } = render();
    expect(buttons.both.props.style, 'the premise: the refused setting is marked apart from the refused Art')
      .not.toEqual(buttons.art.props.style);
    return buttons.both.props.style;
  }

  it('pasting an art-only clipboard with Layers on Collision: Collision is unavailable AND shows as the chosen one, and the setting is not rewritten', () => {
    openZone(HERE, 'a');
    const clip = artOnly();
    // WHY no button looked chosen: Collision collapses to NOTHING for this
    // clipboard, and a paste of nothing is not a refusal (`pasteRefusal` of
    // null layers is null by contract), so the offer's verdict for it is null.
    // The panel greys it through the older no-collision rule instead.
    expect(effectivePasteLayers(clip, 'collision'), 'the premise: Collision has nothing to write').toBeNull();
    expect(pasteLayerOffer(clip, pasteFit(clip, SOURCE as never, { zones: HERE } as never), 'collision').refusals.collision,
      'the premise: the offer does not call it refused').toBeNull();

    arm(clip, 'both');
    const unchosen = render().buttons.collision.props.style;
    arm(clip, 'collision');
    const { buttons } = render();
    expect(useEditorStore.getState().pasteLayers, 'the panel rewrote the author\'s setting').toBe('collision');
    expect(dead(buttons.collision), 'Collision is offered with nothing to write').toBe(true);
    expect(buttons.collision.props.style, 'no choice shows as chosen: the set Collision looks exactly as it does when Layers is on Both')
      .not.toEqual(unchosen);
    expect(buttons.both.props.style, 'Both or Art took the chosen mark instead').toEqual(buttons.art.props.style);
  });

  it('it carries the SAME mark as a setting the click refuses: one meaning, one look', () => {
    const refused = refusedChosenStyle();
    openZone(HERE, 'a');
    arm(artOnly(), 'collision');
    expect(render().buttons.collision.props.style, 'the set, unavailable Collision is marked unlike the set, refused Both')
      .toEqual(refused);
  });

  it('the same on the copy side: a selection that is not block-aligned, with Layers on Collision', () => {
    openZone(HERE, 'a');
    useEditorStore.getState().setTool('marquee');
    useEditorStore.setState({ mapClipboard: null, marquee: { sectionIndex: 0, col: 1, row: 0, w: 3, h: 3 } });
    useEditorStore.getState().setPasteLayers('both');
    let r = render();
    expect(useEditorStore.getState().pasting, 'the premise: not pasting').toBe(false);
    expect(r.buttons.collision.props.title, 'the premise: this selection carries no collision').toBe(NO_COLLISION_TITLE);
    const unchosen = r.buttons.collision.props.style;
    useEditorStore.getState().setPasteLayers('collision');
    r = render();
    expect(useEditorStore.getState().pasteLayers).toBe('collision');
    expect(dead(r.buttons.collision)).toBe(true);
    expect(r.buttons.collision.props.style, 'no choice shows as chosen on the copy side').not.toEqual(unchosen);
  });

  it('CONTROL: with Layers on Both or Art the art-only panel is as it was: that choice highlighted, Collision in the plain unavailable look', () => {
    const refused = refusedChosenStyle();
    openZone(HERE, 'a');
    const collisionStyles: unknown[] = [];
    for (const sticky of ['both', 'art'] as const) {
      arm(artOnly(), sticky);
      const { buttons } = render();
      const other = sticky === 'both' ? 'art' : 'both';
      expect(buttons[sticky].props.style, `setting ${sticky}: the chosen choice is not highlighted`).not.toEqual(buttons[other].props.style);
      expect(dead(buttons.collision)).toBe(true);
      expect(buttons.collision.props.title).toBe(NO_COLLISION_TITLE);
      collisionStyles.push(buttons.collision.props.style);
    }
    expect(collisionStyles[0], 'the unchosen Collision looks different under Both and under Art').toEqual(collisionStyles[1]);
    expect(collisionStyles[0], 'the Collision the author did NOT set carries the chosen mark').not.toEqual(refused);
  });
});
