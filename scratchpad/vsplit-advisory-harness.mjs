#!/usr/bin/env node
// IS THE TWO-WRITER SENTENCE ON SCREEN, IN THE RUNNING APP, WHEN AN AUTHOR
// BUILDS THE COMBINATION THE ENGINE REFUSES OUTRIGHT?
//
// ═══ THE DEFECT THIS EXISTS BECAUSE OF ═══
//
// `fireLineAdvisory` carried, from the day it landed, an early return guarded by
// a comment that said an unlocked scene with a vsplit "already has its own
// advisory". It did not. Nothing in Aurora's PANEL said anything about the
// combination — so an author could turn on a Plane B split, drop `v_factor` off
// the lock, and hold a document `scene()` refuses outright with NOTHING on
// screen saying so. 5,341 vitest tests were green over that gap, because not one
// of them can see React, a DOM node or a pixel. This file is the only instrument
// that can tell whether the sentence reaches an author.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. ⚠ THIS PARCEL'S OWN WORST TRAP, AND IT IS THE SHAPE OF THE DEFECT ITSELF:
//    **a locked scene produces no advisory, and so does a completely broken
//    implementation.** Every scene that ships is locked. A harness that only
//    ever looked at locked scenes would go green over a deleted feature. So
//    every discriminating row here builds an UNLOCKED scene WITH A SPLIT
//    ACTUALLY PRESENT — read back out of the document before any DOM is
//    inspected — and every one is paired with a LOCKED control that must be
//    SILENT, in the same session, through the same gesture.
//
// 2. A PROVIDER THAT RETURNS THE RIGHT STRING TO NOBODY. Every assertion below
//    reads `textContent` out of the live DOM. `vsplitLockAdvisory` returning a
//    sentence proves nothing about whether it is rendered — that is exactly the
//    gap being closed, one level up.
//
// 3. A SENTENCE THAT IS RENDERED AND THEN HIDDEN. `document.elementFromPoint` at
//    the hint's own centre must land ON the hint (or inside it), and
//    `checkVisibility()` must agree. A `display:none` hint has a textContent.
//
// 4. BOTH ROUTES TO THE FAULT, because they are different gestures and the
//    panel answers them in two different places:
//      • turn the SPLIT on while the scene is already unlocked  -> the LAYER
//        card's sentence;
//      • move V_FACTOR off the lock while a layer already has a split -> the
//        V-FACTOR row's sentence, which is the only one that can name WHICH
//        layers, because that route never touches a layer.
//    Section 7 proves the sentences are in those two places by DOM ORDER, not
//    by taking the app's word for it.
//
// 5. AN ADVISORY THAT OFFERS ONE REMEDY. The engine offers two and they are
//    different products (lock the plane; or move the depth onto fb/curve). The
//    only sentence Aurora had on this bound before ROADMAP row 80 — on the
//    raster timeline strip, in a different collapsible section — offered one.
//    Both remedy clauses are PARSED OUT OF THE PROVIDER SOURCE and required
//    present in the on-screen text.
//
// 6. AN ADVISORY THAT BECAME A CLAMP. This parcel is explicitly not allowed to
//    make a control refuse (ROADMAP rows 37/58/66 are pending the owner's
//    review). Section 8 reads the document back and requires it to still HOLD
//    the illegal combination, unrewritten.
//
// 7. ⚠ A DISCLOSURE WELDED SHUT — ROADMAP O15, and it is a trap this file
//    CREATED. O15 put the MECHANISM behind a collapsed "Why this happens" so
//    the advisory stopped being 21 lines and burying five controls. The
//    mechanism is hidden, NOT unmounted, so `textContent` still contains it:
//    rows [5a] [5b] [9d] now go green over a mechanism that can never be shown
//    — success and failure emitting the same artifact, this repo's dominant
//    defect class arriving because of a fix. Rows [5e] [5f] [5f2] [5g] [5g2]
//    [5h] [5i] [9e] are the keepers and NOT ONE OF THEM READS TEXT: they use
//    `checkVisibility()`, `getClientRects().length` and `elementFromPoint`, on
//    BOTH surfaces, collapsed and expanded, in one session through one click.
//    [5c]/[5d]/[5b2] were RE-POINTED at clauses that are never hidden — see the
//    comments at each. Packet: docs/reviews/2026-08-30-o15-advisory-shape.md §4.
//
// ═══ AIM AT INTEGERS ═══
//
// `devicePixelRatio` is whatever Electron infers under Xvfb and has been seen at
// 1 and at 1.35 on this host inside one session. Only ONE row here uses client
// coordinates at all (5c's `elementFromPoint`) and it aims at the hint's own
// integer-rounded CENTRE — the least dpr-sensitive point available. dpr, the
// rect and the aim are printed regardless.
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build    # __dbg exists ONLY here
//   node scratchpad/vsplit-advisory-harness.mjs    # or: npm run harness:vsplit-advisory
//
// Screenshots land in scratchpad/shots-vsplit-advisory/.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9407);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch.
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-vsplit-advisory`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'vsplit_lock_probe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── THE CONTRACT, PARSED FROM SOURCE — no sentence is retyped here ─────────
//
// The clauses are declared ONCE in the provider and composed by three surfaces.
// A harness that retyped them would go green on its own copy while the app said
// something else, which is the same class of defect as the comment that started
// this parcel.
const PROVIDER_SRC = `${ROOT}/src/renderer/providers/effects-aeon.ts`;
const SRC = readFileSync(PROVIDER_SRC, 'utf8');
// The disclosure's label lives with the component that draws it, not with the
// clauses, and it is parsed for the SAME reason: a harness that typed "Why this
// happens" would keep clicking a button the app had renamed.
const LAYOUT_SRC = `${ROOT}/src/renderer/components/effects/column-layout.tsx`;
const LAYOUT = readFileSync(LAYOUT_SRC, 'utf8');

/**
 * The lock sentinel, DERIVED THE WAY THE APP DERIVES IT.
 *
 * `EFFECTS_V_FACTOR_LOCK = EFFECTS_V_FACTOR_BOUNDS.max`, and that bound comes
 * from the schema's `properties.v_factor.maximum` — so this reads the schema,
 * not a number written in a TypeScript file and certainly not one written here.
 * `scene-ui.ts` is checked to still spell the derivation that way, so a future
 * change to a literal cannot leave this quietly reading the wrong source.
 */
function parseLock() {
  const ui = readFileSync(`${ROOT}/src/core/formats/effects/scene-ui.ts`, 'utf8');
  if (!/EFFECTS_V_FACTOR_LOCK[^\n]*=\s*EFFECTS_V_FACTOR_BOUNDS\.max/.test(ui)) {
    throw new Error('CANNOT MEASURE: EFFECTS_V_FACTOR_LOCK is no longer '
      + 'EFFECTS_V_FACTOR_BOUNDS.max — this harness\'s derivation is stale, fix it');
  }
  const schema = JSON.parse(readFileSync(
    `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
  const max = schema?.properties?.v_factor?.maximum;
  if (typeof max !== 'number') {
    throw new Error('CANNOT MEASURE: schema has no properties.v_factor.maximum');
  }
  return max;
}
const LOCK = parseLock();

