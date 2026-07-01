import type { SdoNodeDocument } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import {
  maxSettingColumnWidth,
  settingColumnWidthStorageKey,
  settingParameterColumns,
} from './config';
import type {
  SettingEditorOption,
  SettingMenuRow,
  SettingParameterColumn,
  SettingParameterRow,
} from './types';

export function sdoNodeDocumentPath(path: number[]): JsonPath {
  return path.reduce<JsonPath>((segments, index) => [...segments, 'children', index], ['sdo_info']);
}

export function optionsWithCurrentValue(options: SettingEditorOption[], value: string | number) {
  if (options.some((option) => String(option.value) === String(value))) return options;
  return [{ value, label: String(value) }, ...options];
}

export function clampSettingColumnWidth(value: number, column: SettingParameterColumn) {
  return Math.max(column.minWidth, Math.min(maxSettingColumnWidth, value));
}

export function loadSettingColumnWidths() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(settingColumnWidthStorageKey);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    for (const column of settingParameterColumns) {
      const value = (parsed as Record<string, unknown>)[column.key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[column.key] = clampSettingColumnWidth(value, column);
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function saveSettingColumnWidths(widths: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(settingColumnWidthStorageKey, JSON.stringify(widths));
}

export function sdoAuthLabel(value?: number) {
  return ['普通用户', '普通用户', '管理员', '超级管理员'][value ?? 0] ?? '普通用户';
}

export function sdoAccessLabel(value?: number) {
  return ['只读', '读写', '只写'][value ?? 0] ?? '只读';
}

export function sdoProtocolLabel(value?: number) {
  return value === 0 || value === undefined ? 'CAN_OPEN' : String(value);
}

export function settingDataTypeLabel(node: SdoNodeDocument) {
  const explicitType = [
    node.handle_name,
    typeof node.data_type === 'string' ? node.data_type : undefined,
    typeof node.dataType === 'string' ? node.dataType : undefined,
  ].find((item) => item?.trim());
  if (explicitType) return explicitType.trim();

  const handle = node.handle;
  const label = settingDataTypeBaseLabel(handle);
  if (label) return `${label}(handle=${handle})`;
  return typeof handle === 'number' ? `handle=${handle}` : '';
}

export function settingDataTypeBaseLabel(handle?: number) {
  switch (handle) {
    case 0:
      return 'u8';
    case 2:
    case 3:
      return 'u16';
    case 4:
    case 7:
      return 'u32';
    case 6:
      return 'string';
    case 11:
    case 12:
      return 'bit';
    default:
      return '';
  }
}

export function settingDataTypeSelectValue(node: SdoNodeDocument) {
  if (typeof node.handle === 'number') {
    const base = settingDataTypeBaseLabel(node.handle);
    if (base) return `${base}:${node.handle}`;
  }
  const explicit = [
    node.handle_name,
    typeof node.data_type === 'string' ? node.data_type : undefined,
    typeof node.dataType === 'string' ? node.dataType : undefined,
  ]
    .find((item) => item?.trim())
    ?.trim();
  return explicit || 'u8:0';
}

export function parseSettingDataTypeSelection(value: string | number) {
  const text = String(value);
  const [label, handleText] = text.split(':');
  const handle = Number.parseInt(handleText ?? '', 10);
  return {
    label: label.trim() || text.trim(),
    handle: Number.isFinite(handle) ? handle : undefined,
  };
}

export function formatHex(value?: number, width = 0) {
  if (typeof value !== 'number') return '';
  return `0x${Math.max(0, value).toString(16).toUpperCase().padStart(width, '0')}`;
}

export function parseHandleParam(value?: string) {
  const parsed = parseHandleParamParts(value);
  if (!parsed) {
    return { bitStart: '', bitLength: '' };
  }
  return {
    bitStart: `bit${parsed.start}`,
    bitLength: `${parsed.length}个bits`,
  };
}

export function parseHandleParamParts(value?: string) {
  const parts = (value ?? '').split('->').map((item) => Number.parseInt(item, 10));
  if (parts.length < 2 || parts.slice(0, 2).some((item) => Number.isNaN(item))) {
    return null;
  }
  const [start, end] = parts;
  return {
    start,
    length: Math.max(1, end - start + 1),
    marker: Number.isNaN(parts[2]) ? 1 : parts[2],
  };
}

export function parseSettingBitNumber(value: string | number, fallback: number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number.parseInt(
    value.toLowerCase().replace('bit', '').replace('个bits', '').trim(),
    10,
  );
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatHandleParamFromBitRange(
  current: string | undefined,
  nextStart: string | number | null,
  nextLength: string | number | null,
) {
  const parsed = parseHandleParamParts(current) ?? { start: 0, length: 1, marker: 1 };
  const start = Math.max(0, parseSettingBitNumber(nextStart ?? parsed.start, parsed.start));
  const length = Math.max(1, parseSettingBitNumber(nextLength ?? parsed.length, parsed.length));
  const end = start + length - 1;
  return `${start}->${end}->${parsed.marker}`;
}

export function countSdoParameters(node: SdoNodeDocument): number {
  if (node.type === 1) return 1;
  return (node.children ?? []).reduce((total, child) => total + countSdoParameters(child), 0);
}

export function countSdoDirectParameters(node: SdoNodeDocument): number {
  return (node.children ?? []).filter((child) => child.type === 1).length;
}

export function normalizeSettingSearch(value: string) {
  return value.trim().toLowerCase();
}

export function sdoNodeName(node: SdoNodeDocument, fallback: string) {
  return node.name?.trim() || fallback;
}

export function formatSettingPath(pathNames: string[]) {
  return pathNames.length > 0 ? pathNames.join(' -> ') : '菜单';
}

export function isBooleanMonitorParameter(node: SdoNodeDocument) {
  return String(node.data_min ?? '') === '0' && String(node.data_max ?? '') === '1';
}

export function settingNodeSearchText(node: SdoNodeDocument, pathNames: string[]) {
  return normalizeSettingSearch(
    [
      ...pathNames,
      node.name,
      sdoAuthLabel(node.user_auth),
      sdoAccessLabel(node.control_rw),
      sdoProtocolLabel(node.control_protocol),
      settingDataTypeLabel(node),
      formatHex(node.fid, 2),
      formatHex(node.mid, 4),
      node.sid,
      node.data_default,
      node.data_min,
      node.data_max,
    ]
      .filter((item) => item !== undefined && item !== null)
      .join(' '),
  );
}

export function settingNodeMatchesQuery(node: SdoNodeDocument, query: string, pathNames: string[]) {
  if (!query) return true;
  return settingNodeSearchText(node, pathNames).includes(query);
}

export function settingMenuHasMatchedDescendant(
  node: SdoNodeDocument,
  query: string,
  pathNames: string[],
): boolean {
  if (!query) return true;
  return (node.children ?? []).some((child, index) => {
    const childName = sdoNodeName(
      child,
      child.type === 0 ? `菜单${index + 1}` : `参数${index + 1}`,
    );
    const childPathNames = child.type === 0 ? [...pathNames, childName] : pathNames;
    return (
      settingNodeMatchesQuery(child, query, childPathNames) ||
      settingMenuHasMatchedDescendant(child, query, childPathNames)
    );
  });
}

export function collectSettingMenus(root: SdoNodeDocument | null, rawQuery = ''): SettingMenuRow[] {
  if (!root) return [];
  const query = normalizeSettingSearch(rawQuery);
  const rows: SettingMenuRow[] = [];
  function visit(node: SdoNodeDocument, path: number[], level: number, parentNames: string[]) {
    if (node.type !== 0) return;
    const name = sdoNodeName(
      node,
      level === 0 ? `菜单${path[path.length - 1] + 1}` : `子菜单${path[path.length - 1] + 1}`,
    );
    const pathNames = [...parentNames, name];
    const isSearchMatch = settingNodeMatchesQuery(node, query, pathNames);
    const hasSearchMatchInChildren = settingMenuHasMatchedDescendant(node, query, pathNames);
    if (!query || isSearchMatch || hasSearchMatchInChildren) {
      rows.push({
        key: path.join('/'),
        path,
        name,
        pathNames,
        level,
        auth: sdoAuthLabel(node.user_auth),
        parameterCount: countSdoParameters(node),
        directParameterCount: countSdoDirectParameters(node),
        hasMenuChildren: (node.children ?? []).some((child) => child.type === 0),
        isSearchMatch,
        hasSearchMatchInChildren,
      });
    }
    (node.children ?? []).forEach((child, index) => visit(child, [...path, index], level + 1, pathNames));
  }
  (root.children ?? []).forEach((node, index) => visit(node, [index], 0, [root.name || '菜单']));
  return rows;
}

export function sdoNodeByPath(root: SdoNodeDocument | null, path: string | null) {
  if (!root || !path) return null;
  return path.split('/').reduce<SdoNodeDocument | null>((node, segment) => {
    if (!node) return null;
    return node.children?.[Number(segment)] ?? null;
  }, root);
}

export function pathStringToNumbers(path: string | null) {
  if (!path) return [];
  return path.split('/').map((segment) => Number(segment)).filter((segment) => Number.isFinite(segment));
}

export function sdoNodeByNumberPath(root: SdoNodeDocument | null, path: number[] | null) {
  if (!root || !path) return null;
  return path.reduce<SdoNodeDocument | null>((node, segment) => {
    if (!node) return null;
    return node.children?.[segment] ?? null;
  }, root);
}

export function settingPathNames(root: SdoNodeDocument | null, path: number[]) {
  const names = root?.name ? [root.name] : ['菜单'];
  let node = root;
  for (const segment of path) {
    node = node?.children?.[segment] ?? null;
    if (!node) break;
    names.push(sdoNodeName(node, node.type === 0 ? '菜单' : '参数'));
  }
  return names;
}

export function collectSettingParameters(
  node: SdoNodeDocument | null,
  basePath: number[],
  basePathNames: string[] = [],
  rawQuery = '',
): SettingParameterRow[] {
  if (!node) return [];
  const rows: SettingParameterRow[] = [];
  const query = normalizeSettingSearch(rawQuery);
  function visit(current: SdoNodeDocument, path: number[], pathNames: string[]) {
    if (current.type === 1) {
      const handle = parseHandleParam(current.handle_param);
      const isReadonly = current.control_rw === 0 || current.control_rw === undefined;
      const isBooleanMonitor = isBooleanMonitorParameter(current);
      const usageHint = isReadonly && isBooleanMonitor
        ? '只读监测项，0/1 表示开关状态；本页可编辑配置定义，不能直接写入运行状态。'
        : isReadonly
          ? '只读参数；本页可编辑配置定义，不能直接写入运行值。'
          : '读写参数；可根据权限编辑配置定义。';
      const row: SettingParameterRow = {
        index: rows.length + 1,
        path,
        name: current.name || '-',
        menuPath: formatSettingPath(pathNames),
        pathNames,
        auth: sdoAuthLabel(current.user_auth),
        protocol: sdoProtocolLabel(current.control_protocol),
        frameId: formatHex(current.fid, 2),
        mainIndex: formatHex(current.mid, 4),
        subIndex: String(current.sid ?? ''),
        access: sdoAccessLabel(current.control_rw),
        maxValue: current.data_max ?? '',
        minValue: current.data_min ?? '',
        defaultValue: current.data_default ?? '',
        dataType: settingDataTypeLabel(current),
        bitStart: handle.bitStart,
        bitLength: handle.bitLength,
        preprocess: current.pre_handle_name ?? '原始数据',
        scale: current.pre_handle_scale ?? '',
        offset: current.pre_handle_offset ?? '',
        decimals: current.pre_handle_decimal_name ?? String(current.pre_handle_decimal ?? ''),
        isReadonly,
        isBooleanMonitor,
        usageHint,
      };
      const searchText = normalizeSettingSearch([
        row.name,
        row.menuPath,
        row.usageHint,
        row.auth,
        row.protocol,
        row.frameId,
        row.mainIndex,
        row.subIndex,
        row.access,
        row.dataType,
      ].join(' '));
      if (!query || searchText.includes(query)) {
        row.index = rows.length + 1;
        rows.push(row);
      }
      return;
    }
    const nextPathNames = current.type === 0
      ? [...pathNames, sdoNodeName(current, `菜单${path[path.length - 1] + 1}`)]
      : pathNames;
    (current.children ?? []).forEach((child, index) => visit(child, [...path, index], nextPathNames));
  }
  (node.children ?? []).forEach((child, index) => visit(child, [...basePath, index], basePathNames));
  return rows;
}

export function isSameOrDescendantPath(path: number[], target: number[]) {
  return target.length >= path.length && path.every((part, index) => target[index] === part);
}

export function updateSdoNodeAtPath(
  node: SdoNodeDocument,
  path: number[],
  updater: (node: SdoNodeDocument) => SdoNodeDocument,
): SdoNodeDocument {
  if (path.length === 0) return updater(node);
  const [index, ...rest] = path;
  return {
    ...node,
    children: (node.children ?? []).map((child, currentIndex) => (
      currentIndex === index ? updateSdoNodeAtPath(child, rest, updater) : child
    )),
  };
}
