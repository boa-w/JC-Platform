import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stableEndpoint = 'https://github.com/boa-w/JC-Platform/releases/latest/download/latest.json';
const nightlyEndpoint =
  'https://github.com/boa-w/JC-Platform/releases/download/nightly/latest.json';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

test('keeps stable and nightly updater channels isolated', () => {
  const stable = readJson('src-tauri/tauri.conf.json') as {
    plugins: { updater: { endpoints: string[] } };
  };
  const stableArtifacts = readJson('src-tauri/tauri.updater.conf.json') as {
    bundle: { createUpdaterArtifacts: boolean };
    plugins?: { updater?: { endpoints?: string[] } };
  };
  const nightly = readJson('src-tauri/tauri.nightly.conf.json') as {
    bundle: { createUpdaterArtifacts: boolean };
    plugins: { updater: { endpoints: string[] } };
  };

  assert.deepEqual(stable.plugins.updater.endpoints, [stableEndpoint]);
  assert.equal(stableArtifacts.bundle.createUpdaterArtifacts, true);
  assert.equal(stableArtifacts.plugins?.updater?.endpoints, undefined);
  assert.equal(nightly.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(nightly.plugins.updater.endpoints, [nightlyEndpoint]);
});

test('selects the matching updater config in the release workflow', () => {
  const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
  assert.match(
    workflow,
    /github\.event_name == 'push' && '--config src-tauri\/tauri\.nightly\.conf\.json'/,
  );
  assert.match(
    workflow,
    /github\.event_name == 'release' && '--config src-tauri\/tauri\.updater\.conf\.json'/,
  );
  assert.match(
    workflow,
    /npm run release:check -- --channel stable --target \$\{\{ matrix\.target \}\}/,
  );
  assert.match(workflow, /APPLE_CERTIFICATE: \$\{\{ secrets\.APPLE_CERTIFICATE \}\}/);
});
