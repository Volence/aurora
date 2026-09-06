// The per-project mapping layer (spec §7): `.aurora/project.json` carries the
// nearest-base profile id plus per-asset-class overrides (path / format /
// compression) for hacks that diverge from stock.
//
// Parsing is LENIENT with per-entry diagnostics: a bad entry is dropped and
// reported as a ConfigIssue, never allowed to discard the rest of the file —
// the Project Setup tab renders these issues so the user can see exactly which
// entry is wrong (Stage 2; retired the Stage 1 all-or-nothing null parse and
// the s1 adapter's private sidecar reader). Unknown top-level fields are preserved
// so configs written by newer Auroras survive a round-trip through older ones.

import { z } from 'zod';

const assetOverrideSchema = z.strictObject({
  path: z.string().optional(),
  format: z.string().optional(),
  compression: z.string().optional(),
});

export const projectConfigSchema = z.looseObject({
  /** Base profile id, e.g. 's1-github', 's1-hivebrain-2005', 'aeon'. */
  base: z.string().optional(),
  /** v1 channel: resolution path overrides, keyed by resolver key. */
  paths: z.record(z.string(), z.string()).optional(),
  /** v2 channel: per-asset-class overrides. */
  assets: z.record(z.string(), assetOverrideSchema).optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** One dropped/ignored entry. `where` is a dotted path: '$', 'base', 'paths.foo'. */
export interface ConfigIssue {
  where: string;
  message: string;
}

/**
 * WHY the config is what it is — the three answers a sidecar read can give.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME ANSWER. Folding both to `config: {}`
 * is how a hand-written `.aurora/project.json` got destroyed at open: three
 * distinct failures (a read failure, invalid JSON, a non-object root) all
 * returned the same empty config the "no sidecar file" case returns, the
 * build-field seed could not tell them apart, and it wrote a fresh 3-key
 * document over every override in the file. Before any UI rendered, with no
 * gesture behind it.
 *
 *  • 'absent'     — no file on disk. An empty config is the TRUTH; writing the
 *                   seed creates the file, which is the whole point of it.
 *  • 'read'       — the file parsed. `config` is what it says; `issues` may
 *                   still name entries that were dropped from within it, and a
 *                   readable file with one bad entry is STILL safe to write.
 *  • 'unreadable' — the file is there and Aurora could not turn it into a
 *                   config. The user's overrides are still on disk; Aurora just
 *                   cannot see them, so it must not write over them.
 *
 * Same rule and same reason as the canvas path's `sidecarRejected`
 * (core/art/canvas-file-format.ts, state/canvas-save.ts) and aeon's
 * `section.unreadable` + `understood()` gate (project/aeon/save.ts): a sidecar
 * Aurora could not READ is one it must not overwrite. This field is a three-way
 * where canvas has a boolean because the classic sidecar's writer needs
 * 'absent' as a POSITIVE reason to write, not merely as the absence of a
 * rejection.
 *
 * The mtime guard cannot substitute for this. The file did not change on disk —
 * Aurora simply failed to parse it — so a conflict check has nothing to catch.
 */
export type SidecarRead = 'absent' | 'read' | 'unreadable';

/** Parsed sidecar + everything that had to be dropped to parse it. */
export interface SidecarState {
  config: ProjectConfig;
  issues: ConfigIssue[];
  /** See SidecarRead. Required, not optional: a producer that forgets to say
   *  which of the three this is must fail to compile, because the default a
   *  reader would otherwise assume ('read') is the dangerous one. */
  read: SidecarRead;
}

/**
 * THE WRITE GATE. Every writer of `.aurora/project.json` must pass this before
 * serializing anything over it — see classicProjectStore's open-time seed and
 * the Project Setup tab's Apply.
 *
 * Deliberately keyed on `read`, NOT on `issues.length`: a file that parsed with
 * one dropped `paths` entry is readable, and refusing to write it would strand
 * the seed (and Apply) for any project carrying a single typo'd override. The
 * question is never "was anything wrong" — it is "did Aurora see what is in
 * this file".
 */
export function sidecarMayBeOverwritten(state: SidecarState): boolean {
  return state.read !== 'unreadable';
}

/**
 * What to tell the person, when a writer refuses. One sentence, in one place,
 * so the seed and Apply cannot drift into saying different things about the
 * same file — and so it says what to DO, not merely that something was skipped
 * (the canvas save toast's rule, canvas-save.ts).
 */
export function sidecarRefusalMessage(what: string): string {
  return (
    `${SIDECAR_REL_PATH} could not be read, so Aurora left it alone instead of overwriting it. ` +
    `${what} were NOT written. Fix that file by hand (it must be a valid JSON object) ` +
    'and reopen the project.'
  );
}

/** The sidecar's path relative to the project root, named once. */
export const SIDECAR_REL_PATH = '.aurora/project.json';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lenient parse. `bytes: null` means "no sidecar file" (empty config, no
 * issues, `read: 'absent'`). Malformed input degrades entry-by-entry; the
 * returned config is always safe to USE.
 *
 * It is NOT always safe to serialize back — that is what `read` answers. The
 * two whole-file failures below (invalid JSON, a non-object root) return the
 * same empty config as the absent case and are told apart ONLY by `read`;
 * `sidecarMayBeOverwritten` is the gate every writer must pass.
 */
export function readProjectConfig(bytes: Uint8Array | null): SidecarState {
  if (bytes === null) return { config: {}, issues: [], read: 'absent' };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {
      config: {},
      issues: [{ where: '$', message: 'invalid JSON; ignoring the sidecar' }],
      read: 'unreadable',
    };
  }
  if (!isPlainObject(json)) {
    return {
      config: {},
      issues: [{ where: '$', message: 'expected a JSON object; ignoring the sidecar' }],
      read: 'unreadable',
    };
  }

  const issues: ConfigIssue[] = [];
  const out: Record<string, unknown> = { ...json };

  if ('base' in json && typeof json.base !== 'string') {
    delete out.base;
    issues.push({ where: 'base', message: `expected a string profile id, got ${json.base === null ? 'null' : typeof json.base}; entry ignored` });
  }

  if ('paths' in json) {
    if (!isPlainObject(json.paths)) {
      delete out.paths;
      issues.push({ where: 'paths', message: 'expected an object of key → path; channel ignored' });
    } else {
      const paths: Record<string, string> = {};
      for (const [k, v] of Object.entries(json.paths)) {
        if (typeof v === 'string') paths[k] = v;
        else issues.push({ where: `paths.${k}`, message: `expected a string path, got ${v === null ? 'null' : typeof v}; entry ignored` });
      }
      out.paths = paths;
    }
  }

  if ('assets' in json) {
    if (!isPlainObject(json.assets)) {
      delete out.assets;
      issues.push({ where: 'assets', message: 'expected an object of asset-class → override; channel ignored' });
    } else {
      const assets: Record<string, z.infer<typeof assetOverrideSchema>> = {};
      for (const [k, v] of Object.entries(json.assets)) {
        const res = assetOverrideSchema.safeParse(v);
        if (res.success) assets[k] = res.data;
        else {
          const zi = res.error.issues[0];
          const at = zi && zi.path.length > 0 ? `${zi.path.join('.')}: ` : '';
          issues.push({ where: `assets.${k}`, message: `${at}${zi?.message ?? 'invalid override shape'}; entry ignored` });
        }
      }
      out.assets = assets;
    }
  }

  // 'read' even with issues: the FILE parsed. Per-entry drops are diagnostics
  // about its contents, not a failure to see them — see sidecarMayBeOverwritten.
  return { config: out as ProjectConfig, issues, read: 'read' };
}

export function serializeProjectConfig(cfg: ProjectConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cfg, null, 2) + '\n');
}

