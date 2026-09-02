/**
 * The contract-leads-consumer lag on the raster preset document, as ONE fact
 * with ONE measurement behind it.
 *
 * ═══ WHAT THIS IS ═══
 *
 * The vendored schema (aurora-effects-preset.schema.json, empyrean 12aecd5)
 * DECLARES `cycles` and `variants` — DoD item 5's two keys, §7.2 — and Aurora
 * authors, validates, saves and re-reads both. aeon's generator does not read
 * them yet: at aeon origin/master, `tools/effects_gen.py` refuses both keys by
 * name, and `docs/EDITOR_RASTER_PRESETS.md`'s `preset-refused` row says so. So
 * a value an author sets under either key reaches the FILE and nothing further —
 * not the ROM, not an emulator, not a screen. That is the premise of the
 * sentence the band-preset panel shows above its cycle and variant controls
 * (`presetLagDisclosure`), and it is a fact about aeon, which this tree cannot
 * measure at run time.
 *
 * ═══ ONE SOURCE OF TRUTH, MEASURED IN ONE PLACE ═══
 *
 * `PRESET_KEYS_AWAITING_AEON` is the only hand-typed statement of the fact.
 * TWO readers, and only two:
 *
 *   1. `test/formats/effects-preset-schema-drift.test.ts`'s last row MEASURES it:
 *      it reads aeon's page at origin/master through git objects, computes the
 *      lag (the keys aeon refuses that the schema does not reserve), and asserts
 *      that lag equals THIS list. The test carries no copy of the names.
 *   2. `presetLagDisclosure` DERIVES the panel's sentence from it, and returns
 *      null — no sentence — when the list is empty.
 *
 * `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`
 * closes the loop from the other side: while this list is non-empty, the drift
 * test must still assert against it. Delete the measuring row without retiring
 * the premise and that test goes red, so the sentence cannot outlive the
 * measurement that justifies it (memory: a workaround outlives its defect;
 * a hold carries its date).
 *
 * ═══ EXPIRY (2026-09-02) ═══
 *
 * Ends when aeon lowers the keys — DoD item 5, aeon's lane, queued behind
 * aeon's chain 196 — which the drift row reports as `preset-refused` shrinking
 * to `fires`. The row goes red; the fix is to empty this list (or delete both
 * the list and the row together); the sentence retires by construction. Evaluate,
 * do not obey: re-measure with `git -C <aeon> show origin/master:docs/
 * EDITOR_RASTER_PRESETS.md`, never by path into a working tree.
 *
 * Owner of the sentence: Aurora (this file). Owner of the fact: aeon.
 */

/**
 * The preset keys the schema declares that aeon's generator does not lower yet,
 * sorted, as the drift row measures them. Empty means "no lag" and retires the
 * disclosure.
 */
export const PRESET_KEYS_AWAITING_AEON: readonly string[] = Object.freeze(['cycles', 'variants']);

/** The date the premise above was last measured — printed inside the sentence. */
export const PRESET_LAG_MEASURED_ON = '2026-09-02';

/** Where the measurement lives, named in the sentence so a reader can re-run it. */
export const PRESET_LAG_MEASUREMENT =
  'test/formats/effects-preset-schema-drift.test.ts (last row) against aeon ' +
  'docs/EDITOR_RASTER_PRESETS.md at origin/master';

/** The sentence's leading words — a harness finds the block by them. */
export const PRESET_LAG_LEAD = 'Not consumed by the engine yet.';

/**
 * The disclosure the panel renders above the cycle and variant controls, or
 * null when there is nothing to disclose.
 *
 * ═══ WHY IT IS DERIVED AND NOT WRITTEN ═══
 *
 * The sentence must retire the day the premise does. Writing it as a literal in
 * the panel would leave a second copy of the fact that nothing measures — the
 * O62/O64 class: a disclosure that stays on screen after it stops being true is
 * worse than none, because it teaches the author to ignore the panel's warnings.
 * Built from the list, an empty list yields no sentence, and the drift row is
 * the only thing that can empty it honestly.
 *
 * The date inside the sentence is the measurement's, not the sentence's: it
 * tells the reader how stale the claim COULD be, and where to look.
 */
export function presetLagDisclosure(keys: readonly string[] = PRESET_KEYS_AWAITING_AEON): string | null {
  if (keys.length === 0) return null;
  const one = keys.length === 1;
  const names = keys.map((k) => `\`${k}\``);
  const list = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${PRESET_LAG_LEAD} ${list} ${one ? 'is' : 'are'} authored here and saved to this ` +
    `preset file, and that is as far as ${one ? 'it goes' : 'they go'}: aeon's generator ` +
    `(tools/effects_gen.py) refuses ${one ? 'it' : 'both'} by name at origin/master, so nothing ` +
    `set below reaches a ROM, and no emulator has shown ${one ? 'it' : 'either'}. ` +
    `Measured ${PRESET_LAG_MEASURED_ON} by ${PRESET_LAG_MEASUREMENT}. ` +
    `Expires (${PRESET_LAG_MEASURED_ON}): the day that row goes red because aeon lowers ` +
    `${one ? 'the key' : 'the keys'} (DoD item 5, aeon's lane) — this sentence retires with the row.`;
}
