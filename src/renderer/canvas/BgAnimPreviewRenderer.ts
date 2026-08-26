// The BgAnim band motion preview — ROADMAP item 42, shape per
// docs/reviews/2026-08-22-preview-posture-ruling.md §2 Q3.
//
// ═══ WHAT IT DRAWS ═══
//
// One transparent, plane-sized overlay holding only the background cells a band
// owns, composed at the band's CURRENT PHASE and blitted over the already-
// painted Plane B. Everything else on the plane is untouched, which is what the
// engine does: a band's DMA rewrites its own VRAM slots and nothing else.
//
// ═══ WHAT IT REFUSES TO DRAW, AND WHY THAT IS THE INTERESTING PART ═══
//
// A band names SLOTS in the BG tile blob. Aurora has TWO BG tile blobs for one
// act — the one the viewport paints (`act.bgTiles`, or a `bgLibrary` entry) and
// the one the band indexes (`bgOverride.doc.tiles`) — and nothing relates them;
// a band command renumbers the second and never the first. On the live tree
// they hold the SAME ART AT DIFFERENT INDICES, which is the worst possible shape
// for an index-keyed overlay: it would paint real art, from the right file, at
// the wrong cells, and look entirely plausible. See
// docs/reviews/2026-08-26-bganim-preview-blob-divergence.md.
//
// So every band is licensed individually, by the consumer contract's own
// `prefixIdentity` (`phases[0] == tiles[slot_base : slot_base + cols*rows]`)
// checked against the DISPLAYED blob. Pass and the band previews; fail and it
// does not, with the reason carried out to the author rather than logged.
//
// ═══ THE COST SHAPE ═══
//
// `prepare` is the expensive half (a layout scan) and runs on document /
// background / palette change, never on a step. A step change rebuilds the
// overlay buffer with ONE putImageData; a repaint that did not change the step
// (a pan, an object drag) reuses the buffer and costs one drawImage. That is
// what keeps the ruling's promise that the band blit is a smaller shape of work
// than the Tile Grid pass it was priced against.

import type { PaletteLine, Tile } from '../../core/model/s4-types';
import { unpackNametableWord } from '../../core/model/s4-types';
import { TileRenderer } from './TileRenderer';
import { composeBandOverlay, type BandOverlayCell, type BandOverlayPhase } from './bganim-compose';
import {
  bandPreviewStates, bandRestArtMismatch, bandStepKey,
  type BandDriverInputs, type BandPreviewState,
} from '../../core/formats/bg-override/bganim-preview';
import { TILE_PIXELS, type BgOverrideBand } from '../../core/formats/bg-override/bg-override';
import type { SectionViewport } from './SectionRenderer';

/** Everything the preview reads. All of it already resolved by the caller. */
export interface BgAnimPreviewSource {
  /** `documentBands(doc)` — the bands, in list order. */
  bands: readonly BgOverrideBand[];
  /** The nametable the viewport is painting, in blob-local tile indices. */
  nametable: Uint16Array;
  /** The plane's size in cells. */
  widthTiles: number;
  heightTiles: number;
  /** The blob the viewport is painting — the one a slot index means. */
  blobTiles: readonly Tile[];
  paletteLines: readonly PaletteLine[];
}

/** One band's preview verdict, for the author-facing note. */
export interface BandPreviewVerdict {
  index: number;
  driver: string;
  rateShift: number;
  /** How many background cells draw this band's slots. Zero is a real answer. */
  cells: number;
  /** Null when the band previews; otherwise why it does not. */
  refusal: string | null;
}

/**
 * A band that passed its licence check, held BY REFERENCE.
 *
 * Not a field-by-field copy: `driver` and `rate_shift` are OPTIONAL keys whose
 * absence means "the consumer's default applies", and a copy would have to
 * choose between resolving them (a second defaulting site that can drift from
 * `bganim-preview.ts`'s) and carrying `undefined` through a shape that does not
 * admit it. Keeping the document's own object means the one resolution site
 * stays the only one.
 */
