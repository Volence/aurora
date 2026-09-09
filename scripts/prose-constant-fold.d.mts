/**
 * Types for `prose-constant-fold.mjs`, so
 * `test/config/prose-constant-fold.test.ts` can import its exports under
 * `tsc --noEmit` without an implicit `any`.
 *
 * Narrow on purpose, on the same argument as `failure-class-reporter.d.mts`
 * beside it: it describes the surface the test consumes, not TypeScript's node
 * model. Syntax nodes stay `unknown` because nothing in the test constructs one
 * by hand; they arrive from `parseSources` and go straight back in.
 */

/** A source file parsed by `parseSources`, opaque to the consumer. */
export type ParsedSource = unknown;

/** One constant the fold attempted or recognised as numeric, and gave up on. */
export interface BlindRow {
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly src: string;
}

/** A pure-arithmetic helper the fold is willing to inline at a call site. */
export interface PureFn {
  readonly params: readonly string[];
  readonly expr: unknown;
}

export interface FoldResult {
  /** Helpers whose single returned expression is arithmetic over their params. */
  readonly fns: Map<string, PureFn>;
  /** Functions declared `: number`, used only to widen the BLIND census. */
  readonly numFns: Set<string>;
  /** Every exported const the fold resolved, repo-wide, to a fixpoint. */
  readonly exported: Map<string, number>;
  /** Attempted and abandoned: the tier a caller must adjudicate. */
  readonly nearMiss: readonly BlindRow[];
  /** Declared numeric and unevaluable: the tier a caller must COUNT. */
  readonly declaredBlind: readonly BlindRow[];
}

export declare function parseSources(
  sources: Readonly<Record<string, string>>,
): Map<string, ParsedSource>;

export declare function foldTrees(
  trees: Map<string, ParsedSource>,
  contract: Map<string, number>,
): FoldResult;

export declare function namesInScope(
  sf: ParsedSource,
  exported: Map<string, number>,
  contract: Map<string, number>,
  fns: Map<string, PureFn>,
): Map<string, number>;
