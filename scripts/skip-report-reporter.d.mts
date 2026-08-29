/**
 * Types for `skip-report-reporter.mjs`, so `test/config/skip-report-reporter.test.ts`
 * can drive it under `tsc --noEmit` without an implicit `any`.
 *
 * Deliberately narrow: it describes only the surface the reporter CONSUMES
 * (a duck-typed subset of vitest's `TestModule`), not vitest's real classes. A
 * test that had to build genuine `TestModule` instances could not construct the
 * one case that matters most — a skip carrying no reason at all — without
 * leaving such a skip in the tree for the gate to then trip over.
 */

/** The subset of vitest's `TestCase` the reporter reads. */
export interface SkipReportTestCase {
  readonly fullName: string;
  readonly options: { readonly mode?: string };
  result(): { readonly state: string; readonly note?: string | undefined };
  meta(): Record<string, unknown>;
}

/** The subset of vitest's `TestModule` the reporter reads. */
export interface SkipReportTestModule {
  readonly relativeModuleId: string;
  readonly children: { allTests(): Iterable<SkipReportTestCase> };
}

export default class SkipReportReporter {
  onInit(vitest?: { config?: { watch?: boolean } }): void;
  onTestRunEnd(testModules: readonly SkipReportTestModule[]): void;
}