interface PreparedBand {
  band: BgOverrideBand;
}

/** Pack a (band, bank, slot, palette) memo key without allocating a string. */
function artKey(band: number, bank: number, slot: number, palette: number): number {
  return ((band * 16 + bank) * 4096 + slot) * 4 + palette;
}

export class BgAnimPreviewRenderer {
  private prepared: PreparedBand[] = [];
  private cells: BandOverlayCell[] = [];
  private verdicts: BandPreviewVerdict[] = [];
  private paletteLines: readonly PaletteLine[] = [];
  private signature = '';
  private widthTiles = 0;
  private heightTiles = 0;

  private tiles = new TileRenderer();
  private art = new Map<number, Uint8ClampedArray | null>();

  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private scratch: { data: Uint8ClampedArray; image: ImageData } | null = null;
  /** The step key the overlay buffer currently holds, or '' for "nothing drawn". */
  private drawnKey = '';

  /**
   * Rebuild the derived state. Cheap and idempotent when `signature` has not
   * moved, so the draw pass may call it unconditionally.
   *
   * `signature` is the caller's: MapViewport composes it from the identities it
   * knows change the answer (the band list, the resolved background, the
   * palette, and the edit clocks). Deriving it here from object identity alone
   * would miss an in-place palette edit, which changes every pixel and no
   * reference.
   */
  prepare(source: BgAnimPreviewSource, signature: string): void {
    if (signature === this.signature) return;
    this.signature = signature;
    this.paletteLines = source.paletteLines;
    this.widthTiles = source.widthTiles;
    this.heightTiles = source.heightTiles;
    this.prepared = [];
    this.cells = [];
    this.verdicts = [];
    this.art.clear();
    this.drawnKey = '';

    // Slot bases are walked, exactly as the codec and the consumer walk them.
    const drawable = new Map<number, { band: number; slotBase: number }>();
    let slotBase = 0;
    for (let i = 0; i < source.bands.length; i++) {
      const band = source.bands[i];
      const n = band.cols * band.rows;
      const refusal = bandRestArtMismatch(band, slotBase, source.blobTiles);
      const index = this.prepared.length;
      this.verdicts.push({
        index: i,
        driver: String(band.driver ?? ''),
        rateShift: Number(band.rate_shift ?? -1),
        cells: 0,
        refusal,
      });
      if (!refusal) {
        this.prepared.push({ band });
        for (let s = 0; s < n; s++) drawable.set(slotBase + s, { band: index, slotBase });
      }
      slotBase += n;
    }

    if (drawable.size > 0) {
      const nt = source.nametable;
      for (let cell = 0; cell < nt.length; cell++) {
        const word = nt[cell];
        // A layout word of exactly 0 renders VRAM tile 0 (blank); it does NOT
        // mean tiles[0]. The consumer's rebase carries the same escape, and the
        // plane composer next door skips it for the same reason.
        if (word === 0) continue;
        const unpacked = unpackNametableWord(word);
        const hit = drawable.get(unpacked.tileIndex);
        if (!hit) continue;
        this.cells.push({
          cell,
          band: hit.band,
          localSlot: unpacked.tileIndex - hit.slotBase,
          palette: unpacked.palette,
          hFlip: unpacked.hFlip,
          vFlip: unpacked.vFlip,
        });
      }
      // Report the cell counts against the DOCUMENT's band indices, so a band
      // that previews but draws nothing reads as "0 cells" rather than as an
      // absence — a band whose art no layout cell names is invisible in the ROM
      // too, and the author should be told, not left to wonder.
      const perBand = new Array<number>(this.prepared.length).fill(0);
      for (const c of this.cells) perBand[c.band]++;
      let p = 0;
      for (const v of this.verdicts) if (!v.refusal) v.cells = perBand[p++] ?? 0;
    }
  }

  /** Per-band verdicts for the author-facing note. Valid after `prepare`. */
  bandVerdicts(): readonly BandPreviewVerdict[] { return this.verdicts; }

  /** True when at least one band both previews and is actually drawn somewhere. */
  hasDrawableCells(): boolean { return this.cells.length > 0; }

