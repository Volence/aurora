// Run AEON'S OWN clip tools on a candidate manifest, for the Donors page.
//
// ═══ WHY AURORA RUNS A PYTHON TOOL AT ALL ═════════════════════════════════
//
// Aeon's `tools/clip_manifest.py` `load` refuses R1..R12 and K1..K3 by name and
// warns W2/W3, and aeon's design says the page should CALL it rather than
// reimplement it (design §8). A second implementation here would be a second
// place for the rules to drift, and the drift would be found the day a paste
// Aurora accepted failed aeon's bake. So the paste asks aeon, in aeon's words.
// The bake is asked for the same reason: its composed section files ARE what a
// clip act's ROM is built from, so the page draws the target act from them.
//
// ═══ THE WHOLE SURFACE, AND WHY IT IS THIS NARROW ═════════════════════════
//
// Exactly two verbs reach a subprocess, each with a FIXED argv:
//
//   validate  python3 tools/clip_manifest.py validate <candidate> --donor-root <root>/games/sonic4/data/donors --json
//   bake      python3 tools/clip_act_bake.py bake <candidate> --out <temp>/baked
//
// The renderer supplies only the project root (which must hold both tools) and
// the candidate manifest TEXT. The text goes to a file in a fresh temp
// directory this module creates and deletes; nothing is written under the
// project. No other program, script or argument is reachable from the channel.
//
// ═══ WHAT COMES BACK ══════════════════════════════════════════════════════
//
// The tool's exit code and its whole stdout/stderr, the printable command, and for a bake that exited 0
// the composed act: clipact.json and every section's tiles/collattr/collattrb/
// zonekey bytes, plus corridor_sheet.bin when the act has a corridor. A tool
// that could not be STARTED (no python3, a timeout) is `couldNotRun`, which is
// never rendered as a refusal of the manifest: the manifest was not judged.
//
// validate runs with `--json` (aeon 1d9afb25, ROADMAP row 213): its stdout is one
// document naming the rule and the clip or corridor, read by the renderer with
// core/formats/donors/clip-validate-json.ts. This module does not interpret it:
// exit 1 with no JSON on stdout is aeon's documented CRASH (a traceback), and
// telling that from a refusal is the reader's job, in one place.

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import type { ClipToolBaked, ClipToolResult, ClipToolVerb } from '../shared/ipc-types';

export type { ClipToolBaked, ClipToolResult, ClipToolVerb };

/** The two tools, relative to the aeon root. */
export const CLIP_TOOLS = {
  validate: 'tools/clip_manifest.py',
  bake: 'tools/clip_act_bake.py',
} as const;

export const DONOR_ROOT_REL = 'games/sonic4/data/donors';
export const CLIP_TOOL_TIMEOUT_MS = 120_000;

export interface SpawnOutcome { code: number | null; stdout: string; stderr: string; error?: string }
export type Runner = (argv: string[], cwd: string, timeoutMs: number) => Promise<SpawnOutcome>;

/**
 * A real runner: no shell, argv as given, killed at the timeout. `env` is the
 * child's whole environment; the app passes its own. A test that runs the tools
 * in a copy outside the suite root passes one that names the suite root, since
 * aeon's tools refuse to guess it (tools/suite_paths.py).
 */
export function makeSpawnRunner(env: NodeJS.ProcessEnv): Runner {
  return (argv, cwd, timeoutMs) => new Promise((resolveP) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  const child = nodeSpawn(argv[0], argv.slice(1), { cwd, shell: false, env });
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    if (!settled) { settled = true; resolveP({ code: null, stdout, stderr, error: `timed out after ${timeoutMs} ms` }); }
  }, timeoutMs);
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
  child.on('error', (e) => {
    clearTimeout(timer);
    if (!settled) { settled = true; resolveP({ code: null, stdout, stderr, error: e.message }); }
  });
  child.on('close', (code) => {
    clearTimeout(timer);
    if (!settled) { settled = true; resolveP({ code, stdout, stderr }); }
  });
  });
}

/** The app's runner: the main process's own environment. */
export const spawnRunner: Runner = makeSpawnRunner(process.env);

