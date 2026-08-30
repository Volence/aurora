// A human-readable fact a load produced, WITH the severity of the thing it
// reports.
//
// WHY THIS TYPE EXISTS. The channel used to be `string[]`, and the single
// consumer (renderer/state/aeon-open.ts) toasted the whole of it `'success'`.
// Most entries were successes, so that looked right for a long time — but
// `markUnreadable`'s "…exists but could not be read … fix it by hand and reopen"
// travels the same channel, and it arrived GREEN, on the 2.2s success dwell,
// reading as confirmation that something worked. The exception is the one that
// matters: a notice that reports a FAILURE must not arrive on the success
// channel.
//
// SEVERITY BELONGS TO THE PRODUCER, and this type is what forces the producer to
// say it. `severity` is required and has no default, so tsc refuses a new push
// site that has not classified its own message. Two alternatives were considered
// and rejected:
//
//   • A second `warnings: string[]` array beside `notices`. Fewer sites to
//     touch, but it leaves TWO things to remember at every producer, and the
//     next one forgets the second.
//   • Classifying at the toast site by matching the message text. That is a
//     matcher over prose: it goes silently wrong the day someone rewords
//     "could not be read", and nothing anywhere goes red. The toast site cannot
//     know — a loader that unified an atlas succeeded, a loader that could not
//     read a file did not, and only the loader knows which it was.
//
// THE SEVERITIES map onto the toast channels (renderer/state/toastStore.ts
// dwellMs), and the dwell is the whole point of distinguishing them:
//
//   success  Something WORKED and the sentence is an acknowledgement.
//            2.2s — long enough to register, short enough not to nag.
//   warning  Nothing failed, but the sentence has to be ACTED on or at least
//            KNOWN — typically "this document is not what it looks like and the
//            next save will change it". 8s, because 2.2s is not enough time to
//            read one, and a warning nobody read is no warning.
//   error    Something FAILED: a file that exists could not be read, Aurora is
//            showing empty data for it, and a hand repair is required. 10s.
//
// There is deliberately no `info`: nothing a load produces is neutral. Adding a
// fourth level would only give a future producer somewhere noncommittal to put a
// failure.

/** @see Notice — the producer picks one, and tsc will not let it abstain. */
export type NoticeSeverity = 'success' | 'warning' | 'error';

export interface Notice {
  severity: NoticeSeverity;
  message: string;
}

/** One file a loader found, could not read, and refuses to overwrite. */
export interface UnreadableItem {
  /** Project-relative path, as the loader asked for it. */
  path: string;
  /** Whatever the read or the parser said. Kept per item — it is the repair hint. */
  reason: string;
}

/** How many items a coalesced summary NAMES before it starts counting. */
export const NAMED_IN_SUMMARY = 3;

/**
 * The shared tail of every coalesced failure summary: name a few, count the
 * rest — "a, b, c, +12 more".
 *
 * WHY THIS EXISTS. A producer that pushes one notice per failed file is a
 * producer that can put an unbounded wall of TEN-SECOND error toasts on screen
 * (toastStore.dwellMs). `markUnreadable` alone reaches 63 on a 3x3 act whose
 * every section file is corrupt — seven suffixes (tiles.bin, collattr.bin,
 * collattrb.bin, objects.json, rings.json, meta.json, chunklinks.json) times
 * nine sections; coalesced-notices.test.ts DERIVES that figure from a load
 * rather than asserting a literal. That pressure is what makes someone turn the
 * error channel off, which would undo the whole point of moving failures onto
 * it.
 *
 * The shape is not invented here: `bgLibraryUnresolved` already ships it
 * (renderer/state/aeon-open.ts), which is why seventeen missing background
 * bodies on a clean clone are ONE pleasant warning and not seventeen.
 *
 * THE COUNT IS THE HONEST PART. `+K more` is derived from the array length, so
 * it can never render "I could not tell" as zero — an empty list produces no
 * summary at all rather than a summary claiming nothing happened. And the items
 * that are not NAMED are still reachable: every producer that coalesces also
 * `console.warn`s each failure, with its own reason, at the moment it happens.
 */
export function nameSome(paths: readonly string[], limit: number = NAMED_IN_SUMMARY): string {
  const shown = paths.slice(0, limit).join(', ');
  const rest = paths.length - Math.min(limit, paths.length);
  return rest > 0 ? `${shown}, +${rest} more` : shown;
}
