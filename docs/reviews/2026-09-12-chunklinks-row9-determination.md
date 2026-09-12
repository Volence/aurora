# CHUNKLINKS-ROW9: the red is a REGRESSION, not a fixture difference

Foreground overseer pass, 2026-09-12. No branch and no code change — this packet is the
**determination only**. The bisect, the cause and the fix are the parcel dispatched off it
(`fix/chunklinks-row9-regression`, packet `2026-09-12-chunklinks-row9-regression.md`).

## The question this closes

The queue row read: *"The chunk-links rig's row 9 (art chunk save propagation) fails the same
before and after today's change. It was 11/11 on 3 September against a different fixture, so
regression or fixture difference is undetermined."*

It is a **regression**. An author who edits a chunk in the Art facet and saves it no longer
gets the section tiles that still *remember* that chunk rewritten with the new art.

## The A/B, one variable

Every run on this box, `xvfb-run`, **dpr = 1 on all of them** (printed per run).

| | Aurora `9a50749e` (2026-09-03 23:45) | Aurora `master` `fe8c2b21` |
|---|---|---|
| Fixture | aeon `afd6f784`, `git archive`-extracted | **the same extracted copy** |
| Rig | `scratchpad/chunk-links-harness.mjs` row 9 | same |
| Composer cell edited | (3,0) | (3,0) |
| Armed tile / previous tile | 1 / 0 | 1 / 0 |
| Section word at the linked tile, before → after Save | 0 → **16385** (tileIndex 1) | 0 → **0** |
| Row 9 | **PASS**, 11/11 rows | **FAIL**, 10/12 (row `4b` red by design, card d-36) |

## The four confounds, each eliminated rather than argued away

**1. Not the fixture.** Master fails row 9 identically against aeon `3b6a7b4a`
(`origin/master` tonight) *and* aeon `afd6f784` (3 September). Two fixtures nine days apart,
same failure, same numbers.

**2. Not the rig.** The only harness commit in the window is `b99bfb77` (today), which changed
the `aeon.open` poll and added row `4b`. That is a reading of a diff, so it was turned into a
measurement: `runPropagationRows` — the function that *is* rows 9 and 10 — was extracted from
`9a50749e:scratchpad/chunk-links-harness.mjs` and from `master:` and diffed. **7971 bytes each,
byte-for-byte identical.**

**3. Not an aim miss**, which is this repo's standing trap — a mis-aimed CDP click presents as a
defect in a feature that is fine. Measured in a probe copy of the rig: `dpr=1`, composer canvas
`cssW == backW == 1024`, `cssZoom == backZoom == 8`, aim resolved to the intended cell. And the
decisive one: after the save, the armed tile index appears **nowhere in the whole 16×16
footprint** (the probe dumps it). A click that landed on the wrong cell would have put it
somewhere.

> Worth keeping even though it did not fire here: the rig derives its composer zoom from
> `cv.width` (backing store, device px) against `getBoundingClientRect().left` (CSS px). At
> dpr = 1 those agree and the aim is correct. **At dpr 1.35, which this box has produced, they
> do not.** Not a finding tonight — a latent one, and it belongs to whoever next touches row 9.

**4. Not a skip.** Row 9 is built to *skip*, not fail, when a gesture misses — the composer not
opening, the stamp not landing, no armed tile different from the cell's. It **failed**, so all of
those held: the stamp landed, the document went dirty, the Save button was present and enabled
and clicked, and the tile is still linked (`{"id":1,"chunkId":"OJZ_00","baseCol":0,"baseRow":48}`).
The failing conjunct is the propagation assertion alone.

## What could NOT be measured, stated rather than left implied

**The two controls that would have swapped the harness across the app revisions both refuse to
run, and both refuse loudly** — neither was scored:

- master's harness on the `9a50749e` build: `HARNESS ERROR: aeon open did not succeed
  (resolved:undefined)`. The `open` hook's return contract changed; the rig requires `true`.
- the `9a50749e` harness on the master build: `HARNESS ERROR: Runtime.evaluate: {"code":-32000,
  "message":"Promise was collected"}` — the exact V8 defect `b99bfb77` was written to fix.

So the rig's exoneration rests on the byte-identical diff above, not on a cross-run substitution.
That is weaker evidence than a run and it is stated as such.

## A separate observation, for aeon, with its ambiguity intact

A third arrangement was attempted as a control: a copy carrying aeon's **live** editor content
(the archive, with `games/` and `project.json` overlaid from their working tree — read only;
their tree was never written). Row **3** fails there before row 9 can run, because section 0
already holds three chunk placements — `OJZ_00` at (112,16) and (144,16), `OJZ_1D` at (128,32) —
and the rig requires exactly one placement of the armed chunk.

Those sit where this rig stamps, and aeon's working tree carries the matching files as modified
(`games/sonic4/data/editor/ojz/act1/section_0.{tiles.bin,meta.json,collattr*.bin}`). The rig's
own header says the aeon directory is *"OPEN ONLY — never written"*, **and its row 9 clicks
Save, which writes.** So either those placements are aeon's own authoring or earlier runs of
this rig wrote into their live tree. **This pass cannot tell which**, and it is recorded as an
observation rather than an attribution. Relayed to the hub for aeon to look at before those
files are committed. Every run in this packet used a `git archive` copy.

## Reproduction

```sh
mkdir -p /tmp/fx-aeon && git -C ../aeon archive afd6f784 | tar -x -C /tmp/fx-aeon
VITE_AURORA_DEBUG=1 npm run build
AEON_DIR=/tmp/fx-aeon \
ELECTRON_BIN=$PWD/node_modules/.bin/electron \
AURORA_BUILT_TREE=$PWD \
timeout 300 npm run harness:chunk-links
```

Read the run's own `root:` and `pinned:` lines every time: `ELECTRON_BIN` without
`AURORA_BUILT_TREE` silently drives a different tree's `dist/` while every path in the output
looks right.
