import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CloudOff,
  FileDiff,
  FolderOpen,
  FolderGit2,
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
import {
  addUiResourceOptionDocument,
  commitProjectGitVersion,
  createProject,
  exportDbc,
  exportTableCsv,
  exportTableWorkbook,
  generateDbcContent,
  getLegacyTableSpec,
  importDbc,
  importLanguageCsv,
  importLanguageWorkbook,
  importPdoSimpleCsv,
  importPdoSimpleWorkbook,
  importSdoCsv,
  importSdoWorkbook,
  languageDocumentTable,
  loadJsonFile,
  loadProject,
  loadProjectGitContext,
  loadProjectGitRevision,
  loadTextFile,
  migrateProjectDocument,
  parsePdoAdvancedProject,
  parseProjectDocument,
  parseUiResources,
  parseUiResourcesWithProjectPath,
  pdoSimpleDocumentTable,
  removeUiResourceOptionDocument,
  reviewProjectGitChanges,
  reviewProjectGitRevision,
  revealItemInDir,
  saveJsonFile,
  saveProject,
  saveProjectAs,
  saveTextFile,
  sdoDocumentTable,
  updateUiResourceDocument,
  validateProjectDocument,
} from '../api/commands';
import { Breadcrumb } from '../components/Breadcrumb';
import { GitReviewWorkspace } from '../components/git';
import { JsonEditorPopup } from '../components/json-editor';
import { ProjectManagementPage, type RecentProject } from '../components/project';
import { LanguagePage } from '../components/language';
import { BatteryMonitorPage, BatteryProtocolPage } from '../features/battery-legacy';
import { CanTestDataPage } from '../features/can-test-data';
import { CanopenExportPage } from '../features/canopen-export';
import { FaultCodePage } from '../features/fault-code';
import {
  PrivateProtocolPage,
  ProtocolMappingPage,
  SignalDictionaryPage,
  useProtocolEditor,
} from '../features/protocol-editor';
import { ProjectExportPage, useProjectExport } from '../features/project-export';
import {
  formatFrameId,
  parseFrameId,
  RealtimeDataPage,
  usePdoEditor,
} from '../features/realtime-data';
import { SettingDataPage } from '../features/setting-data';
import { UiCanvasPreview } from '../components/UiCanvasPreview';
import { APP_VERSION } from '../constants/app';
import { featureModules } from '../data/modules';
import { getTestData, type TestDataType, testDataLabels } from '../data/test-data';
import { useCanTestData } from '../hooks/useCanTestData';
import { useDocumentDirtySections } from '../hooks/useDocumentDirtySections';
import {
  advancedConfigSections,
  configSectionForEditor,
  type DocumentSectionKey,
  jsonEditorKeyForModule,
  legacyTableKindForModule,
  modifiedSectionLabels,
  refactorOnlySections,
  restorePathsForEditor,
  trackedDocumentSections,
} from '../modules/documentSections';
import { useExportBatteryOptions } from '../stores/exportSettings';
import { useTranslationSettings } from '../stores/translationSettings';
import type {
  BackendHealth,
  BatteryMonitorFrame,
  BatteryMonitorInfo,
  BatteryMonitorItem,
  BatteryMonitorSignal,
  BatteryProtocol,
  FeatureModule,
  GitProjectRequest,
  GitProjectStatus,
  GitRevision,
  GitReviewReport,
  LanguageDocument,
  LanguageImportReport,
  LegacyTableKind,
  LegacyTableSpec,
  LoadedProject,
  NavigationKey,
  PdoAdvancedParseReport,
  PdoSimpleImportReport,
  ProjectParseReport,
  ProjectSummary,
  SdoImportReport,
  UiResourceParseReport,
  UiResourceUpdateRequest,
} from '../types/platform';
import {
  csvToFrames,
  csvToItems,
  csvToSignals,
  framesToCsv,
  itemsToCsv,
  signalsToCsv,
} from '../utils/batteryCsv';
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

type TableConfigKind = Extract<LegacyTableKind, 'sdo' | 'pdoSimple' | 'language'>;
type TableImportReport = SdoImportReport | PdoSimpleImportReport | LanguageImportReport;

const tableConfigSections: Record<TableConfigKind, string> = {
  sdo: 'sdo_info',
  pdoSimple: 'pdo_simple_send_recv',
  language: 'language_info',
};

const tableConfigTitles: Record<TableConfigKind, string> = {
  sdo: 'SDO 参数配置',
  pdoSimple: 'PDO 简化配置',
  language: '多国语言',
};

const appVersion = APP_VERSION;

