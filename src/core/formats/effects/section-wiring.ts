// WHICH SECTIONS CAN CARRY AN EDITOR-AUTHORED RASTER BAND — DERIVED, NEVER LISTED.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE QUESTION, AND THE THREE WRONG ANSWERS IT PRODUCED IN ONE DAY
// ═══════════════════════════════════════════════════════════════════════════
//
// "Which sections can have a raster band?" was answered three times on
// 2026-09-02 and was wrong every time:
//
//   "only section 5"   — from prose inside this very panel; the cold reader
//                        inherited it from there and wrote it into the guide.
//   "sections 1-5"     — from aeon's lane, whose ad-hoc parse windowed to the
//                        first 800 characters after each `sec: N`; section 0's
//                        `effects:` field sits at offset 964, so it printed a
//                        confident "(none)". A WINDOW THAT FINDS NOTHING AND A
//                        FIELD THAT DOES NOT EXIST PRINT THE SAME THING.
//   "sections 0-5"     — derived from the whole chunk. Both lanes then agreed.
//
// Every one of those was a LIST, and every list was a snapshot. So this module
// holds no list. It parses aeon's own two files and derives the answer per
// project, per act, on every load — which is the only form of the answer that
// cannot be stale.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE RULE, AND WHY IT IS A PROPERTY OF THE LEVEL DATA AND NOT OF AURORA
// ═══════════════════════════════════════════════════════════════════════════
//
//   > A section can carry an editor-authored raster band only if it binds a
//   > preset that NO OTHER SECTION binds.
//
// `Sec.sec_effects` is a per-section POINTER to an `EffectsPreset` record, and
// several sections may point at one record. Threading a section-keyed raster
// chooser into a record two sections share would silently give BOTH of them the
// same band, so aeon's `tools/effects_seam_gate.py` refuses it by name:
//
//     "A preset SHARED by N sections cannot carry a section-keyed band: every
//      one of them would get sec M's program. Split it first (one 38-byte
//      EffectsPreset per section that needs its own channel)."
//
// THAT IS A FACT ABOUT THE LEVEL, NOT A LIMITATION OF THE TOOL, and the
// distinction is most of the usability win: an author told "sections 6, 7 and 8
// share one preset, so giving one of them a band would give all three the same
// band" knows what to ask a programmer for. An author told "you can't do that"
// learns only that the editor is in their way.
//
// ═══════════════════════════════════════════════════════════════════════════
// TWO FACTS PER SECTION, NOT ONE — AND THE SECOND ONE IS EASY TO MISS
// ═══════════════════════════════════════════════════════════════════════════
//
// ELIGIBLE — its preset record is bound by exactly one section. Derived from
//   `act_descriptor.emp`. This is the rule above.
//
// THREADED — some `preset()` in the game's effects library actually passes the
//   generated chooser to its `raster:` channel: `raster: <act>_sec_raster(sec: N,
//   hand: …)`. Derived from `<zone>_effects.emp`.
//
// A SECTION MUST BE BOTH BEFORE A BINDING REACHES THE SCREEN, and aeon's gate
// refuses each failure separately:
//
//   not eligible → the shared-record fault above; a preset SPLIT is needed.
//   eligible, not threaded → "section N's sidecar names rasterRef 'x', but no
//     preset threads <fn>(sec: N) — the generator would emit the binding row and
//     nothing would read it, which presents to the author as an assignment that
//     did nothing." One line in aeon fixes it.
//
// Measured at aeon `origin/master` 8876459e, 2026-09-02, ojz/act1: sections 0-5
// are ELIGIBLE (six own presets), 6/7/8 share `OJZ_Preset_Plain`; exactly one
// section — 5 — is THREADED. THOSE NUMBERS ARE NOT WRITTEN ANYWHERE IN THIS
// FILE; they are what the parse below returns today, recorded here so a future
// reader can tell a changed world from a broken parser.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠ THIS DERIVES; IT DOES NOT GATE
// ═══════════════════════════════════════════════════════════════════════════
//
// `core/formats/raster-binding.ts` carries a STANDING REFUSAL: Aurora does not
// disable the per-section select and does not decide which sections may accept
// a binding, because a gate written from a snapshot would be silently wrong for
// the next act and would read to an author as authority. That refusal named its
// own escape — a statement "re-derived per act on every build, so it could not
// describe a layout that had moved" — and this is that: a per-load derivation
// from the artifacts themselves, not a cached literal.
//
// So the output is an ADVISORY. And the refusal's hardest clause is honoured
// exactly: if the files are absent or unparseable, the answer is "I could not
// read this", NEVER "you may not". A control greyed out because a file could
// not be read is indistinguishable, to the author, from one greyed out because
// the thing is impossible.
//
// ⚠ AMENDED 2026-09-10, AND THIS PARAGRAPH USED TO READ "Nothing here disables
// a control." IT IS QUOTED RATHER THAN DELETED, because a reader who remembers
// it must meet the correction instead of silently inheriting a different rule.
// EXACTLY ONE THING HERE NOW DISABLES A CONTROL: `sectionArmExclusivity` and
// the two functions beside it, on aeon's ruling at `92d744fc`
// (`docs/DEFERRED_WORK.md`, `SECTION0-SPECIAL-CASE`, 2026-09-10). Read the ARM
// EXCLUSIVITY banner further down before citing the old sentence against
// anything, and before adding a second refusal beside it. Everything the three
// conditions above derive is still ADVISORY and still refuses nothing: what
// separates the new one is that it is not a MISSING LINE. There is no line to
// write, because `preset()` will not let a record hold both arms at once.

/** Where a wiring answer came from, and whether it could be had at all. */
export interface WiringSource {
  /** Project-relative path that was read. */
  path: string;
  /** True when the file was read AND the parse found at least one match. */
  parsed: boolean;
  /** Why not, when `parsed` is false — shown to the author verbatim. */
  reason?: string;
  /**
   * True when the BYTES were read and it is the parse that came back empty or
   * refused. Absent means the file was not read (or nobody said), and the
   * sentences keep saying "could not read".
   *
   * ⚠ WHY THIS EXISTS (2026-09-14, SECTIONS-0-7-UNBARRED-AFTER-REGIONS). When
   * aeon moved the section bindings into region rows, the load read
   * act_descriptor.emp perfectly well, found nothing it recognised, and the
   * strip then told the author Aurora "could not read" a file it had just
   * read. Only the parenthetical reason was true. "I could not open it" and "I
   * opened it and did not understand it" send a person to different places, so
   * they are two sentences.
   */
  read?: boolean;
}

export interface SectionRasterWiring {
  /** section index → the `effects:` record name its `<zone>_sec(...)` binds. */
  bindings: Record<number, string>;
  /** Preset record name → the section index its `raster:` chooser is keyed on. */
  threadedBy: Record<string, number>;
  /**
   * THE OTHER FOUR CHOOSERS' CALL SITES — condition 3's evidence, from the SAME
   * `<zone>_effects.emp` read that produces `threadedBy`.
   *
   * `channel name → preset record → section index → the INDEX ARGUMENTS threaded`.
   * An indexed chooser (`slot:`, `ch:`) records the indices it was called with;
   * an unindexed one records `[0]`. Absent when the library was not parsed —
   * which is the `unknown` verdict and never a `no`.
   */
  channelThreadedBy: Record<string, Record<string, Record<number, number[]>>>;
  /**
   * THE OTHER ARM — preset record name → the non-zero `patched:` program it binds.
   *
   * From the SAME `<zone>_effects.emp` read as the two above. This is the ONE
   * input the three advisory conditions could not supply, and it is what
   * `sectionArmExclusivity` turns into the only structural refusal this module
   * publishes. See that function's banner.
   *
   * A record absent from this map binds no `patched:` arm — which is the
   * `preset()` DEFAULT (`patched: Label = 0`) and is the overwhelmingly common
   * case. Empty while `library.parsed` is false is NOT that answer: every
   * predicate reads the parse flag first and says `unknown`.
   */
  patchedArm: Record<string, string>;
  descriptor: WiringSource;
  library: WiringSource;
  /**
   * Descriptor rows that name an `effects:` preset and carry NO section key (or
   * several), exactly as `descriptorEffectsRows` reported them. CARRIED, NOT
   * RENDERED: nothing on screen reads this yet, because a binding that belongs
   * to no section has no seat in a section-keyed control, and where it should
   * live is design Q8 (where `effectsRef` lives), owed to empyrean. It is here
   * so the load does not become the place such a row is silently dropped.
   * Absent on a wiring built by hand; the load always sets it.
   */
  unkeyedRows?: UnkeyedEffectsRow[];
  /**
   * Descriptor rows LEFT OUT because their call sits inside a build condition,
   * exactly as `descriptorEffectsRows` reported them — see
   * `ConditionalEffectsRow` for the ruling that makes this an exclusion.
   *
   * ⚠ CARRIED SO IT CAN BE SAID, which is the difference between this and a
   * drop. The migration reads it and writes one note (`migrate-sections.ts`);
   * without it the author's document would simply be one region smaller than
   * aeon's DEBUG table with nothing on screen accounting for the difference.
   * Absent on a wiring built by hand; the load always sets it.
   */
  conditionalRows?: ConditionalEffectsRow[];
  /**
   * EVERY `EffectsPreset` RECORD THE LIBRARY DECLARES — the vocabulary a painted
   * region's `preset` key must name (ruling Q8). From the SAME
   * `<zone>_effects.emp` read as `threadedBy`; see `libraryPresetRecordNames`.
   *
   * ⚠ READ IT ONLY WHEN `library.parsed` IS TRUE. Empty while the parse failed
   * is "I could not look", not "the library declares nothing", and the regions
   * validator says "could not check" rather than reporting every binding
   * unresolvable — the rule every predicate in this module already follows.
   *
   * Absent on a wiring built by hand; the load always sets it. Same shape and
   * same reason as `unkeyedRows` above.
   */
  presetRecords?: string[];
}

