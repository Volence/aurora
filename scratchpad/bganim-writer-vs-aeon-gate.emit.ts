import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride, cloneBgOverride,
         bandTileCount } from '../src/core/formats/bg-override/bg-override';

const FIX = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const out = process.argv[2];
const raw = readFileSync(FIX, 'utf8');
const { doc, notices } = parseBgOverride(raw);

const bands = doc.anims ?? [];
// ANTI-VACUOUS: a zero-band document passes aeon's coherence check trivially.
if (bands.length === 0) throw new Error('VACUOUS: fixture parsed with 0 bands');
console.log(`[emit] parsed ${bands.length} bands, ${doc.tiles.length} static tiles, notices=${JSON.stringify(notices)}`);
bands.forEach((b, i) => console.log(`[emit]   band ${i}: ${b.cols}x${b.rows} driver=${b.driver ?? '(default)'} slot_base=${b.slot_base ?? 0} n=${bandTileCount(b)} phases=${b.phases.length}`));

// (1) Aurora's writer output for the UNMODIFIED document.
writeFileSync(`${out}/aurora-clean.json`, serializeBgOverride(doc));

// (2) POISON: break prefix identity on band 0 only. Must be REJECTED.
const bad = cloneBgOverride(doc);
const b0 = bad.anims![0];
const before = b0.phases[0][0][0];
b0.phases[0][0][0] = before === 0 ? 1 : 0;
console.log(`[emit] poison: band0.phases[0][0][0] ${before} -> ${b0.phases[0][0][0]}`);
// Aurora's OWN writer refuses this — record that, then bypass it so aeon's gate
// gets judged independently rather than shielded by ours.
let auroraRefused = false, auroraMsg = '';
try { serializeBgOverride(bad); }
catch (e) { auroraRefused = true; auroraMsg = (e as Error).message; }
console.log(`[emit] aurora-writer-refuses-poison: ${auroraRefused}`);
if (!auroraRefused) throw new Error('EXPECTED Aurora writer to refuse the poison');
writeFileSync(`${out}/aurora-poisoned.json`, JSON.stringify(bad));

// (3) CONTROL: the fixture's own original bytes, untouched by Aurora.
writeFileSync(`${out}/control-original.json`, raw);
console.log('[emit] wrote 3 documents');
