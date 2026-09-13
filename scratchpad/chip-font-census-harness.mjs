#!/usr/bin/env node
// CHIP FONT CENSUS: how many chips paint 11px and how many paint 13px, counted
// two ways, and whether each one paints the size the primitive declares.
//
// WHY IT EXISTS. Owner ruling d-36-chip-font-size-answered, verbatim,
// 2026-09-13T22:06:54Z: "what's there more of, things at 13 font orr 11? go
// with whatever there's more of." A rule, not a size. This file is the count
// the rule asks for, kept so it can be taken again rather than quoted.
//
// ═══ THE POPULATION ═══
// A CHIP is an element rendered BY the `Chip` primitive
// (src/renderer/components/ui/primitives.tsx), and nothing else. Identified in
// the live DOM by React's own fiber: a <button> or <span> whose parent fiber's
// component is the function named `Chip`. That is a check a reader can repeat,
// and it cannot be fooled by a lookalike style.
//
// HAND-ROLLED LOOKALIKES ARE COUNTED BUT DO NOT VOTE. Elements whose inline
// style is `display: inline-flex` plus `white-space: nowrap` (the fingerprint
// row 4b of chunk-links-harness.mjs used) and that the `Chip` primitive did NOT
// render are listed separately. They do not vote because the ruling decides
// what the PRIMITIVE declares: no size the primitive picks reaches them, so
// counting them would let elements the decision cannot move choose the
// decision.
//
// ═══ TWO COUNTS, TWO UNITS ═══
//   (b) CALL SITES, from source, with the TypeScript parser: every `<Chip`
//       JSX element under src/ (tests excluded), classed by its `onClick`:
//         interactive  onClick always given       -> the <button> branch
//         static       no onClick                 -> the <span> branch
//         conditional  onClick={x ? fn : undefined} -> either, by state
//       and flagged when it sits inside a `.map(`, where one site is many
//       chips at run time. Unit: JSX elements in source.
//   (a) RENDERED CHIPS, in the running app, over CDP: on every SCREEN this run
//       reaches (a facet, a sub-tab, an armed tool; listed in the output), each
//       VISIBLE chip's getComputedStyle().fontSize. Two units, both printed:
//         distinct chips   deduplicated by (owning component, text, element);
//                          the header's Undo seen on nine screens is ONE
//         chip-screens     every (screen, chip) pair; that Undo is nine
//       The first is the one to decide on. The second is printed because the
//       header's four or five chips sit on every level screen and dominate it.
//
// LOUD ON UNMEASURABLE. A part this run could not open is NOT MEASURED, printed
// with the call sites that live only there, never counted as zero chips. A
// screen on which the fiber walk finds no chip at all where the level header
// guarantees some fails its part's anti-vacuous row.
//
// ═══ THE ROWS (what can go red) ═══
//   S0    the static census found `<Chip` sites, and every file using one
//         imports it from the ui barrel (so the parser counted the primitive).
//   S1    THE MECHANISM, FROM SOURCE: inside `function Chip`, every `fontSize`
//         names ONE token, and no style object carries the `font` shorthand
//         (a shorthand written after a longhand erases it; that is how the
//         button branch painted 13 under a declared 11).
//   <P>.0 ANTI-VACUOUS, per part: the part opened and the fiber walk found
//         chips on its first screen.
//   <P>.1 DECLARED == PAINTED, per part: every chip measured paints the px
//         value of the token the primitive declares (derived: S1's token, read
//         live from the document's custom property), AND its inline font-size
//         reads back as that token's var() and not `inherit`. The second clause
//         is what still catches the shorthand erasure on a day the declared and
//         inherited sizes happen to be equal.
//   Nothing about 11 or 13 is typed in any row. The census tables are
//   printed beside them.
//
// ═══ PARTS (env PART, comma list; default all) ═══
//   static   (b) only, no app
//   aeon     AEON_DIR copy: every facet, every Effects sub-tab, every tool in
//            every facet's dock
//   classic  S1DISASM_DIR copy, GHZ act 1: every facet, every tool, and the
//            Art facet's Chunk / Block / Tile tiers
//   sprite   the same session: the GHZ spring's sprite document (object $41)
//   canvas   the same session: a new canvas made through the real dialog
//
// ⛔ BOTH TREES MUST BE THROWAWAY COPIES. The census only opens and reads, but
// the classic part creates a canvas document inside the opened project, and
// the tools it arms are one click from an edit. AEON_DIR and S1DISASM_DIR have
// NO default here; each is refused when set to the live tree. Unset, that part
// is NOT MEASURED (loud), the others still run.
//
// NO EMULATOR. Nothing here touches Aether or F7. CLEANUP IS BY PID:
// spawnGuarded + await killTree.
//
// RUN (from a worktree, name the built tree, or the main checkout's dist/
// answers; the run prints `root:` and the build flavour, read them):
//   VITE_AURORA_DEBUG=1 npm run build
//   A=$(mktemp -d) && git -C <aeon> archive origin/master | tar -x -C "$A"
//   S=$(mktemp -d) && cp -a <s1disasm>/. "$S"
//   AEON_DIR="$A" S1DISASM_DIR="$S" AURORA_BUILT_TREE=<this tree> \
//     ELECTRON_BIN=<electron> [PART=...] [CENSUS_TAG=before] \
//     [CAPTURE_DIR=<dir for the chip-bar crops>] npm run harness:chip-font-census

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';
import {
  openNewCanvasDialog, fillDialog, settledInPage, INSTALL as CANVAS_INSTALL,
  ctrlK, typeText, enter, escape, drawArt,
} from './canvas-cdp-harness.mjs';

const PORT = Number(process.env.PORT ?? 9443);
const ROOT = AURORA_DIR;
const PARTS = new Set((process.env.PART ?? 'static,aeon,classic,sprite,canvas')
  .split(',').map((s) => s.trim()).filter(Boolean));
