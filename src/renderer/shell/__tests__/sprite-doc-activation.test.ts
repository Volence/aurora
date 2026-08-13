import { describe, it, expect } from 'vitest';
import { planSpriteDocActivation } from '../tab-activation';

describe('planSpriteDocActivation', () => {
  it('no-op when the doc is already loaded', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:aeon:motobug', loadedDocId: 'doc:sprite:aeon:motobug', spriteDirty: true }))
      .toEqual({ kind: 'none' });
  });
  it('opens directly when the editor is clean', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:aeon:motobug', loadedDocId: null, spriteDirty: false }))
      .toEqual({ kind: 'open', engine: 'aeon', ref: 'motobug' });
  });
  it('asks first when retargeting would discard sprite edits', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:s1:42', loadedDocId: 'doc:sprite:aeon:motobug', spriteDirty: true }))
      .toEqual({ kind: 'confirm', engine: 's1', ref: '42' });
  });
  it('rejects malformed ids', () => {
    expect(planSpriteDocActivation({ tabId: 'doc:sprite:junk', loadedDocId: null, spriteDirty: false }))
      .toEqual({ kind: 'none' });
  });
});
