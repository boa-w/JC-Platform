import type { NavigationKey } from '../types/platform';

export interface NavGroup {
  label: string;
  keys: NavigationKey[];
}

export const navGroups: NavGroup[] = [
  { label: '项目', keys: ['project'] },
  { label: '数据', keys: ['setting-data', 'realtime-data'] },
  {
    label: '协议',
    keys: ['signal-dictionary', 'private-protocol', 'protocol-mapping'],
  },
  { label: '配置', keys: ['ui', 'battery-monitor', 'language'] },
  { label: '输出', keys: ['export', 'can-test-data', 'settings'] },
];

export function findGroupForKey(key: NavigationKey): NavGroup | undefined {
  return navGroups.find((group) => group.keys.includes(key));
}
