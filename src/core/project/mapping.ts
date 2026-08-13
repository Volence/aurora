// The per-project mapping layer (spec §7): `.aurora/project.json` carries the
// nearest-base profile id plus per-asset-class overrides (path / format /
// compression) for hacks that diverge from stock. Loose at the top level so
// configs written by newer Auroras survive a round-trip through older ones;
// strict inside each asset override so typos fail loudly at parse time.
//
// NOTE: s1/index.ts's readSidecar() currently hand-parses the same physical
// file (.aurora/project.json) into ProjectOverrides with a
// tolerate-and-filter error posture. The two parsers are siblings destined
// to merge when the Project Setup surface lands (spec §7 / Stage 2), which
// will also revisit this schema's all-or-nothing failure mode in favor of
// per-entry diagnostics. Until then, mapping.ts is NOT wired into project
// opening — readSidecar remains authoritative for the paths channel.

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

/** null on malformed input — the caller falls back to the untouched base profile. */
export function parseProjectConfig(bytes: Uint8Array): ProjectConfig | null {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const res = projectConfigSchema.safeParse(json);
  return res.success ? res.data : null;
}

export function serializeProjectConfig(cfg: ProjectConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cfg, null, 2) + '\n');
}
