# d-27's sprite-chip rows meet d-29's dialog — and the question nobody had asked

**Parcel** D27-SPRITE-FOCUS-ROWS-CONSUMED · **branch** `parcel/d27-sprite-rows-meet-dialog`
off `master ed4df57e` · **tips** `1da7099d`, `df2258a1`, and the commit carrying this packet.

Closes the tag row 143 left open in its own last paragraph:

> **⚠ ONE EXISTING INSTRUMENT IS NOW RED AND I DID NOT TOUCH IT:** six rows of
> `scratchpad/d27-sprite-focus-harness.mjs` … **TAGGED for foreground follow-up**
> (retire the rows explicitly, or teach them to answer the dialog).

**Teach them.** The ruling held; nothing was overturned. What follows is the evidence,
and the one thing the parcel found that was not in anybody's plan.

---

## 1. What ed4df57e actually did to this rig — measured, not inferred

The brief said six rows *would now fail*. They do, but the damage is larger than six
rows and the shape of it matters.

**Baseline run, `master ed4df57e`, this worktree, `dpr=1`:**

```
20 PASS / 1 FAIL, then HARNESS ERROR, exit 2
FAIL  [sp1-a]
HARNESS ERROR: AIM REFUSED: integer (384,90) for "size-preset chip \"48\"" [preset48]
  lands on <DIV> "Discard this sprite?This", not the handle.
```

`[sp1-a]` fails; the dialog it raised is **never dismissed**; `[sp1-c]`'s aim then lands
on the dialog's `position: fixed; inset: 0` backdrop and the file refuses and dies. So of
the 30 rows the file declares, **21 printed and NINE NEVER EXECUTED** — `sp1-c`, `sp1-d`,
`sp2-a`, `sp2-b`, `sp2-c`, `sp2-d`, `fg-d0`, `fg-d`, `z1`. Two of those (`fg-d0`, `fg-d`)
belong to a site d-29 never touched: FrameGrid's Delete on its `frames.length <= 1` early
return, the row the header calls *"the sharpest `[k7]` in the file"*. Row 121's recorded
`30/30` had become a 21-row abort.

**And the one row that stayed green was the worst of them.** `[sp1-b]` reported PASS with
the dialog standing over it — its Space was dispatched at a screen covered by a modal
backdrop, so *"the document did not change"* was true for a reason that has nothing to do
with d-27. A row that cannot reach its subject and reports success is this repo's worst
failure mode, and it is the single strongest argument against retiring rather than
teaching: retirement would have deleted the rows that went red and **kept** the one that
lied.

## 2. Why the ruling held — the subject survived, only the path to it grew a step

The overseer's reasoning was that this file's subject is d-27 focus behaviour and the
document-replacement assertion is scaffolding. I worked it independently from the source
and reached the same place, with a mechanism rather than an argument:

```ts
// components/ui/act-and-drop-focus.ts
export function actAndDropFocus(e, act) {
  e.currentTarget.blur();   // ← BEFORE act()
  act();
}
```

The chip blurs **before** `newSpriteGuarded` is called at all. d-29 changed what `act()`
does; it could not change whether the blur ran. So the property under test is untouched
and still measurable off the same press — which is exactly what `[sp1-a]`/`[sp2-a]` now
assert, and what plants P1 and P2 confirm by killing it.

The `[k2]` precedent does not transfer, for the reason the brief gave: there, d-27 made
the row's own claim false. Here it did not. **No row was retired.** Six were re-aimed and
six new ones added.

What *did* change is the scaffolding's evidence. The press no longer replaces anything, so
"the chip acted" is now proved by **the dialog itself** — a chip wired to nothing raises
none — and the replacement assertion moved to the far side of a clicked `Discard & start
new` in `-c`.

## 3. The new question, and its answer

> When the dialog closes — via Discard, via Cancel, via Esc — where does keyboard focus
> land, and does a bare Space immediately afterwards re-fire anything destructive?

