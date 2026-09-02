# EW-VARIANT-CYCLE — on-screen controls for a preset's `cycles` and `variants`

**Date** 2026-09-02 · **ROADMAP** §5.1 row 97, second half · **Branch**
`feat/variant-cycle-controls` off master `75fa4329` · **Commits** `72dc988f` (controls +
disclosure + tests), `effd72a5` (harness), plus the docs commit that carries this file ·
**Instrument** `scratchpad/variant-cycle-harness.mjs`
(`AEON_DIR=<copy> [SCREEN=1920x1080] npm run harness:variant-cycle`) ·
**Captures** `scratchpad/shots-variant-cycle/disclosure.png`, `…/authored.png`

---

## 1. What an author gets

Under the band editor, a **collapsed** section of its own: *Preset — `<id>` — cycles,
variants*. It renders nothing while shut, so its body is reached only by asking for it,
and the first thing in that body is the disclosure (§3). Then:

- **`cycles`** — one Select over the three spellings the schema declares, each option
  labelled with what it WRITES: *keep the section's hand-authored cycle (key absent)* /
  *off (null)* / *authored script (array of channels)*. Picking *authored* seeds one channel
  with exactly the four required fields (`line`, `first`, `count`, `period`); each channel is a
  card with a spinner per required field, `dir` shown as **absent — set** / spinner + **Unset**
  (an absent `dir` is the constructor's default and a different document from `0`), a
  **Remove** per card and **Add channel** below. Removing the last channel leaves `[]`, which is
  KEPT and captioned with the schema's own advisory (derived by regex from the vendored
  description, throws if that sentence ever leaves the schema) — never folded to `null` or
  dropped.
- **`variants`** — one Select for key absent vs present (*every slot keeps its hand-authored
  value (key absent)* / *array — slot by slot below*); when present, one card per slot the
  array reaches PLUS ONE unreached slot to extend into. Each slot's Select: *keep hand-authored
  value (array ends before this slot)* TRUNCATES the array there; *clear (null)* writes `null`;
  *author (object)* writes `{}`. Present fields are spinner + **Unset**; absent fields are one row
  of chips, each of which writes a seed to type over. `lines` is drawn as four chips **L0–L3**
  over the engine's **integer bitmask, 1:1 on the wire** — a toggle XORs one bit, the readout
  beside the chips prints the integer, and a hand-written mask keeps whatever else it carried.

No slot count and no channel count are drawn: the schema carries neither, and the generator
names its own refusal.

Every gesture is one `editPresetCommand` → one undo step, one `set-effects-preset`
(sectionIndex −1). No new store; scene schema, timeline and MCP handlers untouched.

## 2. No bound is shown or enforced — and why

No `min`/`max` on any spinner, no clamp anywhere in the panel (a source row forbids both;
harness row [5b] types `first = 300` and reads 300 back from the model with `min`/`max`
attributes both `null`).

aeon's constructor ensures were read — through `git show`, never the sibling tree — at
`origin/master` `b467ab57`, `engine/effects/palette_dsl.emp`: **:36–44** (variant ensures),
**:93–97** (cycle_channel; `dir` "0 (fwd) or 1 (rev)"), **:124** `PAL_CYCLE_MAX_CHANNELS == 4`,
**:130** `PAL_MAX_VARIANTS == 2`. They were deliberately **not** lifted into range hints. A hint
is a claim about a file in another repo; nothing here would re-check it when that file
changes, and a hint that outlives its constructor is exactly the wrong-bound class row 24's
closing note is about. The control forwards verbatim; the constructor keeps its refusal, by
name, at build time.

## 3. The disclosure — verbatim, derived, gated, dated

> ⚠ **SUPERSEDED LATER THE SAME DAY — THIS SECTION IS A HISTORICAL RECORD, NOT THE CURRENT
> SURFACE.** aeon MERGED DoD item 5 (aeon `445a5856`) on 2026-09-02, the drift row went red
> exactly as designed, and the sentence below **RETIRED**: `PRESET_KEYS_AWAITING_AEON` is now
> `[]` and `PresetLagDisclosure` renders nothing. Nothing quoted in this section is on screen
> any more. MERGED, NOT CERTIFIED — sigil `dd5eaad2` records chain 198 RED with no ROM byte
> moved. See `docs/reviews/2026-09-02-preset-lag-retired.md` for the retirement, what replaced
> the deleted row, and the condition that brings the sentence back.

On screen, first in the section body, `tone="warning"`:

> Not consumed by the engine yet. `cycles` and `variants` are authored here and saved to this
> preset file, and that is as far as they go: aeon's generator (tools/effects_gen.py) refuses
> both by name at origin/master, so nothing set below reaches a ROM, and no emulator has
> shown either. Measured 2026-09-02 by test/formats/effects-preset-schema-drift.test.ts
> (last row) against aeon docs/EDITOR_RASTER_PRESETS.md at origin/master. Expires
> (2026-09-02): the day that row goes red because aeon lowers the keys (DoD item 5, aeon's
> lane) — this sentence retires with the row.

**One source of truth.** `src/core/formats/effects/preset-lag.ts` exports
`PRESET_KEYS_AWAITING_AEON = ['cycles', 'variants']`, the date, and `presetLagDisclosure(keys)`.
The drift test's last row now asserts aeon's measured lag `toEqual([...PRESET_KEYS_AWAITING_AEON].sort())`
— no literal names — and the disclosure test has a **coupling row** that reads the drift test's
source and refuses a hand-typed `['cycles', 'variants']` there. The panel imports the leaf; the
leaf takes no props (a source row forbids a `bound`/`section` guard being slipped in one level
down) and renders `null` when the premise list is empty.

**Gate.** `PresetLagDisclosure()` called as a plain function: with the module un-poisoned the
element tree carries the whole sentence in a `warning` Hint; with `preset-lag` mocked to an empty
list (`vi.doMock` + `vi.resetModules`) it returns `null`. Both directions are rows.

**Expiry.** Tied to the measurement, not the calendar: when aeon lowers the keys the drift row
goes red, that row is deleted, `PRESET_KEYS_AWAITING_AEON` empties, the sentence retires, and the
controls keep working. The premise was re-checked at the end of this parcel — aeon
`origin/master` moved from `bf32a54c` to `d78f9090` mid-session (four path-alias commits) and
`tools/effects_gen.py` still refuses both keys by name; drift test 14/14.

## 4. Red-first evidence

