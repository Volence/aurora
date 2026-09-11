// PASTE-LAYERS-GREY-OUT: the Paste layers control offers only what a click can
// land where the author is now (docs/reviews/2026-09-11-paste-layers-grey-out.md).
//
// ═══ THE RULE THESE ROWS HOLD THE PANEL TO ═══
//
// COLLISION-PASTE-ACROSS-TILESETS decided what a paste click does: tile words fit
// only the tile set they were copied from, collision words fit anywhere in the
// project they were copied in. `pasteRefusal` is that decision, and the map's
// commit click asks it as
//
//     pasteRefusal(pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project),
//                  effectivePasteLayers(clip, layers))
//
// (MapViewport.tsx, the paste branch of the mouse-down handler). The panel must
// grey out EXACTLY the choices that click would refuse, and say why in text on
// screen. Every expectation below is that expression, evaluated by this file over
// the same stores the panel reads, never a restatement of the rule. The last row
// holds the click to that expression, so if the click changes, this file's
// oracle goes red with it instead of quietly measuring the panel against a
// rule nobody runs.
//
// ═══ THE INSTRUMENT ═══
//
// `renderHooked` (src/test/render-hooked.ts) runs the REAL component body over
// the REAL zustand stores and returns its element tree as data. So these rows
// read the actual `disabled` and `title` props and the actual text children the
// panel returns. "Visible without hovering" is measured as TEXT CHILDREN: a
// `title` is a prop, never a child, so a reason that lives only in a tooltip is
// absent from `visibleText`. What this cannot see is layout and paint: whether
// the line is on screen at a given panel width is a foreground question (tagged
// in the packet).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import MarqueePasteOptions from '../MarqueePasteOptions';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import {
  copyChunkToClipboard, pasteFit, pasteRefusal, effectivePasteLayers, armRefusal,
  pasteLayerOffer, stickyRefusedHere, PASTE_LAYER_LABEL,
  COLLISION_ONLY_HERE, OTHER_TILESET_REFUSAL, OTHER_PROJECT_COLLISION_REFUSAL,
} from '../../../core/editing/map-clipboard';
import type { PasteFit } from '../../../core/editing/map-clipboard';
import type { MapClipboard, PasteLayers } from '../../../core/editing/map-clipboard';
import { createChunkDef } from '../../../core/model/s4-types';

// ── the fixture ────────────────────────────────────────────────────────────────

type El = React.ReactElement<Record<string, unknown>>;
type Ts = { tiles: Array<{ pixels: Uint8Array }> };

const LAYERS: PasteLayers[] = ['both', 'art', 'collision'];
const LABEL: Record<PasteLayers, string> = { both: 'Both', art: 'Art', collision: 'Collision' };

const tileset = (): Ts => ({ tiles: [{ pixels: new Uint8Array(64).fill(3) }] });
/** The zone the copy is made in, and a second zone of the same project. */
const SOURCE = tileset();
const OTHER = tileset();
const zone = (id: string, ts: Ts) => ({ id, name: id, tileset: ts, acts: [] });
/** The project the copy was made in: two zones, two tile sets. */
const HERE = [zone('a', SOURCE), zone('b', OTHER)];
/** Another load under the same ids: fresh tile sets with identical pixels. */
const ELSEWHERE = [zone('a', tileset()), zone('b', tileset())];

/** A block-aligned copy (carries collision), and an odd one (art only). */
const withCollision = (): MapClipboard => copyChunkToClipboard(createChunkDef('c', 'c', 4, 4), SOURCE as never);
const artOnly = (): MapClipboard => copyChunkToClipboard(createChunkDef('o', 'o', 3, 3), SOURCE as never);

function openZone(zones: typeof HERE, zoneId: string): void {
  useProjectStore.setState({ project: { zones } as never, currentZoneId: zoneId, currentActId: null });
}

/** The state Ctrl+V leaves when it arms (MapViewport's paste chord): the
 *  clipboard in the store and `pasting` on. Set AFTER the zone, because a zone
 *  change clears `pasting` (editorStore's project-store subscriber). */
function arm(clip: MapClipboard, sticky: PasteLayers): void {
  useEditorStore.getState().setPasteLayers(sticky);
  useEditorStore.setState({ mapClipboard: clip, marquee: null });
  useEditorStore.getState().setPasting(true);
}

