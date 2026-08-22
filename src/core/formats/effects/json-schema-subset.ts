// A strict, no-eval evaluator for the SUBSET of JSON Schema Draft 2020-12 that
// the committed contract schema actually uses.
//
// WHY NOT ajv. Two independent blockers, both load-bearing:
//   1. Aurora's core runs in the RENDERER behind the FileAccess seam
//      (src/core/project/aeon/load.ts header), and the renderer ships
//      `script-src 'self'` with no 'unsafe-eval'
//      (src/renderer/index.html:6). ajv compiles every schema with
//      `new Function(...)`, which that CSP blocks at runtime — a validator that
//      throws in production and passes in a node-env test suite is the worst of
//      both worlds.
//   2. This repo's dependency tree cannot resolve a plain `npm install`:
//      electron-vite@5 peers vite ^5||^6||^7 against the installed vite 8, so
//      adding any dependency means --force/--legacy-peer-deps rewriting a lock
//      untouched since 396afcf.
//
// WHY THIS IS SAFE ANYWAY. The danger of a hand-rolled validator is that it
// silently ACCEPTS what the real schema rejects. Two guards close that:
//   • Every schema object is checked against SUPPORTED_KEYWORDS before it is
//     evaluated; an unrecognised keyword THROWS rather than being ignored. So a
//     future amendment adding `allOf`/`if`/`patternProperties` fails loudly the
//     first time anything validates, instead of quietly becoming a no-op.
//   • collectSchemaKeywords() lets a test walk the committed schema and assert
//     the whole keyword set is implemented — the coverage gate in
//     test/formats/effects-schema-drift.test.ts.
//
// unevaluatedProperties: implemented as additionalProperties. That is EXACT for
// this schema, not an approximation: every object carrying
// `unevaluatedProperties` in the committed file carries it beside
// {type, properties, required} only, with no in-place applicator sibling
// ($ref/oneOf/allOf/anyOf/if) that could contribute annotations from elsewhere.
// assertSupported() re-checks that precondition on every schema object it
// meets, so the equivalence cannot silently stop holding.

/** A schema node. Deliberately loose — the committed file is the authority. */
export type JsonSchema = Record<string, unknown>;

export interface SchemaIssue {
  /** JSON Pointer to the offending value, '' for the document root. */
  path: string;
  message: string;
}

/** Keywords with no assertion behaviour; present and ignored. */
const ANNOTATION_KEYWORDS = [
  '$schema', '$id', '$comment', 'title', 'description', 'default', '$defs', 'examples',
] as const;

/** Keywords this evaluator actually asserts. */
const ASSERTION_KEYWORDS = [
  '$ref', 'type', 'const', 'enum', 'pattern', 'minimum', 'maximum',
  'properties', 'required', 'unevaluatedProperties',
  'items', 'minItems', 'maxItems', 'oneOf',
] as const;

export const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set<string>([
  ...ANNOTATION_KEYWORDS,
  ...ASSERTION_KEYWORDS,
]);

/**
 * Applicators that place OTHER schemas "in place" at the same instance
 * location, and so can contribute the annotations `unevaluatedProperties` is
 * defined in terms of. If one of these appears beside `unevaluatedProperties`,
 * the additionalProperties equivalence above stops holding and we refuse.
 */
const IN_PLACE_APPLICATORS = [
  '$ref', '$dynamicRef', 'oneOf', 'anyOf', 'allOf', 'if', 'then', 'else', 'not',
  'dependentSchemas',
];

/** Thrown when the schema uses something this evaluator does not implement. */
export class UnsupportedSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSchemaError';
  }
}

