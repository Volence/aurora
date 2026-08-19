// src/renderer/state/__tests__/import-sheet.test.ts
//
// The dialog wrapper only. The decode/map/refuse logic is core and tested in
// core/art/__tests__/sheet-import.test.ts — this asserts the SPLIT: that the
// wrapper reports cancellation, and that a refusal arrives as the artist's
// sentence rather than as a bare kind.
//
// A read failure and a decode failure both land in loadSheetForAct's one catch,
// but they must not carry the same wording: the "needs an INDEXED PNG" suffix
// is scoped inside sheetFromBytes, around the decode alone, so a read failure
// (moved file, permission denied) reports its own message instead of being
// mislabelled as an encoding problem it never got far enough to see.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSheetForAct } from '../import-sheet';
import { explainSheetRefusal, sheetRefusalResolution } from '../../../core/art/sheet-import';
import { encodeIndexedPngForTest } from '../../../core/art/__tests__/helpers/indexed-png-fixture';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { PngImportRefusal } from '../../../core/art/png-import';

const doc = { palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)) } as unknown as LevelDoc;

function fakeApi() {
  const api = {
    selectFile: vi.fn(),
    readBinaryFile: vi.fn(),
  };
  (globalThis as { window?: unknown }).window = { api };
  return api;
}

beforeEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('loadSheetForAct', () => {
  it('reports cancellation when no file is chosen', async () => {
    const api = fakeApi();
    api.selectFile.mockResolvedValue(null);
    expect(await loadSheetForAct(doc)).toEqual({ cancelled: true });
  });

  it('surfaces a decode failure as an error string, not a throw', async () => {
    const api = fakeApi();
    api.selectFile.mockResolvedValue('/tmp/x.png');
    api.readBinaryFile.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const res = await loadSheetForAct(doc);
    expect(res).toMatchObject({ ok: false });
    if ('error' in res) expect(res.error).toMatch(/INDEXED/);
  });

  // THE ARTIST READS WHAT THE AGENT READS (spec §4). The agent surface returns
  // `message` and `resolution` as two fields off the same two core functions;
  // the dialog renders one string, so it joins them. A dialog showing only the
  // message would leave the human with strictly less than the agent gets, out
  // of the same refusal.
  it('surfaces a refusal as the message AND its remedy, both from core', async () => {
    const api = fakeApi();
    api.selectFile.mockResolvedValue('/tmp/x.png');
    // An indexed PNG whose one drawn colour is not in the (all-black) act.
    api.readBinaryFile.mockResolvedValue(encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }],
      indices: new Uint8Array(64).fill(1),
    }).buffer);
    const res = await loadSheetForAct(doc);
    expect(res).toMatchObject({ ok: false });
    if (!('error' in res)) return;
    // The exact pair core would produce for this refusal, joined by one space —
    // not a loose substring match, so a dialog that quietly dropped either half
    // (or reworded one in place) fails here.
    const refusal: PngImportRefusal = { kind: 'colour-not-in-act', colours: [0x000e] };
    expect(res.error).toBe(`${explainSheetRefusal(refusal)} ${sheetRefusalResolution(refusal)}`);
  });

  it('surfaces a read failure with its own message, not the decode wording', async () => {
    const api = fakeApi();
    api.selectFile.mockResolvedValue('/tmp/x.png');
    api.readBinaryFile.mockRejectedValue(new Error('EACCES: permission denied'));
    const res = await loadSheetForAct(doc);
    expect(res).toMatchObject({ ok: false });
    if ('error' in res) {
      expect(res.error).toBe('EACCES: permission denied');
      expect(res.error).not.toMatch(/INDEXED/);
    }
  });
});
