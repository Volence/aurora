/**
 * WHAT A PER-SECTION RASTER-PRESET ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_preset` writes `rasterRef` into a section's `.meta.json`
 * sidecar, one undo step, and the sidecar persists it. All of that is real.
 * What the sentence below has to say is how far the ref then travels — and the
 * answer moved on 2026-08-30, so read the history before editing the words.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUR CORRECTIONS, TWO OF THEM DATED CLAIMS THAT EXPIRED ON SCHEDULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. The key did not exist in either repo. False once empyrean adjudicated
 *    `rasterRef` (§3.1) and Aurora's sidecar began round-tripping it.
 * 2. Nothing WROTE a binding. False once `assign_section_preset` landed
 *    (aurora `f98824ac`) — a writer exists; it is an agent tool, not a panel
 *    control. And the "not a panel control" half went too: ROADMAP row 93's
 *    remaining half landed the per-section raster select in `BandPresetPanel`,
 *    over the same `sectionPresetCommand`. So THE PANEL WRITES ONE NOW, and
 *    every clause below that used to say otherwise is gone. What did NOT change
 *    is the half that clause shared a sentence with: the viewport still
 *    composites nothing, so binding from the select is as unobservable as
 *    binding from the tool.
 * 3. Nothing READ a binding. **False since aeon `4aa2abc0`** (a merge on aeon's
 *    `origin/master`, "item 1's zero-byte arm — rasterRef binds a section's
 *    raster channel"). Retired 2026-08-30 on the schedule its own dated expiry
 *    set: `tools/effects_gen.py` resolves the key and emits the chooser.
 * 4. Nothing CALLED the chooser — the universal call-site clause, and the claim
 *    this edit retires. **False since aeon `9cdf32d8`** ("close: the unwired-
 *    section refusal landed inside step 5's own gate", an ancestor of their
 *    `origin/master`), where `ojz_effects.emp:1072` threads
 *    `ojz_act1_sec_raster(sec: 5, hand: Raster_Program_None)`.
 *
 * Both retirements were SCHEDULED, not discovered late, and for one reason: the
 * sentence named the aeon files that would falsify it and carried a date. The
 * new sentence carries one too (below), and it now names a SECTION NUMBER.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT AEON ACTUALLY DOES AT `9cdf32d8`, READ AT THAT REVISION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Established by `git -C ../aeon show 9cdf32d8:<path>` — read-only, at a
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
 *   • `games/sonic4/data/effects/ojz_effects.emp:1072` is the ONE call site in
 *     the file: `OJZ_Preset_Sec5`, `raster: ojz_act1_sec_raster(sec: 5, hand:
 *     Raster_Program_None)`. `act_descriptor.emp`'s `ojz_sec(sec: 5, …)` binds
 *     `effects: OJZ_Preset_Sec5`, so the index and the owner agree.
 *   • Every other section's `raster:` is a hand-authored label. Sections 6-8
 *     SHARE `OJZ_Preset_Plain` (`:1029`); sections 1-3 have their own
 *     (`:1026-1028`, and `Sec3`'s is `Raster_Program_None` — an EXPLICIT
 *     no-program, not an empty slot). Section 0 binds `patched:` instead, and
 *     `engine/effects/preset.emp:127-132` makes `raster:`/`patched:` mutually
 *     exclusive at comptime.
 *
 * ⚠ STEP 5 MANUFACTURED THE NON-UNIFORMITY; IT DID NOT REVEAL IT. Before it,
 * every section was uniformly unwired and one universal sentence was true.
 * After it, that sentence is the lie. So the limit is a CASE SPLIT now:
 *
 *   1. SECTION 5, BOUND — the chooser resolves the ref. The first case where an
 *      author's choice in this editor can reach the raster channel at all.
 *   2. SECTION 5, UNBOUND — the chooser returns `hand:`
 *      (`Raster_Program_None`) and nothing changes. `OJZ_Preset_Sec5` is
 *      byte-identical to `OJZ_Preset_Plain` today.
 *   3. ANY OTHER SECTION, BOUND — the key is written, aeon's witness counts it,
 *      AND NOTHING CONSUMES IT. This is the case the sentence exists for.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CASE 3 IS NO LONGER SILENT — VERIFIED, NOT TAKEN ON REPORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * When claim 3 was written, NOTHING refused and NOTHING warned for case 3:
 * editor accepts, build accepts, no picture, no diagnostic. That changed, and
 * the change was checked here rather than believed — read at `9cdf32d8`:
 *
 *   • `tools/effects_seam_gate.py`'s `raster_seam_faults` carries the arm:
 *     for every `sec` in `effects_gen.load_section_raster_refs(REPO)` whose
 *     index no `preset()` threads, it appends *"section N's sidecar names
 *     rasterRef '<id>', but no preset threads <fn>(sec: N)"*. `fail()` prints
 *     and `sys.exit(1)`. So it REALLY refuses, and it names the section.
 *   • It also refuses the shared-record hazard: a preset that chooses on sec N
 *     but is bound by more than one section, or by a different index, is a
 *     fault with a sentence telling the author to split the record first.
 *   • WHEN IT RUNS: `build.sh` invokes it only under `GAME == sonic4` and
 *     `FAST == 0`. `FAST=1 ./build.sh` skips it and SAYS SO in its banner.
 *     Inside the gate the raster block is step 2b, ahead of the listing read,
 *     so the case-3 refusal does not need a successful build to fire.
 *   • WHERE IT LOOKS: `_load_section_refs` reads `<repo>/<dataPath>/
 *     section_N.meta.json` — sidecars in aeon's own checkout, which is where
 *     this editor writes them.
 *   • ⚠ IT IS VACUOUS TODAY, AND SAYS SO. At `9cdf32d8` only
 *     `section_0.meta.json` and `section_4.meta.json` exist and neither carries
 *     `rasterRef`, so the loop body never runs; the gate prints *"the sidecar
 *     arm is VACUOUS today and says so rather than reading green"*. The arm is
 *     exercised on synthetic inputs instead
 *     (`tools/test_effects_seam_gate.py::test_a_sidecar_rasterRef_with_no_call_
 *     site_is_a_fault`, plus a meta-test that a stubbed-empty `raster_seam_
 *     faults` would fail those rows).
 *   • AND THE REFUSAL IS AEON'S ALONE. Nothing in Aurora refuses or warns for
 *     case 3: the panel's select offers every section, the agent tool accepts
 *     it, and the author learns about it at aeon's build or not at all.
 *
 * The honest shape of the hand-work now: wiring a SECOND section is a preset
 * SPLIT plus one call-site line — not one line, because `Sec.sec_effects` is a
 * pointer to a shared record and threading a section-keyed chooser into one
 * two sections point at is itself a seam-gate refusal. Still not "authoring the
 * effect", and still not "nothing left to do".
 *
 * ⚠ THIS SENTENCE IS NOT `NO_PREVIEW`, AND MUST NOT GROW INTO IT.
 * `providers/effects-preset.ts`'s `NO_PREVIEW` owns "no band has ever been
 * looked at on screen in this suite, so there is no ground truth to preview
 * against". THIS sentence owns the narrower, binding-specific fact: the VIEWPORT
 * does not composite a `rasterRef`, which is the contrast with
 * `assign_section_bg` (whose ref it does). Two limits saying the same thing is
 * how an author learns to skip both.
 *
 * ⚠ SAID ONCE, HERE. It is read by the agent replies (`agent-handler.ts`,
 * renderer), the published tool descriptions (`editor-methods.ts`, main) and
 * the band-preset panel's own author-facing limit
 * (`providers/effects-preset.ts`, `PRESET_LIMITS.unbound`). It lives in `core/`
 * for `bg-binding.ts`'s reason — main must not import the renderer — and the
 * panel reads it rather than keeping a second wording, which is the one thing
 * `bg-binding.ts` wanted and could not have (it had no panel sentence to fold).
 *
 * ⚠ THE NEW SENTENCE HAS AN EXPIRY TOO, AND IT IS THE SAME SHAPE — BUT IT
 * NAMES A SECTION NUMBER. That is aeon's drafting rule and it is adopted here:
 * "section 5 is wired; the others are not" has an obvious expiry that fires the
 * day a section number moves, while "a bound section plays" has no expiry at
 * all and goes wrong SILENTLY the first time someone binds section 6. Write the
 * number.
 *
 *   • WRITTEN: 2026-08-30, against aeon `9cdf32d8`.
 *   • OWNER: aeon's lane — their **step 6**, which needs a sidecar actually
 *     carrying a `rasterRef`.
 *   • WHAT ENDS IT: any of three, and each points the sentence a different way.
 *     (a) A second `raster:` argument in
 *     `games/sonic4/data/effects/ojz_effects.emp` calling `<act>_sec_raster` —
 *     then "only section 5" is false and the case split must list both.
 *     (b) `sec: 5` becoming some other index there — then the NUMBER in the
 *     sentence is wrong, which is exactly what naming it makes findable.
 *     (c) A `section_N.meta.json` in aeon's tree carrying a `rasterRef` — then
 *     `EditorRaster_*_Bindings` goes non-zero, the seam gate's section arm stops
 *     being vacuous, and case 1 becomes something that has been exercised end to
 *     end rather than only reasoned about.
 *   • RE-READ, at aeon's then-current master and not at this revision:
 *     `games/sonic4/data/effects/ojz_effects.emp` (which `sec:` indices its
 *     `raster:` arguments pass), `tools/effects_seam_gate.py` (whether the
 *     case-3 refusal still fires and still runs on a canonical build), and
 *     `tools/effects_gen.py`. `9cdf32d8` is a revision, not "now".
 *   • EVALUATE, DO NOT OBEY. If a second section is threaded, this sentence is
 *     the lie it exists to prevent — pointed the other way, again. And if the
 *     seam gate stops refusing case 3, the "no longer silent" clause becomes the
 *     lie instead; do not keep it because a guard was once announced.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IF AEON EVER PUBLISHES THE WIRED SET: WHAT THIS EDITOR MAY AND MAY NOT DO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ruled by this lane 2026-08-30 and written HERE rather than in the lane board,
 * because the board is gitignored by contract — a position that lives only there
 * does not survive a session boundary, and this one was reached by argument that
 * would have to be had again from scratch.
 *
 * ⚠ THE STANDING REFUSAL: Aurora does NOT gate the per-section select, and does
 * not decide which sections can accept a binding. Being wired is a property of a
 * hand-authored `preset()` in aeon's `ojz_effects.emp`, which this repo does not
 * parse and must not start parsing. Any gate written from what we can see today
 * would hardcode ONE act's current content layout into the editor, be silently
 * wrong for the next act, and read to an author as authoritative. That is a copy
 * of a snapshot wearing a check's clothes. The DISCLOSURE is the instrument; a
 * gate is not.
 *
 * Aeon has booked publishing the wired set as generated output (their
 * `5fc778c4`), which would be re-derived per act on every build and so could not
 * describe a layout that had moved. IF that lands, the refusal may be revisited
 * — against the ARTIFACT, read at a committed revision, never against the
 * promise of one, and never by caching the set into this tree as a literal.
 *
 * ⚠ AND THE PART THAT IS EASY TO GET BACKWARDS. If such a statement exists but
 * is ABSENT OR UNREADABLE at the moment we look, the control stays **ENABLED**
 * with the disclosure — never disabled. A control greyed out because we could
 * not read a file is indistinguishable, to the author looking at it, from one
 * greyed out because the thing is impossible; the second is a claim we would not
 * have earned. Fail toward the honest sentence, not toward the confident-looking
 * lock.
 */