function assertSupported(schema: JsonSchema, where: string): void {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new UnsupportedSchemaError(
        `JSON Schema keyword "${key}" at ${where || '<root>'} is not implemented by ` +
        'json-schema-subset.ts. Refusing to validate rather than ignoring it — ' +
        'implement the keyword (and extend SUPPORTED_KEYWORDS) before the schema ships it.',
      );
    }
  }
  if (schema.unevaluatedProperties !== undefined) {
    if (schema.unevaluatedProperties !== false) {
      throw new UnsupportedSchemaError(
        `unevaluatedProperties at ${where || '<root>'} is only implemented for the value false.`,
      );
    }
    const applicator = IN_PLACE_APPLICATORS.find(k => schema[k] !== undefined);
    if (applicator) {
      throw new UnsupportedSchemaError(
        `unevaluatedProperties at ${where || '<root>'} sits beside the in-place applicator ` +
        `"${applicator}"; this evaluator implements it as additionalProperties, which is only ` +
        'equivalent when no in-place applicator can contribute annotations. Refusing.',
      );
    }
  }
  if (schema.$ref !== undefined) {
    const sibling = (ASSERTION_KEYWORDS as readonly string[])
      .find(k => k !== '$ref' && schema[k] !== undefined);
    if (sibling) {
      throw new UnsupportedSchemaError(
        `$ref at ${where || '<root>'} has the asserting sibling "${sibling}"; not implemented.`,
      );
    }
  }
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  if (!ref.startsWith('#/')) {
    throw new UnsupportedSchemaError(`only local JSON-Pointer $refs are implemented, got "${ref}"`);
  }
  let node: unknown = root;
  for (const rawSeg of ref.slice(2).split('/')) {
    const seg = rawSeg.replace(/~1/g, '/').replace(/~0/g, '~');
    if (typeof node !== 'object' || node === null) {
      throw new UnsupportedSchemaError(`$ref "${ref}" does not resolve`);
    }
    node = (node as Record<string, unknown>)[seg];
  }
  if (typeof node !== 'object' || node === null) {
    throw new UnsupportedSchemaError(`$ref "${ref}" does not resolve to a schema`);
  }
  return node as JsonSchema;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    // JSON Schema: booleans are NOT numbers, and integer means "a number with
    // zero fractional part".
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    default:
      throw new UnsupportedSchemaError(`type "${type}" is not implemented`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  root: JsonSchema,
  issues: SchemaIssue[],
): void {
  assertSupported(schema, path);

  if (typeof schema.$ref === 'string') {
    validateNode(value, resolveRef(schema.$ref, root), path, root, issues);
    return;
  }

  if (typeof schema.type === 'string' && !matchesType(value, schema.type)) {
    issues.push({ path, message: `expected ${schema.type}, got ${typeName(value)}` });
    return; // no cascade off a wrong type
  }
  if (schema.type !== undefined && typeof schema.type !== 'string') {
    throw new UnsupportedSchemaError(`type arrays are not implemented (at ${path || '<root>'})`);
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    issues.push({ path, message: `expected the constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(e => deepEqual(value, e))) {
    issues.push({ path, message: `${JSON.stringify(value)} is not one of ${schema.enum.map(e => JSON.stringify(e)).join(', ')}` });
  }

  if (typeof schema.pattern === 'string' && typeof value === 'string') {
    if (!new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `${JSON.stringify(value)} does not match ${schema.pattern}` });
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push({ path, message: `${value} is below the minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push({ path, message: `${value} is above the maximum ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push({ path, message: `has ${value.length} items, minimum ${schema.minItems}` });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push({ path, message: `has ${value.length} items, maximum ${schema.maxItems}` });
    }
    if (schema.items !== undefined) {
      const itemSchema = schema.items as JsonSchema;
      value.forEach((item, i) => validateNode(item, itemSchema, `${path}/${i}`, root, issues));
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, JsonSchema>;

    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) issues.push({ path, message: `missing required property "${key}"` });
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) validateNode(obj[key], sub, `${path}/${key}`, root, issues);
    }
    if (schema.unevaluatedProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          issues.push({ path, message: `unknown property "${key}" (the schema is closed)` });
        }
      }
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[];
    const perBranch = branches.map(branch => {
      const sub: SchemaIssue[] = [];
      validateNode(value, branch, path, root, sub);
      return sub;
    });
    const matched = perBranch.filter(b => b.length === 0).length;
    if (matched === 0) {
      const detail = perBranch
        .map((b, i) => `  form ${i + 1}: ${b.map(x => `${x.path || '<here>'}: ${x.message}`).join('; ')}`)
        .join('\n');
      issues.push({
        path,
        message: `matches none of the ${branches.length} allowed forms:\n${detail}`,
      });
    } else if (matched > 1) {
      issues.push({
        path,
        message: `matches ${matched} of the ${branches.length} allowed forms; the schema requires exactly one`,
      });
    }
  }
}

/**
 * Validate a value; returns [] when it conforms. Throws on an unsupported
 * schema. `root` is where `#/...` $refs resolve — it defaults to `schema`, and
 * is passed explicitly when validating a sub-schema of a larger document.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema = schema,
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  validateNode(value, schema, '', root, issues);
  return issues;
}

/**
 * Rewrite `value` so every object's keys appear in the order the SCHEMA
 * declares them, recursively. Nothing is added and nothing is dropped — the
 * function only reorders, and throws if it meets a key the schema does not
 * declare (which validation should already have caught).
 *
 * The point is that the writer's key order is derived from the committed
 * contract file instead of being re-typed in a serializer, so it cannot drift
 * from it. Callers must validate first: branch selection below relies on the
 * value conforming.
 */
export function canonicalizeBySchema(value: unknown, schema: JsonSchema, root?: JsonSchema): unknown {
  const rootSchema = root ?? schema;
  assertSupported(schema, '');

  if (typeof schema.$ref === 'string') {
    return canonicalizeBySchema(value, resolveRef(schema.$ref, rootSchema), rootSchema);
  }

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as JsonSchema[];
    const hits = branches.filter(b => validateAgainstSchema(value, b, rootSchema).length === 0);
    if (hits.length !== 1) {
      throw new Error(
        `canonicalizeBySchema: value matches ${hits.length} schema forms, expected exactly 1 — validate before serializing`,
      );
    }
    return canonicalizeBySchema(value, hits[0], rootSchema);
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    return value.map(item => canonicalizeBySchema(item, schema.items as JsonSchema, rootSchema));
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value) && schema.properties) {
    const props = schema.properties as Record<string, JsonSchema>;
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (key in obj) out[key] = canonicalizeBySchema(obj[key], props[key], rootSchema);
    }
    const leftover = Object.keys(obj).filter(k => !(k in props));
    if (leftover.length > 0) {
      throw new Error(
        `canonicalizeBySchema: refusing to drop ${leftover.map(k => `"${k}"`).join(', ')} — ` +
        'the schema does not declare them, so serializing would erase them silently',
      );
    }
    return out;
  }

  return value;
}

/**
 * Every keyword appearing anywhere in `schema`. Used by the drift gate to
 * assert the committed contract file stays inside the implemented subset.
 */
export function collectSchemaKeywords(schema: JsonSchema): Set<string> {
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object' || node === null) return;
    const obj = node as Record<string, unknown>;
    // Containers whose KEYS are names, not keywords.
    const nameKeyed = new Set(['properties', '$defs']);
    for (const [key, val] of Object.entries(obj)) {
      seen.add(key);
      if (nameKeyed.has(key) && typeof val === 'object' && val !== null) {
        Object.values(val as Record<string, unknown>).forEach(walk);
      } else if (key === 'enum' || key === 'const' || key === 'default' ||
                 key === 'required' || key === 'examples') {
        // Data, not schemas — do not descend (their keys are values).
      } else {
        walk(val);
      }
    }
  };
  walk(schema);
  return seen;
}
