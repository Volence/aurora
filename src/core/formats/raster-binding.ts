/**
 * WHAT A PER-SECTION RASTER-PRESET ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_preset` writes `rasterRef` into a section's `.meta.json`
 * sidecar, one undo step, and the sidecar persists it. All of that is real.
 * What the sentence below has to say is how far the ref then travels — and the
 * answer moved on 2026-08-30, so read the history before editing the words.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THIRD CORRECTION, AND THE ONLY ONE THAT RETIRED A DATED CLAIM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. The key did not exist in either repo. False once empyrean adjudicated
 *    `rasterRef` (§3.1) and Aurora's sidecar began round-tripping it.
 * 2. Nothing WROTE a binding. False once `assign_section_preset` landed
 *    (aurora `f98824ac`) — a writer exists; it is an agent tool, not a panel
 *    control.
 * 3. Nothing READ a binding. **False since aeon `4aa2abc0`** (a merge on aeon's
 *    `origin/master`, "item 1's zero-byte arm — rasterRef binds a section's
 *    raster channel"), which is what this edit retires.
 *
 * The previous sentence carried a DATED EXPIRY naming the two aeon files that
 * would falsify it, and that is the only reason this retirement was scheduled
 * rather than discovered years late. The new sentence carries one too (below).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT AEON ACTUALLY DOES AT `4aa2abc0`, READ AT THAT REVISION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Established by `git -C ../aeon show 4aa2abc0:<path>` — read-only, at a
 * committed revision, never anyone's working tree:
 *
 *   • `tools/effects_gen.py` defines `ACT_RASTER_REF_KEY = "rasterRef"` (the
 *     single place the wire spelling is written) and `load_section_raster_refs`
 *     walks `section_N.meta.json` for it. So THE KEY HAS A CONSUMER.
 *   • It refuses an id naming no preset document BY NAME, listing the known
 *     ids; and it refuses a NON-STRING `rasterRef` — deliberately, because
 *     Aurora's own parser nulls a non-string SILENTLY
 *     (`section-meta.ts:127`), so the build is the last reader that can still
 *     see that mistake.
 *   • No unknown-key refusal is applied to the sidecar, by ruling — future
 *     Aurora keys are not build breaks.
 *   • The generator emits one `pub data EditorRaster_<ACT>_<id>` per preset
 *     DOCUMENT (not per binding), plus an always-emitted, zero-byte
 *     `pub comptime fn <act>_sec_raster(sec, hand)` chooser that maps a bound
 *     section to that label.
 *
 * ⚠ AND THEN IT STOPS ONE SEAM SHORT, WHICH IS WHY THE NEW SENTENCE IS NOT
 * "IT WORKS NOW". The chooser has to be threaded into a section's `preset()`
 * call to reach the engine — `raster: <act>_sec_raster(sec: N, hand: ...)` —
 * and at `4aa2abc0` NOTHING CALLS IT: every `raster:` argument in
 * `games/sonic4/data/effects/ojz_effects.emp` is still a hand-authored label
 * (`OJZ_TestRaster`, `OJZ_TestGradient`, `Raster_Program_None`, …), the
 * generated module's own witness reads `EditorRaster_OJZ_Act1_Bindings = 0`,
 * and `git grep "sec_raster("` at that revision hits only the design spec and
 * the generated module itself. aeon's `docs/DEFERRED_WORK.md` calls this their
 * **step 5** and records it as blocked on the owner's choice of which section
 * to split. So a bound section still runs its hand-authored raster program and
 * the band does not play.
 *
 * The honest shape of the change, then: the hand-work left is a ONE-LINE
 * CALL-SITE EDIT per section, not authoring the effect. That is a real and
 * large improvement over the old sentence's "a programmer installs the preset
 * by hand", and it is still not "nothing left to do".
 *
 * ⚠ THIS SENTENCE IS NOT `NO_PREVIEW`, AND MUST NOT GROW INTO IT.
 * `providers/effects-preset.ts`'s `NO_PREVIEW` owns "no band has ever been
 * looked at on screen in this suite, so there is no ground truth to preview
 * against". THIS sentence owns the narrower, binding-specific fact: no control
 * writes a `rasterRef` and the VIEWPORT does not composite one, which is the
 * contrast with `assign_section_bg` (whose ref it does). Two limits saying the
 * same thing is how an author learns to skip both.
 *
 * ⚠ SAID ONCE, HERE. It is read by the agent replies (`agent-handler.ts`,
 * renderer), the published tool descriptions (`editor-methods.ts`, main) and
 * the band-preset panel's own author-facing limit
 * (`providers/effects-preset.ts`, `PRESET_LIMITS.unbound`). It lives in `core/`
 * for `bg-binding.ts`'s reason — main must not import the renderer — and the
 * panel reads it rather than keeping a second wording, which is the one thing
 * `bg-binding.ts` wanted and could not have (it had no panel sentence to fold).
 *
 * ⚠ THE NEW SENTENCE HAS AN EXPIRY TOO, AND IT IS THE SAME SHAPE. Its
 * falsifiable claim is the call-site one, and it is falsified the day aeon
 * threads the chooser. Owner: aeon's lane (their step 5). What ends it: a
 * `raster:` argument in `games/sonic4/data/effects/ojz_effects.emp` that reads
 * `<act>_sec_raster(...)`, or `EditorRaster_*_Bindings` going non-zero with a
 * live call site. Re-read BOTH `games/sonic4/data/effects/ojz_effects.emp` and
 * `tools/effects_gen.py` at aeon's then-current master before quoting this;
 * `4aa2abc0` is a revision, not "now". Evaluate, do not obey: if the call site
 * is threaded, this sentence is the lie it exists to prevent — pointed the
 * other way, again.
 */

export const RASTER_SECTION_BINDING_LIMIT =
  'Saving a preset does not install it, and binding one no longer stops at the sidecar — but it '
  + 'still does not finish. The per-section key is rasterRef: assign_section_preset writes it into '
  + 'that section\'s .meta.json sidecar, and aeon\'s build NOW READS IT. Verified at aeon 4aa2abc0 '
  + '(2026-08-30): tools/effects_gen.py resolves rasterRef against the preset documents and emits '
  + 'that section\'s raster program together with the chooser that selects it, refusing an id that '
  + 'names no preset document BY NAME with the known ids listed — and refusing a numeric rasterRef, '
  + 'which matters because this editor\'s own sidecar parser nulls a non-string silently, so the '
  + 'build is the last reader that can still see that mistake. WHAT IS STILL MISSING IS THE CALL '
  + 'SITE: no preset() in aeon\'s games/sonic4/data/effects/ojz_effects.emp passes that chooser to '
  + 'its raster: channel, so a bound section keeps running its hand-authored raster program and the '
  + 'band does not play. The hand-work left is one line per section at that call site, not authoring '
  + 'the effect. Nor is there anything to look at here: no control in the band-preset panel writes a '
  + 'rasterRef and the viewport does not composite one, so unlike assign_section_bg — whose ref the '
  + 'viewport does composite — this assignment changes nothing on screen. A preset document costs ROM '
  + 'whether or not any section binds it, since aeon emits one program per document. Unlike '
  + 'assign_section_scene, which is baked. EXPIRES when aeon threads the chooser into ojz_effects.emp '
  + '(their step 5, recorded at 4aa2abc0 as blocked on an owner\'s section choice): before quoting '
  + 'this, re-read games/sonic4/data/effects/ojz_effects.emp for a raster: argument calling '
  + '_sec_raster and re-read tools/effects_gen.py.';
