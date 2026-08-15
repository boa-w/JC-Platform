import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , sourcePath, outputPath, firmwareHeaderPath, firmwareKeysPath] = process.argv;
if (!sourcePath || !outputPath || !firmwareHeaderPath || !firmwareKeysPath) {
  console.error(
    'Usage: node scripts/migrate-jc001-i18n-v2.mjs <v1.jcpro> <v2.jcpro> <jclib_ui.h> <CommonLocalizationKeys.c>',
  );
  process.exit(2);
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
if (source.config_version !== 'jc001' || !source.language_info || source.localization) {
  throw new Error('Source must be an unmixed jc001 project with language_info');
}

const language = source.language_info;
const localeOrder = language.list_code_language;
if (!Array.isArray(localeOrder) || localeOrder.length === 0)
  throw new Error('language_info.list_code_language is empty');
const translations = language.list_translate;
const header = await readFile(firmwareHeaderPath, 'utf8');
const enumBody = header.match(/enum JCLIB_LAN\s*\{([\s\S]*?)JCLIB_LAN_ALL\s*,/);
if (!enumBody) throw new Error('Cannot parse enum JCLIB_LAN from firmware header');
const enumEntries = [
  ...enumBody[1].matchAll(/\b(JCLIB_LAN_[A-Za-z0-9_]+)\b\s*(?:=\s*\d+)?\s*,\s*\/\/\s*([^\r\n]*)/g),
].map((match) => ({ enumName: match[1], comment: match[2].trim() }));
const legacyAliases = new Map([
  ['JCLIB_LAN_JAPANESE', '日语'],
  ['JCLIB_LAN_ENTER_IDENTITY_INFO', '请输入身份证后四位'],
  ['JCLIB_LAN_NO_PASSWORD_DISPLAY', '显示请刷卡'],
  ['JCLIB_LAN_WITH_PASSWORD_DISPLAY', '显示请刷卡或输入密码'],
  ['JCLIB_LAN_ULTRASONIC_SENSOR', '超声波雷达'],
  ['JCLIB_LAN_EXIST_AlARM_NO_PLAYER', '车辆存在报警 无法播放'],
]);
const explicitMessages = new Map([
  [
    'JCLIB_LAN_BOOT_WELCOME',
    Object.fromEntries(
      localeOrder.map((locale) => [locale, locale === 'zh' ? '开机界面WELCOME' : 'WELCOME']),
    ),
  ],
]);

const localeTranslations = Object.fromEntries(localeOrder.map((locale) => [locale, {}]));
const keyByLegacyName = new Map();
const usedKeys = new Map();

function addMessage(key, legacyName) {
  if (!legacyName || typeof legacyName !== 'string')
    throw new Error(`Missing legacy translation name for ${key}`);
  const row = translations[legacyName];
  if (!row || typeof row !== 'object') throw new Error(`Missing translation row: ${legacyName}`);
  const previous = usedKeys.get(key);
  if (previous && previous !== legacyName)
    throw new Error(`Stable key collision ${key}: ${previous} / ${legacyName}`);
  usedKeys.set(key, legacyName);
  keyByLegacyName.set(legacyName, key);
  for (const locale of localeOrder) {
    const text = row[locale];
    if (typeof text !== 'string' || text.length === 0)
      throw new Error(`Missing ${locale} translation: ${legacyName}`);
    localeTranslations[locale][key] = text;
  }
  return key;
}

function addExplicitMessage(key, enumName) {
  const row = explicitMessages.get(enumName);
  if (!row) throw new Error(`No explicit translation for ${enumName}`);
  usedKeys.set(key, enumName);
  for (const locale of localeOrder) localeTranslations[locale][key] = row[locale];
  return key;
}

function semanticSlug(value) {
  const english = translations[value]?.en;
  const sourceText = typeof english === 'string' && english ? english : value;
  const slug = sourceText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return slug || `id.${fnv1a(value).toString(16).padStart(8, '0')}`;
}

function uniqueSemanticKey(prefix, legacyName, identity = '') {
  const existing = keyByLegacyName.get(legacyName);
  if (existing) return existing;
  const base = `${prefix}.${semanticSlug(legacyName)}`;
  const owner = usedKeys.get(base);
  const key =
    owner && owner !== legacyName
      ? `${base}.${fnv1a(`${identity}:${legacyName}`).toString(16).padStart(8, '0')}`
      : base;
  return addMessage(key, legacyName);
}

const firmwareKeys = enumEntries.map(({ enumName, comment }) => {
  const key = `ui.${enumName.slice('JCLIB_LAN_'.length).toLowerCase().replaceAll('_', '.')}`;
  if (explicitMessages.has(enumName)) addExplicitMessage(key, enumName);
  else addMessage(key, legacyAliases.get(enumName) ?? comment);
  return key;
});

function migrateSdo(items, pathParts = []) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const identity =
      item.type === 1
        ? `${item.fid ?? 0}.${item.mid ?? 0}.${item.sid ?? 0}`
        : [...pathParts, item.name ?? 'menu'].join('/');
    item.message_key = uniqueSemanticKey(
      item.type === 1 ? 'sdo.parameter' : 'sdo.menu',
      item.name,
      identity,
    );
    migrateSdo(item.children, [...pathParts, item.message_key]);
  }
}
migrateSdo(source.sdo_info?.children);

