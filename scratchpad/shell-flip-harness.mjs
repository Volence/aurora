#!/usr/bin/env node
// Task 9 smoke: does a CLASSIC project actually paint through LevelWorkspace,
// and did aeon survive the flip?
//
// Every guard task 9 shipped is a source grep — they prove App *names*
// LevelWorkspace under an engine gate, not that a classic project renders. This
// is the one thing eight tasks of green node tests cannot tell us, so it runs
// the real Electron app over CDP against the real s1disasm and aeon projects.
//
// Connection boilerplate lifted from scratchpad/tool-split-harness.mjs. Its two
// hard-won selector lessons are kept and extended:
//   - the ui kit's Chip is a <span> with onClick, NOT a button (round 1 of a
//     previous investigation found "no chips" and reported three phantom fails);
//   - object-library rows ARE buttons but WRAP spans, so a leaf-only rule skips
//     them.
// Everything here that can use a structural selector does: FacetBar carries
// role=group/aria-label="Facets", ToolButton carries aria-label, HomeTab's
// recent rows carry title={path}. Active-ness is read off computed background
// (inactive pills/tools are literally `transparent`) rather than off a
// hardcoded theme colour.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { readFileSync } from 'node:fs';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9343);
const S1DIR = siblingPathOrUnresolved('s1disasm');
// ⚠ NO TRAILING SLASH, and the comment that used to sit here asserting one
// "matches the recents entry" was simply WRONG. `addRecentProject` stores
// through `normalizeProjectPath` (src/shared/project-path.ts), which strips
// trailing separators, and HomeTab renders `title={r.path}` — so L583's
// `button[title=<AEONDIR>]` searched for a title the app can never render and
// the aeon half of this sweep died at "aeon unreachable", reporting the
// Explorer's collapse toggle as the closest thing it found. O53 §5 named this
// as one of three sites; this is the last of them.
const AEONDIR = siblingPathOrUnresolved('aeon');

/* ═════════════════════════════════════════════════════════════════════════════
 * EXPECTATIONS DERIVED FROM THE APP'S OWN DECLARATIONS, not pinned.
 *
 * Four rows here were frozen pictures of an August shell and asserted the
 * ABSENCE of things the product has since shipped on purpose: a four-pill bar
 * with "NO Collision pill" (`collision` joined S1_FACETS at Stage 3b,
 * 2026-08-17, and `art` moved last on 2026-08-14), a Layout dock still carrying
 * `place-object` (it left `facetTools.layout` on 2026-08-14), and "exactly s1's
 * FOUR overlays" (s1 declares seven in OVERLAY_KEYS_BY_ENGINE). A pinned list
 * cannot tell a regression from a decision; these read the declarations the app
 * itself renders from, so what still fails is a bar/dock/menu that disagrees
 * with its own source of truth.
 * ═══════════════════════════════════════════════════════════════════════════ */
function readSource(rel) {
  const path = `${ROOT}/${rel}`;
  try { return readFileSync(path, 'utf8'); }
  catch (e) { throw new Error(`cannot read ${path} (${e.code ?? e.message}) — this harness derives its expectations from it; an unreadable source is UNMEASURABLE, not a pass`); }
}
function idsIn(text, re, what, rel) {
  const m = re.exec(text);
  if (!m) throw new Error(`${rel} no longer spells ${what} the way this harness reads it — re-derive rather than pinning the old answer`);
  const out = [...m[1].matchAll(/'([A-Za-z0-9_-]+)'/g)].map((x) => x[1]);
  if (!out.length) throw new Error(`${what} in ${rel} parsed to an EMPTY list — refusing to compare against nothing`);
  return out;
}
/** The pill row s1 produces: granted ∩ registered, sorted by `order`. */
function expectedS1Pills() {
  const grant = idsIn(readSource('src/core/project/s1/index.ts'),
    /export const S1_FACETS = \[([^\]]*)\]/, '`export const S1_FACETS = [ … ]`', 's1/index.ts');
  const body = /const BUILTIN_FACETS: FacetDescriptor\[\] = \[([\s\S]*?)\n\];/
    .exec(readSource('src/core/shell/facets.ts'));
  if (!body) throw new Error('core/shell/facets.ts no longer spells `const BUILTIN_FACETS: FacetDescriptor[] = [ … ];`');
  const rows = [...body[1].matchAll(/\{\s*id:\s*'([a-z-]+)',\s*label:\s*'([^']+)',\s*order:\s*(\d+)\s*\}/g)]
    .map((m) => ({ id: m[1], label: m[2], order: Number(m[3]) }));
  if (!rows.length) throw new Error('BUILTIN_FACETS parsed EMPTY');
  return rows.filter((f) => grant.includes(f.id)).sort((a, b) => a.order - b.order).map((f) => f.label);
}
/** The pill row aeon produces, by the same rule. */
function expectedAeonPills() {
  const grant = idsIn(readSource('src/core/project/aeon/index.ts'),
    /facets:\s*\[([^\]]*)\]/, "aeon's `facets: [ … ]` grant", 'aeon/index.ts');
  const body = /const BUILTIN_FACETS: FacetDescriptor\[\] = \[([\s\S]*?)\n\];/
    .exec(readSource('src/core/shell/facets.ts'));
  if (!body) throw new Error('core/shell/facets.ts no longer spells `const BUILTIN_FACETS: FacetDescriptor[] = [ … ];`');
  const rows = [...body[1].matchAll(/\{\s*id:\s*'([a-z-]+)',\s*label:\s*'([^']+)',\s*order:\s*(\d+)\s*\}/g)]
    .map((m) => ({ id: m[1], label: m[2], order: Number(m[3]) }));
  return rows.filter((f) => grant.includes(f.id)).sort((a, b) => a.order - b.order).map((f) => f.label);
}

