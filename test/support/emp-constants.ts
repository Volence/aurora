/**
 * aeon's `.emp` constants, parsed THE WAY aeon's clip tools parse them (ROADMAP row 234).
 *
 * WHY THIS FILE EXISTS. The clip-fixture markers (test/fixtures/clips/aeon-outputs/
 * *.provenance.json) pin `engine/system/constants.emp` by the VALUES of the constants the
 * clip tools read, not by the file's blob (a blob pin reds on every unrelated constants
 * edit). A value pin is only as good as its parse: a value computed some other way than
 * the tool computes it can stay equal while the tool's answer moves. So there are exactly
 * two parses here, each a transcription of one reader in aeon's tools, and nothing else:
 *
 *   * `ConstantSource`: tools/fg_working_set.py `ConstantSource` (clip_manifest,
 *     fg_page_order and ojz_strip_gen all read through it). Every `const` line of each
 *     loaded file, in load order, FIRST DEFINITION WINS; a name resolves by evaluating its
 *     right-hand side as a Python integer expression over the names it mentions, each
 *     resolved the same way. So a pinned value moves when its own line, any line it
 *     depends on, or an earlier definition of the same name moves, and no other line
 *     can move it.
 *   * `layer_lines.engine_constants`: tools/layer_lines.py's regex, the first
 *     `^pub const NAME = ($hex|decimal)\b` in the whole text. No expressions.
 *
 * TRANSCRIBED, SO HELD TO ITS SOURCE. `PARSER_SOURCE_LINES` lists the lines of aeon's
 * source these two were transcribed from, verbatim. The provenance row requires every one
 * of them at the marker's revision; if aeon rewrites a parser, that row reds and says the
 * transcription is unverified, rather than this file silently computing the old parse.
 *
 * WHERE THE TWO LANGUAGES DIFFER, IT REFUSES. JS and Python disagree on a handful of
 * characters (`^` under the m flag also breaks at \r, U+2028 and U+2029; `\s` and
 * `strip()` disagree on U+0085, U+FEFF and U+001C..U+001F; layer_lines' `\d` and `\b` are
 * Unicode-aware in Python and ASCII in JS). A text containing any of them is
 * refused with a reason (`EmpParseError`), never parsed approximately. So is any
 * expression outside the integer grammar below.
 */

export class EmpParseError extends Error {}

/**
 * The aeon source lines the two parses below transcribe, per file, verbatim (leading
 * whitespace trimmed). Held at the marker's revision by the provenance row.
 */
export const PARSER_SOURCE_LINES: Record<string, string[]> = {
  'tools/fg_working_set.py': [
    '_CONST_RE = re.compile(r"^\\s*(?:pub\\s+)?const\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.+?)\\s*$")',
    'return text.split("//", 1)[0].strip()',
    'expr = re.sub(r"\\$([0-9A-Fa-f]+)", lambda m: str(int(m.group(1), 16)), expr)',
    'expr = re.sub(r"(?<![/])/(?![/])", "//", expr)',
    'm = _CONST_RE.match(_strip_comment(line))',
    'name, expr = m.group(1), m.group(2).rstrip(",")',
    'self._raw.setdefault(name, (expr, path))',
    'for ident in set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", py)):',
    'val = eval(py, {"__builtins__": {}}, env)  # noqa: S307 - closed env',
  ],
  'tools/layer_lines.py': [
    'm = re.search(rf"^pub const {name}\\s*=\\s*(\\$[0-9A-Fa-f]+|\\d+)\\b", text, re.M)',
    'out[name] = int(v[1:], 16) if v.startswith("$") else int(v)',
  ],
};

/** Characters where Python's and JS's regex/strip semantics part. */
const DIVERGENT = /[\r\u0085\u2028\u2029\uFEFF\u001C-\u001F]/;

function refuseDivergent(text: string, file: string): void {
  // \r alone is fine for ConstantSource (universal newlines split it the same way), but
  // layer_lines' `^` is not; refusing it for both keeps one rule. constants.emp has none.
  const m = DIVERGENT.exec(text);
  if (m) {
    throw new EmpParseError(`${file}: contains U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}, `
      + 'where Python and JS parse differently; CANNOT reproduce the tools\' parse faithfully');
  }
}

// ---------------------------------------------------------------------------
// ConstantSource (tools/fg_working_set.py)
// ---------------------------------------------------------------------------

