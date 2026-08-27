// AEON'S OWN GATE over what the band-art commands save.
//
// `set-bg-override-tiles` claims to keep aeon's `validate_band_coherence`
// true. The rows in bg-override-art.test.ts check Aurora's transcription of
// that rule; this file asks THE TOOL ITSELF, at its sibling path
// (`../aeon/tools/inject_editor_bg.py`), the way item 24's probe
// (`scratchpad/bganim-writer-vs-aeon-gate.py`) did: save through the real
// serializer, hand the bytes to `validate_band_coherence(anims, tiles)`, and
// read the verdict.
//
// THE GATE IS PROVEN TO DISCRIMINATE FIRST. A poisoned file (phases[0] != its
// prefix tiles, written as raw JSON because Aurora's serializer refuses to
// write one) must be REFUSED naming the band, before the clean rows mean
// anything — a validator that accepts everything would make every accept
// row below vacuous.
//
// When the sibling tool is absent the rows SKIP WITH A MESSAGE (they show as
// skipped in the totals, never as passed): a green run here must mean the
// tool ran.

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { EditHistory } from '../history';
import type { S4Level } from '../commands';
import { makeRegenerateShiftCommand, makeSetBgOverrideTilesCommand } from '../bg-override-art';
import {
  parseBgOverride, serializeBgOverride, TILE_PIXELS, TILE_PIXEL_MAX,
  type BgOverrideDocument,
} from '../../formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../formats/bg-override/bg-anim-band';

const REPO = resolve(__dirname, '../../../..');
/**
 * The sibling aeon checkout — `../aeon` beside the aurora repo, as item 24's
 * probe resolves it. A git WORKTREE of aurora lives under
 * `aurora/.claude/worktrees/<id>`, so the sibling is found by walking the
 * ancestors for an `aeon/tools/inject_editor_bg.py`; `AEON_ROOT` overrides.
 */
