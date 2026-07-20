import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Columns2,
  FileJson2,
  GitBranch,
  GitCommitHorizontal,
  History,
  Pencil,
  RefreshCw,
  RotateCcw,
  Rows3,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type {
  GitDiffLine,
  GitReviewFile,
  GitReviewReport,
  GitRevision,
  GitWorktreeFileContent,
} from '../../types/platform';
import { getStorageItem, setStorageItem } from '../../utils/safeStorage';
import './git-review.css';

const GitWorktreeDiffEditor = lazy(() =>
  import('./GitWorktreeDiffEditor').then((module) => ({
    default: module.GitWorktreeDiffEditor,
  })),
);

type GitReviewViewMode = 'unified' | 'split';

interface GitSplitDiffRow {
  left?: GitDiffLine;
  right?: GitDiffLine;
}

interface GitReviewWorkspaceProps {
  report: GitReviewReport | null;
  revision: GitRevision | null;
  statusBranch?: string;
  busy: boolean;
  error: string | null;
  commitBusy: boolean;
  commitDisabled: boolean;
  message: string;
  onMessageChange: (message: string) => void;
  onCommit: () => void;
  onRestore: () => void;
  onRefresh: () => void;
  canEditWorkingTree: boolean;
  onLoadWorkingTreeFile: (path: string) => Promise<GitWorktreeFileContent>;
  onSaveWorkingTreeFile: (path: string, content: string) => Promise<void>;
  onClose: () => void;
}

const viewModeStorageKey = 'jc-custom-platform.gitReviewView';

function loadViewMode(): GitReviewViewMode {
  if (typeof window === 'undefined') return 'unified';
  return getStorageItem(viewModeStorageKey) === 'split' ? 'split' : 'unified';
}

function unchangedLinesBeforeHunk(file: GitReviewFile, hunkIndex: number) {
  const hunk = file.hunks[hunkIndex];
  if (!hunk || hunk.old_start === 0) return 0;
  if (hunkIndex === 0) return Math.max(0, hunk.old_start - 1);
  const previous = file.hunks[hunkIndex - 1];
  const previousEnd = previous.lines.reduce(
    (maximum, line) => Math.max(maximum, line.old_line ?? maximum),
    previous.old_start,
  );
  return Math.max(0, hunk.old_start - previousEnd - 1);
}

function buildSplitDiffRows(lines: GitDiffLine[]): GitSplitDiffRow[] {
  const rows: GitSplitDiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === 'context') {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const deletions: GitDiffLine[] = [];
    const additions: GitDiffLine[] = [];
    while (index < lines.length && lines[index].kind !== 'context') {
      if (lines[index].kind === 'deletion') deletions.push(lines[index]);
      else additions.push(lines[index]);
      index += 1;
    }
    const rowCount = Math.max(deletions.length, additions.length);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      rows.push({ left: deletions[rowIndex], right: additions[rowIndex] });
    }
  }
  return rows;
}

