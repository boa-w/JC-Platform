import assert from 'node:assert/strict';
import test from 'node:test';
import { lineDiffChanges } from '../src/components/git/lineDiff.ts';

test('keeps a localized edit localized in a large JSON document', () => {
  const entries = Array.from({ length: 2_000 }, (_, index) => `  "key_${index}": ${index}`);
  const original = `{
${entries.join(',\n')}
}\n`;
  const current = original.replace('  "key_1000": 1000', '  "key_1000": 2000');

  const changes = lineDiffChanges(original, current);

  assert.equal(changes.length, 1);
  assert.equal(original.slice(changes[0].fromA, changes[0].toA), '  "key_1000": 1000,\n');
  assert.equal(current.slice(changes[0].fromB, changes[0].toB), '  "key_1000": 2000,\n');
  assert.ok(changes[0].toA - changes[0].fromA < 32);
});

test('groups adjacent deleted and inserted lines into one replacement', () => {
  const original = 'first\nold one\nold two\nlast\n';
  const current = 'first\nnew one\nlast\n';

  const changes = lineDiffChanges(original, current);

  assert.equal(changes.length, 1);
  assert.equal(original.slice(changes[0].fromA, changes[0].toA), 'old one\nold two\n');
  assert.equal(current.slice(changes[0].fromB, changes[0].toB), 'new one\n');
});
