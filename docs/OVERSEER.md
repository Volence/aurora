# Aurora Overseer

**Boot prompt** (paste into a fresh session started in this repo):

> You're the overseer for this repo. Read `docs/OVERSEER.md` first, then
> `../empyrean/docs/OVERSEER-PROTOCOL.md`. Work the queue. Peers may or may not be
> running — check `ListAgents`; coordinate if present, proceed solo if not.

The role, delegation discipline, review bars, and peer protocol live in the shared
protocol doc. This file is what's Aurora-specific.

## ⚠ Read the shared protocol at a COMMITTED REVISION, not through the path

*(Added 2026-08-22. This is the shared protocol's own most-upstream rule — empyrean
`baf15c28`, Boot section — recorded here because the boot sequence that would tell you
about it is the one thing that happens before you have read it.)*

```sh
git -C ../empyrean fetch -q origin && \
git -C ../empyrean show origin/main:docs/OVERSEER-PROTOCOL.md
```

`../empyrean/docs/OVERSEER-PROTOCOL.md` is **the empyrean lane's live working tree.** On
this machine every sibling repo is some peer's working directory, so reading the suite's
shared contract by path delivers it out of somebody's uncommitted edits, once per session,
as step two of boot. Boot while that lane is mid-edit and you reason from half-written
rules all session, dispatch agents under them, and bank them as contract — and **nothing
ever looks wrong**, because correct citation discipline applied to a bad source produces a
*more* convincing artifact, not a less convincing one. You go on to cite those rules
accurately and hand peers perfectly-formed anchors to rules that never existed.

Two boundaries, not glossed: `origin/main` can lag legitimately-pushed work, so this trades
an **invisible failure for a visible lag** — the right trade, but a real one. And it is the
*recovery* direction, so it takes freshly-fetched tip and **never** a pinning revision (the
currency-check scope note in the peer section governs the opposite question).

**Re-read mid-session — the boot read is the only one anybody performs.** A long-running
overseer drifts from that document monotonically and nothing prompts a re-read on its own.
Triggers: **when a peer cites a bar you do not recognise, before dispatching a wave of
agents under the bars, and at any landing.**

*This session's own instance, since it is the argument:* this lane booted by path at
`682e2893`, dispatched two parcels, and re-read only when a peer mentioned the defect in
passing. The document had gone **303 → 464 lines** in the interim. Nothing had gone wrong
yet, and there was no mechanism by which it would have surfaced.

**Adopting this read is entirely within a session's own discretion** — it changes nothing
outside the process and touches no config. The `/overseer` skill file still names the path;
three lanes have surfaced that to the owner rather than patching it, which is the correct
posture for a file that is his.

## The queue

**`docs/ROADMAP.md` is the plan of record — read §2.6 then §5.1 and stop.** §2.6 records
what has actually shipped; §5.1 is the open list in order. §2/§3/§5's older claims are
banner-marked where §2.6 supersedes them. The most recent `docs/reviews/*handoff*` packet
carries the arc-level detail, and `docs/superpowers/{specs,plans}/` hold the designs —
read a spec's §0 Corrections block FIRST where one exists; several are authoritative over
everything after them.

Do not duplicate queue content here. This file only says where it is.

## What the overseer implements

Aurora is a TypeScript/Electron app: features, tests and harnesses all go to agents in
worktrees. The overseer's own work is judging returned work, running the **foreground**
runtime harnesses (below — agents cannot), rulings, and landing.

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
   hash (`2d7a9fee…`, `test/formats/effects-schema-drift.test.ts`) rather than by commit,
   because the doc moved twice with the wire shape byte-identical underneath — a commit
   citation would have read stale twice for nothing. The same reasoning is why the
   three-way reconciliation compares **bytes**, not versions.

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

## Editor↔engine coordination points

Protocol details Aurora depends on and did not invent. All measured; re-verify before
trusting, the repos move.

