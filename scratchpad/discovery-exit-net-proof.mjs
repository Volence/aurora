#!/usr/bin/env node
// DOES THE DISCOVERY FILE ACTUALLY GO AWAY WHEN THE PROCESS IS KILLED? (O28)
//
// `~/.aurora/mcp.json` names the port and the PID of a running Aurora. Removal
// used to hang off Electron's `will-quit`, which is the graceful exit and
// nothing else — so a SIGTERM (how every CDP harness ends a run, and how a
// session manager ends an app) left the file on disk naming a dead process.
// Measured on this box 2026-08-31: the file named pid 1383435 and
// /proc/1383435 did not exist. A previous session closed that as a one-time
// cleanup; the cause was never fixed, and it recurred every run.
//
// A UNIT TEST CANNOT PROVE THIS. The property is "a real process, given a real
// signal, leaves no file", and a fake `process.on` proves only the wiring. So
// this launches a REAL child, sends it a REAL signal, and reads the disk.
//
// No Electron, no X, no Aurora: `src/main/discovery-file.ts` is bundled with
// esbuild (the same trick classic-playtest-harness.mjs uses for the Aether
// client) and driven directly. Nothing here touches the owner's ~/.aurora —
// every child runs with HOME pointed at a fresh temp directory, which is also
// what makes the rows about "the file" unambiguous.
//
// Rows:
//   n1  the files EXIST while the child is up — so every removal row below is
//       a REMOVAL and not an absence (the vacuous shape this repo keeps meeting)
//   r1  RED CONTROL: the same child WITHOUT the exit net, SIGTERMed, leaves
//       BOTH files behind. This is the bug, reproduced, and it is what makes
//       the green rows evidence about the net rather than about anything else
//       on this machine that might delete a file
//   g1  SIGTERM with the net: no files left — AND the child still died OF
//       SIGTERM, which is the re-raise doing its job. A handler that cleaned up
//       without re-raising would trade a stale file for an unkillable editor
//   g2  SIGINT: same, and `signal === 'SIGINT'`
//   g3  a normal `process.exit(0)`: the `exit` listener covers it
//   h1  SIGKILL: the files REMAIN. Stated as a row rather than a footnote —
//       no writer can cover SIGKILL, which is exactly why the reader half
//       (harness-guard's `livenessOf`) is not optional
//   h2  `livenessOf` calls h1's leftover DEAD, and the same bytes with a live
//       pid ALIVE — the reader that stops a corpse reading as a server
//
// Usage: node scratchpad/discovery-exit-net-proof.mjs

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { livenessOf } from './lib/harness-guard.mjs';

const ROOT = AURORA_DIR;
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const work = mkdtempSync(join(tmpdir(), 'aurora-discovery-'));
const BUNDLE = join(work, 'discovery-file.mjs');

/**
 * The child. `withNet=false` is the RED control: it writes the same files and
 * installs nothing, which is precisely what `startMcpServer` did before O28.
 */
function childSource(withNet) {
  return `
import { writeDiscoveryFiles, removeDiscoveryFiles, installDiscoveryExitNet, discoveryPathsIn }
  from ${JSON.stringify(BUNDLE)};
const home = process.env.FAKE_HOME;
const paths = writeDiscoveryFiles(home, JSON.stringify({
  url: 'http://127.0.0.1:38473/mcp', port: 38473, pid: process.pid,
}, null, 2));
${withNet ? 'installDiscoveryExitNet(() => removeDiscoveryFiles(paths));' : '/* no net — the pre-O28 writer */'}
console.log('READY ' + JSON.stringify(paths));
if (process.env.EXIT_NORMALLY) setTimeout(() => process.exit(0), 300);
setInterval(() => {}, 1 << 30);
`;
}

