import { useState } from 'react';
import type { FeatureModule, ModuleLifecycle, NavigationKey } from '../types/platform';
import { navGroups } from '../data/navigation';

interface SidebarProps {
  modules: FeatureModule[];
  activeKey: NavigationKey;
  onSelect: (key: NavigationKey) => void;
}

function lifecycleLabel(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated') return '实验/废弃';
  if (lifecycle === 'experimental') return '实验';
  if (lifecycle === 'deprecated') return '废弃';
  return null;
}

export function Sidebar({ modules, activeKey, onSelect }: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  const isGroupCollapsed = (label: string) => collapsedGroups.has(label);

  return (
    <header className="top-menu">
      <div className="brand">
        <span className="brand-mark">JC</span>
        <strong>自定义开发平台</strong>
      </div>
      <nav className="nav-list" aria-label="功能菜单">
        {navGroups.map((group, groupIndex) => {
          const groupModules = modules.filter((module) => group.keys.includes(module.key));
          const collapsed = isGroupCollapsed(group.label);
          const hasActiveChild = groupModules.some((m) => m.key === activeKey);
          return (
            <div className="nav-group" key={group.label}>
              {groupIndex > 0 && <span className="nav-separator" />}
              {groupModules.length > 1 ? (
                <button
                  className={`nav-group-toggle ${hasActiveChild ? 'has-active' : ''}`}
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  title={collapsed ? `展开${group.label}` : `折叠${group.label}`}
                >
                  <span className="nav-group-arrow">{collapsed ? '▸' : '▾'}</span>
                  <span>{group.label}</span>
                </button>
              ) : null}
              {!collapsed &&
                groupModules.map((module) => (
                  <button
                    className={module.key === activeKey ? 'nav-item active' : 'nav-item'}
                    key={module.key}
                    type="button"
                    onClick={() => onSelect(module.key)}
                    title={module.lifecycleReason ?? module.description}
                  >
                    <span>{module.title}</span>
                    {lifecycleLabel(module.lifecycle) ? (
                      <span className={`module-lifecycle-badge module-lifecycle-badge--${module.lifecycle}`}>
                        {lifecycleLabel(module.lifecycle)}
                      </span>
                    ) : null}
                  </button>
                ))}
            </div>
          );
        })}
      </nav>
    </header>
  );
}
