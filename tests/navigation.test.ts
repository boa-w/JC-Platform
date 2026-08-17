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

test('marks the legacy signal dictionary as deprecated', () => {
  const signalDictionary = featureModules.find((module) => module.key === 'signal-dictionary');

  assert.equal(signalDictionary?.lifecycle, 'deprecated');
  assert.equal(
    signalDictionary?.lifecycleReasonKey,
    'navigation.modules.signalDictionary.lifecycleReason',
  );
});

test('places fault-code management under the data workspace', () => {
  const dataGroup = navGroups.find((group) => group.id === 'data');
  const configurationGroup = navGroups.find((group) => group.id === 'configuration');

  assert.ok(dataGroup?.keys.includes('fault-code'));
  assert.equal(configurationGroup?.keys.includes('fault-code'), false);
});
