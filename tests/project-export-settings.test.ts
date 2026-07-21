import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultProjectExportSettings,
  projectDirectory,
  readProjectExportSettings,
} from '../src/features/project-export/exportSettings.ts';

test('reads project export settings and fills missing values with defaults', () => {
  assert.deepEqual(readProjectExportSettings(undefined), defaultProjectExportSettings);
  assert.deepEqual(
    readProjectExportSettings({
      export_info: {
        folder_name: 'release',
        manifest_filename: 'device.json',
        binary_filename: 'device.bin',
      },
    }),
    {
      folder_name: 'release',
      manifest_filename: 'device.json',
      binary_filename: 'device.bin',
    },
  );
  assert.deepEqual(readProjectExportSettings({ export_info: { folder_name: '  ' } }), {
    ...defaultProjectExportSettings,
  });
});

test('derives the default export base directory from the project path', () => {
  assert.equal(projectDirectory(String.raw`C:\projects\demo\meter.jcpro`), String.raw`C:\projects\demo`);
  assert.equal(projectDirectory('/projects/demo/meter.jcpro'), '/projects/demo');
  assert.equal(projectDirectory('C:\\meter.jcpro'), 'C:\\');
  assert.equal(projectDirectory('meter.jcpro'), '.');
  assert.equal(projectDirectory(), '');
});
