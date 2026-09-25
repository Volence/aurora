/**
 * THE DONOR-TREE READER, on the OWNED fixture (test/fixtures/donors/, generated
 * by scripts/gen-donor-fixture.mjs; provenance in FXZ/zone.provenance.json).
 *
 * Every expected figure is read from the fixture's own zone.json, which the
 * generator computed from the bytes it wrote the way aeon's converter computes
 * its own (painted = tile index != 0, solid = a plane's solidity bits != 0). So
 * a row here says "the reader agrees with the tree about the tree", never "the
 * reader agrees with a number typed into this file".
 */
import { describe, it, expect } from 'vitest';
import {
  cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  CONVERTER_COMMAND, DONOR_ROOT_REL, DonorTreeError, listDonors, loadDonorZone, parseZoneManifest,
  rectCensus, TILE_PX,
} from '../../src/core/formats/donors/donor-tree';

const FIXTURE_ROOT = resolve(__dirname, '../fixtures/donors/aeon-root');
const FXZ_DIR = join(FIXTURE_ROOT, DONOR_ROOT_REL, 's2disasm/FXZ');
const SIDECAR = resolve(__dirname, '../fixtures/donors/aeon-root/games/sonic4/data/donors/s2disasm/FXZ/zone.provenance.json');

/** A FileAccess over a real directory, answering the contract's three ways. */
function diskFa(root: string): FileAccess {
  return {
    rootDir: root,
    async exists(rel) { return existsSync(join(root, rel)); },
    async read(rel) { return new Uint8Array(readFileSync(join(root, rel))); },
    async list(rel) {
      const p = join(root, rel);
      if (!existsSync(p)) return [];
      return readdirSync(p);
    },
  };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'aurora-donor-tree-'));
}

