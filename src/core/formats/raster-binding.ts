/**
 * WHAT A PER-SECTION RASTER-PRESET ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_preset` writes `rasterRef` into a section's `.meta.json`
 * sidecar, one undo step, and the sidecar persists it. All of that is real.
 * What the sentence below has to say is how far the ref then travels — and the
 * answer moved on 2026-08-30, so read the history before editing the words.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIX CORRECTIONS, FOUR OF THEM DATED CLAIMS THAT EXPIRED ON SCHEDULE
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
 * 5. No sidecar in aeon's tree carried the key, so the seam gate's section arm
 *    was vacuous and no section had been exercised end to end. **False since
 *    aeon `c9a462be`** ("step 6: section 5 carries an authored band", an
 *    ancestor of their `origin/master`), which commits
 *    `games/sonic4/data/editor/ojz/act1/section_5.meta.json` with
 *    `"rasterRef": "ojz_sec5_showcase"` beside the preset document — the two
 *    files this lane authored through its own writer and handed over. Retired
 *    2026-08-30, the same day, on the schedule clause (c) of the previous
 *    expiry set; the block at the end of this header records the re-read.
 * 6. Nothing had been seen on screen — aeon's `c9a462be` said so in its own
 *    words, and the sentence cited it rather than asserting either way.
 *    **False since aeon `4a4d3474`** ("step 6 measured: the section-5 authored
 *    band IS SEEN on screen - picture, control, A/B CRAM tables", an ancestor
 *    of their `origin/master`), which commits
 *    `docs/research/reference_captures/2026-08-30-sec5-band/` — README, two
 *    bound runs, one control, CRAM tables and frames. Retired 2026-08-30, the
 *    same day again, on the fifth clause of the previous expiry set; the last
 *    dated block of this header records what the artifact says and what it
 *    says it does not.
 *
 * All four retirements were SCHEDULED, not discovered late, and for one
 * reason: the sentence named the aeon files that would falsify it and carried a
 * date. The new sentence carries one too (below), and it still names a SECTION
 * NUMBER.
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
 *   • ⚠ IT WAS VACUOUS AT THAT REVISION, AND SAID SO (superseded at aeon
 *     `c9a462be` — see the last dated block of this header). At `9cdf32d8` only
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
 * `providers/effects-preset.ts`'s `NO_PREVIEW` owns "there is no ground truth
 * to preview against here" (it said "no band has ever been looked at on screen
 * in this suite" until 2026-08-30, and since O64 says there is ONE measured
 * frame, in aeon's tree, that a preview is not built against). THIS sentence
 * owns the narrower, binding-specific fact: the VIEWPORT
 * does not composite a `rasterRef`, which is the contrast with
 * `assign_section_bg` (whose ref it does). Two limits saying the same thing is
 * how an author learns to skip both. (2026-08-30, later: `NO_PREVIEW`'s own
 * premise expired at aeon `4a4d3474` — a band HAS now been looked at on screen
 * in this suite, in aeon's tree, see the last dated block. That is
 * `NO_PREVIEW`'s sentence to retire, with its own rows and harness; this
 * sentence cites the capture and still does not preview anything. Retired
 * there 2026-08-30, O64.)
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
 *   • WRITTEN: 2026-08-30, against aeon `9cdf32d8`. ⚠ CLAUSE (c) BELOW FIRED
 *     at aeon `c9a462be` the same evening; the expiry IN FORCE is the one in
 *     the last dated block of this header, into which (a) and (b) carry over.
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
 * 2026-08-30, LATER THE SAME DAY: THE EXPIRY IS ARMED AND HAS NOT FIRED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SUPERSEDED THE SAME EVENING — clause (c) fired at aeon `c9a462be`; see
 * the block AFTER this one. This block is kept as written because it is the
 * record of what a NON-firing looked like when the trigger was already in
 * someone's hands, and the next reader in that position will want it.
 *
 * This lane AUTHORED the two documents clause (c) is waiting for and handed
 * them to aeon's lane. That is not the same event as clause (c), and mistaking
 * the two would retire a sentence that is still true — which the four
 * corrections above record as nearly happening three times, each time in a
 * hurry, each time by a reader who had the trigger in front of them.
 *
 * THE RE-READ, AT AEON `1cbb6660` (their `origin/master` that day, EIGHT
 * commits past `9cdf32d8`) — done because the block above says `9cdf32d8` is a
 * revision and not "now", and read through `git -C ../aeon show <rev>:<path>`,
 * never their working tree:
 *
 *   • `games/sonic4/data/effects/ojz_effects.emp` — still EXACTLY ONE `raster:`
 *     argument calling the chooser, still `OJZ_Preset_Sec5` at `sec: 5`. Every
 *     other section's `raster:` is still a hand-authored label, sections 6-8
 *     still share `OJZ_Preset_Plain`, section 0 still binds `patched:`. So (a)
 *     has not fired and (b) has not fired.
 *   • `tools/effects_gen.py` — `ACT_RASTER_REF_KEY = "rasterRef"`,
 *     `load_section_raster_refs`, the names-no-document refusal and the
 *     non-string refusal are all still there.
 *   • `tools/effects_seam_gate.py` — `raster_seam_faults` still carries the
 *     case-3 arm and still names the section and the id. So the "no longer
 *     SILENT" clause is still earned.
 *   • `games/sonic4/data/editor/ojz/act1/` — still only `section_0.meta.json`
 *     and `section_4.meta.json`, and NEITHER carries `rasterRef`. So (c) HAS
 *     NOT FIRED, the seam gate's section arm is still vacuous, and the
 *     sentence's last clause is still true word for word.
 *
 * THE RULING: a file in this lane's scratch handover is not a file in aeon's
 * tree. `_load_section_refs` reads `<aeon repo>/<dataPath>/section_N.meta.json`
 * — their checkout — and until the commit lands, `EditorRaster_OJZ_Act1_Bindings`
 * is still 0 and nothing has been exercised end to end IN THEIR TREE. Retiring
 * now would buy a sentence that is false today in exchange for one that would
 * have become true later, which is the trade this whole header exists to refuse.
 *
 * ⚠ AND THE STRING'S REVISION WAS DELIBERATELY LEFT AT `9cdf32d8`. Re-pinning it
 * to `1cbb6660` was considered and declined: every `9cdf32d8` in the sentence
 * names the commit that ESTABLISHED a fact (the call site landed there), which
 * is provenance, and provenance does not get fresher by being restamped. The
 * freshness question — "and is it still so?" — is what this block answers, and
 * it answers it with a revision, a date and a list of what was opened.
 *
 * WHAT FIRES IT, EXACTLY, so the next reader does not have to re-derive it:
 * `games/sonic4/data/editor/ojz/act1/section_5.meta.json` appearing in aeon's
 * tree with `"rasterRef": "ojz_sec5_showcase"`, alongside
 * `games/sonic4/data/editor/effects/presets/ojz_sec5_showcase.json`. When it
 * does, the LAST clause is the one that goes false first (the vacuity and the
 * never-exercised claim), and the case split must stay a case split keyed on
 * the SECTION NUMBER — "a bound section plays" is the wording that goes wrong
 * silently the first time someone binds section 6, and section 6 is exactly the
 * case aeon's seam gate was measured refusing.
 *
 * ⚠ THE BINDING BEING CARRIED IS STILL NOT THE BAND BEING SEEN (superseded at
 * aeon `4a4d3474` — see the last dated block of this header; what follows was
 * true of THIS lane's scratch run and still is). Running aeon's
 * own `tools/effects_gen.py emit` over a scratch copy carrying both documents
 * emits `EditorRaster_OJZ_Act1_ojz_sec5_showcase`, moves
 * `EditorRaster_OJZ_Act1_Bindings` to 1 and puts
 * `if sec == 5 { out = EditorRaster_OJZ_Act1_ojz_sec5_showcase }` in the
 * chooser — measured, not assumed. That closes the GENERATOR seam and closes
 * nothing else: no ROM was built, no emulator was run, and no CRAM was sampled,
 * so `NO_PREVIEW`'s subject is untouched and nothing here may start implying a
 * band has been looked at.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-30, LATER STILL: CLAUSE (c) FIRED AT AEON `c9a462be` — RETIRED HERE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Read at aeon `origin/master` = `6e2495a5` (two commits past `1cbb6660`:
 * `c9a462be` step 6, then `6e2495a5` a DEFERRED_WORK booking), through
 * `git -C ../aeon show 6e2495a5:<path>` and `git show c9a462be`, never their
 * working tree. What each file says, with the line it says it at:
 *
 *   • `games/sonic4/data/effects/ojz_effects.emp` — STILL exactly one `raster:`
 *     argument calling the chooser: `OJZ_Preset_Sec5` (declared `:1078`) with
 *     `raster: ojz_act1_sec_raster(sec: 5, hand: Raster_Program_None)` at
 *     `:1079`. `:1033-1036` and `:1049` hand `raster:` a literal; `:1030`
 *     (`Sec0`) binds `patched:`. So (a) and (b) have NOT fired.
 *   • `games/sonic4/data/editor/ojz/act1/section_5.meta.json` — EXISTS, with
 *     `"rasterRef": "ojz_sec5_showcase"` and the other three refs null;
 *     `games/sonic4/data/editor/effects/presets/ojz_sec5_showcase.json` beside
 *     it. Only `section_0`, `section_4` and `section_5` have sidecars. (c) HAS
 *     FIRED, and its own commit says the bytes are what this writer produced.
 *   • `games/sonic4/data/generated/ojz/act1/effects_scenes.emp` — committed and
 *     re-emitted: `pub equ EditorRaster_OJZ_Act1_Bindings = 1` (`:163`),
 *     `EditorRaster_OJZ_Act1_ojz_sec5_showcase` (`:145`), and the chooser's arm
 *     `if sec == 5 { out = EditorRaster_OJZ_Act1_ojz_sec5_showcase }` (`:213`).
 *   • `tools/effects_seam_gate.py` — `raster_seam_faults` (`:133`) still carries
 *     the case-3 arm (`:195-202`, *"section N's sidecar names rasterRef '<id>',
 *     but no preset threads <fn>(sec: N)"*) and `fail()` still `sys.exit(1)`s
 *     (`:205-207`). Its OK line (`:381-385`) prints *"N sidecar rasterRef(s)"*
 *     and appends *"the sidecar arm is VACUOUS today and says so"* ONLY when the
 *     set is empty — so at `6e2495a5` it prints `1 sidecar rasterRef(s)` and no
 *     vacuity notice. `tools/test_effects_seam_gate.py` swapped its "NO sidecar
 *     carries a rasterRef" precondition for `test_the_bound_sections_are_exactly
 *     _the_threaded_ones` (derived from the call sites) plus a separate
 *     content row pinning `[5]` — `c9a462be`'s own deliberate change.
 *   • `build.sh` — the gate runs inside `if [[ "$FAST" == "0" ]]` (`:658`) and
 *     `if [[ "${GAME}" == "sonic4" ]]` (`:683`), at `:684`; the FAST banner
 *     (`:224`) still names `effects_seam_gate` among the skipped lanes. So the
 *     `FAST=1` qualifier is still earned, and Aurora still has no such gate
 *     (the STANDING REFUSAL below is unchanged).
 *   • `tools/effects_gen.py` — `ACT_RASTER_REF_KEY` (`:1118`),
 *     `load_section_raster_refs` (`:1203`), the equ name at `:1268`; unchanged.
 *
 * WHAT WAS RETIRED, EXACTLY: `Verified at aeon 9cdf32d8` and `At 9cdf32d8
 * exactly one preset()` moved to `6e2495a5` — the anchor moves because a claim
 * expired, which is a different event from the `1cbb6660` re-read above where
 * nothing had and the anchor was deliberately left; `At 9cdf32d8 no sidecar
 * carries the key, so the seam gate's section arm is vacuous and prints that
 * it is, and no section number here has been exercised end to end` is gone,
 * replaced by the one-sidecar, non-vacuous, exercised-to-the-build wording; and
 * the expiry's first clause (a sidecar carrying the key) is spent. Section 5's
 * "the first choice ... that aeon's build CAN carry" became "carries".
 *
 * WHAT WAS KEPT, ON PURPOSE: the case split keyed on the NUMBER 5 (all three
 * cases; case 2 is still reachable by unbinding); `ONLY SECTION 5 IS WIRED`;
 * the case-3 refusal with both its qualifiers (`nothing here warns, and FAST=1
 * skips that gate`); the split-plus-a-line clause; the ROM-cost clause; the
 * `assign_section_scene` and `assign_section_bg` contrasts; and the viewport
 * clause word for word (`for section 5 as much as for any other`), because a
 * sidecar in aeon's tree changes NOTHING about what this viewport draws.
 *
 * ⚠ "HAS ANYONE SEEN THE BAND": RULED NARROW, FROM COMMITTED ARTIFACTS ONLY.
 *   • `c9a462be`'s message: *"NOT VERIFIED: nothing has been seen on screen. No
 *     emulator was run for this commit. That the band RENDERS is the next
 *     measurement and it is not proven by any of the above."* — a committed
 *     statement, and it is the one the sentence now cites.
 *   • `6e2495a5` (DEFERRED_WORK.md, "OWNER SIGHTING, MEASURED BUT NOT
 *     EXPLAINED") records the owner looking at master's build — romBytes
 *     736391, which IS the post-step-6 debug ROM — but what was measured is the
 *     per-column change rate of the LEFT-EDGE STRIP in effects-lab scene 14
 *     (13.4% vs a 10.6% body). Neither the azure band, section 5, nor CRAM line
 *     2 entry 8 is mentioned. That is a build carrying the band being looked
 *     at; it is not a record of the band rendering, and it is not cited as one.
 *   • `docs/lane-log.jsonl` 2026-08-30T01:32:50Z ("the colour bands do reach
 *     the screen") predates step 6 by eleven hours and is about aeon's three
 *     hand-authored test bands (1.64% of the screen), not this document.
 *   So: aeon's own words say not seen; Aurora's own measurement is "no CRAM was
 *   sampled here"; and the sentence says both, each attributed. When aeon
 *   commits a measurement, that clause expires — it is in the EXPIRES list.
 *   • RESOLVED, 2026-08-30, LATER: aeon committed the measurement. `4a4d3474`
 *     ("step 6 measured: the section-5 authored band IS SEEN on screen") adds
 *     `docs/research/reference_captures/2026-08-30-sec5-band/`, and the
 *     sentence now cites THAT — the README's own values, its control, and its
 *     own list of what it does not establish — in place of `c9a462be`'s "not
 *     seen". The Aurora half is unchanged and still true: no CRAM was sampled
 *     here, and this viewport draws none of it. The block after next records
 *     the re-read.
 *
 * THE NEW EXPIRY, dated 2026-08-30, owner aeon's lane (Aurora's for the last):
 * a second section threaded; `sec: 5` moving; section 5's sidecar no longer
 * naming `ojz_sec5_showcase`; the seam gate's case-3 arm removed or `build.sh`
 * running it under `FAST=1`; a committed aeon artifact recording the section-5
 * band as MEASURED on screen (⚠ FIRED at aeon `4a4d3474`, the same afternoon —
 * the expiry IN FORCE is the one in the last dated block of this header); or
 * this viewport compositing a `rasterRef`.
 * EVALUATE, DO NOT OBEY — and the re-read list gained the sidecar directory,
 * because "which sidecars carry the key" is now a live question rather than a
 * vacuity.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-30, LATER AGAIN: THE FIFTH CLAUSE FIRED AT AEON `4a4d3474` — RETIRED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Read at aeon `origin/master` = `e6405428` (three commits past `6e2495a5`
 * that touch the captures: `4a4d3474` adds the directory, `778c0f67` and
 * `e6405428` amend one README paragraph — the aurora-SHA one — and nothing
 * else; every `.cram.txt`/`.json`/`.png` blob is byte-identical between
 * `4a4d3474` and `e6405428`). `4a4d3474` is an ancestor of `origin/master`
 * and `c9a462be` is an ancestor of it. Read through `git -C ../aeon show
 * e6405428:<path>`, never their working tree.
 *
 * WHAT THE ARTIFACT SAYS, IN ITS OWN WORDS (README.md at `e6405428`):
 *   • *"VERDICT: BAND SEEN. On the bound ROM, warped into section 5, CRAM line
 *     2 entry 8 reads `$0EA4` at screen lines 40, 56 and 72 and `$0000` at 8,
 *     20, 96 and 150 — all seven within one frame (259) — on two independent
 *     private emulator instances whose tables and frames are byte-identical.
 *     On the control ROM (same tree, `rasterRef: null`) the same entry reads
 *     `$0000` on every line and `Raster_Program` is 0. The vacuity check
 *     (in-band == out-of-band) did not fire."*
 *   • `bound-A-sec5.cram.txt` is seven lines: `8 out $0000`, `20 out $0000`,
 *     `40 in $0EA4`, `56 in $0EA4`, `72 in $0EA4`, `96 out $0000`,
 *     `150 out $0000`; `bound-B` is the same blob. `control-sec5.cram.txt` is
 *     `$0000` on all seven, the in-band rows marked `wb`.
 *   • `bound-A-sec5.json`: `raster_program` `$013ACE` =
 *     `EditorRaster_OJZ_Act1_ojz_sec5_showcase`, `sidecar_rasterRef`
 *     `ojz_sec5_showcase`, `flat_section` 5, every sample `ok: true` in frame
 *     259, `vacuity: "1 distinct in-band value(s) vs base $0000 — not
 *     vacuous"`; `control-sec5.json`: `raster_program` `$000000`,
 *     `sidecar_rasterRef` null.
 *   • Bound ROM: aeon `6e2495a5`, `DEBUG=1 ./build.sh` canonical, crc32
 *     `476e220f`. Control: aeon `7c7c5981` (sidecar `rasterRef: null`,
 *     reverted at `2ebcd76a`), `FAST=1 DEBUG=1` because the canonical build
 *     REFUSES the control tree on three content tests; the two ROMs differ in
 *     exactly 5 bytes (checksum + `OJZ_Preset_Sec5`'s `ep_raster`).
 *   • WHERE: *"Oracle's Rust core (`oracle-aether`, private headless instance
 *     per run), not a console; there is no console to settle it on."*
 *   • WHAT IT SAYS IT DOES NOT ESTABLISH: the exact transition lines (32/80
 *     are pinned by the build-time decode, not here); any CRAM entry but `$50`;
 *     any camera position but one; a walked crossing; motion; hardware.
 *   The dispatch's description of the measurement matched the artifact on
 *   every value; the artifact is what the sentence quotes.
 *
 * THE KEPT CLAUSES, RE-READ AT `e6405428` (line numbers moved; facts did not):
 *   • `ojz_effects.emp` — still exactly one `raster:` argument calling the
 *     chooser, `:1079`, `sec: 5`. (a) and (b) have not fired.
 *   • `games/sonic4/data/editor/ojz/act1/` — still only `section_0`,
 *     `section_4`, `section_5` sidecars; only section 5's carries `rasterRef`.
 *   • `effects_scenes.emp:163` `EditorRaster_OJZ_Act1_Bindings = 1`, `:213` the
 *     arm. `effects_seam_gate.py:133` `raster_seam_faults`, `:207` `exit(1)`,
 *     `:384` the VACUOUS notice only on an empty set. `build.sh:667` `FAST ==
 *     "0"`, `:692-693` `sonic4` + the gate; banner `:224`. `effects_gen.py`
 *     `:1118`/`:1203`/`:1268` unchanged.
 *
 * WHAT WAS RETIRED, EXACTLY: *"and no further: aeon's c9a462be says in its own
 * words that nothing has been seen on screen"* — replaced by *"and once past
 * them in aeon's tree: aeon's 4a4d3474 (…) records the section-5 band MEASURED
 * on screen in aeon's emulator capture"* with the README's values, its control
 * and its instrument named; the fired expiry clause is spent and gone; every
 * `Verified at`/`At` anchor moved `6e2495a5` → `e6405428` because a claim
 * expired (the same event as O56, not the `1cbb6660` non-firing). `c9a462be`
 * stays where it is provenance (the sidecar commit).
 *
 * WHAT WAS KEPT, ON PURPOSE: *"no CRAM was sampled here"* — still true, nothing
 * in Aurora sampled anything — and it now sits beside *"nothing of that frame
 * is visible in this editor"*, so the sentence says WHERE the band was seen
 * (aeon's capture, in aeon's tree) one sentence away from the viewport clause
 * (*"for section 5 as much as for any other … the viewport does not composite
 * a rasterRef"*), which is unchanged word for word. The hazard this retirement
 * exists to guard: "aeon measured the band on screen" drifting into "you can
 * see it here". Both halves are pinned separately. The case split, the FAST=1
 * qualifier, the ROM-cost clause and both `assign_section_*` contrasts are
 * untouched.
 *
 * THE NEW EXPIRY, dated 2026-08-30, owner aeon's lane (Aurora's for the last):
 * the four carried clauses; PLUS `docs/research/reference_captures/
 * 2026-08-30-sec5-band/` leaving aeon's tree or its README no longer saying
 * what the sentence quotes; PLUS a later aeon measurement of section 5
 * recording something else; or this viewport compositing a `rasterRef`. The
 * re-read list gained the captures README, for what was measured and what it
 * says was not. EVALUATE, DO NOT OBEY.
 *
 * ⚠ TAGGED, NOT DONE HERE: `providers/effects-preset.ts`'s `NO_PREVIEW` ("A
 * raster band has never been looked at on screen anywhere in this suite") and
 * the comments around it are now false at `4a4d3474`, and so is
 * `band-preset-wording.test.ts`'s rationale for its NO_PREVIEW row. That is a
 * different sentence with a different subject (ground truth to preview
 * against) and its own harness rows; it is named here so it is not found
 * stale later, and left for its own parcel. (Done 2026-08-30, O64, branch
 * `parcel/o64-no-preview-expiry`: `NO_PREVIEW` cites the same capture as the
 * one frame a preview could be checked against, says none is built, and
 * carries its own dated EXPIRES list. This limit was not touched by it.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-30, O62: THE BOUND SET IS UNDER TEST TOO — AN EIGHTH FACT, NOT A RETIREMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every block above is about how far ONE binding travels. This one is about
 * the TREE a binding or an unbind leaves behind, and it ADDS a clause rather
 * than retiring one: nothing kept above expired, so `Verified at aeon
 * e6405428` stays where it is (provenance, per the `1cbb6660` ruling) and the
 * new clause carries its own anchor — `read at aeon 027ec162` — because that
 * is the revision its claims were read at. Two SHAs in one sentence, each
 * dated to what it vouches for, rather than one SHA restamped over claims it
 * did not establish.
 *
 * Read at aeon `origin/master` = `027ec162` (four commits past `e6405428`,
 * all d-34 ceiling-band work; `git diff --stat e6405428 027ec162` over
 * `tools/`, `build.sh`, the editor and effects data and the captures touches
 * ONE file, `tools/test_slope_symmetry.py` — none of the three tests below,
 * not `build.sh`, not a sidecar or a document. Measured, and the first draft
 * of this line said "nothing under tools/" before the diffstat was run),
 * through `git -C ../aeon show origin/master:<path>`, never their working
 * tree:
 *
 *   • `tools/test_effects_seam_gate.py::TestRasterSeamAgainstTheRealTree`:
 *     `test_the_bound_sections_are_exactly_the_threaded_ones` (`:331`) —
 *     `assertTrue(bound, "no sidecar carries a rasterRef — step 6's band is
 *     gone")`, then `set(bound) <= threaded` with *"sections [...] bind a
 *     rasterRef that no preset threads"*; and
 *     `test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document`
 *     (`:358`) — `assertEqual(sorted(bound), [5], "the bound sections are
 *     {…}, not [5]")` plus `assertIn(bound[5], presets)`. Its docstring says
 *     the `[5]` is a CONTENT assertion kept separate so a content change
 *     cannot look like a mechanism failure — which is exactly why the
 *     sentence names the literal.
 *   • `tools/test_raster_cycle_table_lint.py::test_every_preset_document_is_
 *     REACHABLE` (`:228`) — every document under
 *     `games/sonic4/data/editor/effects/presets/` must be named by a
 *     `.raster_table` row OR bound by a sidecar; *"reachable by NOTHING:
 *     {orphans}"*. Two documents exist there: `authored_probe` (row 1 of
 *     `ojz_scroll_test.emp`'s `.raster_table`, `:1733`) and
 *     `ojz_sec5_showcase` (sidecar only). So unbinding section 5 — or
 *     re-pointing it at `authored_probe` — orphans `ojz_sec5_showcase`.
 *   • `build.sh` — the pytest sweep (`:493-499`, `python3 -m pytest
 *     "${TOOLS}"`) sits inside `if [[ "${NO_LINT:-0}" == "0" ]]`
 *     (`:447-519`), and `FAST=1` sets `NO_LINT=1` at `:235` ("One switch for
 *     the whole source-gate block below"); the banner at `:223` lists
 *     `pytest tools` among the skipped lanes. ⚠ The dispatch described this
 *     as an `if [[ "$FAST" == "0" ]]` block; the mechanism is one level
 *     removed, and the sentence says the mechanism, because `NO_LINT=1` alone
 *     (or `--no-lint`) skips it too and an author reading "FAST=0" would not
 *     know that.
 *   • `docs/research/reference_captures/2026-08-30-sec5-band/README.md`,
 *     *"The canonical build REFUSES the control tree, by design"* — their
 *     control (sidecar `rasterRef: null`) exited 1 in the pytest lane with
 *     three failures and was built with `FAST=1 DEBUG=1`. ⚠ That README's
 *     bullet list attributes the two seam-gate messages to each other's test
 *     (`:39-40`); the sentence quotes the SOURCE's pairing, not the README's.
 *   • WHICH TREES FAIL WHICH: unbind section 5 → all three (empty set fails
 *     `:331`'s assertTrue and `:358`'s `[5]`; the orphan fails `:228`);
 *     delete the document too → `:228` passes, the other two still refuse
 *     (the aeon lane's "the first test alone decides" is one test short);
 *     bind another section beside 5 → `:331` (unthreaded) and `:358`
 *     (`[5, N]`); move the binding to another section → the same two, and
 *     `:228` passes because the document is still bound.
 *
 * ⚠ THE STANDING REFUSAL BELOW IS UNCHANGED AND THIS IS ITS FIRST REAL TEST.
 * Aeon's content tests are a snapshot of one act's layout — the very thing the
 * refusal says this editor must not turn into a gate. So: the empty option is
 * not disabled, there is no confirm dialog, and the write always lands. The
 * instrument is the sentence, on the reply and in the block above the select.
 *
 * ⚠ THIS CLAUSE'S OWN EXPIRY is inside the sentence (four falsifiers, owner
 * aeon's lane, three files to re-read). It is narrower than the sentence's
 * main EXPIRES list on purpose: a second threaded section would fire both.
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
  + 'that section\'s .meta.json sidecar, and aeon\'s build NOW READS IT. Verified at aeon e6405428 '
  + '(2026-08-30): tools/effects_gen.py resolves rasterRef against the preset documents and emits '
  + 'that section\'s raster program together with the chooser that selects it, refusing an id that '
  + 'names no preset document BY NAME with the known ids listed — and refusing a numeric rasterRef, '
  + 'which matters because this editor\'s own sidecar parser nulls a non-string silently, so the '
  + 'build is the last reader that can still see that mistake. WHICH SECTION YOU BIND NOW DECIDES '
  + 'WHAT HAPPENS, AND ONLY SECTION 5 IS WIRED. At e6405428 exactly one preset() in aeon\'s '
  + 'games/sonic4/data/effects/ojz_effects.emp passes the chooser to its raster: channel — '
  + 'OJZ_Preset_Sec5, as raster: ojz_act1_sec_raster(sec: 5, hand: Raster_Program_None) — and '
  + 'SECTION 5 IS BOUND: aeon\'s c9a462be commits section_5.meta.json carrying rasterRef '
  + 'ojz_sec5_showcase (authored here, through this writer), so EditorRaster_OJZ_Act1_Bindings is 1 '
  + 'and the chooser resolves sec 5 to that program — the first choice made in this editor that '
  + 'aeon\'s build carries to a raster channel. Leaving section 5 unbound resolves to that hand: '
  + 'label and changes nothing. BINDING ANY OTHER SECTION STILL REACHES NOTHING: those presets hand '
  + 'raster: a literal, so the key is written, aeon\'s witness counts it, and no program follows it. '
  + 'That case is no longer SILENT — aeon\'s tools/effects_seam_gate.py refuses a full build for it '
  + 'and names the section and the id — but the refusal is aeon\'s alone: nothing here warns, and '
  + 'FAST=1 skips that gate. AND THE BOUND SET ITSELF IS PINNED BY AEON\'S FULL BUILD, WHICH THIS '
  + 'EDITOR CAN MOVE: read at aeon 027ec162 (2026-08-30), section 5 bound to ojz_sec5_showcase is '
  + 'the ONLY state aeon\'s canonical build accepts — three content tests in build.sh\'s pytest '
  + 'lane refuse every other tree: tools/test_effects_seam_gate.py::TestRasterSeamAgainstTheRealTree'
  + '::test_the_bound_sections_are_exactly_the_threaded_ones, its sibling '
  + 'test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document, and '
  + 'tools/test_raster_cycle_table_lint.py::test_every_preset_document_is_REACHABLE. UNBINDING '
  + 'SECTION 5 — null from this tool, or the select\'s Hand-authored raster option — leaves the '
  + 'bound set empty and the document ojz_sec5_showcase.json orphaned, and all three refuse that by '
  + 'name: "no sidecar carries a rasterRef — step 6\'s band is gone", "the bound sections are [], '
  + 'not [5]", and "reachable by NOTHING: [\'ojz_sec5_showcase\']" (delete the document too and '
  + 'the lint passes; the first two still refuse). BINDING ANY OTHER SECTION, beside 5 or instead '
  + 'of it, fails the exact-[5] assertion (sorted(bound) must equal [5]) and the threaded-set one, '
  + 'on top of the seam gate above; re-pointing section 5 at any other document orphans '
  + 'ojz_sec5_showcase. That refusal runs only in the canonical FAST=0 build: FAST=1 sets '
  + 'NO_LINT=1, the pytest lane sits under NO_LINT, and FAST=1 builds the tree — which is how aeon '
  + 'built its own control ROM (docs/research/reference_captures/2026-08-30-sec5-band/README.md, '
  + '"The canonical build REFUSES the control tree, by design"). NOTHING HERE PREVENTS THE WRITE: '
  + 'the sidecar takes whichever state you choose, and you meet the refusal at aeon\'s next FAST=0 '
  + 'build or not at all. THAT CLAUSE EXPIRES when the [5] literal in '
  + 'test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document changes, when those tests '
  + 'are renamed or the pytest lane leaves the NO_LINT block that FAST=1 switches off, when '
  + 'test_every_preset_document_is_REACHABLE drops its sidecar arm, or when a second binding ships '
  + '— owner: aeon\'s lane; before quoting it, re-read tools/test_effects_seam_gate.py, '
  + 'tools/test_raster_cycle_table_lint.py and build.sh. '
  + 'Wiring a second section is a preset split plus one call-site line in '
  + 'aeon, not authoring the effect: sections 6-8 share one record, and a section-keyed chooser '
  + 'threaded into a shared record is itself a seam-gate refusal. Nor is there anything to look at '
  + 'here, for section 5 as much as for any other: the band-preset panel now carries a per-section '
  + 'raster select, but binding one draws nothing — the viewport does not composite a rasterRef, so '
  + 'unlike assign_section_bg — whose ref the viewport does composite — this assignment changes '
  + 'nothing on screen. A preset document costs ROM whether or not any section binds it, since aeon '
  + 'emits one program per document. Unlike assign_section_scene, which is baked. At e6405428 '
  + 'exactly one sidecar carries the key (section 5\'s), so the seam gate\'s section arm is no '
  + 'longer vacuous: it counts 1 sidecar rasterRef and checks it against the threaded set. Section '
  + '5 has been exercised from this editor\'s writer to aeon\'s generator and build, and once past '
  + 'them in aeon\'s tree: aeon\'s 4a4d3474 (2026-08-30, docs/research/reference_captures/'
  + '2026-08-30-sec5-band/) records the section-5 band MEASURED on screen in aeon\'s emulator '
  + 'capture — its README reads CRAM line 2 entry 8 as $0EA4 at screen lines 40, 56 and 72 and '
  + '$0000 at lines 8, 20, 96 and 150, all in one frame, on two bound runs that agree byte for '
  + 'byte, and as $0000 on every one of those lines on the control ROM built with the sidecar\'s '
  + 'rasterRef null — taken on their headless oracle-aether instance, not hardware. That is aeon\'s '
  + 'measurement of aeon\'s build: no CRAM was sampled here, and nothing of that frame is visible '
  + 'in this editor. EXPIRES when a second section is threaded, when sec: 5 becomes another '
  + 'index, when section 5\'s sidecar stops naming ojz_sec5_showcase, when '
  + 'tools/effects_seam_gate.py stops refusing the unthreaded case or build.sh runs it under '
  + 'FAST=1, when docs/research/reference_captures/2026-08-30-sec5-band/ leaves aeon\'s tree or its '
  + 'README stops saying what is quoted here, when a later aeon measurement of section 5 records '
  + 'something else, or when this viewport learns to composite a rasterRef — owner: aeon\'s lane '
  + 'for all but the last, which is Aurora\'s. Before quoting this, re-read '
  + 'games/sonic4/data/effects/ojz_effects.emp for which sec: indices its raster: arguments pass, '
  + 're-read games/sonic4/data/editor/ojz/act1/ for which sidecars carry rasterRef, re-read '
  + 'tools/effects_seam_gate.py and tools/effects_gen.py, and re-read '
  + 'docs/research/reference_captures/2026-08-30-sec5-band/README.md for what was measured and '
  + 'what it says was not.';
