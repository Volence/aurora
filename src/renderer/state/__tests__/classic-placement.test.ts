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
import { armedPlacementId, PLACEMENT_SUBTYPE } from '../classic-placement';

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

// THE GHOST MUST PREVIEW WHAT THE CLICK WILL ACTUALLY PLACE.
//
// The placement ghost draws through the same `drawObjects` the placed objects
// use, which resolves art by `objectArtKey(id, zone, subtype)`. For a
// subtype-rule object that key selects a DIFFERENT SPRITE PER SUBTYPE — so if
// the ghost's literal subtype and the click handler's literal subtype ever
// drift apart, the preview shows art the click will not produce. A preview that
// lies is worse than no preview, and nothing in the type system notices: both
// are `number`, and the two literals sit ~150 lines apart in one file.
//
// The other half is the arming: a ghost drawn off the raw `armedObjectId` would
// keep hovering after a tool switch, which the guard above already covers for
// every reader — this pins that the viewport is one of them.
describe('the placement ghost and the placement agree', () => {
  const VIEWPORT = join(RENDERER, 'components/classic/ClassicLevelViewport.tsx');

  it('is the subtype the click drops', () => {
    // Named here as well as in the module, so a change to the value is a change
    // to a test rather than a silent change to what a preview means.
    expect(PLACEMENT_SUBTYPE).toBe(0);
  });

  it('the viewport writes the subtype through the shared constant, twice', () => {
    const src = code(VIEWPORT);
    // Once in the ghost's one-object doc, once in the object the click commits.
    const shared = [...src.matchAll(/subtype:\s*PLACEMENT_SUBTYPE\b/g)].length;
    expect(shared, 'the ghost and the placement no longer share a subtype').toBeGreaterThanOrEqual(2);
    // …and neither of them has drifted back to a bare literal.
    expect(src, 'a placement subtype is written as a bare literal again')
      .not.toMatch(/subtype:\s*\d/);
  });

  it('the ghost resolves its art through the loader the Objects list uses', () => {
    // The bug this replaced: the ghost read ONLY the act-wide published map,
    // which holds the keys PRESENT IN THE ACT — so an armed id the level did not
    // already contain fell through to drawObjects' red fallback box, while the
    // very same id drew a sprite in the list beside it. Both sides must reach
    // the same cache, or "resolves in one place, not the other" comes back.
    const viewport = code(VIEWPORT);
    const thumb = code(join(RENDERER, 'components/classic/ObjectThumb.tsx'));
    for (const [name, src] of [['the viewport', viewport], ['the list thumbnail', thumb]] as const) {
      expect(src, `${name} no longer loads object art through loadObjectSprite`)
        .toMatch(/loadObjectSprite\(/);
    }
    // And the ghost draw must be able to SEE the warmed sprite — a load whose
    // result never reaches drawObjects is the bug with extra steps.
    expect(viewport, 'the warmed ghost sprite is not handed to drawObjects')
      .toMatch(/drawObjects\([^)]*ghostSprites/);
  });
});
