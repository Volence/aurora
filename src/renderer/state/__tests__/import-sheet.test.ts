// src/renderer/state/__tests__/import-sheet.test.ts
//
// The dialog wrapper only. The decode/map/refuse logic is core and tested in
// core/art/__tests__/sheet-import.test.ts — this asserts the SPLIT: that the
// wrapper reports cancellation, and that a refusal arrives as the artist's
// sentence rather than as a bare kind.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSheetForAct } from '../import-sheet';
import type { LevelDoc } from '../../../core/level-classic/model';

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
});
