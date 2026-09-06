# Aurora lens sweep — 2026-09-06

**Review SHA:** `e17cdb02a9a458b113733b948479725258179927` (pinned; clean tree, master).
**Protocol:** aeon `docs/superpowers/LENS_PROTOCOL.md` at aeon `61f22403` (verified an
ancestor of aeon `origin/master`). The prior packet, `docs/reviews/2026-08-16-aurora-lens-sweep.md`,
is a **worked example, not the spec** — the protocol says so in its own text.
**Authority to run:** the owner, 2026-09-06T07:23:14Z, *"I'd really like to finish up the
raster/parallax and then run a full lens suite on everything"*. EFFECTS-W1's last item
landed at aeon `dad5c395` (verified an ancestor of aeon `origin/master`) before this began.

**No fixes were made during this sweep.** Seats are read-only so the report stays honest;
every finding is booked as a row and ranked by the owner.

---

## 0. Corpus charter — and what this sweep does NOT cover

**In scope:** the tracked TypeScript/TSX source of this repo — **514 non-test files,
127,869 lines** (`src/renderer` 279, `src/core` 202, `src/main` 22, plus `src/shared`,
`src/preload`, `src/test`), the 527 test files, and the ~156 harness files under
`scratchpad/`.

**Out of scope, and therefore UNEXAMINED rather than cleared** — this sentence exists so
the sweep is never later read as blessing what it skipped:
- the vendored contract schemas' *content* (they are empyrean's; Aurora's currency gates
  are in scope, the schemas' correctness is not);
- sibling repos (aeon, empyrean, s1disasm) — read-only inputs here, audited by their own lanes;
- generated and build output (`dist/`), and `node_modules`;
- the Electron/Chromium runtime itself.

**The protocol's reconciliation step names a deferred-work file that this repo does not
have** — there is no such document under `docs/`, and its absence is the point of this
paragraph rather than a citation a reader can open. In Aurora the booking lives in
`docs/ROADMAP.md` §5.1 and in the lane's status file, which is untracked by design under
the suite's status contract and therefore also not openable from a clone. Stated so a
reader does not conclude the reconciliation step was skipped.

---

## 1. Step 0 — the standing findings, re-verified before any fresh panel

*"Landing a packet made its findings discoverable; nothing in it is fixed."* Two seats
re-derived every standing finding at the pin. **Every load-bearing citation below was
re-verified independently by the controller before it entered this packet**, and two seat
claims were corrected in the process — both recorded in place.

### 1.1 The prior packet's §2 (verified critical/high) — 14 findings

**0 CONFIRMED-STILL-OPEN · 0 CHANGED · 14 STALE · 0 CANNOT-TELL.**

All fourteen were fixed after the packet landed, by six commits between 2026-08-16 and
2026-08-22, each named in the seat's table with a `git log -S` behind it. Controller
spot-checks: R13 (`src/main/mcp-server.ts:109/126/127` — all three `/mcp` verbs wear
`loopbackOnly`, and the transport carries `enableDnsRebindingProtection: true` with
`allowedHosts()`/`allowedOrigins()`) and R4's guard (`classicLevelStore.ts:592`), both
confirmed as described.

**This is the argument for step 0 existing.** A fresh panel over this corpus would have
spent its budget re-finding fourteen closed defects.

### 1.2 Three fixes are source-verified only, and nothing could tell us if they broke

R9 (window-`mouseup` drag commit), R10's viewport half (the `paintBgTile` → `endBgStroke`
→ `executeCommand` wiring; the *command* is tested, the wiring is not) and R14 (the hoisted
modifier guard) all live in `src/renderer/components/MapViewport.tsx`.

**That file is 3,915 lines — the largest in the app — and no test imports it.** Verified
two ways: the seat's (`grep -l "from '.*MapViewport'"` over every test file → empty, exit
123) and the controller's, with a deliberately different enumeration (the bare token
anywhere in any test file) → **22 test files mention it, none loads it**. The repo states
the cause in its own words at `src/renderer/components/__tests__/map-escape.test.ts:6`:
*"`MapViewport`'s Escape branch is inside a React effect the node suite cannot reach."*

Booked as **MAPVIEWPORT-UNTESTED**. The instrument that settles it is the CDP harness in
the foreground; the three re-repros are named in the seat's report.

