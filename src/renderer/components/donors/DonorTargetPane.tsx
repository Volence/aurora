// The target clip act, drawn FROM THE BYTES AEON'S BAKE COMPOSED.
//
// Not from the manifest: the manifest says which rectangle goes where, and the
// bake (tools/clip_act_bake.py) is what turns that into section files, both
// collision planes and the per-cell zone key. Drawing from its output means the
// pane shows what the ROM bake builds, and a mistake in how Aurora reads the
// manifest cannot make the picture agree with itself.
//
// Each cell is drawn through ITS zone's tileset and palette, chosen by
// `section_N.zonekey.bin` (-1 = VOID, drawn as nothing). A corridor's sheet is
// synthesised by the bake and carries no palette: its cells are on CRAM line 0,
// the character palette (clip_manifest.py CORRIDOR_PAL_LINE).
//
// A click places the paste (section-aligned, or on the 16-px collision quantum
// when the author has given a reason to leave the section grid).

import React from 'react';
import { T } from '../ui/theme';
import ZonePane, { type PaneBitmap } from './ZonePane';
import { useProjectStore } from '../../state/projectStore';
import { useDonorStore } from '../../state/donorStore';
import { usePasteStore, type BakedAct } from '../../state/donor-paste';
import { useDonorDraft } from '../../state/donor-draft';
import { createIpcFileAccess } from '../../state/classic-file-access';
import { composeWindow, drawnPixels, rgbaLines, tileRgbaLookup, type TileRgbaLookup } from '../../canvas/donor-compose';
import { parseNametable } from '../../../core/formats/s4-nametable';
import { parseTiles } from '../../../core/formats/tiles';
import { snapDestination } from '../../../core/formats/donors/clip-manifest-doc';
import { SECTION_PIXEL_SIZE, SECTION_TILES_WIDE } from '../../../core/model/s4-types';
import type { FileAccess } from '../../../core/project/adapter';

/** What the last target composition drew, per section, for the debug hooks. */
export interface TargetComposeReport { act: string; sections: Array<{ n: number; drawnPixels: number }> }
let lastTarget: TargetComposeReport | null = null;
export function lastTargetComposeReport(): TargetComposeReport | null { return lastTarget; }

interface ZoneRow { key: number; tree: string | null; tileset_file: string | null; synthesised: string | null }

async function lookupsFor(baked: BakedAct, fa: FileAccess, line0: Uint8Array | null): Promise<TileRgbaLookup[]> {
  const table = (Array.isArray(baked.clipact.zone_table) ? baked.clipact.zone_table : []) as ZoneRow[];
  const out: TileRgbaLookup[] = [];
  for (const z of table) {
    if (z.synthesised) {
      const sheet = baked.files['corridor_sheet.bin'];
      out[z.key] = tileRgbaLookup(sheet ? parseTiles(sheet) : [], rgbaLines(new Uint8Array(0), 1, line0));
      continue;
    }
    const tiles = z.tileset_file ? parseTiles(await fa.read(z.tileset_file)) : [];
    const palette = z.tree ? await fa.read(`${z.tree}/palette.bin`) : new Uint8Array(0);
    out[z.key] = tileRgbaLookup(tiles, rgbaLines(palette, 1, line0));
  }
  return out;
}

