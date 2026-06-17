import type { NavigationKey } from '../types/platform';

export interface NavGroup {
  label: string;
  icon: string;
  keys: NavigationKey[];
}

export const navGroups: NavGroup[] = [
  { label: '项目', icon: '📁', keys: ['project'] },
  { label: '数据', icon: '📊', keys: ['setting-data', 'realtime-data'] },
  {
    label: '协议',
    icon: '🔌',
    keys: ['signal-dictionary', 'private-protocol', 'protocol-mapping', 'battery-protocol'],
  },
  { label: '配置', icon: '⚙️', keys: ['ui', 'battery-monitor'] },
  { label: '多国语言', icon: '🌐', keys: ['language'] },
  { label: '输出', icon: '📦', keys: ['export', 'can-test-data'] },
  { label: '系统', icon: '🖥️', keys: ['settings'] },
];

export function findGroupForKey(key: NavigationKey): NavGroup | undefined {
  return navGroups.find((group) => group.keys.includes(key));
}
