// The armed-placement derivation, plus a source guard on its call sites.
//
// WHY THE GUARD: dropping ClassicTool split classic's dual-purpose `object`
// tool into `select` and `place-object`, which turned `armedObjectId` from a
// MODE into a PAYLOAD. A payload goes stale — switching tools does not clear
// it — so reading the raw id is a live bug: a click under the stamp tool would
// see an armed id and place an object the user did not ask for.
//
// The type system cannot see this. `armedObjectId` is still a perfectly good
// `number | null` at every call site; only the MEANING changed. So the guard is
// source-level, in the style of components/classic/__tests__/classic-surface.ts:
// anything that names the raw field must also go through the derivation.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { armedPlacementId } from '../classic-placement';

describe('armedPlacementId', () => {
  it('is the armed id only under the place-object tool', () => {
    expect(armedPlacementId('place-object', 0x25)).toBe(0x25);
  });

  it('is null under every other tool, however armed the store is', () => {
    for (const t of ['view', 'select', 'stamp-chunk', 'marquee', 'paint-tile'] as const) {
      expect(armedPlacementId(t, 0x25)).toBeNull();
    }
  });

  it('is null when nothing is armed, including under place-object', () => {
    expect(armedPlacementId('place-object', null)).toBeNull();
    expect(armedPlacementId('select', null)).toBeNull();
  });

  it('treats object id 0 as armed, not as absent', () => {
    // S1 object $00 is a real id; a truthiness check here would silently make it
    // unplaceable. Only null means "nothing armed".
    expect(armedPlacementId('place-object', 0)).toBe(0);
  });
});

/** `src/renderer` — scanned whole, deliberately. The status doc records that the
 *  classic-surface guard was escaped twice by a scan root too narrow to follow a
 *  call site that moved; this one starts wide. */
const RENDERER = join(__dirname, '..', '..');

/** Source with comments stripped, so the guard reads CODE, not prose — this
 *  file's own explanations name `armedObjectId` repeatedly, and every docblock
 *  that mentions the hazard would otherwise register as a call site. */
function code(abs: string): string {
  return readFileSync(abs, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(RENDERER, rel);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(child);
    }
  };
  walk('');
  return out;
}

/** Where the raw field legitimately appears without the derivation: the store
 *  that DECLARES it, and the module that DOES the deriving. */
const RAW_FIELD_OWNERS = new Set([
  'state/classicLevelStore.ts',
  'state/classic-placement.ts',
]);

describe('no call site reads the armed id raw', () => {
  it('every reader of armedObjectId derives through armedPlacementId', () => {
    const offenders = sourceFiles().filter((f) => {
      if (RAW_FIELD_OWNERS.has(f)) return false;
      const src = code(join(RENDERER, f));
      return src.includes('armedObjectId') && !src.includes('armedPlacementId');
    });
    // A new reader must derive, or a tool switch will leave it armed while the
    // map has already moved on.
    expect(offenders).toEqual([]);
  });

  it('the owners are real files, so this guard cannot pass by vacuity', () => {
    for (const owner of RAW_FIELD_OWNERS) {
      expect(existsSync(join(RENDERER, owner))).toBe(true);
      expect(code(join(RENDERER, owner))).toContain('armedObjectId');
    }
    // And the scan actually reaches the components that read it.
    const scanned = sourceFiles();
    expect(scanned).toContain('components/classic/ClassicLevelViewport.tsx');
    expect(scanned).toContain('providers/object-list-classic.ts');
    expect(scanned).toContain('providers/object-inspector-classic.ts');
  });
});
