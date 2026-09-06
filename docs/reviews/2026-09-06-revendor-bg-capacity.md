# REVENDOR-BG-CAPACITY — Aurora told an author 48 tiles fit that aeon refuses, and a second ceiling nobody models

**Branch** `parcel/revendor-bg-capacity`, from master `475b0973`.
**Tip** `83e62b7e` (two commits: `0af16300` the re-vendor and sweep, `83e62b7e`
the aeon-side enumeration).

Everything below was measured in this worktree unless it says RELAYED.

**aeon was read at a committed revision throughout** —
`git -C <AEON_DIR> show <rev>:<path>`, never off the working tree, which is
another lane's live checkout. `AEON_DIR` resolved through
`test/support/sibling-root.mjs` (step 3, `--git-common-dir`) to
`/home/volence/sonic_hacks/aeon`.

| revision | what |
|---|---|
| `f14b21a89fd755b011419a2a30822f06032a8dbe` | aeon `origin/master`, 2026-09-06 06:43 -0400. **Everything current in this packet was read here.** |
| `1ee8f8e68d826b18023639ab32a8f7c82f238e62` | the 2026-08-22 vendoring pin, read only to DIFF against |
| `3a4712faa920100653669c1ec3fc26c2da71ef68` | the 2026-09-02 axis amendment, cited by the file |

---

## 1. The defect, and which way it pointed

`src/core/formats/bg-override/bganim-consumer-contract.json` vendored
`BG_TILE_CAPACITY: 448`. aeon's EFFECTS-W1 item 9d took the BG arena to **400**:
`games/sonic4/vram.toml`'s `bg_region` went `tiles = 448 -> 400` and
`band_reserve = 128 -> 80` in the same edit, the 48 slots becoming a new
`waterline_strips` region at base 1424.

Aurora refuses only `d.tiles.length > BG_TILE_CAPACITY`
(`bg-override.ts:687`), so it **accepted 401..448 tiles** and
`tools/inject_editor_bg.py:1023`'s `assert len(tiles) <= BG_TILE_CAPACITY` then
refused them.

**THE DIRECTION IS WHAT MAKES IT NASTY, and it is not symmetric.** A validator
*more permissive* than the thing it guards fails silently and **blames the
build**. The author never sees Aurora's acceptance as an event; they see aeon's
refusal, so the symptom points at the engine while the fault is ours. The
reverse error — Aurora stricter than aeon — is loud, local, and blames the right
tool: the author is stopped in the editor by the editor, with the editor's own
message. **Where a bound is uncertain, Aurora should sit on the strict side**,
and where it must be loose it should say so in the refusal rather than quietly
pass the document downstream. That principle is what the two ceilings in §5
below are measured against.

### What it could have cost an author

aeon's live `editor_bg_override.json` at `f14b21a8` is **320 tiles, one band**.

| | Aurora said | aeon's rule |
|---|---|---|
| free tile slots on the live document | `400 - 320`… no: **`448 - 320` = 128** | `400 - 320` = **80** |

So on the file that actually ships, **every band between 81 and 128 tiles was
offered to an author by the panel and would have failed at bake.** Plus any
static background import of 401..448 tiles, which the `set_bg` agent tool and the
BG library both accepted.

---

## 2. The stale value and the stale coordinate arrived together