/**
 * The build fields Aurora writes into a CLASSIC project's sidecar at open, so
 * Build & Run has a declared channel rather than hardcoded knowledge, and so
 * the person who owns the disassembly can see and edit what will be spawned.
 * Values transcribed from s1disasm's own build (build.lua:27,30 names the
 * artifact `s1built`; AS's `-L` writes the listing beside the SOURCE, so it is
 * `sonic.lst`); the sidecar schema round-trips these as unknown top-level keys.
 */
export const CLASSIC_BUILD_SIDECAR: Readonly<Record<string, string>> = {
  buildCommand: 'lua build.lua',
  romPath: 's1built.bin',
  symbolsPath: 'sonic.lst',
};

/**
 * Fill in any of the three build fields the sidecar does not already carry.
 * NEVER overwrites: a project that declared its own values (a different
 * disassembly layout, a wrapper script) keeps them — the seed exists to make
 * the default visible, not to enforce it. `changed` says whether a write-back
 * is needed at all, so an already-seeded project costs no disk write on open.
 */
export function seedClassicBuildConfig(cfg: ProjectConfig): { config: ProjectConfig; changed: boolean } {
  const out: Record<string, unknown> = { ...cfg };
  let changed = false;
  for (const [k, v] of Object.entries(CLASSIC_BUILD_SIDECAR)) {
    if (typeof out[k] === 'string' && (out[k] as string).length > 0) continue;
    out[k] = v;
    changed = true;
  }
  return { config: out as ProjectConfig, changed };
}
