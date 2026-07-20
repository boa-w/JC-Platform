import type { NavigationKey } from '../types/platform';

export interface NavGroup {
  label: string;
  accentToken: `--navigation-accent-${string}`;
  keys: NavigationKey[];
}

export const navGroups: NavGroup[] = [
  { label: '项目', accentToken: '--navigation-accent-project', keys: ['project'] },
  { label: '数据', accentToken: '--navigation-accent-data', keys: ['setting-data', 'realtime-data'] },
  {
    label: '协议',
    accentToken: '--navigation-accent-protocol',
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
    accentToken: '--navigation-accent-config',
    keys: ['ui', 'battery-monitor', 'fault-code'],
  },
  { label: '多国语言', accentToken: '--navigation-accent-language', keys: ['language'] },
  { label: '输出', accentToken: '--navigation-accent-output', keys: ['export', 'can-test-data'] },
  { label: '系统', accentToken: '--navigation-accent-system', keys: ['settings'] },
];

export function findGroupForKey(key: NavigationKey): NavGroup | undefined {
  return navGroups.find((group) => group.keys.includes(key));
}
