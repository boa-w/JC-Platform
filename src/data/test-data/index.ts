import type {
  BatteryMonitorInfo,
  BatteryProtocol,
  PdoAdvancedDocument,
  PdoSimpleDocument,
} from '../../types/platform';
import { batteryMonitorTestData } from './battery-monitor';
import { pdoAdvancedTestData } from './pdo-advanced';
import { pdoSimpleTestData } from './pdo-simple';

export type TestDataType = 'pdo-simple' | 'pdo-advanced' | 'battery-monitor' | 'battery-protocol';

export interface TestDataResult {
  pdoSimple?: PdoSimpleDocument;
  pdoAdvanced?: PdoAdvancedDocument;
  batteryMonitor?: BatteryMonitorInfo;
  batteryProtocol?: BatteryProtocol;
}

export const testDataLabels: Record<TestDataType, string> = {
  'pdo-simple': 'PDO 简化配置',
  'pdo-advanced': 'PDO 高级配置',
  'battery-monitor': '锂电监控显示配置',
  'battery-protocol': '锂电协议',
};

export const batteryProtocolTestData: BatteryProtocol = {
  default_timeout_ticks: 200,
  frames: [
    { frame_key: 'bat_2f0', can_id: 0x2f0, type: 0, desc: '锂电基础信息', timeout_ticks: 200 },
    { frame_key: 'bat_2f1', can_id: 0x2f1, type: 0, desc: '锂电状态信息', timeout_ticks: 200 },
    { frame_key: 'bat_2f2', can_id: 0x2f2, type: 0, desc: '锂电单体信息', timeout_ticks: 200 },
    { frame_key: 'bat_2f3', can_id: 0x2f3, type: 0, desc: '锂电时间信息', timeout_ticks: 200 },
  ],
  signals: [
    {
      signal_key: 'battery_voltage',
      param_id: 'BATTERY_MONITOR_VOLTAGE',
      name: '电池总电压',
      inner: 17,
      type: 10,
      def: '0',
      frame_key: 'bat_2f0',
      pos: 0,
      len: 16,
      show_type: 0,
    },
    {
      signal_key: 'battery_current',
      param_id: 'BATTERY_MONITOR_CURRENT',
      name: '电池总电流',
      inner: 22,
      type: 10,
      def: '0',
      frame_key: 'bat_2f0',
      pos: 16,
      len: 16,
      show_type: 0,
    },
    {
      signal_key: 'battery_soc',
      param_id: 'BATTERY_MONITOR_SOC',
      name: '电池SOC',
      inner: -1,
      type: 0,
      def: '0',
      frame_key: 'bat_2f0',
      pos: 32,
      len: 8,
      show_type: 0,
    },
    {
      signal_key: 'battery_capacity',
      param_id: 'BATTERY_MONITOR_CAPACITY',
      name: '电池容量',
      inner: 23,
      type: 0,
      def: '0',
      frame_key: 'bat_2f0',
      pos: 40,
      len: 8,
      show_type: 0,
    },
    {
      signal_key: 'battery_error_info',
      param_id: 'BATTERY_MONITOR_ERROR_INFO',
      name: '故障信息',
      inner: 25,
      type: 10,
      def: '0',
      frame_key: 'bat_2f0',
      pos: 48,
      len: 16,
      show_type: 0,
    },
    {
      signal_key: 'battery_heat_status',
      param_id: 'BATTERY_MONITOR_HEAT_STATUS',
      name: '电加热状态',
      inner: 24,
      type: 0,
      def: '0',
      frame_key: 'bat_2f1',
      pos: 56,
      len: 1,
      show_type: 1,
    },
    {
      signal_key: 'cell_max_temp',
      param_id: 'BATTERY_MONITOR_CELL_MAX_TEMP',
      name: '单体最高温度',
      inner: 20,
      type: 0,
      def: '0',
      frame_key: 'bat_2f2',
      pos: 0,
      len: 8,
      show_type: 0,
    },
    {
      signal_key: 'cell_min_temp',
      param_id: 'BATTERY_MONITOR_CELL_MIN_TEMP',
      name: '单体最低温度',
      inner: 21,
      type: 0,
      def: '0',
      frame_key: 'bat_2f2',
      pos: 8,
      len: 8,
      show_type: 0,
    },
    {
      signal_key: 'cell_max_voltage',
      param_id: 'BATTERY_MONITOR_CELL_MAX_VOLTAGE',
      name: '单体最高电压',
      inner: 18,
      type: 10,
      def: '0',
      frame_key: 'bat_2f2',
      pos: 16,
      len: 16,
      show_type: 0,
    },
    {
      signal_key: 'cell_min_voltage',
      param_id: 'BATTERY_MONITOR_CELL_MIN_VOLTAGE',
      name: '单体最低电压',
      inner: 19,
      type: 10,
      def: '0',
      frame_key: 'bat_2f2',
      pos: 32,
      len: 16,
      show_type: 0,
    },
    {
      signal_key: 'battery_usage_time',
      param_id: 'BATTERY_MONITOR_USAGE_TIME',
      name: '电池使用时间',
      inner: 26,
      type: 20,
      def: '0',
      frame_key: 'bat_2f3',
      pos: 0,
      len: 24,
      show_type: 0,
    },
    {
      signal_key: 'battery_discharge_time',
      param_id: 'BATTERY_MONITOR_DISCHARGE_TIME',
      name: '电池放电时间',
      inner: 27,
      type: 20,
      def: '0',
      frame_key: 'bat_2f3',
      pos: 24,
      len: 24,
      show_type: 0,
    },
  ],
};

export function getTestData(type: TestDataType): TestDataResult {
  switch (type) {
    case 'pdo-simple':
      return { pdoSimple: pdoSimpleTestData };
    case 'pdo-advanced':
      return { pdoAdvanced: pdoAdvancedTestData };
    case 'battery-monitor':
      return { batteryMonitor: batteryMonitorTestData };
    case 'battery-protocol':
      return { batteryProtocol: batteryProtocolTestData };
  }
}

export { batteryMonitorTestData } from './battery-monitor';
export { pdoAdvancedTestData } from './pdo-advanced';
export { pdoSimpleTestData } from './pdo-simple';
