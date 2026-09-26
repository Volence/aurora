// `clips.json`: the file a paste writes (aeon `tools/clip_manifest.py`, schema 1).
//
// ═══ WHAT AURORA OWNS HERE AND WHAT IT DOES NOT ═══════════════════════════
//
// Aeon's loader is THE validator. It refuses R1..R12 and K1..K3 by name and
// warns W2/W3, and the page CALLS it (main/clip-tool.ts) on the exact bytes it
// is about to write rather than re-deriving the rules here. This module is the
// DOCUMENT: read one, add a clip to it, write it back without losing anything,
// and suggest defaults. The only rules it states are the ones a default has to
// satisfy to be worth suggesting (an id in the region-id pattern, a section-
// aligned destination with a 16-px-multiple shift), and every one of them is
// re-checked by aeon before a byte lands.
//
// ═══ NOTHING IS DROPPED ON WRITE ══════════════════════════════════════════
//
// A manifest carries keys no Aurora code reads (`note`, `unpainted_remainder`,
// `corridors`, a clip's `severed_xover_reason`) and aeon's gates read some of
// them. So the document keeps the RAW object and edits it in place: a clip is
// appended to `raw.clips`, and every other key, and every other clip, is the
// value that was read. Keys keep their order; the only formatting Aurora imposes
// is two-space JSON with one trailing newline (canonical-json.ts `jsonFileText`,
// the rule every JSON file Aurora writes into aeon follows).
//
// ═══ WHAT A PASTE DOES NOT WRITE, AND WHY ═════════════════════════════════
//
//   * no `palette` field: aeon REFUSES a manifest carrying one (R3);
//   * no `region_id`: it is a cross-reference into a `regions.json` row, and a
//     paste writes no row (aeon's clip ROM bake builds the region rows itself,
//     tools/clip_rom_bake.py `region_plan`), so writing it would name a
//     rectangle in a document that does not exist. It is READ absent-capable:
//     aeon's own s2_two_clip_pins carries it on no clip.
//
// ═══ THE ONE FIELD A PASTE COPIES: `music` (ROADMAP row 222) ══════════════
//
// A clip's `music` is OPTIONAL (absent = no song), and aeon's R3 holds every
// clip of one ZONE, which it keys by the pair (donor, zone), to the SAME value,
// absent included: tools/clip_manifest.py compares `raw.get("music") or None`
// clip against clip within a (donor, zone). So a new clip of a zone the act
// already carries has exactly one value R3 accepts: the song those clips name.
// `withClip` copies it (`zoneMusic`). It never invents one: a zone new to the
// act, or one whose clips name no song, gets no `music`; a zone whose clips
// already disagree (a manifest R3 refuses before this paste) gets none either,
// because there is no value to vouch for. Choosing a song is not a paste's job.

import { jsonFileText } from '../canonical-json';
import { REGIONS_SCHEMA } from '../regions/document';
import { SECTION_PIXEL_SIZE } from '../../model/s4-types';
import { COLLISION_QUANTUM_PX, MARQUEE_SNAP_PX } from './donor-marquee';

/** Where a clip act's manifest lives, relative to the aeon root. */
export const CLIPS_ROOT_REL = 'games/sonic4/data/clips';
export const MANIFEST_SCHEMA = 1;
export const MANIFEST_UNITS = 'world_px';

export function clipsManifestPath(actId: string): string {
  return `${CLIPS_ROOT_REL}/${actId}/clips.json`;
}

/**
 * The region-id pattern, READ from the vendored regions schema rather than
 * typed: aeon holds clip ids, act ids and `region_id` to exactly this pattern so
 * one rectangle keeps one name in both documents (clip_manifest.py R3).
 */
function regionIdPattern(): RegExp {
  const defs = (REGIONS_SCHEMA as unknown as { $defs: { region: { properties: { id: { pattern: string } } } } }).$defs;
  return new RegExp(defs.region.properties.id.pattern);
}
export const REGION_ID_RE = regionIdPattern();

export interface ClipRect { x: number; y: number; w: number; h: number }

export interface ClipView {
  id: string;
  donor: string;
  zone: string;
  src: ClipRect;
  dst: ClipRect;
  /** Absent in the file is null here, never a derived name. */
  regionId: string | null;
  unalignedDstReason: string | null;
  /** The clip's `music` (a SONG_* name); absent or empty in the file is null, as aeon reads it. */
  music: string | null;
}

export interface CorridorView { id: string; dst: ClipRect; floorY: number }

export interface ClipManifestDoc {
  /** Every key as read (or as built), in order. The ONLY thing serialised. */
  raw: Record<string, unknown>;
  id: string;
  gridW: number;
  gridH: number;
  clips: ClipView[];
  corridors: CorridorView[];
}

