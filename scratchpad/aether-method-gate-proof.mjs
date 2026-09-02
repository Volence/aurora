#!/usr/bin/env node
// DOES ROW 0 OF THE PLAYTEST HARNESS MEASURE ANYTHING? (O26)
//
// `classic-playtest-harness.mjs` opened with a row that read the advertised
// method count out of the emulator's startup banner and did:
//
//     check('0', '… advertises 35 methods (post-parser-drop binary)',
//       elog.includes('listening on') && methods === '35', …);
//     if (methods !== '35') throw new Error('stale oracle-aether binary — aborting');
//
// The count moved FOUR TIMES while this row was being fixed: 35 (the pin), 52,
// 53, then 55 — the last two an hour apart, on the same afternoon, as the
// oracle lane landed features. So the pin threw on every CORRECT binary and
// passed only on a stale one: inverted against its own stated purpose, in the
// row whose entire job was to make the rows below it mean something.
// A COUNT IS NOT A CAPABILITY.
//
// The replacement derives the SET of methods the run needs (this harness's own
// call sites + every method Aurora's client can issue) and checks it against
// the list the server advertises in its OWN `initialize` reply. This file is
// the evidence that the replacement measures the right thing — against a REAL
// oracle-aether, because a set derived from source and checked against a fake
// server would prove only that two of my own strings match.
//
// No Aurora, no Electron, no X: the only process launched is the emulator, on a
// private socket, and it is killed by the handle this file holds. Nothing here
// touches the owner's ~/.aurora or his emulator.
//
// Rows:
//   d1  the derivation is NON-EMPTY and prints both counts — a scan that
//       matched nothing would make every row below pass over an empty set
//   d2  the two halves are the two halves they claim: the observer side is a
//       SUBSET of the literals in the harness file (so it is really reading
//       that file), and the client side names a method the harness itself
//       never calls (so it is really reading the client)
//   d3  the `resolve()` indirection is present — `emulator/lookup_symbol` is
//       needed by a harness that never spells it
//   u1  UNMEASURABLE, both sides: an empty harness source and a client dir with
//       no methods each THROW BY NAME rather than returning an empty set
//   g1  against the live server: nothing the run needs is missing, and the
//       count that arrived is REPORTED, never matched
//   g2  the identity is recorded from the same handshake: implementation and
//       serverBuild.id, provenance for whatever the rows below would have said
//   r1  RED CONTROL: a requirement the server does not serve is reported
//       MISSING BY NAME. Without this row, g1 is green just as readily over a
//       check that cannot fail
//   x1  THE OLD PIN, EVALUATED AGAINST THIS LIVE SERVER: `methods === '35'` is
//       FALSE. The defect was real, and it is the reason a count must never be
//       a gate
//
// Usage: node scratchpad/aether-method-gate-proof.mjs

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import * as esbuild from 'esbuild';
import { requiredAetherMethods, methodGap, INDIRECT_METHODS, methodLiteralsIn } from './lib/aether-methods.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HARNESS = join(ROOT, 'scratchpad/classic-playtest-harness.mjs');
const CLIENT_DIR = join(ROOT, 'src/main/aether');
// `oracle-next` is a symlink to `oracle` (verified: same md5), so this and
// classic-playtest-harness.mjs's SERVER are the same binary by two names.
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const ROM = siblingPathOrUnresolved('s1disasm', 's1built.bin');
const SOCK = `/run/user/1000/aur-mg-${process.pid}.sock`;

