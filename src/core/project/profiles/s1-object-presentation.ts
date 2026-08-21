// PRESENTATION over the S1 object registries — how the sprite lists, pickers
// and the Explorer's Object Library display the id → art-link tables, without
// changing what the tables SAY. Three concerns live here, all pure and
// node-testable, none of them touching the tables' data:
//
//  1. LINK-IDENTITY DEDUP. Five boss ids ($3D/$73/$75/$77/$7A) share ONE
//     `EGGMAN` link object in s1-object-art.ts — the same `Map_Eggman` +
//     `Nem_Eggman` set, so five list rows all open the identical document.
//     `s1ArtRowGroups` collapses rows by the RESOLVED LINK'S REFERENCE
//     IDENTITY: ids group when the table author declared the art shared by
//     reusing one link constant, and a future id added onto that constant
//     groups automatically. No id is ever named here. Reference — not value —
//     identity on purpose: SBZ's Trapdoor ($69) and Platform Conveyor Belt
//     ($6F) are DISTINCT objects whose separate links happen to name the same
//     .nem and frame, and merging those rows would hide an object.
//
//  2. ZONE-FREE vs ZONE-SCOPED sectioning. `objectArtIsZoneFree` (the Ring
//     distinction: one base-map link no zone map redefines, mirroring art the
//     PLC cue lists load for every level) splits a zone's linked rows into the
//     zone's OWN objects and the shared set, so a GHZ session stops filing
//     the bosses and the Ring under a "GHZ objects" header.
//
//  3. ZONE AVAILABILITY + the placement warning. The objpos format places any
//     id <= $7F in any act, but an id whose art link exists only under OTHER
//     zones' maps is art this zone's Pattern Load Cues never queue (that is
//     what the per-zone maps transcribe — see s1-object-art.ts's curation
//     notes, e.g. Nem_Motobug queued only by PLC_GHZ). `s1ObjectZoneAvailability`
//     classifies an id for a zone straight off those tables — never a
//     hardcoded id list — and `s1PlacementWarning` words the honest
//     consequence for a placement the format allows but the zone's cues do
//     not feed.

import {
  type ObjectArtLink,
  resolveObjectArt,
  objectArtIsZoneFree,
  S1_OBJECT_ART_ZONE,
} from './s1-object-art';
import { S1_OBJECT_LIST, s1ObjectHex, s1ObjectIsInvisible } from './s1-objects';

/** One display row: a linked object, or several ids sharing one link object. */
export interface S1ArtRowGroup {
  /** Canonical id — the LOWEST id in the group; the one a click opens. */
  id: number;
  /** Every id resolving to this same link object, ascending. */
  ids: number[];
  /** The object's name, or the merged label when ids share the link. */
  label: string;
  link: ObjectArtLink;
  /** True when every id in the group is zone-free (see objectArtIsZoneFree). */
  zoneFree: boolean;
}

/**
 * The label for a merged row, DERIVED from the grouped names — never stored.
 * Rule: names of the shape `Base (Qualifier)` with one shared Base merge to
 * `Base (<common trailing words of the qualifiers>)`, so "Eggman (GHZ Boss)"
 * … "Eggman (SLZ Boss)" merge to "Eggman (Boss)". No common trailing words
 * leaves just the Base; names that don't fit the pattern (or disagree on the
 * Base) fall back to the canonical (first) name, which is at least true of
 * the document the row opens.
 */
export function mergedRowLabel(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  const parsed = names.map((n) => /^(.*\S)\s*\((.+)\)$/.exec(n));
  const bases = new Set(parsed.map((p) => p?.[1]));
  if (parsed.every((p) => p !== null) && bases.size === 1) {
    const base = parsed[0]![1];
    const quals = parsed.map((p) => p![2].trim().split(/\s+/));
    const tail: string[] = [];
    for (let i = 1; ; i++) {
      const w = quals[0][quals[0].length - i];
      if (w === undefined || !quals.every((q) => q[q.length - i] === w)) break;
      tail.unshift(w);
    }
    return tail.length > 0 ? `${base} (${tail.join(' ')})` : base;
  }
  return names[0];
}

/**
 * The zone's linked rows, deduped by link reference identity (see the header's
 * point 1), in ascending canonical-id order. `zone` semantics match
 * `resolveObjectArt`: zone overrides win over the base map; undefined/unknown
 * zone resolves the base map only (the level-free row set).
 */
