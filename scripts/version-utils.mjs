import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const files = {
  packageJson: resolve(root, 'package.json'),
  tauriConfig: resolve(root, 'src-tauri', 'tauri.conf.json'),
  cargoToml: resolve(root, 'src-tauri', 'Cargo.toml'),
};

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readCargoVersion() {
  const cargoToml = readFileSync(files.cargoToml, 'utf-8');
  const match = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error('Unable to find package.version in src-tauri/Cargo.toml');
  return match[1];
}

export function writeCargoVersion(version) {
  const cargoToml = readFileSync(files.cargoToml, 'utf-8');
  const nextCargoToml = cargoToml.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`,
  );
  writeFileSync(files.cargoToml, nextCargoToml);
}

export function getVersions() {
  const packageJson = readJson(files.packageJson);
  const tauriConfig = readJson(files.tauriConfig);

  return {
    packageVersion: packageJson.version,
    tauriVersion: tauriConfig.version,
    cargoVersion: readCargoVersion(),
  };
}
