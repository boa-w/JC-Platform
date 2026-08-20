import assert from 'node:assert/strict';
import test from 'node:test';
import { withRequiredEditorSections } from '../src/features/project-document/projectDocumentDefaults.ts';

test('does not synthesize a deprecated battery monitor section for a legacy recovery document', () => {
  const restored = withRequiredEditorSections({
    project: { name: 'Recovery Fixture', revision: 2 },
  });

  assert.equal(restored?.project.name, 'Recovery Fixture');
  assert.deepEqual(restored?.export_info, {
    folder_name: 'jc_export',
    manifest_filename: 'ConfigUpdate.json',
    binary_filename: 'pdo_sdo_data.bin',
    battery_monitor: { config: true, bin: true },
  });
  assert.equal(restored?.battery_monitor, undefined);
});

test('fills missing project export target flags without replacing project names', () => {
  const restored = withRequiredEditorSections({
    export_info: {
      folder_name: 'release',
      manifest_filename: 'device.json',
      binary_filename: 'device.bin',
      battery_monitor: { config: false },
    },
  });

  assert.deepEqual(restored?.export_info, {
    folder_name: 'release',
    manifest_filename: 'device.json',
    binary_filename: 'device.bin',
    battery_monitor: { config: false, bin: true },
  });
});

test('does not synthesize optional or v1 sections for jc002', () => {
  const restored = withRequiredEditorSections({
    config_version: 'jc002',
    localization: {
      default_locale: 'zh',
      locale_order: ['zh'],
      locales: {},
    },
  });

  assert.equal(restored, null);
});
