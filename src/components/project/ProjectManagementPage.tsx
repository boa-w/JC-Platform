import type { Dispatch, SetStateAction } from 'react';
import { Braces } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  GitProjectStatus,
  GitRevision,
  LoadedProject,
  ProjectParseReport,
} from '../../types/platform';
import { getJcproVersion, getJcproVersionValue } from '../../utils/jcproVersion';

export interface RecentProject {
  path: string;
  name?: string;
  openedAt: string;
  configVersion?: string;
}

interface ProjectManagementPageProps {
  projectPath: string;
  setProjectPath: Dispatch<SetStateAction<string>>;
  isOpening: boolean;
  openError: string | null;
  recentProjects: RecentProject[];
  selectedRecentProjectPath: string;
  clearRecentProjects: () => void;
  removeRecentProject: (path: string) => void;
  newProjectName: string;
  setNewProjectName: Dispatch<SetStateAction<string>>;
  newResolutionW: number;
  setNewResolutionW: Dispatch<SetStateAction<number>>;
  newResolutionH: number;
  setNewResolutionH: Dispatch<SetStateAction<number>>;
  loadedProject: LoadedProject | null;
  effectiveProjectValid: boolean;
  refactorConfigPath: string | null;
  refactorConfigStatus: string | null;
  compatibleMissingSections: string[];
  sidecarMissingSections: string[];
  projectGitSectionRef: { current: HTMLDivElement | null };
  gitBusy: boolean;
  gitLoading: boolean;
  gitStatus: GitProjectStatus | null;
  gitMessage: string;
  setGitMessage: Dispatch<SetStateAction<string>>;
  hasUnsavedChanges: boolean;
  gitRevisions: GitRevision[];
  gitError: string | null;
  projectParseReport: ProjectParseReport | null;
  handleSelectProjectFile: () => void | Promise<void>;
  handleOpenProject: (pathOverride?: string) => void | Promise<void>;
  handleCreateProject: () => void | Promise<void>;
  handleParseProject: () => void | Promise<void>;
  handleMigrateProject: () => void | Promise<void>;
  handleMountRefactorConfig: () => void | Promise<void>;
  handleCreateRefactorConfig: () => void | Promise<void>;
  handleFormatJcproFile: () => void | Promise<void>;
  isFormattingJcpro: boolean;
  refreshProjectGit: () => void | Promise<void>;
  handleCommitProjectVersion: () => void | Promise<void>;
  handlePreviewProjectVersion: (revision: GitRevision) => void | Promise<void>;
}