function findTool(): string {
  const rel = join('tools', 'inject_editor_bg.py');
  if (process.env.AEON_ROOT) return join(process.env.AEON_ROOT, rel);
  let dir = REPO;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '..', 'aeon', rel);
    if (existsSync(candidate)) return resolve(candidate);
    dir = dirname(dir);
  }
  return resolve(REPO, '..', 'aeon', rel);
}
const TOOL = findTool();
const FIXTURE = join(REPO, 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json');

const toolPresent = existsSync(TOOL);
if (!toolPresent) {
  // Loud, and skipped — see the header.
  console.warn(`[injector gate] aeon tool not found at ${TOOL}; the gate rows are SKIPPED, not passed`);
}

/** Run aeon's validate_band_coherence over one saved file. */
function gate(file: string): { verdict: 'ACCEPT' | 'REFUSE'; detail: string } {
  const py = [
    'import json, sys, importlib.util',
    `sys.path.insert(0, ${JSON.stringify(dirname(TOOL))})`,
    `spec = importlib.util.spec_from_file_location('inj', ${JSON.stringify(TOOL)})`,
    'm = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)',
    `d = json.load(open(${JSON.stringify(file)}))`,
    'anims = d.get("anims") or ([d["anim"]] if d.get("anim") else [])',
    'try:',
    '    m.validate_band_coherence(anims, d["tiles"]); print("ACCEPT")',
    'except AssertionError as e:',
    '    print("REFUSE " + str(e).splitlines()[0])',
  ].join('\n');
  const r = spawnSync('python3', ['-c', py], { cwd: dirname(TOOL), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`python3 failed: ${r.stderr}`);
  const line = r.stdout.trim().split('\n').pop() ?? '';
  return line.startsWith('ACCEPT')
    ? { verdict: 'ACCEPT', detail: line }
    : { verdict: 'REFUSE', detail: line.replace(/^REFUSE /, '') };
}

const out = mkdtempSync(join(tmpdir(), 'aurora-injector-gate-'));
const golden = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;
const level = (d: BgOverrideDocument): S4Level => ({ sections: [], bgOverride: d } as unknown as S4Level);
const save = (name: string, d: BgOverrideDocument): string => {
  const p = join(out, name);
  writeFileSync(p, serializeBgOverride(d));
  return p;
};
const flat = (v: number) => new Array<number>(TILE_PIXELS).fill(v & TILE_PIXEL_MAX);

describe.skipIf(!toolPresent)('aeon inject_editor_bg.validate_band_coherence over Aurora-saved files', () => {
  it('REFUSES a planted violation (phases[0] != prefix tiles), naming band 0 — the gate discriminates', () => {
    // Raw JSON on purpose: Aurora's serializer refuses to write this document,
    // which is a second gate and not the one under test.
    const d = golden();
    const b0 = documentBands(d)[0];
    b0.phases[0][0] = b0.phases[0][0].map((v) => (v + 1) & TILE_PIXEL_MAX);
    expect(() => serializeBgOverride(d)).toThrow();
    const p = join(out, 'poisoned.json');
    writeFileSync(p, JSON.stringify(d));
    const r = gate(p);
    expect(r.verdict).toBe('REFUSE');
    expect(r.detail).toMatch(/band 0: phases\[0\] != tiles\[0:/);
  });

  it('ACCEPTS the untouched fixture (control)', () => {
    expect(gate(save('control.json', golden())).verdict).toBe('ACCEPT');
  });

  it('ACCEPTS a file after prefix-slot edits through set-bg-override-tiles, and after undo', () => {
    const d = golden();
    const l = level(d);
    const h = new EditHistory();
    const bases = bandSlotBases(documentBands(d));
    const lastBand = documentBands(d).length - 1;
    // One slot in each band, plus the first static slot.
    h.execute(makeSetBgOverrideTilesCommand(d, [
      { index: bases[0], pixels: flat(0x5) },
      { index: bases[lastBand], pixels: flat(0x6) },
      { index: bases[lastBand + 1], pixels: flat(0x7) },
    ]), l);
    const edited = gate(save('edited.json', d));
    expect(edited.verdict, edited.detail).toBe('ACCEPT');

    h.undo(l);
    const undone = gate(save('undone.json', d));
    expect(undone.verdict, undone.detail).toBe('ACCEPT');
    expect(readFileSync(join(out, 'undone.json'), 'utf8')).toBe(serializeBgOverride(golden()));
  });

  it('ACCEPTS a file after edit + regenerate-shift', () => {
    const d = golden();
    const l = level(d);
    const h = new EditHistory();
    h.execute(makeSetBgOverrideTilesCommand(d, [{ index: 0, pixels: flat(0x9) }]), l);
    h.execute(makeRegenerateShiftCommand(d, 0), l);
    const r = gate(save('regenerated.json', d));
    expect(r.verdict, r.detail).toBe('ACCEPT');
  });
});

// ---------------------------------------------------------------------------
// THE FOREGROUND DOOR — row 51's CDP tail hands its SAVED FILE to this gate.
//
// `scratchpad/band-art-foreground-harness.mjs` drives the real app: it opens a
// bank from the strip, draws a stroke, presses Ctrl+S, and then runs THIS FILE
// with `AURORA_FG_GATE_FILE` naming what the app wrote. The point of routing it
// back through here rather than shelling out to python from the harness is that
// there is then exactly ONE way this repo invokes aeon's validator — the same
// `gate()` above, the same tool resolution, the same skip-with-a-message when
// the sibling checkout is absent.
//
// BOTH HALVES RUN, ALWAYS. The saved file must be ACCEPTED *and* a poison
// derived from that same file must be REFUSED naming its band; an accept row
// on its own would be the vacuous shape the header warns about, and the poison
// has to come from the harness's OWN artifact rather than the fixture, or the
// red half proves nothing about what the app just wrote.
// ---------------------------------------------------------------------------
const FG_FILE = process.env.AURORA_FG_GATE_FILE ?? '';
const fgReady = toolPresent && FG_FILE !== '' && existsSync(FG_FILE);
if (FG_FILE !== '' && !fgReady) {
  console.warn(`[injector gate] AURORA_FG_GATE_FILE=${FG_FILE}: `
    + `${toolPresent ? 'file missing' : 'aeon tool absent'} — the foreground rows are SKIPPED`);
}

describe.skipIf(!fgReady)('the file the REAL APP saved after a band-art stroke', () => {
  const text = (): string => readFileSync(FG_FILE, 'utf8');
  const parsed = (): { anims?: { cols: number; rows: number; phases: number[][][] }[]; tiles: number[][] } =>
    JSON.parse(text()) as { anims?: { cols: number; rows: number; phases: number[][][] }[]; tiles: number[][] };

  it('ANTI-VACUOUS: it really carries bands with a non-empty animated prefix, so the '
    + 'coherence assert has something to check', () => {
    const d = parsed();
    const anims = d.anims ?? [];
    expect(anims.length, `${FG_FILE} has no anims — validate_band_coherence would pass trivially`)
      .toBeGreaterThan(0);
    const n = anims.reduce((acc, a) => acc + a.cols * a.rows, 0);
    expect(n, 'the animated prefix is empty').toBeGreaterThan(0);
    expect(d.tiles.length).toBeGreaterThanOrEqual(n);
  });

  it('is ACCEPTED by aeon validate_band_coherence', () => {
    const r = gate(FG_FILE);
    expect(r.verdict, r.detail).toBe('ACCEPT');
  });

  it('RED FIRST, on the app\'s own file: the same file with phases[0][0] perturbed is '
    + 'REFUSED, naming the band', () => {
    const d = parsed();
    const anims = d.anims ?? [];
    // The LAST band, deliberately: a poison in band 0 is refused by the very
    // first iteration of the validator's cursor walk, leaving every later band
    // unexercised, so this one is only reached if the walk really advances
    // through the prefix. ⚠ DISCLOSED: aeon's shipped override carries exactly
    // ONE band today, so on that document `bi` IS 0 and this row does not
    // discriminate the walk — it still discriminates the assert. The index is
    // derived so the row strengthens by itself the day a second band lands.
    const bi = anims.length - 1;
    anims[bi].phases[0][0] = anims[bi].phases[0][0].map((v) => (v + 1) & TILE_PIXEL_MAX);
    const p = join(out, 'fg-poisoned.json');
    writeFileSync(p, JSON.stringify(d));
    const r = gate(p);
    // Printed so the REFUSAL ITSELF is evidence in the harness transcript, not
    // merely a green row asserting one happened.
    console.warn(`[injector gate] foreground poison verdict: ${r.verdict} ${r.detail}`);
    expect(r.verdict, r.detail).toBe('REFUSE');
    expect(r.detail).toMatch(new RegExp(`band ${bi}: phases\\[0\\] != tiles\\[`));
  });
});

describe('the gate rows are not silently green', () => {
  it('states whether the sibling tool was found', () => {
    // A reader of the totals sees 4 skipped rows when the tool is missing; this
    // row exists so the reason is in the output rather than inferred.
    expect(typeof toolPresent).toBe('boolean');
    if (!toolPresent) console.warn(`[injector gate] SKIPPED: ${TOOL} is absent`);
  });
});
