import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import {
  createProject,
  loadTextFile,
  loadJsonFile,
  loadProject,
  migrateProjectDocument,
  parseProjectDocument,
  saveJsonFile,
  saveProject,
  saveProjectAs,
  saveTextFile,
  validateProjectDocument,
} from '../../api/commands';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { type DocumentSectionKey, refactorOnlySections } from '../../modules/documentSections';
import type { LoadedProject, ProjectParseReport } from '../../types/platform';
import { cloneJson } from '../../utils/projectDirty';
import { formatJsonText } from '../../utils/jsonFormat';
import { getStorageItem, setStorageItem } from '../../utils/safeStorage';
import { runSystemDialog } from '../../utils/systemDialog';

export interface RecentProject {
  path: string;
  name?: string;
  openedAt: string;
}

type SavingProjectAction = 'save' | 'saveAs' | null;

interface UseProjectLifecycleControllerOptions {
  loadedProject: LoadedProject | null;
  hasUnsavedChanges: boolean;
  hasRefactorOnlyChanges: boolean;
  isLegacyJcproProject: boolean;
  onApplyProject: (
    project: LoadedProject,
    baselineOverride?: unknown,
    changedSections?: Iterable<DocumentSectionKey>,
  ) => void;
  onRefreshGit: () => void | Promise<void>;
  onRefreshProtocol: (document: unknown) => undefined | Promise<unknown>;
  onRefreshUi: (document: unknown, projectPath?: string) => undefined | Promise<unknown>;
}

const recentProjectsStorageKey = 'jc-custom-platform.recentProjects';
const maxRecentProjects = 8;
const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function loadRecentProjects() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = getStorageItem(recentProjectsStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is RecentProject => typeof item?.path === 'string')
      : [];
  } catch {
    return [];
  }
}

function persistRecentProjects(projects: RecentProject[]) {
  if (typeof window === 'undefined') return;
  setStorageItem(recentProjectsStorageKey, JSON.stringify(projects.slice(0, maxRecentProjects)));
}

function stripRefactorOnlySections(document: unknown) {
  const next = { ...((document as Record<string, unknown>) ?? {}) };
  for (const section of refactorOnlySections) delete next[section];
  return next;
}

function candidateRefactorConfigPaths(projectFilePath: string) {
  const withoutExtension = projectFilePath.replace(/\.[^\\/.]+$/, '');
  return [`${withoutExtension}.refactor-config.json`, `${withoutExtension}.json`];
}

function mergeRefactorConfigDocument(projectDocument: unknown, sidecarDocument: unknown) {
  const projectObject = { ...((projectDocument as Record<string, unknown>) ?? {}) };
  const sidecarObject = (sidecarDocument as Record<string, unknown>) ?? {};
  for (const section of refactorOnlySections) {
    if (section in sidecarObject && sidecarObject[section] !== null) {
      projectObject[section] = sidecarObject[section];
    }
  }
  return projectObject;
}