/**
 * Pull one `const NAME = <string concatenation>;` out of a source file and
 * evaluate the literal pieces — single-quoted AND template.
 *
 * ⚠ IT REFUSES TO GUESS. A clause it cannot recover throws, loudly, before a
 * single row runs; so does an interpolation it does not know how to resolve. A
 * harness that silently fell back to a typed string would be asserting against
 * itself, which is the class of defect this whole parcel is about.
 *
 * `subs` names the interpolations THIS CALL is allowed to resolve, and it is a
 * whitelist rather than a fallback: `${EFFECTS_V_FACTOR_LOCK}` is always
 * resolvable from the schema-derived constant, and a caller that knows what a
 * clause's parameter is bound to on screen (`${vf}` = the value the fixture
 * typed) may add it. Anything left over still stops the run.
 */
function parseClauseFrom(src, where, name, subs = {}) {
  const m = src.match(new RegExp(`const ${name} =\\s*([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`CANNOT MEASURE: ${name} not found in ${where}`);
  const pieces = m[1].match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g);
  if (!pieces) throw new Error(`CANNOT MEASURE: ${name} has no string literals in ${where}`);
  const all = { EFFECTS_V_FACTOR_LOCK: LOCK, ...subs };
  return pieces.map((p) => {
    if (p.startsWith('`')) {
      let body = p.slice(1, -1);
      for (const [k, v] of Object.entries(all)) {
        body = body.split(`\${${k}}`).join(String(v));
      }
      if (body.includes('${')) {
        throw new Error(`CANNOT MEASURE: ${name} interpolates something this harness `
          + `cannot resolve: ${body}`);
      }
      return body;
    }
    // eslint-disable-next-line no-eval
    return eval(p);
  }).join('');
}
const parseClause = (name, subs) => parseClauseFrom(SRC, PROVIDER_SRC, name, subs);

const MECHANISM = parseClause('VSPLIT_LOCK_MECHANISM');
const REMEDY_LOCK = parseClause('VSPLIT_LOCK_REMEDY_LOCK');
const REMEDY_HORIZ = parseClause('VSPLIT_LOCK_REMEDY_HORIZONTAL');
// The shift the scene is dropped to. NOT 0 and NOT 1: 0 is the schema minimum
// and would also be what an uninitialised field reads as, and the sentence
// interpolates the value, so a wrong-value bug must be visible. 3 is neither an
// edge nor the lock.
const UNLOCKED_VF = 3;
// ── O15: THE DIAGNOSIS HALF, AND THE DISCLOSURE'S LABEL ────────────────────
//
// The advisory is now THREE PARTS and only the mechanism is behind a
// disclosure, so the rows that used to ask "is the whole paragraph painted?"
// through the mechanism leaf have to ask it through a clause that is never
// hidden. `VSPLIT_LOCK_SCENE_IS` is the head of the DIAGNOSIS and is the clause
// that carries the author's own `v_factor` value — the fact `[5b2]` is about.
const SCENE_IS_UNLOCKED = parseClause('VSPLIT_LOCK_SCENE_IS', { vf: UNLOCKED_VF });
const WHY = parseClauseFrom(LAYOUT, LAYOUT_SRC, 'WHY_THIS_HAPPENS');
// Two layers, so the multi-layer plural in the scene sentence is exercised and
// so there is a layer WITHOUT a split in the same scene as a control.
const TOP_A = 0;
const TOP_B = 96;

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
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-vsplit-advisory/${name}.png`);
}

const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/**
 * EVERY ELEMENT ON SCREEN WHOSE OWN TEXT CARRIES A PHRASE — the whole point.
 *
 * ⚠ LEAF-ONLY, and that is not a detail. `document.body.textContent` contains
 * every phrase any descendant renders, so a naive contains-check would pass on
 * a hint that is mounted inside a `display:none` subtree, or one whose text is
 * in a `<title>` attribute somewhere. This walks elements with NO element
 * children carrying the phrase, i.e. the node that actually renders it, and
 * reports its box and its visibility so the caller can insist it is real.
 */
const FIND_TEXT = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const t = el.textContent || '';
    if (!t.includes(want)) continue;
    // Only the deepest element carrying it — the renderer, not its ancestors.
    if ([...el.children].some((k) => (k.textContent || '').includes(want))) continue;
    const r = el.getBoundingClientRect();
    out.push({
      text: t,
      tag: el.tagName,
      visible: typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  }
  return out;
})()`;

/**
 * DOM ORDER, so "under the v_factor row" and "on the layer card" are MEASURED.
 *
 * Returns, for the element rendering `phrase`: whether it precedes the v_factor
 * input, and whether it follows the "Layer 0" card heading. `compareDocumentPosition`
 * is the browser's own answer; nothing here re-implements tree order.
 */
