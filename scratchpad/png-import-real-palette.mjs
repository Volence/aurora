// Does the per-cell line solver hold up against a REAL act palette?
//
// The synthetic tests place colours deliberately. Real S1 palettes place them
// awkwardly: the same black appears in several lines, greys repeat, and ramp
// ends collide. That is exactly the situation a per-COLOUR mapping gets wrong,
// so it is the situation worth measuring.
//
// Run: npx tsx scratchpad/png-import-real-palette.mjs

import { readFileSync } from 'node:fs';
import { importPngAgainstPalette } from '../src/core/art/png-import.ts';
import { decodeGenesisColor } from '../src/core/formats/palette.ts';

const DISASM = '/home/volence/sonic_hacks/s1disasm';

// GHZ composes as Sonic.bin[0..16) -> entries 0..16, then
// Green Hill Zone.bin[0..48) -> entries 16..64 (profiles/s1.ts basePalette).
function actPalette() {
  const be = (b, i) => (b[i] << 8) | b[i + 1];
  const sonic = readFileSync(`${DISASM}/palette/Sonic.bin`);
  const zone = readFileSync(`${DISASM}/palette/Green Hill Zone.bin`);
  const flat = new Array(64).fill(0);
  for (let i = 0; i < 16; i++) flat[i] = be(sonic, i * 2);
  for (let i = 0; i < 48; i++) flat[16 + i] = be(zone, i * 2);
  return flat;
}

const pal = actPalette();

// How ambiguous is this palette, really?
const homes = new Map(); // CRAM word -> [{line, entry}]
for (let line = 0; line < 4; line++) {
  for (let entry = 1; entry < 16; entry++) {
    const w = pal[line * 16 + entry];
    if (!homes.has(w)) homes.set(w, []);
    homes.get(w).push({ line, entry });
  }
}
const ambiguous = [...homes.entries()].filter(([, v]) => new Set(v.map((c) => c.line)).size > 1);
console.log(`GHZ act 1 palette: ${homes.size} distinct colours, ${ambiguous.length} living in MORE THAN ONE line`);
for (const [w, v] of ambiguous) {
  const c = decodeGenesisColor(w);
  console.log(`  $${w.toString(16).padStart(4, '0')} rgb(${c.r},${c.g},${c.b}) in lines ${[...new Set(v.map((x) => x.line))].join(',')}`);
}

// Build a 256x256 sheet using one ambiguous colour plus one that is unique to a
// single line — the exact pair a per-colour mapping splits across two lines.
const unique = [...homes.entries()].find(([, v]) => new Set(v.map((c) => c.line)).size === 1 && v[0].line > 0);
if (!unique || ambiguous.length === 0) {
  console.log('\nThis palette has no ambiguous/unique pair — nothing to prove here.');
  process.exit(0);
}
const shared = ambiguous[0];
const targetLine = unique[1][0].line;
console.log(`\nsheet uses: shared $${shared[0].toString(16)} + unique $${unique[0].toString(16)} (line ${targetLine} only)`);

const W = 256, H = 256;
const indices = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Every cell mixes the two, so every cell must resolve to the unique one's line.
    indices[y * W + x] = ((x >> 2) + (y >> 2)) % 2 === 0 ? 1 : 2;
  }
}
const png = {
  width: W, height: H, indices,
  palette: [
    { r: 0, g: 0, b: 0 },                      // 0 — declared transparent, unused
    decodeGenesisColor(shared[0]),
    decodeGenesisColor(unique[0]),
  ],
  transparentIndex: 0,
};

const r = importPngAgainstPalette(png, pal);
if (!r.ok) {
  console.log(`\nFAIL — refused: ${r.refusal.kind}`);
  process.exit(1);
}
console.log(`\nmapped OK · lines used: [${r.result.usedLines.join(', ')}] · snapped: ${r.result.snappedColours}`);

const lineOf = (v) => (v >> 4) & 3;
const linesSeen = new Set();
for (let i = 0; i < r.result.pixels.data.length; i++) {
  if ((r.result.pixels.data[i] & 15) !== 0) linesSeen.add(lineOf(r.result.pixels.data[i]));
}
const ok = linesSeen.size === 1 && linesSeen.has(targetLine);
console.log(ok
  ? `PASS — the whole sheet resolved onto line ${targetLine}, including the shared colour a per-colour mapping would have put elsewhere.`
  : `FAIL — expected every pixel on line ${targetLine}, saw lines [${[...linesSeen].join(', ')}]`);
process.exit(ok ? 0 : 1);
