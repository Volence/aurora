/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO EFFECTS CONTROLS, AIMED BY WHAT THE APP'S SOURCE SAYS THEY ARE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TIMELINE-HARNESS-AIM-DRIFT, 2026-09-12. Both controls below were aimed by a
 * string copied out of the DOM, and both strings went stale:
 *
 *   - the layer card's vsplit toggle, aimed by the title prefix
 *     `Layer N vsplit.at <dash>`. The app composes that title as
 *     `Layer ${i} ${LAYER_VSPLIT_ROW.title}` (EffectsScenePanel.tsx), and
 *     `LAYER_VSPLIT_ROW.title` now begins `vsplit.at: the Plane B row ...`
 *     (providers/effects-aeon.ts).
 *   - the preset's program switch, aimed by the row labelled `Raster`. The row
 *     is labelled `Program` since EW-BOUNDARY-PANEL (BandPresetPanel.tsx), and
 *     the label followed a change in what the list offers.
 *
 * Retyping either would book the same repair for the next rename. So:
 *
 * THE VSPLIT CONTROLS are read out of the two files that compose their titles.
 * A `.mjs` harness cannot import TypeScript, so this READS the source text with
 * its own patterns and THROWS, naming the file, if the shape it reads moves.
 * That keeps it from quietly aiming at a stale prefix. The patterns are pinned
 * against the app's real constants by `test/harness-effects-control-aims.test.ts`,
 * so a reshape goes red in `npm test` and not only at the next hand run.
 *
 * THE PROGRAM SWITCH is aimed by what it IS, not by what it is called: the one
 * `<select>` whose option VALUES are exactly the preset contract's program
 * arms. The arms are the single `required` key of each top-level `oneOf` branch
 * of the vendored preset schema. That is the same derivation as
 * `EFFECTS_PRESET_PROGRAM_ARMS` (core/formats/effects/preset.ts), done here
 * independently, which makes this a second reading of the contract and not a
 * copy of the module's. The row's label can move again without this noticing,
 * and that is the point: the label has already moved once.
 *
 * ═══ AND THE THIRD, ADDED BY RAMP-RIG-DCB-NEEDLE, 2026-09-12 ═══════════════
 *
 * THE BAND-CONTROLS REFUSAL is not an aim at all — it is an EXPECTATION, the
 * sentence `[dc-b]`/`[dc-c]` of `scratchpad/ramp-control-harness.mjs` require
 * the panel to paint. It was four hand-typed fragments, and one of them
 * (`EXACTLY ONE raster program`) died on 2026-09-04 when `46bfbb58` dropped the
 * word `raster` from the sentence on purpose: `boundary` joined the `oneOf` and
 * lowers into `ep_patched`, so the exclusivity rule is about PROGRAMS and not
 * about raster programs. The row then asked for a phrase nothing produces and
 * measured the remaining three.
 *
 * `bandRefusalNeedles` reads the sentence out of `bandControlsRefusal` itself,
 * so the next rewording moves the expectation with the app instead of booking
 * another repair. It is a READER, not a copy: a hand-typed needle here would be
 * the same defect one rewording later.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where `LAYER_VSPLIT_ROW` (and so the toggle's title) is declared. */
export const VSPLIT_ROW_SOURCE = 'src/renderer/providers/effects-aeon.ts';
/** Where the layer card composes `Layer ${i} ...` titles for both vsplit controls. */
export const SCENE_PANEL_SOURCE = 'src/renderer/components/effects/EffectsScenePanel.tsx';
/** The vendored preset contract the program arms are read from. */
export const PRESET_SCHEMA_SOURCE = 'src/core/formats/effects/aurora-effects-preset.schema.json';

/** The toggle's composition, as the panel spells it. Matched exactly. */
export const VSPLIT_SELECT_COMPOSITION = '<Select title={`Layer ${i} ${LAYER_VSPLIT_ROW.title}`}';

/**
 * The vsplit row's two controls, as title PREFIXES per layer index.
 *
 *   select(i)  -> `Layer ${i} ` + the literal head of LAYER_VSPLIT_ROW.title,
 *                 i.e. everything before its first interpolation or `+`.
 *   spinner(i) -> `Layer ${i} ` + the literal text the panel writes before
 *                 `${EFFECTS_VSPLIT_AT_BOUNDS.min}` in the row spinner's title.
 *
 * A prefix, not the whole title: the title's tail interpolates the schema's
 * bounds, and the head is already unique on a layer card (the strict aim that
 * consumes it refuses a second match).
 */
export function vsplitAims(root) {
  const rowSrc = readFileSync(join(root, VSPLIT_ROW_SOURCE), 'utf8');
  const panelSrc = readFileSync(join(root, SCENE_PANEL_SOURCE), 'utf8');
  // `[^}]*?` keeps the match inside the frozen object literal: none of its
  // keys before `title` carries a brace.
  const head = /export const LAYER_VSPLIT_ROW = Object\.freeze\(\{[^}]*?\btitle:\s*`([^`$]*)/.exec(rowSrc);
  const composed = panelSrc.includes(VSPLIT_SELECT_COMPOSITION);
  const spin = /<NumberField title=\{`Layer \$\{i\} ([^`$]*)\$\{EFFECTS_VSPLIT_AT_BOUNDS\.min\}/.exec(panelSrc);
  const missing = [];
  if (!head || head[1].trim().length === 0) {
    missing.push(`${VSPLIT_ROW_SOURCE}: LAYER_VSPLIT_ROW with a template-literal \`title\``);
  }
  if (!composed) missing.push(`${SCENE_PANEL_SOURCE}: \`${VSPLIT_SELECT_COMPOSITION}\``);
  if (!spin || spin[1].trim().length === 0) {
    missing.push(`${SCENE_PANEL_SOURCE}: a \`<NumberField title={\`Layer \${i} ...\${EFFECTS_VSPLIT_AT_BOUNDS.min}\``);
  }
  if (missing.length) {
    throw new Error('effects-control-aims: the vsplit controls\' titles are no longer composed in the '
      + `shape this reads them from. Missing: ${missing.join('; ')}. Re-read the source and update the `
      + 'pattern. Do NOT retype the title as a literal: that is the drift this module exists to end.');
  }
  return Object.freeze({
    titleHead: head[1],
    spinnerHead: spin[1],
    select: (i) => `Layer ${i} ${head[1]}`,
    spinner: (i) => `Layer ${i} ${spin[1]}`,
    where: `${SCENE_PANEL_SOURCE} composing LAYER_VSPLIT_ROW.title from ${VSPLIT_ROW_SOURCE}`,
  });
}

