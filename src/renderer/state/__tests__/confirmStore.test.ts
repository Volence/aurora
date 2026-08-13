import { describe, it, expect, beforeEach } from 'vitest';
import { useConfirmStore } from '../confirmStore';

describe('confirmStore', () => {
  beforeEach(() => useConfirmStore.getState().answer('cancel'));

  it('ask exposes the request and resolves with the answered key', async () => {
    const p = useConfirmStore.getState().ask({
      title: 'Unsaved changes',
      buttons: [{ key: 'save', label: 'Save & switch' }, { key: 'cancel', label: 'Cancel' }],
    });
    expect(useConfirmStore.getState().request?.title).toBe('Unsaved changes');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe('save');
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('a second ask cancels the first', async () => {
    const first = useConfirmStore.getState().ask({ title: 'a', buttons: [{ key: 'x', label: 'X' }] });
    const second = useConfirmStore.getState().ask({ title: 'b', buttons: [{ key: 'y', label: 'Y' }] });
    await expect(first).resolves.toBe('cancel');
    useConfirmStore.getState().answer('y');
    await expect(second).resolves.toBe('y');
  });

  it('answer with no pending request is a no-op', () => {
    expect(() => useConfirmStore.getState().answer('whatever')).not.toThrow();
  });
});
