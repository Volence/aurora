// The bank strip on a band card — parcel I surface (b).
//
// Eight thumbnails, phase 0..7, each the band's `cols x rows` pattern at that
// step; click one to open that bank in the Art facet's pixel surface, where
// every stroke is a `set-bg-override-tiles` (bank 0 — it IS the static slots)
// or `set-bg-override-phases` (bank k) undo step. `Shift` REGENERATES banks
// 1..7 from the current phase 0 — a button you press again after each phase-0
// edit, not a one-time fill; its title says so.
//
// Everything decided here is decided in providers/bg-anim-art.ts: the labels,
// the raster, the command. This file lays them out.

import React, { useEffect, useRef } from 'react';
import { T, IconButton } from '../ui';
import { Row, Hint, CONTROL_INSET } from './column-layout';
import { lutForPaletteLine, type PaletteLut } from '../../../core/art/rasterize';
import type { Palette } from '../../../core/model/s4-types';
import {
  BGANIM_PHASE_BANKS, type BgOverrideBand, type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import {
  BANK_STRIP_HINT, BANK_THUMB_TITLE, SHIFT_BUTTON_LABEL, SHIFT_BUTTON_TITLE,
  bankThumbnail, bgPaletteLine,
} from '../../providers/bg-anim-art';

/** Thumbnail height on the card; width follows the band's aspect, capped to the row. */
const THUMB_H = 24;
const THUMB_MAX_W = 64;

function BankThumb({ band, bank, lut, selected, onClick, version }: {
  band: BgOverrideBand; bank: number; lut: PaletteLut; selected: boolean;
  onClick: () => void; version: string;
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { width, height, rgba } = bankThumbnail(band, bank, lut);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    // `version` is the redraw key: the band is mutated in place by the
    // writers, so the object identity cannot tell React the pixels moved.
  }, [band, bank, lut, version]);
  const scale = Math.min(THUMB_H / (band.rows * 8), THUMB_MAX_W / (band.cols * 8));
  return (
    <canvas ref={ref}
      data-bank={bank}
      title={BANK_THUMB_TITLE(bank)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: Math.max(8, Math.round(band.cols * 8 * scale)),
        height: Math.max(8, Math.round(band.rows * 8 * scale)),
        imageRendering: 'pixelated',
        border: `1px solid ${selected ? T.textHi : T.border}`,
        cursor: 'pointer',
        background: T.overlay,
      }} />
  );
}

export default function BandBankStrip({ doc, band, bandIndex, palette, openBank, selectedBank, onShift, version }: {
  doc: BgOverrideDocument;
  band: BgOverrideBand;
  bandIndex: number;
  palette: Palette | null;
  /** Which bank the Art facet currently has open for this band, if any. */
  selectedBank: number | null;
  openBank: (bank: number) => void;
  onShift: () => void;
  /** Redraw key — the history/live-edit clock the card already reads. */
  version: string;
}): React.ReactElement {
  const lut = palette ? lutForPaletteLine(palette, bgPaletteLine(doc)) : lutForPaletteLine({ lines: [] } as unknown as Palette, 0);
  return (
    <>
      <Hint under>{BANK_STRIP_HINT}</Hint>
      <div data-band-bank-strip={bandIndex}>
        <Row style={{ marginLeft: CONTROL_INSET, flexWrap: 'wrap', gap: T.s1, alignItems: 'center' }}>
          {Array.from({ length: BGANIM_PHASE_BANKS }, (_, k) => (
            <BankThumb key={k} band={band} bank={k} lut={lut} version={version}
              selected={selectedBank === k} onClick={() => openBank(k)} />
          ))}
          <span onClick={(e) => e.stopPropagation()} title={SHIFT_BUTTON_TITLE}>
            <IconButton icon={<span>{SHIFT_BUTTON_LABEL}</span>}
              label={`${SHIFT_BUTTON_LABEL}: regenerate banks 1–7`}
              onClick={onShift} />
          </span>
        </Row>
      </div>
    </>
  );
}
