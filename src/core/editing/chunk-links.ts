// Chunk identity for aeon sections — owner ruling d-18c (2026-08-29):
//
//   "a stamped chunk REMEMBERS its chunk by default; a checkbox detaches a
//    placement into plain tiles; the checkbox is available both at stamp time
//    and afterwards on an existing placement."
//
// This module owns every operation on `Section.chunkLinks`. Nothing here reads
// or writes the filesystem, React, or a canvas: the whole ruling is expressible
// as pure functions over a Section plus a ChunkDef, and it is deliberately kept
// that way so the UI parcel wires a checkbox to a builder rather than
// re-deriving the rules beside it.
//
// WHY A PLANE BESIDE THE NAMETABLE, AND NOT THE CLASSIC SHAPE
// ----------------------------------------------------------
// The classic half already keeps chunk identity and does it by making the level
// BE a grid of chunk ids (level-classic/model.ts, `LayoutGrid.cells`) — the
// "never flatten" document. That shape is not available to aeon, for two
// reasons that are properties of aeon's data rather than of this code:
//
//   1. An aeon section's `tileGrid.nametable` is the ARTIFACT — it serialises
//      straight to `section_N.tiles.bin` and the engine reads tile words. A
//      classic layout cell resolves through chunk -> block -> tile at load. So
//      aeon cannot replace the nametable with ids; identity has to ride beside
//      it.
//   2. A classic chunk is exactly one layout cell (256x256 px). An aeon
//      `ChunkDef` is a variable `widthTiles` x `heightTiles` footprint, so a
//      single id per cell cannot say WHICH PART of the chunk a cell holds.
//
// So: a per-tile plane of placement ids, plus a list of placements carrying the
// chunk id and origin. Offsets are derived (`col - baseCol`), never stored.
//
// WHY PLACEMENTS AND NOT A BARE chunkId PER TILE
// ----------------------------------------------
// Two stamps of the same chunk side by side. With a bare chunk id per tile they
// are one indistinguishable region and "detach THIS one" has no referent. With
// placements they are two records, and detach is exact. It also gives the
// agent-readable answer d-18 was raised for ("what is this region made of")
// without a second mechanism.
//
// THE ONE HAZARD THIS SHAPE INTRODUCES, AND WHERE IT IS ANSWERED
// --------------------------------------------------------------
// Two structures that can disagree: a plane entry naming a placement that is not
// in the list. `danglingPlaneRefs` names them, the sidecar parser REFUSES a
// document carrying any, and the two structures are persisted in ONE file so a
// partial write cannot desynchronise them.

import { SECTION_TILES_WIDE } from '../model/s4-types';
import type { Act, ChunkDef, ChunkPlacementLink, Section, SectionChunkLinks, Zone } from '../model/s4-types';
import { cellTileIndices } from '../collision/collision-cell';
import type { AnyCommand, BatchCommand, SetChunkLinksCommand, SetCollisionEditCommand, SetTilesCommand } from './commands';

/** The plane's "this tile remembers nothing" value. Not a placement id. */
export const UNLINKED = 0;

/**
 * Largest id `allocatePlacementId` will hand out.
 *
 * The plane is a `Uint32Array`, so `0xFFFFFFFF` is the last representable value
 * and ids start at 1. Ids are never reused, so this is a lifetime budget for one
 * section rather than a live-placement cap — four billion stamps into a single
 * section. The allocator throws at the ceiling instead of wrapping, because a
 * wrapped id would silently JOIN a new stamp to an unrelated old one.
 */
export const MAX_PLACEMENT_ID = 0xFFFFFFFF;

// ── Construction and copying ────────────────────────────────────────────────

/** An empty identity layer sized for a section whose nametable has `tileCount`
 *  entries. Length is taken from the caller's grid, never from the section-size
 *  constants, so the two cannot drift. */
export function createSectionChunkLinks(tileCount: number): SectionChunkLinks {
  return { placements: [], plane: new Uint32Array(tileCount) };
}

