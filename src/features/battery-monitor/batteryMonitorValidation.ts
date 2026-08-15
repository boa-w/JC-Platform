import type { BatteryMonitorProtocol, LocalizationDocument } from '../../types/platform';

export type BatteryValidationSeverity = 'error' | 'warning';

export type BatteryValidationCode =
  | 'v2SchemaVersion'
  | 'v2BinaryVersion'
  | 'enabledWithoutData'
  | 'duplicateKey'
  | 'duplicateCanId'
  | 'invalidCanId'
  | 'invalidDlc'
  | 'missingFrame'
  | 'invalidSignalRange'
  | 'missingSignal'
  | 'missingSignalMessageKey'
  | 'missingMessageKey'
  | 'missingLocalization'
  | 'duplicateOrder'
  | 'invalidScaleDen'
  | 'missingFallback'
  | 'invalidPageSize';

export interface BatteryValidationIssue {
  severity: BatteryValidationSeverity;
  code: BatteryValidationCode;
  path: string[];
  values?: Record<string, string | number>;
}

export interface BatteryValidationReport {
  errors: BatteryValidationIssue[];
  warnings: BatteryValidationIssue[];
  valid: boolean;
}

function issue(
  severity: BatteryValidationSeverity,
  code: BatteryValidationCode,
  path: string[],
  values?: Record<string, string | number>,
): BatteryValidationIssue {
  return { severity, code, path, values };
}

function duplicateIndexes(values: string[]) {
  const indexes = new Map<string, number[]>();
  values.forEach((value, index) => {
    if (!value) return;
    indexes.set(value, [...(indexes.get(value) ?? []), index]);
  });
  return [...indexes.entries()].filter(([, positions]) => positions.length > 1);
}

function localizationKeys(localization?: LocalizationDocument) {
  const keys = new Set<string>();
  if (!localization) return keys;
  for (const locale of localization.locale_order) {
    for (const key of Object.keys(localization.locales[locale]?.translations ?? {})) {
      keys.add(key);
    }
  }
  return keys;
}

