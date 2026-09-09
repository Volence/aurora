import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  at,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BGANIM_SECTION_CEILING,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  BG_LAYOUT_WORDS_LEGACY,
  LAYOUT_WORD_MAX,
  LAYOUT_TILE_INDEX_MASK,
  TILE_BYTES,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  BGANIM_DRIVERS,
  BGANIM_BAND_AXES,
  BAND_AXIS_DEFAULT,
  BAND_AXIS_UNIT_KEY,
  BAND_AXIS_PERIOD_KEY,
  TOP_LEVEL_KEYS,
  BAND_KEYS,
  OWNED_KEYS,
  ROUND_TRIPPED_KEYS,
  LEGACY_ANIM_KEY,
  BG_OVERRIDE_CONSUMER_PATH,
  BG_OVERRIDE_CONSUMER_OUT_DIR,
} from '../../src/core/formats/bg-override/bg-override';
// The ONE number this repo genuinely holds twice — see the row that pins it.
import { BG_TILE_BASE_SLOT as LOADER_BG_TILE_BASE_SLOT } from '../../src/core/formats/bg-tiles';

/**
 * Drift gate for the vendored aeon consumer contract.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT — stated in full, because the honest
 * scope is narrower than "the contract is in sync":
 *
 *   PROVES  our vendored copy is the blob we pinned, so nobody can edit a
 *           constant in this repo (raise the band ceiling, change a default)
 *           without the pin failing; and every constant the codec exports is
 *           READ from that copy rather than typed beside it.
 *
 *   DOES NOT PROVE anything about aeon. Nothing in THIS file can observe aeon
 *           changing, and that is deliberate: a sibling-repo path probe is
 *           wrong from a worktree, wrong from a lone clone, and absent from a
 *           packaged build, and it would degrade to "not found -> skip", which
 *           renders "could not measure" as green.
 *
 *           ⚠ THAT GAP HAD A COST AND IS NOW PARTLY CLOSED. Re-reconciling by
 *           hand did not happen: `BG_TILE_CAPACITY` sat here at 448 after aeon
 *           took the BG arena to 400 (EFFECTS-W1 item 9d), so Aurora accepted
 *           documents of 401..448 tiles that aeon's injector refused, and the
 *           stale entry's own citation named a line number that had also moved.
 *           ⚠ AND THEN THE SAME THING, AT THE NEXT CEILING DOWN: aeon cut the
 *           arena twice on 2026-09-08 and the vendored copy lagged about 18
 *           hours, red master included. The full chain is in the re-pin comment
 *           above `CONTRACT_SHA256` below; this paragraph is the FIRST incident
 *           and is not the whole history.
 *           `test/formats/bg-override-contract-currency.test.ts` now reads
 *           aeon's authorities at a COMMITTED revision (`git show`, never the
 *           working tree) and skips LOUDLY when aeon is absent, which is the
 *           shape `aeon-fixture-currency.test.ts` had already established for
 *           the vendored fixtures. It covers the VALUES only; the line numbers
 *           in `authorities` are still checked by nothing.
 *
 * Last reconciled 2026-08-22 against aeon
 * 1ee8f8e68d826b18023639ab32a8f7c82f238e62 (origin/master), reading
 * tools/EFFECTS_CONSUMER_CONTRACT.md, tools/inject_editor_bg.py,
 * tools/bg_override_io.py, tools/test_bg_emit.py, tools/vram_map.py,
 * engine/level/bg_anim.emp and engine/system/constants.emp.
 *
 * EXTENDED 2026-08-26 with `outputDir` — the consumer's hardcoded OUTPUT
 * directory, which is the whole of the answer to "which act does this per-game
 * document govern?" (docs/decisions.jsonl d-12). NOT a re-vendoring: it was read
 * at the SAME commit and the SAME blob (tools/inject_editor_bg.py
 * 5cef80aaac156a7627ab119c06d6d846f450ca40, verified with `git -C ../aeon show`),
 * and no other value in the file moved. tools/regenerate-level.sh joined
 * `source.documents` because it is what makes that path project-root-relative.
 *
 * AMENDED 2026-09-03 with the MOTION AXIS, re-derived at aeon
 * 3a4712faa920100653669c1ec3fc26c2da71ef68 (reachable from their origin/master)
 * from tools/inject_editor_bg.py's `BAND_AXES` / `_AXIS_UNIT_TILES` /
 * `_AXIS_PERIOD_TILES` / `band_axis_geometry` / `validate_band_phase_axis` and
 * §1.2 of the contract doc. THIS FILE IS A DERIVATION, NOT A BYTE COPY of any
 * aeon blob — there is no aeon blob whose hash could pin it, which is why the
 * pin below is over OUR text and why `amendments` records the revision each
 * value was read at. A partial re-derivation is legitimate and must SAY SO:
 * `amendments[0].notALL` and `outputDir.note` carry the two values this one did
 * NOT re-vendor, one of which (the act binding) has moved in SHAPE at that
 * revision without moving in VALUE. Asserted below rather than left to prose.
 */