/** Deep copy: independent placement records and an independent plane. */
export function cloneSectionChunkLinks(links: SectionChunkLinks): SectionChunkLinks {
  return {
    placements: links.placements.map((p) => ({ ...p })),
    plane: new Uint32Array(links.plane),
  };
}

/**
 * The section's identity layer, creating an empty one sized to its own
 * nametable if absent. Mutates `section` — call it from an applier, not from a
 * builder.
 */
export function ensureChunkLinks(section: Section): SectionChunkLinks {
  const existing = section.chunkLinks;
  if (existing) return existing;
  const created = createSectionChunkLinks(section.tileGrid.nametable.length);
  section.chunkLinks = created;
  return created;
}

/** Next free stable id. `max(existing) + 1`, so it survives detaches of the
 *  highest placement without ever reusing an id. */
export function allocatePlacementId(links: SectionChunkLinks | null | undefined): number {
  let max = 0;
  if (links) for (const p of links.placements) if (p.id > max) max = p.id;
  if (max >= MAX_PLACEMENT_ID) {
    throw new Error(`chunk placement ids exhausted for this section (max ${MAX_PLACEMENT_ID})`);
  }
  return max + 1;
}

// ── Reading ─────────────────────────────────────────────────────────────────

export function findPlacement(
  links: SectionChunkLinks | null | undefined,
  id: number,
): ChunkPlacementLink | null {
  if (!links) return null;
  return links.placements.find((p) => p.id === id) ?? null;
}

/**
 * "What is this tile made of?" — the placement a section tile still remembers,
 * or null. This is the read d-18 was raised for.
 */
export function chunkOriginAt(section: Section, tileIndex: number): ChunkPlacementLink | null {
  const links = section.chunkLinks;
  if (!links) return null;
  const id = links.plane[tileIndex];
  if (id === UNLINKED || id === undefined) return null;
  return findPlacement(links, id);
}

/** "Find every copy of this chunk" in one section, in placement order. */
export function placementsOfChunk(
  links: SectionChunkLinks | null | undefined,
  chunkId: string,
): ChunkPlacementLink[] {
  if (!links) return [];
  return links.placements.filter((p) => p.chunkId === chunkId);
}

/** Section tile indices still owned by `id`, ascending. */
export function linkedTileIndices(links: SectionChunkLinks, id: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < links.plane.length; i++) if (links.plane[i] === id) out.push(i);
  return out;
}

/**
 * Plane values that name no placement. MUST always be empty: it is the
 * invariant the parser enforces and the one a future edit could break.
 * Returned as a sorted list of the offending ids so a failure names them.
 */
export function danglingPlaneRefs(links: SectionChunkLinks): number[] {
  const known = new Set(links.placements.map((p) => p.id));
  const bad = new Set<number>();
  for (let i = 0; i < links.plane.length; i++) {
    const v = links.plane[i];
    if (v !== UNLINKED && !known.has(v)) bad.add(v);
  }
  return [...bad].sort((a, b) => a - b);
}

// ── Command builders ────────────────────────────────────────────────────────

function linkCommand(
  sectionIndex: number,
  description: string,
  entries: SetChunkLinksCommand['entries'],
  added: ChunkPlacementLink[],
  removed: ChunkPlacementLink[],
): SetChunkLinksCommand | null {
  if (entries.length === 0 && added.length === 0 && removed.length === 0) return null;
  const cmd: SetChunkLinksCommand = { type: 'set-chunk-links', description, sectionIndex, entries };
  if (added.length > 0) cmd.addedPlacements = added.map((p) => ({ ...p }));
  if (removed.length > 0) cmd.removedPlacements = removed.map((p) => ({ ...p }));
  return cmd;
}

function planeValue(section: Section, index: number): number {
  const links = section.chunkLinks;
  if (!links) return UNLINKED;
  return links.plane[index] ?? UNLINKED;
}

