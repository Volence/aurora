# Aurora review bars — read WHEN REVIEWING RETURNED WORK, not at boot

*(Split out of `docs/OVERSEER.md` on 2026-09-04 under the owner's card-7 ruling and the
protocol's SPLIT BY WHEN A RULE IS READ amendment, empyrean `79498f7`: the boot file keeps
what a fresh session needs to ACT AT BOOT; a rule that matters only at a specific moment moves
to a file the lane reads at that moment and names from the boot file by path.*

**Read this before judging a returned parcel, before landing, and when writing a dispatch's
review clause.** Every bar below has caught a real defect in this repo. The section is moved
**verbatim**; nothing was rewritten, condensed, or renumbered in the move, and the cut is
proven lossless by line-and-token count in the landing commit.)*

## Aurora-specific review bars (beyond the protocol's)

Each has caught a real defect here.

1. **The node suite cannot see React, canvas, or a running app.** ~3,400 vitest tests
   pass while a feature is visibly broken. Anything whose behaviour is a rendered
   surface, a mouse gesture, an IPC round trip or a live emulator needs a
   `scratchpad/*-harness.mjs` driving the real app under CDP. Three defects in ten
   minutes of real use is the observed rate for UI shipped on unit tests alone.
2. **Plant a violation before believing any guard.** Guards that assert nothing are the
   dominant defect class in this repo. Red-first, restored, with the failing assertion
   quoted — and `grep` the call site first: a defect planted in the wrong function
   (there are usually two near-identical dispatch lines) survives a full build-and-run
   cycle looking convincing.
2b. **A guard can be aimed at the WRONG OBSERVABLE, and planting a violation does not test that.** Bar 2 asks whether a guard fires; it does not ask whether the guard is watching the right quantity. Both can be wrong at once, and then the plant reports green and reads as coverage. Precedent (2026-08-22, `section-column-harness.mjs`, ROADMAP row 19): `c1` — "no section paints over the one below it" — compared **border-box** positions (`a.section.bottom > b.section.top`). The defect it existed for, the 954px effects-panel shape, paints a section's *children* below its own box **while the box stays exactly where flexbox put it**. So no box-geometry assertion could ever detect it; the row was **non-functional**, not merely non-discriminating, and it had shipped with a §7 note disclosing only the weaker property. It took running the poison — which independently turned out to disarm its own judge, reporting 65/65 green — to surface it. **Two questions, asked separately: does the guard fire when the property is violated, and is the guard measuring the quantity the property is about?** The second is the one that looks already-answered. Corollary from the repair: when widening an observable, bound it — `contentBottom` walks descendants for the lowest painted pixel but **stops at any clipping box**, because descending into an `overflow: auto` list would red-flag every capped list in the app. The opposite false verdict, equally useless.

2c. **A uniqueness grep over the SOURCE does not make an assertion's MATCHER unique.** Bar 2 says grep the call site before planting. That protects against two call sites sharing a line; it does nothing about **two different errors sharing a phrase**, and the second is subtler because no grep over the code under test would ever surface it. Precedent (2026-08-22, band promotion, ROADMAP item 27): a red-first plant on *"refuses a range that reaches past the end of the blob"* came back **GREEN with its guard deleted** — the row matched `/has only \\d+ tiles/`, and the **codec's own prefix check** says *"the static tile blob has only N tiles"*. The row had been passing by catching an unrelated rule's error the whole time. Re-cut against the guard's own words plus a boundary row, it fails correctly. **When a poison comes back green, the first suspect is the assertion's matcher, not the guard** — and a matcher loose enough to catch a neighbouring error is a row that will report coverage it does not have, forever, in a suite that looks green.

