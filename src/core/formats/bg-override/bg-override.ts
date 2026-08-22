// `editor_bg_override.json` — the BG override document, wave-1 surface 4.
//
// One file per game (the consumer hardcodes the path), carrying the background
// nametable (`layout`), the static BG tile blob (`tiles`), the BgAnim bands
// (`anims`), and a BG palette line (`palette`/`palette_line`) that Aurora does
// not author.
//
// WHO OWNS THIS FILE. Aurora, alone — ruled 2026-08-22
// (docs/reviews/2026-08-22-bg-override-ownership-ruling.md §5; empyrean
// AURORA_EFFECTS_SCHEMA.md §5.2). That is the OPPOSITE obligation from aeon's
// tools, which refuse on any key they do not produce because each owns only a
// slice. A sole writer of record cannot refuse its own file, so §6 hazard 1's
// pair — "round-trip what you do not understand, or refuse the file" — resolves
// to ROUND-TRIP here where it resolves to REFUSE there.
//
//   own        `layout`, `tiles`, `anims`  — rewritten as ONE unit (see below)
//   round-trip `palette`, `palette_line`, and every unknown key — carried
//              through untouched and NOT validated: judging a key you do not
//              own means refusing a file its owner considers fine, over a
//              constraint the drift rule lets them change without telling you
//   upgrade    `anim` (legacy singular) — read as `anims[0]`, never re-emitted
//   refuse     nothing on key identity; only on the invariants below, each of
//              which describes a document that would BAKE CLEANLY and ship
//              corrupt
//
// WHY THE THREE OWNED KEYS ARE ONE UNIT AND NOT THREE. Bands pack contiguously
// from slot 0 and DMA over the FRONT of the static blob, so a band's phase-0 art
// IS those slots' rest state: `phases[0] == tiles[slot_base : slot_base + n]`.
// Adding or removing a band therefore renumbers the whole blob and rewrites the
// layout. A read-modify-write that retained `anims` while regenerating
// `layout`/`tiles` passes every consumer assert, bakes cleanly, and ships
// silent visual corruption — strictly worse than deleting the bands, which at
// least is recoverable from git. That already happened once, to real work
// (aeon `dd93a840`, 2026-07-21; aeon docs/BUGS.md TOOL-01).
//
// CONTRACT, pinned. Every constant and every key list below is read out of
// `bganim-consumer-contract.json`, a vendored machine-readable extract of the
// aeon authorities at aeon `1ee8f8e68d826b18023639ab32a8f7c82f238e62`, held to
// a content hash by test/formats/bg-override-contract-drift.test.ts. Nothing in
// this file restates a number. There is no committed empyrean JSON schema for
// this document (unlike surface 1), so the vendored extract stands in for one;
// the reconciliation against aeon is an overseer ritual, not a gate this repo
// can run.
//
// ATOMIC WRITES are already the repo's property and no new helper was added:
// every project write lands through `src/main/guarded-write.ts` (sibling `.tmp`
// + same-directory rename) or `ipc-handlers.ts`'s FILE_WRITE handler, which
// does the same. This module produces TEXT; it performs no I/O.

import contractJson from './bganim-consumer-contract.json';

/** The vendored contract, as data. Loose on purpose — the JSON is the authority. */
type ContractNode = Record<string, unknown>;
const CONTRACT = contractJson as unknown as ContractNode;

/**
 * Loud accessor. Every constant below is `at()` at module load, so a contract
 * file that lost a key fails at import naming the path rather than yielding a
 * quiet `undefined` — which downstream renders as `NaN` band ceilings and
 * validators that accept everything.
 *
 * (The shape `scene-ui.ts` established for exactly this reason.)
 */
export function at(path: readonly string[]): unknown {
  let node: unknown = CONTRACT;
  for (let i = 0; i < path.length; i++) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(
        `bganim-consumer-contract.json: ${path.slice(0, i).join('.') || '<root>'} is not an object, ` +
        `so ${path.join('.')} cannot be read`,
      );
    }
    node = (node as Record<string, unknown>)[path[i]];
  }
  if (node === undefined) {
    throw new Error(`bganim-consumer-contract.json is missing ${path.join('.')}`);
  }
  return node;
}