/**
 * Placements that would own NO tile once `entries` are applied — an empty
 * record, which is the mirror image of a dangling plane reference and just as
 * wrong: it surfaces in "find every copy of this chunk" as a copy that is
 * nowhere, and it makes stamping-over and detaching disagree about what an
 * erased placement leaves behind.
 *
 * Shared by every builder that can take tiles AWAY from a placement — a stamp
 * landing on top of an older one, a detached stamp clearing what it covers, and
 * a paint stroke through `withLinkBreaks`. It was written for the third and the
 * first two were found missing it by a test, which is why it lives here rather
 * than beside any one caller.
 */
function placementsEmptiedBy(
  links: SectionChunkLinks,
  entries: SetChunkLinksCommand['entries'],
): ChunkPlacementLink[] {
  const remaining = new Map<number, number>();
  for (let i = 0; i < links.plane.length; i++) {
    const v = links.plane[i];
    if (v !== UNLINKED) remaining.set(v, (remaining.get(v) ?? 0) + 1);
  }
  for (const e of entries) {
    if (e.oldRef === UNLINKED || e.oldRef === e.newRef) continue;
    const left = (remaining.get(e.oldRef) ?? 0) - 1;
    if (left <= 0) remaining.delete(e.oldRef); else remaining.set(e.oldRef, left);
  }
  return links.placements.filter((p) => !remaining.has(p.id));
}

/**
 * The identity half of a stamp: claim every in-bounds tile of the footprint for
 * `placement`, or clear them all when `placement` is null (a DETACHED stamp).
 *
 * Every in-bounds footprint tile is claimed, including tiles whose art word did
 * not change. The art child skips unchanged words — if this skipped them too, a
 * chunk stamped over an identical region would come back only partly linked.
 */
export function buildStampLinkChild(args: {
  section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; widthTiles: number; heightTiles: number;
  placement: ChunkPlacementLink | null;
  description: string;
}): SetChunkLinksCommand | null {
  const { section, sectionIndex, baseCol, baseRow, widthTiles, heightTiles, placement, description } = args;
  const newRef = placement ? placement.id : UNLINKED;
  const height = section.tileGrid.nametable.length / SECTION_TILES_WIDE;

  const entries: SetChunkLinksCommand['entries'] = [];
  for (let r = 0; r < heightTiles; r++) {
    for (let c = 0; c < widthTiles; c++) {
      const col = baseCol + c, row = baseRow + r;
      if (col >= SECTION_TILES_WIDE || row >= height) continue;
      const index = row * SECTION_TILES_WIDE + col;
      const oldRef = planeValue(section, index);
      if (oldRef === newRef) continue;
      entries.push({ index, oldRef, newRef });
    }
  }

  // A placement with no in-bounds tile is not recorded at all: a record nothing
  // in the plane names is the dangling reference in its mirror form, and it
  // would show up in "find every copy" as a copy that is nowhere.
  const added = placement && entries.some((e) => e.newRef === placement.id) ? [placement] : [];
  // ...and by the same rule, an OLDER placement this stamp completely buried is
  // dropped. Applies to the linked and the detached form alike: a detached stamp
  // that covers a whole earlier placement must not leave its record standing,
  // and a linked one that does must not either.
  const removed = section.chunkLinks ? placementsEmptiedBy(section.chunkLinks, entries) : [];
  return linkCommand(sectionIndex, description, entries, added, removed);
}

/**
 * DETACH AN ALREADY-PLACED STAMP — the "checkbox usable later too" half of the
 * ruling. Clears every tile the placement still owns and drops the record. The
 * TILES ARE NOT TOUCHED: detaching turns a link into a copy, and the copy is
 * already sitting in the nametable.
 *
 * Returns null when `placementId` names nothing — an already-detached placement
 * is a no-op, not an error, because the UI can reasonably ask twice.
 */
export function buildDetachCommand(args: {
  section: Section; sectionIndex: number; placementId: number; description: string;
}): SetChunkLinksCommand | null {
  const { section, sectionIndex, placementId, description } = args;
  const links = section.chunkLinks;
  if (!links) return null;
  const placement = findPlacement(links, placementId);
  if (!placement) return null;

  const entries: SetChunkLinksCommand['entries'] = linkedTileIndices(links, placementId)
    .map((index) => ({ index, oldRef: placementId, newRef: UNLINKED }));

  return linkCommand(sectionIndex, description, entries, [], [placement]);
}