const faultDefinitions = [];
const faultBindings = [];
const canonicalFaultMessageByVector = new Map();
const usedFaultKeys = new Set();
for (const code of source.fault_code_info?.codes ?? []) {
  if (!code.message_key)
    throw new Error(`Fault ${code.source_key}:${code.code} has no message_key`);
  const row = translations[code.message_key];
  if (!row || typeof row !== 'object')
    throw new Error(`Missing fault translation row: ${code.message_key}`);
  const vector = JSON.stringify(localeOrder.map((locale) => row[locale]));
  const canonicalMessageKey = canonicalFaultMessageByVector.get(vector) ?? code.message_key;
  canonicalFaultMessageByVector.set(vector, canonicalMessageKey);
  if (!usedKeys.has(canonicalMessageKey)) addMessage(canonicalMessageKey, canonicalMessageKey);

  const sourceKey = code.source_key || `source_${code.source_id ?? 0}`;
  const faultKey = `fault.${sourceKey}.${String(code.code).padStart(3, '0')}`;
  if (usedFaultKeys.has(faultKey))
    throw new Error(`Duplicate fault identity: ${sourceKey}:${code.code}`);
  usedFaultKeys.add(faultKey);
  faultDefinitions.push({
    fault_key: faultKey,
    message_key: canonicalMessageKey,
    name: code.name ?? '',
    severity: code.severity ?? 'fault',
    enabled: code.enabled ?? true,
  });
  faultBindings.push({
    source_key: sourceKey,
    code: code.code,
    fault_key: faultKey,
    enabled: code.enabled ?? true,
  });
}

source.fault_code_info = {
  ...source.fault_code_info,
  schema_version: 2,
  version: 2,
  sources: [...(source.fault_code_info?.sources ?? [])].sort(
    (left, right) =>
      Number(left.source_id ?? 0) - Number(right.source_id ?? 0) ||
      String(left.source_key ?? '').localeCompare(String(right.source_key ?? '')),
  ),
  definitions: faultDefinitions.sort((left, right) =>
    left.fault_key.localeCompare(right.fault_key),
  ),
  bindings: faultBindings.sort(
    (left, right) =>
      left.source_key.localeCompare(right.source_key) || Number(left.code) - Number(right.code),
  ),
};
delete source.fault_code_info.codes;

source.config_version = 'jc002';
source.project = { ...source.project, name: `${source.project?.name ?? 'project'}_jc002` };
source.export_info = {
  ...source.export_info,
  folder_name: 'jc_export_v2',
  manifest_filename: 'ConfigUpdate.json',
  binary_filename: 'data.bin',
};
source.localization = {
  default_locale: localeOrder[0],
  locale_order: localeOrder,
  locales: Object.fromEntries(
    localeOrder.map((locale) => [
      locale,
      {
        enabled: true,
        direction: locale === 'ar' ? 'rtl' : 'ltr',
        translations: localeTranslations[locale],
      },
    ]),
  ),
};
delete source.language_info;

const generatedKeys = `#include "CommonLocalizationKeys.h"\n\nconst char *const g_common_localization_ui_keys[COMMON_LOCALIZATION_UI_KEY_COUNT] = {\n${firmwareKeys.map((key) => `    "${key}",`).join('\n')}\n};\n`;
await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`, 'utf8');
await writeFile(firmwareKeysPath, generatedKeys, 'utf8');
console.log(
  JSON.stringify(
    {
      source: path.resolve(sourcePath),
      output: path.resolve(outputPath),
      locales: localeOrder.length,
      messages: usedKeys.size,
      firmwareUiKeys: firmwareKeys.length,
      faultDefinitions: faultDefinitions.length,
      faultBindings: faultBindings.length,
      faultMessages: canonicalFaultMessageByVector.size,
    },
    null,
    2,
  ),
);

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
