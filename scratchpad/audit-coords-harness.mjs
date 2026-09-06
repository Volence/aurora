#!/usr/bin/env node
// DOES THE COORDINATE REACH A PERSON? — LOOPS-AUDIT-COORDS, the running app.
//
// ═══ WHAT THE NODE SUITE PROVES, AND WHAT IT CANNOT ═══
//
// `test/collision/crossover-locus.test.ts` proves the STRING: an index becomes
// "section 5, cell (col 12, row 3), right half", and becomes nothing at all
// without a stride. Every row of it is a pure function.
//
// It cannot see any of this:
//
//   1. THE SENTENCE IS ON SCREEN. `crossoverAuditMessage` composing a
//      coordinate and a person reading one are two different claims, and the
//      panel that renders it is a React component behind a facet and a
//      `variant === 'map'` gate.
//   2. ⚠ THE SECTION IS THE ONE THE AUTHOR IS LOOKING AT. This is the whole
//      risk of the new parameter. `auditCrossovers(..., activeSection)` is a
//      binding between a store value and a message; pass the wrong one and
//      every row of the node suite still passes while the panel names the
//      wrong section next to a real defect - worse than the index it replaced.
//      Only a running app with more than one section can catch that, and the
//      row that catches it ([n3]) POKES TWO DIFFERENT SECTIONS and switches
//      between them.
//   3. THE DEBUG HOOK'S OWN RECORD carries the stride and the section, which is
//      what every other harness in this repo reads the audit through.
//
// ═══ THE ANTI-VACUITY PROBLEM ═══
//
// A row that merely found the note element would be green on master, where the
// note exists and says "first at index 1417". So every row below asserts the
// COORDINATE ITSELF, and [n4] asserts the note DISAPPEARS when the defect is
// removed - without that, [n1] could be reading a sentence left over from a
// previous phase.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: AEON_DIR=<writable copy> ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//        npm run harness:audit-coords

import { AURORA_DIR, checkoutOverride, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot } from './lib/harness-guard.mjs';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9437);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const OVERRIDE = checkoutOverride('aeon');
const AEONDIR = OVERRIDE?.value ?? null;
const SHOTS = `${ROOT}/scratchpad/shots-audit-coords`;
mkdirSync(SHOTS, { recursive: true });

if (!AEONDIR || !existsSync(join(AEONDIR, 'games/sonic4/data/editor/ojz/act1'))) {
  console.log(`HARNESS REFUSES: ${OVERRIDE?.name ?? 'AEON_DIR'}=${AEONDIR ?? '(unset)'} is not an `
    + 'aeon checkout with editor data. Materialise a fresh writable COPY:');
  console.log('        git -C <live aeon> archive origin/master | tar -x -C "$COPY"');
  process.exit(2);
}
{
  // This harness never saves, but it POKES the in-memory document, and a poke
  // plus a stray Ctrl+S is one keystroke from writing the live tree. Refused
  // structurally rather than by care. Compared against `siblingDefaultPath`, so
  // that with the override set this is not a value compared to itself.
  const live = siblingDefaultPath('aeon');
  if (live && resolvePath(AEONDIR) === resolvePath(live)) {
    console.log(`HARNESS REFUSES: ${OVERRIDE.name} names the LIVE aeon checkout (${live}).`);
    process.exit(2);
  }
}

// ── THE GRID, READ OUT OF AURORA'S OWN SOURCE ──────────────────────────────
// Nothing here types a 2, a 4 or a 256 as an expectation: the coordinate under
// test IS the ratio, so a literal would be the harness agreeing with itself.
const CELL_SRC = `${ROOT}/src/core/collision/collision-cell.ts`;
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;
const XOVER_SRC = `${ROOT}/src/core/collision/layer-transition.ts`;
function num(path, re, what) {
  const m = re.exec(readFileSync(path, 'utf8'));
  if (!m) throw new Error(`could not derive ${what} out of ${path}`);
  return Number(m[1]);
}
const SUB_COLS = num(CELL_SRC, /export const CELL_SUBTILE_COLS\s*=\s*(\d+)/, 'CELL_SUBTILE_COLS');
const SUB_ROWS = num(CELL_SRC, /export const CELL_SUBTILE_ROWS\s*=\s*(\d+)/, 'CELL_SUBTILE_ROWS');
const STW = num(TYPES_SRC, /export const SECTION_TILES_WIDE\s*=\s*(\d+)/, 'SECTION_TILES_WIDE');
const X_SHIFT = num(XOVER_SRC, /export const CROSSOVER_SHIFT\s*=\s*(\d+)/, 'CROSSOVER_SHIFT');
const X_TO_A = num(XOVER_SRC, /export const CROSSOVER_TO_A\s*=\s*(\d+)/, 'CROSSOVER_TO_A');

