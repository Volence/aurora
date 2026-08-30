#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// harness-guard-proof — RED-FIRST evidence that the O16 guards guard anything
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run build && npm run harness:guard-proof
//
// This repo's dominant defect class is guards that assert nothing
// (docs/OVERSEER.md bar 2, 2b, 2c, 2d). "The discovery file was restored" is
// trivially assertable and trivially vacuous: it passes just as green when the
// restore is a no-op over a file nothing ever touched.
//
// So every guard below is run BOTH WAYS in the same process, against a REAL
// Electron:
//
//   [d*]  the discovery restore, with the restore DISABLED — the file must come
//         back WRONG and this must SEE it — then enabled, byte-identical.
//   [k*]  killTree, with it DISABLED — `child.kill()` on the xvfb-run wrapper
//         must leave a LIVE orphan Electron and this must SEE it — then
//         enabled, zero survivors.
//   [o*]  the ownership rule, CONSTRUCTED. ⚠ Never by pointing anything at the
//         owner's Aurora. A discovery file is written naming a pid that is
//         alive and is NOT our descendant (a `sleep` spawned outside the guard's
//         tree), and the rule must REFUSE it. The failure mode being proved is
//         SILENT SUCCESS, so the row proves a REFUSAL — not the absence of a
//         crash.
//
// Every row PRINTS THE ARTIFACT IT JUDGED (bar 2d cause (iii)): the discovery
// bytes it read, the pid it resolved or refused, the argv of every process in
// the tree it killed. A row that says "restored" without showing the file is
// the exact shape that shipped a green row over an empty grid.
//
// ⚠ THIS FILE DELIBERATELY CLOBBERS ~/.aurora/mcp.json — that is what phase [d]
// is about. It therefore takes its OWN meta-snapshot at the very top, OUTSIDE
// the mechanism under test, and restores from it unconditionally at the very
// end. And it REFUSES TO START if that file currently names a live pid that is
// not ours: that is the owner's Aurora running, and nothing here may write over
// a file his editor owns.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator tool.
//
// harness-guard:allow-raw-launch — the RED half of [d] and [k] must launch the
// app the UNGUARDED way, or there is no defect to catch. Every raw launch here
// is torn down by killTree before the file exits, and the meta-restore in the
// `finally` puts the discovery files back regardless. check-harness-guards.mjs
// reads this marker, prints it as a declared exemption on every run, and would
// fail this file without it.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  spawnGuarded, killTree, killTreeSync, descendants, alive, cmdlineOf,
  snapshotDiscovery, restoreDiscovery, describeDiscovery, readDiscoveryNow,
  resolveOwnedDiscovery, DISCOVERY_FILES, setDiscoveryBaseline,
  displayArtifacts, reapDisplays,
} from './lib/harness-guard.mjs';

const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const note = (t, d) => console.log(`  · ${t}: ${d}`);
/** k9's own liveness read — alive and not a zombie — deliberately NOT the
 *  helper's `running`, so the observer shares nothing with the thing observed. */
const runningPid = (pid) => {
  if (!alive(pid)) return false;
  try { return !/^State:\s*Z/m.test(readFileSync(`/proc/${pid}/status`, 'utf8')); } catch { return false; }
};

/** Launch the real app the way every harness does. Not through spawnGuarded in
 *  the phases that must show the UNGUARDED behaviour — that is the point. */
function launchRaw(port) {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(port), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  return spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 800x600x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
}

/** Wait until the app has published a discovery file naming a pid under `root`.
 *  Returns the parsed file or null. */
async function waitForOurDiscovery(root, ms = 40000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ours = descendants(root);
    for (const f of DISCOVERY_FILES) {
      try {
        const j = JSON.parse(readFileSync(f, 'utf8'));
        if (j.port && ours.has(j.pid)) return { ...j, from: f, raw: readFileSync(f, 'utf8') };
      } catch { /* not yet */ }
    }
    await sleep(300);
  }
  return null;
}

