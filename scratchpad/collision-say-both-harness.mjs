#!/usr/bin/env node
// DOES THE COLLISION PALETTE SAY THAT "SOLID ON BOTH PLANES" EXISTS? — O77/134.
//
// The capability shipped 2026-08-29 (`src/core/collision/both-planes-paint.ts`,
// proven live by `npm run harness:loop-paint` rows [b*]/[d2]). What did NOT ship
// was a way to find out it existed: every word describing it was either
// HOVER-ONLY (the A+B chip's `title`) or ARMED-ONLY (the sentence that renders
// once the mode is already on). Two lanes then costed out spare cell-word bits
// for a third cell state that had already shipped as a gesture. The fix is a
// sentence in the OFF state; this file is the only thing that can see it.
//
// ═══ WHY THE NODE SUITE CANNOT ═══
//
// The ~6,850-row suite never mounts a React component. It reads CollisionPalette
// .tsx as TEXT, so it cannot tell a sentence that renders from a sentence inside
// a branch nothing reaches — which is precisely the failure being fixed: the
// armed-only hint was in the source the whole time and no author ever saw it.
//
// ═══ THE EXPECTATIONS ARE DERIVED FROM THE SOURCE, NOT TYPED HERE ═══
//
// §TEXT parses the two hint branches out of the component's own JSX and keeps
// their literal fragments. A reworded hint re-derives; a hint DELETED or moved
// behind a branch that never renders goes red. The chip's label comes from the
// component's `BOTH_PLANES_LABEL` constant, and row [lbl] compares that against
// the label the RUNNING BUILD renders — the only row that can catch a stale
// dist/. Typing "A+B" or the sentences into this file would make it a second
// copy that agrees with itself while the app says something else.
//
// ═══ WHAT IT WRITES: NOTHING ═══
//
// It opens the REAL ../aeon read-only, arms and disarms a UI mode, and reads
// text. No poke, no stroke, no save, no project id — so there is no probe
// identifier here to collide with a peer's, by construction. The one side
// effect it triggers is the both-planes LENS overlay, which
// `setCollisionPaintBothPlanes` turns on by design; row [c3b] asserts that
// rather than ignoring it, and it is view state, not document state.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:collision-say-both
//   (a linked worktree has no node_modules/.bin/electron — export
//    ELECTRON_BIN=/path/to/main/checkout/node_modules/.bin/electron)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot } from './lib/harness-guard.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-say-both`;
mkdirSync(SHOTS, { recursive: true });

// ── §TEXT — the two hints, read out of the component's own JSX ──────────────
const PALETTE_SRC = `${ROOT}/src/renderer/components/CollisionPalette.tsx`;

/** The chip label constant. Refuses rather than guessing: a harness that
 *  invents "A+B" would keep passing after a rename that broke the hint. */
function chipLabel() {
  const m = /const BOTH_PLANES_LABEL\s*=\s*'([^']+)'/.exec(readFileSync(PALETTE_SRC, 'utf8'));
  if (!m) {
    throw new Error(`BOTH_PLANES_LABEL not found in ${PALETTE_SRC} — REFUSING TO GUESS the chip label.`);
  }
  return m[1];
}

/**
 * The literal fragments of the two hint branches.
 *
 * The conditional is `{variant === 'map' && (bothPlanes ? (<div…>) : (<div…>))}`
 * — ONE gate, two branches, which is itself part of what is being proven: the
 * Art variant must get neither. Anything inside `{…}` is a runtime expression
 * (plane letters, the chip label) and is dropped here; what is left is the
 * static prose that must appear on screen verbatim.
 */
function hintFragments() {
  const src = readFileSync(PALETTE_SRC, 'utf8');
  const block = /\{variant === 'map' && \(bothPlanes \? \(([\s\S]*?)\n\s*\) : \(([\s\S]*?)\n\s*\)\)\}/.exec(src);
  if (!block) {
    throw new Error('the two hint branches are no longer a single `variant === \'map\' && (bothPlanes ? … : …)` '
      + `conditional in ${PALETTE_SRC}. That gate is what keeps the Art variant from getting either sentence, `
      + 'so this harness REFUSES to run rather than derive expectations from a shape it does not recognise.');
  }
  // ⚠ TAGS ARE REMOVED, NOT REPLACED BY A SPACE. `Painting <strong>both
  // paths</strong>: every…` renders with NO space before the colon; substituting
  // a space here produced "both paths : every", which matches nothing on screen
  // and would have made [c4] red against a correct app.
  const litsOf = (jsx) => jsx
    .replace(/<[^>]*>/g, '')           // tags, incl. <strong>
    .split(/\{[^}]*\}/)                // runtime expressions become boundaries
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 12);    // keep sentence-sized literals only
  const armed = litsOf(block[1]);
  const idle = litsOf(block[2]);
  if (!armed.length || !idle.length) {
    throw new Error('one of the two hint branches has no literal prose left after stripping JSX — '
      + 'nothing to assert. Refusing to run.');
  }
  return { armed, idle };
}

