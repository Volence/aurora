// Reproduce collision-angle-mark.ts's own formulas to check the brief's claim.
function angleTangent(b) { const r = ((b & 0xff) / 256) * Math.PI * 2; return { tx: Math.cos(r), ty: Math.sin(r) }; }
const EPS = 1e-9;
function outwardNormal(b, h) {
  const { tx, ty } = angleTangent(b);
  let nx = ty, ny = -tx;
  const want = h >= 0;
  if (Math.abs(ny) > EPS && (ny < 0) !== want) { nx = -nx; ny = -ny; }
  return { nx, ny };
}
for (const b of [0x00, 0x08, 0x10, 0x20, 0x40, 0xc0, 0xe0]) {
  const t = angleTangent(b), n = outwardNormal(b, 8);
  console.log(`$${b.toString(16).padStart(2, '0')} tangent(${t.tx.toFixed(3)}, ${t.ty.toFixed(3)}) normal(${n.nx.toFixed(3)}, ${n.ny.toFixed(3)})`);
}
console.log('silhouette blind band deg =', (Math.atan(1 / 16) * 180 / Math.PI).toFixed(4));
console.log('16/(4.5*sin(atan(1/16))) =', (16 / (4.5 * Math.sin(Math.atan(1 / 16)))).toFixed(4));
