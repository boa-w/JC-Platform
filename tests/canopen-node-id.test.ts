import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatNodeId,
  formatNodeIds,
  parseNodeId,
  parseNodeIds,
} from '../src/features/canopen-export/nodeIdDisplay.ts';

test('formats Node-ID values without changing their numeric meaning', () => {
  assert.equal(formatNodeId(8, 'decimal'), '8');
  assert.equal(formatNodeId(8, 'hexadecimal'), '0x08');
  assert.equal(formatNodeId(127, 'hexadecimal'), '0x7F');
  assert.equal(formatNodeIds([1, 8, 64], 'hexadecimal'), '0x01, 0x08, 0x40');
});

test('parses Node-ID values according to the selected display base', () => {
  assert.equal(parseNodeId('8', 'decimal'), 8);
  assert.equal(parseNodeId('0x08', 'decimal'), 8);
  assert.equal(parseNodeId('08', 'hexadecimal'), 8);
  assert.equal(parseNodeId('0x7F', 'hexadecimal'), 127);
  assert.equal(parseNodeId('0x80', 'hexadecimal'), undefined);
  assert.equal(parseNodeId('128', 'decimal'), undefined);
  assert.equal(parseNodeId('not-a-node', 'decimal'), undefined);
  assert.deepEqual(parseNodeIds('0x01, 0x08 0x08', 'hexadecimal'), [1, 8]);
});
