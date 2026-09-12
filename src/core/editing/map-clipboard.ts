import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { Section, ChunkDef, Tileset } from '../model/s4-types';
import { buildRegionWriteCommand } from './map-stamp';
import { withLinkBreaks } from './chunk-links';
import type { BatchCommand } from './commands';

/**
 * A captured map region: art always, both collision planes only when the region
 * is BLOCK-ALIGNED (see `artOnly`). What `copyFromSection` reads off a section,
 * and what a flip, a save-as-chunk and a composer seed work on. The CLIPBOARD
 * is this plus the tile set its words belong to (`MapClipboard`, below).
 *
 * THE ASYMMETRY THIS TYPE EXISTS TO CARRY. Art is per-8px TILE: one nametable
 * word per tile, `SECTION_TILES_WIDE`-strided. Collision is per-16px CELL: one
 * engine attr word shared by all four tiles of a 2x2 block (see
 * `collision/collision-cell.ts` `cellTileIndices`, and `OverlayRenderer`'s
 * "both tiles of a cell share the word"). So a rectangle that does not start
 * and end on even tile coords has NO representation for its collision — every
 * cell it touches is shared with tiles outside the rectangle, and a paste that
 * wrote one would either invent a winner among four tiles or corrupt the
 * neighbour. That is a property of the engine's data, not a gap in this code.
 */
export interface MapRegion {
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;    // widthTiles*heightTiles, row-major
  /** (w>>1)*(h>>1) when `artOnly` is false; EMPTY when it is true. */
  collisionA: Uint16Array;
  collisionB: Uint16Array;
  /**
   * True when the captured rect was NOT block-aligned, so this clipboard
   * carries art and nothing else.
   *
   * A STRUCTURAL flag rather than a caller-side re-derivation on purpose: the
   * copy site is the only place that knows the source rect, and every consumer
   * downstream (paste, the paste-layers control, the toast) has to make the
   * same call. Deriving it three times is three chances to derive it once
   * wrongly and silently paste air over an author's collision.
   */
  artOnly: boolean;
}

/**
 * THE MAP CLIPBOARD: a captured region, plus THE TILE SET ITS WORDS INDEX.
 *
 * A nametable word is a tile NUMBER. Number 5 means "tile 5 of the tile set
 * this section is drawn with", and in aeon that is the open zone's
 * (`Zone.tileset`: one per zone, shared by every act of it, and edited IN
 * PLACE, so the object is the same for the life of a loaded project). The
 * clipboard outlives an act, zone or project switch on purpose, so without this
 * field a Ctrl+V re-armed in another zone wrote the first zone's numbers into
 * the second zone's tile set, and the author got different tiles, silently
 * (PASTE-ACROSS-TILESETS, docs/reviews/2026-09-11-paste-across-tilesets.md).
 *
 * COMPARED BY REFERENCE, NEVER BY CONTENT. Two tile sets whose pixels happen to
 * agree today are still two tile sets: either can be edited without the other,
 * and a reloaded project is a new object whose file may have changed on disk.
 * The only answer the clipboard can vouch for is "the very tile set I was
 * copied from". There is no remapping and no nearest-tile guess anywhere: a
 * mismatch is refused (`clipboardFitsTileset`, `OTHER_TILESET_REFUSAL`).
 *
 * REQUIRED, on this repository's rule for load-bearing fields: an optional one
 * reads downstream as "no tile set", which a consumer would have to guess at.
 * Every producer states it: the map's Ctrl+C, the Art composer's chunk Ctrl+C
 * (`copyChunkToClipboard`), and a flip (`flipClipboard` carries it through).
 */
export interface MapClipboard extends MapRegion {
  tileset: Tileset;
}

/** The refusal an author sees when the copied words belong to another tile set.
 *  One string, so Ctrl+V and the commit click cannot say it two ways. */
export const OTHER_TILESET_REFUSAL =
  'Not pasted: the copied tiles belong to another tile set, so pasting them here would put '
  + 'different tiles down. Copy again from a map that uses this tile set.';

/** May `clip` be pasted into a section drawn with `target`? Only when `target`
 *  IS the tile set the clipboard was copied from (see `MapClipboard`). No open
 *  tile set (`null`/`undefined`) is never a match: nothing can vouch for it. */
export function clipboardFitsTileset(clip: MapClipboard, target: Tileset | null | undefined): boolean {
  return target != null && clip.tileset === target;
}

