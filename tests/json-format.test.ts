import assert from 'node:assert/strict';
import test from 'node:test';
import { formatJsonText } from '../src/utils/jsonFormat.ts';

test('formats JSON with two-space indentation and a trailing newline', () => {
  assert.equal(formatJsonText('{"name":"demo","items":[1,2]}'), '{\n  "name": "demo",\n  "items": [\n    1,\n    2\n  ]\n}\n');
});

test('formats JSON after removing a UTF-8 BOM', () => {
  assert.equal(formatJsonText('\uFEFF{"enabled":true}'), '{\n  "enabled": true\n}\n');
});

test('rejects invalid JSON', () => {
  assert.throws(() => formatJsonText('{invalid'), SyntaxError);
});