async function composeBaked(baked: BakedAct, gridW: number, gridH: number, lookups: TileRgbaLookup[], act: string): Promise<PaneBitmap[]> {
  const st = SECTION_TILES_WIDE;
  const out: PaneBitmap[] = [];
  const report: TargetComposeReport = { act, sections: [] };
  for (let n = 0; n < gridW * gridH; n++) {
    const tiles = baked.files[`section_${n}.tiles.bin`];
    const keys = baked.files[`section_${n}.zonekey.bin`];
    if (!tiles || !keys) continue;
    const words = parseNametable(tiles, st, st);
    const k = new Int8Array(keys.buffer, keys.byteOffset, keys.byteLength);
    const rgba = composeWindow(words, st, { c0: 0, r0: 0, w: st, h: st }, lookups, k);
    report.sections.push({ n, drawnPixels: drawnPixels(rgba) });
    // Held at a QUARTER of full size: an act can be 48 sections, and at 16 MB a
    // section the full-size bitmaps would be most of a gigabyte for a pane that
    // shows the whole act small. The drawn-pixel report above is taken from the
    // full-size composition, so the downscale cannot hide an empty section.
    const bitmap = await createImageBitmap(new ImageData(rgba, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE), {
      resizeWidth: SECTION_PIXEL_SIZE / 4, resizeHeight: SECTION_PIXEL_SIZE / 4, resizeQuality: 'pixelated',
    });
    const sy = Math.floor(n / gridW);
    const sx = n % gridW;
    out.push({ x: sx * SECTION_PIXEL_SIZE, y: sy * SECTION_PIXEL_SIZE, size: SECTION_PIXEL_SIZE, bitmap });
  }
  lastTarget = report;
  return out;
}

export default function DonorTargetPane(): React.ReactElement {
  const root = useProjectStore((s) => s.config?.basePath ?? null);
  const target = usePasteStore((s) => s.target);
  const baked = usePasteStore((s) => s.baked);
  const bakeNote = usePasteStore((s) => s.bakeNote);
  const line0 = useDonorStore((s) => s.line0);
  const marquee = useDonorStore((s) => s.marquee);
  const draft = useDonorDraft();
  const [bitmaps, setBitmaps] = React.useState<PaneBitmap[]>([]);
  const [drawError, setDrawError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setBitmaps([]);
    setDrawError(null);
    if (root && baked && target) {
      const fa = createIpcFileAccess(root);
      void lookupsFor(baked, fa, line0)
        .then((l) => composeBaked(baked, target.doc.gridW, target.doc.gridH, l, target.actId))
        .then((b) => { if (live) setBitmaps(b); })
        .catch((e: Error) => { if (live) setDrawError(e.message); });
    }
    return () => { live = false; };
  }, [root, baked, target, line0]);

  const outlines = React.useMemo(() => {
    const o: Array<{ rect: { x: number; y: number; w: number; h: number }; label?: string; tone?: 'accent' | 'warning' | 'faint' }> = [];
    for (const c of target?.doc.clips ?? []) o.push({ rect: c.dst, label: c.id, tone: 'faint' });
    for (const c of target?.doc.corridors ?? []) o.push({ rect: c.dst, label: c.id, tone: 'faint' });
    if (marquee && draft.dst) o.push({ rect: { x: draft.dst.x, y: draft.dst.y, w: marquee.w, h: marquee.h }, label: draft.clipId || undefined, tone: 'accent' });
    return o;
  }, [target, marquee, draft.dst, draft.clipId]);

  const onClickWorld = React.useCallback((p: { x: number; y: number }) => {
    const m = useDonorStore.getState().marquee;
    if (!m) return;
    const d = useDonorDraft.getState();
    d.setDst(snapDestination(p, m, d.mode));
  }, []);

  if (!target) {
    return (
      <div data-donors-target-message style={{ margin: 'auto', color: T.textLo, fontSize: T.tSm, padding: T.s4 }}>
        Choose or start a clip act in the panel to see where a paste goes.
      </div>
    );
  }
  const W = target.doc.gridW * SECTION_PIXEL_SIZE;
  const H = target.doc.gridH * SECTION_PIXEL_SIZE;
  const note = drawError ? `Aurora could not draw the composed act: ${drawError}`
    : bakeNote ?? (target.doc.clips.length === 0 ? `${target.actId} has no clips yet.` : null);
  return (
    <ZonePane pane="target" worldW={W} worldH={H} bitmaps={bitmaps} outlines={outlines} onClickWorld={onClickWorld}>
      {note && (
        <div data-donors-target-note style={{
          position: 'absolute', left: T.s2, bottom: T.s2, right: T.s2, color: T.textLo, fontSize: T.tXs,
          whiteSpace: 'pre-wrap', pointerEvents: 'none',
        }}>{note}</div>
      )}
    </ZonePane>
  );
}
