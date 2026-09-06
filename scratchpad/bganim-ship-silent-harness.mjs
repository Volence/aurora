#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// bganim-ship-silent — the `default_off` switch and the twin disclosure, ON SCREEN
// ═══════════════════════════════════════════════════════════════════════════
//
//     VITE_AURORA_DEBUG=1 npm run build
//     node scratchpad/bganim-ship-silent-harness.mjs
//
// ═══ WHY A HARNESS AND NOT A TEST ═══
//
// Both halves of this parcel are a `.tsx` change. `vitest run` cannot see React
// at all in this repo, so the provider is unit-tested to the hilt and the
// question "is any of it on screen" has no instrument in the suite. Everything
// below is a claim about the PANEL: that the switch renders, that it renders in
// the band card rather than beside the preview controls, that its copy leads
// with the release-shape fact, and that the twin disclosure appears above BOTH
// creation doors on aeon's own document.
//
// ⚠ WHY IT IS ITS OWN FILE AND NOT ROWS IN bganim-band-harness.mjs. That
// harness is BLIND at HEAD and this parcel did not repair it: it opens sections
// by title, and both titles it names were renamed by the vocabulary sweep —
// `BG animation bands` is `Tile animations (n/m)` and `New band` is
// `New tile animation`. `OPEN_BAND_LIST` therefore returns 'no-section' and
// `OPEN_NEW_BAND` makes the run THROW at its own guard, so nothing after row 2a
// is measured. Repairing it would make dozens of rows execute for the first
// time in weeks against strings that also moved, which is a parcel of its own
// and not this one. THE BLINDNESS IS REPORTED, NOT INHERITED.
//
// ⚠ AND IT IS DELIBERATELY SMALL. It measures the two things this parcel put on
// screen and nothing else. Rows about budgets, undo arcs and the no-clock
// property live in the harness above and are not restated here — a second copy
// of a claim is a second thing to keep true.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no `saveAeonProject`. The last row
// hashes the aeon document before and after to say so. It DOES dirty the store
// (it flips the switch and undoes it), which is why the run ends by reloading.
//
// EXPECTATIONS COME FROM THE VENDORED CONTRACT. The one period a silenced band
// may have is read out of `bganim-consumer-contract.json`, never typed, so this
// file cannot hold a number the contract-currency gate would have caught.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9398);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const OVERRIDE_FILE = `${AEONDIR}/games/sonic4/data/editor_bg_override.json`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-ship-silent`;
mkdirSync(SHOTS, { recursive: true });

const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const PERIOD_PX = CONTRACT.constants.BGANIM_VIEW_DERIVED_PERIOD_PX.value;
const VIEW_COUNT = CONTRACT.constants.BGANIM_VIEW_COUNT.value;

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

// ═══ OPENING A COLLAPSED SECTION, BY THE TITLE IT HAS TODAY ═══
// A collapsed CollapsibleSection renders NO children, so every control below it
// comes back `null` and reads as "the control is missing". Both sections this
// parcel touches arrive collapsed.
//
// ⚠ THE TITLE IS A PREFIX MATCH AND THE FALLBACK IS LOUD. The blindness in the
// harness next door is exactly this line with a title that moved, reported as
// 'no-section' into a caller that did not check. Every call site here checks.
const OPEN_SECTION = (re) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

