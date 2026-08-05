export type TestDataType = 'pdo-simple' | 'pdo-advanced' | 'battery-monitor';

export const testDataLabelKeys: Record<TestDataType, string> = {
  'pdo-simple': 'testData.types.pdoSimple',
  'pdo-advanced': 'testData.types.pdoAdvanced',
  'battery-monitor': 'testData.types.batteryMonitor',
};
