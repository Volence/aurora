# BASELINE: what the sweep harness printed BEFORE the suppressed-rows fix

**Measured by the overseer in the foreground on master `cb714bbb`, 2026-09-10.**
One complete run per configuration, both exit 0. **Nothing here is stitched from two runs.**

Recipe, both runs, on a `VITE_AURORA_DEBUG=1 npx electron-vite build` of this tree:

```sh
AEON_DIR=<writable copy>                        node scratchpad/cdp-sweep-panels-harness.mjs
AEON_DIR=<writable copy> CLASSIC_DIR=<writable copy> node scratchpad/cdp-sweep-panels-harness.mjs
```

| run | totals line | rows printed |
|---|---|---|
| `run-no-classic.log` | `13/14 rows PASS · 0 FAIL · 1 UNMEASURABLE · 15.5s` | 14 |
| `run-with-classic.log` | `20/20 rows PASS · 0 FAIL · 0 UNMEASURABLE · 26.3s` | 20 |

## The defect, in one line

With `CLASSIC_DIR` unset the totals line is **arithmetically honest about the rows it printed
and silent about the rows it did not**, so a reader concludes every question was asked.

## ⚠ THE LEDGER ROW'S COUNT WAS WRONG, AND IT UNDERCOUNTED

`HARNESS-ROWS-VANISH-ON-UNSET-GATE` says **four** rows vanish (`S2a1/S2a2/S2a3/S2b`).
**It is six.** 20 − 14 = 6, and the six absent ids are:

```
S3a  S3b  S2a1  S2a2  S2a3  S2b
```

The seventh classic-gated id, `S3c`, **is** represented: the refusing arm's single `S3` carries
the identical row name (*"a classic save's success toast NAMES the files it wrote"*), so `S3`
stands in for `S3c` and for nothing else. That substitution is exactly what made the undercount
easy — a reader checking whether the classic *question* survived the gate finds that it did, and
stops before asking which of its siblings did not.

The original count came from reading the `else` branch for the rows the finding was about. The
correct one comes from **differencing two executed runs**, which is the only instrument that
cannot miss a row nobody thought to look for.

## Why these logs are committed

The ledger row claimed both logs were "captured side by side in the capture directory". That was
true of a session scratchpad which no longer exists, so the claim pointed at nothing a reader
could open. A BEFORE that only its author ever saw cannot hold an AFTER to anything.

Absolute scratch paths are rewritten to `<scratch>`; the logs are otherwise verbatim.

---

# AFTER: the same two runs on the merged fix

**Measured by the overseer in the foreground on master, immediately after merging
`parcel/harness-suppressed-rows`.** One complete run per configuration, both exit 0.
Same recipe, same copies, same box.

| run | totals line | rows printed |
|---|---|---|
| `after-no-classic.log` | `13/20 rows PASS · 0 FAIL · 7 UNMEASURABLE · 15.1s` | 20 |
| `after-with-classic.log` | `20/20 rows PASS · 0 FAIL · 0 UNMEASURABLE · 25.2s` | 20 |

**The row count stops moving.** 14-vs-20 became 20-vs-20. The difference between the two
configurations is now visible as UNMEASURABLE rather than as arithmetic, which is the whole
point of the parcel.

The seven suppressed rows print by name, each reason naming `CLASSIC_DIR`:

```
S3a  S3b  S2a1  S2a2  S2a3  S2b  S3c
```

A bare `S3` no longer appears in either run (`grep -c "^\S* *\[S3\] " = 0`), so the two logs
are now diffable by id — which they were not before, because the refusing arm's `S3` carried
`S3c`'s question under a different id.

**`after-with-classic.log` is the control that matters**: its id list is identical to
`run-with-classic.log` above, so the measuring path was not disturbed by the fix.

## ⚠ A SECOND COUNT WAS WRONG, AND IT WAS THE OVERSEER'S

Having corrected the ledger's *four* to *six*, I then told the agent to expect **six**
UNMEASURABLEs in the fixed run. It is **seven**, and the agent said so before running anything:
the non-classic block is 13 rows, so `20 − 13 = 7`, and the `S3`/`S3c` row was always one of the
unmeasurables.

**Six questions are LOST; seven rows are UNMEASURABLE.** Two different quantities, one number
carried between them — which is the same defect this parcel exists to fix, committed by the
person who had just measured it. A count names its unit or it is not a measurement.