const TAG = process.env.CENSUS_TAG ?? 'run';
const SHOTS = join(ROOT, 'scratchpad/shots-chip-font-census');
mkdirSync(SHOTS, { recursive: true });
// CAPTURE_DIR is optional, and it is where the chip-bar crops go when a run is
// meant to be looked at (the before/after capture). Unset, crops stay in SHOTS.
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? SHOTS;
mkdirSync(CAPTURE_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = []; const skips = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
function skip(id, name, why) {
  console.log(`SKIP  [${id}] ${name}\n        NOT MEASURED: ${why}`);
  skips.push(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO THROWAWAY TREES. Same two refusals as chunk-links-harness.mjs:
// unset is its own answer (that part is NOT MEASURED), and set-to-live throws.
// ─────────────────────────────────────────────────────────────────────────────
function copyOrNull(name) {
  const o = checkoutOverride(name);
  if (o === null) return null;
  const live = siblingDefaultPathOrUnresolved(name);
  if (o.value === live || o.value.startsWith(`${live}/`)) {
    throw new Error(`refusing to run against the live ${name} tree (${o.name}=${o.value}): `
      + 'this census arms tools and makes a canvas in the project it opens. Use a throwaway copy.');
  }
  return o;
}
const AEON = copyOrNull('aeon');
const S1 = copyOrNull('s1disasm');

// ═════════════════════════════════════════════════════════════════════════════
// (b) THE STATIC CENSUS, AND THE DECLARED SIZE, BOTH FROM SOURCE
// ═════════════════════════════════════════════════════════════════════════════
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const PRIMITIVES = 'src/renderer/components/ui/primitives.tsx';
const THEME_TS = 'src/renderer/components/ui/theme.ts';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const parse = (rel) => ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** What `function Chip` declares, read out of its own body: every `fontSize`
 *  property's initializer, and every `font` shorthand key, in any object
 *  literal inside the function. */
function chipDeclaration() {
  const sf = parse(PRIMITIVES);
  let fn = null;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'Chip') fn = n;
  });
  if (!fn) return { error: `${PRIMITIVES} has no top-level function Chip` };
  const fontSizes = []; const shorthands = [];
  const walk = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) {
      const k = n.name.text;
      if (k === 'fontSize') fontSizes.push({ line: lineOf(sf, n), init: n.initializer.getText(sf) });
      if (k === 'font') shorthands.push({ line: lineOf(sf, n), init: n.initializer.getText(sf) });
    }
    ts.forEachChild(n, walk);
  };
  walk(fn);
  const inits = [...new Set(fontSizes.map((f) => f.init))];
  // `T.tXs` -> the theme table's value for key `tXs` -> `var(--text-xs-size)`.
  let token = null, cssVar = null, varExpr = null;
  if (inits.length === 1) {
    const m = /^T\.(\w+)$/.exec(inits[0]);
    if (m) {
      token = m[1];
      const themeHits = [...read(THEME_TS).matchAll(new RegExp(`\\b${token}:\\s*'(var\\((--[\\w-]+)\\))'`, 'g'))];
      if (themeHits.length === 1) { varExpr = themeHits[0][1]; cssVar = themeHits[0][2]; }
    }
  }
  return { fontSizes, shorthands, inits, token, cssVar, varExpr };
}

/** A token's px, FROM SOURCE: theme.ts maps `tXs` to `var(--text-xs-size)`,
 *  theme.css gives that property a px value. Null when either link is absent. */
function tokenPx(token) {
  const t = [...read(THEME_TS).matchAll(new RegExp(`\\b${token}:\\s*'var\\((--[\\w-]+)\\)'`, 'g'))];
  if (t.length !== 1) return null;
  const css = [...read('src/renderer/styles/theme.css').matchAll(new RegExp(`${t[0][1]}:\\s*([\\d.]+px)`, 'g'))];
  return css.length === 1 ? css[0][1] : null;
}

/** WHICH ui PRIMITIVES SET A FONT SIZE ON WHAT THEY WRAP, derived rather than
 *  typed: every capitalised top-level function in the ui directory whose
 *  returned root JSX element carries `style={{ ... fontSize: T.x ... }}`.
 *  A `font: inherit` chip inside one paints that size. `Chip` itself is left
 *  out: it is the subject, not a container. */
function containerTokens() {
  const out = {};
  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'src/renderer/components/ui/*.tsx'], { encoding: 'utf8' })
    .split('\n').filter((f) => f && !f.includes('__tests__'));
  for (const rel of files) {
    const sf = parse(rel);
    sf.forEachChild((n) => {
      if (!ts.isFunctionDeclaration(n) || !n.name || !/^[A-Z]/.test(n.name.text) || n.name.text === 'Chip' || !n.body) return;
      for (const s of n.body.statements) {
        if (!ts.isReturnStatement(s) || !s.expression) continue;
        let e = s.expression;
        while (ts.isParenthesizedExpression(e)) e = e.expression;
        const open = ts.isJsxElement(e) ? e.openingElement : ts.isJsxSelfClosingElement(e) ? e : null;
        const tok = open ? styleFontToken(sf, open) : null;
        if (tok) out[n.name.text] = { token: tok, file: rel, line: lineOf(sf, s) };
      }
    });
  }
  return out;
}
function styleFontToken(sf, open) {
  const st = open.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'style');
  const obj = st?.initializer && ts.isJsxExpression(st.initializer) ? st.initializer.expression : null;
  if (!obj || !ts.isObjectLiteralExpression(obj)) return null;
  const fs = obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'fontSize');
  const m = fs && /^T\.(\w+)$/.exec(fs.initializer.getText(sf));
  return m ? m[1] : null;
}

function staticCensus(decl) {
  const CONTAINERS = containerTokens();
  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'src/*.tsx'], { encoding: 'utf8' })
    .split('\n').filter((f) => f && !f.includes('__tests__') && !/\.test\.tsx$/.test(f));
  const declaredPx = decl.token ? tokenPx(decl.token) : null;
  // What a <button> chip inherits, as far as ITS OWN FILE can say: the nearest
  // JSX ancestor that is a sizing primitive, or that carries an inline
  // fontSize token. Anything else is decided where the component is MOUNTED,
  // which this file cannot see; that is its own bucket, never a guess.
  const containerOf = (sf, ancestors) => {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      const ao = ts.isJsxElement(a) ? a.openingElement : ts.isJsxSelfClosingElement(a) ? a : null;
      if (!ao) continue;
      const tag = ao.tagName.getText(sf);
      if (CONTAINERS[tag]) return { via: `<${tag}>`, token: CONTAINERS[tag].token };
      const tok = styleFontToken(sf, ao);
      if (tok) return { via: `<${tag} style.fontSize>`, token: tok };
    }
    return null;
  };
  const sites = []; const importProblems = [];
  for (const rel of files) {
    const text = read(rel);
    if (!/<Chip\b/.test(text)) continue;
    const sf = parse(rel);
    let importsChip = false;
    sf.forEachChild((n) => {
      if (!ts.isImportDeclaration(n)) return;
      const from = n.moduleSpecifier.text;
      const named = n.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)
        && named.elements.some((e) => e.name.text === 'Chip' && (e.propertyName?.text ?? 'Chip') === 'Chip')
        && /(^|\/)ui$/.test(from)) importsChip = true;
    });
    const before = sites.length;
    const walk = (n, ancestors) => {
      const open = ts.isJsxSelfClosingElement(n) ? n : ts.isJsxElement(n) ? n.openingElement : null;
      if (open && open.tagName.getText(sf) === 'Chip') {
        const attrs = open.attributes.properties;
        const spread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
        const onClick = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'onClick');
        let cls = 'static';
        if (spread) cls = 'UNKNOWN (spread props)';
        else if (onClick) {
          const e = onClick.initializer && ts.isJsxExpression(onClick.initializer) ? onClick.initializer.expression : null;
          const isNothing = (x) => x && ((ts.isIdentifier(x) && x.text === 'undefined') || x.kind === ts.SyntaxKind.NullKeyword);
          cls = e && ts.isConditionalExpression(e) && (isNothing(e.whenTrue) || isNothing(e.whenFalse))
            ? 'conditional' : 'interactive';
        }
        const inMap = ancestors.some((a) => ts.isCallExpression(a) && ts.isPropertyAccessExpression(a.expression)
          && a.expression.name.text === 'map');
        let label = '';
        if (ts.isJsxElement(n)) label = n.children.map((ch) => ch.getText(sf)).join('').replace(/\s+/g, ' ').trim();
        // TODAY'S PAINTED SIZE, PREDICTED FROM SOURCE ALONE. A <span> chip
        // paints what Chip declares; a <button> chip (font: inherit) paints
        // its container's size, when this file shows the container.
        const cont = containerOf(sf, ancestors);
        const contPx = cont ? (tokenPx(cont.token) ?? `T.${cont.token}?`) : 'from mount site';
        const predicted = cls === 'static' ? declaredPx
          : cls === 'interactive' ? contPx
            : cls === 'conditional' ? `${declaredPx} as span / ${contPx} as button` : 'unknown';
        // The component the site is WRITTEN in, which the rendered census can
        // find in a chip's render chain: the join between (b) and (a).
        let enclosing = null;
        for (let i = ancestors.length - 1; i >= 0 && !enclosing; i--) {
          const a = ancestors[i];
          if (ts.isFunctionDeclaration(a) && a.name && /^[A-Z]/.test(a.name.text)) enclosing = a.name.text;
          else if ((ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && a.parent
            && ts.isVariableDeclaration(a.parent) && ts.isIdentifier(a.parent.name)
            && /^[A-Z]/.test(a.parent.name.text)) enclosing = a.parent.name.text;
        }
        sites.push({
          file: rel, line: lineOf(sf, n), cls, inMap, label: label.slice(0, 40),
          literal: label !== '' && !label.includes('{'),
          container: cont ? cont.via : null, predicted, enclosing,
        });
      }
      ts.forEachChild(n, (ch) => walk(ch, [...ancestors, n]));
    };
    walk(sf, []);
    if (sites.length > before && !importsChip) importProblems.push(rel);
  }
  return { files: files.length, sites, importProblems, containers: CONTAINERS, declaredPx };
}

