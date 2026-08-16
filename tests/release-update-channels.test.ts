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
    /args: --target \$\{\{ matrix\.target \}\} --config src-tauri\/tauri\.updater\.conf\.json/,
  );
  assert.match(
    workflow,
    /npm run release:check -- --channel stable --target \$\{\{ matrix\.target \}\}/,
  );
  const nightlyBuildStep = workflow.slice(
    workflow.indexOf('- name: Build Tauri app'),
    workflow.indexOf('- name: Build signed Tauri app'),
  );
  const signedBuildStep = workflow.slice(
    workflow.indexOf('- name: Build signed Tauri app'),
    workflow.indexOf('- name: Download previous Windows nightly installer'),
  );
  assert.match(nightlyBuildStep, /if: github\.event_name != 'release'/);
  assert.doesNotMatch(nightlyBuildStep, /APPLE_CERTIFICATE/);
  assert.doesNotMatch(nightlyBuildStep, /APPLE_SIGNING_IDENTITY/);
  assert.match(signedBuildStep, /if: github\.event_name == 'release'/);
  assert.match(
    signedBuildStep,
    /APPLE_CERTIFICATE: \$\{\{ secrets\.APPLE_CERTIFICATE \}\}/,
  );
  assert.match(
    signedBuildStep,
    /APPLE_SIGNING_IDENTITY: \$\{\{ secrets\.APPLE_SIGNING_IDENTITY \}\}/,
  );
});

test('runs independent quality checks in parallel before the build', () => {
  const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
  assert.match(workflow, /^ {2}frontend_quality:/m);
  assert.match(workflow, /^ {2}rust_quality:/m);
  assert.match(workflow, /^ {2}ui_quality:/m);
  assert.match(
    workflow,
    /quality:\n {4}name: Quality gate\n {4}needs:\n {6}- frontend_quality\n {6}- rust_quality\n {6}- ui_quality\n {4}if: always\(\)/,
  );
  assert.match(
    workflow,
    /- name: Verify frontend\n {8}run: npm run verify:frontend/,
  );
  assert.match(
    workflow,
    /- name: Test Rust\n {8}run: npm run verify:rust/,
  );
  assert.match(workflow, /- name: Run UI tests\n {8}run: npm run verify:ui/);
  assert.doesNotMatch(workflow, /run: npm run verify$/m);
  assert.match(
    workflow,
    /build:\n {4}name: Build \(\$\{\{ matrix\.label \}\}\)\n {4}needs:\n {6}- quality/,
  );
});

test('smoke tests bundled installers before publishing artifacts', () => {
  const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
  const buildStep = workflow.slice(
    workflow.indexOf('- name: Build Tauri app'),
    workflow.indexOf('- name: Download previous Windows nightly installer'),
  );
  assert.match(workflow, /- name: Smoke test Windows installer/);
  assert.match(
    workflow,
    /if: startsWith\(matrix\.label, 'windows'\) && github\.event_name != 'pull_request'/,
  );
  assert.match(workflow, /\.\/scripts\/test-windows-installer\.ps1 -InstallerPath \$installer/);
  assert.match(workflow, /-RequireSignature/);
  assert.match(workflow, /-AdditionalSignaturePath \$msi/);
  assert.match(workflow, /- name: Preserve previous Windows nightly installer/);
  assert.match(workflow, /- name: Smoke test Windows cross-version upgrade/);
  assert.match(workflow, /\.\/scripts\/test-windows-upgrade\.ps1/);
  assert.match(workflow, /needs\.prepare-nightly\.outputs\.has_previous_windows == 'true'/);
  assert.ok(
    workflow.indexOf('- name: Preserve previous Windows nightly installer') <
      workflow.indexOf('- name: Update nightly release metadata'),
  );
  assert.doesNotMatch(workflow, /gh release delete "\$NIGHTLY_TAG"/);
  assert.ok(
    workflow.indexOf('- name: Download previous Windows nightly installer') <
      workflow.indexOf('- name: Smoke test Windows cross-version upgrade'),
  );
  assert.match(workflow, /- name: Smoke test macOS bundle/);
  assert.match(workflow, /bash \.\/scripts\/test-macos-bundle\.sh/);
  assert.match(workflow, /args\+=\(--require-signature\)/);
  assert.match(workflow, /- name: Verify macOS updater artifacts/);
  assert.match(workflow, /-name '\*\.app\.tar\.gz'/);
  const macVerificationStep = workflow.slice(
    workflow.indexOf('- name: Verify macOS updater artifacts'),
    workflow.indexOf('- name: Upload Windows workflow artifacts'),
  );
  assert.doesNotMatch(macVerificationStep, /mapfile/);
  assert.doesNotMatch(workflow, /bundle\/macos\/\*\.app/);
  assert.ok(
    workflow.indexOf('- name: Build Tauri app') <
      workflow.indexOf('- name: Smoke test macOS bundle'),
  );
  assert.ok(
    workflow.indexOf('- name: Smoke test macOS bundle') <
      workflow.indexOf('- name: Upload macOS workflow artifacts'),
  );
  assert.match(workflow, /publish-release-assets:/);
  assert.match(workflow, /node scripts\/prepare-release-assets\.mjs/);
  assert.match(workflow, /gh release upload "\$tag"/);
  const binaryUpload = workflow.search(/gh release upload "\$tag" "\$\{assets\[@\]\}"/);
  const manifestUpload = workflow.search(/gh release upload "\$tag" "\$manifest"/);
  assert.ok(binaryUpload >= 0 && binaryUpload < manifestUpload);
  assert.match(workflow, /Removing stale nightly asset/);
  assert.doesNotMatch(workflow, /^\s+releaseId:/m);
  assert.doesNotMatch(workflow, /^\s+tagName:/m);
  assert.doesNotMatch(buildStep, /GITHUB_TOKEN/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.equal(workflow.match(/contents: write/g)?.length, 2);
  assert.ok(
    workflow.indexOf('- name: Smoke test macOS bundle') <
      workflow.indexOf('publish-release-assets:'),
  );
});
