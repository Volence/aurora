// S1ProjectAdapter — fingerprints a stock Sonic 1 disassembly directory and opens
// it into a ProjectHandle by resolving every entry of the bundled s1 profile
// against the real files on disk, producing a loud ResolutionReport.
//
// Task 5 of the disasm-project abstraction (spec §2.1). This module is pure core:
// no fs / Electron imports — all IO goes through the injected FileAccess. It does
// NOT register itself globally; wiring happens in Task 9. Level read/write are
// stubbed until Task 7 fills them in.

import type {
  FileAccess,
  ProjectAdapter,
  ProjectHandle,
  ProjectMatch,
  ProjectOverrides,
  ZoneActRef,
  ClassicLevelAccess,
  DirtyDomains,
  WriteResult,
  LevelDoc,
  FacetCapability,
} from '../adapter';
import { buildReport, type ResolutionEntry, type EntryStatus } from '../report';
import { s1Profile, type ClassicProfile, type VariantPath, type LevelAct } from '../profiles/s1';
import { readProjectConfig, type SidecarState } from '../mapping';
import {
  readS1Level,
  writeS1Level,
  type ResolvedLevelPaths,
  type S1ReadState,
} from '../../level-classic/s1-io';
import { levelArtReservationRequests, buildReservedTileSet } from '../profiles/s1-levelart-reservations';

const TILE_BYTES = 32;

const LABEL = 'Sonic 1 Disassembly (GitHub)';
const SIDECAR = '.aurora/project.json';

/**
 * THE s1 FACET GRANT — the one statement of it, spread into the manifest below.
 *
 * Exported because the grant was previously written out in five places and only
 * ONE of them failed when it drifted (s1-adapter.test.ts). Two workspace tests
 * kept their own `S1_GRANT` literal and used it on BOTH sides of their own
 * assertion, so they could not fail by construction. They read this now, which
 * turns them into cross-checks between the real grant and the facet registry.
 *
 * FOUR PILLS: Layout / Objects / Palette / Art. The list is written in the order
 * the bar shows them (core/shell/facets.ts sorts the pills itself; agreeing is
 * for the reader). What is in it and what is not, and why, all of it reversible
 * by editing this list (and the renderer's register-facets to match):
 *
 *  - `layout` is TERRAIN over the act's map — the chunk picker and the stamp.
 *  - `objects` is PLACEMENT over the same map: the object library, the inspector
 *    and `place-object`. It was briefly merged into `layout` (2026-08-14) on the
 *    argument that a facet you can select and MOVE an object in but not ADD one
 *    to is half a task. The diagnosis was right and the cure was not: what made
 *    the split feel wrong was the PILL ORDER, which put `art` — the one facet
 *    that swaps the canvas — between Layout and Objects, so moving between two
 *    lenses on the same scene read as a scene change. `art` is last now, and a
 *    split facet over a canvas that visibly does not move is fine. (Reversed
 *    with the owner the same week, after seeing both running.)
 *  - `palette` is the CRAM grid over that same map. It was once dropped for
 *    being a second name for `art` — both pills rendered the same composer, the
 *    same right column and the same status bar, differing in `id` alone. It came
 *    back with the MAP as its canvas (renderer's workspace/facets/s1-facets.tsx):
 *    a Genesis palette line is shared by everything drawn with it, so "did that
 *    recolour break anything?" is a question only the whole act can answer, and
 *    the composer's 256px chunk cannot. That is exactly why aeon's palette facet
 *    survived the same review. It is also classic's ONLY reachable palette
 *    editor for a palette-only hack: the Art column's grid sits under an
 *    82-chunk wall, which is how it came to be believed not to exist at all.
 *  - `art` is the composer — the tile/block/chunk tiers of the zone-art doc, and
 *    the only classic facet whose canvas is not the act. Hence LAST.
 *
 *  - `collision` is the READ side of the collision editor (spec stage 3a): the
 *    lookup that decides whether the player stands on a cell, shown where the
 *    hole is. It does not write yet — solidity stays in ChunkTab's Assign mode,
 *    and the shape picker is stage 3b. Granted 2026-08-17.
 *  - `rings` is ABSENT: S1 rings are objects in objpos, not a separate layer.
 */
