import assert from 'node:assert/strict';
import test from 'node:test';
import { featureModules } from '../src/data/modules.ts';
import {
  filterVisibleModules,
  NAVIGATION_VISIBILITY_STORAGE_KEY,
  parseHiddenModules,
  persistHiddenModules,
  resolveNavigationKey,
} from '../src/stores/moduleVisibility.ts';
import type { StorageLike } from '../src/utils/safeStorage.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
  return { storage, values };
}

test('parses an empty or missing visibility payload as nothing hidden', () => {
  assert.equal(parseHiddenModules(null).size, 0);
  assert.equal(parseHiddenModules('').size, 0);
});

test('ignores corrupted, unknown and always-visible keys while parsing', () => {
  assert.equal(parseHiddenModules('not-json').size, 0);
  assert.deepEqual([...parseHiddenModules('{"hidden": ["export"]}')] ?? [], []);
  assert.deepEqual(
    [...parseHiddenModules(JSON.stringify(['project', 'unknown-key', 7, 'export']))].sort(),
    ['export'],
  );
});

test('persists a sorted hidden list and clears the storage entry when all pages are shown', () => {
  const { storage, values } = memoryStorage();
  persistHiddenModules(new Set(['export', 'language']), storage);
  assert.equal(
    values.get(NAVIGATION_VISIBILITY_STORAGE_KEY),
    JSON.stringify(['export', 'language']),
  );

  persistHiddenModules(new Set(), storage);
  assert.equal(values.has(NAVIGATION_VISIBILITY_STORAGE_KEY), false);
});

test('filterVisibleModules hides only the selected feature pages', () => {
  const visible = filterVisibleModules(featureModules, new Set(['export']));
  assert.ok(visible.every((module) => module.key !== 'export'));
  assert.equal(visible.length, featureModules.length - 1);
});

test('resolveNavigationKey keeps visible targets and falls back to the first visible page', () => {
  const hidden = new Set(['export']);
  assert.equal(resolveNavigationKey('export', hidden), 'project');
  assert.equal(resolveNavigationKey('realtime-data', hidden), 'realtime-data');
});

test('the project entry page can never be hidden', () => {
  const hidden = parseHiddenModules(JSON.stringify(['project']));
  assert.equal(hidden.has('project'), false);
  assert.equal(resolveNavigationKey('project', hidden), 'project');
});
