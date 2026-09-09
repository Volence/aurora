#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// surface-isolation-proof — ISOLATE THE SURFACE, NOT THE PROCESS
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run harness:surface-isolation
//     npm run harness:surface-isolation -- --windowless-only     (see SAFETY)
//
// THE DEFECT THIS CLOSES. The suite's shared isolation proof asks *"is there
// nothing on `:0`?"*. On a Wayland desktop that reads CLEAN during the exact
// escape it is supposed to catch. The oracle lane's 2026-08-29 record has all
// four facts at once: `DISPLAY=:91` set, the window ON THE OWNER'S REAL SCREEN,
// the log saying `Wayland window`, and python-xlib finding ZERO windows on the
// Xvfb. So "nothing on :0" is not evidence of isolation — it is evidence that
// the escape route was not X11.
//
// The generalisation: **the rig confines a PROCESS while leaving it a path to
// his screen that nothing in the proof looks at.** So this file measures the
// SURFACE — the display-server sockets the launched tree is actually holding
// open, read out of `/proc/<pid>/fd` — and never reads an environment variable
// back as evidence. An environ read is a statement of INTENT; it cannot
// distinguish "I set this" from "this took effect", and HAZARD 5 in
// lib/harness-guard.mjs is the case where those two came apart at the cost of
// every screenshot this population ever took.
//
// ROW [r2] IS THE ONE TO READ. It runs an Electron with DISPLAY *and*
// WAYLAND_DISPLAY both deleted — an environment audit of that process reads
// perfectly clean — and finds it holding a live connection to
// `$XDG_RUNTIME_DIR/wayland-0` anyway.
//
// ── WHAT EACH ROW IS ───────────────────────────────────────────────────────
//
//   [s1]  SAFETY INTERLOCK. The exact argv about to carry a WINDOWED app is
//         checked for `--ozone-platform=x11` in the position Chromium parses.
//         If the pin is absent the windowed rows are REFUSED, not run. That is
//         what makes the red-first mutation below safe to perform.
//   [r1]  RED, WINDOW-LESS. The pre-2026-08-30 launch shape. The census must
//         FIND a compositor connection; if it cannot, this file says
//         UNMEASURABLE rather than passing, because every green row then
//         compares against an environment that never had the problem.
//   [r2]  RED, AND THE ENVIRON READ MISSES IT. As [r1] with WAYLAND_DISPLAY
//         deleted too.
//   [g1]  GREEN, WINDOW-LESS. Same app through `spawnGuarded`: ISOLATED.
//   [w1]  WINDOWED, POSITIVE. A real Aurora is enumerated ON OUR XVFB, mapped,
//         at the screen geometry we asked for. A proof that only asserts
//         absence elsewhere passes when the app failed to start.
//   [w2]  WINDOWED, SURFACE. That same live tree holds no compositor socket
//         and no X socket but ours. THIS IS THE CASE HAZARD 5 COULD ONLY INFER.
//   [n1]  NON-VACUITY of the window census: against a display that does not
//         exist it reports `ok:false`, not an empty window list.
//   [b1..b7] BLINDNESS. Every way this instrument can fail to look, driven for
//         real, each one landing on UNKNOWN and never on a pass — including
//         [b6], the missing peer table, and [b7], our X socket held only by the
//         X server we started, which is the RED run's own shape.
//
// ── THE MISTAKE THIS FILE MADE FIRST, WHICH IS THE FINDING ─────────────────
//
// The first draft resolved each fd's inode straight out of `/proc/net/unix`,
// on a measured-but-inverted belief that a connecting client keeps the path it
// connected to. IT DOES NOT — the kernel copies the listener's address onto the
// ACCEPTED socket, and the client's own socket is unnamed. So that draft ran
// the RED launch, watched an Electron attach to the owner's compositor, and
// reported ISOLATED: two fresh `/run/user/1000/wayland-0` rows existed in the
// table and not one fd in our tree pointed at either (they are the
// compositor's ends), while the Xvfb's own listening socket supplied a
// "presence" that made the verdict look positive. Both halves of the check were
// wrong in the same direction — towards a pass. It was caught only because the
// RED row is REQUIRED to reproduce, and it refused to.
//
// The peer map (`unixPeerMap`, `ss -x -a -n`) is the fix, and [b6]/[b7] are the
// two rows that fail if either half is removed again.
//
// ── SAFETY, AND IT IS NOT BOILERPLATE ──────────────────────────────────────
//
// The owner's desktop session is live on this box. Every launch here goes
// through `spawnGuarded` EXCEPT the two RED rows, which must not (there would
// be no defect to catch), and those two are WINDOW-LESS: they drive
// `lib/ozone-probe-app`, which creates no BrowserWindow at all, so an Electron
// that attaches to his compositor still presents nothing to it. That is
// HAZARD 5's own precedent and this file follows it exactly.
//
// ⚠ `--windowless-only` EXISTS FOR THE MUTATION RUN. To prove this proof, you
// neuter `pinOzoneToX11` on disk and expect [g1] to go red. With the pin gone,
// a windowed row would be a windowed app with no pin — the thing nobody may
// run. [s1] refuses it automatically; the flag says so up front.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator tool.
// ⚠ NO uinput, no xdotool/ydotool/wtype/xte. This file dispatches no input at
//   all, and the only display it ever names is one read out of the argv of an
//   Xvfb inside its own process tree.
//
// harness-guard:allow-raw-launch — rows [r1] and [r2] MUST launch the
// unguarded way; a guarded red is a comparison against itself. Both raw
// children are torn down by `killTree` in the `finally`.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, uptime, loadavg } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  spawnGuarded, killTree, displayArtifacts, pinOzoneToX11, OZONE_X11_FLAG,
  unixSocketTable, boundSocketPaths, compositorSocketPaths, surfaceCensus, surfaceVerdict,
  xSocketPath,
} from './lib/harness-guard.mjs';
import { electronBin, resolveRunRoot, runTarget, announceRunRoot } from './lib/run-root.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const PROBE_APP = join(HERE, 'lib', 'ozone-probe-app');
const CENSUS_PY = join(HERE, 'lib', 'xvfb_window_census.py');

