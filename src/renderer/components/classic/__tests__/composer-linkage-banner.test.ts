// Task 10 — the linkage banner is reframed as a mechanism, not a hazard.
//
// Per docs/superpowers/plans/2026-08-15-art-authoring-phase1-paint-through.md,
// "A8 resolved": the shared-art reference ladder (edit one tile/block/chunk,
// every placement updates) is the headline FEATURE of a tileset-based pixel
// editor, so `SharedBanner` drops its `⚠` glyph and amber hazard tint for a
// neutral status strip, and its copy moves to linked/unique vocabulary
// (never shared/forked). No new command, no prop-shape change — copy and
// styling only.
//
// The renderer suite is node-only (vitest.config.ts has no jsdom/DOM
// environment — see composer-shared.tsx's own note that "this file is .tsx,
// which vitest does not collect") so, same as every other classic-composer
// guard test, this reads the SOURCE, comments stripped, rather than mounting
// anything.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const strip = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SHARED = strip(read('composer-shared.tsx'));
const TILE_TAB = strip(read('TileTab.tsx'));
const BLOCK_TAB = strip(read('BlockTab.tsx'));
const CHUNK_TAB = strip(read('ChunkTab.tsx'));

describe('SharedBanner styling: neutral, not a warning', () => {
  it('draws no ⚠ glyph', () => {
    expect(SHARED, 'SharedBanner still prefixes its text with the warning glyph').not.toMatch(/⚠/);
  });

  it('renders exactly the text it is given, un-decorated', () => {
    expect(SHARED).toMatch(/<span style=\{\{ flex: 1 \}\}>\{text\}<\/span>/);
  });

  // Scoped to the `banner:` style declaration alone — `SOLIDITY`'s "LRB" tint
  // legitimately reuses the identical rgba(255,170,60,…) amber for the chunk
  // solidity overlay (an unrelated purpose), so a whole-file search for that
  // literal would false-positive on it.
  const bannerBlockMatch = /banner:\s*\{([\s\S]*?)\n\s*\},/.exec(SHARED);

  it('has a styles.banner declaration to scope the remaining checks to', () => {
    expect(bannerBlockMatch, 'styles.banner declaration not found').not.toBeNull();
  });

  it('styles.banner carries no amber hazard tint', () => {
    expect(bannerBlockMatch![1], 'amber hazard color still present in styles.banner').not.toMatch(/255,\s*170,\s*60/);
  });

  it('styles.banner uses the same neutral chrome tokens as the rest of the composer', () => {
    expect(bannerBlockMatch![1]).toMatch(/background:\s*T\.overlay/);
    expect(bannerBlockMatch![1]).toMatch(/borderColor:\s*T\.border/);
  });
});

describe('the locked-tile banner is untouched: a genuine refusal keeps its hazard styling', () => {
  it('is not a SharedBanner call', () => {
    // It must remain the separate inline <div> that spreads styles.banner and
    // then overrides color back to red — restyling SharedBanner's DEFAULT must
    // not have been able to touch it, and it did not go through the shared
    // component at all.
    const lockedBlock = /\{locked && \(([\s\S]*?)\)\}/.exec(TILE_TAB);
    expect(lockedBlock, 'the locked-tile conditional block is gone. Where did it move?').not.toBeNull();
    expect(lockedBlock![1], 'the locked banner now renders through SharedBanner').not.toMatch(/<SharedBanner/);
    expect(lockedBlock![1], 'the locked banner lost its lock glyph').toMatch(/🔒/);
  });

  it('still overrides styles.banner to a red/hazard tint', () => {
    expect(TILE_TAB, 'the locked banner no longer overrides to a hazard red')
      .toMatch(/\.\.\.styles\.banner,\s*background:\s*'rgba\(255,\s*70,\s*70,[^']*'/);
  });
});

