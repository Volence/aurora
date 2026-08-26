import { readFileSync } from 'node:fs';
import { parseBgOverride } from '../src/core/formats/bg-override/bg-override';
const { doc } = parseBgOverride(readFileSync(process.argv[2], 'utf8'));
const refs = new Map<number, number>();
for (const w of doc.layout) { const i = w & 0x7ff; refs.set(i, (refs.get(i) ?? 0) + 1); }
// per-tile: distinct pixel values, and horizontal variance (columns that differ from their neighbour)
function detail(t: readonly number[]) {
  const distinct = new Set(t).size;
  let hEdges = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 7; x++) if (t[y*8+x] !== t[y*8+x+1]) hEdges++;
  return { distinct, hEdges };
}
const d = doc.tiles.map(detail);
const flat = d.filter(x => x.distinct === 1).length;
console.log(`tiles ${doc.tiles.length}: flat(1 colour) ${flat}, mean distinct ${(d.reduce((a,x)=>a+x.distinct,0)/d.length).toFixed(2)}, mean hEdges ${(d.reduce((a,x)=>a+x.hEdges,0)/d.length).toFixed(1)}/56`);
const rows: {from:number,refs:number,hEdges:number,flat:number}[] = [];
for (let from = 0; from + 32 <= doc.tiles.length; from++) {
  let ok = true, tot = 0, he = 0, fl = 0;
  for (let k = 0; k < 32; k++) {
    const c = refs.get(from+k); if (!c) { ok = false; break; }
    tot += c; he += d[from+k].hEdges; if (d[from+k].distinct === 1) fl++;
  }
  if (ok) rows.push({from, refs: tot, hEdges: he, flat: fl});
}
// A band is worth watching when it is drawn a lot AND its art has horizontal detail to slide.
rows.sort((a,b) => (b.hEdges*b.refs) - (a.hEdges*a.refs));
console.log('top 8 by refs*hEdges (no flat tiles first):');
for (const r of rows.filter(r=>r.flat===0).slice(0,8)) console.log(' ', JSON.stringify(r));
console.log('top 3 overall:'); for (const r of rows.slice(0,3)) console.log(' ', JSON.stringify(r));
console.log('tile 0 detail:', JSON.stringify(d[0]), 'refs', refs.get(0));