This was worth asking rather than assuming. `shell/ConfirmDialog.tsx` sets **no initial
focus** and installs **no focus trap**; `ui/focus-trap.ts` names it in its own header as
*"the obvious second caller"* and is not wired to it. Its buttons unmount on answer, and
what Chromium does with focus after the focused element is removed is a browser detail,
not a design decision anybody in this repo made.

**Six rows added — two sites × three close paths.** Each asserts: the dialog is gone;
`activeElement` is neither the chip nor **any other `<button>`** (derived, not copied: what
makes Space dangerous is a focused button for it to activate); and a bare Space + Enter
writes nothing **and raises no dialog**.

That last clause is the sharp one and it is only available *because* of d-29. The keys are
sent on a document that is **DIRTY** (asserted in the row), so a key that reached
`newSpriteGuarded` would put the dialog straight back on screen — visibly — even though it
would not yet have written a byte. Before d-29 a Space that reached the writer and one
that did not were distinguishable only by bytes. **The guard is now the detector.**

### The answer: no defect. `<BODY>` on all six.

| row | site | closed by | `activeElement` | dialog re-raised by Space? |
|---|---|---|---|---|
| `sp1-e1` | size chip `64` | Esc | `<BODY>` | no (`seen=false`) |
| `sp1-e2` | size chip `64` | mouse click on **Cancel** | `<BODY>` | no |
| `sp1-e3` | size chip `48` | mouse click on **Discard & start new** | `<BODY>` | no |
| `sp2-e1` | `New □` | Esc | `<BODY>` | no |
| `sp2-e2` | `New □` | mouse click on **Cancel** | `<BODY>` | no |
| `sp2-e3` | `New □` | mouse click on **Discard & start new** | `<BODY>` | no |

Consistent with `[k3]` of `scratchpad/confirm-destroy-harness.mjs`, which reads `<BODY>`
after a Cancel click on the Chunks Clear button. The dialog satisfies d-27 today, at these
two sites, on all three of its close paths, **and now it is pinned.**

## 4. ⚠ THE FINDING: the dialog satisfies d-27 by ACCIDENT, and P3 shows the cost

Plant P3 adds four characters of standard accessibility practice to `ConfirmDialog`:

```diff
             <button
               key={b.key}
+              autoFocus={b.tone === 'danger'}
               onClick={() => answer(b.key)}
```

With it, in the real app, **a bare Space silently destroyed the sprite**:

```
FAIL  [sp1-b] … a bare SPACE (and Enter) WHILE THE DIALOG STANDS answers it neither way
      dialog after the keys = undefined;
      frames=5 40x40 cov=[224,…] dirty=true  →  frames=1 64x64 cov=[0…] dirty=false
```

Five frames and 224 painted pixels gone, the undo history cleared, the dirty flag reset —
so the tab-close, project-open and window-close guards all go quiet too — from **one
keystroke the author never aimed at anything**. That is the precise defect d-27 exists to
prevent, reintroduced by an edit that would read as an improvement in review, on the very
component that was added to *stop* this class of loss.

Nothing in the repo defends this. The only reason the shipped app is safe is that
`ConfirmDialog` happens to focus nothing, and `ui/focus-trap.ts` openly invites the next
person to change that. **As of this parcel, `[sp1-b]`/`[sp2-b]` and the `-e*` family
defend it** — P3 takes eight rows red. This is TAGGED for foreground follow-up in §7: the
harness now catches it, but a `.mjs` harness outside `npm test` is a slower alarm than the
hazard deserves.

## 5. Red-first — six plants, each applied on disk and restored from a committed baseline

Every plant: tree verified clean, plant applied by an exactly-one-match patch, `git diff`
shown, `VITE_AURORA_DEBUG=1 npm run build`, **full run**, then `git checkout --` back to a
committed tip. Clean-tree baseline before and after: **40/40, exit 0.**

