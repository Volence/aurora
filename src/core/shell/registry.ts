// Generic id-keyed registry — the house registration pattern (register /
// throw-on-duplicate / clear-for-tests) extracted from the project-adapter
// registry so facets, explorer groups, and tool tabs share one mechanism.
// Registration is controlled startup code: a duplicate id is always a bug,
// never a runtime condition to tolerate.

export interface RegistryItem {
  readonly id: string;
}

export interface Registry<T extends RegistryItem> {
  register(item: T): void;
  get(id: string): T | undefined;
  /** Items in registration order. Returns a copy. */
  list(): readonly T[];
  /** Test support: reset so tests don't leak into each other. */
  clear(): void;
}

export function createRegistry<T extends RegistryItem>(kind: string): Registry<T> {
  const items: T[] = [];
  return {
    register(item) {
      if (items.some((x) => x.id === item.id)) {
        throw new Error(`${kind} '${item.id}' is already registered`);
      }
      items.push(item);
    },
    get: (id) => items.find((x) => x.id === id),
    list: () => items.slice(),
    clear() {
      items.length = 0;
    },
  };
}
