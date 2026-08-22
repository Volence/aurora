// Animated object-preview strips for the classic level viewport.
//
// The pure core (level-classic/s1-object-anim.ts) decides WHICH anim a placed
// object's preview plays and which step shows at game frame t; this module does
// the IO + canvas half, exactly like classicObjectArtStore does for the static
// sprites: read the id's `_anim/*.asm` + art/mappings files over the batch IPC
// FileAccess, render every DISTINCT mapping frame the chosen anim uses against
// the act's live palette, and hand the viewport a strip (steps + one
// ImageBitmap per frame) it can index per tick.
//
// OVERLAY-ONLY: strips are derived render state. Nothing here writes the doc,
// the object list, or any store — the draw pass swaps which bitmap it blits and
// that is the whole feature.
//
// Frames render with the object's BASE art link (resolveObjectArt) and the
// script's own frame indices. That is deliberate: the one curated id with a
// subtype rule ($26 Monitor) has a rule that only SELECTS a single mappings
// frame (one(MONITOR_FRAME[subtype])) over the same art/mappings the base link
// names — and its curated anim (obAnim = subtype) already picks the
// subtype-specific flicker, so the base link is the right pool. Rule ids whose
// rules COMPOSE pieces or swap art files are named exclusions in the curation
// table (springs, helix, Newtron, capsule).

import { decodeGenesisColor } from '../../../core/formats/palette';
import { indicesToRGBA } from '../../../core/art/sprite-render';
import { renderResolvedObjectFrame } from '../../../core/level-classic/object-sprite';
import { parseS1DisasmAnimScript } from '../../../core/import/anim-import';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import {
  buildScriptPreview, buildSyncPreview, objectAnimStateKey, resolvePreviewAnim,
  type PreviewAnim,
} from '../../../core/level-classic/s1-object-anim';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';
import type { Color } from '../../../core/model/s4-types';
import type { ObjectSprite } from '../../state/classicObjectArtStore';
import { createIpcFileAccess } from '../../state/classic-file-access';

/** One id's playable preview: its steps + a rendered bitmap per distinct frame. */
export interface AnimStrip {
  anim: PreviewAnim;
  /** Mapping-frame index → rendered sprite (unflipped; flips applied at draw). */
  frames: Map<number, ObjectSprite>;
}

/** Strips keyed by stripKeyFor's placement key. */
export type StripMap = Map<string, AnimStrip>;

/**
 * The strip a placement reads, or null → static. The key folds in exactly the
 * inputs the curation rule reads (id + the subtype/yflip-derived anim), so two
 * monitors of different subtypes get different strips while forty identical
 * rings share one.
 */
export function stripKeyFor(obj: Pick<S1ObjectEntry, 'id' | 'subtype' | 'yflip'>): string | null {
  const resolved = resolvePreviewAnim(obj.id, obj.subtype, obj.yflip);
  if (!resolved) return null;
  return resolved.kind === 'sync'
    ? `${obj.id}:sync:${resolved.entry.name}`
    : `${obj.id}:a${resolved.animIndex}`;
}

/**
 * Signature of the strip set an object list needs — the viewport reloads strips
 * only when this (or a content epoch) changes, so object drags/deletes that
 * keep the same id/anim set never re-render a bitmap.
 */
export function stripSignature(objects: readonly S1ObjectEntry[]): string {
  const keys = new Set<string>();
  for (const o of objects) {
    const k = stripKeyFor(o);
    if (k) keys.add(k);
  }
  return [...keys].sort().join(',');
}

function paletteColors(doc: LevelDoc, line: number): Color[] {
  const words = doc.palettes[line] ?? doc.palettes[0] ?? new Uint16Array(16);
  const out: Color[] = [];
  for (let i = 0; i < 16; i++) out.push(decodeGenesisColor(words[i] ?? 0));
  return out;
}

/**
 * Load every strip the doc's placements need, rendering each distinct mapping
 * frame once. File reads are batched into one IPC round-trip (readMany), like
 * refreshClassicObjectSprites' prefetch. A strip whose anim resolves to fewer
 * than 2 steps is dropped (a one-frame "loop" IS the static preview); an id
 * with no art link, a missing file, or an all-out-of-range anim index simply
 * yields no strip — the static sprite keeps drawing.
 */
