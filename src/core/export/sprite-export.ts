import { assembleSprite } from '../art/sprite-decompose';
import type { RawFrame } from '../art/sprite-decompose';
import { serializeSpriteMappings } from './sprite-mappings-export';
import { serializeTiles } from './tile-dedup';
import { generatePerFrameAnimationAsm } from './sprite-anim-export';
import type { PerFrameAnimation } from './sprite-anim-export';

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SpriteExport {
  /** S4 VDP-order mappings binary (Plan 1). */
  mappings: Uint8Array;
  /** Uncompressed 4bpp tile art (serializeTiles). */
  art: Uint8Array;
  /** Animation script .asm text (per-frame form), table label `Ani_<name>`. */
  animAsm: string;
  /** Human/editor-readable manifest for the sprite folder. */
  manifest: SpriteManifest;
}

export interface SpriteManifest {
  name: string;
  frame: { width: number; height: number };
  frameCount: number;
  tileCount: number;
  piecesPerFrame: number[];
  animTable: string;
  bytes: { mappings: number; art: number };
}

/**
 * Assemble a sprite's painted frames + animation into the engine artifacts that
 * land in s4_engine/data/sprites/<name>/. Pure: callers handle file writes.
 * The animation's step.frame values index editor frames, which assembleSprite
 * preserves 1:1 as mapping-frame indices.
 */
export function buildSpriteExport(name: string, rawFrames: RawFrame[], anim: PerFrameAnimation): SpriteExport {
  if (!LABEL_RE.test(name)) throw new Error(`sprite name "${name}" is not a valid asm label`);
  if (rawFrames.length === 0) throw new Error('buildSpriteExport: no frames');

  const { art, frames } = assembleSprite(rawFrames);
  const mappings = serializeSpriteMappings(frames);
  const artBytes = serializeTiles(art);

  const animTable = `Ani_${name}`;
  const animAsm = generatePerFrameAnimationAsm(animTable, [anim]);

  const manifest: SpriteManifest = {
    name,
    frame: { width: rawFrames[0].width, height: rawFrames[0].height },
    frameCount: frames.length,
    tileCount: art.length,
    piecesPerFrame: frames.map((f) => f.pieces.length),
    animTable,
    bytes: { mappings: mappings.length, art: artBytes.length },
  };

  return { mappings, art: artBytes, animAsm, manifest };
}