/** The top-left sub-tile of a 16px cell, the index `cellTileIndices` puts
 *  first. Restated here only because a harness cannot import TypeScript. */
const cellTopLeft = (cc, cr) => (cr * SUB_ROWS) * STW + cc * SUB_COLS;

/** A plane-A word carrying a SELF-MARK: shape+solidity from an ordinary solid
 *  cell, plus XOVER_TO_A on plane A. Aurora's brush cannot author it (which is
 *  why the poke hook exists), aeon's bake hard-errors on it, and the audit
 *  reports it as an ERROR - the loudest class, so the note is certain to
 *  render. */
const SOLID = 0x3001;
const SELF_A = SOLID | (X_TO_A << X_SHIFT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
async function portFree() { try { await getJSON('/json/version'); return false; } catch { return true; } }
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
const nonDiscriminating = new Set();
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function checkNonDiscriminating(id, name, ok, detail) {
  nonDiscriminating.add(id);
  check(id, `${name}  [DOES NOT DISCRIMINATE]`, ok, detail);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-audit-coords/${name}.png`);
}

/** The audit note as the app renders it, plus where it is. Located by testid,
 *  never by its own text: the text is the claim.
 *
 *  ⚠ THE RECT IS COMPARED TO ITS SCROLLER, not to `checkVisibility()`. Both
 *  `checkVisibility()` and `getClientRects()` answer GREEN for an element
 *  scrolled far out of its scrolling ancestor (measured in this repo, 2026-09).
 *  A sentence a person has to scroll to find still reaches them, so this
 *  REPORTS the relationship rather than failing on it - but it prints enough to
 *  tell the difference. */
const READ_NOTE = String.raw`
(() => {
  const el = document.querySelector('[data-testid="crossover-audit-note"]');
  if (!el) return JSON.stringify({ present: false });
  const b = el.getBoundingClientRect();
  let sc = el.parentElement, box = null;
  while (sc) {
    const st = getComputedStyle(sc);
    if (/(auto|scroll)/.test(st.overflowY) && sc.scrollHeight > sc.clientHeight + 1) {
      const sb = sc.getBoundingClientRect();
      box = { top: sb.top, bottom: sb.bottom, left: sb.left, right: sb.right };
      break;
    }
    sc = sc.parentElement;
  }
  return JSON.stringify({
    present: true,
    text: el.textContent || '',
    rect: { top: b.top, left: b.left, w: b.width, h: b.height },
    scroller: box,
    inScroller: box === null ? null : (b.bottom > box.top && b.top < box.bottom),
    color: getComputedStyle(el).color,
  });
})()`;

async function main() {
  console.log('\n=== DERIVED FROM AURORA SOURCE (nothing below is typed as an expectation) ===');
  console.log(`  CELL_SUBTILE_COLS=${SUB_COLS} CELL_SUBTILE_ROWS=${SUB_ROWS} SECTION_TILES_WIDE=${STW}`);
  console.log(`  CROSSOVER_SHIFT=${X_SHIFT} CROSSOVER_TO_A=${X_TO_A} -> self-mark word 0x${SELF_A.toString(16)}`);

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target - kill it first`);
  const child = spawnGuarded('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1600x1000x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(`  discovery snapshot: ${describeDiscovery(discoverySnapshot())}`);
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  const restore = [];
  let c;
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s - needs a VITE_AURORA_DEBUG=1 build of dist/');
    }
    for (const hook of ['collisionPoke', 'collisionAt', 'crossoverAudit', 'setActiveSection', 'activeSection']) {
      if ((await c.evalExpr(`typeof window.__dbg.aeon.${hook}`)) !== 'function') {
        throw new Error(`__dbg.aeon.${hook} absent - dist/ is stale; rebuild with VITE_AURORA_DEBUG=1`);
      }
    }

    console.log(`\n=== OPENING ${AEONDIR} ===`);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');
    if (st0.sections < 2) {
      throw new Error(`this act has ${st0.sections} section(s); [n3] needs two DIFFERENT sections to `
        + 'tell "the audit names the active section" from "the audit names 0". Refusing to run a '
        + 'phase that cannot discriminate.');
    }

    // The palette (and therefore the note) renders only on the collision facet.
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    note('facet', JSON.stringify(facet));
    // [n2] quotes a rect, and `devicePixelRatio` is not constant on this
    // machine (1 and 1.35 both observed in one session), so the number that
    // scales it belongs in the same run's output as the rect itself.
    note('dpr', await c.evalExpr('String(window.devicePixelRatio) + " @ " '
      + '+ window.innerWidth + "x" + window.innerHeight'));

    const poke = (s, p, i, w) => c.evalExpr(`window.__dbg.aeon.collisionPoke(${s}, '${p}', ${i}, ${w})`);
    const collAt = (s, p, i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${s}, '${p}', ${i})`);
    const readNote = async () => JSON.parse(await c.evalExpr(READ_NOTE));
    const setSection = async (s) => {
      await c.evalExpr(`window.__dbg.aeon.setActiveSection(${s})`);
      await sleep(400);
      return c.evalExpr('window.__dbg.aeon.activeSection()');
    };
    /**
     * ⚠ THIS WAS A SECTION ROUND TRIP, AND ITS REMOVAL IS WHAT MAKES [n1] AND
     * [n4] THE INSTRUMENT FOR THE HOOK'S BUMP.
     *
     * `__dbg.aeon.collisionPoke` used to write the plane word in place without
     * bumping `editorStore.liveEditVersion` — the app's "something changed"
     * clock and the CollisionPalette audit memo's only other dependency — so a
     * poked defect sat in the document with the panel never told, and [n1]/[n4]
     * were red on this harness's first run for that alone. The workaround was a
     * round trip through the other section, which repaints by changing the
     * memo's OTHER dependency; it was booked as an open item against the hook
     * (packet 2026-09-06-loops-audit-coords §8 row 1) and the hook now calls
     * `bumpLiveEdit()` the way `MapViewport.recordPaint` does.
     *
     * So this is now a PLAIN SETTLE — no section change, nothing that could
     * repaint on its own. Delete the `bumpLiveEdit()` from `collisionPoke` and
     * [n1] and [n4] go red; that is the whole point of not putting the round
     * trip back. [n3] still reaches the same rendering through a real section
     * switch, so the two roads to the note are both still covered.
     */
    const settle = async () => { await sleep(400); };

    // ── [c0] the note is ABSENT before anything is wrong ──────────────────
    // Without this every later row could be reading a sentence that was always
    // there.
    const SEC_A = 0, SEC_B = 1;
    await setSection(SEC_A);
    const before = await readNote();
    checkNonDiscriminating('c0', 'CONTROL: with nothing wrong in section 0 the audit note is absent '
      + '(so a later reading is not a leftover)',
      before.present === false, `present=${before.present} text=${JSON.stringify(before.text ?? '')}`);

    // ── [rec] the record the debug hook returns carries the geometry ───────
    const rec0 = await c.json(`window.__dbg.aeon.crossoverAudit(${SEC_A})`);
    check('rec', 'the running build\'s audit record carries the STRIDE and the SECTION it ran on',
      rec0.stride === STW && rec0.section === SEC_A,
      `stride=${rec0.stride} (source says ${STW}) section=${rec0.section} (asked for ${SEC_A})`);

    // ── [n1] a real defect, and the sentence a person sees ────────────────
    const CC = 40, CR = 20;
    const IDX_A = cellTopLeft(CC, CR);
    restore.push({ s: SEC_A, p: 'a', i: IDX_A, w: await collAt(SEC_A, 'a', IDX_A) });
    if ((await poke(SEC_A, 'a', IDX_A, SELF_A)) === null) throw new Error('collisionPoke refused');
    await settle();
    const n1 = await readNote();
    const want1 = `section ${SEC_A}, cell (col ${CC}, row ${CR}), left half`;
    check('n1', '⚠ THE NOTE ON SCREEN NAMES A PLACE, not an index: '
      + `"${want1}"`,
      n1.present === true && n1.text.includes(want1),
      n1.present ? n1.text.slice(0, 240) : 'the note element is not in the DOM');
    checkNonDiscriminating('n1b', 'CONTROL: it still carries the raw index too, so nothing that '
      + 'already reads one is broken',
      n1.present === true && n1.text.includes(`index ${IDX_A}`),
      `looking for "index ${IDX_A}"`);
    check('n2', 'the note is laid out inside the panel that scrolls it (a rect, in its scroller)',
      n1.present === true && n1.rect.w > 0 && n1.rect.h > 0
        && (n1.scroller === null || n1.inScroller === true),
      `rect=${JSON.stringify(n1.rect)} scroller=${JSON.stringify(n1.scroller)} `
      + `inScroller=${n1.inScroller} color=${n1.color}`);
    await shot(c, 'n1-note-names-a-cell');

    // ── [n3] THE ROW ONLY A RUNNING APP CAN HAVE ──────────────────────────
    //
    // A second defect, in a DIFFERENT section and a DIFFERENT cell. Switching
    // the active section must move BOTH halves of the coordinate. A panel that
    // passed a constant, or the wrong store value, is green in the node suite
    // and red here.
    const CC2 = 7, CR2 = 3;
    const IDX_B = cellTopLeft(CC2, CR2);
    restore.push({ s: SEC_B, p: 'a', i: IDX_B, w: await collAt(SEC_B, 'a', IDX_B) });
    if ((await poke(SEC_B, 'a', IDX_B, SELF_A)) === null) throw new Error('collisionPoke refused on section 1');
    const now = await setSection(SEC_B);
    const n3 = await readNote();
    const want3 = `section ${SEC_B}, cell (col ${CC2}, row ${CR2}), left half`;
    check('n3', '⚠ SWITCHING SECTION MOVES THE COORDINATE WITH IT: the note now says '
      + `"${want3}"`,
      now === SEC_B && n3.present === true && n3.text.includes(want3),
      `activeSection=${now} :: ${n3.present ? n3.text.slice(0, 240) : 'no note'}`);
    check('n3b', 'and it does NOT still name the other section\'s cell',
      n3.present === true && !n3.text.includes(want1),
      `looking for the absence of "${want1}"`);
    await shot(c, 'n3-note-follows-the-section');

    // ── [n4] the note goes away when the defect does ──────────────────────
    await poke(SEC_B, 'a', IDX_B, restore.find((r) => r.i === IDX_B && r.s === SEC_B).w);
    await settle();
    const n4 = await readNote();
    check('n4', 'clearing the defect clears the note entirely (the sentence tracks the document, '
      + 'it is not a fixture)',
      n4.present === false, `present=${n4.present} text=${JSON.stringify((n4.text ?? '').slice(0, 120))}`);

    // ── [r] restore the in-memory document ────────────────────────────────
    console.log('\n=== [r] putting the in-memory document back ===');
    let bad = 0;
    for (const { s, p, i, w } of restore) {
      await poke(s, p, i, w);
      if ((await collAt(s, p, i)) !== w) bad++;
    }
    check('r1', 'every cell this run poked is back to the word it started with, in memory',
      bad === 0, `${restore.length - bad}/${restore.length} restored`);
    note('[TAG-FOREGROUND]', 'Nothing here needs an emulator: the claim is about text in the '
      + 'editor. The coordinate\'s correspondence to what aeon\'s bake reports is asserted in '
      + 'test/collision/crossover-locus.test.ts against the bake source, not driven.');
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    await killTree(child);
    restoreDiscoveryNow();
    console.log('cleanup: discovery files restored to their pre-run state');
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (nonDiscriminating.size) {
    console.log(`NON-DISCRIMINATING rows (green on master too): ${[...nonDiscriminating].join(', ')}`);
  }
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  console.log('HARNESS-END audit-coords');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  console.log('HARNESS-END audit-coords');
  process.exit(2);
});