/** Nothing was read. Every predicate below answers "unknown", never "no". */
export function unknownWiring(descriptorPath: string, libraryPath: string, reason: string)
: SectionRasterWiring {
  return {
    bindings: {},
    threadedBy: {},
    channelThreadedBy: {},
    patchedArm: {},
    descriptor: { path: descriptorPath, parsed: false, reason },
    library: { path: libraryPath, parsed: false, reason },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// READING THE DESCRIPTOR: EACH `effects:` WITH THE `sec:` INSIDE ITS OWN CALL
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── WHERE THE BINDINGS LIVE, AND WHY THIS WAS REWRITTEN (2026-09-14) ───
//
// Until aeon `1a657990` (2026-09-13, "regions-p1 step 4: delete the section
// identity fields") every section row was `ojz_sec(sec: N, …, effects: X)` and
// this reader split the file on `<zone>_sec(sec: N` and took the next
// `effects:`. Step 4 took both arguments off `ojz_sec`. The preset now lives
// in the act's REGION ROWS, and the section key moved INSIDE a nested call:
//
//   ojz_region(x0: 2048, …, effects: OJZ_Preset_Sec1, parallax: ojz_act1_sec_scene(sec: 1)),
//
// Against that the old split found nothing, the load marked the descriptor
// unparsed, and arm exclusivity answered `open` for sections 0 and 7, whose
// presets still bind `patched:`. The control this module disables went live on
// exactly the two sections aeon's `preset()` refuses, and nothing said so.
// docs/reviews/2026-09-13-section-wiring-off-live-aeon.md measured it;
// docs/reviews/2026-09-14-sections-0-7-regions-reader.md is this fix.
//
// ─── THE PAIRING TRAP, AND WHY THE CALL AND NOT THE ORDER ───
//
// In a region row `effects:` comes BEFORE `sec:`. So the obvious generalisation
// of the old method, "find `sec: N`, search forward for `effects:`", pairs every
// row with its NEIGHBOUR's preset: section 0 gets row 1's, and so on down the
// table. Every shape check stays green, because nine keys still map to nine
// distinct presets. aeon measured that exact fault on its own tree, with every
// pytest lane green. The mirror rule ("the nearest `sec:` before it") is right
// for the region rows and wrong for the old `ojz_sec` rows. Both are claims
// about ARGUMENT ORDER, and argument order is not the data.
//
// What IS the data is which call an argument belongs to. So each `effects:` is
// paired with the numeric `sec:` values inside ITS OWN enclosing call: the
// innermost unclosed `(` before it, balanced to its `)`, nested calls included
// (the region row's key is inside `parallax: …(sec: N)`). That one rule reads
// both the old rows and the region rows, and reads aeon `31c0ddd8`, which
// carries both at once, as the same nine bindings twice.
//
// ─── WHAT IS A ROW ───
//
// A CALL to `<zone>_region(` or `<zone>_sec(`, by aeon's own constructor
// convention, keyed on the zone id so another zone's constructor, or a helper
// whose name merely begins with one, is not this act's row. A DECLARATION
// (`comptime fn ojz_region(…, effects: Label, …)`) is not a row either: it names a
// type, not a preset, and has no section. Comments and string literals are
// masked before anything is matched, because the descriptor's prose is dense
// and its ensure messages carry parentheses of their own.
//
// ─── NEVER INVENT A KEY, NEVER DROP A ROW ───
//
// A row with NO numeric `sec:` in its own call, or with more than one, is not
// assigned a section by guessing from its neighbours or its position. It is
// REPORTED, in `unkeyed`, with its preset, its constructor and its line. Two
// keyed rows that give one section DIFFERENT presets are not settled by
// last-wins either: the section is reported in `contested` and bound to
// neither. Two rows that agree are one binding, which is aeon `31c0ddd8`'s
// shape. Where a binding that belongs to no section should live is design Q8
// (where `effectsRef` lives), owed to empyrean, and is deliberately NOT
// modelled here.

/**
 * A region row's four edges as the descriptor WRITES them: INCLUSIVE, so a
 * one-pixel column is `x0 === x1`. Aeon's own form (`ojz_region(x0:, x1:, y0:,
 * y1:)`, whose ensure says so in as many words); the conversion to the editor's
 * half-open `{x, y, w, h}` is `region-geometry.ts`'s `fromInclusive` and happens
 * at the one place that needs a rectangle, never here. This module reports what
 * the file says.
 */
export interface RowInclusiveEdges {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * A descriptor row that names an `effects:` preset but cannot be given ONE
 * section: its own call carries no numeric `sec:`, or carries several.
 */
export interface UnkeyedEffectsRow {
  /** The preset record the row's `effects:` names. */
  preset: string;
  /** The constructor the row is written with, e.g. `ojz_region`. */
  constructorName: string;
  /** 1-based line of the row's `effects:` argument in the descriptor. */
  line: number;
  /** The distinct numeric `sec:` values inside the row's own call: none, or two or more. */
  sectionKeys: number[];
  /**
   * THE ROW'S OWN RECTANGLE, resolved out of the same file, or NULL.
   *
   * ⚠ WHY THIS KEY EXISTS, AND WHY NULL IS NOT A ZERO RECTANGLE. Editor spec §4
   * (migration) turns such a row into a region "with the rectangle read from the
   * row" — and a row with no section key is the ONLY row whose rectangle cannot
   * be derived from the section grid, so the migration has nowhere else to get
   * it. Before 2026-09-16 this interface carried the preset and the line and
   * dropped the geometry, so the migration would have had to invent it.
   *
   * Null means THIS READER COULD NOT RESOLVE ALL FOUR EDGES — a missing
   * argument, an expression shape `resolveRowEdge` does not read, a constant
   * declared twice. No value is substituted and no edge is guessed from a
   * neighbour: a caller that gets null must say it could not measure. The
   * migration REFUSES on a null rather than dropping the row, because dropping
   * it hands that area to whichever section region the row was cut out of,
   * silently changing the act's identity.
   *
   * Absent (rather than null) only on a row built by hand in a test; the reader
   * always sets it.
   */
  edges?: RowInclusiveEdges | null;
}

/**
 * A region row this reader EXCLUDED because its call sits BEHIND A BUILD SWITCH
 * — inside `if DEBUG == 1 { … }`, or inside its `else` arm.
 *
 * ⚠ EXCLUDED AND REPORTED, NEVER DROPPED AND NEVER INCLUDED. This is the shape
 * of `unkeyed` one step further on: `unkeyed` is "I read this row and cannot
 * key it", this is "I read this row and it is not unconditionally in the file".
 * The row is kept out of `bindings`, out of `unkeyed`, and out of everything the
 * migration reads, and it rides here so the layer above can SAY it was left out.
 *
 * ═══ WHY EXCLUDE AND NOT REFUSE, WHICH IS A RULING AND NOT A PREFERENCE ═════
 *
 * empyrean `docs/AURORA_REGIONS_SCHEMA.md` at `origin/main`, section "The schema
 * stays CLOSED, and the DEBUG eleventh row is a build-time delta (ruled
 * 2026-09-16T05:28:50Z)" and its amendment "AMENDMENT 2026-09-16T09:0xZ: the
 * edge-mutation is the SAME delta, so it is excluded and NOT refused". Both
 * ruled by the hub in the owner's place and OVERTURNABLE BY ONE WORD FROM HIM.
 *
 * The governing sentences are "an Aurora author has no DEBUG and no release"
 * and "the document describes the game, a look-fixture is not the game". A row
 * behind a build switch belongs to a particular build rather than to the act its
 * author edits, so carrying it into their document would put a build concept in
 * a file edited through a GUI. Refusing on it would be worse still: it would
 * reject the author's whole migration over a fact about somebody else's ROM.
 *
 * ⚠ AND AURORA DOES NOT KNOW WHICH ARM IS WHICH. It has no DEBUG and no release
 * — that is the ruling's own sentence — so it cannot call one arm the release
 * truth and the other the fixture. All it knows is that the row sits behind a
 * switch it cannot evaluate, and every sentence built from this record says
 * exactly that and no more.
 *
 * ⚠ WHAT THIS DOES **NOT** DECIDE. The hub explicitly did not rule the general
 * policy for a conditional row, and this reader cannot tell a look-fixture from
 * a conditional that is genuinely part of the game. What is settled is the
 * DEFAULT DIRECTION — exclude and say so, never include — and that is all this
 * type implements. There is no mechanism here for distinguishing kinds of
 * conditional and no config key, deliberately. Meet a conditional whose
 * treatment looks wrong and REPORT it; do not design policy in this file.
 */
export interface ConditionalEffectsRow {
  /** The preset record the row's `effects:` names. */
  preset: string;
  /** The constructor the row is written with, e.g. `ojz_region`. */
  constructorName: string;
  /** 1-based line of the row's `effects:` argument in the descriptor. */
  line: number;
  /**
   * The condition as the descriptor WRITES it — `DEBUG == 1` — or the bare word
   * `else` for a row in an else arm. Reported verbatim and never evaluated: the
   * point of this record is that nothing here knows what it means.
   */
  condition: string;
}

/** One section that two keyed rows bind to DIFFERENT presets. Aurora picks neither. */
export interface ContestedSection {
  section: number;
  rows: { preset: string; constructorName: string; line: number }[];
}

/** Everything the descriptor says about which preset each section binds. */
export interface DescriptorEffectsRows {
  /**
   * `{sec index: the preset record its row binds}`, for each section exactly one
   * preset is keyed to. A section that binds no `effects:` is ABSENT from the map
   * rather than mapped to null; callers must not read "absent" as "shared".
   */
  bindings: Record<number, string>;
  /** Rows naming a preset with no section key, or several. Never assigned, never dropped. */
  unkeyed: UnkeyedEffectsRow[];
  /** Sections two keyed rows bind to different presets. In neither `bindings` nor `unkeyed`. */
  contested: ContestedSection[];
  /**
   * Rows left out because their call sits inside a build condition — see
   * `ConditionalEffectsRow`. In NONE of the three above: not a binding, not a
   * key-less row, not a contest. Reported so the exclusion can be said out loud.
   */
  conditional: ConditionalEffectsRow[];
}

/**
 * The descriptor's text with every `//` comment and every string literal's
 * contents replaced by spaces. OFFSETS AND NEWLINES ARE PRESERVED, so a match
 * in the result has the same index, and the same line, as in the original.
 * `.emp` has no block comment in any file this module reads (checked at aeon
 * `31c0ddd8`, `6bd8ed89` and, for regions step 5, `807bfdd5`), so none is
 * handled.
 */
function maskCommentsAndStrings(src: string): string {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (src[i] === '"') {
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < src.length && src[i + 1] !== '\n') out[i++] = ' ';
        out[i++] = ' ';
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index of the innermost `(` left open before `pos`, or -1 at top level. */
function enclosingOpenParen(code: string, pos: number): number {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (code[i] === ')') depth++;
    else if (code[i] === '(') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** Index of the innermost `{` left open before `pos`, or -1 at top level. */
function enclosingOpenBrace(code: string, pos: number): number {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (code[i] === '}') depth++;
    else if (code[i] === '{') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/**
 * The build condition a position sits inside, as the descriptor writes it, or
 * null when it sits inside none.
 *
 * ⚠ IT WALKS OUTWARD, ALL THE WAY. A row nested inside a plain block inside an
 * `if` is still conditional, and answering from the innermost brace alone would
 * call it unconditional. So every enclosing `{` is examined and the first
 * condition found wins.
 *
 * WHAT COUNTS AS A CONDITION is an `if` or an `else` keyword with NO brace
 * between it and the `{` it opens — which reads aeon's two shapes,
 * `const X: array = if DEBUG == 1 {` and `} else {`, and does not read
 * `comptime fn f(…) {`, `struct R {` or a `use …{A, B}` import list. The text is
 * already comment-and-string-masked, so an `if` in prose cannot win.
 *
 * IT NEVER EVALUATES. `DEBUG == 1` comes back as those five characters. Aurora
 * has no DEBUG and no release (the 2026-09-16 ruling's own sentence), so there
 * is nothing here for it to be right or wrong about.
 */
function enclosingCondition(code: string, pos: number): string | null {
  for (let at = pos; ;) {
    const open = enclosingOpenBrace(code, at);
    if (open < 0) return null;
    const head = code.slice(Math.max(0, open - 240), open);
    const iff = /\bif\b([^{}]*)$/.exec(head);
    if (iff !== null) return iff[1].trim() === '' ? 'if' : iff[1].trim();
    if (/\belse\b[^{}]*$/.test(head)) return 'else';
    at = open;
  }
}

/** Index of the `)` that closes the `(` at `open`, or the end of the text if none does. */
function matchingCloseParen(code: string, open: number): number {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === '(') depth++;
    else if (code[j] === ')' && --depth === 0) return j;
  }
  return code.length;
}

/**
 * The value of a `const NAME = <integer>` in the descriptor, or null.
 *
 * ⚠ NULL IS NOT 0, and this exists because aeon's edges are NAMES. The night
 * region's row is written `x0: OJZ_NIGHT_X0, x1: OJZ_NIGHT_X1`, with the numbers
 * declared a few lines above it, so a reader that only understood literals would
 * have found no rectangle at all on the one row that needs one.
 *
 * It resolves a plain integer initializer and NOTHING ELSE: no arithmetic in the
 * initializer, no `if`, no forwarding to another name. A name declared TWICE is
 * null for the reason a grep with two hits answers no question. `code` is the
 * comment-and-string-masked text, so `// OJZ_NIGHT_X0 = 9999` in prose cannot
 * win.
 *
 * ⚠ A CONDITIONAL INITIALIZER IS ONE OF THE "NOTHING ELSE" CASES, and it is the
 * OTHER HALF of the same build-time delta `ConditionalEffectsRow` exists for.
 * aeon writes `const OJZ_SEC2_X1 = if DEBUG == 1 { OJZ_SNAP_X0 - 1 } else { 6143 }`
 * — the edge the DEBUG row shortens `sec2` to. The 2026-09-16T09:0xZ amendment
 * rules the row and this edge ONE delta with ONE treatment: both excluded, both
 * reported, NEITHER refused.
 *
 * ON AEON'S DESCRIPTOR THAT NEEDS NO SECOND MECHANISM HERE, and the reason is
 * MEASURED rather than argued: `sec2`'s row is KEYED, so the migration takes its
 * rectangle from the section grid and NEVER ASKS THIS FUNCTION for
 * `OJZ_SEC2_X1` at all — `rowEdges` is called on the key-less branch only.
 * Dropping the conditional row returns `sec2`'s RIGHT edge to its grid value on
 * its own, with no fallback rule written anywhere. (Its LEFT edge is 4800
 * because the night region carved it, not because of the grid; the grid claim is
 * about the right edge alone.) There is therefore NO REFUSAL TO REMOVE here and
 * no test is written asserting one stopped: nothing refuses before the change
 * either, and such a row would be green both sides of it.
 *
 * ⚠ THE CASE THAT DOES REACH HERE, so that it behaves in the same voice: a
 * KEY-LESS row whose edge names a conditional constant. aeon has none today, and
 * nothing here goes looking to make one reachable. Such a row would already have
 * been excluded at the row level if it sat behind the switch itself; one that
 * does not, and merely borrows a switched constant, resolves to null and the
 * migration refuses NAMING THE ROW — a measurement it could not make, which is a
 * different sentence from an exclusion and stays one.
 *
 * The shape is transcribed from the instrument in
 * `__tests__/section-wiring.test.ts` (`resolveIntConst`), which has been reading
 * these same declarations out of aeon's real descriptor since 2026-09-15. Two
 * readers of one syntax is a drift risk worth naming: this one is the product
 * and that one is its independent check, and the test asserts they agree on
 * aeon's bytes.
 */
function resolveIntConst(code: string, name: string): number | null {
  const hits = [...code.matchAll(
    new RegExp(`^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*=[ \\t]*(-?\\d+)[ \\t]*$`, 'gm'),
  )];
  return hits.length === 1 ? Number(hits[0][1]) : null;
}

/**
 * One `x0:`/`x1:`/`y0:`/`y1:` argument as a number: a literal, a constant, or a
 * constant plus or minus a literal (aeon writes `x1: OJZ_NIGHT_X0 - 1`).
 *
 * Null for any other shape and for a constant that does not resolve — NEVER a
 * fallback and never a partial reading.
 */
function resolveRowEdge(code: string, text: string | null): number | null {
  if (text === null) return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  const plain = /^([A-Za-z_]\w*)$/.exec(text);
  if (plain) return resolveIntConst(code, plain[1]);
  const shifted = /^([A-Za-z_]\w*)\s*([+-])\s*(\d+)$/.exec(text);
  if (shifted) {
    const base = resolveIntConst(code, shifted[1]);
    return base === null ? null : base + (shifted[2] === '+' ? 1 : -1) * Number(shifted[3]);
  }
  return null;
}

/**
 * The four inclusive edges of ONE row, from that row's OWN call span, or null
 * when any one of them cannot be resolved.
 *
 * ALL FOUR OR NOTHING. Three edges and a guess is a rectangle nobody wrote, and
 * the caller's only honest move on a partial reading is to refuse.
 */
function rowEdges(code: string, span: string): RowInclusiveEdges | null {
  const arg = (name: string): string | null => {
    // The row's own span only; `span` is already balanced to this call, and the
    // nested `parallax: …(sec: N)` carries no edge argument to confuse this.
    const m = new RegExp(`\\b${name}\\s*:\\s*([^,()]+)`).exec(span);
    return m === null ? null : m[1].trim();
  };
  const x0 = resolveRowEdge(code, arg('x0'));
  const x1 = resolveRowEdge(code, arg('x1'));
  const y0 = resolveRowEdge(code, arg('y0'));
  const y1 = resolveRowEdge(code, arg('y1'));
  if (x0 === null || x1 === null || y0 === null || y1 === null) return null;
  return { x0, x1, y0, y1 };
}

/**
 * Every section binding the act descriptor makes, and every row it could not
 * key. THE READER. Read the banner above before changing how a row is paired:
 * the pairing is by enclosing call, never by argument order.
 */
export function descriptorEffectsRows(desc: string, zoneId: string): DescriptorEffectsRows {
  const code = maskCommentsAndStrings(desc);
  const constructors = new Set([`${zoneId}_region`, `${zoneId}_sec`]);
  const keyed = new Map<number, { preset: string; constructorName: string; line: number }[]>();
  const unkeyed: UnkeyedEffectsRow[] = [];
  const conditional: ConditionalEffectsRow[] = [];
  const effects = /\beffects\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = effects.exec(code)) !== null) {
    const open = enclosingOpenParen(code, m.index);
    if (open < 0) continue;
    // The callee is the identifier immediately before the `(`, and a `fn`
    // before THAT makes the parentheses a parameter list, not a call.
    const head = /(\bfn\s+)?\b([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(code.slice(Math.max(0, open - 256), open));
    if (head === null || head[1] !== undefined || !constructors.has(head[2])) continue;
    const span = code.slice(open, matchingCloseParen(code, open) + 1);
    const keys = [...new Set([...span.matchAll(/\bsec\s*:\s*(\d+)\b/g)].map((k) => Number(k[1])))]
      .sort((a, b) => a - b);
    const row = {
      preset: m[1], constructorName: head[2], line: code.slice(0, m.index).split('\n').length,
    };
    // ── THE BUILD-CONDITION EXCLUSION, BEFORE ANY OTHER READING OF THE ROW ──
    //
    // Keyed or key-less, a row written inside `if DEBUG == 1 { … }` is not
    // unconditionally in the file, so it is not part of the act its author
    // edits. It goes to `conditional` and to nothing else — see that type for
    // the ruling, for why this is an exclusion and not a refusal, and for the
    // scope limit (the general policy is NOT settled here).
    //
    // THE TEST IS APPLIED UNIFORMLY, to a keyed row as well as a key-less one,
    // because the alternative is two stories about one descriptor: a key-less
    // conditional row left out with a sentence and a keyed one quietly binding
    // a section's preset from a build nobody in Aurora has.
    const condition = enclosingCondition(code, open);
    if (condition !== null) {
      conditional.push({ ...row, condition });
      continue;
    }
    if (keys.length === 1) {
      const list = keyed.get(keys[0]) ?? [];
      list.push(row);
      keyed.set(keys[0], list);
    } else {
      // THE GEOMETRY RIDES THE ROW THAT NEEDS IT. A keyed row's rectangle is the
      // section grid's and the migration derives it there; a key-less row has no
      // section to derive from, so its rectangle is read here or nowhere.
      unkeyed.push({ ...row, sectionKeys: keys, edges: rowEdges(code, span) });
    }
  }
  const bindings: Record<number, string> = {};
  const contested: ContestedSection[] = [];
  for (const [section, rows] of [...keyed.entries()].sort((a, b) => a[0] - b[0])) {
    if (new Set(rows.map((r) => r.preset)).size === 1) bindings[section] = rows[0].preset;
    else contested.push({ section, rows });
  }
  return { bindings, unkeyed, contested, conditional };
}

/**
 * `{sec index: preset record}` alone: the bindings-only door, and IT REFUSES
 * RATHER THAN DROPS. When the descriptor carries a row this map has no seat for
 * (no section key, several, or a section two rows disagree about), it throws
 * naming the first, because returning the map would hand the caller a smaller
 * world and no sign that it was smaller. A caller that must go on reading such a
 * descriptor (the load) reads `descriptorEffectsRows` and carries the rows.
 */
export function descriptorEffectsBindings(desc: string, zoneId: string): Record<number, string> {
  const rows = descriptorEffectsRows(desc, zoneId);
  const refusal = refusedRowSentence(rows);
  if (refusal !== null) {
    throw new Error(`descriptorEffectsBindings: ${refusal}. Read descriptorEffectsRows instead, `
      + 'which reports that row rather than dropping it.');
  }
  return rows.bindings;
}

/** The first row the bindings map has no seat for, as a sentence, or null. */
function refusedRowSentence(rows: DescriptorEffectsRows): string | null {
  const c = rows.contested[0];
  if (c !== undefined) {
    return `section ${c.section} is bound by ${c.rows.length} rows naming different presets (`
      + `${c.rows.map((r) => `${r.preset} at line ${r.line}`).join(', ')}), and Aurora will not `
      + 'pick one';
  }
  const several = rows.unkeyed.find((u) => u.sectionKeys.length > 1);
  if (several !== undefined) {
    return `the ${several.constructorName} row at line ${several.line} names ${several.preset} `
      + `with section keys ${listOf(several.sectionKeys)}, and Aurora will not pick one`;
  }
  const none = rows.unkeyed[0];
  if (none !== undefined) {
    return `${rows.unkeyed.length} ${rows.unkeyed.length === 1 ? 'row names' : 'rows name'} a `
      + `preset with no section key (the first: the ${none.constructorName} row at line `
      + `${none.line}, naming ${none.preset})`;
  }
  return null;
}

/**
 * What the load records about the descriptor it READ: whether its bindings can
 * be used, and in words, why not. Kept here rather than in `load.ts` so the
 * decision is reachable from the node suite.
 *
 * ⚠ THREE OUTCOMES, AND ONLY ONE OF THEM IS "PARSED".
 *   A section two rows disagree about, or a row keyed to several sections:
 *     REFUSED. Every section reading would rest on a pick Aurora made, and a
 *     section-keyed control cannot say which. Bindings are not published.
 *   No binding at all: UNPARSED, and the reason says whether there were rows
 *     with no key (the file moved to a shape this reader does not key) or no
 *     rows at all.
 *   Otherwise PARSED. A row with NO section key does not stop that: it names no
 *     section, so it falsifies no section's reading. It is carried on the
 *     wiring (`unkeyedRows`) rather than dropped.
 * Every outcome carries `read: true`, because the bytes WERE read; the
 * sentences say "could not read" only when they were not.
 */
export function descriptorWiringSource(path: string, rows: DescriptorEffectsRows, zoneId: string)
: WiringSource {
  if (rows.contested.length > 0 || rows.unkeyed.some((u) => u.sectionKeys.length > 1)) {
    return { path, parsed: false, read: true, reason: refusedRowSentence(rows) ?? 'refused' };
  }
  if (Object.keys(rows.bindings).length === 0) {
    return {
      path, parsed: false, read: true,
      reason: rows.unkeyed.length > 0
        ? `${refusedRowSentence(rows)}, and no row carries a section key`
        : `no ${zoneId}_region(… effects: …, … sec: N …) or ${zoneId}_sec(sec: N, … effects: …) `
          + 'rows were found in it',
    };
  }
  return { path, parsed: true, read: true };
}

/**
 * THE LOAD'S WHOLE DESCRIPTOR STEP, for a file it has read: the source record,
 * the bindings it may publish, and the rows it carries. `load.ts` assigns these
 * three fields and nothing else, so the node suite tests the real decision
 * rather than a copy of it.
 *
 * A REFUSED or UNPARSED read publishes NO bindings: every predicate reads the
 * parse flag first, and a partial map would only be a second way to be wrong.
 */
export function readDescriptorWiring(path: string, desc: string, zoneId: string)
: Pick<SectionRasterWiring, 'bindings' | 'descriptor' | 'unkeyedRows' | 'conditionalRows'> {
  const rows = descriptorEffectsRows(desc, zoneId);
  const descriptor = descriptorWiringSource(path, rows, zoneId);
  return {
    descriptor,
    bindings: descriptor.parsed ? rows.bindings : {},
    unkeyedRows: rows.unkeyed,
    // Carried whatever the parse verdict was, for the same reason `unkeyedRows`
    // is: a row nobody mentions is a row that was dropped.
    conditionalRows: rows.conditional,
  };
}

/**
 * `{preset record name: the section index its `raster:` chooser is keyed on}`.
 *
 * Only presets whose `raster:` channel is a CALL to the generated chooser
 * appear. A preset that hands `raster:` a literal program is not a fault — most
 * of them do, and that is what an unwired section looks like.
 */
export function libraryRasterChooserCalls(lib: string, chooserFn: string): Record<string, number> {
  const out: Record<string, number> = {};
  // A `preset()` record: `pub const <Name>: EffectsPreset = preset(...)` — split
  // on the declaration and search each body for the chooser call, which is the
  // same shape aeon's `preset_records` + `raster_call_sites` pair uses.
  const decl = /\b(?:pub\s+)?(?:const|data)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = decl.exec(lib)) !== null) marks.push({ name: m[1], at: m.index });
  const call = new RegExp(
    `raster\\s*:\\s*${chooserFn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(\\s*sec\\s*:\\s*(\\d+)`,
  );
  for (let i = 0; i < marks.length; i++) {
    const body = lib.slice(marks[i].at, marks[i + 1]?.at ?? lib.length);
    const hit = call.exec(body);
    if (hit) out[marks[i].name] = Number(hit[1]);
  }
  return out;
}

/**
 * EVERY `EffectsPreset` RECORD THE LIBRARY DECLARES, in declaration order.
 *
 * ═══ WHAT THIS IS FOR, AND WHY IT IS NOT ONE OF THE MAPS ABOVE ════════════
 *
 * A painted region's `preset` key names one of these records (editor spec §2.4,
 * ruling Q8: the region binds a RECORD NAME, validated against the game's own
 * effects library, because `Region.rg_effects` is a required pointer and a
 * preset DOCUMENT cannot express the whole record). So the regions validator's
 * rule 3 — "every binding resolves" — needs the library's whole VOCABULARY.
 *
 * None of the three maps above can supply it, and using one would be a defect
 * that only shows on a correct document: `bindings` holds the records the
 * DESCRIPTOR binds, `threadedBy` the records that call one chooser, `patchedArm`
 * the records that bind an arm. Each is a SUBSET, so a region naming a real
 * record absent from the subset would be reported "does not exist" — a refusal
 * Aurora speaks in aeon's name that aeon never made.
 *
 * ═══ THE DECLARATION FORM, TRANSCRIBED NOT GUESSED ════════════════════════
 *
 * The same `(pub )?(const|data) <Name>:` split `libraryRasterChooserCalls` uses,
 * narrowed to declarations whose TYPE is `EffectsPreset`. `\s*` around the colon
 * is load-bearing: aeon's own file aligns its columns
 * (`pub data OJZ_Preset_Sec0:  EffectsPreset = preset(…)`, two spaces), and a
 * single-space pattern silently misses seven of its ten records.
 *
 * ⚠ AN ARRAY-TYPED DECLARATION IS NOT ONE OF THESE, and that is a real case
 * rather than a hypothetical: `OJZ_Preset_NightSnap` is
 * `[EffectsPreset; OJZ_PRESET_NIGHT_SNAP_LEN]`, a DEBUG-gated look fixture. It
 * is not a record a region can bind, so `EffectsPreset` must be matched with the
 * colon immediately before it — `: [EffectsPreset;` does not match, by
 * construction rather than by an exclusion list.
 *
 * ⚠ COMMENTS ARE STRIPPED FIRST, on `libraryPatchedArmBindings`' reason: the
 * library discusses its own records in prose, and a vocabulary built partly from
 * comments would let a region bind a name that exists only in a sentence.
 */
export function libraryPresetRecordNames(lib: string): string[] {
  const decl = /\b(?:pub\s+)?(?:const|data)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*EffectsPreset\b/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const body = stripLineComments(lib);
  while ((m = decl.exec(body)) !== null) out.push(m[1]);
  return out;
}

/**
 * `{preset record name: the non-zero `patched:` program it binds}`.
 *
 * ═══ WHY THIS IS PARSED AT ALL, WHEN THE THREE CONDITIONS ARE ADVISORY ═══
 *
 * `engine/effects/preset.emp`'s `preset()` carries this `ensure`, read at aeon
 * `f93f9f6fc9d29e8503a00442d36d41696c2c685c`:
 *
 *   > ensure(raster == 0 || patched == 0,
 *   >        "preset(): ep_raster and ep_patched are mutually exclusive. Whichever
 *   >         installs last wins DESTRUCTIVELY …")
 *
 * `patched:`'s own default in that signature is `0`, so "binds an arm" is
 * exactly "passes a non-zero `patched:`". A record that does IS the one thing
 * `raster:` can never be added to — which is what makes this, alone among
 * everything this module derives, a STRUCTURAL fact rather than a missing line.
 *
 * ⚠ COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT TIDINESS. The record split is
 * `libraryRasterChooserCalls`', so a body runs from one declaration to the next
 * and carries every comment in between — and `ojz_effects.emp` contains, in
 * prose, the exact string this function looks for:
 *
 *   > // UNBINDING `patched: OJZ_TwoChannel` would have done the same thing …
 *
 * At aeon `f93f9f6f` that line is 1459 and the nearest preceding declaration is
 * `OJZ_DepthVSplit` (:1366) — a raster PROGRAM no section binds as its preset,
 * so today the false positive would land somewhere harmless. That is luck, not
 * a property: one more record between them and Aurora would grey out a control
 * on the strength of a sentence explaining why somebody did NOT do the thing.
 * A refusal sourced from prose is the worst kind this repo can publish, so the
 * comment text is removed before the match rather than hoped past.
 *
 * (`libraryRasterChooserCalls` has the same exposure and is deliberately left
 * alone here: it is a different function, its false positive would be a ✓ and
 * not a refusal, and widening a parcel into a neighbour's parse is how a change
 * acquires a defect it did not come to fix.)
 */
export function libraryPatchedArmBindings(lib: string): Record<string, string> {
  const out: Record<string, string> = {};
  const decl = /\b(?:pub\s+)?(?:const|data)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = decl.exec(lib)) !== null) marks.push({ name: m[1], at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const body = stripLineComments(lib.slice(marks[i].at, marks[i + 1]?.at ?? lib.length));
    const hit = /\bpatched\s*:\s*([A-Za-z_][A-Za-z0-9_]*|\d+)/.exec(body);
    // `0` is `preset()`'s own default for this parameter and its only "off": a
    // record spelling it explicitly binds no arm, exactly as an absent one does.
    if (hit && hit[1] !== '0') out[marks[i].name] = hit[1];
  }
  return out;
}

/**
 * `//` to end of line, removed. Deliberately NOT a general comment stripper:
 * `.emp` has no block comment in any file this module reads, and a half-right
 * one would be worse than none.
 */
function stripLineComments(s: string): string {
  return s.replace(/\/\/[^\n]*/g, '');
}

/** The generated chooser's name for an act — aeon's `effects_gen` spelling. */
export function rasterChooserName(zoneId: string, actId: string): string {
  return `${zoneId}_${actId}_sec_raster`;
}

/**
 * The two project-relative paths this derivation reads, from the act's own
 * `dataPath`.
 *
 * ⚠ DERIVED FROM `dataPath`, NOT WRITTEN DOWN. `games/sonic4/data/editor/ojz/act1/`
 * gives the game root (`games/sonic4`) and the act's own tail (`ojz/act1`), so
 * the descriptor is `<game>/data/levels/<tail>/act_descriptor.emp` and the
 * effects library is `<game>/data/effects/<zone>_effects.emp`. A project whose
 * `dataPath` does not carry `/data/editor/` yields null and the caller reports
 * "could not locate", which is a different answer from "not eligible".
 */
export function wiringPaths(dataPath: string, zoneId: string)
: { descriptor: string; library: string } | null {
  const marker = '/data/editor/';
  const at = dataPath.indexOf(marker);
  if (at < 0) return null;
  const game = dataPath.slice(0, at);
  const tail = dataPath.slice(at + marker.length).replace(/\/+$/, '');
  if (tail === '') return null;
  return {
    descriptor: `${game}/data/levels/${tail}/act_descriptor.emp`,
    library: `${game}/data/effects/${zoneId}_effects.emp`,
  };
}

// ---------------------------------------------------------------------------
// The author-facing answer
// ---------------------------------------------------------------------------

export type SectionRasterState =
  /** Its preset is unshared AND threaded — a binding here reaches the screen. */
  | 'wired'
  /** Its preset is unshared but no preset threads the chooser on this index. */
  | 'unthreaded'
  /** Its preset is bound by more than one section. */
  | 'shared'
  /** It binds no preset at all. */
  | 'unbound'
  /** aeon's files could not be read or parsed — NOT a refusal. */
  | 'unknown';

export function sectionRasterState(w: SectionRasterWiring, sectionIndex: number): SectionRasterState {
  if (!w.descriptor.parsed) return 'unknown';
  const record = w.bindings[sectionIndex];
  if (record === undefined) return 'unbound';
  const sharers = Object.keys(w.bindings)
    .map(Number)
    .filter((s) => w.bindings[s] === record)
    .sort((a, b) => a - b);
  if (sharers.length > 1) return 'shared';
  if (!w.library.parsed) return 'unknown';
  return w.threadedBy[record] === sectionIndex ? 'wired' : 'unthreaded';
}

/** The sections sharing this section's preset record, including it. */
export function sectionSharers(w: SectionRasterWiring, sectionIndex: number): number[] {
  const record = w.bindings[sectionIndex];
  if (record === undefined) return [];
  return Object.keys(w.bindings)
    .map(Number)
    .filter((s) => w.bindings[s] === record)
    .sort((a, b) => a - b);
}

/** `[0, 1, 2]` → `"0, 1 and 2"`. */
function listOf(ns: number[]): string {
  if (ns.length <= 1) return ns.join('');
  return `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
}

/**
 * What to say beside the per-section raster select, or null when there is
 * nothing to say.
 *
 * ⚠ IT STATES A FACT ABOUT THE LEVEL, NEVER A PROHIBITION BY AURORA. "sections
 * 6, 7 and 8 share one preset; giving one of them a band would give all three
 * the same band" tells an author what to ask for. "You cannot bind this
 * section" tells them the tool is in the way, which is both less useful and, in
 * the `unknown` case, not even true.
 *
 * The `unbound` branch is UNREACHABLE in ojz/act1 today — every section 0-8
 * binds something — and it is kept because it becomes live the moment anyone
 * adds a section. It is exercised on a SYNTHETIC descriptor in the tests rather
 * than pointed at a real section, because pointing it at section 0 would be
 * asserting today's wrong answer.
 */
export function sectionRasterAdvisory(
  w: SectionRasterWiring, sectionIndex: number, chooserFn: string,
): string | null {
  const state = sectionRasterState(w, sectionIndex);
  if (state === 'wired') return null;
  if (state === 'unknown') {
    const which = !w.descriptor.parsed ? w.descriptor : w.library;
    // READ AND NOT UNDERSTOOD is a different sentence from NOT READ; see
    // `WiringSource.read`.
    const head = which.read === true
      ? `Aurora read ${which.path} but found no section binding it could use in it`
      : `Aurora could not read ${which.path}`;
    return `${head}, so it cannot say whether section ${sectionIndex} `
      + `can carry a raster band${which.reason ? ` (${which.reason})` : ''}. The binding is still `
      + 'written; aeon\'s build is the authority.';
  }
  if (state === 'shared') {
    const sharers = sectionSharers(w, sectionIndex).filter((s) => s !== sectionIndex);
    return `Sections ${listOf(sectionSharers(w, sectionIndex))} all share the preset record `
      + `${w.bindings[sectionIndex]}, so giving section ${sectionIndex} a band would give `
      + `section${sharers.length === 1 ? '' : 's'} ${listOf(sharers)} the same band. aeon's build `
      + 'refuses that and asks for the record to be split first: one preset per section that '
      + 'needs its own raster channel.';
  }
  if (state === 'unbound') {
    return `Section ${sectionIndex} binds no preset record in the act descriptor, so there is `
      + 'nothing for a raster program to hang off. A programmer gives it one.';
  }
  // 'unthreaded'
  return `Section ${sectionIndex}'s preset record ${w.bindings[sectionIndex]} is its own (nothing `
    + 'else shares it) but nothing threads the raster chooser into it yet, so aeon\'s canonical '
    + `build refuses a binding here ("no preset threads ${chooserFn}(sec: ${sectionIndex})"). `
    + 'That is one line in aeon, not a redesign. The binding is written either way.';
}