/**
 * Was `clip` copied in the project that is OPEN NOW? The question a COLLISION
 * word asks (COLLISION-PASTE-ACROSS-TILESETS,
 * docs/reviews/2026-09-11-collision-paste-across-tilesets.md).
 *
 * A collision word's shape number (bits 0-9, collision/collision-cell-word.ts)
 * indexes the project's collision BASE BANK, and there is one bank per project:
 * Aurora loads one `CollisionProfileSet` per open (project/aeon/load.ts,
 * `loadAeonProject`), and aeon's bake resolves every section of every zone
 * against the same bank into ONE shared attr set (tools/ojz_strip_gen.py). So a
 * collision word means the same shape in every zone of a project. It does not
 * necessarily mean it in another project, whose bank can differ.
 *
 * ANSWERED BY REFERENCE, through the tile set the clipboard already carries. A
 * `Tileset` is made once per zone per load (load.ts builds it, and nothing else
 * does), so the copy came from THIS load exactly when its tile set is one of the
 * open project's zones'. That is the same load identity the editor store keys a
 * project change on (the `config` reference, both written by `openLoaded`),
 * reached without a second field every producer would have to state. A reopen
 * of the same directory is a new load, so it is another project here, exactly
 * as it is another tile set.
 */
export function clipboardFromProject(
  clip: MapClipboard,
  project: { zones: ReadonlyArray<{ tileset: Tileset }> } | null | undefined,
): boolean {
  return project != null && project.zones.some((z) => z.tileset === clip.tileset);
}

/** The refusal when the words a paste would write are COLLISION words from
 *  another project. It says nothing about tiles: such a paste writes none. */
export const OTHER_PROJECT_COLLISION_REFUSAL =
  'Not pasted: the copied collision belongs to another project, whose collision shapes can differ '
  + 'from this one\'s, so pasting it here could put different shapes down. Copy again from this project.';

/** The refusal when a paste would write tile words AND collision words, and both
 *  kinds belong to another project. */
export const OTHER_PROJECT_REFUSAL =
  'Not pasted: this was copied in another project, whose tiles and collision shapes can differ '
  + 'from this one\'s, so pasting here could put different ones down. Copy again from this project.';

/** Said when Ctrl+V arms over another zone's tile set, where only the clipboard's
 *  collision can land. */
export const COLLISION_ONLY_HERE =
  'Only the collision can be pasted here: the copied tiles belong to another tile set. '
  + 'Shift+click pastes collision only.';

/**
 * Which of a clipboard's two kinds of word may be written where the author is
 * now. `art`: tile words, only into the very tile set they were copied from
 * (`clipboardFitsTileset`). `collision`: collision words, anywhere in the
 * project they were copied in (`clipboardFromProject`).
 */
export interface PasteFit { art: boolean; collision: boolean }

export function pasteFit(
  clip: MapClipboard,
  openTileset: Tileset | null | undefined,
  openProject: { zones: ReadonlyArray<{ tileset: Tileset }> } | null | undefined,
): PasteFit {
  return { art: clipboardFitsTileset(clip, openTileset), collision: clipboardFromProject(clip, openProject) };
}

/**
 * The refusal for a paste that would write `layers` (already collapsed by
 * `effectivePasteLayers`), or null when every word it would write fits. The one
 * decision behind the map's commit click, the map's Ctrl+V and the composer's
 * Ctrl+V, so the three cannot disagree.
 *
 * The message is chosen by WHICH words would be wrong, so it never names a kind
 * of word the paste does not write: both kinds foreign is OTHER_PROJECT_REFUSAL,
 * tile words only is OTHER_TILESET_REFUSAL, collision words only is
 * OTHER_PROJECT_COLLISION_REFUSAL. `null` layers (nothing to write) is not
 * refused here: the caller has its own sentence for that.
 */
export function pasteRefusal(fit: PasteFit, layers: PasteLayers | null): string | null {
  if (layers === null) return null;
  const artBad = layers !== 'collision' && !fit.art;
  const collisionBad = layers !== 'art' && !fit.collision;
  if (artBad && collisionBad) return OTHER_PROJECT_REFUSAL;
  if (artBad) return OTHER_TILESET_REFUSAL;
  if (collisionBad) return OTHER_PROJECT_COLLISION_REFUSAL;
  return null;
}