### 1.3 The prior packet's §3 (seat evidence only) — 7 findings

**6 STALE · 1 CHANGED.** All seven were dispositioned the same day the packet landed,
without an independent verify pass, so **no §3 finding has an independent confirmation to
this day and the code is now the only artifact.** Two of the fixes were planted red-first
against the real disassembly (U5, U7); the rest were not.

**U6 is CHANGED and half open.** The *shrink* direction is closed (`s1-io.ts` refuses a
colind write shorter than the one it read, replacing a gate that was literally
`bytesEqual(x.slice().slice(), x)` — true for every input including a corrupt one), and the
collision door is shut (`collision-write.ts`, landed `4de2e617`). **The art door is still
open:** `classicPaintSurface` (`src/renderer/state/classicLevelStore.ts`) sizes `out` to
`max(nextBlocks.length, src.length)`, `out.set(src)` covers only `src.length` (410 for GHZ)
and the append loop writes only from `doc.blocks.length` (439) up, so **indices 410–438 are
left zero whenever a new block is appended**. `collision-write.ts:694` says so in its own
words: *"`classicPaintSurface` checks NEITHER: it grows colind silently."*

### 1.4 The two gaps the prior packet recorded against itself

**Gap A — "zero runtime rows" — CHANGED: covered as capability, still open as a gate.**
**67 harness files require `AEON_DIR`** (60 registered as `harness:*`) where August had
none, running against freshly-cloned aeon fixtures. The specific debt (U1's undo
coalescing) now has a real runtime row (`scratchpad/two-way-mark-harness.mjs:598`). **The
residual is the finding:** all of it lives in the unrun fleet. Do not let a fresh panel
re-open *"aeon has no runtime coverage"*; the live row is *"aeon runtime coverage is 100%
outside `npm test`, and there is no CI"*.

**Gap B — `src/core/collision/` — STILL OPEN, and the label is why.**
**The mislabel that caused it:** the August packet recorded this as "the aeon/s4 system",
which let all 18 seats skip it as not-our-backend. It is **adapter-based** —
`collision-adapter.ts:12` declares `interface CollisionAdapter` and
`adapters/s4-collision-adapter.ts` is *one* implementation — and **classic renderer code
imports it directly** (`ClassicCollisionPanel.tsx`, `classic-overlays.ts`). Controller-verified.

⚠ **CONTROLLER CORRECTION TO THE SEAT.** The seat reported the file list as *"byte-for-byte
the same 20 paths … nothing added, nothing removed"* and built a trap on it (*"a reviewer
skimming paths will conclude it is untouched"*). **That is false.** Measured at both
revisions: **14 files at `2b38e0b`, 20 now — six were added** (`both-planes-paint.ts`,
`collision-angle-mark.ts`, `collision-region-read.ts`, `crossover-audit.ts`,
`layer-transition.ts`, and one test). The churn is real (**+3,010 insertions across 11
files**) and the subsystem genuinely has never been read by a seat; the *extent* claim was
wrong and the stated trap does not exist in that form. Mechanism right, extent wrong.

**Honest status: unexamined by a reviewer, well-exercised by its authors.** `test/collision/`
grew +1,882 lines and 39 test files import from `core/collision` — but that suite was
written by the same parcels that wrote the code, so it is an author's tests, not an audit.

---

## 2. The instrument fleet — the sweep's largest single finding

**170 `harness:` scripts. ZERO are run by `npm test` or `npm run land`. Aurora has no CI**
— no `.github/` tracked or on disk, `gh run list` returns zero runs while authenticated
(exit status checked on `gh` itself, not on a `head` at the end of a pipe). Every
instrument in this repo runs only when a human or an agent types it.

**So oracle's failure mode — guards living only in CI, quietly not running — cannot occur
here. The exposure is the opposite and larger.**

⚠ **Controller correction, made before the number travelled:** an intermediate count of
"5 of 170 reachable from a non-harness script" was a **substring-matching artifact** (those
five names are prefixes of longer harness names). The figure is **zero**. Withdrawn.

**The hook already exists.** `npm test` runs `scratchpad/check-harness-guards.mjs`, a
derived (not list-based) static check over the fleet — guarded spawn, no `pkill`, no
hand-rolled discovery reads, no dropped `killTree`, no hand-rolled staleness gate, no
fixed-sleep teardown. So *"the suite never looks at `scratchpad/`"* is false, and wiring a
headless-capable subset into `npm test` needs a decision, not a new mechanism.