/** What the map's commit click decides for a plain click with `layers`, by the
 *  click's own expression over the stores as they are now. */
function clickRefusal(clip: MapClipboard, layers: PasteLayers): string | null {
  const pstate = useProjectStore.getState();
  return pasteRefusal(
    pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project),
    effectivePasteLayers(clip, layers));
}

function elements(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) { for (const c of node) elements(c, out); return out; }
  if (!node || typeof node !== 'object' || !('props' in node)) return out;
  const el = node as El;
  out.push(el);
  elements((el.props as { children?: unknown }).children, out);
  return out;
}

/** The text a person sees without hovering: text CHILDREN only, never a prop. */
function visibleText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join('\n');
  if (node && typeof node === 'object' && 'props' in node) {
    return visibleText(((node as El).props as { children?: unknown }).children);
  }
  return '';
}

let h: Hooked<Record<string, never>> | null = null;

function render(): { buttons: Record<PasteLayers, El>; text: string } {
  h?.unmount();
  h = renderHooked(MarqueePasteOptions as (p: Record<string, never>) => React.ReactElement, {});
  const tree = h.el();
  const found = elements(tree).filter((e) => e.type === 'button');
  const buttons = {} as Record<PasteLayers, El>;
  for (const v of LAYERS) {
    const hits = found.filter((b) => visibleText(b) === LABEL[v]);
    // LOUD ON UNMEASURABLE: a row about a button the tree does not hold would
    // pass on `undefined`.
    expect(hits, `the panel rendered ${hits.length} "${LABEL[v]}" buttons, not one`).toHaveLength(1);
    buttons[v] = hits[0];
  }
  return { buttons, text: visibleText(tree) };
}

const dead = (b: El): boolean => b.props.disabled === true;

afterEach(() => {
  h?.unmount();
  h = null;
  useEditorStore.setState({ pasting: false, mapClipboard: null, marquee: null });
  useEditorStore.getState().setPasteLayers('both');
  useProjectStore.getState().reset();
});

// ── the rows ───────────────────────────────────────────────────────────────────

describe('the Paste layers control in ANOTHER ZONE of the same project', () => {
  it('Both and Art show unavailable with the reason on screen, and Collision stays available', () => {
    openZone(HERE, 'b');
    const clip = withCollision();
    arm(clip, 'collision');
    // The premise, from the click's own decision: here tiles are refused and the
    // collision lands.
    expect(LAYERS.map((v) => clickRefusal(clip, v) !== null), 'the premise: the click refuses Both and Art only')
      .toEqual([true, true, false]);

    const { buttons, text } = render();
    expect(dead(buttons.both), 'Both is offered where the click refuses it').toBe(true);
    expect(dead(buttons.art), 'Art is offered where the click refuses it').toBe(true);
    expect(dead(buttons.collision), 'Collision is greyed out although it lands here').toBe(false);
    // The reason, in text a person reads WITHOUT hovering: the landed arming
    // notice, which says both what cannot land and what can.
    expect(text, 'the reason is missing from the panel text (a tooltip does not count)')
      .toContain(COLLISION_ONLY_HERE);
    // And Collision is still a working choice, not only an enabled-looking one.
    (buttons.collision.props.onClick as () => void)();
    expect(useEditorStore.getState().pasteLayers).toBe('collision');
  });

  it('a sticky Both stays Both: it shows as the chosen, unavailable choice, and the panel says a plain click is refused', () => {
    openZone(HERE, 'b');
    const clip = withCollision();
    arm(clip, 'both');
    expect(clickRefusal(clip, 'both'), 'the premise: the landed click refuses a plain click on Both here').not.toBeNull();

    const { buttons, text } = render();
    expect(useEditorStore.getState().pasteLayers, 'the panel rewrote the author\'s setting').toBe('both');
    expect(dead(buttons.both), 'the sticky Both is shown as available where the click refuses it').toBe(true);
    // Both and Art are both unavailable; the one the author chose must still be
    // told apart from the one he did not.
    expect(buttons.both.props.style, 'the chosen choice looks like any other unavailable one')
      .not.toEqual(buttons.art.props.style);
    expect(text, 'the panel does not say the chosen setting is refused here').toMatch(/Both[^\n]*plain click[^\n]*refused/);
    // Pressing the dead button does nothing to the setting either way.
    (buttons.art.props.onClick as () => void)();
    expect(useEditorStore.getState().pasteLayers, 'a click on an unavailable choice took effect').toBe('both');
  });

  it('entering another zone does not change the author\'s setting, and returning restores the panel as it was', () => {
    openZone(HERE, 'a');
    const clip = withCollision();
    arm(clip, 'art');
    let r = render();
    expect(dead(r.buttons.art), 'the premise: Art is available in the zone the copy was made in').toBe(false);

    // Switch zones the way the app does: the store clears `pasting` on a zone
    // change, then Ctrl+V arms again in the new zone.
    openZone(HERE, 'b');
    expect(useEditorStore.getState().pasting, 'the premise: a zone change leaves paste mode').toBe(false);
    useEditorStore.getState().setPasting(true);
    r = render();
    expect(useEditorStore.getState().pasteLayers, 'entering another zone rewrote the setting').toBe('art');
    expect(dead(r.buttons.art), 'the sticky Art is shown as available where the click refuses it').toBe(true);
    expect(r.buttons.art.props.style, 'the chosen choice looks like any other unavailable one')
      .not.toEqual(r.buttons.both.props.style);
    expect(r.text).toMatch(/Art[^\n]*plain click[^\n]*refused/);

    openZone(HERE, 'a');
    useEditorStore.getState().setPasting(true);
    r = render();
    expect(useEditorStore.getState().pasteLayers, 'the round trip rewrote the setting').toBe('art');
    expect(LAYERS.map((v) => dead(r.buttons[v])), 'back home, a choice is still greyed out').toEqual([false, false, false]);
    expect(r.text, 'back home, the other-zone notice is still shown').not.toContain(COLLISION_ONLY_HERE);
  });
});