const DOM_ORDER = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf) return { found: false };
  const vf = [...document.querySelectorAll('input[type=number]')]
    .find((e) => /^v_factor — /.test(e.title || ''));
  const l0 = [...document.querySelectorAll('select')]
    .find((e) => /^Layer 0 vsplit\.at/.test(e.title || ''));
  if (!vf || !l0) return { found: true, vf: !!vf, l0: !!l0 };
  const P = Node.DOCUMENT_POSITION_FOLLOWING;
  return {
    found: true, vf: true, l0: true,
    // "the hint comes BEFORE the layer-0 split control" == it is up in the
    // scene section rather than down on a card.
    beforeLayer0: (leaf.compareDocumentPosition(l0) & P) !== 0,
    // "the hint comes AFTER the v_factor spinner" — true for both, but taken
    // with beforeLayer0 it pins the hint between them, which is the scene row.
    afterVFactor: (vf.compareDocumentPosition(leaf) & P) !== 0,
  };
})()`;

/** `elementFromPoint` at a rect's integer-rounded centre, and whether it is inside the hint. */
const HIT_AT = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf) return { found: false };
  leaf.scrollIntoView({ block: 'center' });
  const r = leaf.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return {
    found: true, x, y,
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    dpr: window.devicePixelRatio,
    inside: hit !== null && (hit === leaf || leaf.contains(hit) || hit.contains(leaf)),
    hitTag: hit ? hit.tagName : null,
    hitText: hit ? (hit.textContent || '').slice(0, 60) : null,
  };
})()`;

/**
 * ⚠ THE O15 VACUITY CLOSURE — read the packet's §4 before touching this.
 *
 * The mechanism is now behind a collapsed disclosure, and it is HIDDEN, NOT
 * UNMOUNTED. So `textContent` contains it whether the disclosure works or has
 * been broken into a permanently shut box: `[5a]`/`[5b]`/`[9d]` would go green
 * on both, which is a check whose failure state and success state emit the same
 * artifact. THIS PROBE NEVER READS TEXT AS EVIDENCE. It reports, per mechanism
 * element:
 *
 *   • `visible`  — `checkVisibility()`, the browser's own answer;
 *   • `rects`    — `getClientRects().length`; a `display:none` node has ZERO
 *                  boxes, which is the strongest DOM statement of "does not
 *                  paint" available and is not a rounded rectangle;
 *   • `blockHitIsMechanism` — `document.elementFromPoint` at the CENTRE OF THE
 *                  ADVISORY BLOCK the mechanism belongs to. Aiming at the
 *                  mechanism's own centre is meaningless when it has no box, so
 *                  the aim is the box it would be inside; a hidden mechanism
 *                  must not be what is under that point, and a shown one at its
 *                  own centre must be (`[5g]`).
 *
 * Containment is STRICT (`el === hit || el.contains(hit)`). `hit.contains(el)`
 * — which `HIT_AT` allows — is true for any ANCESTOR of the mechanism, and the
 * advisory block IS an ancestor, so the loose test would report "the mechanism
 * is under the pointer" for a mechanism that is `display:none`.
 *
 * ⚠ THERE ARE THREE SURFACES, NOT TWO, AND THIS ROW LEARNED IT THE HARD WAY.
 * The first run of the O15 rows asserted "exactly 2 mechanism elements" and
 * found THREE: `canvas/raster-timeline.ts`'s `splitRefusal` composes the same
 * clauses on the raster strip, in a different collapsible section, as ONE
 * un-split paragraph. That surface is OUTSIDE O15's scope (the ruling names the
 * v_factor row and the layer cards) and is deliberately untouched. So the
 * classification here is STRUCTURAL, not a count and not a hard-coded index:
 * `hasDisclosure` is true when the mechanism's own block also holds a
 * "Why this happens" control, which is precisely what makes it one of the two
 * advisories O15 converted. `[5j]` asserts the third is still there and still
 * whole, so "scope held" is measured rather than asserted in prose.
 */
const MECH_STATE = String.raw`
(() => {
  const want = ${JSON.stringify(MECHANISM)};
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const t = el.textContent || '';
    if (!t.includes(want)) continue;
    if ([...el.children].some((k) => (k.textContent || '').includes(want))) continue;
    const block = el.parentElement;
    let blockHit = null; let blockH = null;
    if (block) {
      block.scrollIntoView({ block: 'center' });
      const b = block.getBoundingClientRect();
      blockH = b.height;
      if (b.width > 0 && b.height > 0) {
        const h = document.elementFromPoint(
          Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        blockHit = h === null ? null
          : (el === h || el.contains(h)) ? 'MECHANISM' : (h.textContent || '').slice(0, 48);
      }
    }
    const r = el.getBoundingClientRect();
    out.push({
      // The block holds a disclosure => this is one of the two advisories O15
      // converted. No disclosure => the raster strip's own sentence, out of scope.
      hasDisclosure: !!block && [...block.querySelectorAll('button')]
        .some((b) => (b.textContent || '').includes(${JSON.stringify(WHY)})),
      visible: el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
      rects: el.getClientRects().length,
      h: Math.round(r.height), w: Math.round(r.width),
      blockH: blockH === null ? null : Math.round(blockH),
      blockHitIsMechanism: blockHit === 'MECHANISM',
      blockHitText: blockHit,
      inText: t.includes(want),
    });
  }
  return out;
})()`;

/** Every "Why this happens" disclosure on screen, with its state and its box. */
const TOGGLES = String.raw`
(() => [...document.querySelectorAll('button')]
  .filter((b) => (b.textContent || '').includes(${JSON.stringify(WHY)}))
  .map((b, i) => {
    const r = b.getBoundingClientRect();
    return {
      i, expanded: b.getAttribute('aria-expanded'), text: (b.textContent || '').trim(),
      visible: b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
      w: Math.round(r.width), h: Math.round(r.height),
    };
  }))()`;

/** Scroll disclosure `i` into view, hit-test its own centre, and click it. */
const CLICK_TOGGLE = (i) => String.raw`
(() => {
  const bs = [...document.querySelectorAll('button')]
    .filter((b) => (b.textContent || '').includes(${JSON.stringify(WHY)}));
  const b = bs[${i}];
  if (!b) return { ok: false, why: 'no such disclosure', count: bs.length };
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const h = document.elementFromPoint(x, y);
  const hit = h !== null && (h === b || b.contains(h));
  b.click();
  return { ok: true, count: bs.length, x, y, hit, hitTag: h ? h.tagName : null,
           hitText: h ? (h.textContent || '').slice(0, 48) : null };
})()`;

/**
 * Strict `elementFromPoint` at a phrase's own centre — `[5g]`'s aim.
 *
 * Deliberately NOT `HIT_AT`: this one refuses `hit.contains(leaf)`, so an
 * ancestor under the pointer is not counted as the leaf being painted.
 */
