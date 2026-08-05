import type { LegacyTableKind, NavigationKey } from '../types/platform';

type JsonEditorMode = 'simple' | 'advanced';

type JsonEditorContext = {
  realtimeMode: JsonEditorMode;
};

export type DocumentSectionKey =
  | 'export_info'
  | 'ui_info'
  | 'sdo_info'
  | 'pdo_simple_send_recv'
  | 'pdo_global_param'
  | 'pdo_condition'
  | 'pdo_recv'
  | 'pdo_send'
  | 'language_info'
  | 'battery_monitor'
  | 'fault_code_info'
  | 'signal_dictionary'
  | 'private_protocol'
  | 'protocol_mapping';

export type JsonEditorKey = NavigationKey | 'sdo' | 'pdo-simple' | 'pdo-advanced';

export const modifiedSectionLabelKeys: Record<DocumentSectionKey, string> = {
  export_info: 'documentSections.exportSettings',
  ui_info: 'documentSections.uiResources',
  sdo_info: 'documentSections.sdoParameters',
  pdo_simple_send_recv: 'documentSections.pdoSimple',
  pdo_global_param: 'documentSections.pdoGlobals',
  pdo_condition: 'documentSections.pdoConditions',
  pdo_recv: 'documentSections.pdoReceive',
  pdo_send: 'documentSections.pdoSend',
  language_info: 'documentSections.languages',
  battery_monitor: 'documentSections.batteryMonitor',
  fault_code_info: 'documentSections.faultCodes',
  signal_dictionary: 'documentSections.signalDictionary',
  private_protocol: 'documentSections.privateProtocol',
  protocol_mapping: 'documentSections.protocolMapping',
};

export const trackedDocumentSections = Object.keys(
  modifiedSectionLabelKeys,
) as DocumentSectionKey[];

export const refactorOnlySections = [
  'signal_dictionary',
  'private_protocol',
  'protocol_mapping',
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
  'battery-monitor': 'battery_monitor',
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
