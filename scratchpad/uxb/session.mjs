#!/usr/bin/env node
// UX SEAT B — the long-lived app session the audit drives against.
//
// The audit is a WALK: dozens of gestures across six surfaces, taken in an
// order decided as the walk goes. A single-shot harness cannot express that, so
// this file does exactly one job — launch the built app under a private Xvfb,
// announce which tree it is running, and stay alive until a sentinel file
// appears — and every gesture is issued by `drive.mjs` over the CDP port.
//
// Teardown is `await killTree(child)` in a `finally`, per the contract.
//
// Paths to the project copies are NOT typed here: they are the seat's private
// pinned copies and belong to the operator, so they arrive as UXB_AEON_DIR /
// UXB_CLASSIC_DIR (read by drive.mjs) and nothing here defaults to a live
// sibling tree.
import { AURORA_DIR } from '../../test/support/sibling-root.mjs';
import { existsSync, unlinkSync } from 'node:fs';
import { spawnGuarded, killTree } from '../lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from '../lib/run-root.mjs';

const PORT = Number(process.env.AURORA_DEBUG_PORT ?? 39302);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const SENTINEL = process.env.UXB_SENTINEL ?? '/tmp/uxb-session-stop';
try { unlinkSync(SENTINEL); } catch {}

const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
delete env.DISPLAY;

const child = spawnGuarded('/usr/bin/xvfb-run',
  ['-a', '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
  { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });

child.stdout.on('data', d => process.stdout.write(`[app] ${d}`));
child.stderr.on('data', d => process.stderr.write(`[app!] ${d}`));

console.log(`SESSION electron=${RUN.electron}`);
console.log(`SESSION main=${RUN.main}`);
console.log(`SESSION port=${PORT} pid=${child.pid} started=${new Date().toISOString()}`);
console.log('SESSION READY-MARKER-UXB');

try {
  for (;;) {
    if (existsSync(SENTINEL)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('SESSION STOP-MARKER-UXB');
} finally {
  await killTree(child);
  console.log('SESSION TORNDOWN-UXB');
}
