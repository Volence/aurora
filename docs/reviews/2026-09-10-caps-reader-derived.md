# A READER'S BLINDNESS WAS PRINTING AS AEON'S ABSENCE

**Branch** `parcel/caps-reader-derived`, base master `7e8a3553`.
**Code commit** `a2b7e973` (the whole change; this packet and the ledger line follow it).
**Closes** `docs/lens-findings.jsonl` id `VSRAM-DRIFT-READER-CANNOT-SEE-DERIVED`.
**One file changed:** `test/formats/aeon-vsram-mode-drift.test.ts`.

**No emulator was touched.** No `mcp__oracle__*` tool was called, no CDP harness was
run, and nothing in `../aeon` was written. aeon was read only through git objects at
`origin/master`.

---

## 0. The one thing to read if you read nothing else

> `test/formats/aeon-vsram-mode-drift.test.ts` printed
> **`games/demo/config/game.emp at aeon <sha> declares no SCANLINE_CAPS`**.
>
> **That sentence was false.** The file declares one. We could not evaluate it.
>
> A reader's **blindness** was being rendered as the producer's **absence**, and the
> defect was ours. The fix is not a better regex; it is that absence and blindness are
> now different answers with different messages, and neither can be reached from the
> other's evidence.

---

## 1. What master was doing, and why neither side had a defect

aeon turned `games/demo/config/game.emp`'s hand-written `SCANLINE_CAPS = $0FDE` into a
**derived** binding, `const SCANLINE_CAPS = DemoScenes_CapsFolded`. Our `scanlineCaps()`
matched `/const\s+SCANLINE_CAPS\s*=\s*(\$[0-9A-Fa-f]+|\d+)/`, returned `null` for a
name, and the row asserted `.not.toBeNull()` with the message quoted above.

Aeon's change was correct and deliberate; their own file argues that binding the fold is
**stronger** than declaring a mask, because "a subset test can be passed by a declaration
that is merely wide enough, while this cannot be wrong". Nothing on their side broke.
Nothing on ours broke either, in the sense that the *property* being watched was still
true. What broke is that we lost the ability to see it, and said something else instead.

`TIP` is `origin/master` — a moving target that on this machine advances **by push**, so
a consumer gate here goes red the instant a producer lands. **That has not been changed
and must not be.** Pinning `TIP` to a frozen aeon SHA would convert a live drift detector
into a fossil and hide the next real drift; it was considered and refused. (It is not
theoretical: aeon's `origin/master` moved from `1e6946fb` to `332edb5e` *during this
session*, between the first run and the red-first sweep. §3 re-establishes the state at
the later tip.)

---

## 2. The remedy, which is aeon's and not mine

**This is the third instance of one class, and aeon found the first two — in their own
repo, on the same day.** Their `25d88e38`, "two checks assumed a hand-written mask, and
the derived one caught both":

- `tools/scene_spans.py:game_caps()` text-scrapes this same literal and **raises rather
  than guessing**, because *"guessing zero here would silently assert the maximal
  elision."* **That refusal is correct and they kept it.**
- What they added is the **one derivation provable from source**: a name bound to
  `fold_caps(<registry>)` where the registry is **declared** `[Scene; 0]` folds to `0`,
  by the identity of the OR-fold. The **declared length** is sigil's proof the registry
  is empty — not the tool's reading of `[]`. It reads a **proof** rather than evaluating
  a fold it has no evaluator for.
- Every other shape still refuses, **loudly**, including a registry with scenes in it
  (the message names the count) and an untyped `= []`.

`scanlineCaps` now follows exactly that, returning **four** outcomes instead of
`number | null`:

| outcome | means | today |
|---|---|---|
| `literal` | a hand-written mask. The value. | `games/sonic4`, `= $0FDE` |
| `proved` | a **derived** binding whose value is provable from source text. The value, **and the proof named beside it**. | `games/demo` |
| `unreadable` | a binding **this reader** cannot evaluate. **Not a value and not null.** The message names *our* limit. | unreached |
| `absent` | no `const SCANLINE_CAPS` line at all. **The only one of the four that is a claim about aeon**, and it now says so in those words. | unreached |

### 2.1 One deliberate difference from aeon's tool

