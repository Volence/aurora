# LANE-STATUS-CHECK-BOUNDS — the three contract size bounds, asserted and proven red-first

**Branch** `parcel/lane-status-bounds` · **2026-09-12** · packet for the parcel that added the
three `contract/LANE_STATUS.md` rule 7 size bounds to `scripts/check-lane-status.mjs`.

---

## 1. The contract, read at a committed revision

```
git -C ../empyrean fetch -q origin
git -C ../empyrean rev-parse origin/main   -> f39482b212397c440c8ee3edcd9a4da55099cd63
git -C ../empyrean show origin/main:contract/LANE_STATUS.md
```

Rule 7, **"Size bounds, so rule 6 is measurable"** *(owner, 2026-09-02)*, quoted:

> a queue row's `title` is **at most 240 characters**, `queue` holds **at most 20 rows**, and the
> whole file is **at most 12 KB**.

**The contract AGREES with the three numbers the brief stated.** No disagreement to report on the
values. Three notes on them that the brief did not carry, and that the numbers alone do not settle:

1. **"12 KB" is ambiguous in prose, and the contract's own executable reader settles it.**
   `empyrean/scripts/hub_check.py`, at that same SHA, declares
   `MAX_TITLE, MAX_ROWS, SOFT_BYTES = 240, 20, 12 * 1024`. So the byte bound implemented here is
   **12288**, not 12,000. Two readers of one contract disagreeing about a bound would be worse
   than either bound.
2. **The contract states a fourth bound this parcel does NOT cover, and it is named here rather
   than silently swept in:** `focus` is "One sentence, **≤120 chars**". That is in the field table,
   not in rule 7, and the brief scoped this parcel to rule 7's three. It is not checked.
   Measured read-only on the live file just now, `focus` is inside it, so nothing is hiding behind
   the omission today.
3. **Rule 7 ends by saying who is supposed to do this**: *"Dominion MAY surface an over-bound row
   as a `stateProblem` once it implements the check; until then the bound is the contract and **a
   lane checks it itself**."* This parcel is that self-check finally existing.

**On anchors.** The brief asked me to note that a "verified-at" SHA is an anchor too. The contract
carries several, and they anchor **other repos' behaviour**, not these numbers: `dominion ff0ddd3`
(`server/src/laneStatus.ts`, the fail-soft reader), and `c381ed8e` / `ae252e0` for a lane's own
`next` history. **I did not verify any of those** — no dominion checkout was read, and nothing in
this change depends on them. The two anchors this change does rest on are both at
`f39482b2`: rule 7's prose, and `hub_check.py`'s executable restatement of it. They agree.

### The gap was already a filed, dated upstream finding

`hub_check.py`'s own docstring, same SHA:

> *Aurora's finding, 2026-09-10: its own `npm run check:lane-status` reported OK on a file with 22
> rows and four titles over 240 characters. Per-lane checkers do not reliably cover these bounds,
> and the contract they implement is owned HERE, so the hub measures them for all six from one
> payload.*

So the hub built its own sweep **because this checker did not cover the bounds**, two days before a
245-character title passed the same checker again. That is the finding this parcel closes, and it
is why the fix belongs in the per-lane gate rather than in one more downstream reader.

One thing `hub_check.py` cannot do and this gate can, worth keeping because it is the reason the
byte bound is gateable here at all: the hub measures `len(json.dumps(doc))` of a **re-serialized**
document and says so, reporting that figure and never gating on it, "because the number it has is
not the subject". This gate holds the file, so its number **is** the subject.

---

## 2. What changed

| File | What |
|---|---|
| `scripts/check-lane-status.mjs` | the three bounds, an overridable path, and two unmeasurable cases made loud |
| `test/config/lane-status-bounds.test.ts` | 21 rows driving the gate over fixtures, inside `npm test` |
| `test/config/fixtures/lane-status/baseline.json` | the committed, inside-every-bound baseline the mutants are built from |