/**
 * The refusal for ARMING a paste (the map's Ctrl+V), or null to arm.
 *
 * Refused only when no click could land anything. The layers are decided AT THE
 * CLICK (Shift is collision only, Alt art only), so a clipboard whose collision
 * fits here arms even when its tiles do not, and the click refuses whatever does
 * not fit. When nothing can land, the message is the one the sticky Paste
 * setting would get at the click (art, for a clipboard with no collision).
 */
export function armRefusal(clip: MapClipboard, fit: PasteFit, sticky: PasteLayers): string | null {
  if (fit.art || (fit.collision && !clip.artOnly)) return null;
  return pasteRefusal(fit, effectivePasteLayers(clip, sticky) ?? 'art');
}

export type PasteLayers = 'both' | 'art' | 'collision';

const PASTE_LAYER_ORDER: ReadonlyArray<PasteLayers> = ['both', 'art', 'collision'];

/** What the Paste layers control calls each choice. One table, so a button and
 *  a sentence about the setting cannot name the same choice two ways. */
export const PASTE_LAYER_LABEL: Readonly<Record<PasteLayers, string>> = {
  both: 'Both', art: 'Art', collision: 'Collision',
};

/** Said beside the Paste layers control when the author's own setting is a
 *  choice a plain click here would refuse. The setting is left as he chose it:
 *  this tells him why a plain click will not paste, and what would. */
export function stickyRefusedHere(sticky: PasteLayers): string {
  return `Layers is set to ${PASTE_LAYER_LABEL[sticky]}, so a plain click here is refused. `
    + 'Choose Collision to paste with a plain click.';
}

/**
 * The layers a paste CLICK writes: Alt+click art only, Shift+click collision
 * only, a plain click the Paste layers setting. The map's commit click asks
 * this, and the paste hint line (`PasteLayerOffer.hint`) describes the same
 * three gestures through it, so the hint cannot come to name a key the click
 * does not read that way.
 */
export function pasteClickLayers(mods: { altKey: boolean; shiftKey: boolean }, sticky: PasteLayers): PasteLayers {
  return mods.altKey ? 'art' : mods.shiftKey ? 'collision' : sticky;
}

/** The flip keys: they mirror the clipboard wherever the author is, so this is
 *  always true in paste mode. */
const PASTE_FLIPS = 'X flips it left↔right, Y top↕bottom';

/** Esc leaves paste mode wherever the author is. The one thing a surface that
 *  cannot see where the author is may say about paste mode (the neutral status
 *  bar's own paste hint, `statusLabel`). */
export const PASTE_ESC = 'Esc to stop';

/** The end of every paste hint: both halves are always true. */
const PASTE_HINT_TAIL = `${PASTE_FLIPS} · ${PASTE_ESC}`;

/** The gestures, said where every one of them lands: the landed line's words. */
const EVERY_GESTURE_LANDS = 'Click to paste · hold Alt for art only, Shift for collision only';

/** The paste hint line wherever every choice lands (the zone the copy was made
 *  in). The line the panel has always carried there. */
export const PASTE_HINT = `${EVERY_GESTURE_LANDS} · ${PASTE_HINT_TAIL}`;

/** The three paste gestures, in the order the hint names them: the modifiers
 *  the click reads, the gesture's name leading a sentence, and in a list. */
const PASTE_GESTURES: ReadonlyArray<{ mods: { altKey: boolean; shiftKey: boolean }; lead: string; listed: string }> = [
  { mods: { altKey: false, shiftKey: false }, lead: 'Click', listed: 'a plain click' },
  { mods: { altKey: true, shiftKey: false }, lead: 'Alt+click', listed: 'Alt+click' },
  { mods: { altKey: false, shiftKey: true }, lead: 'Shift+click', listed: 'Shift+click' },
];

const WHAT_PASTES: Readonly<Record<PasteLayers, string>> = {
  both: 'art and collision', art: 'art only', collision: 'collision only',
};

