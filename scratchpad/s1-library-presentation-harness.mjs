#!/usr/bin/env node
// S1 LIBRARY PRESENTATION — the three owner findings, in the real app.
//
// Sibling of s1-boss-sprites-harness.mjs (same scaffold: VITE_AURORA_DEBUG=1
// build under xvfb+CDP, real s1disasm, everything read back through
// window.__dbg / the DOM). Rows assert the FIXED behavior, so a run against
// the pre-fix build is the red transcript (five Eggman rows, the bosses under
// "GHZ objects", a 35-entry Object Library, a silent unavailable placement):
//
//   1  boot, open s1disasm, GHZ1 ready (the level premise for zone grouping)
//   2  SPRITE LIST sectioning (Finding A): the Eggman row's section header is
//      "Shared objects", NOT "GHZ objects"; Moto Bug (ghz-scoped) stays under
//      "GHZ objects"
//   3  SPRITE LIST dedup (Finding B): exactly ONE Eggman row, labeled
//      "Eggman (Boss)", covering $3D $73 $75 $77 $7A in its subtitle/tooltip
//   4  EXPLORER Object Library (Finding C): both groups render — the
//      available-in-GHZ block first, then a "Not loaded in GHZ" divider, then
//      the unavailable rows (disabled, reasons on hover); the Eggman dedup
//      applies here too
//   5  PLACEMENT of an unavailable id (Finding C): arming Jaws ($2C — linked
//      in LZ/SBZ only) in the Objects facet and clicking the map PLACES it
//      (objpos allows any id <= $7F) AND fires the honest warning toast
//      naming the object and the zone
//   6  ANTI-VACUOUS: placing an AVAILABLE id (Egg Prison $3E — zone-free, and
//      absent from GHZ1's objpos so before/after findObject proves THIS
//      placement) stays silent — row 5 passed because of the classification,
//      not because every placement now nags
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as the sibling: refuse
// to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-library-presentation-harness.mjs   (VERBOSE=1 for app logs)

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9391);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = join(ROOT, 'scratchpad/shots-s1-library');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
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
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)), close: () => ws.close() };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(300);
  return true;
}

/**
 * Every sprite-mode S1 object row: the row buttons carry the stable
 * "…art + mappings" / "currently open" titles in old and new code alike, and
 * a row's section header text is its list's grandparent's first child
 * (CollapsibleSection root = [header, list, …]) — so the same scan reads the
 * pre-fix and post-fix DOM, which is what makes the red transcript quotable.
 */
const SPRITE_ROW_SCAN = `(() => {
  const rows = [...document.querySelectorAll('button')]
    .filter((b) => (b.title || '').includes('art + mappings') || (b.title || '').includes('currently open'));
  return rows.map((b) => {
    let sect = b.parentElement; // the list div
    const root = sect ? sect.parentElement : null;
    const header = root && root.firstElementChild ? root.firstElementChild.textContent.replace(/\\s+/g, ' ').trim() : '';
    return { text: b.textContent.replace(/\\s+/g, ' ').trim(), title: b.title, header };
  });
})()`;

/** The Explorer's Object Library section: header text, row buttons, heading divs. */
const EXPLORER_LIB_SCAN = `(() => {
  const headers = [...document.querySelectorAll('div')]
    .filter((d) => d.textContent.replace(/\\s+/g, ' ').trim().startsWith('Object Library') && d.children.length > 0);
  let hdr = null;
  for (const h of headers) if (!hdr || h.textContent.length < hdr.textContent.length) hdr = h;
  if (!hdr) return null;
  let root = hdr;
  while (root && !(root.children.length >= 2 && root.contains(hdr) && root.querySelector('button'))) root = root.parentElement;
  if (!root) return { rows: [], headings: [] };
  const rows = [...root.querySelectorAll('button')]
    .filter((b) => !b.textContent.includes('Object Library'))
    .map((b) => ({
      text: b.textContent.replace(/\\s+/g, ' ').trim(),
      title: b.title, disabled: b.disabled,
    }));
  const headings = [...root.querySelectorAll('[data-explorer-heading]')]
    .map((d) => d.textContent.replace(/\\s+/g, ' ').trim());
  return { rows, headings };
})()`;

