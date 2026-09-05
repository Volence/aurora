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
// So the output is an ADVISORY. Nothing here disables a control. And the
// refusal's hardest clause is honoured exactly: if the files are absent or
// unparseable, the answer is "I could not read this", NEVER "you may not". A
// control greyed out because a file could not be read is indistinguishable, to
// the author, from one greyed out because the thing is impossible.

/** Where a wiring answer came from, and whether it could be had at all. */
export interface WiringSource {
  /** Project-relative path that was read. */
  path: string;
  /** True when the file was read AND the parse found at least one match. */
  parsed: boolean;
  /** Why not, when `parsed` is false — shown to the author verbatim. */
  reason?: string;
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
  descriptor: WiringSource;
  library: WiringSource;
}

/** Nothing was read. Every predicate below answers "unknown", never "no". */
export function unknownWiring(descriptorPath: string, libraryPath: string, reason: string)
: SectionRasterWiring {
  return {
    bindings: {},
    threadedBy: {},
    channelThreadedBy: {},
    descriptor: { path: descriptorPath, parsed: false, reason },
    library: { path: libraryPath, parsed: false, reason },
  };
}

/**
 * `{sec index: the preset record that section's `<zone>_sec(...)` binds}`.
 *
 * ⚠ THE APPROACH IS AEON'S `descriptor_effects_bindings`, DELIBERATELY, and the
 * one thing copied from their lane is the ABSENCE of a window: split the file on
 * each `<zone>_sec(sec: N`, then search the WHOLE following chunk for
 * `effects: <Name>`. Their own first attempt windowed to 800 characters and
 * reported section 0 as binding nothing, because its `effects:` sits at offset
 * 964. This function must never grow a bound.
 *
 * A section that binds no `effects:` is ABSENT from the map rather than mapped
 * to null — the field defaults to 0 = "no preset", which is a legal state and
 * not a fault. Callers must not read "absent" as "shared".
 */
export function descriptorEffectsBindings(desc: string, zoneId: string): Record<number, string> {
  const out: Record<number, string> = {};
  // The section constructor is `<zone>_sec(sec: N, …)` by aeon's own
  // convention; keyed on the zone id so one act's parse cannot pick up
  // another's, and so `<act>_sec_raster(sec: 5)` in the same file is not
  // mistaken for a section record.
  const split = new RegExp(`\\b${zoneId}_sec\\s*\\(\\s*sec\\s*:\\s*(\\d+)`, 'g');
  const chunks = desc.split(split);
  for (let i = 1; i < chunks.length; i += 2) {
    const m = /effects\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(chunks[i + 1] ?? '');
    if (m) out[Number(chunks[i])] = m[1];
  }
  return out;
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
    return `Aurora could not read ${which.path}, so it cannot say whether section ${sectionIndex} `
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
      return { verdict: 'unknown', record: null, detail: `could not read ${basename(w.descriptor.path)}` };
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