The vendored entry cited *"aeon `tools/vram_map.py:26` — `BG_TILE_CAPACITY =
448`"*. The constant is **400 at line 34**. Both halves rotted, and that is the
tell: **nothing was reading the entry.** The drift gate beside it hashes *our*
copy, which equals itself by construction, so it could not have noticed either.

That generalises past this one line. **Repairing a coordinate is not the same as
removing the dependence on coordinates, and the repair goes stale on the same
clock.** Every citation in the file now leads with the SYMBOL and carries the
line number as a secondary locator; the currency gate in §4 keys on symbols and
patterns, never on a line number, so nothing this parcel added can rot that way.

---

## 3. The constant table

**Every value re-read at aeon `f14b21a8`.** "Authority" is the artifact that
GOVERNS, established before the value was recorded — aeon's own tree names
`games/sonic4/vram.toml` as the VRAM placement authority, with
`tools/gen_vram_map.py` generating `tools/vram_map.py`, `constants.emp`'s
GENERATED block and the docs page from it, gated by
`tools/test_gen_vram_map.py::test_generated_artifacts_are_in_sync`.

| constant | Aurora before | Aurora after | aeon | governing authority | corroborated by |
|---|---|---|---|---|---|
| `BG_TILE_CAPACITY` | **448** | **400** | 400 | `vram.toml` `bg_region.tiles` | `vram_map.py:34`, `constants.emp:607` |
| `BG_TILE_BASE_SLOT` | 1024 | 1024 | 1024 | `vram.toml` `bg_region.base` | `vram_map.py:33`, `constants.emp:606` |
| `BGANIM_MAX_BANDS` | 4 | 4 | 4 | `constants.emp:312` (3 deliberate mirrors, gated by aeon's own `test_all_three_authorities_agree`) | `bg_anim.emp:93`, `inject_editor_bg.py:65` |
| `BGANIM_PHASE_BANKS` | 8 | 8 | 8 | `bg_anim.emp:95` `const BGANIM_BANKS = 8` | `inject_editor_bg.py:896` |
| `TILE_BYTES` | 32 | 32 | 32 | `bg_anim.emp:124` `TILE_BYTES_SHIFT = 5`, so `1 << 5` | `inject_editor_bg.py:622` |
| `TILE_PIXELS` | 64 | 64 | 64 | `inject_editor_bg.py:1046` pack loop over a row-major 8x8 | — |
| `TILE_PIXEL_MAX` | 15 | 15 | 15 | `inject_editor_bg.py:1048` `& 0xF` | — |
| `TILE_WIDTH_PX` | 8 | 8 | 8 | `inject_editor_bg.py:633` `period_tiles * 8` | — |
| `BG_LAYOUT_WORDS` | 4096 | 4096 | 4096 | `inject_editor_bg.py:1022` | — |
| `BG_LAYOUT_WORDS_LEGACY` | 2048 | 2048 | 2048 | `inject_editor_bg.py:1020` | — |
| `LAYOUT_WORD_MAX` | 65535 | 65535 | 65535 | `inject_editor_bg.py:1039` `struct.pack_into('>H', …)` | — |
| `LAYOUT_TILE_INDEX_MASK` | 2047 | 2047 | 2047 | `inject_editor_bg.py:1036` `& 0x7FF` | — |
| `outputDir` (not a constant) | `…/generated/ojz/act1` | same | same | `inject_editor_bg.py:473` `LEGACY_OVERRIDE_ACT` + `BgActNames.out_dir()` + aeon root `project.json` first zone/act | — |
| `drivers` | `camera_x` 0 / `camera_y` 1 / `timer` 2 | same | same | `inject_editor_bg.py:806` | — |

**ONE VALUE MOVED.** Eleven others and both non-constant records were re-read and
are unchanged.

**TEN CITATIONS WERE REPAIRED WITHOUT THEIR VALUES MOVING**, which is the part
the accidental discovery would never have reached:

| what was cited | what it is now |
|---|---|
| `vram_map.py:26` | `:34` |
| `vram_map.py:25` | `:33` |
| `constants.emp:212` | `:312` |
| `ram.emp:526` | `:697` |
| `col_bytes = rows * 32` | `unit_bytes = unit_tiles * 32` (aeon's 2026-09-02 axis amendment rewrote it there, not here) |
| `assert pattern_px == cols * 8, 'pattern width must equal cols*8'` | `assert pattern_px == period_px` (same amendment) |
| `assert len(layout) == 4096, '…words'` | `…, got {len(layout)}` |
| four `authorities` entries with no line number | line numbers added |

`vram.toml` was added to `source.documents` as THE authority, since reading
`vram_map.py` alone is reading a copy and the copy is what carried the stale
coordinate.

---

## 4. Also checked and correct — a note on the two-case trap

Not a finding, but stated so the coverage is legible: `outputDir` was
re-verified rather than assumed. `LEGACY_OVERRIDE_ACT = ('ojz', 'act1')` is
unchanged, `BgActNames.out_dir()` still joins
`games/sonic4/data/generated/<zone_id>/<act_id>`, and aeon's root `project.json`
still names `ojz`/`act1` as its first zone's first act, so the vendored literal
still resolves. The SHAPE hazard the file already discloses there is unchanged
and still not re-vendored — that remains a separate parcel.

---

## 5. ⚠ THE POPULATION WAS WRONG, AND THE CORRECTION FOUND A SECOND CEILING

The brief said "check every constant and every citation in that file". That
defines the population as **what Aurora happens to carry**, and it structurally
cannot see the case that matters: **a constant aeon ADDED since our last
vendoring is absent from our file entirely, so a per-line walk reports clean on
it forever. An absence and a pass produce the same output.** (aeon's correction,
relayed mid-parcel. It is right, and §3 alone would have shipped without it.)

So the enumeration was redone from **aeon's side**: every module-level symbol in
`tools/vram_map.py`, `engine/system/constants.emp`'s BG block and
`tools/inject_editor_bg.py`, **diffed** between the vendoring pin `1ee8f8e6` and
`origin/master`. Five things aeon publishes that Aurora does not carry. Each is
now in a new `notVendored` block in the contract **with a verdict**, so the
absence is a decision rather than a silence.

### 5.1 `BGANIM_SECTION_CEILING = 20480` — a second, tighter, unmodelled ceiling

`inject_editor_bg.py`'s `check_bganim_section_fits` **raises `SystemExit`** when

```
BGANIM_COUNT_BYTES(2) + BGANIM_RECORD_BYTES(44)*bands
  + views*(2 + 44*bands) + total_animated_slots*BGANIM_BYTES_PER_SLOT(256)
