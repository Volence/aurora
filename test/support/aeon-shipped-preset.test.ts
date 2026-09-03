/**
 * READING A PEER'S SHIPPED DOCUMENT — THE SEAM, AND THE FIVE HARNESSES ON IT.
 *
 * Five harnesses in `scratchpad/` key off `authored_probe`, a preset id that
 * belongs to AEON. All five read it ON PURPOSE — a round trip over a document
 * Aurora itself authored proves only that Aurora agrees with Aurora — and that
 * is the technique, not the defect.
 *
 * THE DEFECT WAS HOW THE READ WAS SPELLED. Four of the five hunted the id
 * THROUGH THE RUNNING APP (`presets().some(p => p.id === 'authored_probe')`,
 * `[...select.options].includes('authored_probe')`). Aeon has BOOKED a rename
 * of that id — their `docs/DEFERRED_WORK.md`, entry "PRESET-ID NAMESPACE
 * COLLISION", booked 2026-09-03, their `ddaab282`; it is a parcel because the
 * id is bound into their generated `effects_scenes.emp`, two `.raster_table`
 * rows and five of their tools. Under the old spelling their rename would have
 * surfaced here as "the select did not offer the option", hundreds of lines into
 * an Electron run, in a repo with an empty diff — a failure LATER and SOMEWHERE
 * ELSE, pointing at Aurora's code instead of at the rename. They offered to warn
 * this lane before pushing. The answer given was: do not let Aurora's harnesses
 * become the reason aeon cannot rename aeon's own files.
 *
 * WHAT THIS FILE IS FOR, in three parts:
 *
 *   §1 THE MODULE. `scratchpad/lib/aeon-shipped-preset.mjs` reads the document
 *      by path and refuses — naming the ABSOLUTE PATH — when it is absent,
 *      unparseable, id-less, or when its `id` disagrees with its own filename
 *      (a HALF-LANDED rename, which is a document that no longer means what its
 *      name says). Every refusal is exercised here, because a refusal nobody
 *      has seen fire is a comment.
 *
 *   §2 THE COUPLING. A helper the harnesses stop calling is a helper that
 *      protects nothing. §2 reads the five harness sources and asserts each one
 *      reaches its id through this module and carries no bare literal in code.
 *      This is the row that makes the fix survive the next person to edit one of
 *      those files, and it is DERIVED from the harness list plus the sources —
 *      no expectation is typed twice.
 *
 *   §3 THE SEAM ITSELF, against aeon AT A COMMITTED REVISION (never their
 *      working tree — `test/support/peer-repo.ts` for why). This is the row that
 *      goes red on the day aeon lands the rename, IN THIS REPO, NAMING THE PATH.
 *      That is the whole promise. It SKIPS LOUDLY, never passes, when aeon is
 *      not beside this checkout or the revision does not resolve.
 *
 * Nothing here writes to a peer checkout, and nothing here launches an app.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  AEON_PRESET_DIR_REL,
  AEON_SHIPPED_PRESET_FILE,
  shippedPresetPath,
  readAeonShippedPreset,
  shippedPresetId,
  reQuote,
} from '../../scratchpad/lib/aeon-shipped-preset.mjs';
import { peerRepo, resolveRev, readAtRev } from './peer-repo';

const REPO = resolve(__dirname, '../..');

/** A throwaway aeon-shaped project root holding `files` under the preset dir. */
function bed(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'aurora-shipped-preset-'));
  const dir = join(root, AEON_PRESET_DIR_REL);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return root;
}

/** aeon's document, in the canonical shape their writer emits. */
const GOOD = JSON.stringify({
  bands: [
    { bot: 156, on: { cram: { addr: 74, colours: [14] } }, sh: false, top: 112 },
    { bot: 216, on: { cram: { addr: 74, colours: [3584] } }, sh: false, top: 172 },
  ],
  id: 'authored_probe',
  name: 'Authored probe (red / blue)',
  schema: 1,
}, null, 2) + '\n';

