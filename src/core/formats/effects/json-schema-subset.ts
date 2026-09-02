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
//     the whole keyword set is implemented, and assertSchemaSupported() runs the
//     per-node check over every node whether or not a document reaches it — the
//     coverage gates in test/formats/effects-schema-drift.test.ts and
//     test/formats/effects-preset-schema-drift.test.ts. Both are needed: a
//     keyword name can be implemented while a VALUE SHAPE of it is not (the
//     type array `cycles` arrived with, empyrean 12aecd5), and only the walk
//     sees the shape.
//
// unevaluatedProperties: implemented as additionalProperties. That is EXACT for
// the committed schemas, not an approximation, and the precondition is checked
// per node rather than asserted once — see assertSupported() and
// `contributesPropertyAnnotations` below. The equivalence needs the in-place
// applicators beside it to contribute no PROPERTY annotations; when one does,
// or when this file cannot prove it does not, validation is refused.

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
  'items', 'minItems', 'maxItems', 'oneOf', 'anyOf', 'not',
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

/**
 * Keywords a subschema may carry and still be PROVABLY unable to contribute a
 * property annotation — the annotations `unevaluatedProperties` is defined in
 * terms of. Every one of these is a pure assertion over the instance: it either
 * holds or it does not, and none of them names a property as "evaluated".
 *
 * `properties`, `patternProperties`, `additionalProperties` and
 * `unevaluatedProperties` are DELIBERATELY ABSENT, and so is `$ref` (whose
 * target could carry any of them). Anything not on this list is treated as
 * "might annotate", which is the safe side.
 */
const NON_ANNOTATING_KEYWORDS: ReadonlySet<string> = new Set<string>([
  ...ANNOTATION_KEYWORDS,
  'type', 'const', 'enum', 'pattern', 'minimum', 'maximum',
  'required', 'minItems', 'maxItems',
]);

/**
 * Can this in-place subschema contribute a PROPERTY annotation?
 *
 * ═══ WHY THIS EXISTS (the preset schema, empyrean 6664b61) ═══
 *
 * The scene schema never put `unevaluatedProperties` beside an in-place
 * applicator, so assertSupported() could refuse the combination outright. The
 * PRESET schema does, at `$defs.band.properties.on`:
 *
 *     "properties": { "cram": {…}, "pal_region": {…} },
 *     "oneOf": [ {"required": ["cram"]}, {"required": ["pal_region"]} ],
 *     "unevaluatedProperties": false
 *
 * That is the natural spelling of "exactly one arm, and no other key", and it is
 * the shape aeon's generator enforces (`render_band_on`). The blanket refusal
 * was a FALSE POSITIVE on it: `{"required": [...]}` asserts a key is PRESENT and
 * annotates nothing, so `unevaluatedProperties` still sees exactly the
 * annotations `properties` produced, and the additionalProperties equivalence
 * holds exactly.
 *
 * ═══ WHY A WHITELIST AND NOT A BLACKLIST ═══
 *
 * The failure this evaluator is built against is silently ACCEPTING what the
 * real schema rejects. A blacklist of annotating keywords is wrong by default on
 * every keyword nobody thought of; a whitelist of provably-inert ones is right by
 * default and merely inconvenient when the schema grows. So an unrecognised
 * keyword inside a branch makes this return `true` and the caller refuse — the
 * same posture assertSupported() takes for the keyword set itself.
 *
 * Recursive, because `not` and nested `oneOf` are themselves in-place: a branch
 * that merely wraps another applicator is only inert if that one is too.
 */
function contributesPropertyAnnotations(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(contributesPropertyAnnotations);
  if (typeof node !== 'object' || node === null) return false;
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (!NON_ANNOTATING_KEYWORDS.has(key)) return true;
    // `required`/`enum`/`const` hold DATA, not schemas; do not descend into them.
    if (key === 'required' || key === 'enum' || key === 'const' ||
        key === 'default' || key === 'examples' || key === '$defs') continue;
    if (contributesPropertyAnnotations(val)) return true;
  }
  return false;
}

