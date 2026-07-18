import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function collectFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function findUnique(files, predicate, label) {
  const matches = files.filter((path) => predicate(basename(path)));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${matches.length}.`);
  }
  return matches[0];
}

function signatureFor(files, artifact, label) {
  const signatureName = `${basename(artifact)}.sig`;
  return findUnique(files, (name) => name === signatureName, `${label} signature`);
}

function copyAs(source, outputDirectory, name) {
  const target = join(outputDirectory, name);
  copyFileSync(source, target);
  return target;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function prepareReleaseAssets({
  inputDirectory,
  notes,
  outputDirectory,
  pubDate = new Date().toISOString(),
  repository,
  tag,
  version,
}) {
  if (!inputDirectory || !outputDirectory || !repository || !tag || !version) {
    throw new Error('inputDirectory, outputDirectory, repository, tag, and version are required.');
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.-]*$/.test(version)) {
    throw new Error(`Unsafe release version: ${version}`);
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(tag)) {
    throw new Error(`Unsafe release tag: ${tag}`);
  }
  if (!/^[0-9A-Za-z_.-]+\/[0-9A-Za-z_.-]+$/.test(repository)) {
    throw new Error(`Unsafe repository name: ${repository}`);
  }
  const input = resolve(inputDirectory);
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  if (readdirSync(output).length > 0) {
    throw new Error(`Output directory must be empty: ${output}`);
  }

  const files = collectFiles(input);
  const windowsInstaller = findUnique(
    files,
    (name) => name.endsWith('_x64-setup.exe'),
    'Windows NSIS installer',
  );
  const windowsSignature = signatureFor(files, windowsInstaller, 'Windows NSIS installer');
  const windowsMsi = findUnique(
    files,
    (name) => name.endsWith('_x64_zh-CN.msi'),
    'Windows MSI installer',
  );
  const macDmg = findUnique(files, (name) => name.endsWith('_aarch64.dmg'), 'macOS DMG');
  const macArchive = findUnique(
    files,
    (name) => name.endsWith('_aarch64.app.tar.gz'),
    'macOS updater archive',
  );
  const macSignature = signatureFor(files, macArchive, 'macOS updater archive');

  const names = {
    windowsInstaller: `JC-Platform_${version}_x64-setup.exe`,
    windowsMsi: `JC-Platform_${version}_x64_zh-CN.msi`,
    macDmg: `JC-Platform_${version}_aarch64.dmg`,
    macArchive: `JC-Platform_${version}_aarch64.app.tar.gz`,
  };
  const published = [
    copyAs(windowsInstaller, output, names.windowsInstaller),
    copyAs(windowsSignature, output, `${names.windowsInstaller}.sig`),
    copyAs(windowsMsi, output, names.windowsMsi),
    copyAs(macDmg, output, names.macDmg),
    copyAs(macArchive, output, names.macArchive),
    copyAs(macSignature, output, `${names.macArchive}.sig`),
  ];

  const windowsMsiSignature = files.find(
    (path) => basename(path) === `${basename(windowsMsi)}.sig`,
  );
  if (windowsMsiSignature) {
    published.push(copyAs(windowsMsiSignature, output, `${names.windowsMsi}.sig`));
  }

  const baseUrl = `https://github.com/${repository}/releases/download/${tag}`;
  const manifest = {
    version,
    notes: notes || `Release ${version}.`,
    pub_date: pubDate,
    platforms: {
      'windows-x86_64': {
        signature: readFileSync(windowsSignature, 'utf8').trim(),
        url: `${baseUrl}/${names.windowsInstaller}`,
      },
      'darwin-aarch64': {
        signature: readFileSync(macSignature, 'utf8').trim(),
        url: `${baseUrl}/${names.macArchive}`,
      },
    },
  };
  if (!manifest.platforms['windows-x86_64'].signature) {
    throw new Error('Windows updater signature is empty.');
  }
  if (!manifest.platforms['darwin-aarch64'].signature) {
    throw new Error('macOS updater signature is empty.');
  }

  const manifestPath = join(output, 'latest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  published.push(manifestPath);
  const checksumsPath = join(output, 'SHA256SUMS');
  const checksums = published
    .map((path) => `${sha256(path)}  ${basename(path)}`)
    .sort()
    .join('\n');
  writeFileSync(checksumsPath, `${checksums}\n`);
  published.push(checksumsPath);
  return { manifest, published };
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run() {
  const result = prepareReleaseAssets({
    inputDirectory: argument('input'),
    outputDirectory: argument('output'),
    version: argument('version'),
    tag: argument('tag'),
    repository: argument('repository'),
    notes: argument('notes'),
  });
  for (const path of result.published) console.log(path);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) run();
