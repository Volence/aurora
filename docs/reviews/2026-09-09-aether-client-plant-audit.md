# Plant-and-count audit of `src/main/aether/` — 2026-09-09

**What this is.** The first audit of the outbound Aether client that asks the
suite a question its authors could not: *would these tests notice a defect?*
The method is the one aurora's collision audit used — plant one plausible
defect at a time, run the whole suite, read the failure message, confirm it
names the mechanism planted, restore from a committed baseline, count.

A green suite over code its own parcels wrote is evidence about internal
consistency. A survival ratio is evidence about correctness.

## Scope and size

Derived by `find`/`wc -l` on this branch:

| | files | lines |
|---|---|---|
| source | 10 | 2,646 |
| `__tests__` | 13 | 3,647 |

Baseline suite (`npm test`, this worktree): **8198 passed, 9 skipped, 563
files**, green, ~21.5s for the vitest half.

## Method notes, including the ones that cost something

- Every plant was applied, **quoted back from disk via `git diff`**, run under
  the full `npx vitest run`, and restored with `git checkout -- <one path>`
  from a clean committed baseline. The restore is asserted byte-equal.
- **Two plants were MALFORMED and are void, not results.** P05's first attempt
  and P06's first attempt each produced a *collection-time `SyntaxError`*
  across nine test files — a red run that looked exactly like a catch. The
  runner now refuses to score any run whose log contains `SyntaxError`. This is
  the trap the brief names: a green plant announces itself as failed, a red one
  from the wrong arm does not announce anything at all. Both were re-planted in
  a syntactically valid form and scored on the second, valid attempt.
- A kill is only counted when the failing row **names the planted mechanism**.
  Every kill below quotes its row.
- No live bus was reached, and none was needed: this client injects its
  transport (`connect`), so every plant was decided against the tree's own
  fixtures. What that cannot cover is listed at the end.

## Results

**52 plants. 32 killed, 20 survived — a 62% kill rate.**

For comparison the collision audit run the same night killed 22 of 25 (88%).
The difference is not that this code is worse; it is that this code's tests were
written parcel-by-parcel, each holding the thing that parcel built, and the
survivors cluster almost entirely in ONE shape.

### The shape: a guard on one of two symmetric paths

Twelve of the twenty survivors are a *sibling* of something the suite does hold.

| held | not held |
|---|---|
| `probePalette`'s aeon arm keeps `unservedMethod` (P23 ✗) | its classic arm (P24 ✓) |
| `warp.ts`'s unserved-resume "left PAUSED" (P36 ✗), `s1-warp.ts`'s (P37 ✗) | `push-palette.ts`'s (P35 ✓) |
| `warpForProject`'s classic branch carries `from` (P20 ✗) | its aeon branch's `unservedMethod` (P21 ✓) |
| `client.ts` clears `methods` on teardown (P03 ✗) | `bridge.ts` clearing `paletteKind` (P18 ✓) |
| `statusPayload.socketPath` on the push (P15 ✗) | its other six fields (P17, P50, P51, P52 ✓) |
| version refusal, NEWER server (P12 as `>`) | version refusal, OLDER server (P12 ✓) |
| clamp with BOTH axes moved (P28/P47 as `landedX !== x`) | clamp with ONE axis moved (P28, P47 ✓) |
| socket path far over / far under SUN_LEN | the boundary itself (P44 ✓) |

✗ = killed, ✓ = survived.

### The worst one, because it has a real consumer

`paletteUnservedMethod` is guarded at exactly one point — where the *aeon* probe
arm produces it — and at no point on its journey to a person. Three independent
plants on the rest of that journey all passed a green suite: the classic arm
dropping it (P24), the connect handler never storing it (P25), and
`statusPayload` never putting it on the wire (P17).

`src/renderer/agent/agent-handler.ts` turns that field into the sentence *"the
connected Aether server does not serve X, so the live-palette symbols were never
looked up; this is a server gap, not a ROM problem."* The sentence exists so an
artist is not told their ROM lacks palette symbols when the ROM was never asked.
A value produced correctly and not delivered yields precisely the wrong sentence
it was invented to prevent — the badge parcel's defect, one field over.

### A committed test that reaches an arm its name does not describe

`push-palette.test.ts`'s row `reports a machine left PAUSED when resume is
unserved` cannot reach that mechanism. Its own anti-vacuous assertion
(`expect(c.calls).toEqual([])`) proves it: no machine was ever paused. It drops
`resume` from the *advertised list*, which `pushPlanned` refuses in its
pre-flight check — so the `finally` that sets `resumeFailure` is unreachable from
that fixture. `warp.ts`'s twin row reaches the real branch only because `warpTo`
does not pre-check `resume`. Renamed to what it proves; the row its old name
described has been added.

## What was fixed

Sixteen of the twenty survivors are now killed by new red-first rows. Each was
applied as a plant, quoted from disk, and confirmed to name its own mechanism.

- `bridge-payload-census.test.ts` (new) — P17, P18, P22, P24, P25, P50, P51, P52
- `push-palette.test.ts` — P35 (plus the misnamed row renamed)
- `warp.test.ts`, `boot-restore.test.ts` — P28, P47
- `warp-route.test.ts` — P21
- `socket-path.test.ts` — P44
- `client.test.ts` — P12, P48, P49

## What was NOT fixed, and why

Four survivors are left open because each is a judgement about what this client
should *promise*, not a hole in a stated promise:

- **P08 — `loadSymbols` clears the cache AFTER the call, not before.** Moving the
  clear ahead of the await was green. The ordering is load-bearing under
  concurrency: a `resolve()` in flight across the `load_symbols` await caches a
  pre-load address, and only the post-call clear removes it. Whether that is a
  guarantee this client makes is the owner's call; the docstring does not say.
- **P10 — `methodCount` from `methods.length`, not the de-duplicated Set.** Only
  differs if a server advertises a duplicate. Pinning it decides what the count
  means.
- **P14 — `requireMethod`'s `methods.size > 0` degradation is untested, and
  `requireMethod` has no production caller at all** (grep: only its definition
  and one test). The API question comes before the test question.
- **P19 — the `onStatusChange` publish.** Moving it inside the disconnected
  branch was green, and it is very nearly behaviour-preserving: the connect
  handler publishes again after the palette probe, so the only loss is an
  earlier `connected` push during the probe. Reported as low severity rather
  than dressed up.

## Two properties verified rather than planted

- **Nothing in this tree awaits a bus event.** The brief flags this as a
  property nobody re-verifies, and it still holds: `onEvent` has exactly one
  production caller, `bridge.ts`'s `c.onEvent(() => publish())`, which is
  synchronous and returns nothing. So `run_to` emitting `stopped` *before* its
  own reply cannot deadlock anything here.
- **The two-message handshake is genuinely held.** Deleting
  `this.notify('initialized')` and deleting `clientCapabilities: { events: true }`
  were both caught, by name (P01, P02).

## What could not be exercised without a live bus

Everything here is decided against injected fixtures, which is what this client
was designed for — but that means no row proves a real `oracle-aether` behaves
like the fixtures. Specifically untested from a node-only suite, and TAGGED for
foreground follow-up:

- that a real server's `initialize` carries `limits` at all (the new row proves
  Aurora records what arrives, not that anything sends it);
- that `emulator/resume` advertised-and-answering-`-32601` is a shape a real
  server produces, rather than only a modelled one;
- that a path at exactly `SOCKET_PATH_MAX` really is refused by the kernel here,
  as opposed to by our arithmetic about `sun_path`.
