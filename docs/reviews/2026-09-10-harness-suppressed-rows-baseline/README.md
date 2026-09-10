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