export class ClipManifestDocError extends Error {
  constructor(message: string) { super(message); this.name = 'ClipManifestDocError'; }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function rectOf(v: unknown, where: string): ClipRect {
  if (!isObj(v)) throw new ClipManifestDocError(`${where} is not an object`);
  const out = { x: 0, y: 0, w: 0, h: 0 };
  for (const k of ['x', 'y', 'w', 'h'] as const) {
    const n = v[k];
    if (typeof n !== 'number' || !Number.isInteger(n)) throw new ClipManifestDocError(`${where}.${k} is not an integer`);
    out[k] = n;
  }
  return out;
}

function view(raw: Record<string, unknown>, label: string): ClipManifestDoc {
  const act = raw.act;
  if (!isObj(act) || typeof act.grid_w !== 'number' || typeof act.grid_h !== 'number') {
    throw new ClipManifestDocError(`${label}: act.grid_w / act.grid_h missing`);
  }
  if (typeof raw.id !== 'string') throw new ClipManifestDocError(`${label}: id missing`);
  const clipsRaw = Array.isArray(raw.clips) ? raw.clips : [];
  const clips: ClipView[] = clipsRaw.map((c, i) => {
    if (!isObj(c)) throw new ClipManifestDocError(`${label}: clips[${i}] is not an object`);
    return {
      id: String(c.id),
      donor: String(c.donor),
      zone: String(c.zone),
      src: rectOf(c.src_rect, `${label}: clips[${i}].src_rect`),
      dst: rectOf(c.dst_rect, `${label}: clips[${i}].dst_rect`),
      regionId: typeof c.region_id === 'string' && c.region_id !== '' ? c.region_id : null,
      unalignedDstReason: typeof c.unaligned_dst_reason === 'string' && c.unaligned_dst_reason !== ''
        ? c.unaligned_dst_reason : null,
      music: typeof c.music === 'string' && c.music !== '' ? c.music : null,
    };
  });
  const corrRaw = Array.isArray(raw.corridors) ? raw.corridors : [];
  const corridors: CorridorView[] = corrRaw.filter(isObj).map((c, i) => ({
    id: String(c.id),
    dst: rectOf(c.dst_rect, `${label}: corridors[${i}].dst_rect`),
    floorY: typeof c.floor_y === 'number' ? c.floor_y : 0,
  }));
  return { raw, id: raw.id, gridW: act.grid_w, gridH: act.grid_h, clips, corridors };
}

/**
 * Read a manifest for DISPLAY and EDITING. Structural only: a manifest this
 * parses may still be one aeon refuses, and the page never treats a parse as a
 * verdict. A manifest this does NOT parse is shown to the author as unreadable,
 * and nothing is written over it.
 */
export function parseClipManifest(text: string, label = 'clips.json'): ClipManifestDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ClipManifestDocError(`${label}: not JSON (${(e as Error).message})`);
  }
  if (!isObj(raw)) throw new ClipManifestDocError(`${label}: top level is not an object`);
  return view(raw, label);
}

/** A new, clip-less manifest. Not writable until it has a clip (aeon's R3). */
export function newClipManifest(id: string, gridW: number, gridH: number): ClipManifestDoc {
  const raw: Record<string, unknown> = {
    schema: MANIFEST_SCHEMA,
    units: MANIFEST_UNITS,
    id,
    act: { grid_w: gridW, grid_h: gridH },
    clips: [],
  };
  return view(raw, 'new clips.json');
}

export interface NewClip {
  id: string;
  donor: string;
  zone: string;
  src: ClipRect;
  dst: ClipRect;
  /** Aeon's R11 opt-out; written only when non-empty. */
  unalignedDstReason?: string | null;
}

/**
 * The song aeon's R3 will hold a new clip of (donor, zone) to: the `music` every
 * clip of that pair already in `doc` names, when they all name the same one.
 * Null when the act has no clip of the pair, when those clips name no song, or
 * when they disagree (then R3 already refuses the manifest, and no value is one
 * Aurora can vouch for).
 */
export function zoneMusic(doc: ClipManifestDoc, donor: string, zone: string): string | null {
  const songs = new Set(doc.clips.filter((c) => c.donor === donor && c.zone === zone).map((c) => c.music));
  if (songs.size !== 1) return null;
  const [only] = songs;
  return only;
}

/**
 * The manifest with `clip` appended. A NEW document: the input is not touched,
 * so an undo can hold the old one and be sure of it.
 *
 * Keys in aeon's documented order (clip_manifest.py THE FORMAT), and nothing
 * Aurora cannot vouch for: no `region_id`, no `palette`. `music` is written
 * only when the clip's zone already names one in this act, and then it is that
 * song (`zoneMusic`, aeon's R3).
 */
export function withClip(doc: ClipManifestDoc, clip: NewClip): ClipManifestDoc {
  const raw = structuredClone(doc.raw);
  const entry: Record<string, unknown> = {
    id: clip.id,
    donor: clip.donor,
    zone: clip.zone,
    src_rect: { ...clip.src },
    dst_rect: { ...clip.dst },
  };
  if (clip.unalignedDstReason) entry.unaligned_dst_reason = clip.unalignedDstReason;
  const music = zoneMusic(doc, clip.donor, clip.zone);
  if (music !== null) entry.music = music;
  const clips = Array.isArray(raw.clips) ? raw.clips : [];
  raw.clips = [...clips, entry];
  return view(raw, 'clips.json');
}