export function s1ArtRowGroups(zone?: string): S1ArtRowGroup[] {
  const groups = new Map<ObjectArtLink, { ids: number[]; names: string[] }>();
  for (const { id, name } of S1_OBJECT_LIST) {
    const link = resolveObjectArt(id, zone);
    if (link === undefined) continue;
    const g = groups.get(link) ?? { ids: [], names: [] };
    g.ids.push(id);
    g.names.push(name);
    groups.set(link, g);
  }
  // Map iteration is insertion order and S1_OBJECT_LIST is id-ascending, so
  // groups come out ordered by their lowest (canonical) id already.
  return [...groups.entries()].map(([link, g]) => ({
    id: g.ids[0],
    ids: g.ids,
    label: mergedRowLabel(g.names),
    link,
    zoneFree: g.ids.every(objectArtIsZoneFree),
  }));
}

/** `$3D · $73 · $75` — the covered-ids line for a merged row's subtitle/tooltip. */
export function groupIdsHex(group: Pick<S1ArtRowGroup, 'ids'>): string {
  return group.ids.map(s1ObjectHex).join(' · ');
}

/** The zones whose PER-ZONE art maps link this id, in the tables' zone order. */
export function s1LinkedZones(id: number): string[] {
  return Object.keys(S1_OBJECT_ART_ZONE).filter(
    (z) => S1_OBJECT_ART_ZONE[z][id] !== undefined,
  );
}

/**
 * Why an id is (or is not) available in a zone, derived from the art table +
 * the invisible-trigger set — the classifications the registries already
 * carry, never an id list of this module's own:
 *   • 'available'      — `resolveObjectArt(id, zone)` hits (zone map or the
 *                        zone-free base map): the zone's cues feed its art.
 *   • 'invisible'      — a trigger/controller with no sprite at all
 *                        (S1_INVISIBLE_OBJECT_IDS): nothing to load, nothing
 *                        to warn about.
 *   • 'art-elsewhere'  — linked, but only under OTHER zones' maps: this
 *                        zone's Pattern Load Cues never queue its art.
 *   • 'no-art-link'    — a visible object no table links yet; Aurora cannot
 *                        vouch for its art either way.
 */
export type S1ZoneAvailability =
  | { kind: 'available' }
  | { kind: 'invisible' }
  | { kind: 'art-elsewhere'; zones: string[] }
  | { kind: 'no-art-link' };

export function s1ObjectZoneAvailability(id: number, zone: string): S1ZoneAvailability {
  if (resolveObjectArt(id, zone) !== undefined) return { kind: 'available' };
  if (s1ObjectIsInvisible(id)) return { kind: 'invisible' };
  const zones = s1LinkedZones(id);
  return zones.length > 0 ? { kind: 'art-elsewhere', zones } : { kind: 'no-art-link' };
}

const zoneCaps = (z: string): string => z.toUpperCase();

/**
 * The library row's unavailability note (tooltip text). `zone` is null when no
 * act is open — the note then explains the zone-scoping rather than blaming a
 * zone nobody has opened.
 */
export function s1UnavailableRowNote(id: number, zone: string | null): string {
  const a = zone !== null ? s1ObjectZoneAvailability(id, zone) : null;
  const kind = a?.kind ?? (s1ObjectIsInvisible(id)
    ? 'invisible'
    : s1LinkedZones(id).length > 0 ? 'art-elsewhere' : 'no-art-link');
  switch (kind) {
    case 'available':
      return '';
    case 'invisible':
      return 'Invisible trigger — no sprite art to edit (the map draws it as a ghost marker)';
    case 'art-elsewhere': {
      const zones = s1LinkedZones(id).map(zoneCaps).join(', ');
      return zone !== null
        ? `Not loaded in ${zoneCaps(zone)} — this zone's Pattern Load Cues never queue its art; it loads in ${zones}`
        : `Zone-scoped art (${zones}) — open one of those acts to edit it`;
    }
    case 'no-art-link':
      return 'No sprite art linked in Aurora\'s table yet';
  }
}

/**
 * The honest post-placement warning, or null when the placement needs none
 * (art available in this zone, or an invisible trigger). The placement itself
 * is ALLOWED either way — the objpos format encodes any id <= $7F and staging
 * the art later is a legitimate workflow — so this is a warning beside a
 * successful write, in the collision loop-warning's register: what won't
 * load, where, and what that looks like in-game.
 */
export function s1PlacementWarning(id: number, zone: string, name: string): string | null {
  const a = s1ObjectZoneAvailability(id, zone);
  switch (a.kind) {
    case 'available':
    case 'invisible':
      return null;
    case 'art-elsewhere':
      return `${name} (${s1ObjectHex(id)}) placed, but ${zoneCaps(zone)}'s Pattern Load Cues never load its art — in-game it will draw whatever tiles sit in its VRAM slot. Its art loads in ${a.zones.map(zoneCaps).join(', ')}`;
    case 'no-art-link':
      return `${name} (${s1ObjectHex(id)}) placed, but no table links art for it — nothing shows ${zoneCaps(zone)} loading its art, so it may draw wrong tiles in-game`;
  }
}
