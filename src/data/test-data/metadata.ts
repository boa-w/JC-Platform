export type TestDataType = 'pdo-simple' | 'pdo-advanced' | 'battery-monitor' | 'battery-protocol';

export const testDataLabels: Record<TestDataType, string> = {
  'pdo-simple': 'PDO 简化配置',
  'pdo-advanced': 'PDO 高级配置',
  'battery-monitor': '锂电监控显示配置',
  'battery-protocol': '锂电协议',
};
