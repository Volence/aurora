/**
 * `skipReason` — the field a conditional skip uses to say WHY it skipped.
 *
 * `describe.skipIf(cond)` and `it.skipIf(cond)` accept no message, which is why
 * this repo accumulated skips that could not say why they had not run — and a
 * skip that cannot say why is indistinguishable from a pass to anyone reading a
 * suite total. vitest's options form DOES carry a message channel: `meta` is
 * documented as "custom test metadata available to reporters", it propagates
 * from a `describe` to every test inside it, and it survives a collection-time
 * skip. So the sanctioned shape across this repo is
 *
 *     describe('name', { skip: !PRESENT, meta: { skipReason: `${DIR} is absent` } }, () => {
 *     it('name',       { skip: !PRESENT, meta: { skipReason: `${DIR} is absent` } }, () => {
 *
 * `scripts/skip-report-reporter.mjs` reads it back and fails the run when a skip
 * carries no reason on any channel.
 *
 * `TaskMeta` is an intentionally empty interface in vitest, meant to be widened
 * by module augmentation exactly like this; without this file every call site
 * above is a TS2769 ("'skipReason' does not exist in type 'Partial<TaskMeta>'").
 * Declaring it here rather than casting at each site means the key is spelled
 * once and a typo at a call site is a type error rather than a skip that
 * silently reports no reason.
 */
import 'vitest';

declare module 'vitest' {
  interface TaskMeta {
    /**
     * Why this test (or every test in this suite) did not run. Read by
     * `scripts/skip-report-reporter.mjs`; set it beside `skip` in the options
     * object. Only meaningful on a test that actually skipped.
     */
    skipReason?: string;
  }
}
