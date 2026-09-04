/**
 * The contract-leads-consumer lag on the raster preset document, as ONE fact
 * with ONE measurement behind it.
 *
 * ═══ THE LAG IS EMPTY. RETIRED (AGAIN) 2026-09-03 — ITEM 6'S STEP 4 HAS RUN. ═══
 *
 * THE FOURTH ARMING HAS RETIRED. empyrean `9233883` (AURORA_EFFECTS_SCHEMA.md
 * §7.4) declared EFFECTS-W1 DoD item 6's authoring key, `ramp`; Aurora vendored
 * it and wrote the codec (step 3, merge `3d76791d`); and AEON'S STEP 4 HAS NOW
 * RUN. Measured firsthand through git objects at aeon `origin/master`
 * `c7ee7075` ("lane-log: the plane swap and the ramp generator both land"), page
 * blob `5514719913f550b309f33e7d1ae22f08270a4b1b`:
 *
 *   - `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block now reads
 *     `preset: bands, cycles, id, patch_motion, patch_world_ys, ramp, schema,
 *     variants` — `ramp` IS THERE — and `preset-refused:` is `fires` alone.
 *
 * ⚠ THE PAGE IS THE ARTIFACT, NOT THE GENERATOR SOURCE. `PRESET_LAG_MEASUREMENT`
 * below names `docs/EDITOR_RASTER_PRESETS.md` at `origin/master`, and that is
 * what the drift row actually consults — the page's machine-checked block, which
 * aeon's own test compares against `tools/effects_gen.py`. A claim about
 * `effects_gen.py` is a claim about a DIFFERENT artifact than the one this file
 * measures, and the two must not be traded for one another in a report.
 *
 * ⚠ MERGED, AND NOW WITNESSED ON A PEER'S BRANCH — STILL NOT CERTIFIED, AND
 * STILL NOT BY AURORA (updated 2026-09-03). No row in THIS repository has
 * measured a ROM obeying `ramp`, and none claims to; what retired above is a
 * sentence about what aeon's page ACCEPTS. The ENGINE half of item 6 shipped
 * long ago (`RasterRampProgram` since 2026-08-14, gated and budgeted at aeon
 * `cf3dfb1a`), and the GENERATOR has now been taught the key. Since the wording
 * above was written, aeon has ALSO driven a running machine on this editor's own
 * `ramp` document — so "nothing has seen a ROM obey `ramp`" is no longer the
 * whole truth, and leaving it would have been technically true and misleading.
 * What is actually true today, measured here through git objects rather than
 * relayed:
 *
 *   ⚠ IT IS ON A BRANCH, NOT ON THEIR MASTER. aeon
 *   `origin/parcel/aurora-ramp-witness` `a1a76741`; `git merge-base
 *   --is-ancestor` says it is NOT an ancestor of aeon `origin/master`
 *   `ddaab282`. On aeon's MASTER none of what follows has happened yet, and a
 *   merge announcement is not a merge — check the ancestry, not the report.
 *
 *   - THE SIGN RULE IS CLOSED THERE, and it was closed BY this editor's
 *     document. `raster_ramp_program` never two's-complement encoded a NEGATIVE
 *     `start`/`step` into its `u32` image fields, so no ROM could hold a
 *     downward ramp at all — sigil refused the EMISSION (`[emit.out-of-range]
 *     -98304 does not fit u32`). Fixed at aeon `7a5d237d` with a two-directional
 *     zero-byte pin. `ramp-sign-lag.ts` measures aeon's MASTER and is therefore
 *     still correctly ARMED; it must not be retired on this branch's existence.
 *   - A MACHINE OBEYED THE DOCUMENT. `tools/ramp_authored_witness.py`, subject
 *     `aurora_local_rampctl_probe` (copied byte-for-byte from Aurora
 *     `b7e95791`): the 34-byte record decoded out of `s4.debug.bin` matches the
 *     document in every field, `rrp_step` = `$FFFE8000` = -98304 = the authored
 *     -1.5 px/line; and the picture differs from that same record with `rrp_step`
 *     ZEROED, which is a four-byte control. So the chain from a keystroke in this
 *     panel to a VSRAM write has been walked once, end to end.
 *   - WHAT THAT DOES *NOT* SAY: the on-screen SLOPE was never matched
 *     line-by-line against -1.5. The span arm deliberately uses step-0 twins, so
 *     it measures which lines the run REACHES, not the rate it applies to them.
 *   - IT IS EMULATION, NOT SILICON. ⚠ AND THE OLD SENTENCE HERE NAMED THE WRONG
 *     CORE: it read "oracle is Exodus-derived", which is true of **oracle-old**,
 *     the legacy C++ port. THE ORACLE that produced these readings is the
 *     ground-up RUST core. The distinction is now load-bearing — see the
 *     instrument paragraph below, where the two cores DISAGREE.
 *
 * ⚠ THE SPAN WAS CONTESTED BY EXACTLY ONE LINE, AND THE TWO READERS NOW AGREE
 * (empyrean `e9409dc`, 2026-09-03). ⚠ BUT "SETTLED" MEANT LESS THAN THIS BLOCK
 * ONCE CLAIMED, AND `bfc000e` (2026-09-04) SAYS SO IN THE CONTRACT ITSELF. What
 * closed is the disagreement between AURORA'S DERIVATION and AEON'S MEASUREMENT:
 * both now say `top + 2`. What did NOT close is whether `top + 2` is the
 * machine's answer:
 *
 *   - the number is AS READ ON **oracle's Rust core**;
 *   - oracle's LEGACY C++ core reads BOTH raster tiers one line earlier on the
 *     same ROM bytes, and is disqualified as a referee because it disagrees with
 *     ITSELF by 79-83 of 224 rows between two identical boots — NOT because it
 *     is known to be wrong here;
 *   - the landing line is UNPINNED in the Rust core's own recon;
 *   - NO HARDWARE REFEREE EXISTS on this project.
 *
 * A one-line difference between two scanline-granularity models can be a model
 * boundary with neither wrong about the VDP. So this paragraph's old "THE
 * MEASUREMENT WON" is kept as history and must not be read as a hardware fact.
 *
 * ⚠ AND THE COROLLARY THAT WAS WITHDRAWN WITH IT: *"the engine moved fire+1 ->
 * fire+2 on 2026-08-19"*. aeon's own two-core test refuted its own finding —
 * BOTH tiers shift by one line between the two cores on the same bytes. Do not
 * cite it.
 *
 * The history below is kept because the resolution is the interesting part and
 * because a reader who finds only the old caveat will "fix" the wrong side:
 *
 *   - Aurora derived first-displayed-line `top + 1` from the contract schema's
 *     own `top` sentence. aeon's arm 4 MEASURED `top + 2`, on two documents with
 *     different tops: `top 3` first rendered on line 5, and a control at
 *     `top 128` first rendered on line 130 — two tops, the same one-line
 *     disagreement.
 *   - AURORA CORRECTLY DID NOT PATCH ITS CONSTANT. The number is parsed from the
 *     contract on purpose, so the fix had to be a contract fix, and it was: the
 *     schema's `top` sentence now reads `top + 2`, its `ramp` description states
 *     the per-index rule as `top + j + 1` WITH `j` STARTING AT 1 (the
 *     interpreter adds the step before it writes, so `start` is never emitted),
 *     and Aurora re-vendored at `dce3a9b4`. aeon re-measured over 19 tops
 *     spanning 3..220 and 9 run lengths.
 *   - THE SENTENCE THAT WAS WRONG WAS THE CONTRACT'S, not this editor's
 *     derivation, and that is the whole argument for deriving rather than
 *     typing: the defect surfaced as a disagreement between two independent
 *     readers instead of hiding in a `+ 1` somebody had typed.
 *   - CONSEQUENCE, now the contract's own words: a run occupies screen lines
 *     `top + 2 .. top + lines + 1`, so a MAXIMAL run (`top + lines == 223`) puts
 *     its last value on line 224 where it can never be seen, and a 220-line run
 *     from `top` 3 renders 219 lines.
 *
 * The display geometry is now TWO derived constants in `preset.ts`,
 * `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET` (2) and
 * `EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG` (1) — different quantities, and the
 * docblock there says why. aeon's reasoning is at `docs/DEFERRED_WORK.md`
 * § "RAMP BOUNDARY" and `docs/benchmarks/effects-p3/RAMP-EVIDENCE.md`.
 *
 * ⚠ DO NOT READ THIS AS RETIRING THE REST OF THE CAVEAT ABOVE. The witness is
 * still a peer's unmerged branch and still emulation; only the one-line span
 * disagreement closed.
 *
 * "Accepted at the door", "obeyed by a machine on a peer's unmerged branch" and
 * "certified" are THREE different facts, and only the first two exist today.
 * Certification is aeon's pytest lane and sigil's attest chain, not this
 * landing, and no row in this repo stands in for either.
 *
 * RE-OPEN CONDITION FOR ITEM 6, stated so this retirement cannot become
 * permanent by accident: if aeon's build REFUSES a document Aurora actually
 * writes under `ramp` — a unit, a bound, a fixed-point spelling or a capability
 * Aurora does not know about — then "aeon reads this key" is true of the
 * vocabulary and false of the documents this editor produces, and the disclosure
 * comes back with wording that says so. (That condition FIRED once already, in
 * the smallest possible way: the negative-step emission failure above is exactly
 * "a fixed-point spelling Aurora does not know about", it was found by an Aurora
 * document, and `ramp-sign-lag.ts` is the narrower sentence it produced.)
 *
 * ═══ THE PREVIOUS RETIREMENT (ITEM 4), KEPT FOR ITS REASONING ═══
 *
 * The four-step cross-repo chain for EFFECTS-W1 DoD item 4 has closed. aeon
 * named the key shape, the hub filed the schema CR (empyrean `d36d704`,
 * AURORA_EFFECTS_SCHEMA.md §7.3), Aurora vendored and wrote the keys (step 3,
 * merge `b5c5284b`), and aeon's generator now READS them. Measured firsthand
 * through git objects at aeon `origin/master` `b7f4bdeb`, page blob `22a42064`
 * — a revision LATER than the `81b2a719`/`63fa3f8c` the re-arm below was written
 * against, because aeon's master moves fast and the drift row reads TIP on every
 * run, so it and not this comment answers the question today:
 *
 *   - `PRESET_KEYS` (`tools/effects_gen.py:285-286`) is now `{schema, id, bands,
 *     cycles, variants, patch_world_ys, patch_motion}`, with a comment above it
 *     dating the join to 2026-09-03 and naming §7.3 as the authority.
 *   - `_check_patch_world_ys` and `_check_patch_motion` shape-check them
 *     (positional, `<= 4`, the `PATCH_ANCHOR_NONE` sentinel refused as an
 *     integer, `PATCH_WORLD_Y_MAX` = `0xFFFF`), plus the cross-key refusal for a
 *     motion on a null seed and the `CAP_ANCHOR_MOTION` capability check.
 *   - `render_patch_motion` and the `fn_sec_patch_world_y` / `fn_sec_patch_motion`
 *     emitters lower them as VALUES into `ep_patch_world_ys` / `ep_patch_motion`.
 *   - `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block lists both under
 *     `preset:`, and grew `sweep:` / `sweep-optional:` rows for the shape.
 *
 * `preset-refused` is back to `fires` alone.
 *
 * ═══ THE LAG THAT RETIRED WAS THE SHARPER FLAVOUR, AND THAT IS KEPT ═══
 *
 * At 12aecd5 the lagging keys were in aeon's `preset-refused` list — refused BY
 * NAME, with a reason. These two were not in aeon's vocabulary at all, so they
 * took `_check_keys`'s generic unknown-key path and `_refuse` RAISED: a preset
 * document carrying either key did not "lower partially", it FAILED AEON'S
 * BUILD ENTIRELY. `presetLagDisclosure` below still says exactly that, because
 * the softer 12aecd5 wording would understate a re-opened lag of this flavour —
 * and `preset-lag-disclosure.test.ts` replays that premise explicitly so the
 * wording stays fully asserted with nothing on screen.
 *
 * ⚠ MERGED, NOT CERTIFIED. Nothing in this repository has seen a ROM obey
 * `patch_world_ys` or `patch_motion`, and nothing here claims one has.
 *
 * ⚠ RE-CHECKED 2026-09-03 AND DELIBERATELY LEFT AS IT STANDS — this is NOT the
 * `ramp` block above with two key names swapped in, and the difference is the
 * whole point of re-reading it. `ramp` now has a branch witness; these two have
 * NO witness anywhere this lane can see. Checked rather than assumed: aeon
 * `origin/master` `ddaab282` carries none, and `origin/parcel/anchor-motion-key`
 * and `origin/parcel/anchor-mover` — the two branches whose names could plausibly
 * hold one — are both fully merged and carry zero commits of their own
 * (`git log origin/master..<branch>` is empty for each). So the flat "nothing has
 * seen a ROM obey these" is not stale here; it is the current state.
 *
 * What retired is a sentence about what aeon's GENERATOR does with an authored
 * key, which is a fact this file can and does measure. aeon's own page records that
 * `preset()` ensures the ARRAY LENGTH and not the values, and that a game
 * without `CAP_ANCHOR_MOTION` refuses an authored sweep — both are aeon's
 * checks, run in aeon's build, and no row here stands in for them.
 *
 * RE-OPEN CONDITION FOR ITEM 4, stated so this retirement cannot become
 * permanent by accident: if aeon's build REFUSES a document Aurora writes under
 * either key — a length, a sentinel, a unit or a capability Aurora does not know
 * about — then "aeon reads these keys" is true of the vocabulary and false of
 * the documents this editor actually produces, and the disclosure comes back
 * with wording that says so. Aurora cannot measure that: it is aeon's pytest
 * lane and sigil's attest chain, and no row in this repo pretends otherwise.
 * What Aurora CAN measure is the vocabulary, and the drift row does, on every
 * run, at TIP.
 *
 * ═══ THE 2026-09-02 RETIREMENT (ITEM 5), KEPT FOR ITS REASONING ═══
 *
 * It was `['cycles', 'variants']` from the 12aecd5 re-vendor until aeon merged
 * EFFECTS-W1 DoD item 5 (aeon `445a5856`, 2026-09-02). The premise was: the
 * vendored schema DECLARES both keys (§7.2) and Aurora authors, validates,
 * saves and re-reads both, while aeon's `tools/effects_gen.py` refused both by
 * NAME — so a value an author set under either reached the FILE and nothing
 * further, not the ROM, not an emulator, not a screen. The band-preset panel
 * said exactly that, above the controls, in a sentence derived from this list.
 *
 * At aeon `origin/master` `a5e2b618` (page blob `518492e3`) that is no longer
 * true, and it is not true on a doc heading: `PRESET_KEYS` in `effects_gen.py`
 * carries both names, `_check_cycles` / `_check_variants` shape-check them,
 * `render_cycle_channel` / `render_variant` / `render_preset_cycle` /
 * `render_preset_variants` lower them through the real constructors, and the
 * committed generated `.emp` carries the emitted record
 * (`games/sonic4/data/generated/ojz/act1/effects_scenes.emp`:
 * `EditorVariant_OJZ_Act1_ojz_sec3_shimmer_0: pal_variant = variant(shift_r: 1,
 * shift_g: 1)`). So the list below is EMPTY and the sentence does not render.
 *
 * ═══ ITEM 5 WAS MERGED, NOT CERTIFIED — AND ITS OWN REVIVAL CONDITION ═══
 *
 * Item 5 is MERGED on aeon's master. It is NOT a certified chain: sigil
 * `dd5eaad2` (reachable on sigil `origin/master`) records "chain 198 recorded
 * RED — 3 failures, no ROM byte moved", and aeon supersedes it with chain 199.
 * Nothing in this repository has seen a ROM obey these keys, and nothing here
 * claims one has. What retired is a sentence about what aeon's GENERATOR does
 * with an authored key, which is a fact this file can and does measure.
 *
 * RE-OPEN CONDITION, stated so the retirement cannot become permanent by
 * accident: IF ANY OF CHAIN 199'S SEVEN GOLDENS DIFFERS FROM CHAIN 198'S, the
 * ROM did not behave as the retired sentence's absence now implies, and the
 * sentence COMES BACK — re-fill the list below and re-date it. That check is
 * aeon's and sigil's to run; Aurora cannot measure it, and no row in this repo
 * pretends to.
 *
 * ⚠ THE CONDITION HAS NOW BEEN DECIDED, AND IT DID NOT FIRE (read 2026-09-03,
 * firsthand, through git objects — the paragraph above was written while chain
 * 199 was still outstanding, and a reader who stopped there would go looking for
 * an answer that already exists). sigil `1eef8681` ("freeze: chain 199,
 * item5-cross-seam-composition; 198 abandoned"), reachable on sigil
 * `origin/master`: *"FIXPOINT PASSED — the regenerated goldens are byte-identical
 * to 198's, so all seven are unchanged and this chain moves no ROM byte."* Four
 * canonical shapes rebuilt from a fresh clean worktree with the ROMs deleted
 * first, all four matching. So the seven goldens do NOT differ, the sentence does
 * NOT come back, and this list stays empty on this account.
 *
 * ⚠ AND THE HEADLINE ABOVE STILL STANDS, WHICH IS WHY THIS IS AN APPENDIX AND NOT
 * A REWRITE. Chain 199's attest run is itself recorded RED — sigil `1da03b9e`,
 * 4231 passed / 1 failed, the one failure being
 * `no_landing_path_invokes_the_drift_job`, sigil's OWN guard that its drift job
 * stays reachable only from its timer, tripped by sigil's own drift fix and
 * carried in on a master merge. Unrelated to item 5, and recorded rather than
 * tidied away. More to the point: "all seven goldens byte-identical" means NO ROM
 * BYTE MOVED, so the chain proves the composition did not regress — it is not,
 * and could not be, a ROM seen obeying `cycles` or `variants`. Item 5 remains
 * MERGED, NOT CERTIFIED.
 *
 * ═══ THE MACHINERY STAYS. IT IS NOT DEAD CODE — IT IS A RE-ARMABLE DISCLOSURE ═══
 *
 * `PRESET_KEYS_AWAITING_AEON` is the only hand-typed statement of the fact.
 * TWO readers, and only two:
 *
 *   1. `test/formats/effects-preset-schema-drift.test.ts` MEASURES it: it reads
 *      aeon's page at origin/master through git objects, computes the lag, and —
 *      now that the lag is empty — asserts it is EMPTY. That row goes red the
 *      day a lag re-opens, in either direction: aeon un-building a key, or the
 *      contract declaring a key aeon has not built. Its message says which fix
 *      each is. The row carries no copy of any key name, and — as on 2026-09-02
 *      — it no longer names THIS constant either, because a row asserting "the
 *      measured lag equals <an empty list>" would be the same claim spelled
 *      through an indirection nobody can read.
 *
 *      ⚠ THE MEASUREMENT WIDENED ON 2026-09-03 AND MUST STAY WIDE. Until then
 *      the lag was computed from aeon's `preset-refused` list alone, which sees
 *      only the refused-BY-NAME flavour; a key aeon's page does not mention at
 *      all was invisible to it. That is precisely the flavour d36d704 produced,
 *      and the row stayed green through it. The lag is computed as "every root
 *      key the schema declares that aeon's page does not ACCEPT", which covers
 *      both flavours and is the definition this constant always meant.
 *      Narrowing it back is how this whole apparatus goes green while blind, so
 *      `preset-lag-disclosure.test.ts` pins the WIDE form on the drift test's
 *      own source.
 *   2. `presetLagDisclosure` DERIVES the panel's sentence from it, and returns
 *      null — no sentence — when the list is empty. It is mounted
 *      unconditionally and propless in `BandPresetPanel`, in BOTH the channels
 *      section and the anchors section, so re-filling this list is the whole of
 *      what it takes to put the sentence back on screen in both places. The
 *      leaves STAY MOUNTED while silent: that is what keeps re-arming a one-line
 *      edit in this file.
 *
 * `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`
 * closes the loop from the other side. It has now been re-aimed with the premise
 * FIVE times (armed → retired → armed → retired → armed → retired) and keeps
 * the shape both
 * states need. With the lag CLOSED it asserts the retirement rather than assuming
 * it (the list is empty, and the leaf is silent BECAUSE of that and not for some
 * other reason); it keeps the WORDING fully asserted by driving the derivation
 * with an EXPLICIT replay of the retired premise, checked against the schema so
 * the replay is real vocabulary and not fiction; and its poison flips to the
 * load-bearing direction — stub this list back NON-empty and the leaf must speak
 * the whole sentence again, which a leaf hard-wired to `return null` would fail
 * (memory: a workaround outlives its defect; a hold carries its date; a suite
 * that passes while asserting nothing is the failure mode).
 *
 * Evaluate, do not obey: re-measure with `git -C <aeon> show
 * origin/master:docs/EDITOR_RASTER_PRESETS.md`, never by path into a working
 * tree. Owner of the sentence: Aurora (this file). Owner of the fact: aeon.
 */

