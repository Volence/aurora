#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ozone-x11-proof — RED-FIRST evidence for HAZARD 5
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run harness:ozone-x11
//
// The claim under test: an Electron launched the way every harness in
// scratchpad/ launches one — `{ ...process.env }`, `delete env.DISPLAY`, under
// `xvfb-run` — does NOT attach to that Xvfb. It attaches to whatever
// compositor the inherited environment points Ozone at, which on this machine
// is the owner's live Wayland session.
//
// WHY THIS FILE EXISTS RATHER THAN A COMMENT SAYING SO. "we pass
// --ozone-platform=x11 now" is trivially assertable and trivially vacuous: it
// stays just as green if the flag is inserted in a position Chromium never
// parses, if a future Electron renames it, or if `pinOzoneToX11` stops finding
// the binary in an argv shape nobody anticipated. So both halves are MEASURED,
// in the same process, against a real Electron:
//
//   [r1]  RED — the OLD shape, launched raw. Must report a display that is
//         NOT the Xvfb's. If this row cannot reproduce the defect, the green
//         row below proves nothing and this file says UNMEASURABLE rather
//         than passing.
//   [g1]  GREEN — the same launch through `spawnGuarded`, which injects the
//         flag. Must report EXACTLY the geometry we asked Xvfb for.
//   [g2]  The injection is positional, so it is asserted directly: the flag
//         must land immediately after the Electron binary, where Chromium
//         parses its own switches — not at the front (xvfb-run eats it) and
//         not at the back (the app gets it instead).
//
// THE EXPECTATION IS DERIVED, NEVER COPIED. `WIDTH`/`HEIGHT` below are the
// numbers handed to `xvfb-run -s`, and the same two are what [g1] compares
// against. Change one and both move together; there is no second place
// holding a stale copy of the answer.
//
// ⚠ NO WINDOW IS EVER CREATED. lib/ozone-probe-app creates no BrowserWindow at
// all, deliberately: the defect being measured is "this attaches to the
// owner's desktop", and a probe that opened a window would have demonstrated
// it ON that desktop. Everything here is safe to run while he is logged in.
// What a WINDOWED run does on his session is therefore not measured by this
// file and must not be inferred from a pass.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator tool.
//
// harness-guard:allow-raw-launch — row [r1] MUST launch the unguarded way, or
// there is no defect to catch and the guarded row is a comparison against
// itself. The raw child is torn down by killTree in the `finally`.
// check-harness-guards.mjs reads this marker and prints it as a declared
// exemption on every run.

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { spawnGuarded, killTree, pinOzoneToX11, OZONE_X11_FLAG } from './lib/harness-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const PROBE_APP = join(HERE, 'lib', 'ozone-probe-app');

/**
 * RESOLVED, NOT TYPED. `${ROOT}/node_modules/.bin/electron` — what the other
 * harnesses use — does not exist in an agent worktree, which carries no
 * `node_modules` of its own. Node's own resolver walks up to the main
 * checkout's, and the `electron` package's entry point exports the absolute
 * path of the binary, so this answers correctly from a plain clone and from a
 * worktree alike.
 */
function resolveElectron() {
  if (process.env.ELECTRON_BIN) return process.env.ELECTRON_BIN;
  const local = join(ROOT, 'node_modules', '.bin', 'electron');
  if (existsSync(local)) return local;
  try {
    const bin = createRequire(import.meta.url)('electron');
    if (typeof bin === 'string' && existsSync(bin)) return bin;
  } catch { /* fall through to the honest failure below */ }
  return local;
}
const ELECTRON = resolveElectron();

/** The geometry we ask Xvfb for. Deliberately distinctive: a size no real
 *  monitor has, so "the app reported this" cannot be a coincidence. */