function printStatic(st, decl) {
  console.log('\n════ (b) CALL SITES: `<Chip` JSX elements in src/ (tests excluded) ════');
  const byFile = new Map();
  for (const s of st.sites) {
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file).push(s);
  }
  for (const [f, ss] of byFile) {
    const n = (c) => ss.filter((s) => s.cls === c).length;
    console.log(`  ${f}: ${ss.length} site(s)  interactive=${n('interactive')} static=${n('static')} conditional=${n('conditional')}`);
    for (const s of ss) {
      console.log(`      :${String(s.line).padEnd(5)} ${s.cls.padEnd(12)}${s.inMap ? ' in .map()' : '           '} `
        + `${JSON.stringify(s.label).padEnd(42)} paints today: ${s.predicted}${s.container ? ` (via ${s.container})` : ''}`);
    }
  }
  const tally = (c) => st.sites.filter((s) => s.cls === c).length;
  const totals = {
    sites: st.sites.length, files: byFile.size,
    interactive: tally('interactive'), static: tally('static'), conditional: tally('conditional'),
    unknown: st.sites.filter((s) => s.cls.startsWith('UNKNOWN')).length,
    inMap: st.sites.filter((s) => s.inMap).length,
  };
  console.log(`  TOTAL: ${totals.sites} call sites in ${totals.files} files (of ${st.files} .tsx scanned): `
    + `interactive=${totals.interactive} static=${totals.static} conditional=${totals.conditional} `
    + `unknown=${totals.unknown}; ${totals.inMap} of them inside a .map() (one site, many chips)`);
  const predicted = {};
  for (const s of st.sites) predicted[s.predicted] = (predicted[s.predicted] ?? 0) + 1;
  totals.predictedToday = predicted;
  console.log(`  PAINTS TODAY, predicted from source (unit: call sites): ${JSON.stringify(predicted)}`);
  console.log(`  sizing containers derived from the ui primitives: ${JSON.stringify(Object.fromEntries(
    Object.entries(st.containers).map(([k, v]) => [k, `T.${v.token}=${tokenPx(v.token)}`])))}`);
  console.log(`  DECLARED by function Chip (${PRIMITIVES}): fontSize initialisers `
    + `${JSON.stringify(decl.fontSizes)}; font shorthand keys ${JSON.stringify(decl.shorthands)}; `
    + `token=${decl.token} -> ${decl.varExpr}`);
  return totals;
}

// ═════════════════════════════════════════════════════════════════════════════
// (a) THE RENDERED CENSUS
// ═════════════════════════════════════════════════════════════════════════════
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
/** Every in-flight request REJECTS when the socket dies (canvas-cdp-harness's
 *  O79 lesson): a request left pending is how a run ends at exit 0 silently. */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const failPending = (why) => {
    for (const [id, settle] of pending) settle({ id, error: { code: -1, message: `CDP socket ${why}` } });
    pending.clear();
  };
  ws.addEventListener('close', () => failPending('CLOSED'));
  ws.addEventListener('error', () => failPending('ERRORED'));
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
  return {
    ready, send, evalExpr,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function mouseClick(c, x, y) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
  }
}
async function key(c, k, code) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
}

/**
 * INSTALLED IN THE PAGE: `window.__chipCensus(varName)` walks every <button>
 * and <span>, asks React's fiber which component rendered it, and returns the
 * visible chips with their sizes. `window.__clickable(sel, owner)` lists the
 * visible elements of a kind owned by a named component, with an INTEGER aim
 * point, so the harness can press them with a real mouse event.
 */
const INSTALL = `(() => {
  const fiberOf = (el) => { for (const k in el) if (k.startsWith('__reactFiber$')) return el[k]; return null; };
  const nameOf = (t) => {
    if (!t || typeof t === 'string') return null;
    if (typeof t === 'function') return t.displayName || t.name || null;
    return t.displayName || (t.type && nameOf(t.type)) || (t.render && nameOf(t.render)) || null;
  };
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null)
    && el.getClientRects().length > 0;
  // The component that rendered this host element, and the nearest named
  // component above THAT in the render tree (see INSIDE below).
  const renderedBy = (el) => { const f = fiberOf(el); return f && f.return ? f.return : null; };
  const ownerAbove = (f, skip) => {
    for (let p = f ? f.return : null; p; p = p.return) {
      const n = nameOf(p.type); if (n && n !== skip) return n;
    }
    return '(none)';
  };
  const namesAbove = (f, skip, max) => {
    const out = [];
    for (let p = f ? f.return : null; p && out.length < max; p = p.return) {
      const n = nameOf(p.type);
      if (n && n !== skip && out[out.length - 1] !== n) out.push(n);
    }
    return out;
  };
  const textSizes = (el) => {
    const out = new Set();
    const visit = (e) => {
      if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')) out.add(getComputedStyle(e).fontSize);
      for (const ch of e.children) visit(ch);
    };
    visit(el); return [...out];
  };
  window.__chipCensus = (cssVar) => {
    const declaredPx = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    const chips = []; const lookalikes = []; let hiddenChips = 0;
    for (const el of document.querySelectorAll('button, span')) {
      const by = renderedBy(el);
      const isChip = by && nameOf(by.type) === 'Chip';
      const lookalike = !isChip && el.style.display === 'inline-flex' && el.style.whiteSpace === 'nowrap';
      if (!isChip && !lookalike) continue;
      if (!visible(el)) { if (isChip) hiddenChips++; continue; }
      const r = el.getBoundingClientRect();
      // INSIDE, not OWNER: a production fiber keeps no owner, so this is the
      // chain of named components ABOVE the chip in the RENDER tree. The level
      // header's chips are written in LevelWorkspace but passed as a prop to
      // EditorShell, so they read "EditorShell < LevelWorkspace". FOUR names
      // are the dedupe key: one name merged different controls that share a
      // wrapper (the sprite and canvas bars' "Fit" are both inside OptionBar).
      const names = isChip ? namesAbove(by, 'Chip', 12) : namesAbove(fiberOf(el), null, 12);
      const row = {
        inside: names.slice(0, 4).join(' < ') || '(none)',
        names,
        text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40),
        tag: el.tagName.toLowerCase(),
        computed: getComputedStyle(el).fontSize,
        inherited: el.parentElement ? getComputedStyle(el.parentElement).fontSize : null,
        inlineFontSize: el.style.fontSize || '(unset)',
        inlineFont: el.style.font || '(none)',
        textSizes: textSizes(el),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
      (isChip ? chips : lookalikes).push(row);
    }
    return { declaredPx, dpr: window.devicePixelRatio, chips, lookalikes, hiddenChips };
  };
  window.__clickable = (sel, owner, textFilter) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      const by = renderedBy(el);
      if (owner && !(by && nameOf(by.type) === owner) && ownerAbove(fiberOf(el), null) !== owner) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (textFilter && !textFilter.includes(label)) continue;
      const r = el.getBoundingClientRect();
      out.push({ label, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        pressed: el.getAttribute('aria-pressed'), disabled: el.disabled === true });
    }
    return out;
  };
  return true;
})()`;

