import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  commitProjectGitVersion,
  loadProjectGitContext,
  loadProjectGitRevision,
  reviewProjectGitChanges,
  reviewProjectGitRevision,
  revealItemInDir,
} from '../../api/commands';
import type {
  GitProjectRequest,
  GitProjectStatus,
  GitRevision,
  GitReviewReport,
  NavigationKey,
} from '../../types/platform';
import { refactorOnlySections } from '../../modules/documentSections';

const defaultCommitMessage = '更新项目配置';
const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function mergeSnapshotDocuments(projectDocument: unknown, sidecarDocument: unknown) {
  const document = { ...((projectDocument as Record<string, unknown>) ?? {}) };
  const sidecar = (sidecarDocument as Record<string, unknown>) ?? {};
  for (const section of refactorOnlySections) {
    if (section in sidecar && sidecar[section] !== null) document[section] = sidecar[section];
  }
  return document;
}

interface UseProjectGitControllerOptions {
  projectPath?: string;
  sidecarPath: string | null;
  hasUnsavedChanges: boolean;
  onNavigate: (key: NavigationKey) => void;
  onRestoreDocument: (document: unknown, revision: GitRevision) => void | Promise<void>;
  onStatusChange: (message: string) => void;
}

export function useProjectGitController({
  projectPath,
  sidecarPath,
  hasUnsavedChanges,
  onNavigate,
  onRestoreDocument,
  onStatusChange,
}: UseProjectGitControllerOptions) {
  const [status, setStatus] = useState<GitProjectStatus | null>(null);
  const [revisions, setRevisions] = useState<GitRevision[]>([]);
  const [message, setMessage] = useState(defaultCommitMessage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<GitReviewReport | null>(null);
  const [reviewRevision, setReviewRevision] = useState<GitRevision | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const refreshGenerationRef = useRef(0);
  const reviewGenerationRef = useRef(0);
  const projectSectionRef = useRef<HTMLDivElement | null>(null);

  const request = useMemo<GitProjectRequest | null>(
    () =>
      projectPath
        ? { project_path: projectPath, sidecar_path: sidecarPath ?? undefined }
        : null,
    [projectPath, sidecarPath],
  );
  const previousRequestRef = useRef(request);

  const refresh = useCallback(async () => {
    const generation = ++refreshGenerationRef.current;
    if (!request || !isTauriRuntime()) {
      setStatus(null);
      setRevisions([]);
      setError(null);
      return;
    }
    try {
      const context = await loadProjectGitContext(request, 20);
      if (generation !== refreshGenerationRef.current) return;
      setStatus(context.status);
      setRevisions(context.revisions);
      setError(null);
    } catch (cause) {
      if (generation !== refreshGenerationRef.current) return;
      setStatus(null);
      setRevisions([]);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [request]);

  const refreshReview = useCallback(
    async (revision: GitRevision | null = reviewRevision) => {
      if (!request) return;
      const generation = ++reviewGenerationRef.current;
      setReviewBusy(true);
      setReviewError(null);
      try {
        const nextReview = revision
          ? await reviewProjectGitRevision(request, revision.hash)
          : await reviewProjectGitChanges(request);
        if (generation === reviewGenerationRef.current) setReview(nextReview);
      } catch (cause) {
        if (generation !== reviewGenerationRef.current) return;
        setReview(null);
        setReviewError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (generation === reviewGenerationRef.current) setReviewBusy(false);
      }
    },
    [request, reviewRevision],
  );

  const closeReview = useCallback(() => {
    reviewGenerationRef.current += 1;
    setReviewBusy(false);
    setShowReview(false);
    setReviewRevision(null);
    setReview(null);
    setReviewError(null);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 100);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  useEffect(() => {
    if (previousRequestRef.current === request) return;
    previousRequestRef.current = request;
    refreshGenerationRef.current += 1;
    setStatus(null);
    setRevisions([]);
    setError(null);
    closeReview();
  }, [closeReview, request]);

  useEffect(() => {
    document.body.classList.toggle('git-review-open', showReview);
    return () => document.body.classList.remove('git-review-open');
  }, [showReview]);

  async function commitVersion() {
    if (!request) return;
    if (hasUnsavedChanges) {
      setError('请先保存当前项目配置，再创建 Git 版本。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const report = await commitProjectGitVersion({ ...request, message });
      setMessage(defaultCommitMessage);
      onStatusChange(`已保存 Git 版本 ${report.short_hash}：${report.subject}`);
      await refresh();
      if (showReview) await refreshReview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function previewVersion(revision: GitRevision) {
    if (!request) return;
    setReviewRevision(revision);
    setReview(null);
    setShowReview(true);
    await refreshReview(revision);
  }

  async function restoreVersion() {
    if (!request || !reviewRevision) return;
    if (
      hasUnsavedChanges &&
      !window.confirm('当前项目存在未保存修改。继续恢复会用历史版本替换这些修改，是否继续？')
    ) {
      return;
    }
    setBusy(true);
    setReviewError(null);
    try {
      const snapshot = await loadProjectGitRevision(request, reviewRevision.hash);
      const document = snapshot.sidecar_document
        ? mergeSnapshotDocuments(snapshot.project_document, snapshot.sidecar_document)
        : snapshot.project_document;
      await onRestoreDocument(document, snapshot.revision);
      closeReview();
    } catch (cause) {
      setReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function openRepository() {
    if (!status?.repo_root) return;
    try {
      await revealItemInDir(status.repo_root);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function showHistory() {
    onNavigate('project');
    window.setTimeout(
      () => projectSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }

  async function openReview() {
    setReviewRevision(null);
    setReview(null);
    setShowReview(true);
    await refreshReview(null);
  }

  const commitDisabled =
    !status?.available ||
    busy ||
    hasUnsavedChanges ||
    status.has_staged_changes ||
    status.changed_paths.length === 0;
  const repositoryName = status?.repo_root?.split(/[\\/]/).filter(Boolean).pop() ?? '本地仓库';

  return {
    busy,
    commitDisabled,
    error,
    message,
    projectSectionRef,
    repositoryName,
    review,
    reviewBusy,
    reviewError,
    reviewRevision,
    revisions,
    showReview,
    status,
    closeReview,
    commitVersion,
    openRepository,
    openReview,
    previewVersion,
    refresh,
    refreshReview,
    restoreVersion,
    setMessage,
    showHistory,
  };
}

export type ProjectGitController = ReturnType<typeof useProjectGitController>;