2d. **RED-FIRST IS NECESSARY AND NOT SUFFICIENT — a poison that comes back GREEN has THREE
   distinct causes, and only one of them is a bad guard.** *(Added 2026-08-22 from the
   `fix/aether-unserved-methods` parcel, where 27 plants went red and **three** of the
   parcel's own new rows went green; refined with the oracle lane, who took it as a bar and
   relayed it live to an agent mid-parcel.)* Bars 2b and 2c are two of these; this row names
   the set so the diagnosis does not stop at the first one that fits.
   - **(i) The matcher is too loose** — bar 2c. One code path, but the assertion's wording
     also matches a *different rule's* error. The observable is unique to the rule; the
     assertion is not. **Fix: re-point at wording only this rule uses.**
   - **(ii) Two independent code paths produce ONE observable** *(oracle's formulation, and
     the distinction is theirs — accepted here)*. Deleting the guard under test leaves the
     **other path** holding the row green. Same symptom as (i), different cause, and the
     matcher bar sends you hunting a matcher that is fine. Instance: a row proving only
     *"it refused"*, satisfied by **both** the advertised-list pre-check and the `-32601`
     reply. **Fix: assert WHICH path ran** — that row now checks whether `emulator/status`
     was called at all.
   - **(iii) The row is measuring the WRONG QUANTITY** — bar 2b. Instance: the fixture left
     `Player_1` resolvable, so the catch the row was named after was **never entered**; it
     was measuring a different gate. **Planting a violation cannot reveal this**, because the
     row never touches the subject.
     **THE REMEDY, added 2026-08-29 from a second instance** *(found by the collision-read
     agent in its OWN harness and reported against my brief rather than quietly fixed —
     banked in its name)*: **a row must PRINT the artifact it judges, or its aim cannot be
     checked by anyone, ever.** `[a1b]` asserted "this ascii window is not all air" over a
     window that WAS entirely air: it stripped row labels with `.slice(1)` +
     `replace(/^\s*\d+ /)`, which leaves the **ones-ruler** intact, and the ruler's own
     digits satisfied *"some character is not `.`"*. It was caught by a human reading the
     printed grid and seeing it empty. The repair is the shape to copy — assert the shape by
     POSITION (the last `h` lines), count the content off the JSON not the picture, and
     cross-check that the two agree: **three rows where there was one, because "the picture is
     right" and "the picture is about the right thing" are different claims.** Corollary: a
     fixture window is **found by scanning**, never assumed — section 0's corner is genuinely
     empty, which is why this survived review.
   **The tell that separates (i) from (ii), which is the pair that gets confused:** ask
   whether the observable is unique to the rule. If it is, the assertion is too loose — (i).
   If it is not — if something else in the system can produce it — the assertion may be
   perfectly precise and still worthless — (ii).
   **Operational form** *(oracle's, and better than asking "did it fire")*: **"if this row
   went green for a reason OTHER than the rule holding, what would that reason be?"** Then
   check that specific reason, and **report the alternative green-path you ruled out** —
   naming what you eliminated is the part that survives review.

2e. **THE UNIFYING FORM FOR 2b-2d, and the three instances are all this lane's.** *(The
   class and its formulation are the empyrean hub's, ledgered by them as Q-20, a
   PROMOTION CANDIDATE — not yet in the shared protocol. Recorded here as theirs, with
   our local precedents, and it should be re-read as protocol if it ever lands there.)*
   **A check can be correctly performed, pass honestly, and assert nothing.** That is not
   a broken check — a broken check fails and gets noticed. It is a correct check aimed one
   step to the side, and its distinguishing property is that **it can only ever return
   green**, so running it produces no evidence at any volume.
   The three instances, all found here, all in different surfaces:
   - **A pinned blob answering a currency question.** A pinned blob equals itself by
     construction, so the gate passes forever and can never detect the drift it exists
     for (the schema-reconciliation scope note under bar 16).
   - **`[ -S "$socket" ]` as a liveness probe.** The inode outlives the process, so it
     reports a corpse as a server — item 36's own measurement, made by a probe written in
     this lane in the session that was checking somebody else's liveness claim.
   - **`min`/`max` on an `<input type="number">` as a bound.** They govern the spinner and
     `:invalid` and stop no typed value; `clampVFactor()` beside them does the actual work
     (item 37).
   **The mechanism, which is why this is a class and not three tips: the vacuous check is
   always EASIER TO WRITE AND EASIER TO READ than the real one, and resembles it closely
   enough that a reviewer's eye stops.** `[ -S ]` is shorter than `ss -lx`. A blob pin is
   local and deterministic where currency needs the remote. `min={0} max={15}` is inline
   at the call site where a clamp lives in another file. **The costume is always
   convenience** — so the suspicion belongs on the check that was pleasant to write.
   **FOURTH INSTANCE, 2026-08-24, MINE — produced hours after banking this class, against
   myself, while arguing about someone else's bug.** Diagnosing a ROM section collision I
   took the span from BUILD output (`ojz_bg_anim [0x3b270, 0x3d29e)`) and grepped the GOLDEN
   boundary table for bases inside it. **Zero hits**, which I reported as *"the damage is
   local to that seam"* and used to withdraw a correct prediction. The golden table has **no
   labels anywhere in `0x38000..0x40000`** — 80 sparse head-labels across a ~668 KB ROM, with
   `BgAnim_Table` at `0x27e70`, nowhere near the span. **The query could return only one
   answer whatever the truth was.** The right observable was the ordering: `BgAnim_Table` is
   label 65 of 80, so **15 labels follow it**, and that set is what "does it cascade" means.
   **The verdict was not weakly supported, it was UNSUPPORTED — and it read as a measurement
   because it had a number attached.** That sentence is the class in one line; keep it.
   ⚠ **And the companion failure, the hub's, which is the same disease with the symptom
   inverted:** their corroborating count used a wrong population (lines, not labels) AND a
   wrong sort (hex as strings) and **still produced the correct 15, by cancellation** — every
   contaminating row sorted upstream of the label, so the error lived in the prefix and
   vanished in the subtraction. **A right answer from two wrong steps, sitting inside a number
   whose job was to corroborate someone else** — which is the worst possible host, because a
   corroboration is the one claim nobody re-checks once it agrees.
   **Operational form: name the property, then ask what a GREEN result would have ruled
   out. If nothing, the gate is vacuous however correct it is.**
   ⚠ **SHARPER GENERAL FORM, and it is the sigil lane's** *(2026-08-27, given back after
   watching this bar fire on my own hour-old rule — see the assembler-banner entry under
   Quirks)*: **a vacuous check is one whose FAILURE STATE AND SUCCESS STATE EMIT THE SAME
   ARTIFACT.** That is a test you can run on a rule you just wrote, without knowing anything
   about the subject, and it is strictly easier to apply than "what would green have ruled
   out". Instance, mine: a bar reading *"this field is vacuous until sigil fixes it"* is
   itself vacuous, because the field cannot report its own repair — so following the rule
   correctly yields *they never fixed it* whether they did or not. **The place to run this
   check is on your OWN newly-written bars**, which is where nobody runs it; a rule is at its
   most convincing in the hour after you write it. Companion enumeration lesson from the same
   exchange: **enumerate across instances rather than reasoning within one.** One cross-lane
   table of `docs/lane-status.json` produced two live findings pointing OPPOSITE ways — sigil
   reporting dirt that meant nothing, aeon *having* dirt that meant nothing and blaming the
   wrong subsystem for it. Neither lane could see its own from inside its own repo. This subsumes bar 2's
   red-first plant rather than replacing it: a plant answers "does it fire", and this
   answers "could it ever have failed".
   **Note how the third one was found, because it is Q-16's discriminator firing BY
   ACCIDENT for the third time** *(the hub's observation, and it is a warning not a
   compliment)*: I went to read the mechanism bounding the SAFE field expecting to CONFIRM
   it, and found the mechanism was somewhere else entirely. Nobody was auditing the
   enumeration. **A discriminator that only fires by luck is not yet a practice** (bar 21
   in the shared protocol), and this is the instance that proves it still is not one here.

