import {
  ArrowUpRight,
  Braces,
  ChevronDown,
  ChevronRight,
  CloudOff,
  FileDiff,
  FileDown,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  RefreshCw,
  SaveAll,
  Save as SaveIcon,
  ScanSearch,
  Undo2,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TestDataType } from '../../data/test-data/metadata';
import { type DocumentSectionKey, modifiedSectionLabelKeys } from '../../modules/documentSections';
import type {
  FeatureModule,
  GitProjectStatus,
  GitRevision,
  LoadedProject,
} from '../../types/platform';
import { getJcproVersion, getJcproVersionValue } from '../../utils/jcproVersion';

type TableConfigKind = 'sdo' | 'pdoSimple' | 'language';

interface DashboardActionBarProps {
  activeModule: FeatureModule;
  loadedProject: LoadedProject | null;
  projectPath: string;
  isOpening: boolean;
  isFormattingJcpro: boolean;
  hasUnsavedChanges: boolean;
  modifiedSections: DocumentSectionKey[];
  isSavingProject: boolean;
  savingProjectAction: 'save' | 'saveAs' | null;
  saveStatus: string | null;
  currentLegacyTableKind: TableConfigKind | null;
  isImportingTable: boolean;
  isExportingTable: boolean;
  generatingTestKey: string | null;
  pdoMode: 'simple' | 'advanced';
  showCanvasLabels: boolean;
  jsonEditorAllowed: boolean;
  showJsonEditor: boolean;
  gitStatus: GitProjectStatus | null;
  gitBusy: boolean;
  gitLoading: boolean;
  gitError: string | null;
  gitRevisions: GitRevision[];
  gitRepositoryName: string;
  gitSummaryCommitDisabled: boolean;
  onRestoreSection: (section: DocumentSectionKey) => void;
  onSelectProjectFile: () => void | Promise<void>;
  onReloadProject: () => void | Promise<void>;
  onRestoreAllChanges: () => void;
  onSaveProjectAs: () => void | Promise<void>;
  onRequestSave: () => void;
  onImportTable: (kind: TableConfigKind) => void | Promise<void>;
  onExportTable: (kind: TableConfigKind, format: 'csv' | 'xml') => void | Promise<void>;
  onRequestTestData: (type: TestDataType) => void;
  onToggleCanvasLabels: () => void;
  onToggleJsonEditor: () => void;
  onRefreshGit: () => void | Promise<void>;
  onOpenGitReview: () => void | Promise<void>;
  onOpenGitRepository: () => void | Promise<void>;
  onShowGitHistory: () => void;
  onCommitGitVersion: () => void | Promise<void>;
}