/** The Layout rail: `facetTools.layout`, sorted into `TOOL_IDS` order, labelled. */
function expectedLayoutTools() {
  const s1 = readSource('src/core/project/s1/index.ts');
  const block = /facetTools:\s*\{([\s\S]*?)\n\s*\},/.exec(s1);
  if (!block) throw new Error('core/project/s1/index.ts no longer declares a `facetTools: { … }` block');
  const ids = idsIn(block[1], /\n\s*layout:\s*\[([^\]]*)\]/, 'facetTools.layout', 's1/index.ts');
  const order = idsIn(readSource('src/core/project/adapter.ts'),
    /export const TOOL_IDS = \[([\s\S]*?)\] as const;/, 'TOOL_IDS', 'adapter.ts');
  const lm = /export const TOOL_LABELS: Record<ToolId, string> = \{([\s\S]*?)\n\};/
    .exec(readSource('src/renderer/workspace/tool-meta.ts'));
  if (!lm) throw new Error('tool-meta.ts no longer spells `export const TOOL_LABELS: Record<ToolId, string> = { … };`');
  const labels = {};
  for (const row of lm[1].matchAll(/'?([a-z-]+)'?:\s*'([^']+)'/g)) labels[row[1]] = row[2];
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((id) => labels[id]);
}
/** Every tool label in the vocabulary — for the "no aeon-only tool leaked" row. */
function allToolLabels() {
  const lm = /export const TOOL_LABELS: Record<ToolId, string> = \{([\s\S]*?)\n\};/
    .exec(readSource('src/renderer/workspace/tool-meta.ts'));
  const out = [];
  for (const row of lm[1].matchAll(/'?([a-z-]+)'?:\s*'([^']+)'/g)) out.push(row[2]);
  if (!out.length) throw new Error('TOOL_LABELS parsed EMPTY');
  return out;
}
/** How many overlay checkboxes the View menu owes for the s1 engine. */
function expectedS1OverlayCount() {
  return idsIn(readSource('src/renderer/state/viewStore.ts'),
    /OVERLAY_KEYS_BY_ENGINE[\s\S]*?\n\s*s1:\s*\[([^\]]*)\]/,
    "`OVERLAY_KEYS_BY_ENGINE`'s `s1:` row", 'viewStore.ts').length;
}
const ROOT = AURORA_DIR;
// The worktree's node_modules has no electron binary (partial install); the
// main tree's is the same version from the same package.json, and the app code
// still comes from the WORKTREE's dist, which is what is under test.
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;

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
  for (let i = 0; i < 60; i++) {
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, close: () => ws.close() };
}

const fails = [];
const results = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ name, ok, detail });
  if (!ok) fails.push(name);
}

// ---------------------------------------------------------------------------
// In-page probes
// ---------------------------------------------------------------------------

// FacetBar renders role=group aria-label="Facets" — a structural handle, so the
// pill list can never be confused with the tool chips or the status bar.
const PILLS = `[...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim())`;
// Inactive pills are background:'transparent'; the active one is T.surface.
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

// ToolButton renders aria-label={label}; nothing else in the shell uses these
// exact aria-labels (the View MENU trigger has text "View" but no aria-label,
// which is why this counts by attribute and not by text).
const toolCount = (label) => `document.querySelectorAll('button[aria-label=${JSON.stringify(label)}]').length`;
const ACTIVE_TOOL = `
  (() => {
    const labels = ['View','Select','Marquee','Paint Tile','Paint Block','Stamp Chunk',
                    'Paint Collision','Place Object','Place Ring','Eraser'];
    const b = [...document.querySelectorAll('button[aria-label]')]
      .filter((e) => labels.includes(e.getAttribute('aria-label')))
      .find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return b ? b.getAttribute('aria-label') : null;
  })()`;

