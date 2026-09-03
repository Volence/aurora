#!/usr/bin/env node
// Full-surface capture + functional pass for the stage-4 shell flip.
//
// Screenshots every surface FULL-WINDOW (never cropped): every problem the owner
// found was in the composition, not the component, so a crop would have hidden
// all of them.
//
// Selector lessons carried from tool-split-harness.mjs and the first two rounds
// of this one — every single "failure" they produced was the harness's own:
//   - the ui kit's Chip is a <span> with onClick, NOT a button;
//   - object-library rows ARE buttons, but WRAP spans, so a leaf-only rule skips
//     them;
//   - the map STATUS BAR prints the active plane as a bare "FG" span, so an
//     unscoped chip count sees one control as two (FG:2/BG:1 — the asymmetry is
//     the tell). Chip counts are scoped to the workspace header.
//   - a classic project ALWAYS auto-opens the first available act
//     (session-lifecycle's defaultProjectSession(firstOpenableLevelTab)), so
//     "project open, no act" has to be manufactured — it is not a cold-open
//     state, and two rounds reported the empty state missing because of it.
//   - awaiting `__dbg.activate()` resolves only AFTER the load finishes, so
//     polling for the LOADING empty state after awaiting it always misses.
//   - the workspace persists the per-tab facet, so a run that ends on Art starts
//     the NEXT run on Art. Every phase pins the facet it wants.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9351);
const S1DIR = siblingPathOrUnresolved('s1disasm');
// NO TRAILING SLASH, and that is a fix rather than a tidy-up (O53 §5 named this
// as the third site; O54 landed it). L464 seeds a recent row with this string
// and L473 then finds it by `button[title=<AEONDIR>]` — but `addRecentProject`
// stores through `normalizeProjectPath` (`src/shared/project-path.ts:29`), which
// strips trailing separators, and the row renders `title={r.path}`. So the old
// `+ '/'` searched for a title the app could never render, and the aeon half of
// this capture died at "aeon unreachable" reporting the Explorer's collapse
// toggle instead.
const AEONDIR = siblingPathOrUnresolved('aeon');
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
// DERIVED, never a session path. This defaulted to a 2026-08 session's
// scratchpad under /tmp/claude-1000/…, which stopped existing when that session
// ended; `mkdirSync(…, {recursive:true})` then RE-CREATED it, so the harness
// wrote its screenshots into a directory nobody would ever look in and reported
// success. Every other harness here writes `${ROOT}/scratchpad/shots-<name>`;
// this one now does too, and SHOTS still overrides it.
const SHOTS = process.env.SHOTS ?? `${ROOT}/scratchpad/shots-capture`;

/* ═════════════════════════════════════════════════════════════════════════════
 * THE PILL ROW AND THE TOOL RAIL, DERIVED FROM THE APP'S OWN SOURCES.
 *
 * ⚠ SIX ROWS HERE WERE FROZEN PICTURES OF A 2026-08 SHELL. They pinned
 * `['Layout','Art','Objects','Palette']`, "NO Collision pill", a Layout dock in
 * MANIFEST order, and "Palette has no rail" — every one of which the product has
 * since changed ON PURPOSE:
 *
 *   · `collision` joined `S1_FACETS` (Stage 3b, 2026-08-17) — the row asserting
 *     its ABSENCE was asserting the absence of a shipped facet;
 *   · `art` moved LAST (owner, 2026-08-14; the reasoning is in
 *     core/project/s1/index.ts's facetTools block — `art` swaps the canvas, so
 *     crossing it read as a scene change);
 *   · the rail sorts by `dockOrder`/`TOOL_IDS`, not by the manifest's order,
 *     which is why `["View","Select","Stamp Chunk"]` was reported as a failure
 *     against a pin reading `["View","Stamp Chunk","Select"]` — the SAME THREE
 *     TOOLS in a different order;
 *   · `palette` takes a `MapFacetDock` like every other map facet and so has a
 *     one-tool rail; "no rail" was true when Art's EMPTY rail was the bug being
 *     fixed, and stopped being true when palette became a map facet.
 *
 * None of that is a regression, and a pinned list cannot tell a regression from
 * a decision. These readers take the app's own declarations instead, so the row
 * that survives is the one worth having: the BAR must be what the profile
 * GRANTS, in the SHELL's order — a facet granted and not shown, or shown and not
 * granted, still fails.
 * ═══════════════════════════════════════════════════════════════════════════ */

