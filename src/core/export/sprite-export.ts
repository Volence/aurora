import { assembleSprite, decomposeFrame } from '../art/sprite-decompose';
import type { RawFrame } from '../art/sprite-decompose';
import { serializeTiles } from './tile-dedup';
import { generatePerFrameAnimationAsm } from './sprite-anim-export';
import type { PerFrameAnimation } from './sprite-anim-export';
import { getAdapter } from '../formats/games';
import { compressionFor } from '../compress';
import type { SpriteFormatId } from '../formats/sprite-format-adapter';
import type { SpriteFrame } from '../model/sprite-types';
import type { Tile } from '../model/s4-types';

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SpriteExport {
  /** S4 VDP-order mappings binary (Plan 1). DPLC mode uses frame-LOCAL tile indices. */
  mappings: Uint8Array;
  /** Uncompressed 4bpp tile art (serializeTiles). */
  art: Uint8Array;
  /** DPLC stream (only when exported as DPLC; undefined for non-DPLC sprites). */
  dplc?: Uint8Array;
  /** Animation script .asm text (per-frame form), table label `Ani_<name>`. */
  animAsm: string;
  /** Human/editor-readable manifest for the sprite folder. */
  manifest: SpriteManifest;
}

/** Serialize per-frame DPLC entries (inverse of parseDPLC). */
export function serializeDPLC(frames: Array<Array<{ start: number; count: number }>>): Uint8Array {
  const tableSize = frames.length * 2;
  const blocks = frames.map((entries) => {
    const buf = new Uint8Array(2 + entries.length * 2);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, entries.length, false);
    entries.forEach((e, i) => dv.setUint16(2 + i * 2, (((e.count - 1) & 0xf) << 12) | (e.start & 0xfff), false));
    return buf;
  });
  const total = tableSize + blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = tableSize;
  frames.forEach((_, i) => { dv.setUint16(i * 2, off, false); out.set(blocks[i], off); off += blocks[i].length; });
  return out;
}

/**
 * DPLC decomposition: each frame decomposes into its OWN tile pool (frame-local
 * mapping indices), the art is laid contiguously per frame, and each frame's
 * source-tile indices are consecutive from its base. Serialization to a concrete
 * game format (mappings + DPLC packing) is done by the target adapter.
 */
export function buildDPLCData(rawFrames: RawFrame[]): { frames: SpriteFrame[]; allTiles: Tile[]; perFrameTiles: number[][] } {
  const allTiles: Tile[] = [];
  const frames: SpriteFrame[] = [];
  const perFrameTiles: number[][] = [];
  for (const rf of rawFrames) {
    const { tiles, pieces } = decomposeFrame(rf);
    const base = allTiles.length;
    for (const t of tiles) allTiles.push(t);
    frames.push({ id: rf.id, pieces }); // LOCAL piece tile indices (0-based per frame)
    perFrameTiles.push(tiles.map((_, k) => base + k)); // contiguous source indices
  }
  return { frames, allTiles, perFrameTiles };
}

export interface SpriteManifest {
  name: string;
  frame: { width: number; height: number };
  frameCount: number;
  tileCount: number;
  /** Palette line the sprite was authored against (for previews). */
  paletteLine: number;
  /** true = streamed art (DPLC + frame-local mappings); false = all art resident. */
  dplc: boolean;
  animTable: string;
  /** Timeline steps (frame index + 1/60s hold) so a load can restore the animation. */
  animSteps: { frame: number; duration: number }[];
  bytes: { mappings: number; art: number; dplc: number };
  /** Game format the artifacts were written in (defaults the export target on re-open). */
  sourceFormat: SpriteFormatId;
}

/**
 * Assemble a sprite's painted frames + animation into the engine artifacts that
 * land in s4_engine/data/sprites/<name>/. Pure: callers handle file writes.
 * The animation's step.frame values index editor frames, which assembleSprite
 * preserves 1:1 as mapping-frame indices.
 */
export function buildSpriteExport(name: string, rawFrames: RawFrame[], anim: PerFrameAnimation, opts?: { dplc?: boolean; targetFormat?: SpriteFormatId }): SpriteExport {
  if (!LABEL_RE.test(name)) throw new Error(`sprite name "${name}" is not a valid asm label`);
  if (rawFrames.length === 0) throw new Error('buildSpriteExport: no frames');

  const targetFormat = opts?.targetFormat ?? 's4';
  const adapter = getAdapter(targetFormat);
  const codec = compressionFor(adapter.artCompression);

  let mappings: Uint8Array, artBytes: Uint8Array, dplc: Uint8Array | undefined, tileCount: number, frameCount: number;
  if (opts?.dplc) {
    const d = buildDPLCData(rawFrames);
    mappings = adapter.writeMappings(d.frames);
    artBytes = codec.compress(serializeTiles(d.allTiles));
    dplc = adapter.writeDPLC ? adapter.writeDPLC(d.perFrameTiles) : undefined;
    tileCount = d.allTiles.length; frameCount = rawFrames.length;
  } else {
    const { art, frames } = assembleSprite(rawFrames); // flat: all art resident, global tile indices
    mappings = adapter.writeMappings(frames);
    artBytes = codec.compress(serializeTiles(art));
    tileCount = art.length; frameCount = frames.length;
  }

  const animTable = `Ani_${name}`;
  const animAsm = generatePerFrameAnimationAsm(animTable, [anim]);

  const manifest: SpriteManifest = {
    name,
    frame: { width: rawFrames[0].width, height: rawFrames[0].height },
    frameCount,
    tileCount,
    paletteLine: rawFrames[0].palette,
    dplc: !!opts?.dplc,
    animTable,
    animSteps: anim.steps.map((s) => ({ frame: s.frame, duration: s.duration })),
    bytes: { mappings: mappings.length, art: artBytes.length, dplc: dplc?.length ?? 0 },
    sourceFormat: targetFormat,
  };

  return { mappings, art: artBytes, dplc, animAsm, manifest };
}