const WIDTH = 1001;
const HEIGHT = 777;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}\n        ${detail}`);
  if (!ok) fails.push(`[${id}] ${name} — ${detail}`);
}
function unmeasurable(id, name, why) {
  results.push({ id, ok: false });
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for the probe to write its report, or give up. */
async function report(out, child, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (existsSync(out)) {
      try { return JSON.parse(readFileSync(out, 'utf8')); } catch { /* still writing */ }
    }
    if (child.exitCode !== null && !existsSync(out)) {
      // It died without reporting. Give the write a moment, then give up.
      await sleep(500);
      if (existsSync(out)) { try { return JSON.parse(readFileSync(out, 'utf8')); } catch { /* fall through */ } }
      return null;
    }
    await sleep(250);
  }
  return null;
}

/** One-line human summary of what the app said it could see. */
const describe = (j) => Array.isArray(j?.displays)
  ? j.displays.map((d) => `${d.width}x${d.height}@${d.scaleFactor}`).join(', ')
  : '(no displays reported)';

/** Did it land on the Xvfb we started? Derived from WIDTH/HEIGHT above. */
const onOurXvfb = (j) => Array.isArray(j?.displays)
  && j.displays.length === 1
  && j.displays[0].width === WIDTH
  && j.displays[0].height === HEIGHT;

const XVFB_ARGS = ['-a', '-s', `-screen 0 ${WIDTH}x${HEIGHT}x24`];

async function main() {
  if (!existsSync(ELECTRON)) {
    console.error(`no electron at ${ELECTRON} — run npm install first`);
    process.exit(2);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'ozone-x11-proof-'));
  let raw = null;
  let guarded = null;

  try {
    // ── [r1] RED: the OLD shape, raw ──────────────────────────────────────
    //
    // Reproduced exactly: inherit the environment, delete DISPLAY, run under
    // xvfb-run. No ozone flag. This is what ~90 harnesses do today.
    const redOut = join(tmp, 'red.json');
    const redEnv = { ...process.env };
    delete redEnv.DISPLAY;
    raw = spawn('/usr/bin/xvfb-run', [...XVFB_ARGS, ELECTRON, PROBE_APP, redOut],
      { cwd: ROOT, env: redEnv, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
    const red = await report(redOut, raw);

    if (red === null) {
      unmeasurable('r1', 'the OLD shape reproduces the defect',
        'the probe never wrote a report, so nothing was measured either way');
    } else if (onOurXvfb(red)) {
      // The defect did NOT reproduce. That is not a pass: it means this run
      // cannot tell a working pin from an environment that never had the
      // problem, so the green row below is evidence of nothing.
      unmeasurable('r1', 'the OLD shape reproduces the defect',
        `the unpinned launch DID land on our Xvfb (${describe(red)}). The hazard depends on the `
        + 'inherited environment (ELECTRON_OZONE_PLATFORM_HINT / WAYLAND_DISPLAY / XDG_RUNTIME_DIR); '
        + 'on a session without a reachable compositor there is nothing to leak to. The [g1] row '
        + 'below therefore proves NOTHING here and must not be read as a pass.');
    } else {
      check('r1', 'RED: the OLD shape (delete DISPLAY, under xvfb-run) does NOT use the Xvfb',
        true,
        `asked Xvfb for ${WIDTH}x${HEIGHT}; the app reported ${describe(red)}\n`
        + `        app saw DISPLAY=${red.DISPLAY} WAYLAND_DISPLAY=${red.WAYLAND_DISPLAY} `
        + `ELECTRON_OZONE_PLATFORM_HINT=${red.ELECTRON_OZONE_PLATFORM_HINT}\n`
        + '        — the Xvfb was started, paid for, and never connected to.');
    }
    await killTree(raw);
    raw = null;

    // ── [g1] GREEN: the same launch through spawnGuarded ──────────────────
    const greenOut = join(tmp, 'green.json');
    const greenEnv = { ...process.env };
    delete greenEnv.DISPLAY;
    guarded = spawnGuarded('/usr/bin/xvfb-run', [...XVFB_ARGS, ELECTRON, PROBE_APP, greenOut],
      { cwd: ROOT, env: greenEnv, stdio: ['ignore', 'ignore', 'ignore'] });
    const green = await report(greenOut, guarded);

    if (green === null) {
      unmeasurable('g1', 'GREEN: the guarded launch uses OUR Xvfb',
        'the probe never wrote a report');
    } else {
      check('g1', 'GREEN: the guarded launch lands on OUR Xvfb, at the geometry we asked for',
        onOurXvfb(green),
        `asked Xvfb for ${WIDTH}x${HEIGHT}; the app reported ${describe(green)}\n`
        + `        app saw DISPLAY=${green.DISPLAY} WAYLAND_DISPLAY=${green.WAYLAND_DISPLAY} `
        + `ELECTRON_OZONE_PLATFORM_HINT=${green.ELECTRON_OZONE_PLATFORM_HINT}\n`
        + `        argv carried: ${(green.argv ?? []).filter((a) => a.startsWith('--ozone')).join(' ') || '(no --ozone flag!)'}`);
    }
    await killTree(guarded);
    guarded = null;

    // ── [g2] the injection is POSITIONAL — assert the position ────────────
    const sample = ['-a', '-s', `-screen 0 ${WIDTH}x${HEIGHT}x24`, ELECTRON, '/app/main.mjs'];
    const out = pinOzoneToX11('/usr/bin/xvfb-run', sample);
    const at = out.indexOf(OZONE_X11_FLAG);
    const binAt = out.indexOf(ELECTRON);
    check('g2', 'the flag is inserted immediately AFTER the electron binary, not at either end',
      at === binAt + 1 && binAt !== -1,
      `${out.join(' ')}\n        electron at ${binAt}, flag at ${at} (want ${binAt + 1})`);

    // And the negative: a spawn that is not an Electron launch is left alone,
    // by identity — the oracle emulator is spawned through this module too.
    const foreign = ['--socket', '/tmp/x.sock'];
    check('g3', 'a NON-Electron spawn is returned untouched (by identity), so nothing else is rewritten',
      pinOzoneToX11('/usr/bin/oracle-aether', foreign) === foreign,
      `pinOzoneToX11('/usr/bin/oracle-aether', ${JSON.stringify(foreign)}) returned the same array`);
  } finally {
    if (raw) await killTree(raw).catch(() => {});
    if (guarded) await killTree(guarded).catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} rows passed ════`);
  if (fails.length) {
    console.log('\nFAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