/** Click the biggest canvas (the map — never an object thumbnail) at the level point. */
async function clickLevelPoint(c, lx, ly, zoom) {
  await c.evalExpr(`window.__dbg.setView(${lx - 60 / zoom}, ${ly - 60 / zoom}, ${zoom})`);
  await sleep(800);
  const view = await c.json('window.__dbg.view()');
  const rect = await c.json(`(() => {
    const cs = [...document.querySelectorAll('canvas')];
    let best = null;
    for (const el of cs) { const b = el.getBoundingClientRect();
      if (!best || b.width * b.height > best.width * best.height) best = b; }
    return best ? { left: Math.round(best.left), top: Math.round(best.top), w: Math.round(best.width), h: Math.round(best.height) } : null;
  })()`);
  const sx = Math.round(rect.left + (lx - view.x) * view.zoom);
  const sy = Math.round(rect.top + (ly - view.y) * view.zoom);
  if (sx < rect.left || sy < rect.top || sx > rect.left + rect.w || sy > rect.top + rect.h) {
    throw new Error(`click (${sx},${sy}) outside canvas ${JSON.stringify(rect)}`);
  }
  await mouse(c, 'mousePressed', sx, sy);
  await sleep(60);
  await mouse(c, 'mouseReleased', sx, sy, { buttons: 0 });
  await sleep(500);
}