- **Aether client** (`src/main/aether/`). Socket order `$ORACLE_SOCKET` → `$EXODUS_SOCKET`
  → `$XDG_RUNTIME_DIR/oracle.sock` → `/tmp/oracle.sock`; a long path dies on `SUN_LEN`.
  **The handshake is TWO messages** — `initialize` with `clientCapabilities:{events:true}`
  then an `initialized` NOTIFICATION; subscription happens on the second, and skipping it
  gives a healthy connection that silently never receives an event. Feature-detect off
  the advertised method list, never a version.
- **`require_paused`**: `write_memory`, `reload_rom`, `run_frames`, `run_to`, `press`,
  `play_input`. NOT `read_memory`/`read`/`sprites`/`scanlines` (pure reads). Always
  honour `pause`'s `wasRunning` — the bus is multi-client and an unconditional resume
  starts a machine somebody else stopped.
- **Live palette**: write `Pal_Base` (96 bytes = **lines 1–3 ONLY**; line 0 is the
  character palette and the engine never writes it), then set `Pal_Base_Dirty = 1`.
  Payload then flag: the per-frame compose copies the base in only when the flag says so.
  Reading "96 bytes" as four lines is the natural mistake and slides every line by one.
- **Warp mailbox** (DEBUG shape only): `Warp_Req_X`/`Warp_Req_Y` (u16 world px), then
  `Warp_Req_Flag = 1` LAST. The engine clears the flag as its ack (~20 frames) and
  publishes the CLAMPED destination back into X/Y — surface where it LANDED, not what was
  asked. Gate the feature on the symbols resolving so a release ROM greys it out.
- **The DEBUG ROM boots into debug-fly**, whose update reads only the D-pad — the player
  looks frozen and never falls. One `emulator/press` B exits it properly. Never poke the
  pad cells or `debug_flag`.
- **Builds**: `FAST=1 ./build.sh` (~1.3s) is the iteration loop — lanes skipped, loud
  not-a-ship-artifact banner, and it re-bakes stale editor data itself, which is why
  Aurora runs no re-bake of its own. The canonical build fails loud on stale editor data.
  Build the flavour matching the RUNNING ROM (`emulator/status.romPath`), or the reload
  targets a file the build never touched.
- **Level-staleness is an MTIME gate, and `editor_bg_override.json` is on its INPUT side.**
  Raised by the aeon overseer 2026-08-22 as a `project.json` hazard; verified firsthand at
  their pushed master and it is **stronger than the warning given**.
  `tools/level_staleness.py` compares `newest mtime(editor sources) > newest mtime(generated
  tree) ==> STALE` (:30), and the editor-sources list (:134-137) is the editor tree,
  **`games/<game>/data/editor_bg_override.json`**, and `project.json`. So the trap is not
  merely "a save path that rewrites `project.json` unchanged trips it on mtime alone" — the
  BgAnim composition proof writes an input **directly**, which makes the staleness failure
  **certain rather than conditional**. Run `tools/regenerate-level.sh` after the save and
  before the build.
  **Why it matters more than an extra step:** the gate hard-fails *before* a ROM is emitted,
  so a staleness stop presents as the `anims` refusal gate rejecting Aurora's bytes when it
  never judged them. Attribute the failure to a STAGE before reading it as a verdict.
  **Companion, same family as the byte-neutral CRC bar:** if the build does not run, leftover
  ROMs on disk greet you with four matching CRCs from a build that never happened. `rm -f`
  the ROMs first so existence proves freshness.
- **Boot-position override** (DEBUG shape only, aeon `a2a24eb9`, ARCH §4.12b):
  `Boot_At_X`/`Boot_At_Y` (u16 world px) + `Boot_At_Flag`, same clamp/publish-back/
  cleared-flag-ack contract as the warp mailbox, consumed by Build & Run's restore
  (`src/main/aether/boot-restore.ts`) at the run_to-the-init window below. **The
  cleared flag can be FORGED**: a write that lands before the boot clear is zeroed
  along with the flag, which reads exactly like an ack — any check of this sequence
  must verify position via an independent read, never the flag alone. The warp-retry
  fallback (pre-override DEBUG ROMs) inherits this hazard on paused machines and is
  unguarded; it vanishes as ROMs carry `Boot_At_*`.
