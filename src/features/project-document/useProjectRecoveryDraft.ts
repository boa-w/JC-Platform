import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadedProject } from '../../types/platform';
import { deepEqual } from '../../utils/projectDirty';
import {
  type ProjectRecoveryDraft,
  readProjectRecoveryDraft,
  removeProjectRecoveryDraft,
  sameProjectPath,
  writeProjectRecoveryDraft,
} from './projectRecoveryDraft';

interface UseProjectRecoveryDraftOptions {
  loadedProject: LoadedProject | null;
  hasUnsavedChanges: boolean;
  onRestoreDocument: (document: unknown) => void | Promise<void>;
  onPersistenceError: (message: string) => void;
}

const recoveryDraftDelay = 800;

export function useProjectRecoveryDraft({
  loadedProject,
  hasUnsavedChanges,
  onRestoreDocument,
  onPersistenceError,
}: UseProjectRecoveryDraftOptions) {
  const [candidate, setCandidate] = useState<ProjectRecoveryDraft | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const projectRef = useRef(loadedProject);
  const restoreDocumentRef = useRef(onRestoreDocument);
  const persistenceErrorRef = useRef(onPersistenceError);
  const persistenceErrorReportedRef = useRef(false);
  const previousStateRef = useRef({ path: '', dirty: false });
  projectRef.current = loadedProject;
  restoreDocumentRef.current = onRestoreDocument;
  persistenceErrorRef.current = onPersistenceError;

  const projectPath = loadedProject?.summary.path ?? '';

  const clearCurrentDraft = useCallback((path = projectRef.current?.summary.path) => {
    if (!path) return;
    removeProjectRecoveryDraft(path);
    setCandidate((current) =>
      current && sameProjectPath(current.projectPath, path) ? null : current,
    );
  }, []);

  useEffect(() => {
    if (!projectPath) {
      setCandidate(null);
      return;
    }
    const draft = readProjectRecoveryDraft();
    if (!draft || !sameProjectPath(draft.projectPath, projectPath)) {
      setCandidate(null);
      return;
    }
    if (deepEqual(draft.document, projectRef.current?.document)) {
      removeProjectRecoveryDraft(projectPath);
      setCandidate(null);
      return;
    }
    setCandidate(draft);
    setRestoreError(null);
  }, [projectPath]);

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = { path: projectPath, dirty: hasUnsavedChanges };

    if (previous.dirty && (!hasUnsavedChanges || !sameProjectPath(previous.path, projectPath))) {
      removeProjectRecoveryDraft(previous.path);
      if (candidate && sameProjectPath(candidate.projectPath, previous.path)) setCandidate(null);
    }
    if (!hasUnsavedChanges || !projectPath || !loadedProject) return;

    function persistDraft() {
      const project = projectRef.current;
      const path = project?.summary.path;
      if (!project || !path) return;
      const saved = writeProjectRecoveryDraft({
        projectPath: path,
        projectName: project.summary.name,
        savedAt: new Date().toISOString(),
        document: project.document,
      });
      if (!saved && !persistenceErrorReportedRef.current) {
        persistenceErrorReportedRef.current = true;
        persistenceErrorRef.current('无法创建恢复草稿；请及时手动保存项目。');
      }
    }

    const timer = window.setTimeout(persistDraft, recoveryDraftDelay);
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') persistDraft();
    }
    window.addEventListener('beforeunload', persistDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', persistDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [candidate, hasUnsavedChanges, loadedProject, projectPath]);

  const dismissCandidate = useCallback(() => {
    setCandidate(null);
    setRestoreError(null);
  }, []);

  const discardCandidate = useCallback(() => {
    if (candidate) removeProjectRecoveryDraft(candidate.projectPath);
    dismissCandidate();
  }, [candidate, dismissCandidate]);

  const restoreCandidate = useCallback(async () => {
    if (!candidate || isRestoring) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await restoreDocumentRef.current(candidate.document);
      setCandidate(null);
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsRestoring(false);
    }
  }, [candidate, isRestoring]);

  return {
    candidate,
    clearCurrentDraft,
    discardCandidate,
    dismissCandidate,
    isRestoring,
    restoreCandidate,
    restoreError,
  };
}

export type ProjectRecoveryDraftController = ReturnType<typeof useProjectRecoveryDraft>;
