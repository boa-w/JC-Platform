import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type CollectionSnapshot,
  reconcileCollectionKeys,
} from '../src/hooks/useStableCollectionKeys.ts';

function createKeyFactory() {
  let next = 0;
  return () => `key-${next++}`;
}

test('preserves row identity across edits, deletion, insertion, and reordering', () => {
  const createKey = createKeyFactory();
  const first = { value: 'first' };
  const second = { value: 'second' };
  const third = { value: 'third' };
  let snapshot: CollectionSnapshot<{ value: string }> | undefined;

  snapshot = reconcileCollectionKeys(snapshot, [first, second, third], createKey);
  assert.deepEqual(snapshot.keys, ['key-0', 'key-1', 'key-2']);

  const editedSecond = { value: 'edited' };
  snapshot = reconcileCollectionKeys(snapshot, [first, editedSecond, third], createKey);
  assert.deepEqual(snapshot.keys, ['key-0', 'key-1', 'key-2']);

  snapshot = reconcileCollectionKeys(snapshot, [editedSecond, third], createKey);
  assert.deepEqual(snapshot.keys, ['key-1', 'key-2']);

  const inserted = { value: 'inserted' };
  snapshot = reconcileCollectionKeys(snapshot, [inserted, editedSecond, third], createKey);
  assert.deepEqual(snapshot.keys, ['key-3', 'key-1', 'key-2']);

  snapshot = reconcileCollectionKeys(snapshot, [third, inserted, editedSecond], createKey);
  assert.deepEqual(snapshot.keys, ['key-2', 'key-3', 'key-1']);
});