function constant(name: string): number {
  const v = at(['constants', name, 'value']);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`bganim-consumer-contract.json: constants.${name}.value is not an integer`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Constants — READ from the vendored contract, never re-typed beside it.
// Each carries its aeon authority in the JSON, not here, so there is exactly
// one place to look and exactly one place to change.
// ---------------------------------------------------------------------------

/** Ceiling on `anims.length`. Held by three deliberate aeon authorities that agree. */
export const BGANIM_MAX_BANDS = constant('BGANIM_MAX_BANDS');
/** `phases` carries exactly this many banks — not at most. */
export const BGANIM_PHASE_BANKS = constant('BGANIM_PHASE_BANKS');
/** `len(tiles)` ceiling. Animated slots are a PREFIX of `tiles`, not an addition. */
export const BG_TILE_CAPACITY = constant('BG_TILE_CAPACITY');
/** Bytes per 8x8 4bpp tile. `rows * TILE_BYTES` is the power-of-two quantity. */
export const TILE_BYTES = constant('TILE_BYTES');
/** Pixel values per tile, flat row-major 8x8. */
export const TILE_PIXELS = constant('TILE_PIXELS');
/** 4bpp. The consumer masks with `& 0xF`; this codec refuses instead. */
export const TILE_PIXEL_MAX = constant('TILE_PIXEL_MAX');
/** Tile width in pixels — `pattern_px == cols * TILE_WIDTH_PX`. */
export const TILE_WIDTH_PX = constant('TILE_WIDTH_PX');
/** 64x64 nametable words. */
export const BG_LAYOUT_WORDS = constant('BG_LAYOUT_WORDS');
/** 64x32; the consumer zero-pads it rather than refusing, so it is legal input. */
export const BG_LAYOUT_WORDS_LEGACY = constant('BG_LAYOUT_WORDS_LEGACY');
/** Layout entries are packed `>H`. */
export const LAYOUT_WORD_MAX = constant('LAYOUT_WORD_MAX');

/** `{ camera_x: 0, camera_y: 1, timer: 2 }` — the SCALAR SOURCE, never an axis. */
export const BGANIM_DRIVERS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(at(['drivers']) as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('$'))
      .map(([k, v]) => [k, v as number]),
  ),
);

/**
 * Legal `driver` values, in contract order.
 *
 * EVERY BAND MOVES HORIZONTALLY, whichever driver it names. `camera_y` means
 * "driven by vertical camera movement", producing horizontal pattern motion —
 * a band editor that presents it as vertical motion is wrong, and it is the
 * natural misreading (aeon engine/level/bg_anim.emp: "Each band is a
 * horizontally-periodic pattern").
 */
export const BGANIM_DRIVER_NAMES = Object.freeze(Object.keys(BGANIM_DRIVERS));

export type BgAnimDriver = string;

/** Canonical top-level key order = the consumer contract §1.1 table order. */
export const TOP_LEVEL_KEYS = Object.freeze(
  Object.keys(at(['topLevelKeys']) as Record<string, unknown>).filter(k => !k.startsWith('$')),
);

/** Canonical band key order = the consumer contract §1.2 table order. */
export const BAND_KEYS = Object.freeze(
  Object.keys(at(['bandKeys']) as Record<string, unknown>).filter(k => !k.startsWith('$')),
);

function keysWithOwnership(kind: string): readonly string[] {
  return Object.freeze(TOP_LEVEL_KEYS.filter(k => at(['topLevelKeys', k, 'ownership']) === kind));
}

/** Keys Aurora authors and rewrites, as one co-authored unit. */
export const OWNED_KEYS = keysWithOwnership('own');
/** Keys Aurora carries through untouched and does not judge. */
export const ROUND_TRIPPED_KEYS = keysWithOwnership('round-trip');
/** `anim` — read-side compatibility only; upgraded on read, never emitted. */
export const LEGACY_ANIM_KEY = ((): string => {
  const [key, ...rest] = keysWithOwnership('legacy-read-only');
  if (key === undefined || rest.length > 0) {
    throw new Error(
      'bganim-consumer-contract.json must declare exactly one "legacy-read-only" top-level key ' +
      `(found ${rest.length + (key === undefined ? 0 : 1)}); the reader's upgrade path handles one.`,
    );
  }
  return key;
})();

