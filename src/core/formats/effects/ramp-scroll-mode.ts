/**
 * WHICH OF TWO COMPLETELY DIFFERENT EFFECTS A VSRAM `ramp` PRODUCES — and why
 * the answer is not in the ramp document at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ║ THE SAME FIVE NUMBERS ARE EITHER THE WHOLE SCREEN OR A 16-PIXEL SLIVER  ║
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A `ramp` writes VSRAM. VSRAM has TWO MODES, chosen by VDP register $0B bit 2
 * (VSCR):
 *
 *   bit 2 = 0   whole-plane vertical scroll   → the ramp moves the FULL WIDTH
 *   bit 2 = 1   per-column vertical scroll    → the ramp moves ONE 16px column
 *
 * Nothing in `presets/<id>.json` selects that bit. It is selected by the SCENE
 * bound to the section the preset is bound to — a different document, in a
 * different directory, edited in a different panel — so a ramp card that says
 * only what the five keys hold is silent about the single largest fact an
 * author needs: whether they are authoring a full-screen scroll or a sliver.
 *
 * ═══ THE CHAIN, MEASURED HERE AT aeon `ddaab282` ═══════════════════════════
 *
 * Three links, all read out of aeon's own source through git objects at
 * `origin/master` `ddaab282` — this repo's own reading, NOT relayed:
 *
 *   1. `engine/level/scene_dsl.emp:1285-1290`
 *        scene_vdeform_table(None) => 0 ; Columns(tbl, ..) => tbl
 *   2. `engine/level/scene_dsl.emp:2970`
 *        pcfg_v_deform_table_bg: scene_vdeform_table(s.sc_v_deform)
 *   3. `engine/level/parallax.emp:1059-1070`
 *        moveq #%11, d0                      // bits 1:0 — per-line HScroll, ALWAYS
 *        if (Game.SCANLINE_CAPS & CAP_PER_COL_VSRAM) != 0 {
 *            move.l parallax_config.pcfg_v_deform_table_bg(a0), d1
 *            beq    .v_done
 *            ori.b  #%100, d0                // bit 2 — per-column V
 *        }
 *
 * So: **the scene's `v_deform` — and nothing else — raises bit 2.** A scene
 * that spells `v_deform: "none"` (or omits it) lowers `pcfg_v_deform_table_bg`
 * to 0, the `beq` skips the `ori`, and $0B stays `$03`. A scene carrying
 * `v_deform: {columns: …}` attaches a table, the `ori` runs, and $0B reads
 * `$07`. Those are exactly the two values the aeon lane reported reading at
 * capture time (scenes 0-9 → `$03`, scene 10 → `$07`), and the arithmetic above
 * is where they come from: `%11` always, plus `%100` conditionally.
 *
 * ⚠ **IT IS `v_deform`, NOT `deform_fg`/`deform_bg`.** Those are attachment
 * `"shared"` — a plane-wide HORIZONTAL wobble — and they touch no VSRAM mode
 * bit. Keying this sentence on them would be wrong in both directions: a scene
 * with `deform_bg` and no `v_deform` is full-screen, and a scene with
 * `v_deform` and no `deform_bg` is per-column. The one derivation of "does this
 * scene attach a column table" is `vDeformValue` in
 * `renderer/providers/effects-aeon.ts`, and this module's callers use it rather
 * than testing `'none'` a second time.
 *
 * ═══ THE CONJUNCT IS **NOT** UNIVERSALLY INERT, AND THAT IS A CORRECTION ═══
 *
 * The rule as it reached this lane carried a conjunct — the game must declare
 * `CAP_PER_COL_VSRAM` — described as inert, "Aurora only authors for a game
 * that declares it". **Measured at the same revision, that is true of one game
 * and false of the other:**
 *
 *   games/sonic4/config/game.emp:126   SCANLINE_CAPS = $07DE   → bit 1 SET
 *   games/demo/config/game.emp:20      SCANLINE_CAPS = 0       → bit 1 CLEAR
 *   engine/level/scene_dsl.emp:206     CAP_PER_COL_VSRAM = $0002
 *
 * On `demo` the whole `if` block above compiles to nothing, so a scene carrying
 * a `v_deform` would leave $0B at `$03` and the ramp would be full-width
 * regardless. Aurora's project model is aeon's `sonic4` data (its `project.json`
 * declares one zone, `ojz`), so the conjunct holds for every act this editor can
 * open today — but it is a property of the GAME, it is one line away from
 * changing, and a rule that is silently narrower than it looks is how the next
 * reader inherits a wrong one. It is therefore SAID, on the sentence, rather
 * than dropped.
 *
 * ═══ ⚠ THE 16 PIXELS ARE NOT WHERE THE TIDY ANSWER PUTS THEM ═══════════════
 *
 * **RELAYED, not measured here:** at aeon's scene 10 the affected strip was
 * measured on screen at **x = 4..19** — NOT `x = 0..15` — and the aeon lane
 * attributes the offset to the plane's own H-scroll. This module therefore
 * publishes the MEASURED span (`RAMP_SCROLL_COLUMN_SPAN`) and says whose
 * measurement it is, and the sentence tells an author the strip's POSITION is a
 * property of the scene they bind rather than a constant of the ramp. Drawing or
 * describing a tidy `0..15` would be a fabricated number wearing a measurement's
 * clothes.
 *
 * The width is a different kind of fact and is safe to state: per-column VSRAM
 * on an H40 display is 20 column PAIRS of 16 px (`parallax.emp:734-737`,
 * `VSCROLL_COL_PAIRS = SCREEN_WIDTH / 16`, with an `ensure` that it is 20), so
 * "one 16-pixel column" is the granule the hardware has.
 *
 * ═══ THIS SENTENCE IS INDEPENDENT OF THE DISPLAY READOUT, DELIBERATELY ═══
 *
 * ⚠ On 2026-09-03 a real ROM contradicted the ramp card's `top + 1` display
 * span: `{top: 3, lines: 220}` derived 4..223 and the machine rendered 5..223,
 * and a control at `top: 128` derived 129 and measured 130 — the same +1 at two
 * different tops. THAT SETTLED IN THE MEASUREMENT'S FAVOUR (empyrean `e9409dc`):
 * the contract's own sentence was the wrong one, it now reads `top + 2`, Aurora
 * re-vendored it, and the readout derives the corrected number. IT IS NO LONGER
 * CONTESTED — do not re-add a caveat saying it is.
 *
 * What this paragraph is still FOR is the structural claim it was making, which
 * the settlement did not change and which is why nothing in this file needed
 * editing when the number moved: **nothing here reads `rampDisplaySpan`,
 * `ramp.top` or `ramp.lines`, and nothing here depends on the first displayed
 * line being right.** This is a claim about the HORIZONTAL extent of the effect
 * and about which documents decide it; the vertical span it occupies is the
 * readout's business and stays there. Those constants moved and no sentence in
 * this file moved with them — the separation held, measured rather than hoped.
 *
 * ═══ IT DOES NOT GATE, WARN OR REFUSE ═════════════════════════════════════
 *
 * Both arms are legitimate authoring choices — a full-screen VSRAM ramp and a
 * one-column VSRAM ramp are two features, not a feature and a mistake. So every
 * sentence below is a NEUTRAL statement of what the bindings currently produce,
 * no control is disabled by it, and no document is refused because of it. The
 * defect this closes is legibility: the author could not tell which of two very
 * different things they were making.
 *
 * Owner of the sentence: Aurora (this file). Owner of the facts: aeon.
 * Evaluate, do not obey.
 */