2f. **READ THE ARTIFACT, NOT THE STORY ABOUT IT — it ended THREE disagreements in one day
   where argument ended none** *(2026-08-24, across aurora/aeon/empyrean; the arc-level
   finding of the BgAnim ROM attempt)*. Each time, two lanes reasoned carefully in opposite
   directions and **one file read settled it in a single command**:
   - *Which section was deferred?* Three lanes carried "BgAnim is the deferred one" as a
     **premise nobody ever cited, and therefore nobody ever checked**. `map.toml:73` says the
     order check keys on **head-labels**, and `BgAnim_Table` was in the list all along.
   - *What is the reserved slot for?* The comment names its subject in its **own first line**
     — `ojz_effects_editor_act1`, a different tool's section. Two of us opened that comment at
     the line we had been pointed to and missed the two lines above it.
   - *Does the collision cascade?* Neither lane's argument settled it. `map.toml:166-176`
     declares `[[anchor]] dac_banks at = 0x48000`, **hardware-pinned because the Z80's
     `SetBank` latches the LMA**, so growth is absorbed before it: **five labels shift, not
     fifteen.** Bounded re-derivation, not a full re-baseline.
   **The tell that you are about to need this: everyone agrees on a premise and nobody has
   cited a line for it.** That is not consensus, it is an uncited joint (bar 18b's shared
   frame), and the cheapest possible move is to open the file it lives in.
   **Corollary on counting defects across seats** *(aeon's, and it is right)*: a tally of who
   was wrong most often measures **exposure, not competence** — whoever sends the most
   checkable numbers generates the most caught errors. Reading it the other way punishes
   exactly the behaviour that makes the catching possible.

2g. **A GAP BETWEEN BOUNDARY LABELS IS NEVER EVIDENCE OF FREE SPACE — and a rule that
   forbids a conclusion MUST NAME THE INSTRUMENT that can reach it** *(2026-08-24; my
   formulation, adopted by the aeon lane as a repo bar at their `2625718b`)*. A boundary
   table lists a **subset** of labels, so everything between two listed entries is invisible
   in it **by construction**. Reading a gap as room is therefore not a slip — the instrument
   *cannot* answer occupancy, and it returns a clean confident number anyway.
   **Instance, three lanes, three hours, three revisions of one figure.** A ~119 KB gap
   before a hardware-pinned anchor was reported as slack, and I carried it to the owner
   twice. It is **Sonic**: `AngleTable`, `SolidityTable`, `Map_Sonic`, `DPLC_Sonic`,
   `Art_Sonic`. Measured on the image, 43.8% zero. Real free tail: **11,427 B** — and even
   that sits inside `Art_Sonic`'s allotment, so spending it shrinks what the game's most
   growth-prone art may grow into. **Only the `.lst` or the ROM image can answer this.**
   ⚠ **THE HALF THAT WAS MISSING, and why knowing the rule did not help.** Our booking
   already said *"a gap is an ALLOTMENT, never proven free space"* — and then committed the
   error two paragraphs later on a different label pair. **A prohibition without a named
   instrument leaves everyone holding the only tool they have, and using it correctly, and
   getting the wrong answer politely.** When banking a "do not conclude X from Y", the bar is
   incomplete until it says what DOES conclude X.
   **PROPAGATION COROLLARY — an arithmetic step built on someone else's number looks like
   CORROBORATION and is PROPAGATION.** I took a peer's slack figure and derived a margin from
   it with my own arithmetic. My step was sound, my number was mine, and it read to both of us
   as independent confirmation — while carrying their error intact. **Doing real work on top of
   an unverified input launders it**, and it is *more* convincing than repeating it, because
   the second party visibly computed something. **The check is on the INPUT's provenance, not
   on your own step**: before deriving from a peer's figure, ask which instrument produced it.
   (This is bar 19's echo-versus-corroboration at one remove — the parameters differed, so it
   looked independent; the *source* did not.)

2h. **TRUNCATION LEAVES NO MARK — `head -N` on a definition you then make a COMPLETENESS
   claim about** *(2026-08-24, the aeon lane's, against themselves; banked here because this
   lane reads files this way constantly)*. They claimed "exactly two length-variable fragment
   kinds", having read a 94-line type through `head -40`. There are **three**, plus a fourth
   kind their argument structurally could not reach. The conclusion survived — on a different
   check than the one presented as the rigorous half.
   **Why it belongs beside bar 16(d) rather than inside it.** A suppressed error and an empty
   world produce the same output, which is bad enough; **truncation is worse, because the
   output looks like a COMPLETE ANSWER rather than an empty one.** `2>/dev/null` destroys a
   correcting signal; `head -N` fabricates a plausible whole. There is no exit status to check
   and nothing on screen says "there was more".
   **Operational form: a window is not a document.** Before any claim of the form *"there are
   exactly N"*, *"the only X is"*, or *"nothing else does this"*, **re-read the subject
   unwindowed** — `wc -l` it, or `sed -n` the full range, or grep the whole file — and say
   which you did. Reading a window is fine; **concluding over one is not**, and the tell is
   that the sentence quantifies.

3. **Anti-vacuous rows.** A row that would pass on an empty screen, an unloaded project
   or a blank chunk proves nothing. Assert the instrument saw its subject. A stamp-ghost
   check once "passed" against `OJZ $45`, which is legitimately blank.
4. **Same-destination-two-ways for anything about state.** To ask "did X corrupt this?",
   reach the same state by a path known good and by the path under test, from ONE
   checkpoint, and diff. Then diff the known-good path against ITSELF and require zero,
   or the comparison is measuring nondeterminism.
5. **Report the regime; don't conclude past your evidence.** A row that cannot separate
   two hypotheses must say so in its own text. "Terrain snap falsified" was published
   from six samples that could not distinguish it from an unsimulated player.
6. **A suspiciously clean constant across varied inputs is evidence of a CONFOUND.**
   Two independent probes produced the same stable wrong number from two different
   confounds (unfinished falls; two warps in one boot). Vary what the confound holds
   fixed — fresh boot per sample, settle before reading — before believing it.
7. **Check the SERVER's rule before writing the call.** `require_paused` was missed three
   times in one day by reasoning about what an operation *does* instead of reading
   `oracle-next/crates/oracle-aether/src/engine.rs`. Grep the gate; do not infer it.
8. **Plans state the PROPERTY, never invented fixture numbers.** Nine defects came from
   plans carrying guessed values; the dispatches that stated the property produced zero.

9. *(Now also in the shared protocol, `43fbfc9` — kept here with its local precedent.)*
   **Check the CLASS of every SHA before it hardens into a citation.** A docs-only commit
   cited as the anchor for a code guarantee is invisible once it is in prose, and these
   citations cross repos — two other repos' contract docs pinned Aurora SHAs on
   2026-08-22. `git show --stat` it and cite the **merge** that put the code on master,
   not whatever master happened to be when you typed the message. Both of that night's
   outcomes are the precedent, and the pairing is the point: `945f5c6` (2 insertions,
   `docs/ROADMAP.md` only) went out as the anchor for a 472-line collision-plane fix and
   was wrong — the code anchor was `6fc7359` — while `a88db05`, sent the same casual way
   in the same message, was a genuine merge and held. One miss in two. **The rule polices
   citations, not reputations**: checking is the discipline, and the receiver's `--stat`
   is what caught it in both directions.
9b. **The ROADMAP row is the LAST thing to move on every item, so it is ALWAYS the freshest and best-named commit when you go to cite — and it is never the code.** This is bar 9's failure with its cause identified, and the cause is *this lane's own workflow*, which is why vigilance does not fix it. Precedent (2026-08-22, caught by the aeon overseer): a message whose **entire purpose** was converting paths into citable anchors after a push cited **three** SHAs for code guarantees — `ade34d2` for "the band model + atomic add/remove command", `df32a469` for "promotion/demotion", `d3227c4` for "canonical serialization adopted". `--stat` on all three: **`docs/ROADMAP.md | 2 +-`**, one line each (`df32a469` adds two more in `OVERSEER.md`). Zero code. The real anchors, one commit over: `d20c94d` (band model, 1507 insertions), `55be1d1` + `5e347fe` (promotion/demotion — the lossless claim lives in `55be1d1`), `0376039` + `b8e5ca5` + `f36b3a4` merged at `de04099` (canonical serialization).
   **The mechanism, not a habit:** every item here ends with a `docs(roadmap): item N …` commit, so `git log --oneline` hands you a semantically perfect-sounding line — *"item 27 landed — the last link closed"* — while the code merge sits two commits back with a duller name. **Never pick an anchor off `git log --oneline`. Ask git which commit touched the code**: `git log --format=%H -1 -- <source path>`, then `--stat` it. **If the citation and the `--stat` disagree about what kind of thing it is, the `--stat` wins.**
   **And note what did not catch it:** the reachability check passed. All four SHAs were `--is-ancestor` of the pushed tip and every claim in the message was true. **`--is-ancestor` and `--stat` are different questions, and only the first gets run by habit** — which is why a correct, freshly-verified push message is exactly where this hides.

10. *(Illustration, not a new rule — this is the shared protocol's "derived, never
   copied" bar read correctly; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Derive the expectation from the thing it guards, so the two cannot drift.** The
   collattr length check reads `baseline.length * 2` from the loader's *own* fallback
   rather than pinning 131072, so the check and the fallback are the same figure by
   construction. The cleanest worked example in the repo, and the positive form of bar 8
   above (`fix/collattr-unreadable-guard`, merge `6fc7359`).
11. *(Illustration, not a new rule — the shared protocol's faithful-reporting bar applied
   under pressure; ruled local by the empyrean overseer, `43fbfc9`.)*
   **Never manufacture a stronger-looking assertion than the evidence supports.** When
   the natural assertion is weak, prove the claim another way and *say* that is what you
   did. Even-length collattr truncation is byte-identical through a round trip by
   construction (short in, same short out), so the parcel proved that half through
   loader-accepts-then-save-recertifies instead of inventing a byte delta — and stated
   so in its report. A gate that passes for the wrong reason is worse than no gate — and
   this is bar 5's discipline at the moment it is hardest to hold.

12. **Enumerate by what TOUCHES the data, not by what DEFINES it.** Two overseers
   independently counted the section-sidecar ref sites and both got 8; the real count was
   13. Both passes enumerated the *codec* — parse, serialize, the interface, the header —
   and neither asked **what else copies a `Section`**. `cloneSection`
   (`editing/section-ops.ts`) carried all four scalar refs in a hand-enumerated literal
   with no spread and **no test**: deleting `sceneRef` OR `bgLayoutRef` from it survived a
   3909-test suite, so a copy/paste silently losing a section's background or palette
   assignment was invisible. A second hardcoded enumeration at `save.ts:130` was missed
   the same way. When counting the places a field lives, grep for the TYPE and for every
   constructor/copier of it, not just for the field name in its own module.

13. *(Now shared protocol review bar 9, empyrean `c2c81e2` — kept here with its local
   precedent.)* **Never change the subject to suit the instrument.** Chromium clamps
   `performance.now()` to 100µs, and the only supported way to unclamp it is
   cross-origin isolation — i.e. editing the app's security headers. Taking that would
   have measured a *differently configured application* and reported the number as if it
   described the real one. Rejected; the answer was amortised batching instead (12
   repaints per bracket, 6× finer than the tick). A confound wearing a solution's
   clothes. When the instrument can't reach the subject, change the instrument.
14. *(Now shared protocol review bar 10, empyrean `c2c81e2` — kept here with its local
   precedent.)* **A gate whose VERDICT is right while its stated REASON is fabricated is
   more dangerous than a failing gate** — the reason is what a reader carries forward. The
   MapViewport confound row fired correctly, but its spread formula `(hi-lo)/lo` fell
   through a divide-by-zero branch and announced "medians agree to within 0.00%" about a
   set spanning 0.000→0.800ms. The verdict was sound and the justification was noise.
   Read a firing gate's *message* against its data before quoting it, and when repairing
   one, prefer a formula provably no weaker than the original (`(hi-lo)/hi` is always ≤
   the old ratio, so the bar got stricter, not looser).
15. *(Ruled local — this is the shared protocol's "derived, never copied" bar pointed at
   an instrument rather than an expectation; empyrean `c2c81e2`.)* **Measure the
   instrument's claim; don't assert it.** A resolution fix that says "I
   batched, so it should be finer" is unevidenced. The fix that landed pushes three
   workloads in a **known 1:2:4 ratio, each individually below one clock tick**, through
   the identical machinery and recovers 2.00 / 4.00 with zero residual — and separately
   reads the live clock's actual quantum. Evidenced from both ends. Any harness claiming
   a capability should demonstrate it on inputs whose true answer is known in advance.

16. *(Shared protocol, empyrean `9b604f0` — noted here because Aurora already had the
   instinct.)* **Prefer the committed artifact to the recipe that recreates it.** Before
   running a documented rebuild or recovery recipe, check whether the artifact already
   exists as a committed blob somewhere in the suite, and take the blob — verified by
   hashing the extracted bytes, never by trusting the message that pairs them. A recipe
   carried in prose is a *claim* that it still reproduces the artifact; the blob **is**
   the artifact. Local instance: the effects codec pins empyrean's schema by git **blob**
   hash (`cab3ca58…` today, `2d7a9fee…` before item 35's re-vendor;
   `test/formats/effects-schema-drift.test.ts`) rather than by commit,
   because the doc moved twice with the wire shape byte-identical underneath — a commit
   citation would have read stale twice for nothing. The same reasoning is why the
   three-way reconciliation compares **bytes**, not versions. **And the re-vendor is the
   other half of the lesson: when the pin DOES move, extract the new blob
   (`git -C ../empyrean show <rev>:<path> > <vendored>`) and re-hash it — never hand-edit
   the vendored copy to match a diff you read.**

   **Companion clause** (empyrean `e650b96`): look for the artifact at the revision that
   **pinned** it, not at the tip — a golden path is a moving pointer, and for a vintage
   artifact the tip is the one revision guaranteed not to have it. Check reachability
   (`git merge-base --is-ancestor <rev> <tip>`) before depending on a historical blob.
   *A SHA has a class; a path has a time* — and both failures look like a competent
   lookup returning a clean answer.

   ⚠ **Now the shared protocol's own Scope block** (empyrean `aadf63f`, from this repo's
   correction — the text below is the shared rule, not an Aurora fork of it).
   **Two operations here look identical and are not.**
   Do not "correct" the schema reconciliation ritual to compare at the pinning revision.
   The two are different questions:
   - **"Has the contract moved?"** — the ritual. Compare empyrean **at tip** against the
     vendored copy. Comparing at the pinning revision instead makes it **vacuous**: a
     pinned blob equals itself by construction, so the check would pass forever and
     never once detect the thing it exists to detect (bar 11's gate-that-passes-for-the-
     wrong-reason, in its most convincing costume).
   - **"What exactly did we pin?"** — recovery/inspection. That one goes to the pinning
     revision, and the companion clause governs it.

   The tip is right for the first and wrong for the second. Read which question is being
   asked before choosing the revision.

17. *(Shared protocol review bar 11, empyrean `20a8e81` — the set's first
   packaging-of-truth bar.)* **A confidently-offered weak point is a misdirection, even
   in good faith.** "Here is the assumption I think is fragile" should **raise** the bar
   on everything else in the claim, not lower it: a volunteered caveat reads as a
   certificate that the remainder got the same care, and it steers scrutiny toward the
   part the author already doubted — away from the part they didn't. Not a rule against
   caveats; a rule about what a caveat does **not** certify. Cheap check: **read the
   lines around a cited line before accepting what it proves** — a citation is a pointer
   into code that keeps executing past the line you were shown.

   **Local instance, run against an already-landed decision (2026-08-22).** The effects
   codec's no-ajv call rests entirely on one cited line: `src/renderer/index.html:6` is
   `script-src 'self'` with no `unsafe-eval`, so ajv's `new Function` codegen would pass
   every node test and throw in the app. I had accepted that by grepping the line, which
   is exactly the shape this bar warns about — an Electron app can override the page CSP
   from the main process (`onHeadersReceived`) or defeat it with `webSecurity: false`,
   both of which execute far past the line I was shown. **Checked: it holds.** That meta
   tag is the ONLY `Content-Security-Policy` in `src/`, `src/main/` sets no header
   override and no `webSecurity` flag, and `unsafe-eval` appears nowhere in the tree. The
   citation survived reading around it — which is the other reason to run this check:
   a decision that survives it is *verified*, not merely plausible, and the next session
   inherits the stronger claim.

18. *(Shared protocol, empyrean `e33531f` — bar 12 there, plus bar 8's new technique. Both
   came out of this repo's `editor_bg_override.json` arc; recorded here with that
   precedent.)* Two halves of one lesson:

   **(a) A document's universally-quantified rules bind every actor they describe, not
   just the party in its title.** The `editor_bg_override.json` ownership fork was treated
   as an open design question by **three sessions across three repos** — and it had been
   answered the whole time by `empyrean/docs/AURORA_EFFECTS_SCHEMA.md` §6 hazard 1:
   *"The general rule for **every wave-1 writer**: round-trip what you do not understand,
   or refuse the file."* Nobody cited it because the doc is titled as **Aurora's** schema,
   so its rules were read as binding Aurora. `png_to_bg_override.py` is an aeon tool and a
   writer of a document that contract owns; the rule reached it and no one looked.
   **Authoring corollary: a rule meant to bind others must name whom it binds.**

   **(b) Changing the frame means finding the load-bearing step NOBODY cited.** Bar 8 says
   mutual verification cannot catch a shared frame — this is the technique for breaking
   one. The whole prefix finding rests on the bands' DMA base being the tile blob's own
   base; three sessions cross-verified the band geometry, the slot arithmetic and the
   consumer's asserts, and **not one of us checked that step**. Had `BG_TILE_BASE_VRAM`
   (`inject_editor_bg.py:125`, hardcoded `0x8000`) and `BG_TILE_BASE_SLOT`
   (`vram_map.py:25`, `1024`) diverged, bands would land *beside* the static tiles rather
   than over them and the entire report would have been backwards. They don't —
   `1024 * 32 = $8000`, identity confirmed — but that was checked **fourth**, by the one
   session that went looking for the uncited joint. **The shared frame lives in the
   joints, not the links.**

19. **A TEST MUST NOT READ A PEER REPO'S WORKING TREE.** *(2026-08-28,
   `test/formats/effects-scene-curve-vsplit.test.ts`; packet
   `docs/reviews/2026-08-28-golden-live-tree.md`.)* **The shared protocol governs on any
   disagreement with the wording here** — this is that protocol's most upstream rule
   (*"Read this file at a COMMITTED revision, never through the filesystem path"*, and its
   operational form, *"prefer `git show <rev>:<path>` over reading a sibling's working
   file, because the first names a revision and the second silently names 'whatever is on
   disk right now'"*, read at `empyrean origin/main 2fd7b5f0`) applied to the one place
   nobody had swept: **test fixtures**. This entry adds a local instance and a shape, not a
   new rule, and never an exception to one.

   On this machine every sibling repo is some peer lane's live checkout, so a test that
   opens one by absolute path has its colour decided by that peer's uncommitted edits.
   **Precedent:** a byte-exact golden pinned
   `/home/volence/sonic_hacks/aeon/games/…/ojz_act1_depth.json`, which was ` M` and
   uncommitted; it went red when the peer deleted a `vsplit`, and surfaced as
   `TypeError: Cannot read properties of null` inside `EditHistory` — a trace naming no
   peer, no path and no repo. **Three agents and an overseer filed it as "pre-existing,
   unrelated"** without anyone asking why it failed; the suite hub found the cause.

   **The part that outlives the instance:** the test had been **green its whole life, and
   its green meant nothing verifiable** — it had no fixed thing to drift from, so its pass
   and its fail were *both* decided outside this repo. A check like this cannot detect the
   drift it exists for; it can only report the state of someone else's directory, in the
   voice of an assertion about our code.

   **The shape, when a fixture comes from a peer — separate the two questions, they need
   different instruments:**
   - *"Does our code round-trip / handle this document?"* is a property of **our** code.
     **Vendor the fixture into this repo** at a named peer revision with a
     `.provenance.json` beside it (repo, path, revision, blob id, how it was resolved,
     re-vendor command). A pinned blob is **legitimate** here: the property is about the
     behaviour, not about currency. Record the peer's **git blob id**, so the pin is
     *checkable* rather than merely copied.
   - *"Is that pin still what the peer ships?"* a pinned blob **can never answer** — it
     equals itself by construction, so a check written that way passes forever and detects
     nothing. Give it its own check that reads the peer at a **committed** revision
     (`git -C ../<peer> show <rev>:<path>`), **names that revision in its messages**,
     **fails** on drift, and **skips loudly** when it cannot run
     (`SKIPPED, NOT PASSED: … CANNOT MEASURE …`) — never silently, never green. Compare
     **content, not commit SHAs**, so the peer's ordinary commits do not turn this repo
     red. Prefix a cross-repo failure with something like *"NOT AN AURORA REGRESSION"*:
     the triage failure above was readers mistaking a cross-repo signal for an in-repo one.
   - If you judge the currency question not worth a check, **say so and record why. Do not
     leave a check that appears to cover it and does not.**

   **Two corollaries that cost the most to learn:**
   **(a) Proving it passes today is half the property.** The test must still pass when the
   peer's working tree changes — demonstrate it, e.g. by running with the peer repo
   **unreachable entirely**. A golden that passes with the peer absent cannot be reading
   the peer.
   **(b) Deleting the absolute path is not the fix, and can be worse than none.** Routing a
   read through a helper that derives the peer's location removes the literal while leaving
   the read pointed at the same live tree — a change that **looks** like this bar was met.
   Where the real fix is out of scope (this parcel left `s1disasm`'s 37 sites alone for
   exactly this reason), **report it and leave it legible.**

   **Silent skips are the same defect in its purest form.** The sweep also found two
   `describe.skip` blocks pinned to `s4_engine`, **a repo that does not exist on this
   machine** — integration checks that had measured nothing for months as a quiet zero
   inside a green total. `ctx.skip` with a message that says what could not be measured;
   `it.skip`/`describe.skip` discard the reason, and a silent skip and a pass are
   indistinguishable in a suite total.