```

exceeds 20480 B. At 256 B per animated slot that is **at most 79 animated slots
for the whole act, at any band count** (1 band: 79; 4 bands with 3 debug view
twins: 77). Aurora models **none** of this.

Measured on aeon's live document (1 band, 8x4 = 32 slots, `default_off` so 3
view twins, **8376 B of 20480**):

| | Aurora | aeon |
|---|---|---|
| further animated slots available | **80** (`tileSlotsRemaining`) | **47** (the ROM section) |

**A band between 48 and 80 slots is offered by Aurora's panel and refused by
aeon's build** — the same permissive-validator failure as §1, one budget over,
and now on the *tighter* of the two ceilings.

**NOT FIXED HERE, deliberately.** A second budget dimension is a feature — a
`bandBudget` field, a panel readout, an agent refusal, its own rows — not a
re-vendor, and this is a bug-tier parcel with two other agents live in the tree.
Disclosed with the numbers so the next parcel has its brief.

### 5.2 The other four

| aeon symbol | value | new since pin | does Aurora need it? |
|---|---|---|---|
| `BG_BAND_RESERVE` | 80 | yes | **No.** It binds aeon's static importer (`png_to_bg_override.py`), not the consumer. A blob of `BG_TILE_CAPACITY` static tiles with no reserve left is legal input to `inject_editor_bg.py`, so refusing on it would refuse a file aeon bakes — the error this contract already declines to make about `palette`. |
| `BG_STATIC_TILE_BUDGET` | 320 | yes | **No**, same reason. Worth knowing when reading fixtures: `editor_bg_override.roomy.json` is 320 tiles because it *is* this budget, which is why its free-slot count moved 128 -> 80 without the fixture changing a byte. Noted in its provenance sidecar. |
| `VRAM_WATERLINE_STRIPS` | `$B200` | yes | **No** — engine DMA target, no writer obligation. Listed because it is *where the 48 tiles went*, and because `= BG_TILE_BASE_VRAM + BG_TILE_CAPACITY * 32` is the proof that the capacity is the arena's real end. |
| `default_off` (a **band key**) | — | yes | **Probably yes, and nothing is lost today.** See below. |

### 5.3 `default_off` — measured, not assumed

aeon's shipped document carries `default_off: true` on its one band; it means the
act boots with BG animation OFF (an owner ask) and gates three debug view twins.
It is not in Aurora's `bandKeys`. Given this repo's history with closed schemas,
the obvious worry was that Aurora refuses or silently drops it, so it was
**measured**:

```
[PROBE] PARSE OK. notices=[]
        band0 keys IN  =["cols","default_off","driver","pattern_px","phases","rate_shift","rows"]
        validate(in)   =[]
        band0 keys OUT =["cols","default_off","driver","pattern_px","phases","rate_shift","rows"]
        default_off OUT=true