export function GitReviewWorkspace({
  report,
  revision,
  statusBranch,
  busy,
  error,
  commitBusy,
  commitDisabled,
  message,
  onMessageChange,
  onCommit,
  onRestore,
  onRefresh,
  canEditWorkingTree,
  onLoadWorkingTreeFile,
  onSaveWorkingTreeFile,
  onClose,
}: GitReviewWorkspaceProps) {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<GitReviewViewMode>(loadViewMode);
  const [editorFile, setEditorFile] = useState<GitWorktreeFileContent | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLElement | null>>({});
  const activeFile = report?.files.find((file) => file.path === activePath) ?? null;

  useEffect(() => {
    const paths = new Set(report?.files.map((file) => file.path) ?? []);
    setActivePath((current) =>
      current && paths.has(current) ? current : (report?.files[0]?.path ?? null),
    );
    setCollapsedFiles((current) => new Set([...current].filter((path) => paths.has(path))));
    setEditorFile(null);
    setEditorDirty(false);
    setEditorError(null);
  }, [report]);

  function updateViewMode(mode: GitReviewViewMode) {
    setViewMode(mode);
    setStorageItem(viewModeStorageKey, mode);
  }

  function toggleFile(path: string) {
    setCollapsedFiles((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleAllFiles() {
    if (!report) return;
    setCollapsedFiles((current) =>
      current.size === report.files.length
        ? new Set()
        : new Set(report.files.map((file) => file.path)),
    );
  }

  function scrollToFile(path: string) {
    setActivePath(path);
    setCollapsedFiles((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    window.setTimeout(
      () => fileRefs.current[path]?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }

  async function openWorkingTreeEditor() {
    if (!activeFile || revision || activeFile.status === 'deleted') return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const content = await onLoadWorkingTreeFile(activeFile.path);
      setEditorFile(content);
      setEditorDirty(false);
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEditorBusy(false);
    }
  }

  function closeWorkingTreeEditor() {
    setEditorFile(null);
    setEditorDirty(false);
    setEditorError(null);
  }

  async function saveWorkingTreeFile(content: string) {
    if (!editorFile || !editorDirty) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      await onSaveWorkingTreeFile(editorFile.path, content);
      closeWorkingTreeEditor();
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <section aria-label="Git 更改审阅" className="git-review-workspace">
      <aside className="git-review-sidebar">
        <div className="git-review-sidebar-header">
          <div>
            <span>{revision ? '版本差异' : '更改'}</span>
            <strong>{report?.files.length ?? 0}</strong>
          </div>
          <span className="git-review-stats">
            <strong>+{report?.additions ?? 0}</strong>
            <em>-{report?.deletions ?? 0}</em>
          </span>
        </div>
        <div className="git-review-file-list">
          {report?.files.map((file) => (
            <button
              className={
                activePath === file.path
                  ? 'git-review-file-item git-review-file-item--active'
                  : 'git-review-file-item'
              }
              key={file.path}
              disabled={editorFile !== null}
              onClick={() => scrollToFile(file.path)}
              title={file.path}
              type="button"
            >
              <FileJson2 aria-hidden="true" size={15} strokeWidth={1.7} />
              <span>
                <strong>{file.path.split('/').pop()}</strong>
                <small>{file.path}</small>
              </span>
              <code className={`git-review-status git-review-status--${file.status}`}>
                {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
              </code>
            </button>
          ))}
        </div>
      </aside>

      <div className="git-review-main">
        <header className="git-review-toolbar">
          <div className="git-review-branch-info">
            <div>
              <GitBranch aria-hidden="true" size={17} strokeWidth={1.8} />
              <strong>{revision?.short_hash ?? report?.branch ?? statusBranch ?? '分支'}</strong>
              <span className="git-review-stats">
                <strong>+{report?.additions ?? 0}</strong>
                <em>-{report?.deletions ?? 0}</em>
              </span>
            </div>
            <p>
              {revision ? (report?.base_ref ?? '父版本') : 'HEAD'}
              <span>→</span>
              {revision?.short_hash ?? '工作区'}
              {!revision && report?.base_ref ? <small>上游 {report.base_ref}</small> : null}
            </p>
          </div>
          <div className="git-review-toolbar-actions">
            {!revision ? (
              <button
                aria-label="编辑当前工作区文件"
                disabled={
                  !canEditWorkingTree ||
                  !activeFile ||
                  activeFile.status === 'deleted' ||
                  editorFile !== null ||
                  editorBusy
                }
                onClick={() => void openWorkingTreeEditor()}
                title={
                  !canEditWorkingTree
                    ? '请先保存或恢复主编辑器中的修改'
                    : activeFile?.status === 'deleted'
                      ? '已删除文件无法编辑'
                      : '编辑当前未提交文件'
                }
                type="button"
              >
                <Pencil aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>
            ) : null}
            <fieldset aria-label="对比视图" className="git-review-view-switch">
              <button
                aria-label="统一对比视图"
                aria-pressed={viewMode === 'unified'}
                className={viewMode === 'unified' ? 'active' : undefined}
                onClick={() => updateViewMode('unified')}
                title="统一对比视图"
                type="button"
              >
                <Rows3 aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>
              <button
                aria-label="并排对比视图"
                aria-pressed={viewMode === 'split'}
                className={viewMode === 'split' ? 'active' : undefined}
                onClick={() => updateViewMode('split')}
                title="并排对比视图"
                type="button"
              >
                <Columns2 aria-hidden="true" size={15} strokeWidth={1.7} />
              </button>
            </fieldset>
            <button
              aria-label="展开或折叠全部文件"
              disabled={!report?.files.length}
              onClick={toggleAllFiles}
              title="展开或折叠全部文件"
              type="button"
            >
              <ChevronsUpDown aria-hidden="true" size={16} strokeWidth={1.7} />
            </button>
            <button
              aria-label="刷新审阅"
              disabled={busy || editorFile !== null}
              onClick={onRefresh}
              title="刷新审阅"
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} strokeWidth={1.7} />
            </button>
            <button
              aria-label="关闭审阅"
              disabled={editorDirty || editorBusy}
              onClick={onClose}
              title={editorDirty ? '请先保存或取消文件编辑' : '关闭审阅'}
              type="button"
            >
              <X aria-hidden="true" size={17} strokeWidth={1.7} />
            </button>
          </div>
          {revision ? (
            <div className="git-review-history-bar">
              <div>
                <History aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>
                  <strong>{revision.subject}</strong>
                  <small>
                    {revision.author} · {new Date(revision.authored_at).toLocaleString()}
                  </small>
                </span>
              </div>
              <button disabled={commitBusy} onClick={onRestore} type="button">
                <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
                {commitBusy ? '正在恢复...' : '恢复为工作副本'}
              </button>
            </div>
          ) : (
            <div className="git-review-commit-bar">
              <input
                aria-label="版本说明"
                maxLength={120}
                onChange={(event) => onMessageChange(event.target.value)}
                placeholder="版本说明"
                value={message}
              />
              <button
                disabled={commitDisabled || message.trim() === ''}
                onClick={onCommit}
                type="button"
              >
                <GitCommitHorizontal aria-hidden="true" size={16} strokeWidth={1.8} />
                {commitBusy ? '提交中...' : '提交版本'}
              </button>
            </div>
          )}
        </header>

        <div className="git-review-content">
          {editorFile ? (
            <Suspense
              fallback={
                <div className="git-review-empty" role="status">
                  <RefreshCw aria-hidden="true" className="git-review-spin" size={22} />
                  <span>正在加载对照编辑器</span>
                </div>
              }
            >
              <GitWorktreeDiffEditor
                busy={editorBusy}
                error={editorError}
                file={editorFile}
                onCancel={closeWorkingTreeEditor}
                onDirtyChange={setEditorDirty}
                onSave={saveWorkingTreeFile}
              />
            </Suspense>
          ) : busy && !report ? (
            <div className="git-review-empty">
              <RefreshCw aria-hidden="true" className="git-review-spin" size={22} />
              <span>正在读取更改</span>
            </div>
          ) : error || editorError ? (
            <div className="git-review-empty git-review-empty--error" role="alert">
              <X aria-hidden="true" size={22} />
              <span>{error ?? editorError}</span>
            </div>
          ) : report?.files.length ? (
            report.files.map((file) => {
              const collapsed = collapsedFiles.has(file.path);
              return (
                <article
                  className="git-review-file"
                  key={file.path}
                  ref={(element) => {
                    fileRefs.current[file.path] = element;
                  }}
                >
                  <button
                    aria-expanded={!collapsed}
                    className="git-review-file-header"
                    onClick={() => toggleFile(file.path)}
                    type="button"
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={collapsed ? 'git-review-chevron--collapsed' : undefined}
                      size={16}
                      strokeWidth={1.8}
                    />
                    <FileJson2 aria-hidden="true" size={16} strokeWidth={1.7} />
                    <strong>{file.path}</strong>
                    <span className="git-review-stats">
                      <strong>+{file.additions}</strong>
                      <em>-{file.deletions}</em>
                    </span>
                  </button>
                  {collapsed ? null : (
                    <div className="git-review-diff">
                      {file.hunks.map((hunk, hunkIndex) => {
                        const unchanged = unchangedLinesBeforeHunk(file, hunkIndex);
                        return (
                          <div
                            className="git-review-hunk"
                            key={`${hunk.old_start}-${hunk.new_start}`}
                          >
                            <div className="git-review-hunk-header" title={hunk.header}>
                              <ChevronDown aria-hidden="true" size={14} strokeWidth={1.7} />
                              <span>
                                {unchanged > 0
                                  ? `${unchanged} 行未修改`
                                  : `${hunk.old_start} → ${hunk.new_start}`}
                              </span>
                            </div>
                            {viewMode === 'unified' ? (
                              hunk.lines.map((line) => (
                                <div
                                  className={`git-review-line git-review-line--${line.kind}`}
                                  key={`${line.kind}-${line.old_line ?? 'n'}-${line.new_line ?? 'n'}`}
                                >
                                  <span>{line.old_line ?? ''}</span>
                                  <span>{line.new_line ?? ''}</span>
                                  <i>
                                    {line.kind === 'addition'
                                      ? '+'
                                      : line.kind === 'deletion'
                                        ? '-'
                                        : ' '}
                                  </i>
                                  <code>{line.content || ' '}</code>
                                </div>
                              ))
                            ) : (
                              <div className="git-review-split-diff">
                                {buildSplitDiffRows(hunk.lines).map((row) => (
                                  <div
                                    className="git-review-split-row"
                                    key={`${row.left?.old_line ?? 'n'}-${row.right?.new_line ?? 'n'}-${row.left?.kind ?? 'empty'}-${row.right?.kind ?? 'empty'}`}
                                  >
                                    <div
                                      className={`git-review-split-side git-review-split-side--${row.left?.kind ?? 'empty'}`}
                                    >
                                      <span>{row.left?.old_line ?? ''}</span>
                                      <i>{row.left?.kind === 'deletion' ? '-' : ' '}</i>
                                      <code>{row.left?.content || ' '}</code>
                                    </div>
                                    <div
                                      className={`git-review-split-side git-review-split-side--${row.right?.kind ?? 'empty'}`}
                                    >
                                      <span>{row.right?.new_line ?? ''}</span>
                                      <i>{row.right?.kind === 'addition' ? '+' : ' '}</i>
                                      <code>{row.right?.content || ' '}</code>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <div className="git-review-empty">
              <Check aria-hidden="true" size={24} strokeWidth={1.8} />
              <strong>{revision ? '该版本未修改受管配置文件' : '没有待审阅的配置更改'}</strong>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