  /**
   * The preview state of every DRAWABLE band at one instant. The clock's
   * repaint gate keys off this, so a refused band cannot keep a clock alive.
   */
  states(inputs: BandDriverInputs): BandPreviewState[] {
    // NOTE the slot bases these carry are the DRAWABLE bands' running cursor,
    // not the document's — a refused band is absent from this list. Nothing
    // here uses `slotBase` (the cell list already resolved it at prepare time),
    // and the alternative — feeding refused bands in so the walk lines up —
    // would let a band that cannot be previewed keep a clock running.
    return bandPreviewStates(this.prepared.map((p) => p.band), inputs);
  }

  /**
   * Does any drawable band's phase move with the wall clock?
   *
   * The gate on the whole clock. `camera_x`/`camera_y` bands are functions of
   * the pan and are clockless BY CONSTRUCTION — the draw effect already repaints
   * on a pan, so their phase is a pure function of state that pass already has.
   * Starting a rAF for them would spend the viewport's zero-idle-repaint property
   * to animate something that must not animate on time, and would teach the
   * author that `camera_y` means vertical motion. It does not.
   */
  hasTimerBand(inputs: BandDriverInputs): boolean {
    return this.states(inputs).some((s) => s.timeVarying);
  }

  /** The repaint key — what must change before a repaint is worth doing. */
  stepKey(inputs: BandDriverInputs): string { return bandStepKey(this.states(inputs)); }

  private bankArt(band: number, bank: number, slot: number, palette: number): Uint8ClampedArray | null {
    const key = artKey(band, bank, slot, palette);
    const hit = this.art.get(key);
    if (hit !== undefined) return hit;

    const prepared = this.prepared[band];
    const line = this.paletteLines[palette];
    const pixels = prepared?.band.phases?.[bank]?.[slot];
    let out: Uint8ClampedArray | null = null;
    if (line && Array.isArray(pixels) && pixels.length === TILE_PIXELS) {
      const tile: Tile = { pixels: Uint8Array.from(pixels) };
      out = this.tiles.renderTile(tile, line).data;
    }
    this.art.set(key, out);
    return out;
  }

  /**
   * Draw the overlay over an already-painted Plane B, under the same transform
   * `SectionRenderer.renderBg` used (the plane is drawn at world origin, so the
   * overlay is too).
   *
   * Rebuilds the buffer only when the step key moved. A repaint driven by
   * anything else — a pan at a fixed camera phase, an object drag — reuses it.
   */
  draw(ctx: CanvasRenderingContext2D, viewport: SectionViewport, inputs: BandDriverInputs): void {
    if (this.cells.length === 0) return;
    const pixelW = this.widthTiles * 8;
    const pixelH = this.heightTiles * 8;
    if (pixelW <= 0 || pixelH <= 0) return;

    if (!this.canvas || this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas = new OffscreenCanvas(pixelW, pixelH);
      this.ctx = this.canvas.getContext('2d');
      if (this.ctx) this.ctx.imageSmoothingEnabled = false;
      this.scratch = null;
      this.drawnKey = '';
    }
    if (!this.ctx) return;
    if (!this.scratch) {
      const data = new Uint8ClampedArray(pixelW * pixelH * 4);
      this.scratch = { data, image: new ImageData(data, pixelW, pixelH) };
      this.drawnKey = '';
    }

    const states = this.states(inputs);
    const key = bandStepKey(states);
    if (key !== this.drawnKey) {
      const phases: BandOverlayPhase[] = states.map((s) => ({
        cols: s.cols, rows: s.rows, bank: s.bank, coarseColumns: s.coarseColumns,
      }));
      composeBandOverlay(
        this.scratch.data, pixelW, pixelH, this.widthTiles, this.cells, phases,
        (band, bank, slot, palette) => this.bankArt(band, bank, slot, palette),
      );
      this.ctx.putImageData(this.scratch.image, 0, 0);
      this.drawnKey = key;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.translate(-viewport.x, -viewport.y);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}