/**
 * The preset contract's program arms, sorted: the one `required` key of each
 * top-level `oneOf` branch. Throws, naming the file, if that shape moves.
 */
export function programArms(root) {
  const schema = JSON.parse(readFileSync(join(root, PRESET_SCHEMA_SOURCE), 'utf8'));
  const branches = schema.oneOf;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error(`effects-control-aims: ${PRESET_SCHEMA_SOURCE} carries no top-level oneOf, which is `
      + 'where the program arms are read from. Re-read the schema; do NOT hardcode the arm names.');
  }
  const names = branches.map((b, i) => {
    if (!b || !Array.isArray(b.required) || b.required.length !== 1 || typeof b.required[0] !== 'string') {
      throw new Error(`effects-control-aims: ${PRESET_SCHEMA_SOURCE} oneOf[${i}] is not the `
        + 'single-`required` shape the program arms are read from. Re-read the schema.');
    }
    return b.required[0];
  });
  return Object.freeze(names.slice().sort());
}

// ═══════════════════════════════════════════════════════════════════════════
// THE BAND-CONTROLS REFUSAL, READ OUT OF THE FUNCTION THAT COMPOSES IT
// ═══════════════════════════════════════════════════════════════════════════

/** Where `bandControlsRefusal` and `PROGRAM_ARM_NOUNS` are declared. */
export const BAND_REFUSAL_SOURCE = 'src/renderer/providers/effects-preset.ts';

/**
 * A substitution this reader deliberately does not resolve: it ENDS the needle
 * it is in and starts the next one. Used for the clause whose presence depends
 * on the raster/patched partition — a partition this module does not duplicate,
 * because duplicating it would be a second source of truth for the very thing
 * the app split in two on the day this needle broke.
 */
const SPLIT = Symbol('split');

/**
 * THE LITERAL RUNS OF A JS STRING EXPRESSION, joined across `+` and split at
 * every `${...}`.
 *
 * Returns `{ runs, substs }` with `runs.length === substs.length + 1`: the text
 * before the first substitution, between each pair, and after the last. The
 * substitutions come back as RAW SOURCE, for the caller to resolve or split on.
 *
 * ⚠ IT IS A SCANNER, NOT A REGEX, and that is the whole reason it exists. The
 * sentence it reads is five `+`-joined chunks spanning two nested ternaries,
 * with escaped quotes (`schema\'s`) and a `${noun}` inside a branch. A regex
 * over that either matches one chunk — which is how a needle gets retyped one
 * fragment at a time — or matches across a quote it did not know was quoted.
 */