/** Detach every placement in the section. The bulk form of the checkbox. */
export function buildDetachAllCommand(args: {
  section: Section; sectionIndex: number; description: string;
}): SetChunkLinksCommand | null {
  const { section, sectionIndex, description } = args;
  const links = section.chunkLinks;
  if (!links) return null;

  const entries: SetChunkLinksCommand['entries'] = [];
  for (let i = 0; i < links.plane.length; i++) {
    const oldRef = links.plane[i];
    if (oldRef !== UNLINKED) entries.push({ index: i, oldRef, newRef: UNLINKED });
  }
  return linkCommand(sectionIndex, description, entries, [], links.placements.slice());
}

/**
 * PROPAGATION — push the CURRENT contents of `chunk` into every tile of this
 * section that still remembers a placement of it.
 *
 * Three refusals, each of which would otherwise write something the author did
 * not ask for:
 *
 *   • a tile whose plane entry was cleared (hand-painted, or overwritten by a
 *     later stamp) is not written. That is the entire reason the plane exists.
 *   • a tile whose offset falls OUTSIDE the chunk's current size is not
 *     written. A chunk that shrank leaves its old fringe alone rather than
 *     reading past the end of `chunk.nametable`.
 *   • collision is replayed only for placements whose stamp wrote collision
 *     (`collision: true`), and only for 16px cells whose FOUR sub-tiles all
 *     still belong to the same placement. A partly-painted cell has no honest
 *     single collision word, and `Section.collisionEdit` must stay 2x2-uniform.
 *
 * Returns a BatchCommand so a propagation is one undo step, or null when
 * nothing would change. The caller supplies the chunk; this function never
 * looks a chunk up, so it cannot disagree with the library the caller is
 * holding.
 */
