import { getVersions } from './version-utils.mjs';

const versions = getVersions();
const expected = versions.packageVersion;
const mismatches = Object.entries({
  'src-tauri/tauri.conf.json': versions.tauriVersion,
  'src-tauri/Cargo.toml': versions.cargoVersion,
}).filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`Version mismatch. package.json is ${expected}.`);
  for (const [file, version] of mismatches) {
    console.error(`- ${file}: ${version}`);
  }
  console.error('Run `npm run version:sync` after updating package.json.');
  process.exit(1);
}

console.log(`Version check passed: ${expected}`);