/** The three answers a bound section can give. */
export type RampScrollMode = 'full' | 'column' | 'unknown';

/**
 * Why a bound section's mode could not be decided from the documents.
 *
 * ⚠ THIS IS THE CASE THE BRIEF DID NOT LIST, AND IN AEON'S TREE IT IS THE
 * DEFAULT ONE. `Section.sceneRef: null` means "the act default", and the act
 * default is `Act.sceneRef` — which in aeon's own `project.json` is `null`, with
 * no `data/editor/effects/` directory at all. So today, in the real project, the
 * honest answer for a freshly bound section is `act-unset`: the scroll config is
 * the engine's hand-authored `act_parallax_config` in `act_descriptor.emp`,
 * which Aurora does not read. Folding that into either arm would be an assertion
 * about a file this editor has never opened.
 */
export type RampScrollUnknownReason =
  /** `sceneRef` is null and the act names no editor scene either. */
  | 'act-unset'
  /** The section's own `sceneRef` names a scene this project does not have. */
  | 'section-dangling'
  /** The section's own `sceneRef` names a scene file that could not be read. */
  | 'section-unreadable'
  /** The act default names a scene this project does not have. */
  | 'act-dangling'
  /** The act default names a scene file that could not be read. */
  | 'act-unreadable';

/** One section that binds the preset, and what its scene says about the mode. */
export interface RampScrollBinding {
  /** The section index — what `section_N.meta.json` is N of. */
  section: number;
  mode: RampScrollMode;
  /** The scene that decided it, or the ref that failed to resolve, or null. */
  sceneId: string | null;
  /** Whether the scene came from the section's own ref or from the act default. */
  via: 'section' | 'act' | null;
  /** Set exactly when `mode` is `'unknown'`. */
  reason: RampScrollUnknownReason | null;
}

