import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCommunicationIndex,
  parseCommunicationIndex,
} from '../src/features/setting-data/communicationIndex.ts';

test('formats communication indexes in decimal and padded hexadecimal', () => {
  assert.equal(formatCommunicationIndex(16, 'decimal', 4), '16');
  assert.equal(formatCommunicationIndex(16, 'hexadecimal', 4), '0x0010');
  assert.equal(formatCommunicationIndex(undefined, 'hexadecimal', 2), '');
});

test('parses communication indexes according to the selected radix', () => {
  assert.equal(parseCommunicationIndex('16', 'decimal'), 16);
  assert.equal(parseCommunicationIndex('0x10', 'hexadecimal'), 16);
  assert.equal(parseCommunicationIndex('10', 'hexadecimal'), 16);
  assert.equal(parseCommunicationIndex('0x10', 'decimal'), null);
  assert.equal(parseCommunicationIndex('GG', 'hexadecimal'), null);
  assert.equal(parseCommunicationIndex('-1', 'decimal'), null);
});