export const S1_FACETS = ['layout', 'objects', 'collision', 'palette', 'art'] as const satisfies readonly FacetCapability[];

// ---------------------------------------------------------------------------
// Profile enumeration — flattens the profile into an ordered list of resolvable
// entries. This is the single source of truth for BOTH resolution (below) and
// tests (which build a drift-proof fake tree by inserting a file at each entry's
// path). Report keys are stable and human-readable, e.g. 'ghz.act1.fgLayout'.
// ---------------------------------------------------------------------------

export interface ProfileEntry {
  /** Stable report/override key, e.g. 'ghz.act1.fgLayout' or 'collision.normal'. */
  key: string;
  /** Owning zone id, when the entry belongs to an act (absent for globals). */
  zone?: string;
  /** Owning act number, when the entry belongs to an act. */
  act?: number;
  /** Preferred (+ optional REV00 fallback) path pair. */
  variant: VariantPath;
  /**
   * Whether a miss makes the owning act unavailable. Structural files gate;
   * decorative/optional ones (animated art, water palettes) and the shared
   * global collision tables are reported but never gate a specific act.
   */
  gating: boolean;
}

/** A plain single-path entry (no REV pair) as a VariantPath. */
function single(path: string): VariantPath {
  return { path };
}

/**
 * Flatten a profile into resolvable entries, in a deterministic order. Exported
 * so tests can construct a fake file tree straight from the profile.
 */