// ---------------------------------------------------------------------------
// THE TWO CONDITIONS, KEPT APART ON THE SCREEN AS WELL AS IN THE DERIVATION
// ---------------------------------------------------------------------------
//
// `sectionRasterState` above collapses both facts into ONE word, and that word
// is what the strip used to print: `raster: needs one aeon line`. It is correct
// and it is a collapse — and collapsing these two is precisely how three
// different wrong answers got published in one day (the header). An author
// reading one chip cannot tell WHICH of the two conditions their section fails,
// which is the only thing that decides what they do next:
//
//   condition 1 fails → ask for a preset SPLIT (a data change, several lines)
//   condition 2 fails → ask for ONE aeon line
//
// So the two are ALSO returned apart, verdict by verdict, and the strip prints
// them as two rows. `unknown` is a THIRD verdict and never folds into `no`: the
// standing refusal in raster-binding.ts turns on exactly that distinction.
//
// ⚠ CONDITION 2 IS EXISTENCE, NOT OWNERSHIP, and that is deliberate. aeon's own
// gate says "no preset threads <fn>(sec: N)", so the fact an author is told
// matches the message they will meet. Whether the threading record is the one
// the section actually binds is a THIRD fact, and it is reported in the detail
// rather than folded into the verdict — a preset that threads sec 3 while
// section 3 binds a different record would otherwise read as fully wired here
// and be refused by the build. `sectionRasterState` stays the stricter
// conjunction, and `sectionConditionsAgreeWithState` below is the seam.

