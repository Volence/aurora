/**
 * ROADMAP row 222's open half: the paste names the song it inherits, BEFORE the
 * paste (one line on the form) and in its success summary (the same sentence).
 * The look call (overseer, 2026-09-28): `Song: <name> (from <donor> <zone>)`
 * when every clip of that pair names the same song, else `Song: none
 * inherited` with the reason. No picker.
 *
 * Driven by aeon's own judged manifests (test/fixtures/clips/aeon-outputs/
 * paste-music.cases.json, provenance beside it, currency held by
 * clip-tool-outputs.test.ts) and the vendored s2_ehz_cpz / s2_two_clip
 * manifests. Every song, donor and zone expected here is READ from them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseClipManifest, serializeClipManifest, withClip, zoneSong, zoneSongLine, type NewClip,
} from '../../src/core/formats/donors/clip-manifest-doc';

type RawClip = { id: string; donor: string; zone: string; src_rect: NewClip['src']; dst_rect: NewClip['dst']; music?: string };
interface Case { exit: number; stdout: string; manifest: { clips: RawClip[] } & Record<string, unknown> }
const CASES = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/clips/aeon-outputs/paste-music.cases.json'), 'utf8')) as Record<string, Case>;
const FIX = (name: string) => readFileSync(resolve(__dirname, `../fixtures/clips/${name}.clips.json`), 'utf8');
const BASE_TEXT = FIX('s2_ehz_cpz');

const pastedOf = (c: Case): NewClip => {
  const e = c.manifest.clips.at(-1)!;
  return { id: e.id, donor: e.donor, zone: e.zone, src: e.src_rect, dst: e.dst_rect };
};
const lineFor = (text: string, donor: string, zone: string) => zoneSongLine(zoneSong(parseClipManifest(text), donor, zone));

describe('the song line a paste shows (row 222)', () => {
  it('a zone the act gives one song: names the song aeon ACCEPTED on the pasted clip, and where it comes from', () => {
    const c = CASES.accept_paste_inherits_music;
    const judged = c.manifest.clips.at(-1)!;
    // Anti-vacuous: aeon accepted it, and the clip it judged carries a song.
    expect({ exit: c.exit, song: typeof judged.music }).toEqual({ exit: 0, song: 'string' });
    expect(lineFor(BASE_TEXT, judged.donor, judged.zone)).toBe(`Song: ${judged.music} (from ${judged.donor} ${judged.zone})`);
  });

  it('the line and what withClip writes never disagree, over every case aeon judged', () => {
    const got = Object.values(CASES).map((c) => {
      const p = pastedOf(c);
      const s = zoneSong(parseClipManifest(BASE_TEXT), p.donor, p.zone);
      const w = JSON.parse(serializeClipManifest(withClip(parseClipManifest(BASE_TEXT), p))).clips.at(-1) as RawClip;
      return { line: s.kind === 'inherited' ? s.song : null, written: w.music ?? null };
    });
    // Anti-vacuous: the cases hold both an inherited song and none.
    expect(new Set(got.map((g) => g.written === null)).size).toBe(2);
    expect(got.map((g) => g.line)).toEqual(got.map((g) => g.written));
  });

  it('a zone new to the act: none inherited, because the act has no clip of that pair (aeon accepted it songless)', () => {
    const c = CASES.accept_paste_new_zone_no_music;
    const p = pastedOf(c);
    expect({ exit: c.exit, music: 'music' in c.manifest.clips.at(-1)! }).toEqual({ exit: 0, music: false });
    expect(lineFor(BASE_TEXT, p.donor, p.zone)).toBe(`Song: none inherited (this act has no ${p.donor} ${p.zone} clip yet)`);
  });

  it('a zone whose clips name no song (s2_two_clip\'s EHZ): none inherited, and says the clips name none', () => {
    const ehz = (JSON.parse(FIX('s2_two_clip')).clips as RawClip[]).find((c) => c.zone === 'EHZ')!;
    expect('music' in ehz).toBe(false);
    expect(lineFor(FIX('s2_two_clip'), ehz.donor, ehz.zone)).toBe(`Song: none inherited (the act's ${ehz.donor} ${ehz.zone} clips name no song)`);
  });

  it('a zone whose clips disagree (the manifest aeon REFUSED under R3): none inherited, naming both values', () => {
    const c = CASES.refuse_r3_paste_pre222;
    const rule = JSON.parse(c.stdout).refusals[0].rule as string;
    const p = pastedOf(c);
    const songs = [...new Set(c.manifest.clips.filter((k) => k.donor === p.donor && k.zone === p.zone).map((k) => k.music ?? 'no song'))];
    expect({ rule, n: songs.length }).toEqual({ rule: 'R3', n: 2 });
    expect(lineFor(JSON.stringify(c.manifest), p.donor, p.zone))
      .toBe(`Song: none inherited (the act's ${p.donor} ${p.zone} clips disagree: ${songs.join(', ')})`);
  });

  it('no line carries an em dash (the owner\'s rule), over every pair in every manifest here', () => {
    const texts = [BASE_TEXT, FIX('s2_two_clip'), FIX('s2_two_clip_pins'), ...Object.values(CASES).map((c) => JSON.stringify(c.manifest))];
    const lines: string[] = [];
    for (const t of texts) {
      const doc = parseClipManifest(t);
      for (const donor of ['s2disasm', 'other']) for (const zone of ['EHZ', 'CPZ', 'OOZ']) lines.push(zoneSongLine(zoneSong(doc, donor, zone)));
    }
    expect(lines.length).toBe(texts.length * 6);
    expect(lines.filter((l) => l.includes('—'))).toEqual([]);
  });
});
