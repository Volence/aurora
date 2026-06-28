// A process-wide monotonic edit counter. Independent undo stacks (the level
// command history and the sprite snapshot history) each stamp their entries with
// nextEditSeq() so a consumer can merge them into one timeline by recency — e.g.
// sprite mode, where a palette edit lands on the level stack but a pixel edit
// lands on the sprite stack, yet a single Ctrl+Z must undo whichever came last.
let seq = 0;

/** The next monotonically-increasing edit sequence number (starts at 1). */
export function nextEditSeq(): number {
  return ++seq;
}

/** The current clock value WITHOUT advancing it. An entry made later has a
 *  strictly larger seq, so this marks a "now" boundary: everything recorded
 *  before this call has seq <= peekEditSeq(), everything after has seq >. */
export function peekEditSeq(): number {
  return seq;
}