```
30afaf84  lane-status: assert the three contract size bounds, each reporting independently
976fc7ba  lane-status: cite hub_check.py by its peer-qualified path so check-cited-paths can judge it
```

Tip at the time of writing: `976fc7ba36a59de7c7598d14b916f893dffc1ace` on `parcel/lane-status-bounds`.

### The measurement decisions, and why each is the one the contract means

- **The file bound is on BYTES.** The contract's own recipe for it is `wc -c`, which counts bytes.
  The gate reads the file as a Buffer and measures `Buffer.length`. Not characters: a character
  count under-reads every multi-byte character, and these files are full of them (see the
  bytes-not-characters row in §4, which fails a character-counting gate on a real file). Not lines:
  nothing in the contract is about lines, and a one-line JSON file would measure 1.
- **Titles are counted in CODE POINTS.** The reference reader is Python's `len()` on a `str`.
  JavaScript's `String.length` counts UTF-16 units, so one astral character (an emoji) would count
  2 here and 1 in the hub's report, and the same row would be over on one reader and inside on the
  other. `[...title].length` counts code points, and a row pins it.
- **One property per check: three independent `if`s.** Each pushes its own message naming its own
  measurement, its own bound, and the amount it is over by; the epilogue prints **all** problems a
  run found. A document over on all three is the ordinary case, not the exotic one, since the rows
  and the titles are what make the bytes.
- **Asserted, not read back.** All three are computed and pushed inside the script, per
  `docs/OVERSEER.md`: *"assert the three in the script that writes it, don't read them back
  afterwards."* Nothing re-reads the file afterwards to check up on itself.

### Loud on unmeasurable, which it partly was not

| Case | Before | Now |
|---|---|---|
| file absent / unreadable | one message, exit 2 | `COULD NOT READ`, "Nothing was measured", exit 2 |
| file present, not JSON | same message as above | distinct message + the byte count that WAS read, exit 2 |
| `queue` missing | coerced to `[]`, measured as **0 rows** | `MISSING`, reported as a failure |
| `queue` not an array | coerced to `[]`, measured as **0 rows** | `not an array (it is object)`, `UNMEASURABLE` |

The last two are the silent-zero shape: nought rows is exactly what a lane with an empty queue
looks like, so the number a reader trusts would have been indistinguishable from a real one.

---

## 3. FINDING: the brief's premise "and inside `npm test`" was FALSE, and it still is for the script

`npm run check:lane-status` was **not** part of the `npm test` chain before this parcel, and it is
not now. Verified rather than assumed:

```
$ grep -rn "check-lane-status\|check:lane-status" --include=... .   # whole repo, node_modules excluded
package.json:65:    "check:lane-status": "node scripts/check-lane-status.mjs",
scripts/check-lane-status.mjs:22,81,85          (the script's own strings)
```

Four references, all of them the registration and the script itself. Nothing else runs it. The
repo's own instruction is different from the brief's: `docs/OVERSEER.md` says **"Run
`npm run check:lane-status` after EVERY write to that file"** — a per-write run, not a suite run.

**I did not wire the script itself into the `npm test` chain, deliberately, and this is the item to
overrule me on if you disagree.** `docs/lane-status.json` is gitignored (`.gitignore` line 11).
It does not exist in a worktree at all — the very first run of the gate in this worktree was
`COULD NOT READ ... ENOENT`. Adding `node scripts/check-lane-status.mjs` to the chain would make
`npm test` fail in **every agent worktree**, always, for a reason unrelated to whatever is under
test, and the cheapest way back to green would be to make an absent file a silent pass, which is
the exact defect invariant (d) forbids. The other escape, having the gate reach into the primary
worktree for the owner's live copy, would make every agent's suite run depend on a file the owner
is editing live and invite agents to "fix" it. Both are worse than the gap.

