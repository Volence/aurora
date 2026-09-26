/**
 * LINES-EVERYWHERE (ROADMAP rows 223+224), ON SCREEN, THROUGH REAL INPUT.
 *
 * The owner ruled layer-switch LINES the engine's only layer-switch mechanism
 * (aeon docs/decisions.jsonl S2CLIP-PLANE-SWITCH); aeon retired the painted loop
 * crossover marks (19978b00) and REFUSES any non-zero bits 15:14 of a per-plane
 * collision word. Aurora removed its crossover brush, lens and preview. The node
 * suite proves the code paths; it cannot render React, open a menu or click.
 * This drives the built app over a COPY of aeon:
 *
 *   A. the collision palette carries NO Loop row and NO Mark row, and the View
 *      menu carries NO crossover lens (anti-vacuous: the palette's Plane/Brush
 *      rows and the menu's "Solid on both paths" row ARE there);
 *   B. a plane file PLANTED with bits 15:14 on the copy loads with them KEPT,
 *      the palette shows the reserved-bits ERROR naming the planted editor cell,
 *      and a real Ctrl+S REFUSES (the file's bytes do not move);
 *   C. a REAL click on "Clear retired marks" zeroes bits 15:14 of exactly the
 *      planted words (shape kept), after which Ctrl+S saves, the plane file on
 *      the copy no longer carries them, and the act's layer_lines.json (a file
 *      Aurora does not know) is byte-identical;
 *   D. the renderer logged NO console error and threw no uncaught exception.
 *
 *   VITE_AURORA_DEBUG=1 npx electron-vite build      # or there is no window.__dbg
 *   AEON_DIR=<a git-archive COPY of aeon, donors not needed> \
 *     ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
 *     AURORA_BUILT_TREE=<this worktree> npm run harness:lines-everywhere
 *
 * Read the `root:` / `pinned:` lines: they name the tree that answered.
 *
 * ⛔ THE COPY, NEVER THE LIVE AEON TREE. This file WRITES a plane file in
 * AEON_DIR (the plant) and SAVES into it. AEON_DIR has no default; a directory
 * carrying `.git`, or the sibling aeon checkout itself, is refused.
 *
 * REAL INPUT ONLY: every click is `Input.dispatchMouseEvent` at an element's
 * integer centre after `document.elementFromPoint` confirms the element is the
 * one under that pixel; Ctrl+S is `Input.dispatchKeyEvent`. No `.click()`.
 * NO EMULATOR: nothing here touches oracle or a ROM.
 */

import { session, mouse, key, sleep, RUN } from './canvas-cdp-harness.mjs';
import { checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as http from 'node:http';

const override = checkoutOverride('aeon');
if (override === null) {
  throw new Error('AEON_DIR is unset: this harness plants and SAVES into the tree it opens, so it must be a '
    + 'throwaway COPY of aeon (e.g. `git -C <aeon> archive <rev> | tar -x -C <dir>`).');
}
const AEONDIR = override.value;
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon') || existsSync(join(AEONDIR, '.git'))) {
  throw new Error(`refusing to run against ${AEONDIR}: it is the sibling aeon checkout or a git working tree. Use an archive copy.`);
}
const ACT = join(AEONDIR, 'games/sonic4/data/editor/ojz/act1');
const PLANE_A = join(ACT, 'section_0.collattr.bin');
const PLANE_B = join(ACT, 'section_0.collattrb.bin');
const LINES = join(ACT, 'layer_lines.json');
const PORT = Number(process.env.PORT ?? 9364);   // canvas-cdp-harness's session() port
const W = 256;                                     // sub-tile row stride of an aeon section

// ── The reserved field, READ from the source the app was built from ─────────
function reservedShift() {
  const src = readFileSync(join(RUN.root, 'src/core/collision/reserved-bits.ts'), 'utf8');
  const m = /export const PLANE_RESERVED_SHIFT = (\d+);/.exec(src);
  if (!m) throw new Error('CANNOT MEASURE: PLANE_RESERVED_SHIFT not found in reserved-bits.ts');
  return Number(m[1]);
}
const SHIFT = reservedShift();

