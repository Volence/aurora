# The build console ate the properties column

**Branch** `fix/build-console-overlap` · **from** master `dee1274` · 2026-08-27
**Instrument** `scratchpad/build-console-overlap-harness.mjs` (21 rows)
**Fix** `src/renderer/components/BuildPanel.tsx` — `styles.root`

---

## 1. The report, and what it actually was

> "this right bar cuts off with the console thing popped up so I can't remove
> the last vsplit"

He pressed **Build**, the console appeared, and the Remove button he needed was
underneath it. The button existed, was enabled, and could not be clicked at any
scroll position.

`BuildPanel`'s root was

```
position: absolute;  left: 0;  right: 0;  bottom: 22;  height: 260;  zIndex: 40
```

mounted as a direct child of the app root. Two independent faults:

1. **An absolute box removes no space from the layout.** The properties column
   (`Panel width={300} scroll`, `EditorShell`'s `panels` slot) still measured
   itself against the full window height, so its scroller's *maximum* scroll
   left its last control sitting under the console. Not below the fold — under
   an opaque overlay, at every one of the 51 scroll positions the harness tries.
2. **`bottom: 22` was a guess at the status bar's height, and it was wrong.**
   Measured: the bar is **24px** (canvas bottom 848, `innerHeight` 872), so the
   console already overlapped the bar it was trying to clear by 2px. There is no
   constant to derive that number from — the status bar is a *facet's* slot
   inside `EditorShell`, four levels below `BuildPanel`. A number that cannot be
   derived is a number that drifts.

`left: 0; right: 0` also meant the overlay spanned the properties column, which
build output has no reason to cover, **and** the bottom 260px of the map canvas
and of the Explorer tree. Same arithmetic, three victims.

---

## 2. ⚠ The previous attempt, and why it is the most useful thing here

An earlier pass diagnosed this as a **missing `minHeight: 0`** on App.tsx's flex
chain (`body`/`main`/`content`/`tabPane` carry `minWidth: 0` and no
`minHeight: 0` — a real latent hazard that fits the symptom perfectly), patched
it, and wrote a harness that **shrank the viewport** and asked whether the last
Remove button was reachable. It reported REACHABLE. The bug was then put back —
and it reported REACHABLE again. The whole thing was reverted.

**The cause was that the harness never opened the build console.** It measured a
condition the defect does not live in. Poison case (iii) from this repo's own
list: *the row measures the wrong quantity, or the fixture never enters the
condition.*

So the first thing this branch did was reproduce, on master, with the console
open — before touching a line of product code. See §4.

`minHeight: 0` was **not** added. It is a genuine latent hazard and it is not
this defect; adding it here would have made a second, unmeasured change ride
along inside a fix whose evidence cannot see it. Booked in §9.

---

## 3. The predicate: REACHABILITY, not visibility

A control below the fold is not a defect — a scroller brings it up. It is a
defect only when *no scroll position can*. `window.__reach(el)` (installed into
the page by the harness, product code untouched):

1. `el.scrollIntoView({block:'center'})` — scrolls **every** scrollable ancestor;
2. if that does not seat it, sweeps **each** scrollable ancestor's full
   `scrollTop` range in 24 steps, probing at every stop;
3. at each stop asks **two** questions:
   - is the box wholly inside the viewport, **and**
   - does `document.elementFromPoint` at its centre return this element (or a
     descendant of it)?

Question 2 is the one that matters. An overlay leaves a control
*visible-but-unclickable*, and a geometry-only check reports it working. On
master the failure detail reads:

```
{"inViewport":true,"hitsSelf":false,"reachable":false,
 "rect":{"top":599,"bottom":621,"left":1182,"right":1236.97},
 "hit":"div text=\"Build failed (exit 2)✕\"",
 "blame":"div text=\"Build failed (exit 2)✕\" < div text=\"Build failed (exit 2)…\" [absolute z=40] < …",
 "at":"x=1209,y=610","tries":51,"scrollers":2,"count":16,"label":"Remove layer 15"}
```

`inViewport: true` and `reachable: false` in the same object is the whole bug.
The blame path names the culprit — `[absolute z=40]` — so a red row says *what*
is covering the button.

The descendant leniency (`el.contains(hit)`) is doing real work rather than
being slack: on the green side the hit is `span text="Remove"`, the `IconButton`'s
own inner span.

## How the console is opened

`window.__dbg.aether.showFailedBuild(lines, exitCode)` — a new debug hook —
writes the **same store object** `aetherStore.build()`'s failure branch writes:

```ts
{ buildState: 'failed', buildOutput: lines, buildSummary: `Build failed (exit N)`,
  buildMissingEnv: [], buildPanelOpen: true }
```

`BuildPanel` is a pure function of those five fields, so this is faithful for
every question about where the panel lands and how big it is. The only thing
skipped is spawning `build.sh`, which the panel cannot observe.

**Running a real build was rejected**, not overlooked: `aether.build()` builds in
the owner's live `../aeon` tree and reloads his live emulator — three side
effects a question about where a column's bottom edge lands has no business
having, and two of them are explicitly off-limits today.

---

## 4. THE REPRODUCTION — master, before any product change

Instrument committed first (`feat(debug)`), product code untouched. Fixture: the
Effects facet on a scene authored through the real panel with **16 layers** (the
app's own cap), window 1400×872, dpr 1.

```
=== 13/17 rows passed ===
FAILING ROWS:
  [5a] THE OWNER'S CONTROL: with the console open, the LAST Remove button is still reachable
  [5b] with the console open, EVERY enabled control in the column is still reachable
  [5c] the console does not overlap the right-hand column at all
  [8a] the console does not cover the bottom of the map canvas
```

with, on the same run, the controls that make those four mean something:

```
PASS [3b] CONTROL: with the console closed, the LAST Remove button is reachable
     …"reachable":true…"label":"Remove layer 15"
PASS [3c] CONTROL: with the console closed, EVERY enabled control in the column is reachable
     {"total":126,"unreachable":0,"worst":[]}
FAIL [5b] {"total":126,"unreachable":94,"worst":[…"hit":"div text=\"Build failed (exit 2)✕\""…]}
```

**126 controls, 0 unreachable with the console closed, 94 unreachable with it
open.** The right column's box was `height: 742` in *both* states — the number
that says the layout never learned the console existed.

`scratchpad/shots-build-console/02-console-open.png` from that run is the
owner's screenshot: `LAYERS (16/16 PER SCENE)` with the section chopped
mid-sentence.

---

## 5. The fix, what was rejected, and which kind it is

**A CAUSE FIX.** `BuildPanel`'s root becomes a **flow child of the app root**:

```ts
position: 'relative', zIndex: 40,
height: BUILD_CONSOLE_HEIGHT /* 260 */, maxHeight: '50vh', flexShrink: 0,
display: 'flex', flexDirection: 'column',
```

`App.tsx` already renders `<BuildPanel />` as a sibling after `styles.body`, so
**not one line of App.tsx changed**. As a flex item in the root column its
height comes out of `styles.body`, and the Explorer, the canvas and the
properties column all genuinely shrink. `position: relative` + `zIndex` survive
only so the top border and shadow paint over the body above; they position
nothing.

Measured after: column `742 → 482` while open, `→ 742` on close; canvas bottom
`848 → 588`.

**Why the reflow needs no cooperation:** every viewport in this app sizes off a
`ResizeObserver` (`MapViewport:1051`, `ClassicLevelViewport:1048`,
`composer-shared:207`) or off flex, and `grep` finds **no** `addEventListener('resize')`
anywhere in `src/renderer`. Checked before choosing, because a container that
only re-measures on a *window* resize would have been silently stale.

### Rejected

- **End the overlay at the properties column's left edge.** The column has no
  width constant to end at: it is `<Panel width={300}>` passed per *facet*
  (`effects-facet` 300, others differ), rendered through `EditorShell`'s
  `panels` slot with `flexShrink: 0`. A hard-coded 1100 would be `bottom: 22`
  again, one axis over. It also fixes only the column and leaves the canvas and
  the Explorer covered.
- **Pad the column's scroller by the console's height while open.** Cheap, but a
  workaround, and it is *two* scrollers here (the `Panel` and the
  `variant="list"` Layers section — the harness reports `scrollers: 2`), each of
  which would need the pad and each of which could keep dead space when the
  console closes. Row 7a exists specifically to catch that failure mode and
  would have had to police a fix instead of a cause.
- **Keeping the status bar at the very bottom.** Would require mounting the
  console *inside* `EditorShell`, above its `status` slot. The console is
  app-global — it must work on the Home tab, which has no `EditorShell`.

### What this trades, stated plainly

The console now sits flush with the bottom of the window and the **status bar
rides directly above it**, where before the bar was at the bottom and the
console floated over everything else. Both stay fully visible; the ordering is
the only change. This is a deliberate cost, not an oversight.

### The one new failure mode reserving space has

An overlay cannot squeeze the app; a flow child can. `maxHeight: '50vh'` is the
guard and rows **9a/9b** are what make it a guard rather than a comment: at
`innerHeight 420` the console takes **210**, and the editor above still has an
80px canvas. Deleting `maxHeight` takes both red (§7, plant B).

---

## 6. Harness rows and totals

`node scratchpad/build-console-overlap-harness.mjs`

| run | tree | result | dpr | window | loadavg | uptime |
|---|---|---|---|---|---|---|
| 1 | master + instrument | **13/17** (the four above) | 1 | 1400×872 | 1.65 2.06 2.14 | 20.0s |
| 2 | + fix | **17/17** | 1 | 1400×872 | 1.15 1.81 2.04 | 19.8s |
| 3 | + fix | **17/17** | 1 | 1400×872 | 2.02 1.87 2.04 | 19.8s |
| 4 | + fix | **17/17** | 1 | 1400×872 | 1.93 1.87 2.03 | 19.8s |
| 5 | + fix, +9a/9b | **19/19** | 1 | 1400×872 | 1.58 1.76 1.98 | 20.7s |
| 6 | + fix, +9a/9b | **19/19** | 1 | 1400×872 | 2.60 1.99 2.05 | 20.7s |
| 7 | + fix, +10a/10b | **21/21** | 1 | 1400×872 | 1.53 2.07 2.15 | 22.4s |
| 8 | + fix, +10a/10b | **21/21** | 1 | 1400×872 | 1.14 1.87 2.07 | 22.4s |
| 9 | + fix, +10a/10b | **21/21** | 1 | 1400×872 | 1.22 1.85 2.06 | 22.4s |

`dpr` came back **1** on every run; no row here aims a mouse, so the fractional-rect
trap that has cost this repo review cycles does not apply — but it is printed
beside every run anyway, because the next person to add a click row will need it.

**Node suite: 5108 passed, 7 skipped, 388 files, `tsc --noEmit` clean** — and
that total was **identical on the broken tree**. It is reported as context, not
as evidence.

### The rows

- **0a** the bundle carries the instrument (provenance).
- **1a/1b/2a** ANTI-VACUOUS: the project is open with 9 sections; the Effects
  pill exists; the probe scene has 16 layers.
- **3a** the console is *not* mounted yet (`panel box = null`).
- **3b/3c** CONTROL, console closed — the last Remove button, and all 126
  enabled controls, reachable.
- **4a** ANTI-VACUOUS: the console *is* mounted, 260px, on screen.
- **5a THE CATCHER** — the owner's control, `Remove layer 15`, with the console
  open. **5b** the whole-column census. **5c** the two boxes do not intersect.
- **6a/6b/6c** the console itself: Close button, the error line, the last of 140
  output lines, each reachable.
- **7a/7b** closing gives the height back exactly (`742 → 482 → 742`) and the
  button works again — the no-dead-space row.
- **8a** the console does not cover the bottom of the map canvas (the wider cause).
- **9a/9b** a short window is not all console.
- **10a/10b** the same question on the **Home tab**, which has no `EditorShell`
  at all — the console is app-global, and that is precisely why the fix could
  not be mounted inside the shell. 147 visible enabled controls, 0 unreachable.
  ⚠ The census filters to controls with a non-zero box: the app keeps every
  non-level tab MOUNTED behind `display: none`, so a document-wide sweep reports
  ~12 zero-box buttons in hidden panes as unreachable — which they are, and
  always were. The row requires `total > 10` so the filter cannot empty it.

An earlier draft of this section carried a row asserting *the lowest control on
the Home tab sits at or above the console's top*. It is **deleted, not
weakened**: content inside a scroller legitimately extends past the fold
(measured: lowest bottom 939 in an 872px window, on the FIXED tree), so the row
was false of a healthy app too. Reachability is the predicate; a bottom edge is
not.

### Non-discriminating rows, disclosed

- **3a, 3b, 3c, 6a, 6b, 6c, 7a, 7b, 9b** are green on master *and* on the fix. They
  are **controls**, not catchers: without 3b/3c a red 5a/5b could mean the
  predicate is simply unsatisfiable, and 6a–6c are the rows that stop this
  parcel trading one defect for another. **The catchers are 5a, 5b, 5c, 8a
  and 10b**, and for the `maxHeight` guard specifically, **9a and 9b**. ⚠ **9b is
  NON-DISCRIMINATING for the defect** — plant A leaves it green, because an
  overlay never squeezes the canvas — and discriminating only for plant B. 9a is
  red under both.
- **0a, 1a, 1b, 2a, 4a** are setup assertions. They can only fail on a broken
  fixture, which is exactly their job.

---

## 7. Red-first plants

**Plant A — the defect itself, restored.** After the fix was green three times,
`styles.root` was put back to `position: absolute; left: 0; right: 0; bottom: 22`,
rebuilt, re-run:

```
FAIL  [5a] THE OWNER'S CONTROL: with the console open, the LAST Remove button is still reachable
FAIL  [5b] with the console open, EVERY enabled control in the column is still reachable
FAIL  [5c] the console does not overlap the right-hand column at all
FAIL  [8a] the console does not cover the bottom of the map canvas
=== 13/17 rows passed ===
```

Identical to the master run. Restored, 19/19.

**Plant A again, after rows 10a/10b were added** — the same restoration on the
21-row instrument:

```
FAIL  [5a] … FAIL  [5b] … FAIL  [5c] … FAIL  [8a] …
FAIL  [9a] on a short window the console yields half the height, not all of it
FAIL  [10b] every VISIBLE enabled control on the Home tab (console included) is reachable
=== 15/21 rows passed ===
```

Two things this bought that the 17-row run did not: the **Home tab was covered
too**, and **9a is red under the defect as well as under plant B**. Restored,
21/21 on three consecutive runs.

**Plant B — the `maxHeight: '50vh'` guard deleted:**

```
FAIL  [9a] on a short window the console yields half the height, not all of it
FAIL  [9b] and the editor above it still has a real canvas
=== 17/19 rows passed ===
```

Restored, 19/19. Without this plant, 9a/9b would have been two rows asserting
that 260 ≤ 260.

### "If 5a went green for a reason OTHER than the rule holding, what would it be?"

- *The column never overflows, so its last control was never near the bottom.*
  Ruled out: 2a pins 16 layers, 3c/5b count 126 enabled controls, and the poison
  run puts 94 of them out of reach at the same window size.
- *The console was not actually open by section 5.* Ruled out: 4a measures the
  panel's box (`height 260`, on screen) immediately before, and 3a proves the
  same measurement returns `null` when it is shut.
- *`__reach`'s descendant leniency accepts the overlay.* It accepts only `el`,
  a descendant of `el`, or an element whose parent `el` contains — the console
  div is a sibling of `body` under the root and satisfies none of those. On the
  green side the accepted hit is `span text="Remove"`, i.e. the leniency is
  matching the button's own label span, which is what it is for.
- *`COLUMN` found the wrong element.* It reports its box on every run: `left
  1100, right 1400, width 300` — the `Panel width={300}` the effects facet
  passes, at the right-hand edge of a 1400px window.
- *The window is so large nothing could overlap.* Same window in every run, red
  and green.

---

## 8. The console is still fully usable

The bar this parcel could most easily have traded down. Rows **6a/6b/6c**,
green on both trees and re-measured on the fix:

- the header's **Close (Esc)** button — `reachable: true`, hit `button text="✕"`;
- the **error line** pulled to the top (`…error: symbol undefined: Foo_Bar`) —
  `reachable: true`, hit is the line itself;
- the **140th and last** output line (`linking object 139 ...`) — `reachable:
  true` after scrolling the console's own body.

Nothing about the panel's internals changed: header, error block, body scroller,
the follow-the-tail effect and the elapsed counter are untouched.

---

## 9. Booked, not fixed

- **`minHeight: 0` is still missing** from `App.tsx`'s `body`/`main`/`content`/
  `tabPane`. It is a real latent flexbox hazard — a flex item refuses to shrink
  below its content without it — and it is **not** this defect. Deliberately not
  bundled: no row in this harness can see it, so it would have ridden along
  unmeasured. It needs its own reproduction (a content-taller-than-container
  case) before anyone patches it, and the last person to "fix" it on a hunch
  produced the reverted branch in §2.
- **The status bar is now above the console rather than at the window's bottom.**
  If that ordering is wrong for the owner, the fix is to mount the console
  inside `EditorShell` above its `status` slot *and* keep an app-global mount for
  tabs that have no shell — a bigger change than this defect justified.
- **No node-suite regression pin.** The suite has no React renderer at all
  (`include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']` — `.ts`
  only, no jsdom, no `@testing-library`), and a source-grep row asserting
  `BuildPanel.tsx` does not contain `position: 'absolute'` would be a check that
  can only ever return green against a rewrite. The harness is the regression
  instrument; `BUILD_CONSOLE_HEIGHT` is exported so a future one has a number to
  read rather than re-type.
- **Not seen on the owner's own display.** Everything here is Xvfb at 1400×872,
  dpr 1.
