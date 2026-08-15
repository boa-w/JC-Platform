import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const fullBusinessRoot =
  process.env.JC002_MIGRATION_BUSINESS_ROOT ??
  String.raw`C:\Users\JCSH\Desktop\project\zc\D70T\project\ZC-202620046 D70T-2-Pro仪表配太重inmotion俄语车型\TZ_70T_i18n_next`;
const fullFirmwareRoot =
  process.env.JC002_MIGRATION_FIRMWARE_ROOT ??
  String.raw`C:\Users\JCSH\Desktop\project\zc\D70T\SOC_software\luban-lite-masterD21-rev\packages\artinchip\lvgl-ui\aic_demo\meter_6_test`;
const fullProjectPath = path.join(fullBusinessRoot, 'liugong_70T_Inmotion6.generated.jcpro');
const fullFirmwareHeaderPath = path.join(fullFirmwareRoot, 'jclib_ui.h');
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

async function isFile(pathname: string) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

const fullFixtureAvailable =
  (await isFile(fullProjectPath)) && (await isFile(fullFirmwareHeaderPath));

test('migrates the full Inmotion6 project without positional UI-key drift', {
  skip: fullFixtureAvailable ? false : 'full Inmotion6 fixture is not available in this checkout',
}, async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-migration-'));
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  await exec(process.execPath, [
    'scripts/migrate-jc001-i18n-v2.mjs',
    fullProjectPath,
    projectOutput,
    fullFirmwareHeaderPath,
    keysOutput,
  ]);

  const project = JSON.parse(await readFile(projectOutput, 'utf8'));
  const zh = project.localization.locales.zh.translations;
  assert.equal(project.config_version, 'jc002');
  assert.equal(project.language_info, undefined);
  assert.equal(project.localization.locale_order.length, 10);
  assert.equal(zh['ui.ultrasonic.alarm.select'], '超声波雷达报警音选择');
  assert.equal(zh['ui.overspeed.alarm.set'], '超速报警值设置');
  assert.equal(zh['ui.after.sales.service'], '售后服务');
  assert.equal(zh['ui.sim.card.info'], 'SIM卡信息');
  assert.equal(project.fault_code_info.schema_version, 2);
  assert.equal(project.fault_code_info.codes, undefined);
  assert.equal(project.fault_code_info.definitions.length, 288);
  assert.equal(project.fault_code_info.bindings.length, 288);
  assert.equal(
    new Set(
      project.fault_code_info.definitions.map((item: { message_key: string }) => item.message_key),
    ).size,
    127,
  );
  const pump52 = project.fault_code_info.bindings.find(
    (item: { source_key: string; code: number }) => item.source_key === 'pump' && item.code === 52,
  );
  const pump52Definition = project.fault_code_info.definitions.find(
    (item: { fault_key: string }) => item.fault_key === pump52.fault_key,
  );
  assert.equal(pump52Definition.fault_key, 'fault.pump.052');
  assert.equal(pump52Definition.message_key, 'fault.traction.052');
});

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
  assert.equal(project.fault_code_info.definitions.length, 2);
  assert.equal(
    new Set(
      project.fault_code_info.definitions.map((item: { message_key: string }) => item.message_key),
    ).size,
    1,
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
