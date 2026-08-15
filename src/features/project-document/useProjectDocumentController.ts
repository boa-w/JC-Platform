import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentDirtySections } from '../../hooks/useDocumentDirtySections';
import {
  type DocumentSectionKey,
  refactorOnlySections,
  trackedDocumentSections,
} from '../../modules/documentSections';
import type { LoadedProject } from '../../types/platform';
import {
  cloneJson,
  deepEqual,
  isPathModified,
  type JsonPath,
  restorePath,
} from '../../utils/projectDirty';
import { withRequiredEditorSections } from './projectDocumentDefaults';

interface UseProjectDocumentControllerOptions {
  loadedProject: LoadedProject | null;
  onDocumentStateChange: (hasChanges: boolean) => void;
  onProjectLoaded: (project: LoadedProject) => void;
}

function trackedSectionsFromPaths(paths: readonly JsonPath[]) {
  return paths
    .map((path) => path[0])
    .filter(
      (section): section is DocumentSectionKey =>
        typeof section === 'string' &&
        (trackedDocumentSections as readonly string[]).includes(section),
    );
}

export function useProjectDocumentController({
  loadedProject,
  onDocumentStateChange,
  onProjectLoaded,
}: UseProjectDocumentControllerOptions) {
  const [baselineDocument, setBaselineDocument] = useState<unknown | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const baselineDocumentRef = useRef<unknown | null>(null);
  const loadedProjectRef = useRef(loadedProject);
  const onDocumentStateChangeRef = useRef(onDocumentStateChange);
  const onProjectLoadedRef = useRef(onProjectLoaded);
  onDocumentStateChangeRef.current = onDocumentStateChange;
  onProjectLoadedRef.current = onProjectLoaded;
  loadedProjectRef.current = loadedProject;

  const { clearDirtySections, dirtySections, recalculateDirtySections } =
    useDocumentDirtySections();

  const applyLoadedProject = useCallback(
    (
      nextProject: LoadedProject,
      baselineOverride?: unknown,
      changedSections?: Iterable<DocumentSectionKey>,
    ) => {
      const nextBaseline =
        baselineOverride !== undefined ? baselineOverride : baselineDocumentRef.current;
      let nextDirtySections = new Set<DocumentSectionKey>();
      if (nextBaseline) {
        nextDirtySections = recalculateDirtySections(
          nextProject.document,
          changedSections,
          baselineOverride !== undefined ? nextBaseline : undefined,
        );
      } else {
        clearDirtySections();
      }
      if (baselineOverride !== undefined) {
        baselineDocumentRef.current = baselineOverride;
        setBaselineDocument(baselineOverride);
      }
      const nextHasChanges = nextBaseline
        ? nextDirtySections.size > 0 || !deepEqual(nextProject.document, nextBaseline)
        : true;
      onProjectLoadedRef.current(nextProject);
      setHasUnsavedChanges(nextHasChanges);
      onDocumentStateChangeRef.current(nextHasChanges);
    },
    [clearDirtySections, recalculateDirtySections],
  );

  useEffect(() => {
    if (!loadedProject) return;
    const document = withRequiredEditorSections(loadedProject.document);
    if (!document) return;
    const nextBaseline = cloneJson(document);
    applyLoadedProject({ ...loadedProject, document }, nextBaseline);
  }, [applyLoadedProject, loadedProject]);

  const isModifiedPath = useCallback(
    (path: JsonPath) => {
      if (path.length === 1 && typeof path[0] === 'string') {
        const section = path[0] as DocumentSectionKey;
        if ((trackedDocumentSections as readonly string[]).includes(section)) {
          return dirtySections.has(section);
        }
      }
      return loadedProject
        ? isPathModified(loadedProject.document, baselineDocumentRef.current, path)
        : false;
    },
    [dirtySections, loadedProject],
  );

  const restoreModifiedPath = useCallback(
    (path: JsonPath) => {
      const baseline = baselineDocumentRef.current;
      if (!loadedProject || !baseline) return;
      const document = restorePath(loadedProject.document, baseline, path);
      applyLoadedProject(
        { ...loadedProject, document },
        undefined,
        trackedSectionsFromPaths([path]),
      );
    },
    [applyLoadedProject, loadedProject],
  );

  const restoreAllChanges = useCallback(() => {
    const baseline = baselineDocumentRef.current;
    if (!loadedProject || !baseline) return;
    applyLoadedProject(
      { ...loadedProject, document: cloneJson(baseline) },
      undefined,
      trackedDocumentSections,
    );
  }, [applyLoadedProject, loadedProject]);

  const restoreProjectPaths = useCallback(
    (paths: readonly JsonPath[]) => {
      const baseline = baselineDocumentRef.current;
      if (!loadedProject || !baseline) return null;
      let document = loadedProject.document;
      for (const path of paths) document = restorePath(document, baseline, path);
      applyLoadedProject(
        { ...loadedProject, document },
        undefined,
        trackedSectionsFromPaths(paths),
      );
      return document;
    },
    [applyLoadedProject, loadedProject],
  );

  const updateProjectDocument = useCallback(
    (section: string, value: unknown) => {
      const project = loadedProjectRef.current;
      if (!project) return;
      const document = { ...(project.document as Record<string, unknown>), [section]: value };
      const changedSection = (trackedDocumentSections as readonly string[]).includes(section)
        ? [section as DocumentSectionKey]
        : undefined;
      applyLoadedProject({ ...project, document }, undefined, changedSection);
    },
    [applyLoadedProject],
  );

  const updateProjectSections = useCallback(
    (sections: Record<string, unknown>) => {
      const project = loadedProjectRef.current;
      if (!project) return;
      const document = { ...(project.document as Record<string, unknown>), ...sections };
      const changedSections = Object.keys(sections).filter(
        (section): section is DocumentSectionKey =>
          (trackedDocumentSections as readonly string[]).includes(section),
      );
      applyLoadedProject({ ...project, document }, undefined, changedSections);
    },
    [applyLoadedProject],
  );

  const modifiedSections = loadedProject
    ? trackedDocumentSections.filter((section) => dirtySections.has(section))
    : [];
  const hasRefactorOnlyChanges = modifiedSections.some((section) =>
    (refactorOnlySections as readonly string[]).includes(section),
  );
  const isLegacyJcproProject =
    (loadedProject?.summary.path?.toLowerCase().endsWith('.jcpro') ?? false) &&
    (loadedProject?.document as Record<string, unknown> | undefined)?.config_version !== 'jc002';
  const projectMissingSections = loadedProject?.validation.missing_sections ?? [];
  const compatibleMissingSections = projectMissingSections.filter(
    (section) => !(refactorOnlySections as readonly string[]).includes(section),
  );
  const sidecarMissingSections = projectMissingSections.filter((section) =>
    (refactorOnlySections as readonly string[]).includes(section),
  );

  return {
    applyLoadedProject,
    baselineDocument,
    compatibleMissingSections,
    effectiveProjectValid: compatibleMissingSections.length === 0,
    hasRefactorOnlyChanges,
    hasUnsavedChanges,
    isLegacyJcproProject,
    isModifiedPath,
    modifiedSections,
    restoreAllChanges,
    restoreModifiedPath,
    restoreProjectPaths,
    sidecarMissingSections,
    updateProjectDocument,
    updateProjectSections,
  };
}

export type ProjectDocumentController = ReturnType<typeof useProjectDocumentController>;
