const defaultBatteryProtocol = {
  default_timeout_ticks: 200,
  frames: [],
  signals: [],
};

const defaultBatteryMonitorInfo = {
  enabled: true,
  page_size: 4,
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

const defaultExportInfo = {
  folder_name: 'jc_export',
  manifest_filename: 'ConfigUpdate.json',
  binary_filename: 'pdo_sdo_data.bin',
};

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function withRequiredEditorSections(document: unknown) {
  const source = (document as Record<string, unknown>) ?? {};
  const defaults: Record<string, unknown> = {};
  if (!source.export_info) defaults.export_info = cloneDefault(defaultExportInfo);
  if (!source.battery_protocol) defaults.battery_protocol = cloneDefault(defaultBatteryProtocol);
  if (!source.battery_monitor_info)
    defaults.battery_monitor_info = cloneDefault(defaultBatteryMonitorInfo);
  if (!source.fault_code_info) defaults.fault_code_info = cloneDefault(defaultFaultCodeInfo);
  return Object.keys(defaults).length > 0 ? { ...source, ...defaults } : null;
}