/**
 * The affected strip, AS MEASURED BY THE AEON LANE at their scene 10 — relayed,
 * not measured in this repo.
 *
 * ⚠ IT IS NOT `{first: 0, last: 15}` AND MUST NOT BE "TIDIED" TO IT. The plane's
 * own H-scroll offsets the strip, so the position belongs to the scene, not to
 * the ramp. It is published here so that any surface which ever draws or
 * describes the strip quotes a measurement instead of inventing a round number.
 */
export const RAMP_SCROLL_COLUMN_SPAN = Object.freeze({ first: 4, last: 19 });

/**
 * How wide the strip is, in pixels.
 *
 * Safe to state where the POSITION is not: per-column VSRAM on an H40 display
 * addresses `SCREEN_WIDTH / 16` column pairs, and aeon's `parallax.emp:734-737`
 * carries an `ensure` that the count is 20 — so 16 px is the granule the
 * hardware has, at any H-scroll.
 */
export const RAMP_SCROLL_COLUMN_WIDTH_PX = 16;

/** Where the chain was read, printed inside the hover text. */
export const RAMP_SCROLL_MODE_MEASURED_AT = 'ddaab282';

/** When it was read. */
export const RAMP_SCROLL_MODE_MEASURED_ON = '2026-09-03';

/**
 * The leading words of each arm — a harness and a test find the arm by them, and
 * they are the first thing an author reads.
 *
 * SHORT AND IN THE AUTHOR'S VOCABULARY. "VSCR", "$0B" and "pcfg_v_deform_table_bg"
 * are all true and all belong in the hover; what has to be legible at a glance in
 * a 285px column is *full screen* or *one 16-pixel column*.
 */
export const RAMP_SCROLL_LEAD = Object.freeze({
  full: 'FULL-SCREEN:',
  column: 'ONE 16-PIXEL COLUMN:',
  split: 'TWO DIFFERENT EFFECTS, BY SECTION:',
  unbound: 'FULL-SCREEN OR A 16-PIXEL COLUMN — THE BINDING DECIDES:',
  unknown: 'NOT DECIDED BY ANY DOCUMENT AURORA CAN READ:',
});

/**
 * The mechanism and its provenance — the CONTRACT-length half of the split, on
 * the painted element's own `title`.
 *
 * `presetLimitsShort()`'s idiom, for its reason: this panel once rendered 8,059
 * characters before its first control, and the fix was to paint what an author
 * must act on and keep every other character reachable. The measured chain, the
 * capability conjunct and the relayed-versus-measured split all live here.
 */
