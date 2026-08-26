/**
 * Emit HALF of the last open link: a band authored by Aurora's MODEL on a real
 * aeon document, serialized by Aurora, for aeon's own injector to judge.
 *
 * Two modes, one file (ROADMAP item 24 added the second as a flag rather than
 * a copy, so the two composition probes cannot drift):
 *
 *   default   PROMOTE on aeon's LIVE document — refuses unless the document is
 *             bandless AND the promoted range is genuinely DRAWN by the layout.
 *             Writes live-before.json + live-promoted.json. (Items 27/29;
 *             anti-vacuous guard re-pointed by the handover-band parcel — see
 *             the note at the promote branch.)
 *             Geometry/base/fill: PROMOTE_COLS, PROMOTE_ROWS, PROMOTE_FROM,
 *             PROMOTE_FILL in the environment.
 *   --insert  INSERT a brand-new band on a ROOMY document (aeon's generator's
 *             output under band_reserve, e.g. test/fixtures/bg-override/
 *             editor_bg_override.roomy.json) — refuses unless the document has
 *             FREE slots and is bandless. Writes live-before.json +
 *             live-inserted.json. Geometry derived from the free room, or
 *             given as `--insert=CxR`. (Item 24.)
 *
 *             WHY THE GEOMETRY IS A PARAMETER: aeon's injector at a840d68f
 *             gates the whole act's `ojz_bg_anim` section on
 *             BGANIM_PLACER_CEILING = 1026 B (2 + 44/band + 256/slot), so ONE
 *             band may cover at most 3 slots today — sigil placer work
 *             (BGANIM-PLACE) — and an 8x4 band that Aurora inserts correctly is
 *             refused there for a reason that is not Aurora's. Pick 3x1 to
 *             compose at that pin; the derived default proves the writer.
 *
 * Usage: node emit.cjs <doc.json> <outdir> [--insert[=CxR]]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseBgOverride, serializeBgOverride, bandTileCount } from '../src/core/formats/bg-override/bg-override';
import { bandFromStaticTiles, createBand, describeBands, insertBand, planBandInsertion,
         planBandPromotion, promoteBand, tileSlotsRemaining } from '../src/core/formats/bg-override/bg-anim-band';

const [, , live, out, flag] = process.argv;
const INSERT = typeof flag === 'string' && flag.startsWith('--insert');
const GEOM = INSERT && flag.includes('=') ? flag.split('=')[1].split('x').map(Number) : null;
const { doc } = parseBgOverride(readFileSync(live, 'utf8'));
const free = tileSlotsRemaining(doc);
console.log(`[doc] ${doc.tiles.length} tiles, ${describeBands(doc).length} bands, tileSlotsRemaining=${free}`);
if (describeBands(doc).length !== 0) throw new Error('expected the source document to carry no bands');
writeFileSync(`${out}/live-before.json`, serializeBgOverride(doc));

if (INSERT) {
  if (free === 0) throw new Error('VACUOUS: --insert needs a document with free slots; this one is full');
  // Rows 4; cols a quarter of what fits, at least 1 — the same derivation the
  // item-24 harness uses, so a UI-authored and a model-authored band agree.
  const ROWS = GEOM ? GEOM[1] : 4;
  const COLS = GEOM ? GEOM[0] : Math.max(1, Math.floor(free / ROWS / 4));
  const band = createBand({ cols: COLS, rows: ROWS, driver: 'timer', rate_shift: 3 });
  const plan = planBandInsertion(doc, band);
  const inserted = insertBand(doc, plan, band);
  const n = bandTileCount(band);
  if (inserted.tiles.length !== doc.tiles.length + n) {
    throw new Error(`insertion grew tiles.length by ${inserted.tiles.length - doc.tiles.length}, expected ${n}`);
  }
  console.log(`[insert] a ${COLS}x${ROWS} band (${n} tiles) at the front; tiles.length ` +
              `${doc.tiles.length} -> ${inserted.tiles.length}, bands ${describeBands(inserted).length}, ` +
              `layout words rewritten ${plan.layout.length}`);
  writeFileSync(`${out}/live-inserted.json`, serializeBgOverride(inserted));
  console.log('[emit] wrote live-before.json + live-inserted.json');
} else {
  const COLS = Number(process.env.PROMOTE_COLS ?? 8);
  const ROWS = Number(process.env.PROMOTE_ROWS ?? 4);
  const FROM = Number(process.env.PROMOTE_FROM ?? 200);
  const FILL = (process.env.PROMOTE_FILL ?? 'copy') as 'copy' | 'blank' | 'shift';

  // ─── THE ANTI-VACUOUS GUARD, RE-POINTED ────────────────────────────────
  // It used to read `if (free !== 0) throw 'this document is not full'`, and
  // that was CORRECT while full was the only case: at 448/448 `insertBand`
  // refuses at every band size, so promotion was the ONLY door and a roomy
  // document meant the run was testing the easy path by accident. aeon's live
  // document was regenerated from a simplified source and is now 320/448, so
  // that guard refuses the real file and, worse, asserts nothing about what
  // makes a promotion worth running.
  //
  // What actually makes a PROMOTION non-vacuous is not scarcity, it is
  // VISIBILITY. `planBandInsertion` only remaps existing layout words
  // (`idx < slotBase ? idx : idx + n`) — it never points a layout cell at the
  // new slots — so an inserted band is real in the blob and INVISIBLE on
  // screen. Promotion's whole claim is the opposite: it converts tiles the
  // layout ALREADY draws, so the band is on screen by construction. If the
  // promoted range is drawn by nothing, the run proves nothing, however
  // perfectly the bytes validate.
  //
  // So the guard now asks the question the mode is about: does anything draw
  // this range? Occupancy is printed (it is useful context) and no longer
  // gates anything.
  const n = COLS * ROWS;
  const drawn = doc.layout.filter((w) => {
    const idx = w & 0x7FF;
    return w !== 0 && idx >= FROM && idx < FROM + n;
  }).length;
  console.log(`[promote] range ${FROM}..${FROM + n} is drawn by ${drawn} of ${doc.layout.length} layout cells`);
  if (drawn === 0) {
    throw new Error(
      `VACUOUS: no layout cell draws tiles ${FROM}..${FROM + n}, so promoting that range ` +
      'produces a band nothing renders. A promotion is worth composing precisely because the ' +
      'layout already draws the art it takes over — that is the property an INSERT cannot have.',
    );
  }

  // PROMOTE_RATE_SHIFT=none OMITS the key, which is the only shape Aurora's UI
  // can produce (BgAnimBandPanel has no rate_shift control), so a model-vs-UI
  // cross-check has to be able to ask for it. Default unchanged: 3.
  const RATE = process.env.PROMOTE_RATE_SHIFT ?? '3';
  const band = bandFromStaticTiles(doc, FROM, {
    cols: COLS, rows: ROWS, driver: 'timer', phaseFill: FILL,
    ...(RATE === 'none' ? {} : { rate_shift: Number(RATE) }),
  });
  const plan = planBandPromotion(doc, band, FROM);
  const promoted = promoteBand(doc, plan, band);
  if (promoted.tiles.length !== doc.tiles.length) {
    throw new Error(`promotion changed tiles.length ${doc.tiles.length} -> ${promoted.tiles.length}`);
  }
  console.log(`[promote] tiles ${FROM}..${FROM + COLS * ROWS} -> an ${COLS}x${ROWS} band; ` +
              `tiles.length ${doc.tiles.length} (UNCHANGED), bands ${describeBands(promoted).length}, ` +
              `layout words rewritten ${plan.layout.length}`);
  writeFileSync(`${out}/live-promoted.json`, serializeBgOverride(promoted));
  console.log('[emit] wrote live-before.json + live-promoted.json');
}
