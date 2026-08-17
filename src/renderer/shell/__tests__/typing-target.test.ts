import { describe, it, expect } from 'vitest';
import { isTypingTarget } from '../typing-target';

/**
 * VIS2. Six window-level key handlers each carried their own "is the user
 * typing" test and they did not agree — the map viewport's forgot the input
 * TYPE filter, so a focused range slider counted as typing and swallowed every
 * map key while it had focus; the aeon composer's was `tagName === 'INPUT'`
 * alone, so a textarea lost its Escape. One rule now, and these are the cases
 * the copies disagreed about.
 */
const el = (tag: string, props: Record<string, unknown> = {}) =>
  ({ tagName: tag, isContentEditable: false, ...props }) as unknown as EventTarget;

describe('isTypingTarget', () => {
  it.each([
    ['a text input', el('INPUT', { type: 'text' })],
    ['an input with no type at all', el('INPUT', { type: '' })],
    ['a search input', el('INPUT', { type: 'search' })],
    ['a number input', el('INPUT', { type: 'number' })],
    ['a textarea', el('TEXTAREA')],
    ['a contenteditable div', el('DIV', { isContentEditable: true })],
  ])('claims %s', (_l, target) => expect(isTypingTarget(target)).toBe(true));

  it.each([
    ['a range slider — the palette drag case', el('INPUT', { type: 'range' })],
    ['a checkbox', el('INPUT', { type: 'checkbox' })],
    ['a radio', el('INPUT', { type: 'radio' })],
    ['a button-typed input', el('INPUT', { type: 'button' })],
    ['a colour input', el('INPUT', { type: 'color' })],
    ['a plain button', el('BUTTON')],
    ['a canvas', el('CANVAS')],
    ['the body', el('BODY')],
  ])('does not claim %s', (_l, target) => expect(isTypingTarget(target)).toBe(false));

  it('survives a target that is not an element at all', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
    // A non-element EventTarget — what a window/document target looks like to
    // this predicate. (`window` itself is not defined in the node suite.)
    expect(isTypingTarget({ addEventListener() {} } as unknown as EventTarget)).toBe(false);
  });
});
