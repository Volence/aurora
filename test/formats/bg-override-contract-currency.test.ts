/**
 * CURRENCY FOR THE VENDORED aeon CONSUMER CONTRACT — the question the drift
 * gate beside it structurally cannot answer.
 *
 * `bg-override-contract-drift.test.ts` holds
 * `src/core/formats/bg-override/bganim-consumer-contract.json` to a content
 * hash and proves every constant the codec exports is READ from that file. Its
 * own docblock says exactly what that does not buy:
 *
 *     "DOES NOT PROVE anything about aeon. Nothing inside this repo can observe
 *      aeon changing."
 *
 * That gap had a cost, and it is why this file exists. `BG_TILE_CAPACITY` was
 * vendored as 448. aeon's EFFECTS-W1 item 9d reassigned 48 of those slots to a
 * new `waterline_strips` VRAM region, taking the BG arena to 400 - and Aurora
 * went on ACCEPTING documents of 401..448 tiles, telling an author a background
 * fits that `tools/inject_editor_bg.py` would then refuse with
 * `assert len(tiles) <= BG_TILE_CAPACITY`. The vendored entry's own citation was
 * stale in two ways at once (it quoted `tools/vram_map.py:26 = 448`; the
 * constant is 400 at line 34), which is the tell: nothing was reading it.
 *
 * It obeys the same three rules `aeon-fixture-currency.test.ts` established, for
 * the same reasons, and the prose there is the fuller statement of each:
 *
 *   1. aeon is read at a COMMITTED REVISION through git objects
 *      (`git -C <aeon> show <rev>:<path>`), never through the sibling working
 *      tree, which on this machine is some peer lane's live checkout.
 *   2. Every message NAMES the revision it read.
 *   3. When it cannot run - no aeon checkout, revision unfetched - it SKIPS
 *      LOUDLY, saying what could not be measured. It never renders "could not
 *      measure" as green-and-silent.
 *
 * A FAILURE HERE IS NOT AN AURORA REGRESSION. It means aeon moved a number and
 * the vendored contract needs re-vendoring; the message says which number, both
 * values, and where to read the authority.
 *
 * ─── WHAT AN EXTRACTOR IS, AND WHY IT IS A REGEX AND NOT A PARSER ──────────
 *
 * Each row below reads ONE aeon file at aeon's tip and pulls ONE number out of
 * it with a pattern anchored to the surrounding source line. The alternative -
 * importing aeon's Python, or parsing `.emp` - would make this suite depend on
 * a toolchain it does not have, for a question that is one integer wide.
 *
 * THE FAILURE MODES ARE SPLIT ON PURPOSE, because they are different findings:
 *
 *   · aeon absent, or its `origin/master` unresolvable  -> LOUD SKIP. Nothing
 *     was measured, and a green row would be a lie.
 *   · the file is gone at that revision, or the pattern matches nothing -> FAIL.
 *     The revision resolved, so this WAS measured: a citation pointing at source
 *     that no longer exists is drift of the loudest kind, and silently treating
 *     an unmatched regex as "nothing to check" is precisely how a gate becomes
 *     decorative.
 *   · the number differs -> FAIL, with both values and the re-vendor recipe.
 *
 * ─── WHAT THIS DOES *NOT* CHECK, stated because the honest scope is narrower ─
 *
 *   · LINE NUMBERS. Every `authorities` entry in the vendored file carries one
 *     (`tools/vram_map.py:34`), and nothing here reads them. Both halves of the
 *     2026-09-06 defect - the value and the coordinate - rotted together, and
 *     only the value half is now instrumented. A line number is still worth
 *     exactly as much as the last person who looked at it.
 *   · PROSE. The `why` fields, the invariants and the amendment records are
 *     unread here.
 *   · aeon's PARSED MEANING. This compares integers, not semantics. A constant
 *     that keeps its value while changing what it governs passes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';

const CONTRACT_PATH = resolve(
  __dirname, '../../src/core/formats/bg-override/bganim-consumer-contract.json',
);
const CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as {
  constants: Record<string, { value: number }>;
  notVendored: Record<string, { aeonSymbol?: string }>;
};

/** The branch whose tip answers "what does aeon ship TODAY". Committed, named. */
const AEON_TIP = 'origin/master';