describe('donors/ has three states, and the page is told which', () => {
  it('ABSENT: no donors/ directory at all (the normal state of a fresh aeon checkout)', async () => {
    const root = scratch();
    try {
      const l = await listDonors(diskFa(root));
      expect(l.state).toBe('absent');
      expect(l.root).toBe(DONOR_ROOT_REL);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('EMPTY: donors/ exists and nothing under it is a converted zone', async () => {
    const root = scratch();
    try {
      mkdirSync(join(root, DONOR_ROOT_REL), { recursive: true });
      const bare = await listDonors(diskFa(root));
      expect(bare.state).toBe('empty');
      // A donor directory with a zone directory but no zone.json is still EMPTY,
      // and the listing names what it found rather than drawing it as nothing.
      mkdirSync(join(root, DONOR_ROOT_REL, 's2disasm/EHZ'), { recursive: true });
      const half = await listDonors(diskFa(root));
      expect(half.state).toBe('empty');
      expect(half.state === 'empty' && half.strays).toEqual(['s2disasm/EHZ', 's2disasm']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('PRESENT: the fixture lists its one donor and zone', async () => {
    const l = await listDonors(diskFa(FIXTURE_ROOT));
    expect(l).toEqual({ state: 'present', root: DONOR_ROOT_REL, donors: [{ donor: 's2disasm', zones: ['FXZ'] }] });
  });

  it('the converter command the empty state names is the published one, run in aeon', () => {
    // The settled packet's exact line; a page that named a different command
    // would send the author to a spelling aeon's parser refuses.
    expect(CONVERTER_COMMAND).toBe('python3 tools/s2_zone_convert.py convert --all-six');
  });
});

describe('zone.json: the page reads named keys and refuses by name', () => {
  const text = readFileSync(join(FXZ_DIR, 'zone.json'), 'utf8');

  it('parses the fixture, crop in cells and in world pixels', () => {
    const m = parseZoneManifest(text);
    const raw = JSON.parse(text);
    expect(m.gridW).toBe(raw.grid.w);
    expect(m.gridH).toBe(raw.grid.h);
    expect(m.sectionTiles).toBe(raw.grid.section_px / TILE_PX);
    expect(m.cropTiles).toEqual(raw.extent.crop_tiles);
    const [x0, x1, y0, y1] = raw.extent.crop_tiles;
    expect(m.cropPx).toEqual({ x: x0 * 8, y: y0 * 8, w: (x1 - x0) * 8, h: (y1 - y0) * 8 });
  });

  it('a missing key is refused NAMING the key', () => {
    const raw = JSON.parse(text);
    delete raw.extent.crop_tiles;
    expect(() => parseZoneManifest(JSON.stringify(raw))).toThrow(/extent\.crop_tiles/);
  });

  it('a crop running past the padded grid is refused (R9 would have no bytes under it)', () => {
    const raw = JSON.parse(text);
    raw.extent.crop_tiles = [0, raw.grid.w * 256 + 8, 0, 16];
    expect(() => parseZoneManifest(JSON.stringify(raw))).toThrow(DonorTreeError);
  });
});

describe('loading a zone: every section stitched row-major, both planes', () => {
  it('each section\'s census equals the figures zone.json records for THAT section', async () => {
    // The discriminating row for the stitch. The fixture is 2x2 with a crop that
    // cuts sections 1 and 2 very differently (section 1 holds 44 crop columns,
    // section 2 holds 256), so a reader that stitched column-major would hand
    // section 1 section 2's content and miss both of these counts.
    const z = await loadDonorZone(diskFa(FIXTURE_ROOT), 's2disasm', 'FXZ');
    expect(z.manifest.sections.length).toBe(z.manifest.gridW * z.manifest.gridH);
    const px = z.manifest.sectionPx;
    for (const s of z.manifest.sections) {
      const c = rectCensus(z, { x: s.sx * px, y: s.sy * px, w: px, h: px });
      expect(c.painted, `section ${s.n} painted`).toBe(s.paintedCells);
      expect(c.solidA + c.solidB, `section ${s.n} solid, both planes`).toBe(s.collisionCellsSolid);
    }
    // Anti-vacuous: the sections do not all agree, so the loop above could fail.
    const painted = new Set(z.manifest.sections.map((s) => s.paintedCells));
    expect(painted.size).toBeGreaterThan(1);
  });

  it('the two planes are loaded as two planes (plane B is not plane A again)', async () => {
    const z = await loadDonorZone(diskFa(FIXTURE_ROOT), 's2disasm', 'FXZ');
    const whole = rectCensus(z, { x: 0, y: 0, w: z.cols * 8, h: z.rows * 8 });
    expect(whole.solidA).toBeGreaterThan(0);
    expect(whole.solidB).toBeGreaterThan(0);
    expect(whole.solidA).not.toBe(whole.solidB);
  });

  it('the tileset and palette are the sizes zone.json declares', async () => {
    const z = await loadDonorZone(diskFa(FIXTURE_ROOT), 's2disasm', 'FXZ');
    expect(z.tiles.length).toBe(z.manifest.tilesetTiles);
    expect(z.palette.length).toBe(z.manifest.paletteBytes);
  });

  it('a section file of the wrong length is REFUSED, not zero-filled', async () => {
    const root = scratch();
    try {
      cpSync(FIXTURE_ROOT, root, { recursive: true });
      truncateSync(join(root, DONOR_ROOT_REL, 's2disasm/FXZ/section_3.tiles.bin'), 1000);
      await expect(loadDonorZone(diskFa(root), 's2disasm', 'FXZ')).rejects.toThrow(/section_3\.tiles\.bin: 1000 bytes/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a tree without its collision planes is refused as stale, naming the converter', async () => {
    const root = scratch();
    try {
      cpSync(FIXTURE_ROOT, root, { recursive: true });
      rmSync(join(root, DONOR_ROOT_REL, 's2disasm/FXZ/section_0.collattrb.bin'));
      await expect(loadDonorZone(diskFa(root), 's2disasm', 'FXZ')).rejects.toThrow(/collattrb\.bin.*re-run the converter/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a zone.json naming another zone than its directory is refused', async () => {
    const root = scratch();
    try {
      cpSync(FIXTURE_ROOT, root, { recursive: true });
      const p = join(root, DONOR_ROOT_REL, 's2disasm/FXZ/zone.json');
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      raw.zone = 'EHZ';
      writeFileSync(p, JSON.stringify(raw));
      await expect(loadDonorZone(diskFa(root), 's2disasm', 'FXZ')).rejects.toThrow(/names s2disasm\/EHZ but sits under s2disasm\/FXZ/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('the owned fixture is SHAPED like a real converter run', () => {
  it('its zone.json carries exactly the key paths the real converter wrote', () => {
    const side = JSON.parse(readFileSync(SIDECAR, 'utf8')) as { real_key_paths: string[] };
    const z = JSON.parse(readFileSync(join(FXZ_DIR, 'zone.json'), 'utf8'));
    const out = new Set<string>();
    const walk = (v: unknown, p: string): void => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k of Object.keys(v as object)) walk((v as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
        return;
      }
      if (Array.isArray(v) && v.length > 0 && v.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
        for (const e of v) walk(e, `${p}[]`);
        return;
      }
      out.add(p);
    };
    walk(z, '');
    // Anti-vacuous: a real zone.json has dozens of paths.
    expect(side.real_key_paths.length).toBeGreaterThan(40);
    expect([...out].sort()).toEqual([...side.real_key_paths].sort());
  });
});