export function validateBatteryMonitor(
  protocol: BatteryMonitorProtocol,
  options: { localization?: LocalizationDocument },
): BatteryValidationReport {
  const errors: BatteryValidationIssue[] = [];
  const warnings: BatteryValidationIssue[] = [];
  const add = (
    severity: BatteryValidationSeverity,
    code: BatteryValidationCode,
    path: string[],
    values?: Record<string, string | number>,
  ) => {
    (severity === 'error' ? errors : warnings).push(issue(severity, code, path, values));
  };

  if (protocol.schema_version !== 2) {
    add('error', 'v2SchemaVersion', ['battery_monitor', 'schema_version'], {
      actual: protocol.schema_version,
    });
  }
  if (protocol.version !== 2) {
    add('error', 'v2BinaryVersion', ['battery_monitor', 'version'], {
      actual: protocol.version,
    });
  }
  if (protocol.page_size < 1 || protocol.page_size > 64) {
    add('error', 'invalidPageSize', ['battery_monitor', 'page_size'], {
      actual: protocol.page_size,
    });
  }
  if (
    protocol.enabled &&
    (!protocol.frames.length || !protocol.signals.length || !protocol.items.length)
  ) {
    add('error', 'enabledWithoutData', ['battery_monitor']);
  }

  for (const [key, positions] of duplicateIndexes(
    protocol.frames.map((frame) => frame.frame_key),
  )) {
    add('error', 'duplicateKey', ['battery_monitor', 'frames'], {
      kind: 'frame',
      key,
      count: positions.length,
    });
  }
  for (const [key, positions] of duplicateIndexes(
    protocol.signals.map((signal) => signal.signal_key),
  )) {
    add('error', 'duplicateKey', ['battery_monitor', 'signals'], {
      kind: 'signal',
      key,
      count: positions.length,
    });
  }
  for (const [key, positions] of duplicateIndexes(protocol.items.map((item) => item.item_key))) {
    add('error', 'duplicateKey', ['battery_monitor', 'items'], {
      kind: 'item',
      key,
      count: positions.length,
    });
  }

  const frameByKey = new Map(protocol.frames.map((frame) => [frame.frame_key, frame]));
  const signalByKey = new Map(protocol.signals.map((signal) => [signal.signal_key, signal]));
  const canIds = new Map<string, number[]>();

  protocol.frames.forEach((frame, index) => {
    const maxCanId = frame.frame_type === 1 ? 0x1fffffff : 0x7ff;
    if (frame.can_id < 0 || frame.can_id > maxCanId) {
      add('error', 'invalidCanId', ['battery_monitor', 'frames', String(index), 'can_id'], {
        key: frame.frame_key,
        actual: frame.can_id,
      });
    }
    if (frame.dlc < 1 || frame.dlc > 8) {
      add('error', 'invalidDlc', ['battery_monitor', 'frames', String(index), 'dlc'], {
        key: frame.frame_key,
        actual: frame.dlc,
      });
    }
    const canKey = `${frame.frame_type}:${frame.can_id}`;
    canIds.set(canKey, [...(canIds.get(canKey) ?? []), index]);
  });
  for (const [key, positions] of canIds) {
    if (positions.length > 1) {
      add('error', 'duplicateCanId', ['battery_monitor', 'frames'], {
        key,
        count: positions.length,
      });
    }
  }

  const keys = localizationKeys(options.localization);
  protocol.signals.forEach((signal, index) => {
    if (!signal.name.trim()) {
      add('error', 'missingSignalMessageKey', ['battery_monitor', 'signals', String(index), 'name'], {
        key: signal.signal_key,
      });
    } else if (!keys.has(signal.name)) {
      add('error', 'missingLocalization', ['battery_monitor', 'signals', String(index), 'name'], {
        key: signal.signal_key,
        nameKey: signal.name,
      });
    }
    const frame = frameByKey.get(signal.frame_key);
    if (!frame) {
      add('error', 'missingFrame', ['battery_monitor', 'signals', String(index), 'frame_key'], {
        key: signal.signal_key,
        frame: signal.frame_key,
      });
      return;
    }
    if (signal.len < 1 || signal.pos < 0 || signal.pos + signal.len > frame.dlc * 8) {
      add('error', 'invalidSignalRange', ['battery_monitor', 'signals', String(index)], {
        key: signal.signal_key,
        frame: signal.frame_key,
        end: signal.pos + signal.len,
        capacity: frame.dlc * 8,
      });
    }
  });

  const enabledOrders = new Map<number, number[]>();
  protocol.items.forEach((item, index) => {
    const signal = signalByKey.get(item.signal_key);
    if (!signal) {
      add('error', 'missingSignal', ['battery_monitor', 'items', String(index), 'signal_key'], {
        key: item.item_key,
        signal: item.signal_key,
      });
    }
    if (!item.name_key.trim()) {
      add('error', 'missingMessageKey', ['battery_monitor', 'items', String(index), 'name_key'], {
        key: item.item_key,
      });
    } else if (!keys.has(item.name_key)) {
      add('error', 'missingLocalization', ['battery_monitor', 'items', String(index), 'name_key'], {
        key: item.item_key,
        nameKey: item.name_key,
      });
    }
    if (!item.fallback_name.trim()) {
      add('warning', 'missingFallback', ['battery_monitor', 'items', String(index)], {
        key: item.item_key,
      });
    }
    if (item.formatter.scale_den === 0) {
      add('error', 'invalidScaleDen', ['battery_monitor', 'items', String(index), 'formatter'], {
        key: item.item_key,
      });
    }
    if (item.validity.frame_key && !frameByKey.has(item.validity.frame_key)) {
      add('error', 'missingFrame', ['battery_monitor', 'items', String(index), 'validity'], {
        key: item.item_key,
        frame: item.validity.frame_key,
      });
    }
    if (item.enabled) {
      enabledOrders.set(item.order, [...(enabledOrders.get(item.order) ?? []), index]);
    }
  });
  for (const [order, positions] of enabledOrders) {
    if (positions.length > 1) {
      add('error', 'duplicateOrder', ['battery_monitor', 'items'], {
        order,
        count: positions.length,
      });
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}