export function buildChunkPropagationCommand(args: {
  chunk: ChunkDef; section: Section; sectionIndex: number; description: string;
}): BatchCommand | null {
  const { chunk, section, sectionIndex, description } = args;
  const links = section.chunkLinks;
  if (!links) return null;

  const placements = placementsOfChunk(links, chunk.id);
  if (placements.length === 0) return null;

  const byId = new Map(placements.map((p) => [p.id, p]));
  const height = section.tileGrid.nametable.length / SECTION_TILES_WIDE;

  const tileEntries: SetTilesCommand['entries'] = [];
  for (let index = 0; index < links.plane.length; index++) {
    const p = byId.get(links.plane[index]);
    if (!p) continue;
    const col = index % SECTION_TILES_WIDE, row = (index / SECTION_TILES_WIDE) | 0;
    const dx = col - p.baseCol, dy = row - p.baseRow;
    if (dx < 0 || dy < 0 || dx >= chunk.widthTiles || dy >= chunk.heightTiles) continue;
    const newNt = chunk.nametable[dy * chunk.widthTiles + dx];
    const oldNt = section.tileGrid.nametable[index];
    if (oldNt === newNt) continue;
    tileEntries.push({ index, oldNt, newNt });
  }

  const commands: AnyCommand[] = [];
  if (tileEntries.length > 0) {
    commands.push({ type: 'set-tiles', description, sectionIndex, entries: tileEntries });
  }

  const cellsW = chunk.widthTiles >> 1;
  const cellsH = chunk.heightTiles >> 1;
  const collisionSized = chunk.collisionA.length === cellsW * cellsH
    && chunk.collisionB.length === cellsW * cellsH;

  if (collisionSized) {
    for (const plane of ['a', 'b'] as const) {
      const srcPlane = plane === 'a' ? chunk.collisionA : chunk.collisionB;
      const sectionPlane = plane === 'a' ? section.collisionEdit : section.collisionEditB;
      if (!sectionPlane) continue;

      const entries: SetCollisionEditCommand['entries'] = [];
      for (const p of placements) {
        if (!p.collision) continue;
        // Collision cells only exist on the even grid; an odd base has no cell
        // alignment at all, which is the same refusal buildRegionWriteCommand
        // makes on the stamp side. Replaying it here keeps the two in step.
        if ((p.baseCol % 2) !== 0 || (p.baseRow % 2) !== 0) continue;

        for (let cy = 0; cy < cellsH; cy++) {
          for (let cx = 0; cx < cellsW; cx++) {
            const cellCol = (p.baseCol >> 1) + cx;
            const cellRow = (p.baseRow >> 1) + cy;
            const tlCol = cellCol * 2, tlRow = cellRow * 2;
            if (tlCol >= SECTION_TILES_WIDE || tlRow >= height) continue;

            const indices = cellTileIndices(cellCol, cellRow, SECTION_TILES_WIDE);
            // ALL FOUR sub-tiles, or the cell is not this placement's any more.
            let whole = true;
            for (const i of indices) if (links.plane[i] !== p.id) { whole = false; break; }
            if (!whole) continue;

            const word = srcPlane[cy * cellsW + cx];
            for (const i of indices) {
              const oldColl = sectionPlane[i];
              if (oldColl === word) continue;
              entries.push({ index: i, oldColl, newColl: word });
            }
          }
        }
      }
      if (entries.length > 0) {
        commands.push({ type: 'set-collision-edit', plane, description, sectionIndex, entries });
      }
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', description, sectionIndex, commands };
}

/**
 * Propagate a chunk edit across a WHOLE ACT — every section that still
 * remembers it — as ONE undo step.
 *
 * A batch's children each resolve their own `sectionIndex` (history.ts applies
 * children recursively and looks the section up per child), so a cross-section
 * batch is legal and undoes as a unit. That matters here more than usual: a
 * chunk edit that propagated into four sections and then undid in four presses
 * would leave the level in a state the author never authored.
 *
 * The batch's OWN `sectionIndex` is the first section it touched — a batch's
 * own index is not read by the applier, only its children's, but something has
 * to be there and picking a section it actually wrote is the least misleading
 * answer available.
 *
 * `sections` is the act's slot array, nulls included, so the index each command
 * carries is the FLAT ACT INDEX and not a position in a filtered list.
 */
export function buildActPropagationCommand(args: {
  chunk: ChunkDef; sections: (Section | null)[]; description: string;
}): BatchCommand | null {
  const { chunk, sections, description } = args;
  const commands: AnyCommand[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;
    const cmd = buildChunkPropagationCommand({ chunk, section, sectionIndex: i, description });
    if (cmd) commands.push(cmd);
  }
  if (commands.length === 0) return null;
  return { type: 'batch', description, sectionIndex: commands[0].sectionIndex, commands };
}

// ── Breaking links when art is written by something other than a stamp ──────

function collectTileWrites(cmd: AnyCommand, out: Set<number>): void {
  if (cmd.type === 'batch') { for (const c of cmd.commands) collectTileWrites(c, out); return; }
  if (cmd.type === 'set-tiles') { for (const e of cmd.entries) out.add(e.index); }
}

function collectLinkWrites(cmd: AnyCommand, out: Set<number>): void {
  if (cmd.type === 'batch') { for (const c of cmd.commands) collectLinkWrites(c, out); return; }
  if (cmd.type === 'set-chunk-links') { for (const e of cmd.entries) out.add(e.index); }
}

/**
 * A TILE WHOSE ART WAS REWRITTEN BY ANYTHING OTHER THAN ITS OWN STAMP NO LONGER
 * COMES FROM THAT CHUNK.
 *
 * Wrap any command that writes nametable words and this returns it with an
 * extra `set-chunk-links` child clearing the links of every tile it rewrites
 * that the command was not already deciding the identity of. Composes: a stamp
 * batch already carries its own link child covering its footprint, so wrapping
 * one is a no-op over that footprint; a paint stroke or a paste carries none, so
 * every tile it touches is cleared.
 *
 * Returns the command UNCHANGED when there is nothing to clear, so a wrap can be
 * applied unconditionally at a call site without inventing empty batches.
 */
export function withLinkBreaks(section: Section, cmd: AnyCommand): AnyCommand {
  const links = section.chunkLinks;
  if (!links || links.placements.length === 0) return cmd;

  const written = new Set<number>();
  collectTileWrites(cmd, written);
  if (written.size === 0) return cmd;

  const decided = new Set<number>();
  collectLinkWrites(cmd, decided);

  const entries: SetChunkLinksCommand['entries'] = [];
  for (const index of written) {
    if (decided.has(index)) continue;
    const oldRef = links.plane[index] ?? UNLINKED;
    if (oldRef === UNLINKED) continue;
    entries.push({ index, oldRef, newRef: UNLINKED });
  }
  if (entries.length === 0) return cmd;
  entries.sort((a, b) => a.index - b.index);

  // A placement that loses its LAST tile is dropped, so "find every copy" never
  // reports a copy with nothing left of it. Detach and paint-over converge on
  // the same end state rather than leaving two kinds of empty placement.
  const removed = placementsEmptiedBy(links, entries);

  const child = linkCommand(cmd.sectionIndex, cmd.description, entries, [], removed)!;
  if (cmd.type === 'batch') {
    return { ...cmd, commands: [...cmd.commands, child] };
  }
  return { type: 'batch', description: cmd.description, sectionIndex: cmd.sectionIndex, commands: [cmd, child] };
}

// ── The out-of-act copies: reported, never silently rewritten ───────────────
//
// THE FACT THIS SECTION EXISTS FOR. The chunk library is PROJECT-WIDE — one
// `chunkLibrary` array on the project, loaded from one `chunkLibrary` path in
// project.json (core/config/s4-config.ts). Sections are per-ACT. So the same
// library chunk can be stamped, and remembered, in acts and zones the author
// does not have open, and `buildActPropagationCommand` above reaches exactly
// one act's slot array.
//
// WHY THE ANSWER IS "REPORT", NOT "PROPAGATE EVERYWHERE".
//
//   1. A command cannot ADDRESS another act. `AnyCommand.sectionIndex` is a
//      flat index into `S4Level.sections`, and `applyCommand` resolves it as
//      `level.sections[cmd.sectionIndex]` against the level built from the
//      CURRENTLY FOCUSED act (projectStore.getActiveLevel). A batch child
//      meant for act 2 slot 3 would, on undo from act 1's tab, be applied to
//      act 1 slot 3 — silently writing the wrong sections. Undo stacks are
//      per-document too (`documentHistoryHub.historyFor`), so there is no one
//      stack a cross-act step could even live on.
//
//   2. Across ZONES it would be data corruption rather than propagation. A
//      `ChunkDef.nametable` word carries a tile index into the ZONE's tileset
//      (`sliceForSave(doc, zone.tileset.tiles)` mints the indices). Writing
//      zone A's freshly-sliced indices into a zone B section points zone B's
//      tiles at whatever happens to sit at those indices in ITS atlas.
//
//   3. Even where 1 and 2 did not bite, an edit in one act rewriting level
//      data in an act the author cannot see, on an undo step they cannot
//      reach, is action at a distance.
//
// So propagation stays act-scoped and the out-of-act copies are NAMED. The
// author keeps the capability the UI sentence implied — they are told exactly
// where the un-updated copies are — without any of the three problems above.

/** One act that still holds linked placements of a chunk, outside the act the
 *  propagation ran in. `sections` counts the act slots involved, `placements`
 *  the individual stamps. */
export interface ChunkCopyLocation {
  zoneId: string;
  zoneName: string;
  actId: string;
  /** False when this act belongs to a DIFFERENT zone than the propagating act,
   *  which is the case where the chunk's tile indices do not even mean the same
   *  thing (reason 2 above). */
  sameZone: boolean;
  sections: number;
  placements: number;
}

export interface OutOfActChunkCopies {
  /** Acts holding at least one placement, in zone-then-act declaration order. */
  locations: ChunkCopyLocation[];
  /** Placements summed over `locations`. */
  placements: number;
  /** Placements of this chunk INSIDE the propagating act — i.e. what the
   *  propagation did reach. Present so a caller (or a guard) can tell "no
   *  copies elsewhere" from "no copies anywhere". */
  inActPlacements: number;
}

/**
 * Every linked placement of `chunkId` that lives OUTSIDE `currentAct`.
 *
 * `currentAct` is matched by OBJECT IDENTITY, not by `act.id`: act ids repeat
 * across zones in real aeon projects ("act1" in every zone), so an id compare
 * would silently drop a whole act's copies from the report.
 */
export function findOutOfActChunkCopies(args: {
  chunkId: string;
  zones: Zone[];
  currentAct: Act | null;
}): OutOfActChunkCopies {
  const { chunkId, zones, currentAct } = args;
  const locations: ChunkCopyLocation[] = [];
  let placements = 0;
  let inActPlacements = 0;

  const currentZone = currentAct
    ? zones.find((z) => z.acts.some((a) => a === currentAct)) ?? null
    : null;

  for (const zone of zones) {
    for (const act of zone.acts) {
      let actPlacements = 0;
      let actSections = 0;
      for (const section of act.sections) {
        if (!section) continue;
        const n = placementsOfChunk(section.chunkLinks, chunkId).length;
        if (n === 0) continue;
        actPlacements += n;
        actSections += 1;
      }
      if (act === currentAct) { inActPlacements += actPlacements; continue; }
      if (actPlacements === 0) continue;
      placements += actPlacements;
      locations.push({
        zoneId: zone.id,
        zoneName: zone.name,
        actId: act.id,
        sameZone: currentZone !== null && zone === currentZone,
        sections: actSections,
        placements: actPlacements,
      });
    }
  }

  return { locations, placements, inActPlacements };
}

/**
 * The sentence shown after a chunk edit when copies survive outside the act, or
 * null when there are none.
 *
 * Lives here rather than at the toast call site so a node test can read the
 * exact words a rendered surface will show — the toast itself is React and the
 * suite cannot see it.
 */
export function describeOutOfActChunkCopies(copies: OutOfActChunkCopies): string | null {
  if (copies.locations.length === 0) return null;
  const where = copies.locations
    .map((l) => `${l.zoneName} ${l.actId} (${l.placements})`)
    .join(', ');
  const n = copies.placements;
  const crossZone = copies.locations.some((l) => !l.sameZone);
  return `${n} linked ${n === 1 ? 'copy' : 'copies'} outside this act ${n === 1 ? 'was' : 'were'} `
    + `NOT updated: ${where}. Open the act and save the chunk there to update `
    + `${n === 1 ? 'it' : 'them'}`
    + (crossZone ? '; copies in another zone resolve tiles against that zone\'s own tileset' : '')
    + '.';
}

/**
 * THE PANEL'S PROMISE, AND THE SCOPE IT IS ALLOWED TO CLAIM.
 *
 * Held here, beside the mechanism, because the sentence IS a claim about
 * `buildActPropagationCommand` and nothing else re-checks a sentence when the
 * mechanism under it changes. Before 2026-08-30 the panel said "updates every
 * copy you have not painted over by hand" while propagation reached one act:
 * a stamp of the same library chunk in a second act kept its link, was never
 * re-stamped, and diverged in silence.
 *
 * ChunkLinkOptions imports these rather than inlining the words;
 * `chunk-links-cross-act.test.ts` asserts both halves — that the linked text
 * names the ACT scope, and that the panel still reads it from here rather than
 * having grown a fresh literal beside it.
 */
export const CHUNK_LINK_LINKED_BLURB
  = 'Stamps remember their chunk: editing the chunk later updates every copy '
  + 'IN THIS ACT that you have not painted over by hand. Copies in other acts '
  + 'keep their link and are reported after the edit, not changed.';

export const CHUNK_LINK_DETACHED_BLURB
  = 'Stamps drop plain tiles. Editing the chunk later will NOT change them.';
