// ═══════════════════════════════════════════════════════════════════════════
// capture-dir - where a rig writes ONE RUN's pictures and documents
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS EXISTS (ROWREMAP-STALE-ROWS-AND-CAPTURES, 2026-09-13) ─────────
//
// `rowremap-author` and `scene-anchor-writer` wrote every screenshot, and the
// saved scene document, straight into their COMMITTED capture directories under
// `docs/captures/`. So every run, green or red, rewrote tracked evidence: the
// baseline runs of this parcel left 9 modified PNGs each in `git status`, and a
// careless `git add` ships run noise as a capture. (The same shape was booked
// against `handover-band-harness` on 2026-09-03 and never fixed.)
//
// A normal run now writes into a FRESH per-run temp directory and prints it on a
// `captures:` line. Refreshing the committed captures is an explicit act.
//
// ── THE SWITCH IS `SHOTS`, BECAUSE IT ALREADY EXISTED ────────────────────────
//
// No rig in scratchpad/ had a "temp by default, opt in to the committed tree"
// switch. What four rigs DO have is `SHOTS`, in two meanings:
//
//   a PATH   `capture-harness.mjs` and `effects-cold-read-harness.mjs`:
//            `process.env.SHOTS ?? <default dir>`, the output directory.
//   a FLAG   `marquee-flip-button-harness.mjs` and
//            `collision-mark-normal-harness.mjs`: `SHOTS === '1'` turns
//            screenshots on at all.
//
// This takes the PATH meaning, because both rigs here already named their
// output constant `SHOTS` and the path rigs are the ones whose default was a
// capture directory. So:
//
//   SHOTS unset            a fresh `mkdtemp` under the OS temp dir. Nothing
//                          tracked is touched.
//   SHOTS=<absolute dir>   that directory. Naming the rig's own COMMITTED
//                          capture directory is the opt-in to refresh it, and
//                          the `captures:` line says so in capitals.
//
// ⚠ A RELATIVE VALUE IS REFUSED, and that is what keeps the two meanings apart.
// `SHOTS=1`, typed by someone used to the flag rigs, would otherwise create a
// directory called `1` in the working tree and write the run into it: the very
// dirt this module exists to stop, under a name nobody would look for.

import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Resolve this run's capture directory and announce it.
 *
 * @param {{ root: string, committedRel: string, label: string, write?: (s: string) => void }} o
 *   `root` is the checkout the committed captures live in; `committedRel` the
 *   rig's own capture directory relative to it; `label` names the temp dir.
 * @returns {{ dir: string, committed: boolean, source: 'temp' | 'SHOTS' }}
 */
export function captureDir({ root, committedRel, label, write = (s) => process.stderr.write(s) }) {
  const committedAbs = resolve(root, committedRel);
  const raw = process.env.SHOTS;
  if (raw === undefined || raw === '') {
    const dir = mkdtempSync(join(tmpdir(), `aurora-${label}-`));
    write(`captures: ${dir}  (a per-run temp dir; the committed captures in `
      + `${committedRel} are NOT touched. Set SHOTS=${committedAbs} to refresh them.)\n`);
    return { dir, committed: false, source: 'temp' };
  }
  if (!isAbsolute(raw)) {
    throw new Error(`REFUSING: SHOTS=${JSON.stringify(raw)} is not an absolute path. On this rig SHOTS `
      + 'names an output DIRECTORY (the capture-harness / effects-cold-read meaning), not the '
      + 'SHOTS=1 on/off flag other rigs use; a relative value would write the run into the working '
      + `tree. Unset it for a temp dir, or give SHOTS=${committedAbs} to refresh the committed captures.`);
  }
  const dir = resolve(raw);
  mkdirSync(dir, { recursive: true });
  const committed = dir === committedAbs;
  write(committed
    ? `captures: ${dir}  (SHOTS NAMES THE COMMITTED CAPTURES: this run REWRITES tracked evidence `
      + `in ${committedRel}. Commit it only as a deliberate, explained refresh.)\n`
    : `captures: ${dir}  (from SHOTS; outside the committed captures in ${committedRel})\n`);
  return { dir, committed, source: 'SHOTS' };
}

/**
 * The bytes of a file AS COMMITTED at `HEAD` of `root`, never the working copy.
 *
 * A comparison against "the committed capture" has to read the commit: once a
 * run may write into that directory (an opt-in refresh), the working file is
 * this run's own output, and comparing a run against itself cannot go red.
 *
 * @returns {{ ok: true, bytes: Buffer, rev: string } | { ok: false, why: string }}
 */
export function committedBytes(root, relPath) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const rev = spawnSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD^{commit}'], { env });
  if (rev.status !== 0) {
    return { ok: false, why: `git -C ${root} rev-parse HEAD exited ${rev.status}: ${String(rev.stderr).trim()}` };
  }
  const r = spawnSync('git', ['-C', root, 'show', `HEAD:${relPath}`], { env, maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    return { ok: false, why: `git -C ${root} show HEAD:${relPath} exited ${r.status}: ${String(r.stderr).trim()}` };
  }
  return { ok: true, bytes: r.stdout, rev: String(rev.stdout).trim() };
}