/** Prefix every failure so nobody triages it as an Aurora regression. */
const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored aeon contract is stale.';

type Extractor = {
  /** aeon-relative path, read at AEON_TIP. */
  path: string;
  /** Must capture exactly one group. Anchored to the source line, not to the digits. */
  pattern: RegExp;
  /**
   * Turns the captured text into the number the contract vendors.
   *
   * THE SECOND ARGUMENT IS THE WHOLE aeon FILE, and it exists for a shape the
   * one-capture form cannot express: a constant aeon DERIVES rather than
   * writes. `BGANIM_BYTES_PER_SLOT = BGANIM_PHASES * BGANIM_TILE_BYTES` has no
   * digits on its line at all (the `# 256` beside it is a COMMENT, and reading
   * a comment for a value is how a gate ends up measuring prose), and
   * `BGANIM_SECTION_CEILING = min(BGANIM_SECTION_CEILINGS.values())` names a
   * table rather than a number. Both are read by re-deriving aeon's own
   * expression from aeon's own operands, which is the only reading that stays
   * true if aeon changes an operand. A row that needs neither ignores it.
   */
  read: (m: string, text: string) => number;
  /** Printed in the failure so a reader knows what was looked at. */
  quote: string;
};

/**
 * THE AUTHORITY LADDER, WRITTEN DOWN RATHER THAN ASSUMED.
 *
 * aeon's own tree names `games/sonic4/vram.toml` as THE VRAM placement
 * authority: `tools/gen_vram_map.py` generates `tools/vram_map.py`,
 * `engine/system/constants.emp`'s GENERATED block and the docs page from it, and
 * `tools/test_gen_vram_map.py::test_generated_artifacts_are_in_sync` fails
 * aeon's build if that file is edited without a regenerate. So for the two VRAM
 * numbers the FIRST extractor below is the toml itself and the generated copies
 * are corroboration. Reading only a copy is what let a stale line number sit in
 * the vendored file for a fortnight.
 *
 * Where a constant has several DELIBERATE mirrors in aeon (the band ceiling
 * lives in three files that cannot be collapsed - `bg_anim.emp` is lowered
 * standalone against an empty symbol table), every mirror is a row. If they ever
 * disagree with each other, this fails on the first one that disagrees with us,
 * and aeon's own `TestBgAnimBandCeiling::test_all_three_authorities_agree` is
 * the gate that catches the internal split.
 */
