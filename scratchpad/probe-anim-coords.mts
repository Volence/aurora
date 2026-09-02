// Measurement probe (not shipped): world coordinates + sample pixels for the
// animated-art playback harness, measured from the REAL s1disasm data with
// Aurora's own decoders and the play feature's own core (never guessed):
//
//  - GHZ act 1: a placement of a WATERFALL cell (slots $378-$37F), on whichever
//    plane it appears, plus a pixel inside it whose composited color differs
//    between clock t=0 and t=6 (waterfall frames 0/1) — and, as the control, a
//    nearby NON-animated cell pixel with a non-void color.
//  - SBZ act 1: a placement of a smoke cell, plus a pixel differing between the
//    blank resting state (t=0) and a mid-puff state (t=212 → puff-1 state 4).
//
// Run: npx tsx scratchpad/probe-anim-coords.mts
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as fs from 'node:fs';
import { enigmaDecompress } from '../src/core/formats/classic/enigma';
import { kosinskiDecompress } from '../src/core/formats/kosinski';
import { nemesisDecompress } from '../src/core/compress/nemesis';
import { decodeS1Layout } from '../src/core/formats/classic/s1-layout';
import { unpackBlockCell, unpackChunkCell, type BlockDef, type ChunkDef256, type LevelDoc } from '../src/core/level-classic/model';
import { composeS1Palettes } from '../src/core/level-classic/s1-io';
import { renderBlockPlacement } from '../src/core/level-classic/render';
import {
  animTilePatchesAt, animatedCellsForChunk, familiesForZone,
} from '../src/core/level-classic/s1-anim-art';
import { s1Profile, type VariantPath } from '../src/core/project/profiles/s1';

const S1 = siblingPathOrUnresolved('s1disasm');
const read = (p: string) => new Uint8Array(fs.readFileSync(`${S1}/${p}`));
const rv = (v: VariantPath) =>
  fs.existsSync(`${S1}/${v.path}`) ? v.path : (v.rev00Path ?? v.path);

function loadBlocks(eni: string): BlockDef[] {
  const dec = enigmaDecompress(read(eni));
  const blocks: BlockDef[] = [];
  for (let b = 0; b < dec.length / 8; b++) {
    const cells = [];
    for (let i = 0; i < 4; i++) cells.push(unpackBlockCell((dec[b * 8 + i * 2] << 8) | dec[b * 8 + i * 2 + 1]));
    blocks.push({ cells });
  }
  return blocks;
}
function loadChunks(kos: string): ChunkDef256[] {
  const dec = kosinskiDecompress(read(kos));
  const chunks: ChunkDef256[] = [];
  for (let c = 0; c + 512 <= dec.length; c += 512) {
    const cells = [];
    for (let i = 0; i < 256; i++) cells.push(unpackChunkCell((dec[c + i * 2] << 8) | dec[c + i * 2 + 1]));
    chunks.push({ cells });
  }
  return chunks;
}

const VOID = [0x0a, 0x0c, 0x12];
/** What the canvas shows for an RGBA sample: color-0 pixels show the void. */
const seen = (buf: Uint8ClampedArray, x: number, y: number): number[] => {
  const o = (y * 16 + x) * 4;
  return buf[o + 3] > 0 ? [buf[o], buf[o + 1], buf[o + 2]] : VOID;
};
const eq = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);