**What IS inside `npm test`:** the three bounds themselves, executed by
`test/config/lane-status-bounds.test.ts`, which spawns the real
`scripts/check-lane-status.mjs` as a child process over fixtures and asserts its exit code and its
message text. So the CODE is covered by the suite; the LIVE FILE is covered by the per-write run
`OVERSEER.md` already mandates. Stated plainly so nobody reads "21 rows green" as "the live file
was checked by `npm test`".

## 4. FINDING: the gate could only check one hard-coded path, and that made it unprovable

Before this parcel the path was `const PATH = 'docs/lane-status.json'` with no override. Combined
with that file being **gitignored**, the consequences were:

- there is **no committed baseline** for it, so invariant (b) — "restored from a COMMITTED
  baseline, never `git checkout --` on a dirty tree" — was **impossible to satisfy** for any
  red-first proof of this gate;
- the only way to see the gate go red was to **break the file the owner is writing this session**
  (its mtime moved from 15:19 to 16:16 while this parcel ran, so "live" is not hypothetical);
- therefore nobody would ever re-prove it, which is how a gate rots into decoration.

The fix is one line: `const PATH = process.argv[2] ?? 'docs/lane-status.json'`. The default is
unchanged, so `npm run check:lane-status` still checks the live file, and **a test row asserts that
default literal is still in the source** so the argument cannot quietly become the only way the
gate is ever run.

---

## 5. Red-first evidence, per check

All four controls below follow the same protocol: mutate, **show the mutation applied on disk**,
run, record, then `git checkout -- scripts/check-lane-status.mjs` **from the committed baseline**
`30afaf84` with the tree otherwise clean (`git status --porcelain` empty before and after each,
shown each time). The ablation drivers refuse to write anything if their marker is absent, so an
unapplied mutation raises rather than printing a green.

Two layers of red-first, because they answer different questions.

### Layer 1 — the MUTANT DOCUMENTS, inside the test

Every bound row builds its subject in a temp directory from the committed fixture and asserts the
mutation **from disk** before asserting any exit code, precisely because an unapplied mutation and
a restored baseline are the same artifact. For example the title row:

```ts
const onDisk = JSON.parse(readFileSync(p, 'utf8'));
expect([...onDisk.queue[2].title].length).toBe(BOUNDS.title + 1);   // the mutation, from disk
const r = run(p);
expect(r.status).toBe(1);                                            // and only then, the red
```

Each bound has an **at-the-bound** row (exactly 240 / exactly 20 / exactly 12288 bytes → exit 0)
beside its **one-over** row (exit 1). The pair proves the comparison is `>` and not `>=`, and
proves the red is attributable to the one thing that differs. The byte pair differs by **one
byte**.

### Layer 2 — ABLATION of the gate itself, to prove the rows are coupled to the checks they name

A row that passes because the gate is red for some other reason is not evidence. So each check was
removed from the committed gate in turn, and the reds counted.

| # | Ablation, applied and quoted from disk | `git diff --stat` | Result |
|---|---|---|---|
| 1 | `BOUND 1 of 3` block deleted (793 bytes) | `1 file changed, 14 deletions(-)` | **3 failed / 18 passed** — the two title rows and the all-three row. Nothing else moved. |
| 2 | `BOUND 2 of 3` block deleted (487 bytes) | `1 file changed, 9 deletions(-)` | **2 failed / 19 passed** — the row-count row and the all-three row. |
| 3 | `BOUND 3 of 3` block deleted (558 bytes) | `1 file changed, 10 deletions(-)` | **3 failed / 18 passed** — the byte row, the bytes-not-characters row, and the all-three row. |
| 4 | `raw.length` → `[...raw.toString('utf8')].length` (bytes → characters) | `1 file changed, 1 insertion(+), 1 deletion(-)` | **1 failed / 20 passed** — *only* "measures BYTES and not characters". |
| 5 | constants widened to `2400`, `200`, `120 * 1024` | `1 file changed, 3 insertions(+), 3 deletions(-)` | **1 failed / 20 passed** — *only* the `docs/OVERSEER.md` cross-check row. |

