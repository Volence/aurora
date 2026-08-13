// The per-project mapping layer (spec §7): `.aurora/project.json` carries the
// nearest-base profile id plus per-asset-class overrides (path / format /
// compression) for hacks that diverge from stock.
//
// Parsing is LENIENT with per-entry diagnostics: a bad entry is dropped and
// reported as a ConfigIssue, never allowed to discard the rest of the file —
// the Project Setup tab renders these issues so the user can see exactly which
// entry is wrong (Stage 2; replaces the Stage 1 all-or-nothing null parse and
// s1/index.ts's private readSidecar()). Unknown top-level fields are preserved
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

/** Parsed sidecar + everything that had to be dropped to parse it. */
export interface SidecarState {
  config: ProjectConfig;
  issues: ConfigIssue[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Lenient parse. `bytes: null` means "no sidecar file" (empty config, no
 * issues). Malformed input degrades entry-by-entry; the returned config is
 * always safe to use and to serialize back.
 */
export function readProjectConfig(bytes: Uint8Array | null): SidecarState {
  if (bytes === null) return { config: {}, issues: [] };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { config: {}, issues: [{ where: '$', message: 'invalid JSON — ignoring the sidecar' }] };
  }
  if (!isPlainObject(json)) {
    return { config: {}, issues: [{ where: '$', message: 'expected a JSON object — ignoring the sidecar' }] };
  }

  const issues: ConfigIssue[] = [];
  const out: Record<string, unknown> = { ...json };

  if ('base' in json && typeof json.base !== 'string') {
    delete out.base;
    issues.push({ where: 'base', message: `expected a string profile id, got ${typeof json.base} — entry ignored` });
  }

  if ('paths' in json) {
    if (!isPlainObject(json.paths)) {
      delete out.paths;
      issues.push({ where: 'paths', message: 'expected an object of key → path — channel ignored' });
    } else {
      const paths: Record<string, string> = {};
      for (const [k, v] of Object.entries(json.paths)) {
        if (typeof v === 'string') paths[k] = v;
        else issues.push({ where: `paths.${k}`, message: `expected a string path, got ${v === null ? 'null' : typeof v} — entry ignored` });
      }
      out.paths = paths;
    }
  }

  if ('assets' in json) {
    if (!isPlainObject(json.assets)) {
      delete out.assets;
      issues.push({ where: 'assets', message: 'expected an object of asset-class → override — channel ignored' });
    } else {
      const assets: Record<string, z.infer<typeof assetOverrideSchema>> = {};
      for (const [k, v] of Object.entries(json.assets)) {
        const res = assetOverrideSchema.safeParse(v);
        if (res.success) assets[k] = res.data;
        else issues.push({ where: `assets.${k}`, message: `invalid override shape — entry ignored` });
      }
      out.assets = assets;
    }
  }

  return { config: out as ProjectConfig, issues };
}

export function serializeProjectConfig(cfg: ProjectConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cfg, null, 2) + '\n');
}