const CONST_RE = /^\s*(?:pub\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/;

/** `_to_python_expr`: `$FF` -> `255`, a lone `/` -> `//`. */
function toPythonExpr(expr: string): string {
  return expr
    .replace(/\$([0-9A-Fa-f]+)/g, (_m, h: string) => BigInt(`0x${h}`).toString())
    .replace(/(?<![/])\/(?![/])/g, '//');
}

export class ConstantSource {
  private readonly raw = new Map<string, { expr: string; file: string }>();
  private readonly values = new Map<string, bigint>();
  private readonly resolving = new Set<string>();

  /** `load_file`: every `const` line, first definition wins. `file` names it in errors. */
  loadText(text: string, file: string): void {
    refuseDivergent(text, file);
    // Python's text-mode `for line in fh` (universal newlines); \r is refused above.
    for (const line of text.split('\n')) {
      const m = CONST_RE.exec(line.split('//')[0].trim());
      if (!m) continue;
      const name = m[1];
      const expr = m[2].replace(/,+$/, '');
      if (!this.raw.has(name)) this.raw.set(name, { expr, file });
    }
  }

  /** Whether a loaded file defines `name` (a `const` line the parse matched). */
  defines(name: string): boolean {
    return this.raw.has(name);
  }

  /** Every name `get` has resolved so far: the asked-for names and all they depend on. */
  resolved(): string[] {
    return [...this.values.keys()];
  }

  /** Every name defined, with the file that won it (first definition). */
  definitions(): { name: string; file: string }[] {
    return [...this.raw].map(([name, d]) => ({ name, file: d.file }));
  }

  /** `get`: resolve a name, loudly (never a default). */
  get(name: string): bigint {
    const done = this.values.get(name);
    if (done !== undefined) return done;
    const def = this.raw.get(name);
    if (def === undefined) throw new EmpParseError(`constant ${name} not found in any loaded .emp source`);
    if (this.resolving.has(name)) throw new EmpParseError(`constant ${name} is defined in terms of itself`);
    this.resolving.add(name);
    try {
      const py = toPythonExpr(def.expr);
      const env = new Map<string, bigint>();
      for (const ident of new Set(py.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])) env.set(ident, this.get(ident));
      const val = evalPyInt(py, env, `${name} = ${def.expr} (${def.file})`);
      this.values.set(name, val);
      return val;
    } finally {
      this.resolving.delete(name);
    }
  }
}

/**
 * Python's integer expression grammar, as far as a `.emp` right-hand side can reach it:
 * `| ^ & << >> + - * // % **`, unary `+ - ~`, parentheses, decimal literals and names.
 * Python precedence and floor semantics, on BigInt. Anything else is REFUSED (Python
 * would either evaluate it to something this does not model, or fail in a way the tool
 * would report); a refusal here reds the row that asked, it never passes.
 */
export function evalPyInt(py: string, env: Map<string, bigint>, what: string): bigint {
  const toks = py.match(/\s+|\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*|\/\/|<<|>>|[-+*%&|^~()]|./g) ?? [];
  const t = toks.filter((x) => !/^\s+$/.test(x));
  let i = 0;
  const fail = (why: string): never => { throw new EmpParseError(`${what}: ${why}; CANNOT reproduce the tools' parse`); };
  const peek = () => t[i];
  const eat = (s: string) => { if (t[i] === s) { i++; return true; } return false; };
  const floorDiv = (a: bigint, b: bigint) => {
    if (b === 0n) fail('division by zero');
    const q = a / b;
    return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
  };
  const floorMod = (a: bigint, b: bigint) => a - b * floorDiv(a, b);
  const shiftCheck = (b: bigint) => { if (b < 0n) fail('negative shift count'); return b; };

  function atom(): bigint {
    const tok = t[i++];
    if (tok === undefined) return fail('expression ends early');
    if (tok === '(') { const v = orExpr(); if (!eat(')')) fail('unbalanced parenthesis'); return v; }
    if (/^\d+$/.test(tok)) {
      if (tok.length > 1 && tok[0] === '0' && /[1-9]/.test(tok)) fail(`"${tok}" is a Python syntax error (leading zero)`);
      return BigInt(tok);
    }
    if (/^[A-Za-z_]/.test(tok)) {
      const v = env.get(tok);
      if (v === undefined) fail(`name ${tok} unresolved`);
      return v!;
    }
    return fail(`token "${tok}" is outside the integer grammar`);
  }
  function power(): bigint {
    const base = atom();
    if (eat('**')) {
      const exp = unary();
      if (exp < 0n) fail('negative exponent yields a float');
      return base ** exp;
    }
    return base;
  }
  function unary(): bigint {
    if (eat('-')) return -unary();
    if (eat('+')) return unary();
    if (eat('~')) return -unary() - 1n;
    return power();
  }
  function term(): bigint {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('//')) v = floorDiv(v, unary());
      else if (eat('%')) v = floorMod(v, unary());
      else return v;
    }
  }
  function arith(): bigint {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }
  function shift(): bigint {
    let v = arith();
    for (;;) {
      if (eat('<<')) v <<= shiftCheck(arith());
      else if (eat('>>')) v >>= shiftCheck(arith());
      else return v;
    }
  }
  function andExpr(): bigint { let v = shift(); while (eat('&')) v &= shift(); return v; }
  function xorExpr(): bigint { let v = andExpr(); while (eat('^')) v ^= andExpr(); return v; }
  function orExpr(): bigint { let v = xorExpr(); while (eat('|')) v |= xorExpr(); return v; }

  const v = orExpr();
  if (i !== t.length) fail(`unexpected "${peek()}"`);
  return v;
}