const HIT_STRICT = (phrase, nth = 0) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaves = [...document.querySelectorAll('*')].filter((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  const leaf = leaves[${nth}];
  if (!leaf) return { found: false, leaves: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  const r = leaf.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return {
    found: true, leaves: leaves.length, x, y, dpr: window.devicePixelRatio,
    rect: { width: Math.round(r.width), height: Math.round(r.height) },
    inside: hit !== null && (hit === leaf || leaf.contains(hit)),
    hitTag: hit ? hit.tagName : null,
    hitText: hit ? (hit.textContent || '').slice(0, 48) : null,
  };
})()`;

/**
 * The WHOLE advisory block a phrase belongs to — its container's text.
 *
 * O15 split one element into four siblings (diagnosis, disclosure, mechanism,
 * remedies), so a leaf that used to carry the whole sentence now carries a
 * third of it. This walks ONE step up from the leaf, structurally, rather than
 * asking the app for a `data-` hook it could get wrong: the parts are siblings
 * by construction, so their parent is the block.
 */
const BLOCK_TEXT = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf || !leaf.parentElement) return { found: false };
  return { found: true, text: leaf.parentElement.textContent || '' };
})()`;

function sceneOf(doc) { return doc.find((s) => s.id === SCENE_ID) ?? null; }

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const screen = process.env.SCREEN ?? '1680x1050';
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${screen}x24`, ELECTRON, MAIN],
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

    // ---- D. THE DERIVATION, PRINTED. -------------------------------------
    note('CONTRACT PARSED FROM SOURCE (no sentence is typed in this file):',
      `EFFECTS_V_FACTOR_LOCK=${LOCK}, so the scene is dropped to v_factor ${UNLOCKED_VF}\n        `
      + `from ${PROVIDER_SRC}\n        `
      + `MECHANISM      = "${MECHANISM.slice(0, 72)}…" (${MECHANISM.length} chars)\n        `
      + `REMEDY_LOCK    = "${REMEDY_LOCK}"\n        `
      + `REMEDY_HORIZ   = "${REMEDY_HORIZ}"`);
    check('0y', 'ANTI-VACUOUS: the three parsed clauses are distinct, non-empty, and none contains another',
      MECHANISM.length > 80 && REMEDY_LOCK.length > 20 && REMEDY_HORIZ.length > 20
      && !REMEDY_LOCK.includes(REMEDY_HORIZ) && !REMEDY_HORIZ.includes(REMEDY_LOCK)
      && !MECHANISM.includes(REMEDY_LOCK),
      'a parse that collapsed to "" would make every text row below pass trivially');

    const haveScenes = await c.evalExpr('typeof window.__dbg.aeon.scenesJson === "function"');
    check('0a', 'ANTI-VACUOUS: the build under test has the scene probe at all',
      haveScenes === true, `${RUN.root}/dist`);
    if (!haveScenes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon. ----------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    check('2a', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);

    // ---- 3. THE FIXTURE, BUILT THROUGH THE REAL CONTROLS. -----------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(800);
    // ⚠ BY `aria-label`, NOT BY TEXT — `IconButton` puts the label in
    // `title`/`aria-label`, so `/^Add$/` on text finds nothing and the harness
    // would go on to assert against a one-layer scene it never built.
    const added = await c.evalExpr(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Add layer"]');
               if (!b) return 'no-button'; b.click(); return 'ok'; })()`);
    await sleep(800);
    check('3a0', 'ANTI-VACUOUS: the Add-layer control was found and clicked',
      added === 'ok', `click result = ${JSON.stringify(added)}`);

    const topField = (i) =>
      `[...document.querySelectorAll('input[type=number]')].find(e => new RegExp('^Layer ${i} (world_y|Screen line)').test(e.title||''))`;
    const vfField = `[...document.querySelectorAll('input[type=number]')].find(e => /^v_factor — /.test(e.title||''))`;
    const vsplitSel = (i) =>
      `[...document.querySelectorAll('select')].find(e => new RegExp('^Layer ${i} vsplit\\\\.at').test(e.title||''))`;

    const setField = async (id, name, selector, value) => {
      const r = await c.evalExpr(SET_INPUT(selector, value));
      check(id, name, r === 'ok', `set result = ${JSON.stringify(r)} (wanted ${value})`);
      await sleep(400);
    };
    await setField('3a1', 'ANTI-VACUOUS: layer 0\'s top field exists and took a value', topField(0), TOP_A);
    await setField('3a2', 'ANTI-VACUOUS: layer 1\'s top field exists and took a value', topField(1), TOP_B);

    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    let sc = sceneOf(doc);
    check('3b', 'ANTI-VACUOUS: the scene exists, has TWO layers, and starts LOCKED',
      !!sc && sc.layers.length === 2 && sc.v_factor === LOCK,
      `id=${sc?.id} v_factor=${sc?.v_factor} layers=${sc?.layers?.length}`);
    if (!sc || sc.layers.length !== 2) {
      throw new Error(`FIXTURE NOT BUILT: expected 2 layers, got ${sc?.layers?.length}. `
        + 'Every row below is unmeasurable and none is reported as green.');
    }

    // =====================================================================
    // 4. ⚠ THE CONTROL, AND IT IS THE WHOLE REASON ANY GREEN BELOW MEANS
    //    ANYTHING. A locked scene WITH A SPLIT is legal, and is what every
    //    shipped scene looks like. It must say NOTHING.
    // =====================================================================
    await setField('4a0', 'the layer card offers a Plane B split control on layer 0', vsplitSel(0), 'at');
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('4a', '⚠ THE CONTROL IS REALLY THE CONTROL: L0 carries a vsplit, L1 does not, scene LOCKED',
      sc.layers[0].vsplit !== undefined && sc.layers[1].vsplit === undefined && sc.v_factor === LOCK,
      `L0.vsplit=${JSON.stringify(sc.layers[0].vsplit)} L1.vsplit=${JSON.stringify(sc.layers[1].vsplit)} `
      + `v_factor=${sc.v_factor} — a locked scene with a split is LEGAL and must be silent`);
    let hits = await c.json(FIND_TEXT(MECHANISM));
    check('4b', '⚠ DISCRIMINATING (silence): a LOCKED scene with a split says NOTHING on screen',
      hits.length === 0,
      `${hits.length} element(s) render the mechanism clause. This is the row that stops `
      + 'an always-on hint being read as a working feature — and the row a deleted feature '
      + 'ALSO passes, which is why 5a exists.');
    await shot(c, '4-locked-with-split-silent');

    // =====================================================================
    // 5. ⚠ THE DISCRIMINATING SECTION, ROUTE A: move v_factor off the lock
    //    while a split is already placed. The author never touches a layer.
    // =====================================================================
    await setField('5a0', 'the v_factor spinner took a camera-tracking shift', vfField, UNLOCKED_VF);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('5a1', 'ANTI-VACUOUS: the DOCUMENT now holds the illegal combination',
      sc.v_factor === UNLOCKED_VF && sc.layers[0].vsplit !== undefined,
      `v_factor=${sc.v_factor} (lock is ${LOCK}) L0.vsplit=${JSON.stringify(sc.layers[0].vsplit)} `
      + '— without this, every row below would be asking about a scene that is fine');

    // ⚠ 5a AND 5b ARE TEXT-PRESENCE ROWS AND THEIR OLD NAMES SAID "ON SCREEN".
    // Measured by the overseer at landing, not argued: with the disclosure WELDED
    // SHUT (`display:'none'` unconditionally) this harness runs 43/45 and 5a, 5b
    // and 9d all PASS — the mechanism paints nothing and these rows cannot tell.
    // FIND_TEXT walks the DOM; `display:none` text is still there. The rows are
    // kept because presence is a real question a DELETED feature fails, but their
    // names now say what they assert. Paint is 5e/5g's job; the remedies' paint is
    // 5c/5d's, which is why a POSITIONAL cut is caught there and not here.
    hits = await c.json(FIND_TEXT(MECHANISM));
    check('5a', '⚠ DISCRIMINATING for PRESENCE, and it CANNOT see paint: the MECHANISM is in the rendered DOM (5e/5g own "is it painted")',
      hits.length >= 1,
      `${hits.length} element(s) render it. Paired with 4b (same session, same scene, `
      + 'one field changed), this is the pair a deleted feature cannot pass.');
    check('5b', '⚠ BOTH REMEDIES are in the rendered DOM — the engine offers two and they are different products (5c/5d own "are they painted")',
      (await c.json(FIND_TEXT(REMEDY_LOCK))).length >= 1
      && (await c.json(FIND_TEXT(REMEDY_HORIZ))).length >= 1,
      `lock=${(await c.json(FIND_TEXT(REMEDY_LOCK))).length} horiz=${(await c.json(FIND_TEXT(REMEDY_HORIZ))).length}. `
      + 'The one sentence Aurora had before row 80 offered only the lock.');
    // ⚠ RE-POINTED BY O15, and the reason is the whole of the packet's §4.
    // This row asks whether the author's OWN v_factor value reaches him. That
    // value lives in the DIAGNOSIS clause, and until O15 the mechanism leaf's
    // `textContent` happened to contain the diagnosis too, because the whole
    // advisory was ONE element. It is not any more — the mechanism leaf now
    // carries only the mechanism — so reading the value off the mechanism would
    // be reading it off the wrong half. `SCENE_IS_UNLOCKED` is parsed from the
    // provider with `${vf}` bound to what the fixture typed, so this is still
    // not a sentence typed in this file.
    const diag = await c.json(FIND_TEXT(SCENE_IS_UNLOCKED));
    check('5b2', 'the author\'s OWN v_factor value is in the sentence, not a generic prohibition',
      diag.length >= 1,
      `${diag.length} element(s) render "${SCENE_IS_UNLOCKED}". `
      + `(mechanism leaves seen: ${JSON.stringify(hits.map((h) => h.text.slice(0, 60)))})`);

    // ⚠ RE-POINTED BY O15. [5c]/[5d] are the "published but never painted" rows,
    // and after O15 the mechanism is DELIBERATELY not painted until asked for —
    // so aimed at the mechanism they would now be asserting the opposite of the
    // ruling. They are re-aimed at REMEDY_HORIZ: the LAST clause of the whole
    // advisory, the one a naive length-truncation would eat first, and one of
    // the two halves the ruling says must never need a click.
    const remedyHits = await c.json(FIND_TEXT(REMEDY_HORIZ));
    const hit = await c.json(HIT_AT(REMEDY_HORIZ));
    note(`AIM: dpr=${hit.dpr} rect=${JSON.stringify(hit.rect)} aim=(${hit.x},${hit.y}) `
      + `hit=<${hit.hitTag}>`);
    check('5c', '⚠ RENDERED AND NOT HIDDEN: elementFromPoint at the REMEDIES\' own centre lands INSIDE them',
      hit.found === true && hit.inside === true && hit.rect.width > 0 && hit.rect.height > 0,
      `inside=${hit.inside} hitTag=${hit.hitTag} hitText="${hit.hitText}". `
      + 'A display:none hint still has a textContent; this is what separates the two. '
      + 'Aimed at the LAST clause on purpose — it is what a positional truncation hides.');
    check('5d', 'and the browser agrees the remedies are visible (checkVisibility, opacity + CSS)',
      remedyHits.length >= 1 && remedyHits.every((h) => h.visible !== false),
      JSON.stringify(remedyHits.map((h) => ({ tag: h.tag, visible: h.visible }))));
    await shot(c, '5-unlocked-by-v_factor');

    // =====================================================================
    // 5e-5i. ⚠ THE O15 DISCLOSURE, AND THE VACUITY IT CREATES.
    //
    // Collapsing the mechanism makes every `textContent` row above go green
    // whether the mechanism can EVER be shown or not — [5a] and [5b] would pass
    // over a disclosure welded shut. These five rows are the ones that cannot,
    // and not one of them reads text as evidence. Each is a PAIR with another:
    //   [5e] hidden collapsed   × [5g] shown expanded  — an always-shown build
    //        fails 5e, an always-hidden build fails 5g, and NEITHER can pass both
    //        in one session through one click.
    //   [5g] shown after click  × [5h] hidden after a second click — a one-way
    //        toggle passes 5g and fails 5h.
    //   [5i] is the row the whole parcel is about: the block must actually be
    //        SHORTER collapsed. A disclosure that hides the text with `opacity`
    //        or `visibility` passes 5e's checkVisibility and fails this.
    // =====================================================================
    let mech = await c.json(MECH_STATE);
    const panelOf = (ms) => ms.filter((m) => m.hasDisclosure);
    const stripOf = (ms) => ms.filter((m) => !m.hasDisclosure);
    note('MECHANISM ELEMENTS, COLLAPSED (the artifact [5e] and [5j] judge):',
      JSON.stringify(mech));
    check('5e', '⚠ VACUITY CLOSED: collapsed, the panel\'s mechanism is in the DOM and PAINTS NOTHING',
      panelOf(mech).length === 2
      && panelOf(mech).every((m) => m.inText === true && m.visible === false && m.rects === 0
        && m.h === 0 && m.blockHitIsMechanism === false),
      `${panelOf(mech).length} mechanism element(s) inside a disclosure block `
      + '(want 2: the v_factor row and layer 0\'s card): '
      + `${JSON.stringify(panelOf(mech).map((m) => ({ visible: m.visible, rects: m.rects, h: m.h, hit: m.blockHitText })))}. `
      + 'inText proves textContent still carries it — which is exactly why no row here '
      + 'may use textContent. visible/rects/blockHit are the measurement.');
    check('5j', 'SCOPE HELD: the raster strip\'s own sentence is NOT converted and is still whole',
      stripOf(mech).length >= 1
      && stripOf(mech).every((m) => m.visible === true && m.rects >= 1 && m.h > 0),
      `${stripOf(mech).length} mechanism element(s) with no disclosure: `
      + `${JSON.stringify(stripOf(mech).map((m) => ({ visible: m.visible, h: m.h })))}. `
      + 'That is `canvas/raster-timeline.ts`\'s `splitRefusal`, in a different collapsible '
      + 'section — O15\'s scope names the v_factor row and the layer cards, and this row '
      + 'is what makes "scope held" a measurement instead of a sentence in a packet.');

    const toggles = await c.json(TOGGLES);
    note('DISCLOSURES ON SCREEN:', JSON.stringify(toggles));
    check('5f', 'one "' + WHY + '" disclosure per converted advisory, visible, aria-expanded=false',
      toggles.length === panelOf(mech).length && toggles.length === 2
      && toggles.every((t) => t.visible === true && t.expanded === 'false'
        && t.w > 0 && t.h > 0),
      `${toggles.length} disclosure(s) vs ${panelOf(mech).length} converted mechanism element(s). `
      + 'A mechanism with no control to open it is a deleted feature with a textContent.');

    const clicked = await c.json(CLICK_TOGGLE(0));
    note('CLICK on disclosure 0 (the v_factor row\'s):', JSON.stringify(clicked));
    check('5f2', 'ANTI-VACUOUS: the disclosure was hit-testable at its own centre and was clicked',
      clicked.ok === true && clicked.hit === true,
      `hit=${clicked.hit} hitTag=${clicked.hitTag} hitText="${clicked.hitText}" `
      + '— a button under something else is not a control an author can reach');
    await sleep(400);

    mech = await c.json(MECH_STATE);
    const openHit = await c.json(HIT_STRICT(MECHANISM, 0));
    note('MECHANISM ELEMENTS, DISCLOSURE 0 EXPANDED (the artifact [5g] judges):',
      `${JSON.stringify(mech)}\n        AIM (strict): ${JSON.stringify(openHit)}`);
    check('5g', '⚠ VACUITY CLOSED: expanded, the mechanism PAINTS and elementFromPoint lands INSIDE it',
      mech[0]?.hasDisclosure === true
      && mech[0].visible === true && mech[0].rects >= 1 && mech[0].h > 0
      && openHit.found === true && openHit.inside === true,
      `mech[0]={hasDisclosure:${mech[0]?.hasDisclosure}, visible:${mech[0]?.visible}, `
      + `rects:${mech[0]?.rects}, h:${mech[0]?.h}} `
      + `strict-hit inside=${openHit.inside} on <${openHit.hitTag}> "${openHit.hitText}". `
      + 'Paired with [5e], one session, one click apart — a build that always hides or '
      + 'always shows the mechanism cannot pass both.');
    check('5g2', 'and it is ONE disclosure, not all of them: layer 0\'s card stayed collapsed',
      mech[1]?.hasDisclosure === true && mech[1].visible === false && mech[1].rects === 0,
      `mech[1]={hasDisclosure:${mech[1]?.hasDisclosure}, visible:${mech[1]?.visible}, `
      + `rects:${mech[1]?.rects}}. `
      + 'Every advisory owning its own state is what stops one click reflowing the panel.');

    // [5i] — THE SHAPE, MEASURED, which is the row this whole parcel exists for.
    const openBlockH = mech[0].blockH;
    note('ADVISORY BLOCK HEIGHTS (px, off getBoundingClientRect):',
      `v_factor row, EXPANDED = ${openBlockH}px; layer 0's card, still collapsed in the `
      + `same frame = ${mech[1].blockH}px (a different sentence, printed for context only — `
      + '[5i] compares ONE block against ITSELF in two states)');
    await shot(c, '5g-mechanism-expanded');
    const reclosed = await c.json(CLICK_TOGGLE(0));
    await sleep(400);
    mech = await c.json(MECH_STATE);
    check('5h', '⚠ THE TOGGLE GOES BOTH WAYS: a second click hides the mechanism again',
      reclosed.ok === true
      && panelOf(mech).length === 2
      && panelOf(mech).every((m) => m.visible === false && m.rects === 0),
      'after re-click: '
      + `${JSON.stringify(panelOf(mech).map((m) => ({ visible: m.visible, rects: m.rects })))}. `
      + 'A one-way disclosure passes [5g] and fails here.');
    const shutBlockH = mech[0].blockH;
    check('5i', '⚠ THE SHAPE: the advisory block is materially SHORTER collapsed than expanded',
      typeof openBlockH === 'number' && typeof shutBlockH === 'number'
      && openBlockH > 0 && shutBlockH > 0 && shutBlockH <= openBlockH * 0.6,
      `collapsed=${shutBlockH}px expanded=${openBlockH}px `
      + `(ratio ${(shutBlockH / openBlockH).toFixed(2)}, want <= 0.60). `
      + 'This is the row O15 is about. Measured under a planted `visibility: hidden` '
      + '(instead of `display: none`) it read 388/388 — the text was invisible and the '
      + 'form was still buried, which is the ruling defeated by a fix that looks right.');

    // =====================================================================
    // 6. THE SCENE SENTENCE NAMES WHICH LAYERS — the fact route A destroys.
    // =====================================================================
    const NAMES_L0 = 'layer 0 authors a Plane B split';
    check('6a', 'the v_factor route names WHICH layer is now illegal (it never touched one)',
      (await c.json(FIND_TEXT(NAMES_L0))).length >= 1,
      `looking for "${NAMES_L0}" on screen`);
    // Give layer 1 a split too, so the plural arm is exercised on screen.
    await setField('6b0', 'the layer card offers a Plane B split control on layer 1', vsplitSel(1), 'at');
    await sleep(700);
    const NAMES_BOTH = 'layers 0, 1 author Plane B splits';
    check('6b', 'with two splits it names both, in order',
      (await c.json(FIND_TEXT(NAMES_BOTH))).length >= 1,
      `looking for "${NAMES_BOTH}" on screen`);

    // =====================================================================
    // 7. TWO PLACES, MEASURED BY DOM ORDER — not by the app's own word.
    // =====================================================================
    const LAYER_SUBJECT = 'this layer authors a Plane B split while';
    const order = await c.json(DOM_ORDER(NAMES_BOTH));
    check('7a', 'the SCENE sentence sits between the v_factor spinner and the layer cards',
      order.found === true && order.afterVFactor === true && order.beforeLayer0 === true,
      JSON.stringify(order));
    const orderL = await c.json(DOM_ORDER(LAYER_SUBJECT));
    check('7b', 'the LAYER sentence sits on a layer card, below layer 0\'s split control',
      orderL.found === true && orderL.beforeLayer0 === false,
      JSON.stringify(orderL));
    const layerHits = await c.json(FIND_TEXT(LAYER_SUBJECT));
    check('7c', 'ANTI-VACUOUS: there are TWO layer sentences, one per split layer',
      layerHits.length === 2,
      `${layerHits.length} element(s). Both layers carry a split now, so both cards speak.`);
    // ⚠ SCROLL THE SUBJECT INTO VIEW BEFORE THE SHOT, EXPLICITLY.
    //
    // This is the frame O15's before/after pair is cropped from, and until now
    // WHERE the effects column happened to be scrolled was a side effect of
    // whichever probe had last called `scrollIntoView` — [5c]'s aim, before O15;
    // [5i]'s block walk, after it. That silently re-aimed the capture at the
    // raster strip and would have made the two halves of the pair pictures of
    // different things. The v_factor spinner is the anchor: it is the control
    // the advisory hangs off and it is at the top of the crop in the committed
    // before shot (`scratchpad/shots-o15/before-1920x1080-panel.png`).
    await c.evalExpr(String.raw`
      (() => { const e = ${vfField}; if (e) e.scrollIntoView({ block: 'center' }); return 'ok'; })()`);
    await sleep(300);
    await shot(c, '7-two-sentences');

    // =====================================================================
    // 8. ⚠ ADVISORY, NOT PREVENTION — this parcel is not allowed to clamp.
    // =====================================================================
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('8a', 'the DOCUMENT still holds the illegal combination, unrewritten (ROADMAP rows 37/58)',
      sc.v_factor === UNLOCKED_VF
      && sc.layers[0].vsplit !== undefined && sc.layers[1].vsplit !== undefined,
      `v_factor=${sc.v_factor} splits=${JSON.stringify(sc.layers.map((l) => l.vsplit))} `
      + '— an advisory that silently fixed the document would pass every text row above');
    const vfVal = await c.evalExpr(`(${vfField}).value`);
    check('8b', 'and the v_factor spinner still SHOWS the value the author typed',
      Number(vfVal) === UNLOCKED_VF, `spinner reads ${JSON.stringify(vfVal)}`);

    // =====================================================================
    // 9. ⚠ THE DISCRIMINATING SECTION, ROUTE B: the reverse gesture.
    //    Re-lock -> silence returns. Then unlock with NO split -> still
    //    silent. Then add the split -> the LAYER sentence appears.
    // =====================================================================
    await setField('9a0', 'the v_factor spinner took the lock sentinel back', vfField, LOCK);
    await sleep(700);
    check('9a', '⚠ DISCRIMINATING: re-locking the plane CLEARS the sentence — it is not permanent chrome',
      (await c.json(FIND_TEXT(MECHANISM))).length === 0,
      'if this row is red the section-5 pass means "some text is always there"');
    await setField('9b0', 'layer 0\'s split turned back off', vsplitSel(0), 'none');
    await setField('9b1', 'layer 1\'s split turned back off', vsplitSel(1), 'none');
    await setField('9b2', 'the v_factor spinner unlocked again, with NO split anywhere', vfField, UNLOCKED_VF);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('9b', '⚠ DISCRIMINATING (the other silence): unlocked with NO split is a LEGAL scene and says nothing',
      sc.v_factor === UNLOCKED_VF
      && sc.layers.every((l) => l.vsplit === undefined || l.vsplit === 'none')
      && (await c.json(FIND_TEXT(MECHANISM))).length === 0,
      `v_factor=${sc.v_factor} splits=${JSON.stringify(sc.layers.map((l) => l.vsplit))}. `
      + 'A build that keyed only on v_factor would shout at every camera-tracked scene in the game.');
    await setField('9c0', 'layer 1\'s split turned on, on the already-unlocked scene', vsplitSel(1), 'at');
    await sleep(700);
    hits = await c.json(FIND_TEXT(LAYER_SUBJECT));
    check('9c', '⚠ DISCRIMINATING: turning the SPLIT on (route B) makes the layer card speak',
      hits.length === 1,
      `${hits.length} sentence(s); expected exactly one, on layer 1's card. `
      + 'Routes A and B are different gestures and this is the one the layer card owns.');
    // ⚠ RE-POINTED BY O15. This used to read the leaf's own text, which worked
    // only because the whole advisory was ONE element. It is four siblings now,
    // so the leaf carrying LAYER_SUBJECT is the diagnosis alone. The subject of
    // the row is unchanged — "the layer card states one rule, not a shorter one"
    // — and it is asked of the BLOCK. It stays a textContent row on purpose:
    // "the words are all in this block" is a text question. Whether the author
    // can SEE them is [9e]'s, and that one never touches text.
    const block = await c.json(BLOCK_TEXT(LAYER_SUBJECT));
    check('9d', 'and it carries the mechanism and BOTH remedies, same as route A — one rule, not two',
      hits.length === 1 && block.found === true && block.text.includes(MECHANISM)
      && block.text.includes(REMEDY_LOCK) && block.text.includes(REMEDY_HORIZ),
      `block text="${block.text?.slice(0, 140)}…"`);
    // ⚠ AND [9d] IS EXACTLY THE ROW THE PACKET'S §4 WARNS ABOUT — it would pass
    // over a mechanism welded shut. [9e] is its keeper, on the second surface:
    // section 5 proved the disclosure on the v_factor row, this proves the LAYER
    // CARD got the same treatment rather than one of the two being converted.
    const mech9 = await c.json(MECH_STATE);
    const rem9 = await c.json(HIT_STRICT(REMEDY_HORIZ, 1));
    const tog9 = await c.json(TOGGLES);
    note('LAYER CARD, ROUTE B (the artifact [9e] judges):',
      `mechanisms=${JSON.stringify(mech9)}\n        disclosures=${JSON.stringify(tog9)}`
      + `\n        remedies strict-hit=${JSON.stringify(rem9)}`);
    check('9e', '⚠ VACUITY CLOSED on the SECOND surface: the layer card hides the mechanism '
      + 'and paints the remedies',
      mech9.filter((m) => m.hasDisclosure).length === 2
      && mech9[1]?.hasDisclosure === true
      && mech9[1].visible === false && mech9[1].rects === 0
      && tog9.length === 2 && tog9[1].visible === true && tog9[1].expanded === 'false'
      && rem9.found === true && rem9.inside === true,
      `layer-card mechanism={visible:${mech9[1]?.visible}, rects:${mech9[1]?.rects}} `
      + `disclosure={visible:${tog9[1]?.visible}, expanded:${tog9[1]?.expanded}} `
      + `remedies strict-hit inside=${rem9.inside} on <${rem9.hitTag}>. `
      + 'Text cannot tell these two states apart, which is why none of this reads text.');
    await shot(c, '9-route-b-layer-card');

    // ---- 10. Leave the tree as found. ------------------------------------
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(400);
    };
    let undos = 0;
    for (let i = 0; i < 80; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo();
      undos++;
    }
    const scenesEnd = await c.json('window.__dbg.aeon.scenes()');
    check('10a', 'the whole session undoes back to the fixture — nothing was saved',
      undos > 0 && JSON.stringify(scenesEnd.map((s) => s.id)) === JSON.stringify(scenes0.map((s) => s.id)),
      `${undos} undos; left ${JSON.stringify(scenesEnd.map((s) => s.id))}, `
      + `found ${JSON.stringify(scenes0.map((s) => s.id))}`);
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  console.log(
    '\nROWS THAT DO NOT DISCRIMINATE, named so nobody counts them twice:\n'
    + '  [0y] [0a] [1a] [2a] [3a0] [3a1] [3a2] [3b] [4a0] [4a] [5a0] [5a1] [5f2] [6b0] [9a0]\n'
    + '  [9b0] [9b1] [9b2] [9c0] [10a] — setup and anti-vacuous rows. They prove the instrument\n'
    + '      built and saw its subject; none can fail for the ADVISORY being wrong.\n'
    + '  [8b] — reads a spinner back. It would go red only if something clamped v_factor,\n'
    + '      which this parcel is forbidden from doing; it guards a non-goal.\n'
    + 'THE DISCRIMINATING ROWS: [4b] [5a] [5b] [5b2] [5c] [5d] [5e] [5f] [5g] [5g2] [5h] [5i]\n'
    + '  [5j] [6a] [6b] [7a] [7b] [7c] [8a] [9a] [9b] [9c] [9d] [9e].\n'
    + '  [4b]+[5a] are the PAIR: one scene, one field changed, silent then speaking. Neither\n'
    + '      alone discriminates — [4b] alone is what a DELETED feature returns, [5a] alone is\n'
    + '      what an ALWAYS-ON hint returns.\n'
    + '  [9a]+[9b] are the two silences a broken build cannot both produce: re-locking with a\n'
    + '      split, and unlocking without one.\n'
    + '  [5c] is the one a published-but-unpainted sentence cannot survive — and since O15\n'
    + '      it is aimed at the LAST clause, so a positional truncation cannot survive it\n'
    + '      either.\n'
    + '  [5b] is the one an advisory offering a single remedy cannot survive.\n'
    + '  [7a]/[7b] are the ones a single sentence rendered in one place cannot survive.\n'
    + '  [5e]+[5g] are the O15 PAIR — collapsed hides the mechanism, one click shows it,\n'
    + '      one session. An always-hidden build fails [5g]; an always-shown one fails\n'
    + '      [5e]; a one-way toggle fails [5h]; a hide-by-opacity fails [5i]; converting\n'
    + '      only the v_factor row and not the layer card fails [9e]. NONE of them reads\n'
    + '      textContent, because textContent cannot tell those states apart at all.\n'
    + '  [5i] is the row the O15 ruling is FOR: the block must actually be shorter.\n'
    + '  [5j] is the SCOPE row: the raster strip composes the same clauses and O15 does not\n'
    + '      touch it, so it must still be there, whole, and WITHOUT a disclosure. It is\n'
    + '      also the row that keeps the alternative-green-path note below honest.\n'
    + '\n'
    + '⚠ THE ALTERNATIVE GREEN PATH, RULED OUT AND NAMED — measured, not reasoned.\n'
    + '  The 5-series asks "is the sentence ON SCREEN", and there are THREE surfaces that\n'
    + '  could put it there, because `splitRefusal` on the raster timeline strip composes the\n'
    + '  same clauses. So 5a-5d can go green on the STRIP alone, with the panel still silent —\n'
    + '  which is very nearly the original defect. This was verified by running this harness\n'
    + '  against a build carrying origin/master\'s EffectsScenePanel.tsx and this branch\'s\n'
    + '  provider: 29/36, with [6a] [6b] [7a] [7b] [7c] [9c] [9d] RED and [5a] [5b] [5c] [5d]\n'
    + '  still GREEN off the strip.\n'
    + '  THE ROWS THAT ARE ABOUT THE PANEL ARE THEREFORE: [6a] [6b] (the scene sentence names\n'
    + '  which layers — only the v_factor row can), [7a] [7b] [7c] (DOM ORDER pins one\n'
    + '  sentence between the v_factor spinner and the cards, and one per card), and\n'
    + '  [9c] [9d] (route B: the layer card speaks when the split is turned on).');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