const recentProjectsStorageKey = 'jc-custom-platform.recentProjects';
const maxRecentProjects = 8;
const languageCodePattern = /^[a-z][a-z0-9-]*$/i;

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
  health,
  project,
  loadedProject,
  theme,
  onToggleTheme,
  onNavigate,
  onProjectLoaded,
}: DashboardProps) {
  const [tableSpecs, setTableSpecs] = useState<LegacyTableSpec[]>([]);
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
  const [showGitSummary, setShowGitSummary] = useState(false);
  const gitSummaryRef = useRef<HTMLDivElement | null>(null);
  const gitSummaryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const projectGitSectionRef = useRef<HTMLDivElement | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [tableImportReport, setTableImportReport] = useState<TableImportReport | null>(null);
  const [tableImportError, setTableImportError] = useState<string | null>(null);
  const [isImportingTable, setIsImportingTable] = useState(false);
  const [tableExportStatus, setTableExportStatus] = useState<string | null>(null);
  const [isExportingTable, setIsExportingTable] = useState(false);
  const [configEditorText, setConfigEditorText] = useState('');
  const [configEditorError, setConfigEditorError] = useState<string | null>(null);
  const [pdoAdvancedReport, setPdoAdvancedReport] = useState<PdoAdvancedParseReport | null>(null);
  const [pdoAdvancedError, setPdoAdvancedError] = useState<string | null>(null);
  const [isParsingPdoAdvanced, setIsParsingPdoAdvanced] = useState(false);
  const [batteryProtocolImportStatus, setBatteryProtocolImportStatus] = useState<string | null>(
    null,
  );
  const [batteryProtocolExportStatus, setBatteryProtocolExportStatus] = useState<string | null>(
    null,
  );
  const [isExportingBatteryProtocol, setIsExportingBatteryProtocol] = useState(false);
  const [isImportingBatteryProtocol, setIsImportingBatteryProtocol] = useState(false);
  const [batteryCsvStatus, setBatteryCsvStatus] = useState<string | null>(null);
  const [isExportingBatteryCsv, setIsExportingBatteryCsv] = useState(false);
  const [isImportingBatteryCsv, setIsImportingBatteryCsv] = useState(false);
  const [batteryDbcStatus, setBatteryDbcStatus] = useState<string | null>(null);
  const [isExportingBatteryDbc, setIsExportingBatteryDbc] = useState(false);
  const [isImportingBatteryDbc, setIsImportingBatteryDbc] = useState(false);
  const [batteryMonitorImportStatus, setBatteryMonitorImportStatus] = useState<string | null>(null);
  const [isImportingBatteryMonitor, setIsImportingBatteryMonitor] = useState(false);
  const [batteryMonitorExportStatus, setBatteryMonitorExportStatus] = useState<string | null>(null);
  const [isExportingBatteryMonitor, setIsExportingBatteryMonitor] = useState(false);
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
  const [newLanguageCode, setNewLanguageCode] = useState('');
  const [newLanguageLabel, setNewLanguageLabel] = useState('');
  const [newLanguageInnerKey, setNewLanguageInnerKey] = useState('');
  const [editingLanguageInnerKeys, setEditingLanguageInnerKeys] = useState<Record<number, string>>(
    {},
  );
  const [editingLanguageCodes, setEditingLanguageCodes] = useState<Record<number, string>>({});
  const [orphanLanguageKeys, setOrphanLanguageKeys] = useState<string[]>([]);
  const [languageEditorError, setLanguageEditorError] = useState<string | null>(null);
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

  useEffect(() => {
    void Promise.all([
      getLegacyTableSpec('sdo'),
      getLegacyTableSpec('pdoSimple'),
      getLegacyTableSpec('language'),
    ]).then(setTableSpecs);
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

  function activeLegacyTableKind(): TableConfigKind | null {
    return legacyTableKindForModule(activeModule.key) as TableConfigKind | null;
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

  function restoreLanguageCode(index: number) {
    const document = languageDocument();
    const baselineLanguage = baselineLanguageDocument();
    if (!document || !baselineLanguage) return;

    const baselineCode = baselineLanguage.list_code_language[index];
    if (typeof baselineCode !== 'string') {
      removeLanguageCode(index);
      return;
    }

    const currentCode = document.list_code_language[index];
    const listTranslate = Object.fromEntries(
      document.list_inner.slice(document.list_code_language.length).map((key) => {
        const values = {
          ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}),
        };
        const baselineValues =
          (baselineLanguage.list_translate[key] as Record<string, string> | undefined) ?? {};
        if (currentCode && currentCode !== baselineCode) delete values[currentCode];
        values[baselineCode] = baselineValues[baselineCode] ?? '';
        return [key, values];
      }),
    );
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (currentCode && currentCode !== baselineCode) delete nextLabels[currentCode];
    nextLabels[baselineCode] =
      baselineLanguage.language_labels?.[baselineCode] ??
      baselineLanguage.list_inner[index] ??
      baselineCode;

    updateLanguageDocument({
      ...document,
      list_code_language: document.list_code_language.map((code, currentIndex) =>
        currentIndex === index ? baselineCode : code,
      ),
      language_labels: nextLabels,
      list_translate: listTranslate,
    });
  }

  function isLanguageValueModified(index: number, key: string, code: string) {
    if (!baselineDocument) return false;
    const baselineLanguage = baselineLanguageDocument();
    const document = languageDocument();
    if (!baselineLanguage || !document || index < document.list_code_language.length) return false;

    if (isModifiedPath(['language_info', 'list_translate', key, code])) return true;
    const baselineKey = baselineLanguage.list_inner[index];
    if (typeof baselineKey !== 'string' || baselineKey === key) return false;

    const currentValue =
      (document.list_translate[key] as Record<string, string> | undefined)?.[code] ?? '';
    const baselineValue =
      (baselineLanguage.list_translate[baselineKey] as Record<string, string> | undefined)?.[
        code
      ] ?? '';
    return !deepEqual(currentValue, baselineValue);
  }

  function restoreLanguageKey(index: number, key: string) {
    const document = languageDocument();
    const baselineLanguage = baselineLanguageDocument();
    if (!document || !baselineLanguage) return;

    const baselineKey = baselineLanguage.list_inner[index];
    if (typeof baselineKey !== 'string') {
      removeLanguageKey(index);
      return;
    }

    const nextTranslate = { ...document.list_translate };
    if (key !== baselineKey) delete nextTranslate[key];
    nextTranslate[baselineKey] = cloneJson(
      baselineLanguage.list_translate[baselineKey] ??
        Object.fromEntries(document.list_code_language.map((code) => [code, ''])),
    );

    updateLanguageDocument({
      ...document,
      list_inner: document.list_inner.map((item, currentIndex) =>
        currentIndex === index ? baselineKey : item,
      ),
      list_translate: nextTranslate,
    });
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
  const currentProjectPath = loadedProject?.summary.path ?? projectPath;
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
    setShowGitSummary(false);
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
    setShowGitSummary(false);
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

  function batteryProtocolDocument(): BatteryProtocol {
    if (!loadedProject) return { default_timeout_ticks: 200, frames: [], signals: [] };
    const doc = loadedProject.document as Record<string, unknown>;
    if (!doc.battery_protocol) {
      return { default_timeout_ticks: 200, frames: [], signals: [] };
    }
    return doc.battery_protocol as BatteryProtocol;
  }

  async function updateBatteryProtocolDocument(next: BatteryProtocol) {
    if (next.frames.length > 0 || next.signals.length > 0) {
      try {
        const dbc = await generateDbcContent(next.frames, next.signals);
        updateProjectDocument('battery_protocol', { ...next, dbc_content: dbc });
        return;
      } catch {
        /* fall through */
      }
    }
    updateProjectDocument('battery_protocol', next);
  }

  function updateBatteryProtocolField(field: keyof BatteryProtocol, value: unknown) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({ ...document, [field]: value });
  }

  function batteryMonitorDocument(): BatteryMonitorInfo {
    if (!loadedProject) return { enabled: true, page_size: 4, items: [] };
    const doc = loadedProject.document as Record<string, unknown>;
    if (!doc.battery_monitor_info) {
      return { enabled: true, page_size: 4, items: [] };
    }
    return doc.battery_monitor_info as BatteryMonitorInfo;
  }

  function updateBatteryMonitorDocument(next: BatteryMonitorInfo) {
    updateProjectDocument('battery_monitor_info', next);
  }

  function updateBatteryMonitorField(field: keyof BatteryMonitorInfo, value: unknown) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, [field]: value });
  }

  function currentBatteryFrames(): BatteryMonitorFrame[] {
    return batteryProtocolDocument()?.frames ?? [];
  }

  function currentBatterySignals(): BatteryMonitorSignal[] {
    return batteryProtocolDocument()?.signals ?? [];
  }

  function currentBatteryDefaultTimeout(): number {
    return batteryProtocolDocument()?.default_timeout_ticks ?? 200;
  }

  function updateBatteryFrame(
    index: number,
    field: keyof BatteryMonitorFrame,
    value: string | number,
  ) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      frames: document.frames.map((frame, currentIndex) =>
        currentIndex === index ? { ...frame, [field]: value } : frame,
      ),
    });
  }

  function updateBatteryFrameId(index: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updateBatteryFrame(index, 'can_id', nextId);
  }

  function addBatteryFrame() {
    const document = batteryProtocolDocument();
    if (!document) return;
    const index = document.frames.length;
    updateBatteryProtocolDocument({
      ...document,
      frames: [
        ...document.frames,
        {
          frame_key: `bat_custom_${index + 1}`,
          can_id: 0,
          type: 0,
          desc: '新锂电帧',
          timeout_ticks: document.default_timeout_ticks ?? 200,
        },
      ],
    });
  }

  function removeBatteryFrame(index: number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    const removedFrameKey = document.frames[index]?.frame_key;
    const remainingFrames = document.frames.filter((_, currentIndex) => currentIndex !== index);
    const firstFrameKey = remainingFrames[0]?.frame_key;
    const signals = document.signals.map((signal) =>
      signal.frame_key === removedFrameKey && firstFrameKey
        ? { ...signal, frame_key: firstFrameKey }
        : signal,
    );
    updateBatteryProtocolDocument({ ...document, frames: remainingFrames, signals });
  }

  function updateBatterySignal(
    index: number,
    field: keyof BatteryMonitorSignal,
    value: string | number,
  ) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) =>
        currentIndex === index ? { ...signal, [field]: value } : signal,
      ),
    });
  }

  function addBatterySignal() {
    const document = batteryProtocolDocument();
    if (!document) return;
    const index = document.signals.length;
    let frames = document.frames;
    if (frames.length === 0) {
      frames = [
        {
          frame_key: 'bat_default',
          can_id: 0,
          type: 0,
          desc: '默认帧',
          timeout_ticks: document.default_timeout_ticks ?? 200,
        },
      ];
    }
    updateBatteryProtocolDocument({
      ...document,
      frames,
      signals: [
        ...document.signals,
        {
          signal_key: `battery_signal_${index + 1}`,
          param_id: `BATTERY_MONITOR_CUSTOM_${index + 1}`,
          name: '新锂电信号',
          inner: -1,
          type: 0,
          def: '0',
          frame_key: frames[0].frame_key,
          pos: 0,
          len: 8,
          show_type: 0,
          handle: 0,
          handle_param: '',
          factor: 1,
          offset: 0,
          min: 0,
          max: 0,
          unit: '',
          receiver: 'dbc_export',
          comment: '',
        },
      ],
    });
  }

  function removeBatterySignal(index: number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      signals: document.signals.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateBatteryItem(
    index: number,
    field: keyof BatteryMonitorItem,
    value: string | number | boolean,
  ) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  }

  function updateBatteryItemFormatter(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, formatter: { ...item.formatter, [field]: value } }
          : item,
      ),
    });
  }

  function updateBatteryItemValidity(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, validity: { ...item.validity, [field]: value } } : item,
      ),
    });
  }

  function addBatteryItem() {
    const document = batteryMonitorDocument();
    if (!document) return;
    const index = document.items.length;
    const currentProtocol = batteryProtocolDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: [
        ...document.items,
        {
          item_key: `battery_item_${index + 1}`,
          enabled: true,
          order: index,
          signal_key: currentProtocol?.signals[0]?.signal_key ?? '',
          name_key: '新锂电项',
          unit: '',
          formatter: {
            kind: 'linear',
            offset: 0,
            scale_num: 1,
            scale_den: 1,
            decimals: 0,
            display_base: 10,
          },
          validity: {
            mode: 'frame_timeout',
            frame_key: currentProtocol?.frames[0]?.frame_key ?? '',
            empty_text: ' ',
          },
        },
      ],
    });
  }

  function removeBatteryItem(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function handleExportBatteryMonitor() {
    setBatteryMonitorExportStatus(null);
    if (!loadedProject) {
      setBatteryMonitorExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryMonitorExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      filters: [{ name: '锂电监控配置', extensions: ['json'] }],
    });
    if (!selected) return;

    setIsExportingBatteryMonitor(true);
    try {
      await saveJsonFile(selected, batteryMonitorDocument());
      setBatteryMonitorExportStatus(`已导出：${selected}`);
    } catch (error) {
      setBatteryMonitorExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryMonitor(false);
    }
  }

  async function handleExportBatteryProtocol() {
    setBatteryProtocolExportStatus(null);
    if (!loadedProject) {
      setBatteryProtocolExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryProtocolExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      filters: [{ name: '锂电协议', extensions: ['json'] }],
    });
    if (!selected) return;

    setIsExportingBatteryProtocol(true);
    try {
      await saveJsonFile(selected, batteryProtocolDocument());
      setBatteryProtocolExportStatus(`已导出：${selected}`);
    } catch (error) {
      setBatteryProtocolExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryProtocol(false);
    }
  }

  async function handleImportBatteryProtocol() {
    setBatteryProtocolImportStatus(null);
    if (!loadedProject) {
      setBatteryProtocolImportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryProtocolImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '锂电协议', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryProtocol(true);
    try {
      const data = (await loadJsonFile(selected)) as BatteryProtocol;
      if (!data || !Array.isArray(data.frames) || !Array.isArray(data.signals)) {
        setBatteryProtocolImportStatus('无效的锂电协议配置文件。');
        return;
      }
      updateBatteryProtocolDocument(data);
      setBatteryProtocolImportStatus(
        `已导入 ${data.frames.length} 帧 / ${data.signals.length} 信号`,
      );
    } catch (error) {
      setBatteryProtocolImportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryProtocol(false);
    }
  }

  async function handleImportBatteryMonitor() {
    setBatteryMonitorImportStatus(null);
    if (!loadedProject) {
      setBatteryMonitorImportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryMonitorImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '锂电监控配置', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryMonitor(true);
    try {
      const data = (await loadJsonFile(selected)) as BatteryMonitorInfo;
      if (!data || !Array.isArray(data.items)) {
        setBatteryMonitorImportStatus('无效的锂电监控显示配置文件。');
        return;
      }
      updateBatteryMonitorDocument(data);
      setBatteryMonitorImportStatus(`已导入 ${data.items.length} 显示项`);
    } catch (error) {
      setBatteryMonitorImportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryMonitor(false);
    }
  }

  async function handleExportBatteryFramesCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      filters: [{ name: '帧 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const csv = framesToCsv(currentBatteryProtocolDocument?.frames ?? []);
      await saveTextFile(selected, '\uFEFF' + csv);
      setBatteryCsvStatus(`帧 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryFramesCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '帧 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      const { frames, errors } = csvToFrames(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入帧 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryProtocolDocument();
      if (!document) return;
      updateBatteryProtocolDocument({ ...document, frames });
      setBatteryCsvStatus(`已导入 ${frames.length} 帧`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      filters: [{ name: '信号 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const csv = signalsToCsv(currentBatteryProtocolDocument?.signals ?? []);
      await saveTextFile(selected, '\uFEFF' + csv);
      setBatteryCsvStatus(`信号 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '信号 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      const { signals, errors } = csvToSignals(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入信号 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryProtocolDocument();
      if (!document) return;
      updateBatteryProtocolDocument({ ...document, signals });
      setBatteryCsvStatus(`已导入 ${signals.length} 信号`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await save({
      filters: [{ name: '显示项 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const csv = itemsToCsv(currentBatteryMonitorDocument?.items ?? []);
      await saveTextFile(selected, '\uFEFF' + csv);
      setBatteryCsvStatus(`显示项 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '显示项 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      const { items, errors } = csvToItems(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入显示项 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryMonitorDocument();
      if (!document) return;
      updateBatteryMonitorDocument({ ...document, items });
      setBatteryCsvStatus(`已导入 ${items.length} 显示项`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) {
      setBatteryDbcStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryDbcStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: 'DBC 文件', extensions: ['dbc'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryDbc(true);
    try {
      const report = await importDbc(selected);
      if (report.errors.length > 0) {
        setBatteryDbcStatus(`导入 DBC 出错：${report.errors.join('；')}`);
        return;
      }
      if (report.frames.length === 0) {
        setBatteryDbcStatus('DBC 文件中未找到任何消息。');
        return;
      }
      let rawDbc = '';
      try {
        rawDbc = await loadTextFile(selected);
      } catch {
        /* non-critical */
      }
      const document = batteryProtocolDocument();
      updateBatteryProtocolDocument({
        ...document,
        frames: report.frames,
        signals: report.signals,
        dbc_content: rawDbc || undefined,
      });
      setBatteryDbcStatus(`已导入 ${report.frames.length} 帧 / ${report.signals.length} 信号`);
    } catch (error) {
      setBatteryDbcStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryDbc(false);
    }
  }

  async function handleExportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) {
      setBatteryDbcStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryDbcStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const document = batteryProtocolDocument();
    if (document.frames.length === 0) {
      setBatteryDbcStatus('没有帧可导出。');
      return;
    }

    const selected = await save({
      filters: [{ name: 'DBC 文件', extensions: ['dbc'] }],
    });
    if (!selected) return;

    setIsExportingBatteryDbc(true);
    try {
      await exportDbc(selected, document.frames, document.signals);
      setBatteryDbcStatus(`DBC 已导出：${selected}`);
    } catch (error) {
      setBatteryDbcStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryDbc(false);
    }
  }

  function confirmGenerateTestData() {
    if (!confirmGenerateType || !loadedProject) return;
    const data = getTestData(confirmGenerateType);
    setGeneratingTestKey(confirmGenerateType);
    setConfirmGenerateType(null);
    try {
      if (data.pdoSimple) pdoEditor.updateSimpleDocument(data.pdoSimple);
      if (data.pdoAdvanced) pdoEditor.updateAdvancedDocument(data.pdoAdvanced);
      if (data.batteryMonitor) updateBatteryMonitorDocument(data.batteryMonitor);
      if (data.batteryProtocol) updateBatteryProtocolDocument(data.batteryProtocol);
    } finally {
      setGeneratingTestKey(null);
    }
  }

  function updateLanguageDocument(next: LanguageDocument) {
    updateProjectDocument('language_info', next);
  }

  function inferredLanguageLabels(document: LanguageDocument) {
    return Object.fromEntries(
      document.list_code_language.map((code, index) => [
        code,
        document.language_labels?.[code]?.trim() || document.list_inner[index] || `语言_${code}`,
      ]),
    );
  }

  function languageConfigLabel(document: LanguageDocument, code: string) {
    return inferredLanguageLabels(document)[code] || `语言_${code}`;
  }

  function normalizeLanguageDocument(
    document: LanguageDocument,
    codes: string[],
    labels = inferredLanguageLabels(document),
  ): LanguageDocument {
    const documentWithLabels = { ...document, language_labels: labels };
    const configKeys = codes.map((code) => languageConfigLabel(documentWithLabels, code));
    const existingConfigKeySet = new Set(
      document.list_code_language.map((code) => languageConfigLabel(document, code)),
    );
    const customKeys = document.list_inner.filter(
      (key, index) => index >= document.list_code_language.length || !existingConfigKeySet.has(key),
    );
    const listInner = [...configKeys, ...customKeys.filter((key) => !configKeys.includes(key))];
    const listTranslate = { ...document.list_translate };
    for (const key of configKeys) delete listTranslate[key];

    return {
      ...document,
      list_code_language: codes,
      list_inner: listInner,
      list_translate: listTranslate,
      language_labels: labels,
    };
  }

  function updateLanguageLabel(index: number, value: string) {
    const document = languageDocument();
    if (!document) return;

    const code = document.list_code_language[index];
    const label = value.trim();
    if (!label) {
      setLanguageEditorError('语言显示名不能为空。');
      return;
    }

    const nextLabels = { ...(document.language_labels ?? {}), [code]: label };
    setLanguageEditorError(null);
    updateLanguageDocument(
      normalizeLanguageDocument(document, document.list_code_language, nextLabels),
    );
  }

  function findOrphanLanguageKeys(document: LanguageDocument) {
    const innerKeySet = new Set(document.list_inner);
    return Object.keys(document.list_translate).filter((key) => !innerKeySet.has(key));
  }

  function validateLanguageCode(code: string, codes: string[], currentIndex?: number) {
    const normalizedCode = code.trim();
    if (!normalizedCode) return '语言代码不能为空。';
    if (!languageCodePattern.test(normalizedCode))
      return '语言代码只能使用字母、数字和连字符，并且必须以字母开头。';
    if (
      codes.some(
        (item, index) =>
          item.toLowerCase() === normalizedCode.toLowerCase() && index !== currentIndex,
      )
    )
      return `语言代码 ${normalizedCode} 已存在。`;
    return null;
  }

  function validateLanguageInnerKey(key: string, keys: string[], currentIndex?: number) {
    const normalizedKey = key.trim();
    if (!normalizedKey) return '语言内部键不能为空。';
    if (keys.some((item, index) => item === normalizedKey && index !== currentIndex))
      return `语言内部键 ${normalizedKey} 已存在。`;
    return null;
  }

  function updateLanguageCode(index: number, value: string) {
    const document = languageDocument();
    if (!document) return;

    const previousCode = document.list_code_language[index];
    const nextCode = value.trim().toLowerCase();
    if (previousCode === 'zh' && nextCode !== 'zh') {
      setLanguageEditorError('中文 zh 是基础语言，不能重命名。');
      return;
    }
    const error = validateLanguageCode(nextCode, document.list_code_language, index);
    if (error) {
      setLanguageEditorError(error);
      return;
    }

    setLanguageEditorError(null);
    const nextCodes = document.list_code_language.map((code, currentIndex) =>
      currentIndex === index ? nextCode : code,
    );
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (previousCode !== nextCode) {
      nextLabels[nextCode] =
        nextLabels[previousCode] ?? languageConfigLabel(document, previousCode);
      delete nextLabels[previousCode];
    }
    const nextTranslate = Object.fromEntries(
      document.list_inner.slice(document.list_code_language.length).map((key) => {
        const values = {
          ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}),
        };
        if (previousCode !== nextCode) {
          values[nextCode] = values[previousCode] ?? '';
          delete values[previousCode];
        }
        return [key, values];
      }),
    );

    updateLanguageDocument(
      normalizeLanguageDocument(
        { ...document, list_translate: nextTranslate },
        nextCodes,
        nextLabels,
      ),
    );
  }

  function addLanguageCode() {
    const document = languageDocument();
    if (!document) return;

    const nextCode = newLanguageCode.trim().toLowerCase();
    const nextLabel = newLanguageLabel.trim();
    const error = validateLanguageCode(nextCode, document.list_code_language);
    if (error) {
      setLanguageEditorError(error);
      return;
    }
    if (!nextLabel) {
      setLanguageEditorError('语言显示名不能为空。');
      return;
    }

    const nextTranslate = Object.fromEntries(
      document.list_inner.slice(document.list_code_language.length).map((key) => {
        const values = {
          ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}),
        };
        values[nextCode] = '';
        return [key, values];
      }),
    );

    const nextLabels = { ...(document.language_labels ?? {}), [nextCode]: nextLabel };
    setLanguageEditorError(null);
    setNewLanguageCode('');
    setNewLanguageLabel('');
    updateLanguageDocument(
      normalizeLanguageDocument(
        { ...document, list_translate: nextTranslate },
        [...document.list_code_language, nextCode],
        nextLabels,
      ),
    );
  }

  function removeLanguageCode(index: number) {
    const document = languageDocument();
    if (!document) return;
    if (document.list_code_language.length <= 1) {
      setLanguageEditorError('至少需要保留一个语言列。');
      return;
    }

    const removedCode = document.list_code_language[index];
    if (removedCode === 'zh') {
      setLanguageEditorError('中文 zh 是基础语言，不能删除。');
      return;
    }

    const nextTranslate = Object.fromEntries(
      document.list_inner.slice(document.list_code_language.length).map((key) => {
        const values = {
          ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}),
        };
        delete values[removedCode];
        return [key, values];
      }),
    );

    const nextLabels = { ...(document.language_labels ?? {}) };
    delete nextLabels[removedCode];
    setLanguageEditorError(null);
    updateLanguageDocument(
      normalizeLanguageDocument(
        { ...document, list_translate: nextTranslate },
        document.list_code_language.filter((_, currentIndex) => currentIndex !== index),
        nextLabels,
      ),
    );
  }

  function syncLanguageConfigKeys() {
    const document = languageDocument();
    if (!document) return;

    setLanguageEditorError(null);
    updateLanguageDocument(normalizeLanguageDocument(document, document.list_code_language));
  }

  function checkOrphanLanguageTranslations() {
    const document = languageDocument();
    if (!document) return;

    const keys = findOrphanLanguageKeys(document);
    setOrphanLanguageKeys(keys);
    setLanguageEditorError(
      keys.length > 0 ? `发现 ${keys.length} 个无主翻译条目。` : '未发现无主翻译条目。',
    );
  }

  function cleanupOrphanLanguageTranslations() {
    const document = languageDocument();
    if (!document) return;

    const keys = findOrphanLanguageKeys(document);
    if (keys.length === 0) {
      setOrphanLanguageKeys([]);
      setLanguageEditorError('未发现无主翻译条目。');
      return;
    }

    const listTranslate = { ...document.list_translate };
    for (const key of keys) delete listTranslate[key];
    setOrphanLanguageKeys([]);
    setLanguageEditorError(`已清理 ${keys.length} 个无主翻译条目。`);
    updateLanguageDocument({ ...document, list_translate: listTranslate });
  }

  function setLanguageInnerKeyDraft(index: number, value: string) {
    setEditingLanguageInnerKeys((items) => ({ ...items, [index]: value }));
  }

  function clearLanguageInnerKeyDraft(index: number) {
    setEditingLanguageInnerKeys((items) => {
      const next = { ...items };
      delete next[index];
      return next;
    });
  }

  function setLanguageCodeDraft(index: number, value: string) {
    setEditingLanguageCodes((items) => ({ ...items, [index]: value }));
  }

  function clearLanguageCodeDraft(index: number) {
    setEditingLanguageCodes((items) => {
      const next = { ...items };
      delete next[index];
      return next;
    });
  }

  function applyLanguageCodeDraft(index: number) {
    const document = languageDocument();
    if (!document) return;
    const draft = editingLanguageCodes[index];
    if (draft === undefined) return;
    clearLanguageCodeDraft(index);
    updateLanguageCode(index, draft);
  }

  function updateLanguageKey(index: number, value: string) {
    const document = languageDocument();
    if (!document) return;
    if (index < document.list_code_language.length) {
      setLanguageEditorError('开头语言配置段由语言列自动维护，不能手动改名。');
      clearLanguageInnerKeyDraft(index);
      return;
    }

    const previousKey = document.list_inner[index];
    const nextKey = value.trim();
    if (nextKey === previousKey) {
      setLanguageEditorError(null);
      clearLanguageInnerKeyDraft(index);
      return;
    }

    const error = validateLanguageInnerKey(nextKey, document.list_inner, index);
    if (error) {
      setLanguageEditorError(error);
      return;
    }

    setLanguageEditorError(null);
    setOrphanLanguageKeys([]);
    clearLanguageInnerKeyDraft(index);
    const nextKeys = document.list_inner.map((key, currentIndex) =>
      currentIndex === index ? nextKey : key,
    );
    const nextTranslate = { ...document.list_translate };
    nextTranslate[nextKey] =
      nextTranslate[previousKey] ??
      Object.fromEntries(document.list_code_language.map((code) => [code, '']));
    if (previousKey !== nextKey) delete nextTranslate[previousKey];

    updateLanguageDocument({ ...document, list_inner: nextKeys, list_translate: nextTranslate });
  }

  function addLanguageKey() {
    const document = languageDocument();
    if (!document) return;

    const nextKey = newLanguageInnerKey.trim();
    const error = validateLanguageInnerKey(nextKey, document.list_inner);
    if (error) {
      setLanguageEditorError(error);
      return;
    }

    setLanguageEditorError(null);
    setOrphanLanguageKeys([]);
    setNewLanguageInnerKey('');
    updateLanguageDocument({
      ...document,
      list_inner: [...document.list_inner, nextKey],
      list_translate: {
        ...document.list_translate,
        [nextKey]: Object.fromEntries(document.list_code_language.map((code) => [code, ''])),
      },
    });
  }

  function removeLanguageKey(index: number) {
    const document = languageDocument();
    if (!document) return;
    if (index < document.list_code_language.length) {
      setLanguageEditorError('开头语言配置段由语言列自动维护，不能删除。');
      return;
    }

    const removedKey = document.list_inner[index];
    const nextTranslate = { ...document.list_translate };
    delete nextTranslate[removedKey];
    setOrphanLanguageKeys([]);
    clearLanguageInnerKeyDraft(index);
    updateLanguageDocument({
      ...document,
      list_inner: document.list_inner.filter((_, currentIndex) => currentIndex !== index),
      list_translate: nextTranslate,
    });
  }

  function updateLanguageValue(key: string, code: string, value: string) {
    const document = languageDocument();
    if (!document) return;

    updateLanguageDocument({
      ...document,
      list_translate: {
        ...document.list_translate,
        [key]: {
          ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}),
          [code]: value,
        },
      },
    });
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

  async function handleExportTableConfig(kind: TableConfigKind, format: 'csv' | 'xml') {
    setTableExportStatus(null);

    if (!loadedProject) {
      setTableExportStatus('请先打开 .jcpro 项目。');
      return;
    }

    if (!isTauriRuntime()) {
      setTableExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const path = await save({
      filters: [{ name: format === 'csv' ? 'CSV 表格' : 'Excel XML 表格', extensions: [format] }],
    });
    if (!path) return;

    setIsExportingTable(true);

    try {
      const document = (loadedProject.document as Record<string, unknown>)[
        tableConfigSections[kind]
      ];
      const table = await exportableTableDocument(kind, document);
      if (format === 'csv') {
        await exportTableCsv({ path, document: table });
      } else {
        await exportTableWorkbook({ path, document: table });
      }
      setTableExportStatus(`已导出：${path}`);
    } catch (error) {
      setTableExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingTable(false);
    }
  }

  async function exportableTableDocument(kind: TableConfigKind, document: unknown) {
    if (kind === 'sdo') return sdoDocumentTable(document);
    if (kind === 'pdoSimple') return pdoSimpleDocumentTable(document);
    return languageDocumentTable(document);
  }

  async function handleImportTableConfig(kind: TableConfigKind) {
    setTableImportError(null);
    setTableImportReport(null);

    if (!loadedProject) {
      setTableImportError('请先打开 .jcpro 项目。');
      return;
    }

    if (!isTauriRuntime()) {
      setTableImportError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '表格文件', extensions: ['csv', 'xls', 'xlsx', 'xml'] }],
    });

    if (typeof selected !== 'string') return;

    setIsImportingTable(true);

    try {
      const extension = selected.split('.').pop()?.toLowerCase();
      const isCsv = extension === 'csv';
      const report = await importTableConfig(kind, selected, isCsv);
      setTableImportReport(report);

      if (!report.valid || !report.document) {
        setTableImportError(report.errors.join('；') || '表格导入失败');
        return;
      }

      const section = tableConfigSections[kind];
      const nextDocument = {
        ...(loadedProject.document as Record<string, unknown>),
        [section]: report.document,
      };
      applyLoadedProject({ ...loadedProject, document: nextDocument });
    } catch (error) {
      setTableImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingTable(false);
    }
  }

  async function importTableConfig(
    kind: TableConfigKind,
    path: string,
    isCsv: boolean,
  ): Promise<TableImportReport> {
    if (kind === 'sdo') return isCsv ? importSdoCsv({ path }) : importSdoWorkbook({ path });
    if (kind === 'pdoSimple')
      return isCsv ? importPdoSimpleCsv({ path }) : importPdoSimpleWorkbook({ path });
    return isCsv ? importLanguageCsv({ path }) : importLanguageWorkbook({ path });
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
  const currentBatteryProtocolDocument = batteryProtocolDocument();
  const currentBatteryMonitorDocument = batteryMonitorDocument();
  const batteryLegacyController = {
    currentBatteryProtocolDocument,
    currentBatteryMonitorDocument,
    batteryProtocolExportStatus,
    batteryProtocolImportStatus,
    batteryMonitorExportStatus,
    batteryMonitorImportStatus,
    batteryCsvStatus,
    batteryDbcStatus,
    isExportingBatteryProtocol,
    isImportingBatteryProtocol,
    isExportingBatteryMonitor,
    isImportingBatteryMonitor,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    isExportingBatteryDbc,
    isImportingBatteryDbc,
    handleExportBatteryProtocol,
    handleImportBatteryProtocol,
    handleExportBatteryMonitor,
    handleImportBatteryMonitor,
    handleExportBatteryFramesCsv,
    handleImportBatteryFramesCsv,
    handleExportBatterySignalsCsv,
    handleImportBatterySignalsCsv,
    handleExportBatteryItemsCsv,
    handleImportBatteryItemsCsv,
    handleExportBatteryDbc,
    handleImportBatteryDbc,
    updateBatteryProtocolField,
    updateBatteryMonitorField,
    updateBatteryFrame,
    updateBatteryFrameId,
    addBatteryFrame,
    removeBatteryFrame,
    updateBatterySignal,
    addBatterySignal,
    removeBatterySignal,
    updateBatteryItem,
    updateBatteryItemFormatter,
    updateBatteryItemValidity,
    addBatteryItem,
    removeBatteryItem,
    formatFrameId,
    isModifiedPath,
    restoreModifiedPath,
  };
  const currentLegacyTableKind = activeLegacyTableKind();

  return (
    <main className={showGitReview ? 'workspace workspace--git-review' : 'workspace'}>
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
              onClick={() => {
                if (!loadedProject) return;
                const type: TestDataType =
                  activeModule.key === 'realtime-data' && pdoEditor.mode === 'simple'
                    ? 'pdo-simple'
                    : activeModule.key === 'realtime-data'
                      ? 'pdo-advanced'
                      : activeModule.key === 'battery-protocol'
                        ? 'battery-protocol'
                        : 'battery-monitor';
                setConfirmGenerateType(type);
              }}
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
              onClick={() => setShowCanvasLabels((v) => !v)}
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
              onClick={() => setShowJsonEditor((v) => !v)}
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
      {showSaveModal && loadedProject ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="save-project-dialog-title"
            aria-modal="true"
            className="modal-box"
            role="dialog"
          >
            <h3 id="save-project-dialog-title">确认保存</h3>
            <p>将当前所有配置修改写入项目文件：</p>
            <div className="modal-path">{loadedProject.summary.path}</div>
            {isLegacyJcproProject && hasRefactorOnlyChanges ? (
              <p className="project-open-warning">
                {refactorConfigPath
                  ? `检测到重构专属配置修改，将写回已挂载 JSON：${refactorConfigPath}；原 .jcpro 只保存兼容字段。`
                  : '检测到重构专属配置修改，将创建独立 JSON sidecar；原 .jcpro 只保存兼容字段。'}
              </p>
            ) : null}
            {modifiedSections.length > 0 ? (
              <div className="action-bar-pills">
                {modifiedSections.map((section) => (
                  <span className="action-bar-pill" key={section}>
                    {modifiedSectionLabels[section] ?? section}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                disabled={isSavingProject}
                onClick={cancelSaveProject}
                type="button"
              >
                取消
              </button>
              <button
                className="modal-btn-confirm"
                disabled={isSavingProject}
                onClick={() => void confirmSaveProject()}
                type="button"
              >
                {savingProjectAction === 'save' ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmGenerateType ? (
        <div className="modal-overlay">
          <div
            aria-labelledby="generate-test-dialog-title"
            aria-modal="true"
            className="modal-box"
            role="dialog"
          >
            <h3 id="generate-test-dialog-title">确认生成测试数据</h3>
            <p>
              将使用 <strong>{testDataLabels[confirmGenerateType]}</strong>{' '}
              模板覆盖当前配置，是否继续？
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                onClick={() => setConfirmGenerateType(null)}
                type="button"
              >
                取消
              </button>
              <button className="modal-btn-confirm" onClick={confirmGenerateTestData} type="button">
                确认生成
              </button>
            </div>
          </div>
        </div>
      ) : null}

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


        {currentLegacyTableKind ? (
          <section className="table-spec-card">
            <div>
              <h2>{tableConfigTitles[currentLegacyTableKind]}</h2>
              <p>导入/导出操作请使用顶部工具栏按钮。支持 CSV、XLS、XLSX、XML 格式。</p>
            </div>
            {tableSpecs
              .filter((spec) => spec.kind === currentLegacyTableKind)
              .map((spec) => (
                <div className="table-format-ref" key={spec.kind}>
                  <strong>表头格式（{spec.headers.length} 列）</strong>
                  <div className="table-format-chips">
                    {spec.headers.map((header) => (
                      <span className="table-format-chip" key={header}>
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            {tableImportError ? <p className="project-open-error">{tableImportError}</p> : null}
            {tableImportReport ? (
              <div className="table-io-result">
                <div className="table-io-result-row">
                  <span>导入校验</span>
                  <strong className={tableImportReport.valid ? 'text-success' : 'text-danger'}>
                    {tableImportReport.valid ? '通过' : '存在问题'}
                  </strong>
                </div>
                <div className="table-io-result-row">
                  <span>表头列数</span>
                  <strong>{tableImportReport.table.actual_headers.length}</strong>
                </div>
                <div className="table-io-result-row">
                  <span>写回段落</span>
                  <strong>{tableConfigSections[currentLegacyTableKind]}</strong>
                </div>
              </div>
            ) : null}
            {tableExportStatus ? <p className="config-helper-text">{tableExportStatus}</p> : null}
          </section>
        ) : null}

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
          <section className="table-spec-card">
            <div>
              <h2>表格格式参考</h2>
              <p>SDO、PDO 简化表和多语言表的表头定义，导入前可快速确认目标格式。</p>
            </div>
            {tableSpecs.map((spec) => (
              <div className="table-format-ref" key={spec.kind}>
                <strong>
                  {spec.kind === 'sdo'
                    ? 'SDO 参数表'
                    : spec.kind === 'pdoSimple'
                      ? 'PDO 简化表'
                      : '多语言表'}
                  （{spec.headers.length} 列）
                </strong>
                <div className="table-format-chips">
                  {spec.headers.map((header) => (
                    <span className="table-format-chip" key={header}>
                      {header}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>
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
          <section className="project-open-card">
            <div>
              <h2>软件设置</h2>
              <p>管理导出写入控制、外观主题等软件级偏好设置。</p>
            </div>
            <strong className="section-label--muted">导出写入控制</strong>
            <div className="settings-option-grid">
              <div className="settings-option-grid__head">配置项</div>
              <div className="settings-option-grid__head">写入 ConfigUpdate.json</div>
              <div className="settings-option-grid__head">写入 pdo_sdo_data.bin</div>
              <div className="settings-option-info">
                <span>锂电协议</span>
                <small>控制 battery_protocol 是否随完整导出写入配置文件或设备 bin。</small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_protocol.config}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_protocol', 'config', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_protocol.bin}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_protocol', 'bin', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
              <div className="settings-option-info">
                <span>锂电协议监控</span>
                <small>
                  控制 battery_monitor_info 是否写入导出清单描述和 battery monitor 二进制段。
                </small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.config}
                  onChange={(event) =>
                    updateExportBatteryOption(
                      'battery_monitor_info',
                      'config',
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.bin}
                  onChange={(event) =>
                    updateExportBatteryOption('battery_monitor_info', 'bin', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
              <div className="settings-option-info">
                <span>故障码配置</span>
                <small>控制 fault_code_info 是否写入导出清单描述和 fault code 二进制段。</small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.fault_code_info.config}
                  onChange={(event) =>
                    updateExportBatteryOption('fault_code_info', 'config', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.fault_code_info.bin}
                  onChange={(event) =>
                    updateExportBatteryOption('fault_code_info', 'bin', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
            </div>
            <div className="settings-option-footer">
              <span>该设置影响项目导出、二进制报告和 bin 对比。</span>
              <button type="button" onClick={resetExportBatteryOptions}>
                恢复默认
              </button>
            </div>
            <strong className="section-label--muted">翻译服务</strong>
            <div className="settings-service-panel">
              <div className="settings-service-info">
                <span>百度翻译</span>
                <small>用于多国语言管理页的一键条目翻译。</small>
              </div>
              <label className="settings-field">
                <span>App ID</span>
                <input
                  autoComplete="off"
                  value={translationSettings.baiduAppId}
                  onChange={(event) => updateTranslationSetting('baiduAppId', event.target.value)}
                />
              </label>
              <label className="settings-field">
                <span>API Key</span>
                <input
                  autoComplete="new-password"
                  type="password"
                  value={translationSettings.baiduAppKey}
                  onChange={(event) => updateTranslationSetting('baiduAppKey', event.target.value)}
                />
              </label>
              <div className="settings-option-footer settings-option-footer--compact">
                <span>配置保存在本机软件设置中，不写入项目文件。</span>
                <button type="button" onClick={resetTranslationSettings}>
                  清空配置
                </button>
              </div>
            </div>
            <strong className="section-label--muted">外观</strong>
            <div className="theme-toggle-row">
              <div className="theme-toggle-info">
                <span>主题模式</span>
                <small>{theme === 'dark' ? '深色模式' : '浅色模式'}</small>
              </div>
              <button className="theme-toggle-btn" onClick={onToggleTheme} type="button">
                <span
                  className={`theme-toggle-track ${theme === 'dark' ? 'theme-toggle-track--dark' : ''}`}
                >
                  <span className="theme-toggle-thumb" />
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {activeModule.key === 'export' ? (
          <ProjectExportPage controller={projectExport} />
        ) : null}

      </div>
    </main>
  );
}
