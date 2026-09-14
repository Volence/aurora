// THE SIZE THE `Chip` PRIMITIVE DECLARES, READ OUT OF ITS SOURCE.
//
// One derivation for every instrument that compares a painted chip with what
// the primitive says it paints (d-36-chip-font-size-answered): the chip census
// (chip-font-census-harness.mjs row S1 and the per-part `.1` rows),
// chunk-links-harness.mjs row 4b, chunk-row9-probe.mjs's copy of that row, and
// cdp-sweep-4-0912-harness.mjs's CL.FONT finding. Before this module each of
// them spelled the expectation its own way: two read `--text-xs-size` by name
// and one matched the button's style line with a regex, so a primitive that
// moved to another token would have left them measuring against the old one.
//
// It parses `function Chip` with the TypeScript compiler and reads, in every
// object literal inside it:
//   fontSizes   each `fontSize:` key and its initialiser text (`T.tBase`)
//   shorthands  each `font:` key. A shorthand written after a longhand resets
//               that longhand; that is how the button branch painted its
//               container's size under a declared 11px until 2026-09-13.
// and resolves the single initialiser `T.<token>` through theme.ts to the CSS
// custom property it names (`var(--text-base-size)`). The px value is NOT
// resolved here: a CDP instrument reads that property from the live document,
// so the expectation follows the token and the token's value both.
//
// LOUD, NEVER A DEFAULT. No `function Chip`, two different initialisers, an
// initialiser that is not `T.<token>`, or a token theme.ts does not map to
// exactly one `var(--x)`: each leaves `token`/`varExpr` null and says why in
// `problem`, and every consumer fails its row on a null.
//
// `sources` lets a caller pass the text itself, for an instrument that reads
// from the committed HEAD (cdp-sweep-4 does, so a working-tree plant cannot
// move its expectation).

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHIP_PRIMITIVES = 'src/renderer/components/ui/primitives.tsx';
export const CHIP_THEME = 'src/renderer/components/ui/theme.ts';

export function chipDeclaredSize(root, sources = {}) {
  const require = createRequire(join(root, 'package.json'));
  const ts = require('typescript');
  const src = sources.primitives ?? readFileSync(join(root, CHIP_PRIMITIVES), 'utf8');
  const theme = sources.theme ?? readFileSync(join(root, CHIP_THEME), 'utf8');
  const sf = ts.createSourceFile(CHIP_PRIMITIVES, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const out = { fontSizes: [], shorthands: [], inits: [], token: null, cssVar: null, varExpr: null, problem: null };

  let fn = null;
  sf.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === 'Chip') fn = n; });
  if (!fn) { out.problem = `${CHIP_PRIMITIVES} has no top-level function Chip`; return out; }

  const walk = (n) => {
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) {
      const k = n.name.text;
      if (k === 'fontSize') out.fontSizes.push({ line: lineOf(n), init: n.initializer.getText(sf) });
      if (k === 'font') out.shorthands.push({ line: lineOf(n), init: n.initializer.getText(sf) });
    }
    ts.forEachChild(n, walk);
  };
  walk(fn);

  out.inits = [...new Set(out.fontSizes.map((f) => f.init))];
  if (out.inits.length !== 1) {
    out.problem = `function Chip declares ${out.inits.length} different font sizes: ${JSON.stringify(out.inits)}`;
    return out;
  }
  const m = /^T\.(\w+)$/.exec(out.inits[0]);
  if (!m) { out.problem = `function Chip's fontSize is ${out.inits[0]}, not a T.<token>`; return out; }
  const hits = [...theme.matchAll(new RegExp(`\\b${m[1]}:\\s*'(var\\((--[\\w-]+)\\))'`, 'g'))];
  if (hits.length !== 1) {
    out.problem = `${CHIP_THEME} maps T.${m[1]} to ${hits.length} var() values (want exactly 1)`;
    return out;
  }
  out.token = m[1];
  out.varExpr = hits[0][1];
  out.cssVar = hits[0][2];
  return out;
}
