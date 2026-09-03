# EW-SHAPE-PREVIEW — the preview is tab-scoped, and it arrives on

**What this answers.** The owner ruled the Effects tooling's shape on 2026-09-02
(`docs/decisions.jsonl`, `d-26b-effects-tooling-shape-ANSWERED`). Its first clause
shipped as `2026-09-02-effects-section-strip.md`, its second as
`2026-09-02-effects-sub-tabs.md`. **This is the third and last:**

> "The parallax preview (today buried in View, off by default) is **on by default on
> the Parallax sub-tab**."

**Branch** `feat/effects-preview-default`, four commits off `d5aff52f`.
**Suite** 6383 → 6405 passing, 0 failing, 8 skipped (each naming its reason), `tsc`
clean. **Harnesses** `effects-preview-default` 16/16 (new, four poisons and a
plant), the four-instrument regression set at its expected counts, and three
neighbours measured **on both builds**.

---

## 1. What "on by default" means for an author who turned it off

**Nothing. The default never speaks to him again.**

The flag is not a boolean. It is a tri-state, and the third state is the one this
parcel is about:

| stored | means | what he sees on Parallax |
|---|---|---|
| `null` | he has never operated the switch | **ON** — the default speaking |
| `true` | he turned it on | on |
| `false` | he turned it off | **off, and off, and off** |

A default is a statement about somebody who has not decided. Re-applying it over a
decision is a different thing wearing the same word, and it is the defect people
describe as *"it keeps doing that"*. `[4c]` in the harness is that sentence turned
into a measurement: turn it off, go to another sub-tab and back, go to another
facet and back — still off.

**⚠ AND THE CHOICE OUTLIVES THE SESSION, which no other View toggle does.** That
asymmetry is deliberate, and it is the one call in this parcel that could
reasonably have gone the other way, so here is the argument:

- The other ten overlays are all *off until asked for*. **None of them has a
  default that could ever overrule a choice** — losing one at exit costs the author
  a click he was about to make anyway. This is the only overlay whose default is
  ON, so it is the only one that needs a memory.
- If the choice died with the session, every restart would re-assert ON over an
  author who had said no. That is the same defect moved from *"when I come back to
  the tab"* to *"when I come back tomorrow"*. **A session boundary is not a decision
  boundary**: he closed the application, he did not change his mind.
- The facet **already** persists an arrival-state preference of exactly this kind:
  `shell/panel-state` remembers which sections are open when you arrive, in this
  same `localStorage`, for this same reason. The scene form arriving shut is that
  mechanism, one parcel old.

It is one key, `aurora.effects.parallaxPreview` (`shell/preview-pref.ts`), and a
corrupt or half-written value reads as **undecided, never as off** — "off" would be
a choice he never made, silencing the default on the strength of a bad byte.

**The consequence for instruments, stated because it bit this harness first:** a
stored choice from an earlier run answers instead of the default. Every row that
measures the default runs after an explicit `localStorage.clear()` and a reload,
and `[2a]` asserts `choice === null` **in the same breath** as `on === true` — a
default that is really a stored `true` fails that row rather than passing it.

---

## 2. The two scopes, and they are different on purpose

```
on = in the Effects facet  AND  (his choice ?? the sub-tab is Parallax)
```

That line is `providers/parallax-preview.ts#previewOnFrom`, and it is the only
statement of the rule in the application. The canvas, the keyboard camera-step, the
toolbar chip and the View menu's row all conclude from it.

- **THE DEFAULT is scoped to the PARALLAX SUB-TAB.** It is the job the preview is a
  picture of, and the ruling scopes it there in so many words. Undecided, the
  composite is off on Colour and Tile anim — `[2c]` measures all three in one pass,
  so "off everywhere" cannot pass that row.
- **THE CHOICE is scoped to the EFFECTS FACET.** Once he has answered, the answer
  holds across all three jobs. A raster band sits *on* the background; taking the
  background away when he moves to Colour to edit the band would be this parcel
  authoring a new complaint. `[5b]` measures it.
- **Neither escapes the facet.** `activeGuideScene()` was already null everywhere
  else, and now nothing outside Effects carries the control at all.

---

## 3. Why it stopped being an overlay key — and it is not tidiness

`showCameraPreview` was the eleventh key of `OverlayOptions`. It is gone from that
record, from `OVERLAY_KEYS_BY_ENGINE`, and from `LABELS`. Three reasons, each of
which alone was enough:

1. **An `OverlayOptions` value is a boolean**, and "undecided" is not one.
2. **A boolean named `showCameraPreview` reading `false` while the preview is on
   screen is a label outliving its meaning** — and four test literals, the View
   menu's uniform checkbox and `__dbg.overlays()` would all have believed it. (The
   `effects-section-picker` harness read exactly that key; it would have gone red or,
   worse, green on a wrong reading.)