describe('§1 the module refuses, and every refusal names the path', () => {
  it('reads the document and reports its id, band count and bytes', () => {
    const root = bed({ [AEON_SHIPPED_PRESET_FILE]: GOOD });
    try {
      const got = readAeonShippedPreset(root);
      expect(got.id).toBe('authored_probe');
      expect(got.bands).toBe(2);
      expect(got.name).toBe('Authored probe (red / blue)');
      expect(got.text).toBe(GOOD);
      expect(got.path).toBe(shippedPresetPath(root));
      expect(shippedPresetId(root)).toBe('authored_probe');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('ABSENT — throws, and the message carries the ABSOLUTE PATH and the booking', () => {
    const root = bed({});
    try {
      const path = shippedPresetPath(root);
      let msg = '';
      try { readAeonShippedPreset(root); } catch (e) { msg = (e as Error).message; }
      expect(msg, 'a missing shipped document must THROW, not return').not.toBe('');
      expect(msg).toContain(path);
      expect(msg).toContain('DEFERRED_WORK.md');
      // The reader must be told what to do, not just that something is wrong.
      expect(msg).toContain('PRESET_ID');
      // And must NOT be told to put the file back in aeon's tree.
      expect(msg).toMatch(/DO NOT re-create/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('HALF-LANDED RENAME — the file moved and the `id` inside did not', () => {
    const root = bed({ [AEON_SHIPPED_PRESET_FILE]: JSON.stringify({ id: 'aeon_authored_probe', bands: [] }) });
    try {
      let msg = '';
      try { readAeonShippedPreset(root); } catch (e) { msg = (e as Error).message; }
      expect(msg).toContain(shippedPresetPath(root));
      expect(msg).toContain('"authored_probe"');
      expect(msg).toContain('"aeon_authored_probe"');
      expect(msg).toContain('HALF-LANDED RENAME');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('NOT JSON, and NO id — both refuse naming the path', () => {
    const bad = bed({ [AEON_SHIPPED_PRESET_FILE]: '{ this is not json' });
    const idless = bed({ [AEON_SHIPPED_PRESET_FILE]: JSON.stringify({ bands: [], name: 'x' }) });
    const arr = bed({ [AEON_SHIPPED_PRESET_FILE]: '[]' });
    try {
      expect(() => readAeonShippedPreset(bad)).toThrow(/NOT JSON/);
      expect(() => readAeonShippedPreset(bad)).toThrow(new RegExp(reQuote(shippedPresetPath(bad))));
      expect(() => readAeonShippedPreset(idless)).toThrow(/CARRIES NO id/);
      expect(() => readAeonShippedPreset(idless)).toThrow(new RegExp(reQuote(shippedPresetPath(idless))));
      expect(() => readAeonShippedPreset(arr)).toThrow(/NOT AN OBJECT/);
    } finally {
      for (const r of [bad, idless, arr]) rmSync(r, { recursive: true, force: true });
    }
  });

  it('refuses a root that is empty or relative — an unset AEON_DIR is not a path', () => {
    expect(() => shippedPresetPath('')).toThrow(/AEON_DIR/);
    expect(() => shippedPresetPath(undefined as unknown as string)).toThrow(/AEON_DIR/);
    expect(() => shippedPresetPath('games/sonic4')).toThrow(/ABSOLUTE/);
  });

  it('reQuote makes an id safe to embed in a pattern', () => {
    expect(new RegExp(`^${reQuote('a.b+c')}$`).test('a.b+c')).toBe(true);
    expect(new RegExp(`^${reQuote('a.b+c')}$`).test('axbbc')).toBe(false);
  });
});

/**
 * §2 THE COUPLING ROW. Five harnesses, named here because the population is the
 * finding; everything asserted about each one is READ OUT OF ITS SOURCE.
 *
 * ⚠ A comment may still say `authored_probe` — three of these files carry prose
 * quoting a panel string observed in a past run, and rewriting history to keep a
 * grep quiet is worse than the grep. So the literal is hunted in CODE only:
 * lines whose trimmed form does not open with `//`, `*` or `/*`.
 */
describe('§2 all five harnesses reach the id through the module, not through a literal', () => {
  const HARNESSES = [
    'scratchpad/save-file-count-harness.mjs',
    'scratchpad/section-raster-select-harness.mjs',
    'scratchpad/effects-refusal-harness.mjs',
    'scratchpad/variant-cycle-harness.mjs',
    'scratchpad/band-preset-harness.mjs',
  ];
  const ID = AEON_SHIPPED_PRESET_FILE.replace(/\.json$/, '');

  /** Source with comment lines removed — see the note above. */
  function codeLines(rel: string): string[] {
    const text = readFileSync(join(REPO, rel), 'utf8');
    expect(text.length, `${rel} is EMPTY — this row cannot measure anything`).toBeGreaterThan(1000);
    return text.split('\n').filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
  }

  it.each(HARNESSES)('%s imports the module', (rel) => {
    const code = codeLines(rel).join('\n');
    expect(code).toMatch(/from '\.\/lib\/aeon-shipped-preset\.mjs'/);
    expect(code).toMatch(/readAeonShippedPreset\(/);
  });

  it.each(HARNESSES)(`%s carries no bare \`${ID}\` literal in code`, (rel) => {
    const offenders = codeLines(rel).filter((l) => l.includes(ID));
    expect(offenders, `${rel} still types the peer's id in code: ${JSON.stringify(offenders)}`)
      .toEqual([]);
  });

  it('the module is the ONE place the filename is written down', () => {
    const mod = readFileSync(join(REPO, 'scratchpad/lib/aeon-shipped-preset.mjs'), 'utf8');
    expect(mod).toContain(`export const AEON_SHIPPED_PRESET_FILE = '${AEON_SHIPPED_PRESET_FILE}';`);
    expect(AEON_SHIPPED_PRESET_FILE).toMatch(/^[a-z][a-z0-9_]{0,31}\.json$/);
  });

  /**
   * ANTI-VACUOUS FLOOR for both rows above. If the harness list ever stops
   * pointing at real files, or the literal stops appearing anywhere in the
   * repo, the two rows above go green over nothing.
   */
  it('ANTI-VACUOUS: the population is five real files, and the id is a real string somewhere', () => {
    expect(HARNESSES).toHaveLength(5);
    for (const rel of HARNESSES) expect(codeLines(rel).length).toBeGreaterThan(100);
    expect(readFileSync(join(REPO, 'scratchpad/lib/aeon-shipped-preset.mjs'), 'utf8')).toContain(ID);
  });
});

/**
 * §3 THE SEAM. Measured against aeon at a COMMITTED REVISION.
 *
 * This is the row the promise to the aeon lane is made of: the day they land the
 * booked rename, THIS goes red, in THIS repo, naming the path — instead of five
 * Electron harnesses failing at row [1b] with an empty diff.
 */
describe('§3 aeon still ships the document these harnesses read', () => {
  const TIP = 'origin/master';
  const aeon = peerRepo('aeon');
  const PATH = `${AEON_PRESET_DIR_REL}/${AEON_SHIPPED_PRESET_FILE}`;

  it(`aeon ${TIP}: ${PATH} exists, and its \`id\` matches its filename`, (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) — CANNOT '
        + `MEASURE whether aeon still ships ${PATH}`);
      return;
    }
    if (resolveRev(aeon, TIP) === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} (unfetched? shallow?) — `
        + `CANNOT MEASURE whether aeon still ships ${PATH}`);
      return;
    }
    const at = readAtRev(aeon, TIP, PATH);
    // NOT a skip. The revision resolved, so this WAS measured, and the document
    // being gone is precisely the booked rename landing.
    expect(at.ok, at.ok ? '' :
      `${at.why}\n\n  AEON HAS LANDED THE RENAME (or moved the file). This is the seam, and it `
      + `fired where it was meant to.\n  Update AEON_SHIPPED_PRESET_FILE in `
      + `scratchpad/lib/aeon-shipped-preset.mjs to their new document, re-run the five `
      + `harnesses that read it\n  (save-file-count, section-raster-select, effects-refusal, `
      + `variant-cycle, band-preset), and do NOT re-create the old file in their tree.`)
      .toBe(true);
    if (!at.ok) return;
    const doc = JSON.parse(at.text) as { id?: string; bands?: unknown[] };
    expect(doc.id).toBe(AEON_SHIPPED_PRESET_FILE.replace(/\.json$/, ''));
    // The harnesses that assert a band count derive it from this document; a
    // band-less one would make band-preset's row [1b] vacuous, and its own
    // import-time guard refuses it. Stated here too so the reason is in one place.
    expect(Array.isArray(doc.bands) && doc.bands.length >= 1,
      `${PATH} at aeon ${TIP} carries no bands — band-preset's row [1b] would be vacuous`)
      .toBe(true);
  });
});
