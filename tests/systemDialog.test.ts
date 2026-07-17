import assert from 'node:assert/strict';
import test from 'node:test';
import { runSystemDialog } from '../src/utils/systemDialog.ts';

test('returns the dialog result without reporting an error', async () => {
  const errors: string[] = [];
  const result = await runSystemDialog(
    async () => 'selected.jcpro',
    (message) => errors.push(message),
  );

  assert.equal(result, 'selected.jcpro');
  assert.deepEqual(errors, []);
});

test('turns dialog failures into a visible status message', async () => {
  const errors: string[] = [];
  const result = await runSystemDialog(
    async () => {
      throw new Error('系统文件选择器不可用');
    },
    (message) => errors.push(message),
  );

  assert.equal(result, null);
  assert.deepEqual(errors, ['系统文件选择器不可用']);
});

test('reports non-Error rejection values', async () => {
  let error = '';
  const result = await runSystemDialog(
    async () => {
      throw 'dialog rejected';
    },
    (message) => {
      error = message;
    },
  );

  assert.equal(result, null);
  assert.equal(error, 'dialog rejected');
});