| plant | what it breaks | rows RED | total |
|---|---|---|---|
| **P1** | the **preset-chip** dispatch line loses its blur (that line only) | `sp1-a` `sp1-e1` `sp1-c` `sp1-d` | 36/40 |
| **P2** | the **`New □`** dispatch line loses its blur (that line only) | `sp2-a` `sp2-e1` `sp2-c` `sp2-d` | 36/40 |
| **P3** | `ConfirmDialog` autofocuses its danger button | `sp1-b` `sp1-e1` `sp1-e2` `sp1-c` `sp2-b` `sp2-e1` `sp2-e2` `sp2-c` | 32/40 |
| **P4** | the chips take focus **back** when the dialog resolves | `sp1-e1` `sp1-e2` `sp1-e3` `sp1-d` | 36/40 |
| **P5** | d-29's clean arm removed — the guard confirms UNCONDITIONALLY | `sp1-d` `sp2-d` | 38/40 |
| **P6** | Discard answers and closes but **never writes** | `sp1-c` `sp1-d0` `sp1-d` `sp2-c` `sp2-d0` `sp2-d` `fg-d0` `fg-d` | 32/40 |

**P1 and P2 are the site-discrimination pair and they are clean in both directions:** P1
reddens four `sp1` rows and **no `sp2` row**; P2 reddens the mirror-image four `sp2` rows
and **no `sp1` row**. Six near-identical sites is where a fix wired to the wrong one
survives a convincing green; these two say it did not.

**P1 is also where the "raises no dialog" clause earned itself.** `[sp1-e1]` went red on
`seen=true`, not on bytes:

```
FAIL  [sp1-e1] … activeElement = <BUTTON> "64" (isTheChip=true, isAnyButton=true);
      … (fingerprint identical = true); the dialog watcher … reported seen=true.
```

The document was **unchanged** — a byte-only assertion would have passed. The Space
re-fired the chip and the guard caught it in flight.

**P4 is the plant the `-e*` family was written for.** It restores focus to the chip when
the dialog resolves — textbook a11y focus-restore, and at these sites it reinstates the
exact d-27 defect *behind* the dialog. It reddens **all three `sp1-e*` rows and nothing
else at that site**: `sp1-a` and `sp1-b` stay green, because the press-time blur still
happens. Before this parcel **nothing in the repo could see it.**

**P6's cascade is honest and stated as such.** Its primary reds are `sp1-c`/`sp2-c`, the
scaffolding rows. The other six follow mechanically: with the only writer removed no
document ever becomes clean, so every downstream fixture that needed one collapses. Same
for P3, whose reds past `-b` are the *consequence of the sprite having been destroyed* —
the cascade **is** the damage.

### A green poison would have had three causes; here is which was ruled out

No plant came back green, so the question does not arise for any of the six. It was
guarded against in advance anyway: **a loose matcher** is ruled out because every focus
assertion compares element **identity** (`a === window.__d27.el(handle)`), never text; **a
second code path** is ruled out by P1/P2 reddening disjoint row sets from one shared
helper; **a row not reaching its subject** is the failure this parcel was formed to fix,
and is now guarded structurally — every phase boundary that can inherit a dialog calls
`ensureNoDialog`, and every aim is verified with `elementFromPoint` before a single event
is dispatched.

### ⚠ P5 found a hole in my own edit, and reading would not have

On its first run P5 reddened `sp1-d` and `sp2-d` correctly — and then **aborted**:
`[sp2-d]`'s no-op press left a dialog standing, the `[fg-d]` phase aimed into its backdrop,
and the run died carrying `fg-d` and `z1` with it. One stack trace instead of *"P5 reddens
sp1-d and sp2-d and nothing else"*, which is the entire claim a per-arm plant exists to
establish — and the same failure `ed4df57e` inflicted at `[sp1-c]`. Every other phase
boundary already had an `ensureNoDialog`; that one did not. Fixed in `df2258a1`, clean tree
re-verified 40/40, **P5 re-run to the 38/40 in the table above.** Recorded because the
plant found it and I did not.

## 6. Before and after, both run by me, same box

| | rows declared | run result | exit |
|---|---|---|---|
| **before** (`master ed4df57e`) | 30 | 20 PASS / 1 FAIL, **then HARNESS ERROR — 9 rows never executed** | 2 |
| **after** (`df2258a1`) | **40** | **40/40** | 0 |

