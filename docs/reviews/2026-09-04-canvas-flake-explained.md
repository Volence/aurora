# CANVAS-FLAKE-UNEXPLAINED — closed, and it needs no code explanation

**The row asked why O50 measured a ~44% abort rate and O79 then got 0 trips in 9 runs of the
unchanged instrument.** *"Something changed and nobody knows what."* Answer: **nothing in the
code had to change, because the flake has two causes and only one of them is a code property.**

## The two causes are documented by the harness itself

`scratchpad/canvas-cdp-harness.mjs:1022-1039` — the refusal names both and says it **cannot
distinguish them**, which is why the abort alone never identified the cause:

- **(a) another instrument cleared the shared profile.** `~/.config/<app>/Local Storage` is
  **one directory shared by the whole population**.
- **(b) the previous session's flush never reached disk.** Chromium commits on a rate-limited
  timer, measured at 44–54 s, while the app is gone ~50 ms after `window.close()`.

## Why the rate moved, without crediting any fix

**(b) is structurally prevented since O79** (`e3b90e96` → `6cbd998f`): the teardown now waits
for the bytes in the profile's leveldb and refuses if they never arrive, so that failure
announces itself **one session earlier** and never reaches this guard.

**(a) is untouched and is concurrency-dependent.** Verified here: no commit since O50's
measurement point changed the profile path, and it is still a single shared global directory.
**So the rate is a function of what else was running on the box**, and O79's own §3.1 recorded
load spiking to 10.70 from another agent mid-run. **Two rates measured under different
concurrency are not comparable**, and 44% against 0-in-9 therefore needs no code explanation.

**Nothing is credited with fixing (a), because nothing did.** O79 was already explicit that
0-in-9 before against 0-in-9 after is not evidence of improvement; this packet does not
smuggle one in behind it.

## ⚠ The live half — (a) is real, unfixed, and has GROWN

Measured today, not quoted: **136 `localStorage.clear()` call sites across 123 files** in
`scratchpad/`. The harness's own message says **114**. **The comment's census is stale**, and
13 commits since O50's point have touched that call. The hazard is bigger than the file
warning about it says.

That is the same shape this lane has hit repeatedly: **a number hardcoded into prose is right
on the day it is written and nothing re-derives it.** The count belongs in a check or nowhere.

## ⚠ A near-miss of my own, recorded because it read as an answer

I nearly attributed the rate change to `2f43ca04` — *"the canvas harness deleted the owner's
artwork as setup, and four more shared the destination"* — which landed **after** O50's
measurement point and is exactly the shape that would explain an intermittent shared-resource
abort. **It is the wrong directory.** That commit fixes `CANVAS_DIR`, the canvas *document*
directory under `s1disasm`; the refusal is about `localStorage`, which lives in the Chromium
*profile*. Two shared destinations, one fix, and only one of them is the flake's.

**A commit whose subject matches the symptom's shape is not a commit that touches the
symptom's mechanism** — and the subject line was persuasive enough that I had the attribution
half-written before checking which directory it names.

## Verdict

**Rename the row rather than keep chasing it.** Nothing is unexplained: (b) is fixed, (a) is
environmental and live. What is worth doing is **not** re-running the harness for a rate — a
rate under this lane's concurrency measures the box, not the instrument. What is worth doing
is (a), which is a cross-instrument hazard with a stale count and no owner.
