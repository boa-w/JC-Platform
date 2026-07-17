import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUpdaterError } from '../src/lib/updaterError.ts';

test('turns updater failures into actionable user messages', () => {
  assert.equal(
    normalizeUpdaterError('request failed with status code 404 for latest.json'),
    '当前更新通道尚未发布可用版本。',
  );
  assert.equal(
    normalizeUpdaterError(new Error('network request timed out')),
    '无法连接更新服务，请检查网络后重试。',
  );
  assert.equal(
    normalizeUpdaterError('invalid public key'),
    '更新签名配置无效，请联系软件维护人员。',
  );
  assert.equal(normalizeUpdaterError('server returned 503'), 'server returned 503');
});
