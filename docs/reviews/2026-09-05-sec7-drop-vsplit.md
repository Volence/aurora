# Section 7 drops its vsplit, through the UI

**Branch** `parcel/sec7-drop-vsplit` · **harness** `npm run harness:sec7-drop-vsplit`
(`scratchpad/sec7-drop-vsplit-harness.mjs`, registered in `package.json` in the same
commit) · **28/28 rows, 0 failed, 0 unmeasured**. Three runs, each from a fresh working
copy; the last two carry the full stage rows.

## What was removed, and why it goes

`games/sonic4/data/editor/effects/ojz_act1_sec7_worldwater.json` carried
`vsplit: { at: 67 }` on layer 2, the `world_y` 162 layer. It is gone.

A scene-level `vsplit` is the one layer attachment that does **not** ride the lowered
`SceneCfgN` record. It lowers to a raster program, and that program exists only if a
hand-written call site names the scene by symbol: `scene_vsplit_fires(<Scene>)`. That
call site exists for `Scene_Editor_ojz_act1_depth`
(`games/sonic4/data/effects/ojz_effects.emp`) and **not** for this scene, so the key
reached zero ROM bytes. Section 7's working vscroll split comes from the engine lane's
own hand-authored channel 3, which is a different mechanism entirely. aeon states all of
this itself, in `tools/test_vsplit_consumer_lint.py`, which carries the scene in
`KNOWN_UNBOUND` with the reason.

**It was not an authoring error, and nothing in this parcel says it was.** The person
who set it was told section 7 has a vscroll split, saw a control named for exactly that,
and used it. From inside the editor an effect the section already has and one the scene
declares look identical. That is a separate, already-booked defect. No warning, no
refusal and no advisory was added here.

## The base assertion, before any diff

Without this step the leaf diff below compares two unrelated documents and still prints
something tidy, so it is a row and it runs first.

| row | what it pins |
|---|---|
| `[0a]` | the committed capture at `docs/captures/2026-09-05-sec7-final/` recomputes to git blob `3ff07f9bfb51393ba7003699eeb11d799879b682`, the blob the dispatch names. Pinned by **hash recomputed from the bytes**, not by path. |
| `[0b]` | the working copy's starting document is **leaf for leaf** that capture: 14 leaves, all equal, no leaf on one side only. |
| `[0b2]` | and **byte for byte**: the clone's blob is the same `3ff07f9b…`. |
| `[0c]` | that base actually holds `layers[2].vsplit.at = 67`. Without this row, "the key was removed" is vacuously true of a document that never had it. |

