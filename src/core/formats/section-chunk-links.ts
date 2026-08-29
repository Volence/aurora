// Per-section chunk-identity sidecar ({dataPath}section_N.chunklinks.json).
//
// Persists `Section.chunkLinks` — which library chunk each stamped tile still
// remembers (owner ruling d-18c). Written only when the section has at least
// one live placement, so a project that never stamps a linked chunk gains no
// files.
//
// WHY ONE FILE, AND WHY JSON
// --------------------------
// The layer is two structures — a list of placements and a per-tile plane —
// and the ONE hazard of that shape is them disagreeing (a plane entry naming a
// placement that is not in the list). Splitting them across a `.bin` plane and
// a JSON record list would make that hazard reachable through an ordinary
// partial write. One file makes it unreachable by construction, and the parser
// refuses a document whose two halves disagree rather than loading half of it.
//
// So this is deliberately NOT the `.collattr.bin` precedent. That sidecar is a
// dense fixed-length numeric plane with no other content, which is exactly what
// a raw binary is for. This one has to carry variable-length STRING chunk ids
// beside its plane, so a raw binary would need its own string table and header
// — a second format to get wrong — while the plane itself is long runs of one
// value and costs almost nothing run-length encoded.
//
// THE WIRE SHAPE
// --------------
//   {"placements":[{"baseCol":0,"baseRow":0,"chunkId":"c1","collision":true,"id":1}],
//    "runs":[0,64,1,4,0,65468]}
//
// `runs` is a FLAT [value, count, value, count, …] run-length encoding of the
// plane, in tile order. `value` is 0 (unlinked) or a placement id. The counts
// must sum to exactly the section's tile count — which is how a file written
// for a differently-sized grid, or truncated by hand, is caught instead of
// silently yielding a short plane. (That is the `.collattr.bin` lesson: a codec
// with no length to check against writes short files back short.)
//
// Key order is not this file's to choose: §5 canonicalisation, via
// `canonicalJsonMinified` — this is an array-heavy document, so the minified
// class, the same one `editor_bg_override.json` uses.
//
// UNLIKE section-meta.ts, THIS CODEC IS NOT A CROSS-TOOL CONTRACT DOCUMENT.
// Nothing in aeon reads it; the baked artifact is `section_N.tiles.bin`, which
// chunk identity never changes. It is editor-owned state, which is why a new
// field may be added here without an aeon-side negotiation — but it must still
// be added to BOTH `serialize` and `parse`, or a round trip erases it.

import { canonicalJsonMinified } from './canonical-json';
import type { ChunkPlacementLink, SectionChunkLinks } from '../model/s4-types';

/** The document body written when a section's last placement is detached, so a
 *  previously-saved layer cannot resurrect on the next load. Mirrors the
 *  cleared-nulls meta sidecar in project/aeon/save.ts, and for the same reason. */
export function clearedChunkLinksText(): string {
  return canonicalJsonMinified({ placements: [], runs: [] });
}

/**
 * Serialize a section's identity layer, or null when it has no placements —
 * callers skip (or clear) the write in that case.
 *
 * Ids are written AS THEY ARE, never renumbered: a round trip is then the
 * identity function, and a test can assert byte-equality rather than
 * "equivalent up to renumbering".
 */