export type ConditionVerdict = 'yes' | 'no' | 'unknown';

export interface WiringCondition {
  verdict: ConditionVerdict;
  /** The preset record this condition is about, when there is one. */
  record: string | null;
  /** One short line, painted beside the verdict. Never a prohibition. */
  detail: string;
}

export interface SectionWiringConditions {
  /** Binds a preset record no other section binds. */
  ownPreset: WiringCondition;
  /** Some `preset()` threads `<chooser>(sec: N)`. */
  threaded: WiringCondition;
}

/**
 * The two conditions for one section, separately, each with its own verdict.
 *
 * Read the block above before changing a verdict: `unknown` is not `no`, and
 * condition 2 is asked even when condition 1 fails, because "which one do I
 * fail" is the question the strip exists to answer and a short-circuit would
 * answer it for only half the sections.
 */
export function sectionWiringConditions(
  w: SectionRasterWiring, sectionIndex: number, chooserFn: string,
): SectionWiringConditions {
  const ownPreset: WiringCondition = (() => {
    if (!w.descriptor.parsed) {
      const file = basename(w.descriptor.path);
      return {
        verdict: 'unknown', record: null,
        detail: w.descriptor.read === true ? `read ${file}; no usable section binding` : `could not read ${file}`,
      };
    }
    const record = w.bindings[sectionIndex];
    if (record === undefined) {
      return { verdict: 'no', record: null, detail: 'binds no preset record' };
    }
    const sharers = sectionSharers(w, sectionIndex).filter((s) => s !== sectionIndex);
    if (sharers.length > 0) {
      return { verdict: 'no', record, detail: `${record}, shared with section${sharers.length === 1 ? '' : 's'} ${listOf(sharers)}` };
    }
    return { verdict: 'yes', record, detail: record };
  })();

  const threaded: WiringCondition = (() => {
    const call = `${chooserFn}(sec: ${sectionIndex})`;
    if (!w.library.parsed) {
      return { verdict: 'unknown', record: null, detail: `could not read ${basename(w.library.path)}` };
    }
    const by = Object.keys(w.threadedBy).filter((r) => w.threadedBy[r] === sectionIndex);
    if (by.length === 0) return { verdict: 'no', record: null, detail: `nothing threads ${call}` };
    const record = by[0];
    // THE THIRD FACT, in the detail and not in the verdict — see the block above.
    if (ownPreset.record !== null && record !== ownPreset.record) {
      return {
        verdict: 'yes', record,
        detail: `${record} threads ${call}, but section ${sectionIndex} binds ${ownPreset.record}`,
      };
    }
    return { verdict: 'yes', record, detail: `${record} threads ${call}` };
  })();

  return { ownPreset, threaded };
}

