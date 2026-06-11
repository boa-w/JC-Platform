import type { PdoSimpleDocument, PdoAdvancedDocument, BatteryMonitorInfo } from '../../types/platform';
import { pdoSimpleTestData } from './pdo-simple';
import { pdoAdvancedTestData } from './pdo-advanced';
import { batteryMonitorTestData } from './battery-monitor';

export type TestDataType = 'pdo-simple' | 'pdo-advanced' | 'battery-monitor';

export interface TestDataResult {
  pdoSimple?: PdoSimpleDocument;
  pdoAdvanced?: PdoAdvancedDocument;
  batteryMonitor?: BatteryMonitorInfo;
}

export const testDataLabels: Record<TestDataType, string> = {
  'pdo-simple': 'PDO 简化配置',
  'pdo-advanced': 'PDO 高级配置',
  'battery-monitor': '锂电监控配置',
};

export function getTestData(type: TestDataType): TestDataResult {
  switch (type) {
    case 'pdo-simple':
      return { pdoSimple: pdoSimpleTestData };
    case 'pdo-advanced':
      return { pdoAdvanced: pdoAdvancedTestData };
    case 'battery-monitor':
      return { batteryMonitor: batteryMonitorTestData };
  }
}

export { pdoSimpleTestData } from './pdo-simple';
export { pdoAdvancedTestData } from './pdo-advanced';
export { batteryMonitorTestData } from './battery-monitor';
