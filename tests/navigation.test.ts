import assert from 'node:assert/strict';
import test from 'node:test';
import { featureModules } from '../src/data/modules.ts';
import { navGroups } from '../src/data/navigation.ts';

test('keeps navigation groups and feature modules one-to-one', () => {
  const groupedKeys = navGroups.flatMap((group) => group.keys);
  const groupedKeySet = new Set(groupedKeys);
  const moduleKeys = featureModules.map((module) => module.key);

  assert.equal(groupedKeys.length, groupedKeySet.size, 'navigation contains duplicate keys');
  assert.deepEqual(
    [...groupedKeySet].sort(),
    [...moduleKeys].sort(),
    'every feature module must be reachable from exactly one navigation group',
  );
});