/** The tail of a project-relative path — what a person calls the file. */
function basename(p: string): string {
  const at = p.lastIndexOf('/');
  return at < 0 ? p : p.slice(at + 1);
}

/**
 * THE SEAM between the collapsed word and the two rows, asserted rather than
 * assumed: `wired` must mean both conditions hold AND on the same record.
 *
 * It exists because the strip prints the two rows and the rest of the column
 * still reads the one word, and two derivations of one fact that nothing
 * compares is how they come apart.
 */
export function sectionConditionsAgreeWithState(
  w: SectionRasterWiring, sectionIndex: number, chooserFn: string,
): boolean {
  const c = sectionWiringConditions(w, sectionIndex, chooserFn);
  const bothHold = c.ownPreset.verdict === 'yes' && c.threaded.verdict === 'yes'
    && c.threaded.record === c.ownPreset.record;
  return (sectionRasterState(w, sectionIndex) === 'wired') === bothHold;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARM EXCLUSIVITY — THE ONE STRUCTURAL FACT, AND THE ONLY THING HERE THAT
// DISABLES A CONTROL
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── THE QUESTION AURORA ASKED, AND THE ANSWER IT GOT BACK ───
//
// Binding a band to section 0 passed all three conditions above and then failed
// aeon's build gate, so this editor was offering something the build refuses.
// The row was filed under a rule decided BEFORE the answer was known:
//
//   > A permanent property earns a disabled control with a reason; an
//   > incidental gap earns the enabled control with a disclosure we ship today.
//
// The missing input was whether the gap is permanent. Aeon ruled it at
// `92d744fc` (`docs/DEFERRED_WORK.md`, `SECTION0-SPECIAL-CASE`, 2026-09-10),
// and the ruling's first sentence is that **the binary was the wrong shape**:
//
//   sec 0     STABLE PROPERTY — `patched: OJZ_TwoChannel`. Disable, with the reason.
//   sec 1,2,4 incidental, but OCCUPIED — a test raster, a test gradient, and the
//             d-15 showcase sit in their raster channels. Content, reversible,
//             and the OWNER'S call. Nothing here refuses them.
//   sec 3     incidental AND FREE — its own preset, `Raster_Program_None` in its
//             raster channel. The exact pair that made section 5 the first
//             candidate. Never threaded, and nothing stops it.
//
// ⚠ A SINGLE VERDICT FOR "0-4" IS WRONG EITHER WAY ROUND, in aeon's own words:
// it would either hide four reversible content calls behind a structural-
// sounding refusal, or promise section 0 a binding the seam gate will refuse.
// A checker with two states where the world has three reports the third as
// whichever of its two is wrong.
//
// ─── WHY THIS IS DERIVED AND NOT `sectionIndex === 0` ───
//
// A hardcoded index would be correct today and silently wrong the day the tree
// moves, which is the defect this whole module was written to end (see the
// header: three wrong answers in one day, every one of them a list). So the
// property is derived from the MECHANISM aeon named, which is a rule in
// `engine/effects/preset.emp` rather than a fact about section 0:
//
//   a section is BARRED  ⟺  the preset record it binds passes a non-zero
//                           `patched:`, because `preset()`'s `ensure` makes
//                           `raster:` and `patched:` a hard either/or, and an
//                           editor document's `bands` lower to a RASTER program
//                           that `effects_seam_gate.py` requires be threaded
//                           through `<act>_sec_raster(sec: N)`.
//
// ⚠ AND THE DERIVATION ALREADY DISAGREES WITH THE RULING'S PROSE, WHICH IS THE
// POINT. Aeon's ruling says *"Section 0 is the only section in the tree with
// live patch channels"*. That sentence is quoted from their own 2026-09-03
// `OJZ_Preset_Sec5` block, and their `ojz_effects.emp` has said otherwise since
// 2026-09-05: *"SECTION 7 IS THE ACT'S SECOND SECTION WITH LIVE PATCH
// CHANNELS"* — `OJZ_Preset_Sec7` binds `patched: OJZ_WorldWater` (:1871 at aeon
// `f93f9f6f`). A literal `=== 0` would have been born two days stale. This
// derivation bars section 7 too, on the same `ensure`, and says so in the same
// sentence — the mechanism is the claim, and the section list is its output.
//
// ─── WHAT IT DOES NOT DO ───
//
// It says nothing about sections 1, 2 and 4. What sits in their raster channels
// is CONTENT: reversible, and the owner's to reverse. A UI that refused them
// would be deciding a content question, which is not Aurora's to decide.
//
// And `unknown` is a third verdict that never folds into `barred`. With the
// library unread, "this section binds a patched arm" is a claim nobody
// measured, so the control stays ENABLED and the sentence says what could not
// be checked — `raster-binding.ts`'s standing refusal, hardest clause: a
// control greyed out because a file could not be read is indistinguishable,
// to the author, from one greyed out because the thing is impossible.

export type ArmExclusivityVerdict =
  /** No `patched:` arm on this section's record. A band is structurally possible. */
  | 'open'
  /** Its record binds a `patched:` program, so `preset()` refuses a `raster:` beside it. */
  | 'barred'
  /** The effects library was not read. NOT a refusal, and not a clearance either. */
  | 'unknown';

export interface SectionArmExclusivity {
  verdict: ArmExclusivityVerdict;
  /** The preset record this section binds, when the descriptor was read. */
  record: string | null;
  /** The `patched:` program that record binds, when it binds one. */
  patched: string | null;
}

/**
 * Is an editor-authored raster band structurally impossible on this section?
 *
 * ⚠ THE LIBRARY IS ASKED FIRST, and that ordering is the `unknown` rule: with
 * the library unread there is no answer to give, whatever the descriptor says.
 * A section the descriptor was READ AND USED for, and which binds nothing, is
 * `open` and not `unknown`: the arm is a property of a record, and no record is
 * no arm. Conditions 1 and 2 already answer for such a section in their own
 * words, and this predicate exists to refuse and stays silent wherever it
 * cannot positively refuse.
 *
 * ⚠ AMENDED 2026-09-14, AND THIS PARAGRAPH USED TO READ "A section whose RECORD
 * is unknown (descriptor unread, or it binds nothing) is `open` and not
 * `unknown`". QUOTED RATHER THAN DELETED, because that sentence is how sections
 * 0 and 7 went live. It put two facts under one verdict: "the descriptor was
 * used and this section binds nothing" (no record, so no arm: still `open`) and
 * "Aurora could not use the descriptor" (the record is UNKNOWN). When aeon moved
 * the bindings into region rows, the load read the descriptor and could not use
 * it, every record came back null, and this predicate answered `open` for the
 * two sections aeon's preset() refuses, with no notice, because the notice only
 * spoke for the library (docs/reviews/2026-09-13-section-wiring-off-live-aeon.md).
 * An unusable descriptor is now `unknown` too: the control stays ENABLED, since
 * unknown never folds into barred, and `sectionArmExclusivityUnknownNotice` names
 * the file. This module's header says it: A WINDOW THAT FINDS NOTHING AND A
 * FIELD THAT DOES NOT EXIST PRINT THE SAME THING.
 */
export function sectionArmExclusivity(w: SectionRasterWiring, sectionIndex: number)
: SectionArmExclusivity {
  if (!w.library.parsed) return { verdict: 'unknown', record: null, patched: null };
  if (!w.descriptor.parsed) return { verdict: 'unknown', record: null, patched: null };
  const record = w.bindings[sectionIndex] ?? null;
  if (record === null) return { verdict: 'open', record: null, patched: null };
  const patched = w.patchedArm[record] ?? null;
  if (patched === null) return { verdict: 'open', record, patched: null };
  return { verdict: 'barred', record, patched };
}

/**
 * THE SENTENCE A PERSON SEES BESIDE A DISABLED CONTROL, or null when the
 * control is not disabled.
 *
 * ⚠ IT NAMES THE MECHANISM, NOT AURORA. Every other advisory in this module is
 * shaped by the same rule and this one is held to it harder, because it is the
 * only one attached to a control that will not move: it says which record binds
 * which program, which `ensure` in which of aeon's files closes the door, and
 * what a programmer would have to change. "You cannot bind this section" would
 * tell an author the tool is in the way; this tells them what the level data
 * does. A disabled control with no reason is the same defect as a refusal that
 * lives only in a hover tooltip, which this repo has already fixed once.
 */
export function sectionArmExclusivityRefusal(
  w: SectionRasterWiring, sectionIndex: number, chooserFn: string,
): string | null {
  const arm = sectionArmExclusivity(w, sectionIndex);
  if (arm.verdict !== 'barred') return null;
  return `Section ${sectionIndex} binds the preset record ${arm.record}, which passes `
    + `patched: ${arm.patched}. aeon's preset() refuses a raster: beside a patched:, because they `
    + 'are the same channel and whichever installs last destroys the other (engine/effects/preset.emp: '
    + '"ep_raster and ep_patched are mutually exclusive"). A preset document authored here '
    // ⚠ "ONE PROGRAM", NOT "BANDS". This said "carries bands, bands lower to a
    // raster program" from the day the root became an exactly-one `oneOf`, and
    // a document authored here may carry a ramp or a base swap — both of which
    // lower to `raster:` exactly as a band list does, so the conclusion held and
    // the premise was stale (bands-not-required audit, 2026-09-11, F4). The
    // three nouns are `PROGRAM_ARM_NOUNS`' spellings, typed here because this
    // module must stay importable without the preset codec; the renderer's
    // non-bands preset rows hold them to that map. A `boundary` document lowers
    // to `patched:` and is chosen by `<act>_sec_patched`, so the threading
    // clause below is still the wrong sentence for one — that is condition 2's
    // recorded defect (the CONDITION 2 note further down), not this wording's.
    + 'carries one program; a band list, a ramp or a base swap lowers to a raster program, and '
    + `effects_seam_gate.py requires it be threaded through ${chooserFn}(sec: ${sectionIndex}). `
    + 'So binding one here would have to take '
    + `${arm.patched} out of section ${sectionIndex} first. That is a property of the `
    + 'mechanism and not a choice about this section (aeon, 2026-09-10: "THAT IS A STRUCTURAL GAP '
    + 'AND NOT A CHOICE"), and it is the only kind of thing that greys this control out: a section '
    + 'nothing threads yet, or one whose raster channel is already occupied, is refused nothing '
    + 'here. A programmer unbinds the patched arm in that record if this section is really the '
    + 'one you want.';
}

/**
 * WHAT COULD NOT BE CHECKED, said out loud — the `unknown` arm's sentence.
 *
 * ⚠ THE CONTROL STAYS ENABLED HERE AND THIS IS WHY THAT IS NOT SILENT. Three
 * outcomes are possible and only two of them are acceptable: enabled-and-said
 * (this), or disabled-and-explained (`sectionArmExclusivityRefusal`). Enabled
 * and SILENT would let a structural impossibility present as an ordinary
 * binding; disabled-for-the-structural-reason would state a mechanism nobody
 * measured. Returns null whenever both files were read and used — there is a
 * real answer then, and this sentence would be noise beside it. (Until
 * 2026-09-14 that said "whenever the library WAS read", and an unusable
 * descriptor fell through to a silent `open`; see `sectionArmExclusivity`.)
 */
export function sectionArmExclusivityUnknownNotice(
  w: SectionRasterWiring, sectionIndex: number,
): string | null {
  if (sectionArmExclusivity(w, sectionIndex).verdict !== 'unknown') return null;
  // WHICH FILE: the library when it is the unread one, else the descriptor, which
  // is the file that says which record this section binds. A file that was read
  // and not used gets its own sentence; see `WiringSource.read`.
  const which = !w.library.parsed ? w.library : w.descriptor;
  const head = which.read === true
    ? `Aurora read ${which.path} but could not use it`
    : `Aurora could not read ${which.path}`;
  return head
    + `${which.reason ? ` (${which.reason})` : ''}, so it could not check whether section `
    + `${sectionIndex}'s preset record binds a patched: program, which would make an `
    + 'editor-authored band structurally impossible here, since aeon\'s preset() refuses a '
    + 'raster: beside a patched:. The control is left ENABLED and the binding is still written: a '
    + 'control greyed out because a file could not be read is indistinguishable from one greyed '
    + 'out because the thing is impossible. aeon\'s build is the authority.';
}

/**
 * IS THE PER-SECTION BINDING CONTROL DEAD? — the whole rule, in one place a
 * test can reach.
 *
 * ⚠ IT LIVES HERE AND NOT IN THE COMPONENT BECAUSE THE COMPONENT CANNOT BE
 * TESTED IN THIS REPO. Aurora's node suite has no jsdom, so a predicate written
 * inline in `BandPresetPanel`'s JSX would be asserted by nothing but a CDP
 * harness — and this rule has a second clause that is exactly the sort a
 * never-run assertion would let rot.
 *
 * THE SECOND CLAUSE, AND WHY IT IS NOT A SOFTENING OF THE FIRST. A barred
 * section with a `rasterRef` ALREADY BOUND is a tree aeon's seam gate is
 * refusing right now, and this select is the only control in the app that can
 * take that binding back out. Greying it there would trap the broken state and
 * hide its one fix — a worse defect than the one the disable prevents. So the
 * refusal sentence stays on screen in the warning tier and the control stays
 * live until the binding is gone; then it greys.
 *
 * `rasterRef` is the SECTION's, from Aurora's own sidecar — never a wiring
 * fact. Passing `null` for a section that carries one would grey a control the
 * author needs.
 */
export function sectionBindingControlDisabled(
  w: SectionRasterWiring, sectionIndex: number, rasterRef: string | null,
): boolean {
  return sectionArmExclusivity(w, sectionIndex).verdict === 'barred' && rasterRef === null;
}

/**
 * The sections a band is structurally impossible on, in order. Derived.
 *
 * ⚠ EMPTY WHEN THE LIBRARY WAS NOT READ, and that is `unknown` collapsing to
 * "name nobody" rather than to "name everybody" — the safe direction for a set
 * whose only use is to refuse. Callers that need the distinction ask
 * `sectionArmExclusivity` per section, which keeps all three verdicts.
 */
export function armBarredSections(w: SectionRasterWiring, sectionCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    if (sectionArmExclusivity(w, i).verdict === 'barred') out.push(i);
  }
  return out;
}

