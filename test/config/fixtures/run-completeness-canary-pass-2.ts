/**
 * Run-completeness canary: a SECOND file that finishes, so the guard's
 * `--shard=1/2` child has two files to split (vitest refuses a shard count
 * larger than the file count). Same terms as run-completeness-canary-pass.ts.
 */
import { it, expect } from 'vitest';

it('finishes too', () => {
  expect(2 + 2).toBe(4);
});