### 2.1 ABSENT / STALE / FRESH — which state does each instrument collapse, and does it say?

The question the suite adopted today, applied fleet-wide.

**ABSENT is generally handled well:** `AEON_DIR`/`S1DISASM_DIR` throw with no default;
`run-root.mjs`'s freshness gate distinguishes all three and refuses on the third
(`BUILD FRESHNESS UNMEASURABLE`, `dist/ is STALER than src/`, or a printed `build: FRESH`).

**STALE fixture input is the fleet's blind spot:** only **4 of ~156** harness files call
`git rev-parse` at all, and **none stamps the revision of the `AEON_DIR` or `S1DISASM_DIR`
copy it ran against.** An old fixture is indistinguishable from a current one.

**A fourth state nothing can see: build FLAVOUR.** `VITE_AURORA_DEBUG=1` leaves no mark on
the file the freshness guard stats, so a plain build is `FRESH` to every instrument in the
repo and the harness then dies on `window.__dbg absent`. Recorded in `scripts/land.mjs`.

### 2.2 `ELECTRON_BIN` — ABSENT collapsed into a SUBSTITUTED input (landed `e17cdb02`)

`isRunnableTree(dir)` tests for `node_modules/.bin/electron` **and** `dist/main/index.mjs`
in the same tree and **never consults `ELECTRON_BIN`**. So a worktree without
`node_modules` fails it, and the walk supplies **the main checkout's `dist/`**: binary from
the env, app bundle from somewhere else, every path in the output reading correctly. An
agent measured three passes this way **including its baseline**; the only tell was a planted
mutation printing **PASS against an unmutated app**.

**It does announce it** — `resolveRunRoot` returns `borrowed: true` with a `source:` line
naming the walk. So this is ***says, unread***, not silent, and the fix is a reader (or
making `borrowed: true` fatal without an explicit opt-in), never another print. The standing
dispatch brief now carries `AURORA_BUILT_TREE` beside `ELECTRON_BIN`.

### 2.3 The five parked instrument rows, re-verified

| row | verdict | what changed |
|---|---|---|
| `PICKER-HARNESS-SHARED-SECTION` | **CANNOT-TELL** | Structural claim confirmed (row `[4a]` matches a hardcoded literal). Resolving it needs aeon's current state, and the seat correctly refused to answer it from Aurora's vendored copy. Foreground-tagged. |
| `HARNESS-STALE-VACUITY-ROWS` | **CONFIRMED-STILL-OPEN** | Verbatim accurate. **A third species of defect:** not unrun, not unable to fail — **failing correctly for a reason nobody acts on.** These print the premise (`carrying=4`, `nonzero=2076`) before refusing; they are the best-behaved instruments in the corpus. The cost is that a permanently-red row stops being read. |
| `HARNESS-PORT-DEFAULT` | **CHANGED — both halves of the row text are FALSE** | See 2.4. |
| `BGANIM-HARNESS-REPAIR` | **CONFIRMED-STILL-OPEN, 8× wider than booked** | The row names one harness; **8 carry only the retired vocabulary** (`band-art-foreground`, `band-trunk-demo`, `band-trunk-watch`, `bganim-band`, `bganim-rate-shift`, `bganim-ui-authored-composition`, `effects-foreground-2`, `fromtile-typing-probe`), verified as live selectors, not comments. Squarely *"an instrument nobody runs"*: it fails loudly the moment anyone types it. |
| `HARNESS-NEVER-RERUN` | **CONFIRMED-STILL-OPEN**, 165 → **170** | See §2. |

### 2.4 The port row was wrong, and the real hazard is narrower and worse

**Booked text: "every harness defaults to the same debug port" and "the second exits on a
target it did not start". Both false.** Controller-verified: **155 files carry a `PORT`
default across 75 distinct ports** (modal 9397 shared by 19), and **134 of 156 carry a
`portFree()` preflight** that refuses an occupied port by name rather than attaching. The
booked generalisation traces to one night's two-file collision.