const WINDOWLESS_ONLY = process.argv.includes('--windowless-only');

/** The geometry we ask Xvfb for — the same distinctive size HAZARD 5 used, so
 *  a report carrying it cannot be a coincidence and the two proofs are read
 *  against one number. Both the window census and the verdict derive from
 *  these; there is no second copy of the answer. */
const WIDTH = 1001;
const HEIGHT = 777;
const XVFB_ARGS = ['-a', '-s', `-screen 0 ${WIDTH}x${HEIGHT}x24`];

/** How long the window-less probe stays up so its fds can be read. */
const HOLD_MS = 25000;

// The electron binary, resolved the way ozone-x11-proof resolves it: this file
// runs the synthetic probe app for the RED rows, which needs no `dist/`.
function resolveElectron() {
  const bin = electronBin(resolveRunRoot(ROOT).root);
  if (existsSync(bin)) return bin;
  try {
    const found = createRequire(import.meta.url)('electron');
    if (typeof found === 'string' && existsSync(found)) return found;
  } catch { /* fall through to the honest failure below */ }
  return bin;
}
const ELECTRON = resolveElectron();

const results = [];
const fails = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(id, name, ok, detail) {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}\n        ${String(detail).replace(/\n/g, '\n        ')}`);
  if (!ok) fails.push(`[${id}] ${name} — ${String(detail).split('\n')[0]}`);
}
function unmeasurable(id, name, why) {
  results.push({ id, ok: false });
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${String(why).replace(/\n/g, '\n        ')}`);
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why.split('\n')[0]})`);
}
function refused(id, name, why) {
  results.push({ id, ok: false });
  console.log(`REFUSED  [${id}] ${name}\n        ${String(why).replace(/\n/g, '\n        ')}`);
  fails.push(`[${id}] ${name} (REFUSED: ${why.split('\n')[0]})`);
}

/** One line naming what a tree holds, so a reader sees the evidence not a verdict. */
function describeCensus(c, v) {
  const held = c.processes.flatMap((p) => p.sockets.map(
    (s) => `pid ${p.pid} fd ${s.fd} -> ${s.path} (${s.via}${s.via === 'peer' ? ` via peer inode ${s.peerInode}` : ''})`));
  return `${c.processes.length} process(es) in the tree, ${held.length} named unix socket(s) held, `
    + `${c.unresolved} fd(s) with no unix row (TCP/netlink/socketpair)\n`
    + (held.length ? held.map((h) => `  ${h}`).join('\n') : '  (no named unix socket held)')
    + `\n  verdict ${v.verdict}`
    + (v.escapes.length ? `\n  ESCAPES: ${v.escapes.map((e) => `${e.kind} pid ${e.pid} -> ${e.path}`).join('; ')}` : '')
    + (v.reasons.length ? `\n  reasons: ${v.reasons.join(' | ')}` : '');
}

/** Wait until an Xvfb inside our own tree is visible, and return its display. */
async function waitForOwnedDisplay(child, label, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const art = displayArtifacts(child.pid);
    if (art.displays.length && art.tmpdirs.length) return art;
    await sleep(250);
  }
  throw new Error(`${label}: no owned Xvfb appeared in ${ms / 1000}s`);
}

/** Wait for the window-less probe to write its report. */
async function probeReport(out, child, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (existsSync(out)) {
      try { return JSON.parse(readFileSync(out, 'utf8')); } catch { /* still writing */ }
    }
    await sleep(250);
  }
  return null;
}

/** What is mapped on OUR display, via python-xlib. Never `:0`: `n` comes from
 *  the argv of an Xvfb inside our own tree. */
function windowCensus(n, xauth) {
  const r = spawnSync('python3', [CENSUS_PY, `:${n}`, xauth ?? ''], { encoding: 'utf8' });
  if (r.error) return { ok: false, error: `python3 could not run: ${r.error.message}` };
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); }
  catch { return { ok: false, error: `unparseable census output (status ${r.status}): ${(r.stdout || r.stderr || '').slice(0, 300)}` }; }
}

/** The Xauthority an xvfb-run tempdir carries. */
const xauthOf = (art) => (art.tmpdirs[0] ? join(art.tmpdirs[0], 'Xauthority') : null);

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const t0 = Date.now();
  console.log(`surface-isolation-proof — started ${new Date().toISOString()}`);
  console.log(`  compositor path(s) derived from OUR OWN inherited environment: `
    + `${JSON.stringify(compositorSocketPaths())}`);
  console.log(`  (XDG_RUNTIME_DIR / WAYLAND_DISPLAY, never a listing of his runtime directory)`);
  if (WINDOWLESS_ONLY) console.log('  --windowless-only: the windowed rows will not run.\n');

  if (!existsSync(ELECTRON)) {
    console.error(`no electron at ${ELECTRON} — run npm install, or set ELECTRON_BIN`);
    process.exit(2);
  }

  const tmp = mkdtempSync(join(tmpdir(), 'surface-isolation-'));
  let red = null; let redBlind = null; let green = null; let windowed = null;

  try {
    // ── [r1] RED, WINDOW-LESS: the pre-2026-08-30 shape ───────────────────
    {
      const out = join(tmp, 'red.json');
      const env = { ...process.env, OZONE_PROBE_HOLD_MS: String(HOLD_MS) };
      delete env.DISPLAY;                       // the X11 gesture, which is not the door
      red = spawn('/usr/bin/xvfb-run', [...XVFB_ARGS, ELECTRON, PROBE_APP, out],
        { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
      const rep = await probeReport(out, red);
      const art = displayArtifacts(red.pid);
      const c = surfaceCensus(red.pid);
      const v = surfaceVerdict(c, { ourDisplay: art.displays[0]?.n ?? null });
      if (rep === null) {
        unmeasurable('r1', 'RED: the unpinned shape holds a COMPOSITOR socket',
          'the window-less probe never wrote a report, so nothing was measured either way');
      } else if (v.verdict === 'ESCAPED' && v.escapes.some((e) => e.kind === 'COMPOSITOR')) {
        check('r1', 'RED: the unpinned window-less launch holds a live COMPOSITOR connection', true,
          `${describeCensus(c, v)}\n`
          + `the app ALSO reported it could see: ${(rep.displays ?? []).map((d) => `${d.width}x${d.height}@${d.scaleFactor}`).join(', ')} `
          + `(we asked Xvfb for ${WIDTH}x${HEIGHT})`);
      } else {
        unmeasurable('r1', 'RED: the unpinned shape holds a COMPOSITOR socket',
          `no compositor socket was found in the unpinned tree (verdict ${v.verdict}). The hazard `
          + 'depends on a reachable compositor in the inherited environment; without one there is '
          + 'nothing to leak to, and EVERY GREEN ROW BELOW THEREFORE PROVES NOTHING and must not '
          + `be read as a pass.\n${describeCensus(c, v)}`);
      }
      await killTree(red); red = null;
    }

    // ── [r2] RED, and an environ audit reads CLEAN over it ────────────────
    {
      const out = join(tmp, 'red-blind.json');
      const env = { ...process.env, OZONE_PROBE_HOLD_MS: String(HOLD_MS) };
      delete env.DISPLAY;
      delete env.WAYLAND_DISPLAY;               // HAZARD 5: hiding the variable hides nothing
      redBlind = spawn('/usr/bin/xvfb-run', [...XVFB_ARGS, ELECTRON, PROBE_APP, out],
        { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
      const rep = await probeReport(out, redBlind);
      const art = displayArtifacts(redBlind.pid);
      const c = surfaceCensus(redBlind.pid);
      const v = surfaceVerdict(c, { ourDisplay: art.displays[0]?.n ?? null });
      const compHeld = v.escapes.filter((e) => e.kind === 'COMPOSITOR');
      if (rep === null) {
        unmeasurable('r2', 'RED: an environ audit reads CLEAN while the socket says otherwise',
          'the window-less probe never wrote a report');
      } else {
        // The environ audit, performed exactly as the old proof would: what did
        // the APP say its own environment was? This is the value that misleads.
        const envAudit = `DISPLAY=${rep.DISPLAY} WAYLAND_DISPLAY=${rep.WAYLAND_DISPLAY}`;
        const envLooksClean = rep.WAYLAND_DISPLAY === null;
        check('r2', 'THE THESIS: the environ read says isolated, the SOCKET says escaped',
          envLooksClean && compHeld.length > 0,
          `environ audit of the live app: ${envAudit} — a proof reading this concludes "no Wayland".\n`
          + `${describeCensus(c, v)}\n`
          + (compHeld.length
            ? 'The variable was gone and the connection was there: libwayland fell back to the '
              + 'literal "wayland-0" under $XDG_RUNTIME_DIR, exactly as HAZARD 5 says.'
            : 'NO compositor socket was found, so this row did not reproduce the divergence.'));
      }
      await killTree(redBlind); redBlind = null;
    }

    // ── [g1] GREEN, WINDOW-LESS: the same app through spawnGuarded ────────
    {
      const out = join(tmp, 'green.json');
      const env = { ...process.env, OZONE_PROBE_HOLD_MS: String(HOLD_MS) };
      delete env.DISPLAY;
      green = spawnGuarded('/usr/bin/xvfb-run', [...XVFB_ARGS, ELECTRON, PROBE_APP, out],
        { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'] });
      const rep = await probeReport(out, green);
      const art = displayArtifacts(green.pid);
      const c = surfaceCensus(green.pid);
      const v = surfaceVerdict(c, { ourDisplay: art.displays[0]?.n ?? null });
      if (rep === null) {
        unmeasurable('g1', 'GREEN: the guarded window-less launch is SURFACE-ISOLATED',
          'the window-less probe never wrote a report');
      } else {
        check('g1', 'GREEN: the guarded window-less launch holds OUR X socket and no compositor',
          v.verdict === 'ISOLATED',
          `our Xvfb is :${art.displays[0]?.n} (${xSocketPath(art.displays[0]?.n)})\n${describeCensus(c, v)}`);
      }
      await killTree(green); green = null;
    }

    // ── [s1] SAFETY INTERLOCK, then the WINDOWED rows ─────────────────────
    const RUN = announceRunRoot(runTarget(ROOT));
    const winArgs = [...XVFB_ARGS, RUN.electron, RUN.main];
    // FORCE_UNPINNED exists so the interlock can be WATCHED REFUSING without
    // anybody neutering the guard on disk first. Mutating `pinOzoneToX11` and
    // then running the windowed rows would put an unpinned windowed Electron
    // one interlock-bug away from the owner's live desktop — the interlock is
    // the thing under test, so it cannot also be the thing relied on. This
    // switch falsifies only the proof's own view of the argv; the guard is
    // untouched and the refusal branch spawns nothing at all.
    const pinnedArgs = process.env.SURFACE_PROOF_FORCE_UNPINNED
      ? winArgs
      : pinOzoneToX11('/usr/bin/xvfb-run', winArgs);
    const binAt = pinnedArgs.indexOf(RUN.electron);
    const flagAt = pinnedArgs.indexOf(OZONE_X11_FLAG);
    const pinIsSound = binAt !== -1 && flagAt === binAt + 1;
    check('s1', 'SAFETY INTERLOCK: the argv about to carry a WINDOW is pinned to x11, in position',
      pinIsSound,
      `${pinnedArgs.join(' ')}\n        electron at ${binAt}, ${OZONE_X11_FLAG} at ${flagAt} `
      + `(want ${binAt + 1}). Unpinned, HAZARD 5 says this attaches to the owner's compositor — `
      + 'and a windowed app on his compositor is one `show` away from his desktop.');

    if (WINDOWLESS_ONLY) {
      console.log('\n  --windowless-only: [w1] and [w2] not run by request.');
    } else if (!pinIsSound) {
      refused('w1', 'WINDOWED: a real Aurora is mapped on OUR Xvfb',
        'the Ozone pin is absent or misplaced, so launching a WINDOWED app would risk putting it '
        + "on the owner's live session. Refused rather than run. This is the interlock working, "
        + 'not a flake.');
      refused('w2', 'WINDOWED: the live tree is SURFACE-ISOLATED', 'see [w1] — no windowed launch happened.');
    } else if (!existsSync(RUN.main)) {
      unmeasurable('w1', 'WINDOWED: a real Aurora is mapped on OUR Xvfb',
        `no built app at ${RUN.main} — run npm run build in a tree this can borrow, or set `
        + 'AURORA_BUILT_TREE. Nothing was launched.');
      unmeasurable('w2', 'WINDOWED: the live tree is SURFACE-ISOLATED', 'see [w1] — no windowed launch happened.');
    } else {
      const env = { ...process.env, AURORA_NO_GPU: '1' };
      delete env.DISPLAY;
      windowed = spawnGuarded('/usr/bin/xvfb-run', winArgs,
        { cwd: RUN.root, env, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      windowed.stderr?.on('data', (d) => { stderr += String(d); });
      const art = await waitForOwnedDisplay(windowed, 'windowed');
      const n = art.displays[0].n;
      const xauth = xauthOf(art);

      // [w1] POSITIVE PRESENCE. Poll: the window appears some seconds after the
      // process does, and "not yet" must not be read as "isolated".
      let cen = null; let win = null;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        cen = windowCensus(n, xauth);
        win = cen.ok ? cen.windows.find((w) => w.viewable && w.w > 200 && w.h > 200) : null;
        if (win) break;
        await sleep(1000);
      }
      if (!cen?.ok) {
        unmeasurable('w1', 'WINDOWED: a real Aurora is mapped on OUR Xvfb',
          `the window census could not look: ${cen?.error}. UNKNOWN, not empty.`);
      } else if (!win) {
        check('w1', 'WINDOWED: a real Aurora is mapped on OUR Xvfb', false,
          `the census connected to :${n} (screen ${cen.screen.width}x${cen.screen.height}) and found `
          + `${cen.windows.length} window(s), none of them a viewable app window. The app did not `
          + `start, or did not attach here.\n        app stderr tail: ${stderr.slice(-400) || '(none)'}`);
      } else {
        check('w1', 'WINDOWED: a real Aurora is mapped ON OUR XVFB, at the geometry we asked for',
          cen.screen.width === WIDTH && cen.screen.height === HEIGHT,
          `census of :${n} — screen ${cen.screen.width}x${cen.screen.height} (asked Xvfb for ${WIDTH}x${HEIGHT}); `
          + `${cen.windows.length} window(s), the app's is id ${win.id} `
          + `${win.w}x${win.h}+${win.x}+${win.y} viewable=${win.viewable} name=${JSON.stringify(win.name)} `
          + `class=${JSON.stringify(win.wm_class)}\n`
          + 'This is a PRESENCE, not an absence: an isolation proof that only asserts "nothing over '
          + 'there" passes just as well when nothing started at all.');
      }

      // [w2] THE HALF HAZARD 5 COULD ONLY INFER.
      const c = surfaceCensus(windowed.pid);
      const v = surfaceVerdict(c, { ourDisplay: n });
      check('w2', 'WINDOWED: the live tree holds OUR X socket and NO compositor socket', v.verdict === 'ISOLATED',
        `our Xvfb is :${n} (${xSocketPath(n)})\n${describeCensus(c, v)}\n`
        + 'HAZARD 5 measured the window-less case only and said the windowed case was INFERRED. '
        + 'This row measures it.');

      await killTree(windowed); windowed = null;
    }

    // ── [n1] the window census reports blindness, not emptiness ───────────
    {
      // A display number nothing is bound to. Derived, and never :0 — a socket
      // that does not exist cannot be anybody's session.
      let free = 990;
      while (free < 1024 && existsSync(xSocketPath(free))) free++;
      const cen = windowCensus(free, null);
      check('n1', 'NON-VACUITY: against a display that does not exist the census says ok:false',
        cen.ok === false && typeof cen.error === 'string',
        `:${free} (${xSocketPath(free)} does not exist) -> ${JSON.stringify(cen).slice(0, 200)}\n`
        + 'If this returned an empty window list instead, [w1] would pass over a display nobody '
        + 'was ever connected to.');
    }

    // ── [b1..b5] BLINDNESS, every path, driven for real ───────────────────
    {
      const t = unixSocketTable('/proc/net/does-not-exist');
      check('b1', 'BLIND: an unreadable socket table is null, and boundSocketPaths inherits it',
        t === null && boundSocketPaths('/proc/net/does-not-exist') === null,
        `unixSocketTable -> ${t}, boundSocketPaths -> ${boundSocketPaths('/proc/net/does-not-exist')} `
        + '(an empty Set here is the fail-open bug this module is named after)');
    }
    {
      const c = surfaceCensus(process.pid, { table: null });
      const v = surfaceVerdict(c, { ourDisplay: 91 });
      check('b2', 'BLIND: a null socket table makes the census blind and the verdict UNKNOWN',
        c.blind === true && c.blindReasons.length > 0 && v.verdict === 'UNKNOWN',
        `blind=${c.blind} verdict=${v.verdict}\n  ${c.blindReasons.join('\n  ')}`);
    }
    {
      // A REAL EACCES, on a path that genuinely refuses this uid: /proc/1/fd.
      // And a REAL LIVE CHILD to walk, because `surfaceCensus` skips our own
      // pid — the first draft of this row censused `process.pid`, whose only
      // descendant IS us, so the injected reader was never called and the row
      // passed on a census that had looked at nothing. Which is the failure it
      // was written to forbid, in the row forbidding it.
      let realCode = null;
      try { readdirSync('/proc/1/fd'); } catch (e) { realCode = e.code; }
      const sleeper = spawnGuarded('/bin/sleep', ['30'], { stdio: 'ignore' });
      try {
        const c = surfaceCensus(sleeper.pid, {
          readFds: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; },
        });
        const v = surfaceVerdict(c, { ourDisplay: 91 });
        check('b3', 'BLIND: a LIVE process whose /proc/<pid>/fd refuses us is UNKNOWN, not empty',
          c.blind === true && v.verdict === 'UNKNOWN' && realCode === 'EACCES'
            && c.processes.some((p) => p.unreadableFd === 'EACCES'),
          `/proc/1/fd really does refuse this uid with ${realCode}, which is the branch driven here.\n`
          + `censused a live child (pid ${sleeper.pid}); blind=${c.blind} verdict=${v.verdict}\n  `
          + `${c.blindReasons.slice(0, 2).join('\n  ')}`);
      } finally { await killTree(sleeper, { quiet: true }); }
    }
    {
      const c = surfaceCensus(process.pid, { peers: null });
      const v = surfaceVerdict(c, { ourDisplay: 91 });
      check('b6', 'BLIND: without the unix_diag PEER table the census refuses to answer',
        c.blind === true && v.verdict === 'UNKNOWN'
          && c.blindReasons.some((r) => /INVISIBLE/.test(r)),
        `blind=${c.blind} verdict=${v.verdict}\n  ${c.blindReasons.join('\n  ')}\n`
        + 'This is the row that would have been missing if the first draft had shipped: without '
        + 'the peer map an escaped app resolves to nothing and reads exactly like a clean one.');
    }
    {
      const c = surfaceCensus(process.pid);
      const v = surfaceVerdict(c, { ourDisplay: 91, compositor: compositorSocketPaths({}) });
      check('b4', 'BLIND: with no derivable compositor path the verdict is UNKNOWN, never clean',
        v.verdict === 'UNKNOWN' && v.reasons.some((r) => /never actually tested/.test(r)),
        `compositorSocketPaths({}) -> [] ; verdict=${v.verdict}\n  ${v.reasons.join('\n  ')}`);
    }
    {
      const empty = { blind: false, blindReasons: [], processes: [], pids: [], unresolved: 0 };
      const v = surfaceVerdict(empty, { ourDisplay: 91 });
      check('b5', 'BLIND: a tree holding NOTHING is UNKNOWN — an app that never started is not isolated',
        v.verdict === 'UNKNOWN',
        `verdict=${v.verdict}\n  ${v.reasons.join('\n  ')}`);
    }
    {
      // THE X SERVER IS NOT A CLIENT. This is the RED run's exact shape: the
      // Xvfb we started holds its own listening socket while the app is off on
      // somebody else's compositor. A verdict that counted the server would
      // call that ISOLATED.
      const serverOnly = {
        blind: false,
        blindReasons: [],
        pids: [],
        unresolved: 0,
        processes: [{
          pid: 4242,
          argv: 'Xvfb :91 -screen 0 1001x777x24 -nolisten tcp',
          sockets: [{ fd: '7', inode: '1', path: xSocketPath(91), via: 'direct', peerInode: null }],
          vanished: false,
          unreadableFd: null,
        }],
      };
      const v = surfaceVerdict(serverOnly, { ourDisplay: 91 });
      check('b7', 'BLIND: our X socket held ONLY by the Xvfb we started is UNKNOWN, not ISOLATED',
        v.verdict === 'UNKNOWN' && v.clients.length === 0 && v.ours.length === 1,
        `verdict=${v.verdict} ours=${v.ours.length} clients=${v.clients.length}\n  ${v.reasons.join('\n  ')}`);
    }
  } finally {
    if (red) await killTree(red).catch(() => {});
    if (redBlind) await killTree(redBlind).catch(() => {});
    if (green) await killTree(green).catch(() => {});
    if (windowed) await killTree(windowed).catch(() => {});
    rmSync(tmp, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} rows passed ════`);
  // EVERY TIMING FIGURE SHIPS WITH THE MACHINE'S STATE. This box runs several
  // agents at once; an elapsed time with no load beside it is not comparable to
  // the next run's.
  console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s — box uptime ${(uptime() / 3600).toFixed(1)}h, `
    + `load ${loadavg().map((l) => l.toFixed(2)).join(' ')}`);
  if (fails.length) {
    console.log('\nFAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
