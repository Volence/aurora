// Verify flip-aware matching against REAL s1disasm pool data, not fixtures.
//
// Spec §0 C4 measured flip-duplicate tiles per zone, twice independently:
//   GHZ 111, SYZ 52, SLZ 52, MZ 50, LZ 0, SBZ 0
// If tile-canon's canonicalisation is right, counting distinct canonical keys
// vs distinct exact tiles must reproduce those numbers.
//
// Run: npx tsx scratchpad/flip-match-real-data.mjs   (from the aurora repo root)

import { readFileSync } from 'node:fs';
import { nemesisDecompress } from '../src/core/compress/nemesis.ts';
import { canonicalTile } from '../src/core/art/tile-canon.ts';
import { poolTileEntries, TILE_BYTES } from '../src/core/art/tile-pool-match.ts';

const DISASM = '/home/volence/sonic_hacks/s1disasm';

// From profiles/s1.ts — GHZ ships two art files, every other zone one.
const ZONES = {
  ghz: ['artnem/8x8 - GHZ1.nem', 'artnem/8x8 - GHZ2.nem'],
  lz: ['artnem/8x8 - LZ.nem'],
  mz: ['artnem/8x8 - MZ.nem'],
  slz: ['artnem/8x8 - SLZ.nem'],
  syz: ['artnem/8x8 - SYZ.nem'],
  sbz: ['artnem/8x8 - SBZ.nem'],
};

const EXPECTED = { ghz: 111, syz: 52, slz: 52, mz: 50, lz: 0, sbz: 0 };

function loadPool(files) {
  const parts = files.map((f) => nemesisDecompress(readFileSync(`${DISASM}/${f}`)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

console.log("zone   tiles   canon   exactd   flip   redundant   expected   ok");
let allOk = true;
for (const [zone, files] of Object.entries(ZONES)) {
  const pool = loadPool(files);
  const count = Math.floor(pool.length / TILE_BYTES);

  const exact = new Set();
  const canon = new Set();
  const scratch = new Uint8Array(64);
  for (let t = 0; t < count; t++) {
    exact.add(String.fromCharCode(...pool.subarray(t * TILE_BYTES, (t + 1) * TILE_BYTES)));
    canon.add(canonicalTile(poolTileEntries(pool, t, scratch)).key);
  }
  // C4's "duplicate tiles" is TOTAL redundancy against a flip-aware count:
  // how many pool slots hold art some other slot already holds, exactly or
  // mirrored. That is pool size minus distinct canonical keys — NOT the
  // flip-only delta, which is a different and much smaller number.
  const redundant = count - canon.size;
  const exactDupes = count - exact.size;
  const flipOnly = exact.size - canon.size;
  const want = EXPECTED[zone];
  const ok = redundant === want;
  if (!ok) allOk = false;
  console.log(
    `${zone.padEnd(6)} ${String(count).padStart(5)}   ${String(canon.size).padStart(5)}`
    + `   ${String(exactDupes).padStart(6)}   ${String(flipOnly).padStart(5)}`
    + `   ${String(redundant).padStart(9)}   ${String(want).padStart(8)}   ${ok ? 'yes' : 'NO'}`,
  );
}
console.log(allOk ? '\nAll zones match the C4 measurement.' : '\nMISMATCH — see above.');