function buildDoc(zoneId: string, actNum: number): LevelDoc {
  const zone = s1Profile.zones.find((z) => z.id === zoneId)!;
  const act = zone.acts.find((a) => a.act === actNum)!;
  let tiles = new Uint8Array(0);
  for (const t of act.tiles) {
    const dec = nemesisDecompress(read(t));
    const merged = new Uint8Array(tiles.length + dec.length);
    merged.set(tiles); merged.set(dec, tiles.length);
    tiles = merged;
  }
  let poolLen = tiles.length;
  const blits: { destByte: number; slice: Uint8Array }[] = [];
  for (const a of act.animatedArt) {
    if (!fs.existsSync(`${S1}/${a.file}`)) continue;
    const src = read(a.file);
    blits.push({ destByte: a.vramTileIndex * 32, slice: src.slice(a.srcTileOffset * 32, (a.srcTileOffset + a.tileCount) * 32) });
    poolLen = Math.max(poolLen, (a.vramTileIndex + a.tileCount) * 32);
  }
  const pool = new Uint8Array(poolLen);
  pool.set(tiles);
  for (const b of blits) pool.set(b.slice, b.destByte);
  const fg = decodeS1Layout(read(rv(act.fgLayout)));
  const bg = decodeS1Layout(read(rv(act.bgLayout)));
  return {
    game: 's1',
    tiles: pool,
    blocks: loadBlocks(rv(act.blocks)),
    chunks: loadChunks(rv(act.chunks)),
    fg, bg,
    collision: { colind: new Uint8Array(0), shapes: { heights: [], angles: new Uint8Array() } },
    palettes: composeS1Palettes(act.palette, act.palette.map((p) => read(p.file))),
    paletteSources: [] as unknown as LevelDoc['paletteSources'],
    objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

function facadeAt(doc: LevelDoc, zone: string, t: number): LevelDoc {
  const sources = new Map<string, Uint8Array>();
  for (const f of familiesForZone(zone)) {
    if (fs.existsSync(`${S1}/${f.file}`)) sources.set(f.file, read(f.file));
  }
  const scratch = doc.tiles.slice();
  for (const p of animTilePatchesAt(zone, t, sources)) scratch.set(p.bytes, p.start * 32);
  return { ...doc, tiles: scratch };
}

/** Find placements (plane, col, row) of chunks that carry animated cells. */
function placements(doc: LevelDoc, animTiles: ReadonlySet<number>) {
  const out: { plane: string; col: number; row: number; chunkId: number; cells: ReturnType<typeof animatedCellsForChunk> }[] = [];
  for (const plane of ['fg', 'bg'] as const) {
    const grid = doc[plane];
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const byte = grid.cells[row * grid.width + col];
        if (byte === undefined) continue;
        const id = byte & 0x7f;
        if (id === 0) continue;
        const cells = animatedCellsForChunk(doc, id, animTiles);
        if (cells.length) out.push({ plane, col, row, chunkId: id, cells });
      }
    }
  }
  return out;
}

function range(start: number, n: number): Set<number> {
  return new Set(Array.from({ length: n }, (_, i) => start + i));
}

// --- GHZ act 1: waterfall ---------------------------------------------------
{
  const doc = buildDoc('ghz', 1);
  const wfTiles = range(0x378, 8);
  const places = placements(doc, wfTiles);
  console.log(`GHZ1 waterfall placements: ${places.length}`);
  const f0 = facadeAt(doc, 'ghz', 0);
  const f6 = facadeAt(doc, 'ghz', 6);
  outer:
  for (const p of places) {
    for (const c of p.cells) {
      const b0 = renderBlockPlacement(f0, c.block, c.xf, c.yf);
      const b6 = renderBlockPlacement(f6, c.block, c.xf, c.yf);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!eq(seen(b0, x, y), seen(b6, x, y))) {
            const wx = p.col * 256 + (c.cell % 16) * 16 + x;
            const wy = p.row * 256 + ((c.cell / 16) | 0) * 16 + y;
            console.log(`  WF sample: plane=${p.plane} chunk=$${p.chunkId.toString(16)} layout(${p.col},${p.row}) cell=${c.cell} flips=${c.xf}/${c.yf} block=$${c.block.toString(16)}`);
            console.log(`  world (${wx},${wy})  t0=${seen(b0, x, y)} t6=${seen(b6, x, y)}`);
            // Control: a non-animated cell in the SAME chunk with a non-void px.
            const chunk = doc.chunks[p.chunkId - 1];
            const animCellSet = new Set(p.cells.map((ac) => ac.cell));
            ctrl:
            for (let i = 0; i < 256; i++) {
              if (animCellSet.has(i)) continue;
              const cc = chunk.cells[i];
              if (!cc || cc.block <= 0 || cc.block >= doc.blocks.length) continue;
              const buf = renderBlockPlacement(doc, cc.block, cc.xf, cc.yf);
              for (let cy = 0; cy < 16; cy++) for (let cx = 0; cx < 16; cx++) {
                const col = seen(buf, cx, cy);
                if (!eq(col, VOID)) {
                  console.log(`  CONTROL: cell=${i} world (${p.col * 256 + (i % 16) * 16 + cx},${p.row * 256 + ((i / 16) | 0) * 16 + cy}) color=${col}`);
                  break ctrl;
                }
              }
            }
            break outer;
          }
        }
      }
    }
  }
}

