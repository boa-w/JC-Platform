import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps jc001 and jc002 documentation contracts separate', async () => {
  const [boundary, v1Data, v1Export, v2Data, v2Export, firmware] = await Promise.all([
    read('docs/configuration-versions.md'),
    read('docs/data-format.md'),
    read('docs/export-build.md'),
    read('docs/data-format-v2.md'),
    read('docs/export-build-v2.md'),
    read('docs/firmware-i18n-v2.md'),
  ]);

  assert.match(boundary, /jc001.*jc002/s);
  assert.match(boundary, /v1[\s\S]*sidecar[\s\S]*废弃/);
  assert.match(v1Data, /只定义 `config_version: "jc001"`/);
  assert.match(v1Data, /sidecar[\s\S]*废弃/);
  assert.match(v1Export, /只定义 `config_version: "jc001"`/);
  assert.match(v2Data, /禁止字段[\s\S]*```text[\s\S]*language_info/);
  assert.match(v2Export, /v2 禁止字段[\s\S]*language_addr[\s\S]*language_code/);
  assert.match(v2Export, /i18n_version/);
  assert.match(v2Export, /sdo_version/);
  assert.match(firmware, /不调用 v1 语言表作为替代/);
  assert.match(firmware, /当前未完成项/);
});
