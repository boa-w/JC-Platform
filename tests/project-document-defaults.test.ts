import assert from 'node:assert/strict';
import test from 'node:test';
import { withRequiredEditorSections } from '../src/features/project-document/projectDocumentDefaults.ts';

test('adds the unified battery monitor section to a recovery document', () => {
  const restored = withRequiredEditorSections({
    project: { name: 'Recovery Fixture', revision: 2 },
    fault_code_info: {},
  });

  assert.equal(restored?.project.name, 'Recovery Fixture');
  assert.deepEqual(restored?.export_info, {
    folder_name: 'jc_export',
    manifest_filename: 'ConfigUpdate.json',
    binary_filename: 'pdo_sdo_data.bin',
    battery_monitor: { config: true, bin: true },
    fault_code_info: { config: true, bin: true },
  });
  assert.equal(restored?.battery_monitor?.frames.length, 11);
  assert.equal(restored?.battery_monitor?.signals.length, 33);
  assert.equal(restored?.battery_monitor?.items.length, 33);
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
    fault_code_info: { config: true, bin: true },
  });
});
