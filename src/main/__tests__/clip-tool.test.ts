/**
 * The Donors page's one subprocess channel: exactly two fixed argvs, a
 * candidate that never lands in the project, and a tool that could not run is
 * never read as a verdict on the manifest.
 *
 * The runner is injected, so these rows need no Python. The REAL tools are run
 * by the opt-in fidelity rig (test/live/donor-fidelity.test.ts) and by the CDP
 * harness; this file holds the shape of the call.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clipToolArgv, runClipTool, type Runner } from '../clip-tool';

function fakeAeon(): string {
  const root = mkdtempSync(join(tmpdir(), 'aurora-clip-tool-test-'));
  mkdirSync(join(root, 'tools'));
  writeFileSync(join(root, 'tools/clip_manifest.py'), '# stand-in\n');
  writeFileSync(join(root, 'tools/clip_act_bake.py'), '# stand-in\n');
  return root;
}

const MANIFEST = JSON.stringify({ schema: 1, units: 'world_px', id: 'fx', act: { grid_w: 2, grid_h: 1 }, clips: [] });

describe('the argv is fixed per verb', () => {
  it('validate names clip_manifest.py, the project\'s own donor root, and --json AFTER the path (aeon 1d9afb25)', () => {
    expect(clipToolArgv('validate', '/p', '/t/clips.json', '/t/baked')).toEqual(
      ['python3', 'tools/clip_manifest.py', 'validate', '/t/clips.json', '--donor-root', '/p/games/sonic4/data/donors', '--json']);
  });
  it('bake names clip_act_bake.py, a temp --out (never the project), and --json AFTER the path (aeon 71ae3433)', () => {
    expect(clipToolArgv('bake', '/p', '/t/clips.json', '/t/baked')).toEqual(
      ['python3', 'tools/clip_act_bake.py', 'bake', '/t/clips.json', '--out', '/t/baked', '--json']);
  });
});

describe('running a verb', () => {
  it('the candidate is the exact text, in a temp dir that is gone afterwards, and the project is untouched', async () => {
    const root = fakeAeon();
    try {
      const before = readdirSync(root).sort();
      let seen: { argv: string[]; cwd: string; text: string } | null = null;
      const runner: Runner = async (argv, cwd) => {
        seen = { argv, cwd, text: readFileSync(argv[3], 'utf8') };
        return { code: 0, stdout: 'clips.json OK', stderr: '' };
      };
      const r = await runClipTool(root, 'validate', MANIFEST, runner);
      expect(r.ok).toBe(true);
      expect(seen!.cwd).toBe(root);
      expect(seen!.text).toBe(MANIFEST);
      expect(seen!.argv[3].startsWith(root)).toBe(false);
      expect(existsSync(seen!.argv[3])).toBe(false);
      expect(readdirSync(root).sort()).toEqual(before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a refusal carries aeon\'s own words and exit code', async () => {
    const root = fakeAeon();
    try {
      const runner: Runner = async () => ({ code: 1, stdout: 'clips.json REFUSED - R10 clips overlap', stderr: '' });
      const r = await runClipTool(root, 'validate', MANIFEST, runner);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toMatch(/R10/);
      expect(r.couldNotRun).toBeUndefined();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a tool that could not START is couldNotRun, never a refusal of the manifest', async () => {
    const root = fakeAeon();
    try {
      const runner: Runner = async () => ({ code: null, stdout: '', stderr: '', error: 'spawn python3 ENOENT' });
      const r = await runClipTool(root, 'validate', MANIFEST, runner);
      expect(r.ok).toBe(false);
      expect(r.couldNotRun).toMatch(/ENOENT/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a project without the tool is refused before anything runs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-clip-tool-test-'));
    try {
      let ran = false;
      const r = await runClipTool(root, 'bake', MANIFEST, async () => { ran = true; return { code: 0, stdout: '', stderr: '' }; });
      expect(ran).toBe(false);
      expect(r.couldNotRun).toMatch(/tools\/clip_act_bake\.py/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('a bake that exited 0 returns every section\'s four files; one missing is reported, not skipped', async () => {
    const root = fakeAeon();
    try {
      const write = (full: boolean): Runner => async (argv) => {
        const out = argv[5];
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'clipact.json'), '{"act":{}}');
        for (const n of [0, 1]) {
          for (const s of ['tiles', 'collattr', 'collattrb', 'zonekey']) {
            if (!full && n === 1 && s === 'collattrb') continue;
            writeFileSync(join(out, `section_${n}.${s}.bin`), new Uint8Array([n, 1]));
          }
        }
        return { code: 0, stdout: 'clip act baked', stderr: '' };
      };
      const good = await runClipTool(root, 'bake', MANIFEST, write(true));
      expect(good.ok).toBe(true);
      expect(Object.keys(good.baked!.files).sort()).toEqual([
        'section_0.collattr.bin', 'section_0.collattrb.bin', 'section_0.tiles.bin', 'section_0.zonekey.bin',
        'section_1.collattr.bin', 'section_1.collattrb.bin', 'section_1.tiles.bin', 'section_1.zonekey.bin',
      ]);
      const short = await runClipTool(root, 'bake', MANIFEST, write(false));
      expect(short.ok).toBe(false);
      expect(short.couldNotRun).toMatch(/section_1\.collattrb\.bin/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
