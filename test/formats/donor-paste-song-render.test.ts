/**
 * ROW 222's open half, RENDERED (react-dom/server, in node): the paste form's
 * song line before a paste, and the success summary repeating the same
 * sentence after it. The acts are aeon's vendored s2_ehz_cpz and the manifests
 * aeon judged (test/fixtures/clips/aeon-outputs/paste-music.cases.json); every
 * song, donor and zone is READ from them.
 *
 * What it does NOT hold: that the line is on screen in the running app (the CDP
 * donor-page harness, scratchpad/donor-page-harness.mjs), nor layout.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SongLine, outcomeView } from '../../src/renderer/components/donors/DonorPasteSection';
import { parseClipManifest } from '../../src/core/formats/donors/clip-manifest-doc';

type RawClip = { id: string; donor: string; zone: string; music?: string };
const CASES = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/clips/aeon-outputs/paste-music.cases.json'), 'utf8')) as
  Record<string, { manifest: { clips: RawClip[] } }>;
const BASE = parseClipManifest(readFileSync(resolve(__dirname, '../fixtures/clips/s2_ehz_cpz.clips.json'), 'utf8'));

const text = (html: string, attr: string) => new RegExp(`${attr}[^>]*>([^<]*)<`).exec(html)?.[1] ?? null;

describe('the paste form names the inherited song before the paste (row 222)', () => {
  it('the form line names the song aeon accepted on the pasted clip, and its donor and zone', () => {
    const judged = CASES.accept_paste_inherits_music.manifest.clips.at(-1)!;
    const html = renderToStaticMarkup(React.createElement(SongLine, { doc: BASE, donor: judged.donor, zone: judged.zone }));
    expect(text(html, 'data-donors-song')).toBe(`Song: ${judged.music} (from ${judged.donor} ${judged.zone})`);
  });

  it('the success summary repeats the sentence it was given, word for word', () => {
    const judged = CASES.accept_paste_inherits_music.manifest.clips.at(-1)!;
    const line = text(renderToStaticMarkup(React.createElement(SongLine, { doc: BASE, donor: judged.donor, zone: judged.zone })), 'data-donors-song')!;
    const html = renderToStaticMarkup(outcomeView({
      kind: 'pasted', clipId: judged.id, path: 'games/sonic4/data/clips/s2_ehz_cpz/clips.json', created: false, warnings: [], song: line,
    }));
    expect(text(html, 'data-donors-outcome-song')).toBe(line);
  });

  it('a zone new to the act: the form says none was inherited, with the reason, and offers no picker', () => {
    const judged = CASES.accept_paste_new_zone_no_music.manifest.clips.at(-1)!;
    const html = renderToStaticMarkup(React.createElement(SongLine, { doc: BASE, donor: judged.donor, zone: judged.zone }));
    expect({
      line: text(html, 'data-donors-song'),
      picker: /<(select|input|button)/.test(html),
    }).toEqual({ line: `Song: none inherited (this act has no ${judged.donor} ${judged.zone} clip yet)`, picker: false });
  });
});