/** Launch a child, wait for READY, return its pid, paths and an exit promise. */
async function launch({ withNet, home, exitNormally = false }) {
  const src = join(work, `child-${withNet ? 'net' : 'bare'}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(src, childSource(withNet));
  const env = { ...process.env, FAKE_HOME: home };
  if (exitNormally) env.EXIT_NORMALLY = '1'; else delete env.EXIT_NORMALLY;
  const child = spawn(process.execPath, [src], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  // ⚠ BOUNDED, AND THAT BOUND IS A FINDING. Proving the no-re-raise plant
  // turned this proof into a HANG: a child that swallows SIGTERM never exits,
  // so an unbounded wait would have reported a regression as "still running"
  // forever — an instrument that cannot fail is no better than a check that
  // cannot go red. The timeout SIGKILLs and returns a named verdict instead.
  const ended = Promise.race([
    new Promise((res) => child.on('exit', (code, signal) => res({ code, signal }))),
    (async () => {
      await sleep(5000);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        return { code: null, signal: null, timedOut: true };
      }
      return { code: child.exitCode, signal: child.signalCode };
    })(),
  ]);
  for (let i = 0; i < 100 && !out.includes('READY'); i++) await sleep(50);
  if (!out.includes('READY')) { child.kill('SIGKILL'); throw new Error(`child never READY: ${err || out}`); }
  const paths = JSON.parse(/READY (.*)/.exec(out)[1]);
  return { child, paths, ended, stderr: () => err };
}

const present = (paths) => paths.filter((p) => existsSync(p));
const homeFor = (tag) => mkdtempSync(join(work, `home-${tag}-`));

async function main() {
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/main/discovery-file.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: BUNDLE, logLevel: 'silent',
  });

  // --- n1 + r1: the bug, reproduced ----------------------------------------
  {
    const home = homeFor('bare');
    const { child, paths, ended } = await launch({ withNet: false, home });
    check('n1', 'the discovery files EXIST while the child is up — the rows below are REMOVALS, not absences',
      paths.length === 2 && present(paths).length === 2, present(paths).join(' '));
    child.kill('SIGTERM');
    const e = await ended;
    check('r1', 'RED CONTROL — WITHOUT the exit net, SIGTERM leaves BOTH files naming a dead pid',
      present(paths).length === 2 && e.signal === 'SIGTERM',
      `left=${present(paths).length}/2 exit=${JSON.stringify(e)} · ${livenessOf(readFileSync(paths[0], 'utf8'))}`);
  }

  // --- g1/g2: the signals, and the re-raise --------------------------------
  for (const [id, sig] of [['g1', 'SIGTERM'], ['g2', 'SIGINT']]) {
    const home = homeFor(sig);
    const { child, paths, ended } = await launch({ withNet: true, home });
    if (present(paths).length !== 2) { check(id, `${sig}: setup`, false, 'files were not written'); continue; }
    child.kill(sig);
    const e = await ended;
    check(id, `${sig} with the net: NO file survives, and the child still dies OF ${sig} (the re-raise)`,
      present(paths).length === 0 && e.signal === sig && !e.timedOut,
      `left=${present(paths).join(' ') || 'nothing'} exit=${JSON.stringify(e)}`
      + (e.timedOut ? ` — THE CHILD SWALLOWED ${sig}: cleanup without a re-raise is an unkillable app` : ''));
  }

  // --- g3: the ordinary exit path ------------------------------------------
  {
    const home = homeFor('exit');
    const { paths, ended } = await launch({ withNet: true, home, exitNormally: true });
    const e = await ended;
    check('g3', 'a normal process.exit(0) is covered too — the `exit` listener, not the signal handlers',
      present(paths).length === 0 && e.code === 0 && e.signal === null,
      `left=${present(paths).join(' ') || 'nothing'} exit=${JSON.stringify(e)}`);
  }

  // --- h1: the honest limit ------------------------------------------------
  let killedPaths = null;
  {
    const home = homeFor('kill');
    const { child, paths, ended } = await launch({ withNet: true, home });
    child.kill('SIGKILL');
    const e = await ended;
    killedPaths = paths;
    check('h1', 'SIGKILL leaves the files — NO writer can cover it, which is why the reader half exists',
      present(paths).length === 2 && e.signal === 'SIGKILL',
      `left=${present(paths).length}/2 exit=${JSON.stringify(e)}`);
  }

  // --- h2: the reader that stops a corpse reading as a server --------------
  {
    const stale = readFileSync(killedPaths[0], 'utf8');
    const staleSays = livenessOf(stale);
    const liveSays = livenessOf(JSON.stringify({ port: 38473, pid: process.pid }));
    const nopid = livenessOf(JSON.stringify({ port: 38473 }));
    const junk = livenessOf('not json');
    check('h2', 'livenessOf calls the SIGKILL leftover DEAD, a live pid ALIVE, and never returns blank',
      /DEAD — STALE FILE/.test(staleSays) && /ALIVE/.test(liveSays) && !/DEAD/.test(liveSays)
      && /UNKNOWABLE/.test(nopid) && /unparseable/.test(junk),
      `stale=${staleSays}\n        live=${liveSays}\n        no-pid=${nopid}\n        junk=${junk}`);
  }
}

main()
  .catch((e) => { console.error(e); fails.push('threw'); })
  .finally(() => {
    rmSync(work, { recursive: true, force: true });
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
    process.exit(fails.length ? 1 : 0);
  });
