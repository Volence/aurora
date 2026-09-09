# The UX seat pair, reconciled

**Controller reconciliation, 2026-09-09.** Seat A walked five newcomer jobs
(`docs/reviews/2026-09-07-lens-ux/uxa-walk.md`); seat B audited 46 of 88 panels against a
five-item checklist (`.../uxb-audit.md`). Neither could see the other: separate worktrees,
builds, displays, ports, project copies, and each judged by the standard **it wrote
itself, cold, before the shared text existed**.

## 1. Convergence — the top finding class, and what it is evidence FOR

### C1 · Saving is the weakest surface in the app, found twice by different instruments

- **Seat A, paid three times:** the README never states the save gesture, so `Ctrl+S` was a
  **guess**; a successful save reports nothing but a **~6 px dot**.
- **Seat B, independently:** a full-DOM scan for an unsaved marker returns `[]` while
  `Ctrl+S` — *the remedy the dirty dot's own tooltip names* — is a **silent no-op**; and
  the level surface has no Save control at all where the sprite surface does.

Two seats, two methods, one conclusion: **the app's save contract is invisible, and its
one advertised remedy does not always work.** Neither seat could have told you this alone
— A knew the gesture was undiscoverable, B knew it silently failed.

### C2 · The art composer's writes are wider and less reversible than they look

- **Seat A:** fourteen pixels in **an unused tile** rewrote two `.nem` files, **+329 bytes
  of ROM art**, unannounced. *(Cause not determined; the seat says so.)*
- **Seat B:** a paint stroke moved the canvas hash with **Undo already disabled**, and
  `Ctrl+Z` left it byte-identical — against a **matched control**, the sprite canvas, which
  undid the same gesture back to the exact starting hash.

### C3 · Both seats hit the native file dialog — and this is where convergence is a TRAP

Seat A pressed `Open Project…`, saw nothing, and **refused to attribute it**. Seat B
declined to press it at all and **declared it undrivable**. Two independent seats, same
wall.

⚠ **Had I taken agreement as confirmation, I would have filed a serious app defect.**
Attribution (`docs/reviews/2026-09-09-rig-native-dialog-blindspot.md`): a **twelve-line
Electron script containing none of Aurora's code** reproduces it exactly — window on the
Xvfb, no dialog anywhere, promise never settles. **It is the rig.**

**So: convergence is evidence about REPRODUCIBILITY, never about CAUSE.** Two honest seats
agreeing tells you the observation is real and repeatable; it says nothing about what
produced it, and a shared environment is a shared confound. The pair's value survives —
seat B's *handling* (declare, don't substitute) was better than seat A's, and that
difference is only visible because they were independent.

## 2. Where they diverge, which is also information

**Seat A found the Effects panel GOOD** — the `? Guide` closed the band→preset→Colour
vocabulary gap in one click, and the panel states its own limits **in advance** (no
preview, saving does not install, this section will be refused by the build), which is why
authoring a band cost time but **never certainty**. Seat B reached only 10 of 25 panels on
that surface and files nothing about it. **Not a contradiction — an uncovered corner**, and
the census is what makes it visible instead of absent.

## 3. What I am NOT carrying forward as stated

- **Seat B's F1 framing.** `ComposerCanvas` has several commit paths and at least one
  (`bgOverride`) records on the act's history with a test pinning `Ctrl+Z` reaching it. The
  defect is real and the control makes it a defect rather than a design — but *"the art
  canvas has no undo"* is too broad to fix against, and a fix parcel must reproduce the
  specific path red-first.
- **Seat A's F1 cost sentence**, per C3 above. Its structural half — one advertised entry
  point, no second door — stands.

## 4. Both seats corrected their own instruments mid-walk, and said so

Seat B manufactured **three false observations** from stale coordinates plus panel reflow,
one looking exactly like *a destructive one-click action under a section header*; it fixed
`clickAt` to locate-then-press, binned the three as its own, and **counted them in its 41**.
Seat A's F4 is only correctly attributed because it ran **a control with the layout
settled** — without it, it would have filed a text-entry defect instead of a reflow one.

**In a walk whose whole output is judgement, the instrument corrections are the strongest
evidence that the judgement was applied** — and both surfaced them unprompted.