const EXTRACTORS: Record<string, Extractor[]> = {
  BG_TILE_CAPACITY: [
    {
      path: 'games/sonic4/vram.toml',
      // THE AUTHORITY. Anchored on the `bg_region` block's own name so a `tiles`
      // key belonging to any other region cannot answer for it.
      pattern: /name\s*=\s*"bg_region"[\s\S]{0,400}?\ntiles\s*=\s*(\d+)/,
      read: Number,
      quote: 'the [[region]] named "bg_region", its `tiles =` key',
    },
    {
      path: 'tools/vram_map.py',
      pattern: /^BG_TILE_CAPACITY = (\d+)$/m,
      read: Number,
      quote: 'the GENERATED block: `BG_TILE_CAPACITY = N`',
    },
    {
      path: 'engine/system/constants.emp',
      pattern: /^pub const BG_TILE_CAPACITY\s*=\s*(\d+)\s*$/m,
      read: Number,
      quote: '`pub const BG_TILE_CAPACITY = N`',
    },
  ],
  BG_TILE_BASE_SLOT: [
    {
      path: 'games/sonic4/vram.toml',
      pattern: /name\s*=\s*"bg_region"[\s\S]{0,400}?\nbase\s*=\s*(\d+)/,
      read: Number,
      quote: 'the [[region]] named "bg_region", its `base =` key',
    },
    {
      path: 'tools/vram_map.py',
      pattern: /^BG_TILE_BASE_SLOT = (\d+)$/m,
      read: Number,
      quote: 'the GENERATED block: `BG_TILE_BASE_SLOT = N`',
    },
  ],
  BGANIM_MAX_BANDS: [
    {
      path: 'engine/system/constants.emp',
      pattern: /^pub const BGANIM_MAX_BANDS = (\d+)\b/m,
      read: Number,
      quote: '`pub const BGANIM_MAX_BANDS = N`, which sizes BgAnim_LastStep',
    },
    {
      path: 'engine/level/bg_anim.emp',
      pattern: /^const BGANIM_MAX_BANDS = (\d+)\s*$/m,
      read: Number,
      quote: 'the DELIBERATE module-local mirror `const BGANIM_MAX_BANDS = N`',
    },
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^BGANIM_MAX_BANDS = (\d+)$/m,
      read: Number,
      quote: 'the emitter cap `BGANIM_MAX_BANDS = N`',
    },
  ],
  BGANIM_PHASE_BANKS: [
    {
      path: 'engine/level/bg_anim.emp',
      pattern: /^const BGANIM_BANKS\s+= (\d+)\b/m,
      read: Number,
      quote: '`const BGANIM_BANKS = N`, the length of bganim_band.banks',
    },
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /assert len\(b\['bank_offsets'\]\) == (\d+),/,
      read: Number,
      quote: "the emitter's `assert len(b['bank_offsets']) == N`",
    },
  ],
  TILE_BYTES: [
    {
      path: 'engine/level/bg_anim.emp',
      // DERIVED, not read: the engine states the SHIFT, so 1 << 5 is the byte
      // count. Reading the shift is reading the authority; reading a "32" in a
      // comment beside it would not be.
      pattern: /^const TILE_BYTES_SHIFT\s+= (\d+)\b/m,
      read: (m) => 1 << Number(m),
      quote: '`const TILE_BYTES_SHIFT = N`, so TILE_BYTES = 1 << N',
    },
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^\s*unit_bytes = unit_tiles \* (\d+)$/m,
      read: Number,
      quote: "band_axis_geometry's `unit_bytes = unit_tiles * N`",
    },
  ],
  TILE_WIDTH_PX: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /return axis, unit_bytes, unit_shift, period_tiles \* (\d+)/,
      read: Number,
      quote: "band_axis_geometry's `return ..., period_tiles * N`",
    },
  ],
  TILE_PIXELS: [
    {
      path: 'tools/inject_editor_bg.py',
      // The pack loop's own bounds: `for row in range(8): for col in range(4)`,
      // indexing `t[row*8 + col*2 + 1]`, so the array is rows * 8 long. Anchored
      // on the pixel-masking body so no other `range(8)` in the file can answer.
      pattern: /for row in range\((\d+)\):\n\s*for col in range\(\d+\):\n\s*hi = t\[row\*8/,
      read: (m) => Number(m) * Number(m),
      quote: 'the pack loop `for row in range(N)` over a row-major NxN tile',
    },
  ],
  TILE_PIXEL_MAX: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /hi = t\[row\*8 \+ col\*2\] & 0x([0-9A-Fa-f]+)\b/,
      read: (m) => parseInt(m, 16),
      quote: "the packer's `hi = t[...] & 0xN` nibble mask",
    },
  ],
  BG_LAYOUT_WORDS: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /assert len\(layout\) == (\d+),/,
      read: Number,
      quote: "the consumer's `assert len(layout) == N`",
    },
  ],
  BG_LAYOUT_WORDS_LEGACY: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /if len\(layout\) == (\d+):/,
      read: Number,
      quote: "the legacy zero-pad branch `if len(layout) == N:`",
    },
  ],
  LAYOUT_WORD_MAX: [
    {
      path: 'tools/inject_editor_bg.py',
      // The struct format character IS the bound: '>H' is big-endian u16.
      pattern: /struct\.pack_into\('>(\w)', nt,/,
      read: (m) => {
        const bits: Record<string, number> = { B: 8, H: 16, I: 32, L: 32 };
        const n = bits[m];
        if (n === undefined) throw new Error(`unknown struct format character '${m}'`);
        return 2 ** n - 1;
      },
      quote: "the nametable write `struct.pack_into('>H', nt, ...)`, so the bound is 2**16 - 1",
    },
  ],
  LAYOUT_TILE_INDEX_MASK: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /idx = word & 0x([0-9A-Fa-f]+)\b/,
      read: (m) => parseInt(m, 16),
      quote: "the nametable rebase's `idx = word & 0xN`",
    },
  ],

  // ── THE SECOND BUDGET ────────────────────────────────────────────────────
  //
  // ⚠ EVERY ROW BELOW READS ONE FILE, AND THAT IS NOT A SHORTCUT — it is the
  // whole population. `tools/inject_editor_bg.py` is the ONLY authority for any
  // of these: unlike BG_TILE_CAPACITY (a VRAM allocation with a toml authority
  // and two generated mirrors), the section budget has no row in aeon's own
  // EFFECTS_CONSUMER_CONTRACT.md and no `.emp` declaration. There is nothing to
  // corroborate against, so a second row here would be decoration. The vendored
  // constant's `notInAeonProse` field records the same fact for a reader.
  BGANIM_SECTION_CEILING: [
    {
      path: 'tools/inject_editor_bg.py',
      // THE RULED FIGURE. What the emitter enforces is the MINIMUM across the
      // per-listing-shape table, so this row is only half the question; the row
      // below is the other half.
      pattern: /^BGANIM_SECTION_CEILING_RULED = (\d+)$/m,
      read: Number,
      quote: "the owner's ruled authoring budget `BGANIM_SECTION_CEILING_RULED = N`",
    },
    {
      path: 'tools/inject_editor_bg.py',
      // AND THE MINIMUM IS WHAT BINDS. `BGANIM_SECTION_CEILING` is
      // `min(BGANIM_SECTION_CEILINGS.values())`, so vendoring the ruled figure
      // is correct only while every row of that table names it. This row
      // re-derives the `min` from aeon's own table rather than assuming it:
      // the pattern proves the definition is still a `min` over that dict, and
      // `read` refuses if any row is a number or another symbol. If aeon ever
      // splits the shapes again (it did for one day in August), this fails
      // rather than silently vendoring a ceiling no shape enforces.
      pattern: /^BGANIM_SECTION_CEILINGS = \{\n([\s\S]*?)\n\}\nBGANIM_SECTION_CEILING = min\(BGANIM_SECTION_CEILINGS\.values\(\)\)$/m,
      read: (m, text) => {
        const rows = [...m.matchAll(/^\s*"[^"]+":\s*([A-Za-z_][A-Za-z0-9_]*|\d+),\s*$/gm)];
        if (rows.length === 0) throw new Error('BGANIM_SECTION_CEILINGS has no rows this can read');
        const named = rows.map(r => r[1]);
        const odd = named.filter(v => v !== 'BGANIM_SECTION_CEILING_RULED');
        if (odd.length > 0) {
          throw new Error(
            'BGANIM_SECTION_CEILINGS no longer maps every listing shape to '
            + `BGANIM_SECTION_CEILING_RULED (found ${odd.join(', ')}). The vendored ceiling is `
            + 'the ruled figure, which is only the enforced one while the table is flat. '
            + 're-vendor the MINIMUM across shapes, and say in `amendments` which shape is now '
            + 'the binding one.');
        }
        const ruled = /^BGANIM_SECTION_CEILING_RULED = (\d+)$/m.exec(text);
        if (ruled === null) throw new Error('BGANIM_SECTION_CEILING_RULED is gone');
        return Number(ruled[1]);
      },
      quote: '`BGANIM_SECTION_CEILINGS` and `BGANIM_SECTION_CEILING = min(...values())`,'
        + ' whose rows must all name BGANIM_SECTION_CEILING_RULED for the ruled figure to be'
        + ' the enforced one',
    },
  ],
  BGANIM_COUNT_BYTES: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^BGANIM_COUNT_BYTES = (\d+)$/m,
      read: Number,
      quote: 'the section-layout block: `BGANIM_COUNT_BYTES = N`',
    },
  ],
  BGANIM_RECORD_BYTES: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^BGANIM_RECORD_BYTES = (\d+)$/m,
      read: Number,
      quote: 'the section-layout block: `BGANIM_RECORD_BYTES = N`',
    },
  ],
  BGANIM_BYTES_PER_SLOT: [
    {
      path: 'tools/inject_editor_bg.py',
      // DERIVED FROM AEON'S OWN PRODUCT, never from the `# 256` beside it. A
      // comment outbids code in a grep and is authored by nobody; the operands
      // are the authority, and reading them is what makes this row fail if aeon
      // changes a phase count rather than the product.
      pattern: /^BGANIM_BYTES_PER_SLOT = (BGANIM_PHASES \* BGANIM_TILE_BYTES)\b/m,
      read: (_m, text) => {
        const phases = /^BGANIM_PHASES = (\d+)$/m.exec(text);
        const bytes = /^BGANIM_TILE_BYTES = (\d+)$/m.exec(text);
        if (phases === null || bytes === null) {
          throw new Error('BGANIM_PHASES / BGANIM_TILE_BYTES are not both readable');
        }
        return Number(phases[1]) * Number(bytes[1]);
      },
      quote: '`BGANIM_BYTES_PER_SLOT = BGANIM_PHASES * BGANIM_TILE_BYTES`, re-derived from those'
        + ' two literals rather than from the comment beside the product',
    },
  ],
  BGANIM_VIEW_COUNT: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^BGANIM_VIEW_COUNT = (\d+)$/m,
      read: Number,
      quote: '`BGANIM_VIEW_COUNT = N`, the twins a qualifying act emits',
    },
  ],
  BGANIM_VIEW_DERIVED_PERIOD_PX: [
    {
      path: 'tools/inject_editor_bg.py',
      pattern: /^BGANIM_VIEW_DERIVED_PERIOD_PX = (\d+)$/m,
      read: Number,
      quote: '`BGANIM_VIEW_DERIVED_PERIOD_PX = N`, the only period a default_off band may have',
    },
  ],
};

