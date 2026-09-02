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
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9343);
const S1DIR = siblingPathOrUnresolved('s1disasm');
const AEONDIR = siblingPathOrUnresolved('aeon') + '/';   // trailing slash: matches the recents entry
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
const chipCount = (label) => `
  (() => {
    const hdr = document.querySelector('[aria-label="Facets"]');
    if (!hdr) return -1;
    return [...hdr.parentElement.querySelectorAll('span')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)}).length;
  })()`;
// Deliberately UNSCOPED — the count of the same label anywhere on screen, so the
// report can state where the extra one lives instead of hiding it.
const chipCountAnywhere = (label) => `
  [...document.querySelectorAll('span')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)}).length`;
const clickChip = (label) => `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    if (!s) return false;
    s.click(); return true;
  })()`;
// Chip's disabled state is opacity:0.5 (and no onClick). The Undo/Redo chips are
// the cleanest available read of history depth: enabled == the stack is non-empty.
const chipEnabled = (label) => `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(label)});
    if (!s) return null;
    return getComputedStyle(s).opacity === '1';
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

  // --- pills ---------------------------------------------------------------
  const pills = await c.evalExpr(PILLS);
  check('four pills — Layout, Art, Objects, Palette',
    JSON.stringify(pills) === JSON.stringify(['Layout', 'Art', 'Objects', 'Palette']), JSON.stringify(pills));
  check('NO Collision pill (the s1 profile dropped that grant)',
    Array.isArray(pills) && !pills.includes('Collision'), JSON.stringify(pills));

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
  const declared = ['View', 'Stamp Chunk', 'Select', 'Place Object'];
  const counts = {};
  for (const t of [...declared, 'Marquee', 'Paint Tile', 'Place Ring', 'Eraser']) {
    counts[t] = await c.evalExpr(toolCount(t));
  }
  check('tool dock = view / stamp-chunk / select / place-object, EACH EXACTLY ONCE',
    declared.every((t) => counts[t] === 1), JSON.stringify(counts));
  check('no aeon-only tool leaked into classic\'s dock',
    ['Marquee', 'Paint Tile', 'Place Ring', 'Eraser'].every((t) => counts[t] === 0), JSON.stringify(counts));

  // --- FG/BG exactly once, and it drives the plane -------------------------
  const fg = await c.evalExpr(chipCount('FG'));
  const bg = await c.evalExpr(chipCount('BG'));
  const fgAny = await c.evalExpr(chipCountAnywhere('FG'));
  check('FG/BG plane control appears EXACTLY ONCE each in the header (OptionBar dedup)',
    fg === 1 && bg === 1, `header FG:${fg} BG:${bg} (whole screen FG:${fgAny} — the extra is the status bar's plane READOUT, not a control)`);
  await c.evalExpr(clickChip('BG'));
  await sleep(300);
  const bgActive = await c.evalExpr(`
    (() => {
      const s = [...document.querySelectorAll('span')]
        .find((e) => e.children.length === 0 && e.textContent.trim() === 'BG');
      return s ? getComputedStyle(s).backgroundColor : null;
    })()`);
  const fgActiveAfter = await c.evalExpr(`
    (() => {
      const s = [...document.querySelectorAll('span')]
        .find((e) => e.children.length === 0 && e.textContent.trim() === 'FG');
      return s ? getComputedStyle(s).backgroundColor : null;
    })()`);
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
  check('the View menu offers exactly s1\'s four overlays',
    Array.isArray(overlayLabels) && overlayLabels.length === 4,
    overlays ? String(overlays) : JSON.stringify(overlayLabels));
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
  // classicLevelStore.composerOpen defaults to FALSE, so the dock renders only
  // its collapse button until expanded — a first pass looked for the Chunk/Block/
  // Tile tabs, found none, and called the composer missing. It is present and
  // collapsed, which is its own finding (see the report): as a bottom strip
  // collapsed-by-default kept it out of the way, but as the whole canvas it
  // means the Art facet opens as one button on an empty field.
  const collapsed = await c.evalExpr(`
    [...document.querySelectorAll('button')].filter((e) => /Composer/.test(e.textContent)).length`);
  check('the composer is mounted in the Art canvas slot', collapsed === 1, `collapse buttons: ${collapsed}`);
  const defaultOpen = await c.evalExpr(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Composer/.test(e.textContent));
      return b ? b.textContent.trim().startsWith('▾') : null;
    })()`);
  check('NOTE (not a regression): the composer defaults to COLLAPSED in the canvas slot',
    defaultOpen === false, `expanded by default: ${defaultOpen}`);
  await c.evalExpr(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Composer/.test(e.textContent));
      if (b) b.click(); return !!b;
    })()`);
  await sleep(600);
  const composerAlive = await c.evalExpr(`
    (() => [...document.querySelectorAll('button')]
      .map((e) => e.textContent.trim()).filter((t) => /^(Chunk|Block|Tile)$/.test(t)).length)()`);
  check('expanding it reveals the Chunk/Block/Tile tabs (composer works in the canvas)',
    composerAlive === 3, `tab labels: ${composerAlive}`);

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
  await c.evalExpr(clickPill('Art'));
  await sleep(500);
  await c.evalExpr('window.__dbg.activate("mz", 2); 1');
  let sawEmpty = false, sawText = '';
  for (let i = 0; i < 80; i++) {
    const t = await c.evalExpr(`
      (() => {
        const m = /Loading .{0,40}?…|Open a level from the Explorer|Failed to load level/.exec(document.body.textContent);
        return m ? m[0] : '';
      })()`);
    if (t) { sawEmpty = true; sawText = t; break; }
    await sleep(25);
  }
  check('gap 4: the art canvas shows an EMPTY STATE rather than a blank window',
    sawEmpty === true, sawEmpty ? `saw "${sawText}"` : 'never rendered any empty-state text');
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
  check('aeon still shows its six pills',
    Array.isArray(pills) && pills.length === 6, JSON.stringify(pills));
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
      electron.kill('SIGKILL');
      await sleep(1200);
      electron = launch();
      const c2 = await connect();
      await aeonPhase(c2);
      c2.close();
    } else {
      c.close();
    }
  } finally {
    electron.kill('SIGKILL');
  }
  console.log(fails.length ? `\nFAILED (${fails.length}): ${fails.join(', ')}` : '\nALL PASS');
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
