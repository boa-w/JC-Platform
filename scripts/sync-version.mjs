import { files, readJson, writeCargoVersion, writeJson } from './version-utils.mjs';

const packageJson = readJson(files.packageJson);
const version = packageJson.version;

const tauriConfig = readJson(files.tauriConfig);
tauriConfig.version = version;
writeJson(files.tauriConfig, tauriConfig);

writeCargoVersion(version);

console.log(`Synced app version to ${version}`);