- **Fresh headless oracle-aether is paused at frame 0** — reads before any resume see
  reset-RAM garbage; and after `reload_rom`, RAM holds the OLD session's values until
  the boot clear runs, so level-up polls must gate on `frameToken`, not on plausible
  values.
- **Boot zeroes all 64KB of work RAM.** A write to a reset-paused machine is gone
  before level init reads it, and the boot proceeds with authored values SILENTLY —
  the client looks finished having done nothing. Anything init must consume is written
  at `reload_rom → run_to <init symbol> → write, flag last → continue`, where the
  machine is stopped at the init's entry and nothing is painted yet.
- **`emulator/reset` is off-limits on the hosted build** until aeon's F-HOSTED-RESET-SRM
  closes — it bypasses the player's `.srm` flush. `reload_rom` is unaffected.
- **`.lst` listings carry a third `EQU` section**; oracle-next's parser handles it.
  Equates can never answer address lookups in either direction.

## Instruments

- **CDP harnesses** (`scratchpad/*-harness.mjs`) are how anything visual or live is
  proven. They launch Electron under `xvfb-run` with `AURORA_DEBUG_PORT`, drive it over
  CDP, and assert. `window.__dbg` (`src/renderer/debug-hooks.ts`) is the query/door
  surface — `aeon.open`, `openDir`, `aether.*`, `classic.*`, `canvas.*`. **It only exists
  in a `VITE_AURORA_DEBUG=1 npm run build`**; a plain build has no hooks and no port.
- Reference harnesses: `collision-agent-harness` / `collision-gesture-harness` (agent +
  human paths), `live-palette-e2e-harness` (two processes, independent observer),
  `warp-tearing-harness` (same-destination-two-ways), `chunkgrid-hint-harness` (layout
  measurement).
- `object-label-harness` (2026-08-22, item 17) — the reference for **stating which rows do
  not discriminate**. 23/23 on the fix, 15/23 on master, with every instrument and
  anti-vacuous row green on master and exactly the eight claim rows red; both frames re-run
  by the overseer before landing. Its `6c` row — label containment on the 0px-clearance
  Effects facet — **passes on master too**, because the canvas edge clips the half of the
  overflow that would have failed it, so the discriminating row is Layout's `5d` instead.
  The parcel said so in the harness header and the ROADMAP row rather than reporting 23/23
  and letting a reader assume all 23 were earned. That disclosure is bar 5 at the moment it
  costs something.
- **A harness must not ask the component under test whether it worked.** The palette
  harness reads `Palette_Buffer` out of the machine over a SECOND client connection.
- **Subagents NEVER touch `mcp__oracle__*`** — they deadlock. Runtime work is the
  overseer's, in the foreground, or a headless bus script.
- Emulators: `oracle-aether <rom>` headless for harnesses; `oracle-frontend <rom>
  --aether` when a human needs to SEE it. Its startup banner's method count is the
  freshness tell — a mismatch between the two binaries means one is stale, not that the
  hosted build is restricted.

## Quirks

- `npm run build` before relaunching Electron; the app serves `dist/`, not source.
- Never bare-`pkill` on a pattern that matches your own shell command line — it kills
  the shell mid-script and leaves you reading a stale log as if it were fresh.
- **Do not run `cargo` in `oracle-next`** — that pipeline is serialized and concurrent
  cargo has corrupted their evidence repeatedly. Ask that session to rebuild.
- Builds spawned from Aurora need `SIGIL_BUILD`/`SIGIL_EMIT` in the environment; a
  desktop-launched Electron inherits none of a terminal's exports, so the failure reads
  as a broken repo rather than a missing variable. `project.json` `buildEnv` is the
  durable fix.
- Aeon's tree may be live-edited by its own session. Building it from here is normal
  authoring; landing anything in it is not.
