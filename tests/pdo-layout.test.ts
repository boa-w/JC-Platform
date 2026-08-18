import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePdoSignalFields,
  pdoSignalLayout,
} from '../src/features/realtime-data/pdoLayout.ts';

test('presents byte and bit PDO positions in the user-facing form', () => {
  assert.deepEqual(pdoSignalLayout({ show_type: 1, pos: 0, len: 2 }), {
    mode: 1,
    positionUnit: 'byte',
    position: 0,
    bit: 0,
    lengthUnit: 'bits',
    length: 2,
  });
  assert.deepEqual(pdoSignalLayout({ show_type: 0, pos: 8, len: 8 }), {
    mode: 0,
    positionUnit: 'byte',
    position: 1,
    bit: null,
    lengthUnit: 'bytes',
    length: 1,
  });
  assert.deepEqual(pdoSignalLayout({ show_type: 2, pos: 4, len: 1 }), {
    mode: 2,
    positionUnit: 'bit',
    position: 4,
    bit: null,
    lengthUnit: 'bits',
    length: 1,
  });
});

test('keeps byte mode aligned and prevents a signal from exceeding one CAN frame', () => {
  assert.deepEqual(normalizePdoSignalFields(0, 11, 17), {
    show_type: 0,
    pos: 8,
    len: 24,
  });
  assert.deepEqual(normalizePdoSignalFields(1, 63, 8), {
    show_type: 1,
    pos: 63,
    len: 1,
  });
});