export function serializeSectionChunkLinks(
  links: SectionChunkLinks | null | undefined,
): string | null {
  if (!links || links.placements.length === 0) return null;

  const runs: number[] = [];
  const plane = links.plane;
  if (plane.length > 0) {
    let value = plane[0];
    let count = 1;
    for (let i = 1; i < plane.length; i++) {
      if (plane[i] === value) { count++; continue; }
      runs.push(value, count);
      value = plane[i];
      count = 1;
    }
    runs.push(value, count);
  }

  return canonicalJsonMinified({
    placements: links.placements.map((p) => ({
      baseCol: p.baseCol,
      baseRow: p.baseRow,
      chunkId: p.chunkId,
      collision: p.collision,
      id: p.id,
    })),
    runs,
  });
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function parsePlacement(raw: unknown, seen: Set<number>): ChunkPlacementLink {
  if (typeof raw !== 'object' || raw === null) throw new Error('placement is not an object');
  const r = raw as Record<string, unknown>;
  if (!isInt(r.id) || r.id < 1) throw new Error(`placement id must be an integer >= 1, got ${String(r.id)}`);
  if (seen.has(r.id)) throw new Error(`duplicate placement id ${r.id}`);
  seen.add(r.id);
  if (typeof r.chunkId !== 'string' || r.chunkId === '') throw new Error(`placement ${r.id} has no chunkId`);
  if (!isInt(r.baseCol) || r.baseCol < 0) throw new Error(`placement ${r.id} has a bad baseCol`);
  if (!isInt(r.baseRow) || r.baseRow < 0) throw new Error(`placement ${r.id} has a bad baseRow`);
  if (typeof r.collision !== 'boolean') throw new Error(`placement ${r.id} has a non-boolean collision`);
  return { id: r.id, chunkId: r.chunkId, baseCol: r.baseCol, baseRow: r.baseRow, collision: r.collision };
}

/**
 * Parse a chunk-links sidecar for a section whose nametable has `tileCount`
 * tiles.
 *
 * THROWS on anything it does not fully understand, rather than salvaging. That
 * is the opposite of `parseSectionMeta`, which reads an unknown value as null,
 * and the difference is deliberate: a partly-understood identity layer is not a
 * weaker version of the layer, it is a layer that will propagate a chunk into
 * tiles it does not own. The loader turns a throw into an `unreadable` entry,
 * which makes the save skip the file — so a document this refuses is preserved
 * on disk for the author to fix, never overwritten.
 */
export function parseSectionChunkLinks(text: string, tileCount: number): SectionChunkLinks {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== 'object' || raw === null) throw new Error('chunk links document is not an object');
  const doc = raw as Record<string, unknown>;

  if (!Array.isArray(doc.placements)) throw new Error('chunk links document has no placements array');
  if (!Array.isArray(doc.runs)) throw new Error('chunk links document has no runs array');

  const seen = new Set<number>();
  const placements = doc.placements.map((p) => parsePlacement(p, seen));

  const runs = doc.runs;
  if (runs.length % 2 !== 0) throw new Error(`runs must be [value, count] pairs; got ${runs.length} numbers`);

  const plane = new Uint32Array(tileCount);
  let at = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const value = runs[i], count = runs[i + 1];
    if (!isInt(value) || value < 0) throw new Error(`run ${i / 2} has a bad value ${String(value)}`);
    if (!isInt(count) || count < 1) throw new Error(`run ${i / 2} has a bad count ${String(count)}`);
    if (value !== 0 && !seen.has(value)) {
      throw new Error(`run ${i / 2} names placement ${value}, which this document does not declare`);
    }
    if (at + count > tileCount) {
      throw new Error(`runs cover more than this section's ${tileCount} tiles`);
    }
    plane.fill(value, at, at + count);
    at += count;
  }
  // A document with no runs at all describes an all-unlinked plane, which is
  // only coherent when it also declares no placements — otherwise every
  // placement it lists is a copy that is nowhere.
  if (runs.length > 0 && at !== tileCount) {
    throw new Error(`runs cover ${at} tiles; this section has ${tileCount}`);
  }
  if (runs.length === 0 && placements.length > 0) {
    throw new Error(`document declares ${placements.length} placement(s) but no runs naming them`);
  }

  // The mirror of the dangling check above: a declared placement that no run
  // names. Refused for the same reason — it would surface in "find every copy
  // of this chunk" as a copy with no tiles.
  const used = new Set<number>();
  for (let i = 0; i < runs.length; i += 2) if (runs[i] !== 0) used.add(runs[i] as number);
  for (const p of placements) {
    if (!used.has(p.id)) throw new Error(`placement ${p.id} is declared but no run names it`);
  }

  return { placements, plane };
}
