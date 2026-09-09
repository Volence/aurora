import { describe, it, expect } from 'vitest';
import {
  assertSchemaSupported,
  validateAgainstSchema,
  canonicalizeBySchema,
  UnsupportedSchemaError,
  type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';

/**
 * THE AMENDMENT-FACING HALF OF THE SCHEMA EVALUATOR.
 *
 * WHY THIS FILE EXISTS. A plant-and-count audit of
 * src/core/formats/effects/json-schema-subset.ts split cleanly in two, and the
 * split is the finding rather than the ratio
 * (docs/reviews/2026-09-09-guard-residue-validators.md):
 *
 *   - `validateNode`'s keyword checks, the guards a COMMITTED DOCUMENT
 *     exercises, killed almost every plant. They are held, and this file adds
 *     nothing to them.
 *   - `assertSupported`, `assertSchemaSupported`'s whole-schema walk,
 *     `resolveRef` and `canonicalizeBySchema` did not. Those are the guards
 *     that exist so a FUTURE schema amendment cannot pass silently, and they
 *     had no assertions at all beyond the ones the committed schema happens to
 *     reach.
 *
 * That is the worse half to leave uncovered. Every one of these guards answers
 * "I cannot look at this", and a not-looking that renders as a pass is the
 * failure this module's own header promises not to have: it was written after
 * a preset amendment shipped a `type` spelled as an ARRAY, which the
 * keyword-NAME gate could not see because the keyword name was already
 * supported. The name question is tested. The SHAPE question was not.
 *
 * EVERY ROW BELOW NAMES WHICH GATE REFUSED, not merely that something did.
 * These guards sit in a stack (the unknown-keyword refusal runs before the
 * shape refusals, which run before `resolveRef`), so a row asserting only
 * "it throws" would stay green while its own subject was deleted and a
 * neighbour answered in its place. Each row also carries the ACCEPTING control
 * for its guard, because a narrowed guard tested only on its refusing side is
 * indistinguishable from a guard that refuses everything.
 *
 * Fixtures here are hand-built, deliberately. The committed contract schemas
 * are the subject of test/formats/effects-schema-drift.test.ts and
 * test/formats/effects-preset-schema-drift.test.ts; the point of THIS file is
 * the shapes those schemas do not carry yet, which is exactly why no committed
 * document can stand in for them.
 */
describe('json-schema-subset: the guards that face a schema amendment', () => {
  it('refuses unevaluatedProperties spelled as anything but false, and says so', () => {
    const widened: JsonSchema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      unevaluatedProperties: true,
    };
    expect(() => assertSchemaSupported(widened))
      .toThrow(/unevaluatedProperties at <root> is only implemented for the value false/);

    // ACCEPTING CONTROL. Without it this row is met by a guard that refuses the
    // keyword outright, which is a different and wrong behaviour.
    const implemented: JsonSchema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      unevaluatedProperties: false,
    };
    expect(() => assertSchemaSupported(implemented)).not.toThrow();
  });

  /**
   * The applicator census is asserted ONE MEMBER AT A TIME elsewhere, and one
   * member was missing. effects-schema-drift.test.ts proves the refusal for
   * `oneOf` and for a `not` wrapping a `oneOf`; `anyOf` is in the same list and
   * had no row, so exempting it from the prover left the whole suite green.
   * `anyOf` is not hypothetical vocabulary either: the committed scene schema
   * already uses it.
   */
  it('counts anyOf among the applicators that can annotate, not only oneOf and not', () => {
    const annotating: JsonSchema = {
      type: 'object',
      anyOf: [{ properties: { b: { type: 'string' } } }],
      properties: { a: { type: 'string' } },
      unevaluatedProperties: false,
    };
    expect(() => assertSchemaSupported(annotating))
      .toThrow(/in-place applicator "anyOf", whose subschemas can contribute property annotations/);

    // ACCEPTING CONTROL, and it is what makes the row above about `anyOf`
    // rather than about `unevaluatedProperties` beside anything at all: an
    // `anyOf` whose branches provably cannot annotate is still accepted.
    const inert: JsonSchema = {
      type: 'object',
      anyOf: [{ required: ['a'] }, { required: ['b'] }],
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      unevaluatedProperties: false,
    };
    expect(() => assertSchemaSupported(inert)).not.toThrow();
  });

  it('refuses a $ref carrying an asserting sibling, and names the sibling', () => {
    const withSibling: JsonSchema = {
      $defs: { base: { type: 'string' } },
      properties: { a: { $ref: '#/$defs/base', type: 'string' } },
    };
    expect(() => assertSchemaSupported(withSibling))
      .toThrow(/\$ref at \/properties\/a has the asserting sibling "type"/);

    // ACCEPTING CONTROL: the same $ref alone resolves and is supported, so the
    // row above is about the SIBLING and not about $ref in a property.
    const alone: JsonSchema = {
      $defs: { base: { type: 'string' } },
      properties: { a: { $ref: '#/$defs/base' } },
    };
    expect(() => assertSchemaSupported(alone)).not.toThrow();
  });

  /**
   * A REMOTE $ref IS THE WRONG FIXTURE ON ITS OWN, and this row was written
   * with only that one first. A url shares no leading character with a local
   * pointer, so it is still refused by a guard weakened to check for the fence
   * post alone, and the row stayed green while its subject was loosened.
   *
   * The case that separates them is the shape one character away: a plain-name
   * fragment. `#anchor` is JSON Schema's `$anchor` spelling, a real amendment
   * this evaluator does not implement, and under a guard that asks only for a
   * leading `#` it slips past this refusal and is answered several lines later
   * by the pointer resolver with a sentence about a schema that does not
   * resolve. Both throw; only one of them says the true reason.
   */
  it('refuses a $ref that is not a local JSON Pointer, including a plain-name fragment', () => {
    const remote: JsonSchema = { properties: { a: { $ref: 'https://example.invalid/s.json' } } };
    expect(() => assertSchemaSupported(remote))
      .toThrow(/only local JSON-Pointer \$refs are implemented, got "https:\/\/example.invalid\/s.json"/);

    const anchored: JsonSchema = { properties: { a: { $ref: '#anchor' } } };
    expect(() => assertSchemaSupported(anchored))
      .toThrow(/only local JSON-Pointer \$refs are implemented, got "#anchor"/);

    // ACCEPTING CONTROL: the spelling it does implement resolves.
    const pointer: JsonSchema = {
      $defs: { base: { type: 'string' } },
      properties: { a: { $ref: '#/$defs/base' } },
    };
    expect(() => assertSchemaSupported(pointer)).not.toThrow();
  });

  /**
   * `resolveRef`'s LAST line, which asks whether the pointer landed on a
   * schema. A JSON `null` is the case that separates it from a bare
   * `typeof node !== 'object'`, because `typeof null` is already 'object'.
   * Reached through `validateAgainstSchema` with an explicit root rather than
   * through the whole-schema walk, because the walk refuses a null subschema
   * first and would answer in this guard's place.
   */
  it('refuses a $ref that resolves to something that is not a schema', () => {
    const root = { $defs: { base: null } } as unknown as JsonSchema;
    expect(() => validateAgainstSchema(1, { $ref: '#/$defs/base' }, root))
      .toThrow(UnsupportedSchemaError);
    expect(() => validateAgainstSchema(1, { $ref: '#/$defs/base' }, root))
      .toThrow(/\$ref "#\/\$defs\/base" does not resolve to a schema/);

    // ACCEPTING CONTROL: the same pointer shape onto a real subschema works.
    const good = { $defs: { base: { type: 'integer' } } } as unknown as JsonSchema;
    expect(validateAgainstSchema(1, { $ref: '#/$defs/base' }, good)).toEqual([]);
  });

  /**
   * A SUBSCHEMA THAT IS NOT AN OBJECT. JSON Schema allows `true` and `false` as
   * whole schemas and this evaluator implements neither; an ARRAY in a
   * subschema slot is the shape a hand-edited contract file produces. The array
   * case is the one that separates this guard from a plain typeof check.
   */
  it('refuses a boolean or array where a subschema belongs, naming where', () => {
    const boolSub = { properties: { a: true } } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(boolSub))
      .toThrow(/the subschema at \/properties\/a is not an object; boolean and array schemas are not implemented/);

    const arraySub = { properties: { a: [] } } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(arraySub))
      .toThrow(/the subschema at \/properties\/a is not an object/);
  });

  /**
   * THE WALK'S OWN COVERAGE, which is the thing the whole-schema check exists
   * to provide and the thing nothing measured. Its only row elsewhere is that
   * the committed schema passes, and a walk that silently skips a whole KIND of
   * subschema passes that row exactly as well as a correct one does: green on
   * green says nothing about what was visited.
   *
   * So each row buries a keyword the evaluator does not implement one level
   * down inside a different subschema kind, and asserts the walk finds it AT
   * THAT PATH. `patternProperties` is the probe because the file's own
   * unknown-keyword refusal names it back.
   */
  it('descends into a `not` subschema', () => {
    const buried = { not: { patternProperties: { '^x': { type: 'string' } } } } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(buried))
      .toThrow(/keyword "patternProperties" at \/not is not implemented/);
  });

  it('descends into every anyOf branch, not only oneOf', () => {
    const buried = {
      anyOf: [{ type: 'string' }, { patternProperties: { '^x': { type: 'string' } } }],
    } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(buried))
      .toThrow(/keyword "patternProperties" at \/anyOf\/1 is not implemented/);

    const inOneOf = {
      oneOf: [{ type: 'string' }, { patternProperties: { '^x': { type: 'string' } } }],
    } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(inOneOf))
      .toThrow(/keyword "patternProperties" at \/oneOf\/1 is not implemented/);
  });

  it('descends into $defs and into items', () => {
    const inDefs = { $defs: { d: { patternProperties: { '^x': {} } } } } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(inDefs))
      .toThrow(/keyword "patternProperties" at \/\$defs\/d is not implemented/);

    const inItems = { items: { patternProperties: { '^x': {} } } } as unknown as JsonSchema;
    expect(() => assertSchemaSupported(inItems))
      .toThrow(/keyword "patternProperties" at \/items is not implemented/);
  });

  /**
   * TWO HAND-MAINTAINED LISTS THAT MUST AGREE: the set of `type` names the
   * support gate accepts, and the set `matchesType` can answer. Neither is
   * exported and nothing compared them. The disagreement is silent in one
   * direction (a name accepted by the gate and unanswerable by the evaluator
   * turns a schema-support question into a throw from inside a value check) and
   * this row is what makes it loud.
   *
   * The population is JSON Schema's own type vocabulary, not a restatement of
   * either list, so this cannot agree with a wrong list by construction. It is
   * asserted NON-EMPTY first: an empty accepted set would make the loop below
   * vacuously true, which is the same shape of silent zero the rest of this
   * file is about.
   */
  it('accepts exactly the type names the evaluator can answer', () => {
    const SPEC_TYPE_NAMES = ['object', 'array', 'string', 'boolean', 'null', 'number', 'integer'];
    const accepted = SPEC_TYPE_NAMES.filter((t) => {
      try {
        assertSchemaSupported({ type: t });
        return true;
      } catch {
        return false;
      }
    });
    expect(accepted.length).toBe(SPEC_TYPE_NAMES.length);

    for (const t of accepted) {
      // `matchesType` is private; a value check is the road to it, and a name it
      // cannot answer throws rather than returning issues.
      expect(() => validateAgainstSchema(null, { type: t })).not.toThrow();
    }

    // ...and a name outside the vocabulary is refused rather than answered.
    expect(() => assertSchemaSupported({ type: 'date-time' }))
      .toThrow(/type "date-time" at <root> is not implemented/);
  });

  /**
   * `number` is implemented as FINITE, deliberately, and `integer` as a whole
   * number. Both are properties of the exported evaluator rather than of any
   * committed document, because JSON text cannot spell a non-finite number:
   * this is the in-memory road, where a value reaches validation from a
   * caller's object and not from a parse.
   */
  it('refuses a non-finite number under `type: number`', () => {
    expect(validateAgainstSchema(Number.NaN, { type: 'number' })).not.toEqual([]);
    expect(validateAgainstSchema(Number.POSITIVE_INFINITY, { type: 'number' })).not.toEqual([]);
    // ACCEPTING CONTROL: a finite number of the same type still passes.
    expect(validateAgainstSchema(1.5, { type: 'number' })).toEqual([]);
  });

  /**
   * `canonicalizeBySchema`'s branch-count refusal. Its docblock says callers
   * must validate first and its own words are that this function now exists for
   * its REFUSALS; the undeclared-key refusal is well covered by
   * test/formats/effects-preset-ramp.test.ts and
   * test/formats/effects-preset-base-swap.test.ts, and the branch count was
   * not. Both directions matter, because the two failures are opposite: no
   * branch means nothing describes this value, two means the caller cannot know
   * which annotations apply.
   */
  it('refuses to canonicalize against zero matching oneOf branches, or two', () => {
    const eitherOr: JsonSchema = { oneOf: [{ type: 'string' }, { type: 'number' }] };
    expect(() => canonicalizeBySchema(true, eitherOr))
      .toThrow(/matches 0 schema forms, expected exactly 1/);

    const overlapping: JsonSchema = { oneOf: [{ type: 'integer' }, { type: 'number' }] };
    expect(() => canonicalizeBySchema(1, overlapping))
      .toThrow(/matches 2 schema forms, expected exactly 1/);

    // ACCEPTING CONTROL: exactly one branch is the case it is built for.
    expect(canonicalizeBySchema('x', eitherOr)).toBe('x');
  });
});