Environment, printed by the runs themselves: `dpr=1` on **every** aim of every run (the
1.35 case did not occur, and would have been visible); Xvfb `1680x1050x24`;
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` (this worktree
has no binary of its own); `VITE_AURORA_DEBUG=1 npm run build` before each run;
`AURORA_BUILT_TREE` defaulted to this worktree, whose `dist/` each run rebuilt.
Box: up 9 days ~18h, 16 cores, load average **6.70** at the baseline run, **9.10** at the
first green run, **6.43** at the re-verified green run. No emulator tool was touched.
Nothing was written to disk by any run (`[z1]`: no Ctrl+S, no save call, no autosave;
`s1disasm` OPENED ONLY).

Static guards, run on the final clean tree: `check-test-collection` OK (494/494),
`check-pseudo-skip` OK, `check-peer-path-literals` OK (all 5 rules fired on their
canaries), `check-object-stringify` OK, `check-cited-paths` OK, `check-harness-guards` OK
(203 clean / 203 classified). `vitest` and `tsc` are not re-run for this change: it touches
one file under `scratchpad/`, which vitest does not collect and `tsc` does not typecheck —
and `check-test-collection` is what proves that population claim rather than my say-so.

`package.json` was **not** touched: `harness:d27-sprite-focus` was already registered, and
another lane's census is keyed on that list.

## 7. Left open, and TAGGED for foreground follow-up

1. **⚠ `ConfirmDialog` is one plausible edit away from destroying a sprite on a bare
   Space (§4).** Its safety today is the *absence* of focus management, while
   `ui/focus-trap.ts` explicitly nominates it as the next caller. This parcel makes the
   harness catch it (P3 → 8 rows red); it does **not** make the app defend it, and that is
   a design call, not a harness one. **Foreground follow-up: decide whether
   `ConfirmDialog` should focus its *safe* button (Cancel) rather than nothing, which is
   both more accessible and strictly safer than the status quo — a bare Space would then
   cancel.** Not done here: it is a behaviour change to a shared door that four other
   perimeters ask through, and no card asked for it.
2. **This rig is still outside `npm test`,** which is how row 121's `30/30` became a
   21-row abort without a single red anywhere. Not changed here — `package.json` is off
   limits this parcel — but the mechanism is now written down twice.
3. **`[tl-d]` remains NOT MEASURABLE** and unchanged; d-29 did not touch that site.
4. **Worktree note, not a defect in anything:** a linked worktree needs a symlinked
   `node_modules` to build, and `git check-ignore` refuses to look *"beyond a symbolic
   link"*, which turns `check-cited-paths` into a loud **COULD NOT MEASURE**. It exits 0
   and reports OK with the symlink moved aside — verified both ways this session. It
   degrades loudly rather than silently, which is correct; worth knowing before someone
   reads it as a red.

## 8. Row-by-row, what each of the six became

| was | is now |
|---|---|
| `sp1-a` / `sp2-a` "click drops focus AND replaced the document" | click drops focus **AND reached the writer (the dialog is up)**, document untouched while it stands. The "it acted" half is now the dialog. |
| `sp1-b` / `sp2-b` "a Space straight after the click writes nothing" — *passed with the dialog on top of it* | a Space **while the dialog stands** answers it **neither way**. The row P3 kills. |
| `sp1-c` / `sp2-c` "a second click still replaces the document" | a second click on the **other** dispatch line drops focus, asks again, and **on a clicked Discard really does replace it**. |
| `sp1-d` / `sp2-d` "a no-op press still drops focus" | unchanged **plus d-29's clean arm**: no dialog at all on a clean press. The row P5 kills. |
| — | `sp1-e1..e3`, `sp2-e1..e3`: **the far side of the dialog** (§3). The rows P4 kills. |
| — | `sp1-0`, `sp1-d0`, `sp2-0`, `sp2-d0`: anti-vacuous fixture rows asserting which arm of d-29 each phase is on. |

Machinery — `dlg:` handles, `info()`, the latching `MutationObserver`, `answerDialog`,
`ensureNoDialog` — is borrowed wholesale from `scratchpad/confirm-destroy-harness.mjs`
rather than invented a second time. Two harnesses driving one dialog two different ways is
how they end up disagreeing about it.
