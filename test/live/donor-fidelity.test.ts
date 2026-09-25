// THE DONOR PAGE AGAINST REAL CONVERTED TREES AND AEON'S REAL TOOLS.
//
// ==========================================================================
//  RUN IT WITH:
//
//      AURORA_DONOR_FIDELITY=1 npx vitest run test/live/donor-fidelity.test.ts
//
//  OPT-IN, and it SKIPS SAYING SO otherwise. It materialises aeon's
//  origin/master with `git archive` into a RUN-UNIQUE scratch directory (never
//  aeon's live working tree: that is another lane's checkout, edited while this
//  runs), runs aeon's converter THERE, and deletes the directory afterwards. It
//  needs python3 with numpy and the two donor disassemblies beside aeon.
// ==========================================================================
//
// WHY IT EXISTS (docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md,
// "three legs"). The behaviour rows run on an OWNED fixture because no real
// donor tree exists at any revision (they are derived and gitignored). That
// leaves one claim nothing hermetic can hold: that Aurora reads a REAL tree the
// way aeon wrote it, and that what Aurora writes on a paste is what aeon's own
// loader accepts and aeon's own bake composes. This rig carries that claim. It
// generates the tree or it skips naming the command; it never reads a path and
// hopes.
//
// WHAT IT HOLDS, each against aeon's own record rather than Aurora's arithmetic:
//   F1  every converted zone loads through Aurora's reader, and every section's
//       painted cells, solid collision cells and file sha256s equal what the
//       converter wrote into that zone's own zone.json;
//   F2  a manifest built by Aurora's writer from a marquee is ACCEPTED by
//       aeon's loader, and one whose shift breaks R12 is REFUSED naming R12;
//   F3  aeon's bake of that manifest puts the donor's source cells (words AND
//       both collision planes) at the destination, byte for byte, reading the
//       baked section files back from disk;
//   F4  aeon's own s2_two_clip_pins, rewritten by Aurora's writer, is still
//       accepted: the writer drops nothing aeon needs.
//   F5  (row 213) aeon's REAL bake of its committed clip acts, through Aurora's
//       channel: Aurora's pool-row reader takes every row, and the rows keep
//       aeon's stated invariants (sum(tiles_added) + 1 == pool.tiles,
//       sum(pages_exclusive) <= pool.pages, each row's added <= tiles and own
//       <= touched), and the file's per_clip_fields is the one the vendored
//       unit fixture carries;
//   F6  (row 213) a REAL `validate --json` refusal, through Aurora's argv,
//       parses to the rule and the clip the mutation touched, and a manifest
//       that is not JSON comes back as a CRASH (exit 1, no JSON), never a
//       refusal.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileAccess } from '../../src/core/project/adapter';
import { listDonors, loadDonorZone, rectCensus, type DonorZone } from '../../src/core/formats/donors/donor-tree';
import { marqueeRect } from '../../src/core/formats/donors/donor-marquee';
import {
  newClipManifest, parseClipManifest, serializeClipManifest, suggestDestination, withClip, gridToHold,
} from '../../src/core/formats/donors/clip-manifest-doc';
import { makeSpawnRunner, runClipTool as runTool, type Runner } from '../../src/main/clip-tool';
import { readValidateJson } from '../../src/core/formats/donors/clip-validate-json';
import { readPoolRows } from '../../src/core/formats/donors/clipact-pool';
import { parseNametable } from '../../src/core/formats/s4-nametable';
import { parseCollAttr } from '../../src/core/formats/s4-collattr';
import { peerRepo, resolveRev } from '../support/peer-repo';
import { siblingRoot, SUITE_ROOT_ENV } from '../support/sibling-root.mjs';

const OPT_IN = process.env.AURORA_DONOR_FIDELITY === '1';
const COMMAND = 'python3 tools/s2_zone_convert.py convert --all-six';

function diskFa(root: string): FileAccess {
  return {
    rootDir: root,
    async exists(rel) { return existsSync(join(root, rel)); },
    async read(rel) { return new Uint8Array(readFileSync(join(root, rel))); },
    async list(rel) { const p = join(root, rel); return existsSync(p) ? readdirSync(p) : []; },
  };
}

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