export function ProjectManagementPage({
  projectPath,
  setProjectPath,
  isOpening,
  openError,
  recentProjects,
  selectedRecentProjectPath,
  clearRecentProjects,
  removeRecentProject,
  newProjectName,
  setNewProjectName,
  newResolutionW,
  setNewResolutionW,
  newResolutionH,
  setNewResolutionH,
  loadedProject,
  effectiveProjectValid,
  refactorConfigPath,
  refactorConfigStatus,
  compatibleMissingSections,
  sidecarMissingSections,
  projectGitSectionRef,
  gitBusy,
  gitLoading,
  gitStatus,
  gitMessage,
  setGitMessage,
  hasUnsavedChanges,
  gitRevisions,
  gitError,
  projectParseReport,
  handleSelectProjectFile,
  handleOpenProject,
  handleCreateProject,
  handleParseProject,
  handleMigrateProject,
  handleMountRefactorConfig,
  handleCreateRefactorConfig,
  handleFormatJcproFile,
  isFormattingJcpro,
  refreshProjectGit,
  handleCommitProjectVersion,
  handlePreviewProjectVersion,
}: ProjectManagementPageProps) {
  const { t } = useTranslation();
  const projectBusy = isOpening || isFormattingJcpro;
  const loadedVersion = getJcproVersion(loadedProject?.document);
  const loadedVersionValue = getJcproVersionValue(loadedProject?.document);
  const isJc001Project = loadedVersionValue === 'jc001';
  const versionLabel = (version: string | null | undefined) => {
    if (version === 'jc001' || version === 'jc002') {
      return t(`projectManagement.versionTypes.${version}`);
    }
    return t('projectManagement.versionTypes.unknown', {
      version: version || t('projectManagement.versionTypes.notDetected'),
    });
  };

  return (
    <section className="project-page">
      {/* Open project */}
      <div className="project-section">
        <div className="project-section-header">
          <strong>{t('projectManagement.openExisting')}</strong>
          <span className="project-section-hint">.jcpro</span>
        </div>
        <div className="project-open-row">
          <input
            aria-label={t('projectManagement.projectPathLabel')}
            className="project-open-input"
            disabled={projectBusy}
            placeholder={t('projectManagement.projectPathPlaceholder')}
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleOpenProject();
            }}
          />
          <div className="project-open-actions">
            <button
              className="project-open-btn"
              type="button"
              onClick={() => void handleSelectProjectFile()}
              disabled={projectBusy}
            >
              {t(isOpening ? 'projectManagement.opening' : 'projectManagement.browse')}
            </button>
            <button
              className="project-open-btn project-open-btn--secondary"
              type="button"
              onClick={() => void handleOpenProject()}
              disabled={projectBusy || projectPath.trim() === ''}
            >
              {t('dashboard.actionBar.open')}
            </button>
          </div>
        </div>
        {openError ? (
          <p className="project-open-error" role="alert">
            {openError}
          </p>
        ) : null}
      </div>

      {/* Recent projects */}
      {recentProjects.length > 0 ? (
        <div className="project-section">
          <div className="project-section-header">
            <strong>{t('projectManagement.recentProjects')}</strong>
            <button
              className="project-link-btn"
              disabled={recentProjects.length === 0}
              onClick={clearRecentProjects}
              type="button"
            >
              {t('projectManagement.clear')}
            </button>
          </div>
          <div className="project-recent-row">
            <select
              aria-label={t('projectManagement.recentProjects')}
              className="project-recent-select"
              value={selectedRecentProjectPath}
              onChange={(event) => setProjectPath(event.target.value)}
              disabled={projectBusy}
              title={selectedRecentProjectPath || t('projectManagement.selectRecent')}
            >
              <option value="" disabled>
                {t('projectManagement.selectRecent')}
              </option>
              {recentProjects.map((item) => (
                <option key={item.path} value={item.path}>
                  {`${item.name || t('projectManagement.unnamed')} · ${versionLabel(item.configVersion)} - ${item.path}`}
                </option>
              ))}
            </select>
            <div className="project-open-actions project-open-actions--compact">
              <button
                className="project-open-btn project-open-btn--secondary"
                type="button"
                onClick={() => void handleOpenProject(selectedRecentProjectPath)}
                disabled={projectBusy || selectedRecentProjectPath === ''}
              >
                {t('projectManagement.openProject')}
              </button>
              <button
                className="project-open-btn project-open-btn--secondary"
                type="button"
                onClick={() => removeRecentProject(selectedRecentProjectPath)}
                disabled={projectBusy || selectedRecentProjectPath === ''}
              >
                {t('projectManagement.remove')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create project */}
      <div className="project-section">
        <div className="project-section-header">
          <strong>{t('projectManagement.createNew')}</strong>
          <span className="jcpro-version-badge jcpro-version-badge--v1">
            {t('projectManagement.versionTypes.jc001')}
          </span>
        </div>
        <div className="project-create-form">
          <input
            aria-label={t('projectManagement.newProjectNameLabel')}
            className="project-create-name"
            placeholder={t('projectManagement.projectNamePlaceholder')}
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
          />
          <div className="project-create-bottom">
            <div className="project-create-resolution">
              <span className="project-create-label">{t('projectManagement.resolution')}</span>
              <input
                aria-label={t('projectManagement.resolutionWidth')}
                className="project-create-num"
                min="1"
                type="number"
                value={newResolutionW}
                onChange={(event) => setNewResolutionW(Number(event.target.value))}
              />
              <span className="project-create-x">×</span>
              <input
                aria-label={t('projectManagement.resolutionHeight')}
                className="project-create-num"
                min="1"
                type="number"
                value={newResolutionH}
                onChange={(event) => setNewResolutionH(Number(event.target.value))}
              />
            </div>
            <button
              className="project-open-btn"
              disabled={projectBusy || newProjectName.trim() === ''}
              onClick={() => void handleCreateProject()}
              type="button"
            >
              {t('projectManagement.createProject')}
            </button>
          </div>
        </div>
      </div>

      {/* Loaded project info */}
      {loadedProject ? (
        <div className="project-section">
          <div className="project-section-header">
            <strong>{t('projectManagement.currentProject')}</strong>
            <div className="project-info-actions">
              <button
                className="project-link-btn"
                disabled={projectBusy}
                onClick={() => void handleParseProject()}
                type="button"
              >
                {t('projectManagement.parse')}
              </button>
              <button
                className="project-link-btn"
                disabled={projectBusy}
                onClick={() => void handleMigrateProject()}
                type="button"
              >
                {t('projectManagement.completeStructure')}
              </button>
              <button
                className="project-link-btn"
                disabled={projectBusy}
                onClick={() => void handleMountRefactorConfig()}
                type="button"
              >
                {t('projectManagement.mountRefactorConfig')}
              </button>
              <button
                className="project-link-btn project-link-btn--icon"
                disabled={projectBusy || !loadedProject}
                onClick={() => void handleCreateRefactorConfig()}
                type="button"
              >
                {t(
                  refactorConfigPath
                    ? 'projectManagement.saveRefactorConfig'
                    : 'projectManagement.createRefactorConfig',
                )}
              </button>
              <button
                className="project-link-btn project-link-btn--icon"
                disabled={
                  projectBusy ||
                  hasUnsavedChanges ||
                  !loadedProject.summary.path?.toLowerCase().endsWith('.jcpro')
                }
                onClick={() => void handleFormatJcproFile()}
                title={
                  hasUnsavedChanges
                    ? t('projectManagement.saveUnsavedFirst')
                    : t('projectManagement.formatJcproTitle')
                }
                type="button"
              >
                <Braces aria-hidden="true" size={13} strokeWidth={1.8} />
                {t(
                  isFormattingJcpro
                    ? 'projectManagement.formatting'
                    : 'projectManagement.formatJcpro',
                )}
              </button>
            </div>
          </div>
          <div className="project-info-grid">
            <div className="project-info-item">
              <span>{t('projectManagement.versionType')}</span>
              <strong
                className={`jcpro-version-text jcpro-version-text--${loadedVersion}`}
                data-testid="current-project-version"
              >
                {versionLabel(loadedVersionValue)}
              </strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.name')}</span>
              <strong>{loadedProject.summary.name}</strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.resolution')}</span>
              <strong>{loadedProject.summary.deviceResolution}</strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.path')}</span>
              <strong className="project-info-path">{loadedProject.summary.path}</strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.validation')}</span>
              <strong className={effectiveProjectValid ? 'text-success' : 'text-danger'}>
                {t(
                  effectiveProjectValid
                    ? 'projectManagement.compatibleValid'
                    : 'projectManagement.compatibleMissing',
                )}
              </strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.refactorConfig')}</span>
              <strong className="project-info-path">
                {refactorConfigPath ?? t('projectManagement.notMounted')}
              </strong>
            </div>
          </div>
          {isJc001Project ? (
            <p
              aria-label={t('projectManagement.legacySidecarDeprecated')}
              className="project-open-warning project-deprecation-notice"
              data-testid="legacy-sidecar-deprecation"
              role="note"
            >
              <span className="module-lifecycle-badge module-lifecycle-badge--deprecated">
                {t('common.lifecycle.deprecated')}
              </span>
              {t('projectManagement.legacySidecarDeprecated')}
            </p>
          ) : null}
          {refactorConfigStatus ? (
            <p
              aria-live="polite"
              className={refactorConfigPath ? 'text-success' : 'project-open-warning'}
              role="status"
            >
              {refactorConfigStatus}
            </p>
          ) : null}
          {compatibleMissingSections.length > 0 ? (
            <p className="project-open-error" role="alert">
              {t('projectManagement.missingCompatibleSections', {
                sections: compatibleMissingSections.join(t('common.punctuation.listSeparator')),
              })}
            </p>
          ) : null}
          {!refactorConfigPath && sidecarMissingSections.length > 0 ? (
            <p className="project-open-warning">
              {t('projectManagement.sidecarSectionsMissing', {
                sections: sidecarMissingSections.join(t('common.punctuation.listSeparator')),
              })}
            </p>
          ) : null}
          {loadedProject.validation.warnings.length > 0 ? (
            <p className="project-open-warning">
              {t('projectManagement.warnings', {
                warnings: loadedProject.validation.warnings.join(t('common.punctuation.semicolon')),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {loadedProject ? (
        <div
          aria-busy={gitLoading || isFormattingJcpro}
          className="project-section project-git-section"
          ref={(node) => {
            projectGitSectionRef.current = node;
          }}
        >
          <div className="project-section-header">
            <strong>{t('projectManagement.git.title')}</strong>
            <button
              className="project-link-btn"
              disabled={gitBusy || gitLoading || projectBusy}
              onClick={() => void refreshProjectGit()}
              type="button"
            >
              {t(gitLoading ? 'projectManagement.git.loading' : 'common.actions.refresh')}
            </button>
          </div>
          {gitStatus?.available ? (
            <>
              {gitLoading ? (
                <p className="git-loading-status" role="status">
                  {t('projectManagement.git.backgroundLoading')}
                </p>
              ) : null}
              <div className="project-info-grid">
                <div className="project-info-item">
                  <span>{t('projectManagement.git.repository')}</span>
                  <strong className="project-info-path">{gitStatus.repo_root}</strong>
                </div>
                <div className="project-info-item">
                  <span>{t('gitReview.branch')}</span>
                  <strong>{gitStatus.branch}</strong>
                </div>
                <div className="project-info-item">
                  <span>{t('projectManagement.git.currentVersion')}</span>
                  <strong className="project-info-path">
                    {gitStatus.head_short_hash ?? t('dashboard.gitSummary.noCommits')}
                  </strong>
                </div>
                <div className="project-info-item">
                  <span>{t('projectManagement.git.configStatus')}</span>
                  <strong
                    className={gitStatus.changed_paths.length > 0 ? 'text-warning' : 'text-success'}
                  >
                    {gitStatus.changed_paths.length > 0
                      ? t('projectManagement.git.filesPending', {
                          count: gitStatus.changed_paths.length,
                        })
                      : t('projectManagement.git.synced')}
                  </strong>
                </div>
              </div>
              <div className="git-version-create">
                <input
                  className="git-version-input"
                  maxLength={120}
                  onChange={(event) => setGitMessage(event.target.value)}
                  placeholder={t('gitReview.versionMessage')}
                  value={gitMessage}
                />
                <button
                  className="project-open-btn"
                  disabled={
                    gitBusy ||
                    projectBusy ||
                    hasUnsavedChanges ||
                    gitStatus.has_staged_changes ||
                    gitStatus.changed_paths.length === 0 ||
                    gitMessage.trim() === ''
                  }
                  onClick={() => void handleCommitProjectVersion()}
                  type="button"
                >
                  {t(gitBusy ? 'projectManagement.git.processing' : 'projectManagement.git.saveVersion')}
                </button>
              </div>
              <p className="git-managed-paths">
                {t('projectManagement.git.managedFiles', {
                  files: gitStatus.managed_paths.join(t('common.punctuation.listSeparator')),
                })}
              </p>
              {hasUnsavedChanges ? (
                <p className="project-open-warning">{t('projectManagement.git.saveFirst')}</p>
              ) : null}
              {gitStatus.has_staged_changes ? (
                <p className="project-open-warning">
                  {t('projectManagement.git.stagingOccupied')}
                </p>
              ) : null}
              {gitStatus.warning ? (
                <p className="project-open-warning">{gitStatus.warning}</p>
              ) : null}
              <div className="git-history">
                <div className="git-history-header">
                  <strong>{t('dashboard.gitSummary.history')}</strong>
                  <span>{t('dashboard.gitSummary.revisionCount', { count: gitRevisions.length })}</span>
                </div>
                {gitRevisions.length > 0 ? (
                  <div className="git-history-list">
                    {gitRevisions.map((revision) => (
                      <div className="git-history-row" key={revision.hash}>
                        <code>{revision.short_hash}</code>
                        <div className="git-history-copy">
                          <strong>{revision.subject}</strong>
                          <span>
                            {revision.author} · {new Date(revision.authored_at).toLocaleString()}
                          </span>
                        </div>
                        <button
                          className="project-link-btn"
                          disabled={gitBusy || projectBusy}
                          onClick={() => void handlePreviewProjectVersion(revision)}
                          type="button"
                        >
                          {t('projectManagement.git.view')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="git-history-empty">{t('projectManagement.git.noHistory')}</p>
                )}
              </div>
            </>
          ) : (
            <p className="git-history-empty">
              {gitStatus?.warning ??
                (gitLoading
                  ? t('projectManagement.git.backgroundLoading')
                  : t('projectManagement.git.checkingRepository'))}
            </p>
          )}
          {gitError ? (
            <p className="project-open-error" role="alert">
              {gitError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Parse report */}
      {projectParseReport ? (
        <div className="project-section">
          <div className="project-section-header">
            <strong>{t('projectManagement.parseReport.title')}</strong>
          </div>
          <div className="project-info-grid">
            <div className="project-info-item">
              <span>{t('projectManagement.parseReport.valid')}</span>
              <strong className={projectParseReport.valid ? 'text-success' : 'text-danger'}>
                {t(
                  projectParseReport.valid
                    ? 'projectManagement.parseReport.yes'
                    : 'projectManagement.parseReport.no',
                )}
              </strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.parseReport.addedSections')}</span>
              <strong>{projectParseReport.added_sections.length}</strong>
            </div>
            <div className="project-info-item">
              <span>{t('projectManagement.parseReport.errors')}</span>
              <strong className={projectParseReport.errors.length > 0 ? 'text-danger' : undefined}>
                {projectParseReport.errors.length}
              </strong>
            </div>
          </div>
          {projectParseReport.errors.length > 0 ? (
            <p className="project-open-error" role="alert">
              {projectParseReport.errors.join('；')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