Their `game_caps()` decides "absent" by failing a **literal** regex and then a **name**
regex. So a right-hand side that is neither — an expression, or `= $0FDE  // note` —
reports `no `const SCANLINE_CAPS` binding in <path>`, **which is the same conflation this
row was just bitten by**, one shape further out.

Here the **binding is found first**, anchored on its own line, and only then is its
right-hand side classified. Absence is therefore **structural**: it cannot be reached by
a value shape we happen not to parse. A row in the reader test pins that (`= $0FDE  //
the mask` reads as a `literal`, never an absence).

This is offered as a courtesy observation about their tool. **Nothing in `../aeon` was
edited**, and their tool is not wrong for their fixtures.

---

## 3. Which state aeon's demo is actually in, and how that was established

**By reading the file, not by assuming.** `git -C ../aeon show origin/master:<path>`:

```
games/demo/config/game.emp:32   pub const DEMO_SCENES: [Scene; 0] = []
games/demo/config/game.emp:44   pub const DemoScenes_CapsFolded = fold_caps(DEMO_SCENES)
games/demo/config/game.emp:63       const SCANLINE_CAPS = DemoScenes_CapsFolded
games/sonic4/config/game.emp:145    const SCANLINE_CAPS = $0FDE
```

Read at `1e6946fb` and **re-read at `332edb5e`** after the tip moved mid-session; both
reads are identical in these lines.

> **`demo` is in state 2: DERIVED AND PROVABLE.** The registry is declared `[Scene; 0]`,
> the name is bound to `fold_caps` of that registry, so the fold is `0` by the OR-fold's
> identity, proven from the declared type.
>
> **`sonic4` is in state 1: a LITERAL, `$0FDE`.** Unchanged, and it is still read as a
> literal and still asserted against `CAP_PER_COL_VSRAM` (`$0002`). `$0FDE & $0002 = 2`.

**So state 3 (`unreadable`) is NOT CURRENTLY REACHABLE from aeon's tree.** It is
defensive, and the rows stay **asserting** today — no skip is introduced, and the suite's
skip count is unchanged (§5). That is the better outcome and the brief said so; this
packet is recording that it is what actually happened, not what was hoped.

---

## 4. The judgement call: what the row does when it cannot see, and why

**`unreadable` FAILS the row. It does not skip.** The opposite call is defensible in
general, so here is the argument for this one.

**The three constraints, all of which bind.** It must not silently pass (green-when-blind
is the failure this repo has paid for repeatedly). It must not assert a falsehood about
aeon (that is the defect being closed). A permanently red master over a state where
nothing is broken is also wrong.

**Why not a skip, given the in-repo precedent.** This repo does skip with a named reason,
and `readChain` in this very file does it: no aeon checkout beside us, or `origin/master`
not resolving. `npm run check:pseudo-skip` and the skip-report gate exist so such a skip
cannot hide. That precedent is about an **environment this repo does not control**.

`unreadable` is not that, on two counts:

1. **The environment can answer; we can't.** aeon's source is present, committed, and
   fully readable. What is missing is *our* evaluator. That is a defect on **this** side
   of the seam, actionable **here**, today, by editing one function. A skip would file
   our own blindness in the environment bucket, where nobody is accountable for it.
2. **`unreadable` is correlated with the very change it would hide.** The only route to
   it from aeon's demo is `DEMO_SCENES` gaining a scene — which is *precisely* the event
   that could raise demo's caps and make the panel's "demo does not declare
   `CAP_PER_COL_VSRAM`" clause **false**. Skipping there is green-because-blind at the
   exact moment the answer is most likely to have moved.

The "permanently red over nothing broken" objection therefore does not apply: in state 3
something **is** broken — this reader — and the message says so, blames the right side,
names the shape it found, and says what to do about it. The blindness message contains
`This is a limit of THIS READER, not a defect in aeon's file` and it is pinned by a row
that it **must not** contain `no \`const SCANLINE_CAPS`.

**The alternative I would accept later, and the condition.** If aeon ever reaches a
derived shape this reader genuinely cannot follow *and* it is proven that demo's caps did
not move (for example, aeon publishes the folded mask into a build artifact this repo can
read), the honest move is to read that artifact — not to skip and not to guess. That is a
change of instrument, not of verdict.