/**
 * The preset keys the schema declares that aeon's generator does not lower yet,
 * sorted, as the drift row measures them.
 *
 * `['cycles','variants']` from 2026-08-30; EMPTY on 2026-09-02 when aeon merged
 * item 5; `['patch_motion','patch_world_ys']` on 2026-09-03 when empyrean
 * d36d704 declared item 4's authoring keys and aeon's step 4 had not run; EMPTY
 * again LATER THE SAME DAY, when it did; `['ramp']` on 2026-09-03 when empyrean
 * 9233883 declared item 6's authoring key and aeon's step 4 had not run; EMPTY
 * again LATER THE SAME DAY AGAIN, when aeon's page grew `ramp` into its accepted
 * `preset:` row at `c7ee7075`. Re-fill it (and only it) the day the drift row
 * reports a lag again — the sentence comes back on screen in both mount sites by
 * construction.
 */
export const PRESET_KEYS_AWAITING_AEON: readonly string[] = Object.freeze([]);

/** The date the premise above was last measured — printed inside the sentence. */
export const PRESET_LAG_MEASURED_ON = '2026-09-03';

/** Where the measurement lives, named in the sentence so a reader can re-run it. */
export const PRESET_LAG_MEASUREMENT =
  'test/formats/effects-preset-schema-drift.test.ts (the lag row) against aeon ' +
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
    `(tools/effects_gen.py) does not accept ${one ? 'it' : 'them'} at origin/master and refuses ` +
    'the WHOLE DOCUMENT, so a preset carrying ' +
    `${one ? 'the key' : 'either key'} will not build, nothing set below reaches a ROM, and no ` +
    `emulator has shown ${one ? 'it' : 'either'}. ` +
    `Measured ${PRESET_LAG_MEASURED_ON} by ${PRESET_LAG_MEASUREMENT}. ` +
    `Expires (${PRESET_LAG_MEASURED_ON}): the day that row goes red because aeon lowers ` +
    `${one ? 'the key' : 'the keys'} — this sentence retires with the row.`;
}