aeon's `HEAD` copy of the file is the same blob (`git rev-parse
HEAD:games/sonic4/data/editor/effects/ojz_act1_sec7_worldwater.json` at `ebef9ae3`), so
the base, the capture and aeon agree.

## The full leaf diff

Committed capture to the app-written document. This is the whole of it:

```
layers[2].vsplit.at: 67 -> (absent)
14 leaves left, 13 right
```

One leaf moved. `[3b]` asserts the count is exactly 1, that its path is
`layers[2].vsplit.at`, and that its right-hand side is absence rather than a new value.

Two more rows, because the diff alone cannot say them:

- `[3c]` the parent `vsplit` object is **gone**, not left as `{}`. The leaf function
  emits an empty object as its own leaf precisely so a hollowed parent cannot pass as no
  change; the remaining `layers[2]` leaves are exactly `fa`, `fb`, `world_y`.
- `[3d]` `layers[2].world_y` is still `162` on disk. This is not decoration: see the
  clamp below.

The delivered file is `docs/captures/2026-09-05-sec7-vsplit-removed/ojz_act1_sec7_worldwater.json`,
**git blob `eba191125948eb00035dd836203be993cb2e90b9`**, 358 bytes, exactly as the app's
own save wrote it. Two independent runs, each from a fresh working copy, produced that
same blob.

## Which control was driven

One gesture, on one control.

| what | control | where |
|---|---|---|
| `layers[2].vsplit` removed | the **`B split at`** `<select>`, its **`none`** option | `src/renderer/components/effects/EffectsScenePanel.tsx:731`, title `Layer 2 vsplit.at …` |

`vsplitFromToggle(false, layer)` returns `undefined`, and `setLayerFieldCommand` clears
the key rather than writing a `"none"` string
(`src/renderer/providers/effects-aeon.ts:294`). Driven with the native `<select>` value
setter plus `input`/`change`, which is what React's `onChange` listens for; `el.value =
x` sets the property React already owns and fires nothing. Read back off the live DOM
either side of the gesture rather than reasoned from the source:

```
before  select {"value":"at","options":["none","at"]}   spinner {"value":"67"}
after   select {"value":"none","options":["none","at"]} spinner null
```

The row spinner leaves the DOM, which is the panel's own rendering of "there is no split
here now".

The **one step that is not a UI gesture is opening the project**: aeon's only real open
route is a native folder picker CDP cannot drive, so `window.__dbg.aeon.open` is used and
is declared as non-UI evidence. Nothing that touches the document uses it. The Effects
tab and the scene picker row are real pointer press/release at integer client pixels.

### The clamp, measured on both sides

`clampLayerTop` narrows a locked scene's layer top to `3 + v_offset .. 223 + v_offset`
for a layer that emits a raster fire, which with `v_offset 288` is `291..511`, and this
layer holds `162`. The 2026-09-05 re-author parcel found that going the other way: a
split turned on before the top is typed makes `162` unenterable. Going **out** the risk
is the reverse, that the release re-clamps, so `[2c]` reads the box's own advertised
bound before and after:

```
before  Layer 2 Screen line (291..511); a plane line, so the scene is locked; narrowed
        from 0..511 because this layer authors a split, so it becomes a raster fire, and
        a fire's screen line is its top less v_offset (288). Move the view box to move
        this range.
after   Layer 2 Screen line (0..511); a plane line, so the scene is locked
```

The bound widens and the value does not move: `162` before, `162` after, `162` on disk.

## The ROM comparison, and its freshness proof

**Expected and delivered: the ROM is unchanged.** That identity is the evidence, not a
problem, because the key reaches no ROM byte. But a stale ROM and an inert key give the
same md5 and mean opposite things, so the reading is only available once four separate
things hold.

| row | the fence |
|---|---|
| `[S0]` | **the stage itself is green first.** A full build of the unmodified copy, every gate including aeon's tool-suite lane: exit 0, `2464 passed, 30 skipped`. Without this the rows below could be reading a broken stage. |
| `[R0]` / `[R3a]` | **the build's exit code is read before anything is hashed.** A hash taken after a non-zero build hashes the previous artifact and looks exactly like "nothing changed". Both builds exit 0. |
| `[R0b]` / `[R3b]` | the ROM is **newer than the generated `.emp` it was built from**, and the AFTER ROM is newer than the BEFORE ROM. `s4.bin 19:38:36.949Z` against `effects_scenes.emp 19:38:06.061Z` and `BEFORE s4.bin 19:37:48.660Z`. |
| `[R1]` | **the determinism control.** A rebuild with no input change is byte-identical *and* moves the file's mtime. Without this, "identical" could mean the build is simply not reproducible, and "moved mtime" would not be evidence a build ran. |
| `[R2a]` | **the generator is made to confirm drift.** `effects_gen.py check` must report `DRIFT`, not `OK`, before it is allowed to regenerate. A generator that never read the edit would emit the same `.emp` and hand back the same ROM for exactly the wrong reason. |

Then the comparison:

```
BEFORE  814ea9fa37d8c4956b73efe416d9db60   819851 B
AFTER   814ea9fa37d8c4956b73efe416d9db60   819851 B
```

All three ROM readings come from the **same build invocation** (`./build.sh sonic4 -nl`),
so nothing but the document differs between them. `-nl` gates lints only: the level
staleness gate, the effects drift gate and the whole codegen path still run, and `[S0]`
plus `[L2]` cover the lane it skips in both directions.

The build supplies a second, independent freshness line of its own, in
`logs/build-after.log:95`:

```
provenance: s4.lst and s4.bin both written after this build started (+2.9 s / +2.9 s)
```

`[R2c]` pins what actually reached the assembler: exactly **one line** of
`games/sonic4/data/generated/ojz/act1/effects_scenes.emp` moved, and it is that layer's.

```
- layer(world_y: 162, fa: FACTOR_1, fb: FACTOR_1_2, vsplit: SceneVSplit.At(67)),
+ layer(world_y: 162, fa: FACTOR_1, fb: FACTOR_1_2),
```

So the change did reach the generated module, did reach a real build, and the ROM still
did not move. That is what "inert" means, stated as a measurement.

### What counts as a re-bake for an effects-only edit

`tools/level_staleness.py`'s stamp arm refuses a build whose editor sources are not the
ones the last bake read, and it is a **content manifest**, so `touch` is not a way past
it. The harness runs `effects_gen.py emit` then `level_staleness.py --stamp sonic4`.
Those two are exactly the effects half of `tools/regenerate-level.sh` (lines 207 and
231); the generators between them consume out-of-repo donors and read no scene document,
and `verify_level_bin.py` passes unchanged on both sides.

## The quarantine arm this closes

`[L0]` and `[L1]` run aeon's own `tools/test_vsplit_consumer_lint.py` directly on both
sides; `[S0]` and `[L2]` run the same lint where it actually bites, inside the canonical
`./build.sh sonic4`.

```
                    the lint alone            the FULL build
