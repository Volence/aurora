#!/usr/bin/env node
// Does a MARQUEE over the background resolve to a PROMOTABLE band?  (ROADMAP
// item 43 part 2, the measurement that gates the gesture.)
//
// THE QUESTION.  `promoteBandCommand(doc, staticBase, {cols, rows})` promotes
// `tiles[staticBase : staticBase + cols*rows]` — a CONTIGUOUS slot range at or
// past the animated prefix.  A marquee selects PICTURE CELLS, and each cell's
// nametable word names a tile index.  Nothing guarantees those indices are
// contiguous, duplicate-free, or arranged the way a band's slots are.  This
// probe measures how often they are, over the real documents.
//
// EVERY BOUND IS READ FROM THE CONTRACT, never restated:
// `LAYOUT_TILE_INDEX_MASK`, `BG_LAYOUT_WORDS`, `TILE_BYTES` and the plane's
// 64x64 shape all come out of `bganim-consumer-contract.json` beside the codec.
//
// THE FIVE VERDICTS, weakest to strongest, per marquee:
//
//   distinct     the w*h cells name w*h DISTINCT indices (no tile drawn twice).
//   contiguous   those indices are exactly [min, min + w*h), no holes.
//   promotable   contiguous AND min >= animatedSlotCount, so `promoteBand`
//                would not refuse the range.
//   colMajor     promotable AND cell (j,i) names min + j*h + i — the band's OWN
//                slot geometry ("a pattern column's tiles are contiguous in
//                VRAM", aeon engine/level/bg_anim.emp).  This is the verdict
//                that means the promoted band ANIMATES as the pictured region.
//   rowMajor     promotable AND cell (j,i) names min + i*w + j — the other
//                arrangement, measured because if THAT is what the art uses the
//                gesture needs a transposed cols/rows rather than a refusal.
//
// Usage:  node scratchpad/bganim-marquee-resolution-probe.mjs [doc.json ...]
// With no arguments it measures the in-repo b0e5a661 fixture and, if present,
// aeon's live document.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ── constants, read from the contract the codec reads ──────────────────────
const contract = JSON.parse(readFileSync(
  resolve(REPO, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
function constant(name) {
  const found = findConst(contract, name);
  if (found === undefined) throw new Error(`contract has no constant ${name}`);
  return found;
}
function findConst(node, name) {
  if (node === null || typeof node !== 'object') return undefined;
  for (const [k, v] of Object.entries(node)) {
    if (k === name && v && typeof v === 'object' && 'value' in v) return v.value;
    const deeper = findConst(v, name);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}
const MASK = constant('LAYOUT_TILE_INDEX_MASK');
const LAYOUT_WORDS = constant('BG_LAYOUT_WORDS');
const TILE_BYTES = constant('TILE_BYTES');
// The plane is 64x64 words; the contract's BG_LAYOUT_WORDS cite says
// `COLS, ROWS = 64, 64`, so the width is derived from that citation, not typed.
const PLANE_COLS = (() => {
  const cite = JSON.stringify(contract);
  const m = /COLS,\s*ROWS\s*=\s*(\d+),\s*(\d+)/.exec(cite);
  if (!m) throw new Error('contract no longer cites the plane shape as `COLS, ROWS = w, h`');
  const [cols, rows] = [Number(m[1]), Number(m[2])];
  if (cols * rows !== LAYOUT_WORDS) {
    throw new Error(`contract plane ${cols}x${rows} does not make BG_LAYOUT_WORDS ${LAYOUT_WORDS}`);
  }
  return cols;
})();
const PLANE_ROWS = LAYOUT_WORDS / PLANE_COLS;

// A band's `rows` must be a power of two (bg-override.ts: column bytes
// rows*TILE_BYTES must be a power of two, "equivalently: rows must be a power
// of two"), so the sweep only offers heights a band could legally carry.
const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
const HEIGHTS = [];
for (let h = 1; h <= PLANE_ROWS; h *= 2) {
  if (isPow2(h * TILE_BYTES)) HEIGHTS.push(h);
}
// Widths: the validator does not constrain `cols`, but the runtime masks the
// step with `pattern_px - 1`, so every band that has ever shipped is a power of
// two wide.  The sweep offers both kinds and reports them together — a
// non-power-of-two width that resolved would still be a fact worth having.
const WIDTHS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

// ── the model, quoted from bg-anim-band.ts ─────────────────────────────────
const bandTileCount = (cols, rows) => cols * rows;
const animatedSlotCount = (bands) =>
  bands.reduce((n, b) => n + bandTileCount(b.cols, b.rows), 0);

/** One marquee's verdict.  `base` is the lowest index it names. */
function classify(layout, animated, c0, r0, w, h) {
  const idx = [];
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const word = layout[(r0 + i) * PLANE_COLS + (c0 + j)];
      idx.push(word & MASK);
    }
  }
  const n = w * h;
  const set = new Set(idx);
  const min = Math.min(...idx), max = Math.max(...idx);
  const distinct = set.size === n;
  const contiguous = distinct && max - min + 1 === n;
  const promotable = contiguous && min >= animated;
  const at = (j, i) => idx[i * w + j];
  let colMajor = promotable, rowMajor = promotable;
  for (let i = 0; i < h && (colMajor || rowMajor); i++) {
    for (let j = 0; j < w; j++) {
      if (at(j, i) !== min + j * h + i) colMajor = false;
      if (at(j, i) !== min + i * w + j) rowMajor = false;
    }
  }
  return {
    distinct, contiguous, promotable, colMajor, rowMajor,
    base: min, span: max - min + 1, unique: set.size,
    // the near-miss shape: how many indices in [min,max] the marquee does NOT name
    holes: (max - min + 1) - set.size,
    overlapsBand: min < animated,
  };
}

/**
 * DOES THE BAND APPEAR IN THE PICTURE AS ITS OWN SLOT BLOCK?
 *
 * A band's slots are column-major (`slot = col*rows + row`, aeon
 * engine/level/bg_anim.emp), and a band generated by aeon's own generator is
 * DRAWN that way too — one `cols x rows` window of the plane naming
 * base..base+n-1 in exactly that order. So this answers two different questions
 * at once, and the report must keep them apart:
 *
 *   • IT IS THE PROBE'S INSTRUMENT CHECK. Every number below depends on
 *     decoding the plane as the consumer does — `PLANE_COLS` words per row,
 *     tile index in the low `MASK` bits. Get that wrong and the picture is
 *     sheared, every marquee resolves to nonsense, and "marquees do not
 *     resolve" comes out for the wrong reason. Finding the block in a
 *     generator-made document PROVES the decode. The run-level gate below
 *     requires at least one document to prove it, or the run is void.
 *
 *   • IT IS ALSO A FINDING ABOUT THE DOCUMENT. A band that is NOT drawn as its
 *     own block is a band whose animated slots are scattered through the
 *     picture — which is what promoting a range the picture does not lay out
 *     column-major produces. That is a fact about that file, not a probe fault,
 *     and it is only readable as such once another document has proved the
 *     decode.
 */
function proveDecode(layout, bands) {
  if (bands.length === 0) return { checked: false, found: 0, note: 'no bands to check against' };
  let found = 0;
  const bases = [0];
  for (const b of bands) bases.push(bases[bases.length - 1] + bandTileCount(b.cols, b.rows));
  bands.forEach((band, bi) => {
    const base = bases[bi], w = band.cols, h = band.rows;
    if (w > PLANE_COLS || h > PLANE_ROWS) return;
    for (let r0 = 0; r0 + h <= PLANE_ROWS && found === bi; r0++) {
      for (let c0 = 0; c0 + w <= PLANE_COLS; c0++) {
        let ok = true;
        for (let i = 0; i < h && ok; i++) {
          for (let j = 0; j < w; j++) {
            if ((layout[(r0 + i) * PLANE_COLS + (c0 + j)] & MASK) !== base + j * h + i) { ok = false; break; }
          }
        }
        if (ok) { found++; break; }
      }
    }
  });
  return { checked: true, found, of: bands.length };
}

function measure(label, doc) {
  const layout = doc.layout;
  const bands = Array.isArray(doc.anims) ? doc.anims : [];
  const animated = animatedSlotCount(bands);
  if (layout.length !== LAYOUT_WORDS) {
    console.log(`  !! ${label}: layout is ${layout.length} words, not ${LAYOUT_WORDS} — `
      + 'the legacy 64x32 shape is zero-padded by the consumer and is not measured here.');
    return null;
  }

  console.log(`\n=== ${label}`);
  console.log(`    tiles ${doc.tiles.length}, bands ${bands.length} `
    + `(${bands.map((b) => `${b.cols}x${b.rows}`).join(', ') || 'none'}), `
    + `animated prefix = slots 0..${animated}`);

  const decode = proveDecode(layout, bands);
  if (decode.checked) {
    console.log(`    BAND-AS-BLOCK: ${decode.found}/${decode.of} band(s) drawn as their own `
      + `column-major slot block at ${PLANE_COLS} words/row`);
    if (decode.found === decode.of) decodeProvenBy.push(label);
    else {
      console.log('       ^ this document\'s band slots are SCATTERED through the picture rather '
        + 'than laid out as the block the band\'s geometry describes.');
    }
  } else {
    console.log(`    BAND-AS-BLOCK: not applicable (${decode.note}).`);
  }

  const rows = [];
  let grand = { total: 0, distinct: 0, contiguous: 0, promotable: 0, colMajor: 0, rowMajor: 0 };
  const holeHist = new Map();
  const spanRatio = [];

  for (const h of HEIGHTS) {
    for (const w of WIDTHS) {
      let t = 0, d = 0, c = 0, p = 0, cm = 0, rm = 0;
      for (let r0 = 0; r0 + h <= PLANE_ROWS; r0++) {
        for (let c0 = 0; c0 + w <= PLANE_COLS; c0++) {
          const v = classify(layout, animated, c0, r0, w, h);
          t++; if (v.distinct) d++; if (v.contiguous) c++;
          if (v.promotable) p++; if (v.colMajor) cm++; if (v.rowMajor) rm++;
          if (!v.contiguous) {
            holeHist.set(v.holes, (holeHist.get(v.holes) ?? 0) + 1);
            spanRatio.push(v.span / (w * h));
          }
        }
      }
      rows.push({ w, h, t, d, c, p, cm, rm });
      grand.total += t; grand.distinct += d; grand.contiguous += c;
      grand.promotable += p; grand.colMajor += cm; grand.rowMajor += rm;
    }
  }

  const pct = (n, of) => of === 0 ? '  n/a' : `${(100 * n / of).toFixed(2)}%`;
  console.log('    w x h |   marquees |   distinct | contiguous | promotable |  colMajor |  rowMajor');
  for (const r of rows) {
    console.log(`    ${String(r.w).padStart(2)}x${String(r.h).padStart(2)} | `
      + `${String(r.t).padStart(10)} | ${pct(r.d, r.t).padStart(10)} | ${pct(r.c, r.t).padStart(10)} | `
      + `${pct(r.p, r.t).padStart(10)} | ${pct(r.cm, r.t).padStart(9)} | ${pct(r.rm, r.t).padStart(9)}`);
  }
  console.log(`    TOTAL ${String(grand.total).padStart(12)} | ${pct(grand.distinct, grand.total).padStart(10)} `
    + `| ${pct(grand.contiguous, grand.total).padStart(10)} | ${pct(grand.promotable, grand.total).padStart(10)} `
    + `| ${pct(grand.colMajor, grand.total).padStart(9)} | ${pct(grand.rowMajor, grand.total).padStart(9)}`);

  // The near-miss: when it does NOT resolve, how far off is it?
  const holes = [...holeHist.entries()].sort((a, b) => a[0] - b[0]);
  const nonContig = holes.reduce((n, [, k]) => n + k, 0);
  console.log(`\n    NEAR-MISS over the ${nonContig} non-contiguous marquees:`);
  const cum = [];
  let run = 0;
  for (const [holeCount, k] of holes) { run += k; cum.push([holeCount, k, run]); }
  for (const [holeCount, k, upto] of cum.slice(0, 8)) {
      console.log(`      ${String(holeCount).padStart(6)} hole(s): ${String(k).padStart(8)} `
        + `(${pct(k, nonContig)}, cumulative ${pct(upto, nonContig)})`);
  }
  if (cum.length > 8) {
    const rest = nonContig - cum[7][2];
    console.log(`      ${String(cum[8][0]).padStart(6)}+ holes: ${String(rest).padStart(8)} (${pct(rest, nonContig)})`);
  }
  spanRatio.sort((a, b) => a - b);
  const q = (f) => spanRatio.length === 0 ? NaN : spanRatio[Math.min(spanRatio.length - 1, Math.floor(f * spanRatio.length))];
  console.log(`      span / cells  — median ${q(0.5).toFixed(1)}x, p90 ${q(0.9).toFixed(1)}x, max ${q(1).toFixed(1)}x`);
  console.log('      (1.0x would be "contiguous"; a big number means the named indices are '
    + 'scattered across the blob, not a range with a few holes.)');

  return grand;
}

// ── which marquees DO resolve: are they over static art or over a band? ────
function whereDoTheyResolve(label, doc) {
  const layout = doc.layout;
  const bands = Array.isArray(doc.anims) ? doc.anims : [];
  const animated = animatedSlotCount(bands);
  let contigOverBand = 0, contigOverStatic = 0, colMajorOverStatic = 0, colMajorOverBand = 0;
  for (const h of HEIGHTS) {
    for (const w of WIDTHS) {
      for (let r0 = 0; r0 + h <= PLANE_ROWS; r0++) {
        for (let c0 = 0; c0 + w <= PLANE_COLS; c0++) {
          const v = classify(layout, animated, c0, r0, w, h);
          if (!v.contiguous) continue;
          if (v.overlapsBand) contigOverBand++; else contigOverStatic++;
          // colMajor requires promotable, so re-derive the band-side answer
          if (v.overlapsBand) {
            const probe = classify(layout, 0, c0, r0, w, h);
            if (probe.colMajor) colMajorOverBand++;
          } else if (v.colMajor) colMajorOverStatic++;
        }
      }
    }
  }
  console.log(`\n    WHERE the contiguous marquees are (${label}):`);
  console.log(`      over the ANIMATED prefix (already a band, promotion refuses): ${contigOverBand}`
    + `  [column-major: ${colMajorOverBand}]`);
  console.log(`      over STATIC art (what promotion is for):                     ${contigOverStatic}`
    + `  [column-major: ${colMajorOverStatic}]`);

  // WHICH SHAPES resolve over static art, 1x1 counted apart. A 1x1 marquee is
  // contiguous by arithmetic rather than by anything about the picture, so it
  // must not be allowed to carry the verdict.
  const shapes = new Map();
  let oneByOne = 0;
  for (const h of HEIGHTS) {
    for (const w of WIDTHS) {
      let n = 0;
      for (let r0 = 0; r0 + h <= PLANE_ROWS; r0++) {
        for (let c0 = 0; c0 + w <= PLANE_COLS; c0++) {
          if (classify(layout, animated, c0, r0, w, h).promotable) n++;
        }
      }
      if (n === 0) continue;
      if (w === 1 && h === 1) { oneByOne = n; continue; }
      shapes.set(`${w}x${h}`, n);
    }
  }
  const multi = [...shapes.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`      1x1 marquees that are promotable (a single tile, not a band shape): ${oneByOne}`);
  console.log(`      promotable shapes LARGER than 1x1: `
    + (multi.length === 0 ? 'NONE' : multi.map(([s, n]) => `${s}:${n}`).join(' ')));
  const multiRow = multi.filter(([s]) => Number(s.split('x')[1]) > 1);
  console.log(`      ... of which MULTI-ROW (h > 1): `
    + (multiRow.length === 0 ? 'NONE — every promotable marquee is a single row of tiles'
      : multiRow.map(([s, n]) => `${s}:${n}`).join(' ')));
}

const decodeProvenBy = [];

const args = process.argv.slice(2);
const docs = args.length > 0 ? args.map((p) => [p, p]) : [
  ['b0e5a661 fixture (the shipped OJZ background)',
    resolve(REPO, 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json')],
  ['aeon live document (games/sonic4/data)',
    resolve(REPO, '../../../../aeon/games/sonic4/data/editor_bg_override.json')],
  ['roomy fixture (no bands, regenerated with headroom)',
    resolve(REPO, 'test/fixtures/bg-override/editor_bg_override.roomy.json')],
];

console.log(`plane ${PLANE_COLS}x${PLANE_ROWS} = ${LAYOUT_WORDS} words, tile index mask ${MASK}`);
console.log(`band heights swept (rows must be a power of two): ${HEIGHTS.join(', ')}`);
console.log(`band widths swept: ${WIDTHS.join(', ')}`);

let measured = 0;
for (const [label, path] of docs) {
  if (!existsSync(path)) { console.log(`\n=== ${label}\n    (absent at ${path} — not measured)`); continue; }
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  if (measure(label, doc)) { whereDoTheyResolve(label, doc); measured++; }
}
if (measured === 0) {
  console.log('\n!! NOTHING WAS MEASURED. Every document was absent or the wrong shape — this run '
    + 'says nothing about the question and must not be read as a verdict.');
  process.exit(2);
}

// THE RUN-LEVEL GATE. The whole measurement rests on decoding the plane the way
// the consumer does. At least one banded document has to show its band drawn as
// the block the band's own geometry describes, or the probe has not proved it
// can read a plane at all and every percentage above is unfounded.
if (decodeProvenBy.length === 0) {
  console.log('\n!! THE DECODE IS UNPROVEN. No document in this run showed a band drawn as its own '
    + `column-major slot block at ${PLANE_COLS} words/row, so nothing here confirms the probe is `
    + 'reading the plane the way the consumer does. The percentages above must NOT be read as a '
    + 'verdict — measure a generator-made document (the b0e5a661 fixture) alongside.');
  process.exit(3);
}
console.log(`\nDECODE PROVEN BY: ${decodeProvenBy.join('; ')}`);
