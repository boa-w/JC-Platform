import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findGroupForKey, navGroups } from '../data/navigation';
import type {
  BackendHealth,
  FeatureModule,
  ModuleLifecycle,
  NavigationKey,
  ProjectSummary,
} from '../types/platform';

interface SidebarProps {
  modules: FeatureModule[];
  activeKey: NavigationKey;
  onSelect: (key: NavigationKey) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  health: BackendHealth | null;
  project: ProjectSummary | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function lifecycleLabel(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated') return '实验/废弃';
  if (lifecycle === 'experimental') return '实验';
  if (lifecycle === 'deprecated') return '废弃';
  return null;
}

export function Sidebar({
  modules,
  activeKey,
  onSelect,
  theme,
  onToggleTheme,
  health,
  project,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const groupOfActive = findGroupForKey(activeKey);
  const [selectedGroupLabel, setSelectedGroupLabel] = useState<string>(
    groupOfActive?.label ?? navGroups[0].label,
  );
  const activeGroupLabel = groupOfActive?.label ?? selectedGroupLabel;

  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const activeGroup = useMemo(
    () => navGroups.find((group) => group.label === activeGroupLabel) ?? navGroups[0],
    [activeGroupLabel],
  );
  const activeGroupModules = useMemo(
    () =>
      activeGroup.keys
        .map((key) => modules.find((module) => module.key === key))
        .filter(Boolean) as FeatureModule[],
    [activeGroup, modules],
  );

  function selectGroup(label: string) {
    const group = navGroups.find((item) => item.label === label);
    if (!group) return;
    setSelectedGroupLabel(label);
    if (!group.keys.includes(activeKey)) {
      onSelect(group.keys[0]);
    }
  }

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
      setShowPopup(false);
    }
  }, []);

  useEffect(() => {
    if (showPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopup, handleClickOutside]);

  return (
    <div className={collapsed ? 'activity-shell activity-shell--collapsed' : 'activity-shell'}>
      <div className="activity-bar">
        <button
          className="activity-icon activity-icon--toggle"
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-expanded={!collapsed}
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            {collapsed ? '▸' : '◂'}
          </span>
        </button>
        {navGroups.map((group) => {
          const isActive = group.label === activeGroupLabel;
          return (
            <button
              className={isActive ? 'activity-icon active' : 'activity-icon'}
              key={group.label}
              type="button"
              onClick={() => selectGroup(group.label)}
              title={group.label}
              aria-label={group.label}
              aria-pressed={isActive}
            >
              <span className="activity-icon-glyph" aria-hidden="true">
                {group.icon}
              </span>
            </button>
          );
        })}
        <div className="activity-spacer" />
        {/* 版本信息 */}
        <button
          className="activity-icon"
          type="button"
          onClick={() => setShowPopup((v) => !v)}
          title="软件版本信息"
          aria-label="软件版本信息"
          aria-expanded={showPopup}
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            ℹ
          </span>
        </button>
        {/* 主题切换 */}
        <button
          className="activity-icon"
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          aria-label="切换主题"
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            {theme === 'dark' ? '☀' : '🌙'}
          </span>
        </button>
      </div>

      {showPopup ? (
        <div className="version-popup" ref={popupRef}>
          <div className="version-popup-header">
            <span className="version-popup-title">版本信息</span>
            <button
              className="version-popup-close"
              type="button"
              onClick={() => setShowPopup(false)}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
          <div className="version-popup-body">
            <section>
              <strong className="section-label--muted">应用信息</strong>
              <div className="version-popup-grid">
                <span>软件名称</span>
                <strong>{health?.app_name ?? '自定义开发平台'}</strong>
                <span>前端版本</span>
                <strong>0.1.0</strong>
                <span>核心版本</span>
                <strong>{health?.version ?? '-'}</strong>
                <span>提交哈希</span>
                <strong>{health?.commit_hash ?? 'unknown'}</strong>
                <span>核心状态</span>
                <strong>{health?.core_status ?? 'loading'}</strong>
              </div>
            </section>
            <section>
              <strong className="section-label--muted">项目信息</strong>
              <div className="version-popup-grid">
                <span>当前项目</span>
                <strong>{project?.name ?? '未打开项目'}</strong>
                <span>项目路径</span>
                <strong>{project?.path ?? '—'}</strong>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {collapsed ? null : (
        <nav className="activity-list" aria-label={`${activeGroup.label} 功能`}>
          <div className="activity-list-header">
            <span className="activity-list-title">{activeGroup.label}</span>
            <span className="activity-list-count">{activeGroupModules.length}</span>
          </div>
          <div className="activity-list-items">
            {activeGroupModules.map((module) => {
              const label = lifecycleLabel(module.lifecycle);
              return (
                <button
                  className={module.key === activeKey ? 'activity-item active' : 'activity-item'}
                  key={module.key}
                  type="button"
                  onClick={() => onSelect(module.key)}
                  title={module.lifecycleReason ?? module.description}
                >
                  <span className="activity-item-label">{module.title}</span>
                  {label ? (
                    <span
                      className={`module-lifecycle-badge module-lifecycle-badge--${module.lifecycle}`}
                    >
                      {label}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
