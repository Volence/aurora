// ═══════════════════════════════════════════════════════════════════════════
// d-31: THE CONFIRM DIALOG FOCUSES CANCEL, AND NEVER A DESTRUCTIVE BUTTON
// ═══════════════════════════════════════════════════════════════════════════
//
// Card `d-31-confirm-dialog-focuses-nothing`, ruled `focus_cancel_and_guard`.
//
// ⚠ THE MEASUREMENT THIS DEFENDS. `ConfirmDialog` used to focus nothing, and
// that accident was the only reason the app was safe. Plant P3 of
// `docs/reviews/2026-09-04-d27-sprite-rows-meet-dialog.md` §4 added
// `autoFocus={b.tone === 'danger'}` — four characters, the textbook
// accessibility fix — and a bare SPACE in the real app destroyed a sprite:
// 5 frames to 1, 40x40 to 64x64, 224 painted pixels to zero, undo history
// cleared, and the dirty flag reset, so the tab-close, project-open and
// window-close guards all went quiet afterwards too.
//
// ═══ WHAT EACH HALF OF THIS FILE CAN AND CANNOT SEE ═══════════════════════
//
// The node suite has no React, no DOM and no focus, so nothing here reads
// `document.activeElement`. What it CAN do is read source, and the two things
// worth reading source for are different:
//
//   §A THE WIRING, one file.  `ConfirmDialog.tsx` must not contain the P3 shape
//      and must route its focus through `safeFocusIndex`. This is the half that
//      goes RED on P3 itself, in `npm test`, in milliseconds — which matters
//      because the CDP harness that catches it behaviourally lives outside
//      `npm test` and is a much slower alarm than a four-character edit
//      deserves.
//
//   §B THE PERIMETER, every call site.  A guard that proves the dialog focuses
//      `safeFocusIndex`'s pick says nothing about whether that pick is safe at
//      the door you are standing at. So this parses EVERY `ask()` in `src/`
//      with the TypeScript compiler's own parser, reconstructs each button set
//      from the literal the door actually writes, and runs the real
//      `safeFocusIndex` over it. No label is typed here and no site is listed:
//      adding a ninth door adds a row, and adding an all-destructive one turns
//      this red.
//
// Neither half proves a real .focus() happens or that a real Space then answers
// 'cancel'. `scratchpad/confirm-focus-harness.mjs` does that against the real
// app under CDP, reading `document.activeElement`. A green here with that
// harness never run is not a proof.
//
// ═══ AND THE COVERAGE CLAIM IS ITSELF CHECKED ═════════════════════════════
//
// §B's sweep would report a serene green if its walker found zero call sites —
// a rename of `ask` to anything else, or a walk that silently stopped
// descending. So it asserts a FLOOR on how many sites it found and that the
// files it found them in include the known perimeter, and it REFUSES on any
// button-array shape it cannot evaluate rather than skipping it. `[canary]`
// rows run the same analyser over hand-written violating sources and require it
// to report the violation, so a green means the analyser can still fire.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { safeFocusIndex, isDestructiveButton } from '../../components/ui/safe-focus';

const SRC = join(__dirname, '..', '..', '..');            // → src/
const DIALOG = join(SRC, 'renderer', 'shell', 'ConfirmDialog.tsx');

/**
 * The file's CODE, with every comment removed.
 *
 * ⚠ THIS IS NOT TIDINESS, IT IS THE DIFFERENCE BETWEEN A CHECK AND A GREP.
 * `ConfirmDialog.tsx` now carries a header warning that names `autoFocus` and
 * quotes `.focus()`, because the whole point of d-31 is that the next reader
 * must be told about P3. Written naively, every §A row below matched that
 * warning instead of the code — measured: `not.toContain('autoFocus')` went red
 * on the prose telling people not to write it, and the `.focus(` count came
 * back 2 with one call in the file. A guard that a comment can redden is a
 * guard a comment can also GREEN, and the second is silent.
 *
 * `transpileModule` with `jsx: Preserve` is the compiler's own answer: real
 * parse, comments gone, JSX and string contents untouched. It also means a
 * syntax error in the dialog surfaces here rather than as a mysterious miss.
 */
function codeOf(path: string): string {
  const text = readFileSync(path, 'utf8');
  return ts.transpileModule(text, {
    fileName: path,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, removeComments: true, target: ts.ScriptTarget.ESNext },
    reportDiagnostics: false,
  }).outputText;
}

const dialogCode = codeOf(DIALOG);

// ───────────────────────────────────────────────────────────────────────────
// §A  The wiring of the one component that can confer the focus.
// ───────────────────────────────────────────────────────────────────────────

