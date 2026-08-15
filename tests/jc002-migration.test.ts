import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
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
  assert.equal(project.fault_code_info.codes.length, 288);
});
