import type { NavigationKey } from '../types/platform';

export interface NavGroup {
  id: string;
  labelKey: string;
  accentToken: `--navigation-accent-${string}`;
  keys: NavigationKey[];
}

export const navGroups: NavGroup[] = [
  {
    id: 'project',
    labelKey: 'navigation.groups.project',
    accentToken: '--navigation-accent-project',
    keys: ['project'],
  },
  {
    id: 'data',
    labelKey: 'navigation.groups.data',
    accentToken: '--navigation-accent-data',
    keys: ['setting-data', 'realtime-data', 'battery-monitor'],
  },
  {
    id: 'protocol',
    labelKey: 'navigation.groups.protocol',
    accentToken: '--navigation-accent-protocol',
    keys: [
      'signal-dictionary',
      'private-protocol',
      'protocol-mapping',
      'canopen-export',
    ],
  },
  {
    id: 'configuration',
    labelKey: 'navigation.groups.configuration',
    accentToken: '--navigation-accent-config',
    keys: ['ui', 'fault-code'],
  },
  {
    id: 'language',
    labelKey: 'navigation.groups.language',
    accentToken: '--navigation-accent-language',
    keys: ['language'],
  },
  {
    id: 'output',
    labelKey: 'navigation.groups.output',
    accentToken: '--navigation-accent-output',
    keys: ['export', 'can-test-data'],
  },
  {
    id: 'system',
    labelKey: 'navigation.groups.system',
    accentToken: '--navigation-accent-system',
    keys: ['settings'],
  },
];

export function findGroupForKey(key: NavigationKey): NavGroup | undefined {
  return navGroups.find((group) => group.keys.includes(key));
}