// Chips are leaf <span>s. Count by exact text so a duplicate control is visible.
//
// SCOPED TO THE WORKSPACE HEADER, and that is not incidental: the map STATUS BAR
// also prints the active plane as a bare "FG"/"BG" span (and the active tool as
// "View"). An unscoped count reported FG:2 BG:1 and read as a duplicated plane
// control — it was one control plus one readout, which the 2/1 asymmetry gives
// away. The header is everything in the EditorShell app bar, which is the
// FacetBar's parent.
// ⚠ `button,span`, NOT `span`. `598be067` (2026-08-16, "the §5 accessibility
// and consistency calls") made every INTERACTIVE Chip a real `<button>`, leaving
// spans for the readouts — the primitive's own comment names the plane switch
// and Undo/Redo among them. All four chip probes here were span-only, so
// `chipCount('FG')` counted 0 with the control on screen and `chipEnabled`
// answered null, which took six rows down between them. The SCOPING note above
// is unchanged and still load-bearing; the element type is what moved.
const chipCount = (label) => `
  (() => {
    const hdr = document.querySelector('[aria-label="Facets"]');
    if (!hdr) return -1;
    return [...hdr.parentElement.querySelectorAll('button,span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)}).length;
  })()`;
// Deliberately UNSCOPED — the count of the same label anywhere on screen, so the
// report can state where the extra one lives instead of hiding it.
const chipCountAnywhere = (label) => `
  [...document.querySelectorAll('button,span')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)}).length`;
const clickChip = (label) => `
  (() => {
    const all = [...document.querySelectorAll('button,span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    const s = all.find((e) => e.tagName === 'BUTTON') || all[0];
    if (!s) return false;
    s.click(); return true;
  })()`;
// The Undo/Redo chips are the cleanest available read of history depth: enabled
// == the stack is non-empty. Enabledness comes off the button's own `disabled`
// property, which is what LevelWorkspace writes (`disabled={!history?.canUndo}`);
// opacity is a styling consequence of it. A span keeps the opacity rule, having
// no `disabled`.
const chipEnabled = (label) => `
  (() => {
    const all = [...document.querySelectorAll('button,span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    const s = all.find((e) => e.tagName === 'BUTTON') || all[0];
    if (!s) return null;
    return s.tagName === 'BUTTON' ? !s.disabled : getComputedStyle(s).opacity === '1';
  })()`;

const CANVAS_RECT = `
  (() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`;

// The status bar's scope line, which carries the act's counts.
const SCOPE = `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .map((e) => e.textContent.trim())
      .filter((t) => /chunks · .* blocks · .* objects/.test(t));
    return s[0] ?? '';
  })()`;

const SECTION_TITLES = `
  [...document.querySelectorAll('button,div')]
    .filter((e) => /^(Chunks|Palette|Objects|Selected Object|Tileset|Collision)$/.test(e.textContent.trim())
                   && e.children.length <= 2)
    .map((e) => e.textContent.trim())`;

async function clickCanvasAt(c, fx, fy) {
  const r = await c.evalExpr(CANVAS_RECT);
  if (!r) throw new Error('no canvas to click');
  const x = Math.round(r.x + r.w * fx);
  const y = Math.round(r.y + r.h * fy);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await sleep(220);
  return { x, y };
}

