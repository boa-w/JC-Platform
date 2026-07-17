import { useId, useRef } from 'react';

export interface CollectionSnapshot<T extends object> {
  items: readonly T[];
  keys: string[];
}

export function reconcileCollectionKeys<T extends object>(
  previous: CollectionSnapshot<T> | undefined,
  items: readonly T[],
  createKey: () => string,
): CollectionSnapshot<T> {
  if (!previous) return { items, keys: items.map(createKey) };

  const keys = new Array<string>(items.length);
  const usedPreviousIndexes = new Set<number>();
  const previousIndexesByItem = new Map<T, { indexes: number[]; cursor: number }>();

  previous.items.forEach((item, index) => {
    const entry = previousIndexesByItem.get(item);
    if (entry) entry.indexes.push(index);
    else previousIndexesByItem.set(item, { indexes: [index], cursor: 0 });
  });

  // Preserve keys across insertion, deletion, and reordering when object identity survives.
  items.forEach((item, nextIndex) => {
    const entry = previousIndexesByItem.get(item);
    const previousIndex = entry?.indexes[entry.cursor];
    if (entry && previousIndex !== undefined) {
      entry.cursor += 1;
      keys[nextIndex] = previous.keys[previousIndex];
      usedPreviousIndexes.add(previousIndex);
    }
  });

  // Immutable field edits replace one object at the same position; keep that row mounted.
  items.forEach((_, nextIndex) => {
    if (keys[nextIndex]) return;
    if (nextIndex < previous.keys.length && !usedPreviousIndexes.has(nextIndex)) {
      keys[nextIndex] = previous.keys[nextIndex];
      usedPreviousIndexes.add(nextIndex);
    } else {
      keys[nextIndex] = createKey();
    }
  });

  return { items, keys };
}

/** Keeps editable list rows mounted without leaking UI-only ids into project data. */
export function useStableCollectionKeys() {
  const prefix = useId();
  const nextKey = useRef(0);
  const snapshots = useRef(new Map<string, CollectionSnapshot<object>>());

  return <T extends object>(collection: string, items: readonly T[]): string[] => {
    const previous = snapshots.current.get(collection) as CollectionSnapshot<T> | undefined;
    const next = reconcileCollectionKeys(previous, items, () => `${prefix}-${nextKey.current++}`);
    snapshots.current.set(collection, next);
    return next.keys;
  };
}
