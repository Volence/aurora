/**
 * Types for `run-completeness-reporter.mjs`, so
 * `test/config/run-completeness-reporter.test.ts` can import its exports under
 * `tsc --noEmit` without an implicit `any`. Deliberately narrow, like
 * `failure-class-reporter.d.mts` beside it: the surface the tests use, not
 * vitest's real classes.
 */

export declare const PREFIX: string;
export declare const RECORD_ENV: string;
export declare const COMPLETE: 'COMPLETE';
export declare const INCOMPLETE: 'INCOMPLETE';
export declare const UNMEASURABLE: 'UNMEASURABLE';

export interface SelectedModule {
  readonly project: string;
  readonly moduleId: string;
}

export interface ReportedModule extends SelectedModule {
  readonly state: string | undefined;
}

export interface CompletenessVerdict {
  readonly status: 'COMPLETE' | 'INCOMPLETE' | 'UNMEASURABLE';
  readonly why: string;
  readonly selected: string[];
  readonly finished: number;
  readonly missing: string[];
  readonly unfinished: { moduleId: string; state: string | undefined }[];
  readonly reason?: string | null;
}

export declare function assessCompleteness(
  selected: readonly SelectedModule[] | null,
  modules: readonly ReportedModule[],
  reason: string | undefined,
): CompletenessVerdict;

export declare function verifyRecordAgainstExpected(
  record: unknown,
  expectedFiles: readonly string[],
): string | null;

export default class RunCompletenessReporter {
  onInit(vitest: unknown): void;
  onTestRunStart(specifications: readonly unknown[]): Promise<void>;
  onTestRunEnd(testModules: readonly unknown[], unhandledErrors: readonly unknown[], reason: string): void;
}