---

## 5. The row is also SPLIT IN TWO, which is the fix's second half

The conjunct used to be one `it` covering both games. The demo half failing therefore
took the sonic4 half down with it: **the red run never evaluated sonic4's conjunct at
all**, and a reader could not tell from the output whether sonic4 was still fine.

They read different files and are in different states. They are now two rows:

- `the conjunct, sonic4 half: sonic4 DECLARES CAP_PER_COL_VSRAM`
- `the conjunct, demo half: demo does NOT declare CAP_PER_COL_VSRAM`

Proven by M1 below: under a mutation that blinds the demo half, **the sonic4 half stays
green and is still evaluated**.

---

## 6. Red-first, all four mutations shown on disk

Baseline restored from committed `a2b7e973` after each; `git diff --stat` clean before the
next. The runner is **vitest 4.1.4**, invoked as `npx vitest run
test/formats/aeon-vsram-mode-drift.test.ts`. Expectations are derived from the source
read in §3, not from a prior run.

### M1 — the `proved` path removed (state 2 collapses to state 3)

```diff
@@ -225,4 +225,8 @@ function scanlineCaps(text: string, where: string): Caps {
   }
 
+  return {
+    kind: 'unreadable',
+    why: 'M1 MUTATION: proof path removed',
+  };
   return {
     kind: 'proved',
```

`Tests  2 failed | 5 passed (7)`

- `the conjunct, demo half` → `AssertionError: M1 MUTATION: proof path removed`
- the reader row → `expected 'unreadable' to be 'proved'`
- **`the conjunct, sonic4 half` PASSED.** This is the §5 property, measured.

### M2 — guess zero for ANY registry length (the degradation aeon refused)

```diff
@@ -217,3 +217,4 @@ function scanlineCaps(text: string, where: string): Caps {
   const n = Number(decl[1]);
-  if (n !== 0) {
+  if (false) { // M2 MUTATION: guess zero for ANY registry length
```

`Tests  1 failed | 6 passed (7)` — the reader row: `expected 'proved' to be 'unreadable'`.

A registry declaring 3 scenes now yields a confident `0`. **This is exactly "a wrong zero
silently asserts the maximal elision", and the reader row catches it.** The demo half
stays green because aeon's registry really is `[Scene; 0]` — correct, and the reason the
anti-vacuous row exists rather than relying on the live tree.

### M3 — absence folded back into blindness (the original defect, re-planted)

```diff
@@ -168,4 +168,4 @@ function scanlineCaps(text: string, where: string): Caps {
     return {
-      kind: 'absent',
-      why: `MEASURED, AND IT IS ABOUT AEON: ${where} carries no ...
+      kind: 'unreadable',
+      why: `M3 MUTATION: absence folded into blindness: ${where} carries no ...
```

`Tests  1 failed | 6 passed (7)` — the reader row: `expected 'unreadable' to be 'absent'`.

**This is the parcel's own thesis, planted as a defect and caught.**

### M4 — every literal reads as zero (does the sonic4 half still assert?)

```diff
@@ -181,3 +181,3 @@ function scanlineCaps(text: string, where: string): Caps {
       kind: 'literal',
-      value: expr.startsWith('$') ? parseInt(expr.slice(1), 16) : Number(expr),
+      value: 0, // M4 MUTATION: every literal reads as zero
```

`Tests  2 failed | 5 passed (7)` — and the sonic4 half's own message came out:

```
AssertionError: sonic4's SCANLINE_CAPS (0, read from the hand-written literal `$0FDE`)
no longer declares CAP_PER_COL_VSRAM (2) at aeon 332edb5e...
```

> **The sonic4 half still asserts what it asserted before.** It reads `$0FDE` as a
> literal, ANDs it with `$0002`, and goes red the moment that stops being non-zero. The
> fix did not quietly loosen both halves — which would have been the real regression
> here — and M4 is the measurement that says so rather than the assurance.

**All four mutations reddened. None went green-and-still-passing.** Every row named above
existed before the mutation was planted.

---

## 7. Verification at the tip