export function DashboardActionBar({
  activeModule,
  loadedProject,
  projectPath,
  isOpening,
  isFormattingJcpro,
  hasUnsavedChanges,
  modifiedSections,
  isSavingProject,
  savingProjectAction,
  saveStatus,
  currentLegacyTableKind,
  isImportingTable,
  isExportingTable,
  generatingTestKey,
  pdoMode,
  showCanvasLabels,
  jsonEditorAllowed,
  showJsonEditor,
  gitStatus,
  gitBusy,
  gitLoading,
  gitError,
  gitRevisions,
  gitRepositoryName,
  gitSummaryCommitDisabled,
  onRestoreSection,
  onSelectProjectFile: handleSelectProjectFile,
  onReloadProject: handleReloadProject,
  onRestoreAllChanges: restoreAllChanges,
  onSaveProjectAs: handleSaveProjectAs,
  onRequestSave: requestSaveProject,
  onImportTable: handleImportTableConfig,
  onExportTable: handleExportTableConfig,
  onRequestTestData,
  onToggleCanvasLabels,
  onToggleJsonEditor,
  onRefreshGit: refreshProjectGit,
  onOpenGitReview,
  onOpenGitRepository,
  onShowGitHistory,
  onCommitGitVersion: handleCommitProjectVersion,
}: DashboardActionBarProps) {
  const { t } = useTranslation();
  const projectVersion = getJcproVersion(loadedProject?.document);
  const projectVersionValue = getJcproVersionValue(loadedProject?.document);
  const projectVersionLabel =
    projectVersion === 'unknown'
      ? t('projectManagement.versionTypes.unknown', {
          version: projectVersionValue || t('projectManagement.versionTypes.notDetected'),
        })
      : t(`projectManagement.versionTypes.${projectVersion}`);
  const isJc002 =
    (loadedProject?.document as Record<string, unknown> | undefined)?.config_version === 'jc002';
  const gitSummaryId = useId();
  const [showGitSummary, setShowGitSummary] = useState(false);
  const gitSummaryRef = useRef<HTMLDivElement | null>(null);
  const gitSummaryTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showGitSummary) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !gitSummaryRef.current?.contains(target) &&
        !gitSummaryTriggerRef.current?.contains(target)
      ) {
        setShowGitSummary(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowGitSummary(false);
        gitSummaryTriggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showGitSummary]);

  async function openGitReview() {
    setShowGitSummary(false);
    await onOpenGitReview();
  }

  async function handleOpenGitRepository() {
    setShowGitSummary(false);
    await onOpenGitRepository();
  }

  function showProjectGitHistory() {
    setShowGitSummary(false);
    onShowGitHistory();
  }

  function handleRequestTestData() {
    const type: TestDataType =
      activeModule.key === 'realtime-data' && !isJc002 && pdoMode === 'simple'
        ? 'pdo-simple'
        : activeModule.key === 'realtime-data'
          ? 'pdo-advanced'
          : 'battery-monitor';
    onRequestTestData(type);
  }

  function restoreModifiedPath([section]: DocumentSectionKey[]) {
    onRestoreSection(section);
  }

  return (
    <>
      <div className="action-bar">
        <div className="action-bar-left">
          <div className="action-bar-command-center" title={loadedProject?.summary.path ?? ''}>
            <span
              className={`action-bar-dot ${
                loadedProject
                  ? hasUnsavedChanges
                    ? 'action-bar-dot--dirty'
                    : 'action-bar-dot--clean'
                  : 'action-bar-dot--empty'
              }`}
            />
            <span className="action-bar-project">
              {loadedProject?.summary.name || t('dashboard.actionBar.noProject')}
            </span>
            {loadedProject ? (
              <span
                className={`action-bar-schema action-bar-schema--${projectVersion}`}
                title={t('projectManagement.versionType')}
              >
                {projectVersionLabel}
              </span>
            ) : null}
            <span className="action-bar-module">{t(activeModule.titleKey)}</span>
          </div>
          {modifiedSections.length > 0 ? (
            <div className="action-bar-pills">
              {modifiedSections.map((section) => (
                <button
                  className="action-bar-pill"
                  key={section}
                  onClick={() => restoreModifiedPath([section])}
                  type="button"
                  title={t('dashboard.actionBar.restoreSection', {
                    section: t(modifiedSectionLabelKeys[section] ?? section),
                  })}
                >
                  {t(modifiedSectionLabelKeys[section] ?? section)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="action-bar-right">
          <button
            aria-controls={gitSummaryId}
            aria-expanded={showGitSummary}
            className={
              showGitSummary
                ? 'action-bar-git-trigger action-bar-git-trigger--active'
                : 'action-bar-git-trigger'
            }
            disabled={isFormattingJcpro}
            onClick={() => setShowGitSummary((visible) => !visible)}
            ref={gitSummaryTriggerRef}
            title={t('dashboard.actionBar.toggleGitSummary')}
            type="button"
          >
            <GitBranch aria-hidden="true" size={14} strokeWidth={1.8} />
            <span>{gitStatus?.branch ?? 'Git'}</span>
            {gitStatus?.changed_paths.length ? (
              <span className="action-bar-git-badge">{gitStatus.changed_paths.length}</span>
            ) : null}
            <ChevronDown aria-hidden="true" size={13} strokeWidth={1.8} />
          </button>
          <span className="action-bar-sep" />
          <div className="action-bar-group">
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={isOpening || isFormattingJcpro}
              onClick={() => void handleSelectProjectFile()}
              type="button"
              title={t('dashboard.actionBar.openProjectTitle')}
            >
              <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('dashboard.actionBar.open')}
            </button>
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={
                isOpening ||
                isFormattingJcpro ||
                !(loadedProject?.summary.path || projectPath.trim())
              }
              onClick={() => void handleReloadProject()}
              type="button"
              title={t('dashboard.actionBar.reloadTitle')}
            >
              <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('dashboard.actionBar.reload')}
            </button>
          </div>
          <span className="action-bar-sep" />
          <div className="action-bar-group">
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={!hasUnsavedChanges || isSavingProject || isFormattingJcpro}
              onClick={restoreAllChanges}
              type="button"
              title={t('dashboard.actionBar.restoreAllTitle')}
            >
              <Undo2 aria-hidden="true" size={14} strokeWidth={1.8} />
              {t('common.actions.restore')}
            </button>
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={!loadedProject?.summary.path || isSavingProject || isFormattingJcpro}
              onClick={() => void handleSaveProjectAs()}
              type="button"
            >
              <SaveAll aria-hidden="true" size={14} strokeWidth={1.8} />
              {t(
                savingProjectAction === 'saveAs'
                  ? 'dashboard.actionBar.savingAs'
                  : 'dashboard.actionBar.saveAs',
              )}
            </button>
            <button
              className="action-bar-btn action-bar-btn--save"
              disabled={
                !hasUnsavedChanges ||
                !loadedProject?.summary.path ||
                isSavingProject ||
                isFormattingJcpro
              }
              onClick={requestSaveProject}
              type="button"
            >
              <SaveIcon aria-hidden="true" size={14} strokeWidth={1.8} />
              {t(savingProjectAction === 'save' ? 'common.status.saving' : 'common.actions.save')}
            </button>
          </div>
          <span className="action-bar-sep" />
          {currentLegacyTableKind ? (
            <div className="action-bar-group">
              {currentLegacyTableKind !== 'language' ? (
                <button
                  className="action-bar-btn action-bar-btn--secondary"
                  disabled={!loadedProject || isImportingTable || isFormattingJcpro}
                  onClick={() => void handleImportTableConfig(currentLegacyTableKind)}
                  type="button"
                  title={t('dashboard.actionBar.importTitle')}
                >
                  <FileDown aria-hidden="true" size={14} strokeWidth={1.8} />
                  {t(
                    isImportingTable
                      ? 'dashboard.actionBar.importing'
                      : currentLegacyTableKind === 'pdoSimple' && isJc002
                        ? 'dashboard.actionBar.importPdoAndConvert'
                        : 'dashboard.actionBar.import',
                  )}
                </button>
              ) : null}
              {currentLegacyTableKind !== 'pdoSimple' || !isJc002 ? (
                <>
                  <button
                    className="action-bar-btn action-bar-btn--ghost"
                    disabled={!loadedProject || isExportingTable || isFormattingJcpro}
                    onClick={() => void handleExportTableConfig(currentLegacyTableKind, 'csv')}
                    type="button"
                    title={t('dashboard.actionBar.exportCsvTitle')}
                  >
                    CSV
                  </button>
                  <button
                    className="action-bar-btn action-bar-btn--ghost"
                    disabled={!loadedProject || isExportingTable || isFormattingJcpro}
                    onClick={() => void handleExportTableConfig(currentLegacyTableKind, 'xml')}
                    type="button"
                    title={t('dashboard.actionBar.exportExcelTitle')}
                  >
                    Excel
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
          {(['realtime-data', 'battery-monitor'] as string[]).includes(activeModule.key) ? (
            <button
              className="action-bar-btn action-bar-btn--secondary"
              disabled={!loadedProject || generatingTestKey !== null || isFormattingJcpro}
              onClick={handleRequestTestData}
              type="button"
              title={t('dashboard.actionBar.generateTestDataTitle')}
            >
              <WandSparkles aria-hidden="true" size={14} strokeWidth={1.8} />
              {t(
                generatingTestKey !== null
                  ? 'dashboard.actionBar.generating'
                  : 'dashboard.actionBar.generateTestData',
              )}
            </button>
          ) : null}
          {activeModule.key === 'ui' ? (
            <button
              className={`action-bar-btn ${
                showCanvasLabels ? 'action-bar-btn--secondary' : 'action-bar-btn--ghost'
              }`}
              onClick={onToggleCanvasLabels}
              title={t(
                showCanvasLabels
                  ? 'dashboard.actionBar.hideCanvasLabelsTitle'
                  : 'dashboard.actionBar.showCanvasLabelsTitle',
              )}
              type="button"
            >
              {t(
                showCanvasLabels
                  ? 'dashboard.actionBar.hideCanvasLabels'
                  : 'dashboard.actionBar.showCanvasLabels',
              )}
            </button>
          ) : null}
          {(
            [
              'setting-data',
              'realtime-data',
              'battery-monitor',
              'language',
              'signal-dictionary',
              'private-protocol',
              'protocol-mapping',
            ] as string[]
          ).includes(activeModule.key) ? (
            <button
              className={`action-bar-btn ${
                showJsonEditor ? 'action-bar-btn--secondary' : 'action-bar-btn--ghost'
              }`}
              disabled={!loadedProject || isFormattingJcpro || !jsonEditorAllowed}
              onClick={onToggleJsonEditor}
              type="button"
              title={t('dashboard.actionBar.openJsonEditor')}
            >
              <Braces aria-hidden="true" size={14} strokeWidth={1.8} />
            </button>
          ) : null}
          {saveStatus ? (
            <span aria-live="polite" className="action-bar-status" role="status">
              {saveStatus}
            </span>
          ) : null}
        </div>
      </div>

      {showGitSummary ? (
        <div
          aria-label={t('dashboard.gitSummary.label')}
          className="git-summary-popover"
          id={gitSummaryId}
          ref={gitSummaryRef}
          role="dialog"
          aria-busy={gitLoading}
        >
          <div className="git-summary-header">
            <span>{t('dashboard.gitSummary.title')}</span>
            <div className="git-summary-header-actions">
              <button
                aria-label={t('dashboard.gitSummary.refresh')}
                className={gitLoading ? 'is-spinning' : undefined}
                disabled={gitBusy || gitLoading || !loadedProject || isFormattingJcpro}
                onClick={() => void refreshProjectGit()}
                title={t('dashboard.gitSummary.refresh')}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
              <button
                aria-label={t('dashboard.gitSummary.closeLabel')}
                onClick={() => setShowGitSummary(false)}
                title={t('common.actions.close')}
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {!loadedProject ? (
            <div className="git-summary-empty">
              <FolderGit2 aria-hidden="true" size={18} strokeWidth={1.6} />
              <span>{t('dashboard.actionBar.noProject')}</span>
            </div>
          ) : gitStatus?.available ? (
            <div className="git-summary-body">
              {gitLoading ? (
                <p className="git-summary-loading" role="status">
                  {t('dashboard.gitSummary.backgroundRefresh')}
                </p>
              ) : null}
              <button
                className="git-summary-row"
                disabled={isFormattingJcpro}
                onClick={() => void openGitReview()}
                type="button"
              >
                <FileDiff aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{t('dashboard.gitSummary.changes')}</span>
                <span className="git-summary-change-count">
                  <strong>+{gitStatus.additions}</strong>
                  <em>-{gitStatus.deletions}</em>
                </span>
              </button>

              <button
                className="git-summary-row"
                disabled={isFormattingJcpro}
                onClick={() => void handleOpenGitRepository()}
                title={gitStatus.repo_root ?? undefined}
                type="button"
              >
                <FolderGit2 aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{t('dashboard.gitSummary.local')}</span>
                <span className="git-summary-row-value">{gitRepositoryName}</span>
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <button
                className="git-summary-row"
                disabled={isFormattingJcpro}
                onClick={showProjectGitHistory}
                type="button"
              >
                <GitBranch aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{gitStatus.branch}</span>
                <span className="git-summary-row-value git-summary-hash">
                  {gitStatus.head_short_hash ?? t('dashboard.gitSummary.noCommits')}
                </span>
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <div className="git-summary-divider" />

              <button
                className="git-summary-row"
                disabled={gitStatus.changed_paths.length === 0 || isFormattingJcpro}
                onClick={() => void openGitReview()}
                type="button"
              >
                <ScanSearch aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{t('dashboard.gitSummary.review')}</span>
                <span className="git-summary-row-value">
                  {t('dashboard.gitSummary.fileCount', { count: gitStatus.changed_paths.length })}
                </span>
                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <button
                className="git-summary-row"
                disabled={gitSummaryCommitDisabled || isFormattingJcpro}
                onClick={() => void handleCommitProjectVersion()}
                title={
                  hasUnsavedChanges
                    ? t('dashboard.gitSummary.saveFirst')
                    : gitStatus.has_staged_changes
                      ? t('dashboard.gitSummary.stagedChanges')
                      : gitStatus.changed_paths.length === 0
                        ? t('dashboard.gitSummary.noChanges')
                        : t('dashboard.gitSummary.commitTitle')
                }
                type="button"
              >
                <GitCommitHorizontal aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">
                  {t(gitBusy ? 'dashboard.gitSummary.committing' : 'dashboard.gitSummary.commit')}
                </span>
              </button>

              <div className="git-summary-row git-summary-row--muted">
                <CloudOff aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">
                  {t('dashboard.gitSummary.remoteUnavailable')}
                </span>
              </div>

              <button
                className="git-summary-row"
                disabled={isFormattingJcpro}
                onClick={showProjectGitHistory}
                type="button"
              >
                <History aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{t('dashboard.gitSummary.history')}</span>
                <span className="git-summary-row-value">
                  {t('dashboard.gitSummary.revisionCount', { count: gitRevisions.length })}
                </span>
                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              {gitStatus.warning || gitError ? (
                <p className="git-summary-warning" role={gitError ? 'alert' : 'status'}>
                  {gitError ?? gitStatus.warning}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="git-summary-empty git-summary-empty--stacked">
              <FolderGit2 aria-hidden="true" size={18} strokeWidth={1.6} />
              <span>{gitError ?? gitStatus?.warning ?? t('dashboard.gitSummary.reading')}</span>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