describe('the CONTROL: in the zone the copy was made in, the panel is as it was', () => {
  // The titles and the one existing unavailable case (Collision for an art-only
  // clipboard) are the strings the panel carried before this parcel.
  const TITLES: Record<PasteLayers, string> = {
    both: 'Paste art + collision (default)',
    art: 'Paste art only, leave collision untouched',
    collision: 'Paste collision only, leave the nametable untouched',
  };
  const NO_COLLISION_TITLE = 'No collision to paste: this selection is not block-aligned, and collision '
    + 'is stored per 16px block.';

  it('a clipboard with collision: every choice available, the setting highlighted, no notice', () => {
    openZone(HERE, 'a');
    for (const sticky of LAYERS) {
      arm(withCollision(), sticky);
      const { buttons, text } = render();
      for (const v of LAYERS) {
        expect(dead(buttons[v]), `${LABEL[v]} is unavailable at home (setting ${sticky})`).toBe(false);
        expect(buttons[v].props.title, `${LABEL[v]}'s title changed at home`).toBe(TITLES[v]);
      }
      const others = LAYERS.filter((v) => v !== sticky);
      expect(buttons[others[0]].props.style, 'two unchosen buttons look different').toEqual(buttons[others[1]].props.style);
      expect(buttons[sticky].props.style, `the chosen ${LABEL[sticky]} is not highlighted`).not.toEqual(buttons[others[0]].props.style);
      expect(text, 'a notice appeared at home').not.toContain('Only the collision');
      expect(text, 'a refusal appeared at home').not.toMatch(/Not pasted|refused/);
    }
  });

  it('NOT pasting, a clipboard from another zone greys nothing: there the buttons describe the selection, and the next Ctrl+C replaces the clipboard', () => {
    openZone(HERE, 'b');
    useEditorStore.getState().setTool('marquee');
    useEditorStore.setState({ mapClipboard: withCollision(), marquee: null });
    expect(useEditorStore.getState().pasting, 'the premise: not pasting').toBe(false);
    expect(clickRefusal(withCollision(), 'both'), 'the premise: armed, this clipboard would be refused here').not.toBeNull();
    const { buttons, text } = render();
    expect(LAYERS.map((v) => dead(buttons[v])), 'a stale clipboard greyed the copy-side buttons').toEqual([false, false, false]);
    for (const v of LAYERS) expect(buttons[v].props.title).toBe(TITLES[v]);
    expect(text, 'a notice appeared while not pasting').not.toContain('Only the collision');
  });

  it('an art-only clipboard: Collision unavailable for the reason it always was, Both and Art available', () => {
    openZone(HERE, 'a');
    arm(artOnly(), 'both');
    const { buttons, text } = render();
    expect(LAYERS.map((v) => dead(buttons[v]))).toEqual([false, false, true]);
    expect(buttons.collision.props.title).toBe(NO_COLLISION_TITLE);
    expect(text).toContain('Clipboard is art only: it was copied from a selection that is not block-aligned.');
    expect(text, 'a notice appeared at home').not.toContain('Only the collision');
    expect(text, 'a refusal appeared at home').not.toMatch(/Not pasted|refused/);
  });
});