export async function loadObjectAnimStrips(
  dir: string, doc: LevelDoc, zone: string,
): Promise<StripMap> {
  // Distinct strips wanted, with one representative placement each.
  const wants = new Map<string, { id: number; subtype: number; yflip: boolean }>();
  for (const o of doc.objects) {
    const k = stripKeyFor(o);
    if (k && !wants.has(k)) wants.set(k, { id: o.id, subtype: o.subtype, yflip: o.yflip });
  }
  const out: StripMap = new Map();
  if (wants.size === 0) return out;

  // One batch read: every anim script + art/mappings file involved.
  const files = new Set<string>();
  for (const { id, subtype, yflip } of wants.values()) {
    const resolved = resolvePreviewAnim(id, subtype, yflip)!;
    if (resolved.kind === 'script') files.add(resolved.animAsm);
    const link = resolveObjectArt(id, zone);
    if (!link) continue;
    if (link.artSource === 'file') files.add(link.artFile);
    files.add(link.mapAsm);
  }
  const fa = createIpcFileAccess(dir);
  const bytes = new Map<string, Uint8Array | null>();
  if (fa.readMany) {
    for (const [p, e] of await fa.readMany([...files])) bytes.set(p, e.bytes);
  } else {
    for (const f of files) {
      try { bytes.set(f, await fa.read(f)); } catch { bytes.set(f, null); }
    }
  }
  const parsedCache = new Map<string, ReturnType<typeof parseS1DisasmAnimScript>['anims'] | null>();
  const parsedFor = (animAsm: string) => {
    if (!parsedCache.has(animAsm)) {
      const b = bytes.get(animAsm);
      parsedCache.set(animAsm, b ? parseS1DisasmAnimScript(new TextDecoder().decode(b)).anims : null);
    }
    return parsedCache.get(animAsm) ?? null;
  };

  for (const [key, { id, subtype, yflip }] of wants) {
    const resolved = resolvePreviewAnim(id, subtype, yflip)!;
    let anim: PreviewAnim | null = null;
    if (resolved.kind === 'sync') {
      anim = buildSyncPreview(resolved.entry);
    } else {
      const parsed = parsedFor(resolved.animAsm);
      if (parsed) anim = buildScriptPreview(parsed, resolved.animIndex);
    }
    // <2 steps = the static preview already shows this; skip the strip.
    if (!anim || anim.steps.length < 2) continue;

    const link = resolveObjectArt(id, zone);
    if (!link || link.dplcAsm) continue; // unlinked, or streamed-art (Sonic-only) — static
    const mapBytes = bytes.get(link.mapAsm);
    const artBytes = link.artSource === 'file' ? bytes.get(link.artFile) : null;
    if (!mapBytes || (link.artSource === 'file' && !artBytes)) continue;
    const mapText = new TextDecoder().decode(mapBytes);
    const colors = paletteColors(doc, link.pal);

    const frames = new Map<number, ObjectSprite>();
    for (const step of anim.steps) {
      if (frames.has(step.frame)) continue;
      const rendered = renderResolvedObjectFrame(
        {
          artSource: link.artSource, compression: link.compression,
          tileIndexOffset: link.tileIndexOffset, frame: step.frame, pieces: null,
        },
        mapText, artBytes ?? null, link.artSource === 'levelArt' ? doc.tiles : null,
      );
      if (rendered.width <= 0 || rendered.height <= 0) continue;
      const rgba = indicesToRGBA(rendered.indices, colors);
      const img = new ImageData(new Uint8ClampedArray(rgba), rendered.width, rendered.height);
      // A fully transparent frame still gets a bitmap: some anims legitimately
      // hold a blank frame (SBZ vanishing platform's vanish phase) and drawing
      // nothing there IS the engine-faithful preview.
      //
      // priBitmap: the hi-pri-pieces-only companion, per FRAME — so occlusion
      // composes with animation (a frame that carries a priority piece keeps
      // exactly that frame's hi-pri pixels above the map while it shows).
      let priBitmap: ImageBitmap | null = null;
      if (rendered.priMask && rendered.priMask.some((v) => v !== 0)) {
        const priRgba = new Uint8ClampedArray(rgba);
        for (let i = 0; i < rendered.priMask.length; i++) {
          if (rendered.priMask[i] === 0) priRgba[i * 4 + 3] = 0;
        }
        priBitmap = await createImageBitmap(new ImageData(priRgba, rendered.width, rendered.height));
      }
      frames.set(step.frame, {
        bitmap: await createImageBitmap(img),
        width: rendered.width, height: rendered.height,
        originX: rendered.originX, originY: rendered.originY,
        priBitmap,
      });
    }
    if (frames.size === 0) continue;
    out.set(key, { anim, frames });
  }
  return out;
}

/** objectAnimStateKey over a StripMap (the clock's repaint gate). */
export function stripStateKey(strips: StripMap, t: number): string {
  const entries: [string, PreviewAnim][] = [];
  for (const [k, s] of strips) entries.push([k, s.anim]);
  return objectAnimStateKey(entries, t);
}

/** Close every bitmap in a strip map (on replace/unmount). */
export function closeStrips(strips: StripMap): void {
  for (const s of strips.values()) for (const f of s.frames.values()) { f.bitmap.close(); f.priBitmap?.close(); }
}
