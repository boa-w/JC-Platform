import { useEffect, useState } from 'react';
import type { ExportBatteryOptions } from '../types/platform';
import { getStorageItem, setStorageItem } from '../utils/safeStorage';

const STORAGE_KEY = 'jc-platform.export.battery-options';

export const defaultExportBatteryOptions: ExportBatteryOptions = {
  battery_protocol: {
    config: false,
    bin: false,
  },
  battery_monitor_info: {
    config: true,
    bin: true,
  },
  fault_code_info: {
    config: true,
    bin: true,
  },
};

type ExportBatterySection = keyof ExportBatteryOptions;
type ExportBatteryTarget = keyof ExportBatteryOptions[ExportBatterySection];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolOrDefault(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeExportBatteryOptions(value: unknown): ExportBatteryOptions {
  const root = isRecord(value) ? value : {};
  const protocol = isRecord(root.battery_protocol) ? root.battery_protocol : {};
  const monitor = isRecord(root.battery_monitor_info) ? root.battery_monitor_info : {};
  const faultCode = isRecord(root.fault_code_info) ? root.fault_code_info : {};

  return {
    battery_protocol: {
      config: boolOrDefault(protocol.config, defaultExportBatteryOptions.battery_protocol.config),
      bin: boolOrDefault(protocol.bin, defaultExportBatteryOptions.battery_protocol.bin),
    },
    battery_monitor_info: {
      config: boolOrDefault(
        monitor.config,
        defaultExportBatteryOptions.battery_monitor_info.config,
      ),
      bin: boolOrDefault(monitor.bin, defaultExportBatteryOptions.battery_monitor_info.bin),
    },
    fault_code_info: {
      config: boolOrDefault(faultCode.config, defaultExportBatteryOptions.fault_code_info.config),
      bin: boolOrDefault(faultCode.bin, defaultExportBatteryOptions.fault_code_info.bin),
    },
  };
}

function getInitialExportBatteryOptions(): ExportBatteryOptions {
  if (typeof window === 'undefined') return defaultExportBatteryOptions;
  const stored = getStorageItem(STORAGE_KEY);
  if (!stored) return defaultExportBatteryOptions;
  try {
    return normalizeExportBatteryOptions(JSON.parse(stored));
  } catch {
    return defaultExportBatteryOptions;
  }
}

export function useExportBatteryOptions() {
  const [options, setOptions] = useState<ExportBatteryOptions>(getInitialExportBatteryOptions);

  useEffect(() => {
    setStorageItem(STORAGE_KEY, JSON.stringify(options));
  }, [options]);

  function updateOption(
    section: ExportBatterySection,
    target: ExportBatteryTarget,
    value: boolean,
  ) {
    setOptions((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [target]: value,
      },
    }));
  }

  function resetOptions() {
    setOptions(defaultExportBatteryOptions);
  }

  return { options, updateOption, resetOptions } as const;
}