// --- SBZ act 1: smoke -------------------------------------------------------
{
  const doc = buildDoc('sbz', 1);
  const smokeTiles = new Set([...range(0x448, 12), ...range(0x454, 12)]);
  const places = placements(doc, smokeTiles);
  console.log(`SBZ1 smoke placements: ${places.length} (planes: ${[...new Set(places.map((p) => p.plane))].join(',')})`);
  const f0 = facadeAt(doc, 'sbz', 0);      // resting: both machines blank
  const f212 = facadeAt(doc, 'sbz', 212);  // puff1 state 4 mid-puff
  outer2:
  for (const p of places) {
    for (const c of p.cells) {
      const b0 = renderBlockPlacement(f0, c.block, c.xf, c.yf);
      const bBase = renderBlockPlacement(doc, c.block, c.xf, c.yf); // never-played
      const b212 = renderBlockPlacement(f212, c.block, c.xf, c.yf);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!eq(seen(b0, x, y), seen(b212, x, y))) {
            const wx = p.col * 256 + (c.cell % 16) * 16 + x;
            const wy = p.row * 256 + ((c.cell / 16) | 0) * 16 + y;
            console.log(`  SMOKE sample: plane=${p.plane} chunk=$${p.chunkId.toString(16)} layout(${p.col},${p.row}) cell=${c.cell} block=$${c.block.toString(16)}`);
            console.log(`  world (${wx},${wy})  t0=${seen(b0, x, y)} t212=${seen(b212, x, y)} neverPlayed=${seen(bBase, x, y)}`);
            console.log(`  resting==static whole cell: ${(() => {
              for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
                if (!eq(seen(b0, xx, yy), seen(bBase, xx, yy))) return false;
              }
              return true;
            })()}`);
            break outer2;
          }
        }
      }
    }
  }
}

// --- MZ act 1: magma (the heaviest family — real-clock cost segment) --------
{
  const doc = buildDoc('mz', 1);
  const magmaTiles = range(0x2d2, 16);
  const places = placements(doc, magmaTiles);
  console.log(`MZ1 magma placements: ${places.length} (planes: ${[...new Set(places.map((p) => p.plane))].join(',')})`);
  const f0 = facadeAt(doc, 'mz', 0);
  const f90 = facadeAt(doc, 'mz', 90); // the osc byte has moved well away from 0
  outer3:
  for (const p of places.filter((pp) => pp.plane === 'fg')) {
    for (const c of p.cells) {
      const b0 = renderBlockPlacement(f0, c.block, c.xf, c.yf);
      const b90 = renderBlockPlacement(f90, c.block, c.xf, c.yf);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!eq(seen(b0, x, y), seen(b90, x, y))) {
            const wx = p.col * 256 + (c.cell % 16) * 16 + x;
            const wy = p.row * 256 + ((c.cell / 16) | 0) * 16 + y;
            console.log(`  MAGMA sample: plane=${p.plane} chunk=$${p.chunkId.toString(16)} layout(${p.col},${p.row}) cell=${c.cell} block=$${c.block.toString(16)}`);
            console.log(`  world (${wx},${wy})  t0=${seen(b0, x, y)} t90=${seen(b90, x, y)}  animCellsInChunk=${p.cells.length}`);
            break outer3;
          }
        }
      }
    }
  }
}