```

Aurora parses it with zero notices, validates it clean, and `serializeBgOverride`
writes the key back out. **No erasure.** What is missing is that no rule here
describes it, no panel surfaces it, and aeon has two writer obligations about it
we do not state (`default_off` on some-but-not-all bands is refused; a
`default_off` band whose `pattern_px` is not 64 is refused). Adding it to
`bandKeys` changes `BAND_KEYS`, the canonical write order — a codec change with
its own rows, not a citation repair. Recorded in `notVendored`.

---

## 6. Accepted before, refused after

The literal `401` is used **only** in this one-shot plant, which was deleted
before landing; every permanent row derives its bound from the contract.

**BEFORE**, at the vendored 448 — the plant asserts REFUSED and fails:

```
[PLANT] BG_TILE_CAPACITY = 448; 401-tile document -> ACCEPTED
[PLANT] issues: []
AssertionError: expected 'ACCEPTED' to be 'REFUSED'
 Test Files  1 failed (1)
```

**AFTER**, at 400:

```
[PLANT] BG_TILE_CAPACITY = 400; 401-tile document -> REFUSED
[PLANT] issues: ["tiles has 401 entries, over the BG tile capacity of 400.
                 (Animated slots do NOT add to this: they are a prefix of `tiles`, already counted.)"]
 Test Files  1 passed (1)
```

The fixture is a `BG_LAYOUT_WORDS`-word zero layout with 401 blank tiles, run
through `validateBgOverride` and filtered to issues matching `/capacity/i`.

### RED-FIRST on the landed tree

**Mutation, quoted back from disk**, on the committed baseline `0af16300`:

```
$ grep -n -A1 '"BG_TILE_CAPACITY": {' src/core/formats/bg-override/bganim-consumer-contract.json
51:    "BG_TILE_CAPACITY": {
52-      "value": 448,
$ git diff --stat
 src/core/formats/bg-override/bganim-consumer-contract.json | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Red, and **discriminating** — 4 rows fell, 32 stayed green:

```
× matches the pinned content hash
× BG_TILE_CAPACITY matches games/sonic4/vram.toml at aeon origin/master
× BG_TILE_CAPACITY matches tools/vram_map.py at aeon origin/master
× BG_TILE_CAPACITY matches engine/system/constants.emp at aeon origin/master
  "BG_TILE_CAPACITY is vendored as 448 … but aeon origin/master
   (f14b21a89fd755b011419a2a30822f06032a8dbe) declares a different value"
```

Restored with `git checkout --` from the committed baseline; hash back to
`b7c68864…`; **36 passed (36)**.

### Two more anti-vacuous proofs on the new gate

- **An extractor that matches nothing must FAIL, not pass.** Renaming one
  pattern to `BG_TILE_CAPACITY_RENAMED_BY_AEON`:
  `× BG_TILE_CAPACITY matches tools/vram_map.py … the extractor for
  tools/vram_map.py matched NOTHING at aeon f14b21a8` — 1 failed, 19 passed.
  Restored, green.
- **A `notVendored` disclosure must not outlive its symbol.** Renaming one entry
  to `BG_BAND_RESERVE_RETIRED_BY_AEON`: `× every symbol the contract discloses as
  NOT vendored still exists at aeon … "not found anywhere in tools/vram_map.py"`
  — 1 failed, 20 passed. Restored, green.

---

## 7. The prose sweep, 17 sites

Enumerated by what **touches** the value, not by what names it: `grep` for the
constant, for the literal `448`, for `$8000..$B7FF` / `0xB800`, and for every
reader of `tileSlotsRemaining` / `tileCapacity`.

**The good news first: every consumer already derived.** `bg-override.ts`,
`bg-anim-band.ts`, `agent-handler.ts`, `editor-methods.ts`, the panel readout and
every test row read `BG_TILE_CAPACITY` rather than a literal, so **not one of them
needed editing and not one broke.** The number shipped wrong only through PROSE.
That is the argument for deriving, made from the direction that usually goes
unrecorded.

**Two sites shipped the wrong fact to a person:**

| file | was | now |
|---|---|---|
| `src/renderer/agent/agent-handler.ts:717` (the `set-bg` refusal) | *"N is the BG VRAM region $8000..$B7FF, not a policy: the sprite attribute table sits at $B800, so tile N would spray into it"* | names `vram.toml`'s `bg_region` as the declaring authority; no address range, and says the ceiling is an allocation that has moved |
| `src/main/editor-methods.ts:311` (the `set_bg` tool description) | *"the BG VRAM region $8000..$B7FF, below the sprite attribute table at $B800"* | *"what aeon's VRAM map declares the BG arena owns at $8000; the runs above it belong to other regions"* |

**A coupled test row.** `agent-handler.bg-ceiling.test.ts` discriminated the
capacity guard from other arity checks with `/\$8000\.\.\$B7FF/`. **An address
range is as perishable as a tile count** — `$B7FF` stopped being the arena's top
at item 9d — so it now discriminates on `/vram\.toml/`, the region's declaring
file, which is the stable half. The change is explained at the row.

**The framing, not just the number.** Two comments asserted the ceiling *"does
not move"* / *"is real and immovable"*. Both are wrong in the more interesting
way: the arena **shrank because another feature claimed the space**.
`(0xB800-0x8000)/32 = 448` is the PHYSICAL run under the sprite attribute table;
the capacity is a **declared allocation inside it**, and the two are different
numbers. Every rewrite says the ceiling binds (aeon's injector asserts on it)
without restating any number as permanent.

Remaining sites: `bg-anim-aeon.ts:26`, `BgAnimBandPanel.tsx:29`,
`bg-anim-band.ts:741`, `bg-override.ts:879`, `agent-handler.ts:103`,
`bg-anim-aeon.test.ts:24/59/156`, `bg-ceiling.test.ts:10/21/25/126`,
`bg-override-band.test.ts:204`, `bg-anim-band.test.ts:604`,
`bg-anim-band-roomy-insert.test.ts:6/188`, `bg-override-golden.test.ts:118/273`,
`bg-override.test.ts:645`, `vertical-band.ts:21`, and five `scratchpad/`
harness docblocks whose present-tense claims had become false.

`bg-anim-band.ts:741` was **doubly** stale and the two halves cancelled into
something that still read plausible: it said aeon's live document is at capacity
(*"448/448 at aeon 9b3f11f6, so insertion refuses there … BgAnim authoring is
impossible on the file that ships"*). The document was regenerated to 320 tiles
**and** the ceiling shrank. Insertion works on the shipped file today.

---

## 8. The gate

`test/formats/bg-override-contract-currency.test.ts`, **21 rows**, in the
`npm test` chain via the standard `test/**/*.test.ts` glob.

It reads aeon at a **committed** revision through `test/support/peer-repo.ts` and
pulls each number out of the authority with a pattern anchored to the source line
— one row per (constant, authority), so all three of the band ceiling's
deliberate mirrors are checked, and the VRAM numbers are read from `vram.toml`
FIRST with the generated copies as corroboration.

Its shape is not invented: it is the one
`test/formats/aeon-fixture-currency.test.ts` already established here for the
vendored fixtures. **Precedent, cited rather than argued.**

**Loud on unmeasurable, proved rather than asserted.** With aeon unreachable:

```
$ EMPYREAN_SUITE_ROOT=<empty dir> npx vitest run …contract-currency.test.ts
 Tests  1 passed | 19 skipped (20)
skip-report: 19 SKIPPED test(s). A SKIP IS NOT A PASS
  SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR);
  CANNOT MEASURE whether the vendored BG_TILE_CAPACITY is still what aeon declares
```

The one row that still runs is the completeness check, which compares two things
in this repo and needs no peer.

**The failure modes are split on purpose**, because they are different findings:

| condition | verdict |
|---|---|
| aeon absent / `origin/master` unresolvable | **LOUD SKIP** — nothing was measured |
| cited file gone at a resolvable revision | **FAIL** — the revision resolved, so this *was* measured |
| extractor matches nothing | **FAIL** — an extractor that cannot fail is not a check |
| the number differs | **FAIL**, with both values and the re-vendor recipe |

It also carries the **completeness** row the fixture gate's own docblock warns
about ("a list goes stale silently"): a constant vendored with no extractor fails
the run by name.

**What it does NOT check, stated because the honest scope is narrower:** line
numbers in `authorities` (both halves of this defect rotted together and only the
value half is instrumented); prose; and aeon's parsed *meaning* — it compares
integers, so a constant that keeps its value while changing what it governs
passes.

---

## 9. What I did NOT establish

1. **No emulator, per the standing invariant.** Nothing here needed one — the
   defect is a build-time constant — but note that *"aeon's build refuses a
   401-tile blob"* is **read from `assert len(tiles) <= BG_TILE_CAPACITY` in
   source, not observed by running aeon's injector.** Same for
   `check_bganim_section_fits`'s `SystemExit`. If the controller wants that
   confirmed by execution it is a foreground follow-up in aeon's tree, which is
   read-only to me.
2. **Line numbers are still uninstrumented.** Six were stale in a file whose
   value defect took a fortnight to notice by accident. A citation gate over
   peer-repo `path:line` pairs is possible and was not built here.
3. **§5.1 is disclosed, not fixed.** `BGANIM_SECTION_CEILING` is a live
   permissive-validator defect with measured numbers and no code change.
4. **`default_off` is disclosed, not vendored.** Round-trip preservation was
   measured; the two writer obligations aeon states about it are not encoded.
5. **`games/demo/vram.toml`** also declares `bg_region` at `tiles = 400`, so the
   two maps agree today (checked). Aurora's contract is sonic4-only by
   construction (`vram_map.py` asserts `GAME`), and the currency gate reads only
   the sonic4 map — **a demo/sonic4 divergence would be invisible to it.**
   aeon's `constants.emp` says the constant is engine-wide and both maps carry an
   `engine-tiles:BG_TILE_CAPACITY` authority line, which is aeon's own guard
   against that; not re-derived here.
6. **`scratchpad/bganim-preview-fixture.mjs:10`** records a **448-tile** editor
   art blob (`editor/ojz_bg_ingame-forest-v15-…_tiles.bin`). That is a different
   artifact from an override document and out of this parcel's scope, but under
   the new ceiling a 448-tile blob would not fit an override. **Flagged, not
   investigated.**
7. **The 1-byte serialize difference** on aeon's live document
   (108157 in, 108158 out) was seen while probing `default_off` and not chased.
   Keys and values survive; this is formatting. Not this parcel.

---

## 10. Independent read, offered

The aeon lane has offered to diff this extraction against their tree's
authorities firsthand. **§3 and §5 are the table to send them.** Their read
would be a genuinely independent enumeration — their tree, their parameter —
rather than a second pass of mine, which is the only kind of agreement worth
anything here. Nothing in this parcel blocks on it.

---

## 11. Runner

`npm test` — `514 files passed, 3 skipped (517)`;
`7484 tests passed, 9 skipped (7493)`.

All 9 skips are pre-existing, named by the skip reporter, and unrelated: three
`AURORA_FG_GATE_FILE` rows, one `AURORA_BENCH` row, two live-emulator rows
(`AURORA_LIVE_AEON_WARP` / `AURORA_LIVE_S1_WARP`), two `s4_engine` rows whose
tree is gone from this machine, and one `sibling-root` row that only measures in
a main checkout rather than a linked worktree.
