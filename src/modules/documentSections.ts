import type { LegacyTableKind, NavigationKey } from '../types/platform';
import {
  activeBatteryProtocolProfile,
  activeControllerProtocolProfile,
  activeFaultCodeProtocolProfile,
} from '../features/protocol-profiles/protocolProfiles';

type JsonEditorMode = 'simple' | 'advanced';

type JsonEditorContext = {
  realtimeMode: JsonEditorMode;
  configVersion?: string;
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
  | 'canopen'
  | 'protocol_profiles'
  | 'language_info'
  | 'localization'
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
  canopen: 'documentSections.canopen',
  protocol_profiles: 'documentSections.protocolProfiles',
  language_info: 'documentSections.languages',
  localization: 'documentSections.languages',
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
  'canopen-export': 'canopen',
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
  if (key === 'realtime-data') {
    return context.configVersion === 'jc002' || context.realtimeMode === 'advanced'
      ? 'pdo-advanced'
      : 'pdo-simple';
  }
  return key;
}

export function documentSectionForModule(key: NavigationKey): DocumentSectionKey | null {
  return sectionByModule[key] ?? null;
}

export function languageSectionForDocument(
  document: Record<string, unknown>,
): 'language_info' | 'localization' {
  return document.config_version === 'jc002' ? 'localization' : 'language_info';
}

function protocolSectionForV2(
  document: Record<string, unknown>,
  section: DocumentSectionKey,
): unknown {
  if (document.config_version !== 'jc002') return document[section];
  if (
    section === 'canopen' ||
    section === 'sdo_info' ||
    advancedConfigSections.includes(section as (typeof advancedConfigSections)[number])
  ) {
    const protocol = activeControllerProtocolProfile(document)?.protocol;
    if (section === 'sdo_info') return protocol?.sdo_info;
    if (section === 'canopen') return protocol?.canopen;
    return protocol?.[
      section as 'pdo_global_param' | 'pdo_condition' | 'pdo_recv' | 'pdo_send'
    ];
  }
  if (section === 'battery_monitor') {
    return activeBatteryProtocolProfile(document)?.protocol.battery_monitor;
  }
  if (section === 'fault_code_info') {
    return activeFaultCodeProtocolProfile(document)?.protocol.fault_code_info;
  }
  return document[section];
}

export function configSectionForEditor(
  document: Record<string, unknown>,
  key: NavigationKey,
  context: JsonEditorContext,
) {
  const jsonEditorKey = jsonEditorKeyForModule(key, context);
  if (jsonEditorKey === 'sdo') return protocolSectionForV2(document, 'sdo_info');
  if (jsonEditorKey === 'pdo-simple') return document.pdo_simple_send_recv;
  if (jsonEditorKey === 'pdo-advanced') {
    const source = context.configVersion === 'jc002'
      ? activeControllerProtocolProfile(document)?.protocol
      : document;
    return Object.fromEntries(
      advancedConfigSections.map((section) => [section, source?.[section]]),
    );
  }
  if (key === 'language') return document[languageSectionForDocument(document)];
  const section = documentSectionForModule(key);
  return section ? protocolSectionForV2(document, section) : null;
}

export function restorePathsForEditor(
  key: NavigationKey,
  context: JsonEditorContext,
  document?: Record<string, unknown>,
) {
  const jsonEditorKey = jsonEditorKeyForModule(key, context);
  if (
    context.configVersion === 'jc002' &&
    (jsonEditorKey === 'sdo' ||
      jsonEditorKey === 'pdo-advanced' ||
      key === 'canopen-export' ||
      key === 'battery-monitor')
  ) {
    return [['protocol_profiles']];
  }
  if (jsonEditorKey === 'sdo') return [['sdo_info']];
  if (jsonEditorKey === 'pdo-simple') return [['pdo_simple_send_recv']];
  if (jsonEditorKey === 'pdo-advanced') return advancedConfigSections.map((section) => [section]);
  const section =
    key === 'language' && document
      ? languageSectionForDocument(document)
      : documentSectionForModule(key);
  return section ? [[section]] : [];
}

export function shouldRefreshUnifiedProtocol(key: NavigationKey) {
  return key === 'signal-dictionary' || key === 'private-protocol' || key === 'protocol-mapping';
}