export const RASTER_SECTION_BINDING_LIMIT =
  'Saving a preset does not install it, and binding one no longer stops at the sidecar — but it '
  + 'still does not finish. The per-section key is rasterRef: assign_section_preset writes it into '
  + 'that section\'s .meta.json sidecar, and aeon\'s build NOW READS IT. Verified at aeon 9cdf32d8 '
  + '(2026-08-30): tools/effects_gen.py resolves rasterRef against the preset documents and emits '
  + 'that section\'s raster program together with the chooser that selects it, refusing an id that '
  + 'names no preset document BY NAME with the known ids listed — and refusing a numeric rasterRef, '
  + 'which matters because this editor\'s own sidecar parser nulls a non-string silently, so the '
  + 'build is the last reader that can still see that mistake. WHICH SECTION YOU BIND NOW DECIDES '
  + 'WHAT HAPPENS, AND ONLY SECTION 5 IS WIRED. At 9cdf32d8 exactly one preset() in aeon\'s '
  + 'games/sonic4/data/effects/ojz_effects.emp passes the chooser to its raster: channel — '
  + 'OJZ_Preset_Sec5, as raster: ojz_act1_sec_raster(sec: 5, hand: Raster_Program_None) — so binding '
  + 'a preset to SECTION 5 is the first choice made in this editor that aeon\'s build can carry to a '
  + 'raster channel, and leaving section 5 unbound resolves to that hand: label and changes nothing. '
  + 'BINDING ANY OTHER SECTION STILL REACHES NOTHING: those presets hand raster: a literal, so the '
  + 'key is written, aeon\'s witness counts it, and no program follows it. That case is no longer '
  + 'SILENT — aeon\'s tools/effects_seam_gate.py refuses a full build for it and names the section '
  + 'and the id — but the refusal is aeon\'s alone: nothing here warns, and FAST=1 skips that gate. '
  + 'Wiring a second section is a preset split plus one call-site line in aeon, not authoring the '
  + 'effect: sections 6-8 share one record, and a section-keyed chooser threaded into a shared '
  + 'record is itself a seam-gate refusal. Nor is there anything to look at here, for section 5 as '
  + 'much as for any other: the band-preset panel now carries a per-section raster select, but '
  + 'binding one draws nothing — the viewport does not composite a rasterRef, so unlike '
  + 'assign_section_bg — whose ref the '
  + 'viewport does composite — this assignment changes nothing on screen. A preset document costs ROM '
  + 'whether or not any section binds it, since aeon emits one program per document. Unlike '
  + 'assign_section_scene, which is baked. EXPIRES when a sidecar in aeon\'s tree actually carries a '
  + 'rasterRef (their step 6), or when a second section is threaded, or when sec: 5 becomes another '
  + 'index — owner: aeon\'s lane. At 9cdf32d8 no sidecar carries the key, so the seam gate\'s '
  + 'section arm is vacuous and prints that it is, and no section number here has been exercised end '
  + 'to end. Before quoting this, re-read games/sonic4/data/effects/ojz_effects.emp for which sec: '
  + 'indices its raster: arguments pass, and re-read tools/effects_seam_gate.py and '
  + 'tools/effects_gen.py.';