describe('the panel and the click ask ONE decision', () => {
  it('every Layers button is unavailable exactly where the click would refuse it, over every clipboard kind, place and setting', () => {
    let refused = 0;
    let landed = 0;
    for (const [where, zones, zoneId] of [['home', HERE, 'a'], ['another zone', HERE, 'b']] as const) {
      for (const [kind, make] of [['with collision', withCollision], ['art only', artOnly]] as const) {
        for (const sticky of LAYERS) {
          openZone(zones, zoneId);
          const clip = make();
          arm(clip, sticky);
          const { buttons } = render();
          for (const v of LAYERS) {
            const clickSays = clickRefusal(clip, v);
            // The click's refusal, plus the one unavailable case that predates
            // this parcel: an art-only clipboard has no collision to write.
            const expected = clickSays !== null || (clip.artOnly && v === 'collision');
            if (clickSays !== null) refused++; else landed++;
            expect(dead(buttons[v]), `${where}, ${kind}, setting ${sticky}: ${LABEL[v]}`).toBe(expected);
          }
        }
      }
    }
    // ANTI-VACUOUS: the table held both outcomes, so agreement is not agreement
    // on a column of one value.
    expect(refused, 'the click refused nothing in this table').toBeGreaterThan(0);
    expect(landed, 'the click landed nothing in this table').toBeGreaterThan(0);
  });

  it('armed in ANOTHER PROJECT (reachable only by the public setPasting), every choice is unavailable and the panel says what Ctrl+V says there', () => {
    for (const sticky of LAYERS) {
      openZone(ELSEWHERE, 'b');
      const clip = withCollision();
      arm(clip, sticky);
      const pstate = useProjectStore.getState();
      const armSays = armRefusal(clip, pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project), sticky);
      expect(armSays, 'the premise: Ctrl+V is refused in another project').not.toBeNull();
      expect(LAYERS.map((v) => clickRefusal(clip, v) !== null), 'the premise: the click refuses every choice')
        .toEqual([true, true, true]);
      const { buttons, text } = render();
      expect(LAYERS.map((v) => dead(buttons[v])), `setting ${sticky}: a choice is offered that the click refuses`)
        .toEqual([true, true, true]);
      expect(text, `setting ${sticky}: the panel does not say the landed refusal`).toContain(armSays!);
    }
  });

  it('the seam: the click still decides by that expression, and the panel reads the fit through pasteFit and nothing else', () => {
    const squash = (s: string) => s.replace(/\s+/g, '');
    const viewport = squash(readFileSync('src/renderer/components/MapViewport.tsx', 'utf8'));
    // The click's expression, as this file's oracle (`clickRefusal`) states it.
    expect(viewport, 'the click no longer asks pasteRefusal the way this file\'s oracle does: update both')
      .toContain(squash(`pasteRefusal(
          pasteFit(clip, getCurrentZone(pstate)?.tileset, pstate.project),
          effectivePasteLayers(clip, layers))`));
    const panel = readFileSync('src/renderer/components/MarqueePasteOptions.tsx', 'utf8');
    expect(panel, 'the panel does not ask pasteFit').toMatch(/pasteFit\(\s*clipboard,\s*openTileset,\s*project\s*\)/);
    expect(panel, 'the panel does not take its availability from pasteLayerOffer').toContain('pasteLayerOffer(');
    // No second copy of the rule in the panel: it never reads a fit's halves or
    // the two identity questions behind them.
    for (const second of ['clipboardFitsTileset', 'clipboardFromProject', 'fit.art', 'fit.collision', 'pasteRefusal(']) {
      expect(panel.includes(second), `the panel carries its own copy of the rule (${second})`).toBe(false);
    }
  });
});

