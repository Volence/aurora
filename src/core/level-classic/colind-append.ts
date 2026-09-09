// src/core/level-classic/colind-append.ts
//
// THE ONE PLACE A COLLISION-INDEX TABLE GROWS, and it cannot grow across a gap.
//
// `colind` maps block id to collision shape, one byte per block, and it
// LEGITIMATELY SHIPS SHORTER THAN THE BLOCK LIST: Green Hill's table covers
// fewer ids than the zone has blocks, and in ROM the ids past the end resolve
// into the adjacent zone's table. The length is data.
//
// WHAT THIS EXISTS TO PREVENT (COLIND-ART-PATH-ZEROFILL / AUG-U6). Three call
// sites in classicLevelStore each did their own growth, all spelled the same way:
//
//     const out = new Uint8Array(Math.max(nextBlocks.length, src.length));
//     out.set(src);
//     out[newId] = shape;
//
// `out.set(src)` copies only as far as `src` reaches, and `newId` is the id of
// the block just appended, so EVERY id between the table's old end and the new
// one is created as a zero. Those are not new blocks. They are existing blocks
// of the open zone whose in-game collision comes from beyond the file, and the
// save path then writes the grown table to disk, which is the moment their
// collision silently becomes "none". Zero is a real shape (empty collision), so
// nothing downstream can tell an authored zero from a byte this arithmetic
// invented: not the overlay, not the writer, not a diff a person reads.
//
// THE RULE, and it is the codebase's own, not a new opinion. `classicSetColind`
// REFUSES a block id past the end of the table, naming the overhang; the
// collision rect/isolate planners REFUSE a clone that would grow it
// (collision-write.ts); the canvas commit's collision toggle SKIPS such ids and
// counts them apart (core/art/commit-collision.ts). Three doors, one answer: do
// not write a byte whose real value this zone's files cannot tell you. The
// append path was the door that still wrote, and it wrote a whole range.
//
// So: an id is recorded only if it is already inside the table, or if it extends
// the table by exactly the ids this same call is defining, starting where the
// table ends. Anything else is returned as skipped and the table is left alone.
// The property is structural rather than checked -- the output length is only
// ever advanced one recorded id at a time, so there is no arithmetic that could
// produce an interior byte nobody asked for.
//
// GROWTH BY EXACTLY ONE IS STILL GROWTH, and it stays allowed: a zone whose
// table already covers every block has no overhang to misread, so the appended
// id's byte is the only one created and it is the one being defined. That is the
// case every stock zone but the overhang ones is in, and refusing it would take
// away Duplicate-block for no gain.
//
// WHAT THE CALLER MUST STILL DO. `recorded` is not decoration: the save writes
// the collision file only when the `colind` domain is dirty, so a caller that
// flags the domain on "a block was appended" rather than on "an entry was
// actually recorded" asks the writer to emit a table nothing changed. Flag it
// from `recorded`.

/** One appended block's collision entry: the id it lands on and the shape it takes. */
export interface ColindEntry {
  blockId: number;
  shape: number;
}

export interface ColindAppendResult {
  /**
   * The table to store. THE SAME OBJECT as the input when nothing was recorded,
   * so a caller can compare identity as well as read `recorded`.
   */
  colind: Uint8Array;
  /** Ids whose shape was written, ascending. */
  recorded: number[];
  /**
   * Ids left undefined because they sit past the end of the table with ids in
   * between that this call is not defining. Their in-game collision keeps coming
   * from wherever it came from before, which is the only honest answer available
   * without reading the adjacent zone's file.
   */
  skippedOverhang: number[];
}

/**
 * Record `entries` into `colind`, growing it only over the contiguous run of ids
 * this call defines.
 *
 * Entries are considered in ascending id order regardless of the order given, so
 * a caller does not have to sort to get the whole run recorded.
 */
export function appendColindEntries(
  colind: Uint8Array,
  entries: readonly ColindEntry[],
): ColindAppendResult {
  const recorded: number[] = [];
  const skippedOverhang: number[] = [];
  const writes: ColindEntry[] = [];
  // The end of the table as it stands, advanced by each id this call defines.
  // Everything below rests on this only ever moving to `blockId + 1` for an id
  // being written: the grown region is then exactly the recorded ids.
  let end = colind.length;

  for (const e of [...entries].sort((a, b) => a.blockId - b.blockId)) {
    if (e.blockId > end) { skippedOverhang.push(e.blockId); continue; }
    if (e.blockId === end) end = e.blockId + 1;
    writes.push(e);
    recorded.push(e.blockId);
  }

  if (writes.length === 0) return { colind, recorded, skippedOverhang };
  const out = new Uint8Array(end);
  out.set(colind);
  for (const w of writes) out[w.blockId] = w.shape;
  return { colind: out, recorded, skippedOverhang };
}