/**
 * The sections whose preset record is theirs alone — CONDITION 1 ONLY.
 *
 * ⚠ NOT `eligibleSections`, and the difference is a self-contradiction the strip
 * shipped for one harness run: `eligibleSections` goes through
 * `sectionRasterState`, which answers `unknown` for EVERY section as soon as the
 * effects library is unreadable — so with the descriptor read and the library
 * missing, the strip printed `✓ own preset OJZ_Preset_Sec0` on its condition row
 * and `own preset none` on its act-wide line, in the same box, at the same time.
 * The act-wide statement of a condition must be derived from THAT CONDITION, not
 * from a state that folds in the other one.
 */
export function ownPresetSections(w: SectionRasterWiring, sectionCount: number, chooserFn: string)
: number[] {
  const out: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    if (sectionWiringConditions(w, i, chooserFn).ownPreset.verdict === 'yes') out.push(i);
  }
  return out;
}

/** The sections some preset threads the chooser on, in order. Derived. */
export function threadedSections(w: SectionRasterWiring, sectionCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    if (Object.values(w.threadedBy).includes(i)) out.push(i);
  }
  return out;
}

/** The sections a binding reaches the screen on today, in order. Derived. */
export function wiredSections(w: SectionRasterWiring, sectionCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    if (sectionRasterState(w, i) === 'wired') out.push(i);
  }
  return out;
}

/** The sections whose preset record is theirs alone — one aeon line from wired. */
export function eligibleSections(w: SectionRasterWiring, sectionCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const s = sectionRasterState(w, i);
    if (s === 'wired' || s === 'unthreaded') out.push(i);
  }
  return out;
}