/** The fixed argv for one verb. Exported so a row can hold it to exactly this. */
export function clipToolArgv(verb: ClipToolVerb, basePath: string, candidate: string, outDir: string): string[] {
  if (verb === 'validate') {
    return ['python3', CLIP_TOOLS.validate, 'validate', candidate, '--donor-root', join(basePath, DONOR_ROOT_REL), '--json'];
  }
  return ['python3', CLIP_TOOLS.bake, 'bake', candidate, '--out', outDir];
}

function gridOf(manifestText: string): { w: number; h: number } | null {
  try {
    const raw = JSON.parse(manifestText) as { act?: { grid_w?: unknown; grid_h?: unknown } };
    const w = raw.act?.grid_w;
    const h = raw.act?.grid_h;
    return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && w * h <= 256 ? { w, h } : null;
  } catch { return null; }
}

/** Read what a bake that exited 0 wrote; a missing expected file is reported, not skipped. */
export function readBaked(outDir: string, manifestText: string): { baked?: ClipToolBaked; missing?: string } {
  const grid = gridOf(manifestText);
  if (!grid) return { missing: 'the manifest declares no readable act grid' };
  const clipactPath = join(outDir, 'clipact.json');
  if (!existsSync(clipactPath)) return { missing: 'clipact.json' };
  const files: Record<string, Uint8Array> = {};
  for (let n = 0; n < grid.w * grid.h; n++) {
    for (const suffix of ['tiles', 'collattr', 'collattrb', 'zonekey']) {
      const name = `section_${n}.${suffix}.bin`;
      const p = join(outDir, name);
      if (!existsSync(p)) return { missing: name };
      files[name] = new Uint8Array(readFileSync(p));
    }
  }
  const sheet = join(outDir, 'corridor_sheet.bin');
  if (existsSync(sheet)) files['corridor_sheet.bin'] = new Uint8Array(readFileSync(sheet));
  return { baked: { clipact: readFileSync(clipactPath, 'utf8'), files } };
}

/**
 * Run one verb on `manifestText` against the aeon checkout at `basePath`.
 * `runner` is injectable so the node suite can hold the argv and the temp
 * handling without a Python on the machine.
 */
export async function runClipTool(
  basePath: string, verb: ClipToolVerb, manifestText: string, runner: Runner = spawnRunner,
): Promise<ClipToolResult> {
  const base: Omit<ClipToolResult, 'ok' | 'exitCode' | 'stdout' | 'stderr' | 'command'> = { verb };
  if (verb !== 'validate' && verb !== 'bake') {
    return { ...base, ok: false, exitCode: null, stdout: '', stderr: '', command: '', couldNotRun: `unknown verb ${String(verb)}` };
  }
  if (typeof basePath !== 'string' || !isAbsolute(basePath) || !existsSync(join(basePath, CLIP_TOOLS[verb]))) {
    return {
      ...base, ok: false, exitCode: null, stdout: '', stderr: '', command: '',
      couldNotRun: `${String(basePath)} has no ${CLIP_TOOLS[verb]}: the open project is not an aeon checkout Aurora can ask`,
    };
  }
  const tmp = mkdtempSync(join(tmpdir(), 'aurora-clip-'));
  try {
    const candidate = join(tmp, 'clips.json');
    writeFileSync(candidate, manifestText);
    const outDir = join(tmp, 'baked');
    if (verb === 'bake') mkdirSync(outDir, { recursive: true });
    const argv = clipToolArgv(verb, basePath, candidate, outDir);
    const r = await runner(argv, basePath, CLIP_TOOL_TIMEOUT_MS);
    const out: ClipToolResult = {
      ...base, ok: r.code === 0 && !r.error, exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
      command: argv.join(' '),
    };
    if (r.error) out.couldNotRun = r.error;
    if (out.ok && verb === 'bake') {
      const got = readBaked(outDir, manifestText);
      if (got.baked) out.baked = got.baked;
      else {
        out.ok = false;
        out.couldNotRun = `the bake exited 0 but did not write ${got.missing}`;
      }
    }
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
