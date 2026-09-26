/**
 * ROADMAP row 222: a paste's `music`, held against aeon's OWN validator.
 *
 * test/fixtures/clips/aeon-outputs/paste-music.cases.json is aeon's
 * `clip_manifest.py validate --json` run on s2_ehz_cpz plus one pasted clip
 * (provenance and currency: its .provenance.json, held by
 * clip-tool-outputs.test.ts). Each case records the manifest aeon judged, and
 * the rows here hold withClip's own output to it, so the verdicts are about the
 * bytes the page writes:
 *
 *   * a second s2disasm EHZ clip as withClip writes it now (the zone's song
 *     copied) is ACCEPTED;
 *   * the same clip as withClip wrote it before row 222 (no music) is REFUSED
 *     by R3, naming the pasted clip and the two values;
 *   * a clip of a zone the act does not carry gets no music, and is ACCEPTED.
 *
 * Every expected id, rectangle, song and rule is read from the fixture or from
 * the vendored s2_ehz_cpz manifest, never typed here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseClipManifest, serializeClipManifest, suggestClipId, withClip, type NewClip,
} from '../../src/core/formats/donors/clip-manifest-doc';
import { readValidateJson } from '../../src/core/formats/donors/clip-validate-json';

type RawClip = Record<string, unknown> & {
  id: string; donor: string; zone: string;
  src_rect: NewClip['src']; dst_rect: NewClip['dst']; music?: string;
};
interface Case { exit: number; stdout: string; stderr: string; manifest: { clips: RawClip[] } & Record<string, unknown> }

const CASES = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/clips/aeon-outputs/paste-music.cases.json'), 'utf8')) as Record<string, Case>;
const BASE_TEXT = readFileSync(resolve(__dirname, '../fixtures/clips/s2_ehz_cpz.clips.json'), 'utf8');
const BASE = JSON.parse(BASE_TEXT) as { clips: RawClip[] };

/** The clip a case pasted, as the page hands it to withClip (no music: the page never chooses one). */
function pastedOf(c: Case): NewClip {
  const e = c.manifest.clips.at(-1)!;
  return { id: e.id, donor: e.donor, zone: e.zone, src: e.src_rect, dst: e.dst_rect };
}
/** What withClip writes for that paste into the vendored s2_ehz_cpz, as JSON. */
function written(c: Case): { clips: RawClip[] } & Record<string, unknown> {
  return JSON.parse(serializeClipManifest(withClip(parseClipManifest(BASE_TEXT), pastedOf(c))));
}

describe('the fixture is s2_ehz_cpz plus exactly one pasted clip', () => {
  it('holds the three cases, each the vendored manifest with one clip appended', () => {
    expect(Object.keys(CASES).sort()).toEqual(
      ['accept_paste_inherits_music', 'accept_paste_new_zone_no_music', 'refuse_r3_paste_pre222']);
    for (const [k, c] of Object.entries(CASES)) {
      const { clips, ...rest } = c.manifest;
      const { clips: baseClips, ...baseRest } = BASE;
      expect(rest, k).toEqual(baseRest);
      expect(clips.slice(0, -1), k).toEqual(baseClips);
      expect(clips.length, k).toBe(baseClips.length + 1);
    }
  });

  it('the EHZ paste uses the id the page suggests by default', () => {
    const e = CASES.accept_paste_inherits_music.manifest.clips.at(-1)!;
    expect(suggestClipId(parseClipManifest(BASE_TEXT), e.zone)).toBe(e.id);
  });
});

describe('what aeon accepted is exactly what withClip writes now', () => {
  for (const k of ['accept_paste_inherits_music', 'accept_paste_new_zone_no_music']) {
    it(`${k}: withClip's output IS the manifest aeon judged, and aeon ACCEPTED it`, () => {
      const c = CASES[k];
      expect(written(c)).toEqual(c.manifest);
      expect(c.exit).toBe(0);
      const v = readValidateJson(c.exit, c.stdout, c.stderr);
      expect(v).toEqual({ kind: 'accepted', warnings: JSON.parse(c.stdout).warnings });
    });
  }

  it('the accepted EHZ paste carries the song the act\'s EHZ clip names (anti-vacuous: it is not absent)', () => {
    const song = BASE.clips.find((x) => x.donor === 's2disasm' && x.zone === 'EHZ')!.music;
    expect(typeof song).toBe('string');
    expect(CASES.accept_paste_inherits_music.manifest.clips.at(-1)!.music).toBe(song);
  });

  it('the accepted new-zone paste carries no music, and its zone is not in the act', () => {
    const e = CASES.accept_paste_new_zone_no_music.manifest.clips.at(-1)!;
    expect('music' in e).toBe(false);
    expect(BASE.clips.some((x) => x.donor === e.donor && x.zone === e.zone)).toBe(false);
  });
});

describe('what aeon refused is what withClip wrote before row 222', () => {
  const c = CASES.refuse_r3_paste_pre222;

  it('the refused manifest is withClip\'s output with ONLY the pasted clip\'s music removed', () => {
    const now = written(c);
    const song = now.clips.at(-1)!.music;
    expect(typeof song).toBe('string');
    delete now.clips.at(-1)!.music;
    expect(now).toEqual(c.manifest);
  });

  it('aeon REFUSED it by R3, naming the pasted clip, the zone\'s clip and the two values', () => {
    const doc = JSON.parse(c.stdout);
    expect(c.exit).toBe(1);
    const v = readValidateJson(c.exit, c.stdout, c.stderr);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.refusals).toEqual(doc.refusals);
    const pasted = c.manifest.clips.at(-1)!;
    const zoneClip = BASE.clips.find((x) => x.donor === pasted.donor && x.zone === pasted.zone)!;
    expect(v.refusals.map((r) => r.rule)).toEqual(['R3']);
    expect(v.refusals[0].subjects).toEqual([{ kind: 'clip', index: c.manifest.clips.length - 1, id: pasted.id }]);
    expect(v.refusals[0].message).toContain(`'${zoneClip.id}' and '${pasted.id}'`);
    expect(v.refusals[0].message).toContain(`('${zoneClip.music}' vs None)`);
  });
});