export function enumerateProfileEntries(profile: ClassicProfile): ProfileEntry[] {
  const out: ProfileEntry[] = [];
  for (const zone of profile.zones) {
    for (const act of zone.acts) {
      const p = (field: string) => `${zone.id}.act${act.act}.${field}`;
      act.tiles.forEach((t, i) =>
        out.push({ key: p(`tiles.${i}`), zone: zone.id, act: act.act, variant: single(t), gating: true }),
      );
      out.push({ key: p('blocks'), zone: zone.id, act: act.act, variant: act.blocks, gating: true });
      out.push({ key: p('chunks'), zone: zone.id, act: act.act, variant: act.chunks, gating: true });
      out.push({ key: p('colind'), zone: zone.id, act: act.act, variant: act.colind, gating: true });
      out.push({ key: p('fgLayout'), zone: zone.id, act: act.act, variant: act.fgLayout, gating: true });
      out.push({ key: p('bgLayout'), zone: zone.id, act: act.act, variant: act.bgLayout, gating: true });
      out.push({ key: p('objpos'), zone: zone.id, act: act.act, variant: act.objpos, gating: true });
      out.push({ key: p('startpos'), zone: zone.id, act: act.act, variant: act.startpos, gating: true });
      act.palette.forEach((c, i) =>
        out.push({
          key: p(`palette.${i}`),
          zone: zone.id,
          act: act.act,
          variant: single(c.file),
          gating: true,
        }),
      );
      (act.waterPalette ?? []).forEach((c, i) =>
        out.push({
          key: p(`waterPalette.${i}`),
          zone: zone.id,
          act: act.act,
          variant: single(c.file),
          gating: false,
        }),
      );
      act.animatedArt.forEach((a, i) =>
        out.push({
          key: p(`anim.${i}`),
          zone: zone.id,
          act: act.act,
          variant: single(a.file),
          gating: false,
        }),
      );
    }
  }
  out.push({ key: 'collision.normal', variant: single(profile.collision.normal), gating: false });
  out.push({ key: 'collision.rotated', variant: single(profile.collision.rotated), gating: false });
  out.push({ key: 'collision.angleMap', variant: single(profile.collision.angleMap), gating: false });
  return out;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface Resolved {
  entry: ResolutionEntry;
  /** The resolvable this came from (for act-availability bookkeeping). */
  source: ProfileEntry;
}

async function resolveEntry(
  fa: FileAccess,
  e: ProfileEntry,
  overrides: ProjectOverrides | undefined,
): Promise<Resolved> {
  const override = overrides?.paths?.[e.key];
  // An explicit override replaces the entry's path outright — no REV fallback.
  if (override !== undefined) {
    const ok = await fa.exists(override);
    return mk(e, override, ok ? 'resolved' : 'missing', ok ? 'override' : 'override (missing)');
  }
  if (await fa.exists(e.variant.path)) {
    return mk(e, e.variant.path, 'resolved');
  }
  if (e.variant.rev00Path !== undefined && (await fa.exists(e.variant.rev00Path))) {
    return mk(e, e.variant.rev00Path, 'resolved', 'REV00 fallback');
  }
  // Missing — report against the preferred path.
  return mk(e, e.variant.path, 'missing');
}

function mk(source: ProfileEntry, path: string, status: EntryStatus, detail?: string): Resolved {
  return { source, entry: detail ? { key: source.key, path, status, detail } : { key: source.key, path, status } };
}

// ---------------------------------------------------------------------------
// Sidecar
// ---------------------------------------------------------------------------

/**
 * Read `.aurora/project.json` through the shared mapping parser (spec §7).
 * Never fails an open: a missing file is an empty config; malformed content
 * degrades per entry, with the drops reported as issues on the handle.
 */
async function readSidecarState(fa: FileAccess): Promise<SidecarState> {
  let bytes: Uint8Array | null;
  try {
    bytes = (await fa.exists(SIDECAR)) ? await fa.read(SIDECAR) : null;
  } catch {
    return { config: {}, issues: [{ where: '$', message: 'sidecar unreadable — ignoring it' }] };
  }
  return readProjectConfig(bytes);
}

function mergeOverrides(
  sidecar: ProjectOverrides,
  param: ProjectOverrides | undefined,
): ProjectOverrides | undefined {
  const paths = { ...(sidecar.paths ?? {}), ...(param?.paths ?? {}) };
  return Object.keys(paths).length > 0 ? { paths } : undefined;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

async function dirHasEntries(fa: FileAccess, dir: string): Promise<boolean> {
  try {
    return (await fa.list(dir)).length > 0;
  } catch {
    return false;
  }
}

/**
 * A mapping ASM file's text, or null when it does not exist / cannot be read.
 * Tolerant by design, matching `readSidecarState`: a missing reservation
 * source contributes nothing to `buildReservedTileSet` (permissive), rather
 * than failing the whole act open.
 */
/**
 * A mappings .asm, or WHY there isn't one.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME ANSWER, and folding both to null was
 * how a reservation set could come back non-null but INCOMPLETE. `reservedTiles`
 * has a documented "not known" spelling — null — that the surface planner and
 * the commit planner both refuse under; an empty-but-present set defeats it, and
 * the allocator then hands out tiles an object sprite is still drawing through.
 * An absent file is a request that simply does not apply; an unreadable one
 * means the set cannot be computed at all.
 */
type MapTextRead =
  | { kind: 'text'; text: string }
  | { kind: 'absent' }
  | { kind: 'unreadable' };

async function readMapText(fa: FileAccess, path: string): Promise<MapTextRead> {
  let present: boolean;
  try {
    present = await fa.exists(path);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!present) return { kind: 'absent' };
  try {
    return { kind: 'text', text: new TextDecoder().decode(await fa.read(path)) };
  } catch {
    return { kind: 'unreadable' };
  }
}

export const s1Adapter: ProjectAdapter = {
  type: 's1',

  async detect(fa: FileAccess): Promise<ProjectMatch | null> {
    // Fingerprint: the top-level source file plus the three data dirs the profile
    // relies on. Disjoint from aeon's fingerprint by design.
    if (!(await fa.exists('sonic.asm'))) return null;
    if (!(await dirHasEntries(fa, 'artnem'))) return null;
    if (!(await dirHasEntries(fa, 'map256'))) return null;
    if (!(await dirHasEntries(fa, 'levels'))) return null;
    return { type: 's1', label: LABEL };
  },

  async open(fa: FileAccess, overrides?: ProjectOverrides): Promise<ProjectHandle> {
    const sidecar = await readSidecarState(fa);
    const effective = mergeOverrides({ paths: sidecar.config.paths }, overrides);

    const entries = enumerateProfileEntries(s1Profile);
    const resolved = await Promise.all(entries.map((e) => resolveEntry(fa, e, effective)));

    // Bucket gating misses per act so we can flag unavailable acts + reasons.
    const missesByAct = new Map<string, string[]>();
    for (const r of resolved) {
      if (r.entry.status === 'missing' && r.source.gating && r.source.zone !== undefined) {
        const k = `${r.source.zone}/${r.source.act}`;
        const list = missesByAct.get(k) ?? [];
        list.push(r.source.key);
        missesByAct.set(k, list);
      }
    }

    const refs: ZoneActRef[] = [];
    for (const zone of s1Profile.zones) {
      for (const act of zone.acts) {
        const misses = missesByAct.get(`${zone.id}/${act.act}`);
        refs.push(
          misses
            ? {
                zone: zone.id,
                act: act.act,
                label: act.name,
                available: false,
                reason: `missing ${misses.length} required file(s): ${misses.join(', ')}`,
              }
            : { zone: zone.id, act: act.act, label: act.name, available: true },
        );
      }
    }

    const report = buildReport(resolved.map((r) => r.entry));

    // Path lookup by report key, for building resolved level paths without
    // re-resolving. Only entries that actually resolved are included; a gating
    // miss makes its act unavailable (guarded in read), and a non-gating miss
    // (e.g. an animated-art file) simply resolves to undefined below.
    const pathByKey = new Map<string, string>();
    for (const r of resolved) {
      if (r.entry.status === 'resolved') pathByKey.set(r.entry.key, r.entry.path);
    }
    const global = (key: string): string => {
      const p = pathByKey.get(key);
      if (p === undefined) throw new Error(`required collision table '${key}' did not resolve`);
      return p;
    };

    const findAct = (ref: ZoneActRef): { zone: string; act: LevelAct } => {
      const zone = s1Profile.zones.find((z) => z.id === ref.zone);
      const act = zone?.acts.find((a) => a.act === ref.act);
      if (!zone || !act) throw new Error(`unknown act ${ref.zone}/${ref.act}`);
      return { zone: zone.id, act };
    };

    const buildPaths = (zoneId: string, act: LevelAct): ResolvedLevelPaths => {
      const p = (field: string): string => {
        const key = `${zoneId}.act${act.act}.${field}`;
        const path = pathByKey.get(key);
        if (path === undefined) throw new Error(`entry '${key}' did not resolve`);
        return path;
      };
      return {
        tiles: act.tiles.map((_, i) => p(`tiles.${i}`)),
        blocks: p('blocks'),
        chunks: p('chunks'),
        colind: p('colind'),
        fg: p('fgLayout'),
        bg: p('bgLayout'),
        objpos: p('objpos'),
        startpos: p('startpos'),
        palette: act.palette.map((_, i) => p(`palette.${i}`)),
        animatedArt: act.animatedArt.map((_, i) =>
          pathByKey.get(`${zoneId}.act${act.act}.anim.${i}`),
        ),
        collisionNormal: global('collision.normal'),
        collisionAngleMap: global('collision.angleMap'),
      };
    };

    // Read-side bookkeeping cached per act so write() can re-pair it with the
    // (edited) doc the store hands back without re-reading from disk.
    const readStates = new Map<string, S1ReadState>();
    // The reserved-tile set (Task 5c), stashed beside readStates on the same
    // per-act key. Populated at read() alongside it, exposed synchronously by
    // reservedTiles() below — same shape as editableTileRange.
    const reservedTilesStates = new Map<string, ReadonlySet<number>>();
    const refKey = (ref: ZoneActRef): string => `${ref.zone}/${ref.act}`;

    const levels: ClassicLevelAccess = {
      list: () => refs,
      read: async (ref: ZoneActRef): Promise<LevelDoc> => {
        const meta = refs.find((r) => r.zone === ref.zone && r.act === ref.act);
        if (!meta) throw new Error(`unknown act ${ref.zone}/${ref.act}`);
        if (!meta.available) throw new Error(`act ${ref.zone}/${ref.act} unavailable: ${meta.reason}`);
        const { zone, act } = findAct(ref);
        const state = await readS1Level(act, buildPaths(zone, act), fa);
        readStates.set(refKey(ref), state.read);

        // Task 5c: which pool tiles this act's level-art-drawn object sprites
        // read, so planSurfaceEdit never claims one as a free slot. The
        // request list is zone-static (see s1-levelart-reservations.ts); only
        // the mapping TEXT is per-open IO, so it happens here where `fa` is
        // already in scope, exactly like the sidecar / profile resolution
        // above it.
        const poolTileCount = Math.floor(state.doc.tiles.length / TILE_BYTES);
        const requests = levelArtReservationRequests(zone, act.act);
        const mapPaths = [...new Set(requests.map((r) => r.mapAsm))];
        const mapTextByPath = new Map<string, string>();
        let reservationsKnown = true;
        await Promise.all(
          mapPaths.map(async (p) => {
            const r = await readMapText(fa, p);
            if (r.kind === 'text') mapTextByPath.set(p, r.text);
            // A file that is THERE and could not be read leaves the set
            // incomplete, and an incomplete set is indistinguishable from a
            // complete one at the allocator. See readMapText.
            else if (r.kind === 'unreadable') reservationsKnown = false;
          }),
        );
        if (reservationsKnown) {
          const { tiles: reserved } = buildReservedTileSet(requests, mapTextByPath, poolTileCount);
          reservedTilesStates.set(refKey(ref), reserved);
        } else {
          // NULL is the documented "not known", and both planners already refuse
          // the dangerous operations under it. Say it rather than reporting a
          // set that is quietly missing entries.
          reservedTilesStates.delete(refKey(ref));
        }

        return state.doc;
      },
      write: async (ref: ZoneActRef, doc: LevelDoc, dirty: DirtyDomains): Promise<WriteResult> => {
        const read = readStates.get(refKey(ref));
        if (!read) {
          throw new Error(`act ${ref.zone}/${ref.act} must be read before it can be written`);
        }
        const result = writeS1Level({ doc, read }, dirty);
        // Expected mtime for each written path = the value captured at read (or
        // refreshed by a prior updateMtimes). A path with no captured mtime is
        // simply omitted → the renderer sends expectedMtimeMs null for it.
        const fileMtimes: Record<string, number> = {};
        for (const f of result.files) {
          const m = read.fileMtimes[f.path];
          if (m !== undefined) fileMtimes[f.path] = m;
        }
        return {
          written: result.files.map((f) => f.path),
          skipped: Object.entries(dirty)
            .filter(([, v]) => !v)
            .map(([k]) => k),
          errors: result.errors,
          files: result.files,
          fileMtimes,
        };
      },
      updateMtimes: (ref: ZoneActRef, newMtimes: Record<string, number>): void => {
        const read = readStates.get(refKey(ref));
        if (!read) return; // never read → nothing cached to refresh
        for (const [p, m] of Object.entries(newMtimes)) read.fileMtimes[p] = m;
      },
      editableTileRange: (ref: ZoneActRef) => {
        const read = readStates.get(refKey(ref));
        if (!read) return null; // never read → no bookkeeping to answer from
        const baseTileCount = read.pristineTileFiles.reduce((n, f) => n + f.tileCount, 0);
        const animRanges = read.animOverlay.map((o) => ({ start: o.start, count: o.count }));
        return { baseTileCount, animRanges };
      },
      reservedTiles: (ref: ZoneActRef) => reservedTilesStates.get(refKey(ref)) ?? null,
    };

    return {
      type: 's1',
      capabilities: {
        levels: 'chunk-hierarchy',
        sprites: true,
        objects: 'objpos',
        build: false,
        // Spread, not the constant itself: `facets` is a mutable array on the
        // manifest, and handing every open handle the same array instance would
        // let one of them edit the grant for all of them. See S1_FACETS above
        // for what is in it and what is deliberately not.
        facets: [...S1_FACETS],
        // Classic's three rungs are all id-addressed: a layout cell HOLDS a
        // chunk id and a chunk cell HOLDS a block id, so an edit at any tier
        // propagates to every placement (spec §3.0.2).
        artTiers: [
          { id: 'chunk', label: 'Chunk', pixelSize: 256, shared: true },
          { id: 'block', label: 'Block', pixelSize: 16, shared: true },
          { id: 'tile', label: 'Tile', pixelSize: 8, shared: true },
        ],
        // THE CURRENT RULE: layout is TERRAIN plus `select`, and NO
        // `place-object`. Placement is the Objects facet's, which declares
        // nothing and so takes the shell default ['place-object','select','view']
        // — the same division aeon uses. `select` is on both because nudging or
        // deleting an object should not cost a facet switch, and you can SEE
        // objects while editing terrain through the View menu's overlay.
        //
        // The declaration exists at all to SUBTRACT marquee / paint-tile /
        // paint-block, which the shell default for layout offers and classic has
        // no implementation of.
        //
        // WHY THIS LINE CARRIES A HISTORY NOTE. It has been wrong in BOTH
        // directions, each time because the prose beside it outlived the
        // decision, and that churn is the useful part:
        //   1. It carried place-object with a comment saying it did so "until
        //      the workspace re-home splits it into per-facet docks". The
        //      re-home landed and the declaration did not move, leaving Objects
        //      a strict SUBSET of Layout — same tools, and the list and the
        //      inspector on both columns — so the Objects pill was dead weight.
        //   2. It was removed, splitting the facets cleanly, and Objects was then
        //      merged INTO Layout on the grounds that a facet you can select,
        //      move and delete in but not add from is half a task — which put
        //      place-object back here.
        //   3. Reverted (owner, 2026-08-14, after using it): the split was never
        //      the problem. `art` sat SECOND in the pill row, so Layout → Objects
        //      crossed the one facet that swaps the canvas and read as a scene
        //      change. `art` is last now (core/shell/facets.ts) and the split
        //      stands. The half-a-task complaint is answered by the ORDER of the
        //      pills, not by collapsing them.
        // If a fourth revision is ever wanted, note that steps 1–3 all argued
        // from this file alone; the thing that settled it was running it.
        //
        // Order is dock order and the first entry is the facet DEFAULT, so
        // `view` stays first: switching to Layout must not land you holding a
        // tool that writes.
        facetTools: {
          layout: ['view', 'stamp-chunk', 'select'],
          // DECLARED, not defaulted. Stage 3b (2026-08-17) makes the facet
          // write, but `view` MUST stay first — the first entry is the facet
          // default (renderer/workspace/facet-tools.ts:3) — so arriving on
          // Collision still hands you the read-only probe, not a loaded write
          // tool. The user arms `paint-collision` deliberately (the chip row,
          // or the tool dock) once they have picked a shape in the panel.
          collision: ['view', 'paint-collision'],
        },
      },
      report,
      levels,
      sidecar,
    };
  },
};
