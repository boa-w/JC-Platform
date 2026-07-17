import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CloudOff,
  FileDiff,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  RefreshCw,
  Save as SaveIcon,
  SaveAll,
  ScanSearch,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { modifiedSectionLabels, type DocumentSectionKey } from '../../modules/documentSections';
import type {
  FeatureModule,
  GitProjectStatus,
  GitRevision,
  LoadedProject,
} from '../../types/platform';
import type { TestDataType } from '../../data/test-data';

type TableConfigKind = 'sdo' | 'pdoSimple' | 'language';

interface DashboardActionBarProps {
  activeModule: FeatureModule;
  loadedProject: LoadedProject | null;
  projectPath: string;
  isOpening: boolean;
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
  showJsonEditor: boolean;
  gitStatus: GitProjectStatus | null;
  gitBusy: boolean;
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
  showJsonEditor,
  gitStatus,
  gitBusy,
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
      activeModule.key === 'realtime-data' && pdoMode === 'simple'
        ? 'pdo-simple'
        : activeModule.key === 'realtime-data'
          ? 'pdo-advanced'
          : activeModule.key === 'battery-protocol'
            ? 'battery-protocol'
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
              {loadedProject?.summary.name || '未打开项目'}
            </span>
            <span className="action-bar-module">{activeModule.title}</span>
          </div>
          {modifiedSections.length > 0 ? (
            <div className="action-bar-pills">
              {modifiedSections.map((section) => (
                <button
                  className="action-bar-pill"
                  key={section}
                  onClick={() => restoreModifiedPath([section])}
                  type="button"
                  title={`恢复 ${modifiedSectionLabels[section] ?? section}`}
                >
                  {modifiedSectionLabels[section] ?? section}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="action-bar-right">
          <button
            aria-controls="git-summary-panel"
            aria-expanded={showGitSummary}
            className={
              showGitSummary
                ? 'action-bar-git-trigger action-bar-git-trigger--active'
                : 'action-bar-git-trigger'
            }
            onClick={() => setShowGitSummary((visible) => !visible)}
            ref={gitSummaryTriggerRef}
            title="切换 Git 版本摘要"
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
              disabled={isOpening}
              onClick={() => void handleSelectProjectFile()}
              type="button"
              title="打开项目文件"
            >
              <FolderOpen aria-hidden="true" size={14} strokeWidth={1.8} />
              打开
            </button>
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={isOpening || !(loadedProject?.summary.path || projectPath.trim())}
              onClick={() => void handleReloadProject()}
              type="button"
              title="重新加载当前项目"
            >
              <RefreshCw aria-hidden="true" size={14} strokeWidth={1.8} />
              重载
            </button>
          </div>
          <span className="action-bar-sep" />
          <div className="action-bar-group">
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={!hasUnsavedChanges || isSavingProject}
              onClick={restoreAllChanges}
              type="button"
              title="恢复所有未保存修改"
            >
              <Undo2 aria-hidden="true" size={14} strokeWidth={1.8} />
              恢复
            </button>
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={!loadedProject?.summary.path || isSavingProject}
              onClick={() => void handleSaveProjectAs()}
              type="button"
            >
              <SaveAll aria-hidden="true" size={14} strokeWidth={1.8} />
              {savingProjectAction === 'saveAs' ? '另存中...' : '另存为...'}
            </button>
            <button
              className="action-bar-btn action-bar-btn--save"
              disabled={!hasUnsavedChanges || !loadedProject?.summary.path || isSavingProject}
              onClick={requestSaveProject}
              type="button"
            >
              <SaveIcon aria-hidden="true" size={14} strokeWidth={1.8} />
              {savingProjectAction === 'save' ? '保存中...' : '保存'}
            </button>
          </div>
          <span className="action-bar-sep" />
          {currentLegacyTableKind ? (
            <div className="action-bar-group">
              <button
                className="action-bar-btn action-bar-btn--secondary"
                disabled={!loadedProject || isImportingTable}
                onClick={() => void handleImportTableConfig(currentLegacyTableKind)}
                type="button"
                title="从 CSV/XLS/XLSX/XML 文件导入"
              >
                <span className="action-bar-icon">↓</span>
                {isImportingTable ? '导入中...' : '导入'}
              </button>
              <button
                className="action-bar-btn action-bar-btn--ghost"
                disabled={!loadedProject || isExportingTable}
                onClick={() => void handleExportTableConfig(currentLegacyTableKind, 'csv')}
                type="button"
                title="导出为 CSV 格式"
              >
                CSV
              </button>
              <button
                className="action-bar-btn action-bar-btn--ghost"
                disabled={!loadedProject || isExportingTable}
                onClick={() => void handleExportTableConfig(currentLegacyTableKind, 'xml')}
                type="button"
                title="导出为 Excel XML 格式"
              >
                Excel
              </button>
            </div>
          ) : null}
          {(['realtime-data', 'battery-protocol', 'battery-monitor'] as string[]).includes(
            activeModule.key,
          ) ? (
            <button
              className="action-bar-btn action-bar-btn--secondary"
              disabled={!loadedProject || generatingTestKey !== null}
              onClick={handleRequestTestData}
              type="button"
              title="自动构建当前页面的 CAN 测试数据"
            >
              <span className="action-bar-icon">⚡</span>
              {generatingTestKey !== null ? '生成中...' : '生成测试数据'}
            </button>
          ) : null}
          {activeModule.key === 'ui' ? (
            <button
              className={`action-bar-btn ${
                showCanvasLabels ? 'action-bar-btn--secondary' : 'action-bar-btn--ghost'
              }`}
              onClick={onToggleCanvasLabels}
              title={showCanvasLabels ? '隐藏画布上的资源文字标注' : '显示画布上的资源文字标注'}
              type="button"
            >
              {showCanvasLabels ? '隐藏标注' : '显示标注'}
            </button>
          ) : null}
          {(
            [
              'setting-data',
              'realtime-data',
              'battery-protocol',
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
              disabled={!loadedProject}
              onClick={onToggleJsonEditor}
              type="button"
              title="打开 JSON 编辑器"
            >
              {'{ }'}
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
          aria-label="Git 版本摘要"
          className="git-summary-popover"
          id="git-summary-panel"
          ref={gitSummaryRef}
          role="dialog"
        >
          <div className="git-summary-header">
            <span>版本摘要</span>
            <div className="git-summary-header-actions">
              <button
                aria-label="刷新 Git 状态"
                disabled={gitBusy || !loadedProject}
                onClick={() => void refreshProjectGit()}
                title="刷新 Git 状态"
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
              <button
                aria-label="关闭 Git 版本摘要"
                onClick={() => setShowGitSummary(false)}
                title="关闭"
                type="button"
              >
                <X aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {!loadedProject ? (
            <div className="git-summary-empty">
              <FolderGit2 aria-hidden="true" size={18} strokeWidth={1.6} />
              <span>未打开项目</span>
            </div>
          ) : gitStatus?.available ? (
            <div className="git-summary-body">
              <button
                className="git-summary-row"
                onClick={() => void openGitReview()}
                type="button"
              >
                <FileDiff aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">变更</span>
                <span className="git-summary-change-count">
                  <strong>+{gitStatus.additions}</strong>
                  <em>-{gitStatus.deletions}</em>
                </span>
              </button>

              <button
                className="git-summary-row"
                onClick={() => void handleOpenGitRepository()}
                title={gitStatus.repo_root ?? undefined}
                type="button"
              >
                <FolderGit2 aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">本地</span>
                <span className="git-summary-row-value">{gitRepositoryName}</span>
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <button className="git-summary-row" onClick={showProjectGitHistory} type="button">
                <GitBranch aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">{gitStatus.branch}</span>
                <span className="git-summary-row-value git-summary-hash">
                  {gitStatus.head_short_hash ?? '尚无提交'}
                </span>
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <div className="git-summary-divider" />

              <button
                className="git-summary-row"
                disabled={gitStatus.changed_paths.length === 0}
                onClick={() => void openGitReview()}
                type="button"
              >
                <ScanSearch aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">审阅更改</span>
                <span className="git-summary-row-value">
                  {gitStatus.changed_paths.length} 个文件
                </span>
                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              <button
                className="git-summary-row"
                disabled={gitSummaryCommitDisabled}
                onClick={() => void handleCommitProjectVersion()}
                title={
                  hasUnsavedChanges
                    ? '请先保存项目配置'
                    : gitStatus.has_staged_changes
                      ? '暂存区已有其他内容'
                      : gitStatus.changed_paths.length === 0
                        ? '没有可提交的配置修改'
                        : '提交当前项目配置版本'
                }
                type="button"
              >
                <GitCommitHorizontal aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">
                  {gitBusy ? '提交中...' : '提交项目版本'}
                </span>
              </button>

              <div className="git-summary-row git-summary-row--muted">
                <CloudOff aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">远程同步未接入</span>
              </div>

              <button className="git-summary-row" onClick={showProjectGitHistory} type="button">
                <History aria-hidden="true" size={17} strokeWidth={1.7} />
                <span className="git-summary-row-label">版本历史</span>
                <span className="git-summary-row-value">{gitRevisions.length} 条</span>
                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>

              {gitStatus.warning || gitError ? (
                <p className="git-summary-warning">{gitError ?? gitStatus.warning}</p>
              ) : null}
            </div>
          ) : (
            <div className="git-summary-empty git-summary-empty--stacked">
              <FolderGit2 aria-hidden="true" size={18} strokeWidth={1.6} />
              <span>{gitError ?? gitStatus?.warning ?? '正在读取 Git 状态'}</span>
            </div>
          )}
        </div>
      ) : null}

    </>
  );
}