/** Per-band defaults the consumer applies. Absent means "the default applies". */
export const BAND_DEFAULTS = Object.freeze({
  driver: at(['bandKeys', 'driver', 'default']) as string,
  rate_shift: at(['bandKeys', 'rate_shift', 'default']) as number,
});

/**
 * The path the consumer hardcodes. `bgOverridePath` composes the same string
 * from a dataRoot; a gate asserts the composition reproduces this literal, so
 * the two cannot drift.
 */
export const BG_OVERRIDE_CONSUMER_PATH = at(['path']) as string;

/** `{dataRoot}editor_bg_override.json` — per GAME, not per act. */
export function bgOverridePath(dataRoot: string): string {
  return `${dataRoot}editor_bg_override.json`;
}

// ---------------------------------------------------------------------------
// Model
//
// Both interfaces carry an index signature, and that is the design, not
// laziness: this codec never enumerates fields in order to round-trip. Parse
// hands back the object `JSON.parse` produced (with the one `anim` upgrade
// applied); serialize reorders known keys and appends the rest, refusing to
// drop anything. A key the wave-1 UI does not model cannot be lost, because
// there is no list for it to be missing from.
//
// Optional fields are optional in the TYPE too. Parse never fills a default in
// and serialize never writes one out that was not on disk — injecting defaults
// would turn every open/save of an untouched file into a diff, and would freeze
// today's default into files that should track the contract's.
// ---------------------------------------------------------------------------

/** One BgAnim band. `phases` is `[8 banks][cols*rows tiles][64 pixels]`. */
export interface BgOverrideBand {
  cols: number;
  rows: number;
  pattern_px: number;
  driver?: BgAnimDriver;
  rate_shift?: number;
  slot_base?: number;
  phases: number[][][];
  [key: string]: unknown;
}

export interface BgOverrideDocument {
  layout: number[];
  tiles: number[][];
  anims?: BgOverrideBand[];
  /** Not modelled on purpose: Aurora round-trips it and does not judge it. */
  palette?: unknown;
  /** Not modelled on purpose: Aurora round-trips it and does not judge it. */
  palette_line?: unknown;
  [key: string]: unknown;
}

/**
 * Deep copy. `structuredClone`, NOT a hand-written copier — a field-enumerating
 * clone would undo this module's one structural idea from the outside, and a
 * `cloneSection` of exactly that shape once let a dropped ref survive a
 * 3,909-test suite in this repo.
 */
export function cloneBgOverride<T>(doc: T): T {
  return structuredClone(doc);
}

// ---------------------------------------------------------------------------
// Derivations — the arithmetic the invariants are built on, in one place each
// ---------------------------------------------------------------------------

/** Slots a band occupies. `n = cols * rows` (inject_editor_bg.py). */
export function bandTileCount(band: Pick<BgOverrideBand, 'cols' | 'rows'>): number {
  return band.cols * band.rows;
}

/**
 * Bytes in one pattern column, `rows * TILE_BYTES`.
 *
 * The consumer needs `col_shift = log2(col_bytes)` to be exact — it computes
 * `col_bytes.bit_length() - 1` and asserts `(1 << col_shift) == col_bytes` —
 * because the runtime rotates a whole column by shifting, not dividing.
 * Equivalently (TILE_BYTES being 2^5) `rows` must itself be a power of two,
 * but the constraint is expressed on the byte count because that is the
 * quantity the engine shifts.
 */
export function bandColumnBytes(band: Pick<BgOverrideBand, 'rows'>): number {
  return band.rows * TILE_BYTES;
}