const CONTRACT_PATH = resolve(
  __dirname, '../../src/core/formats/bg-override/bganim-consumer-contract.json',
);
const CONTRACT_TEXT = readFileSync(CONTRACT_PATH, 'utf8');
// Re-pinned 2026-09-08 by the `bg-capacity-376` amendment. A CONSTANT MOVED this
// time, unlike the three re-pins before it: `BG_TILE_CAPACITY` 400 -> 376, which
// is aeon's SECOND and THIRD cut to the same number in four days (400 -> 388 ->
// 376, both on 2026-09-08, each paying for a spring art sheet out of the arena's
// unresident `band_reserve`). The three currency rows for that constant were RED
// on master until this pin moved; they are the gate that found it, and they are
// the reason this re-pin is a re-vendor rather than a prose edit.
//
// ⚠ `BG_STATIC_TILE_BUDGET` DID NOT MOVE and is still 320. Every raid cut
// `band_reserve` by exactly what it cut from `tiles`, so the STATIC importer
// budget and the shipped background blob are untouched; what fell is the TOTAL
// ceiling, which is the one this repo refuses at. Do not read this re-pin as the
// background having shrunk.
//
// Three uninstrumented `notVendored` values moved with the ceiling and are
// repaired in the same commit (`BG_BAND_RESERVE` 80 -> 56, and
// `VRAM_WATERLINE_STRIPS` 45568 -> 44800 because it is DERIVED from the
// capacity), plus six line numbers that drifted without their values moving. The
// amendment's `scope` names the eight coordinates it deliberately did NOT repair.
//
// ⚠ AND THE AMENDMENT'S `commit` IS A TIP, NOT THE CHANGE. It records aeon's
// `origin/master` when the values were re-derived, which is what the currency
// gate resolves at run time — but both of the last two anchors were DOCS-CLASS
// commits touching no code, so the entry now carries
// `commitIsATipNotAChange` naming 917569e9 and 67458e39 as the commits that
// actually moved the number. aeon's tip moved FOUR times during this parcel
// (54e2be22 -> 27eb42b1 -> 8f66e233 -> 937be0f5); the ceiling was re-derived at
// the last two and held at 376 in all three authorities.
//
// The previous pin, from the `section-budget-in-prose` amendment, was
// 8f1c9e288502b000888bf94bc8d46d3a1c07b582483487c3305e5fd8e650c95b.
const CONTRACT_SHA256 = 'df180c1010d1e7ff6948f85b8e715910c100958da0c9fc5695720e30483b263f';

describe('the vendored contract is the one we pinned', () => {
  it('matches the pinned content hash', () => {
    expect(createHash('sha256').update(CONTRACT_TEXT).digest('hex')).toBe(CONTRACT_SHA256);
  });

  it('records the aeon revision it was read at, and the documents it was read from', () => {
    expect(at(['source', 'commit'])).toMatch(/^[0-9a-f]{40}$/);
    // Every aeon authority the constants below cite must be named in `source`,
    // so a reader can re-derive rather than trust.
    const docs = (at(['source', 'documents']) as string[]).join('\n');
    for (const f of ['tools/EFFECTS_CONSUMER_CONTRACT.md', 'tools/inject_editor_bg.py',
                     'tools/bg_override_io.py', 'tools/test_bg_emit.py', 'tools/vram_map.py',
                     'engine/level/bg_anim.emp', 'engine/system/constants.emp']) {
      expect(docs).toContain(f);
    }
  });
});

