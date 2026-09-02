#!/usr/bin/env node
// O31 — DOES THE EDITOR ADMIT IT IS NOT SHOWING THE BACKGROUND THE SECTION NAMES?
//
// ═══ THE MEASUREMENT THIS EXISTS FOR ═══
//
// In aeon on 2026-08-30: `games/sonic4/data/editor/ojz_bglib.json` is TRACKED
// and names 17 entries. All 34 body files it implies (`ojz_bg_<id>.bin` +
// `..._tiles.bin`) are UNTRACKED — `.gitignore`'s blanket `*.bin` catches them
// and no un-ignore rule brings them back. The TRACKED sidecar
// `ojz/act1/section_0.meta.json` carries one of those seventeen ids in
// `bgLayoutRef`. So a clean clone opens a manifest of seventeen names, resolves
// none of them, and paints a section that asks for one of them with the ACT
// DEFAULT — while the authoring machine, where every untracked body is present,
// resolves everything. The failure is invisible to exactly the person who could
// fix it.
//
// This harness MANUFACTURES the clean-clone state from the live tree: a
// hardlinked copy with every `ojz_bg_*.bin` UNLINKED and the manifest left
// exactly as it is. Nothing here writes to the aeon tree.
//
// ═══ WHY THE NODE SUITE CANNOT ANSWER THIS ═══
//
// The pure rules are pinned in node (bg-library.test.ts, properties-aeon.test.ts,
// map-status-aeon.test.ts, agent-handler.bg-binding.test.ts, aeon-save.test.ts).
// What node cannot see is a React <select>, a DOM title attribute, a status bar
// or a toast — and the defect's sharpest form is a rendering fact: a <select>
// whose `value` matches no <option> renders at selectedIndex -1, i.e. BLANK.
// A unit test on the option list can never observe that.
//
// ═══ THE RED CONTROL, LIVE, WITHOUT A SECOND BUILD ═══
//
// The R rows take the honest <option> away from the DOM in place, two different
// ways, and re-read the same element. If the box does not go wrong when the
// option goes, then the option was never what was keeping it honest and every
// row above it is vacuous. It is restored immediately afterwards and the row
// after re-reads it, so a failure to restore cannot be mistaken for a pass.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bg-dangling-ref-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9437);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const SHOTS = `${ROOT}/scratchpad/shots-bg-dangling`;
mkdirSync(SHOTS, { recursive: true });

const EDITOR_REL = 'games/sonic4/data/editor';
const ZONE = 'ojz';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing (same shape as bg-tile-picker-harness.mjs) ──────────────────
function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}\n        ${detail}`);
  results.push({ id, name, ok: null });
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bg-dangling/${name}.png`);
}

// ── THE FIXTURE ──────────────────────────────────────────────────────────────
// A hardlinked copy of the live tree with the BG-library BODIES unlinked. The
// manifest stays byte-for-byte. Unlinking (never truncating in place) is what
// keeps the aeon tree untouched: `cp -al` shares inodes, so an edit through the
// copy would be an edit to the original.
function buildFixture(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  const dir = join(dest, EDITOR_REL);
  const bodies = readdirSync(dir).filter((f) => f.startsWith(`${ZONE}_bg_`) && f.endsWith('.bin'));
  for (const f of bodies) unlinkSync(join(dir, f));
  return { dest, removed: bodies.length };
}

