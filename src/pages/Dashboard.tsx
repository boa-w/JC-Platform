import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef, useState } from 'react';
import {
  addUiResourceOptionDocument,
  commitProjectGitVersion,
  createProject,
  loadJsonFile,
  loadProject,
  loadProjectGitContext,
  loadProjectGitRevision,
  migrateProjectDocument,
  parsePdoAdvancedProject,
  parseProjectDocument,
  parseUiResources,
  parseUiResourcesWithProjectPath,
  removeUiResourceOptionDocument,
  reviewProjectGitChanges,
  reviewProjectGitRevision,
  revealItemInDir,
  saveJsonFile,
  saveProject,
  saveProjectAs,
  updateUiResourceDocument,
  validateProjectDocument,
} from '../api/commands';
import { Breadcrumb } from '../components/Breadcrumb';
import { GitReviewWorkspace } from '../components/git';
import { JsonEditorPopup } from '../components/json-editor';
import { ProjectManagementPage, type RecentProject } from '../components/project';
import { LanguagePage } from '../components/language';
import {
  BatteryMonitorPage,
  BatteryProtocolPage,
  useBatteryLegacyController,
} from '../features/battery-legacy';
import { CanTestDataPage } from '../features/can-test-data';
import { CanopenExportPage } from '../features/canopen-export';
import { FaultCodePage } from '../features/fault-code';
import { DashboardActionBar, DashboardDialogs } from '../features/dashboard-shell';
import {
  PrivateProtocolPage,
  ProtocolMappingPage,
  SignalDictionaryPage,
  useProtocolEditor,
} from '../features/protocol-editor';
import { ProjectExportPage, useProjectExport } from '../features/project-export';
import { SettingsPage } from '../features/settings';
import { RealtimeDataPage, usePdoEditor } from '../features/realtime-data';
import { SettingDataPage } from '../features/setting-data';
import {
  TableConfigStatusPanel,
  TableFormatReference,
  useTableConfigController,
} from '../features/table-config';
import { UiCanvasPreview } from '../components/UiCanvasPreview';
import { featureModules } from '../data/modules';
import { getTestData, type TestDataType } from '../data/test-data';
import { useCanTestData } from '../hooks/useCanTestData';
import { useDocumentDirtySections } from '../hooks/useDocumentDirtySections';
import {
  advancedConfigSections,
  configSectionForEditor,
  type DocumentSectionKey,
  jsonEditorKeyForModule,
  refactorOnlySections,
  restorePathsForEditor,
  trackedDocumentSections,
} from '../modules/documentSections';
import { useExportBatteryOptions } from '../stores/exportSettings';
import { useTranslationSettings } from '../stores/translationSettings';
import type {
  BackendHealth,
  FeatureModule,
  GitProjectRequest,
  GitProjectStatus,
  GitRevision,
  GitReviewReport,
  LanguageDocument,
  LoadedProject,
  NavigationKey,
  PdoAdvancedParseReport,
  ProjectParseReport,
  ProjectSummary,
  UiResourceParseReport,
  UiResourceUpdateRequest,
} from '../types/platform';
import {
  cloneJson,
  deepEqual,
  isPathModified,
  type JsonPath,
  restorePath,
} from '../utils/projectDirty';

