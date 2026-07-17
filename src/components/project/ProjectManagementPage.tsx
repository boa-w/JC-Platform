import type { Dispatch, SetStateAction } from 'react';
import type {
  GitProjectStatus,
  GitRevision,
  LoadedProject,
  ProjectParseReport,
} from '../../types/platform';

export interface RecentProject {
  path: string;
  name?: string;
  openedAt: string;
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
  refreshProjectGit,
  handleCommitProjectVersion,
  handlePreviewProjectVersion,
}: ProjectManagementPageProps) {
  return (
          <section className="project-page">
            {/* Open project */}
            <div className="project-section">
              <div className="project-section-header">
                <strong>打开现有项目</strong>
                <span className="project-section-hint">.jcpro</span>
              </div>
              <div className="project-open-row">
                <input
                  aria-label="项目文件路径"
                  className="project-open-input"
                  placeholder="输入或粘贴 .jcpro 文件路径"
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
                    disabled={isOpening}
                  >
                    {isOpening ? '打开中...' : '浏览'}
                  </button>
                  <button
                    className="project-open-btn project-open-btn--secondary"
                    type="button"
                    onClick={() => void handleOpenProject()}
                    disabled={isOpening || projectPath.trim() === ''}
                  >
                    打开
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
                  <strong>最近项目</strong>
                  <button
                    className="project-link-btn"
                    disabled={recentProjects.length === 0}
                    onClick={clearRecentProjects}
                    type="button"
                  >
                    清空
                  </button>
                </div>
                <div className="project-recent-row">
                  <select
                    aria-label="最近项目"
                    className="project-recent-select"
                    value={selectedRecentProjectPath}
                    onChange={(event) => setProjectPath(event.target.value)}
                    disabled={isOpening}
                    title={selectedRecentProjectPath || '选择最近项目'}
                  >
                    <option value="" disabled>
                      选择最近项目
                    </option>
                    {recentProjects.map((item) => (
                      <option key={item.path} value={item.path}>
                        {`${item.name || '未命名'} - ${item.path}`}
                      </option>
                    ))}
                  </select>
                  <div className="project-open-actions project-open-actions--compact">
                    <button
                      className="project-open-btn project-open-btn--secondary"
                      type="button"
                      onClick={() => void handleOpenProject(selectedRecentProjectPath)}
                      disabled={isOpening || selectedRecentProjectPath === ''}
                    >
                      打开项目
                    </button>
                    <button
                      className="project-open-btn project-open-btn--secondary"
                      type="button"
                      onClick={() => removeRecentProject(selectedRecentProjectPath)}
                      disabled={isOpening || selectedRecentProjectPath === ''}
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Create project */}
            <div className="project-section">
              <div className="project-section-header">
                <strong>新建项目</strong>
              </div>
              <div className="project-create-form">
                <input
                  aria-label="新项目名称"
                  className="project-create-name"
                  placeholder="项目名称"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                />
                <div className="project-create-bottom">
                  <div className="project-create-resolution">
                    <span className="project-create-label">分辨率</span>
                    <input
                      aria-label="项目分辨率宽度"
                      className="project-create-num"
                      min="1"
                      type="number"
                      value={newResolutionW}
                      onChange={(event) => setNewResolutionW(Number(event.target.value))}
                    />
                    <span className="project-create-x">×</span>
                    <input
                      aria-label="项目分辨率高度"
                      className="project-create-num"
                      min="1"
                      type="number"
                      value={newResolutionH}
                      onChange={(event) => setNewResolutionH(Number(event.target.value))}
                    />
                  </div>
                  <button
                    className="project-open-btn"
                    disabled={isOpening || newProjectName.trim() === ''}
                    onClick={() => void handleCreateProject()}
                    type="button"
                  >
                    创建项目
                  </button>
                </div>
              </div>
            </div>

            {/* Loaded project info */}
            {loadedProject ? (
              <div className="project-section">
                <div className="project-section-header">
                  <strong>当前项目</strong>
                  <div className="project-info-actions">
                    <button
                      className="project-link-btn"
                      disabled={isOpening}
                      onClick={() => void handleParseProject()}
                      type="button"
                    >
                      解析
                    </button>
                    <button
                      className="project-link-btn"
                      disabled={isOpening}
                      onClick={() => void handleMigrateProject()}
                      type="button"
                    >
                      补齐结构
                    </button>
                    <button
                      className="project-link-btn"
                      disabled={isOpening}
                      onClick={() => void handleMountRefactorConfig()}
                      type="button"
                    >
                      挂载重构配置
                    </button>
                    <button
                      className="project-link-btn"
                      disabled={isOpening || !loadedProject}
                      onClick={() => void handleCreateRefactorConfig()}
                      type="button"
                    >
                      {refactorConfigPath ? '保存重构配置' : '创建重构配置'}
                    </button>
                  </div>
                </div>
                <div className="project-info-grid">
                  <div className="project-info-item">
                    <span>名称</span>
                    <strong>{loadedProject.summary.name}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>分辨率</span>
                    <strong>{loadedProject.summary.deviceResolution}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>路径</span>
                    <strong className="project-info-path">{loadedProject.summary.path}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>校验</span>
                    <strong className={effectiveProjectValid ? 'text-success' : 'text-danger'}>
                      {effectiveProjectValid ? '兼容段通过' : '缺少兼容段'}
                    </strong>
                  </div>
                  <div className="project-info-item">
                    <span>重构配置</span>
                    <strong className="project-info-path">{refactorConfigPath ?? '未挂载'}</strong>
                  </div>
                </div>
                {refactorConfigStatus ? (
                  <p className={refactorConfigPath ? 'text-success' : 'project-open-warning'}>
                    {refactorConfigStatus}
                  </p>
                ) : null}
                {compatibleMissingSections.length > 0 ? (
                  <p className="project-open-error">
                    缺少兼容段：{compatibleMissingSections.join('、')}
                  </p>
                ) : null}
                {!refactorConfigPath && sidecarMissingSections.length > 0 ? (
                  <p className="project-open-warning">
                    重构专属段未在 .jcpro 中保存：{sidecarMissingSections.join('、')}
                    。可通过“挂载重构配置”关联独立 JSON。
                  </p>
                ) : null}
                {loadedProject.validation.warnings.length > 0 ? (
                  <p className="project-open-warning">
                    警告：{loadedProject.validation.warnings.join('；')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {loadedProject ? (
              <div
                className="project-section project-git-section"
                ref={(node) => {
                  projectGitSectionRef.current = node;
                }}
              >
                <div className="project-section-header">
                  <strong>Git 版本管理</strong>
                  <button
                    className="project-link-btn"
                    disabled={gitBusy}
                    onClick={() => void refreshProjectGit()}
                    type="button"
                  >
                    刷新
                  </button>
                </div>
                {gitStatus?.available ? (
                  <>
                    <div className="project-info-grid">
                      <div className="project-info-item">
                        <span>仓库</span>
                        <strong className="project-info-path">{gitStatus.repo_root}</strong>
                      </div>
                      <div className="project-info-item">
                        <span>分支</span>
                        <strong>{gitStatus.branch}</strong>
                      </div>
                      <div className="project-info-item">
                        <span>当前版本</span>
                        <strong className="project-info-path">
                          {gitStatus.head_short_hash ?? '尚无提交'}
                        </strong>
                      </div>
                      <div className="project-info-item">
                        <span>配置状态</span>
                        <strong
                          className={
                            gitStatus.changed_paths.length > 0 ? 'text-warning' : 'text-success'
                          }
                        >
                          {gitStatus.changed_paths.length > 0
                            ? `${gitStatus.changed_paths.length} 个文件待提交`
                            : '已同步'}
                        </strong>
                      </div>
                    </div>
                    <div className="git-version-create">
                      <input
                        className="git-version-input"
                        maxLength={120}
                        onChange={(event) => setGitMessage(event.target.value)}
                        placeholder="版本说明"
                        value={gitMessage}
                      />
                      <button
                        className="project-open-btn"
                        disabled={
                          gitBusy ||
                          hasUnsavedChanges ||
                          gitStatus.has_staged_changes ||
                          gitStatus.changed_paths.length === 0 ||
                          gitMessage.trim() === ''
                        }
                        onClick={() => void handleCommitProjectVersion()}
                        type="button"
                      >
                        {gitBusy ? '处理中...' : '保存版本'}
                      </button>
                    </div>
                    <p className="git-managed-paths">
                      受管文件：{gitStatus.managed_paths.join('、')}
                    </p>
                    {hasUnsavedChanges ? (
                      <p className="project-open-warning">
                        请先保存当前项目配置，再创建 Git 版本。
                      </p>
                    ) : null}
                    {gitStatus.has_staged_changes ? (
                      <p className="project-open-warning">
                        Git 暂存区已有内容。为避免混入其他改动，项目版本提交已停用。
                      </p>
                    ) : null}
                    {gitStatus.warning ? (
                      <p className="project-open-warning">{gitStatus.warning}</p>
                    ) : null}
                    <div className="git-history">
                      <div className="git-history-header">
                        <strong>版本历史</strong>
                        <span>{gitRevisions.length} 条</span>
                      </div>
                      {gitRevisions.length > 0 ? (
                        <div className="git-history-list">
                          {gitRevisions.map((revision) => (
                            <div className="git-history-row" key={revision.hash}>
                              <code>{revision.short_hash}</code>
                              <div className="git-history-copy">
                                <strong>{revision.subject}</strong>
                                <span>
                                  {revision.author} ·{' '}
                                  {new Date(revision.authored_at).toLocaleString()}
                                </span>
                              </div>
                              <button
                                className="project-link-btn"
                                disabled={gitBusy}
                                onClick={() => void handlePreviewProjectVersion(revision)}
                                type="button"
                              >
                                查看
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="git-history-empty">当前项目文件还没有 Git 提交记录。</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="git-history-empty">
                    {gitStatus?.warning ?? '正在检查项目所在的 Git 仓库...'}
                  </p>
                )}
                {gitError ? <p className="project-open-error">{gitError}</p> : null}
              </div>
            ) : null}

            {/* Parse report */}
            {projectParseReport ? (
              <div className="project-section">
                <div className="project-section-header">
                  <strong>解析报告</strong>
                </div>
                <div className="project-info-grid">
                  <div className="project-info-item">
                    <span>有效</span>
                    <strong className={projectParseReport.valid ? 'text-success' : 'text-danger'}>
                      {projectParseReport.valid ? '是' : '否'}
                    </strong>
                  </div>
                  <div className="project-info-item">
                    <span>补齐段落</span>
                    <strong>{projectParseReport.added_sections.length}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>错误</span>
                    <strong
                      className={projectParseReport.errors.length > 0 ? 'text-danger' : undefined}
                    >
                      {projectParseReport.errors.length}
                    </strong>
                  </div>
                </div>
                {projectParseReport.errors.length > 0 ? (
                  <p className="project-open-error">{projectParseReport.errors.join('；')}</p>
                ) : null}
              </div>
            ) : null}
          </section>
  );
}