/** Total animated slots = Σ(cols*rows). A PREFIX of `tiles`, never an addition. */
export function animatedSlotCount(bands: readonly BgOverrideBand[]): number {
  return bands.reduce((n, b) => n + bandTileCount(b), 0);
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BgOverrideError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'BgOverrideError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Validation
//
// Everything here describes a document that would BAKE CLEANLY and ship wrong,
// or that the consumer refuses outright. Nothing here is about an unrecognised
// key: unknown keys are round-tripped, never refused.
// ---------------------------------------------------------------------------

function validateTileArray(
  tiles: unknown, label: string, issues: string[],
): tiles is number[][] {
  if (!Array.isArray(tiles)) {
    issues.push(`${label} must be an array of tiles`);
    return false;
  }
  let ok = true;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!Array.isArray(t) || t.length !== TILE_PIXELS) {
      issues.push(
        `${label}[${i}] must be ${TILE_PIXELS} pixel values (row-major 8x8), got ` +
        `${Array.isArray(t) ? `${t.length}` : typeof t}`,
      );
      ok = false;
      continue;
    }
    for (let p = 0; p < t.length; p++) {
      const v: unknown = t[p];
      if (!isInt(v) || v < 0 || v > TILE_PIXEL_MAX) {
        issues.push(
          `${label}[${i}][${p}] is ${JSON.stringify(v)}; BG art is 4bpp, so pixel values are ` +
          `integers 0..${TILE_PIXEL_MAX}. The consumer MASKS (\`& 0xF\`) rather than rejecting, ` +
          `so a ${TILE_PIXEL_MAX + 1} would bake silently as a 0.`,
        );
        ok = false;
        break; // one report per tile is enough; 64 identical lines is not a diagnostic
      }
    }
  }
  return ok;
}

function validateBand(
  band: unknown, i: number, tiles: number[][] | null, cursor: number, issues: string[],
): number {
  if (typeof band !== 'object' || band === null || Array.isArray(band)) {
    issues.push(`anims[${i}] must be an object`);
    return cursor;
  }
  const b = band as Record<string, unknown>;

  for (const key of BAND_KEYS) {
    if (at(['bandKeys', key, 'required']) === true && !(key in b)) {
      issues.push(`anims[${i}] is missing the required key "${key}"`);
    }
  }

  const cols = b.cols, rows = b.rows;
  if (!isInt(cols) || cols < 1) { issues.push(`anims[${i}].cols must be an integer >= 1`); }
  if (!isInt(rows) || rows < 1) { issues.push(`anims[${i}].rows must be an integer >= 1`); }

  if (b.driver !== undefined
      && (typeof b.driver !== 'string' || !Object.hasOwn(BGANIM_DRIVERS, b.driver))) {
    issues.push(
      `anims[${i}].driver is ${JSON.stringify(b.driver)}; the consumer indexes DRIVERS by this ` +
      `name and raises on anything else. Legal: ${BGANIM_DRIVER_NAMES.join(' / ')} ` +
      `(default ${JSON.stringify(BAND_DEFAULTS.driver)}). A driver names the SCALAR SOURCE, ` +
      `not an axis — every band moves horizontally.`,
    );
  }
  if (b.rate_shift !== undefined && (!isInt(b.rate_shift) || b.rate_shift < 0)) {
    issues.push(`anims[${i}].rate_shift must be an integer >= 0 (default ${BAND_DEFAULTS.rate_shift})`);
  }

  if (!isInt(cols) || !isInt(rows) || cols < 1 || rows < 1) return cursor; // nothing below is derivable

  const n = bandTileCount({ cols, rows });
  const colBytes = bandColumnBytes({ rows });
  if (!isPowerOfTwo(colBytes)) {
    issues.push(
      `anims[${i}]: column bytes rows*${TILE_BYTES} = ${rows}*${TILE_BYTES} = ${colBytes} is not a ` +
      'power of two. The runtime rotates a whole column by SHIFTING (col_shift = log2 of it), so ' +
      'the consumer asserts `(1 << col_shift) == col_bytes`. Equivalently: rows must be a power of two.',
    );
  }
  if (b.pattern_px !== undefined && b.pattern_px !== cols * TILE_WIDTH_PX) {
    issues.push(
      `anims[${i}].pattern_px is ${JSON.stringify(b.pattern_px)} but must equal cols*${TILE_WIDTH_PX} = ` +
      `${cols * TILE_WIDTH_PX}. The consumer derives step_mask = pattern_px - 1 from it.`,
    );
  }

  const slotBase = b.slot_base === undefined ? cursor : b.slot_base;
  if (b.slot_base !== undefined && (!isInt(b.slot_base) || b.slot_base !== cursor)) {
    issues.push(
      `anims[${i}].slot_base is ${JSON.stringify(b.slot_base)} but the running cursor is ${cursor}. ` +
      'Bands pack contiguously from slot 0 in list order — a band cannot be placed anywhere but ' +
      'the front of the tile blob, so slot_base is derived and may only be spelled out to agree.',
    );
  }

  // phases: exactly BGANIM_PHASE_BANKS banks, each exactly n tiles, each tile a tile.
  const phases = b.phases;
  if (!Array.isArray(phases)) {
    issues.push(`anims[${i}].phases must be an array of ${BGANIM_PHASE_BANKS} banks`);
  } else {
    if (phases.length !== BGANIM_PHASE_BANKS) {
      issues.push(
        `anims[${i}].phases has ${phases.length} banks; a band needs EXACTLY ${BGANIM_PHASE_BANKS} ` +
        `(bganim_band.banks is [*u8; ${BGANIM_PHASE_BANKS}] — pre-shifted art 1px apart, selected by ` +
        'step & 7).',
      );
    }
    phases.forEach((bank: unknown, p: number) => {
      if (!Array.isArray(bank) || bank.length !== n) {
        issues.push(
          `anims[${i}].phases[${p}] must hold cols*rows = ${n} tiles, got ` +
          `${Array.isArray(bank) ? `${bank.length}` : typeof bank}`,
        );
        return;
      }
      validateTileArray(bank, `anims[${i}].phases[${p}]`, issues);
    });
  }

  if (tiles !== null && isInt(slotBase) && slotBase >= 0) {
    if (slotBase + n > tiles.length) {
      issues.push(
        `anims[${i}] covers slots ${slotBase}..${slotBase + n} but the static tile blob has only ` +
        `${tiles.length} tiles. Animated slots are a PREFIX of \`tiles\`, so a band cannot reach ` +
        'past the end of it.',
      );
    } else if (Array.isArray(phases) && Array.isArray(phases[0])) {
      // THE PREFIX IDENTITY. Last, because it is only meaningful once the
      // shapes above hold — and it is the one whose violation bakes cleanly.
      const rest = tiles.slice(slotBase, slotBase + n);
      const phase0 = phases[0] as unknown[];
      if (phase0.length === n && JSON.stringify(phase0) !== JSON.stringify(rest)) {
        issues.push(
          `anims[${i}]: phases[0] != tiles[${slotBase}:${slotBase + n}]. A band DMAs over the FRONT ` +
          "of the static blob, so its phase-0 art IS those slots' rest state. This document's " +
          '`anims` and `tiles` came from different generations of the art: it would pass every ' +
          'other check, bake cleanly, and ship a ROM whose bands DMA stale phase art over whatever ' +
          'the newer tiles put in those slots. `anims`, `tiles` and `layout` are ONE unit — ' +
          'regenerate them together.',
        );
      }
    }
  }

  return cursor + n;
}