/** Every section header on screen, so a 'no-section' can say what WAS there. */
const HEADERS = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  return [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => (h.firstElementChild.textContent || '').trim());
})()`;

/**
 * THE SWITCH, READ OFF SCREEN, WITH ITS POSITION.
 *
 * Not just "a select exists": the parcel's first constraint is that this must
 * NOT read as a view control, and position is what carries that. So this
 * reports which card the select sits in and which controls share that card —
 * `Demote` and `Remove` are the document-changing controls, and the switch
 * being in their block is the claim.
 */
const READ_SWITCH = String.raw`
(() => {
  const sel = [...document.querySelectorAll('select')]
    .find((s) => [...s.options].some((o) => /ships silent/.test(o.textContent || '')));
  // THE MISSING CASE CARRIES THE SAME KEYS. Returning only a found flag made the
  // rows below read cardText.includes(...) on undefined, so the harness THREW at
  // row 3e and took sections 4, 5, 6 and 7 with it - a crash instead of a
  // report, which is the failure the harness next door records in its own
  // header. Found by planting the switch out of the panel. (No backticks in
  // this comment on purpose: it lives inside a String.raw template.)
  if (!sel) return { found: false, options: [], value: null, selectTitle: '',
    inCardWithDemote: false, cardControls: [], cardLabels: [], cardText: '' };
  // The card is the nearest ancestor that also holds the Demote button.
  let card = sel.parentElement, siblings = [];
  for (let i = 0; i < 8 && card; i++) {
    const btns = [...card.querySelectorAll('button')]
      .map((b) => ((b.getAttribute('aria-label') || b.textContent || '').trim()));
    if (btns.some((t) => /^Demote/.test(t))) { siblings = btns; break; }
    card = card.parentElement;
  }
  const labels = [...(card ? card.querySelectorAll('span') : [])]
    .map((e) => (e.textContent || '').trim()).filter(Boolean);
  return {
    found: true,
    value: sel.value,
    options: [...sel.options].map((o) => ({
      v: o.value, text: (o.textContent || '').trim(), disabled: !!o.disabled,
      title: (o.title || '').slice(0, 400),
    })),
    selectTitle: (sel.title || '').replace(/\s+/g, ' ').slice(0, 600),
    inCardWithDemote: siblings.length > 0,
    cardControls: siblings,
    cardLabels: labels.slice(0, 12),
    // The hint block under the card, which is where the lead sentence renders.
    cardText: (card ? (card.textContent || '') : '').replace(/\s+/g, ' ').slice(0, 1200),
  };
})()`;

/**
 * THE PLAYBACK CONTROL AND THE SWITCH ARE IN DIFFERENT BOXES.
 *
 * ⚠ THE FIRST VERSION OF THIS ROW WAS A BAD INSTRUMENT AND SAID SO BY FAILING.
 * It found the playback chip, walked FOUR parents up calling that "the preview
 * strip", and asked whether the strip contained the switch. Four parents up
 * from anything in this column is the whole section body, so it contained the
 * band card too and reported the switch as a preview control. The code was
 * right and the measurement was wrong.
 *
 * WHAT IT ASKS NOW is the same claim without the guessed boundary: the BAND
 * CARD (found by the Demote button, exactly as row 3b finds it) must NOT
 * contain the playback chip, and the chip must come BEFORE the card in document
 * order — which is what "the preview controls are the strip above the list"
 * means to a person reading the column top to bottom. Neither half needs anyone
 * to guess how many parents a strip is.
 */
const PREVIEW_CONTROLS = String.raw`
(() => {
  const sel = [...document.querySelectorAll('select')]
    .find((s) => [...s.options].some((o) => /ships silent/.test(o.textContent || '')));
  const chip = [...document.querySelectorAll('button')]
    .find((b) => /^(Play|Pause|Stop)\b/.test(((b.textContent || '')).trim()));
  if (!chip || !sel) return { chip: !!chip, sel: !!sel };
  let card = sel.parentElement;
  for (let i = 0; i < 8 && card; i++) {
    const btns = [...card.querySelectorAll('button')]
      .map((b) => ((b.getAttribute('aria-label') || b.textContent || '').trim()));
    if (btns.some((t) => /^Demote/.test(t))) break;
    card = card.parentElement;
  }
  if (!card) return { chip: true, sel: true, card: false };
  return {
    chip: true, sel: true, card: true,
    chipText: (chip.textContent || '').trim(),
    cardHoldsThePlaybackChip: card.contains(chip),
    playbackChipComesFirst: !!(chip.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
})()`;

/** All warning-toned hint text in the New-tile-animation section, joined. */
const CREATION_SECTION_TEXT = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => /^New tile animation/.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return { found: false };
  const body = hdr.parentElement.parentElement;
  const promote = [...body.querySelectorAll('button')]
    .find((b) => /^Promote$/.test(((b.textContent || '')).trim()));
  const add = [...body.querySelectorAll('button')]
    .find((b) => /^Add$/.test(((b.textContent || '')).trim()));
  return {
    found: true,
    text: (body.textContent || '').replace(/\s+/g, ' '),
    promote: promote ? { disabled: !!promote.disabled, title: (promote.title || '').slice(0, 500) } : null,
    add: add ? { disabled: !!add.disabled, title: (add.title || '').slice(0, 500) } : null,
    // THE DISCLOSURE MUST COME BEFORE BOTH DOORS in document order, which is
    // what "above both" means to a reader scrolling the column.
    disclosureBeforePromote: (() => {
      const nodes = [...body.querySelectorAll('*')];
      const disc = nodes.find((n) => /SILENCED IN THE ROM/.test(n.textContent || '')
        && ![...n.children].some((c) => /SILENCED IN THE ROM/.test(c.textContent || '')));
      if (!disc || !promote) return null;
      return !!(disc.compareDocumentPosition(promote) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
  };
})()`;

const SET_SELECT = (value) => String.raw`
(() => {
  const el = [...document.querySelectorAll('select')]
    .find((s) => [...s.options].some((o) => /ships silent/.test(o.textContent || '')));
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-bganim-ship-silent/${name}.png`);
}