describe('pasteLayerOffer, the function the panel reads (added with it)', () => {
  // Every fit a PasteFit can hold, the one the map cannot reach included, so a
  // copy of the rule that agrees only on the reachable three still goes red.
  const FITS: ReadonlyArray<[string, PasteFit]> = [
    ['home', { art: true, collision: true }],
    ['another zone', { art: false, collision: true }],
    ['another project', { art: false, collision: false }],
    ['tiles fit, collision does not (unreachable on the map)', { art: true, collision: false }],
  ];

  it('each choice\'s verdict is the click\'s own, for every clipboard kind, fit and setting', () => {
    for (const make of [withCollision, artOnly]) {
      const clip = make();
      for (const [where, fit] of FITS) {
        for (const sticky of LAYERS) {
          const offer = pasteLayerOffer(clip, fit, sticky);
          for (const v of LAYERS) {
            expect(offer.refusals[v], `${where}, art only ${clip.artOnly}, setting ${sticky}: ${v}`)
              .toBe(pasteRefusal(fit, effectivePasteLayers(clip, v)));
          }
        }
      }
    }
    // And one row of it by the rule's own sentences (7d-2 in map-clipboard.test.ts):
    // in another zone the tiles are refused and the collision lands.
    const offer = pasteLayerOffer(withCollision(), { art: false, collision: true }, 'both');
    expect(LAYERS.map((v) => offer.refusals[v])).toEqual([OTHER_TILESET_REFUSAL, OTHER_TILESET_REFUSAL, null]);
  });

  it('the notice: none at home, the arming notice in another zone, the Ctrl+V refusal where nothing lands', () => {
    const clip = withCollision();
    for (const sticky of LAYERS) {
      expect(pasteLayerOffer(clip, FITS[0][1], sticky).notice, `home, setting ${sticky}`).toBeNull();
      expect(pasteLayerOffer(clip, FITS[2][1], sticky).notice, `another project, setting ${sticky}`)
        .toBe(armRefusal(clip, FITS[2][1], sticky));
      expect(pasteLayerOffer(artOnly(), FITS[1][1], sticky).notice, `art only in another zone, setting ${sticky}`)
        .toBe(armRefusal(artOnly(), FITS[1][1], sticky));
    }
    expect(pasteLayerOffer(clip, FITS[1][1], 'collision').notice).toBe(COLLISION_ONLY_HERE);
    expect(pasteLayerOffer(clip, FITS[1][1], 'both').notice).toBe(`${COLLISION_ONLY_HERE} ${stickyRefusedHere('both')}`);
    expect(pasteLayerOffer(clip, FITS[1][1], 'art').notice).toBe(`${COLLISION_ONLY_HERE} ${stickyRefusedHere('art')}`);
    // Where the TILES land and the collision does not, the arming notice would
    // say the opposite of the truth; the click's own refusal is said instead.
    for (const sticky of LAYERS) {
      const notice = pasteLayerOffer(clip, FITS[3][1], sticky).notice;
      expect(notice, `setting ${sticky}: the arming notice was said where the collision is what cannot land`)
        .not.toContain(COLLISION_ONLY_HERE);
      expect(notice).toBe(OTHER_PROJECT_COLLISION_REFUSAL);
    }
  });

  it('the sentence about the setting names the label its button shows, and carries no dash', () => {
    expect(PASTE_LAYER_LABEL, 'the panel\'s button labels and this file\'s disagree').toEqual(LABEL);
    // The en and em dash by code point, so this file carries neither character.
    const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const v of LAYERS) {
      expect(stickyRefusedHere(v)).toContain(`set to ${PASTE_LAYER_LABEL[v]},`);
      expect(stickyRefusedHere(v), 'a person-facing sentence carries a dash').not.toMatch(dash);
    }
  });
});
