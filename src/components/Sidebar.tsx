import type { FeatureModule, NavigationKey } from '../types/platform';

interface SidebarProps {
  modules: FeatureModule[];
  activeKey: NavigationKey;
  onSelect: (key: NavigationKey) => void;
}

const navGroups: { label: string; keys: NavigationKey[] }[] = [
  { label: '项目', keys: ['project'] },
  { label: '数据', keys: ['setting-data', 'realtime-data'] },
  {
    label: '协议',
    keys: ['signal-dictionary', 'private-protocol', 'protocol-mapping'],
  },
  { label: '配置', keys: ['ui', 'battery-monitor', 'language'] },
  { label: '输出', keys: ['export', 'can-test-data', 'settings'] },
];

export function Sidebar({ modules, activeKey, onSelect }: SidebarProps) {
  return (
    <header className="top-menu">
      <div className="brand">
        <span className="brand-mark">JC</span>
        <strong>自定义开发平台</strong>
      </div>
      <nav className="nav-list" aria-label="功能菜单">
        {navGroups.map((group, groupIndex) => (
          <div className="nav-group" key={group.label}>
            {groupIndex > 0 && <span className="nav-separator" />}
            {modules
              .filter((module) => group.keys.includes(module.key))
              .map((module) => (
                <button
                  className={module.key === activeKey ? 'nav-item active' : 'nav-item'}
                  key={module.key}
                  type="button"
                  onClick={() => onSelect(module.key)}
                >
                  <span>{module.title}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>
    </header>
  );
}
