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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  spawnGuarded, killTree, descendants, alive, cmdlineOf,
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
