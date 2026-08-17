import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const portableProjectPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'jc002-migration-source.jcpro',
);
const portableFirmwareHeaderPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'jc002-migration-jclib_ui.h',
);

test('migrates an Inmotion6-style fixture without positional UI-key drift', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-portable-migration-'));
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  await exec(process.execPath, [
    'scripts/migrate-jc001-i18n-v2.mjs',
    portableProjectPath,
    projectOutput,
    portableFirmwareHeaderPath,
    keysOutput,
  ]);

  const project = JSON.parse(await readFile(projectOutput, 'utf8'));
  const zh = project.localization.locales.zh.translations;
  const generatedKeys = await readFile(keysOutput, 'utf8');
  assert.equal(project.config_version, 'jc002');
  assert.equal(project.language_info, undefined);
  assert.deepEqual(project.localization.locale_order, ['zh', 'en']);
  assert.equal(zh['ui.speed'], '车速');
  assert.equal(zh['ui.brake'], '制动状态');
  assert.equal(project.sdo_info.children[0].message_key, 'sdo.parameter.menu.speed');
  assert.match(generatedKeys, /"ui\.speed",\n {4}"ui\.brake",/);
  assert.equal(project.fault_code_info, undefined);
});

test('rejects the removed jc001 fault-code MVP instead of converting it', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-fault-mvp-'));
  const sourcePath = path.join(outputRoot, 'source.jcpro');
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  const source = JSON.parse(await readFile(portableProjectPath, 'utf8'));
  source.fault_code_info = {
    schema_version: 1,
    version: 1,
    sources: [],
    codes: [],
  };
  await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');

  await assert.rejects(
    exec(process.execPath, [
      'scripts/migrate-jc001-i18n-v2.mjs',
      sourcePath,
      projectOutput,
      portableFirmwareHeaderPath,
      keysOutput,
    ]),
    /故障码 MVP 不参与迁移/,
  );
});

test('rejects an embedded battery protocol with a non-v2 contract', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-battery-migration-'));
  const sourcePath = path.join(outputRoot, 'source.jcpro');
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  const source = JSON.parse(await readFile(portableProjectPath, 'utf8'));
  source.battery_monitor = {
    schema_version: 1,
    enabled: false,
    version: 1,
    default_timeout_ticks: 200,
    page_size: 4,
    frames: [],
    signals: [],
    items: [],
  };
  await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');

  await assert.rejects(
    exec(process.execPath, [
      'scripts/migrate-jc001-i18n-v2.mjs',
      sourcePath,
      projectOutput,
      portableFirmwareHeaderPath,
      keysOutput,
    ]),
    /must already use schema_version=2 and version=2/,
  );
});