interface Setup { copy: string; rev: string; zones: DonorZone[]; convertLog: string; runner: Runner }
let setup: Setup | null = null;
let unmeasurable: string | null = null;

beforeAll(async () => {
  if (!OPT_IN) return;
  const aeon = peerRepo('aeon');
  if (aeon === null) { unmeasurable = 'no aeon checkout beside this repo (set AEON_DIR)'; return; }
  const rev = resolveRev(aeon, 'origin/master');
  if (rev === null) { unmeasurable = `origin/master does not resolve in ${aeon}`; return; }
  const suite = siblingRoot();
  if (suite === null) { unmeasurable = `no suite root (${SUITE_ROOT_ENV}) to hand the converter`; return; }
  const copy = mkdtempSync(join(tmpdir(), `aurora-donor-fidelity-${process.pid}-`));
  const tar = join(copy, '..', `${copy.split('/').pop()}.tar`);
  const arch = spawnSync('git', ['-C', aeon, 'archive', '--format=tar', '-o', tar, rev], { encoding: 'utf8' });
  if (arch.status !== 0) { unmeasurable = `git archive ${rev} failed: ${arch.stderr}`; rmSync(copy, { recursive: true, force: true }); return; }
  const untar = spawnSync('tar', ['-xf', tar, '-C', copy], { encoding: 'utf8' });
  rmSync(tar, { force: true });
  if (untar.status !== 0) { unmeasurable = `tar failed: ${untar.stderr}`; rmSync(copy, { recursive: true, force: true }); return; }
  const conv = spawnSync('python3', ['tools/s2_zone_convert.py', 'convert', '--all-six'], {
    cwd: copy, encoding: 'utf8', env: { ...process.env, [SUITE_ROOT_ENV]: suite }, maxBuffer: 64 * 1024 * 1024,
  });
  const convertLog = `${conv.stdout}\n${conv.stderr}`;
  if (conv.status !== 0) {
    unmeasurable = `the converter exited ${conv.status} in ${copy} (${COMMAND}): ${convertLog.slice(-600)}`;
    rmSync(copy, { recursive: true, force: true });
    return;
  }
  const fa = diskFa(copy);
  const listing = await listDonors(fa);
  const zones: DonorZone[] = [];
  if (listing.state === 'present') {
    for (const d of listing.donors) for (const z of d.zones) zones.push(await loadDonorZone(fa, d.donor, z));
  }
  setup = { copy, rev, zones, convertLog, runner: makeSpawnRunner({ ...process.env, [SUITE_ROOT_ENV]: suite }) };
  process.stdout.write(`donor-fidelity: aeon origin/master ${rev}, materialised at ${copy}, `
    + `${zones.length} zone(s): ${zones.map((z) => `${z.manifest.donor}/${z.manifest.zone}`).join(' ')}\n`);
}, 300_000);

afterAll(() => {
  if (setup) rmSync(setup.copy, { recursive: true, force: true });
});

function need(ctx: { skip: (note?: string) => void }): Setup | null {
  if (!OPT_IN) {
    ctx.skip(`SKIPPED, NOT PASSED: opt-in. AURORA_DONOR_FIDELITY=1 materialises aeon origin/master in a scratch `
      + `directory and runs \`${COMMAND}\` there; nothing measured the page against a real donor tree in this run`);
    return null;
  }
  if (!setup) {
    ctx.skip(`SKIPPED, NOT PASSED: CANNOT MEASURE: ${unmeasurable ?? 'setup did not run'}`);
    return null;
  }
  return setup;
}

