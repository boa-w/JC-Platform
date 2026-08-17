import type { BatteryMonitorProtocol, ProjectExportSettings } from '../../types/platform';

export const defaultBatteryMonitor: BatteryMonitorProtocol = {
  schema_version: 2,
  enabled: false,
  version: 2,
  default_timeout_ticks: 200,
  page_size: 4,
  frames: [],
  signals: [],
  items: [],
};

export const defaultExportInfo: ProjectExportSettings = {
  folder_name: 'jc_export',
  manifest_filename: 'ConfigUpdate.json',
  binary_filename: 'pdo_sdo_data.bin',
  battery_monitor: {
    config: true,
    bin: true,
  },
  fault_code_info: {
    config: true,
    bin: true,
  },
};

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExportTargetFlags(value: unknown) {
  return isRecord(value) && typeof value.config === 'boolean' && typeof value.bin === 'boolean';
}

export function withRequiredEditorSections(document: unknown) {
  const source = { ...((document as Record<string, unknown>) ?? {}) };
  if (source.config_version === 'jc002') return null;
  const defaults: Record<string, unknown> = {};
  const sourceExportInfo = isRecord(source.export_info) ? source.export_info : null;
  const legacyExportInfo = sourceExportInfo
    ? { ...sourceExportInfo }
    : cloneDefault(defaultExportInfo);
  delete legacyExportInfo.fault_code_info;
  if (!isRecord(source.export_info)) {
    defaults.export_info = legacyExportInfo;
  } else if (sourceExportInfo && 'fault_code_info' in sourceExportInfo) {
    defaults.export_info = legacyExportInfo;
  } else if (!hasExportTargetFlags(source.export_info.battery_monitor)) {
    defaults.export_info = {
      ...source.export_info,
      battery_monitor: {
        ...defaultExportInfo.battery_monitor,
        ...(isRecord(source.export_info.battery_monitor) ? source.export_info.battery_monitor : {}),
      },
    };
  }
  return Object.keys(defaults).length > 0 ? { ...source, ...defaults } : null;
}