Ablation 4 is what makes the bytes-not-characters claim mean something: a gate counting characters
passes a file that is **17,593 bytes** and only ~6,983 characters, and exactly one row notices.

Ablation 5 is the important negative result. Because every expectation in the file is **derived
from the bounds the gate prints on a green run** — so that no number is typed in from the brief —
widening the constants moves the expectations with them and **20 of 21 rows stay green**. The only
thing standing between a widened constant and a silent pass is the row that cross-checks the
gate's printed bounds against `docs/OVERSEER.md`'s committed statement of the contract, deriving
the byte bound as `KB × 1024`. Derivation buys freedom from a typed-in number at the cost of
self-reference, and that one row is what pays it back; without it the whole file would be vacuous
under the single most likely future edit. That row was in the file from the first commit and
ablation 5 is the measurement that it earns its place, not a repair after the fact.

**Invariant (e), method change, declared:** the method did not change, but the SUBJECT moved once.
Ablations 1 to 5 were first run against `30afaf84`; commit `976fc7ba` then changed two comment
lines in the gate (the citation repair in §2). Comment-only, but "comment-only" is a claim about a
diff and not a measurement, so **all five ablations were re-run end to end against the final tip
`976fc7ba`** and every number in the table above is from those re-runs. The two sets agreed.

### Layer 3, unplanned — a broken mutation proved the harness is loud

A first attempt at ablation 4 was mangled by shell quoting and produced `raw.toString(utf8)`, a
`ReferenceError`. The result was **`1 failed | 21 skipped`**: `beforeAll` could not parse a bounds
line from a crashed gate and threw the message it carries for exactly this
("the gate printed no parseable bounds line, so every expectation below would be invented"),
rather than silently deriving `NaN` bounds and passing 21 rows against them. Accidental, and the
best available evidence that the derivation step is itself loud on unmeasurable.

### What the rows cover

21 rows: baseline green + 3 derivation rows + the default-path row; title at/over/two-over/astral;
rows at/over; bytes at/over/bytes-not-characters; all-three-at-once (asserts three separate
`  - ` problem bullets in one run, which is the "first failure hides the rest" guard); four
unmeasurable rows (absent, unparseable, non-array queue, missing queue); two registration rows.

---

## 6. On the `stateProblem` note in the brief

Nothing here was calibrated against the Dominion console, and no console was contacted. The console
**fails soft on everything it notices** — an unknown queue `state` makes one ROW `unreadable` while
the file still renders `ok`, and a future `updatedAt` sets `updatedAtTrusted: false` and delivers
the document anyway. Rule 7 itself says Dominion **MAY** implement the bounds check "once it
implements the check", i.e. it does not today. So a green console is not evidence these checks are
unnecessary, and a red here is not evidence the console is broken. Different readers, different
jobs, and this gate's job is to be the strict one. No part of this change was adjusted to agree
with the console.

---

## 7. The live file was never touched, and it is close to two of the three bounds

`docs/lane-status.json` does not exist in this worktree (gitignored), was never created here, and
was never written anywhere. The owner's copy was **read once, read-only**, by passing its absolute
path to the gate:

```
$ node scripts/check-lane-status.mjs /home/volence/sonic_hacks/aurora/docs/lane-status.json
check-lane-status: OK: 19 queue rows, exactly one next (PRESET-SCHEMA-KEY-PINNED), no duplicate ids, updatedAt sane.
check-lane-status: bounds: title<=240 chars (longest 237), queue<=20 rows (19), file<=12288 bytes (8944).
```

Inside all three — **by three characters and one row**. The 245-character title that started this
parcel is gone from it, and the next long title or the next row books a red. Worth knowing before
the next write rather than after it.

---

## 8. Nothing was stopped on

No BLOCKED items. No emulator was used and nothing here needs runtime. The two deliberate
non-actions, both argued above rather than quietly taken: the script is not in the `npm test`
chain (§3), and the `focus` ≤120-character bound is out of scope (§1, note 2).
