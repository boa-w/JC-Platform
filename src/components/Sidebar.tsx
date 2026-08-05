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
import { useTranslation } from 'react-i18next';
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
  project: FolderKanban,
  data: Database,
  protocol: PlugZap,
  configuration: Settings2,
  language: Globe2,
  output: PackageOpen,
  system: MonitorCog,
};

function lifecycleLabelKey(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated')
    return 'common.lifecycle.compactExperimentalDeprecated';
  if (lifecycle === 'experimental') return 'common.lifecycle.compactExperimental';
  if (lifecycle === 'deprecated') return 'common.lifecycle.deprecated';
  return null;
}

function formatUpdateProgress(downloaded: number, total: number | null) {
  const downloadedMb = (downloaded / 1024 / 1024).toFixed(1);
  if (!total) return `${downloadedMb} MB`;
  return `${downloadedMb} / ${(total / 1024 / 1024).toFixed(1)} MB`;
}

interface CoreStatusPresentation {
  label?: string;
  labelKey?: string;
  tone: 'ready' | 'preview' | 'error' | 'loading';
}

function coreStatusPresentation(status?: string): CoreStatusPresentation {
  if (status === 'ready') return { labelKey: 'sidebar.coreStatus.ready', tone: 'ready' } as const;
  if (status === 'browser-preview')
    return { labelKey: 'sidebar.coreStatus.browserPreview', tone: 'preview' } as const;
  if (status === 'unavailable')
    return { labelKey: 'sidebar.coreStatus.unavailable', tone: 'error' } as const;
  if (!status || status === 'loading')
    return { labelKey: 'sidebar.coreStatus.checking', tone: 'loading' } as const;
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
  const { t } = useTranslation();
  const groupOfActive = findGroupForKey(activeKey);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    groupOfActive?.id ?? navGroups[0].id,
  );
  const activeGroupId = groupOfActive?.id ?? selectedGroupId;

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
    () => navGroups.find((group) => group.id === activeGroupId) ?? navGroups[0],
    [activeGroupId],
  );
  const activeGroupModules = useMemo(
    () =>
      activeGroup.keys
        .map((key) => modules.find((module) => module.key === key))
        .filter(Boolean) as FeatureModule[],
    [activeGroup, modules],
  );

  function selectGroup(id: string) {
    const group = navGroups.find((item) => item.id === id);
    if (!group) return;

    if (group.id === activeGroupId) {
      onToggleCollapsed();
      return;
    }

    setSelectedGroupId(id);
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
      ? t('sidebar.update.checking')
      : updateStatus === 'downloading'
        ? progressPercent !== null
          ? t('sidebar.update.downloadPercent', { percent: progressPercent })
          : t('sidebar.update.downloading')
        : updateStatus === 'restarting'
          ? t('sidebar.update.restarting')
          : updateStatus === 'available'
            ? t('sidebar.update.install')
            : t('sidebar.update.check');
  const updateMessage =
    updateStatus === 'available' && updateInfo
      ? t('sidebar.update.available', { version: updateInfo.availableVersion })
      : updateStatus === 'up-to-date'
        ? t('sidebar.update.upToDate')
        : updateStatus === 'downloading' && progress
          ? formatUpdateProgress(progress.downloaded, progress.total)
          : updateStatus === 'restarting'
            ? t('sidebar.update.installedRestarting')
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
          const isActive = group.id === activeGroupId;
          const GroupIcon = groupIcons[group.id] ?? FolderKanban;
          const groupLabel = t(group.labelKey);
          return (
            <button
              className={isActive ? 'activity-icon active' : 'activity-icon'}
              key={group.id}
              type="button"
              onClick={() => selectGroup(group.id)}
              title={
                isActive
                  ? t('sidebar.group.activeTitle', {
                      group: groupLabel,
                      action: t(collapsed ? 'sidebar.group.expand' : 'sidebar.group.collapse'),
                    })
                  : t('sidebar.group.switchTitle', { group: groupLabel })
              }
              aria-label={groupLabel}
              aria-pressed={isActive}
              aria-expanded={isActive ? !collapsed : undefined}
              style={{ '--activity-accent': `var(${group.accentToken})` } as CSSProperties}
            >
              <span className="activity-icon-glyph" aria-hidden="true">
                <GroupIcon size={19} strokeWidth={1.8} />
              </span>
              <span className="activity-icon-label">{groupLabel}</span>
            </button>
          );
        })}
        <div className="activity-spacer" />
        {/* 版本信息 */}
        <button
          className={coreUnavailable ? 'activity-icon activity-icon--warning' : 'activity-icon'}
          type="button"
          onClick={() => setShowPopup((v) => !v)}
          title={t('sidebar.about.title')}
          aria-label={
            coreUnavailable ? t('sidebar.about.coreUnavailableLabel') : t('sidebar.about.title')
          }
          aria-controls={versionPopupId}
          aria-expanded={showPopup}
          ref={aboutTriggerRef}
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            <Info size={18} strokeWidth={1.8} />
          </span>
          {coreUnavailable ? <span className="activity-status-dot" aria-hidden="true" /> : null}
          <span className="activity-icon-label">{t('sidebar.about.label')}</span>
        </button>
        {/* 主题切换 */}
        <button
          className="activity-icon"
          type="button"
          onClick={onToggleTheme}
          title={t(theme === 'dark' ? 'sidebar.theme.toLight' : 'sidebar.theme.toDark')}
          aria-label={t('sidebar.theme.switchLabel')}
        >
          <span className="activity-icon-glyph" aria-hidden="true">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </span>
          <span className="activity-icon-label">
            {t(theme === 'dark' ? 'sidebar.theme.light' : 'sidebar.theme.dark')}
          </span>
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
              {t('sidebar.about.versionInfo')}
            </span>
            <button
              className="version-popup-close"
              type="button"
              onClick={() => setShowPopup(false)}
              aria-label={t('sidebar.about.closeVersionInfo')}
              ref={popupCloseRef}
              title={t('sidebar.about.closeVersionInfo')}
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="version-popup-body">
            <section>
              <strong className="section-label--muted">{t('sidebar.about.appInfo')}</strong>
              <div className="version-popup-grid">
                <span>{t('sidebar.about.softwareName')}</span>
                <strong>{health?.app_name ?? t('sidebar.about.defaultAppName')}</strong>
                <span>{t('sidebar.about.frontendVersion')}</span>
                <strong>{APP_VERSION}</strong>
                <span>{t('sidebar.about.coreVersion')}</span>
                <strong>{health?.version ?? '-'}</strong>
                <span>{t('sidebar.about.commitHash')}</span>
                <strong>{health?.commit_hash ?? t('sidebar.about.unknown')}</strong>
                <span>{t('sidebar.about.coreStatus')}</span>
                <strong className={`core-status core-status--${coreStatus.tone}`}>
                  <span aria-hidden="true" />
                  {coreStatus.labelKey ? t(coreStatus.labelKey) : coreStatus.label}
                </strong>
              </div>
            </section>
            <section>
              <strong className="section-label--muted">{t('sidebar.about.projectInfo')}</strong>
              <div className="version-popup-grid">
                <span>{t('sidebar.about.currentProject')}</span>
                <strong>{project?.name ?? t('sidebar.about.noProject')}</strong>
                <span>{t('sidebar.about.projectPath')}</span>
                <strong>{project?.path ?? '—'}</strong>
              </div>
            </section>
            <section>
              <strong className="section-label--muted">{t('sidebar.update.sectionTitle')}</strong>
              <div className="version-update-panel">
                <div className="version-update-row">
                  <span aria-live="polite" className="version-update-status" role="status">
                    {updateMessage ?? t('sidebar.update.manualCheckHint')}
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
                  {t('sidebar.update.openReleases')}
                </button>
              </div>
            </section>
            <section>
              <strong className="section-label--muted">{t('sidebar.diagnostics.sectionTitle')}</strong>
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
                    {t(
                      diagnosticExport.isExporting
                        ? 'common.status.exporting'
                        : 'sidebar.diagnostics.exportReport',
                    )}
                  </button>
                </div>
                <p className="version-diagnostic-privacy">
                  {t('sidebar.diagnostics.privacy')}
                </p>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {collapsed ? null : (
        <nav
          className="activity-list"
          aria-label={t('sidebar.group.functionLabel', { group: t(activeGroup.labelKey) })}
        >
          <div className="activity-list-header">
            <span className="activity-list-title">{t(activeGroup.labelKey)}</span>
            <span className="activity-list-count">{activeGroupModules.length}</span>
          </div>
          <div className="activity-list-items">
            {activeGroupModules.map((module) => {
              const labelKey = lifecycleLabelKey(module.lifecycle);
              return (
                <button
                  aria-current={module.key === activeKey ? 'page' : undefined}
                  className={module.key === activeKey ? 'activity-item active' : 'activity-item'}
                  key={module.key}
                  type="button"
                  onClick={() => onSelect(module.key)}
                  title={t(module.lifecycleReasonKey ?? module.descriptionKey)}
                >
                  <span className="activity-item-label">{t(module.titleKey)}</span>
                  {labelKey ? (
                    <span
                      className={`module-lifecycle-badge module-lifecycle-badge--${module.lifecycle}`}
                    >
                      {t(labelKey)}
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
          cancelLabel={t(
            hasUnsavedChanges ? 'sidebar.update.returnToSave' : 'common.actions.cancel',
          )}
          confirmLabel={t('sidebar.update.continue')}
          message={
            hasUnsavedChanges
              ? t('sidebar.update.unsavedConfirmMessage')
              : t('sidebar.update.confirmMessage')
          }
          onCancel={cancelUpdateInstall}
          onConfirm={confirmUpdateInstall}
          title={t('sidebar.update.confirmTitle')}
        />
      ) : null}
    </div>
  );
}
