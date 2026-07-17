import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReleaseIssues } from '../scripts/check-release.mjs';

const stableEndpoint = 'https://github.com/boa-w/JC-Platform/releases/latest/download/latest.json';

function releaseConfig() {
  return {
    bundle: {
      createUpdaterArtifacts: true,
      windows: { certificateThumbprint: '0123456789ABCDEF' },
    },
    plugins: {
      updater: {
        endpoints: [stableEndpoint],
        pubkey: 'public-key',
      },
    },
  };
}

const updaterSigning = {
  TAURI_SIGNING_PRIVATE_KEY: 'private-key',
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'password',
};

test('accepts a signed stable Windows release with a matching tag', () => {
  const issues = collectReleaseIssues({
    channel: 'stable',
    config: releaseConfig(),
    env: updaterSigning,
    prerelease: false,
    tag: 'v1.2.3',
    target: 'x86_64-pc-windows-msvc',
    version: '1.2.3',
  });
  assert.deepEqual(issues, []);
});

test('rejects mismatched release metadata and missing Windows signing', () => {
  const config = releaseConfig();
  config.bundle.windows = {};
  const issues = collectReleaseIssues({
    channel: 'stable',
    config,
    env: {},
    prerelease: true,
    tag: 'v1.2.2',
    target: 'windows',
    version: '1.2.3',
  });
  assert.match(issues.join('\n'), /does not match/);
  assert.match(issues.join('\n'), /must not be marked as a prerelease/);
  assert.match(issues.join('\n'), /TAURI_SIGNING_PRIVATE_KEY is missing/);
  assert.match(issues.join('\n'), /Authenticode is not configured/);
});

test('requires macOS signing and notarization credentials', () => {
  const issues = collectReleaseIssues({
    channel: 'stable',
    config: releaseConfig(),
    env: updaterSigning,
    prerelease: false,
    tag: '1.2.3',
    target: 'aarch64-apple-darwin',
    version: '1.2.3',
  });
  assert.match(issues.join('\n'), /APPLE_CERTIFICATE is missing/);
  assert.match(issues.join('\n'), /APPLE_SIGNING_IDENTITY is missing/);
  assert.match(issues.join('\n'), /notarization credentials are missing/);
});
