import type {
  BatteryMonitorProtocol,
  PdoAdvancedDocument,
  PdoSimpleDocument,
} from '../../types/platform';
import { batteryMonitorTestData } from './battery-monitor';
import type { TestDataType } from './metadata';
import { pdoAdvancedTestData } from './pdo-advanced';
import { pdoSimpleTestData } from './pdo-simple';

export interface TestDataResult {
  pdoSimple?: PdoSimpleDocument;
  pdoAdvanced?: PdoAdvancedDocument;
  batteryMonitor?: BatteryMonitorProtocol;
}

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

export { batteryMonitorTestData } from './battery-monitor';
export { type TestDataType, testDataLabelKeys } from './metadata';
export { pdoAdvancedTestData } from './pdo-advanced';
export { pdoSimpleTestData } from './pdo-simple';
