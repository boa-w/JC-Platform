import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const businessRoot = String.raw`C:\Users\JCSH\Desktop\project\zc\D70T\project\ZC-202620046 D70T-2-Pro仪表配太重inmotion俄语车型\TZ_70T_i18n_next`;
const firmwareRoot = String.raw`C:\Users\JCSH\Desktop\project\zc\D70T\SOC_software\luban-lite-masterD21-rev\packages\artinchip\lvgl-ui\aic_demo\meter_6_test`;

test('migrates the full Inmotion6 project without positional UI-key drift', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-migration-'));
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  await exec(process.execPath, [
    'scripts/migrate-jc001-i18n-v2.mjs',
    path.join(businessRoot, 'liugong_70T_Inmotion6.generated.jcpro'),
    projectOutput,
    path.join(firmwareRoot, 'jclib_ui.h'),
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

test('rejects an embedded battery protocol with a non-v2 contract', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'jc002-battery-migration-'));
  const sourcePath = path.join(outputRoot, 'source.jcpro');
  const projectOutput = path.join(outputRoot, 'project.jcpro');
  const keysOutput = path.join(outputRoot, 'CommonLocalizationKeys.c');
  const source = JSON.parse(
    await readFile(
      path.join(businessRoot, 'liugong_70T_Inmotion6.generated.jcpro'),
      'utf8',
    ),
  );
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
      path.join(firmwareRoot, 'jclib_ui.h'),
      keysOutput,
    ]),
    /must already use schema_version=2 and version=2/,
  );
});
