import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStorageItem,
  removeStorageItem,
  type StorageLike,
  setStorageItem,
} from '../src/utils/safeStorage.ts';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('reads, writes, and removes preference values', () => {
  const storage = memoryStorage();
  assert.equal(setStorageItem('theme', 'dark', storage), true);
  assert.equal(getStorageItem('theme', storage), 'dark');
  assert.equal(removeStorageItem('theme', storage), true);
  assert.equal(getStorageItem('theme', storage), null);
});

test('degrades safely when browser storage throws', () => {
  const unavailableStorage: StorageLike = {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
    removeItem: () => {
      throw new Error('storage unavailable');
    },
  };

  assert.equal(getStorageItem('theme', unavailableStorage), null);
  assert.equal(setStorageItem('theme', 'dark', unavailableStorage), false);
  assert.equal(removeStorageItem('theme', unavailableStorage), false);
});
