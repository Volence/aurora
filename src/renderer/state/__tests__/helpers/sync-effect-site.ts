// WHERE `ComposerCanvas` ASKS FOR THE LIBRARY RE-SYNC, READ AS A PROPERTY OF
// ITS SYNTAX TREE, NEVER AS A COPY OF ITS TEXT.
//
// ROADMAP row 195 (SOURCE-PINNING-ROWS). Rows [F2] (chunk-doc-commit.test.ts)
// and [K0] (chunk-doc-sync-key.test.ts) used to assert the call site by copying
// the whole source line into a regex / `toContain`. Before 2026-09-12 [F2]'s copy
// was of the BROKEN line (`[historyVersion, open]`), so it was green BECAUSE the
// defect was there and went red on the fix. The fix re-aimed both copies at the
// corrected line, which is the same shape: a reformat, an extracted `const`, an
// aliased import or a renamed local all turn them red while the behaviour is
// unchanged, and nothing about them says whether the KEY is right.
//
// What this reads instead is what the line must HOLD:
//   1. every call of the re-sync function sits inside a `useEffect` callback;
//   2. that effect's dependency list resolves (through `const` bindings in the
//      same file) to a call of the key function, not to an array literal;
//   3. the key's first argument resolves to a call of the history-clock hook;
//   4. its second resolves to a read of the art store's open-document field.
// Every name is supplied by the caller from the modules the product imports,
// and every import is matched by RESOLVED PATH, so a rename in the owning
// module flows through and an alias in the component is followed.
//
// LOUD WHEN IT CANNOT MEASURE: a name the component does not import, a `const`
// declared more than once (so a binding cannot be resolved by name), or zero
// call sites are reported in `unmeasurable`, and callers fail on a non-empty
// list. It is still a SOURCE read: it proves the call is wired to the right key,
// never that React runs the effect (that is `harness:chunk-links` row 9).

import ts from 'typescript';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as chunkDocCommit from '../../chunk-doc-commit';
import * as historyHooks from '../../../hooks/useHistoryVersion';
import * as artStoreModule from '../../artStore';

/** An imported binding: the export's name in its module, and that module's path without extension. */
export interface Binding { exportName: string; modulePath: string }

export interface SyncEffectSpec {
  /** Absolute path of the component file being read. */
  file: string;
  /** Its text. */
  source: string;
  /** The re-sync function whose call sites are judged. */
  sync: Binding;
  /** The key function the effect's deps must resolve to. */
  key: Binding;
  /** The hook whose value is the history clock (the key's first argument). */
  clock: Binding;
  /** The store hook whose selector yields the open document (the key's second argument). */
  store: Binding;
  /** The store field the selector must read. */
  openField: string;
  /** Where `useEffect` comes from. */
  react: string;
}

export interface SyncCallSite {
  line: number;
  /** Properties 1 and 2's container half: the call is inside an effect that HAS a dependency list. Empty when held. */
  effect: string[];
  /** Properties 2-4: that dependency list is the key, called on the clock and the open document. Empty when held. */
  key: string[];
}

export interface SyncEffectReport {
  sites: SyncCallSite[];
  unmeasurable: string[];
}

const stripExt = (p: string) => p.replace(/\.(tsx?|mjs|js)$/, '');