describe('every exported constant is READ from the contract, not typed beside it', () => {
  /**
   * The pairing is written as data so the test cannot fall behind the module:
   * the second assertion below walks the CONTRACT's own constant list and fails
   * on any entry this table does not cover. A constant added to the vendored
   * file and never exported is the exact shape of "we vendored it and then
   * hardcoded it anyway".
   */
  const EXPORTED: Record<string, number> = {
    BGANIM_MAX_BANDS, BGANIM_PHASE_BANKS, BG_TILE_CAPACITY, TILE_BYTES, TILE_PIXELS,
    TILE_PIXEL_MAX, TILE_WIDTH_PX, BG_LAYOUT_WORDS, BG_LAYOUT_WORDS_LEGACY, LAYOUT_WORD_MAX,
    LAYOUT_TILE_INDEX_MASK,
    // The second budget, in ROM bytes. Vendored 2026-09-06; see the
    // `section-ceiling` amendment.
    BGANIM_SECTION_CEILING, BGANIM_COUNT_BYTES, BGANIM_RECORD_BYTES, BGANIM_BYTES_PER_SLOT,
    BGANIM_VIEW_COUNT, BGANIM_VIEW_DERIVED_PERIOD_PX,
  };

  it('every exported constant equals its contract value', () => {
    for (const [name, value] of Object.entries(EXPORTED)) {
      expect(value).toBe(at(['constants', name, 'value']));
    }
  });

  it('covers every constant the contract declares (BG_TILE_BASE_SLOT excepted, with a reason)', () => {
    const declared = Object.keys(at(['constants']) as Record<string, unknown>)
      .filter(k => !k.startsWith('$'));
    expect(declared.length).toBeGreaterThan(8);
    const uncovered = declared.filter(k => !(k in EXPORTED));
    // BG_TILE_BASE_SLOT is recorded but deliberately not enforced by this
    // codec: it is what makes the prefix relation an IDENTITY
    // (1024 * 32 = $8000 = the tile blob's own VRAM base), not a rule the JSON
    // document can violate. Its `why` says so, and this assertion holds the
    // exception to exactly one name.
    expect(uncovered).toEqual(['BG_TILE_BASE_SLOT']);
    expect(at(['constants', 'BG_TILE_BASE_SLOT', 'why'])).toMatch(/Not enforced by this codec/);
  });

  /**
   * BG_TILE_BASE_SLOT is not enforced by the CODEC — but it is used, as a
   * second literal, by the LOADER: `bg-tiles.ts` exports its own
   * `BG_TILE_BASE_SLOT = 1024` and `normalizeBgLayout` rebases every
   * engine-emitted layout by it. That is a second copy of a contract number
   * living in a module nobody greps when reconciling the contract — the
   * "four-copies-of-448" shape the vendored file's own comment warns about,
   * found while enumerating ceiling sites for ROADMAP item 8.
   *
   * Left as a PIN rather than an import: `bg-tiles.ts` is the classic/S1 loader
   * too, and making the aeon contract a hard dependency of it would be a wider
   * change than this parcel earns. The pin makes the two disagree LOUDLY
   * instead of silently, which is the property that was missing.
   */
  it('the LOADER\'s BG_TILE_BASE_SLOT agrees with the contract\'s', () => {
    expect(LOADER_BG_TILE_BASE_SLOT).toBe(at(['constants', 'BG_TILE_BASE_SLOT', 'value']));
  });

  it('every constant carries at least one aeon authority', () => {
    for (const name of Object.keys(at(['constants']) as Record<string, unknown>)) {
      const auth = at(['constants', name, 'authorities']) as string[];
      expect(Array.isArray(auth)).toBe(true);
      expect(auth.length).toBeGreaterThan(0);
      for (const a of auth) expect(a).toMatch(/^aeon |^empyrean /);
    }
  });

  it('the band ceiling names all three aeon authorities and the gate that binds them', () => {
    // The one number this parcel was told not to pin. Three files hold it in
    // aeon and they are NOT collapsible (bg_anim.emp is lowered standalone
    // against an empty symbol table; the emitter's copy is Python), so the
    // aeon-side answer is "keep the mirrors, gate the drift". This asserts our
    // vendored extract records all three plus the gate, so a future reader can
    // re-derive instead of trusting a fourth copy.
    const auth = (at(['constants', 'BGANIM_MAX_BANDS', 'authorities']) as string[]).join('\n');
    expect(auth).toContain('engine/system/constants.emp');
    expect(auth).toContain('engine/level/bg_anim.emp');
    expect(auth).toContain('tools/inject_editor_bg.py');
    expect(at(['constants', 'BGANIM_MAX_BANDS', 'aeonGate']))
      .toContain('tools/test_bg_emit.py::TestBgAnimBandCeiling');
  });
});