// ---------------------------------------------------------------------------
// layer_lines.engine_constants (tools/layer_lines.py)
// ---------------------------------------------------------------------------

/** The first `^pub const NAME = ($hex|dec)\b` in the text, as layer_lines reads it. */
export function layerLinesConstant(text: string, file: string, name: string): bigint {
  refuseDivergent(text, file);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new EmpParseError(`${name}: not a constant name`);
  // Python's `\d` and `\b` are Unicode-aware: any `pub const NAME` line whose code carries a
  // non-ASCII character is where the two could answer differently, so it is refused.
  for (const at of text.matchAll(new RegExp(`^pub const ${name}`, 'gm'))) {
    const rest = text.slice(at.index, at.index + 200).split('//')[0];
    if (/[^\x00-\x7F]/.test(rest)) {
      throw new EmpParseError(`${file}: a \`pub const ${name}\` line carries a non-ASCII character before its comment; CANNOT reproduce layer_lines' Unicode regex faithfully`);
    }
  }
  const m = new RegExp(`^pub const ${name}\\s*=\\s*(\\$[0-9A-Fa-f]+|\\d+)\\b`, 'm').exec(text);
  if (!m) throw new EmpParseError(`L5 ${file} no longer defines ${name}`);
  const v = m[1];
  return v.startsWith('$') ? BigInt(`0x${v.slice(1)}`) : BigInt(v);
}

/**
 * The index of the line that FIRST defines `name` under ConstantSource's own match (the
 * definition that wins), or -1. For planting an edit on exactly that line.
 */
export function definingLine(text: string, name: string): number {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = CONST_RE.exec(lines[i].split('//')[0].trim());
    if (m && m[1] === name) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// A marker's value pin
// ---------------------------------------------------------------------------

export type EmpParse = 'ConstantSource' | 'layer_lines.engine_constants';
export const EMP_PARSES: readonly EmpParse[] = ['ConstantSource', 'layer_lines.engine_constants'];

/** One reader context: the parse, the files it loads (in order), the pinned values. */
export interface EmpReader { parse: EmpParse; loads: string[]; values: Record<string, number> }

/**
 * Evaluate every pinned name of `reader` over `read(path)` (the file's text at some
 * revision). Returns name -> value, or name -> the refusal text; never throws for one
 * name's failure, so a caller can name every moved constant at once.
 */
export function readerValues(reader: EmpReader, read: (path: string) => string): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const texts = reader.loads.map((p) => ({ p, text: read(p) }));
  let src: ConstantSource | null = null;
  if (reader.parse === 'ConstantSource') {
    src = new ConstantSource();
    for (const { p, text } of texts) src.loadText(text, p);
  } else if (reader.parse !== 'layer_lines.engine_constants' || texts.length !== 1) {
    throw new EmpParseError(`reader ${reader.parse} over ${reader.loads.join(', ')}: not a parse this file transcribes`);
  }
  for (const name of Object.keys(reader.values)) {
    try {
      const v = src !== null ? src.get(name) : layerLinesConstant(texts[0].text, texts[0].p, name);
      if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
        out[name] = `${v} does not fit a JSON number exactly`;
      } else out[name] = Number(v);
    } catch (e) {
      if (!(e instanceof EmpParseError)) throw e;
      out[name] = e.message;
    }
  }
  return out;
}
