export type SettingDataTypeKind = 'integer' | 'string' | 'default-write' | 'bits';

export interface SettingDataTypeDefinition {
  handle: number;
  name: string;
  descriptionKey: string;
  kind: SettingDataTypeKind;
  bitWidth?: number;
  defaultWriteBytes?: number;
}

export const settingDataTypeDefinitions: readonly SettingDataTypeDefinition[] = [
  { handle: 0, name: 'u8', descriptionKey: 'settingData.dataTypes.u8', kind: 'integer', bitWidth: 8 },
  { handle: 1, name: 's8', descriptionKey: 'settingData.dataTypes.s8', kind: 'integer', bitWidth: 8 },
  { handle: 2, name: 'u16', descriptionKey: 'settingData.dataTypes.u16', kind: 'integer', bitWidth: 16 },
  { handle: 3, name: 's16', descriptionKey: 'settingData.dataTypes.s16', kind: 'integer', bitWidth: 16 },
  { handle: 4, name: 'u32', descriptionKey: 'settingData.dataTypes.u32', kind: 'integer', bitWidth: 32 },
  { handle: 5, name: 's32', descriptionKey: 'settingData.dataTypes.s32', kind: 'integer', bitWidth: 32 },
  { handle: 6, name: 'string', descriptionKey: 'settingData.dataTypes.string', kind: 'string' },
  {
    handle: 7,
    name: 'default_4字节',
    descriptionKey: 'settingData.dataTypes.default4',
    kind: 'default-write',
    defaultWriteBytes: 4,
  },
  {
    handle: 8,
    name: 'default_2字节',
    descriptionKey: 'settingData.dataTypes.default2',
    kind: 'default-write',
    defaultWriteBytes: 2,
  },
  {
    handle: 9,
    name: 'default_1字节',
    descriptionKey: 'settingData.dataTypes.default1',
    kind: 'default-write',
    defaultWriteBytes: 1,
  },
  { handle: 10, name: 'bits_4字节', descriptionKey: 'settingData.dataTypes.bits32', kind: 'bits', bitWidth: 32 },
  { handle: 11, name: 'bits_2字节', descriptionKey: 'settingData.dataTypes.bits16', kind: 'bits', bitWidth: 16 },
  { handle: 12, name: 'bits_1字节', descriptionKey: 'settingData.dataTypes.bits8', kind: 'bits', bitWidth: 8 },
] as const;

export function settingDataTypeByHandle(handle?: number) {
  return settingDataTypeDefinitions.find((definition) => definition.handle === handle);
}

export function settingDataTypeByName(name?: string) {
  const normalized = name?.trim().toLowerCase();
  return settingDataTypeDefinitions.find(
    (definition) => definition.name.toLowerCase() === normalized,
  );
}

export function settingDataTypeSelectValue(handle: number) {
  const definition = settingDataTypeByHandle(handle);
  return definition ? `${definition.name}:${definition.handle}` : String(handle);
}

export function parseSettingDataTypeValue(value: string | number) {
  const text = String(value).trim();
  const [name, handleText] = text.split(':');
  const handle = Number.parseInt(handleText ?? '', 10);
  const definition = Number.isFinite(handle)
    ? settingDataTypeByHandle(handle)
    : settingDataTypeByName(name);
  return definition ?? null;
}

export function settingDataTypeUsesBitRange(handle?: number) {
  return settingDataTypeByHandle(handle)?.kind === 'bits';
}

export function settingDataTypeIsDefaultWrite(handle?: number) {
  return settingDataTypeByHandle(handle)?.kind === 'default-write';
}

export function validateDefaultWriteValue(value: string, handle?: number) {
  const definition = settingDataTypeByHandle(handle);
  if (definition?.kind !== 'default-write' || !definition.defaultWriteBytes) return true;
  const normalized = value.trim();
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(normalized)) return false;
  const radix = /^0x/i.test(normalized) ? 16 : 10;
  const parsed = Number.parseInt(normalized.replace(/^0x/i, ''), radix);
  const maximum = 2 ** (definition.defaultWriteBytes * 8) - 1;
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum;
}
