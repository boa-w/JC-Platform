import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Database,
  FileDown,
  FolderKanban,
  Globe2,
  Info,
  type LucideIcon,
  MonitorCog,
  Moon,
  PackageOpen,
  PlugZap,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { APP_RELEASES_URL, APP_VERSION } from '../constants/app';
import { findGroupForKey, navGroups } from '../data/navigation';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { useDiagnosticExport } from '../hooks/useDiagnosticExport';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type {
  BackendHealth,
  FeatureModule,
  ModuleLifecycle,
  NavigationKey,
  ProjectSummary,
} from '../types/platform';
import { ConfirmDialog } from './ConfirmDialog';

interface SidebarProps {
  modules: FeatureModule[];
  activeKey: NavigationKey;
  onSelect: (key: NavigationKey) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  health: BackendHealth | null;
  project: ProjectSummary | null;
  hasUnsavedChanges: boolean;
  onBeforeUpdateRelaunch: () => void | Promise<void>;
  onUpdateRelaunchError: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const groupIcons: Record<string, LucideIcon> = {
  项目: FolderKanban,
  数据: Database,
  协议: PlugZap,
  配置: Settings2,
  多国语言: Globe2,
  输出: PackageOpen,
  系统: MonitorCog,
};

function lifecycleLabel(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated') return '实验/废弃';
  if (lifecycle === 'experimental') return '实验';
  if (lifecycle === 'deprecated') return '废弃';
  return null;
}

function formatUpdateProgress(downloaded: number, total: number | null) {
  const downloadedMb = (downloaded / 1024 / 1024).toFixed(1);
  if (!total) return `${downloadedMb} MB`;
  return `${downloadedMb} / ${(total / 1024 / 1024).toFixed(1)} MB`;
}

function coreStatusPresentation(status?: string) {
  if (status === 'ready') return { label: '已就绪', tone: 'ready' } as const;
  if (status === 'browser-preview') return { label: '浏览器预览', tone: 'preview' } as const;
  if (status === 'unavailable') return { label: '核心不可用', tone: 'error' } as const;
  if (!status || status === 'loading') return { label: '检查中', tone: 'loading' } as const;
  return { label: status, tone: 'loading' } as const;
}

export function Sidebar({
  modules,
  activeKey,
  onSelect,
  theme,
  onToggleTheme,
  health,
  project,
  hasUnsavedChanges,
  onBeforeUpdateRelaunch,
  onUpdateRelaunchError,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const groupOfActive = findGroupForKey(activeKey);
  const [selectedGroupLabel, setSelectedGroupLabel] = useState<string>(
    groupOfActive?.label ?? navGroups[0].label,
  );
  const activeGroupLabel = groupOfActive?.label ?? selectedGroupLabel;

  const [showPopup, setShowPopup] = useState(false);
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const versionPopupId = useId();
  const versionTitleId = useId();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const popupCloseRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus({
    active: showPopup,
    containerRef: popupRef,
    initialFocusRef: popupCloseRef,
    onEscape: () => setShowPopup(false),
  });
  const {
    status: updateStatus,
    updateInfo,
    progress,
    error: updateError,
    checkUpdate,
    installUpdate,
  } = useAppUpdate({
    onBeforeRelaunch: onBeforeUpdateRelaunch,
    onRelaunchError: onUpdateRelaunchError,
  });
  const diagnosticExport = useDiagnosticExport({
    activeModule: activeKey,
    health,
    project,
    theme,
  });

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

    if (group.label === activeGroupLabel) {
      onToggleCollapsed();
      return;
    }

    setSelectedGroupLabel(label);
    if (!group.keys.includes(activeKey)) {
      onSelect(group.keys[0]);
    }
    if (collapsed) {
      onToggleCollapsed();
    }
  }

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      popupRef.current &&
      !popupRef.current.contains(event.target as Node) &&
      !aboutTriggerRef.current?.contains(event.target as Node)
    ) {
      setShowPopup(false);
    }
  }, []);

  useEffect(() => {
    if (showPopup && !showUpdateConfirm) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopup, showUpdateConfirm, handleClickOutside]);

  const progressPercent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;
  const updateButtonDisabled =
    updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'restarting';
  const updateButtonLabel =
    updateStatus === 'checking'
      ? '检查中'
      : updateStatus === 'downloading'
        ? progressPercent !== null
          ? `下载 ${progressPercent}%`
          : '下载中'
        : updateStatus === 'restarting'
          ? '正在重启'
          : updateStatus === 'available'
            ? '安装更新'
            : '检查更新';
  const updateMessage =
    updateStatus === 'available' && updateInfo
      ? `发现新版本 ${updateInfo.availableVersion}`
      : updateStatus === 'up-to-date'
        ? '当前已是最新版本'
        : updateStatus === 'downloading' && progress
          ? formatUpdateProgress(progress.downloaded, progress.total)
          : updateStatus === 'restarting'
            ? '更新已安装，正在重启应用'
            : updateError;
  const coreStatus = coreStatusPresentation(health?.core_status);
  const coreUnavailable = coreStatus.tone === 'error';

  const handleUpdateAction = () => {
    if (updateStatus === 'available') {
      setShowUpdateConfirm(true);
      return;
    }
    void checkUpdate();
  };

  const cancelUpdateInstall = () => {
    setShowUpdateConfirm(false);
  };

  const confirmUpdateInstall = () => {
    setShowUpdateConfirm(false);
    void installUpdate();
  };

  return (
    <div className={collapsed ? 'activity-shell activity-shell--collapsed' : 'activity-shell'}>
      <div className="activity-bar">
        {navGroups.map((group) => {
          const isActive = group.label === activeGroupLabel;
          const GroupIcon = groupIcons[group.label] ?? FolderKanban;
          return (
            <button
              className={isActive ? 'activity-icon active' : 'activity-icon'}
              key={group.label}
              type="button"
              onClick={() => selectGroup(group.label)}
              title={
                isActive
                  ? `${group.label}（点击${collapsed ? '展开' : '折叠'}菜单）`
                  : `切换到${group.label}`
              }
              aria-label={group.label}
              aria-pressed={isActive}
              aria-expanded={isActive ? !collapsed : undefined}
              style={{ '--activity-accent': group.accent } as CSSProperties}
            >
              <span className="activity-icon-glyph" aria-hidden="true">
                <GroupIcon size={19} strokeWidth={1.8} />
              </span>
              <span className="activity-icon-label">{group.label}</span>
            </button>
          );
        })}
        <div className="activity-spacer" />
        {/* 版本信息 */}
        <button
          className={coreUnavailable ? 'activity-icon activity-icon--warning' : 'activity-icon'}
          type="button"
          onClick={() => setShowPopup((v) => !v)}
          title="软件版本信息"
          aria-label={coreUnavailable ? '软件版本信息，核心不可用' : '软件版本信息'}
          aria-controls={versionPopupId}
          aria-expanded={showPopup}
          ref={aboutTriggerRef}
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            <Info size={18} strokeWidth={1.8} />
          </span>
          {coreUnavailable ? <span className="activity-status-dot" aria-hidden="true" /> : null}
          <span className="activity-icon-label">关于</span>
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
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </span>
          <span className="activity-icon-label">{theme === 'dark' ? '浅色' : '深色'}</span>
        </button>
      </div>

      {showPopup ? (
        <div
          aria-hidden={showUpdateConfirm || undefined}
          aria-labelledby={versionTitleId}
          aria-modal={showUpdateConfirm ? undefined : 'true'}
          className="version-popup"
          id={versionPopupId}
          ref={popupRef}
          role="dialog"
        >
          <div className="version-popup-header">
            <span className="version-popup-title" id={versionTitleId}>
              版本信息
            </span>
            <button
              className="version-popup-close"
              type="button"
              onClick={() => setShowPopup(false)}
              aria-label="关闭版本信息"
              ref={popupCloseRef}
              title="关闭版本信息"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="version-popup-body">
            <section>
              <strong className="section-label--muted">应用信息</strong>
              <div className="version-popup-grid">
                <span>软件名称</span>
                <strong>{health?.app_name ?? '自定义开发平台'}</strong>
                <span>前端版本</span>
                <strong>{APP_VERSION}</strong>
                <span>核心版本</span>
                <strong>{health?.version ?? '-'}</strong>
                <span>提交哈希</span>
                <strong>{health?.commit_hash ?? 'unknown'}</strong>
                <span>核心状态</span>
                <strong className={`core-status core-status--${coreStatus.tone}`}>
                  <span aria-hidden="true" />
                  {coreStatus.label}
                </strong>
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
            <section>
              <strong className="section-label--muted">软件更新</strong>
              <div className="version-update-panel">
                <div className="version-update-row">
                  <span aria-live="polite" className="version-update-status" role="status">
                    {updateMessage ?? '可手动检查新版本'}
                  </span>
                  <button
                    className="version-update-button"
                    type="button"
                    onClick={handleUpdateAction}
                    disabled={updateButtonDisabled}
                  >
                    {updateButtonLabel}
                  </button>
                </div>
                {progress ? (
                  <div className="version-update-progress" aria-hidden="true">
                    <span style={{ width: `${progressPercent ?? 35}%` }} />
                  </div>
                ) : null}
                {updateInfo?.notes ? (
                  <p className="version-update-notes">{updateInfo.notes}</p>
                ) : null}
                <button
                  className="version-update-link"
                  type="button"
                  onClick={() => void openUrl(APP_RELEASES_URL)}
                >
                  打开发布页面
                </button>
              </div>
            </section>
            <section>
              <strong className="section-label--muted">诊断与支持</strong>
              <div className="version-diagnostic-panel">
                <div className="version-diagnostic-row">
                  <span
                    aria-live="polite"
                    className={
                      diagnosticExport.error
                        ? 'version-diagnostic-status version-diagnostic-status--error'
                        : 'version-diagnostic-status'
                    }
                    role={diagnosticExport.error ? 'alert' : 'status'}
                  >
                    {diagnosticExport.error ?? diagnosticExport.message ?? ''}
                  </span>
                  <button
                    className="version-update-button version-diagnostic-button"
                    disabled={diagnosticExport.isExporting}
                    onClick={() => void diagnosticExport.exportDiagnostics()}
                    type="button"
                  >
                    <FileDown aria-hidden="true" size={14} strokeWidth={1.8} />
                    {diagnosticExport.isExporting ? '导出中' : '导出诊断报告'}
                  </button>
                </div>
                <p className="version-diagnostic-privacy">项目配置内容不会写入报告。</p>
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
                  aria-current={module.key === activeKey ? 'page' : undefined}
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
      {showUpdateConfirm ? (
        <ConfirmDialog
          cancelLabel={hasUnsavedChanges ? '返回保存' : '取消'}
          confirmLabel="继续更新"
          message={
            hasUnsavedChanges
              ? '当前项目存在未保存修改。更新安装后应用将重启，修改会保留在恢复草稿中；建议先返回并保存项目。'
              : '更新安装完成后应用将自动重启。是否继续下载并安装？'
          }
          onCancel={cancelUpdateInstall}
          onConfirm={confirmUpdateInstall}
          title="安装并重启应用？"
        />
      ) : null}
    </div>
  );
}