describe('the contract declares a complete, well-formed key model', () => {
  it('gives every top-level key an ownership and a citation', () => {
    for (const key of TOP_LEVEL_KEYS) {
      const ownership = at(['topLevelKeys', key, 'ownership']);
      expect(['own', 'round-trip', 'legacy-read-only']).toContain(ownership);
      expect(at(['topLevelKeys', key, 'cite'])).toMatch(/inject_editor_bg\.py/);
    }
  });

  it('partitions the top-level keys with nothing uncategorised and nothing double-counted', () => {
    const partition = [...OWNED_KEYS, ...ROUND_TRIPPED_KEYS, LEGACY_ANIM_KEY];
    expect(partition).toHaveLength(TOP_LEVEL_KEYS.length);
    expect(partition.slice().sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  });

  it('gives every band key a citation, and marks the required ones', () => {
    for (const key of BAND_KEYS) {
      expect(at(['bandKeys', key, 'cite'])).toMatch(/inject_editor_bg\.py/);
      expect(typeof at(['bandKeys', key, 'required'])).toBe('boolean');
    }
    const required = BAND_KEYS.filter(k => at(['bandKeys', k, 'required']) === true);
    // Derived from the consumer: cols/rows/pattern_px/phases are read with `[]`
    // (a KeyError at bake if absent); driver/rate_shift/slot_base use `.get()`.
    expect(required.slice().sort()).toEqual(['cols', 'pattern_px', 'phases', 'rows']);
  });

  it('names every invariant the codec and the band command enforce, prefix identity included', () => {
    const invariants = at(['invariants']) as Record<string, string>;
    expect(Object.keys(invariants).sort()).toEqual([
      'axisRoundTrip', 'bandCeiling', 'capacity', 'contiguousPacking',
      'insideTheBlob', 'layoutTileIndex', 'patternPeriod', 'phaseAxis',
      'prefixIdentity', 'rotationUnitPowerOfTwo', 'sectionCeiling', 'slotOrder',
      'viewTwins',
    ]);
    // THE SECOND BUDGET IS A SEPARATE INVARIANT FROM `capacity`, ON PURPOSE.
    // They are two ceilings on two quantities and a document can satisfy either
    // while violating the other; folding them into one rule is how the tighter
    // one went unmodelled. `sectionCeiling` therefore must not be about tiles,
    // and `capacity` must not be about bytes.
    expect(invariants.sectionCeiling).toContain('BGANIM_SECTION_CEILING');
    expect(invariants.sectionCeiling).toContain('NEVER PER BAND');
    // The quantifier, stated where a reader of the contract will meet it.
    expect(invariants.viewTwins).toContain('QUANTIFIED OVER THE ACT');
    // THE TWO RENAMES ARE PART OF THE AXIS AMENDMENT, not cosmetic: both rules
    // now read off a DIFFERENT band key per axis, so a name that says "column"
    // or "width" states the horizontal reading as if it were the only one — the
    // exact shape of stale rule this parcel went looking for. Asserted as
    // ABSENT so the old names cannot quietly come back beside the new ones.
    expect(invariants.columnBytesPowerOfTwo).toBeUndefined();
    expect(invariants.patternWidth).toBeUndefined();
    expect(invariants.prefixIdentity).toContain('phases[0] == tiles[slot_base');
    expect(invariants.capacity).toContain('PREFIX');
    // The layout-word rule the band command renumbers through. Both halves are
    // load-bearing and the second is the one a reader forgets: the index mask,
    // and the `word == 0` blank escape that is NOT a reference to tiles[0].
    expect(invariants.layoutTileIndex).toContain('attributes the consumer preserves');
    expect(invariants.layoutTileIndex).toContain('exactly 0');
  });

  it('records the driver table as a scalar-source map, not an axis list', () => {
    expect(BGANIM_DRIVERS).toEqual({ camera_x: 0, camera_y: 1, timer: 2 });
    expect(at(['drivers', '$comment'])).toMatch(/does NOT mean vertical motion/);
    // THE RETIRED RULE. "every band moves HORIZONTALLY" was true of this
    // comment until aeon 3a4712fa and is now false; a surface that still says it
    // teaches a limit the product no longer has. The sentence is asserted GONE
    // rather than merely replaced, because the failure mode is an old sentence
    // surviving beside a new one.
    expect(at(['drivers', '$comment'])).not.toMatch(/every band moves HORIZONTALLY/i);
    expect(at(['drivers', '$comment'])).toMatch(/`axis` key/);
  });

  /**
   * THE AXIS, and the three writer obligations that come with it.
   *
   * WHAT A GREEN HERE RULES OUT: a vendored file that gained `axis` without the
   * two tables the codec's refusals index (`unitKey` / `periodKey` — a missing
   * one makes `bandRotationUnitBytes` derive `undefined * 32` = NaN and the
   * power-of-two check pass silently on every band), and one that recorded the
   * key without recording that the consumer CANNOT CHECK the three things
   * Aurora now owes. It does NOT rule out anything about aeon; nothing here can
   * observe them, and `amendments` is what a reader re-derives from.
   */
  it('records the motion axis, its two key tables, and the aeon revision it was read at', () => {
    expect(BGANIM_BAND_AXES).toEqual(['horizontal', 'vertical']);
    expect(BAND_AXIS_DEFAULT).toBe('horizontal');
    expect(BGANIM_BAND_AXES).toContain(BAND_AXIS_DEFAULT);
    expect(BAND_KEYS).toContain('axis');
    expect(at(['bandKeys', 'axis', 'required'])).toBe(false);
    // The unit/period split is the whole of the geometry change, and the two
    // tables must be EXACT COMPLEMENTS over cols/rows on both axes — a table
    // that named the same key twice would make a band its own period and its
    // own rotation unit, which passes every shape check and bakes.
    for (const axis of BGANIM_BAND_AXES) {
      expect(['cols', 'rows']).toContain(BAND_AXIS_UNIT_KEY[axis]);
      expect(['cols', 'rows']).toContain(BAND_AXIS_PERIOD_KEY[axis]);
      expect(BAND_AXIS_UNIT_KEY[axis]).not.toBe(BAND_AXIS_PERIOD_KEY[axis]);
    }
    // ...and they must SWAP between the axes, which is the fact aeon's
    // `_AXIS_UNIT_TILES` / `_AXIS_PERIOD_TILES` encode. Two axes agreeing would
    // make `axis` a no-op that every other assertion here would still pass.
    expect(BAND_AXIS_UNIT_KEY.horizontal).not.toBe(BAND_AXIS_UNIT_KEY.vertical);
    expect(BAND_AXIS_PERIOD_KEY.horizontal).not.toBe(BAND_AXIS_PERIOD_KEY.vertical);

    const amendment = (at(['amendments']) as Record<string, unknown>[])
      .find((a) => a.id === 'axis');
    expect(amendment).toBeDefined();
    expect(amendment!.commit).toMatch(/^[0-9a-f]{40}$/);
    expect((amendment!.documents as string[]).join('\n'))
      .toContain('tools/inject_editor_bg.py');
    // A PARTIAL re-derivation must say which values it did NOT re-read. This is
    // the assertion that keeps "amended at revision X" from being read as
    // "every value in this file is current at X".
    expect(String(amendment!.notALL)).toMatch(/outputDir\.note/);
    expect(at(['outputDir', 'note'])).toMatch(/DRIFT DISCLOSED, NOT RE-VENDORED/);
  });

  it('names all three writer obligations, and says the consumer cannot check them', () => {
    // These are the parcel. They are recorded HERE rather than only in prose
    // because the codec's own comments cite them by key name, and a reader who
    // finds one in the source must be able to find it in the contract.
    const inv = at(['invariants']) as Record<string, string>;
    expect(inv.slotOrder).toContain('c*rows + r');
    expect(inv.slotOrder).toContain('r*cols + c');
    expect(inv.slotOrder).toMatch(/CANNOT CHECK IT/);
    // The trap this parcel's own tests had to be aimed around, written into the
    // contract so the next author meets it before writing a vacuous assertion.
    expect(inv.slotOrder).toMatch(/vacuous/);
    expect(inv.phaseAxis).toMatch(/validate_band_phase_axis/);
    expect(inv.axisRoundTrip).toMatch(/survive a load/);
  });

  it('records the consumer-hardcoded path', () => {
    expect(BG_OVERRIDE_CONSUMER_PATH).toBe('games/sonic4/data/editor_bg_override.json');
  });

  /**
   * The OUTPUT directory, which is a different KIND of fact from every other
   * value in the file: the rest describe the document, this one describes which
   * ACT the document is about. Nothing inside the document says, and nothing in
   * project.json points back — the binding is this path and only this path, so
   * the vendored literal has to carry its citations the way a constant does.
   */
  it('records the consumer-hardcoded OUTPUT directory, with its aeon authorities', () => {
    expect(BG_OVERRIDE_CONSUMER_OUT_DIR).toBe('games/sonic4/data/generated/ojz/act1');
    // Project-root-relative and directory-shaped: a trailing slash here would
    // silently change what `actBindsBgOverride` compares.
    expect(BG_OVERRIDE_CONSUMER_OUT_DIR.endsWith('/')).toBe(false);
    const auth = (at(['outputDir', 'authorities']) as string[]).join('\n');
    expect(auth).toContain('tools/inject_editor_bg.py');
    expect(auth).toContain('OUT_DIR');
    expect(auth).toContain('tools/regenerate-level.sh');
    for (const a of at(['outputDir', 'authorities']) as string[]) expect(a).toMatch(/^aeon /);
    // The seam is recorded IN the contract, not only in prose: this pairing is
    // two hardcodes, one per repo, and only one of them is observable here.
    expect(at(['outputDir', 'why'])).toContain('SEAM');
    // Every document a value here cites must be listed in `source`, so a reader
    // can re-derive rather than trust.
    const docs = (at(['source', 'documents']) as string[]).join('\n');
    expect(docs).toContain('tools/regenerate-level.sh');
  });
});

/**
 * NO PRESENT-TENSE CLAIM MAY CONTRADICT AN AMENDMENT BELOW IT.
 *
 * ═══ THE FINDING (CONTRACT-AUTHORITY-REFUTED-BY-OWN-AMENDMENT, medium) ═══
 *
 * `constants.BGANIM_VIEW_DERIVED_PERIOD_PX` cited *"the refusal in
 * `views_emitted`: `raise AssertionError(...)`"* as its authority, and said in
 * its `why` that a band at any other period *"is REFUSED"*. The SAME FILE's
 * `bganim-decouple` amendment is headed *"THE TWO `default_off` OBLIGATIONS
 * STOPPED BEING OBLIGATIONS. Both were `AssertionError`s and NEITHER RAISES ANY
 * MORE."* Two sentences in one document contradicting each other, in the file
 * whose entire job is to be current.
 *
 * The sweep for the same shape found a THIRD and worse one: `invariants.viewTwins`
 * said *"aeon raises on either failure rather than emitting zero twins"* and
 * *"a two-band act in which BOTH bands are `default_off` is refused"* -- the exact
 * opposite of current behaviour, twice, and the sentence a size model would be
 * written against.
 *
 * ═══ WHY THIS GATE DERIVES FROM THE FILE AND NOT FROM MY READING OF AEON ═══
 *
 * The authority for "neither raises" is already IN this document, as an amendment
 * with a revision beside it. So the check is a SELF-CONSISTENCY one: no field
 * whose job is to describe the present may assert a refusal on the twins path
 * that the amendments have retired. That makes the gate survive the next aeon
 * change without being re-derived -- what it enforces is that the file does not
 * argue with itself, which is true whichever way aeon moves.
 *
 * ⚠ THE FIELD LIST IS ENUMERATED, AND THE EXCLUSIONS ARE THE POINT. `amendments`
 * is EXEMPT because a point-in-time record legitimately describes the past: the
 * `default-off-switch` amendment's `documents` entry *"both `AssertionError`s are
 * unchanged"* was TRUE at the revision it names and must stay as written.
 * `writerObligations` and the two `auroraStatus*` fields are exempt from the
 * SENTENCE rule and held to a WHOLE-STRING one instead, because they are amended
 * in place: each carries a superseded clause followed by a marked correction, and
 * a per-sentence rule would demand the history be deleted rather than marked.
 */
describe('no present-tense claim contradicts the amendments below it', () => {
  /** Words that assert a build-time refusal. */
  const REFUSAL = /\brefus\w*|\breject\w*|\braise[sd]?\b|AssertionError/i;
  /** The subject the `bganim-decouple` amendment retired refusals for. */
  const TWINS_PATH = /default_off|views?_emitt|view_emission|twin/i;
  /** Marks a refusal named as HISTORY rather than asserted as current. */
  const RETIRED = new RegExp([
    'NO LONGER', 'no longer', 'does not raise', 'never as', 'never raises',
    'used to', 'stopped being', 'stopped', 'was an', 'were `?AssertionError',
    'HISTORY', 'until 20', 'is DISCHARGED', 'has MOVED', 'went with it',
    'not an obligation', 'DELETED', 'decline',
  ].join('|'));

  function sentences(s: string): string[] {
    return s.split(/(?<=[.!?;])\s+/).filter(x => x.trim() !== '');
  }

  /**
   * Every `[path, text]` pair in the file whose job is to state the PRESENT.
   * Enumerated by field name rather than walked wholesale, so a new field cannot
   * quietly join the exempt set by existing.
   */
  function presentTenseStrings(): [string, string][] {
    const out: [string, string][] = [];
    const constants = at(['constants']) as Record<string, Record<string, unknown>>;
    for (const [name, entry] of Object.entries(constants)) {
      if (name.startsWith('$')) continue;
      for (const field of ['why', 'aeonProse', 'aeonGate'] as const) {
        if (typeof entry[field] === 'string') {
          out.push([`constants.${name}.${field}`, entry[field] as string]);
        }
      }
      const auth = entry.authorities;
      if (Array.isArray(auth)) {
        auth.forEach((a, i) => out.push([`constants.${name}.authorities[${i}]`, String(a)]));
      }
    }
    const inv = at(['invariants']) as Record<string, string>;
    for (const [name, text] of Object.entries(inv)) {
      if (name.startsWith('$')) continue;
      out.push([`invariants.${name}`, text]);
    }
    for (const group of ['bandKeys', 'topLevelKeys'] as const) {
      const keys = at([group]) as Record<string, Record<string, unknown>>;
      for (const [name, entry] of Object.entries(keys)) {
        if (name.startsWith('$') || typeof entry !== 'object' || entry === null) continue;
        for (const field of ['why', 'cite', 'aeonValueForAurora'] as const) {
          if (typeof entry[field] === 'string') {
            out.push([`${group}.${name}.${field}`, entry[field] as string]);
          }
        }
      }
    }
    return out;
  }

  it('the sweep really has the fields the finding was found in', () => {
    // ANTI-VACUOUS. An empty or mis-shaped collection would make every row below
    // pass, and this gate's whole subject is a claim that hid in one of these.
    const paths = presentTenseStrings().map(([p]) => p);
    expect(paths.length).toBeGreaterThan(40);
    expect(paths).toContain('constants.BGANIM_VIEW_DERIVED_PERIOD_PX.why');
    expect(paths).toContain('constants.BGANIM_VIEW_DERIVED_PERIOD_PX.authorities[1]');
    expect(paths).toContain('invariants.viewTwins');
    expect(paths).toContain('bandKeys.default_off.why');
  });

  it('the amendment this gate derives its expectation from is still in the file', () => {
    // The authority is INTERNAL, so it has to be asserted present rather than
    // assumed: without it the rule below has no ground to stand on.
    const amendment = (at(['amendments']) as Record<string, unknown>[])
      .find(a => a.id === 'bganim-decouple');
    expect(amendment).toBeDefined();
    expect(String(amendment!.what)).toMatch(/NEITHER RAISES ANY MORE/);
    expect(amendment!.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('no present-tense field asserts a refusal on the twins path', () => {
    const offenders: string[] = [];
    for (const [path, text] of presentTenseStrings()) {
      for (const s of sentences(text)) {
        if (REFUSAL.test(s) && TWINS_PATH.test(s) && !RETIRED.test(s)) {
          offenders.push(`${path}: ${s.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The whole-string form, for the three fields that are amended IN PLACE. A
   * superseded clause is allowed to stand there, but the correction must be in
   * the same field: a reader who stops at the first sentence is the reader this
   * finding was about.
   */
  it('the amended-in-place fields each carry their own correction', () => {
    const dk = at(['bandKeys', 'default_off']) as Record<string, unknown>;
    const inPlace: [string, string][] = [
      ...(dk.writerObligations as string[])
        .map((o, i) => [`writerObligations[${i}]`, o] as [string, string]),
      ['auroraStatusBefore', String(dk.auroraStatusBefore)],
      ['auroraStatusNow', String(dk.auroraStatusNow)],
    ];
    for (const [path, text] of inPlace) {
      if (REFUSAL.test(text) && TWINS_PATH.test(text)) {
        expect(text, `${path} names a refusal, so it must mark it as retired`)
          .toMatch(RETIRED);
      }
    }
  });

  /**
   * THE POSITIVE HALF. "No refusal claim" is also what a field emptied of content
   * produces, so `viewTwins` must still say what DOES happen -- and must keep the
   * two quantifiers apart, which is the trap the HIGH finding was about on the
   * copy side.
   */
  it('viewTwins says the twins DECLINE, and keeps the ship and twins quantifiers apart', () => {
    const inv = at(['invariants']) as Record<string, string>;
    expect(inv.viewTwins).toMatch(/declin/i);
    // The twins are an ACT question ...
    expect(inv.viewTwins).toMatch(/PER ACT|ACT'S BAND COUNT|EXACTLY ONE BAND/);
    // ... and the ship decision is a BAND one. Conflating them is the finding.
    expect(inv.viewTwins).toMatch(/per band|PER BAND/);
    expect(inv.viewTwins).toContain('BGANIM_VIEW_DERIVED_PERIOD_PX');
  });

  /**
   * The period constant's authority must cite something that EXISTS. The old
   * entry named a `raise AssertionError` in `views_emitted`; at aeon `22cf8b37`
   * the condition lives in `view_emission`, which returns `(0, note)`.
   */
  it('the period constant cites the function that decides the twins today', () => {
    const auth = (at(['constants', 'BGANIM_VIEW_DERIVED_PERIOD_PX', 'authorities']) as string[]);
    expect(auth.join('\n')).toContain('view_emission');
    expect(auth.join('\n')).not.toContain('AssertionError');
    for (const a of auth) expect(a).toMatch(/^aeon /);
  });
});
