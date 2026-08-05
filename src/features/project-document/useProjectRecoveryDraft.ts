import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoadedProject, ProjectRecoveryDraft } from '../../types/platform';
import { deepEqual } from '../../utils/projectDirty';
import { sameProjectPath } from './projectRecoveryDraft';
import {
  clearPersistedRecoveryDraft,
  readPersistedRecoveryDraft,
  writePersistedRecoveryDraft,
} from './recoveryDraftPersistence';

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
  const { t } = useTranslation();
  const [candidate, setCandidate] = useState<ProjectRecoveryDraft | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [loadedRecoveryPath, setLoadedRecoveryPath] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const projectRef = useRef(loadedProject);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const restoreDocumentRef = useRef(onRestoreDocument);
  const persistenceErrorRef = useRef(onPersistenceError);
  const persistenceErrorReportedRef = useRef(false);
  const previousStateRef = useRef({ path: '', dirty: false });
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  projectRef.current = loadedProject;
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  restoreDocumentRef.current = onRestoreDocument;
  persistenceErrorRef.current = onPersistenceError;

  const projectPath = loadedProject?.summary.path ?? '';

  const enqueueOperation = useCallback(<T>(operation: () => Promise<T>) => {
    const pending = operationQueueRef.current.then(operation, operation);
    operationQueueRef.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }, []);

  const reportPersistenceError = useCallback((cause: unknown) => {
    if (persistenceErrorReportedRef.current) return;
    persistenceErrorReportedRef.current = true;
    const detail = cause instanceof Error ? cause.message : String(cause);
    persistenceErrorRef.current(
      t('recoveryDraft.persistenceError', { detail: detail ? ` ${detail}` : '' }),
    );
  }, [t]);

  const clearCurrentDraft = useCallback(
    async (path = projectRef.current?.summary.path) => {
      if (!path) return false;
      try {
        const removed = await enqueueOperation(() => clearPersistedRecoveryDraft(path));
        setCandidate((current) =>
          current && sameProjectPath(current.projectPath, path) ? null : current,
        );
        return removed;
      } catch (cause) {
        reportPersistenceError(cause);
        return null;
      }
    },
    [enqueueOperation, reportPersistenceError],
  );

  const persistCurrentDraft = useCallback(async () => {
    const project = projectRef.current;
    const path = project?.summary.path;
    if (!project || !path || !hasUnsavedChangesRef.current) return true;
    const draft: ProjectRecoveryDraft = {
      schemaVersion: 1,
      projectPath: path,
      projectName: project.summary.name,
      savedAt: new Date().toISOString(),
      document: project.document,
    };
    try {
      await enqueueOperation(() => writePersistedRecoveryDraft(draft));
      persistenceErrorReportedRef.current = false;
      return true;
    } catch (cause) {
      reportPersistenceError(cause);
      return false;
    }
  }, [enqueueOperation, reportPersistenceError]);

  useEffect(() => {
    if (!projectPath) {
      setCandidate(null);
      setLoadedRecoveryPath('');
      return;
    }
    let cancelled = false;
    setLoadedRecoveryPath('');

    void enqueueOperation(async () => {
      const draft = await readPersistedRecoveryDraft();
      if (
        draft &&
        sameProjectPath(draft.projectPath, projectPath) &&
        deepEqual(draft.document, projectRef.current?.document)
      ) {
        await clearPersistedRecoveryDraft(projectPath);
        return null;
      }
      return draft;
    })
      .then((draft) => {
        if (cancelled) return;
        setLoadedRecoveryPath(projectPath);
        if (!draft || !sameProjectPath(draft.projectPath, projectPath)) {
          setCandidate(null);
          return;
        }
        setCandidate(draft);
        setRestoreError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setLoadedRecoveryPath(projectPath);
        reportPersistenceError(cause);
      });

    return () => {
      cancelled = true;
    };
  }, [enqueueOperation, projectPath, reportPersistenceError]);

  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = { path: projectPath, dirty: hasUnsavedChanges };

    if (previous.dirty && (!hasUnsavedChanges || !sameProjectPath(previous.path, projectPath))) {
      void clearCurrentDraft(previous.path);
    }
    if (
      !hasUnsavedChanges ||
      !projectPath ||
      !loadedProject ||
      !sameProjectPath(loadedRecoveryPath, projectPath)
    ) {
      return;
    }

    function persistDraft() {
      void persistCurrentDraft();
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
  }, [
    clearCurrentDraft,
    hasUnsavedChanges,
    loadedProject,
    loadedRecoveryPath,
    persistCurrentDraft,
    projectPath,
  ]);

  const dismissCandidate = useCallback(() => {
    setCandidate(null);
    setRestoreError(null);
  }, []);

  const discardCandidate = useCallback(async () => {
    if (!candidate || isDiscarding) return;
    setIsDiscarding(true);
    setRestoreError(null);
    const cleared = await clearCurrentDraft(candidate.projectPath);
    if (cleared !== null) dismissCandidate();
    else setRestoreError(t('recoveryDraft.deleteFailed'));
    setIsDiscarding(false);
  }, [candidate, clearCurrentDraft, dismissCandidate, isDiscarding, t]);

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
    isDiscarding,
    isRestoring,
    persistCurrentDraft,
    restoreCandidate,
    restoreError,
  } as const;
}

export type ProjectRecoveryDraftController = ReturnType<typeof useProjectRecoveryDraft>;