async function main() {
  if (!existsSync(`${ROOT}/dist/main/index.mjs`)) {
    console.error(`no build at ${ROOT}/dist/main/index.mjs — run npm run build first`);
    process.exit(2);
  }

  // ── META-SNAPSHOT: taken outside everything below, restored unconditionally ─
  const meta = snapshotDiscovery();
  // ONE AUTHORITY, NOT TWO. Without this, `spawnGuarded` would snapshot at its
  // first launch — which in this file is AFTER phase [o] has planted a foreign
  // pid — and the exit-handler net would then faithfully restore THE PLANT,
  // seconds after the `finally` below deleted it. Measured: the first run of
  // this harness left ~/.aurora/mcp.json holding a dead pid exactly that way.
  setDiscoveryBaseline(meta);
  console.log('=== META-SNAPSHOT (this file\'s own restore-what-you-took contract) ===');
  console.log(`        ${describeDiscovery(meta)}\n`);

  // REFUSE TO RUN over a file a live foreign app owns.
  for (const { f, content } of meta) {
    if (content === null) continue;
    let j = null;
    try { j = JSON.parse(content); } catch { continue; }
    if (Number.isInteger(j.pid) && alive(j.pid)) {
      console.error(`REFUSING TO RUN: ${f} names pid ${j.pid}, which is ALIVE and is not ours.`);
      console.error(`        ${cmdlineOf(j.pid).slice(0, 160)}`);
      console.error('That is an Aurora somebody else started — very possibly the owner\'s. Phase [d]');
      console.error('clobbers this file on purpose, and nothing here may write over a live app\'s file.');
      process.exit(3);
    }
  }

  try {
    // ═══ [o] THE OWNERSHIP RULE — CONSTRUCTED, never against a real foreign app
    //
    // A `sleep` spawned with node's plain `spawn` is a child of THIS process but
    // NOT of anything registered with the guard, so from the guard's point of
    // view it is exactly as foreign as the owner's Aurora — alive, real, and not
    // ours. Its pid goes into a discovery file and the rule must refuse it.
    console.log('\n=== [o] the ownership rule ===');
    const foreign = spawn('/bin/sleep', ['120'], { stdio: 'ignore', detached: true });
    await sleep(300);
    const foreignFile = {
      url: 'http://127.0.0.1:38473/mcp', port: 38473, pid: foreign.pid,
      aether: 'http://127.0.0.1:38473/aether', protocolVersion: 1,
    };
    writeFileSync(DISCOVERY_FILES[0], JSON.stringify(foreignFile, null, 2));
    note('planted', `${DISCOVERY_FILES[0]} now names pid ${foreign.pid} (${cmdlineOf(foreign.pid)}), alive=${alive(foreign.pid)}`);
    note('planted bytes', readFileSync(DISCOVERY_FILES[0], 'utf8').replace(/\n\s*/g, ' '));

    // Nothing has been spawned through the guard yet, so `ownedRoots()` is empty
    // and there is no app this harness may claim.
    const o1 = await resolveOwnedDiscovery({ timeoutMs: 1200 });
    check('o1', 'a LIVE, REAL, foreign pid in the discovery file is REFUSED (nothing owned yet)',
      o1.ok === false,
      o1.ok ? `ACCEPTED port ${o1.port} pid ${o1.pid} — THE RULE IS NOT GUARDING` : `refused: ${o1.why}`);

    // Now launch a real app through the guard and re-run the SAME query. The
    // planted foreign file is still on disk; the app will overwrite one of the
    // two paths with its own. The rule must land on the app's, not the plant's.
    const genv = { ...process.env, AURORA_DEBUG_PORT: '9481', AURORA_NO_GPU: '1' };
    delete genv.DISPLAY;
    const guarded = spawnGuarded('/usr/bin/xvfb-run',
      ['-a', '-s', '-screen 0 800x600x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
      { cwd: ROOT, env: genv, stdio: ['ignore', 'ignore', 'ignore'] });
    const o2 = await resolveOwnedDiscovery({ timeoutMs: 45000 });
    for (const r of o2.rejected ?? []) note('refused', r);
    if (!o2.ok) {
      unmeasurable('o2', 'the rule ACCEPTS an app this harness did launch',
        `${o2.why} — the app never published, so the accept side is untested`);
    } else {
      const isOurs = descendants(guarded.pid).has(o2.pid);
      check('o2', 'the rule ACCEPTS an app this harness did launch, and only via descent',
        isOurs && o2.pid !== foreign.pid,
        `accepted ${o2.from} port ${o2.port} pid ${o2.pid}; descendant of ${guarded.pid}=${isOurs}; `
        + `plant pid was ${foreign.pid}\n        bytes: ${o2.raw.replace(/\n\s*/g, ' ')}`);
      check('o3', 'the accepted pid is a REAL Electron, not the plant',
        /electron|index\.mjs/i.test(cmdlineOf(o2.pid)),
        `argv of ${o2.pid}: ${cmdlineOf(o2.pid).slice(0, 140)}`);
    }
    await killTree(guarded, { graceMs: 1500 });
    try { process.kill(foreign.pid, 'SIGKILL'); } catch { /* gone */ }
    note('cleanup', `killed the constructed foreign pid ${foreign.pid} (spawned by this file, so ours to kill)`);

    // ═══ [d] THE DISCOVERY RESTORE, RED THEN GREEN ═══════════════════════════
    //
    // A known, distinctive pre-run state so "restored" is checkable against
    // something rather than against whatever happened to be there.
    console.log('\n=== [d] the discovery-file restore ===');
    const SENTINEL = JSON.stringify({ url: 'http://127.0.0.1:1/mcp', port: 1, pid: 999999, marker: 'PRE-RUN-SENTINEL' }, null, 2);
    for (const f of DISCOVERY_FILES) writeFileSync(f, SENTINEL);
    const preRun = snapshotDiscovery();
    note('pre-run state', describeDiscovery(preRun));

    // ---- RED: launch, then tear down WITHOUT restoring ----------------------
    const redApp = launchRaw(9482);
    const redDisc = await waitForOurDiscovery(redApp.pid);
    if (!redDisc) {
      unmeasurable('d1', 'the app overwrites the shared discovery file',
        'the app never published a discovery file naming a pid under it — nothing to observe');
      await killTree(redApp, { graceMs: 1500 });
    } else {
      note('app published', `${redDisc.from} port=${redDisc.port} pid=${redDisc.pid}`);
      const nowRaw = DISCOVERY_FILES.map((f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } });
      check('d1', 'RED — the launched app OVERWRITES the shared discovery file',
        nowRaw.some((r) => r !== SENTINEL),
        `pre-run: ${SENTINEL.replace(/\n\s*/g, ' ')}\n        now:    ${(nowRaw[0] ?? '(absent)').replace(/\n\s*/g, ' ')}`);

      // Tear the app down with the restore DELIBERATELY SUPPRESSED.
      await killTree(redApp, { graceMs: 1500, quiet: true });
      await sleep(400);
      const afterNoRestore = DISCOVERY_FILES.map((f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } });
      check('d2', 'RED — with the restore disabled, the file is left WRONG and this check SEES it',
        afterNoRestore.some((r) => r !== SENTINEL),
        `on disk with no restore:\n        ${afterNoRestore.map((r, i) => `${DISCOVERY_FILES[i]} => ${r === null ? '(DELETED by the app\'s own shutdown)' : r.replace(/\n\s*/g, ' ')}`).join('\n        ')}`);

      // ---- GREEN: the same teardown, restore enabled ------------------------
      const done = restoreDiscovery(preRun);
      for (const d of done) note('restore', d);
      const afterRestore = DISCOVERY_FILES.map((f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } });
      check('d3', 'GREEN — after restoreDiscovery both files are byte-identical to the pre-run state',
        afterRestore.every((r) => r === SENTINEL),
        `on disk after restore:\n        ${afterRestore.map((r, i) => `${DISCOVERY_FILES[i]} => ${r === null ? '(absent)' : r.replace(/\n\s*/g, ' ')}`).join('\n        ')}`);
      check('d4', 'and d2/d3 actually differ — the restore is not a no-op over an untouched file',
        afterNoRestore.some((r, i) => r !== afterRestore[i]),
        `no-restore[0]=${(afterNoRestore[0] ?? '(absent)').slice(0, 60).replace(/\n\s*/g, ' ')} vs `
        + `restored[0]=${(afterRestore[0] ?? '(absent)').slice(0, 60).replace(/\n\s*/g, ' ')}`);
    }

    // ═══ [k] killTree, RED THEN GREEN ════════════════════════════════════════
    console.log('\n=== [k] the orphaned Electron ===');

    // ---- RED: child.kill() on the xvfb-run wrapper only ---------------------
    const redK = launchRaw(9483);
    const redKDisc = await waitForOurDiscovery(redK.pid);
    if (!redKDisc) {
      unmeasurable('k1', 'child.kill() leaves a live orphan',
        'the app never came up, so there is no tree to orphan');
      await killTree(redK, { graceMs: 1000, quiet: true });
    } else {
      const treeBefore = [...descendants(redK.pid)];
      note('tree before kill', treeBefore.map((p) => `${p} ${cmdlineOf(p).slice(0, 70)}`).join('\n                        '));
      // The X display this run owns, captured for the same reason the tree is —
      // this is the ONE teardown in this file that does not go through killTree,
      // so it is the one place the O20 reap has to be written out by hand.
      // Measured before it was: this phase leaked a lock, a socket and an
      // xvfb-run tempdir on EVERY run of the proof, which made the instrument
      // that polices the leak a contributor to it.
      const redKArt = displayArtifacts(redK.pid);
      redK.kill();                      // ← THE DEFECT: signals the WRAPPER only
      await sleep(2500);
      const survivors = treeBefore.filter((p) => p !== redK.pid && alive(p));
      check('k1', 'RED — child.kill() kills the xvfb-run wrapper and LEAVES the Electron alive',
        survivors.length > 0,
        `wrapper ${redK.pid} alive=${alive(redK.pid)}; ${survivors.length} survivor(s):\n        `
        + (survivors.length
          ? survivors.map((p) => `${p} ${cmdlineOf(p).slice(0, 100)}`).join('\n        ')
          : 'NONE — this environment tears the group down on its own, so the hazard is not reproducible here'));
      check('k2', 'RED — and the orphan has ESCAPED the tree: it no longer descends from the wrapper',
        survivors.length > 0 && survivors.some((p) => !descendants(redK.pid).has(p)),
        'reading the tree AFTER the signal finds nothing — the orphans reparent to init, which is '
        + 'exactly why killTree must capture the tree BEFORE the first signal');
      // Clean up the orphan by hand. These pids came from a process THIS FILE
      // spawned, which is the only licence anything here has to signal them.
      let n = 0;
      for (const p of survivors) { try { process.kill(p, 'SIGKILL'); n++; } catch { /* */ } }
      await sleep(500);
      note('red cleanup', `SIGKILLed ${n} orphan(s) by pid from the pre-kill tree: ${survivors.join(' ')}`);
      check('k3', 'the RED orphans are gone before the GREEN phase starts',
        survivors.every((p) => !alive(p)),
        survivors.map((p) => `${p} alive=${alive(p)}`).join(' · ') || 'none');
      const redKReap = reapDisplays(redKArt, { quiet: true });
      note('red cleanup', `X artifacts from the RED display: ${redKReap.removed.join(' ') || 'none'}`
        + `${redKReap.refused.length ? ` · refused: ${redKReap.refused.join('; ')}` : ''}`);
    }

    // ---- GREEN: the same launch, torn down with killTree ---------------------
    const greenK = launchRaw(9484);
    const greenKDisc = await waitForOurDiscovery(greenK.pid);
    if (!greenKDisc) {
      unmeasurable('k4', 'killTree leaves no survivor', 'the app never came up');
    } else {
      const treeBefore = [...descendants(greenK.pid)];
      const out = await killTree(greenK, { graceMs: 2000 });
      await sleep(600);
      const survivors = treeBefore.filter(alive);
      check('k4', 'GREEN — killTree leaves ZERO survivors from the same tree',
        survivors.length === 0,
        `tree was ${treeBefore.length} process(es) [${treeBefore.join(' ')}]; killTree SIGKILLed ${out.killed}; `
        + `survivors: ${survivors.length ? survivors.map((p) => `${p} ${cmdlineOf(p)}`).join(', ') : 'none'}`);
      check('k5', 'and it killed MORE than the wrapper — the Electron itself was in the tree it signalled',
        treeBefore.length > 1,
        `tree under the wrapper ${greenK.pid}:\n        ${(out.seen ?? []).join('\n        ')}`);
    }

    // ---- k6/k7: the BARE-PID spelling (O65) ----------------------------------
    //
    // Three harnesses wrote `killTree(child.pid)` — the pid, not the
    // ChildProcess. The helper read `.pid` off a number, got undefined, and
    // returned a silent no-op; the whole tree survived the harness's own
    // teardown and the harness hung on its pipes to it. These two rows hand the
    // helpers exactly that argument. No Electron is needed for the property:
    // a two-process shell tree is a tree. Cheap on purpose, so the row cannot
    // be UNMEASURABLE for an app-side reason.
    for (const [id, fn, label] of [['k6', killTree, 'killTree'], ['k7', killTreeSync, 'killTreeSync']]) {
      const t = spawn('/bin/sh', ['-c', 'sleep 300 & exec sleep 300'], { stdio: 'ignore', detached: true });
      await sleep(300);
      const before = [...descendants(t.pid)];
      const out = await fn(t.pid, { graceMs: 500, quiet: true, reap: false });   // the pid, not `t`
      await sleep(300);
      const survivors = before.filter(alive);
      if (survivors.length) { for (const p of survivors) { try { process.kill(p, 'SIGKILL'); } catch { /* */ } } }
      check(id, `${label} given a BARE PID (the \`killTree(child.pid)\` spelling) kills the whole tree`,
        // `out.tree` is the no-op detector: the silent version returned [] without
        // looking. `killed` is NOT asserted — `sleep` honours SIGTERM inside the
        // grace period, so a correct run has nothing left to SIGKILL and reports 0.
        before.length >= 2 && survivors.length === 0 && out.tree.length === before.length,
        `tree before: ${before.length} [${before.join(' ')}]; helper saw ${out.tree.length}; result ${JSON.stringify({ killed: out.killed, note: out.note })}; `
        + `survivors: ${survivors.length ? survivors.join(',') : 'none'}${survivors.length ? ' (SIGKILLed by the proof itself)' : ''}`);
    }

    // ---- k8: killTree STARTED but not awaited, then the exit net (O65) -------
    //
    // Three harnesses call `killTree(child)` WITHOUT await and then
    // `process.exit()`. killTree SIGTERMs before its first `await`, the
    // xvfb-run wrapper dies at once, everything under it is reparented away,
    // and the exit net's `killTreeSync` then walks /proc from a dead pid and
    // finds nothing to reap. The tempdir leaks — measured 23 -> 24 on
    // section-raster-select-harness.mjs. This row does exactly that sequence
    // against a real xvfb-run (its tempdir is the artifact only the wrapper's
    // own `rm -r`, or our reap, ever removes) with `sleep` standing in for the
    // app. The lock is NOT the discriminator — a SIGTERMed Xvfb removes its own
    // — the tempdir is, and the check runs INSIDE the un-awaited grace, before
    // the background half could reap it for us.
    {
      const t = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 320x240x8', '/bin/sleep', '300'],
        { stdio: 'ignore', detached: true });
      let art = null;
      for (let i = 0; i < 50 && !(art && art.displays.length && art.tmpdirs.length); i++) {
        await sleep(200); art = displayArtifacts(t.pid);
      }
      if (!art || !art.displays.length || !art.tmpdirs.length) {
        unmeasurable('k8', 'un-awaited killTree + exit net still reaps',
          `xvfb-run never produced a display and tempdir under ${t.pid}: ${JSON.stringify(art)}`);
        await killTree(t, { graceMs: 500, quiet: true });
      } else {
        const dir = art.tmpdirs[0];
        const before = [...descendants(t.pid)];
        const bg = killTree(t, { graceMs: 3000, quiet: true });   // NOT awaited — the shape under test
        await sleep(50);                                            // the harness printed its summary here
        const net = killTreeSync(t);                                // what process.exit's handler does
        await sleep(300);
        const dirGone = !existsSync(dir);
        const survivors = before.filter(alive);
        check('k8', 'killTree started but NOT awaited, then the exit net — the net still reaps the tempdir and the pids captured before the first signal',
          dirGone && survivors.length === 0 && net.tree.length === before.length,
          `display :${art.displays[0].n}, tempdir ${dir}: gone=${dirGone} at +350 ms; net saw ${net.tree.length} pid(s) `
          + `(killTree had captured ${before.length}); survivors: ${survivors.length ? survivors.join(',') : 'none'}`);
        await bg;                                                   // let the background half finish; nothing outlives the proof
        if (!dirGone) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
      }
    }

    // ---- k9: the teardown is ORDERED, seen from OUTSIDE the helper (O65 ruling)
    //
    // One SIGTERM to the wrapper's group hit Xvfb and the Electron at the same
    // instant; when Xvfb won, the Electron's X connection broke mid-shutdown
    // and Chromium fataled (SIGTRAP core, Timestamp == the SIGTERM instant; 6
    // of 17 band-preset runs on 2026-08-30). The race is not on demand, and a
    // raw Aurora is gone ~20 ms after SIGTERM (its main exits outright — see
    // src/main/discovery-file.ts), so an observer cannot see the order on the
    // real app. The property under test is the HELPER's order, so the subject
    // is a stand-in under a real xvfb-run whose exit is a bounded 300 ms after
    // SIGTERM. Old order: Xvfb dies within ms while the app is held — a sample
    // with the X server dead and the app alive is guaranteed. New order: the
    // group is not signalled until the app is gone, so no such sample can
    // exist. Liveness is read from /proc by this process every 10 ms, using
    // nothing killTree reports about itself. No Electron, so this row never
    // produces a core of its own.
    {
      const t = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 320x240x8', '/bin/sh', '-c',
        'trap "sleep 0.3; exit 0" TERM; while :; do sleep 0.1; done'], { stdio: 'ignore', detached: true });
      // xvfb-run `sleep 3`s for its X server BEFORE running the command, so a
      // tree captured on "Xvfb is up" holds the wrapper's own sleep and no app
      // at all — measured, and it made this row vacuous. Wait for the stand-in —
      // by ITS argv, not the root's, whose argv also carries the script text.
      let art = null, appUp = false;
      for (let i = 0; i < 60 && !(appUp && art && art.displays.length); i++) {
        await sleep(200); art = displayArtifacts(t.pid);
        appUp = [...descendants(t.pid)].some((p) => p !== t.pid && /^\/bin\/sh -c trap "sleep 0\.3/.test(cmdlineOf(p)));
      }
      if (!art || !art.displays.length || !appUp) {
        unmeasurable('k9', 'ordered teardown seen from outside', `xvfb-run never started an X server AND the stand-in under ${t.pid}: X ${JSON.stringify(art)}, app up ${appUp}`);
        await killTree(t, { graceMs: 500, quiet: true });
      } else {
        const tree = [...descendants(t.pid)];
        const xv = tree.filter((p) => /(^|\/)Xvfb( |$)/.test(cmdlineOf(p)));
        const app = tree.filter((p) => p !== t.pid && !xv.includes(p));
        const t0 = Date.now();
        const bg = killTree(t, { graceMs: 4000, quiet: true });
        const samples = [];
        for (let i = 0; i < 600; i++) {
          const smp = { t: Date.now() - t0, app: app.filter(runningPid).length, x: xv.filter(runningPid).length };
          samples.push(smp);
          if (!smp.app && !smp.x) break;
          await sleep(10);
        }
        const out = await bg;
        const violation = samples.find((smp) => smp.x === 0 && smp.app > 0);
        const held = samples.find((smp) => smp.t >= 100 && smp.app > 0 && smp.x > 0);
        const last = samples[samples.length - 1];
        check('k9', 'ORDERED teardown, seen from outside: with the app held 300 ms past SIGTERM, no 10 ms sample has the X server dead while the app is alive',
          xv.length > 0 && app.length > 0 && !!held && !violation,
          `app pids [${app.join(' ')}], Xvfb [${xv.join(' ')}] on :${art.displays[0].n}; ${samples.length} samples over ${last.t} ms; `
          + `hold observed: ${held ? `yes (+${held.t} ms, app and X both up)` : 'NO — the instrument did not see the app being held'}; `
          + (violation ? `VIOLATION at +${violation.t} ms: X server dead, ${violation.app} app pid(s) alive` : 'no violation')
          + `; helper's own account: ${JSON.stringify(out.order ?? null)}`);
      }
    }
  } finally {
    // ── unconditional meta-restore ─────────────────────────────────────────
    console.log('\n=== META-RESTORE ===');
    const done = restoreDiscovery(meta);
    for (const d of done) console.log(`        ${d}`);
    console.log(`        discovery on disk now:\n        ${readDiscoveryNow()}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) { console.log('FAILING ROWS:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  process.exit(2);
});
