import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BatteryMonitorProtocol,
  LocalizationDocument,
} from '../src/types/platform.ts';
import { validateBatteryMonitor } from '../src/features/battery-monitor/batteryMonitorValidation.ts';

function validV2Protocol(): BatteryMonitorProtocol {
  return {
    schema_version: 2,
    enabled: true,
    version: 2,
    default_timeout_ticks: 200,
    page_size: 4,
    frames: [
      {
        frame_key: 'battery_status',
        can_id: 0x321,
        frame_type: 0,
        dlc: 8,
        desc: 'Battery status',
        timeout_ticks: 200,
      },
    ],
    signals: [
      {
        signal_key: 'battery_soc',
        name: 'battery.soc.signal',
        inner: -1,
        frame_key: 'battery_status',
        pos: 0,
        len: 8,
        byte_order: 'little_endian',
        raw_offset: 0,
        raw_type: 'u8',
        value_type: 'u8',
        parse_resolution: 1,
        parse_offset: 0,
        parse_mask: 0xff,
        parse_shift: 0,
      },
    ],
    items: [
      {
        item_key: 'soc',
        enabled: true,
        order: 0,
        signal_key: 'battery_soc',
        name_key: 'battery.soc',
        fallback_name: 'battery.soc.fallback',
        unit: 'battery.soc.unit',
        formatter: {
          kind: 'linear',
          offset: 0,
          scale_num: 1,
          scale_den: 1,
          decimals: 0,
        },
        validity: {
          mode: 'frame_timeout',
          frame_key: 'battery_status',
          empty_text: 'battery.soc.empty',
        },
      },
    ],
  };
}

function localization(): LocalizationDocument {
  return {
    default_locale: 'zh-CN',
    locale_order: ['zh-CN', 'en-US'],
    locales: {
      'zh-CN': {
        enabled: true,
        translations: {
          'language.name.zh-CN': '中文',
          'language.name.en-US': '英文',
          'battery.soc.signal': '电量信号',
          'battery.soc': '电量',
          'battery.soc.fallback': '电量',
          'battery.soc.unit': '%',
          'battery.soc.empty': '--',
        },
      },
      'en-US': {
        enabled: true,
        translations: {
          'language.name.zh-CN': 'Chinese',
          'language.name.en-US': 'English',
          'battery.soc.signal': 'Battery SOC',
          'battery.soc': 'SOC',
          'battery.soc.fallback': 'Battery SOC',
          'battery.soc.unit': '%',
          'battery.soc.empty': '--',
        },
      },
    },
  };
}

test('accepts a complete jc002 battery monitor contract', () => {
  const report = validateBatteryMonitor(validV2Protocol(), {
    localization: localization(),
  });

  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
});

test('reports jc002 version and relationship errors without mutating data', () => {
  const protocol = {
    ...validV2Protocol(),
    schema_version: 1,
    version: 1,
    signals: validV2Protocol().signals.map((signal) => ({ ...signal, pos: 63 })),
    items: validV2Protocol().items.map((item) => ({ ...item, signal_key: 'missing_signal', name_key: 'missing.message' })),
  } as unknown as BatteryMonitorProtocol;

  const report = validateBatteryMonitor(protocol, {
    localization: localization(),
  });

  assert.equal(report.valid, false);
  assert.deepEqual(
    report.errors.map((issue) => issue.code),
    ['v2SchemaVersion', 'v2BinaryVersion', 'invalidSignalRange', 'missingSignal', 'missingLocalization'],
  );
  assert.equal(protocol.schema_version, 1);
  assert.equal(protocol.items[0].name_key, 'missing.message');
});

test('keeps a missing fallback as a warning while allowing export review to continue', () => {
  const protocol = validV2Protocol();
  protocol.items[0].fallback_name = '';

  const report = validateBatteryMonitor(protocol, {
    localization: localization(),
  });

  assert.equal(report.valid, true);
  assert.deepEqual(report.warnings.map((issue) => issue.code), ['missingFallback']);
});