async function main() {
  console.log('O31 — the dangling BG ref, on the real app\n');

  // ── What the LIVE tree actually holds, measured before anything is built ──
  const manifestPath = join(AEON, EDITOR_REL, `${ZONE}_bglib.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const tracked = execFileSync('git', ['-C', AEON, 'ls-files', EDITOR_REL], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const trackedBodies = tracked.filter((p) => /\/ojz_bg_.*\.bin$/.test(p));
  const manifestTracked = tracked.includes(`${EDITOR_REL}/${ZONE}_bglib.json`);
  const sidecarRel = `${EDITOR_REL}/${ZONE}/act1/section_0.meta.json`;
  const sidecar = JSON.parse(readFileSync(join(AEON, sidecarRel), 'utf8'));

  check('M1', 'the bglib manifest is TRACKED in aeon', manifestTracked,
    `${EDITOR_REL}/${ZONE}_bglib.json`);
  check('M2', 'and it names entries', manifest.length > 0, `${manifest.length} entries`);
  check('M3', 'and NONE of their bodies is tracked', trackedBodies.length === 0,
    `tracked ${ZONE}_bg_*.bin files: ${trackedBodies.length}`);
  check('M4', "section_0's TRACKED sidecar names one of them",
    manifest.some((e) => e.id === sidecar.bgLayoutRef),
    `bgLayoutRef=${JSON.stringify(sidecar.bgLayoutRef)} sceneRef=${JSON.stringify(sidecar.sceneRef)}`);
  const REF = sidecar.bgLayoutRef;

  console.log('\nBUILDING THE CLEAN-CLONE FIXTURE (hardlinked; aeon is never written)…');
  const FIX = join(ROOT, 'scratchpad/fixtures/aeon-bg-dangling');
  const { removed } = buildFixture(FIX);
  check('M5', 'the fixture removed every BG-library body and kept the manifest',
    removed === manifest.length * 2 &&
      existsSync(join(FIX, EDITOR_REL, `${ZONE}_bglib.json`)) &&
      !existsSync(join(FIX, EDITOR_REL, `${ZONE}_bg_${REF}.bin`)),
    `unlinked ${removed} files for ${manifest.length} entries`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build) [precondition]', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(FIX)})`)
      .catch((e) => console.log('        open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    if (!st || !st.open) throw new Error('the fixture did not open — nothing below can be measured');
    await sleep(1500);
    await c.evalExpr(`window.__dbg.aeon.setFacet('layout')`).catch(() => {});
    await sleep(1200);
    await shot(c, '01-opened');

    const activeSection = await c.evalExpr('window.__dbg.aeon.activeSection()');
    check('P0', 'the active section is the one whose sidecar carries the ref [precondition]',
      activeSection === 0, `activeSection=${activeSection}, sidecar is section_0`);

    // ── 1. THE TOAST ──────────────────────────────────────────────────────────
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    const warn = toasts.find((t) => /could not be opened/.test(t.message));
    check('T1', 'opening a bodyless checkout raises a toast that says so', warn !== undefined,
      warn ? warn.message : `toasts: ${JSON.stringify(toasts.map((t) => t.type + ':' + t.message.slice(0, 60)))}`);
    check('T2', "and it is a WARNING, not one of the greens", warn?.type === 'warning',
      `type=${warn?.type}`);
    check('T3', 'it names how many and says editing still works',
      warn !== undefined && warn.message.includes(String(manifest.length)) &&
      /still works|act default/.test(warn.message),
      warn?.message);
    const toastText = await c.evalExpr(
      `[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/could not be opened/.test(e.textContent)).map(e=>e.textContent)[0] ?? null`);
    check('T4', 'the toast is really ON SCREEN, not merely in the store', typeof toastText === 'string',
      toastText === null ? 'no DOM node carries the text' : toastText.slice(0, 120));

    // ── 2. THE PROPERTIES SELECT ─────────────────────────────────────────────
    const SEL = `(() => {
      const labels = [...document.querySelectorAll('label,div,span')]
        .filter(e => e.textContent && e.textContent.trim() === 'Background');
      let sel = null;
      for (const l of labels) {
        sel = l.parentElement?.querySelector('select') ?? l.nextElementSibling;
        if (sel && sel.tagName === 'SELECT') break;
        sel = null;
      }
      if (!sel) sel = document.querySelector('select');
      if (!sel) return null;
      // The box is 120px and the labels are not, so WHAT IS ACTUALLY LEGIBLE
      // is a different question from what the option says. Measure the CSS
      // width and the text metrics of the selected label rather than trusting
      // the string: a label whose signal falls off the end is not a signal.
      const cs = getComputedStyle(sel);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ');
      const label = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : null;
      let visible = null;
      if (label !== null) {
        // Leave room for the drop-down arrow; err WIDE (25px) so this cannot
        // flatter the result by claiming less is visible than really is.
        const room = sel.getBoundingClientRect().width - 25;
        visible = '';
        for (const ch of label) {
          if (cv.measureText(visible + ch).width > room) break;
          visible += ch;
        }
      }
      return {
        value: sel.value,
        selectedIndex: sel.selectedIndex,
        selectedText: label,
        title: sel.title || null,
        widthPx: Math.round(sel.getBoundingClientRect().width),
        visible,
        options: [...sel.options].map(o => o.text),
      };
    })()`;
    const sel = await c.json(SEL);
    check('S0', 'the Background select is on screen [precondition]', sel !== null,
      sel ? `${sel.options.length} options` : 'no <select> found');
    if (sel) {
      check('S1', 'it is showing the section\'s real ref, not silently rewritten to the act default',
        sel.value === REF, `value=${JSON.stringify(sel.value)} ref=${JSON.stringify(REF)}`);
      check('S2', 'the control is NOT blank — an option answers that value',
        sel.selectedIndex >= 0, `selectedIndex=${sel.selectedIndex}`);
      check('S3', 'and what it displays says the entry is missing and what is shown instead',
        typeof sel.selectedText === 'string' &&
        sel.selectedText.includes(REF) && /missing/i.test(sel.selectedText) &&
        /act default/i.test(sel.selectedText),
        JSON.stringify(sel.selectedText));
      // THE ROW THE FIRST RUN OF THIS HARNESS DID NOT HAVE, and it caught a real
      // defect: the label used to lead with the id, which at this width rendered
      // as "ingame-forest-v15-1" — every word that mattered off the end of the
      // box, and indistinguishable from a background that is present and simply
      // named that.
      check('S3b', 'the word "missing" is inside the part of the box that is actually LEGIBLE',
        typeof sel.visible === 'string' && /missing/i.test(sel.visible),
        `${sel.widthPx}px box renders ${JSON.stringify(sel.visible)} of ${JSON.stringify(sel.selectedText)}`);
      check('S3c', 'and the full label is recoverable by hover, since the box cannot hold it',
        typeof sel.title === 'string' && sel.title === sel.selectedText,
        JSON.stringify(sel.title));
      check('S4', 'the library really is empty here — this is the clean-clone state, not a stocked one',
        sel.options.length === 2, `options: ${JSON.stringify(sel.options)}`);
    }
    await shot(c, '02-properties-select');

    // ── 3. THE RED CONTROL, TWO WAYS ─────────────────────────────────────────
    //
    // The claim under test is that the OPTION is what keeps this box honest.
    // Two different removals, because they produce two DIFFERENT wrong readings
    // and the first run of this harness only knew about one of them:
    //
    //   R1  set the value to an id no option answers — the MOUNT shape, which
    //       is what React does when `value` is a dangling ref and the option
    //       list is just the library. The box goes BLANK (selectedIndex -1).
    //   R1b take the option away while the value stands — the box silently
    //       falls back to the FIRST option and reads "Act default", which is an
    //       affirmative false statement rather than an absence.
    //
    // Both are restored and R2 re-reads the element, so a failure to restore
    // cannot be mistaken for a pass.
    const red = await c.json(`(() => {
      const sels = [...document.querySelectorAll('select')];
      const sel = sels.find(s => [...s.options].some(o => o.value === ${JSON.stringify(REF)}));
      if (!sel) return { ok: false, why: 'no select carries the ref' };
      const read = () => ({ i: sel.selectedIndex, text: sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : null });
      const before = read();
      sel.value = ${JSON.stringify(REF)} + '-no-such-entry';
      const unmatched = read();
      sel.value = ${JSON.stringify(REF)};
      const opt = [...sel.options].find(o => o.value === ${JSON.stringify(REF)});
      opt.remove();
      const removed = read();
      sel.add(opt, 1); sel.value = ${JSON.stringify(REF)};
      return { ok: true, before, unmatched, removed, restored: read() };
    })()`);
    check('R1', 'RED CONTROL: a value no option answers renders BLANK — the mount shape',
      red.ok && red.before.i >= 0 && red.unmatched.i === -1 && red.unmatched.text === null,
      `selectedIndex ${red.before?.i} -> ${red.unmatched?.i}, displayed ${JSON.stringify(red.unmatched?.text)}`);
    check('R1b', 'RED CONTROL: with the option gone the box asserts "Act default" — worse than blank',
      red.ok && red.removed.i === 0 && red.removed.text === 'Act default',
      `selectedIndex ${red.removed?.i}, displayed ${JSON.stringify(red.removed?.text)}`);
    check('R2', 'and restoring the option restores the honest reading (so R1/R1b measured the option, not the run)',
      red.ok && red.restored.i >= 0 && /missing/i.test(red.restored.text ?? ''),
      `selectedIndex=${red.restored?.i} text=${JSON.stringify(red.restored?.text)}`);

    // ── 4. THE SECTION GRID ──────────────────────────────────────────────────
    const grid = await c.json(`(() => {
      const cells = [...document.querySelectorAll('button[title]')]
        .filter(b => /double-click to jump/i.test(b.title));
      const dotOf = (b) => {
        const s = b.querySelector('span');
        if (!s) return null;
        const cs = getComputedStyle(s);
        return { bg: cs.backgroundColor, borderW: cs.borderTopWidth, borderC: cs.borderTopColor };
      };
      const withBg = cells.filter(b => /^BG: /.test(b.title));
      const withoutBg = cells.filter(b => !/^BG: /.test(b.title));
      return {
        total: cells.length,
        titles: withBg.map(b => b.title),
        dots: withBg.map(dotOf).filter(Boolean),
        plainCells: withoutBg.length,
        plainDots: withoutBg.map(dotOf).filter(Boolean).length,
      };
    })()`);
    check('G0', 'the section grid is on screen with more than the one cell under test [precondition]',
      grid.total > 1 && grid.titles.length >= 1,
      `${grid.total} section cells, ${grid.titles.length} carrying a BG`);
    check('G1', 'the cell for a dangling ref says MISSING and names what is painted instead',
      grid.titles.length > 0 && grid.titles.every((t) => /MISSING/.test(t) && /act default/.test(t)),
      JSON.stringify(grid.titles));
    check('G2', 'its dot is hollow (a border, no fill) rather than the solid "assigned" green',
      grid.dots.length > 0 && grid.dots.every((d) =>
        /rgba\(0, 0, 0, 0\)|transparent/.test(d.bg) && !/^0px/.test(d.borderW)),
      JSON.stringify(grid.dots));
    check('G3', 'ANTI-VACUOUS: the sections with no ref carry no dot at all',
      grid.plainCells > 0 && grid.plainDots === 0,
      `${grid.plainCells} cells without a BG, ${grid.plainDots} of them showing a dot`);

    // ── 5. THE MAP STATUS LINE ───────────────────────────────────────────────
    const status = await c.evalExpr(
      `[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^Section \\d/.test(e.textContent.trim())).map(e=>e.textContent.trim())[0] ?? null`);
    check('B1', 'the map status line names the missing entry rather than a bare section index',
      typeof status === 'string' && status.includes(REF) && /missing/i.test(status),
      JSON.stringify(status));
    await shot(c, '03-status-and-grid');

  } finally {
    if (c) c.close();
    killTree(child);
  }

  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  const noted = results.filter((r) => r.ok === null).length;
  console.log(`\n${passed} passed, ${failed} failed, ${noted} noted (${results.length} rows)`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