3. **THE DEFAULT WOULD HAVE LEAKED INTO FOUR FACETS.** Every key in that record is
   offered by the View menu in Layout, Objects, Collision and Art. Flipping this
   one's default to `true` would have shown all four a **ticked box** for a preview
   none of them draws — offering to turn off something they never turned on. This is
   the defect the brief named as worse than the one being fixed, and it is why the
   previous parcel stopped where it did.

**The View menu still offers the composite**, from `ViewMenu`'s own row, rendered
**only in the Effects facet**. The engine filter beside it exists for the milder
version of the same rule (*"a checkbox that toggles something this engine never
renders is dead chrome"*); a facet filter is that rule one level down, and it is
what lets §4 **prove** the other facets are untouched instead of asserting it.

---

## 4. The other facets, SHOWN unaffected

`[3b]` and `[3c]`, on a cold arrival with no recorded choice, walking every facet
the bar offers — measured, at 1680×1050, on a fresh `git archive` extract of aeon
`origin/master` `b294234b`:

| facet | composite `on` | report `active` / `blits` | View menu |
|---|---|---|---|
| Layout | false | false / 0 | 14 rows, **no** parallax row |
| Objects | false | false / 0 | 14 rows, **no** parallax row |
| Rings | false | false / 0 | 14 rows, **no** parallax row |
| Collision | false | false / 0 | 14 rows, **no** parallax row |
| Palette | false | false / 0 | 14 rows, **no** parallax row |
| Art | false | false / 0 | **has no View menu at all** |
| **Effects** | **true** | **true / 5** | **row present and TICKED** |

Every one of those rows also carries `choice: null`, so what is refusing is the
scope and not a value somebody set. And `[3d]` returns to Effects afterwards and
finds it on again: the trip through six facets consumed nothing.

**⚠ THE ABSENCE HALF NEVER STANDS ALONE.** `[3c]` requires the *same finder*, in the
same evaluation, to find `Screen frame (320x224)` in each menu that opened. That
pairing is not decoration — **it caught two instrument defects of mine before it
could catch anything about the product**:

- **The View menu button is a toggle and `document.body.click()` does not close
  it.** Every second facet therefore read a *shut* menu, in which the parallax row
  is absent for the most boring possible reason. The measurement was 14 / 0 / 14 /
  0 / 14 / 1 rows across six facets — an alternation no scoping rule could produce.
- **The Art facet has no View menu at all**, which is a different fact from "the
  menu opened and the row was not in it". Both are now counted separately, and the
  strong half has to be the majority (`>= 3`) or the row measures nothing.

---

## 5. Red-first, from a committed baseline

`scratchpad/poisons-effects-preview-default.sh`, baseline `39bd67de`. Each poison
prints the mutation as a real `git diff` of the working tree, names the runner,
and restores with `git checkout --` (`0 dirty file(s)` after each). All four
rebuild with `VITE_AURORA_DEBUG=1` between mutation and run and also run the node
file on a **fresh vitest transform cache**, printed `0` before and `1` after.

**One poison per claim, deliberately** — a single mutation that reddened everything
would not have shown that the four claims are separable.

| poison | mutation | node rows | harness |
|---|---|---|---|
| 1 — the **scope** | the facet gate deleted from `previewOnFrom` | **7 red** — the six per-facet rows and "an explicit YES does not escape the facet" | **15/16**, `[3b]` |
| 2 — the **default** | `return subTab === PREVIEW_DEFAULT_TAB` → `return false` | **4 red** | `[2a]` `[2b]` red, then the run **ABORTS** — `2/4 rows had run — this is NOT a pass over the rows that never ran` |
| 3 — the **choice** | `if (choice !== null) return choice;` deleted, so the default speaks every time | **2 red** | **11/16** — `[4b] [4c] [4d]`, plus `[5a] [5b]` as collateral |
| 4 — the **memory** | `savePreviewChoice` writes nothing | **2 red** | **13/16** — of the four §4 rows **only `[4d]`**, plus `[5a] [5b]` collateral |

**Poison 3 is the brief's own sentence executed.** With the recorded answer ignored,
the author turns the preview off, comes back, and it is on again. `[4c]` — the row
whose name contains "it keeps doing that" — goes red, and nothing else about the
default does.

**Poison 4 is the one that justifies `[4d]` existing separately from `[4c]`.**
Everything about *this afternoon* still passes: the choice holds across sub-tabs
and facets. Only the reload row fails. That is the persistence decision in §1
isolated from the tri-state, and it is the evidence that the two are different
claims rather than one restated.

**Plant.** `PLANT=rot-report` reads the composite through a report key nothing
publishes: the run aborts at `[2b]` — `3/3 rows had run — this is NOT a pass over
the rows that never ran.`

---

## 6. Regression set, and three neighbours measured on BOTH builds

The four the brief named, each on a fresh aeon extract, all at the counts they were
green at in `d5aff52f`:

| harness | expected | this branch |
|---|---|---|
| `effects-sub-tabs` | 13 | **13/13** |
| `effects-section-strip` | 15 | **15/15** |
| `effects-drift` | 21 | **21/21** |
| `effects-guide` | 11 | **11/11** |

And the three that drive this feature's own switch. ⚠ **Each was run against a
build of `d5aff52f` as well as this branch**, because "it was already red" and "I
broke it" print the same output:

| harness | master `d5aff52f` | this branch |
|---|---|---|
| `effects-section-picker` | 15/15 | **15/15** (its `[6b]` repaired — below) |
| `curve-editor` | **28/29**, `[7d]` | **28/29**, `[7d]` — *the same row* |
| `camera-preview` | **25/26**, `[6b]` | **25/26**, `[6b]` — *the same row* |

**Neither of those two reds is this parcel's**, and both were verified by running
the unmodified files against a build of the baseline commit in this worktree:

- `curve-editor` `[7d]` fails on `6 v_offset: "no-element"` — the `v_offset`
  spinner is inside `SCENE — <id>`, which has arrived **collapsed** since the
  sub-tabs parcel. A stale finder from that re-parenting, booked here rather than
  quietly repaired inside a preview parcel.
- `camera-preview` `[6b]` is a curve-ramp absence-line row, red on both.

**Two neighbours REPAIRED, not retuned**, and the repairs are narrow:

- `effects-section-picker` `[6b]` read `__dbg.overlays().showCameraPreview`, which
  no longer exists. It reads `__dbg.parallaxPreview()` and now asserts the `choice`
  at each step as well as the effective value — a toggle written `!stored` would get
  the **first** click wrong (`!null` is `true`) and no on/off pair can see that.
  ⚠ **My first version of this repair asserted `before.on === true` and went red**,
  because that harness is standing on the **Colour** sub-tab at that point, where the
  default is a no. The row now asserts the sub-tab too, so a future re-parenting
  cannot silently change what it measures. That red was the sub-tab scoping working.
- `curve-editor` `[3a]` **flipped** the composite assuming it started off; on this
  branch that turned off the thing the rest of the file needs. It PUTs the state now
  (a new `setViewOverlay`), and **only that one call**: every other toggle in that
  file is half of a balanced pair and is correct as a flip whatever the start state.

---

## 7. For the owner — one capture, and one granular call

`scratchpad/shots-effects-preview-default/effects-parallax-preview-default.png`
(gitignored, like every other `scratchpad/shots*/`). A **cold arrival**: storage
cleared, reloaded, project opened, `Effects` clicked, nothing else. `[6a]` asserts
the shot is of that state and not of a stale stored choice — `on: true, choice:
null, active: true, blits: 5`.

It shows the composite drawn inside the screen frame with the five layers labelled
by factor, the `Parallax preview` chip lit on the toolbar, and the panel's own
absence line under the frame: *"preview: Plane B only — no foreground factors,
sprites"*.

**⚠ THE GRANULAR CALL, REVERSIBLE IN ONE LINE.** While the composite is on, the
**arrow keys move the camera** (1px, 16 with Shift) instead of panning the map.
That binding is older than this parcel and the owner asked for it by name — *"you
should be using arrow keys in the editor to get a smoother feel"* — but until now
it needed an explicit yes, and **now it is the arrival state**. Kept coupled to one
predicate on purpose: a composite on screen while the arrows still pan the map is a
preview with no way to move the camera it is a preview *of*. Mouse drag, space-pan
and the wheel are untouched, so panning is never unreachable. To decouple, make
`MapViewport`'s `cameraKeys` read
`useViewStore.getState().parallaxPreview === true` — the picture still arrives
drawn, the keys go back to needing a yes.

`docs/guides/effects-first-run.md` §2 "See it" said *"It is off by default; turn it
on the first time you open the tab and leave it on."* It now describes what ships,
including the three things about the switch that are not obvious (an explicit off
is remembered for good; the choice follows him across the three jobs once he makes
one; no other tab has the control) and the arrow keys.

---

## 8. What is open, and what the instruments cannot see

- ⚠ **NO EMULATOR, NO ROM.** Nothing here says what any of this looks like running.
  The composite is Aurora's own drawing of what the ROM would compose.
- **The composite is still not the whole picture** and says so on the canvas: no
  deform, no foreground factors, no sprites, no priority, and it does not animate
  drift. Unchanged by this parcel; `canvas/camera-preview.ts`'s absence list is the
  live answer.
- **Two neighbouring harness rows are red on both builds** (§6) — stale finders from
  the sub-tabs re-parenting and a curve-ramp row, now written down.
- **d-26b's fourth item is untouched**: the canvas layer-drag ("layer edges
  draggable the way band edges already are"). The map already drags layer guides in
  world space; nothing here changed that.
- **The toolbar is still unscoped** — `Promote from tile N` and `Add blank tile
  animation` are tile-animation verbs on screen while you author parallax. Named by
  the sub-tabs parcel, still open.
