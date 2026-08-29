import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { nemesisCompress, nemesisDecompress } from '../../../compress/nemesis';
import { parseTiles } from '../../tiles';
import { serializeTiles } from '../../../export/tile-dedup';
import { renderFrameToIndices } from '../../../art/sprite-render';
import { parseAsmMappings } from '../../../import/asm-mappings';
import { reconstructFromFrames } from '../../../import/sprite-import';
import type { Tile } from '../../../model/s4-types';
import type { SpriteFrame } from '../../../model/sprite-types';
import { buildEditedTiles, encodeS1ArtWriteBack, type EditedFrame } from '../s1-art-write';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;
const hasS1 = fs.existsSync(S1DIR);

/** A tile whose 64 pixels are a deterministic function of the tile index. */
function synthTile(idx: number): Tile {
  const pixels = new Uint8Array(64);
  for (let i = 0; i < 64; i++) pixels[i] = ((idx * 7 + i * 3) & 0x0f);
  return { pixels };
}

/** A simple 2x2-cell single-piece frame over tiles 0..3 (VDP column-major). */
function synthMapping(): SpriteFrame {
  return {
    id: 'f0',
    pieces: [
      { xOffset: 0, yOffset: 0, widthCells: 2, heightCells: 2, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
    ],
  };
}

/** Render the mapping to a canvas the way the open path does (shared origin 0,0). */
function renderCanvas(mapping: SpriteFrame, tiles: Tile[], width: number, height: number): EditedFrame {
  const indices = renderFrameToIndices(mapping, tiles, width, height, 0, 0);
  return { indices, width, height };
}

describe('s1 object art save-back (Nemesis)', () => {
  it('buildEditedTiles is the inverse of render for a zero-edit save', () => {
    const tiles = [0, 1, 2, 3].map(synthTile);
    const mapping = synthMapping();
    const canvas = renderCanvas(mapping, tiles, 16, 16);
    const out = buildEditedTiles(tiles, [canvas], [mapping], 0, 0);
    // Every referenced pixel round-trips exactly (non-overlapping single piece).
    expect(serializeTiles(out)).toEqual(serializeTiles(tiles));
    // Original tiles are not mutated.
    expect(tiles[0].pixels[0]).toBe(synthTile(0).pixels[0]);
  });

  it('inverts flipped pieces (xFlip / yFlip / both) byte-for-byte — CI-safe, no fixtures', () => {
    // Four x-adjacent 2x2-cell pieces, one per flip combination, over 16 tiles.
    // Locks the hand-mirrored forward/inverse flip coupling WITHOUT s1disasm.
    const tiles = Array.from({ length: 16 }, (_, i) => synthTile(i));
    const mkPiece = (col: number, tile: number, xFlip: boolean, yFlip: boolean) => ({
      xOffset: col * 16, yOffset: 0, widthCells: 2, heightCells: 2, tile,
      palette: 0, priority: false, xFlip, yFlip,
    });
    const frame: SpriteFrame = {
      id: 'flips',
      pieces: [
        mkPiece(0, 0, false, false),
        mkPiece(1, 4, true, false),
        mkPiece(2, 8, false, true),
        mkPiece(3, 12, true, true),
      ],
    };
    // Wide enough for 4 x-adjacent 2-cell (16px) pieces at origin 0.
    const width = 64, height = 16;
    const canvas = renderCanvas(frame, tiles, width, height);
    const out = buildEditedTiles(tiles, [canvas], [frame], 0, 0);
    expect(serializeTiles(out)).toEqual(serializeTiles(tiles));
  });

  it('encodeS1ArtWriteBack: zero-edit round-trips decode-identical', () => {
    const tiles = [0, 1, 2, 3].map(synthTile);
    const mapping = synthMapping();
    const canvas = renderCanvas(mapping, tiles, 16, 16);
    const res = encodeS1ArtWriteBack(tiles, [canvas], [mapping], 0, 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(nemesisDecompress(res.bytes)).toEqual(serializeTiles(tiles));
  });

  it('encodeS1ArtWriteBack: an edited pixel lands in the right tile and round-trips', () => {
    const tiles = [0, 1, 2, 3].map(synthTile);
    const mapping = synthMapping();
    const canvas = renderCanvas(mapping, tiles, 16, 16);
    // Paint pixel (0,0) of the canvas → top-left of source tile 0 (col-major cell 0).
    canvas.indices[0] = 0xf;
    const res = encodeS1ArtWriteBack(tiles, [canvas], [mapping], 0, 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const decoded = parseTiles(nemesisDecompress(res.bytes));
    expect(decoded[0].pixels[0]).toBe(0xf);
    // Untouched tiles are byte-identical to the originals.
    expect(decoded[3].pixels).toEqual(tiles[3].pixels);
  });

  it('self-check gate refuses when the injected compressor is broken', () => {
    const tiles = [0, 1, 2, 3].map(synthTile);
    const mapping = synthMapping();
    const canvas = renderCanvas(mapping, tiles, 16, 16);
    const brokenCompress = (b: Uint8Array) => nemesisCompress(b).slice(0, -1); // truncate → un-decodable
    const res = encodeS1ArtWriteBack(tiles, [canvas], [mapping], 0, 0, brokenCompress);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/self-check/i);
  });

  it('preserves tile count so read-only mappings stay valid', () => {
    const tiles = [0, 1, 2, 3, 4, 5].map(synthTile);
    const mapping = synthMapping(); // references only tiles 0..3
    const canvas = renderCanvas(mapping, tiles, 16, 16);
    const res = encodeS1ArtWriteBack(tiles, [canvas], [mapping], 0, 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(nemesisDecompress(res.bytes).length).toBe(6 * 32);
  });

  it('real artnem file re-encodes decode-identical (codec round-trip)', { skip: !hasS1, meta: { skipReason: S1_ABSENT } }, () => {
    const raw = new Uint8Array(fs.readFileSync(`${S1DIR}/artnem/Enemy Jaws.nem`));
    const decoded = nemesisDecompress(raw);
    const back = nemesisDecompress(nemesisCompress(decoded));
    expect(back).toEqual(decoded);
  });

  // The real risk in the inverse render is flips + multi-piece layout, not the
  // trivial single unflipped piece above. Jaws is a 4-frame, 2-piece-per-frame
  // sprite whose pieces are x-adjacent and whose open2/shut2 second piece is
  // yflipped — decode the real art + parse the real _maps mappings, render each
  // frame forward through the actual open path, then prove a zero-edit inversion
  // reproduces the whole 32-tile pool byte-for-byte.
  it('real-shape zero-edit inversion reproduces the tile pool (2-piece + yflip)', { skip: !hasS1, meta: { skipReason: S1_ABSENT } }, () => {
    const artBytes = new Uint8Array(fs.readFileSync(`${S1DIR}/artnem/Enemy Jaws.nem`));
    const mappings = parseAsmMappings(fs.readFileSync(`${S1DIR}/_maps/Jaws.asm`, 'utf8'));
    expect(mappings.length).toBe(4);
    expect(mappings.every((f) => f.pieces.length === 2)).toBe(true);
    expect(mappings.some((f) => f.pieces.some((p) => p.yFlip))).toBe(true); // exercises the flip path

    const originalTiles = parseTiles(nemesisDecompress(artBytes));
    const recon = reconstructFromFrames(mappings, artBytes, 'nemesis'); // forward render, real open path
    const editedFrames: EditedFrame[] = recon.frames.map((data) => ({ indices: data, width: recon.width, height: recon.height }));
    const out = buildEditedTiles(originalTiles, editedFrames, mappings, recon.originX, recon.originY);
    expect(serializeTiles(out)).toEqual(serializeTiles(originalTiles));
  });
});