export const RAMP_SCROLL_MODE_NOTE: string =
  'A VSRAM ramp has two completely different effects and this document selects neither. '
  + 'VDP register $0B bit 2 (VSCR) chooses whole-plane vertical scroll (0) or per-column (1), '
  + 'and the bit is raised by the SCENE bound to the section this preset is bound to: '
  + 'scene_dsl.emp lowers a scene\'s v_deform to pcfg_v_deform_table_bg (0 for "none", the '
  + 'table otherwise) and parallax.emp ORs in %100 when that pointer is non-null, over a base '
  + `of %11 (per-line HScroll, always) — so $0B reads $03 or $07. Measured in aeon's source at `
  + `origin/master ${RAMP_SCROLL_MODE_MEASURED_AT} on ${RAMP_SCROLL_MODE_MEASURED_ON} `
  + '(scene_dsl.emp:1285-1290 and :2970, parallax.emp:1059-1070). '
  + 'IT IS v_deform AND NOT deform_fg/deform_bg: those are the "shared" plane-wide HORIZONTAL '
  + 'attachment and raise no VSRAM mode bit. '
  + 'THE CONJUNCT, SAID RATHER THAN DROPPED: the register arm is compiled only when the game '
  + 'declares CAP_PER_COL_VSRAM ($0002). sonic4 does (SCANLINE_CAPS = $07DE) and is the data '
  + 'this editor opens; aeon\'s demo game declares 0, and on it a v_deform scene would stay '
  + 'full-width. '
  + 'WHERE THE 16 PIXELS LAND IS RELAYED, NOT MEASURED HERE: the aeon lane measured the strip at '
  + `x = ${RAMP_SCROLL_COLUMN_SPAN.first}-${RAMP_SCROLL_COLUMN_SPAN.last} on their scene 10 — not `
  + 'x = 0-15 — and attributes the offset to the plane\'s own H-scroll, so the position is a '
  + 'property of the scene you bind. The WIDTH is the hardware granule: per-column VSRAM '
  + `addresses 20 pairs of ${RAMP_SCROLL_COLUMN_WIDTH_PX} px on an H40 display. `
  + 'This sentence reads no line numbers: it is about the horizontal extent of the effect and '
  + 'is independent of the ramp\'s display-span readout.';

// ---------------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------------

/** `Section 3`, `Sections 3 and 5`, `Sections 3, 5 and 7`. */
function sectionList(indices: readonly number[]): string {
  const word = indices.length === 1 ? 'Section' : 'Sections';
  if (indices.length === 1) return `${word} ${indices[0]}`;
  return `${word} ${indices.slice(0, -1).join(', ')} and ${indices[indices.length - 1]}`;
}

/** `its scene "sky"`, `their scenes "sky" and "dusk"` — deduplicated. */
function sceneList(bindings: readonly RampScrollBinding[]): string {
  const ids: string[] = [];
  bindings.forEach((b) => { if (b.sceneId !== null && !ids.includes(b.sceneId)) ids.push(b.sceneId); });
  if (ids.length === 0) return 'its scene';
  const quoted = ids.map((i) => `"${i}"`);
  if (ids.length === 1) return `its scene ${quoted[0]}`;
  return `their scenes ${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

/** The `via` clause, so an author knows WHICH document to open. */
function viaClause(bindings: readonly RampScrollBinding[]): string {
  const anyAct = bindings.some((b) => b.via === 'act');
  const anySection = bindings.some((b) => b.via === 'section');
  if (anyAct && anySection) return ' (some by their own sceneRef, some by the act default)';
  if (anyAct) return ' (the act default — no section names a scene of its own)';
  return '';
}

/** One unknown section, spelled with the reason it is unknown. */
function unknownClause(b: RampScrollBinding): string {
  const where = `section ${b.section}`;
  switch (b.reason) {
    case 'act-unset':
      return `${where} takes the act default and this act names no editor scene, so its scroll `
        + 'config is aeon\'s hand-authored `act_parallax_config` in `act_descriptor.emp`, which '
        + 'Aurora does not read';
    case 'section-dangling':
      return `${where}'s sceneRef names "${b.sceneId}", which is not a scene in this project`;
    case 'section-unreadable':
      return `${where}'s sceneRef names "${b.sceneId}", whose file could not be read`;
    case 'act-dangling':
      return `${where} takes the act default "${b.sceneId}", which is not a scene in this project`;
    case 'act-unreadable':
      return `${where} takes the act default "${b.sceneId}", whose file could not be read`;
    default:
      return `${where}'s scene could not be resolved`;
  }
}