function literalRuns(src, whose) {
  const runs = [];
  const substs = [];
  let cur = '';
  let i = 0;
  /**
   * Skip a nested string/template/brace group, returning the index past it.
   *
   * ⚠ THE CLOSER IS TESTED FIRST. It was tested last for one draft, so inside a
   * template a CLOSING backtick matched the "a quote opens a nested string"
   * arm, recursed on itself, and the reader blew its stack on a sentence that
   * was perfectly well formed.
   */
  const skipTo = (from, close) => {
    let j = from;
    let depth = 0;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '\\') { j += 2; continue; }
      if (close !== '}' && ch === close) return j + 1;
      if (close === '`' && ch === '$' && src[j + 1] === '{') { j = skipTo(j + 2, '}'); continue; }
      if (close === '}') {
        if (ch === "'" || ch === '"' || ch === '`') { j = skipTo(j + 1, ch); continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { if (depth === 0) return j + 1; depth--; }
      }
      j++;
    }
    throw new Error(`effects-control-aims: ${whose} has an unterminated ${close} — the reader cannot `
      + 'tell where the sentence ends. Re-read the source.');
  };
  const unescape = (s) => s.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch));
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      const end = skipTo(i + 1, ch);
      cur += unescape(src.slice(i + 1, end - 1));
      i = end;
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { cur += unescape(src.slice(j, j + 2)); j += 2; continue; }
        if (src[j] === '`') { j++; break; }
        if (src[j] === '$' && src[j + 1] === '{') {
          const end = skipTo(j + 2, '}');
          runs.push(cur);
          cur = '';
          substs.push(src.slice(j + 2, end - 1));
          j = end;
          continue;
        }
        cur += src[j];
        j++;
      }
      i = j;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    i++;
  }
  runs.push(cur);
  return { runs, substs };
}

/**
 * Resolve one `${...}` against `env`, following a ternary into the branch `env`
 * says is taken. THROWS on anything it has no entry for, rather than dropping
 * it: an unresolved substitution silently swallowed is a needle that quietly
 * stops asserting the clause it was written for.
 */
function resolveSubst(srcText, env, whose) {
  const key = srcText.trim().replace(/\s+/g, ' ');
  if (Object.prototype.hasOwnProperty.call(env, key)) return env[key];
  // A ternary: find its `?` and `:` at depth 0, outside every quote.
  let depth = 0;
  let q = -1;
  let colon = -1;
  for (let i = 0; i < srcText.length; i++) {
    const ch = srcText[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      while (i < srcText.length && srcText[i] !== ch) i += srcText[i] === '\\' ? 2 : 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0 && ch === '?' && q < 0) q = i;
    else if (depth === 0 && ch === ':' && q >= 0 && colon < 0) colon = i;
  }
  if (q < 0 || colon < 0) {
    throw new Error(`effects-control-aims: ${whose} interpolates \`${key}\`, which this reader has no `
      + 'value for and which is not a ternary it can follow. Give it an entry (or SPLIT) rather than '
      + 'letting the needle quietly stop asserting that clause.');
  }
  const cond = resolveSubst(srcText.slice(0, q), env, whose);
  // A SPLIT condition splits the whole ternary: neither branch is asserted, and
  // the needle ends here rather than guessing which clause the app paints.
  if (cond === SPLIT) return SPLIT;
  if (typeof cond !== 'boolean') {
    throw new Error(`effects-control-aims: ${whose}'s condition \`${srcText.slice(0, q).trim()}\` `
      + `resolved to ${JSON.stringify(cond)}, not a boolean, so the reader cannot say which branch `
      + 'the app takes.');
  }
  return { branch: cond ? srcText.slice(q + 1, colon) : srcText.slice(colon + 1) };
}

/** `{runs, substs}` + `env` → the needles: text joined across resolutions, cut at each SPLIT. */
function needlesFrom(parsed, env, whose) {
  const out = [];
  let cur = parsed.runs[0];
  for (let k = 0; k < parsed.substs.length; k++) {
    const v = resolveSubst(parsed.substs[k], env, whose);
    if (v === SPLIT) {
      out.push(cur);
      cur = '';
    } else if (typeof v === 'string') {
      cur += v;
    } else {
      // A ternary branch is itself an expression of literals and `${...}`.
      const sub = needlesFrom(literalRuns(v.branch, whose), env, whose);
      if (sub.length !== 1) {
        throw new Error(`effects-control-aims: ${whose}'s branch \`${v.branch.trim().slice(0, 60)}\` `
          + `reads as ${sub.length} needles, not one; a SPLIT inside a branch is not supported.`);
      }
      cur += sub[0];
    }
    cur += parsed.runs[k + 1];
  }
  out.push(cur);
  return out;
}