function readSource(rel) {
  const p = `${ROOT}/${rel}`;
  try { return readFileSync(p, 'utf8'); }
  catch (e) { throw new Error(`cannot read ${p} (${e.code ?? e.message}) — this harness derives its pill and rail expectations from it, and an unreadable source is UNMEASURABLE, not a pass`); }
}
function listFromSource(rel, re, what) {
  const m = re.exec(readSource(rel));
  if (!m) throw new Error(`${rel} no longer spells ${what} the way this harness reads it — re-derive it rather than pinning the old answer`);
  const out = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  if (!out.length) throw new Error(`${what} in ${rel} parsed to an EMPTY list — refusing to compare a bar against nothing`);
  return out;
}
/** The facet table: id, label and order, from core/shell/facets.ts. */
function facetTable() {
  const body = /const BUILTIN_FACETS: FacetDescriptor\[\] = \[([\s\S]*?)\n\];/.exec(
    readSource('src/core/shell/facets.ts'));
  if (!body) throw new Error('core/shell/facets.ts no longer spells `const BUILTIN_FACETS: FacetDescriptor[] = [ … ];`');
  const rows = [...body[1].matchAll(/\{\s*id:\s*'([a-z-]+)',\s*label:\s*'([^']+)',\s*order:\s*(\d+)\s*\}/g)]
    .map((m) => ({ id: m[1], label: m[2], order: Number(m[3]) }));
  if (!rows.length) throw new Error('BUILTIN_FACETS parsed to an EMPTY table');
  return rows;
}
/** The pill row a grant produces: granted ∩ registered, sorted by `order` —
 *  `facetsFor`'s own rule, read off the same two files it reads. */
function expectedPills(grant) {
  const table = facetTable();
  const pills = table.filter((f) => grant.includes(f.id))
    .sort((a, b) => a.order - b.order).map((f) => f.label);
  const unknown = grant.filter((g) => !table.some((f) => f.id === g));
  if (unknown.length) throw new Error(`the grant names facet(s) no descriptor registers: ${unknown.join(', ')}`);
  return pills;
}
const s1Grant = () => listFromSource('src/core/project/s1/index.ts',
  /export const S1_FACETS = \[([^\]]*)\]/, '`export const S1_FACETS = [ … ]`');
const aeonGrant = () => listFromSource('src/core/project/aeon/index.ts',
  /facets:\s*\[([^\]]*)\]/, 'its `facets: [ … ]` grant');
/** `TOOL_IDS` order and `TOOL_LABELS` — the two files `dockOrder` and
 *  `MapFacetDock` read to build the rail. */
