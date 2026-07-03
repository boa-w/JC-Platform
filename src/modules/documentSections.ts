import type { LegacyTableKind, NavigationKey } from '../types/platform';

type JsonEditorMode = 'simple' | 'advanced';

type JsonEditorContext = {
  realtimeMode: JsonEditorMode;
};

export type DocumentSectionKey =
  | 'ui_info'
  | 'sdo_info'
  | 'pdo_simple_send_recv'
  | 'pdo_global_param'
  | 'pdo_condition'
  | 'pdo_recv'
  | 'pdo_send'
  | 'language_info'
  | 'battery_protocol'
  | 'battery_monitor_info'
  | 'fault_code_info'
  | 'signal_dictionary'
  | 'private_protocol'
  | 'protocol_mapping';

export type JsonEditorKey = NavigationKey | 'sdo' | 'pdo-simple' | 'pdo-advanced';

export const modifiedSectionLabels: Record<DocumentSectionKey, string> = {
  ui_info: 'UI 资源',
  sdo_info: 'SDO 参数',
  pdo_simple_send_recv: 'PDO 简化配置',
  pdo_global_param: 'PDO 全局变量',
  pdo_condition: 'PDO 条件表',
  pdo_recv: 'PDO 接收帧',
  pdo_send: 'PDO 发送帧',
  language_info: '多国语言',
  battery_protocol: '锂电协议',
  battery_monitor_info: '锂电监控显示',
  fault_code_info: '故障代码',
  signal_dictionary: '业务信号字典',
  private_protocol: '私有协议',
  protocol_mapping: '协议映射',
};

export const trackedDocumentSections = Object.keys(modifiedSectionLabels) as DocumentSectionKey[];

export const refactorOnlySections = [
  'signal_dictionary',
  'private_protocol',
  'protocol_mapping',
  'battery_protocol',
  'battery_monitor_info',
] as const;

export type RefactorOnlySection = (typeof refactorOnlySections)[number];

export const advancedConfigSections = [
  'pdo_global_param',
  'pdo_condition',
  'pdo_recv',
  'pdo_send',
] as const;

const legacyTableByModule: Partial<Record<NavigationKey, LegacyTableKind>> = {
  'setting-data': 'sdo',
  'realtime-data': 'pdoSimple',
  language: 'language',
};

const sectionByModule: Partial<Record<NavigationKey, DocumentSectionKey>> = {
  language: 'language_info',
  'battery-protocol': 'battery_protocol',
  'battery-monitor': 'battery_monitor_info',
  'signal-dictionary': 'signal_dictionary',
  'private-protocol': 'private_protocol',
  'protocol-mapping': 'protocol_mapping',
};

export function legacyTableKindForModule(key: NavigationKey): LegacyTableKind | null {
  return legacyTableByModule[key] ?? null;
}

export function jsonEditorKeyForModule(
  key: NavigationKey,
  context: JsonEditorContext,
): JsonEditorKey {
  if (key === 'setting-data') return 'sdo';
  if (key === 'realtime-data')
    return context.realtimeMode === 'simple' ? 'pdo-simple' : 'pdo-advanced';
  return key;
}

export function documentSectionForModule(key: NavigationKey): DocumentSectionKey | null {
  return sectionByModule[key] ?? null;
}

export function configSectionForEditor(
  document: Record<string, unknown>,
  key: NavigationKey,
  context: JsonEditorContext,
) {
  const jsonEditorKey = jsonEditorKeyForModule(key, context);
  if (jsonEditorKey === 'sdo') return document.sdo_info;
  if (jsonEditorKey === 'pdo-simple') return document.pdo_simple_send_recv;
  if (jsonEditorKey === 'pdo-advanced') {
    return Object.fromEntries(
      advancedConfigSections.map((section) => [section, document[section]]),
    );
  }
  const section = documentSectionForModule(key);
  return section ? document[section] : null;
}

export function restorePathsForEditor(key: NavigationKey, context: JsonEditorContext) {
  const jsonEditorKey = jsonEditorKeyForModule(key, context);
  if (jsonEditorKey === 'sdo') return [['sdo_info']];
  if (jsonEditorKey === 'pdo-simple') return [['pdo_simple_send_recv']];
  if (jsonEditorKey === 'pdo-advanced') return advancedConfigSections.map((section) => [section]);
  const section = documentSectionForModule(key);
  return section ? [[section]] : [];
}

export function shouldRefreshUnifiedProtocol(key: NavigationKey) {
  return key === 'signal-dictionary' || key === 'private-protocol' || key === 'protocol-mapping';
}