/**
 * What each paste gesture does here, the part of the paste hint that depends on
 * where the author is (PASTE-HINT-LINE-MISLEADS). Where every choice lands it is
 * the landed line's words, unchanged. Elsewhere each gesture is said as the
 * click will take it: the click's two checks, its refusal (`refusals`, the very
 * verdicts the Layers buttons are greyed from) and whether anything is left to
 * write (`effectivePasteLayers`), over the layers `pasteClickLayers` gives that
 * gesture. So the line cannot offer a gesture the buttons show as refused.
 *
 * A gesture the click does not refuse but that has nothing to write (Shift+click
 * over an art-only copy, and a plain click with Layers on Collision) is named as
 * pasting nothing: never offered, and never called refused, because the click
 * does not refuse it, it toasts that the clipboard carries no collision
 * (PASTE-SAME-ZONE-ART-ONLY-SHIFT). So the landed line is kept only where every
 * GESTURE lands: every choice's verdict null is not enough, since that holds in
 * the zone an art-only copy was made in.
 *
 * Every surface that says what a paste click does is built from this one
 * string (`PasteLayerOffer.hint` and `.statusHint`), so no two can name
 * different gestures.
 */
function pasteGestureLine(
  clip: MapClipboard, refusals: Readonly<Record<PasteLayers, string | null>>, sticky: PasteLayers,
): string {
  const lands = new Map<PasteLayers, string[]>();
  const refused: string[] = [];
  const nothing: string[] = [];
  for (const { mods, lead, listed } of PASTE_GESTURES) {
    const layers = pasteClickLayers(mods, sticky);
    const writes = effectivePasteLayers(clip, layers);
    if (refusals[layers] !== null) refused.push(listed);
    else if (writes === null) nothing.push(listed);
    else lands.set(writes, [...(lands.get(writes) ?? []), lead]);
  }
  if (refused.length === 0 && nothing.length === 0) return EVERY_GESTURE_LANDS;
  if (lands.size === 0) return 'Nothing can be pasted here';
  const parts = [...lands].map(([writes, leads]) => `${leads.join(' or ')} to paste ${WHAT_PASTES[writes]}`);
  const names = (list: string[]) =>
    list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  if (refused.length > 0) parts.push(`${names(refused)} ${refused.length === 1 ? 'is' : 'are'} refused here`);
  if (nothing.length > 0) parts.push(`${names(nothing)} ${nothing.length === 1 ? 'pastes' : 'paste'} nothing`);
  return parts.join(' · ');
}

/** See `pasteLayerOffer`. */
export interface PasteLayerOffer {
  /** Per choice: what a plain click with it gets (`pasteRefusal`), or null when it lands. */
  refusals: Readonly<Record<PasteLayers, string | null>>;
  /** The one sentence shown beside the control, or null when every choice lands. */
  notice: string | null;
  /** The Paste panel's hint line: what each click gesture does here
   *  (`pasteGestureLine`), then the flip keys and Esc. */
  hint: string;
  /**
   * The map status bar's paste line (PASTE-STATUS-BAR-HINT): the SAME gesture
   * segments as `hint`, then Esc, without the flip keys. The bar is one row
   * shared with the tool, plane, zone, section and zoom, and its paste line has
   * never carried the flips; the gestures are the part it must not get wrong,
   * and it takes them from the one string `hint` is built from.
   */
  statusHint: string;
}

/**
 * What the Paste layers control offers where the author is now
 * (PASTE-LAYERS-GREY-OUT, docs/reviews/2026-09-11-paste-layers-grey-out.md).
 *
 * THE CLICK'S DECISION, NOT A COPY OF IT. `refusals[v]` is the map's commit
 * click's own expression for a plain click with choice `v`,
 * `pasteRefusal(fit, effectivePasteLayers(clip, v))`, so the panel greys out
 * exactly the choices the click would refuse. A second statement of the rule
 * here is how the panel and the click would come to disagree.
 *
 * The notice, chosen by what can land:
 *  - every choice lands (the zone the copy was made in): none;
 *  - nothing can land (another project, or an art-only copy in another zone):
 *    the Ctrl+V refusal itself, `armRefusal`, word for word;
 *  - the collision lands and the tiles do not (another zone of the project):
 *    the arming notice `COLLISION_ONLY_HERE`, plus `stickyRefusedHere` when the
 *    author's setting is one of the refused choices;
 *  - the tiles land and the collision does not: the click's own refusal for the
 *    setting, or for the first refused choice. The map cannot reach this (its
 *    open tile set is always one of the open project's), and the arming notice
 *    would be false there, so it is not used.
 *
 * Never changes the setting. Whether a plain click then pastes is the click's
 * decision, unchanged.
 */