const screens = [];   // { part, screen, census }

async function takeCensus(c, part, screen, decl, { crop = false } = {}) {
  await c.evalExpr(INSTALL);
  const census = await c.json(`window.__chipCensus(${JSON.stringify(decl.cssVar)})`);
  screens.push({ part, screen, census });
  const sizes = {};
  for (const ch of census.chips) sizes[ch.computed] = (sizes[ch.computed] ?? 0) + 1;
  console.log(`  [${part}] ${screen.padEnd(44)} chips=${String(census.chips.length).padStart(2)} `
    + `${JSON.stringify(sizes)} lookalikes=${census.lookalikes.length} hidden=${census.hiddenChips}`);
  if (crop && census.chips.length > 0) await cropChips(c, `${part}__${screen}`, census.chips);
  return census;
}

/** A capture of the band holding the chips, so a before/after pair can be
 *  looked at side by side. Clip is the union of the chips' rects, padded. */
async function cropChips(c, name, chips) {
  const pad = 12;
  const x0 = Math.max(0, Math.min(...chips.map((ch) => ch.rect.x)) - pad);
  const y0 = Math.max(0, Math.min(...chips.map((ch) => ch.rect.y)) - pad);
  const x1 = Math.max(...chips.map((ch) => ch.rect.x + ch.rect.w)) + pad;
  const y1 = Math.max(...chips.map((ch) => ch.rect.y + ch.rect.h)) + pad;
  try {
    const { data } = await c.send('Page.captureScreenshot', {
      format: 'png', clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0, scale: 1 },
    });
    const safe = name.replace(/[^A-Za-z0-9._-]+/g, '_');
    writeFileSync(join(CAPTURE_DIR, `${TAG}__${safe}.png`), Buffer.from(data, 'base64'));
  } catch (e) { console.log(`        (crop ${name} failed: ${e.message})`); }
}

async function launch() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const RUN = globalThis.__RUN;
  const app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
  app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });
  const c = cdp(await waitForTarget());
  await c.ready;
  await c.send('Runtime.enable');
  const waitDbg = async () => {
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
      await sleep(300);
    }
    return false;
  };
  if (!(await waitDbg())) throw new Error('window.__dbg never appeared: this needs a VITE_AURORA_DEBUG=1 build');
  // Collapse state and remembered choices are per author; start from none.
  await c.evalExpr('localStorage.clear(); 1');
  await c.send('Page.reload');
  for (let i = 0; i < 20; i++) { await sleep(300); if (await c.evalExpr('document.readyState').catch(() => '') === 'complete') break; }
  if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');
  return { app, c };
}

/** Poll a page-side promise to completion by parking its outcome on window
 *  (chunk-links-harness row 1: `awaitPromise` lets V8 collect the promise). */
async function openAndWait(c, expr, what, timeoutS = 60) {
  await c.send('Runtime.evaluate', {
    expression: `(() => { window.__censusOpen = 'pending';
      Promise.resolve(${expr}).then((v) => { window.__censusOpen = 'resolved:' + v; })
        .catch((e) => { window.__censusOpen = 'rejected:' + (e && e.message); });
      return 'started'; })()`,
    returnByValue: true,
  });
  for (let i = 0; i < timeoutS * 2; i++) {
    const s = await c.evalExpr('window.__censusOpen').catch((e) => `ERR ${e.message}`);
    if (s !== 'pending') { console.log(`        [${what}] ${s} after ${(i * 0.5).toFixed(1)}s`); return s; }
    await sleep(500);
  }
  return 'pending (timed out)';
}

const activeFacet = (c) => c.evalExpr('window.__dbg.parallaxPreview().facet').catch(() => '(unreadable)');

/** Every facet pill, then every tool in that facet's dock; the Effects facet's
 *  sub-tabs; the classic Art facet's tiers. Each is one SCREEN. */
async function walkFacets(c, part, decl, { crops }) {
  await c.evalExpr(INSTALL);
  const pills = await c.json(`window.__clickable('[aria-label="Facets"] button', null)`);
  const labels = pills.map((p) => p.label);
  console.log(`        facet pills on screen: ${JSON.stringify(labels)}`);
  for (const label of labels) {
    await c.evalExpr(INSTALL);
    const pill = (await c.json(`window.__clickable('[aria-label="Facets"] button', null, ${JSON.stringify([label])})`))[0];
    if (!pill) { console.log(`        (pill ${label} vanished)`); continue; }
    await mouseClick(c, pill.x, pill.y);
    await sleep(900);
    const facet = await activeFacet(c);
    await takeCensus(c, part, `${label} [${facet}]`, decl, { crop: crops.has(label) });

    // Effects: every job sub-tab.
    const subs = await c.json(`window.__clickable('[aria-label="Effects job"] button', null)`);
    for (const s of subs) {
      await mouseClick(c, s.x, s.y); await sleep(700);
      await takeCensus(c, part, `${label}/${s.label}`, decl, { crop: crops.has(`${label}/${s.label}`) });
    }
    // Classic Art: the three tiers (their tab buttons are plain buttons of
    // ClassicComposerDock), and in each, the Paint mode where it is offered.
    const tiers = await c.json(`window.__clickable('button', 'ClassicComposerDock', ['Chunk', 'Block', 'Tile'])`);
    for (const t of tiers) {
      await mouseClick(c, t.x, t.y); await sleep(700);
      await takeCensus(c, part, `${label}/${t.label}`, decl, { crop: crops.has(`${label}/${t.label}`) });
      const paint = await c.json(`window.__clickable('button', 'Chip', ['Paint'])`);
      if (paint.length === 1) {
        await mouseClick(c, paint[0].x, paint[0].y); await sleep(600);
        await takeCensus(c, part, `${label}/${t.label}/Paint`, decl);
        const assign = await c.json(`window.__clickable('button', 'Chip', ['Assign'])`);
        if (assign.length === 1) { await mouseClick(c, assign[0].x, assign[0].y); await sleep(400); }
      }
    }
    // Every tool this facet's dock offers (ToolButton).
    const tools = await c.json(`window.__clickable('button', 'ToolButton')`);
    for (const t of tools) {
      await c.evalExpr(INSTALL);
      const now = (await c.json(`window.__clickable('button', 'ToolButton', ${JSON.stringify([t.label])})`))[0];
      if (!now) continue;
      await mouseClick(c, now.x, now.y); await sleep(500);
      await takeCensus(c, part, `${label}/tool:${t.label}`, decl, { crop: crops.has(`${label}/tool:${t.label}`) });
    }
    await key(c, 'Escape', 'Escape'); await sleep(200);
  }
  return labels;
}

