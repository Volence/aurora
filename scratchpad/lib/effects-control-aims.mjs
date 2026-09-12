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