async function key(c, k, opts = {}) {
  const base = { key: k, code: opts.code ?? `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: opts.modifiers ?? 0 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(250);
}

function launch() {
  const electron = spawnGuarded(ELECTRON, [MAIN], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stderr.on('data', () => {});
  electron.stdout.on('data', () => {});
  return electron;
}

async function connect() {
  const c = cdp(await waitForTarget());
  await c.ready;
  await c.send('Runtime.enable');
  for (let i = 0; i < 40; i++) {
    if (await c.evalExpr('typeof window.__dbg === "object"')) break;
    await sleep(250);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Phase A — classic through LevelWorkspace
// ---------------------------------------------------------------------------
async function classicPhase(c) {
  console.log('\n=== CLASSIC (s1disasm) ===');

  // ⚠ THE FACET AND THE PANEL STATE ARE PERSISTED, and this harness never
  // reset them. Measured 2026-09-03: a run that inherited the Palette facet
  // from a previous app run reported a one-tool rail ({"View":1,"Stamp
  // Chunk":0,…}) and a right panel of Palette sections, and went on describing
  // the failures as if it were on Layout — eight rows, all of them about a
  // facet nobody selected. `localStorage.clear()` + an explicit pill click
  // below is the fix, and the pill click is now ASSERTED rather than assumed.
  await c.evalExpr('localStorage.clear(); 1');
  // Seed the aeon recents row BEFORE the project opens: HomeTab refetches
  // recents only when `noProject`/`currentPath` moves (HomeTab.tsx:71-75), and
  // the card only exists if this machine's recent-projects.json already lists
  // the aeon checkout this run resolved — a ten-entry LRU every harness in this
  // population rewrites. Measured 2026-09-03: it held eight OTHER agents'
  // throwaway aeon copies and not the resolved one, so whether the aeon phase
  // could start depended on which instrument had run last. Registering the path
  // is SETUP, through the app's own IPC; no gesture under test is replaced.
  await c.evalExpr(`window.api.addRecentProject(${JSON.stringify(AEONDIR)}, 'aeon (harness)')`);
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
  await sleep(1500);
  const preState = await c.evalExpr('window.__dbg.levelState()');
  const preActPills = await c.evalExpr(PILLS);
  check('a classic open renders the facet bar at all (App routes s1 to LevelWorkspace)',
    Array.isArray(preActPills) && preActPills.length > 0, JSON.stringify(preActPills));

  // NOT a bug, and worth writing down: "classic open, no act loaded" is not
  // reachable by normal use. With no stored session, session-lifecycle restores
  // defaultProjectSession(firstOpenableLevelTab()), which opens the first
  // AVAILABLE act — so even a cleared-session cold open lands on ghz1. Two runs
  // reported the empty state "missing" before this was understood; it was never
  // on screen to find.
  check('cold open auto-opens the first available act (so idle is not the normal state)',
    preState && preState.status === 'ready', JSON.stringify(preState));

  // (The empty state is probed at the END of this phase — it needs a facet
  // switch and an act reload, and doing that here left the app on the Art facet
  // for every check below, which produced seven phantom failures.)

  // Open a known act through the real activation path.
  await c.evalExpr('window.__dbg.activate("ghz", 1)');
  await sleep(2500);
  // The facet every row below is about, SET and asserted. See the note at the
  // top of this phase for what an inherited facet did to eight of them.
  await c.evalExpr(clickPill('Layout'));
  await sleep(500);
  check('the classic phase is on the Layout facet (set, not inherited from the last run)',
    (await c.evalExpr(ACTIVE_PILL)) === 'Layout', String(await c.evalExpr(ACTIVE_PILL)));

  // --- pills ---------------------------------------------------------------
  const pills = await c.evalExpr(PILLS);
  const wantPills = expectedS1Pills();
  check(`the pill row is what the s1 profile GRANTS, in shell order — ${wantPills.join(' / ')}`,
    JSON.stringify(pills) === JSON.stringify(wantPills),
    `want ${JSON.stringify(wantPills)}  got ${JSON.stringify(pills)}`);

  // --- layout paints -------------------------------------------------------
  const rect = await c.evalExpr(CANVAS_RECT);
  check('the Layout canvas exists and has real area',
    !!rect && rect.w > 200 && rect.h > 200, rect ? `${Math.round(rect.w)}x${Math.round(rect.h)}` : 'no canvas');
  const painted = await c.evalExpr(`
    (() => {
      const c = document.querySelector('canvas');
      if (!c) return 'no canvas';
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let nonzero = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] || d[i+1] || d[i+2]) nonzero++;
      return nonzero;
    })()`);
  check('the Layout canvas has actually PAINTED pixels (not a blank surface)',
    typeof painted === 'number' && painted > 1000, `non-black subpixels: ${painted}`);
  const scope = await c.evalExpr(SCOPE);
  check('the neutral status bar reports the act (classic port)', /chunks/.test(scope), scope);

  // --- tool dock: each tool exactly once ------------------------------------
  // DERIVED. This pinned `place-object` onto Layout, which left
  // `facetTools.layout` when the Objects facet was restored (owner,
  // 2026-08-14 — the three-step history is written out beside the declaration
  // in core/project/s1/index.ts). The claim worth keeping is not the list but
  // the RELATION: the rail is exactly what the manifest declares for this
  // facet, each tool once, and nothing outside that declaration.
  const declared = expectedLayoutTools();
  const vocabulary = allToolLabels();
  const counts = {};
  for (const t of vocabulary) counts[t] = await c.evalExpr(toolCount(t));
  check(`the Layout rail is exactly facetTools.layout, each once — ${declared.join(' / ')}`,
    declared.every((t) => counts[t] === 1), JSON.stringify(counts));
  check('no tool OUTSIDE the declaration is in the rail (nothing aeon-only leaked)',
    vocabulary.filter((t) => !declared.includes(t)).every((t) => counts[t] === 0),
    JSON.stringify(counts));

  // --- FG/BG exactly once, and it drives the plane -------------------------
  const fg = await c.evalExpr(chipCount('FG'));
  const bg = await c.evalExpr(chipCount('BG'));
  const fgAny = await c.evalExpr(chipCountAnywhere('FG'));
  check('FG/BG plane control appears EXACTLY ONCE each in the header (OptionBar dedup)',
    fg === 1 && bg === 1, `header FG:${fg} BG:${bg} (whole screen FG:${fgAny} — the extra is the status bar's plane READOUT, not a control)`);
  await c.evalExpr(clickChip('BG'));
  await sleep(300);
  const chipBg = (label) => `
    (() => {
      const all = [...document.querySelectorAll('button,span')]
        .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
      const s = all.find((e) => e.tagName === 'BUTTON') || all[0];
      return s ? getComputedStyle(s).backgroundColor : null;
    })()`;
  const bgActive = await c.evalExpr(chipBg('BG'));
  const fgActiveAfter = await c.evalExpr(chipBg('FG'));
  check('clicking BG changes the lit plane chip', bgActive !== fgActiveAfter, `BG:${bgActive} FG:${fgActiveAfter}`);
  await c.evalExpr(clickChip('FG'));
  await sleep(250);

  // --- View menu: four s1 overlays -----------------------------------------
  const overlays = await c.evalExpr(`
    (() => {
      const trig = [...document.querySelectorAll('button')]
        .find((e) => /^View$/.test(e.textContent.trim()) && !e.hasAttribute('aria-label'));
      if (!trig) return 'no View menu trigger';
      trig.click();
      return null;
    })()`);
  await sleep(350);
  const overlayLabels = await c.evalExpr(`
    [...document.querySelectorAll('label')]
      .filter((l) => l.querySelector('input[type=checkbox]'))
      .map((l) => l.textContent.trim())`);
  // DERIVED from `OVERLAY_KEYS_BY_ENGINE.s1`, which is what ViewMenu renders
  // from. The pin of `4` was the August set; s1 declares more now, and a count
  // frozen against the old one reports growth as breakage.
  const wantOverlays = expectedS1OverlayCount();
  check(`the View menu offers exactly the ${wantOverlays} overlays s1 declares`,
    Array.isArray(overlayLabels) && overlayLabels.length === wantOverlays,
    overlays ? String(overlays) : `want ${wantOverlays}, got ${overlayLabels.length}: ${JSON.stringify(overlayLabels)}`);
  const toggled = await c.evalExpr(`
    (() => {
      const boxes = [...document.querySelectorAll('label input[type=checkbox]')];
      if (!boxes.length) return 'none';
      const before = boxes.map((b) => b.checked);
      boxes.forEach((b) => b.click());
      const after = [...document.querySelectorAll('label input[type=checkbox]')].map((b) => b.checked);
      return before.length === after.length && before.every((v, i) => v !== after[i]) ? 'all flipped' : 'mismatch';
    })()`);
  check('every overlay checkbox toggles', toggled === 'all flipped', String(toggled));
  // put them back and close the menu
  await c.evalExpr(`[...document.querySelectorAll('label input[type=checkbox]')].forEach((b) => b.click())`);
  await sleep(200);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 300, button: 'left', clickCount: 1, buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 300, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(250);

  // --- chunk picker in the layout panel; loop toggle id-gated --------------
  const sections = await c.evalExpr(SECTION_TITLES);
  check('the chunk picker lives in the Layout right panel',
    Array.isArray(sections) && sections.includes('Chunks'), JSON.stringify(sections));
  const pickChunk = (n) => `
    (() => {
      const cells = [...document.querySelectorAll('[title^="Chunk $"], [title^="Air ($00)"]')];
      if (cells.length <= ${n}) return 'only ' + cells.length + ' cells';
      cells[${n}].click();
      return cells[${n}].getAttribute('title');
    })()`;
  const picked = await c.evalExpr(pickChunk(3));
  await sleep(350);
  check('picking a chunk in the panel works', typeof picked === 'string' && /^Chunk \$/.test(picked), String(picked));
  const armed = await c.evalExpr(ACTIVE_TOOL);
  check('picking a chunk ARMS the stamp tool', armed === 'Stamp Chunk', String(armed));
  const loopWhenReal = await c.evalExpr(`[...document.querySelectorAll('button')].filter((e) => /Loop/.test(e.textContent)).length`);
  check('the loop toggle is offered for a real chunk id ($01..$7F)', loopWhenReal === 1, `count: ${loopWhenReal}`);
  const airPicked = await c.evalExpr(pickChunk(0));
  await sleep(350);
  const loopWhenAir = await c.evalExpr(`[...document.querySelectorAll('button')].filter((e) => /Loop/.test(e.textContent)).length`);
  check('the loop toggle is HIDDEN for air ($00), which cannot carry the flag',
    loopWhenAir === 0, `picked ${airPicked}, loop buttons: ${loopWhenAir}`);
  await c.evalExpr(pickChunk(3));
  await sleep(300);

  // --- L1: the surface claim must not steal the facet ----------------------
  await c.evalExpr(clickPill('Objects'));
  await sleep(400);
  const objBefore = await c.evalExpr(ACTIVE_PILL);
  await clickCanvasAt(c, 0.5, 0.5);
  const objAfter = await c.evalExpr(ACTIVE_PILL);
  check('L1: Objects pill SURVIVES a click in the map (surface claim is not 1:1)',
    objBefore === 'Objects' && objAfter === 'Objects', `${objBefore} -> ${objAfter}`);

  // --- L2: objects facet has a plane control and place-object places -------
  const objFg = await c.evalExpr(chipCount("FG"));
  check('L2: the Objects facet still offers the FG/BG plane control',
    objFg === 1, `FG chips: ${objFg}`);
  const objToolCount = await c.evalExpr(toolCount('Place Object'));
  check('the Objects facet offers Place Object', objToolCount === 1, `count: ${objToolCount}`);
  const scopeBefore = await c.evalExpr(SCOPE);
  const armObj = await c.evalExpr(`
    (() => {
      const b = [...document.querySelectorAll('button')]
        .find((e) => /Crabmeat|Motobug|Chopper|Buzz/.test(e.textContent));
      if (!b) return 'no object row';
      b.click(); return b.textContent.trim();
    })()`);
  await sleep(500);
  const armedTool = await c.evalExpr(ACTIVE_TOOL);
  check('arming an object from the library selects Place Object',
    armedTool === 'Place Object', `armed "${armObj}" -> tool ${armedTool}`);
  await clickCanvasAt(c, 0.42, 0.55);
  const scopeAfter = await c.evalExpr(SCOPE);
  const nObj = (s) => { const m = /(\d+) objects/.exec(s); return m ? Number(m[1]) : null; };
  check('L2: place-object ACTUALLY PLACES (object count rises by one)',
    nObj(scopeAfter) === nObj(scopeBefore) + 1, `${nObj(scopeBefore)} -> ${nObj(scopeAfter)}`);
  const stillObjects = await c.evalExpr(ACTIVE_PILL);
  check('L1: placing an object also leaves you on Objects', stillObjects === 'Objects', String(stillObjects));

  // --- undo: ONE Ctrl+Z must step ONE ---------------------------------------
  // SELF-CALIBRATING, because a fixed expectation was wrong the first time: the
  // place-object above is an edit on the SAME act document, so the stack was
  // already 1 deep and "two Ctrl+Z empties a 2-deep stack" failed for a reason
  // that had nothing to do with the binding count.
  //
  // So: drain the stack, make exactly N edits, then count the Ctrl+Z presses it
  // takes to drain it again. presses === N is the claim — one keypress, one
  // step. A double-binding halves the count, which is precisely the Task 5
  // regression, and it cannot be faked by a stack of unknown depth.
  await c.evalExpr(clickPill('Layout'));
  await sleep(400);
  const drain = async (limit = 60) => {
    let n = 0;
    while (n < limit && (await c.evalExpr(chipEnabled('Undo'))) === true) {
      await key(c, 'z', { code: 'KeyZ', modifiers: 2 });
      n++;
    }
    return n;
  };
  await drain();
  const drained = await c.evalExpr(chipEnabled('Undo'));
  check('precondition: the undo stack starts empty', drained === false, `undo enabled: ${drained}`);

  await c.evalExpr(`
    (() => {
      const cells = [...document.querySelectorAll('[title^="Chunk $"]')];
      if (cells[2]) cells[2].click();
      return true;
    })()`);
  await sleep(350);
  const EDITS = 3;
  const spots = [[0.30, 0.30], [0.36, 0.30], [0.42, 0.30]];
  for (const [fx, fy] of spots) await clickCanvasAt(c, fx, fy);
  const undoLive = await c.evalExpr(chipEnabled('Undo'));
  check(`${EDITS} stamps leave Undo enabled`, undoLive === true, String(undoLive));
  const presses = await drain();
  check('UNDO BINDING COUNT: one Ctrl+Z steps exactly ONE (Layout facet)',
    presses === EDITS, `${EDITS} edits took ${presses} presses to undo (a double binding would take ${Math.ceil(EDITS / 2)})`);
  const redoLive = await c.evalExpr(chipEnabled('Redo'));
  check('and the redo stack is correspondingly full', redoLive === true, String(redoLive));

  // The same binding serves every facet (there is only one, on LevelWorkspace),
  // so the art facet's question is whether it resolves the ART document rather
  // than the act's — i.e. that switching facets re-points undo instead of
  // offering the map's stack under the composer.
  await c.evalExpr(clickPill('Art'));
  await sleep(600);
  const artUndo = await c.evalExpr(chipEnabled('Undo'));
  check('switching to Art re-points undo at the art document (map stack not offered)',
    artUndo === false, `undo enabled on art: ${artUndo}`);
  await c.evalExpr(clickPill('Layout'));
  await sleep(500);
  const backUndo = await c.evalExpr(chipEnabled('Redo'));
  check('and coming back to Layout restores the map\'s own history',
    backUndo === true, `redo enabled: ${backUndo}`);

  // --- art facet: chunk picker (gap 5) + composer ---------------------------
  await c.evalExpr(clickPill('Art'));
  await sleep(700);
  const artSections = await c.evalExpr(SECTION_TITLES);
  check('gap 5: the ART facet now has its own chunk picker',
    Array.isArray(artSections) && artSections.includes('Chunks') && artSections.includes('Palette'),
    JSON.stringify(artSections));
  // ⚠ PREMISE RETIRED, not tuned. Two rows here measured a control that no
  // longer exists: the composer's COLLAPSE button. They were written when
  // `classicLevelStore.composerOpen` defaulted to false and the Art facet
  // opened as "one button on an empty field" — which those rows recorded as a
  // finding, and which was then FIXED: the composer is unconditional in the
  // canvas slot now, with no collapse control at all. (capture-harness carries
  // the positive form of the same fact — "the composer is NOT collapsible any
  // more", collapse buttons: 0 — and it passes.) Asserting `collapsed === 1`
  // and `defaultOpen === false` is asserting the presence and the state of a
  // button the product deliberately removed.
  //
  // The third row was VACUOUS rather than stale: it clicked the (absent)
  // collapse button and then asserted the Chunk/Block/Tile tabs were on screen.
  // They are always on screen now, so it passed having done nothing. What it
  // meant to establish — the composer really is mounted here — is asserted
  // directly below, together with the absence of the collapse control, so a
  // return of the collapsed-by-default behaviour fails by name.
  const collapseButtons = await c.evalExpr(`
    [...document.querySelectorAll('button')].filter((e) => /Composer/.test(e.textContent)).length`);
  const composerAlive = await c.evalExpr(`
    (() => [...document.querySelectorAll('button')]
      .map((e) => e.textContent.trim()).filter((t) => /^(Chunk|Block|Tile)$/.test(t)).length)()`);
  check('the composer is mounted in the Art canvas slot UNCONDITIONALLY — its tier tabs are on screen with no collapse control to press first',
    composerAlive === 3 && collapseButtons === 0,
    `Chunk/Block/Tile tabs: ${composerAlive}; collapse buttons: ${collapseButtons} (must be 0 — the collapsed-by-default Art facet was the defect these rows recorded, and it was fixed)`);

  // --- L1 for the composer pair --------------------------------------------
  await c.evalExpr(clickPill('Palette'));
  await sleep(500);
  const palBefore = await c.evalExpr(ACTIVE_PILL);
  const swatch = await c.evalExpr(`
    (() => {
      const el = [...document.querySelectorAll('[title*="$"]')]
        .find((e) => /palette|colou?r|line/i.test(e.getAttribute('title') || ''));
      const any = el || [...document.querySelectorAll('div')].find((e) =>
        e.style && e.style.background && /rgb/.test(e.style.background) && e.clientWidth > 8 && e.clientWidth < 40);
      if (!any) return 'no swatch';
      any.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      any.click();
      return 'clicked';
    })()`);
  await sleep(400);
  const palAfter = await c.evalExpr(ACTIVE_PILL);
  check('L1: Palette pill SURVIVES a click in the composer',
    palBefore === 'Palette' && palAfter === 'Palette', `${palBefore} -> ${palAfter} (${swatch})`);

  // --- sprite doc still opens (Toolbar is still its app bar until task 10) --
  await c.evalExpr(clickPill('Layout'));
  await sleep(300);
  const spriteOpened = await c.evalExpr(`
    (() => {
      const rows = [...document.querySelectorAll('button')]
        .filter((e) => /^\\$[0-9A-F]{2}/.test(e.textContent.trim()));
      return rows.length;
    })()`);
  check('the classic object library still lists linked objects (sprite-doc entry point)',
    typeof spriteOpened === 'number' && spriteOpened > 0, `rows: ${spriteOpened}`);

  // --- gap 4, LAST because it perturbs the facet and the open act -----------
  // Caught on the LOADING branch: same block, same styling, and the branch a
  // user really does hit on every act switch. The activation is fire-and-forget
  // ON PURPOSE — awaiting it (awaitPromise:true resolves only after openAct
  // finishes) meant the poll started after loading was already over, and the
  // check reported the empty state missing when it had simply been too late.
  // ⚠ MANUFACTURE THE STATE; DO NOT RACE IT. This polled for the LOADING banner
  // in 25ms steps while an act loaded, and its own comment records a previous
  // round losing that race the other way. A row that can only be observed by
  // winning a race reports the machine's speed, not the product — it is exactly
  // the shape that made this file's sibling `capture-harness` pass on a bare
  // window and fail under xvfb on the same build, one minute apart.
  //
  // `__dbg.resetLevel()` puts the level store back to IDLE with the project
  // still open — "project open, no act", the state the empty branch is FOR —
  // and the idle status is asserted before anything is read, so an act that
  // failed to unload cannot be mistaken for a rendered empty state.
  await c.evalExpr(clickPill('Art'));
  await sleep(500);
  await c.evalExpr('window.__dbg.resetLevel(); 1');
  await sleep(600);
  const artIdle = await c.evalExpr('JSON.stringify(window.__dbg.levelState())');
  if (JSON.parse(artIdle).status === 'ready') {
    throw new Error('resetLevel() did not take the level store out of `ready`, so the empty-state '
      + 'branch below was never entered. UNMEASURABLE — every reading would be about a populated '
      + 'surface.');
  }
  const emptyText = await c.evalExpr(`
    (() => {
      const m = /Loading .{0,40}?…|Open a level from the Explorer|Failed to load level|No act open/.exec(document.body.textContent);
      return m ? m[0] : '';
    })()`);
  check('gap 4: the art canvas shows an EMPTY STATE rather than a blank window',
    emptyText !== '', `level=${artIdle}; empty-state text: ${emptyText ? `"${emptyText}"` : 'NONE'}`);
}

