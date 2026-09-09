/**
 * Types for `failure-class-reporter.mjs`, so `test/config/failure-class-reporter.test.ts`
 * can import its exports under `tsc --noEmit` without an implicit `any`.
 *
 * Deliberately narrow, for the same reason as `skip-report-reporter.d.mts`
 * beside it: it describes only the surface the reporter consumes and exports,
 * not vitest's real classes. The error shape in particular is `unknown`-ish on
 * purpose, because the whole job of `classifyError` is to decide what an
 * arbitrary thrown value is, and a type that promised more would be describing
 * the answer rather than the question.
 */

export declare const CLASS_TIMEOUT: 'TIMEOUT';
export declare const CLASS_ASSERTION: 'ASSERTION';
export declare const CLASS_UNCLASSIFIED: 'UNCLASSIFIED';
export declare const PREFIX: string;

/** The bucket a single failure record lands in, and the sentence that says why. */
export interface FailureClassification {
  readonly cls: 'TIMEOUT' | 'ASSERTION' | 'UNCLASSIFIED';
  readonly why: string;
}

export declare function classifyError(error: unknown): FailureClassification;

/** One failure, wherever on the Reporter API it arrived. */
export interface FailureRecord {
  readonly module: string;
  readonly label: string;
  readonly origin: 'collection' | 'hook/suite' | 'test' | 'unhandled';
  readonly cls: 'TIMEOUT' | 'ASSERTION' | 'UNCLASSIFIED';
  readonly why: string;
  readonly name: string;
  readonly message: string;
}

export declare function collectRecords(
  testModules: readonly unknown[] | undefined,
  unhandledErrors?: readonly unknown[],
): { records: FailureRecord[]; failedTests: number; modules: number };

export default class FailureClassReporter {
  onTestRunEnd(testModules: readonly unknown[], unhandledErrors?: readonly unknown[]): void;
}
