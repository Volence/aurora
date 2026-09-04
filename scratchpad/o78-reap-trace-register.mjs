// O78-RESIDUAL-72 census instrument.
//
// WHY THIS EXISTS. The affirmative tell for this defect is the line
// `cleanup: X artifact REFUSED — … INHERITED`, printed by reapDisplays().
// killTree() calls reapDisplays LOUDLY, so a KILLTREE-class harness prints it.
// The exit net does NOT: killTreeSync() ends with
//     const reaped = art ? reapDisplays(art, { quiet: true }) : null;
// (harness-guard.mjs ~line 900). So for the SELF-KILL class — the 79 harnesses
// this parcel exists to census — the tell can never print, and reading its
// absence as "unaffected" would be a check that is silently blind on exactly
// the population it is pointed at.
//
// This loader rewrites that ONE call site, in memory, to { quiet: false }.
// Nothing in the repo changes; the census runs with NODE_OPTIONS='--import
// <this file>'. It alters printing only — no deletion, attribution or
// signalling decision is touched.
//
// It is proved in both directions by reap-trace-control.mjs before any row is
// believed: a live tree at exit-net time must print the line, a dead one must
// not.
import { register } from 'node:module';
register('./o78-reap-trace-loader.mjs', import.meta.url);
