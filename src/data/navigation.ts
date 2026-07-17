import type { NavigationKey } from '../types/platform';

export interface NavGroup {
  label: string;
  accent: string;
  keys: NavigationKey[];
}

export const navGroups: NavGroup[] = [
  { label: '项目', accent: '#4ea1f3', keys: ['project'] },
  { label: '数据', accent: '#3fb950', keys: ['setting-data', 'realtime-data'] },
  {
    label: '协议',
    accent: '#c586c0',
    keys: [
      'signal-dictionary',
      'private-protocol',
      'protocol-mapping',
      'canopen-export',
      'battery-protocol',
    ],
  },
  {
    label: '配置',
    accent: '#d7ba7d',
    keys: ['ui', 'battery-monitor', 'fault-code'],
  },
  { label: '多国语言', accent: '#4ec9b0', keys: ['language'] },
  { label: '输出', accent: '#ce9178', keys: ['export', 'can-test-data'] },
  { label: '系统', accent: '#9cdcfe', keys: ['settings'] },
];

export function findGroupForKey(key: NavigationKey): NavGroup | undefined {
  return navGroups.find((group) => group.keys.includes(key));
}