describe('§A [canary] the source reader looks at code, not prose', () => {
  it('drops a comment mentioning autoFocus and keeps a real one', () => {
    const stripped = ts.transpileModule(
      'const a = <b\n  // never write autoFocus here\n  autoFocus={x} />;\n',
      { fileName: 'canary.tsx', compilerOptions: { jsx: ts.JsxEmit.Preserve, removeComments: true } },
    ).outputText;
    expect(stripped).not.toContain('never write');
    expect(stripped).toContain('autoFocus={x}');   // the real one survives
  });

  it('and the dialog it is pointed at is non-empty and is the dialog', () => {
    // A `codeOf` that silently returned '' would green every not.toContain row
    // in §A at once.
    expect(dialogCode.length).toBeGreaterThan(500);
    expect(dialogCode).toContain('export default function ConfirmDialog');
  });
});

describe('§A ConfirmDialog wiring', () => {
  it('contains no autoFocus at all — the exact P3 shape', () => {
    // Deliberately the crudest possible rule, on the smallest possible file.
    // `autoFocus` on ANY control in this dialog puts a button under the Space
    // key before the reader has read the question, and the only autoFocus
    // anybody would plausibly add here is the one P3 measured. The nuance —
    // "autoFocus would be fine on the cancel button" — is true and is still
    // refused, because the safe way to focus cancel is the one line below and
    // having two ways is how the unsafe one comes back.
    expect(dialogCode).not.toContain('autoFocus');
  });

  it('routes its focus through safeFocusIndex and nothing else', () => {
    expect(dialogCode).toContain("from '../components/ui/safe-focus'");
    expect(dialogCode).toContain('safeFocusIndex(request.buttons)');
    // Exactly one .focus() call in the file. A second one is either a duplicate
    // path or a restore-on-close, and both are ways for focus to land somewhere
    // this module never chose.
    expect(dialogCode.match(/\.focus\(/g) ?? []).toHaveLength(1);
  });

  it('re-states the invariant at the DOM call, keyed on tone', () => {
    // The last line of defence: even if safe-focus.ts were changed to return a
    // dangerous index, the component refuses to focus a danger-toned button.
    expect(dialogCode).toContain("target.dataset.tone === 'danger'");
  });

  it('publishes tone and key on each button so a guard need not read labels', () => {
    expect(dialogCode).toContain('data-confirm-key={b.key}');
    expect(dialogCode).toContain("data-tone={b.tone ?? 'neutral'}");
  });

  it('RE-ASSERTS the focus after the browser’s own post-mousedown fix-up', () => {
    // ⚠ NOT BELT-AND-BRACES, AND NOT SAFE TO "SIMPLIFY" AWAY. The tab strip's
    // close ✕ raises this dialog from `onMouseDown`, so the effect focuses
    // Cancel INSIDE the mousedown dispatch and Chromium's default action then
    // clears focus to <body> — measured in the running app, and the reason
    // `scratchpad/confirm-focus-harness.mjs` [d3] was the one red door. A timer
    // callback is the next MACROTASK, ordered strictly after that default
    // action; a microtask is not. The doors that raise the dialog from onClick
    // never show this, so dropping these two lines reddens exactly one of the
    // five CDP doors and nothing in this file — which is why this row exists.
    expect(dialogCode).toContain('setTimeout(apply, 0)');
    expect(dialogCode).toContain('clearTimeout(t)');
    // And it must decline when focus is already inside the panel, or the
    // re-assert would drag a user's own Tab back to Cancel...
    expect(dialogCode).toContain('panel.contains(active)');
    // ...but it must NOT decline to a DESTRUCTIVE focus. Without this clause
    // the early return deferred to whatever already held focus in the panel,
    // including a danger button, so the literal P3 edit defeated the whole fix
    // at four of the five doors the CDP harness reaches (nine rows red, the
    // sprite destroyed by one Space). Measured, then fixed; this row is what
    // stops the clause being tidied away as a redundant condition.
    expect(dialogCode).toContain("active.dataset.tone !== 'danger'");
  });

  it('fires once per request, not on every render', () => {
    // `[request]`, not `[]` and not undefined. On `[]` the dialog focuses only
    // the first request of the session; with no dep array it re-grabs focus on
    // every render and fights a user who has tabbed away.
    expect(dialogCode).toContain('}, [request]);');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §B  Every door, from the button literal the door itself writes.
// ───────────────────────────────────────────────────────────────────────────

interface Btn { key: string; tone?: 'primary' | 'danger' }
interface Site { file: string; line: number; variants: Btn[][] }

/** Every .ts/.tsx under src/, excluding test trees. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** A string literal's text, or REFUSE. */
function str(node: ts.Node, where: string): string {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  throw new Error(`REFUSING: ${where} is not a plain string literal (${ts.SyntaxKind[node.kind]}). `
    + 'A guard that skipped this would report coverage it does not have.');
}

/** One `{ key: 'x', tone: 'danger' }` literal, possibly with `as const`. */
function button(node: ts.Expression, where: string): Btn {
  let n: ts.Expression = node;
  while (ts.isAsExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
  if (!ts.isObjectLiteralExpression(n)) {
    throw new Error(`REFUSING: ${where} is not an object literal (${ts.SyntaxKind[n.kind]}).`);
  }
  const out: Btn = { key: '' };
  let sawKey = false;
  for (const prop of n.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      throw new Error(`REFUSING: ${where} has a property this analyser cannot read.`);
    }
    const name = prop.name.text;
    if (name === 'key') { out.key = str(prop.initializer, `${where}.key`); sawKey = true; }
    else if (name === 'tone') {
      let t: ts.Expression = prop.initializer;
      while (ts.isAsExpression(t) || ts.isParenthesizedExpression(t)) t = t.expression;
      const v = str(t, `${where}.tone`);
      if (v !== 'primary' && v !== 'danger') throw new Error(`REFUSING: unknown tone '${v}' at ${where}`);
      out.tone = v;
    }
    // `label` is prose and is deliberately not read.
  }
  if (!sawKey) throw new Error(`REFUSING: ${where} has no key.`);
  return out;
}

/**
 * The button array, expanded into every set it can actually produce at runtime.
 *
 * Two shapes exist in the tree: a plain element, and
 * `...(cond ? [ {...} ] : [])`, which the two tab-close doors use to drop their
 * Save button when the document has no file to save to. Both branches are real
 * dialogs a user can be looking at, so both become variants — the no-save
 * variant of a tab-close dialog is `[discard(danger), cancel]`, and checking
 * only the other one would leave the harder of the two unmeasured.
 *
 * Anything else REFUSES. Loudly wrong beats quietly narrow.
 */
function variants(arr: ts.ArrayLiteralExpression, where: string): Btn[][] {
  let sets: Btn[][] = [[]];
  const extend = (groups: Btn[][]) => {
    const next: Btn[][] = [];
    for (const s of sets) for (const g of groups) next.push([...s, ...g]);
    sets = next;
  };
  for (const el of arr.elements) {
    if (ts.isSpreadElement(el)) {
      let e: ts.Expression = el.expression;
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      if (!ts.isConditionalExpression(e)) {
        throw new Error(`REFUSING: spread at ${where} is not a conditional this analyser can expand.`);
      }
      const branch = (b: ts.Expression): Btn[] => {
        let x: ts.Expression = b;
        while (ts.isParenthesizedExpression(x)) x = x.expression;
        if (!ts.isArrayLiteralExpression(x)) throw new Error(`REFUSING: spread branch at ${where} is not an array literal.`);
        return x.elements.map((c, i) => button(c, `${where} spread[${i}]`));
      };
      extend([branch(e.whenTrue), branch(e.whenFalse)]);
    } else {
      extend([[button(el, where)]]);
    }
  }
  return sets;
}

/** Every `…ask({ …, buttons: [ … ] })` in one source text. */
function askSites(code: string, label: string): Site[] {
  const sf = ts.createSourceFile(label, code, ts.ScriptTarget.Latest, true,
    label.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'ask'
      && node.arguments.length === 1
      && ts.isObjectLiteralExpression(node.arguments[0])) {
      const obj = node.arguments[0];
      const prop = obj.properties.find((p) =>
        ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'buttons');
      if (prop && ts.isPropertyAssignment(prop)) {
        const line = sf.getLineAndCharacterOfPosition(prop.pos).line + 1;
        const where = `${label}:${line}`;
        if (!ts.isArrayLiteralExpression(prop.initializer)) {
          throw new Error(`REFUSING: buttons at ${where} is not an array literal.`);
        }
        sites.push({ file: label, line, variants: variants(prop.initializer, where) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

const allSites: Site[] = sourceFiles(SRC)
  .flatMap((f) => askSites(readFileSync(f, 'utf8'), relative(SRC, f)));

describe('§B every confirm door in src/', () => {
  it('the walker found the whole known perimeter, not a subset', () => {
    // ⚠ THE ANTI-VACUITY ROW. Everything below is a for-loop over `allSites`,
    // and a for-loop over an empty array is green. The card names six doors;
    // the tree actually has EIGHT ask() sites, because "tab close" is three
    // separate doors (sprite tab, canvas tab, act switch) and ProjectSetupTab's
    // Apply is a door the card does not name at all.
    const files = new Set(allSites.map((s) => s.file));
    for (const f of [
      'renderer/shell/new-sprite-guard.ts',            // New □ + the size chips
      'renderer/providers/chunk-library-import.ts',    // Clear chunks
      'renderer/shell/close-guard.ts',                 // window close
      'renderer/shell/project-open-guard.ts',          // project open
      'renderer/shell/tab-activation/sprite.ts',       // tab close (sprite)
      'renderer/shell/tab-activation/canvas.ts',       // tab close (canvas)
      'renderer/shell/tab-activation/level.ts',        // tab close (act switch)
      'renderer/components/setup/ProjectSetupTab.tsx', // setup Apply
    ]) expect(files).toContain(f);
    expect(allSites.length).toBeGreaterThanOrEqual(8);
  });

  it('never focuses a destructive button, at any door, in any variant', () => {
    for (const site of allSites) {
      for (const buttons of site.variants) {
        const where = `${site.file}:${site.line} [${buttons.map((b) => b.key).join(',')}]`;
        const i = safeFocusIndex(buttons);
        expect(i, `${where}: focuses NOTHING — every option destroys something. `
          + 'Give the door a cancel button.').not.toBeNull();
        expect(isDestructiveButton(buttons[i as number]),
          `${where}: focus lands on the DESTRUCTIVE button '${buttons[i as number].key}'`).toBe(false);
      }
    }
  });

  it('focuses the reserved cancel key at every door', () => {
    // Stronger than "not destructive": at these eight doors the safe answer is
    // the no-op, so a door whose focus drifted onto Save would be reported here
    // even though Save destroys nothing.
    for (const site of allSites) {
      for (const buttons of site.variants) {
        const i = safeFocusIndex(buttons) as number;
        expect(buttons[i].key, `${site.file}:${site.line}`).toBe('cancel');
      }
    }
  });

  it('expands the two-variant doors rather than checking only the easy branch', () => {
    // The tab-close doors drop Save when there is nothing to save to. Both
    // shapes must have been produced, or the spread expansion silently
    // collapsed and the harder variant went unmeasured.
    const multi = allSites.filter((s) => s.variants.length > 1);
    expect(multi.length).toBeGreaterThanOrEqual(2);
    for (const s of multi) {
      const sizes = new Set(s.variants.map((v) => v.length));
      expect(sizes.size, `${s.file}:${s.line} produced ${s.variants.length} identical variants`)
        .toBeGreaterThan(1);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §C  Canaries — could §B ever have failed?
// ───────────────────────────────────────────────────────────────────────────

describe('§C [canary] the analyser fires on a violation', () => {
  const analyse = (code: string) => askSites(code, 'canary.ts')[0].variants
    .map((v) => { const i = safeFocusIndex(v); return i === null ? null : v[i]; });

  it('reports NULL for an all-destructive door', () => {
    expect(analyse(`s.ask({ title: 't', buttons: [
      { key: 'discard', tone: 'danger' },
      { key: 'clear', tone: 'danger' },
    ] });`)).toEqual([null]);
  });

  it('reports the non-cancel pick for a door with no cancel', () => {
    const got = analyse(`s.ask({ title: 't', buttons: [
      { key: 'save', tone: 'primary' },
      { key: 'discard', tone: 'danger' },
    ] });`);
    expect(got[0]?.key).toBe('save');   // not 'cancel' → the §B row above reddens
  });

  it('expands a conditional spread into both branches', () => {
    const got = analyse(`s.ask({ title: 't', buttons: [
      ...(canSave ? [{ key: 'save', label: 'S', tone: 'primary' as const }] : []),
      { key: 'discard', label: 'D', tone: 'danger' as const },
      { key: 'cancel', label: 'C' },
    ] });`);
    expect(got).toHaveLength(2);
    expect(got.every((b) => b?.key === 'cancel')).toBe(true);
  });

  it('REFUSES a shape it cannot evaluate instead of skipping it', () => {
    // The failure mode this rules out is the quiet one: a door written with a
    // computed button list would otherwise contribute zero variants and the
    // suite would stay green while that door went unmeasured.
    expect(() => analyse(`s.ask({ title: 't', buttons: makeButtons() });`))
      .toThrow(/REFUSING/);
    expect(() => analyse(`s.ask({ title: 't', buttons: [ { key: NAME } ] });`))
      .toThrow(/REFUSING/);
    expect(() => analyse(`s.ask({ title: 't', buttons: [ ...others ] });`))
      .toThrow(/REFUSING/);
  });
});