Seven plants, each run to a shown failure and restored (grep for `POISON` over `src test` is
empty; the only hits are a test's describe title and a pre-existing bg-override row name).

| Plant | Where | Rows that went red | Log |
|---|---|---|---|
| P1–P3 | `providers/effects-preset.ts` — the absent path, the no-op guard, the `[]` keep and the unreached truncation | *off → absent DELETES the key rather than writing undefined* · *authored → absent deletes the key* · *re-picking the current state is a no-op* · *an EMPTY array is kept as `[]`, never rewritten as null or absence* · *unreached ENDS the array at that slot* · *a no-op gesture on every control leaves the bytes alone* · *the three cycles spellings serialize to three different texts* — **7 failed / 23 passed** | `scratchpad/red-P1-P3.log` (session scratchpad) |
| P4 | the round trip | *a preset opened with both keys ABSENT and saved untouched is byte-identical* · *a no-op gesture … leaves the bytes alone* · *every spelling survives serialize → parse → serialize* — **3 failed / 27 passed** | `red-P4.log` |
| P5 | `PresetLagDisclosure.tsx` — `?? '… (stale)'` in place of the null return | *the leaf takes no props* · *with PRESET_KEYS_AWAITING_AEON empty, the leaf renders NOTHING* | `red-P5-P7.log` |
| P6 | drift test — the import replaced by a hand-typed literal | *while the list is non-empty, the drift test still asserts the measured lag equals it* | same |
| P7 | `BandPresetPanel.tsx` — `<CyclesBlock>` moved above the disclosure | *the channels section exists and its body opens with the disclosure* — **4 failed / 6 passed** with P5–P7 together | same |

The exact plant diffs for P1–P4 were applied and restored before this session's context
compaction; the failing rows above are the record that survives, and each names the property
it guards.

Harness plant: `PLANT=rot-select` rots the row-label finder — **[2c] red, abort at 8/9, exit 2**,
before any authoring row. A `no-model` plant (read the cycles state off the widget) was also
tried and **measured non-discriminating: 31/31 stayed green**, because every authoring row reads
the document through `presetsJson()` and only quotes the widget beside it. It was removed rather
than kept as decoration; the head note records the measurement.

## 5. The harness, and the fold

Recipe (fresh copy per run, O66; the run refuses a copy that already holds `harness_vc.json` or a
shipped preset that carries either key, and refuses the live aeon tree by prefix):

```
VITE_AURORA_DEBUG=1 npx electron-vite build
mkdir -p <copy> && git -C /home/volence/sonic_hacks/aeon archive bf32a54c | tar -x -C <copy>
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron \
  AEON_DIR=<copy> [SCREEN=1920x1080] npm run harness:variant-cycle
```

**31/31** at `SCREEN` 1680×1050 (the file's default — not a display in this workspace) and
**31/31** at `SCREEN=1920x1080` (the owner's primary), same aeon copy revision `bf32a54c`, ~31 s
each. Rows: `__dbg` present; project open; `authored_probe` loaded, no unreadable, **anti-vacuous
neither key in the model and `harness_vc` absent**; Effects facet; bands section open; list
entry selects `authored_probe`; the channels section exists SHUT and opens; both key selects
found by their row labels with every spelling; both read *absent*; the disclosure painted, dated,
BEFORE the first control, same body (screenshot); opening the section dirtied nothing and wrote
no key; New creates `harness_vc` and the section follows the selection; *authored* seeds one
four-field channel; `first=300` verbatim, no `min`/`max`; `dir` chip → 0, Unset → key gone; Add
channel → 2, one Ctrl+Z → 1; *off* → `null` with the key present, re-pick burns no step, one Ctrl+Z
restores the script; ends off; *present* → `[]` with one unreached slot card and no slot 1; slot 0
*author* → `{}` and slot 1 appears; `shift_r` chip seeds 0, typed 3; `lines` chip seeds 14, L0 → 15,
L2 → 11, readout `= 11`; slot 1 *clear* → `[{…}, null]`, slot 0 untouched, slot 2 unreached; slot 1
*keep* truncates to 1, one Ctrl+Z restores the null; **real Ctrl+S** clears dirty; **the COPY's
`harness_vc.json` reads `"cycles": null` and `"variants": [{"lines": 11, "shift_r": 3}, null]`, in
aeon's canonical form reproduced independently (recursive sort, indent 2, one newline), with the
literal `"cycles": null,` and a bare `null` slot in the bytes**; **aeon's `authored_probe.json` —
opened, its section shown, never touched — is byte-identical (484 B → 484 B) and still carries
neither key**; O15 heights.

**Heights, all read in one session** (`getBoundingClientRect`, `dpr` 1, app window 1400×872 on
both screens — the numbers are window-determined, which is why the two screens agree):

| | column `scrollHeight` | bands section | channels section |
|---|---|---|---|
| before — channels section SHUT (what the parcel adds at rest) | 4680 | **3051** | **37** (one header row) |
| after — open on `authored_probe`, neither key | 5020 | **3051** | 377 |
| end — open on `harness_vc`, fully authored (1 channel off, 2 slots) | 5252 | 3074¹ | 587 |

¹ the bands section is 23 px taller in the end reading, taken AFTER `harness_vc` was created —
between the two readings that section gained a list entry and a different selected preset. The
attribution is NOT measured here (a list row is the likely 23 px, but this packet does not
claim it); what row [8a] pins is that the bands section is equal shut-vs-open on the SAME
preset, which is the O15 claim.

So the bands section's fold does not move (O15, row 102); the parcel adds one 37 px header to the
column at rest, and its body is 377–587 px only while an author has asked for it. The
disclosure itself is 198 px tall in the 268 px column (`disclosure.png`).

## 6. Verification aggregates

- `npx vitest run`: **451 files passed, 2 skipped (453) · 6223 tests passed, 7 skipped (6230)**,
  11.4 s. Skips are pre-existing (`test/live/s1-warp-live`, `compose-bench`, the
  bg-override-binding app-file rows). New: 30 provider rows, 10 disclosure rows; the drift
  test's last row re-pointed at the shared constant.
- `npx tsc --noEmit` clean.
- `check:test-collection` OK (453/453) · `check:pseudo-skip` OK · `check:peer-path-literals` OK ·
  `check:harness-guards` 169 clean / 169 classified, 0 unmeasurable.
- Wall clock at the suite run: `00:18 up 7 days, 16:07`, load 2.65.

## 7. Not claimed — TAGGED for the controller

No ROM, no emulator, no aeon build, no `SIGIL_BUILD`. By the disclosure's own premise nothing
authored in this section can reach any of them until aeon's DoD item 5 lands behind chain 196;
the harness photographs the authoring surface and reads the file. `docs/MCP.md` untouched: the
agent surface's preset description (its §"cycles"/"variants" paragraph, written by the codec
half) did not change.
