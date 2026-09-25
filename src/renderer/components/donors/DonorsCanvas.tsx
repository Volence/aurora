// The Donors facet's canvas: the open donor zone on top, the target clip act
// underneath (the paste half; see DonorTargetPane).
//
// The donor zone is composed ONCE per open, section by section, into bitmaps
// (donor-compose.ts, canvas-free), and the pane scales them. Nothing here
// reads or writes the project's act: a donor zone is not the open act, which is
// why this facet swaps the canvas instead of lensing MapViewport.

import React from 'react';
import { T } from '../ui/theme';
import ZonePane, { type PaneBitmap } from './ZonePane';
import { useDonorStore } from '../../state/donorStore';
import { useProjectStore } from '../../state/projectStore';
import { composeWindow, drawnPixels, rgbaLines, tileRgbaLookup } from '../../canvas/donor-compose';
import type { DonorZone } from '../../../core/formats/donors/donor-tree';
import { marqueeRect } from '../../../core/formats/donors/donor-marquee';
import DonorTargetPane from './DonorTargetPane';

/** What the last donor composition drew, per section, for the debug hooks. */
export interface DonorComposeReport { zone: string; sections: Array<{ n: number; drawnPixels: number }> }
let lastCompose: DonorComposeReport | null = null;
export function lastDonorComposeReport(): DonorComposeReport | null { return lastCompose; }

async function composeZone(z: DonorZone, line0: Uint8Array | null): Promise<PaneBitmap[]> {
  const lookup = tileRgbaLookup(z.tiles, rgbaLines(z.palette, z.manifest.paletteFirstLine, line0));
  const st = z.manifest.sectionTiles;
  const px = z.manifest.sectionPx;
  const out: PaneBitmap[] = [];
  const report: DonorComposeReport = { zone: `${z.manifest.donor}/${z.manifest.zone}`, sections: [] };
  for (let sy = 0; sy < z.manifest.gridH; sy++) {
    for (let sx = 0; sx < z.manifest.gridW; sx++) {
      const rgba = composeWindow(z.words, z.cols, { c0: sx * st, r0: sy * st, w: st, h: st }, [lookup]);
      report.sections.push({ n: sy * z.manifest.gridW + sx, drawnPixels: drawnPixels(rgba) });
      const bitmap = await createImageBitmap(new ImageData(rgba, px, px));
      out.push({ x: sx * px, y: sy * px, size: px, bitmap });
    }
  }
  lastCompose = report;
  return out;
}

export default function DonorsCanvas(): React.ReactElement {
  const root = useProjectStore((s) => s.config?.basePath ?? null);
  const zone = useDonorStore((s) => s.zone);
  const line0 = useDonorStore((s) => s.line0);
  const marquee = useDonorStore((s) => s.marquee);
  const listing = useDonorStore((s) => s.listing);
  const zoneError = useDonorStore((s) => s.zoneError);
  const loadingZone = useDonorStore((s) => s.loadingZone);
  const [bitmaps, setBitmaps] = React.useState<PaneBitmap[]>([]);

  React.useEffect(() => {
    if (root) void useDonorStore.getState().refresh(root);
  }, [root]);

  React.useEffect(() => {
    let live = true;
    setBitmaps([]);
    if (zone) {
      void composeZone(zone, line0).then((b) => { if (live) setBitmaps(b); });
    }
    return () => { live = false; };
  }, [zone, line0]);

  const outlines = React.useMemo(
    () => (marquee ? [{ rect: marquee, tone: 'accent' as const }] : []),
    [marquee],
  );

  const onDrag = React.useCallback((a: { x: number; y: number }, b: { x: number; y: number }) => {
    const z = useDonorStore.getState().zone;
    if (!z) return;
    useDonorStore.getState().setMarquee(marqueeRect(a, b, z.manifest.cropPx));
  }, []);

  const message = !root ? 'No aeon project is open.'
    : zoneError ? `Aurora could not read this donor zone: ${zoneError}`
      : loadingZone ? 'Reading the donor zone...'
        : !zone ? (listing?.state === 'present' ? 'Pick a donor zone in the panel on the right.'
          : 'No converted donor zone to show. The panel on the right says how to make one.')
          : null;

  return (
    <div data-donors-canvas style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div style={{ flex: 3, minHeight: 0, display: 'flex', position: 'relative' }}>
        {zone ? (
          <ZonePane pane="donor" worldW={zone.cols * 8} worldH={zone.rows * 8} bitmaps={bitmaps}
                    crop={zone.manifest.cropPx} fitTo={zone.manifest.cropPx} outlines={outlines}
                    onDrag={onDrag} />
        ) : (
          <div data-donors-message style={{ margin: 'auto', color: T.textLo, fontSize: T.tSm, padding: T.s4 }}>
            {message}
          </div>
        )}
      </div>
      <div style={{ height: 1, background: T.border }} />
      <div style={{ flex: 2, minHeight: 0, display: 'flex', position: 'relative' }}>
        <DonorTargetPane />
      </div>
    </div>
  );
}