const aeon = peerRepo('aeon');
const tip = aeon === null ? null : resolveRev(aeon, AEON_TIP);

describe('CURRENCY: are the vendored contract constants still what aeon declares?', () => {
  /**
   * ⚠ THE TABLE ABOVE IS A LIST, AND A LIST GOES STALE SILENTLY - the lesson
   * `aeon-fixture-currency.test.ts` records, applied here before it can bite. A
   * constant added to the vendored file and left out of `EXTRACTORS` would get
   * no currency check at all and nothing would say so.
   *
   * This row needs no aeon checkout: it compares two things in THIS repo.
   */
  it('every constant the contract vendors has an extractor', () => {
    const declared = Object.keys(CONTRACT.constants).filter((k) => !k.startsWith('$')).sort();
    // Anti-vacuous: an empty contract would satisfy any coverage claim.
    expect(declared.length, 'the vendored contract declares no constants').toBeGreaterThan(8);
    expect(
      Object.keys(EXTRACTORS).sort(),
      'a constant is vendored with no way to ask aeon whether it is still current:'
      + ' add it to EXTRACTORS at the top of this file',
    ).toEqual(declared);
  });

  /**
   * THE DISCLOSURE BLOCK IS A CLAIM ABOUT AEON, SO IT CAN GO STALE TOO.
   *
   * `notVendored` records what aeon publishes and Aurora deliberately does not
   * carry - the population a walk of our own file structurally cannot see, and
   * the one that produced the 2026-09-06 finding. A disclosure naming a symbol
   * aeon has since renamed or deleted is worse than no disclosure: it reads as
   * a live decision and is a fossil. So every symbol named there must still be
   * findable in the aeon file the entry cites.
   *
   * NARROW ON PURPOSE. This checks EXISTENCE, not the recorded `aeonValue` -
   * these are values Aurora does not consume, and pinning them here would
   * manufacture red rows for numbers nothing in this repo reads.
   */
  it('every symbol the contract discloses as NOT vendored still exists at aeon', (ctx) => {
    if (aeon === null || tip === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR),'
        + ` or ${AEON_TIP} does not resolve; CANNOT MEASURE whether the notVendored`
        + ' disclosures still name symbols aeon has');
      return;
    }
    const entries = Object.entries(CONTRACT.notVendored)
      .filter(([k, v]) => !k.startsWith('$') && typeof v.aeonSymbol === 'string');
    // Anti-vacuous: an empty block has disclosed nothing and measured nothing.
    expect(entries.length, 'notVendored discloses nothing').toBeGreaterThan(0);

    const stale: string[] = [];
    for (const [name, entry] of entries) {
      // Each `aeonSymbol` opens with the aeon path, then an em dash, then prose.
      const path = /^([\w./-]+)/.exec(entry.aeonSymbol!)?.[1];
      if (path === undefined) { stale.push(`${name}: aeonSymbol names no aeon path`); continue; }
      const at = readAtRev(aeon, tip, path);
      if (!at.ok) { stale.push(`${name}: ${path} is gone at ${tip} (${at.why})`); continue; }
      // The disclosure's KEY is the symbol; `default_off` is a document key and
      // the rest are constants, and both are findable as plain text in the file.
      if (!at.text.includes(name)) stale.push(`${name}: not found anywhere in ${path} at ${tip}`);
    }
    expect(
      stale,
      `${NOT_OURS}\n`
      + `  A notVendored disclosure names something aeon no longer has, at ${tip}.\n`
      + '  Re-read the entry: either the symbol moved (repair the citation) or the\n'
      + '  thing was retired (delete the disclosure and say so in `amendments`).',
    ).toEqual([]);
  });

  for (const [name, extractors] of Object.entries(EXTRACTORS)) {
    for (const ex of extractors) {
      it(`${name} matches ${ex.path} at aeon ${AEON_TIP}`, (ctx) => {
        if (aeon === null) {
          ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR);'
            + ` CANNOT MEASURE whether the vendored ${name} is still what aeon declares`);
          return;
        }
        if (tip === null) {
          ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon};`
            + ` CANNOT MEASURE whether the vendored ${name} is still what aeon declares`);
          return;
        }

        const at = readAtRev(aeon, tip, ex.path);
        // NOT a skip: the revision resolved, so this WAS measured, and a cited
        // authority that is gone at aeon's tip is drift of the loudest kind.
        expect(at.ok, at.ok ? '' : `${NOT_OURS} ${ex.path} at ${tip}: ${(at as { why: string }).why}`).toBe(true);
        if (!at.ok) return;

        const m = ex.pattern.exec(at.text);
        // NOT a skip either, and NOT a silent pass: an extractor that matches
        // nothing has stopped being an instrument. Either aeon rewrote the line
        // (which is exactly the drift being looked for) or this pattern is wrong.
        expect(
          m !== null,
          `${NOT_OURS}\n`
          + `  ${name}: the extractor for ${ex.path} matched NOTHING at aeon ${tip}.\n`
          + `  It was looking for ${ex.quote}\n`
          + `  with ${String(ex.pattern)}.\n`
          + '  Either aeon rewrote that line (re-read the authority and re-vendor) or this\n'
          + '  pattern is stale. Do NOT relax it into a match: an extractor that cannot fail\n'
          + '  is not a check.',
        ).toBe(true);
        if (m === null) return;

        expect(
          ex.read(m[1], at.text),
          `${NOT_OURS}\n`
          + `  ${name} is vendored as ${CONTRACT.constants[name].value} in\n`
          + '  src/core/formats/bg-override/bganim-consumer-contract.json,\n'
          + `  but aeon ${AEON_TIP} (${tip}) declares a different value in ${ex.path}\n`
          + `  (${ex.quote}).\n`
          + `  Read it:     git -C ${aeon} show ${tip}:${ex.path}\n`
          + '  Re-vendor:   update the constant AND its `authorities` line numbers, add an\n'
          + '               `amendments` entry naming this revision, and re-pin the content\n'
          + '               hash in test/formats/bg-override-contract-drift.test.ts.\n'
          + '  Then sweep:  grep the old number. Prose outlives every doc that recorded it.',
        ).toBe(CONTRACT.constants[name].value);
      });
    }
  }
});