BEFORE  [L0]/[S0]   7 passed, 1 warning       exit 0 · 2464 passed, 30 skipped
AFTER   [L1]/[L2]   2 failed, 5 passed        exit 1 · 2 failed, 2462 passed, 30 skipped

BEFORE warning   VSPLIT-NO-OP quarantine: Scene_Editor_ojz_act1_sec7_worldwater …
AFTER  failures  test_quarantine_entries_still_author_a_vsplit
                 test_quarantine_is_loud_on_every_build
```

**`[L1]` and `[L2]` are reported, not asserted green in the sense of "this is fine".** The
lint going red here is the quarantine doing the job it was built for: it forces the
entry's deletion in the same change that resolves the scene, so the entry cannot rot into
permanent cover. Each row is true when the failure is present and its name says which way
round that is. `[L2]` matters more than `[L1]` because it is **build-fatal**: the
canonical build of aeon refuses until the entry goes, and `[S0]` proved that same build
green on that same working copy minutes earlier, so the delta is this parcel's change and
nothing else.

**What aeon owes, in the change that lands this document:** delete
`KNOWN_UNBOUND["Scene_Editor_ojz_act1_sec7_worldwater"]` from
`tools/test_vsplit_consumer_lint.py`, and re-bake
`games/sonic4/data/generated/ojz/act1/effects_scenes.emp` plus
`games/sonic4/data/editor_sources.stamp.json`. Until both, aeon's build is red at the
tool lane. The row VSPLIT-NO-OP in `docs/DEFERRED_WORK.md` is what the entry points at.

## The stage, and two things it cost

**STAGE.** Authoring happened in a `git clone --local --no-hardlinks` of aeon at
`ebef9ae3`, made under `mktemp -d`, and the harness copies that clone once more to a
**sibling of it** rather than to a bare temp directory.

**A clone under `mktemp -d` has no suite root above it.** aeon's tools walk up for a
suite marker, and the first build refused with
`MissingSuitePath: /…/suite/oracle-old/linux-port/harness`. The fix is to build the temp
root as a suite root: symlink the siblings in beside the clone, and create the working
copy inside that same root so the marker walk still lands there. The set that makes
aeon's tool lane green in a clone, measured by removing them and putting them back, is
**`oracle-old`, `skdisasm` and `sonic_hack`** on top of the obvious `sigil` / `empyrean`
/ `oracle` / `aurora` / `seraph`.

### The finding I nearly shipped: a refusal that blamed the clone

The first attempt was under-symlinked, and the shape it produced was seductive.
`python3 -m pytest tools` on the **unmodified** clone gave `31 failed, 2421 passed, 35
skipped, 7 errors`, and the visible causes were `FileNotFoundError`. I wrote that up as
"aeon's tool-suite lane cannot run in a clone, because several files import out-of-repo
donor artifacts that are untracked in aeon", ran every build `-nl`, and committed that
sentence. It is an elegant story about somebody else's tree and it is wrong.

Classifying the exceptions rather than reading the summary line is what broke it: 49
`FileNotFoundError`, 18 `CalledProcessError`, 2 `AssertionError`, and the
`CalledProcessError` ones spelled out
`gen_dust.py … --skdisasm /…/suite/skdisasm` for a `skdisasm` I had simply not linked.
With `oracle-old`, `skdisasm` and `sonic_hack` in place the same unmodified clone runs
**2464 passed, 30 skipped, 0 failed**. There was never a donor problem; there was an
uncleared rig, and the story that flattered me was the tell.

What it cost and what it bought: `[S0]` and `[L2]` exist because of it, and they are the
strongest rows here. The quarantine's refusal is now shown to be **build-fatal in the
canonical build**, on a working copy whose full build was green minutes before, instead
of being an opinion a side command holds.

### A trap worth keeping: a copied `__pycache__` misnames the tree

`cp -a` on an aeon tree that has already run pytest copies `tools/__pycache__`, and the
pytest-rewritten `.pyc` records `co_filename` from the tree it was **compiled in**. The
copy then executes its own data while every traceback line names the original tree. It
produced exactly the shape that should stop a run:

```
../aeon/tools/test_vsplit_consumer_lint.py:376: AssertionError
```

read from a run whose `cwd` was `probe-aeon`. Settled by decoding the `.pyc` rather than
by argument:

```
probe-aeon/…/test_vsplit_consumer_lint.cpython-314.pyc               -> …/probe-aeon/tools/…
probe-aeon/…/test_vsplit_consumer_lint.cpython-314-pytest-9.1.1.pyc  -> …/aeon/tools/…
```

The values were right and the filename was a ghost. The harness now purges `__pycache__`
from the working copy, and the delivered `logs/vsplit-lint-after.log` names
`tools/test_vsplit_consumer_lint.py:376` with no prefix, which is what a clean tree
looks like.

## Boundaries honoured

No emulator tool was touched. Build & Run was never pressed. **The aeon checkout was
read only** and is byte-identical to how it was found (`git status --porcelain` clean
throughout; the only untracked file in it, `docs/captures/2026-09-05-floor-shear-verified.png`,
predates this session and is another lane's). All authoring and every build happened in
throwaway copies, and the harness refuses outright if `AEON_DIR` resolves to aeon's
default location. Peer paths go through `test/support/sibling-root.mjs`;
`SIGIL_BUILD` / `SIGIL_EMIT` name executables on this machine, the same class as
`ELECTRON_BIN`, which is deliberately outside the resolver's `OWNED_ENV`.

## Nothing BLOCKED

The UI removed the key on the first attempt, through the control named for it, with no
workaround.

## Suite

`npm test` in this worktree, exit 0: **7386 passed / 9 skipped / 0 failed** (510 test
files passed, 3 skipped). The dispatch names master as 7386+1 = 7387 passed / 8 skipped
in a main checkout with one row skipping by design in a linked worktree, and that is
exactly the shape here: the ninth skip is `sibling-root`'s step-3 row, which declines to
measure in a worktree and says so. No delta to attribute.