describe('F1: Aurora reads a real converted tree the way aeon wrote it', () => {
  it('the owner\'s six zones convert and every section agrees with its own zone.json', (ctx) => {
    const s = need(ctx);
    if (!s) return;
    expect(s.zones.map((z) => `${z.manifest.donor}/${z.manifest.zone}`).sort()).toEqual([
      's2-simonwai-disasm/HPZ', 's2disasm/CPZ', 's2disasm/EHZ', 's2disasm/MTZ', 's2disasm/OOZ', 's2disasm/WFZ',
    ]);
    const bad: string[] = [];
    let sections = 0;
    for (const z of s.zones) {
      const px = z.manifest.sectionPx;
      const st = z.manifest.sectionTiles;
      for (const sec of z.manifest.sections) {
        sections++;
        const c = rectCensus(z, { x: sec.sx * px, y: sec.sy * px, w: px, h: px });
        const tag = `${z.manifest.donor}/${z.manifest.zone} section ${sec.n}`;
        if (c.painted !== sec.paintedCells) bad.push(`${tag}: painted ${c.painted} vs zone.json ${sec.paintedCells}`);
        if (c.solidA + c.solidB !== sec.collisionCellsSolid) bad.push(`${tag}: solid ${c.solidA + c.solidB} vs ${sec.collisionCellsSolid}`);
        // The bytes Aurora read, hashed, against the converter's own record.
        for (const [suffix, want] of [['tiles', sec.sha256], ['collattr', sec.collattrSha256], ['collattrb', sec.collattrbSha256]] as const) {
          const b = readFileSync(join(s.copy, z.dir, `section_${sec.n}.${suffix}.bin`));
          if (sha(b) !== want) bad.push(`${tag}: ${suffix} sha differs`);
        }
        // And the stitch: Aurora's grid holds exactly those bytes at that section.
        const t = parseNametable(readFileSync(join(s.copy, z.dir, `section_${sec.n}.tiles.bin`)), st, st);
        for (const r of [0, st >> 1, st - 1]) {
          for (let cc = 0; cc < st; cc++) {
            if (z.words[(sec.sy * st + r) * z.cols + sec.sx * st + cc] !== t[r * st + cc]) { bad.push(`${tag}: stitch r${r}`); break; }
          }
        }
      }
    }
    expect(sections).toBeGreaterThan(30);
    expect(bad.slice(0, 10), `${bad.length} disagreement(s)`).toEqual([]);
  });
});