// ---------------------------------------------------------------------------
// Phase B — aeon regression sweep
// ---------------------------------------------------------------------------
async function aeonPhase(c) {
  console.log('\n=== AEON (regression sweep) ===');
  const clicked = await c.evalExpr(`
    (() => {
      const b = document.querySelector('button[title=${JSON.stringify(AEONDIR)}]');
      if (!b) return [...document.querySelectorAll('button[title]')].map((e) => e.getAttribute('title'));
      b.click(); return 'clicked';
    })()`);
  if (clicked !== 'clicked') {
    check('an aeon recent project row is reachable from Home', false, JSON.stringify(clicked));
    return;
  }
  await sleep(4000);
  const pills = await c.evalExpr(PILLS);
  // DERIVED from aeon's own `facets:` grant + BUILTIN_FACETS' order, for the
  // same reason the classic pill row is: `6` was the August count and aeon has
  // been granted more since, so the pin reported growth as breakage.
  const wantAeonPills = expectedAeonPills();
  check(`aeon shows what ITS profile grants, in shell order — ${wantAeonPills.join(' / ')}`,
    JSON.stringify(pills) === JSON.stringify(wantAeonPills),
    `want ${JSON.stringify(wantAeonPills)}  got ${JSON.stringify(pills)}`);
  const rect = await c.evalExpr(CANVAS_RECT);
  check('aeon\'s canvas still renders', !!rect && rect.w > 200, rect ? `${Math.round(rect.w)}x${Math.round(rect.h)}` : 'none');
  const painted = await c.evalExpr(`
    (() => {
      const c = document.querySelector('canvas');
      if (!c) return 0;
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let nz = 0; for (let i = 0; i < d.length; i += 4) if (d[i] || d[i+1] || d[i+2]) nz++;
      return nz;
    })()`);
  check('aeon\'s canvas still PAINTS', painted > 1000, `non-black subpixels: ${painted}`);
  const tools = {};
  for (const t of ['View', 'Marquee', 'Stamp Chunk', 'Place Object']) tools[t] = await c.evalExpr(toolCount(t));
  check('aeon\'s tool dock is intact and unduplicated',
    Object.values(tools).every((n) => n <= 1) && tools['View'] === 1, JSON.stringify(tools));
  const fg = await c.evalExpr(chipCount('FG'));
  check('aeon\'s FG/BG control appears exactly once', fg === 1, `FG:${fg}`);
  const undo = await c.evalExpr(chipEnabled('Undo'));
  check('aeon\'s undo chip is present (history wired)', undo !== null, `enabled:${undo}`);
  const sections = await c.evalExpr(SECTION_TITLES);
  check('aeon\'s right panel still has its sections', Array.isArray(sections) && sections.length > 0, JSON.stringify(sections));
}

async function main() {
  const only = process.argv[2];
  let electron = launch();
  try {
    const c = await connect();
    if (only !== 'aeon') await classicPhase(c);
    if (only !== 'classic') {
      c.close();
      await killTree(electron, { quiet: true });
      await sleep(1200);
      electron = launch();
      const c2 = await connect();
      await aeonPhase(c2);
      c2.close();
    } else {
      c.close();
    }
  } finally {
    // ⚠ `kill('SIGKILL')` killed ONE process, not the tree: Electron's
    // GPU/renderer/zygote children inherit the stdio pipes, so node's event loop
    // never drained and this file HUNG after printing its summary. The O50 sweep
    // capped it at 600s and called its tally a lower bound. `killTree` was
    // imported here and unused.
    await killTree(electron, { quiet: true });
  }
  console.log(fails.length ? `\nFAILED (${fails.length}): ${fails.join(', ')}` : '\nALL PASS');
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
