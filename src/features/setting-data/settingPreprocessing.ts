export interface SettingPreprocessDefinition {
  handle: number;
  name: string;
  description: string;
  scaleRequired: boolean;
  offsetRequired: boolean;
  shrinking: boolean;
}

export const settingPreprocessDefinitions: readonly SettingPreprocessDefinition[] = [
  {
    handle: 0,
    name: '原始数据',
    description: '不进行缩放或偏移',
    scaleRequired: false,
    offsetRequired: false,
    shrinking: false,
  },
  {
    handle: 5,
    name: '缩小',
    description: '按缩放值缩小',
    scaleRequired: true,
    offsetRequired: false,
    shrinking: true,
  },
  {
    handle: 6,
    name: '放大',
    description: '按缩放值放大',
    scaleRequired: true,
    offsetRequired: false,
    shrinking: false,
  },
  {
    handle: 7,
    name: '偏移',
    description: '只应用偏移值',
    scaleRequired: false,
    offsetRequired: true,
    shrinking: false,
  },
  {
    handle: 1,
    name: '缩小偏移',
    description: '先缩小，再偏移',
    scaleRequired: true,
    offsetRequired: true,
    shrinking: true,
  },
  {
    handle: 2,
    name: '放大偏移',
    description: '先放大，再偏移',
    scaleRequired: true,
    offsetRequired: true,
    shrinking: false,
  },
  {
    handle: 3,
    name: '偏移缩小',
    description: '先偏移，再缩小',
    scaleRequired: true,
    offsetRequired: true,
    shrinking: true,
  },
  {
    handle: 4,
    name: '偏移放大',
    description: '先偏移，再放大',
    scaleRequired: true,
    offsetRequired: true,
    shrinking: false,
  },
] as const;

export const settingPreprocessDecimalDefinitions = [
  { value: 0, name: '0位' },
  { value: 1, name: '1位' },
  { value: 2, name: '2位' },
  { value: 3, name: '3位' },
  { value: 4, name: '4位' },
] as const;

export function settingPreprocessByHandle(handle?: number) {
  return settingPreprocessDefinitions.find((definition) => definition.handle === handle);
}

export function settingPreprocessByName(name?: string) {
  const normalized = name?.trim();
  return settingPreprocessDefinitions.find((definition) => definition.name === normalized);
}

export function settingPreprocessSelectValue(handle: number) {
  const definition = settingPreprocessByHandle(handle);
  return definition ? `${definition.name}:${definition.handle}` : String(handle);
}

export function parseSettingPreprocessValue(value: string | number) {
  const text = String(value).trim();
  const [name, handleText] = text.split(':');
  const handle = Number.parseInt(handleText ?? '', 10);
  return (
    (Number.isFinite(handle) ? settingPreprocessByHandle(handle) : undefined) ??
    settingPreprocessByName(name) ??
    null
  );
}

export function settingPreprocessDecimalName(value?: number) {
  return settingPreprocessDecimalDefinitions.find((definition) => definition.value === value)?.name;
}

export function validateSettingPreprocessScale(value: string, handle?: number) {
  const definition = settingPreprocessByHandle(handle);
  if (!definition || handle === 0 || handle === 7) return true;
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) return false;
  const parsed = Number.parseInt(normalized, 10);
  return (
    parsed >= -32768 &&
    parsed <= 32767 &&
    (!definition.shrinking || parsed !== 0)
  );
}

export function validateSettingPreprocessOffset(value: string, handle?: number) {
  const definition = settingPreprocessByHandle(handle);
  if (!definition || handle === 0 || handle === 5 || handle === 6) return true;
  const normalized = value.trim();
  return normalized.length > 0 && Number.isFinite(Number(normalized));
}
