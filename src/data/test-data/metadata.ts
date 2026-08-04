export type TestDataType = 'pdo-simple' | 'pdo-advanced' | 'battery-monitor';

export const testDataLabels: Record<TestDataType, string> = {
  'pdo-simple': 'PDO 简化配置',
  'pdo-advanced': 'PDO 高级配置',
  'battery-monitor': '锂电监控协议配置',
};
