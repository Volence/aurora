import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { actBindsBgOverride } from '../../src/core/formats/bg-override/bg-override-binding';
import { BG_OVERRIDE_CONSUMER_OUT_DIR } from '../../src/core/formats/bg-override/bg-override';

/**
 * WHICH ACT DOES THE PER-GAME BG OVERRIDE GOVERN?
 *
 * `editor_bg_override.json` is one file per game, and aeon's injector bakes it
 * into ONE act's generated data. The binding is a path both repos spell and
 * neither declares — so these rows are about the JOIN, and above all about the
 * direction it fails in: an act that does not match must keep its own
 * background, never inherit someone else's.
 *
 * NOTHING BELOW TYPES THE PATH. Every expectation is composed from
 * BG_OVERRIDE_CONSUMER_OUT_DIR, which is read out of the vendored contract, so a
 * re-vendoring that moved the directory would move these rows with it instead of
 * leaving them passing against a stale literal.
 */
describe('actBindsBgOverride', () => {
  const OUT = BG_OVERRIDE_CONSUMER_OUT_DIR;

  it('binds the act whose stripPath IS the consumer output directory', () => {
    expect(actBindsBgOverride({ stripPath: OUT })).toBe(true);
  });

  it('binds it through a trailing slash — project.json writes one, os.path.join does not', () => {
    expect(actBindsBgOverride({ stripPath: `${OUT}/` })).toBe(true);
    expect(actBindsBgOverride({ stripPath: `${OUT}//` })).toBe(true);
  });

  it('does NOT bind an act with no stripPath at all', () => {
    expect(actBindsBgOverride({ stripPath: null })).toBe(false);
    expect(actBindsBgOverride({ stripPath: '' })).toBe(false);
  });

  it('does NOT bind a sibling act in the same zone', () => {
    // The failure this row exists for: a second act would sit beside the first
    // under the same zone directory, and a prefix/substring comparison would
    // hand it a background it does not have.
    expect(actBindsBgOverride({ stripPath: `${OUT.replace(/act1$/, 'act2')}/` })).toBe(false);
  });

  it('does NOT bind a DEEPER directory under the bound one', () => {
    expect(actBindsBgOverride({ stripPath: `${OUT}/sub/` })).toBe(false);
  });

  it('does NOT bind a SHALLOWER directory that the bound one lives under', () => {
    expect(actBindsBgOverride({ stripPath: `${OUT.replace(/\/act1$/, '')}/` })).toBe(false);
  });

  it('does NOT bind another zone, another game, or a differently-cased path', () => {
    expect(actBindsBgOverride({ stripPath: OUT.replace('/ojz/', '/gfz/') })).toBe(false);
    expect(actBindsBgOverride({ stripPath: OUT.replace('sonic4', 'demo') })).toBe(false);
    expect(actBindsBgOverride({ stripPath: OUT.toUpperCase() })).toBe(false);
  });

  /**
   * THE ROW THAT TOUCHES REALITY. Everything above is arithmetic on a string
   * this repo owns; this one reads the aeon tree's actual project.json and
   * asserts the join lands, so a rename on either side shows up as a failure
   * here rather than as a canvas that quietly stops painting what ships.
   *
   * SKIPS when the sibling tree is absent — a worktree, a lone clone, a packaged
   * build — and says so, rather than rendering "could not measure" as green.
   * Every discriminating row above runs without it.
   */
  const AEON_PROJECT = '/home/volence/sonic_hacks/aeon/project.json';
  let raw: string | null = null;
  try { raw = readFileSync(AEON_PROJECT, 'utf8'); } catch { raw = null; }
  const live = raw === null ? it.skip : it;
  live('joins the LIVE aeon project.json: exactly one act binds, and it is ojz/act1', () => {
    const cfg = JSON.parse(raw as string) as {
      zones: { id: string; acts: { id: string; stripPath?: string }[] }[];
    };
    const bound = cfg.zones.flatMap((z) =>
      z.acts.filter((a) => actBindsBgOverride({ stripPath: a.stripPath ?? null }))
        .map((a) => `${z.id}/${a.id}`));
    expect(bound).toEqual(['ojz/act1']);
    // Anti-vacuous: the instrument really did look at more than nothing.
    const all = cfg.zones.flatMap((z) => z.acts);
    expect(all.length).toBeGreaterThan(0);
  });
});
