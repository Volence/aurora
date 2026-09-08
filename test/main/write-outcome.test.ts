// The write channel's refusal-to-exception conversion, on its own.
//
// This is the twin of missing-file-marker.test.ts beside it, and it exists for
// the same reason: the preload cannot be imported in this suite (it imports
// electron), so the DECISION it makes has to live in a pure shared function that
// can be. `unwrapWriteOutcome` is that function, and before it existed the
// preload forwarded main's refusal to the renderer as a bare `false` that eight
// of ten call sites dropped.
//
// WHAT THESE ROWS DO NOT COVER, said plainly. They prove the conversion, not the
// pairing: that main's own refusal value is a value this function rejects is
// asserted where the two halves meet (src/main/__tests__/file-io-guards.test.ts
// and the seam rows in aeon-save.test.ts / classic-sidecar-seed.test.ts, which
// build the refusal out of the real writeProjectFile rather than typing it in).
import { describe, it, expect } from 'vitest';
import { unwrapWriteOutcome, type WriteOutcome } from '../../src/shared/ipc-types';

describe('write-outcome unwrap', () => {
  it('a refusal becomes a throw that carries the reason main gave', () => {
    const refused: WriteOutcome = {
      ok: false,
      reason: "refused write to unsafe project-relative path (escapes root): '../../.ssh/authorized_keys'",
    };
    expect(() => unwrapWriteOutcome(refused))
      .toThrowError(/write refused by the main process: refused write to unsafe project-relative path/);
    // The offending path survives the conversion: a refusal that could not say
    // WHICH path it was about would leave the sprite exporter's toast useless.
    expect(() => unwrapWriteOutcome(refused)).toThrowError(/authorized_keys/);
  });

  it('a write that landed passes through silently', () => {
    expect(() => unwrapWriteOutcome({ ok: true })).not.toThrow();
    expect(unwrapWriteOutcome({ ok: true })).toBeUndefined();
  });

  // The wording is a discriminator, not decoration. `deleteProjectFile` and
  // `performGuardedWrite` both refuse an escaping path with the sentence
  // "unsafe project-relative path (escapes root)", so a row matching only that
  // phrase would be satisfied by a DIFFERENT rule's refusal and would keep
  // passing with this channel's guard deleted. The write channel says "refused
  // write to" first, and nothing else in the repo says that.
  it('says something only this channel says, so a test can tell them apart', () => {
    const message = (() => {
      try { unwrapWriteOutcome({ ok: false, reason: 'refused write to unsafe project-relative path (escapes root)' }); }
      catch (e) { return (e as Error).message; }
      return '';
    })();
    expect(message).toMatch(/^write refused by the main process: refused write to /);
  });
});
