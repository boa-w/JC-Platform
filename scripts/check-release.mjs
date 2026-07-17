import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { files, getVersions, readJson } from './version-utils.mjs';

const stableEndpoint = 'https://github.com/boa-w/JC-Platform/releases/latest/download/latest.json';
const nightlyEndpoint =
  'https://github.com/boa-w/JC-Platform/releases/download/nightly/latest.json';

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizedTarget(target) {
  if (target === 'win32' || target.includes('windows')) return 'windows';
  if (target.includes('apple') || target.includes('macos') || target.includes('darwin'))
    return 'macos';
  return target;
}

function updaterIssues(config, channel) {
  const issues = [];
  const endpoint = config.plugins?.updater?.endpoints;
  const expectedEndpoint = channel === 'nightly' ? nightlyEndpoint : stableEndpoint;
  if (config.bundle?.createUpdaterArtifacts !== true) {
    issues.push('Updater artifacts are not enabled.');
  }
  if (!Array.isArray(endpoint) || endpoint.length !== 1 || endpoint[0] !== expectedEndpoint) {
    issues.push(`${channel} updater endpoint must be ${expectedEndpoint}.`);
  }
  if (!hasValue(config.plugins?.updater?.pubkey)) {
    issues.push('Updater public key is missing.');
  }
  return issues;
}

function signingIssues(config, target, env) {
  const issues = [];
  if (!hasValue(env.TAURI_SIGNING_PRIVATE_KEY)) {
    issues.push('TAURI_SIGNING_PRIVATE_KEY is missing.');
  }
  if (!hasValue(env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD)) {
    issues.push('TAURI_SIGNING_PRIVATE_KEY_PASSWORD is missing.');
  }

  if (target === 'windows') {
    const windows = config.bundle?.windows;
    if (!hasValue(windows?.certificateThumbprint) && !windows?.signCommand) {
      issues.push(
        'Windows Authenticode is not configured (bundle.windows.certificateThumbprint or signCommand).',
      );
    }
  }

  if (target === 'macos') {
    for (const key of [
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
    ]) {
      if (!hasValue(env[key])) issues.push(`${key} is missing.`);
    }
    const hasAppleId = ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID'].every((key) =>
      hasValue(env[key]),
    );
    const hasApiKey =
      hasValue(env.APPLE_API_ISSUER) &&
      hasValue(env.APPLE_API_KEY) &&
      hasValue(env.APPLE_API_KEY_PATH);
    if (!hasAppleId && !hasApiKey) {
      issues.push('macOS notarization credentials are missing.');
    }
  }
  return issues;
}

export function collectReleaseIssues({
  channel,
  config,
  env = {},
  prerelease,
  tag,
  target,
  version,
}) {
  const issues = [...updaterIssues(config, channel)];
  const platform = normalizedTarget(target);

  if (channel === 'stable') {
    if (version.includes('-'))
      issues.push('Stable release version must not contain a prerelease suffix.');
    if (tag && tag !== version && tag !== `v${version}`) {
      issues.push(`Release tag ${tag} does not match application version ${version}.`);
    }
    if (prerelease === true || prerelease === 'true') {
      issues.push('Stable release must not be marked as a prerelease.');
    }
    issues.push(...signingIssues(config, platform, env));
  }

  if (!['windows', 'macos'].includes(platform)) {
    issues.push(`Unsupported release target: ${target}.`);
  }
  return issues;
}

function mergedConfig(channel) {
  const base = readJson(files.tauriConfig);
  const overlayPath = resolve(
    fileURLToPath(new URL('..', import.meta.url)),
    'src-tauri',
    channel === 'nightly' ? 'tauri.nightly.conf.json' : 'tauri.updater.conf.json',
  );
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  return {
    ...base,
    ...overlay,
    bundle: { ...base.bundle, ...overlay.bundle },
    plugins: {
      ...base.plugins,
      ...overlay.plugins,
      updater: { ...base.plugins?.updater, ...overlay.plugins?.updater },
    },
  };
}

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run() {
  const channel = argument('channel', 'stable');
  const target = argument('target', process.platform);
  if (!['stable', 'nightly'].includes(channel)) {
    console.error(`Unsupported release channel: ${channel}`);
    process.exit(1);
  }
  const versions = getVersions();
  const issues = collectReleaseIssues({
    channel,
    config: mergedConfig(channel),
    env: process.env,
    prerelease: process.env.RELEASE_PRERELEASE,
    tag: process.env.RELEASE_TAG,
    target,
    version: versions.packageVersion,
  });

  if (issues.length > 0) {
    console.error(`Release preflight failed for ${channel}/${normalizedTarget(target)}:`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log(
    `Release preflight passed for ${channel}/${normalizedTarget(target)} ${versions.packageVersion}.`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) run();