/** Thrown when the schema uses something this evaluator does not implement. */
export class UnsupportedSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSchemaError';
  }
}

/** The `type` names matchesType() below implements — checked HERE, before any value is seen. */
const IMPLEMENTED_TYPES: ReadonlySet<string> = new Set<string>([
  'object', 'array', 'string', 'boolean', 'null', 'number', 'integer',
]);

/**
 * The per-node support check: every keyword on this node is implemented, and
 * every keyword VALUE SHAPE this evaluator distinguishes is one it implements.
 *
 * ═══ WHY THE VALUE SHAPE IS CHECKED HERE AND NOT ONLY AT USE (empyrean 12aecd5) ═══
 *
 * The preset amendment that added `cycles` spelled it `"type": ["array", "null"]`
 * — the first type ARRAY in any committed contract schema. `type` was already a
 * SUPPORTED keyword, so the keyword-coverage gate stayed green; the refusal
 * lived inside validateNode, which only runs on a node the DOCUMENT reaches.
 * Every document without a `cycles` key parsed, and the first one with it threw
 * UnsupportedSchemaError. That is the partial-coverage hole this file's header
 * promises not to have: a gate that covers most of the schema and is silently
 * wrong in the corner. So the shape refusal is a property of the SCHEMA NODE,
 * asserted here, and `assertSchemaSupported` below walks every node so a gate
 * can ask the question of the whole schema without a document.
 */
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
  if (schema.type !== undefined) {
    const names = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (names.length === 0) {
      throw new UnsupportedSchemaError(`an empty type array at ${where || '<root>'} is not implemented`);
    }
    for (const t of names) {
      if (typeof t !== 'string' || !IMPLEMENTED_TYPES.has(t)) {
        throw new UnsupportedSchemaError(
          `type ${JSON.stringify(t)} at ${where || '<root>'} is not implemented by json-schema-subset.ts`,
        );
      }
    }
  }
  if (schema.unevaluatedProperties !== undefined) {
    if (schema.unevaluatedProperties !== false) {
      throw new UnsupportedSchemaError(
        `unevaluatedProperties at ${where || '<root>'} is only implemented for the value false.`,
      );
    }
    // A `$ref`/`$dynamicRef` value is a STRING, not a schema, so the prover
    // below cannot look through it — and its target could declare anything.
    // Both stay an unconditional refusal, which is also what the $ref-sibling
    // rule further down would say if it ran first.
    const opaque = (['$ref', '$dynamicRef'] as const).find(k => schema[k] !== undefined);
    if (opaque) {
      throw new UnsupportedSchemaError(
        `unevaluatedProperties at ${where || '<root>'} sits beside "${opaque}", whose target this ` +
        'evaluator does not follow when proving the additionalProperties equivalence. Refusing.',
      );
    }
    const applicator = IN_PLACE_APPLICATORS
      .filter(k => schema[k] !== undefined)
      .find(k => contributesPropertyAnnotations(schema[k]));
    if (applicator) {
      throw new UnsupportedSchemaError(
        `unevaluatedProperties at ${where || '<root>'} sits beside the in-place applicator ` +
        `"${applicator}", whose subschemas can contribute property annotations; this evaluator ` +
        'implements it as additionalProperties, which is only equivalent when they cannot. Refusing.',
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

  // `type` — one name, or (since empyrean 12aecd5, `cycles`) an ARRAY of names
  // meaning "any of these". Both spellings reduce to one list; assertSupported
  // has already refused a name matchesType() does not know.
  if (schema.type !== undefined) {
    const names = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
    if (!names.some(t => matchesType(value, t))) {
      issues.push({ path, message: `expected ${names.join(' or ')}, got ${typeName(value)}` });
      return; // no cascade off a wrong type
    }
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

  // `not` — the schema conforms when the subschema does NOT.
  //
  // ARRIVED WITH `drift` (empyrean 988638f): `rate` is an integer -4096..4096
  // with `"not": {"const": 0}`, because `Rate(0)` and `None` are indistinguishable
  // in ROM and aeon refuses `Rate(0)` at build time. A hole in a range is exactly
  // what `not` is for, and there is no other keyword in this subset that can
  // express one.
  //
  // NO ANNOTATION QUESTION ARISES, which is why implementing it here does not
  // weaken the `unevaluatedProperties` equivalence the header rests on: `not`
  // succeeds precisely when its subschema FAILS, and a failing subschema
  // contributes no annotations. `not` nevertheless stays in IN_PLACE_APPLICATORS
  // above — the conservative refusal costs nothing (the committed schema never
  // puts the two together) and a refusal is the safe side of that judgement.
  if (schema.not !== undefined) {
    const excluded = schema.not as JsonSchema;
    const sub: SchemaIssue[] = [];
    validateNode(value, excluded, path, root, sub);
    if (sub.length === 0) {
      // The committed schema's only use is a single forbidden constant, and
      // "0 is refused" reads better to an author than a schema fragment does.
      const soleConst = Object.keys(excluded).length === 1 && excluded.const !== undefined;
      issues.push({
        path,
        message: soleConst
          ? `${JSON.stringify(value)} is refused: the schema forbids the constant ${JSON.stringify(excluded.const)}`
          : `${JSON.stringify(value)} is refused by "not": ${JSON.stringify(excluded)}`,
      });
    }
  }

  // `anyOf` — AT LEAST ONE branch must hold.
  //
  // ARRIVED WITH `bob_shift` (empyrean bc639a10): the scene bob's amplitude is a
  // right-shift whose legal domain is DISCONTINUOUS — exactly the no-bob
  // sentinel 15, or the ladder 1..8 — spelled `anyOf: [{const: 15}, {minimum: 1,
  // maximum: 8}]`. A hole in a range that `not` cannot express, because the hole
  // here is 0 and 9..14 (six values in two runs) rather than one constant.
  //
  // WHY NOT REUSE `oneOf`, which is already implemented and would ACCEPT every
  // value this schema means to accept: because the two keywords differ on
  // OVERLAP, and a future amendment that widened the range branch to include 15
  // would then have exactly one legal value silently refused for matching twice.
  // A keyword implemented as its near neighbour is the "silently accepts what the
  // real schema rejects" failure this file is built against, wearing the other
  // sign.
  //
  // NO ANNOTATION QUESTION ARISES HERE EITHER — `anyOf` stays in
  // IN_PLACE_APPLICATORS above, so `unevaluatedProperties` beside an `anyOf`
  // whose branches can annotate is still refused, unchanged.
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as JsonSchema[];
    const perBranch = branches.map(branch => {
      const sub: SchemaIssue[] = [];
      validateNode(value, branch, path, root, sub);
      return sub;
    });
    if (!perBranch.some(b => b.length === 0)) {
      const detail = perBranch
        .map((b, i) => `  form ${i + 1}: ${b.map(x => `${x.path || '<here>'}: ${x.message}`).join('; ')}`)
        .join('\n');
      issues.push({
        path,
        message: `matches none of the ${branches.length} allowed forms:\n${detail}`,
      });
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
 * WHAT IT IS STILL FOR, since its ORDERING no longer reaches disk: the throw.
 * `serializeEffectsScene` sorts alphabetically after this runs (aeon
 * EFFECTS_CONSUMER_CONTRACT.md §5, ruled at 768eb2d8), so the schema order this
 * builds is overwritten. The refusal on an undeclared key is not — it is what
 * stops serializing from silently erasing a field the schema does not model.
 *
 * Callers must validate first: branch selection below relies on the value
 * conforming.
 */
export function canonicalizeBySchema(value: unknown, schema: JsonSchema, root?: JsonSchema): unknown {
  const rootSchema = root ?? schema;
  assertSupported(schema, '');

  if (typeof schema.$ref === 'string') {
    return canonicalizeBySchema(value, resolveRef(schema.$ref, rootSchema), rootSchema);
  }

  // `anyOf` OVER AN OBJECT IS REFUSED HERE, and the asymmetry with `oneOf` is
  // deliberate. `oneOf` can pick a branch because exactly one holds; `anyOf`
  // cannot, and there is no correct branch to canonicalize an object against —
  // silently returning it would skip the undeclared-key refusal below, which is
  // the one thing this function still exists for. The committed schema's only
  // `anyOf` is `properties.bob_shift`, an INTEGER, which falls through to the
  // `return value` at the bottom untouched; this arm is for the amendment that
  // makes it an object shape, and it refuses instead of quietly weakening.
  if (Array.isArray(schema.anyOf)
      && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    throw new UnsupportedSchemaError(
      'canonicalizeBySchema: `anyOf` over an object value is not implemented — unlike `oneOf` ' +
      'there is no single branch to canonicalize against, and returning the object unchanged ' +
      'would skip the undeclared-key refusal. Implement it before the schema ships that shape.',
    );
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
 * Which keywords hold SUBSCHEMAS, and how: by name (`properties`, `$defs`), as
 * one schema (`items`, `not`), or as a list of schemas (`oneOf`, `anyOf`). Every
 * other keyword's value is data (`required`, `enum`, `const`, `type`, …).
 *
 * One table, read by both walkers below, so the coverage gate and the keyword
 * census cannot disagree about what a subschema is.
 */
const NAME_KEYED_SUBSCHEMAS: ReadonlySet<string> = new Set(['properties', '$defs']);
const SINGLE_SUBSCHEMA: ReadonlySet<string> = new Set(['items', 'not']);
const LIST_SUBSCHEMAS: ReadonlySet<string> = new Set(['oneOf', 'anyOf']);

/**
 * Run the per-node support check over EVERY node of `schema`, reachable by a
 * document or not — the question a document-driven validation cannot ask.
 *
 * THIS IS THE COVERAGE GATE'S REAL INSTRUMENT (empyrean 12aecd5). The keyword
 * census `collectSchemaKeywords` answers "is every keyword NAME implemented?";
 * this answers "would validateNode refuse ANY node of this schema?" — which is
 * a strictly stronger question, because assertSupported also refuses value
 * SHAPES (a type array, `unevaluatedProperties: true`, a `$ref` with an
 * asserting sibling, a `$ref` that does not resolve) that a keyword name cannot
 * express. Throws UnsupportedSchemaError naming the node, or returns.
 */
export function assertSchemaSupported(schema: JsonSchema, root: JsonSchema = schema): void {
  const walk = (node: unknown, where: string): void => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      throw new UnsupportedSchemaError(
        `the subschema at ${where || '<root>'} is not an object; boolean and array schemas are not implemented`,
      );
    }
    const obj = node as JsonSchema;
    assertSupported(obj, where);
    if (typeof obj.$ref === 'string') resolveRef(obj.$ref, root); // throws when it does not resolve
    for (const [key, val] of Object.entries(obj)) {
      if (NAME_KEYED_SUBSCHEMAS.has(key)) {
        for (const [name, sub] of Object.entries(val as Record<string, unknown>)) {
          walk(sub, `${where}/${key}/${name}`);
        }
      } else if (SINGLE_SUBSCHEMA.has(key)) {
        walk(val, `${where}/${key}`);
      } else if (LIST_SUBSCHEMAS.has(key)) {
        if (!Array.isArray(val)) {
          throw new UnsupportedSchemaError(`${key} at ${where || '<root>'} is not an array of schemas`);
        }
        val.forEach((sub, i) => walk(sub, `${where}/${key}/${i}`));
      }
    }
  };
  walk(schema, '');
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
    for (const [key, val] of Object.entries(obj)) {
      seen.add(key);
      // Containers whose KEYS are names, not keywords.
      if (NAME_KEYED_SUBSCHEMAS.has(key) && typeof val === 'object' && val !== null) {
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