// ── Reporting ────────────────────────────────────────────────────────────────
const fails = [];
let passes = 0;
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  if (ok) passes++; else fails.push(`[${id}] ${name}`);
}
function note(label, detail) { console.log(`        [note] ${label} ${detail ?? ''}`); }
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const J = JSON.stringify;

// ── A second CDP client on the same page, for console errors ────────────────
// canvas-cdp-harness's client does not surface events, so this one listens.
// `Console.enable` replays the messages collected so far, so an error logged
// before this attached is still seen.
function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (r) => {
      let s = ''; r.on('data', (d) => { s += d; }); r.on('end', () => { try { res(JSON.parse(s)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
async function consoleWatch() {
  const list = await getJSON('/json/list');
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('CANNOT MEASURE console errors: no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const errors = [];
  let id = 0;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text}`);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') errors.push(`console.error: ${(m.params.args ?? []).map((a) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Console.messageAdded' && m.params?.message?.level === 'error') errors.push(`console(replayed): ${m.params.message.text}`);
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  for (const method of ['Runtime.enable', 'Console.enable']) ws.send(JSON.stringify({ id: ++id, method }));
  await sleep(300);
  return { errors, close: () => ws.close() };
}

// ── Real, hit-tested input ──────────────────────────────────────────────────
async function aim(c, expr) {
  return c.json(String.raw`(() => {
    const el = ${expr};
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = el.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))) };
  })()`);
}
/** A REAL click, only when the element is the one under its centre pixel. */
async function realClick(c, expr) {
  const p = await aim(c, expr);
  if (!p || !p.hitOk) return p;
  await mouse(c, 'mouseMoved', p.x, p.y, { buttons: 0 });
  await mouse(c, 'mousePressed', p.x, p.y);
  await sleep(50);
  await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
  await sleep(500);
  return p;
}
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);
async function until(fn, ms = 8000, step = 250) {
  for (let t = 0; t < ms; t += step) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(label)}) || null`;
const PALETTE_ROW_LABELS = String.raw`[...document.querySelectorAll('span')].filter((s) => s.getBoundingClientRect().width > 0 && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON').map((s) => s.textContent.trim())`;
const BUTTON_TEXTS = String.raw`[...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim())`;
const VIEW_BUTTON = String.raw`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View')) || null`;
const LABEL_TEXTS = String.raw`[...document.querySelectorAll('label')].filter((l) => l.getBoundingClientRect().width > 0).map((l) => l.textContent.trim())`;
const NOTE = `document.querySelector('[data-testid="reserved-bits-audit-note"]')`;
const CLEAR_BTN = `document.querySelector('[data-testid="clear-retired-marks"]')`;

async function main() {
  console.log(`aeon dir under test : ${AEONDIR}`);
  // ── The plant: two words of section 0 plane A, on the COPY, before opening ──
  const original = readFileSync(PLANE_A);
  const linesBefore = existsSync(LINES) ? readFileSync(LINES) : null;
  const words = [3 * W + 41, 3 * W + 42];
  const planted = Buffer.from(original);
  for (const i of words) {
    const w = planted.readUInt16BE(i * 2);
    planted.writeUInt16BE(((w & ~(3 << SHIFT)) | (2 << SHIFT)) & 0xFFFF, i * 2);
  }
  writeFileSync(PLANE_A, planted);
  // ...AND ONE WORD OF PLANE B, value 1, at a different cell. Every row below
  // asserts plane B on its own too: a guard that looked at plane A only passed
  // every plane-A row (overseer review of rows 223+224, the one-plane shape).
  const originalB = readFileSync(PLANE_B);
  const wordB = 7 * W + 100;
  const plantedB = Buffer.from(originalB);
  plantedB.writeUInt16BE(((plantedB.readUInt16BE(wordB * 2) & ~(3 << SHIFT)) | (1 << SHIFT)) & 0xFFFF, wordB * 2);
  writeFileSync(PLANE_B, plantedB);
  note('plant B', `${PLANE_B}: word ${wordB} set to bits 15:14 = 1; sha ${sha(originalB)} -> ${sha(plantedB)}`);
  note('plant', `${PLANE_A}: words ${J(words)} set to bits 15:14 = 2; sha ${sha(original)} -> ${sha(planted)}; `
    + `layer_lines.json ${linesBefore ? `present, sha ${sha(linesBefore)}` : 'ABSENT'}`);
  check('0a', 'ANTI-VACUOUS: the copy\'s act carries a layer_lines.json (the file Aurora must leave alone)', linesBefore !== null);

  try {
    await session('lines-everywhere: no crossover UI, the reserved-bits error, the refusal and the clear', async (c) => {
      const cw = await consoleWatch();
      try {
        const probes = await c.json(`({
          audit: typeof window.__dbg?.aeon?.reservedBitsAudit === 'function',
          at: typeof window.__dbg?.aeon?.reservedBitsAt === 'function',
          noLens: typeof window.__dbg?.aeon?.crossoverLens === 'undefined',
        })`);
        check('0b', 'the build under test is this parcel\'s (reserved-bits hooks present, crossover hooks gone)',
          probes.audit && probes.at && probes.noLens, `${RUN.root}: ${J(probes)}`);

        await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`).catch((e) => note('open threw', e.message));
        const st = await until(async () => { const s = await c.json('window.__dbg.aeon.state()').catch(() => null); return s && s.open ? s : null; }, 20000, 400);
        check('1a', 'the OJZ project on the copy is open', !!st && st.zone === 'ojz', J(st));
        if (!st) throw new Error('aeon did not open');
        await sleep(1500);

        // B1: the load KEPT the planted bits.
        const kept = await c.json(`[${words.join(',')}].map((i) => window.__dbg.aeon.reservedBitsAt(0, 'a', i))`);
        check('B1', 'the load KEPT the planted bits 15:14 (nothing cleared them on the way in)', J(kept) === J([2, 2]), J(kept));
        const keptB = await c.json(`window.__dbg.aeon.reservedBitsAt(0, 'b', ${wordB})`);
        check('B1b', 'the load KEPT the planted plane-B bits too', keptB === 1, J(keptB));

        // A: the Collision facet by a real click.
        const fc = await realClick(c, FACET('Collision'));
        await sleep(800);
        const rows = await c.json(PALETTE_ROW_LABELS);
        const btns = await c.json(BUTTON_TEXTS);
        check('A1', 'ANTI-VACUOUS: a real click opened the Collision facet and its palette rows are on screen',
          !!fc?.hitOk && rows.includes('Plane') && rows.includes('Brush'), `click ${J(fc)}; rows ${J(rows)}`);
        check('A2', 'the collision palette has NO Loop row and NO Mark row',
          !rows.includes('Loop') && !rows.includes('Mark'), J(rows));
        check('A3', 'no crossover button anywhere on screen (Hand -> A/B, Keep, Half (8px), Cell (16px))',
          !btns.some((t) => /^Hand → [AB]$|^Keep$|^Half \(8px\)$|^Cell \(16px\)$/.test(t)), J(btns.filter((t) => t.length < 24)));

        // A4/A5: the View menu by a real click.
        const vb = await realClick(c, VIEW_BUTTON);
        await sleep(400);
        const labels = await c.json(LABEL_TEXTS);
        check('A4', 'ANTI-VACUOUS: a real click opened the View menu (it lists "Solid on both paths (A + B)")',
          !!vb?.hitOk && labels.includes('Solid on both paths (A + B)'), `click ${J(vb)}; ${J(labels)}`);
        check('A5', 'the View menu has NO crossover lens', !labels.some((t) => /crossover/i.test(t)), J(labels));
        await mouse(c, 'mousePressed', 30, 1000); await sleep(40);   // close the menu (mousedown outside)
        await mouse(c, 'mouseReleased', 30, 1000, { buttons: 0 }); await sleep(400);

        // B2: the palette's error names the planted cell.
        const noteText = await until(() => c.json(`(${NOTE})?.textContent ?? null`), 5000);
        check('B2', 'the palette shows the reserved-bits ERROR naming the planted editor cell (41, 3)',
          !!noteText && /3 collision words \(A: 2, B: 1\)/.test(noteText) && /section 0 plane A editor cell \(41, 3\)/.test(noteText),
          J(noteText));

        check('B2b', 'the same ERROR names the plane-B cell (100, 7) on its own line of evidence',
          !!noteText && /section 0 plane B editor cell \(100, 7\)/.test(noteText), J(noteText));

        // B3: a real Ctrl+S refuses; the planted file's bytes do not move. A save
        // writes only DIRTY acts, so the act is first made dirty by a real stroke
        // (a shape picked by a real click, a real press on the map), which is
        // undone by a real Ctrl+Z before the clear, so C3 can compare the file
        // against the original word for word. (DEV RUN 1 pressed Ctrl+S on a
        // clean act: nothing was attempted, and the row could not tell.)
        // The facet does not arm the paint tool by itself (DEV RUN 2: tool "view",
        // the press panned). `c` is the collision tool's own shortcut, a real key.
        if ((await c.json('window.__dbg.aeon.state()')).tool !== 'paint-collision') {
          await key(c, 'c', 'KeyC', 67, 0);
          await sleep(500);
        }
        const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
        const pick = await realClick(c, String.raw`([...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0)[3] || null)`);
        const press = await realClick(c, `document.getElementById('map-canvas')`);
        const dirty = await until(async () => ((await c.json('window.__dbg.aeon.state()')).dirty ? true : null), 4000);
        check('B3a', 'ANTI-VACUOUS: a real shape pick and a real press on the map made the act dirty (a save will be attempted)',
          !!pick?.hitOk && !!press?.hitOk && dirty === true, `tool ${J(toolNow)}; pick ${J(pick)}; press ${J(press)}; dirty ${J(dirty)}`);
        const errBefore = cw.errors.length;
        await ctrlS(c);
        await sleep(2500);
        const afterRefusal = readFileSync(PLANE_A);
        const afterRefusalB = readFileSync(PLANE_B);
        const err = await c.json('window.__dbg.aeon.state()').catch(() => null);
        const toasts = await c.json('window.__dbg.aeon.toasts()').catch(() => []);
        check('B3', 'a real Ctrl+S REFUSES: the plane file on the copy is byte-identical to the plant, and the save failed',
          sha(afterRefusal) === sha(planted) && sha(afterRefusalB) === sha(plantedB) && toasts.some((t) => /Save failed/.test(t.message)),
          `sha ${sha(afterRefusal)} (plant ${sha(planted)}); toasts ${J(toasts)}; state ${J(err)}`);
        const errAfter = cw.errors.length;
        await key(c, 'z', 'KeyZ', 90, 2);   // undo the dirtying stroke (a real Ctrl+Z)
        await sleep(600);

        // C1: a real click on "Clear retired marks".
        const shapesBefore = await c.json(`[${words.join(',')}].map((i) => window.__dbg.aeon.collisionAt(0, 'a', i) & 0x3FFF)`);
        const cb = await realClick(c, CLEAR_BTN);
        const cleared = await until(async () => {
          const v = await c.json(`[${words.join(',')}].map((i) => window.__dbg.aeon.reservedBitsAt(0, 'a', i))`);
          return v.every((x) => x === 0) ? v : null;
        }, 4000);
        const shapesAfter = await c.json(`[${words.join(',')}].map((i) => window.__dbg.aeon.collisionAt(0, 'a', i) & 0x3FFF)`);
        const audit = await c.json('window.__dbg.aeon.reservedBitsAudit(0)');
        check('C1', 'a REAL click on "Clear retired marks" zeroed bits 15:14 of the planted words and kept their shape',
          !!cb?.hitOk && !!cleared && J(shapesAfter) === J(shapesBefore) && audit?.severity === 'ok',
          `click ${J(cb)}; bits ${J(cleared)}; shape ${J(shapesBefore)} -> ${J(shapesAfter)}; audit ${J(audit && { A: audit.reservedA, B: audit.reservedB, severity: audit.severity })}`);
        const bitsB = await c.json(`window.__dbg.aeon.reservedBitsAt(0, 'b', ${wordB})`);
        const shapeB = await c.json(`window.__dbg.aeon.collisionAt(0, 'b', ${wordB}) & 0x3FFF`);
        check('C1b', 'the same click zeroed the plane-B word\'s bits 15:14 and kept its shape',
          bitsB === 0 && shapeB === (plantedB.readUInt16BE(wordB * 2) & 0x3FFF), `bits ${J(bitsB)}; shape ${J(shapeB)}`);
        const noteGone = await c.json(`${NOTE} === null`);
        check('C2', 'the error note is gone once the marks are cleared', noteGone === true);

        // C3/C4: Ctrl+S now saves; the file loses the bits; layer_lines.json untouched.
        await ctrlS(c);
        const saved = await until(() => { const b = readFileSync(PLANE_A); return sha(b) !== sha(planted) ? b : null; }, 15000, 250);
        let bitsLeft = null;
        if (saved) bitsLeft = words.map((i) => (saved.readUInt16BE(i * 2) >> SHIFT) & 3);
        check('C3', 'a real Ctrl+S then SAVED: the plane file on the copy no longer carries bits 15:14 at the planted words, and every other word equals the original',
          !!saved && J(bitsLeft) === J([0, 0]) && saved.equals(original),
          saved ? `sha ${sha(saved)}; original ${sha(original)}; bits ${J(bitsLeft)}` : 'the file did not change in 15s');
        const savedB = await until(() => { const b = readFileSync(PLANE_B); return sha(b) !== sha(plantedB) ? b : null; }, 15000, 250);
        check('C3b', 'the save wrote plane B too: no bits 15:14 at the planted word, every other word equals the original',
          !!savedB && ((savedB.readUInt16BE(wordB * 2) >> SHIFT) & 3) === 0 && savedB.equals(originalB),
          savedB ? `sha ${sha(savedB)}; original ${sha(originalB)}` : 'the file did not change in 15s');
        const linesAfter = existsSync(LINES) ? readFileSync(LINES) : null;
        check('C4', 'layer_lines.json (a file Aurora does not know) is byte-identical after the save',
          !!linesBefore && !!linesAfter && linesAfter.equals(linesBefore),
          `${linesBefore ? sha(linesBefore) : 'absent'} -> ${linesAfter ? sha(linesAfter) : 'absent'}`);

        // D: console.
        await sleep(500);
        // The refused save in B3 is SUPPOSED to log: the toast store mirrors every
        // error toast to console.error ("[toast] Save failed"). So the errors in
        // B3's window must be exactly that and nothing else, and there must be
        // NONE outside it. (DEV RUN 3 counted the deliberate refusal as a defect.)
        const inWindow = cw.errors.slice(errBefore, errAfter);
        const outside = [...cw.errors.slice(0, errBefore), ...cw.errors.slice(errAfter)];
        check('D1', 'the renderer logged NO console error and threw no uncaught exception, outside the deliberate refusal',
          outside.length === 0, outside.length ? outside.slice(0, 10).join('\n        ') : `none (${cw.errors.length} in total)`);
        check('D2', 'the deliberate refusal logged ONLY its own "[toast] Save failed" (no exception, nothing else)',
          inWindow.length > 0 && inWindow.every((e) => /\[toast\] Save failed/.test(e) && !/^exception/.test(e)), J(inWindow));
      } finally {
        cw.close();
      }
    });
  } finally {
    // Leave the copy as it was found: the ORIGINAL bytes (never the plant).
    writeFileSync(PLANE_A, original);
    writeFileSync(PLANE_B, originalB);
    note('restore', `${PLANE_A} restored to sha ${sha(original)}`);
  }
  console.log(`\n=== lines-everywhere: ${passes} PASS, ${fails.length} FAIL ===`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  console.log('=== LINES-EVERYWHERE HARNESS END ===');
  process.exitCode = fails.length ? 1 : 0;
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