describe('F2..F4: what Aurora writes is what aeon accepts and composes', () => {
  function ehz(s: Setup): DonorZone {
    const z = s.zones.find((q) => q.manifest.donor === 's2disasm' && q.manifest.zone === 'EHZ');
    if (!z) throw new Error('EHZ did not convert');
    return z;
  }

  it('F2: a marquee pasted by Aurora\'s writer is ACCEPTED; a shift off the 16-px quantum is REFUSED as R12', async (ctx) => {
    const s = need(ctx);
    if (!s) return;
    const z = ehz(s);
    // A drag from inside the crop, as a person would make one.
    const src = marqueeRect({ x: 2051, y: 131 }, { x: 3070, y: 900 }, z.manifest.cropPx)!;
    expect(src.x % 16).toBe(0);
    const hold = gridToHold({ x: 0, y: 0, w: src.w, h: src.h });
    const base = newClipManifest('fid_act', hold.gridW, hold.gridH);
    const dst = suggestDestination(base, hold.gridW, hold.gridH, src)!;
    const good = withClip(base, { id: 'ehz_1', donor: 's2disasm', zone: 'EHZ', src, dst: { ...dst, w: src.w, h: src.h } });
    const ok = await runTool(s.copy, 'validate', serializeClipManifest(good), s.runner);
    expect(ok.ok, `${ok.stdout}\n${ok.stderr}\n${ok.couldNotRun ?? ''}`).toBe(true);
    expect(readValidateJson(ok.exitCode, ok.stdout, ok.stderr).kind).toBe('accepted');
    const bad = withClip(base, {
      id: 'ehz_1', donor: 's2disasm', zone: 'EHZ', src,
      dst: { x: dst.x + 8, y: dst.y, w: src.w, h: src.h }, unalignedDstReason: 'fidelity row: an 8-px shift',
    });
    const no = await runTool(s.copy, 'validate', serializeClipManifest(bad), s.runner);
    expect(no.ok).toBe(false);
    expect(no.couldNotRun).toBeUndefined();
    expect(no.stdout).toMatch(/R12/);
    const v = readValidateJson(no.exitCode, no.stdout, no.stderr);
    expect(v.kind === 'refused' && v.refusals.map((r) => ({ rule: r.rule, subjects: r.subjects }))).toEqual([
      { rule: 'R12', subjects: [{ kind: 'clip', index: 0, id: 'ehz_1' }] },
    ]);
  }, 120_000);

  it('F3: aeon\'s bake puts the donor\'s words and BOTH planes at the destination, byte for byte', async (ctx) => {
    const s = need(ctx);
    if (!s) return;
    const z = ehz(s);
    const src = marqueeRect({ x: 2048, y: 128 }, { x: 3071, y: 895 }, z.manifest.cropPx)!;
    const doc = withClip(newClipManifest('fid_act', 2, 1), {
      id: 'ehz_1', donor: 's2disasm', zone: 'EHZ', src, dst: { x: 2048, y: 0, w: src.w, h: src.h },
    });
    const r = await runTool(s.copy, 'bake', serializeClipManifest(doc), s.runner);
    expect(r.ok, `${r.stdout}\n${r.stderr}\n${r.couldNotRun ?? ''}`).toBe(true);
    const files = r.baked!.files;
    const st = z.manifest.sectionTiles;
    const bad: string[] = [];
    let compared = 0;
    let painted = 0;
    const planes: Array<[string, Uint16Array]> = [['tiles', z.words], ['collattr', z.planeA], ['collattrb', z.planeB]];
    for (const [suffix, donor] of planes) {
      const sec1 = suffix === 'tiles' ? parseNametable(files['section_1.tiles.bin'], st, st) : parseCollAttr(files[`section_1.${suffix}.bin`]);
      const sec0 = suffix === 'tiles' ? parseNametable(files['section_0.tiles.bin'], st, st) : parseCollAttr(files[`section_0.${suffix}.bin`]);
      for (let r0 = 0; r0 < src.h / 8; r0++) {
        for (let c0 = 0; c0 < src.w / 8; c0++) {
          const want = donor[(src.y / 8 + r0) * z.cols + src.x / 8 + c0];
          const got = sec1[r0 * st + c0];
          compared++;
          if (suffix === 'tiles' && (want & 0x7ff) !== 0) painted++;
          if (want !== got) bad.push(`${suffix} cell (${c0},${r0}): donor ${want} baked ${got}`);
        }
      }
      // Section 0 holds no clip: every word is 0 on every plane.
      if (sec0.some((w) => w !== 0)) bad.push(`${suffix}: section 0 is not empty`);
    }
    const keys0 = files['section_0.zonekey.bin'];
    if (!keys0.every((k) => k === 0xff)) bad.push('section 0 zone key is not all VOID (-1)');
    expect(painted, 'the compared rectangle has painted cells').toBeGreaterThan(1000);
    expect(compared).toBe(3 * (src.w / 8) * (src.h / 8));
    expect(bad.slice(0, 10), `${bad.length} mismatch(es)`).toEqual([]);
  }, 120_000);

  it('F4: aeon\'s own s2_two_clip_pins, rewritten by Aurora\'s writer, is still accepted', async (ctx) => {
    const s = need(ctx);
    if (!s) return;
    const text = readFileSync(join(s.copy, 'games/sonic4/data/clips/s2_two_clip_pins/clips.json'), 'utf8');
    const rewritten = serializeClipManifest(parseClipManifest(text));
    const r = await runTool(s.copy, 'validate', rewritten, s.runner);
    expect(r.ok, `${r.stdout}\n${r.stderr}`).toBe(true);
    expect(JSON.parse(rewritten)).toEqual(JSON.parse(text));
  }, 120_000);
});