const fileHash = () => (existsSync(OVERRIDE_FILE)
  ? createHash('sha256').update(readFileSync(OVERRIDE_FILE)).digest('hex') : 'absent');

async function main() {
  console.log(`\nDERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BGANIM_VIEW_DERIVED_PERIOD_PX = ${PERIOD_PX}   BGANIM_VIEW_COUNT = ${VIEW_COUNT}\n`);

  const hashBefore = fileHash();
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
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
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg - nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. The real aeon document. -------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open', !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open - nothing below can be measured');

    const bands0 = await c.json('window.__dbg.aeon.bands()');
    // ⚠ THE PERIOD IS NOT IN THIS HOOK. `__dbg.aeon.bands()` reports geometry,
    // driver and rate and no `patternPx`, so the period half of "the one shape
    // this parcel is about" is checked where a person reads it instead - on the
    // card, in row 3e. Saying so here rather than quietly checking the half
    // that was available: a row that measures less than its name claims is the
    // failure this whole file exists to catch.
    check('1b', 'the document aeon ships carries EXACTLY ONE tile animation '
      + '(the period half is row 3e, on screen)',
      Array.isArray(bands0) && bands0.length === 1,
      JSON.stringify(bands0));

    // ---- 2. Reach the panel. --------------------------------------------
    await sleep(2000);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true,
      `clicked=${JSON.stringify(clicked)}`);
    await sleep(1200);

    // ⚠ AND THE TILE-ANIMATION EDITOR IS ON ITS OWN SUB-TAB. The Effects facet
    // arrives on `Parallax`; `aeon.bganim.bands` is rendered only by the
    // `Tile anim` tab (providers/effects-sub-tabs), and a section on an
    // INACTIVE sub-tab is not mounted at all - not collapsed, ABSENT. Measured
    // on the first run of this file: the section walk came back with the five
    // Parallax headers and no band section, which is exactly what "the panel is
    // broken" looks like from outside.
    const tabbed = await c.evalExpr(clickByText('/^Tile anim$/'));
    check('2a2', 'the Effects facet offers a `Tile anim` sub-tab, and it was clicked '
      + '[instrument check]', tabbed === true, `clicked=${JSON.stringify(tabbed)}`);
    await sleep(1200);

    // ⚠ EVERY SECTION OPEN IS CHECKED, because 'no-section' is the exact
    // failure the harness next door reports and swallows.
    const openedBands = await c.evalExpr(OPEN_SECTION('/^Tile animations/'));
    const headers = await c.json(HEADERS);
    check('2b', 'the `Tile animations` section is on screen and open [instrument check]',
      openedBands === 'clicked' || openedBands === 'already-open',
      `open=${openedBands}; headers on screen: ${JSON.stringify(headers)}`);
    if (openedBands === 'no-section') throw new Error('no Tile animations section - nothing below can be measured');
    await sleep(700);

    // ---- 3. THE SWITCH IS ON SCREEN, AND WHERE. -------------------------
    const sw = await c.json(READ_SWITCH);
    check('3a', 'the ship-silent switch renders as a two-option picker on the band card',
      sw.found === true && sw.options.length === 2
      && sw.options.some((o) => /ships animating/.test(o.text))
      && sw.options.some((o) => /ships silent/.test(o.text)),
      JSON.stringify(sw.options));

    // THE PARCEL'S FIRST CONSTRAINT, MEASURED AS POSITION.
    check('3b', 'it sits in the card whose other controls are Demote and Remove - the '
      + 'document-changing block, not a readout',
      sw.inCardWithDemote === true
      && sw.cardControls.some((t) => /^Demote/.test(t))
      && sw.cardControls.some((t) => /^Remove/.test(t)),
      `controls in that card: ${JSON.stringify(sw.cardControls)}`);

    const prev = await c.json(PREVIEW_CONTROLS);
    check('3c', 'the playback control is in a DIFFERENT box, above the list '
      + '[the "must not read as a view control" claim, as a position]',
      prev.chip === true && prev.card === true
      && prev.cardHoldsThePlaybackChip === false && prev.playbackChipComesFirst === true,
      JSON.stringify(prev));

    check('3d', 'the document aeon ships arrives SILENCED, and the picker says so',
      sw.value === 'silent',
      `select value=${JSON.stringify(sw.value)}`);

    // THE PERIOD HALF OF ROW 1b, where a person actually reads it. Derived from
    // the vendored contract, so this cannot pass against a stale number.
    check('3e', `the silenced tile animation's period is the ${PERIOD_PX}px one the twins `
      + 'were derived against, and the card prints it',
      sw.cardText.includes(`${PERIOD_PX}px pattern`),
      `card text: ${JSON.stringify(sw.cardText.slice(0, 200))}`);

    // ---- 4. THE COPY, IN aeon's ORDER. ----------------------------------
    check('4a', 'the card leads with the release-shape fact: "RELEASE INCLUDED" is on screen',
      /RELEASE INCLUDED/.test(sw.cardText),
      `card text: ${JSON.stringify(sw.cardText.slice(0, 300))}`);
    check('4b', 'and it refuses the preview reading in words as well as in position',
      /not what you see here/i.test(sw.cardText));
    check('4c', 'the picker\'s own tooltip carries BOTH quantifiers and the derived period',
      /PER ACT/.test(sw.selectTitle) && /PER TILE ANIMATION/.test(sw.selectTitle)
      && sw.selectTitle.includes(`${PERIOD_PX}px`),
      JSON.stringify(sw.selectTitle));
    check('4d', `the exchange sentence names the ${VIEW_COUNT} debug twins`,
      sw.cardText.includes(String(VIEW_COUNT)) && /debug ROM/i.test(sw.cardText));
    await shot(c, '1-switch-on-the-band-card');

    // ---- 5. THE DISCLOSURE, ABOVE BOTH DOORS. ---------------------------
    const openedNew = await c.evalExpr(OPEN_SECTION('/^New tile animation/'));
    check('5a', 'the `New tile animation` section is on screen and open [instrument check]',
      openedNew === 'clicked' || openedNew === 'already-open',
      `open=${openedNew}; headers: ${JSON.stringify(await c.json(HEADERS))}`);
    await sleep(700);
    const create = await c.json(CREATION_SECTION_TEXT);
    check('5b', 'the twin disclosure is on screen in the creation section',
      create.found === true && /SILENCED IN THE ROM/.test(create.text)
      && /the build refuses a SECOND one/.test(create.text),
      create.found ? JSON.stringify(create.text.slice(0, 400)) : 'section not found');
    check('5c', 'it comes BEFORE the Promote control in document order',
      create.disclosureBeforePromote === true,
      `disclosureBeforePromote=${create.disclosureBeforePromote}`);
    check('5d', 'and it is telling the truth: BOTH doors are refused, with aeon\'s own reason',
      !!create.promote && create.promote.disabled === true
      && !!create.add && create.add.disabled === true
      && /EXACTLY ONE tile animation/.test(create.promote.title)
      && /EXACTLY ONE tile animation/.test(create.add.title),
      JSON.stringify({ promote: create.promote, add: create.add }));
    // ⚠ AND IS IT ACTUALLY PAINTED. Everything above is a DOM claim; the effects
    // column SCROLLS, and a `textContent` match is just as green for a node
    // 2,000px below the fold. So the disclosure is scrolled into its scroller
    // and its rect is compared to THE SCROLLER'S BOX — not to
    // `checkVisibility()` or `getClientRects()`, both of which go green on an
    // element scrolled clean out of view. The screenshot is taken after the
    // scroll so it shows the thing the rows above are about.
    const painted = await c.json(String.raw`
      (() => {
        const nodes = [...document.querySelectorAll('*')];
        const disc = nodes.find((n) => /SILENCED IN THE ROM/.test(n.textContent || '')
          && ![...n.children].some((c) => /SILENCED IN THE ROM/.test(c.textContent || '')));
        if (!disc) return { found: false };
        disc.scrollIntoView({ block: 'center' });
        let sc = disc.parentElement;
        while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
        const r = disc.getBoundingClientRect();
        const b = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        return {
          found: true, scroller: !!sc,
          rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
          box: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
          insideTheScrollersBox: r.height > 0 && r.bottom > b.top && r.top < b.bottom,
        };
      })()`);
    check('5e', 'and it is INSIDE its scroller\'s box after being scrolled to, not merely in '
      + 'the DOM [rect vs the SCROLLER, never checkVisibility]',
      painted.found === true && painted.insideTheScrollersBox === true,
      JSON.stringify(painted));
    await sleep(400);
    await shot(c, '2-disclosure-above-both-doors');

    // ---- 6. THE SWITCH ACTUALLY MOVES THE DOCUMENT, AND UNDOES. ---------
    // ⚠ THE ANTI-VACUOUS HALF IS 6c. A gesture the app ignores no-ops silently
    // and every reading after it comes off the previous screen, so "the value
    // came back" is free unless the document is shown to have MOVED.
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const set = await c.evalExpr(SET_SELECT(''));
    check('6a', 'the picker accepts a change to "ships animating" [instrument check]',
      set === 'ok', `set=${set}`);
    await sleep(900);
    const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const sw2 = await c.json(READ_SWITCH);
    check('6b', 'the document MOVED and the panel followed it',
      hash1 !== hash0 && sw2.value === '',
      `hash ${String(hash0).slice(0, 12)} -> ${String(hash1).slice(0, 12)}; value=${JSON.stringify(sw2.value)}`);
    check('6c', 'and the disclosure came DOWN with it, because no tile animation is silenced now '
      + '[the sentence is conditional, not decoration]',
      !/SILENCED IN THE ROM/.test((await c.json(CREATION_SECTION_TEXT)).text || ''));
    check('6d', 'the second door OPENED: with nothing silenced, the build would take another '
      + 'tile animation and the panel now offers one',
      (await c.json(CREATION_SECTION_TEXT)).promote?.disabled === false,
      JSON.stringify((await c.json(CREATION_SECTION_TEXT)).promote));

    await c.evalExpr('window.__dbg.aeon.undo ? window.__dbg.aeon.undo() : null').catch(() => {});
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90,
    }).catch(() => {});
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp', modifiers: 2, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90,
    }).catch(() => {});
    await sleep(900);
    const hash2 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('6e', 'ONE undo puts the document back byte for byte',
      hash2 === hash0,
      `base=${String(hash0).slice(0, 12)} moved=${String(hash1).slice(0, 12)} undone=${String(hash2).slice(0, 12)}`);

    // ---- 7. Nothing was written. ----------------------------------------
    const hashAfter = fileHash();
    check('7a', 'the aeon tree\'s editor_bg_override.json is untouched [harness property, not a finding]',
      hashAfter === hashBefore, `${hashBefore.slice(0, 12)} -> ${hashAfter.slice(0, 12)}`);

    await c.send('Page.reload').catch(() => {});
  } finally {
    if (c) c.close();
    await killTree(child);
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
  if (fails.length) {
    console.log('FAILURES:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
