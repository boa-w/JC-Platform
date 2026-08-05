import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUpdaterError } from '../src/lib/updaterError.ts';

test('turns updater failures into actionable user messages', () => {
  assert.equal(
    normalizeUpdaterError('request failed with status code 404 for latest.json'),
    'updater.errors.noRelease',
  );
  assert.equal(
    normalizeUpdaterError(new Error('network request timed out')),
    'updater.errors.network',
  );
  assert.equal(
    normalizeUpdaterError('invalid public key'),
    'updater.errors.invalidSignature',
  );
  assert.equal(normalizeUpdaterError('server returned 503'), 'server returned 503');
});