`npm test`, foreground, exit status captured on its own line (**`NPM_TEST_EXIT=0`**):

```
Test Files  596 passed | 3 skipped (599)
     Tests  8910 passed | 9 skipped (8919)
  Duration  33.58s
skip-report: 9 SKIPPED test(s) in 7 file(s). ... skip-report: OK. Every skip named its reason.
failure-class: no failures in this run (599 module(s) reported).
```

Started `2026-09-10T09:10:17Z`, finished `09:11:11Z`, on a 16-core box whose 1-minute load
went **5.53 → 21.55** across the run (this repo's own suite is most of that). `npm test`
runs eleven prose/structure gates before vitest and all of them passed, including
`check-pseudo-skip` and `check-test-dashes` (`OK: 621 file(s) ... no U+2014 or U+2013 in
any string, template or JSX text` — one dash the gate caught in a message string was
repaired before this run, with the gate's own exit status captured separately from its
piped output).

`test/formats/aeon-vsram-mode-drift.test.ts` reports **7 tests, 0 skipped**. **The 9 suite
skips are the pre-existing ones and none is in this file.** All seven skipping files, each
naming an opt-in or an absent tree this parcel did not touch:
`src/core/editing/__tests__/bg-override-art-injector-gate.test.ts` (3 rows,
`AURORA_FG_GATE_FILE` unset), `src/renderer/canvas/__tests__/compose-bench.test.ts`
(`AURORA_BENCH` unset), `test/live/aeon-warp-correspondence.test.ts` and
`test/live/s1-warp-live.test.ts` (live-warp variables unset),
`test/sprite/anim-import.test.ts` and `test/sprite/sprite-import.test.ts` (the `s4_engine`
tree is gone from this machine), and `test/support/sibling-root.test.ts` (this run stands
in a linked worktree, not the main checkout). **The last three are exactly the in-repo
precedent §4 weighs against**: a skip is right where the ENVIRONMENT cannot answer.

---

## 8. What this does NOT prove

- **It is not a claim about a ROM.** Everything here reads aeon's **source text**. Whether
  a built ROM's VDP $0B reads `$07` on a `v_deform` scene is the engine lane's
  measurement, relayed in `src/core/formats/effects/ramp-scroll-mode.ts` and labelled as
  relayed. Nothing here stands in for it or retires it.
- **It does not prove demo's mask is 0 by evaluating anything.** It proves that the
  *declared* registry length is `0` and that the OR-fold's identity is `0`. That is a
  proof read out of aeon's source and out of aeon's own derivation at `fold_caps()`. If
  sigil's fold ever stopped being an OR-fold, this proof would be quietly wrong and this
  reader could not tell. **The proof is named in the message precisely so that a reader
  can check the premise rather than trusting the number.**
- **State 3 has never been exercised against aeon's tree**, only against synthetic
  manifests. §4's argument for failing there is a design decision, not a measurement.
- **It does not prove `TIP` will not move again.** It moved once during this session.
  That is the detector working, and it is the reason the next red on this file deserves a
  read of the message before a read of the blame.

---

## 9. Left open (leads, not rows)

1. **`src/core/formats/effects/ramp-scroll-mode.ts` quotes `SCANLINE_CAPS = $07DE` for
   sonic4 and `= 0` for demo.** Checked, and **it is honest**: the module pins
   `RAMP_SCROLL_MODE_MEASURED_AT = 'ddaab282'`, and at that revision sonic4's line 126
   really is `$07DE` and demo's line 20 really is `0` — line numbers included. It has
   since become `$0FDE` and a derived binding. Nothing to fix; noted because the next
   reader who greps for `$07DE` will find a number aeon no longer has, and the pin is the
   answer.
2. **aeon's `caps_from_manifest` conflates a value shape it cannot parse with an absent
   binding** (§2.1). Their fixtures do not reach it. It is theirs to weigh; this is not a
   request.

---

**Attribution.** The remedy is aeon's, at `25d88e38`. What this parcel added is the
fourth outcome — that an **absence** and a **blindness** may never share a message — and
the split that stopped one half of a conjunct from silencing the other.

https://claude.ai/code/session_0185RfGzEpBpRmiQJEcVRspE
