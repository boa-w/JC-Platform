import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface AbiDocument {
  abi_version: string;
  unbound_id: number;
  variables: Array<{ id: number; code: string; label: string }>;
}

const abi = JSON.parse(
  readFileSync(new URL('../src/data/common-can-pdo-inner-abi.json', import.meta.url), 'utf8'),
) as AbiDocument;

test('keeps CommonCanPdo inner ABI ids stable and contiguous', () => {
  assert.equal(abi.abi_version, 'common-can-pdo-v1');
  assert.equal(abi.unbound_id, -1);
  assert.deepEqual(
    abi.variables.map((item) => item.id),
    Array.from({ length: 17 }, (_, index) => index),
  );
  assert.deepEqual(
    abi.variables.map((item) => item.code),
    [
      'SPEED',
      'SOC',
      'HOUR',
      'ERR',
      'HANDBRAKE',
      'SEAT_SWITCH',
      'STEER_ANGLE',
      'SPE_MODE',
      'SPE_MODE_SET',
      'LOCK_CAR',
      'SEAT_BELT_SWITCH',
      'TURN_LEFT',
      'TURN_RIGHT',
      'LIFTING_LOCK',
      'GEAR',
      'LIMIT_SPEED',
      'REMOTE_MANAGE',
    ],
  );
  assert.equal(new Set(abi.variables.map((item) => item.code)).size, abi.variables.length);
  assert.ok(abi.variables.every((item) => item.label.trim().length > 0));
});