**What survives is real: 24 harness files define a `PORT` default, have NO `portFree`
preflight, and attach to CDP** via `list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)`
— **with no check that the page belongs to the child this harness spawned.** Registered
instruments among them include `composer-collision-gesture`, `chunk-links`, `capture`,
`classic-playtest`, `effects-cold-read`, `live-palette-e2e`, `marquee-stamp`,
`sprite-restore` and the `s1-*` sprite family.

**This is the ABSENT→SUBSTITUTED collapse in its purest form:** the harness's own app fails
to bind, and instead of refusing it attaches to whoever else holds the port and reads a
stranger's screen back as a measurement. **Worse than a green nothing.** The preflight is
hand-rolled in each file rather than living in `lib/harness-guard.mjs`, which is why 24
lack it; the natural fix is a derived `G9` rule in `check-harness-guards.mjs`.

⚠ **Controller's own error, recorded because this sweep is about instruments that lie:**
my first attempt to verify the 24 returned **0**, because `for f in $withport` does not
word-split in zsh and iterated once over the whole newline-joined string. Re-run with a
`while IFS= read -r` loop it returns **24**, matching the seat exactly. A false zero from a
shell idiom, in the middle of a sweep whose subject is false zeros.

---

## 3. DO-NOT-RE-LITIGATE

Refuted or unanswerable; a fresh panel that re-finds these is re-finding a comment.

1. **U6's *justification*** (not its behaviour): *"the ROM resolves the overhang from the
   adjacent zone's table, so those blocks may have REAL collision in game."* Unverified seat
   evidence, never checked, and **Aurora cannot check it** — it needs cross-file reach the
   editor does not have. Both sides are recorded at the site (`classicLevelStore.ts`,
   `KNOWN OPEN QUESTION (CLASSIC-A4, seat evidence, unverified)`). The zero-fill behaviour
   IS real and is booked; the reason it is a bug is not established.
2. **"Every harness defaults to the same debug port."** Refuted by census — 75 distinct
   ports, and 134 of 156 refuse rather than attach. See 2.4 for the narrow finding that is real.
3. **"`src/core/collision/` is the aeon/s4 system."** Refuted — adapter-based, and classic
   renderer code imports it directly. **This is not merely harmless: it is the sentence that
   caused the gap, and re-inheriting it will cause it again.**

---

## 4. Severity re-reads from step 0

A re-verification pass is the only moment anyone re-reads an old ranking.

- **R8 (HIGH) rested on a premise its own packet refuted four sections later.** Its severity
  came from *"the engine build consumes them"*; §7 of the same document says *"the three
  export modules are dead outbound artifacts"*, and the resolution confirmed §7. The defect
  was real; the harm figure was to files nothing read.
- **R14 and R12 (both HIGH) are one-undo papercuts by their own verifiers' printed
  corrections** — the tool readout does change, and the edit is undoable.
- **R6 (HIGH) was honestly self-labelled latent** (single-act projects only), so it had zero
  reachable instance at filing. Its rank was a judgement about the future, not a measurement.

---

## 5. Findings booked from step 0

| id | severity | reachability |
|---|---|---|
| `MAPVIEWPORT-UNTESTED` — 3,915-line file, the app's main surface, imported by no test; three standing fixes inside it | HIGH | LIVE |
| `HARNESS-NEVER-RERUN` — 170 instruments, 0 automatic, no CI | HIGH | LIVE |
| `HARNESS-PORT-NO-PREFLIGHT` — 24 CDP harnesses attach to a stranger's page rather than refusing | HIGH | LIVE |
| `COLIND-ART-PATH-ZEROFILL` — the art door still zero-fills overhang indices (U6's open half) | MEDIUM | LIVE |
| `SAVE-GEN-OPTIONAL` — an optional argument's absence silently skips the staleness guard, restoring R4 | MEDIUM | latent until a second producer |
| `BGANIM-HARNESS-REPAIR` — 8 harnesses carry only retired vocabulary | MEDIUM | LIVE |
| `FIXTURE-REVISION-UNSTAMPED` — 4 of ~156 harnesses call `rev-parse`; none stamps its fixture revision | MEDIUM | LIVE |
| `BUILD-FLAVOUR-INVISIBLE` — a plain build is FRESH to every instrument | MEDIUM | LIVE |
| `COLLISION-NEVER-AUDITED` — +3,010 lines, six new files, never read by a seat | MEDIUM | LIVE |

*Panel waves follow; §6 onward is added as they return.*