function toolOrder() {
  return listFromSource('src/core/project/adapter.ts',
    /export const TOOL_IDS = \[([\s\S]*?)\] as const;/, '`export const TOOL_IDS = [ … ] as const;`');
}
function toolLabelTable() {
  const m = /export const TOOL_LABELS: Record<ToolId, string> = \{([\s\S]*?)\n\};/
    .exec(readSource('src/renderer/workspace/tool-meta.ts'));
  if (!m) throw new Error('renderer/workspace/tool-meta.ts no longer spells `export const TOOL_LABELS: Record<ToolId, string> = { … };`');
  const out = {};
  for (const row of m[1].matchAll(/'?([a-z-]+)'?:\s*'([^']+)'/g)) out[row[1]] = row[2];
  if (!Object.keys(out).length) throw new Error('TOOL_LABELS parsed EMPTY');
  return out;
}
/** The Layout rail: `facetTools.layout` from the s1 manifest, in dock order. */
function expectedLayoutRail() {
  const block = /facetTools:\s*\{([\s\S]*?)\n\s*\},/.exec(readSource('src/core/project/s1/index.ts'));
  if (!block) throw new Error('core/project/s1/index.ts no longer declares a `facetTools: { … }` block');
  const row = /\n\s*layout:\s*\[([^\]]*)\]/.exec(block[1]);
  if (!row) throw new Error('the s1 manifest no longer declares facetTools.layout, so the Layout rail is the SHELL default and this row is asserting the wrong file');
  const ids = [...row[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  if (!ids.length) throw new Error('facetTools.layout parsed EMPTY');
  const order = toolOrder(); const labels = toolLabelTable();
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((id) => labels[id]);
}

mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text}`);
    return r.result.value;
  };
  return {
    ready, send, evalExpr,
    // Round-trip through JSON so an object result survives `returnByValue`.
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}

const fails = [];
const notes = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(`${name} (${detail})`);
}

// --- probes ---------------------------------------------------------------
const PILLS = `[...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim())`;
const ACTIVE_PILL = `
  (() => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')]
      .find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return b ? b.textContent.trim() : null;
  })()`;
const clickPill = (label) => `
  (() => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')]
      .find((e) => e.textContent.trim() === ${JSON.stringify(label)});
    if (!b) return false;
    b.click(); return true;
  })()`;
const toolCount = (label) => `document.querySelectorAll('button[aria-label=${JSON.stringify(label)}]').length`;
const TOOL_LABELS = ['View','Select','Marquee','Paint Tile','Paint Block','Stamp Chunk','Paint Collision','Place Object','Place Ring','Eraser'];
const ACTIVE_TOOL = `
  (() => {
    const labels = ${JSON.stringify(TOOL_LABELS)};
    const b = [...document.querySelectorAll('button[aria-label]')]
      .filter((e) => labels.includes(e.getAttribute('aria-label')))
      .find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return b ? b.getAttribute('aria-label') : null;
  })()`;
const DOCK_TOOLS = `
  (() => {
    const labels = ${JSON.stringify(TOOL_LABELS)};
    return [...document.querySelectorAll('button[aria-label]')]
      .map((e) => e.getAttribute('aria-label')).filter((l) => labels.includes(l));
  })()`;
// ⚠ `button,span`, NOT `span`. `598be067` (2026-08-16, "the §5 accessibility
// and consistency calls") made every INTERACTIVE Chip a real `<button>` and
// left spans for the non-interactive readouts — the primitive's own comment
// names the FG/BG plane switch and Undo/Redo among the chips this moved. Both
// of this file's chip probes were span-only, so `chipCount('FG')` counted 0
// with the control on screen and `chipEnabled('Undo')` answered `null`, which
// took five rows down between them and printed `{"FG":0,"BG":0}` — the reading
// a DELETED control gives.
//
// The header comment above still records the ORIGINAL reason this probe is
// scoped to the workspace header (the status bar prints a bare "FG" span, so an
// unscoped count saw one control as two). That reason is unchanged; the element
// type is what moved.
const chipCount = (label) => `
  (() => {
    const hdr = document.querySelector('[aria-label="Facets"]');
    if (!hdr) return -1;
    return [...hdr.parentElement.querySelectorAll('button,span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)}).length;
  })()`;
const clickChip = (label) => `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    if (!s) return false;
    s.click(); return true;
  })()`;
// Same move as `chipCount` — and enabledness now comes off the button's own
// `disabled` property, which is what `LevelWorkspace` writes
// (`disabled={!history?.canUndo}`); opacity is a styling consequence of it.
// Spans keep the opacity rule, having no `disabled`.
const chipEnabled = (label) => `
  (() => {
    const all = [...document.querySelectorAll('button,span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    const e = all.find((x) => x.tagName === 'BUTTON') || all[0];
    if (!e) return null;
    return e.tagName === 'BUTTON' ? !e.disabled : getComputedStyle(e).opacity === '1';
  })()`;
const CANVAS_RECT = `
  (() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`;
const SCOPE = `
  (() => {
    const s = [...document.querySelectorAll('span')].map((e) => e.textContent.trim())
      .filter((t) => /chunks · .* blocks · .* objects/.test(t));
    return s[0] ?? '';
  })()`;
// Section headers in the RIGHT-HAND panel only. Scoped by horizontal position
// because the EXPLORER's group headers ("Art", "Objects", "Palette", "Levels")
// are also plain buttons with those exact texts — an unscoped match reported
// classic's Layout panel as ["Art","Objects","Palette"] and produced four
// consecutive phantom failures, including a "Layout and Objects are identical"
// that was purely the Explorer being read twice.
// CollapsibleSection's header is a <div onClick> wrapping a PanelHeader whose
// title sits in a <span> beside a chevron <span> — NOT a button. Two rounds of
// button-based probes reported classic's panels as empty or as ["View"] (the
// View MENU trigger, which IS a button in the right half of the header).
const SECTIONS = `
  (() => {
    const mid = window.innerWidth / 2;
    const TITLES = ['Chunks','Palette','Objects','Selected Object','Tileset','Collision',
                    'Sections','Art','Properties','Rings','Marquee','Paste'];
    const out = [];
    for (const e of document.querySelectorAll('span')) {
      const t = e.textContent.trim();
      if (!TITLES.includes(t)) continue;
      const r = e.getBoundingClientRect();
      if (r.left <= mid || r.width === 0) continue;   // left half = Explorer
      out.push(t);
    }
    // Deduped: CollapsibleSection nests the title span inside another span, so
    // every header matches twice.
    return [...new Set(out)];
  })()`;
// The 44px tool rail, if EditorShell drew one.
const RAIL = `
  (() => {
    const d = [...document.querySelectorAll('div')].find((e) => e.style && e.style.width === '44px');
    return d ? { w: d.getBoundingClientRect().width, kids: d.children.length } : null;
  })()`;
const STATUSBAR = `
  (() => {
    const f = document.querySelector('footer');
    return f ? f.innerText.replace(/\\s+/g, ' ').trim() : null;
  })()`;

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`   shot: ${name}.png`);
}

/** Capture one surface and record the facts the design review needs. */
async function survey(c, name, label) {
  await shot(c, name);
  const entry = {
    surface: label,
    file: `${name}.png`,
    pills: await c.evalExpr(PILLS),
    activePill: await c.evalExpr(ACTIVE_PILL),
    dockTools: await c.evalExpr(DOCK_TOOLS),
    rail: await c.evalExpr(RAIL),
    statusBar: await c.evalExpr(STATUSBAR),
    sections: await c.evalExpr(SECTIONS),
    canvas: await c.evalExpr(CANVAS_RECT),
    planeChips: { FG: await c.evalExpr(chipCount('FG')), BG: await c.evalExpr(chipCount('BG')) },
  };
  notes.push(entry);
  return entry;
}

async function clickCanvasAt(c, fx, fy) {
  const r = await c.evalExpr(CANVAS_RECT);
  if (!r) return null;
  const x = Math.round(r.x + r.w * fx), y = Math.round(r.y + r.h * fy);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(240);
  return { x, y };
}
async function ctrlZ(c) {
  const p = { key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  await sleep(240);
}

// UNDER Xvfb AT A STATED SIZE. This spawned Electron bare, so it opened a real
// window on whatever display the operator had and captured every screenshot at
// whatever size that window took — for a harness whose PRODUCT is full-window
// screenshots of the composition, the screen size is part of the measurement,
// and an unstated one makes two runs incomparable. Every sibling in this
// population already runs this way.
function launch() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const e = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
  e.stderr.on('data', () => {}); e.stdout.on('data', () => {});
  return e;
}
async function connect() {
  const c = cdp(await waitForTarget());
  await c.ready;
  await c.send('Runtime.enable');
  await c.send('Page.enable').catch(() => {});
  for (let i = 0; i < 60; i++) {
    try { if (await c.evalExpr('typeof window.__dbg === "object"')) break; } catch { /* context swap */ }
    await sleep(250);
  }
  return c;
}
/** Open a tab by its Explorer/session title. */
const openExplorerItem = (text) => `
  (() => {
    const b = [...document.querySelectorAll('button')]
      .find((e) => e.textContent.trim() === ${JSON.stringify(text)});
    if (!b) return false;
    b.click(); return true;
  })()`;

// ---------------------------------------------------------------------------
async function classicPhase(c) {
  console.log('\n=== CLASSIC (s1disasm) ===');

  // --- EMPTY STATES, before an act. Manufactured: a cold open auto-opens the
  //     first available act, so the only way to see these is to clear the
  //     persisted session and catch the app before restore completes. We open
  //     the project and immediately capture each facet while it is still
  //     loading, then confirm the text.
  // The pre-act state is TRANSIENT, not a resting state: a cold open restores
  // defaultProjectSession(firstOpenableLevelTab()) and lands on ghz1. So capture
  // the facets while the act is still loading, and poll for the empty-state text
  // rather than sampling once. openDir is fire-and-forget for the same reason
  // activate is: awaiting it returns only once the load is done.
  await c.evalExpr('localStorage.clear(); 1');
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)}); 1`);
  // ⚠ MANUFACTURE THE STATE; DO NOT RACE IT. This used to open the project and
  // sample each facet hoping to catch the load still running — and its own
  // failure text said so ("may have loaded too fast to catch"). A row that can
  // only be observed by winning a race reports the machine's speed, not the
  // product: it passed on a bare window and failed under xvfb on the same build,
  // one minute apart, on 2026-09-03.
  //
  // `__dbg.resetLevel()` puts the level store back to IDLE with the project
  // still open, which IS the state under test — "project open, no act", the
  // state the harness's own header notes has to be manufactured because a cold
  // open always restores an act. The wait below is for the project, not for a
  // window in someone else's timing.
  for (let i = 0; i < 40; i++) {
    const st = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    if (st.zones > 0) break;
    await sleep(400);
  }
  await c.evalExpr('window.__dbg.resetLevel(); 1');
  await sleep(500);
  const lvlIdle = await c.json('window.__dbg.levelState()');
  if (lvlIdle.status === 'ready') {
    throw new Error('resetLevel() did not take the level store out of `ready`, so the pre-act state '
      + 'below was never entered. UNMEASURABLE — an act is loaded and every "empty state" reading '
      + 'would be about a populated surface.');
  }
  const emptyPerFacet = {};
  for (const f of ['Layout', 'Art', 'Objects', 'Palette']) {
    await c.evalExpr(clickPill(f));
    await sleep(400);
    await shot(c, `classic-empty-${f.toLowerCase()}`);
    emptyPerFacet[f] = await c.evalExpr(`
      (() => {
        const m = /Loading .{0,40}?…|Open a level from the Explorer|Failed to load level|no act|No act open/i.exec(document.body.textContent);
        return m ? m[0] : '';
      })()`);
  }
  const emptyText = Object.values(emptyPerFacet).find((t) => t) ?? '';
  // EVERY facet, not "at least one" — the row is about the four surfaces, and a
  // single hit let three blank windows through.
  check('every classic pre-act surface renders an EMPTY STATE, not a blank window',
    Object.values(emptyPerFacet).every((t) => t !== ''),
    `level=${lvlIdle.status} ${JSON.stringify(emptyPerFacet)}`);

  await sleep(3000);
  await c.evalExpr('window.__dbg.activate("ghz", 1)');
  await sleep(2500);

  // --- the four facets, loaded ---------------------------------------------
  await c.evalExpr(clickPill('Layout')); await sleep(700);
  const layout = await survey(c, 'classic-layout', 'classic / Layout (act loaded)');
  const wantS1Pills = expectedPills(s1Grant());
  check(`the pill row is what the s1 profile GRANTS, in shell order — ${wantS1Pills.join(' / ')}`,
    JSON.stringify(layout.pills) === JSON.stringify(wantS1Pills),
    `want ${JSON.stringify(wantS1Pills)}  got ${JSON.stringify(layout.pills)}`);
  // The claim the deleted "NO Collision pill" row was really making — that
  // Layout's TOOLS are terrain-only — survives here. `collision` is a facet
  // now (Stage 3b, 2026-08-17), so its ABSENCE from the bar is no longer the
  // thing to assert; its absence from LAYOUT'S RAIL is.
  check('Layout arms no write tool it does not own (no Paint Collision, no Place Object)',
    !layout.dockTools.includes('Paint Collision') && !layout.dockTools.includes('Place Object'),
    JSON.stringify(layout.dockTools));
  const wantRail = expectedLayoutRail();
  check(`the Layout rail is exactly facetTools.layout in dock order — ${wantRail.join(' / ')}`,
    JSON.stringify(layout.dockTools) === JSON.stringify(wantRail),
    `want ${JSON.stringify(wantRail)}  got ${JSON.stringify(layout.dockTools)}`);
  check('Layout panel is the chunk picker alone (no object list/inspector)',
    JSON.stringify(layout.sections) === JSON.stringify(['Chunks']), JSON.stringify(layout.sections));
  check('Layout FG/BG appears exactly once each',
    layout.planeChips.FG === 1 && layout.planeChips.BG === 1, JSON.stringify(layout.planeChips));
  check('Layout has a status bar', !!layout.statusBar, layout.statusBar);
  check('Layout canvas has real area', layout.canvas && layout.canvas.w > 300, JSON.stringify(layout.canvas));
  const painted = await c.evalExpr(`
    (() => { const c = document.querySelector('canvas'); if (!c) return 0;
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width,400), Math.min(c.height,400)).data;
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i]||d[i+1]||d[i+2]) n++; return n; })()`);
  check('Layout canvas actually PAINTS', painted > 1000, `non-black subpixels: ${painted}`);

  await c.evalExpr(clickPill('Objects')); await sleep(700);
  const objects = await survey(c, 'classic-objects', 'classic / Objects (act loaded)');
  check('Objects dock has place-object', objects.dockTools.includes('Place Object'), JSON.stringify(objects.dockTools));
  check('Objects panel owns the inspector + library',
    objects.sections.includes('Selected Object') && objects.sections.includes('Objects'), JSON.stringify(objects.sections));
  check('Objects is no longer a SUBSET of Layout (its panel differs)',
    JSON.stringify(objects.sections) !== JSON.stringify(layout.sections), `${JSON.stringify(layout.sections)} vs ${JSON.stringify(objects.sections)}`);
  check('Objects keeps the FG/BG plane control (L2)', objects.planeChips.FG === 1, JSON.stringify(objects.planeChips));

  await c.evalExpr(clickPill('Art')); await sleep(900);
  const art = await survey(c, 'classic-art-chunk', 'classic / Art — Chunk tier');
  check('Art has NO empty 44px tool rail (gap 2)', art.rail === null, JSON.stringify(art.rail));
  check('Art now has a status bar (gap 1)', !!art.statusBar, art.statusBar);
  check('Art panel has the chunk picker (gap 5) and the palette',
    art.sections.includes('Chunks') && art.sections.includes('Palette'), JSON.stringify(art.sections));
  const collapse = await c.evalExpr(`[...document.querySelectorAll('button')].filter((e) => /Composer/.test(e.textContent)).length`);
  check('the composer is NOT collapsible any more', collapse === 0, `collapse buttons: ${collapse}`);
  const tiers = await c.evalExpr(`
    [...document.querySelectorAll('button')].map((e) => e.textContent.trim()).filter((t) => /^(Chunk|Block|Tile)$/.test(t))`);
  check('the tier tabs are present and unconditional', JSON.stringify(tiers) === JSON.stringify(['Chunk','Block','Tile']), JSON.stringify(tiers));

  // Art at each tier.
  for (const tier of ['Block', 'Tile']) {
    await c.evalExpr(`
      (() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(tier)});
        if (b) b.click(); return !!b; })()`);
    await sleep(800);
    await survey(c, `classic-art-${tier.toLowerCase()}`, `classic / Art — ${tier} tier`);
  }
  await c.evalExpr(`
    (() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Chunk');
      if (b) b.click(); return !!b; })()`);
  await sleep(500);

  await c.evalExpr(clickPill('Palette')); await sleep(800);
  const palette = await survey(c, 'classic-palette', 'classic / Palette (act loaded)');
  // ⚠ NOT "no rail". `palette` is a map facet and takes a `MapFacetDock` like
  // the rest; declaring no `facetTools` it gets the shell default `['view']`,
  // so a ONE-tool rail is the shipped answer. The gap this row was written for
  // (2026-08) was Art's rail standing EMPTY — no tools in it — and that is what
  // it should have been asserting all along, since an empty rail is the defect
  // and a populated one is the feature.
  check('Palette\'s rail is populated, not an empty 44px gutter',
    palette.rail !== null && palette.rail.kids > 0, JSON.stringify(palette.rail));
  check('Palette has a status bar', !!palette.statusBar, palette.statusBar);

  // --- L1: the surface claim must not steal the facet ----------------------
  await c.evalExpr(clickPill('Objects')); await sleep(500);
  const objBefore = await c.evalExpr(ACTIVE_PILL);
  await clickCanvasAt(c, 0.5, 0.5);
  check('L1: Objects SURVIVES a map click', objBefore === 'Objects' && (await c.evalExpr(ACTIVE_PILL)) === 'Objects',
    `${objBefore} -> ${await c.evalExpr(ACTIVE_PILL)}`);

  await c.evalExpr(clickPill('Palette')); await sleep(700);
  const palBefore = await c.evalExpr(ACTIVE_PILL);
  await c.evalExpr(`
    (() => {
      const el = [...document.querySelectorAll('div,button,canvas')].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 6 && r.width < 34 && r.height > 6 && r.height < 34 && e.children.length === 0;
      });
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.click(); return true;
    })()`);
  await sleep(400);
  check('L1: Palette SURVIVES a composer click', palBefore === 'Palette' && (await c.evalExpr(ACTIVE_PILL)) === 'Palette',
    `${palBefore} -> ${await c.evalExpr(ACTIVE_PILL)}`);

  // --- chunk picker: arms stamp, loop toggle id-gated ----------------------
  await c.evalExpr(clickPill('Layout')); await sleep(700);
  const pick = (n) => `
    (() => { const cells = [...document.querySelectorAll('[title^="Chunk $"], [title^="Air ($00)"]')];
      if (cells.length <= ${n}) return 'only ' + cells.length; cells[${n}].click(); return cells[${n}].getAttribute('title'); })()`;
  const picked = await c.evalExpr(pick(3)); await sleep(400);
  check('picking a chunk arms the stamp tool', (await c.evalExpr(ACTIVE_TOOL)) === 'Stamp Chunk', String(picked));
  check('loop toggle offered for $01..$7F',
    (await c.evalExpr(`[...document.querySelectorAll('button')].filter((e) => /Loop/.test(e.textContent)).length`)) === 1);
  await c.evalExpr(pick(0)); await sleep(400);
  check('loop toggle HIDDEN for air ($00)',
    (await c.evalExpr(`[...document.querySelectorAll('button')].filter((e) => /Loop/.test(e.textContent)).length`)) === 0);
  await c.evalExpr(pick(3)); await sleep(400);

  // --- undo: exactly one step per Ctrl+Z ------------------------------------
  const drain = async (limit = 60) => {
    let n = 0;
    while (n < limit && (await c.evalExpr(chipEnabled('Undo'))) === true) { await ctrlZ(c); n++; }
    return n;
  };
  await drain();
  check('precondition: undo stack empty', (await c.evalExpr(chipEnabled('Undo'))) === false);
  for (const [fx, fy] of [[0.30, 0.30], [0.36, 0.30], [0.42, 0.30]]) await clickCanvasAt(c, fx, fy);
  check('3 stamps leave Undo enabled', (await c.evalExpr(chipEnabled('Undo'))) === true);
  const presses = await drain();
  check('UNDO: one Ctrl+Z steps exactly ONE (Layout)', presses === 3,
    `3 edits took ${presses} presses (a double binding would take 2)`);
  await c.evalExpr(clickPill('Art')); await sleep(700);
  check('UNDO: Art re-points at the art document, not the map stack',
    (await c.evalExpr(chipEnabled('Undo'))) === false);
  await c.evalExpr(clickPill('Layout')); await sleep(700);
  check('UNDO: returning to Layout restores the map history',
    (await c.evalExpr(chipEnabled('Redo'))) === true);

  // --- place-object actually places (L2) -----------------------------------
  await c.evalExpr(clickPill('Objects')); await sleep(700);
  const before = await c.evalExpr(SCOPE);
  const armed = await c.evalExpr(`
    (() => { const b = [...document.querySelectorAll('button')].find((e) => /Crabmeat|Motobug|Chopper|Buzz/.test(e.textContent));
      if (!b) return 'no row'; b.click(); return b.textContent.trim(); })()`);
  await sleep(500);
  check('arming an object selects Place Object', (await c.evalExpr(ACTIVE_TOOL)) === 'Place Object', String(armed));
  await clickCanvasAt(c, 0.42, 0.55);
  const after = await c.evalExpr(SCOPE);
  const nObj = (s) => { const m = /(\d+) objects/.exec(s); return m ? Number(m[1]) : null; };
  check('L2: place-object PLACES', nObj(after) === nObj(before) + 1, `${nObj(before)} -> ${nObj(after)}`);

  // --- other tabs -----------------------------------------------------------
  await c.evalExpr(openExplorerItem('Home')); await sleep(800);
  await survey(c, 'classic-home', 'classic / Home tab');
  await c.evalExpr(openExplorerItem('Project Setup')); await sleep(1200);
  await survey(c, 'classic-project-setup', 'classic / Project Setup tab');
  const sprite = await c.evalExpr(`
    (() => { const b = [...document.querySelectorAll('button')].find((e) => /^\\$[0-9A-F]{2}/.test(e.textContent.trim()));
      if (!b) return false; b.click(); return b.textContent.trim(); })()`);
  await sleep(2500);
  await survey(c, 'classic-sprite-doc', 'classic / sprite doc tab');
  check('a sprite doc still opens from the object library', sprite !== false, String(sprite));
}

async function aeonPhase(c) {
  console.log('\n=== AEON (regression + parity baseline) ===');
  // Opening aeon has to go through the UI: __dbg only exposes classic's store,
  // and useProject's openPath (classic-detect, then aeon fallback) is the only
  // thing that routes a directory to the aeon loader. The Home tab's recent rows
  // call exactly that — but this build's recents list came back EMPTY, so the
  // first attempts found one titled button in the document (the Explorer's
  // collapse toggle) and reported aeon unreachable.
  //
  // `window.api.addRecentProject` is on the preload API, so the row can be
  // seeded rather than the source changed for a test. The reload is what makes
  // HomeTab re-read the list.
  await c.evalExpr(`window.api.addRecentProject(${JSON.stringify(AEONDIR)}, 'Sonic 4')`);
  await c.evalExpr('setTimeout(() => location.reload(), 50); 1');
  await sleep(4000);
  for (let i = 0; i < 60; i++) {
    try { if (await c.evalExpr('typeof window.api === "object"')) break; } catch { /* context swap */ }
    await sleep(250);
  }
  await sleep(1200);
  const opened = await c.evalExpr(`
    (() => { const b = document.querySelector('button[title=${JSON.stringify(AEONDIR)}]');
      if (!b) return [...document.querySelectorAll('button[title]')].map((e) => e.getAttribute('title')).slice(0, 20);
      b.click(); return 'clicked'; })()`);
  if (opened !== 'clicked') { check('an aeon recent row is reachable from Home', false, JSON.stringify(opened)); return; }
  await sleep(6000);
  const pills = await c.evalExpr(PILLS);
  const wantAeonPills = expectedPills(aeonGrant());
  check(`aeon shows what ITS profile grants, in shell order — ${wantAeonPills.join(' / ')}`,
    JSON.stringify(pills) === JSON.stringify(wantAeonPills),
    `want ${JSON.stringify(wantAeonPills)}  got ${JSON.stringify(pills)}`);
  for (const p of (Array.isArray(pills) ? pills : [])) {
    await c.evalExpr(clickPill(p));
    await sleep(1100);
    const s = await survey(c, `aeon-${p.toLowerCase()}`, `aeon / ${p}`);
    check(`aeon ${p} still has its 44px tool rail (collapsing must not reach aeon)`,
      s.rail !== null && s.rail.w === 44, JSON.stringify(s.rail));
  }
  await c.evalExpr(openExplorerItem('Home')); await sleep(900);
  await survey(c, 'aeon-home', 'aeon / Home tab');
  await c.evalExpr(openExplorerItem('Project Setup')); await sleep(1400);
  await survey(c, 'aeon-project-setup', 'aeon / Project Setup tab');
}

async function main() {
  const only = process.argv[2];
  let el = launch();
  try {
    let c = await connect();
    if (only !== 'aeon') await classicPhase(c);
    if (only !== 'classic') {
      // A fresh instance is only needed to get BACK to a no-project Home after
      // the classic phase. Running the aeon phase alone must NOT relaunch — the
      // second launch raced the first process's port and the run died with
      // "CDP target never appeared".
      if (only !== 'aeon') {
        c.close(); await killTree(el, { quiet: true }); await sleep(2000);
        el = launch(); c = await connect();
      }
      await aeonPhase(c);
    }
    c.close();
  } finally {
    // ⚠ `el.kill('SIGKILL')` KILLED ONE PROCESS, NOT THE TREE — and that is why
    // this file HUNG after printing its summary. Electron's GPU/renderer/zygote
    // children inherit the stdio pipes, so killing the parent alone leaves them
    // holding the pipe and node's event loop never drains. (Under `xvfb-run`,
    // above, the wrapper makes it worse still: SIGKILL to it leaves the whole
    // tree AND the Xvfb behind.) The O50 sweep therefore killed this file at the
    // 600s cap and recorded its tally as a LOWER BOUND — it had in fact finished
    // every row. `killTree` is what the guard exports for this and was already
    // imported here, unused. Same defect, same line, in tool-split-harness.
    await killTree(el, { quiet: true });
  }
  writeFileSync(`${SHOTS}/surface-facts.json`, JSON.stringify(notes, null, 2));
  console.log(`\nshots + surface-facts.json -> ${SHOTS}`);
  console.log(fails.length ? `\nFAILED (${fails.length}):\n  ${fails.join('\n  ')}` : '\nALL FUNCTIONAL CHECKS PASS');
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