describe('linkage copy: linked/unique vocabulary, real usage numbers, no shared/forked/"Make unique"', () => {
  for (const [name, src] of [['TileTab', TILE_TAB], ['BlockTab', BLOCK_TAB], ['ChunkTab', CHUNK_TAB]] as const) {
    it(`${name} never says "shared" or "forked" in its banner copy`, () => {
      const call = /<SharedBanner[\s\S]*?\/>/.exec(src) ?? /<SharedBanner[\s\S]*?<\/SharedBanner>/.exec(src);
      expect(call, `${name} has no <SharedBanner> call at all`).not.toBeNull();
      expect(call![0], `${name}'s banner text uses "shared": spec says linked/unique only`).not.toMatch(/\bshared\b/i);
      expect(call![0], `${name}'s banner text uses "forked": spec says linked/unique only`).not.toMatch(/\bforked\b/i);
    });

    it(`${name} says "Linked" and states the mechanism, not a warning`, () => {
      const call = /<SharedBanner[\s\S]*?text=\{`([^`]*)`\}/.exec(src);
      expect(call, `${name}'s banner text is not a template literal: cannot check its content`).not.toBeNull();
      expect(call![1], `${name}'s banner does not open with "Linked:"`).toMatch(/^Linked: /);
      expect(call![1], `${name}'s banner does not say edits propagate`).toMatch(/Edits appear in/);
    });
  }

  it('TileTab interpolates the real containers/cells counts (not hardcoded numbers)', () => {
    const call = /<SharedBanner[\s\S]*?text=\{`([^`]*)`\}/.exec(TILE_TAB);
    expect(call).not.toBeNull();
    expect(call![1], 'TileTab banner does not read tileUse.containers').toMatch(/\$\{tileUse\.containers\}/);
    expect(call![1], 'TileTab banner does not read tileUse.cells').toMatch(/\$\{tileUse\.cells\}/);
    // No bare digit run outside the pluralization ternaries — a hardcoded
    // headline count (e.g. the plan sketch's illustrative "14"/"31") would
    // show up as a literal number OUTSIDE a `? '' : 's'`-style ternary.
    const withoutPluralTernaries = call![1].replace(/=== 1 \? '' : 's'/g, '');
    expect(withoutPluralTernaries, 'TileTab banner has a literal digit: numbers must come from tileUse')
      .not.toMatch(/[0-9]/);
  });

  it('TileTab passes no onDuplicate: this banner has no button', () => {
    const call = /<SharedBanner[\s\S]*?\/>/.exec(TILE_TAB);
    expect(call).not.toBeNull();
    expect(call![0], 'TileTab banner grew an onDuplicate: spec says no button here').not.toMatch(/onDuplicate/);
  });

  it('BlockTab interpolates the real containers/cells counts and keeps "Duplicate block"', () => {
    const call = /<SharedBanner[\s\S]*?\/>/.exec(BLOCK_TAB);
    expect(call).not.toBeNull();
    expect(call![0], 'BlockTab banner does not read blockUse.containers').toMatch(/\$\{blockUse\.containers\}/);
    expect(call![0], 'BlockTab banner does not read blockUse.cells').toMatch(/\$\{blockUse\.cells\}/);
    expect(call![0], 'BlockTab dropped its Duplicate button').toMatch(/onDuplicate=\{duplicateBlock\}/);
    expect(call![0], 'BlockTab renamed its Duplicate button label').toMatch(/dupLabel="Duplicate block"/);
  });

  it('ChunkTab interpolates the real placement count and keeps "Duplicate chunk"', () => {
    const call = /<SharedBanner[\s\S]*?\/>/.exec(CHUNK_TAB);
    expect(call).not.toBeNull();
    expect(call![0], 'ChunkTab banner does not read placements').toMatch(/\$\{placements\}/);
    expect(call![0], 'ChunkTab dropped its Duplicate button').toMatch(/onDuplicate=\{duplicateChunk\}/);
    expect(call![0], 'ChunkTab renamed its Duplicate button label').toMatch(/dupLabel="Duplicate chunk"/);
  });

  it('no tab wires a "Make unique" command: A8 explicitly descoped it', () => {
    for (const [name, src] of [['TileTab', TILE_TAB], ['BlockTab', BLOCK_TAB], ['ChunkTab', CHUNK_TAB]] as const) {
      expect(src, `${name} references planMakeUnique: A8 descoped this`).not.toMatch(/planMakeUnique/i);
      expect(src, `${name} has a "Make unique" control: A8 descoped this`).not.toMatch(/make unique/i);
    }
  });
});

// The discovery breadcrumb (Task 11). Both composed tiers that CANNOT isolate a
// single placement must say where one can: a tile surface and a bare block
// surface both have no chunk cell to repoint, so Isolate has nothing to isolate
// there. TileTab's is the load-bearing one — it is where a user first meets
// linkage — and it was missed on the first pass, so it is pinned here.
describe('the breadcrumb out of the linkage deadlock', () => {
  const BREADCRUMB = /To change one place only, paint it on the Chunk tab \(Isolate\)\./;

  it('TileTab points at the Chunk tab', () => {
    expect(TILE_TAB, 'TileTab has no discovery breadcrumb').toMatch(BREADCRUMB);
  });

  it('BlockTab points at the Chunk tab', () => {
    expect(BLOCK_TAB, 'BlockTab has no discovery breadcrumb').toMatch(BREADCRUMB);
  });

  it('ChunkTab does NOT, since it is where isolating already works', () => {
    expect(CHUNK_TAB, 'ChunkTab tells the user to go to the tab they are on').not.toMatch(BREADCRUMB);
  });
});