/** Arm an object from the Objects-facet library by its row title. */
async function armLibraryRow(c, filterText, rowTitle) {
  await c.evalExpr(`(() => {
    const inp = document.querySelector('input[aria-label="Filter object library"]');
    if (!inp) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(inp, ${JSON.stringify(filterText)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  return clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.title === ${JSON.stringify(rowTitle)})`);
}

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, 'artnem/Boss - Main.nem'))) throw new Error(`${S1DIR}/artnem/Boss - Main.nem missing — nothing to test`);

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // --- Row 1: open s1disasm; GHZ1 auto-opens ------------------------------
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 30 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    let lvl = { status: 'idle' };
    for (let i = 0; i < 30 && lvl.status !== 'ready'; i++) {
      await sleep(500);
      lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
    }
    check('1', 'the app opened s1disasm and GHZ1 is ready',
      proj.zones > 0 && lvl.status === 'ready' && lvl.zone === 'ghz',
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl)}`);

    // --- Rows 2+3: the sprite list's sections and the Eggman dedup ----------
    await c.evalExpr('window.__dbg.editObjectArt(0x3d)');
    await sleep(2000);
    const rows = await c.json(SPRITE_ROW_SCAN);
    await shot(c, 'sprite-list');
    const egg = rows.filter((r) => r.text.includes('Eggman'));
    const moto = rows.find((r) => r.text.includes('Moto Bug'));
    check('2', 'Finding A: the Eggman row sits under "Shared objects", not "GHZ objects"; Moto Bug stays under "GHZ objects"',
      egg.length > 0 && egg.every((r) => r.header === 'Shared objects') && moto?.header === 'GHZ objects',
      `eggman headers=${JSON.stringify([...new Set(egg.map((r) => r.header))])} motoBug header=${JSON.stringify(moto?.header ?? null)}`);
    // $82 (SBZ2 cutscene) and $85 (FZ boss) are DISTINCT objects on separate
    // links — they must stay their own rows; only the five shared-link zone
    // bosses merge into "Eggman (Boss)".
    const perZoneBossRows = egg.filter((r) => /Eggman \((GHZ|MZ|SYZ|LZ|SLZ) Boss\)/.test(r.text));
    const merged = egg.filter((r) => r.text.includes('Eggman (Boss)'));
    const coveredOk = perZoneBossRows.length === 0 && merged.length === 1
      && ['$3D', '$73', '$75', '$77', '$7A'].every((h) => (merged[0].text + ' ' + merged[0].title).includes(h))
      && egg.some((r) => r.text.includes('Eggman (SBZ2 Cutscene)'))
      && egg.some((r) => r.text.includes('Eggman (FZ Boss)'));
    check('3', 'Finding B: ONE "Eggman (Boss)" row covering $3D $73 $75 $77 $7A (the $82/$85 non-shared rows stay separate)',
      coveredOk,
      `eggman rows (${egg.length}) = ${JSON.stringify(egg.map((r) => r.text))}`);

    // --- Row 4: the Explorer's Object Library shows BOTH groups -------------
    // The group is defaultCollapsed — expand it by clicking its header.
    await clickEl(c, `[...document.querySelectorAll('div')].filter((d) => d.children.length && [...d.children].some((ch) => ch.textContent.trim().startsWith('Object Library'))).map((d) => [...d.children].find((ch) => ch.textContent.trim().startsWith('Object Library'))).filter(Boolean)[0]`);
    await sleep(400);
    const lib = await c.json(EXPLORER_LIB_SCAN);
    await shot(c, 'explorer-library');
    const libRows = lib?.rows ?? [];
    const libEgg = libRows.filter((r) => r.text.includes('Eggman'));
    const libPerZoneBoss = libEgg.filter((r) => /Eggman \((GHZ|MZ|SYZ|LZ|SLZ) Boss\)/.test(r.text));
    const libMerged = libEgg.filter((r) => r.text.includes('Eggman (Boss)'));
    const heading = (lib?.headings ?? []).find((h) => h.includes('Not loaded in GHZ'));
    const firstDisabled = libRows.findIndex((r) => r.disabled);
    const availableBlockFirst = firstDisabled > 0 && libRows.slice(firstDisabled).every((r) => r.disabled);
    const jawsRow = libRows.find((r) => r.text.includes('Jaws'));
    check('4', 'Finding C: Object Library lists ALL objects — available block first, "Not loaded in GHZ" divider, then annotated unavailable rows (Jaws present+disabled); Eggman deduped here too',
      libRows.length > 60 && heading !== undefined && availableBlockFirst
      && jawsRow?.disabled === true && (jawsRow?.title ?? '').includes('Not loaded in GHZ')
      && libPerZoneBoss.length === 0 && libMerged.length === 1,
      `rows=${libRows.length} headings=${JSON.stringify(lib?.headings ?? [])} firstDisabled=${firstDisabled} `
      + `jaws=${JSON.stringify(jawsRow ?? null)} eggmanRows=${JSON.stringify(libEgg.map((r) => r.text))}`);

    // --- Row 5: placing unavailable Jaws ($2C) places AND warns -------------
    // Focus the LEVEL TAB by clicking it (activate() readies the doc but does
    // not move tab focus — the place-jaws screenshot proved the sprite tab was
    // still frontmost). el.click() rather than coordinates throughout the
    // chrome: the explorer expansion above shifts layout between measure and
    // dispatch.
    await c.evalExpr(`(() => { const t = [...document.querySelectorAll('div,button,span')].filter((x) => x.textContent.trim() === 'Green Hill Zone Act 1').pop(); if (t) t.click(); })()`);
    await sleep(1200);
    await c.evalExpr(`(() => { const b = [...document.querySelectorAll('[role="group"][aria-label="Facets"] button')].find((x) => x.textContent.trim() === 'Objects'); if (b) b.click(); })()`);
    await sleep(800);
    const libboxReady = await c.evalExpr(`!!document.querySelector('[role="listbox"][aria-label="Object library"]')`);
    const jawsBefore = await c.json('window.__dbg.classic.findObject(0x2c)');
    const armed = await armLibraryRow(c, 'Jaws', 'Place Jaws ($2C)');
    await clickLevelPoint(c, 700, 500, 1);
    const placedJaws = await c.json('window.__dbg.classic.findObject(0x2c)');
    const toasts1 = await c.json('window.__dbg.canvas.toasts()');
    await shot(c, 'place-jaws');
    const warn = toasts1.find((t) => t.type === 'warning' && t.message.includes('Jaws ($2C)'));
    check('5', 'placing Jaws ($2C) in GHZ is ALLOWED (objpos permits it) and fires the honest warning naming object + zone',
      libboxReady && armed && jawsBefore === null && placedJaws !== null && warn !== undefined
      && warn.message.includes("GHZ's Pattern Load Cues never load its art")
      && warn.message.includes('LZ, SBZ'),
      `libbox=${libboxReady} armed=${armed} before=${JSON.stringify(jawsBefore)} placed=${JSON.stringify(placedJaws)} toasts=${JSON.stringify(toasts1)}`);

    // --- Row 6: anti-vacuous — an AVAILABLE placement stays silent ----------
    // Egg Prison ($3E): zone-free base link (available in GHZ), and GHZ1's
    // objpos has none — so before/after findObject proves THIS placement.
    const prisonBefore = await c.json('window.__dbg.classic.findObject(0x3e)');
    const armed2 = await armLibraryRow(c, 'Egg Prison', 'Place Egg Prison ($3E)');
    await clickLevelPoint(c, 760, 500, 1);
    const placedPrison = await c.json('window.__dbg.classic.findObject(0x3e)');
    const toasts2 = await c.json('window.__dbg.canvas.toasts()');
    const newWarns = toasts2.filter((t) => t.type === 'warning' && t.message.includes('Egg Prison'));
    check('6', 'ANTI-VACUOUS: placing available Egg Prison ($3E) places with NO warning',
      armed2 && prisonBefore === null && placedPrison !== null && newWarns.length === 0,
      `armed=${armed2} before=${JSON.stringify(prisonBefore)} placed=${JSON.stringify(placedPrison)} prisonToasts=${JSON.stringify(newWarns)}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