interface DashboardProps {
  activeModule: FeatureModule;
  health: BackendHealth | null;
  project: ProjectSummary | null;
  loadedProject: LoadedProject | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (key: NavigationKey) => void;
  onProjectLoaded: (project: LoadedProject) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const recentProjectsStorageKey = 'jc-custom-platform.recentProjects';
const maxRecentProjects = 8;
function loadRecentProjects() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(recentProjectsStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is RecentProject => typeof item?.path === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: RecentProject[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    recentProjectsStorageKey,
    JSON.stringify(projects.slice(0, maxRecentProjects)),
  );
}

const previewDocument = {
  ui_info: {
    logo: {
      name: 'logo',
      x: 0,
      y: 0,
      w: 240,
      h: 80,
      handle: 'show',
      default_option: 0,
      dest: 'logo',
      option: ['image/logo.png'],
    },
    main: {
      item: {
        speed: {
          name: '速度表',
          x: 64,
          y: 96,
          w: 180,
          h: 120,
          handle: 'list',
          default_option: 0,
          dest: ['speed_0', 'speed_1'],
          option: [{ list: ['image/main/speed_0.png', 'image/main/speed_1.png'] }],
        },
        gear: {
          name: '档位动画',
          x: 300,
          y: 104,
          w: 160,
          h: 96,
          handle: 'anim',
          default_option: 0,
          dest: 'gear',
          option: [
            { base_name: 'image/anim/gear_', start_index: 0, total: 6, reserved: 2, type: 'png' },
          ],
        },
      },
    },
  },
  pdo_simple_send_recv: { pdo_send: [], pdo_recv: [] },
  pdo_global_param: [],
  pdo_condition: [],
  pdo_recv: [],
  pdo_send: [],
  sdo_info: { type: 0, user_auth: 0, name_index: 0, name: 'root', children: [] },
  language_info: { list_code_language: ['zh'], list_inner: [], list_translate: {} },
};

export function Dashboard({
  activeModule,
  loadedProject,
  theme,
  onToggleTheme,
  onNavigate,
  onProjectLoaded,
}: DashboardProps) {
  const [uiPreview, setUiPreview] = useState<UiResourceParseReport | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [baselineDocument, setBaselineDocument] = useState<unknown | null>(null);
  const {
    clearDirtySections,
    dirtySections,
    recalculateDirtySections,
    resetBaseline: resetDirtySectionBaseline,
  } = useDocumentDirtySections();
  const [newProjectName, setNewProjectName] = useState('新建项目');
  const [newResolutionW, setNewResolutionW] = useState(800);
  const [newResolutionH, setNewResolutionH] = useState(480);
  const [openError, setOpenError] = useState<string | null>(null);
  const [projectParseReport, setProjectParseReport] = useState<ProjectParseReport | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [uiApplyError, setUiApplyError] = useState<string | null>(null);
  const [isApplyingUi, setIsApplyingUi] = useState(false);
  const [showCanvasLabels, setShowCanvasLabels] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingProjectAction, setSavingProjectAction] = useState<'save' | 'saveAs' | null>(null);
  const isSavingProject = savingProjectAction !== null;
  const [refactorConfigPath, setRefactorConfigPath] = useState<string | null>(null);
  const [refactorConfigStatus, setRefactorConfigStatus] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitProjectStatus | null>(null);
  const [gitRevisions, setGitRevisions] = useState<GitRevision[]>([]);
  const [gitMessage, setGitMessage] = useState('更新项目配置');
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [gitReview, setGitReview] = useState<GitReviewReport | null>(null);
  const [gitReviewRevision, setGitReviewRevision] = useState<GitRevision | null>(null);
  const [showGitReview, setShowGitReview] = useState(false);
  const [gitReviewBusy, setGitReviewBusy] = useState(false);
  const [gitReviewError, setGitReviewError] = useState<string | null>(null);
  const projectGitSectionRef = useRef<HTMLDivElement | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [configEditorText, setConfigEditorText] = useState('');
  const [configEditorError, setConfigEditorError] = useState<string | null>(null);
  const [pdoAdvancedReport, setPdoAdvancedReport] = useState<PdoAdvancedParseReport | null>(null);
  const [pdoAdvancedError, setPdoAdvancedError] = useState<string | null>(null);
  const [isParsingPdoAdvanced, setIsParsingPdoAdvanced] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [confirmGenerateType, setConfirmGenerateType] = useState<TestDataType | null>(null);
  const canTestData = useCanTestData();
  const {
    options: exportBatteryOptions,
    updateOption: updateExportBatteryOption,
    resetOptions: resetExportBatteryOptions,
  } = useExportBatteryOptions();
  const {
    settings: translationSettings,
    updateSetting: updateTranslationSetting,
    resetSettings: resetTranslationSettings,
  } = useTranslationSettings();
  const gitRefreshGenerationRef = useRef(0);
  const pdoEditor = usePdoEditor({
    document: loadedProject?.document ?? null,
    isActive: activeModule.key === 'realtime-data',
    updateProjectDocument,
    updateProjectSections,
  });
  const protocolEditor = useProtocolEditor({
    activeModuleKey: activeModule.key,
    document: loadedProject?.document ?? null,
    updateProjectDocument,
    updateProjectSections,
    applyDocument: (document) => {
      if (loadedProject) applyLoadedProject({ ...loadedProject, document });
    },
  });
  const projectExport = useProjectExport({
    document: loadedProject?.document ?? previewDocument,
    projectPath: loadedProject?.summary.path,
    exportOptions: exportBatteryOptions,
  });
  const batteryLegacyController = useBatteryLegacyController({
    document: loadedProject?.document ?? null,
    updateProjectDocument,
    isModifiedPath,
    restoreModifiedPath,
  });
  const tableConfig = useTableConfigController({
    activeModuleKey: activeModule.key,
    loadedProject,
    applyLoadedProject,
  });