export function readSyncEffectSites(spec: SyncEffectSpec): SyncEffectReport {
  const unmeasurable: string[] = [];
  const sf = ts.createSourceFile(spec.file, spec.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dir = dirname(spec.file);

  // local name -> binding, from the named imports
  const imports = new Map<string, Binding>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec0 = st.moduleSpecifier.text;
    const modulePath = spec0.startsWith('.') ? stripExt(resolve(dir, spec0)) : spec0;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        imports.set(el.name.text, { exportName: (el.propertyName ?? el.name).text, modulePath });
      }
    }
  }
  const localOf = (b: Binding, what: string): string | null => {
    for (const [local, got] of imports) {
      if (got.exportName === b.exportName && got.modulePath === stripExt(b.modulePath)) return local;
    }
    unmeasurable.push(`${what}: ${spec.file} does not import \`${b.exportName}\` from ${b.modulePath}`);
    return null;
  };
  const syncLocal = localOf(spec.sync, 'sync');
  const keyLocal = localOf(spec.key, 'key');
  const clockLocal = localOf(spec.clock, 'clock');
  const storeLocal = localOf(spec.store, 'store');
  const effectLocal = localOf({ exportName: 'useEffect', modulePath: spec.react }, 'useEffect');
  if (!syncLocal || !keyLocal || !clockLocal || !storeLocal || !effectLocal) return { sites: [], unmeasurable };

  // name -> initializers of every `const`/`let` of that name in the file
  const decls = new Map<string, ts.Expression[]>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      decls.set(n.name.text, [...(decls.get(n.name.text) ?? []), n.initializer]);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const unwrap = (e: ts.Expression): ts.Expression => {
    let x = e;
    while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x)
      || ts.isSatisfiesExpression(x)) x = x.expression;
    return x;
  };
  /** Follow `const` bindings by name; a name bound twice is unresolvable, and says so. */
  const resolveExpr = (e: ts.Expression, depth = 0): ts.Expression => {
    const x = unwrap(e);
    if (depth < 8 && ts.isIdentifier(x) && decls.has(x.text)) {
      const inits = decls.get(x.text)!;
      if (inits.length !== 1) {
        unmeasurable.push(`\`${x.text}\` is declared ${inits.length} times in ${spec.file}; `
          + 'a binding cannot be resolved by name, so the site cannot be judged');
        return x;
      }
      return resolveExpr(inits[0], depth + 1);
    }
    return x;
  };
  const isCallTo = (e: ts.Expression, local: string): e is ts.CallExpression =>
    ts.isCallExpression(e) && ts.isIdentifier(unwrap(e.expression)) && (unwrap(e.expression) as ts.Identifier).text === local;
  const show = (n: ts.Node) => n.getText(sf).replace(/\s+/g, ' ');

  const sites: SyncCallSite[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && isCallTo(n, syncLocal)) {
      const effectProblems: string[] = [];
      const keyProblems: string[] = [];
      let fn: ts.Node | undefined = n.parent;
      while (fn && !ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn) && !ts.isFunctionDeclaration(fn)) fn = fn.parent;
      const effect = fn?.parent;
      if (!fn || !effect || !ts.isCallExpression(effect) || !isCallTo(effect, effectLocal) || effect.arguments[0] !== fn) {
        effectProblems.push(`called outside a \`${effectLocal}\` callback`);
      } else if (!effect.arguments[1]) {
        effectProblems.push(`its \`${effectLocal}\` has NO dependency list, so it runs after every render`);
      } else {
        const deps = resolveExpr(effect.arguments[1]);
        if (!isCallTo(deps, keyLocal)) {
          keyProblems.push(`its dependency list is \`${show(deps)}\`, not a call of \`${keyLocal}\``);
        } else {
          const [a0, a1] = deps.arguments;
          const clock = a0 && resolveExpr(a0);
          if (!clock || !isCallTo(clock, clockLocal)) {
            keyProblems.push(`the key's first argument is \`${clock ? show(clock) : 'missing'}\`, not the history clock \`${clockLocal}()\``);
          }
          const open = a1 && resolveExpr(a1);
          const selector = open && isCallTo(open, storeLocal) ? open.arguments[0] : undefined;
          const body = selector && (ts.isArrowFunction(selector) && !ts.isBlock(selector.body)) ? unwrap(selector.body) : undefined;
          if (!body || !ts.isPropertyAccessExpression(body) || body.name.text !== spec.openField) {
            keyProblems.push(`the key's second argument is \`${open ? show(open) : 'missing'}\`, not a \`${storeLocal}\` read of \`.${spec.openField}\``);
          }
        }
      }
      sites.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, effect: effectProblems, key: keyProblems });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (sites.length === 0) {
    unmeasurable.push(`no call of \`${syncLocal}\` in ${spec.file}: deleted, or this reader is blind to its shape`);
  }
  return { sites, unmeasurable };
}

// ── the one spec both rows read ─────────────────────────────────────────────
//
// Every export name is looked up BY IDENTITY in the module the product imports
// (a function's `.name` is not trusted: a zustand hook has none worth reading),
// so renaming `chunkDocSyncKey` in its module moves this with it. `openField`
// is typed as a key of the art store's state, so `npm run typecheck` refuses it
// the day the field is renamed.

const OPEN_FIELD: keyof ReturnType<typeof artStoreModule.useArtStore.getState> = 'open';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

function exportNameOf(mod: Record<string, unknown>, value: unknown, what: string): string {
  const hits = Object.entries(mod).filter(([, v]) => v === value).map(([k]) => k);
  if (hits.length !== 1) throw new Error(`cannot derive the export name of ${what}: ${hits.length} exports hold it`);
  return hits[0];
}

export function composerSyncReport(): SyncEffectReport {
  const file = here('../../../components/art/ComposerCanvas.tsx');
  return readSyncEffectSites({
    file,
    source: readFileSync(file, 'utf8'),
    sync: {
      exportName: exportNameOf(chunkDocCommit, chunkDocCommit.syncChunkDocFromLibrary, 'the re-sync function'),
      modulePath: here('../../chunk-doc-commit'),
    },
    key: {
      exportName: exportNameOf(chunkDocCommit, chunkDocCommit.chunkDocSyncKey, 'the sync key'),
      modulePath: here('../../chunk-doc-commit'),
    },
    clock: {
      exportName: exportNameOf(historyHooks, historyHooks.useAeonHistoryVersion, 'the history clock'),
      modulePath: here('../../../hooks/useHistoryVersion'),
    },
    store: {
      exportName: exportNameOf(artStoreModule, artStoreModule.useArtStore, 'the art store hook'),
      modulePath: here('../../artStore'),
    },
    openField: OPEN_FIELD,
    react: 'react',
  });
}