/**
 * The file text: two-space JSON, exactly one trailing newline, and every
 * non-ASCII character as a `\\uXXXX` escape. The last is aeon's own spelling
 * (its manifests are written by Python's `json`, whose default is ASCII-only),
 * so a paste into an existing manifest does not rewrite every prose line that
 * carries a dash or a symbol.
 */
export function serializeClipManifest(doc: ClipManifestDoc): string {
  const text = JSON.stringify(doc.raw, null, 2)
    .replace(/[\u0080-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return jsonFileText(text);
}

/** Every rectangle already placed in the act: clips and corridors. */
export function placedRects(doc: ClipManifestDoc | null): ClipRect[] {
  if (!doc) return [];
  return [...doc.clips.map((c) => c.dst), ...doc.corridors.map((c) => c.dst)];
}

function overlaps(a: ClipRect, b: ClipRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * A fresh clip id for `zone`: `<zone lower-cased>_<n>`, the first n free across
 * clips AND corridors (aeon's K1 holds them to one namespace). Null only when
 * the zone name cannot start a region id at all.
 */
export function suggestClipId(doc: ClipManifestDoc | null, zone: string): string | null {
  const base = zone.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const taken = new Set([...(doc?.clips ?? []).map((c) => c.id), ...(doc?.corridors ?? []).map((c) => c.id)]);
  for (let n = 1; n < 1000; n++) {
    const id = `${base}_${n}`;
    if (REGION_ID_RE.test(id) && !taken.has(id)) return id;
  }
  return null;
}

/** Whether an id could be written: the pattern, and not already in the act. */
export function clipIdProblem(doc: ClipManifestDoc | null, id: string): string | null {
  if (!REGION_ID_RE.test(id)) return `"${id}" is not a region id (${REGION_ID_RE.source})`;
  if (doc?.clips.some((c) => c.id === id) || doc?.corridors.some((c) => c.id === id)) {
    return `"${id}" is already a clip or corridor in this act`;
  }
  return null;
}

/**
 * Where a click in the target act puts the clip's top-left.
 *
 *   'section' (the default): the section origin under the click. Aeon's R11
 *     wants a section-aligned origin unless the clip carries a reason.
 *   'free': the nearest point to the click whose SHIFT from the source is a
 *     multiple of 16 px in both axes (R12, the collision quantum), which also
 *     keeps it on the 8-px grid because the source is on it.
 *
 * Clamped so the clip starts inside the act; aeon still refuses one that runs
 * past its edge (R8), and the page says so in aeon's words.
 */
export function snapDestination(
  p: { x: number; y: number }, src: ClipRect, mode: 'section' | 'free',
): { x: number; y: number } {
  if (mode === 'section') {
    return {
      x: Math.max(0, Math.floor(p.x / SECTION_PIXEL_SIZE) * SECTION_PIXEL_SIZE),
      y: Math.max(0, Math.floor(p.y / SECTION_PIXEL_SIZE) * SECTION_PIXEL_SIZE),
    };
  }
  const q = COLLISION_QUANTUM_PX;
  const snap = (v: number, s: number) => {
    let d = s + Math.round((v - s) / q) * q;
    while (d < 0) d += q;
    return d;
  };
  return { x: snap(p.x, src.x), y: snap(p.y, src.y) };
}

/**
 * The first section-aligned origin, row by row, where `src` fits inside the
 * act and overlaps nothing already placed. Null when there is none, or when the
 * source is off the 16-px collision grid (then no section-aligned paste can pass
 * R12, and the page asks for a free placement with a reason instead).
 */
export function suggestDestination(
  doc: ClipManifestDoc | null, gridW: number, gridH: number, src: ClipRect,
): { x: number; y: number } | null {
  if (src.x % COLLISION_QUANTUM_PX || src.y % COLLISION_QUANTUM_PX) return null;
  if (src.x % MARQUEE_SNAP_PX || src.y % MARQUEE_SNAP_PX) return null;
  const placed = placedRects(doc);
  const W = gridW * SECTION_PIXEL_SIZE;
  const H = gridH * SECTION_PIXEL_SIZE;
  for (let y = 0; y + src.h <= H; y += SECTION_PIXEL_SIZE) {
    for (let x = 0; x + src.w <= W; x += SECTION_PIXEL_SIZE) {
      const r = { x, y, w: src.w, h: src.h };
      if (!placed.some((p) => overlaps(p, r))) return { x, y };
    }
  }
  return null;
}

/** The smallest section grid that holds `rect` placed at the origin. */
export function gridToHold(rect: ClipRect): { gridW: number; gridH: number } {
  return {
    gridW: Math.max(1, Math.ceil((rect.x + rect.w) / SECTION_PIXEL_SIZE)),
    gridH: Math.max(1, Math.ceil((rect.y + rect.h) / SECTION_PIXEL_SIZE)),
  };
}
