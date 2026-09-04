# O50-VACUOUS re-measured — the row is real as a description and is NOT shipping wrong output

**Verdict: DOWNGRADE.** The twelve files are exactly as described and none of them is a defect
today. What is left is one cheap, real hazard that nothing currently enforces, offered below
rather than built, because the owner's 2026-09-02 cut allows instrument work only where it
blocks a DoD item or ships wrong output.

## What was booked

*"The 12 GREEN rigs that assert nothing — a check that can only return green is no evidence at
any volume."* From `docs/reviews/2026-09-03-harness-red-sweep.md` finding 6.

## What is true now, measured

All twelve are on disk and all twelve still emit **zero PASS rows**:
`artmode-repro-harness`, `assign-black-harness`, `bganim-marquee-resolution-probe`,
`block-fanout-probe`, `fromtile-typing-probe`, `guide-aim-probe`, `label-measure-probe`,
`loop-cell-probe`, `marquee-paste-probe`, `row8-probe`, `storage-flush-probe`,
`zone-blocks-probe`.

**They are diagnostics, not broken gates.** Several say so in their own headers
(`label-measure-probe`: *"no assertions, just numbers"*). Adding assertions to them would be
the wrong repair — a probe that prints numbers is doing its job.

**Nothing counts them as coverage, and here is why, item by item:**

| question | measured |
|---|---|
| are they registered as `harness:*`? | **No — none appears anywhere in `package.json`**, and `git log -S` shows none ever did |
| does any REGISTERED harness assert nothing? | **0 of 142** — see the limit on this check below |
| does the sweep already mark them? | Yes — `"asserts_nothing": true` in its JSON, by its own author |
| does `check-harness-guards` conflate them? | No. It walks `scratchpad/` but measures **guards**, not assertions |

⚠ **THE 0-OF-142 CHECK IS WEAKER THAN IT LOOKS AND I WILL NOT LEAN ON IT.** It asks whether the
string `PASS` appears in the source, not whether the rig asserts. A file with `PASS` in a
comment and no assertion satisfies it — which is the exact defect class this row is about, one
level up, in my own census. **The strong measurement is the sweep's**, which launched all 89
non-emulator instruments and read their printed rows at runtime; string-matching is a filter,
not a proof.

## ⚠ A correction to my own reading, made mid-survey

I first read the sweep's population as *"every `harness:*` script in `package.json`"* and
treated "these twelve are unregistered" as a contradiction to chase. **That population belongs
to a different report** — the O78 residual census. This sweep's own line 14 says *"Of the 101
instruments no `package.json` script can name"*: the population was the **unregistered** ones,
so their absence from `package.json` is the premise, not an anomaly. **Two reports, two
populations, and I quoted the wrong one at my own evidence.**

## The residual, offered not built

**Ten of the twelve are named `*-probe`; two are named `*-harness`** —
`artmode-repro-harness.mjs` and `assign-black-harness.mjs`. So the convention that separates a
diagnostic from a gate **already exists in the naming and is enforced by nothing.** Registering
either of those two as `harness:*` would create a rig that is green forever and proves nothing,
and it would look exactly like the other 142.

**The one-rule fix, if the hub wants it:** `check-harness-guards` already runs inside `npm test`
and already walks `scratchpad/`. One rule there — *a file named `*-harness.mjs` that emits no
rows is either renamed `*-probe.mjs` or declares itself a probe* — closes it. That is a rule in
an existing gate, not new scaffolding.

**Not taken unilaterally** because nothing ships wrong today, and the cut is explicit that
instrument work waits on that test. The hazard is real and latent; the decision is the hub's.

## The transferable shape, for any lane

**A diagnostic and a gate are indistinguishable by name and by exit code. Only the rows they
emit separate them, and nothing enforces which kind a file is.** That is the general form of
this row, and it is worth a look in any `tools/` directory, not only this `scratchpad/`.