function joinClauses(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join('; ')}; and ${parts[parts.length - 1]}`;
}

/**
 * WHAT THIS RAMP WILL ACTUALLY DO, given who binds it — the painted sentence and
 * the hover behind it.
 *
 * ⚠ IT NEVER PICKS ONE ANSWER WHEN THE BINDINGS GIVE TWO. The majority, the
 * first section and the "usual" one are all wrong for the same reason: the
 * author would read a confident sentence about half their sections. When the
 * groups disagree the sentence SAYS SO and names which sections get which, so
 * the next action (split the preset, or change a scene) is obvious from the
 * text.
 *
 * ⚠ AND AN UNBOUND PRESET ASSERTS NEITHER ARM. With nothing bound there is no
 * fact to report, so the sentence says the binding decides it and points at the
 * control that makes the binding. Guessing "probably full-screen, that's the
 * common case" would be exactly the drawn lie this row exists to remove.
 */
export function rampScrollModeSentence(
  bindings: readonly RampScrollBinding[],
): { short: string; full: string } {
  const full = bindings.filter((b) => b.mode === 'full');
  const column = bindings.filter((b) => b.mode === 'column');
  const unknown = bindings.filter((b) => b.mode === 'unknown');
  const groups = [full, column, unknown].filter((g) => g.length > 0).length;

  // The capability conjunct rides on any arm that claims a column, because that
  // is the arm the bit actually changes. Painted, not hover-only: it names the
  // one condition under which the sentence above it would be wrong.
  const cap = column.length > 0
    ? ' Assumes this game declares CAP_PER_COL_VSRAM — sonic4 does.'
    : '';

  let short: string;
  if (bindings.length === 0) {
    short = `${RAMP_SCROLL_LEAD.unbound} no section binds this preset, so nothing decides it yet. `
      + 'A section whose scene has no `v_deform` scrolls the FULL WIDTH; a section whose scene '
      + `HAS one narrows this ramp to a single ${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column. Bind `
      + 'it in the Section row above and this sentence will say which.';
  } else if (groups > 1) {
    const parts: string[] = [];
    if (full.length > 0) {
      parts.push(`${sectionList(full.map((b) => b.section))} `
        + `${full.length === 1 ? 'scrolls' : 'scroll'} the full width `
        + `(${sceneList(full)}${full.length === 1 ? ' has' : ' have'} no \`v_deform\`)`);
    }
    if (column.length > 0) {
      parts.push(`${sectionList(column.map((b) => b.section))} `
        + `${column.length === 1 ? 'scrolls' : 'scroll'} one `
        + `${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column (${sceneList(column)}`
        + `${column.length === 1 ? ' has' : ' have'} a \`v_deform\`)`);
    }
    if (unknown.length > 0) {
      parts.push(`and ${joinClauses(unknown.map(unknownClause))}`);
    }
    short = `${RAMP_SCROLL_LEAD.split} the same five numbers below produce different effects `
      + `depending on the section, and this document has no single answer. ${joinClauses(parts)}.`
      + cap;
  } else if (full.length > 0) {
    short = `${RAMP_SCROLL_LEAD.full} this ramp scrolls the FULL WIDTH of the plane. `
      + `${sectionList(full.map((b) => b.section))} bind${full.length === 1 ? 's' : ''} this `
      + `preset and ${sceneList(full)}${full.length === 1 ? ' has' : ' have'} no \`v_deform\``
      + `${viaClause(full)}, so VSRAM stays whole-plane.`;
  } else if (column.length > 0) {
    short = `${RAMP_SCROLL_LEAD.column} this ramp scrolls a single `
      + `${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column, not the screen. `
      + `${sectionList(column.map((b) => b.section))} bind${column.length === 1 ? 's' : ''} this `
      + `preset and ${sceneList(column)}${column.length === 1 ? ' has' : ' have'} a \`v_deform\``
      + `${viaClause(column)}, which puts VSRAM in per-column mode — every other column keeps the `
      + 'plane\'s own scroll. WHICH 16 pixels is a property of that scene, not of this document: '
      + `the aeon lane measured the strip at x = ${RAMP_SCROLL_COLUMN_SPAN.first}-`
      + `${RAMP_SCROLL_COLUMN_SPAN.last}, not x = 0-15.${cap}`;
  } else {
    short = `${RAMP_SCROLL_LEAD.unknown} `
      + `${sectionList(unknown.map((b) => b.section))} bind${unknown.length === 1 ? 's' : ''} this `
      + `preset, but ${joinClauses(unknown.map(unknownClause))}. Full-screen and one `
      + `${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column are both still open; assign a scene to say `
      + 'which.';
  }
  return { short, full: RAMP_SCROLL_MODE_NOTE };
}