export function pasteLayerOffer(clip: MapClipboard, fit: PasteFit, sticky: PasteLayers): PasteLayerOffer {
  const click = (v: PasteLayers) => pasteRefusal(fit, effectivePasteLayers(clip, v));
  const refusals = { both: click('both'), art: click('art'), collision: click('collision') };
  const gestures = pasteGestureLine(clip, refusals, sticky);
  const hint = `${gestures} · ${PASTE_HINT_TAIL}`;
  const statusHint = `${gestures} · ${PASTE_ESC}`;
  const refused = PASTE_LAYER_ORDER.filter((v) => refusals[v] !== null);
  if (refused.length === 0) return { refusals, notice: null, hint, statusHint };
  const nothingLands = armRefusal(clip, fit, sticky);
  if (nothingLands !== null) return { refusals, notice: nothingLands, hint, statusHint };
  if (refusals.collision === null) {
    return {
      refusals,
      notice: refusals[sticky] === null ? COLLISION_ONLY_HERE : `${COLLISION_ONLY_HERE} ${stickyRefusedHere(sticky)}`,
      hint,
      statusHint,
    };
  }
  return { refusals, notice: refusals[sticky] ?? refusals[refused[0]], hint, statusHint };
}

/**
 * The granularity a marquee drag snaps to.
 *
 * `block` (the default, and what shipped before) rounds OUT to 16px blocks;
 * `tile` takes the dragged tiles exactly. Named after the two paint tools this
 * facet already offers — `paint-block` writes a 2x2 tile run, `paint-tile`
 * writes one 8x8 tile (MapViewport's tool branches), and neither touches
 * collision — so the vocabulary the author has already learned there is the
 * vocabulary here.
 */
export type MarqueeGranularity = 'block' | 'tile';

/**
 * THE MODIFIER RULE: Ctrl/Cmd during a marquee drag means "the OTHER one".
 *
 * The owner asked for *"if you hold control it behaves like it did where it
 * forces to draw collision size"* — Ctrl = block snapping, the pre-tile-
 * granularity behaviour. Taken literally that is a NO-OP in the shipped state:
 * `block` is still the default (`editorStore.marqueeGranularity`), so an author
 * who never touched the Snap control is already in block mode and holding Ctrl
 * would change nothing at all.
 *
 * So the modifier INVERTS the armed setting instead. Block + Ctrl gives tile,
 * tile + Ctrl gives block — which IS what he asked for whenever the Snap
 * control is set to Tile, and is the useful half of the gesture in the default
 * state where the literal reading does nothing. One rule, symmetric in both
 * directions, and the author never has to recall which way the panel is set:
 * the modifier is always the other one.
 *
 * A separate named function rather than a ternary at the two call sites because
 * three surfaces have to agree on it — MapViewport's mousedown, its mousemove,
 * and the panel's readout of which mode is actually in force. Two of those
 * decide the rect and the third describes it; a copy of the ternary in each is
 * how a panel comes to lie about the drag it is watching.
 *
 * Like `marqueeGranularity` itself this is a property of the DRAG, never of the
 * selection: the committed rect records only its geometry, and `isBlockAligned`
 * answers every downstream question from that.
 */
export function effectiveGranularity(base: MarqueeGranularity, invert: boolean): MarqueeGranularity {
  if (!invert) return base;
  return base === 'block' ? 'tile' : 'block';
}

/**
 * Is this tile rect expressible in 16px collision cells?
 *
 * Origin AND size both have to be even: an odd origin puts the rect's first
 * cell half outside it, an odd size puts the last cell half outside it, and
 * either way there is no cell the rect wholly owns at that edge.
 *
 * Keyed on the GEOMETRY, never on the granularity that produced it — a
 * tile-granularity drag that happens to land on even bounds is block-aligned
 * and carries collision like any other, and a caller that asked for `block` is
 * always aligned by construction. Nothing has to know which mode was armed.
 */
export function isBlockAligned(col: number, row: number, w: number, h: number): boolean {
  return (col % 2) === 0 && (row % 2) === 0 && (w % 2) === 0 && (h % 2) === 0;
}

/**
 * How to SAY a selection's size, in the units it is actually expressible in.
 *
 * One function because three surfaces have to agree — the copy toast, the
 * marquee panel's readout, and the paste command's undo description. Before
 * tile granularity they all hardcoded `w/2 x h/2 blocks`, which for a 5x3-tile
 * rect prints "2x1 blocks": a wrong number, in the wrong unit, for a selection
 * that is neither. A rect that is not block-aligned has no block size, so it is
 * named in tiles and nothing else.
 */