const LABEL = chipLabel();
const FRAG = hintFragments();

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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/** LOUD ON UNMEASURABLE: counted as a failure, never silently skipped. */
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false });
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-say-both/${name}.png`);
}

async function mouse(c, type, x, y, buttons) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}

// ── the palette, as the app renders it ─────────────────────────────────────
//
// The panel is located from the A+B CHIP outwards — climb until the container
// holds the Plane, Brush and Floor rows — so every reading below is provably
// from THIS panel and not from some other text on screen that happens to match.
const PANEL_TEXT = String.raw`(() => {
  const chip = [...document.querySelectorAll('button')]
    .find((b) => /Solid on BOTH paths/i.test(b.getAttribute('title') || ''));
  if (!chip) return { error: 'no A+B chip' };
  let el = chip;
  while (el.parentElement && !(/\bPlane\b/.test(el.textContent) && /\bBrush\b/.test(el.textContent)
        && /\bFloor\b/.test(el.textContent))) el = el.parentElement;
  return {
    label: chip.textContent.trim(),
    title: chip.getAttribute('title') || '',
    disabled: !!chip.disabled,
    text: el.textContent.replace(/\s+/g, ' ').trim(),
  };
})()`;

/**
 * The one hint element carrying `frag`, its normalised text, and whether it is
 * ACTUALLY ON SCREEN.
 *
 * `checkVisibility()` and `getClientRects()` both go green on an element
 * scrolled far out of its scroller, so neither is used: the test is a real hit
 * test at the element's centre, and when that misses the element is scrolled
 * into view and retested with `scrolled: true` reported. A sentence that only
 * exists below the fold is a different (and weaker) claim than one on screen,
 * and the row says which.
 */
const hintProbe = (frag) => String.raw`(() => {
  const want = ${JSON.stringify(frag)};
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('div')].filter((d) => norm(d.textContent).includes(want));
  if (!all.length) return { found: false };
  // innermost match: the hint div itself, not its ancestors
  const el = all[all.length - 1];
  const hit = (e) => {
    const b = e.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return { ok: false, why: 'zero-area rect', b };
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const at = document.elementFromPoint(x, y);
    return { ok: !!at && (at === e || e.contains(at)), why: at ? at.tagName + '.' + (at.className || '') : 'nothing',
             b: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } };
  };
  let h = hit(el), scrolled = false;
  if (!h.ok) { el.scrollIntoView({ block: 'center' }); scrolled = true; h = hit(el); }
  return { found: true, text: norm(el.textContent), onScreen: h.ok, why: h.why, rect: h.b, scrolled };
})()`;

/** A REAL press on the chip: integer client pixels, verified with
 *  elementFromPoint BEFORE the press, then mousePressed/mouseReleased.
 *  `el.click()` is not a click and is deliberately not used. */
async function pressChip(c) {
  const aim = await c.json(String.raw`(() => {
    const chip = [...document.querySelectorAll('button')]
      .find((b) => /Solid on BOTH paths/i.test(b.getAttribute('title') || ''));
    if (!chip) return { error: 'no chip' };
    if (chip.disabled) return { error: 'chip is disabled' };
    const b = chip.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const at = document.elementFromPoint(x, y);
    return { x, y, hit: !!at && (at === chip || chip.contains(at)),
             at: at ? at.tagName : 'none', rect: { w: Math.round(b.width), h: Math.round(b.height) } };
  })()`);
  if (aim.error) throw new Error(`chip aim refused: ${aim.error}`);
  if (!aim.hit) {
    throw new Error(`AIM REFUSED: (${aim.x},${aim.y}) lands on <${aim.at}>, not the A+B chip. `
      + 'A press there would be dispatched at something else and every row below would read the old screen.');
  }
  await mouse(c, 'mousePressed', aim.x, aim.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', aim.x, aim.y, 0);
  await sleep(300);
  return aim;
}

/** Click a plane chip ('A' / 'B') in the Plane row, for real. */
async function pressPlane(c, letter) {
  const aim = await c.json(String.raw`(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(letter)});
    if (!b) return { error: 'no plane chip ' + ${JSON.stringify(letter)} };
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const at = document.elementFromPoint(x, y);
    return { x, y, hit: !!at && (at === b || b.contains(at)), at: at ? at.tagName : 'none' };
  })()`);
  if (aim.error || !aim.hit) throw new Error(`plane chip ${letter} aim refused: ${JSON.stringify(aim)}`);
  await mouse(c, 'mousePressed', aim.x, aim.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', aim.x, aim.y, 0);
  await sleep(300);
  return aim;
}

const armed = (c) => c.json('window.__dbg.aeon.armCollisionBrush({})');

async function main() {
  console.log('\n=== DERIVED FROM SOURCE (src/renderer/components/CollisionPalette.tsx) ===');
  console.log(`  BOTH_PLANES_LABEL = ${JSON.stringify(LABEL)}`);
  console.log(`  idle-branch literals  (${FRAG.idle.length}): ${FRAG.idle.map((s) => JSON.stringify(s)).join(' + ')}`);
  console.log(`  armed-branch literals (${FRAG.armed.length}): ${FRAG.armed.map((s) => JSON.stringify(s)).join(' + ')}`);

  // O52: the bundle under test must be newer than the sources it was built
  // from, and — when the run borrows another tree's build — this checkout's
  // sources must actually BE in that bundle. Every row below reads text that
  // only exists in this branch, so a stale or drifted bundle would make [c1]
  // red for a reason that has nothing to do with the app.
  assertFreshBuild(RUN);

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);
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

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — needs a VITE_AURORA_DEBUG=1 build of dist/');
    }

    console.log('\n=== OPENING THE REAL AEON PROJECT (read-only) ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');

    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    await sleep(700);

    // ── [lbl] the palette is mounted, and the RUNNING build's chip label
    //          matches the constant the hint points at (catches a stale dist/)
    const p0 = await c.json(PANEL_TEXT);
    if (p0.error) {
      unmeasurable('lbl', 'the A+B chip is present in the collision palette',
        `${p0.error} — facet=${facet?.facet}. Every row below reads this panel, so none of them can run.`);
      throw new Error('collision palette never mounted');
    }
    check('lbl', 'the RUNNING build renders the chip with the label the hint names (dist is not stale)',
      p0.label === LABEL && !p0.disabled,
      `rendered=${JSON.stringify(p0.label)} source BOTH_PLANES_LABEL=${JSON.stringify(LABEL)} `
      + `disabled=${p0.disabled} facet=${facet?.facet}`);

    // ── [c0] the mode starts OFF — asserted, not assumed ────────────────────
    const a0 = await armed(c);
    check('c0', 'the both-planes mode starts OFF, so the idle sentence below is the state an author lands in',
      a0.bothPlanes === false, `armCollisionBrush({}) → ${JSON.stringify(a0)}`);
    if (a0.bothPlanes !== false) {
      throw new Error('the mode was already armed at mount — the idle rows would measure the wrong branch');
    }

    // ── [c1] THE ROW THIS PARCEL EXISTS FOR ─────────────────────────────────
    const idleProbes = [];
    for (const f of FRAG.idle) idleProbes.push(await c.json(hintProbe(f)));
    const idleFound = idleProbes.every((p) => p.found);
    const idleText = idleProbes.find((p) => p.found)?.text ?? null;
    check('c1', 'with the mode OFF the palette already SAYS solid-on-both is paintable, in prose, unhovered',
      idleFound && idleProbes.every((p) => p.onScreen),
      idleFound
        ? `on screen: ${idleProbes.map((p) => `${p.onScreen}${p.scrolled ? '(scrolled)' : ''}`).join(' ')} `
          + `rect=${JSON.stringify(idleProbes[0].rect)}\n        text="${idleText}"`
        : `MISSING fragment(s): ${FRAG.idle.filter((_, i) => !idleProbes[i].found).map((s) => JSON.stringify(s)).join(', ')}`);

    // ── [c1b] and it points at the control BY ITS RENDERED NAME ─────────────
    check('c1b', 'the idle sentence names the chip exactly as the chip renders it (no dangling instruction)',
      !!idleText && idleText.includes(p0.label) && /plane A/i.test(idleText) && /plane B/i.test(idleText),
      `label=${JSON.stringify(p0.label)} present=${!!idleText && idleText.includes(p0.label)} · text="${idleText}"`);

    // ── [c1c] it is the IDLE sentence, not the armed one leaking through ────
    check('c1c', 'the idle sentence is not the armed sentence (the two branches are distinguishable)',
      !!idleText && FRAG.armed.every((f) => !idleText.includes(f)),
      `armed literals found in the idle text: `
      + `${FRAG.armed.filter((f) => idleText && idleText.includes(f)).map((s) => JSON.stringify(s)).join(', ') || 'none'}`);
    await shot(c, 'idle');

    // ── [c3] a REAL press arms the mode — the app's own state says so ───────
    const aim = await pressChip(c);
    const a1 = await armed(c);
    check('c3', 'a real mouse press on the chip ARMS the mode (the store changed, not just the pixels)',
      a1.bothPlanes === true,
      `press at (${aim.x},${aim.y}) on a ${aim.rect.w}x${aim.rect.h} chip → armCollisionBrush({}) = ${JSON.stringify(a1)}`);

    // ── [c3b] and arming surfaced the lens the sentence promises ────────────
    const ov = await c.json('window.__dbg.overlays ? window.__dbg.overlays() : null');
    check('c3b', 'arming surfaced the both-planes lens, so "the teal veil" the armed sentence names is actually on',
      ov?.showSolidBothPlanes === true, `overlays.showSolidBothPlanes=${ov?.showSolidBothPlanes}`);

    // ── [c4] the armed sentence replaced the idle one ───────────────────────
    const armedProbes = [];
    for (const f of FRAG.armed) armedProbes.push(await c.json(hintProbe(f)));
    const armedFound = armedProbes.every((p) => p.found);
    const armedText = armedProbes.find((p) => p.found)?.text ?? null;
    const idleGone = await c.json(hintProbe(FRAG.idle[0]));
    check('c4', 'armed: the armed sentence renders and the idle one is GONE (one conditional, two branches)',
      armedFound && armedProbes.every((p) => p.onScreen) && idleGone.found === false,
      `armed on screen=${armedProbes.map((p) => p.onScreen).join(' ')} idleStillThere=${idleGone.found}\n`
      + `        text="${armedText}"`);

    // ── [c5] anti-vacuous: the two readings are different text ──────────────
    check('c5', 'the OFF and ON readings are different sentences (the panel is not showing one string twice)',
      !!idleText && !!armedText && idleText !== armedText && idleText.length > 60 && armedText.length > 60,
      idleText === armedText ? 'IDENTICAL — the probe is not reading the branch'
        : `idle ${idleText?.length} chars · armed ${armedText?.length} chars`);

    // ── [c6] the armed sentence's scope caveat FOLLOWS THE AIMED PLANE ──────
    //
    // Not decoration: it is the one place the palette says the mode does NOT
    // reach Reset and Clear, and a caveat naming a fixed letter would be wrong
    // half the time. Driven through the real plane chips.
    const planeA = (await armed(c)).plane;
    const textA = (await c.json(hintProbe(FRAG.armed[0]))).text;
    await pressPlane(c, 'B');
    const planeB = (await armed(c)).plane;
    const textB = (await c.json(hintProbe(FRAG.armed[0]))).text;
    const saysPlane = (t, p) => new RegExp(`plane ${p.toUpperCase()} alone`, 'i').test(t);
    check('c6', 'the armed sentence names the AIMED plane in its Reset/Clear caveat, and follows the plane chip',
      planeA === 'a' && planeB === 'b' && saysPlane(textA, 'a') && saysPlane(textB, 'b') && textA !== textB,
      `plane ${planeA} → "…${(textA || '').slice(-58)}"\n        plane ${planeB} → "…${(textB || '').slice(-58)}"`);
    await shot(c, 'armed');

    // ── [c7] disarming brings the idle sentence back ────────────────────────
    await pressPlane(c, 'A');
    await pressChip(c);
    const a2 = await armed(c);
    const idleBack = await c.json(hintProbe(FRAG.idle[0]));
    const armedGone = await c.json(hintProbe(FRAG.armed[0]));
    check('c7', 'a second press disarms and the idle sentence returns (it is reactive, not a one-shot)',
      a2.bothPlanes === false && idleBack.found === true && idleBack.onScreen === true && armedGone.found === false,
      `bothPlanes=${a2.bothPlanes} idleBack=${idleBack.found}/${idleBack.onScreen} armedStillThere=${armedGone.found}`);

    // ── [d] the document was not touched ────────────────────────────────────
    const dirty = await c.evalExpr('window.__dbg.aeon.canUndo ? window.__dbg.aeon.canUndo() : null');
    check('d1', 'this run made NO document edit (nothing on the undo stack; nothing was saved)',
      dirty === false || dirty === null, `canUndo=${dirty}`);
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    await killTree(child);
    restoreDiscoveryNow();
    console.log('cleanup: discovery files restored to their pre-run state');
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
