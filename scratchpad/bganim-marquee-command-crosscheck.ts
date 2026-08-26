/**
 * CROSS-CHECK: does the real `promoteBandCommand` agree with the marquee probe's
 * classifier — and what does it do when they disagree?
 *
 * `scratchpad/bganim-marquee-resolution-probe.mjs` classifies a marquee with its
 * OWN arithmetic. That arithmetic is worth nothing unless the codec agrees with
 * it, so this probe puts the two side by side over the shipped document:
 *
 *   1. Every marquee the probe calls PROMOTABLE is handed to
 *      `promoteBandCommand` at the base the probe derived. It must come back ok.
 *   2. Every marquee the probe calls NOT promotable is handed to the same
 *      command at the same base. What comes back is the finding: a refusal
 *      would mean the codec catches the mismatch, and an `ok` means it does NOT
 *      — the command promotes `tiles[base : base+n]` whether or not those are
 *      the tiles the marquee covered.
 *   3. For the `ok`-but-not-promotable cases, the probe reports how many tiles
 *      of the promoted range the marquee never touched, and how many tiles it
 *      DID touch that the range leaves out.
 *
 * Build and run:
 *   npx esbuild --bundle --platform=node --format=cjs \
 *     scratchpad/bganim-marquee-command-crosscheck.ts --outfile=/tmp/xcheck.cjs \
 *   && node /tmp/xcheck.cjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promoteBandCommand } from '../src/renderer/providers/bg-anim-aeon';
import {
  BG_LAYOUT_WORDS, LAYOUT_TILE_INDEX_MASK, animatedSlotCount,
  type BgOverrideDocument,
} from '../src/core/formats/bg-override/bg-override';
import { documentBands } from '../src/core/formats/bg-override/bg-anim-band';

// The bundle runs from /tmp, so __dirname is meaningless — the repo is the cwd
// the build command documents above.
const REPO = process.cwd();
const DOC_PATH = resolve(REPO, 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json');
const doc = JSON.parse(readFileSync(DOC_PATH, 'utf8')) as BgOverrideDocument;

const PLANE_COLS = 64;
const PLANE_ROWS = BG_LAYOUT_WORDS / PLANE_COLS;
const animated = animatedSlotCount(documentBands(doc));
const layout = doc.layout as number[];

function cells(c0: number, r0: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) out.push(layout[(r0 + i) * PLANE_COLS + (c0 + j)] & LAYOUT_TILE_INDEX_MASK);
  }
  return out;
}

const HEIGHTS = [1, 2, 4, 8];
const WIDTHS = [2, 4, 8, 16];

let agree = 0, promotableAndOk = 0, promotableAndRefused = 0;
let notPromotableButOk = 0, notPromotableAndRefused = 0;
let worstExtra = 0, worstMissing = 0;
let exampleSilent: string | null = null;
let sampled = 0;

for (const h of HEIGHTS) {
  for (const w of WIDTHS) {
    for (let r0 = 0; r0 + h <= PLANE_ROWS; r0 += 3) {
      for (let c0 = 0; c0 + w <= PLANE_COLS; c0 += 3) {
        const idx = cells(c0, r0, w, h);
        const n = w * h;
        const base = Math.min(...idx);
        const set = new Set(idx);
        const promotable = set.size === n && Math.max(...idx) - base + 1 === n && base >= animated;
        const res = promoteBandCommand(doc, base, { cols: w, rows: h });
        sampled++;

        if (promotable && res.ok) { promotableAndOk++; agree++; }
        else if (promotable && !res.ok) promotableAndRefused++;
        else if (!promotable && res.ok) {
          notPromotableButOk++;
          const range = new Set<number>();
          for (let k = 0; k < n; k++) range.add(base + k);
          const extra = [...range].filter((t) => !set.has(t)).length;
          const missing = [...set].filter((t) => !range.has(t)).length;
          if (extra > worstExtra) {
            worstExtra = extra; worstMissing = missing;
            exampleSilent = `${w}x${h} at col ${c0} row ${r0}: covers ${set.size} distinct tile(s) `
              + `spanning ${base}..${Math.max(...idx)}; promoting ${base}..${base + n - 1} takes `
              + `${extra} tile(s) the marquee never touched and leaves out ${missing} it did`;
          }
        } else { notPromotableAndRefused++; agree++; }
      }
    }
  }
}

console.log(`document: ${DOC_PATH}`);
console.log(`  tiles ${(doc.tiles as unknown[]).length}, animated prefix ${animated}, `
  + `sampled ${sampled} marquees (every 3rd position, w in ${WIDTHS}, h in ${HEIGHTS})`);
console.log('');
console.log(`  probe says PROMOTABLE     -> command ok:       ${promotableAndOk}`);
console.log(`  probe says PROMOTABLE     -> command REFUSED:  ${promotableAndRefused}   `
  + '(must be 0, or the probe is wrong about the codec)');
console.log(`  probe says NOT promotable -> command REFUSED:  ${notPromotableAndRefused}`);
console.log(`  probe says NOT promotable -> command ok:       ${notPromotableButOk}   `
  + '<-- THE FINDING: the codec cannot see the mismatch');
console.log('');
if (exampleSilent) {
  console.log('  worst silent acceptance:');
  console.log(`    ${exampleSilent}`);
}
if (promotableAndRefused > 0) {
  console.log('\n!! the probe and the codec DISAGREE on a promotable range. The measurement report '
    + 'must not be read until this is resolved.');
  process.exit(1);
}
if (sampled === 0) {
  console.log('\n!! NOTHING WAS SAMPLED — this run says nothing.');
  process.exit(2);
}