describe('F5, F6: aeon\'s row-213 answers, from its real tools, through Aurora\'s channel', () => {
  const VENDORED = resolve(__dirname, '../fixtures/clips/aeon-outputs');

  for (const act of ['s2_ehz_cpz', 's2_two_clip', 's2_two_clip_pins', 's2_ehz_boot']) {
    it(`F5: ${act}: a real bake's per-clip rows read in full and keep aeon's stated invariants`, async (ctx) => {
      const s = need(ctx);
      if (!s) return;
      const manifest = join(s.copy, `games/sonic4/data/clips/${act}/clips.json`);
      if (!existsSync(manifest)) {
        ctx.skip(`SKIPPED, NOT PASSED: CANNOT MEASURE: aeon ${s.rev} no longer has ${act}/clips.json`);
        return;
      }
      const r = await runTool(s.copy, 'bake', readFileSync(manifest, 'utf8'), s.runner);
      expect(r.ok, `${r.stdout}\n${r.stderr}\n${r.couldNotRun ?? ''}`).toBe(true);
      const clipact = JSON.parse(r.baked!.clipact) as Record<string, unknown> & {
        pool: { tiles: number; pages: number; per_clip: unknown[]; per_corridor: unknown[]; per_clip_fields: Record<string, string> };
        clips: unknown[]; corridors: unknown[];
      };
      const rows = readPoolRows(clipact);
      expect(rows.state, rows.state === 'unavailable' ? rows.why : '').toBe('present');
      if (rows.state !== 'present') return;
      const all = [...rows.perClip, ...rows.perCorridor];
      expect(rows.perClip.length).toBe(clipact.clips.length);
      expect(rows.perCorridor.length).toBe(clipact.corridors.length);
      expect(all.reduce((a, x) => a + x.tiles_added, 0) + 1).toBe(clipact.pool.tiles);
      expect(all.reduce((a, x) => a + x.pages_exclusive, 0)).toBeLessThanOrEqual(clipact.pool.pages);
      for (const x of all) {
        expect(x.tiles_added).toBeLessThanOrEqual(x.tiles);
        expect(x.pages_exclusive).toBeLessThanOrEqual(x.pages_touched);
      }
      expect(rows.broken).toEqual([]);
      const vendored = JSON.parse(readFileSync(join(VENDORED, 's2_ehz_cpz.clipact.json'), 'utf8')) as { pool: { per_clip_fields: unknown } };
      expect(clipact.pool.per_clip_fields, 'aeon\'s per_clip_fields moved: re-vendor test/fixtures/clips/aeon-outputs (see its provenance)')
        .toEqual(vendored.pool.per_clip_fields);
      const touched = all.reduce((a, x) => a + x.pages_touched, 0);
      process.stdout.write(`donor-fidelity F5 ${act} @ aeon ${s.rev}: pool ${clipact.pool.tiles} tiles / ${clipact.pool.pages} pages; `
        + `rows ${all.map((x) => `${x.id} ${x.tiles}/${x.tiles_added}t ${x.pages_touched}/${x.pages_exclusive}p`).join(', ')}; `
        + `pages_touched sums to ${touched}\n`);
    }, 300_000);
  }

  it('F6: a real validate --json refusal parses to aeon\'s rule and the clip it names; a non-JSON manifest is a CRASH', async (ctx) => {
    const s = need(ctx);
    if (!s) return;
    const doc = JSON.parse(readFileSync(join(s.copy, 'games/sonic4/data/clips/s2_two_clip/clips.json'), 'utf8')) as {
      clips: Array<{ id: string; dst_rect: { w: number } }>;
    };
    doc.clips[1].dst_rect.w = 1024; // aeon's own R7 mutation (tools/test_clip_manifest_json.py)
    const r = await runTool(s.copy, 'validate', JSON.stringify(doc, null, 2), s.runner);
    expect(r.command).toMatch(/--json$/);
    expect(r.exitCode).toBe(1);
    const v = readValidateJson(r.exitCode, r.stdout, r.stderr);
    expect(v.kind, `${r.stdout}\n${r.stderr}`).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.refusals.map((n) => ({ rule: n.rule, subjects: n.subjects }))).toEqual([
      { rule: 'R7', subjects: [{ kind: 'clip', index: 1, id: doc.clips[1].id }] },
    ]);
    const crash = await runTool(s.copy, 'validate', '{ this is not json', s.runner);
    expect(crash.exitCode).toBe(1);
    expect(crash.stdout.trim()).toBe('');
    const cv = readValidateJson(crash.exitCode, crash.stdout, crash.stderr);
    expect(cv.kind).toBe('crashed');
    expect(cv.kind === 'crashed' && cv.stderr).toMatch(/Traceback/);
  }, 120_000);
});

// Referenced so a reader of this file sees where the copy's path comes from.
void resolve;