/**
 * The sections that ALREADY NAME a preset document — `rasterRef` is set.
 *
 * ═══ THE COLD READ'S D-B: `threaded 5,6` READ AS "5 AND 6 ARE AVAILABLE" ═══
 *
 * `docs/reviews/2026-09-05-effects-cold-read.md`, D-B, one of the two findings
 * that STOPPED that reader. The act line published `threaded 5,6` — honestly
 * derived, and true — beside a set the reader then had to guess at: both of
 * those sections were already carrying a preset (`ojz_sec5_showcase`,
 * `ojz_sec6_baseswap`), so every section the strip named was occupied and there
 * was no route through the UI to a green build with a new band in it.
 *
 * ⚠ IT IS A DISCLOSURE, NOT A GATE, and the set is deliberately NOT "the free
 * ones". Hiding an occupied section would renumber the world for the reader —
 * the same rule `SectionPicker`'s own section `<select>` states about an empty
 * section ("offered and labelled, not hidden") — and it would be a PROHIBITION,
 * which `core/formats/raster-binding.ts`'s standing refusal forbids Aurora from
 * publishing. Rebinding an occupied section is a legal act with a cost. The set
 * says which sections have an incumbent; the cost is stated at the control that
 * charges it (`effects-preset.ts`'s `rebindOrphanNotice`).
 *
 * ⚠ AND IT IS NOT A FOURTH CONDITION ROW. Conditions 1-3 answer one question —
 * *can this section carry an editor-authored raster band?* — and every one of
 * them is a fact about aeon's level data with a remedy a programmer performs.
 * Occupancy answers a DIFFERENT question (*what does binding here cost?*), it
 * is a fact about Aurora's own editor files, its remedy is the author's own
 * next click, and the answer would be `✓` on a section where binding is refused
 * outright. A row that shares a column, a mark vocabulary and an "N of 3"
 * caption with three rows it does not belong to would be read as a fourth
 * condition on the same question. It goes on the ACT LINE, in that line's own
 * grammar — a third derived set beside the two already there — which is exactly
 * where the reader formed the false impression, and costs no new row on a strip
 * the owner already calls confusing.
 *
 * ⚠ DERIVED FROM ITS OWN CONDITION, which is why it takes the SECTIONS and not
 * a `SectionRasterWiring`: this is the one of the three sets that is not in
 * aeon's two files at all. It is `section.rasterRef`, the key Aurora itself
 * writes to `section_N.meta.json`. Folding it through the wiring parse would
 * make it answer `none` whenever a file aeon owns was unreadable — the
 * self-contradiction `ownPresetSections`' docblock records the strip shipping
 * for one harness run.
 */
export function boundSections(
  sections: readonly ({ rasterRef: string | null } | null)[],
): number[] {
  const out: number[] = [];
  sections.forEach((s, i) => { if (s !== null && s.rasterRef !== null) out.push(i); });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION 3 — THE OTHER CHANNELS ONE `rasterRef` BINDS
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── WHAT THE STRIP PROMISED, AND WHAT IT COULD NOT KEEP ───
//
// The two conditions above are BOTH about the `raster:` channel, and a section
// showing ✓✓ was Aurora telling an author "you can bind a raster band here".
// The 2026-09-05 cold read (`docs/reviews/2026-09-05-effects-cold-read.md`,
// finding D-A) moved a binding to section 5 — the one section the strip marked
// ✓ own preset AND ✓ threaded — and the build refused it anyway:
//
//   > section 5's sidecar names rasterRef 'coldread_water_tint', whose document
//   > carries cycles — so the generator emits 1 cycle binding row(s) for sec 5
//   > into ojz_act1_sec_cycle. But OJZ_Preset_Sec5 … threads ojz_act1_sec_cycle
//   > for sec 5 NOWHERE. One rasterRef binds the WHOLE document (ruling Q1), so
//   > every key it carries owes its own chooser at that section's preset().
//
// Verified in aeon's own text, not taken from the report: `OJZ_Preset_Sec5`
// spells `cycle: Pal_Cycle_None` — a LITERAL, not the chooser — while threading
// `raster:` and both patch arrays (`games/sonic4/data/effects/ojz_effects.emp`
// at 305af22217b4a8fbf055eaa301bd484aba7c133c, the record at line 1603).
//
// ⚠ A LIE IS WORSE THAN A CONTROL. Two ticks is a VERDICT, and it was wrong for
// exactly the document a reader authoring a raster band plus a palette cycle
// ends up with. So the strip publishes the third condition rather than either
// suppressing the tick or refusing the binding.
//
// ─── WHY A THIRD ROW AND NOT A "CANNOT BIND HERE" ───
//
// Two shapes were open. The row wins on the precedent this file already
// carries, in its own words (the block above `sectionWiringConditions`):
//
//     condition 1 fails → ask for a preset SPLIT (a data change, several lines)
//     condition 2 fails → ask for ONE aeon line
//
// The two are kept apart because WHICH one you fail decides what you do next.
// Condition 3 has a THIRD remedy and a different one — not a split, and not the
// same line: `cycle: ojz_act1_sec_cycle(sec: 5, hand: Pal_Cycle_None)` inside
// that section's `preset()`. A distinct remedy earns a distinct row by the rule
// already written here. Folding it into a single "cannot bind here" would undo
// the split this file exists to defend, and it would be a PROHIBITION — which
// `core/formats/raster-binding.ts`'s standing refusal forbids Aurora from
// publishing. Condition 3 is an advisory, like the other two: nothing is
// disabled, the binding is still written, aeon's build stays the authority.
//
// The cost is one ~14px row in a ~100px permanent strip. The owner's standing
// complaint that this tooling is "confusing and convoluted" is real and this is
// more surface — but a third row that is true beats two rows that are not.
//
// ─── WHY THE REQUIRED SET IS DERIVED, AND FROM WHAT ───
//
// ⚠ NOT A LIST OF WHICH SECTIONS THREAD WHAT. That is a fact about aeon's tree
// and it goes stale exactly the way "sections 6, 7 and 8 share a preset" did —
// section 7 left that record on 2026-09-05, one day after it was written down.
// The call sites are parsed from `<zone>_effects.emp` on every load, by the
// same `preset()`-record split condition 2 already uses, from the SAME read.
// Nothing about which sections are threaded appears in this repository.
//
// What IS written down here is the CHANNEL TABLE — the schema-level fact that a
// preset document has six chooser channels and which document key owes which.
// It is transcribed from aeon's own single source of truth:
//
//   aeon `tools/effects_gen.py` :: SECTION_CHANNELS / document_channels
//   aeon `tools/effects_seam_gate.py` :: channel_faults
//   read at commit 305af22217b4a8fbf055eaa301bd484aba7c133c (2026-09-05)
//
// and aeon's own banner says why that table exists rather than six predicates:
//
//   > A gate that named the four channels would close this hole and reopen it
//   > at the fifth key — `boundary` itself was the fourth key added in a
//   > fortnight. The requirement is a FUNCTION of the document
//   > (`effects_gen.document_channels`) … A key that starts emitting rows
//   > starts being required here on the same commit.
//
// The same reasoning applies one repo over: a condition that checked `cycles`
// alone would have been right for the cold read and silently wrong for the
// `patch_world_ys` + `patch_motion` document Aurora itself measured on
// 2026-09-04 (`docs/reviews/2026-09-04-boundary-moving-witness.md`), which is
// the very case aeon added `channel_faults` for. So all four non-arm channels
// are here, index arguments included.
//
// ─── WHAT IS DELIBERATELY *NOT* HERE ───
//
// THE TWO ARMS. `raster` and `patched` are aeon's `ARM_CHANNELS`, and its
// `channel_faults` skips them for the same reason this does: they have their
// own per-section check, which is condition 2. ⚠ CONDITION 2 ASKS ONLY ABOUT
// THE `raster:` ARM, so it is still the wrong question for a document carrying
// `boundary` (which lowers into `patched:` and is chosen by a DIFFERENT
// generated function, `<act>_sec_patched`). That is a real, separate defect of
// condition 2 and it is NOT fixed here — recorded in
// `docs/reviews/2026-09-05-coldread-fixes.md` rather than folded into this
// parcel, because changing what condition 2 MEANS is a different change from
// adding a condition that was missing.

/**
 * The document keys condition 3 reads. Structural on purpose: `EffectsPreset`
 * satisfies it, and this module stays importable by anything without dragging
 * the 2,000-line preset codec (and its 52KB schema JSON) in behind it.
 *
 * ⚠ THE THREE STATES ARE ABSENT / null / VALUE and absent is one of them, so
 * every predicate below asks whether the KEY IS CARRIED, never whether the
 * value is truthy. `cycles: null` is "cycling OFF", which still emits a row and
 * still owes the chooser — aeon's `owed` for it is literally `"cycles" in d`.
 */
export interface ChannelBearingDocument {
  cycles?: unknown;
  variants?: unknown;
  patch_world_ys?: unknown;
  patch_motion?: unknown;
}

/** `cyclesState`'s own test for "the document carries this key at all". */
function carries(doc: ChannelBearingDocument, key: keyof ChannelBearingDocument): boolean {
  return key in doc && doc[key] !== undefined;
}

/** How many indices a positional channel's array reaches — `null` entries included. */
function arrayLength(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

/** One non-arm chooser channel — aeon's `SectionChannel`, the fields we use. */
export interface SectionChannelSpec {
  /** aeon's `channel` — the word its fault messages and this row's detail use. */
  channel: string;
  /** The DOCUMENT's key. */
  key: keyof ChannelBearingDocument;
  /**
   * The `preset()` PARAMETER's spelling, which is NOT always the document key —
   * the document says `cycles` (an array of scripts) and the parameter says
   * `cycle` (one pointer). aeon keeps them as two fields because "a message that
   * reported one as the other would send the author to edit the wrong file".
   */
  param: string;
  /** The chooser's name after `<zone>_<act>_sec_`; also not always the key. */
  chooserSuffix: string;
  /** `slot` / `ch`, or null when the chooser takes only `sec:`. */
  indexParam: string | null;
  /** Does a document carrying these keys owe this chooser? aeon's `owed`. */
  owed: (doc: ChannelBearingDocument) => boolean;
  /** Which indices' rows the generator emits. aeon's `indices`. */
  indices: (doc: ChannelBearingDocument) => number[];
  /** The `hand:` sentinel aeon's `prescription` writes, or null when it has none. */
  hand: string | null;
}

/**
 * aeon's `SECTION_CHANNELS` minus its two `ARM_CHANNELS`, in its order.
 *
 * ⚠ WHEN AEON ADDS A SEVENTH KEY THIS GOES SILENTLY SHORT. That is the one
 * weakness of a transcription across a repo boundary and it is stated rather
 * than hidden: the accompanying test asserts this table against aeon's own
 * `effects_gen.py` when a checkout is reachable, and SKIPS WITH A REASON when
 * it is not — so a divergence is loud in the suite rather than silent on screen.
 */
export const EXTRA_SECTION_CHANNELS: readonly SectionChannelSpec[] = Object.freeze([
  {
    channel: 'cycle', key: 'cycles', param: 'cycle', chooserSuffix: 'cycle',
    indexParam: null,
    owed: (d) => carries(d, 'cycles'),
    indices: () => [0],
    hand: 'Pal_Cycle_None',
  },
  {
    channel: 'variant', key: 'variants', param: 'variants', chooserSuffix: 'variant',
    indexParam: 'slot',
    // aeon's `owed` here is `d.get("variants") is not None` and NOT `in d` — the
    // one channel where a null key owes nothing, because `variants` has no
    // key-level null state (clearing both slots is `[null, null]`).
    owed: (d) => carries(d, 'variants') && d.variants !== null,
    indices: (d) => Array.from({ length: arrayLength(d.variants) }, (_, i) => i),
    hand: null,
  },
  {
    channel: 'patch world-Y', key: 'patch_world_ys', param: 'patch_world_ys',
    chooserSuffix: 'patch_world_y', indexParam: 'ch',
    owed: (d) => carries(d, 'patch_world_ys'),
    indices: (d) => Array.from({ length: arrayLength(d.patch_world_ys) }, (_, i) => i),
    hand: 'PATCH_ANCHOR_NONE',
  },
  {
    channel: 'patch motion', key: 'patch_motion', param: 'patch_motion',
    chooserSuffix: 'patch_motion', indexParam: 'ch',
    owed: (d) => carries(d, 'patch_motion'),
    indices: (d) => Array.from({ length: arrayLength(d.patch_motion) }, (_, i) => i),
    hand: 'ANCHOR_MOTION_NONE',
  },
]);

/**
 * One generated chooser's name — aeon `ActNames`: `stem = f"{zone_id}_{act_id}"`.
 * `rasterChooserName` is this with `'raster'`, kept as its own function because
 * a dozen call sites name it.
 */
export function channelChooserName(zoneId: string, actId: string, suffix: string): string {
  return `${zoneId}_${actId}_sec_${suffix}`;
}

/**
 * `{preset record: {sec index: the index arguments threaded}}` for ONE chooser.
 *
 * ⚠ MATCHED BY THE CHOOSER'S NAME AND NOT BY ITS `preset()` PARAMETER, which is
 * aeon's `channel_call_sites` and is deliberate there: "The other four choosers
 * have exactly one legal `preset()` parameter each AND a name of their own, so
 * the name alone identifies the channel and a call anywhere in the record's
 * body is the evidence." It also matters for a plain mechanical reason —
 * `variants:` and the two patch arrays are ARRAY LITERALS holding several
 * calls, so a parameter-anchored regex would see only the first.
 *
 * The record split is `libraryRasterChooserCalls`', so the two conditions can
 * never disagree about which text belongs to which `preset()`.
 */
export function libraryChannelChooserCalls(
  lib: string, chooserFn: string, indexParam: string | null,
): Record<string, Record<number, number[]>> {
  const out: Record<string, Record<number, number[]>> = {};
  const decl = /\b(?:pub\s+)?(?:const|data)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = decl.exec(lib)) !== null) marks.push({ name: m[1], at: m.index });
  const fn = chooserFn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = indexParam === null
    ? `${fn}\\s*\\(\\s*sec\\s*:\\s*(\\d+)`
    : `${fn}\\s*\\(\\s*sec\\s*:\\s*(\\d+)\\s*,\\s*${indexParam}\\s*:\\s*(\\d+)`;
  for (let i = 0; i < marks.length; i++) {
    const body = lib.slice(marks[i].at, marks[i + 1]?.at ?? lib.length);
    const call = new RegExp(pattern, 'g');
    let hit: RegExpExecArray | null;
    while ((hit = call.exec(body)) !== null) {
      const sec = Number(hit[1]);
      const idx = indexParam === null ? 0 : Number(hit[2]);
      const perPreset = (out[marks[i].name] ??= {});
      const list = (perPreset[sec] ??= []);
      if (!list.includes(idx)) list.push(idx);
    }
  }
  for (const preset of Object.values(out)) {
    for (const sec of Object.keys(preset)) preset[Number(sec)].sort((a, b) => a - b);
  }
  return out;
}

