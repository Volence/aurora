// Which chunk thumbnails a command invalidates.
//
// A chunk thumbnail bakes three things that the command layer mutates IN PLACE:
// the chunk's own nametable, the pixels of every tile it references, and the
// colours of every palette line those cells select. Only three command types can
// change any of them (the same three that bump editorStore.chunkLibraryVersion),
// and each names its target precisely enough to work out WHICH chunks it
// reaches:
//
//   set-chunk          the chunk it edits, and only that one
//   set-tileset-tiles  every chunk with a cell drawing a tile in the written range
//   set-palette-line   every chunk with a cell on that palette line
//
// Pure and node-testable on purpose: this is the difference between aeon's chunk
// grid repainting one thumbnail and repainting all of them, and that is worth a
// test rather than an eyeball. Classic gets the same answer from its store's
// per-chunk version map, which the layout format hands it directly.
//
// The scan is a bitmask walk over the nametables rather than
// `unpackNametableWord`, which allocates an object per cell: this runs on every
// tile/palette commit over the whole library (up to ~64k cells), and the entry
// object would be garbage in all but a handful of cases.

import type { AnyCommand } from './commands';
import type { ChunkDef } from '../model/s4-types';

/** Nametable word layout — mirrors packNametableWord in core/model/s4-types. */
const TILE_INDEX_MASK = 0x7ff;
const PALETTE_SHIFT = 13;
const PALETTE_MASK = 0x3;

/** True if any cell of `chunk` draws a tile in [from, to). */
function drawsTileInRange(chunk: ChunkDef, from: number, to: number): boolean {
  const nt = chunk.nametable;
  for (let i = 0; i < nt.length; i++) {
    const t = nt[i] & TILE_INDEX_MASK;
    if (t >= from && t < to) return true;
  }
  return false;
}

/** True if any cell of `chunk` colours through palette line `line`. */
function usesPaletteLine(chunk: ChunkDef, line: number): boolean {
  const nt = chunk.nametable;
  for (let i = 0; i < nt.length; i++) {
    if (((nt[i] >> PALETTE_SHIFT) & PALETTE_MASK) === line) return true;
  }
  return false;
}

function collect(cmd: AnyCommand, chunks: readonly ChunkDef[], out: Set<string>): void {
  switch (cmd.type) {
    case 'batch':
      for (const c of cmd.commands) collect(c, chunks, out);
      return;
    case 'set-chunk':
      // Named even when the library does not (yet) list it: bumping an unread
      // key costs nothing, dropping a real one strands a stale thumbnail.
      out.add(cmd.chunkId);
      return;
    case 'set-tileset-tiles': {
      // oldTiles carries nulls for appended slots, so the written range is as
      // long as the LONGER of the two arrays (an undo shrinks the tileset back).
      const span = Math.max(cmd.oldTiles.length, cmd.newTiles.length);
      const from = cmd.at;
      const to = cmd.at + span;
      for (const chunk of chunks) if (drawsTileInRange(chunk, from, to)) out.add(chunk.id);
      return;
    }
    case 'set-palette-line':
      for (const chunk of chunks) if (usesPaletteLine(chunk, cmd.line)) out.add(chunk.id);
      return;
    default:
      // Everything else (objects, rings, layout, collision, backgrounds) is
      // invisible to a chunk thumbnail.
  }
}

/**
 * The ids of every chunk whose thumbnail `cmd` can change, in no particular
 * order and without duplicates. Empty for a command that bakes into no
 * thumbnail — callers use that to skip the version bump entirely.
 */
export function chunkIdsAffectedByCommand(cmd: AnyCommand, chunks: readonly ChunkDef[]): string[] {
  const out = new Set<string>();
  collect(cmd, chunks, out);
  return [...out];
}