export function selectionSizeLabel(col: number, row: number, w: number, h: number): string {
  if (isBlockAligned(col, row, w, h)) return `${w >> 1}×${h >> 1} blocks`;
  return `${w}×${h} tiles`;
}

/** The one sentence that explains why a selection is art-only, for whichever
 *  surface has room for it. Empty string when it is not. */
export function artOnlyReason(col: number, row: number, w: number, h: number): string {
  if (isBlockAligned(col, row, w, h)) return '';
  return 'Not block-aligned: collision is stored per 16px block, so this selection is ART ONLY.';
}

/** Snap a tile-coord drag rect, clamped to the section. Corners may arrive in
 *  any order. In `block` granularity the rect rounds OUT to 16px boundaries so
 *  the marquee always covers what was dragged; in `tile` granularity it is the
 *  dragged tiles exactly, inclusive of both endpoints. */
export function snapMarquee(c0: number, r0: number, c1: number, r1: number,
  granularity: MarqueeGranularity = 'block'):
  { col: number; row: number; w: number; h: number } {
  let minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  let minR = Math.min(r0, r1), maxR = Math.max(r0, r1);

  // Clamp to the section BEFORE snapping — an out-of-bounds drag endpoint
  // must not push the snapped rect past the section edge.
  minC = Math.max(0, Math.min(minC, SECTION_TILES_WIDE - 1));
  maxC = Math.max(0, Math.min(maxC, SECTION_TILES_WIDE - 1));
  minR = Math.max(0, Math.min(minR, SECTION_TILES_HIGH - 1));
  maxR = Math.max(0, Math.min(maxR, SECTION_TILES_HIGH - 1));

  if (granularity === 'tile') {
    return { col: minC, row: minR, w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  const col = Math.floor(minC / 2) * 2;
  const row = Math.floor(minR / 2) * 2;
  const endCol = Math.min(SECTION_TILES_WIDE, Math.ceil((maxC + 1) / 2) * 2);
  const endRow = Math.min(SECTION_TILES_HIGH, Math.ceil((maxR + 1) / 2) * 2);

  return { col, row, w: endCol - col, h: endRow - row };
}

/**
 * Capture a section region (tile coords) into a clipboard.
 *
 * Art always. Collision ONLY when (col,row,w,h) is block-aligned — otherwise
 * the result is `artOnly` with EMPTY collision planes, for the reason in
 * MapClipboard's docblock. Empty rather than zero-filled deliberately: a
 * zero-filled plane of the right length is indistinguishable from "this region
 * is all air", and pasting it would ERASE the destination's collision (the
 * region writer treats air as authoritative). A length-0 plane cannot be
 * mistaken for data by anything, and `buildRegionWriteCommand` refuses it by
 * length.
 *
 * Missing/unseeded section collision planes read as air, as before.
 */
export function copyFromSection(section: Section, col: number, row: number,
  w: number, h: number): MapRegion {
  const nametable = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const srcIdx = (row + r) * SECTION_TILES_WIDE + (col + c);
      nametable[r * w + c] = section.tileGrid.nametable[srcIdx];
    }
  }

  if (!isBlockAligned(col, row, w, h)) {
    return {
      widthTiles: w, heightTiles: h, nametable,
      collisionA: new Uint16Array(0), collisionB: new Uint16Array(0),
      artOnly: true,
    };
  }

  const cellsW = w >> 1, cellsH = h >> 1;
  const collisionA = new Uint16Array(cellsW * cellsH);
  const collisionB = new Uint16Array(cellsW * cellsH);
  const planeA = section.collisionEdit ?? null;
  const planeB = section.collisionEditB ?? null;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tlCol = col + cx * 2, tlRow = row + cy * 2;
      const srcIdx = tlRow * SECTION_TILES_WIDE + tlCol;
      const outIdx = cy * cellsW + cx;
      collisionA[outIdx] = planeA ? planeA[srcIdx] : 0;
      collisionB[outIdx] = planeB ? planeB[srcIdx] : 0;
    }
  }

  return { widthTiles: w, heightTiles: h, nametable, collisionA, collisionB, artOnly: false };
}

