#!/usr/bin/env node
// WHICH SECTION AM I EDITING, AND WHAT CAN IT CARRY? (EFFECTS-W1 defects 3 and 4.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `section-wiring.test.ts` proves the derivation. It cannot prove:
//
//        AN AUTHOR ON THE EFFECTS TAB CAN SEE WHICH SECTION THEY ARE EDITING,
//        CHANGE IT WITHOUT LEAVING THE TAB, AND READ — PAINTED, AT THE CONTROL
//        — WHY THAT SECTION CAN OR CANNOT CARRY A RASTER BAND.
//
// nor that the 8,059-character prose block is gone from the screen while its
// contract wording is still reachable. Both are pixels.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE APP AGREES WITH ITSELF. The advisory's SUBJECT — which sections own
//     their preset and which are threaded — is re-derived IN THIS PROCESS, by a
//     second parse of the aeon copy's own files, and compared to what the app
//     printed. A shared derivation would let one bug produce two matching
//     wrong answers.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. Every advisory row asserts
//     checkVisibility + getClientRects + a strict elementFromPoint on the LEAF
//     that carries the text.
//
//   • A "no advisory" ROW PASSES BECAUSE THE FINDER IS BROKEN. Row [4c] asserts
//     the WIRED section is silent, so it is paired with [4a]/[4b] which require
//     the same finder to produce text on the other two sections. One finder,
//     three sections, two of which must speak and one of which must not.
//
//   • THE PICKER MOVES THE WIDGET AND NOT THE MODEL. Every section change is
//     read back through `window.__dbg.aeon` — and row [3b] also checks that the
//     raster select 4,000px BELOW followed, which is the coupling the picker
//     exists to make visible.
//
//   • THE PROSE "CUT" DELETED THE CONTRACT INSTEAD OF MOVING IT. Row [5b]
//     requires the long wording to still be reachable on the same elements'
//     `title`, so a cut that lost it fails.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-section-picker
//   Nothing here saves; the copy is not consumed.
//
//   PLANT=rot-picker … find the picker by a label nothing carries. [2a] must
//                      catch it and the run must ABORT.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9456);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 90);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-section-picker`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