/** Every non-arm chooser's call sites, from ONE read of the effects library. */
export function libraryChannelCalls(lib: string, zoneId: string, actId: string)
: Record<string, Record<string, Record<number, number[]>>> {
  const out: Record<string, Record<string, Record<number, number[]>>> = {};
  for (const ch of EXTRA_SECTION_CHANNELS) {
    out[ch.channel] = libraryChannelChooserCalls(
      lib, channelChooserName(zoneId, actId, ch.chooserSuffix), ch.indexParam);
  }
  return out;
}

/** The `preset()` argument to WRITE for one owed channel — aeon's `prescription`. */
export function channelPrescription(ch: SectionChannelSpec, fn: string, sec: number): string {
  if (ch.indexParam === null) return `${ch.param}: ${fn}(sec: ${sec}, hand: ${ch.hand})`;
  const hand = ch.hand === null ? '' : `, hand: ${ch.hand}`;
  return `${ch.param}: [${fn}(sec: ${sec}, ${ch.indexParam}: 0${hand}), … one per index]`;
}

/** One owed-but-missing channel, named so the caller can spell the remedy. */
export interface ChannelGap {
  channel: SectionChannelSpec;
  /** The generated chooser this section owes. */
  chooserFn: string;
  /** The indices the generator emits rows for. */
  want: number[];
  /** The indices actually threaded — empty when the chooser is threaded nowhere. */
  got: number[];
}

/** Condition 3's verdict, plus the gaps its advisory spells out. */
export interface ExtraChannelsCondition extends WiringCondition {
  gaps: ChannelGap[];
}

/**
 * CONDITION 3, for one section and the document it binds today.
 *
 * ⚠ THIS CONDITION IS ABOUT A PAIR, and conditions 1 and 2 are about a section
 * alone. That asymmetry is aeon's, not a shortcut: which choosers a section owes
 * is a FUNCTION OF THE DOCUMENT'S KEYS (`document_channels`), so there is no
 * section-only answer to give. `doc` is the preset the section's `rasterRef`
 * names — the same `rasterRef` the strip prints one line above the rows.
 *
 * THE VERDICTS:
 *   `unknown`  the library was not read — "Aurora could not check", never
 *              "you may not". The standing refusal's hardest clause.
 *   `yes`      nothing is bound, or every channel the bound document owes is
 *              threaded at this section, at every index the document reaches.
 *   `no`       some owed chooser is threaded nowhere here, or only at some of
 *              its indices. `gaps` names them and `detail` spells the first.
 *
 * ⚠ `yes` WITH NOTHING BOUND IS NOT A PROMISE ABOUT A FUTURE DOCUMENT, and the
 * detail says so in words rather than leaving the tick to be read as one: what
 * a section owes depends on what you bind to it, so the row reports which extra
 * choosers are threaded HERE, which is the fact an author choosing where to
 * bind actually needs.
 */
export function sectionExtraChannelsCondition(
  w: SectionRasterWiring, sectionIndex: number, doc: ChannelBearingDocument | null,
  zoneId: string, actId: string, docId?: string | null,
): ExtraChannelsCondition {
  const owner = w.bindings[sectionIndex];
  const threadedHere = (ch: SectionChannelSpec): number[] => {
    // The chooser must be threaded IN THE RECORD THIS SECTION BINDS — aeon's
    // `channel_faults` looks the call up at `bindings.get(sec)` and nowhere
    // else, because a row emitted for sec N is only read by sec N's `preset()`.
    if (owner === undefined) return [];
    const perPreset = w.channelThreadedBy[ch.channel] ?? {};
    return (perPreset[owner] ?? {})[sectionIndex] ?? [];
  };

  if (!w.library.parsed) {
    return {
      verdict: 'unknown', record: null, gaps: [],
      detail: `could not read ${basename(w.library.path)}`,
    };
  }

  if (doc === null) {
    // NOTHING BOUND. Say what IS threaded here rather than tick and stay silent
    // — the tick is about today's (empty) obligation, and the author reading it
    // is about to create tomorrow's.
    const have = EXTRA_SECTION_CHANNELS
      .filter((ch) => threadedHere(ch).length > 0).map((ch) => ch.channel);
    return {
      verdict: 'yes', record: null, gaps: [],
      detail: have.length === 0
        ? 'nothing bound; no extra chooser threaded here'
        : `nothing bound; ${have.join(', ')} threaded here`,
    };
  }

  const gaps: ChannelGap[] = [];
  const owedChannels = EXTRA_SECTION_CHANNELS.filter((ch) => ch.owed(doc));
  for (const ch of owedChannels) {
    const chooserFn = channelChooserName(zoneId, actId, ch.chooserSuffix);
    const indices = ch.indices(doc);
    // aeon: `want = set(ch.indices(doc) or {0})` — an owed channel whose array
    // is empty still owes the chooser once.
    const want = indices.length === 0 ? [0] : indices;
    const got = threadedHere(ch);
    if (want.some((i) => !got.includes(i))) gaps.push({ channel: ch, chooserFn, want, got });
  }

  const name = docId ?? null;
  if (owedChannels.length === 0) {
    return {
      verdict: 'yes', record: name, gaps: [],
      detail: `${name ?? 'the bound preset'} carries no extra channel`,
    };
  }
  if (gaps.length === 0) {
    return {
      verdict: 'yes', record: name, gaps: [],
      detail: `${owedChannels.map((c) => c.channel).join(', ')} threaded`,
    };
  }
  const first = gaps[0];
  const rest = gaps.length > 1 ? ` (+${gaps.length - 1} more)` : '';
  const detail = first.got.length === 0
    ? `nothing threads ${first.chooserFn}(sec: ${sectionIndex})${rest}`
    : `${first.chooserFn}(sec: ${sectionIndex}) threaded only at `
      + `${first.channel.indexParam} ${first.got.join(',')}${rest}`;
  return { verdict: 'no', record: name, gaps, detail };
}

/**
 * What to say under a ✗ on condition 3 — the remedy, spelled as it assembles.
 *
 * The spellings come from aeon's `prescription`, whose own rule is that every
 * form it prints is COPIED from a record `ojz_effects.emp` already carries:
 * "a gate must never prescribe a spelling nobody can write".
 *
 * ⚠ A FACT ABOUT THE LEVEL AND THE DOCUMENT, NEVER A PROHIBITION — the rule the
 * other two advisories are shaped around. It says what is missing and what one
 * line closes it; it never tells the author they may not bind.
 */
export function extraChannelsAdvisory(
  gaps: ChannelGap[], sectionIndex: number, docId: string | null, owner: string | undefined,
): string | null {
  if (gaps.length === 0) return null;
  const where = owner === undefined
    ? `section ${sectionIndex} binds no preset record in the act descriptor, so nothing`
    : `${owner}, the preset record section ${sectionIndex} binds,`;
  const lines = gaps.map((g) => {
    const what = g.got.length === 0
      ? `${where} threads ${g.chooserFn} for sec ${sectionIndex} nowhere`
      : `${where} threads ${g.chooserFn} for sec ${sectionIndex} only at `
        + `${g.channel.indexParam} ${g.got.join(', ')}, and the document reaches `
        + `${g.want.join(', ')}`;
    return `• ${g.channel.key}: ${what}. Write, inside that preset(): `
      + `${channelPrescription(g.channel, g.chooserFn, sectionIndex)}`;
  });
  return `${docId ?? 'The bound preset'} carries `
    + `${gaps.length === 1 ? 'a key' : 'keys'} beyond its raster program, and one rasterRef `
    + 'binds the WHOLE document (aeon ruling Q1), so every key it carries owes its own '
    + 'chooser at this section\'s preset(). A row nothing calls is a row nothing reads, which '
    + 'presents as an assignment that did nothing, and aeon\'s build refuses it by name:\n'
    + `${lines.join('\n')}\n`
    + `That is ${gaps.length === 1 ? 'one line' : 'those lines'} in aeon, not a redesign. `
    + 'The binding is written either way.';
}