/**
 * WHAT THE PANEL MUST PAINT BESIDE A DEAD `Add raster band` CHIP, for a preset
 * whose program arm is `arm` and whose id is `presetId`.
 *
 * Returns `{ noun, search, needles, where }`:
 *
 *   noun     — `PROGRAM_ARM_NOUNS[arm]`, read from the same file.
 *   search   — the sentence's first clause, for FINDING the painted element.
 *              A prefix of `needles[0]`, asserted to be one below.
 *   needles  — every contiguous run of the composed sentence this reader can
 *              resolve. For `ramp` that is two: the unconditional core (which
 *              preset, which program, the exactly-one rule, the no-combinator
 *              reason, and that the band controls cannot write here at all) and
 *              the way out. The optional patched-channel clause between them is
 *              a SPLIT, so it is neither asserted nor accidentally required.
 *
 * ⚠ THE CONVERTIBLE BRANCH IS CHOSEN FROM `PROGRAM_ARM_SEEDS`, not assumed.
 * `bandControlsRefusal` offers "switch the Program row back to bands" only when
 * `programArmSeedRefusal('bands')` is null, which is `'bands' in
 * PROGRAM_ARM_SEEDS`. Read it, because the day bands loses its seed the way out
 * changes and a rig demanding the old one would be red about nothing.
 */
export function bandRefusalNeedles(root, arm, presetId) {
  const src = readFileSync(join(root, BAND_REFUSAL_SOURCE), 'utf8');
  const whose = `${BAND_REFUSAL_SOURCE}: bandControlsRefusal`;
  const nounsM = /export const PROGRAM_ARM_NOUNS: Readonly<Record<string, string>> = \{([^}]*)\}/
    .exec(src);
  // ⚠ `[^\n]*`, NOT `[^=]*`: the declaration's own type is
  // `Record<string, (p: EffectsPreset) => void>` and the fat arrow ate the
  // lazier pattern, which then reported the map as MISSING.
  const seedsM = /const PROGRAM_ARM_SEEDS\b[^\n]*Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(src);
  const fnM = /export function bandControlsRefusal\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src);
  const missing = [];
  if (!nounsM) missing.push('`export const PROGRAM_ARM_NOUNS: Readonly<Record<string, string>> = {`');
  if (!seedsM) missing.push('`const PROGRAM_ARM_SEEDS: ... = Object.freeze({`');
  if (!fnM) missing.push('`export function bandControlsRefusal(...) {`');
  if (missing.length) {
    throw new Error(`effects-control-aims: ${BAND_REFUSAL_SOURCE} no longer declares the band-controls `
      + `refusal in the shape this reads it from. Missing: ${missing.join('; ')}. Re-read the source `
      + 'and update the pattern. Do NOT retype the sentence as a literal: a retyped needle is the '
      + 'defect RAMP-RIG-DCB-NEEDLE repaired.');
  }
  const nouns = {};
  for (const m of nounsM[1].matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)) nouns[m[1]] = m[2];
  const noun = nouns[arm];
  if (typeof noun !== 'string' || noun.length === 0) {
    throw new Error(`effects-control-aims: PROGRAM_ARM_NOUNS has no noun for the "${arm}" arm `
      + `(it names ${JSON.stringify(Object.keys(nouns))}), so the sentence for that arm cannot be `
      + 'composed. Re-read the map.');
  }
  const seedable = [...seedsM[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
  if (!seedable.includes(arm)) {
    throw new Error(`effects-control-aims: PROGRAM_ARM_SEEDS has no seed for "${arm}" `
      + `(it seeds ${JSON.stringify(seedable)}), so this reader is looking at the wrong map.`);
  }
  const RETURN = '\n  return ';
  const ret = fnM[1].slice(fnM[1].indexOf(RETURN) + RETURN.length);
  const parsed = literalRuns(ret, whose);
  const needles = needlesFrom(parsed, {
    'preset.id': presetId,
    noun,
    // NOT resolved: see SPLIT. Whether the patched-channel clause appears turns
    // on the raster/patched partition, which this module does not duplicate.
    'EFFECTS_PRESET_RASTER_CHANNELS.includes(arm)': SPLIT,
    convertible: seedable.includes('bands'),
  }, whose).map((s) => s.trim()).filter((s) => s.length > 0);
  if (needles.length < 2) {
    throw new Error(`effects-control-aims: ${whose} reads as ${needles.length} needle(s) `
      + `(${JSON.stringify(needles)}). The sentence is expected to carry at least the exclusivity `
      + 'core and the way out; one of them has gone. Re-read the function.');
  }
  const search = needles[0].split('. ')[0];
  if (!needles[0].includes(search) || search.length < 20 || search.includes('\n')) {
    throw new Error(`effects-control-aims: the search key derived from ${whose} is `
      + `${JSON.stringify(search)}, which is not a usable single-line prefix of its own needle.`);
  }
  return Object.freeze({ noun, search, needles: Object.freeze(needles), where: whose });
}