// ── THE INDEPENDENT SECOND DERIVATION ────────────────────────────────────────
//
// Deliberately NOT an import of section-wiring.ts: the point is to check the app
// against aeon's FILES, not against Aurora's own module. Ten lines, and they are
// aeon's `descriptor_effects_bindings` / `raster_call_sites` approach.
const DESC = `${AEONDIR}/games/sonic4/data/levels/ojz/act1/act_descriptor.emp`;
const LIB = `${AEONDIR}/games/sonic4/data/effects/ojz_effects.emp`;
function independentDerivation() {
  const desc = readFileSync(DESC, 'utf8');
  const lib = readFileSync(LIB, 'utf8');
  const bind = {};
  const chunks = desc.split(/\bojz_sec\s*\(\s*sec\s*:\s*(\d+)/g);
  for (let i = 1; i < chunks.length; i += 2) {
    const m = /effects\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(chunks[i + 1] ?? '');
    if (m) bind[Number(chunks[i])] = m[1];
  }
  const counts = {};
  for (const v of Object.values(bind)) counts[v] = (counts[v] ?? 0) + 1;
  const own = Object.keys(bind).map(Number).filter((s) => counts[bind[s]] === 1).sort((a, b) => a - b);
  const threaded = [];
  const call = /raster\s*:\s*ojz_act1_sec_raster\s*\(\s*sec\s*:\s*(\d+)/g;
  let m;
  while ((m = call.exec(lib)) !== null) threaded.push(Number(m[1]));
  return { bind, own, wired: own.filter((s) => threaded.includes(s)).sort((a, b) => a - b) };
}

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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** The picker's own container, marked by the component with a data attribute. */
const PICKER = PLANT === 'rot-picker'
  ? `document.querySelector('[data-effects-section-picker-XXX]')`
  : `document.querySelector('[data-effects-section-picker]')`;

const PICKER_SELECT = String.raw`
(() => {
  const p = ${PICKER};
  return p ? p.querySelector('select') : null;
})()`;

const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  if (![...el.options].some((o) => o.value === ${JSON.stringify(String(value))})) {
    return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/** The painted leaf inside the picker carrying `needle`, or `{leaf:false}`. */
const PICKER_LEAF = (needle) => String.raw`
(() => {
  const p = ${PICKER};
  if (!p) return { leaf: false, noPicker: true };
  const leaves = [...p.querySelectorAll('div')]
    .filter((d) => (d.innerText || '').includes(${JSON.stringify(needle)})
                && ![...d.children].some((k) => (k.innerText || '').includes(${JSON.stringify(needle)})));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, pickerText: (p.innerText || '').replace(/\s+/g, ' ').slice(0, 220) };
  leaf.scrollIntoView({ block: 'center' });
  const b = leaf.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    leaf: true, text: (leaf.innerText || '').replace(/\s+/g, ' ').trim(),
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
  };
})()`;

async function main() {
  const t0 = Date.now();
  const truth = independentDerivation();
  console.log('=== effects-section-picker harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log('    INDEPENDENT DERIVATION (this process, from aeon\'s own files):');
  console.log(`      bindings  : ${JSON.stringify(truth.bind)}`);
  console.log(`      own preset: [${truth.own.join(',')}]   wired: [${truth.wired.join(',')}]`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
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
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. THE SUBJECT. -------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with the nine sections this act has',
      !!(st && st.open && st.sections === 9), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);
    check('1b', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);

    // ---- 2. THE PICKER IS THERE, FIRST, AND PAINTED. ---------------------
    const shape = await c.json(String.raw`(() => {
      const p = ${PICKER};
      if (!p) return { found: false };
      const s = p.querySelector('select');
      p.scrollIntoView({ block: 'start' });
      const b = p.getBoundingClientRect();
      const sb = s ? s.getBoundingClientRect() : null;
      const hit = sb ? document.elementFromPoint(
        Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2)) : null;
      // Its position in the column: nothing of the scene panel may precede it.
      const panel = p.parentElement;
      const firstChild = panel ? panel.firstElementChild === p : null;
      return {
        found: true, dpr: window.devicePixelRatio, rect: b.toJSON(),
        options: s ? [...s.options].map((o) => o.value) : null,
        labels: s ? [...s.options].map((o) => o.textContent) : null,
        value: s ? s.value : null,
        rects: p.getClientRects().length,
        visible: typeof p.checkVisibility === 'function' ? p.checkVisibility() : null,
        hitIsSelect: hit === s,
        firstInColumn: firstChild,
      };
    })()`);
    check('2a', 'the section picker is FOUND, FIRST in the column, painted and hit-testable',
      shape.found === true && shape.firstInColumn === true && shape.rects > 0
      && shape.visible !== false && shape.hitIsSelect === true,
      shape.found === false ? 'NO ELEMENT MATCHED — finder rot, or the picker is not rendered'
        : JSON.stringify(shape));
    if (shape.found !== true) throw new Error('picker not found — nothing below can be measured');

    check('2b', 'it offers every section this act has, labelled',
      shape.options.length === 9 && shape.options[0] === '0' && shape.options[8] === '8'
      && /^Section 0/.test(shape.labels[0]),
      `${shape.options.length} option(s): ${JSON.stringify(shape.labels)}`);

    // ---- 3. IT MOVES THE MODEL, AND THE BINDING 4,000px BELOW FOLLOWS. ---
    const RASTER_SELECT = String.raw`
      [...document.querySelectorAll('select')]
        .find((s) => /^Which raster band preset this section uses \(rasterRef\)/.test(s.title || '')) || null`;
    const before = await c.json('window.__dbg.aeon.state()');
    const moved = await c.evalExpr(SET_SELECT(PICKER_SELECT, 7));
    await sleep(900);
    const shown = await c.json(String.raw`(() => {
      const p = ${PICKER};
      return { widget: p.querySelector('select').value,
               text: (p.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
    })()`);
    check('3a', 'picking a section MOVES the editor there and the picker says so',
      moved === 'ok' && shown.widget === '7' && /Section 7/.test(shown.text),
      `set -> ${moved}; ${JSON.stringify(shown)} (was section ${before.section ?? '?'})`);

    // THE COUPLING THE PICKER EXISTS TO MAKE VISIBLE: the raster select at the
    // bottom of the column is about the SAME section.
    await c.evalExpr(String.raw`(() => {
      const hdrs = [...document.querySelectorAll('div')]
        .filter((d) => d.style && d.style.cursor === 'pointer'
                    && /^Raster band presets\b/.test((d.textContent || '').trim()));
      if (hdrs.length && !document.querySelector('input[placeholder="new_preset_id"]')) {
        hdrs[hdrs.length - 1].click();
      }
      return 'ok';
    })()`);
    await sleep(800);
    const rasterRow = await c.json(String.raw`(() => {
      const s = ${RASTER_SELECT};
      if (!s) return { found: false };
      const row = s.parentElement;
      return { found: true, label: (row.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    })()`);
    check('3b', 'the raster binding 4,000px below now names the SAME section',
      rasterRow.found === true && /Section 7/.test(rasterRow.label),
      JSON.stringify(rasterRow));

    // ---- 4. WHAT EACH SECTION CAN CARRY, AGAINST AN INDEPENDENT PARSE. ---
    //
    // Section 7 shares OJZ_Preset_Plain with 6 and 8 (derived, above).
    const shared = await c.json(PICKER_LEAF('share the preset record'));
    check('4a', `a SHARED section names its sharers — and the sharers match this process's own parse`,
      shared.leaf === true && shared.rects > 0 && shared.visible !== false
      && shared.hitInside === true
      && /Sections 6, 7 and 8 all share the preset record OJZ_Preset_Plain/.test(shared.text)
      && !truth.own.includes(7),
      `${JSON.stringify(shared)}\n        independent parse says own-preset = [${truth.own.join(',')}]`);

    // Section 0 owns its preset but nothing threads the chooser on it.
    await c.evalExpr(SET_SELECT(PICKER_SELECT, 0));
    await sleep(900);
    const unthreaded = await c.json(PICKER_LEAF('nothing threads the raster chooser'));
    check('4b', 'an OWN-PRESET, UNTHREADED section says it is one aeon line away — not "you cannot"',
      unthreaded.leaf === true && unthreaded.rects > 0 && unthreaded.visible !== false
      && unthreaded.hitInside === true
      && /no preset threads ojz_act1_sec_raster\(sec: 0\)/.test(unthreaded.text)
      && /one line in aeon/.test(unthreaded.text)
      && truth.own.includes(0) && !truth.wired.includes(0),
      `${JSON.stringify(unthreaded)}\n        independent parse: own=[${truth.own.join(',')}] `
      + `wired=[${truth.wired.join(',')}]`);

    // Section 5 is wired: nothing to say.
    await c.evalExpr(SET_SELECT(PICKER_SELECT, 5));
    await sleep(900);
    const wiredView = await c.json(String.raw`(() => {
      const p = ${PICKER};
      const t = (p.innerText || '').replace(/\s+/g, ' ');
      return { text: t.trim(), quiet: !/share the preset record|nothing threads|could not read/.test(t) };
    })()`);
    check('4c', 'the WIRED section is silent — the same finder that spoke twice above says nothing',
      wiredView.quiet === true && /raster: wired/.test(wiredView.text)
      && truth.wired.includes(5),
      `${JSON.stringify(wiredView)}\n        independent parse: wired=[${truth.wired.join(',')}]`);

    // THE SETS THE PICKER PRINTS, AGAINST THE INDEPENDENT PARSE.
    const chipText = await c.json(String.raw`(() => {
      const p = ${PICKER};
      const el = [...p.querySelectorAll('span')].find((s) => /^act: /.test((s.innerText || '').trim()));
      if (!el) return { found: false, all: [...p.querySelectorAll('span')].map((s) => s.innerText) };
      return { found: true, text: (el.innerText || '').trim(),
               rects: el.getClientRects().length,
               visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null };
    })()`);
    check('4d', 'the picker PRINTS the derived sets, and they equal this process\'s own parse',
      chipText.found === true && chipText.rects > 0 && chipText.visible !== false
      && chipText.text === `act: wired ${truth.wired.join(',')} · own preset ${truth.own.join(',')}`,
      `app: ${JSON.stringify(chipText.text)}\n        independent: `
      + `"act: wired ${truth.wired.join(',')} · own preset ${truth.own.join(',')}"`);

    // ---- 5. THE PROSE CUT. -----------------------------------------------
    const limit = await c.json(String.raw`(() => {
      const box = [...document.querySelectorAll('div')]
        .filter((d) => d.style && /^2px solid/.test(d.style.borderLeft || ''))[0];
      if (!box) return { found: false };
      box.scrollIntoView({ block: 'center' });
      const titles = [...box.querySelectorAll('[title]')].map((e) => (e.title || '').length);
      return {
        found: true,
        paintedChars: (box.innerText || '').length,
        longestTitle: titles.length ? Math.max(...titles) : 0,
        titleCount: titles.length,
        rects: box.getClientRects().length,
        visible: typeof box.checkVisibility === 'function' ? box.checkVisibility() : null,
        hasGuideLink: [...box.querySelectorAll('button')]
          .some((b) => /guide/i.test((b.textContent || ''))),
      };
    })()`);
    check('5a', 'the limit block PAINTS author-length prose, not the 8,059-character memo',
      limit.found === true && limit.rects > 0 && limit.visible !== false
      && limit.paintedChars > 300 && limit.paintedChars < 2000,
      JSON.stringify(limit));
    check('5b', 'and the contract wording is still REACHABLE — moved, not deleted',
      limit.longestTitle > 4000 && limit.titleCount >= 4 && limit.hasGuideLink === true,
      `longest title = ${limit.longestTitle} chars over ${limit.titleCount} element(s); `
      + `guide link present = ${limit.hasGuideLink}`);

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-section-picker.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/effects-section-picker.png`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n════ ${pass}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
