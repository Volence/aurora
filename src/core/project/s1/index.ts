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
} from '../adapter';
import { buildReport, type ResolutionEntry, type EntryStatus } from '../report';
import { s1Profile, type ClassicProfile, type VariantPath, type LevelAct } from '../profiles/s1';
import {
  readS1Level,
  writeS1Level,
  type ResolvedLevelPaths,
  type S1ReadState,
} from '../../level-classic/s1-io';

const LABEL = 'Sonic 1 Disassembly (GitHub)';
const SIDECAR = '.aurora/project.json';

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
 * Read `.aurora/project.json` overrides through the FileAccess. Precedence: the
 * sidecar is the base, and the `overrides` param passed to open() (what the main
 * process supplies) merges ON TOP of it — param keys win. A missing or malformed
 * sidecar is treated as empty (open never fails over a bad sidecar).
 */
async function readSidecar(fa: FileAccess): Promise<ProjectOverrides> {
  try {
    if (!(await fa.exists(SIDECAR))) return {};
    const raw = await fa.read(SIDECAR);
    const json: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (
      json !== null &&
      typeof json === 'object' &&
      'paths' in json &&
      typeof (json as { paths: unknown }).paths === 'object' &&
      (json as { paths: unknown }).paths !== null
    ) {
      // Filter to string values only: an override path that isn't a string
      // (number, object, null from a hand-edited sidecar) must never reach
      // fa.exists()/fa.read(), which would coerce it into a bogus path. Drop
      // such entries so a malformed sidecar degrades gracefully to "no override
      // for that key" rather than corrupting resolution. (Task 5 review note.)
      const raw = (json as { paths: Record<string, unknown> }).paths;
      const paths: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string') paths[k] = v;
      }
      return { paths };
    }
    return {};
  } catch {
    return {};
  }
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
    const sidecar = await readSidecar(fa);
    const effective = mergeOverrides(sidecar, overrides);

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
    };

    return {
      type: 's1',
      capabilities: {
        levels: 'chunk-hierarchy',
        sprites: true,
        objects: 'objpos',
        build: false,
        facets: ['layout', 'art', 'objects', 'collision', 'palette'],
      },
      report,
      levels,
    };
  },
};
