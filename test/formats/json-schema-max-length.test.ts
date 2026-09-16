import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_KEYWORDS,
  assertSchemaSupported,
  validateAgainstSchema,
  canonicalizeBySchema,
  type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';
import { REGIONS_SCHEMA } from '../../src/core/formats/regions/document';
import { EFFECTS_SCENE_SCHEMA } from '../../src/core/formats/effects/scene';
import { EFFECTS_PRESET_SCHEMA } from '../../src/core/formats/effects/preset';

/**
 * `maxLength`, the ONE keyword the regions schema needed that
 * json-schema-subset.ts did not implement.
 *
 * MEASURED, NOT GUESSED. `collectSchemaKeywords` was run over the vendored
 * regions bytes before a line of the codec was written, and the answer
 * disagreed with the candidate list that arrived with the work: `const`,
 * `$ref` with `$defs`, `unevaluatedProperties`, `pattern`, `minItems`, the
 * union type [string, null] and `minimum` were every one of them already
 * implemented. `maxLength` at /$defs/region/properties/name was the only gap,
 * and the keyword-coverage row in test/formats/regions-schema-drift.test.ts is
 * what would have named it.
 *
 * WHY IT IS THE FIRST ONE. Every string bound in a committed contract schema
 * before this was an IDENTIFIER matched by a `pattern`, and a pattern carries
 * its own length inside its `{0,31}` repetition count. `name` is FREE AUTHOR
 * PROSE, a label nobody parses, so there is no pattern to hang a count on and
 * the length becomes its own keyword.
 *
 * ONE PROPERTY PER ROW. A first failure hides the rest, and the bound, the
 * boundary, the unit and the non-interference are four separate claims.
 */
describe('json-schema-subset: maxLength', () => {
  const schema: JsonSchema = { type: 'string', maxLength: 3 };

  it('is a keyword the evaluator declares, so a schema carrying it is not refused', () => {
    expect(SUPPORTED_KEYWORDS.has('maxLength')).toBe(true);
    expect(() => assertSchemaSupported(schema)).not.toThrow();
  });

  it('accepts a string shorter than the bound', () => {
    expect(validateAgainstSchema('ab', schema)).toEqual([]);
  });

  it('accepts a string EXACTLY at the bound, because the keyword is inclusive', () => {
    expect(validateAgainstSchema('abc', schema)).toEqual([]);
  });

  it('refuses a string one over the bound, and the message carries both numbers', () => {
    const issues = validateAgainstSchema('abcd', schema);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('');
    expect(issues[0].message).toContain('4');
    expect(issues[0].message).toContain('3');
  });

  /**
   * ⚠ THE UNIT IS CODE POINTS, NOT UTF-16 CODE UNITS, and this row is the whole
   * reason the implementation is three lines instead of one.
   *
   * JSON Schema 2020-12 defines a string instance's length as its number of
   * characters per RFC 8259, which is code points. JavaScript's
   * `String.prototype.length` counts UTF-16 code units, so every astral
   * character counts TWICE there. On a key whose entire purpose is a
   * human-typed label, that is not a theoretical difference: `.length` would
   * refuse a three-emoji name the contract accepts, and Aurora would be
   * speaking a refusal in the contract's name that the contract never made.
   *
   * The string below is three astral characters: six UTF-16 units, three code
   * points. It must be ACCEPTED at maxLength 3.
   */
  it('counts CODE POINTS, so three astral characters fit a bound of 3', () => {
    const three = '\u{1F600}\u{1F601}\u{1F602}';
    // The control on the fixture itself: this is only a test of the unit if the
    // two counts really disagree.
    expect(three.length, 'the fixture is not astral, so this row proves nothing').toBe(6);
    expect(Array.from(three).length).toBe(3);
    expect(validateAgainstSchema(three, schema)).toEqual([]);
  });

  it('refuses four astral characters at a bound of 3, so the code-point count still bounds', () => {
    const four = '\u{1F600}\u{1F601}\u{1F602}\u{1F603}';
    expect(validateAgainstSchema(four, schema)).not.toEqual([]);
  });

  it('says nothing about a non-string, the way pattern and minimum do not', () => {
    // The keyword is a STRING assertion. A number reaching a node that carries
    // it is a `type` question, not a length one.
    expect(validateAgainstSchema(12345, { maxLength: 3 } as JsonSchema)).toEqual([]);
  });

  /**
   * It sits beside `unevaluatedProperties` without disabling it. The evaluator
   * implements `unevaluatedProperties` as `additionalProperties` and refuses to
   * validate whenever it cannot PROVE the neighbouring keywords contribute no
   * property annotations. `maxLength` provably cannot: it asserts a property of
   * a string, and a string has no properties to name as evaluated. Asserted
   * rather than reasoned about, because the refusal is silent in the other
   * direction: a keyword left off the whitelist makes the whole schema
   * unvalidatable.
   */
  it('does not make a closed object unvalidatable when it sits inside one', () => {
    const closed: JsonSchema = {
      type: 'object',
      properties: { label: { type: 'string', maxLength: 3 } },
      unevaluatedProperties: false,
    };
    expect(() => assertSchemaSupported(closed)).not.toThrow();
    expect(validateAgainstSchema({ label: 'ab' }, closed)).toEqual([]);
    expect(validateAgainstSchema({ label: 'abcd' }, closed)).not.toEqual([]);
    expect(validateAgainstSchema({ label: 'ab', other: 1 }, closed)).not.toEqual([]);
  });

  it('does not disturb canonicalizeBySchema, which still refuses an undeclared key', () => {
    const closed: JsonSchema = {
      type: 'object',
      properties: { label: { type: 'string', maxLength: 3 } },
      unevaluatedProperties: false,
    };
    expect(canonicalizeBySchema({ label: 'ab' }, closed)).toEqual({ label: 'ab' });
    expect(() => canonicalizeBySchema({ label: 'ab', other: 1 }, closed))
      .toThrow(/refusing to drop "other"/);
  });
});

/**
 * THE CONTROL ON THE CHANGE ITSELF. `maxLength` was added to a shared module
 * that two other committed contract schemas run through, and the standing rule
 * for those is that they keep validating EXACTLY as they did. Their own suites
 * are the real control; these two rows are the cheap direct statement of it, so
 * a reader of this file does not have to take the claim on trust.
 */
describe('json-schema-subset: the scene and preset schemas are undisturbed', () => {
  it('neither of the other committed schemas uses maxLength, so nothing of theirs moved', () => {
    const uses = (node: unknown): boolean => {
      if (Array.isArray(node)) return node.some(uses);
      if (typeof node !== 'object' || node === null) return false;
      const obj = node as Record<string, unknown>;
      if ('maxLength' in obj) return true;
      return Object.values(obj).some(uses);
    };
    expect(uses(EFFECTS_SCENE_SCHEMA)).toBe(false);
    expect(uses(EFFECTS_PRESET_SCHEMA)).toBe(false);
    // ...and the regions schema does, so the sweep above is a real search.
    expect(uses(REGIONS_SCHEMA)).toBe(true);
  });

  it('all three committed schemas still pass the per-node support check', () => {
    expect(() => assertSchemaSupported(EFFECTS_SCENE_SCHEMA)).not.toThrow();
    expect(() => assertSchemaSupported(EFFECTS_PRESET_SCHEMA)).not.toThrow();
    expect(() => assertSchemaSupported(REGIONS_SCHEMA)).not.toThrow();
  });
});
