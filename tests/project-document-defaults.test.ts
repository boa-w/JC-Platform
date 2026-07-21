import assert from 'node:assert/strict';
import test from 'node:test';
import { withRequiredEditorSections } from '../src/features/project-document/projectDocumentDefaults.ts';

test('adds current editor defaults to an older recovery document without changing its data', () => {
  const restored = withRequiredEditorSections({
    project: { name: 'Recovery Fixture', revision: 2 },
    battery_protocol: {},
    battery_monitor_info: {},
    fault_code_info: {},
  });

  assert.deepEqual(restored, {
    project: { name: 'Recovery Fixture', revision: 2 },
    export_info: {
      folder_name: 'jc_export',
      manifest_filename: 'ConfigUpdate.json',
      binary_filename: 'pdo_sdo_data.bin',
    },
    battery_protocol: {},
    battery_monitor_info: {},
    fault_code_info: {},
  });
});
