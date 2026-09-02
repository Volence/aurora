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
  descriptor: WiringSource;
  library: WiringSource;
}

/** Nothing was read. Every predicate below answers "unknown", never "no". */
export function unknownWiring(descriptorPath: string, libraryPath: string, reason: string)
: SectionRasterWiring {
  return {
    bindings: {},
    threadedBy: {},
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
      + 'refuses that and asks for the record to be split first — one preset per section that '
      + 'needs its own raster channel.';
  }
  if (state === 'unbound') {
    return `Section ${sectionIndex} binds no preset record in the act descriptor, so there is `
      + 'nothing for a raster program to hang off. A programmer gives it one.';
  }
  // 'unthreaded'
  return `Section ${sectionIndex}'s preset record ${w.bindings[sectionIndex]} is its own — nothing `
    + 'else shares it — but nothing threads the raster chooser into it yet, so aeon\'s canonical '
    + `build refuses a binding here ("no preset threads ${chooserFn}(sec: ${sectionIndex})"). `
    + 'That is one line in aeon, not a redesign. The binding is written either way.';
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
