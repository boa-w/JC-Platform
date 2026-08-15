import type { BatteryMonitorProtocol, ProjectExportSettings } from '../../types/platform';

export const defaultBatteryMonitor: BatteryMonitorProtocol = {
  schema_version: 1,
  enabled: false,
  version: 1,
  default_timeout_ticks: 200,
  page_size: 4,
  frames: [],
  signals: [],
  items: [],
};

const defaultFaultCodeInfo = {
  schema_version: 1,
  enabled: true,
  version: 1,
  sources: [
    {
      source_key: 'traction',
      source_id: 1,
      type_char: 'T',
      name: '牵引',
      can_id: 648,
      frame_type: 0,
      code_byte: 2,
      clear_code: 0,
      invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      enabled: true,
    },
    {
      source_key: 'pump',
      source_id: 2,
      type_char: 'P',
      name: '油泵',
      can_id: 660,
      frame_type: 0,
      code_byte: 2,
      clear_code: 0,
      invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      enabled: true,
    },
  ],
  codes: [],
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
  const source = (document as Record<string, unknown>) ?? {};
  if (source.config_version === 'jc002') return null;
  const defaults: Record<string, unknown> = {};
  if (!isRecord(source.export_info)) {
    defaults.export_info = cloneDefault(defaultExportInfo);
  } else if (
    !hasExportTargetFlags(source.export_info.battery_monitor) ||
    !hasExportTargetFlags(source.export_info.fault_code_info)
  ) {
    defaults.export_info = {
      ...source.export_info,
      battery_monitor: {
        ...defaultExportInfo.battery_monitor,
        ...(isRecord(source.export_info.battery_monitor) ? source.export_info.battery_monitor : {}),
      },
      fault_code_info: {
        ...defaultExportInfo.fault_code_info,
        ...(isRecord(source.export_info.fault_code_info) ? source.export_info.fault_code_info : {}),
      },
    };
  }
  if (!source.battery_monitor) defaults.battery_monitor = cloneDefault(defaultBatteryMonitor);
  if (!source.fault_code_info) defaults.fault_code_info = cloneDefault(defaultFaultCodeInfo);
  return Object.keys(defaults).length > 0 ? { ...source, ...defaults } : null;
}