async function toolWalk(c, part, prefix, decl) {
  await c.evalExpr(INSTALL);
  const tools = await c.json(`window.__clickable('button', 'ToolButton')`);
  for (const t of tools) {
    await c.evalExpr(INSTALL);
    const now = (await c.json(`window.__clickable('button', 'ToolButton', ${JSON.stringify([t.label])})`))[0];
    if (!now) continue;
    await mouseClick(c, now.x, now.y); await sleep(500);
    await takeCensus(c, part, `${prefix}/tool:${t.label}`, decl);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEEP STATES: the chips that exist only once a document holds something.
// The facet walk sees each facet as it opens; these are the call sites that
// walk never mounted (a preset, a band, a probed cell, a commit plan, a
// dialog). Each state is made through the app's own controls with real
// events, in the throwaway copy, and nothing saves.
// ─────────────────────────────────────────────────────────────────────────────
/** Press the visible element whose text is exactly `text` (or starts with it,
 *  when `prefix`), scrolled into view first so the aim is on screen. */
async function clickText(c, sel, text, { prefix = false } = {}) {
  const p = await c.json(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => {
      if (!(e.checkVisibility ? e.checkVisibility() : e.offsetParent !== null)) return false;
      const t = e.textContent.trim();
      return ${prefix ? `t.startsWith(${JSON.stringify(text)})` : `t === ${JSON.stringify(text)}`};
    });
    if (els.length === 0) return null;
    els[0].scrollIntoView({ block: 'center' });
    const r = els[0].getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), n: els.length,
      disabled: els[0].disabled === true };
  })()`);
  if (!p) return `not-found:${text}`;
  if (p.disabled) return `disabled:${text}`;
  await mouseClick(c, p.x, p.y);
  return 'clicked';
}
const say = (what, r) => console.log(`        [state] ${what}: ${r}`);

async function aeonDeepStates(c, decl) {
  console.log('\n──── aeon deep states ────');
  // (i) Colour: create a preset through its own id field and New chip, then
  //     press whatever channel / band controls that preset offers.
  say('Effects pill', await clickText(c, '[aria-label="Facets"] button', 'Effects')); await sleep(900);
  say('Colour tab', await clickText(c, '[aria-label="Effects job"] button', 'Colour')); await sleep(700);
  // `Input.insertText` lands only in the FOCUSED element; run 3 aimed a mouse
  // click at the field, typed into nothing, and the census after "New" was the
  // census before it. Focus from the page, READ the value back, and only then
  // press the New chip that sits in the same Field as this input.
  const INPUT = `document.querySelector('input[placeholder="new_preset_id"]')`;
  const focused = await c.evalExpr(`(() => { const i = ${INPUT}; if (!i) return 'no-input';
    i.scrollIntoView({ block: 'center' }); i.focus(); return document.activeElement === i ? 'focused' : 'not-focused'; })()`);
  if (focused !== 'no-input') {
    await typeText(c, 'chip_census'); await sleep(300);
    let val = await c.evalExpr(`${INPUT}.value`);
    if (val !== 'chip_census') {
      val = await c.evalExpr(`(() => { const i = ${INPUT};
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'chip_census');
        i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; })()`);
      await sleep(300);
      say('preset id', `insertText did not land (${focused}); native setter + input event -> ${JSON.stringify(val)}`);
    } else say('preset id', `typed (${focused}) -> ${JSON.stringify(val)}`);
    const newBtn = await c.json(`(() => { const b = ${INPUT}.parentElement.querySelector('button');
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), disabled: b.disabled, text: b.textContent.trim() }; })()`);
    if (newBtn && !newBtn.disabled) { await mouseClick(c, newBtn.x, newBtn.y); await sleep(900); }
    say('New preset chip_census', newBtn ? `${newBtn.text} disabled=${newBtn.disabled}` : 'no button beside the field');
    const refusal = await c.evalExpr(`${INPUT} ? ${INPUT}.value : '(field gone)'`);
    say('field after New', JSON.stringify(refusal));
    await takeCensus(c, 'aeon', 'Effects/Colour/+preset', decl, { crop: true });
    for (const label of ['Add channel', 'Add raster band', 'Add base-swap band']) {
      const r = await clickText(c, 'button', label);
      say(label, r);
      if (r === 'clicked') { await sleep(700); await takeCensus(c, 'aeon', `Effects/Colour/+preset/${label}`, decl); }
    }
  } else say('preset id field', 'not-found');
  // (ii) Tile anim: open the collapsed "New tile animation" section, then add
  //      a blank tile animation, which is what gives the preview strip bands.
  say('Tile anim tab', await clickText(c, '[aria-label="Effects job"] button', 'Tile anim')); await sleep(700);
  say('open "New tile animation"', await clickText(c, 'div, span, button', 'New tile animation')); await sleep(600);
  await takeCensus(c, 'aeon', 'Effects/Tile anim/+New section', decl);
  say('Add blank tile animation', await clickText(c, 'button', 'Add blank tile animation')); await sleep(1000);
  await takeCensus(c, 'aeon', 'Effects/Tile anim/+band', decl, { crop: true });
  // (iii) The preview strip's middle chip ("pan to move", the ONLY static call
  //       site) shows while playback is on and every band reads the camera.
  say('Play tile animations', await clickText(c, 'button', 'Play tile animations')); await sleep(800);
  await takeCensus(c, 'aeon', 'Effects/Tile anim/+band/playing', decl);
  // (iv) A band that cells DRAW refuses its first Remove and shows a confirm
  //      row (two more chips). A blank band is not drawn and is just removed,
  //      so promote one from existing tiles first, then press Remove on each
  //      band, last first, until the confirm row is up.
  say('Promote from tile', await clickText(c, 'button', 'Promote from tile', { prefix: true })); await sleep(1000);
  await takeCensus(c, 'aeon', 'Effects/Tile anim/+promoted', decl);
  let confirm = false;
  for (let i = 0; i < 6 && !confirm; i++) {
    const labels = await c.json(`[...document.querySelectorAll('button[aria-label^="Remove tile animation"]')]
      .filter((b) => b.checkVisibility()).map((b) => b.getAttribute('aria-label'))`);
    if (labels.length === 0) { say('Remove', 'no band left to press Remove on'); break; }
    const lab = labels[labels.length - 1];
    const p = await c.json(`(() => { const b = [...document.querySelectorAll('button')]
      .find((e) => e.getAttribute('aria-label') === ${JSON.stringify(lab)});
      b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    await mouseClick(c, p.x, p.y); await sleep(800);
    confirm = await c.evalExpr(`[...document.querySelectorAll('button')]
      .some((b) => b.textContent.trim() === 'Remove and blank those cells' && b.checkVisibility())`);
    say(`Remove (${lab})`, confirm ? 'refused and asked: the confirm row is up' : 'applied (no cell draws it)');
  }
  if (confirm) await takeCensus(c, 'aeon', 'Effects/Tile anim/+remove confirm', decl, { crop: true });
}