export function useProjectLifecycleController({
  loadedProject,
  hasUnsavedChanges,
  hasRefactorOnlyChanges,
  isLegacyJcproProject,
  onApplyProject,
  onRefreshGit,
  onRefreshProtocol,
  onRefreshUi,
}: UseProjectLifecycleControllerOptions) {
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [newProjectName, setNewProjectName] = useState('新建项目');
  const [newResolutionW, setNewResolutionW] = useState(800);
  const [newResolutionH, setNewResolutionH] = useState(480);
  const [openError, setOpenError] = useState<string | null>(null);
  const [projectParseReport, setProjectParseReport] = useState<ProjectParseReport | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isFormattingJcpro, setIsFormattingJcpro] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [savingProjectAction, setSavingProjectAction] = useState<SavingProjectAction>(null);
  const [refactorConfigPath, setRefactorConfigPath] = useState<string | null>(null);
  const [refactorConfigStatus, setRefactorConfigStatus] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const operationGenerationRef = useRef(0);
  const discardConfirmation = useConfirmDialog();

  useEffect(() => {
    const storedProjects = loadRecentProjects();
    setRecentProjects(storedProjects);
    setProjectPath(storedProjects[0]?.path ?? '');
  }, []);

  function updateRecentProjects(nextProject: LoadedProject, fallbackPath?: string) {
    const path = nextProject.summary.path ?? fallbackPath;
    if (!path) return;
    setRecentProjects((current) => {
      const next = [
        { path, name: nextProject.summary.name, openedAt: new Date().toISOString() },
        ...current.filter((item) => item.path !== path),
      ].slice(0, maxRecentProjects);
      persistRecentProjects(next);
      return next;
    });
  }

  function removeRecentProject(path: string) {
    setRecentProjects((current) => {
      const next = current.filter((item) => item.path !== path);
      persistRecentProjects(next);
      return next;
    });
  }

  function clearRecentProjects() {
    setRecentProjects([]);
    persistRecentProjects([]);
  }

  function markDocumentState(hasChanges: boolean) {
    setSaveStatus(hasChanges ? '存在未保存修改' : null);
    if (hasChanges) setShowSaveModal(false);
  }

  function acceptProject(nextProject: LoadedProject, fallbackPath?: string) {
    const nextPath = nextProject.summary.path ?? fallbackPath;
    const nextBaseline = cloneJson(nextProject.document);
    onApplyProject(nextProject, nextBaseline);
    setShowSaveModal(false);
    setSaveStatus(null);
    if (nextPath) setProjectPath(nextPath);
    updateRecentProjects(nextProject, fallbackPath);
  }

  async function confirmDiscardUnsavedChanges(action: string) {
    if (!hasUnsavedChanges) return true;
    return discardConfirmation.ask({
      title: '放弃未保存修改？',
      message: `当前项目存在未保存修改。${action}会放弃这些修改，且无法撤销。`,
      confirmLabel: `放弃并${action}`,
      cancelLabel: '继续编辑',
      danger: true,
    });
  }

  function refactorConfigDocument(document: unknown) {
    const source = (document as Record<string, unknown>) ?? {};
    return {
      config_version: '0.1.0-tauri-refactor-sidecar',
      source_project: loadedProject?.summary.path ?? '',
      project: source.project ?? null,
      signal_dictionary: source.signal_dictionary ?? { signals: [] },
      private_protocol: source.private_protocol ?? { enabled: false, frames: [] },
      protocol_mapping: source.protocol_mapping ?? [],
    };
  }

  async function findRefactorConfig(project: LoadedProject, projectFilePath: string) {
    if (!projectFilePath.toLowerCase().endsWith('.jcpro')) {
      return { project, path: null, status: null };
    }
    for (const candidatePath of candidateRefactorConfigPaths(projectFilePath)) {
      try {
        const sidecar = await loadJsonFile(candidatePath);
        const document = mergeRefactorConfigDocument(project.document, sidecar);
        const validation = await validateProjectDocument(document);
        return {
          project: { ...project, document, validation },
          path: candidatePath,
          status: `已自动挂载：${candidatePath}`,
        };
      } catch {
        // Candidate sidecar is optional.
      }
    }
    return {
      project,
      path: null,
      status: '未挂载重构配置 JSON；修改重构专属配置时会提示创建 sidecar。',
    };
  }

  function beginOpenOperation() {
    const generation = ++operationGenerationRef.current;
    setIsOpening(true);
    setOpenError(null);
    return generation;
  }

  function finishOpenOperation(generation: number) {
    if (generation === operationGenerationRef.current) setIsOpening(false);
  }

  async function createNewProject() {
    setOpenError(null);
    if (!(await confirmDiscardUnsavedChanges('创建新项目'))) return;
    if (!isTauriRuntime()) {
      setOpenError('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await runSystemDialog(
      () =>
        save({
          defaultPath: `${newProjectName}.jcpro`,
          filters: [{ name: '项目文件', extensions: ['jcpro'] }],
        }),
      setOpenError,
    );
    if (!selected) return;

    const generation = beginOpenOperation();
    try {
      const nextProject = await createProject({
        path: selected,
        name: newProjectName,
        resolutionW: newResolutionW,
        resolutionH: newResolutionH,
      });
      if (generation !== operationGenerationRef.current) return;
      setRefactorConfigPath(null);
      setRefactorConfigStatus(null);
      acceptProject(nextProject, selected);
      await onRefreshUi(nextProject.document, nextProject.summary.path ?? selected);
    } catch (cause) {
      if (generation === operationGenerationRef.current) {
        setOpenError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      finishOpenOperation(generation);
    }
  }

  async function openProject(path = projectPath, skipDiscardConfirmation = false) {
    if (!skipDiscardConfirmation && !(await confirmDiscardUnsavedChanges('打开其他项目'))) return;
    const generation = beginOpenOperation();
    try {
      const nextProject = await loadProject(path);
      const mounted = await findRefactorConfig(nextProject, nextProject.summary.path ?? path);
      if (generation !== operationGenerationRef.current) return;
      setRefactorConfigPath(mounted.path);
      setRefactorConfigStatus(mounted.status);
      acceptProject(mounted.project, path);
      void onRefreshUi(mounted.project.document, mounted.project.summary.path ?? path);
    } catch (cause) {
      if (generation === operationGenerationRef.current) {
        setOpenError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      finishOpenOperation(generation);
    }
  }

  async function reloadProject() {
    const reloadPath = loadedProject?.summary.path ?? projectPath;
    if (reloadPath.trim() === '') return;
    if (!(await confirmDiscardUnsavedChanges('重新加载项目'))) return;
    await openProject(reloadPath, true);
  }

  async function selectProjectFile() {
    setOpenError(null);
    if (!(await confirmDiscardUnsavedChanges('打开其他项目'))) return;
    if (!isTauriRuntime()) {
      setOpenError('系统文件选择器只能在桌面应用中使用；也可以粘贴项目路径后打开。');
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: '项目文件', extensions: ['jcpro'] }],
      });
      if (typeof selected === 'string') {
        setProjectPath(selected);
        await openProject(selected, true);
      }
    } catch (cause) {
      setOpenError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function parseProject() {
    if (!loadedProject) return;
    const generation = beginOpenOperation();
    try {
      const report = await parseProjectDocument(loadedProject.document);
      if (generation !== operationGenerationRef.current) return;
      setProjectParseReport(report);
      if (!report.valid) setOpenError(report.errors.join('；') || '项目解析存在问题');
    } catch (cause) {
      if (generation === operationGenerationRef.current) {
        setOpenError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      finishOpenOperation(generation);
    }
  }

  async function migrateProject() {
    if (!loadedProject) return;
    const generation = beginOpenOperation();
    try {
      const migrated = await migrateProjectDocument(loadedProject.document);
      if (generation !== operationGenerationRef.current) return;
      onApplyProject({
        summary: { ...migrated.summary, path: loadedProject.summary.path },
        validation: migrated.validation,
        document: migrated.document,
      });
      await onRefreshUi(migrated.document, loadedProject.summary.path);
      void onRefreshProtocol(migrated.document);
      setSaveStatus(`已规范化：${migrated.migrated_version}`);
    } catch (cause) {
      if (generation === operationGenerationRef.current) {
        setOpenError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      finishOpenOperation(generation);
    }
  }

  function requestSaveProject() {
    if (!loadedProject?.summary.path) return;
    setSaveStatus(null);
    setShowSaveModal(true);
  }

  async function saveRefactorConfigAsJson() {
    if (!loadedProject) return false;
    if (refactorConfigPath) {
      await saveJsonFile(refactorConfigPath, refactorConfigDocument(loadedProject.document));
      setRefactorConfigStatus(`已写回重构配置：${refactorConfigPath}`);
      setSaveStatus(`重构专属配置已写回：${refactorConfigPath}；原 .jcpro 不会写入这些字段。`);
      return true;
    }
    if (!isTauriRuntime()) {
      setSaveStatus(
        '旧 .jcpro 的重构配置需要另存为 JSON；系统保存对话框只能在 Tauri 桌面应用中使用。',
      );
      return false;
    }
    const sourcePath = loadedProject.summary.path ?? loadedProject.summary.name ?? 'project';
    const baseName =
      sourcePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'project';
    const selected = await runSystemDialog(
      () =>
        save({
          defaultPath: `${baseName}.refactor-config.json`,
          filters: [{ name: '重构配置 JSON', extensions: ['json'] }],
        }),
      setSaveStatus,
    );
    if (!selected) return false;
    await saveJsonFile(selected, refactorConfigDocument(loadedProject.document));
    setRefactorConfigPath(selected);
    setRefactorConfigStatus(`已挂载：${selected}`);
    setSaveStatus(`重构专属配置已另存为：${selected}；原 .jcpro 不会写入这些字段。`);
    return true;
  }

  async function formatJcproFile() {
    const path = loadedProject?.summary.path;
    if (!path) {
      setSaveStatus('当前项目没有可格式化的文件路径。');
      return;
    }
    if (!path.toLowerCase().endsWith('.jcpro')) {
      setSaveStatus('手动格式化仅支持 .jcpro JSON 配置文件。');
      return;
    }
    if (hasUnsavedChanges) {
      setSaveStatus('请先保存当前项目配置，再格式化磁盘上的 .jcpro 文件。');
      return;
    }
    if (!isTauriRuntime()) {
      setSaveStatus('jcpro 文件格式化只能在 Tauri 桌面应用中使用。');
      return;
    }

    setIsFormattingJcpro(true);
    setSaveStatus(null);
    try {
      const source = await loadTextFile(path);
      const formatted = formatJsonText(source);
      if (formatted === source) {
        setSaveStatus('当前 .jcpro 文件已经是格式化 JSON。');
        return;
      }
      await saveTextFile(path, formatted);
      await onRefreshGit();
      setSaveStatus(`已格式化 jcpro JSON：${path}`);
    } catch (cause) {
      setSaveStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsFormattingJcpro(false);
    }
  }

  async function mountRefactorConfig() {
    if (!loadedProject) return;
    setSaveStatus(null);
    if (!isTauriRuntime()) {
      setRefactorConfigStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '重构配置 JSON', extensions: ['json'] }],
        }),
      setRefactorConfigStatus,
    );
    if (typeof selected !== 'string') return;
    try {
      const sidecar = await loadJsonFile(selected);
      const document = mergeRefactorConfigDocument(loadedProject.document, sidecar);
      const validation = await validateProjectDocument(document);
      const nextBaseline = cloneJson(document);
      setRefactorConfigPath(selected);
      setRefactorConfigStatus(`已挂载：${selected}`);
      onApplyProject({ ...loadedProject, document, validation }, nextBaseline);
      void onRefreshProtocol(document);
    } catch (cause) {
      setRefactorConfigStatus(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function createRefactorConfig() {
    if (!loadedProject) return;
    try {
      const created = await saveRefactorConfigAsJson();
      if (!created) return;
      const validation = await validateProjectDocument(loadedProject.document);
      const nextBaseline = cloneJson(loadedProject.document);
      onApplyProject({ ...loadedProject, validation }, nextBaseline);
    } catch (cause) {
      setSaveStatus(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function confirmSaveProject() {
    if (!loadedProject?.summary.path) return;
    setSavingProjectAction('save');
    setSaveStatus(null);
    try {
      if (isLegacyJcproProject && hasRefactorOnlyChanges) {
        const exported = await saveRefactorConfigAsJson();
        if (!exported) return;
      }
      const documentToSave = isLegacyJcproProject
        ? stripRefactorOnlySections(loadedProject.document)
        : loadedProject.document;
      const savedProject = await saveProject({
        path: loadedProject.summary.path,
        document: documentToSave,
      });
      const validation = isLegacyJcproProject
        ? await validateProjectDocument(loadedProject.document)
        : savedProject.validation;
      const nextBaseline = isLegacyJcproProject
        ? cloneJson(loadedProject.document)
        : cloneJson(savedProject.document);
      onApplyProject(
        isLegacyJcproProject ? { ...loadedProject, validation } : savedProject,
        nextBaseline,
      );
      updateRecentProjects(savedProject, loadedProject.summary.path);
      setShowSaveModal(false);
      setSaveStatus(
        isLegacyJcproProject && hasRefactorOnlyChanges
          ? '已保存 .jcpro 兼容段，并已导出重构专属 JSON。'
          : '已保存',
      );
      void onRefreshGit();
    } catch (cause) {
      setSaveStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingProjectAction(null);
    }
  }

  async function saveProjectToNewPath() {
    const sourcePath = loadedProject?.summary.path;
    if (!loadedProject || !sourcePath) return;
    setSaveStatus(null);
    if (!isTauriRuntime()) {
      setSaveStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const currentName =
      sourcePath.split(/[\\/]/).pop() || `${loadedProject.summary.name || 'project'}.jcpro`;
    const isRefactorSidecarSave = isLegacyJcproProject && hasRefactorOnlyChanges;
    const selected = await runSystemDialog(
      () =>
        save({
          defaultPath: isRefactorSidecarSave
            ? currentName.replace(/\.[^.]+$/, '.refactor-config.json')
            : currentName,
          filters: isRefactorSidecarSave
            ? [{ name: '重构配置 JSON', extensions: ['json'] }]
            : [{ name: '项目文件', extensions: ['jcpro', 'json'] }],
        }),
      setSaveStatus,
    );
    if (!selected) return;
    if (!isRefactorSidecarSave && selected === sourcePath) {
      setSaveStatus('另存为目标不能与当前项目路径相同。');
      return;
    }

    setSavingProjectAction('saveAs');
    try {
      if (isRefactorSidecarSave) {
        await saveJsonFile(selected, refactorConfigDocument(loadedProject.document));
        setRefactorConfigPath(selected);
        setRefactorConfigStatus(`已挂载：${selected}`);
        const validation = await validateProjectDocument(loadedProject.document);
        const nextBaseline = cloneJson(loadedProject.document);
        onApplyProject({ ...loadedProject, validation }, nextBaseline);
        setSaveStatus(`重构专属配置已另存为：${selected}；当前 .jcpro 未写入新字段。`);
        return;
      }
      const report = await saveProjectAs({
        source_path: sourcePath,
        target_path: selected,
        document: selected.toLowerCase().endsWith('.jcpro')
          ? stripRefactorOnlySections(loadedProject.document)
          : loadedProject.document,
      });
      acceptProject(report.project, selected);
      if (!selected.toLowerCase().endsWith('.jcpro')) {
        setRefactorConfigPath(null);
        setRefactorConfigStatus(null);
      }
      await onRefreshUi(report.project.document, report.project.summary.path ?? selected);
      const copiedText = `已复制 ${report.copied_resources.length} 个资源`;
      const warningText = report.warnings.length > 0 ? `，${report.warnings.length} 个警告` : '';
      setSaveStatus(`已另存为：${selected}（${copiedText}${warningText}）`);
    } catch (cause) {
      setSaveStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingProjectAction(null);
    }
  }

  const selectedRecentProjectPath = recentProjects.some((item) => item.path === projectPath)
    ? projectPath
    : '';

  return {
    clearRecentProjects,
    discardConfirmation,
    confirmSaveProject,
    createNewProject,
    createRefactorConfig,
    formatJcproFile,
    isOpening,
    isFormattingJcpro,
    isSavingProject: savingProjectAction !== null,
    markDocumentState,
    migrateProject,
    mountRefactorConfig,
    newProjectName,
    newResolutionH,
    newResolutionW,
    openError,
    openProject,
    projectParseReport,
    projectPath,
    recentProjects,
    refactorConfigPath,
    refactorConfigStatus,
    reloadProject,
    removeRecentProject,
    requestSaveProject,
    saveProjectToNewPath,
    saveStatus,
    savingProjectAction,
    selectProjectFile,
    selectedRecentProjectPath,
    setNewProjectName,
    setNewResolutionH,
    setNewResolutionW,
    setProjectPath,
    setSaveStatus,
    showSaveModal,
    cancelSaveProject: () => setShowSaveModal(false),
    parseProject,
  };
}

export type ProjectLifecycleController = ReturnType<typeof useProjectLifecycleController>;
