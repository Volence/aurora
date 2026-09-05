// Contract test over both profiles' declared art tier ladders (spec §3.3 as
// amended by §3.0.2).
//
// The plan's draft read the ladders straight off the adapter modules
// (`s1Adapter.artTiers`). The real adapters build their CapabilityManifest
// INSIDE open() — `ProjectAdapter` is only { type, detect, open } — so there is
// no module-level ladder to read, and inventing one purely to satisfy the draft
// would add a second source of truth. Instead these open a minimal in-memory
// fixture per adapter and read `handle.capabilities.artTiers`, in the same
// style as s1-adapter.test.ts / aeon-adapter.test.ts.

import { describe, it, expect, beforeAll } from 'vitest';
import type { ArtTier, FileAccess } from '../adapter';
import { s1Adapter, enumerateProfileEntries } from '../s1/index';
import { aeonAdapter } from '../aeon/index';
import { s1Profile } from '../profiles/s1';

// ---------------------------------------------------------------------------
// In-memory FileAccess fake (same pattern as s1-adapter.test.ts).
// ---------------------------------------------------------------------------

function memFs(files: Record<string, string>): FileAccess {
  const map = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(files)) map.set(k, new TextEncoder().encode(v));
  return {
    async exists(rel) {
      return map.has(rel);
    },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list(relDir) {
      const prefix = relDir === '' || relDir === '.' ? '' : relDir.replace(/\/?$/, '/');
      const names = new Set<string>();
      for (const key of map.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },
    rootDir: '/proj',
  };
}

/** A stock s1 tree built from the profile itself, so it can never drift. */
function s1Tree(): Record<string, string> {
  const files: Record<string, string> = { 'sonic.asm': 'x' };
  for (const e of enumerateProfileEntries(s1Profile)) files[e.variant.path] = `data:${e.key}`;
  return files;
}

/** The smallest aeon project the loader accepts: engine + name + zero zones. */
function aeonTree(): Record<string, string> {
  return {
    'project.json': JSON.stringify({ name: 'Tier Fixture', engine: 's4', zones: [] }),
  };
}

let s1Tiers: readonly ArtTier[];
let aeonTiers: readonly ArtTier[];

beforeAll(async () => {
  const s1Handle = await s1Adapter.open(memFs(s1Tree()));
  const aeonHandle = await aeonAdapter.open(memFs(aeonTree()));
  s1Tiers = s1Handle.capabilities.artTiers!;
  aeonTiers = aeonHandle.capabilities.artTiers!;
});

describe('classic art tier ladder', () => {
  it('descends chunk -> block -> tile', () => {
    expect(s1Tiers.map((t) => t.id)).toEqual(['chunk', 'block', 'tile']);
  });

  it('is 256 / 16 / 8 pixels', () => {
    expect(s1Tiers.map((t) => t.pixelSize)).toEqual([256, 16, 8]);
  });

  it('is shared at every tier: layout cells hold ids, so edits propagate', () => {
    expect(s1Tiers.every((t) => t.shared)).toBe(true);
  });
});

describe('aeon art tier ladder', () => {
  it('has NO 16px middle tier (spec §2.1)', () => {
    expect(aeonTiers.map((t) => t.id)).toEqual(['chunk', 'tile']);
    expect(aeonTiers.some((t) => t.pixelSize === 16)).toBe(false);
  });

  it('has a variable-size chunk tier', () => {
    expect(aeonTiers.find((t) => t.id === 'chunk')!.pixelSize).toBeNull();
  });

  it('marks the chunk tier unshared: stamping flattens a copy (spec §3.0.2)', () => {
    expect(aeonTiers.find((t) => t.id === 'chunk')!.shared).toBe(false);
  });

  it('marks the tile tier shared: the tileset is referenced by index', () => {
    expect(aeonTiers.find((t) => t.id === 'tile')!.shared).toBe(true);
  });
});

describe('ladder invariants hold for every profile', () => {
  for (const [name, get] of [
    ['s1', () => s1Tiers],
    ['aeon', () => aeonTiers],
  ] as const) {
    it(`${name}: ids are unique and non-empty`, () => {
      const tiers = get();
      expect(new Set(tiers.map((t) => t.id)).size).toBe(tiers.length);
      expect(tiers.every((t) => t.id.length > 0 && t.label.length > 0)).toBe(true);
    });

    it(`${name}: the innermost tier is the 8px tile`, () => {
      const tiers = get();
      const last = tiers[tiers.length - 1]!;
      expect(last.id).toBe('tile');
      expect(last.pixelSize).toBe(8);
    });

    it(`${name}: fixed pixel sizes descend outermost-first`, () => {
      const sizes = get()
        .map((t) => t.pixelSize)
        .filter((s): s is number => s !== null);
      expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    });
  }
});