/** Thin pure adapter: a chunk's nametable + both collision planes as a
 *  MapClipboard, so a chunk can seed the map clipboard (Art mode Ctrl+C on a
 *  chunk doc). Copies, never aliases, the chunk's arrays. `tileset` is the tile
 *  set the caller drew the chunk against, and is kept by REFERENCE: it is the
 *  identity a paste is checked against (see `MapClipboard`). */
export function copyChunkToClipboard(chunk: ChunkDef, tileset: Tileset): MapClipboard {
  // Alignment read off the chunk's own SHAPE, not assumed: `chunkCellCount`
  // FLOORS (w>>1)*(h>>1), so an odd-sized chunk's collision planes are already
  // short of its footprint and pasting them would land a row/column out. Such a
  // chunk pastes as art, on the same rule an unaligned marquee does.
  const aligned = isBlockAligned(0, 0, chunk.widthTiles, chunk.heightTiles);
  return {
    widthTiles: chunk.widthTiles,
    heightTiles: chunk.heightTiles,
    nametable: new Uint16Array(chunk.nametable),
    collisionA: aligned ? new Uint16Array(chunk.collisionA) : new Uint16Array(0),
    collisionB: aligned ? new Uint16Array(chunk.collisionB) : new Uint16Array(0),
    artOnly: !aligned,
    tileset,
  };
}

/**
 * The layers a paste of `clip` can ACTUALLY write, given what it carries.
 *
 * An `artOnly` clipboard has no collision to write, so `both` collapses to
 * `art` and `collision` collapses to nothing at all. Exported because the UI
 * has to show the same answer the command builder will act on — the paste
 * layers control disables what this rules out, and a control that offered a
 * mode the builder then dropped would be exactly the silent degradation this
 * whole rule exists to avoid.
 */
export function effectivePasteLayers(clip: MapRegion, layers: PasteLayers): PasteLayers | null {
  if (!clip.artOnly) return layers;
  return layers === 'collision' ? null : 'art';
}

/**
 * The tile-coord grid a paste of `clip` can land on.
 *
 * 2 for a clipboard with collision — `buildRegionWriteCommand` derives its
 * destination cells as `baseCol >> 1`, which FLOORS, so an odd base would put
 * the art one tile off the collision it is supposed to describe. 1 for an
 * art-only clipboard, which is the whole point of a tile-granular selection:
 * nothing downstream halves the base, so any tile is a legal origin.
 */
export function pasteBaseStep(clip: MapRegion): 1 | 2 {
  return clip.artOnly ? 1 : 2;
}

/** Build the atomic paste command at (baseCol,baseRow) tile coords (snapped by
 *  the caller to `pasteBaseStep(clip)`). Clipboard is authoritative over its
 *  footprint in the pasted layers (air clears); out-of-bounds cells are
 *  dropped. Shares its region-diffing internals with buildStampCommand
 *  (map-stamp.ts) — same shapes (nametable + two cell-word planes over a
 *  footprint), different source object. Returns null when nothing changes, and
 *  when the requested layers collapse to nothing (see effectivePasteLayers). */
export function buildPasteCommand(args: {
  clip: MapRegion; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; layers: PasteLayers; description: string;
}): BatchCommand | null {
  const { clip, section, sectionIndex, baseCol, baseRow, layers, description } = args;
  const effective = effectivePasteLayers(clip, layers);
  if (effective === null) return null;
  const cmd = buildRegionWriteCommand({
    source: clip, section, sectionIndex, baseCol, baseRow,
    writeArt: effective !== 'collision', writeCollision: effective !== 'art', description,
  });
  if (!cmd) return null;
  // A PASTE PRODUCES PLAIN TILES, and it must also BREAK whatever chunk
  // identity the destination had (owner ruling d-18c).
  //
  // A `MapClipboard` is a rectangle of words with no chunk identity of its own —
  // a marquee can straddle any number of stamps, or none — so there is nothing
  // to carry INTO the destination. But the tiles it overwrites may well have
  // remembered a chunk, and that memory is now false: the next propagation of
  // that chunk would silently undo the paste. Clearing is the honest half that
  // is available; carrying identity through the clipboard is deliberately left
  // to a later parcel (see the module header note in chunk-links.ts).
  //
  // A collision-only paste writes no nametable words, so `withLinkBreaks` finds
  // nothing to clear and returns the command untouched — correct: collision is
  // not what a chunk link is about.
  return withLinkBreaks(section, cmd) as BatchCommand;
}