const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'aurora-methodgate-'));
  let emu = null, observer = null;
  try {
    // --- d1/d2/d3: the derivation, before any server exists -----------------
    const self = readFileSync(HARNESS, 'utf8');
    const need = requiredAetherMethods(self, CLIENT_DIR);
    check('d1', 'the derivation is non-empty on BOTH sides, and says how many came from where',
      need.observer.size > 0 && need.client.size > 0 && need.all.size > 0,
      `observer=${need.observer.size} client=${need.client.size} (${need.files.length} .ts files) `
      + `union=${need.all.size}\n        ${[...need.all].sort().join(' ')}`);

    // The INDIRECT entries are deliberately not literals in the harness — that
    // is what makes them indirect — so they are excluded here and are d3's
    // subject instead. (Written the other way round first, and it went RED:
    // `emulator/lookup_symbol` is in the observer set and nowhere in the file.)
    const literals = methodLiteralsIn(self);
    const indirectSet = new Set(INDIRECT_METHODS.map((i) => i.method));
    const spelled = [...need.observer].filter((m) => !indirectSet.has(m));
    const observerOnlyFromFile = spelled.length > 0 && spelled.every((m) => literals.has(m));
    const clientOnly = [...need.client].filter((m) => !need.observer.has(m));
    check('d2', 'the observer half really reads THIS FILE, and the client half really adds to it',
      observerOnlyFromFile && clientOnly.length > 0,
      `${spelled.length} spelled call-site method(s), all present as literals in the harness: `
      + `${observerOnlyFromFile}\n        client-only (the app issues these, the harness never `
      + `names them): ${clientOnly.sort().join(' ')}`);

    // ONLY WITNESS FOR: the harness being WIRED to this. Every row here drives
    // the library directly and stays green while row 0 still carries the pin —
    // a perfectly good gate that nothing uses. ANTI-VACUOUS both ways: the file
    // must still contain a row 0 (so a moved/renamed harness fails loudly) AND
    // must no longer contain the count comparison.
    // ⚠ COMMENTS STRIPPED FOR THE PIN SCAN, and this went RED first without it:
    // the harness's row-0 header QUOTES the old rule on purpose, so a scan over
    // raw text reports the pin as still present in code that no longer has it.
    // Same hazard the derivation handles by reading call sites, not literals.
    const code = self.replace(/^\s*\/\/.*$/gm, '');
    const wiredCall = /requiredAetherMethods\(/.test(code) && /methodGap\(/.test(code);
    // ⚠ NOT `methods === '35'`. Written that way first, and a plant that
    // restored the pin as `bannerCount !== '35'` sailed straight past it — the
    // row was matching a VARIABLE NAME, not the mistake. What must not come
    // back is ANY comparison of a served-method COUNT against a constant,
    // whatever the count is called and whatever the number is.
    const COUNT_PIN = /\b\w*(?:methods|methodcount|count|advertised)\w*\s*[!=]==?\s*['"]?\d+/i;
    const pinHit = COUNT_PIN.exec(code);
    const pinGone = pinHit === null;
    check('w1', "the harness itself uses the derived gate, and the `=== '35'` pin is gone from its code",
      /check\('0',/.test(code) && wiredCall && pinGone,
      `row 0 present: ${/check\('0',/.test(code)} · derived gate called: ${wiredCall} · `
      + `count pin gone: ${pinGone}${pinHit ? ` — FOUND: ${JSON.stringify(pinHit[0].trim())}` : ''}`);

    const indirect = INDIRECT_METHODS.map((i) => i.method);
    check('d3', 'the resolve() indirection is included — a method the harness needs and never spells',
      indirect.every((m) => need.observer.has(m)) && !/observer\.call\(\s*'emulator\/lookup_symbol'/.test(self),
      `indirect=${indirect.join(' ')} · spelled at a call site in the harness: no`);

    // --- u1: unmeasurable is not a pass -------------------------------------
    const emptyDir = join(work, 'no-methods');
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, 'nothing.ts'), 'export const x = 1;\n');
    const throwsWith = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    const noSites = throwsWith(() => requiredAetherMethods('// a harness with no call sites\n', CLIENT_DIR));
    const noClient = throwsWith(() => requiredAetherMethods(self, emptyDir));
    const noDir = throwsWith(() => requiredAetherMethods(self, join(work, 'does-not-exist')));
    check('u1', 'an empty scan THROWS by name on every side — it never returns a set that would pass',
      /UNMEASURABLE/.test(noSites ?? '') && /UNMEASURABLE/.test(noClient ?? '') && /UNMEASURABLE/.test(noDir ?? ''),
      `no-call-sites: ${noSites}\n        no-methods-in-client: ${noClient}\n        unreadable-dir: ${noDir}`);

    // --- the real server ----------------------------------------------------
    if (!existsSync(SERVER)) { check('g1', `the server binary exists at ${SERVER}`, false, 'BLOCKED'); return; }
    if (!existsSync(ROM)) { check('g1', `the ROM exists at ${ROM}`, false, 'BLOCKED'); return; }
    if (existsSync(SOCK)) rmSync(SOCK);

    const out = join(work, 'client.mjs');
    await esbuild.build({
      entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    });
    const { AetherClient } = await import(out);

    emu = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let elog = '';
    emu.stdout.on('data', (d) => { elog += d; });
    emu.stderr.on('data', (d) => { elog += d; });
    for (let i = 0; i < 60 && !elog.includes('listening on'); i++) await sleep(200);
    if (!elog.includes('listening on')) throw new Error(`server never listened: ${elog}`);

    observer = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK, log: () => {} });
    await observer.connect();
    const hs = observer.handshake;

    const gap = methodGap(need, hs.methods);
    check('g1', 'against the LIVE server: every derived requirement is advertised',
      gap.missing.length === 0, gap.summary);

    check('g2', 'the same handshake records WHICH core and WHICH build — reported, matched against nothing',
      hs.identity.implementation === 'oracle-rs' && !!hs.identity.serverBuild?.id,
      `implementation=${hs.identity.implementation} build=${hs.identity.serverBuild?.id}`
      + `${hs.identity.serverBuild?.dirty ? ' DIRTY' : ''} deployment-name=${hs.serverName}`);

    // --- r1: the check can fail --------------------------------------------
    const poisoned = {
      ...need,
      all: new Set([...need.all, 'emulator/definitely_not_served']),
    };
    const poisonedGap = methodGap(poisoned, hs.methods);
    check('r1', 'RED CONTROL — a requirement the server does not serve is reported MISSING BY NAME',
      poisonedGap.missing.length === 1 && poisonedGap.missing[0] === 'emulator/definitely_not_served',
      poisonedGap.summary);

    // --- x1: the old pin, against this server -------------------------------
    const banner = /(\d+) methods advertised/.exec(elog)?.[1] ?? null;
    check('x1', "the pin this row replaced (`methods === '35'`) REFUSES this correct binary",
      banner !== null && banner !== '35' && String(hs.methodCount) === banner,
      `banner=${banner} wire=${hs.methodCount} · old rule "methods === '35'" evaluates to `
      + `${banner === '35'} — it would have thrown "stale oracle-aether binary" and aborted the run`);
  } finally {
    try { observer?.disconnect(); } catch { /* already down */ }
    if (emu && emu.exitCode === null) { try { emu.kill('SIGKILL'); } catch { /* gone */ } }
    try { if (existsSync(SOCK)) rmSync(SOCK); } catch { /* gone */ }
    rmSync(work, { recursive: true, force: true });
  }
}

main()
  .catch((e) => { console.error(e); fails.push('threw'); })
  .finally(() => {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
    process.exit(fails.length ? 1 : 0);
  });
