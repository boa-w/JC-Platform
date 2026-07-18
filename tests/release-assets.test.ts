import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareReleaseAssets } from '../scripts/prepare-release-assets.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jc-platform-release-assets-'));
  const input = join(root, 'input');
  const output = join(root, 'output');
  mkdirSync(join(input, 'windows', 'nsis'), { recursive: true });
  mkdirSync(join(input, 'windows', 'msi'), { recursive: true });
  mkdirSync(join(input, 'macos', 'dmg'), { recursive: true });
  mkdirSync(join(input, 'macos', 'updater'), { recursive: true });
  const files = {
    windowsInstaller: join(input, 'windows', 'nsis', '自定义开发平台_0.1.1-42_x64-setup.exe'),
    windowsSignature: join(input, 'windows', 'nsis', '自定义开发平台_0.1.1-42_x64-setup.exe.sig'),
    windowsMsi: join(input, 'windows', 'msi', '自定义开发平台_0.1.1-42_x64_zh-CN.msi'),
    macDmg: join(input, 'macos', 'dmg', '自定义开发平台_0.1.1-42_aarch64.dmg'),
    macArchive: join(input, 'macos', 'updater', '自定义开发平台_0.1.1-42_aarch64.app.tar.gz'),
    macSignature: join(input, 'macos', 'updater', '自定义开发平台_0.1.1-42_aarch64.app.tar.gz.sig'),
  };
  for (const path of Object.values(files)) writeFileSync(path, `fixture:${path}`);
  writeFileSync(files.windowsSignature, 'windows-signature\n');
  writeFileSync(files.macSignature, 'mac-signature\n');
  return { files, input, output, root };
}

test('normalizes verified desktop assets and creates updater metadata', () => {
  const { input, output, root } = fixture();
  try {
    const result = prepareReleaseAssets({
      inputDirectory: input,
      outputDirectory: output,
      version: '0.1.1-42',
      tag: 'nightly',
      repository: 'boa-w/JC-Platform',
      notes: 'Nightly fixture.',
      pubDate: '2026-07-18T00:00:00.000Z',
    });

    assert.equal(result.published.length, 8);
    assert.equal(result.manifest.version, '0.1.1-42');
    assert.deepEqual(result.manifest.platforms['windows-x86_64'], {
      signature: 'windows-signature',
      url: 'https://github.com/boa-w/JC-Platform/releases/download/nightly/JC-Platform_0.1.1-42_x64-setup.exe',
    });
    assert.equal(result.manifest.platforms['darwin-aarch64'].signature, 'mac-signature');
    assert.equal(existsSync(join(output, 'JC-Platform_0.1.1-42_aarch64.dmg')), true);
    assert.equal(existsSync(join(output, 'latest.json')), true);
    const checksums = readFileSync(join(output, 'SHA256SUMS'), 'utf8');
    assert.match(checksums, /JC-Platform_0\.1\.1-42_x64-setup\.exe/);
    assert.match(checksums, /latest\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses to publish when an updater signature is missing', () => {
  const { files, input, output, root } = fixture();
  try {
    rmSync(files.macSignature);
    assert.throws(
      () =>
        prepareReleaseAssets({
          inputDirectory: input,
          outputDirectory: output,
          version: '1.0.0',
          tag: 'v1.0.0',
          repository: 'boa-w/JC-Platform',
        }),
      /macOS updater archive signature/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects release metadata that could escape the output directory', () => {
  const { input, output, root } = fixture();
  try {
    assert.throws(
      () =>
        prepareReleaseAssets({
          inputDirectory: input,
          outputDirectory: output,
          version: '../outside',
          tag: 'nightly',
          repository: 'boa-w/JC-Platform',
        }),
      /Unsafe release version/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