  useEffect(() => {
    void parseUiPreview(previewDocument).then(setUiPreview);
    const storedProjects = loadRecentProjects();
    setRecentProjects(storedProjects);
    setProjectPath(storedProjects[0]?.path ?? '');
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshProjectGit(), 100);
    return () => window.clearTimeout(timeout);
  }, [loadedProject?.summary.path, refactorConfigPath]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const unlistenPromise = isTauriRuntime()
      ? getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          if (window.confirm('当前项目存在未保存修改。确定关闭应用并放弃这些修改吗？')) {
            await getCurrentWindow().destroy();
          }
        })
      : Promise.resolve(() => undefined);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    document.body.classList.toggle('git-review-open', showGitReview);
    return () => document.body.classList.remove('git-review-open');
  }, [showGitReview]);

  useEffect(() => {
    if (activeModule.key === 'fault-code') {
      setShowJsonEditor(false);
      return;
    }
    setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2));
    setConfigEditorError(null);
  }, [activeModule.key, loadedProject?.document]);

  useEffect(() => {
    if (!loadedProject) return;
    const doc = loadedProject.document as Record<string, unknown>;
    const defaults: Record<string, unknown> = {};
    if (!doc.battery_protocol) {
      defaults.battery_protocol = { default_timeout_ticks: 200, frames: [], signals: [] };
    }
    if (!doc.battery_monitor_info) {
      defaults.battery_monitor_info = { enabled: true, page_size: 4, items: [] };
    }
    if (!doc.fault_code_info) {
      defaults.fault_code_info = {
        schema_version: 1,
        enabled: true,
        version: 1,
        sources: [
          {
            source_key: 'traction',
            source_id: 1,
            type_char: 'T',
            name: '牵引',
            can_id: 648,
            frame_type: 0,
            code_byte: 2,
            clear_code: 0,
            invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
            enabled: true,
          },
          {
            source_key: 'pump',
            source_id: 2,
            type_char: 'P',
            name: '油泵',
            can_id: 660,
            frame_type: 0,
            code_byte: 2,
            clear_code: 0,
            invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
            enabled: true,
          },
        ],
        codes: [],
      };
    }
    if (Object.keys(defaults).length > 0) {
      const document = { ...doc, ...defaults };
      acceptLoadedProject({ ...loadedProject, document }, projectPath);
    }
  }, [loadedProject]);

  function parseUiPreview(document: unknown, path?: string) {
    if (path) {
      return parseUiResourcesWithProjectPath({ project_path: path, document });
    }
    return parseUiResources(document);
  }

  function activeJsonEditorKey() {
    return jsonEditorKeyForModule(activeModule.key, { realtimeMode: pdoEditor.mode });
  }

  function currentConfigSection() {
    if (!loadedProject) return null;
    const document = loadedProject.document as Record<string, unknown>;
    return configSectionForEditor(document, activeModule.key, { realtimeMode: pdoEditor.mode });
  }

  function updateRecentProjects(nextProject: LoadedProject, fallbackPath?: string) {
    const path = nextProject.summary.path ?? fallbackPath;
    if (!path) return;
    setRecentProjects((current) => {
      const next = [
        { path, name: nextProject.summary.name, openedAt: new Date().toISOString() },
        ...current.filter((item) => item.path !== path),
      ].slice(0, maxRecentProjects);
      saveRecentProjects(next);
      return next;
    });
  }

  function removeRecentProject(path: string) {
    setRecentProjects((current) => {
      const next = current.filter((item) => item.path !== path);
      saveRecentProjects(next);
      return next;
    });
  }

  function clearRecentProjects() {
    setRecentProjects([]);
    saveRecentProjects([]);
  }

  function applyLoadedProject(
    nextProject: LoadedProject,
    baselineOverride?: unknown,
    changedSections?: Iterable<DocumentSectionKey>,
  ) {
    const nextBaseline = baselineOverride ?? baselineDocument;
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
    const nextHasChanges = nextBaseline
      ? nextDirtySections.size > 0 || !deepEqual(nextProject.document, nextBaseline)
      : true;
    onProjectLoaded(nextProject);
    setHasUnsavedChanges(nextHasChanges);
    setSaveStatus(nextHasChanges ? '存在未保存修改' : null);
    if (nextHasChanges) setShowSaveModal(false);
  }

  function acceptLoadedProject(nextProject: LoadedProject, fallbackPath?: string) {
    const nextPath = nextProject.summary.path ?? fallbackPath;
    const nextBaseline = cloneJson(nextProject.document);
    resetDirtySectionBaseline(nextBaseline);
    setBaselineDocument(nextBaseline);
    onProjectLoaded(nextProject);
    setHasUnsavedChanges(false);
    setShowSaveModal(false);
    setSaveStatus(null);
    if (nextPath) setProjectPath(nextPath);
    updateRecentProjects(nextProject, fallbackPath);
  }

  function isModifiedPath(path: JsonPath) {
    if (path.length === 1 && typeof path[0] === 'string') {
      const section = path[0] as DocumentSectionKey;
      if ((trackedDocumentSections as readonly string[]).includes(section)) {
        return dirtySections.has(section);
      }
    }
    return loadedProject ? isPathModified(loadedProject.document, baselineDocument, path) : false;
  }

  function restoreModifiedPath(path: JsonPath) {
    if (!loadedProject || !baselineDocument) return;
    const document = restorePath(loadedProject.document, baselineDocument, path);
    const changedSection =
      typeof path[0] === 'string' &&
      (trackedDocumentSections as readonly string[]).includes(path[0])
        ? ([path[0] as DocumentSectionKey] as const)
        : undefined;
    applyLoadedProject({ ...loadedProject, document }, undefined, changedSection);
  }

  function restoreAllChanges() {
    if (!loadedProject || !baselineDocument) return;
    applyLoadedProject(
      { ...loadedProject, document: cloneJson(baselineDocument) },
      undefined,
      trackedDocumentSections,
    );
  }

  function restoreCurrentConfigSection() {
    if (!loadedProject || !baselineDocument) return;
    let document = loadedProject.document;
    for (const path of restorePathsForEditor(activeModule.key, { realtimeMode: pdoEditor.mode })) {
      document = restorePath(document, baselineDocument, path as JsonPath);
    }
    applyLoadedProject(
      { ...loadedProject, document },
      undefined,
      restorePathsForEditor(activeModule.key, { realtimeMode: pdoEditor.mode })
        .map((path) => path[0])
        .filter((section): section is DocumentSectionKey =>
          (trackedDocumentSections as readonly string[]).includes(section),
        ),
    );
    setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2));
  }

  function baselineLanguageDocument(): LanguageDocument | null {
    if (!baselineDocument) return null;
    return (
      ((baselineDocument as Record<string, unknown>).language_info as
        | LanguageDocument
        | undefined) ?? null
    );
  }

  const modifiedSections = loadedProject
    ? trackedDocumentSections.filter((section) => dirtySections.has(section))
    : [];
  const hasRefactorOnlyChanges = modifiedSections.some((section) =>
    (refactorOnlySections as readonly string[]).includes(section),
  );
  const isLegacyJcproProject =
    loadedProject?.summary.path?.toLowerCase().endsWith('.jcpro') ?? false;
  const projectMissingSections = loadedProject?.validation.missing_sections ?? [];
  const compatibleMissingSections = projectMissingSections.filter(
    (section) => !(refactorOnlySections as readonly string[]).includes(section),
  );
  const sidecarMissingSections = projectMissingSections.filter((section) =>
    (refactorOnlySections as readonly string[]).includes(section),
  );
  const effectiveProjectValid = compatibleMissingSections.length === 0;
  const selectedRecentProjectPath = recentProjects.some((item) => item.path === projectPath)
    ? projectPath
    : '';
  const gitRepositoryName =
    gitStatus?.repo_root?.split(/[\\/]/).filter(Boolean).pop() ?? '本地仓库';
  const gitSummaryCommitDisabled =
    !gitStatus?.available ||
    gitBusy ||
    hasUnsavedChanges ||
    gitStatus.has_staged_changes ||
    gitStatus.changed_paths.length === 0;

  function updateProjectDocument(section: string, value: unknown) {
    if (!loadedProject) return;

    const document = { ...(loadedProject.document as Record<string, unknown>), [section]: value };
    const changedSection = (trackedDocumentSections as readonly string[]).includes(section)
      ? [section as DocumentSectionKey]
      : undefined;
    applyLoadedProject({ ...loadedProject, document }, undefined, changedSection);
  }

  function updateProjectSections(sections: Record<string, unknown>) {
    if (!loadedProject) return;

    const document = { ...(loadedProject.document as Record<string, unknown>), ...sections };
    const changedSections = Object.keys(sections).filter((section): section is DocumentSectionKey =>
      (trackedDocumentSections as readonly string[]).includes(section),
    );
    applyLoadedProject({ ...loadedProject, document }, undefined, changedSections);
  }

  function stripRefactorOnlySections(document: unknown) {
    const next = { ...((document as Record<string, unknown>) ?? {}) };
    for (const section of refactorOnlySections) {
      delete next[section];
    }
    return next;
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
      battery_protocol: source.battery_protocol ?? null,
      battery_monitor_info: source.battery_monitor_info ?? null,
    };
  }

  function candidateRefactorConfigPaths(projectFilePath: string) {
    const withoutExtension = projectFilePath.replace(/\.[^\\/\\.]+$/, '');
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

  async function autoMountRefactorConfig(project: LoadedProject, projectFilePath: string) {
    if (!projectFilePath.toLowerCase().endsWith('.jcpro')) {
      setRefactorConfigPath(null);
      setRefactorConfigStatus(null);
      return project;
    }

    for (const candidatePath of candidateRefactorConfigPaths(projectFilePath)) {
      try {
        const sidecar = await loadJsonFile(candidatePath);
        const document = mergeRefactorConfigDocument(project.document, sidecar);
        const validation = await validateProjectDocument(document);
        setRefactorConfigPath(candidatePath);
        setRefactorConfigStatus(`已自动挂载：${candidatePath}`);
        return { ...project, document, validation };
      } catch {
        // Candidate sidecar is optional.
      }
    }

    setRefactorConfigPath(null);
    setRefactorConfigStatus('未挂载重构配置 JSON；修改重构专属配置时会提示创建 sidecar。');
    return project;
  }

  function currentProjectGitRequest(): GitProjectRequest | null {
    const path = loadedProject?.summary.path;
    if (!path) return null;
    return {
      project_path: path,
      sidecar_path: refactorConfigPath ?? undefined,
    };
  }

  async function refreshProjectGit() {
    const generation = ++gitRefreshGenerationRef.current;
    const request = currentProjectGitRequest();
    if (!request || !isTauriRuntime()) {
      setGitStatus(null);
      setGitRevisions([]);
      setGitError(null);
      return;
    }

    try {
      const context = await loadProjectGitContext(request, 20);
      if (generation !== gitRefreshGenerationRef.current) return;
      setGitStatus(context.status);
      setGitError(null);
      setGitRevisions(context.revisions);
    } catch (error) {
      if (generation !== gitRefreshGenerationRef.current) return;
      setGitStatus(null);
      setGitRevisions([]);
      setGitError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCommitProjectVersion() {
    const request = currentProjectGitRequest();
    if (!request) return;
    if (hasUnsavedChanges) {
      setGitError('请先保存当前项目配置，再创建 Git 版本。');
      return;
    }

    setGitBusy(true);
    setGitError(null);
    try {
      const report = await commitProjectGitVersion({ ...request, message: gitMessage });
      setGitMessage('更新项目配置');
      setSaveStatus(`已保存 Git 版本 ${report.short_hash}：${report.subject}`);
      await refreshProjectGit();
      if (showGitReview) await refreshGitReview();
    } catch (error) {
      setGitError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitBusy(false);
    }
  }

  async function handlePreviewProjectVersion(revision: GitRevision) {
    const request = currentProjectGitRequest();
    if (!request) return;
    setGitReviewRevision(revision);
    setGitReview(null);
    setShowGitReview(true);
    await refreshGitReview(revision);
  }

  async function handleRestoreProjectVersion() {
    const request = currentProjectGitRequest();
    if (!loadedProject || !gitReviewRevision || !request) return;
    if (
      hasUnsavedChanges &&
      !window.confirm('当前项目存在未保存修改。继续恢复会用历史版本替换这些修改，是否继续？')
    ) {
      return;
    }
    setGitBusy(true);
    setGitReviewError(null);
    try {
      const snapshot = await loadProjectGitRevision(request, gitReviewRevision.hash);
      const document = snapshot.sidecar_document
        ? mergeRefactorConfigDocument(snapshot.project_document, snapshot.sidecar_document)
        : snapshot.project_document;
      const validation = await validateProjectDocument(document);
      applyLoadedProject(
        { ...loadedProject, document, validation },
        undefined,
        trackedDocumentSections,
      );
      void parseUiPreview(document, loadedProject.summary.path).then(setUiPreview);
      closeGitReview();
      setSaveStatus(
        `已载入 Git 版本 ${snapshot.revision.short_hash}，保存后将形成新的修改。`,
      );
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitBusy(false);
    }
  }

  async function handleOpenGitRepository() {
    if (!gitStatus?.repo_root) return;
    try {
      await revealItemInDir(gitStatus.repo_root);
    } catch (error) {
      setGitError(error instanceof Error ? error.message : String(error));
    }
  }

  function showProjectGitHistory() {
    onNavigate('project');
    window.setTimeout(
      () => projectGitSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }

  async function refreshGitReview(revision: GitRevision | null = gitReviewRevision) {
    const request = currentProjectGitRequest();
    if (!request) return;
    setGitReviewBusy(true);
    setGitReviewError(null);
    try {
      const report = revision
        ? await reviewProjectGitRevision(request, revision.hash)
        : await reviewProjectGitChanges(request);
      setGitReview(report);
    } catch (error) {
      setGitReview(null);
      setGitReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitReviewBusy(false);
    }
  }

  async function openGitReview() {
    setGitReviewRevision(null);
    setGitReview(null);
    setShowGitReview(true);
    await refreshGitReview(null);
  }

  function closeGitReview() {
    setShowGitReview(false);
    setGitReviewRevision(null);
    setGitReview(null);
    setGitReviewError(null);
  }

  function applyConfigEditor() {
    if (!loadedProject) return;

    try {
      const parsed = JSON.parse(configEditorText);
      const document = { ...(loadedProject.document as Record<string, unknown>) };
      const jsonEditorKey = activeJsonEditorKey();
      if (jsonEditorKey === 'sdo') document.sdo_info = parsed;
      if (jsonEditorKey === 'pdo-simple') document.pdo_simple_send_recv = parsed;
      if (activeModule.key === 'language') document.language_info = parsed;
      if (activeModule.key === 'battery-protocol') document.battery_protocol = parsed;
      if (activeModule.key === 'battery-monitor') document.battery_monitor_info = parsed;
      if (activeModule.key === 'signal-dictionary') document.signal_dictionary = parsed;
      if (activeModule.key === 'private-protocol') document.private_protocol = parsed;
      if (activeModule.key === 'protocol-mapping') document.protocol_mapping = parsed;
      if (jsonEditorKey === 'pdo-advanced') {
        for (const section of advancedConfigSections) {
          document[section] = parsed?.[section];
        }
      }
      applyLoadedProject({ ...loadedProject, document });
      setConfigEditorError(null);
    } catch (error) {
      setConfigEditorError(error instanceof Error ? error.message : String(error));
    }
  }

  function languageDocument(): LanguageDocument | null {
    if (!loadedProject) return null;
    return (loadedProject.document as Record<string, unknown>).language_info as LanguageDocument;
  }

  function confirmGenerateTestData() {
    if (!confirmGenerateType || !loadedProject) return;
    const data = getTestData(confirmGenerateType);
    setGeneratingTestKey(confirmGenerateType);
    setConfirmGenerateType(null);
    try {
      if (data.pdoSimple) pdoEditor.updateSimpleDocument(data.pdoSimple);
      if (data.pdoAdvanced) pdoEditor.updateAdvancedDocument(data.pdoAdvanced);
      if (data.batteryMonitor)
        batteryLegacyController.updateBatteryMonitorDocument(data.batteryMonitor);
      if (data.batteryProtocol)
        void batteryLegacyController.updateBatteryProtocolDocument(data.batteryProtocol);
    } finally {
      setGeneratingTestKey(null);
    }
  }

  function updateLanguageDocument(next: LanguageDocument) {
    updateProjectDocument('language_info', next);
  }

  async function handleCreateProject() {
    setOpenError(null);

    if (!confirmDiscardUnsavedChanges('创建新项目')) return;

    if (!isTauriRuntime()) {
      setOpenError('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      defaultPath: `${newProjectName}.jcpro`,
      filters: [{ name: '项目文件', extensions: ['jcpro'] }],
    });
    if (!selected) return;

    setIsOpening(true);

    try {
      const nextProject = await createProject({
        path: selected,
        name: newProjectName,
        resolutionW: newResolutionW,
        resolutionH: newResolutionH,
      });
      setRefactorConfigPath(null);
      setRefactorConfigStatus(null);
      acceptLoadedProject(nextProject, selected);
      const nextPreview = await parseUiPreview(
        nextProject.document,
        nextProject.summary.path ?? selected,
      );
      setUiPreview(nextPreview);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleOpenProject(path = projectPath, skipDiscardConfirmation = false) {
    if (!skipDiscardConfirmation && !confirmDiscardUnsavedChanges('打开其他项目')) return;
    setIsOpening(true);
    setOpenError(null);

    try {
      const nextProject = await loadProject(path);
      const mountedProject = await autoMountRefactorConfig(
        nextProject,
        nextProject.summary.path ?? path,
      );
      acceptLoadedProject(mountedProject, path);
      void parseUiPreview(mountedProject.document, mountedProject.summary.path ?? path).then(
        setUiPreview,
      );
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleReloadProject() {
    const reloadPath = loadedProject?.summary.path ?? projectPath;
    if (reloadPath.trim() === '') return;
    if (
      hasUnsavedChanges &&
      !window.confirm('当前项目存在未保存修改，重新加载会丢弃这些修改。确定继续吗？')
    ) {
      return;
    }
    await handleOpenProject(reloadPath, true);
  }

  async function handleSelectProjectFile() {
    setOpenError(null);

    if (!confirmDiscardUnsavedChanges('打开其他项目')) return;

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
        await handleOpenProject(selected, true);
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDiscardUnsavedChanges(action: string) {
    return (
      !hasUnsavedChanges ||
      window.confirm(`当前项目存在未保存修改。${action}会放弃这些修改，确定继续吗？`)
    );
  }

  async function handleParseProject() {
    if (!loadedProject) return;

    setOpenError(null);
    setIsOpening(true);

    try {
      const report = await parseProjectDocument(loadedProject.document);
      setProjectParseReport(report);
      if (!report.valid) {
        setOpenError(report.errors.join('；') || '项目解析存在问题');
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleMigrateProject() {
    if (!loadedProject) return;

    setOpenError(null);
    setIsOpening(true);

    try {
      const migrated = await migrateProjectDocument(loadedProject.document);
      applyLoadedProject({
        summary: { ...migrated.summary, path: loadedProject.summary.path },
        validation: migrated.validation,
        document: migrated.document,
      });
      const nextPreview = await parseUiPreview(migrated.document, loadedProject.summary.path);
      setUiPreview(nextPreview);
      void protocolEditor.refreshUnifiedProtocol(migrated.document);
      setSaveStatus(`已规范化：${migrated.migrated_version}`);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
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
    const selected = await save({
      defaultPath: `${baseName}.refactor-config.json`,
      filters: [{ name: '重构配置 JSON', extensions: ['json'] }],
    });
    if (!selected) return false;

    await saveJsonFile(selected, refactorConfigDocument(loadedProject.document));
    setRefactorConfigPath(selected);
    setRefactorConfigStatus(`已挂载：${selected}`);
    setSaveStatus(`重构专属配置已另存为：${selected}；原 .jcpro 不会写入这些字段。`);
    return true;
  }

  async function handleMountRefactorConfig() {
    if (!loadedProject) return;
    setSaveStatus(null);

    if (!isTauriRuntime()) {
      setRefactorConfigStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '重构配置 JSON', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      const sidecar = await loadJsonFile(selected);
      const document = mergeRefactorConfigDocument(loadedProject.document, sidecar);
      const validation = await validateProjectDocument(document);
      const nextProject = { ...loadedProject, document, validation };
      const nextBaseline = cloneJson(document);
      setRefactorConfigPath(selected);
      setRefactorConfigStatus(`已挂载：${selected}`);
      setBaselineDocument(nextBaseline);
      applyLoadedProject(nextProject, nextBaseline);
      void protocolEditor.refreshUnifiedProtocol(document);
    } catch (error) {
      setRefactorConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCreateRefactorConfig() {
    if (!loadedProject) return;
    const created = await saveRefactorConfigAsJson();
    if (created) {
      const validation = await validateProjectDocument(loadedProject.document);
      const nextBaseline = cloneJson(loadedProject.document);
      setBaselineDocument(nextBaseline);
      applyLoadedProject({ ...loadedProject, validation }, nextBaseline);
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
      setBaselineDocument(nextBaseline);
      applyLoadedProject(
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
      void refreshProjectGit();
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProjectAction(null);
    }
  }

  async function handleSaveProjectAs() {
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
    const selected = await save({
      defaultPath: isRefactorSidecarSave
        ? currentName.replace(/\.[^.]+$/, '.refactor-config.json')
        : currentName,
      filters: isRefactorSidecarSave
        ? [{ name: '重构配置 JSON', extensions: ['json'] }]
        : [{ name: '项目文件', extensions: ['jcpro', 'json'] }],
    });
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
        setBaselineDocument(nextBaseline);
        applyLoadedProject({ ...loadedProject, validation }, nextBaseline);
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
      acceptLoadedProject(report.project, selected);
      if (!selected.toLowerCase().endsWith('.jcpro')) {
        setRefactorConfigPath(null);
        setRefactorConfigStatus(null);
      }
      const nextPreview = await parseUiPreview(
        report.project.document,
        report.project.summary.path ?? selected,
      );
      setUiPreview(nextPreview);
      const copiedText = `已复制 ${report.copied_resources.length} 个资源`;
      const warningText = report.warnings.length > 0 ? `，${report.warnings.length} 个警告` : '';
      setSaveStatus(`已另存为：${selected}（${copiedText}${warningText}）`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProjectAction(null);
    }
  }

  function cancelSaveProject() {
    setShowSaveModal(false);
  }

  async function handleParsePdoAdvanced() {
    setPdoAdvancedError(null);
    setPdoAdvancedReport(null);

    if (!loadedProject) {
      setPdoAdvancedError('请先打开 .jcpro 项目。');
      return;
    }

    setIsParsingPdoAdvanced(true);

    try {
      const report = await parsePdoAdvancedProject(loadedProject.document);
      setPdoAdvancedReport(report);
      if (!report.valid) {
        setPdoAdvancedError(report.errors.join('；') || '高级 PDO 配置存在问题');
      }
    } catch (error) {
      setPdoAdvancedError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsParsingPdoAdvanced(false);
    }
  }

  async function applyUiResourceDocument(nextDocument: unknown) {
    if (!loadedProject) return;

    const nextProject = { ...loadedProject, document: nextDocument };
    applyLoadedProject(nextProject);
    const nextPreview = await parseUiPreview(nextDocument, loadedProject.summary.path);
    setUiPreview(nextPreview);
  }

  async function handleApplyUiResource(resource: Omit<UiResourceUpdateRequest, 'document'>) {
    if (!loadedProject) return;

    setIsApplyingUi(true);
    setUiApplyError(null);

    try {
      const report = await updateUiResourceDocument({
        document: loadedProject.document,
        ...resource,
      });

      if (!report.valid) {
        setUiApplyError(report.errors.join('；') || 'UI 资源写回失败');
        return;
      }

      await applyUiResourceDocument(report.document);
    } catch (error) {
      setUiApplyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingUi(false);
    }
  }

  async function handleSelectUiOptionSources(): Promise<string[]> {
    setUiApplyError(null);

    if (!isTauriRuntime()) {
      setUiApplyError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return [];
    }

    const selected = await open({
      multiple: true,
      filters: [{ name: '图片资源', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
    });

    if (Array.isArray(selected)) return selected;
    if (typeof selected === 'string') return [selected];
    return [];
  }

  async function handleAddUiOption(key: string, sources: string[]) {
    if (!loadedProject) return;

    setIsApplyingUi(true);
    setUiApplyError(null);

    try {
      const report = await addUiResourceOptionDocument({
        document: loadedProject.document,
        key,
        sources,
      });
      if (!report.valid) {
        setUiApplyError(report.errors.join('；') || 'UI 资源选项新增失败');
        return;
      }
      await applyUiResourceDocument(report.document);
    } catch (error) {
      setUiApplyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingUi(false);
    }
  }

  async function handleRemoveUiOption(key: string, optionIndex: number) {
    if (!loadedProject) return;

    setIsApplyingUi(true);
    setUiApplyError(null);

    try {
      const report = await removeUiResourceOptionDocument({
        document: loadedProject.document,
        key,
        option_index: optionIndex,
      });
      if (!report.valid) {
        setUiApplyError(report.errors.join('；') || 'UI 资源选项删除失败');
        return;
      }
      await applyUiResourceDocument(report.document);
    } catch (error) {
      setUiApplyError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsApplyingUi(false);
    }
  }

  function handleJumpToPdo(pdoParamIndex: number) {
    pdoEditor.focusPdoParam(pdoParamIndex);
    onNavigate('realtime-data');
  }

  const currentLanguageDocument = languageDocument();

  return (
    <main className={showGitReview ? 'workspace workspace--git-review' : 'workspace'}>
      <DashboardActionBar
        activeModule={activeModule}
        loadedProject={loadedProject}
        projectPath={projectPath}
        isOpening={isOpening}
        hasUnsavedChanges={hasUnsavedChanges}
        modifiedSections={modifiedSections}
        isSavingProject={isSavingProject}
        savingProjectAction={savingProjectAction}
        saveStatus={saveStatus}
        currentLegacyTableKind={tableConfig.currentKind}
        isImportingTable={tableConfig.isImporting}
        isExportingTable={tableConfig.isExporting}
        generatingTestKey={generatingTestKey}
        pdoMode={pdoEditor.mode}
        showCanvasLabels={showCanvasLabels}
        showJsonEditor={showJsonEditor}
        gitStatus={gitStatus}
        gitBusy={gitBusy}
        gitError={gitError}
        gitRevisions={gitRevisions}
        gitRepositoryName={gitRepositoryName}
        gitSummaryCommitDisabled={gitSummaryCommitDisabled}
        onRestoreSection={(section) => restoreModifiedPath([section])}
        onSelectProjectFile={handleSelectProjectFile}
        onReloadProject={handleReloadProject}
        onRestoreAllChanges={restoreAllChanges}
        onSaveProjectAs={handleSaveProjectAs}
        onRequestSave={requestSaveProject}
        onImportTable={tableConfig.importTable}
        onExportTable={tableConfig.exportTable}
        onRequestTestData={setConfirmGenerateType}
        onToggleCanvasLabels={() => setShowCanvasLabels((visible) => !visible)}
        onToggleJsonEditor={() => setShowJsonEditor((visible) => !visible)}
        onRefreshGit={refreshProjectGit}
        onOpenGitReview={openGitReview}
        onOpenGitRepository={handleOpenGitRepository}
        onShowGitHistory={showProjectGitHistory}
        onCommitGitVersion={handleCommitProjectVersion}
      />


      {showGitReview ? (
        <GitReviewWorkspace
          report={gitReview}
          revision={gitReviewRevision}
          statusBranch={gitStatus?.branch}
          busy={gitReviewBusy}
          error={gitReviewError}
          commitBusy={gitBusy}
          commitDisabled={gitSummaryCommitDisabled}
          message={gitMessage}
          onMessageChange={setGitMessage}
          onCommit={() => void handleCommitProjectVersion()}
          onRestore={() => void handleRestoreProjectVersion()}
          onRefresh={() => void refreshGitReview()}
          onClose={closeGitReview}
        />
      ) : null}
      <DashboardDialogs
        loadedProject={loadedProject}
        showSaveModal={showSaveModal}
        isSavingProject={isSavingProject}
        savingProjectAction={savingProjectAction}
        isLegacyJcproProject={isLegacyJcproProject}
        hasRefactorOnlyChanges={hasRefactorOnlyChanges}
        refactorConfigPath={refactorConfigPath}
        modifiedSections={modifiedSections}
        confirmGenerateType={confirmGenerateType}
        onCancelSave={cancelSaveProject}
        onConfirmSave={confirmSaveProject}
        onCancelTestData={() => setConfirmGenerateType(null)}
        onConfirmTestData={confirmGenerateTestData}
      />

      <JsonEditorPopup
        open={showJsonEditor && Boolean(loadedProject)}
        text={configEditorText}
        error={configEditorError}
        canRestore={Boolean(baselineDocument)}
        onTextChange={setConfigEditorText}
        onFormat={() => setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2))}
        onRestore={restoreCurrentConfigSection}
        onApply={applyConfigEditor}
        onClose={() => setShowJsonEditor(false)}
      />

      <div className={showJsonEditor && loadedProject ? 'workspace-json-active' : undefined}>
        {activeModule.key !== 'project' ? (
          <Breadcrumb
            activeKey={activeModule.key}
            modules={featureModules}
            onNavigate={onNavigate}
          />
        ) : null}
        {activeModule.key === 'project' ? (
          <ProjectManagementPage
            projectPath={projectPath}
            setProjectPath={setProjectPath}
            isOpening={isOpening}
            openError={openError}
            recentProjects={recentProjects}
            selectedRecentProjectPath={selectedRecentProjectPath}
            clearRecentProjects={clearRecentProjects}
            removeRecentProject={removeRecentProject}
            newProjectName={newProjectName}
            setNewProjectName={setNewProjectName}
            newResolutionW={newResolutionW}
            setNewResolutionW={setNewResolutionW}
            newResolutionH={newResolutionH}
            setNewResolutionH={setNewResolutionH}
            loadedProject={loadedProject}
            effectiveProjectValid={effectiveProjectValid}
            refactorConfigPath={refactorConfigPath}
            refactorConfigStatus={refactorConfigStatus}
            compatibleMissingSections={compatibleMissingSections}
            sidecarMissingSections={sidecarMissingSections}
            projectGitSectionRef={projectGitSectionRef}
            gitBusy={gitBusy}
            gitStatus={gitStatus}
            gitMessage={gitMessage}
            setGitMessage={setGitMessage}
            hasUnsavedChanges={hasUnsavedChanges}
            gitRevisions={gitRevisions}
            gitError={gitError}
            projectParseReport={projectParseReport}
            handleSelectProjectFile={handleSelectProjectFile}
            handleOpenProject={handleOpenProject}
            handleCreateProject={handleCreateProject}
            handleParseProject={handleParseProject}
            handleMigrateProject={handleMigrateProject}
            handleMountRefactorConfig={handleMountRefactorConfig}
            handleCreateRefactorConfig={handleCreateRefactorConfig}
            refreshProjectGit={refreshProjectGit}
            handleCommitProjectVersion={handleCommitProjectVersion}
            handlePreviewProjectVersion={handlePreviewProjectVersion}
          />
        ) : null}


        {activeModule.key === 'setting-data' ? (
          <SettingDataPage
            loadedProject={loadedProject}
            isActive={activeModule.key === 'setting-data'}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            updateProjectDocument={updateProjectDocument}
            isModifiedPath={isModifiedPath}
            restoreModifiedPath={restoreModifiedPath}
          />
        ) : null}

        {activeModule.key === 'realtime-data' ? (
          <RealtimeDataPage
            controller={pdoEditor}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            isModifiedPath={isModifiedPath}
            restoreModifiedPath={restoreModifiedPath}
          />
        ) : null}


        <TableConfigStatusPanel controller={tableConfig} />

        {activeModule.key === 'battery-protocol' ? (
          <BatteryProtocolPage loadedProject={loadedProject} controller={batteryLegacyController} />
        ) : null}

        {activeModule.key === 'battery-monitor' ? (
          <BatteryMonitorPage loadedProject={loadedProject} controller={batteryLegacyController} />
        ) : null}
        {activeModule.key === 'fault-code' ? (
          <FaultCodePage loadedProject={loadedProject} onUpdateSections={updateProjectSections} />
        ) : null}
        {activeModule.key === 'can-test-data' ? (
          <CanTestDataPage loadedProject={loadedProject} canTestData={canTestData} />
        ) : null}
        {activeModule.key === 'language' ? (
          <LanguagePage
            document={
              currentLanguageDocument ?? {
                list_code_language: [],
                list_inner: [],
                list_translate: {},
              }
            }
            baseline={baselineLanguageDocument()}
            loaded={!!loadedProject}
            onUpdate={updateLanguageDocument}
          />
        ) : null}

        {activeModule.key === 'realtime-data' && pdoEditor.mode === 'advanced' ? (
          <section className="table-spec-card">
            <div>
              <h2>PDO 高级配置校验</h2>
              <p>
                解析当前项目中的全局变量、条件表、PDO 接收帧和发送帧，展示结构统计与引用校验错误。
              </p>
            </div>
            <button
              className="path-open-button"
              disabled={!loadedProject || isParsingPdoAdvanced}
              onClick={() => void handleParsePdoAdvanced()}
              type="button"
            >
              {isParsingPdoAdvanced ? '解析中...' : '解析当前高级 PDO 配置'}
            </button>
            {pdoAdvancedReport ? (
              <div className="project-open-report">
                <article>
                  <span>全局变量</span>
                  <strong>{pdoAdvancedReport.document?.pdo_global_param.length ?? 0}</strong>
                </article>
                <article>
                  <span>条件表</span>
                  <strong>{pdoAdvancedReport.document?.pdo_condition.length ?? 0}</strong>
                </article>
                <article>
                  <span>接收帧</span>
                  <strong>{pdoAdvancedReport.document?.pdo_recv.length ?? 0}</strong>
                </article>
                <article>
                  <span>发送帧</span>
                  <strong>{pdoAdvancedReport.document?.pdo_send.length ?? 0}</strong>
                </article>
              </div>
            ) : null}
            {pdoAdvancedError ? <p className="project-open-error">{pdoAdvancedError}</p> : null}
          </section>
        ) : null}

        {activeModule.key === 'signal-dictionary' ? (
          <SignalDictionaryPage
            controller={protocolEditor}
            isModifiedPath={isModifiedPath}
          />
        ) : null}


        {activeModule.key === 'private-protocol' ? (
          <PrivateProtocolPage
            controller={protocolEditor}
            isModifiedPath={isModifiedPath}
          />
        ) : null}


        {activeModule.key === 'protocol-mapping' ? (
          <ProtocolMappingPage
            controller={protocolEditor}
            isModifiedPath={isModifiedPath}
          />
        ) : null}


        {activeModule.key === 'canopen-export' ? (
          <CanopenExportPage loadedProject={loadedProject} />
        ) : null}

        {activeModule.key === 'project' || activeModule.key === 'export' ? (
          <TableFormatReference specs={tableConfig.specs} />
        ) : null}

        {activeModule.key === 'ui' ? (
          <>
            <UiCanvasPreview
              canApply={Boolean(loadedProject)}
              isApplying={isApplyingUi}
              showCanvasLabels={showCanvasLabels}
              onAddOption={handleAddUiOption}
              onApply={handleApplyUiResource}
              onJumpToPdo={handleJumpToPdo}
              onRemoveOption={handleRemoveUiOption}
              onSelectOptionSources={handleSelectUiOptionSources}
              report={uiPreview}
            />
            {uiApplyError ? <p className="ui-preview-errors">{uiApplyError}</p> : null}
          </>
        ) : null}
        {activeModule.key === 'settings' ? (
          <SettingsPage
            exportOptions={exportBatteryOptions}
            onUpdateExportOption={updateExportBatteryOption}
            onResetExportOptions={resetExportBatteryOptions}
            translationSettings={translationSettings}
            onUpdateTranslationSetting={updateTranslationSetting}
            onResetTranslationSettings={resetTranslationSettings}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />
        ) : null}


        {activeModule.key === 'export' ? (
          <ProjectExportPage controller={projectExport} />
        ) : null}

      </div>
    </main>
  );
}