/**
 * Every reason this document must not be written, or must not be believed.
 * Empty means valid. Exported so a UI can pre-check without a try/catch, and so
 * an advisory surface can show the list rather than the first line of a throw.
 */
export function validateBgOverride(doc: unknown): string[] {
  const issues: string[] = [];
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['the BG override must be a JSON object'];
  }
  const d = doc as Record<string, unknown>;

  for (const key of TOP_LEVEL_KEYS) {
    if (at(['topLevelKeys', key, 'required']) === true && !(key in d)) {
      issues.push(`missing the required key "${key}"`);
    }
  }

  // layout
  const layout = d.layout;
  if (!Array.isArray(layout)) {
    if ('layout' in d) issues.push('layout must be an array of nametable words');
  } else {
    if (layout.length !== BG_LAYOUT_WORDS && layout.length !== BG_LAYOUT_WORDS_LEGACY) {
      issues.push(
        `layout has ${layout.length} words; it must be ${BG_LAYOUT_WORDS} (64x64) or ` +
        `${BG_LAYOUT_WORDS_LEGACY} (64x32 legacy, which the consumer zero-pads to ${BG_LAYOUT_WORDS}).`,
      );
    }
    const bad = layout.findIndex((w: unknown) => !isInt(w) || w < 0 || w > LAYOUT_WORD_MAX);
    if (bad >= 0) {
      issues.push(
        `layout[${bad}] is ${JSON.stringify(layout[bad])}; each entry is packed big-endian ` +
        `unsigned 16-bit, so it must be an integer 0..${LAYOUT_WORD_MAX}.`,
      );
    }
  }

  // tiles
  let tiles: number[][] | null = null;
  if ('tiles' in d) {
    if (validateTileArray(d.tiles, 'tiles', issues)) tiles = d.tiles as number[][];
    if (Array.isArray(d.tiles) && d.tiles.length > BG_TILE_CAPACITY) {
      issues.push(
        `tiles has ${d.tiles.length} entries, over the BG tile capacity of ${BG_TILE_CAPACITY}. ` +
        '(Animated slots do NOT add to this: they are a prefix of `tiles`, already counted.)',
      );
    }
  }

  // anims
  if ('anims' in d) {
    const anims = d.anims;
    if (!Array.isArray(anims)) {
      issues.push('anims must be an array of bands');
    } else if (anims.length === 0) {
      issues.push(
        'anims is present but empty. An empty `anims` key is neither absent nor authored — the ' +
        'no-bands document has NO `anims` key at all (that is what the consumer\'s own gate ' +
        'asserts of the shipped file). Delete the key rather than emptying it.',
      );
    } else {
      if (anims.length > BGANIM_MAX_BANDS) {
        issues.push(
          `${anims.length} bands authored; the engine sizes BgAnim_LastStep for at most ` +
          `${BGANIM_MAX_BANDS}. Raising that ceiling is a three-file engine change (two .emp ` +
          'constants plus the emitter cap, drift-gated together), never a writer decision.',
        );
      }
      let cursor = 0;
      anims.forEach((band, i) => { cursor = validateBand(band, i, tiles, cursor, issues); });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface BgOverrideParseResult {
  doc: BgOverrideDocument;
  /**
   * Facts about the read a caller must surface rather than swallow. Today that
   * is exactly one: the legacy `anim` upgrade, which CHANGES the document on
   * disk the next time it is saved.
   */
  notices: string[];
}

/**
 * Parse and validate the BG override document.
 *
 * Throws BgOverrideError on anything wrong. Loud, never lenient: a document the
 * reader "fixed up" would be written back over the author's file in that fixed
 * shape, which is the silent-erasure class this whole contract exists against.
 *
 * THE ONE THING IT DOES CHANGE is the legacy singular `anim` key, which becomes
 * `anims: [anim]`. Neither alternative is available to a sole writer of record:
 * re-emitting `anim` violates "writers must not emit it", and dropping it
 * destroys the band it holds. The upgrade is the only behaviour that does
 * neither, it is exactly what the consumer already does with the key, and it is
 * reported in `notices` rather than performed silently.
 */
export function parseBgOverride(text: string): BgOverrideParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new BgOverrideError(
      `${BG_OVERRIDE_CONSUMER_PATH} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BgOverrideError(`${BG_OVERRIDE_CONSUMER_PATH} must contain a JSON object`);
  }
  const doc = parsed as BgOverrideDocument;
  const notices: string[] = [];

  if (LEGACY_ANIM_KEY in doc) {
    if ('anims' in doc) {
      throw new BgOverrideError(
        `${BG_OVERRIDE_CONSUMER_PATH} carries BOTH "anims" and the legacy "${LEGACY_ANIM_KEY}". The ` +
        `consumer wraps "${LEGACY_ANIM_KEY}" ONLY when "anims" is absent, so it would silently ` +
        `ignore one of them and bake the other. Refusing rather than picking: delete the ` +
        `"${LEGACY_ANIM_KEY}" key if "anims" is the one you meant, or delete "anims" if it is not.`,
      );
    }
    const legacy = doc[LEGACY_ANIM_KEY];
    if (typeof legacy !== 'object' || legacy === null || Array.isArray(legacy)) {
      throw new BgOverrideError(
        `${BG_OVERRIDE_CONSUMER_PATH} carries "${LEGACY_ANIM_KEY}": ${JSON.stringify(legacy)}. The ` +
        'legacy key holds ONE band object. The consumer treats a falsy value as no-bands and bakes ' +
        'the disabled stub, so this document does not mean what it looks like it means — delete ' +
        'the key if there is no band.',
      );
    }
    delete doc[LEGACY_ANIM_KEY];
    doc.anims = [legacy as BgOverrideBand];
    notices.push(
      `${BG_OVERRIDE_CONSUMER_PATH} used the legacy single-band "${LEGACY_ANIM_KEY}" key. It has been ` +
      'read as "anims": [ … ]; the band is unchanged, but saving this document will rewrite the key, ' +
      'because writers must not emit the legacy spelling.',
    );
  }

  const issues = validateBgOverride(doc);
  if (issues.length > 0) {
    throw new BgOverrideError(`${BG_OVERRIDE_CONSUMER_PATH} is not a valid BG override`, issues);
  }
  return { doc, notices };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Canonical key order: the contract's own declaration order for the keys it
 * declares, then every remaining key in the document's own order.
 *
 * The tail is the round-trip half, and it is a LOOP over `Object.keys`, not a
 * list — that is what makes "carry what you do not understand" structural
 * rather than a promise someone has to remember to keep.
 */
function canonicalize(doc: BgOverrideDocument): Record<string, unknown> {
  const src = doc as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of TOP_LEVEL_KEYS) {
    if (key in src) out[key] = src[key];
  }
  for (const key of Object.keys(src)) {
    if (!(key in out)) out[key] = src[key];
  }
  return out;
}

/** The same ordering for a band, so two Auroras produce identical bytes. */
function canonicalizeBand(band: BgOverrideBand): Record<string, unknown> {
  const src = band as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of BAND_KEYS) {
    if (key in src) out[key] = src[key];
  }
  for (const key of Object.keys(src)) {
    if (!(key in out)) out[key] = src[key];
  }
  return out;
}

/**
 * Serialize the whole document.
 *
 * MINIFIED, deliberately. The shipped file is ~400 KB minified — `tiles` alone
 * is 448 arrays of 64 numbers, and one band adds 8 banks x cols*rows x 64 more.
 * At a 2-space indent with one value per line that becomes tens of megabytes
 * and hundreds of thousands of lines, which is unreviewable in a diff either
 * way. aeon's own writer minifies (`json.dumps(obj)` in tools/bg_override_io.py),
 * and Aurora is the sole writer of record, so its rendering is authoritative.
 * Byte-identity with a Python-written file is NOT a goal and is not achievable:
 * `json.dumps` defaults to `", "` / `": "` separators. What IS pinned is
 * IDEMPOTENCE — serialize(parse(serialize(x))) == serialize(x).
 *
 * Validates on the way out. The writer path is where refusal must bite: this
 * module is the sole writer of the document, so an invalid document reaching
 * disk has nothing downstream to catch it before the bake.
 */
export function serializeBgOverride(doc: BgOverrideDocument): string {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new BgOverrideError('refusing to write a BG override that is not an object');
  }
  if (LEGACY_ANIM_KEY in (doc as Record<string, unknown>)) {
    throw new BgOverrideError(
      `refusing to write the legacy "${LEGACY_ANIM_KEY}" key: it is read-side compatibility only ` +
      '(aeon EFFECTS_CONSUMER_CONTRACT.md §1.1, "Writers must not emit it"). parseBgOverride ' +
      'upgrades it to "anims" on read; a document still carrying it did not come through the reader.',
    );
  }
  const issues = validateBgOverride(doc);
  if (issues.length > 0) {
    throw new BgOverrideError(`refusing to write ${BG_OVERRIDE_CONSUMER_PATH}`, issues);
  }

  const out = canonicalize(doc);
  if (Array.isArray(out.anims)) {
    out.anims = (out.anims as BgOverrideBand[]).map(canonicalizeBand);
  }

  // Refuse to drop anything — asserted, not assumed. The two loops above are
  // meant to be total; this is the check that makes "total" a property rather
  // than a reading of the code.
  const lost = Object.keys(doc as Record<string, unknown>).filter(k => !(k in out));
  if (lost.length > 0) {
    throw new BgOverrideError(
      `refusing to write ${BG_OVERRIDE_CONSUMER_PATH}: canonicalization would drop ` +
      `${lost.join(', ')}. This is a bug in the serializer, not in the document.`,
    );
  }

  return JSON.stringify(out);
}