async function classicDeepStates(c, decl) {
  console.log('\n──── classic deep states ────');
  // (iii) Collision: the picker exists only for a PROBED cell. Arm View first
  //       (the walk left Paint Collision armed); a View click only probes.
  say('Collision pill', await clickText(c, '[aria-label="Facets"] button', 'Collision')); await sleep(900);
  await c.evalExpr(INSTALL);
  const view = (await c.json(`window.__clickable('button', 'ToolButton', ['View'])`))[0];
  if (view) { await mouseClick(c, view.x, view.y); await sleep(300); }
  const map = await c.json(`(() => { const cs = [...document.querySelectorAll('canvas')].filter((e) => e.checkVisibility());
    cs.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    if (!cs[0]) return null; const r = cs[0].getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  // The shape picker renders only for a probed cell that is NOT air, and the
  // centre of GHZ's opening view can be sky. Probe a grid, stop on the picker.
  let picker = false;
  if (map) {
    await c.evalExpr(INSTALL);
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.8], [0.3, 0.8], [0.7, 0.8], [0.5, 0.9], [0.2, 0.9],
      [0.8, 0.9], [0.4, 0.65], [0.6, 0.65], [0.1, 0.75], [0.9, 0.75], [0.5, 0.95]]) {
      const x = Math.round(map.x + map.w * fx), y = Math.round(map.y + map.h * fy);
      await mouseClick(c, x, y); await sleep(450);
      picker = await c.evalExpr(`window.__chipCensus(${JSON.stringify(decl.cssVar)}).chips.some((ch) => ch.names.includes('ShapePicker'))`);
      if (picker) { say('probe click', `(${x},${y}) with View armed: the shape picker is up`); break; }
    }
    if (!picker) say('probe click', 'twelve probes, no non-air cell: the picker never rendered');
  }
  await takeCensus(c, 'classic', 'Collision/+probe', decl, { crop: true });
  // (iv) The Import Art Sheet dialog, through the command palette. Its chip
  //      opens a native file picker, so it is measured and NEVER pressed.
  await escape(c); await sleep(200);
  await ctrlK(c); await sleep(600);
  await typeText(c, 'Import Art Sheet'); await sleep(450);
  await enter(c); await sleep(900);
  await takeCensus(c, 'classic', 'dialog: Import Art Sheet', decl, { crop: true });
  await escape(c); await sleep(400);
}

async function canvasDeepStates(c, decl) {
  console.log('\n──── canvas deep states ────');
  // (v) Art on the canvas, so the Commit to level section has a plan.
  await c.evalExpr(INSTALL);
  const pencil = (await c.json(`window.__clickable('button', 'ToolButton')`)).find((t) => t.label.startsWith('Pencil'));
  if (pencil) { await mouseClick(c, pencil.x, pencil.y); await sleep(300); }
  await c.evalExpr(CANVAS_INSTALL);
  try { await drawArt(c, 16, 16, 200, 200, 256); say('stroke', 'drawn 16,16 -> 200,200 with Pencil'); }
  catch (e) { say('stroke', `failed: ${e.message}`); }
  await sleep(800);
  await takeCensus(c, 'canvas', 'new 256x256/+art', decl, { crop: true });
}

// The two rows every part gets.
function partRows(part, decl, firstChips) {
  const mine = screens.filter((s) => s.part === part);
  check(`${part}.0`, `ANTI-VACUOUS: the ${part} part opened and the fiber walk found chips on its first screen`,
    mine.length > 0 && firstChips > 0,
    `screens=${mine.length} chipsOnFirstScreen=${firstChips}`);
  const off = [];
  let n = 0;
  for (const s of mine) {
    for (const ch of s.census.chips) {
      n++;
      const pxOk = /^\d+(\.\d+)?px$/.test(s.census.declaredPx) && ch.computed === s.census.declaredPx;
      const inlineOk = ch.inlineFontSize === decl.varExpr;
      if (!pxOk || !inlineOk) off.push(`${s.screen} :: ${ch.inside} ${ch.tag} ${JSON.stringify(ch.text)} `
        + `computed=${ch.computed} inline font-size=${ch.inlineFontSize}`);
    }
  }
  const declaredPx = mine[0]?.census.declaredPx ?? '(no screen)';
  check(`${part}.1`, `every chip the ${part} part measured paints the size the primitive DECLARES `
    + `(${decl.varExpr} = ${declaredPx}, derived from ${PRIMITIVES} and the live token), and its inline `
    + 'font-size is that declaration, not `inherit`',
    decl.varExpr !== null && n > 0 && off.length === 0,
    `${n} chip-screens measured, ${off.length} disagree`
    + (off.length ? `; first ${Math.min(12, off.length)}:\n          ${off.slice(0, 12).join('\n          ')}` : ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PARTS
// ─────────────────────────────────────────────────────────────────────────────
/** A part that throws is recorded as a FAILED `<part>.run` row and as NOT
 *  MEASURED from that point, and the run goes on to print and write what it
 *  did measure. A thrown part used to take the census file down with it. */
function partThrew(part, e, notMeasured) {
  check(`${part}.run`, `the ${part} part ran to its end`, false, `threw: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
  notMeasured.push(`${part} (from the throw on)`);
}

async function aeonPart(decl, notMeasured) {
  let app = null, c = null;
  try {
    ({ app, c } = await launch());
    console.log(`\n──── aeon: ${AEON.value} (${AEON.name}; a copy) ────`);
    const s = await openAndWait(c, `window.__dbg.aeon.open(${JSON.stringify(AEON.value)})`, 'aeon.open');
    if (s !== 'resolved:true') throw new Error(`aeon open did not succeed (${s})`);
    await sleep(1500);
    const st = await c.json('window.__dbg.aeon.state()');
    await openAndWait(c, `window.__dbg.activate(${JSON.stringify(st.zone)}, ${JSON.stringify(st.act)})`, 'activate');
    await sleep(1200);
    const first = await takeCensus(c, 'aeon', 'landing', decl);
    await walkFacets(c, 'aeon', decl, {
      crops: new Set(['Layout', 'Layout/tool:Stamp Chunk', 'Layout/tool:Paint Tile', 'Effects/Tile anim', 'Effects/Colour', 'Art']),
    });
    await aeonDeepStates(c, decl);
    partRows('aeon', decl, first.chips.length);
  } catch (e) {
    partThrew('aeon', e, notMeasured);
  } finally {
    if (c) c.close();
    if (app) await killTree(app);
  }
}

async function classicSpriteCanvasPart(decl, notMeasured) {
  let app = null, c = null;
  try {
    ({ app, c } = await launch());
    {
      console.log(`\n──── classic: ${S1.value} (${S1.name}; a copy), GHZ act 1 ────`);
      await settledInPage(c, `window.__dbg.openDir(${JSON.stringify(S1.value)})`, 'openDir');
      let proj = { zones: 0 };
      for (let i = 0; i < 40 && !(proj.zones > 0); i++) {
        await sleep(500);
        proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
      }
      await openAndWait(c, "window.__dbg.activate('ghz', 1)", 'activate ghz 1');
      let lvl = { status: 'idle' };
      for (let i = 0; i < 40 && lvl.status !== 'ready'; i++) {
        await sleep(500);
        lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      }
      console.log(`        project=${JSON.stringify(proj)} level=${JSON.stringify(lvl)}`);
      if (lvl.status !== 'ready') throw new Error(`GHZ act 1 never reached ready (${JSON.stringify(lvl)})`);
      await sleep(800);
    }
    if (PARTS.has('classic')) {
      try {
        const first = await takeCensus(c, 'classic', 'landing', decl);
        await walkFacets(c, 'classic', decl, {
          crops: new Set(['Layout', 'Art/Chunk', 'Art/Block', 'Art/Tile', 'Collision']),
        });
        await classicDeepStates(c, decl);
        partRows('classic', decl, first.chips.length);
      } catch (e) { partThrew('classic', e, notMeasured); }
    }
    if (PARTS.has('sprite')) {
      try {
        console.log('\n──── sprite: object $41 (the GHZ spring), __dbg.editObjectArt, the object UI\'s own door ────');
        const ok = await openAndWait(c, 'window.__dbg.editObjectArt(0x41)', 'editObjectArt');
        await sleep(2000);
        const sp = await c.json('window.__dbg.spriteState()').catch(() => ({}));
        console.log(`        ${ok} activeDocId=${sp.activeDocId} frames=${sp.frames}`);
        const first = await takeCensus(c, 'sprite', 'document', decl, { crop: true });
        await toolWalk(c, 'sprite', 'document', decl);
        partRows('sprite', decl, first.chips.length);
      } catch (e) { partThrew('sprite', e, notMeasured); }
    }
    if (PARTS.has('canvas')) try {
      console.log('\n──── canvas: a new canvas through the real New Canvas dialog (Ctrl+K) ────');
      // openNewCanvasDialog reads `window.__c` BEFORE it installs it; its own
      // callers install it first, and so must this one.
      await c.evalExpr(CANVAS_INSTALL);
      const opened = await openNewCanvasDialog(c);
      if (!opened) throw new Error('the New Canvas dialog would not open');
      const name = `chip-census-${Date.now().toString(36)}`;
      // 256 x 256: ONE chunk (CHUNK_PX, core/art/canvas-resolve.ts). A smaller
      // canvas has no chunk capacity, and the Commit to level section then
      // renders none of its four chips.
      await fillDialog(c, { name, width: 256, height: 256 });
      const create = await c.json(`(() => { const b = window.__c.dlgCreate(); if (!b) return null;
        const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
      if (!create) throw new Error('the dialog has no Create button');
      await mouseClick(c, create.x, create.y);
      await sleep(2500);
      const still = await c.evalExpr('window.__c.dlgOpen()');
      const docs = await c.json('window.__dbg.canvas.docIds()').catch(() => []);
      console.log(`        dialog still open=${still} canvas docs=${JSON.stringify(docs)}`);
      if (still) throw new Error(`create was refused: ${JSON.stringify(await c.json('window.__c.dlgError()'))}`);
      const first = await takeCensus(c, 'canvas', 'new 256x256', decl, { crop: true });
      await toolWalk(c, 'canvas', 'new 256x256', decl);
      await canvasDeepStates(c, decl);
      partRows('canvas', decl, first.chips.length);
    } catch (e) { partThrew('canvas', e, notMeasured); }
  } catch (e) {
    partThrew('classic/sprite/canvas session', e, notMeasured);
  } finally {
    if (c) c.close();
    if (app) await killTree(app);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TABLES
// ─────────────────────────────────────────────────────────────────────────────
function printRendered(st) {
  console.log('\n════ (a) RENDERED CHIPS: getComputedStyle().fontSize of every visible chip, per screen ════');
  const bucket = (px) => px;
  const distinct = new Map();       // key -> { inside, text, tag, sizes:Set, screens:[] }
  const chipScreens = {};
  const perPart = {};
  for (const s of screens) {
    perPart[s.part] ??= { screens: 0, chipScreens: {}, distinct: new Map() };
    perPart[s.part].screens++;
    for (const ch of s.census.chips) {
      const b = bucket(ch.computed);
      chipScreens[b] = (chipScreens[b] ?? 0) + 1;
      perPart[s.part].chipScreens[b] = (perPart[s.part].chipScreens[b] ?? 0) + 1;
      const k = `${ch.inside}|${ch.text}|${ch.tag}`;
      for (const m of [distinct, perPart[s.part].distinct]) {
        if (!m.has(k)) m.set(k, { inside: ch.inside, text: ch.text, tag: ch.tag, sizes: new Set(), screens: [], inherited: new Set(), textSizes: new Set() });
        const e = m.get(k); e.sizes.add(ch.computed); e.screens.push(`${s.part}:${s.screen}`);
        e.inherited.add(ch.inherited); ch.textSizes.forEach((t) => e.textSizes.add(t));
      }
    }
  }
  const tallyDistinct = (m) => {
    const t = {};
    for (const e of m.values()) {
      const key = e.sizes.size === 1 ? [...e.sizes][0] : `mixed(${[...e.sizes].join('/')})`;
      t[key] = (t[key] ?? 0) + 1;
    }
    return t;
  };
  for (const [p, v] of Object.entries(perPart)) {
    console.log(`  ${p.padEnd(8)} screens=${String(v.screens).padStart(3)}  distinct chips ${JSON.stringify(tallyDistinct(v.distinct))}`
      + `  chip-screens ${JSON.stringify(v.chipScreens)}`);
  }
  console.log('  DISTINCT CHIPS (inside: nearest named component above it in the render tree | text | element '
    + '-> sizes painted; its container\'s size; times seen):');
  for (const e of [...distinct.values()].sort((a, b) => a.inside.localeCompare(b.inside) || a.text.localeCompare(b.text))) {
    console.log(`      ${e.inside.padEnd(24)} ${JSON.stringify(e.text).padEnd(34)} ${e.tag.padEnd(6)} `
      + `-> ${[...e.sizes].join('/')}  (inherits ${[...e.inherited].join('/')}; text ${[...e.textSizes].join('/')}) `
      + `x${e.screens.length}`);
  }
  const look = new Map();
  for (const s of screens) for (const l of s.census.lookalikes) {
    const k = `${l.inside}|${l.text}|${l.tag}`;
    if (!look.has(k)) look.set(k, { ...l, sizes: new Set() });
    look.get(k).sizes.add(l.computed);
  }
  console.log(`  LOOKALIKES (inline-flex + nowrap, NOT rendered by Chip; listed, do not vote): ${look.size} distinct`);
  for (const l of look.values()) {
    console.log(`      ${l.inside.padEnd(24)} ${JSON.stringify(l.text).padEnd(34)} ${l.tag.padEnd(6)} -> ${[...l.sizes].join('/')}`);
  }
  const t = tallyDistinct(distinct);
  console.log(`  TOTAL distinct chips: ${distinct.size} ${JSON.stringify(t)}; chip-screens: `
    + `${Object.values(chipScreens).reduce((a, b) => a + b, 0)} ${JSON.stringify(chipScreens)}; screens: ${screens.length}`);
  return { distinct: t, distinctN: distinct.size, chipScreens, screens: screens.length,
    list: [...distinct.values()].map((e) => ({ ...e, sizes: [...e.sizes], inherited: [...e.inherited], textSizes: [...e.textSizes] })) };
}

/**
 * (b) JOINED TO (a): each call site's MEASURED size. A site matches a rendered
 * chip when the site's enclosing component is in that chip's render chain and,
 * where the site's label is a literal, the text is equal. A templated label
 * (`{p}`, `{verb.label}`) matches every chip of its component, so for those
 * the size is the component's, which the table shows. A site with no match was
 * rendered on no screen this run reached: listed, with the source's
 * prediction, and NOT counted as either size.
 */
function joinSites(st) {
  // EACH CHIP BELONGS TO ONE COMPONENT: the nearest name in its render chain
  // that is some call site's enclosing component. Matching any name in the
  // chain let LevelWorkspace's `{l.toUpperCase()}` (FG/BG) claim the Effects
  // option bar's chips, because that bar renders inside LevelWorkspace too.
  const enclosingSet = new Set(st.sites.map((s) => s.enclosing).filter(Boolean));
  const literalsOf = new Map();
  for (const s of st.sites) {
    if (!s.literal || !s.enclosing) continue;
    if (!literalsOf.has(s.enclosing)) literalsOf.set(s.enclosing, new Set());
    literalsOf.get(s.enclosing).add(s.label);
  }
  const measured = [];
  for (const s of screens) for (const ch of s.census.chips) {
    measured.push({ ...ch, comp: ch.names.find((n) => enclosingSet.has(n)) ?? null });
  }
  const rows = st.sites.map((site) => {
    // A literal label takes the chips with that text; a templated one takes
    // the component's chips that no literal site in it already names.
    const hits = measured.filter((m) => site.enclosing && m.comp === site.enclosing
      && (site.literal ? m.text === site.label : !(literalsOf.get(site.enclosing)?.has(m.text))));
    return { ...site, measured: [...new Set(hits.map((h) => h.computed))].sort() };
  });
  const tally = {};
  const unrendered = [];
  for (const r of rows) {
    const k = r.measured.length === 0 ? 'NOT RENDERED' : r.measured.length === 1 ? r.measured[0] : `mixed(${r.measured.join('/')})`;
    tally[k] = (tally[k] ?? 0) + 1;
    if (r.measured.length === 0) unrendered.push(r);
  }
  console.log('\n════ (b) x (a): CALL SITES BY THE SIZE MEASURED FOR THEM (unit: call sites) ════');
  for (const r of rows) {
    console.log(`  ${`${r.file.replace('src/renderer/', '')}:${r.line}`.padEnd(48)} ${r.cls.padEnd(12)} `
      + `${String(r.enclosing).padEnd(22)} ${JSON.stringify(r.label).padEnd(34)} measured ${r.measured.join('/') || '-'}`
      + `${r.measured.length === 0 ? `   (source predicts: ${r.predicted})` : ''}`);
  }
  console.log(`  TOTAL call sites by measured size: ${JSON.stringify(tally)}`);
  console.log(`  NOT RENDERED on any screen reached (${unrendered.length}): `
    + unrendered.map((r) => `${r.file.replace('src/renderer/', '')}:${r.line}${r.inMap ? '(map)' : ''}`).join(', '));
  return { tally, rows };
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const decl = chipDeclaration();
  const st = staticCensus(decl);
  const staticTotals = printStatic(st, decl);
  check('S0', 'the static census found `<Chip` call sites, and every file using one imports it from the ui barrel',
    st.sites.length > 0 && st.importProblems.length === 0 && staticTotals.unknown === 0,
    `sites=${st.sites.length} filesWithoutTheImport=${JSON.stringify(st.importProblems)} unknown=${staticTotals.unknown}`);
  check('S1', 'function Chip declares ONE font size token, and no style object in it carries the `font` shorthand',
    !decl.error && decl.inits.length === 1 && decl.varExpr !== null && decl.shorthands.length === 0,
    decl.error ?? `fontSize initialisers=${JSON.stringify(decl.fontSizes)} -> ${decl.varExpr}; `
      + `font shorthand keys=${JSON.stringify(decl.shorthands)}`);

  const wantsApp = ['aeon', 'classic', 'sprite', 'canvas'].some((p) => PARTS.has(p));
  const notMeasured = [];
  if (wantsApp) {
    const RUN = announceRunRoot(runTarget(ROOT));
    globalThis.__RUN = RUN;
    assertFreshBuild(RUN);
    assertDebugBuild(RUN);
    if (PARTS.has('aeon')) {
      if (!AEON) { skip('aeon', 'the aeon part', 'AEON_DIR is unset (no default: it must be a throwaway copy)'); notMeasured.push('aeon'); }
      else await aeonPart(decl, notMeasured);
    }
    const s1Parts = ['classic', 'sprite', 'canvas'].filter((p) => PARTS.has(p));
    if (s1Parts.length) {
      if (!S1) {
        for (const p of s1Parts) { skip(p, `the ${p} part`, 'S1DISASM_DIR is unset (no default: it must be a throwaway copy)'); notMeasured.push(p); }
      } else await classicSpriteCanvasPart(decl, notMeasured);
    }
  }
  const rendered = screens.length ? printRendered(st) : null;
  const joined = screens.length ? joinSites(st) : null;

  writeFileSync(join(SHOTS, `census-${TAG}.json`), JSON.stringify({
    tag: TAG, declaration: decl, static: { totals: staticTotals, sites: st.sites },
    rendered, joined, screens, notMeasured,
  }, null, 2));

  console.log('\n════ SUMMARY ════');
  console.log(`  (b) call sites: ${JSON.stringify(staticTotals)}`);
  if (rendered) console.log(`  (a) distinct chips: ${rendered.distinctN} ${JSON.stringify(rendered.distinct)}; `
    + `chip-screens ${JSON.stringify(rendered.chipScreens)} over ${rendered.screens} screens`);
  if (joined) console.log(`  (b)x(a) call sites by measured size: ${JSON.stringify(joined.tally)}`);
  console.log(`  NOT MEASURED: ${notMeasured.length ? notMeasured.join(', ') : '(none)'}`);
  console.log(`  census json: ${relative(ROOT, join(SHOTS, `census-${TAG}.json`))}`);
  console.log(`\n${results.length - fails.length}/${results.length} rows passed`
    + (fails.length ? ` · FAILED: ${fails.join(', ')}` : '')
    + (skips.length ? ` · NOT MEASURED (skipped): ${skips.join(', ')}` : ''));
  process.exitCode = fails.length ? 1 : 0;
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
