import { useEffect, useRef, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  addUiResourceOptionDocument,
  buildProjectBinaryReport,
  compareProjectBinaryReport,
  copyUiResourceImages,
  createProject,
  exportProjectPackage,
  exportTableCsv,
  exportTableWorkbook,
  generateCanTestData,
  getLegacyTableSpec,
  importLanguageCsv,
  importLanguageWorkbook,
  importPdoSimpleCsv,
  importPdoSimpleWorkbook,
  importSdoCsv,
  importSdoWorkbook,
  languageDocumentTable,
  loadJsonFile,
  loadProject,
  migrateProjectDocument,
  parsePdoAdvancedProject,
  parseProjectDocument,
  parseUiResources,
  parseUiResourcesWithProjectPath,
  pdoSimpleDocumentTable,
  removeUiResourceOptionDocument,
  revealItemInDir,
  saveJsonFile,
  saveProject,
  saveProjectAs,
  saveTextFile,
  sdoDocumentTable,
  updateUiResourceDocument,
} from '../api/commands';
import type {
  BackendHealth,
  BatteryMonitorFrame,
  BatteryMonitorInfo,
  BatteryMonitorItem,
  BatteryMonitorSignal,
  BinaryBuildReport,
  BinaryCompareReport,
  CanTestFrame,
  CanTestSignalValue,
  FeatureModule,
  LanguageDocument,
  LanguageImportReport,
  LegacyTableKind,
  LegacyTableSpec,
  LoadedProject,
  PdoAdvancedDocument,
  PdoAdvancedFrame,
  PdoAdvancedParseReport,
  PdoAdvancedSignal,
  PdoCondition,
  PdoGlobalParam,
  PdoSimpleDocument,
  PdoSimpleFrameDocument,
  PdoSimpleImportReport,
  PdoSimpleSignalDocument,
  ProjectExportReport,
  ProjectParseReport,
  ProjectSummary,
  NavigationKey,
  SdoImportReport,
  SdoNodeDocument,
  UiImageCopyReport,
  UiResourceParseReport,
  UiResourceUpdateRequest,
} from '../types/platform';
import { UiCanvasPreview } from '../components/UiCanvasPreview';
import { cloneJson, deepEqual, isPathModified, restorePath, type JsonPath } from '../utils/projectDirty';

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

const appVersion = '0.1.0';

const advancedConfigSections = ['pdo_global_param', 'pdo_condition', 'pdo_recv', 'pdo_send'];
const recentProjectsStorageKey = 'jc-custom-platform.recentProjects';
const maxRecentProjects = 8;
const languageCodePattern = /^[a-z][a-z0-9-]*$/i;

interface RecentProject {
  path: string;
  name?: string;
  openedAt: string;
}

const modifiedSectionLabels: Record<string, string> = {
  ui_info: 'UI 资源',
  sdo_info: 'SDO 参数',
  pdo_simple_send_recv: 'PDO 简化配置',
  pdo_global_param: 'PDO 全局变量',
  pdo_condition: 'PDO 条件表',
  pdo_recv: 'PDO 接收帧',
  pdo_send: 'PDO 发送帧',
  language_info: '多国语言',
  battery_monitor_info: '锂电监控配置',
};

const trackedDocumentSections = Object.keys(modifiedSectionLabels);

type SdoNodeField = keyof Pick<SdoNodeDocument,
  'name' | 'type' | 'user_auth' | 'name_index' | 'control_protocol' | 'control_rw' | 'control_use_default' |
  'control_use_min_max' | 'handle' | 'handle_name' | 'handle_param' | 'fid' | 'mid' | 'sid' |
  'data_default' | 'data_min' | 'data_max' | 'pre_handle' | 'pre_handle_name' | 'pre_handle_scale' |
  'pre_handle_offset' | 'pre_handle_decimal' | 'pre_handle_decimal_name'
>;

function loadRecentProjects() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(recentProjectsStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item): item is RecentProject => typeof item?.path === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentProjects(projects: RecentProject[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(recentProjectsStorageKey, JSON.stringify(projects.slice(0, maxRecentProjects)));
}

function sdoNodeDocumentPath(path: number[]): JsonPath {
  return path.reduce<JsonPath>((segments, index) => [...segments, 'children', index], ['sdo_info']);
}

const previewDocument = {
  ui_info: {
    logo: {
      name: 'logo', x: 0, y: 0, w: 240, h: 80, handle: 'show', default_option: 0, dest: 'logo', option: ['image/logo.png'],
    },
    main: {
      item: {
        speed: { name: '速度表', x: 64, y: 96, w: 180, h: 120, handle: 'list', default_option: 0, dest: ['speed_0', 'speed_1'], option: [{ list: ['image/main/speed_0.png', 'image/main/speed_1.png'] }] },
        gear: { name: '档位动画', x: 300, y: 104, w: 160, h: 96, handle: 'anim', default_option: 0, dest: 'gear', option: [{ base_name: 'image/anim/gear_', start_index: 0, total: 6, reserved: 2, type: 'png' }] },
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

export function Dashboard({ activeModule, health, project, loadedProject, theme, onToggleTheme, onNavigate, onProjectLoaded }: DashboardProps) {
  const [tableSpecs, setTableSpecs] = useState<LegacyTableSpec[]>([]);
  const [uiPreview, setUiPreview] = useState<UiResourceParseReport | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [baselineDocument, setBaselineDocument] = useState<unknown | null>(null);
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
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonPopupSize, setJsonPopupSize] = useState({ w: 520, h: 420 });
  const [jsonPopupPos, setJsonPopupPos] = useState({ x: 0, y: 64 });
  const jsonPopupInitialized = useRef(false);
  const jsonPopupRef = useRef<HTMLDivElement | null>(null);
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
  const [exportOutputDir, setExportOutputDir] = useState('jc-export');
  const [exportReport, setExportReport] = useState<ProjectExportReport | null>(null);
  const [imageCopyReport, setImageCopyReport] = useState<UiImageCopyReport | null>(null);
  const [binaryReport, setBinaryReport] = useState<BinaryBuildReport | null>(null);
  const [binaryCompareReport, setBinaryCompareReport] = useState<BinaryCompareReport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pdoJumpTarget, setPdoJumpTarget] = useState<number | null>(null);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [canTestFrames, setCanTestFrames] = useState<CanTestFrame[]>([]);
  const [canTestDefaultCycle, setCanTestDefaultCycle] = useState(100);
  const [canTestStatus, setCanTestStatus] = useState<string | null>(null);
  const [isGeneratingCanTest, setIsGeneratingCanTest] = useState(false);
  const [newLanguageCode, setNewLanguageCode] = useState('');
  const [newLanguageLabel, setNewLanguageLabel] = useState('');
  const [newLanguageInnerKey, setNewLanguageInnerKey] = useState('');
  const [editingLanguageInnerKeys, setEditingLanguageInnerKeys] = useState<Record<number, string>>({});
  const [editingLanguageCodes, setEditingLanguageCodes] = useState<Record<number, string>>({});
  const [orphanLanguageKeys, setOrphanLanguageKeys] = useState<string[]>([]);
  const [languageEditorError, setLanguageEditorError] = useState<string | null>(null);
  const pdoJumpRowRef = useRef<HTMLTableRowElement | null>(null);

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
    if (activeModule.key === 'pdo-simple' && pdoJumpTarget !== null) {
      pdoJumpRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeModule.key, pdoJumpTarget]);

  useEffect(() => {
    setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2));
    setConfigEditorError(null);
  }, [activeModule.key, loadedProject?.document]);

  useEffect(() => {
    if (showJsonEditor && !jsonPopupInitialized.current) {
      setJsonPopupPos({ x: window.innerWidth - 12 - jsonPopupSize.w, y: 64 });
      jsonPopupInitialized.current = true;
    }
    if (!showJsonEditor) {
      jsonPopupInitialized.current = false;
    }
  }, [showJsonEditor]);

  function parseUiPreview(document: unknown, path?: string) {
    if (path) {
      return parseUiResourcesWithProjectPath({ project_path: path, document });
    }
    return parseUiResources(document);
  }

  function formatFrameId(value: number) {
    return `0x${Math.max(0, value).toString(16).toUpperCase()}`;
  }

  function parseFrameId(value: string) {
    const normalized = value.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]*$/i.test(normalized)) return null;
    return normalized === '' ? 0 : Number.parseInt(normalized, 16);
  }

  function updatePdoFrameId(kind: 'pdo_recv' | 'pdo_send', frameIndex: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updatePdoFrame(kind, frameIndex, 'id', nextId);
  }

  function updatePdoAdvancedFrameId(kind: 'pdo_recv' | 'pdo_send', frameIndex: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updatePdoAdvancedFrame(kind, frameIndex, 'id', nextId);
  }

  function currentConfigSection() {
    if (!loadedProject) return null;
    const document = loadedProject.document as Record<string, unknown>;
    if (activeModule.key === 'sdo') return document.sdo_info;
    if (activeModule.key === 'pdo-simple') return document.pdo_simple_send_recv;
    if (activeModule.key === 'language') return document.language_info;
    if (activeModule.key === 'battery-monitor') return document.battery_monitor_info;
    if (activeModule.key === 'pdo-advanced') {
      return Object.fromEntries(advancedConfigSections.map((section) => [section, document[section]]));
    }
    return null;
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

  function applyLoadedProject(nextProject: LoadedProject, baselineOverride?: unknown) {
    const nextBaseline = baselineOverride ?? baselineDocument;
    const nextHasChanges = nextBaseline ? !deepEqual(nextProject.document, nextBaseline) : true;
    onProjectLoaded(nextProject);
    setHasUnsavedChanges(nextHasChanges);
    setSaveStatus(nextHasChanges ? '存在未保存修改' : null);
    if (nextHasChanges) setShowSaveModal(false);
  }

  function acceptLoadedProject(nextProject: LoadedProject, fallbackPath?: string) {
    const nextPath = nextProject.summary.path ?? fallbackPath;
    const nextBaseline = cloneJson(nextProject.document);
    setBaselineDocument(nextBaseline);
    onProjectLoaded(nextProject);
    setHasUnsavedChanges(false);
    setShowSaveModal(false);
    setSaveStatus(null);
    if (nextPath) setProjectPath(nextPath);
    updateRecentProjects(nextProject, fallbackPath);
  }

  function isModifiedPath(path: JsonPath) {
    return loadedProject ? isPathModified(loadedProject.document, baselineDocument, path) : false;
  }

  function restoreModifiedPath(path: JsonPath) {
    if (!loadedProject || !baselineDocument) return;
    const document = restorePath(loadedProject.document, baselineDocument, path);
    applyLoadedProject({ ...loadedProject, document });
  }

  function restoreAllChanges() {
    if (!loadedProject || !baselineDocument) return;
    applyLoadedProject({ ...loadedProject, document: cloneJson(baselineDocument) });
  }

  function restoreCurrentConfigSection() {
    if (!loadedProject || !baselineDocument) return;
    let document = loadedProject.document;
    if (activeModule.key === 'sdo') document = restorePath(document, baselineDocument, ['sdo_info']);
    if (activeModule.key === 'pdo-simple') document = restorePath(document, baselineDocument, ['pdo_simple_send_recv']);
    if (activeModule.key === 'language') document = restorePath(document, baselineDocument, ['language_info']);
    if (activeModule.key === 'battery-monitor') document = restorePath(document, baselineDocument, ['battery_monitor_info']);
    if (activeModule.key === 'pdo-advanced') {
      for (const section of advancedConfigSections) {
        document = restorePath(document, baselineDocument, [section]);
      }
    }
    applyLoadedProject({ ...loadedProject, document });
    setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2));
  }

  function baselineLanguageDocument(): LanguageDocument | null {
    if (!baselineDocument) return null;
    return ((baselineDocument as Record<string, unknown>).language_info as LanguageDocument | undefined) ?? null;
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
    const listTranslate = Object.fromEntries(document.list_inner.slice(document.list_code_language.length).map((key) => {
      const values = { ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}) };
      const baselineValues = (baselineLanguage.list_translate[key] as Record<string, string> | undefined) ?? {};
      if (currentCode && currentCode !== baselineCode) delete values[currentCode];
      values[baselineCode] = baselineValues[baselineCode] ?? '';
      return [key, values];
    }));
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (currentCode && currentCode !== baselineCode) delete nextLabels[currentCode];
    nextLabels[baselineCode] = baselineLanguage.language_labels?.[baselineCode] ?? baselineLanguage.list_inner[index] ?? baselineCode;

    updateLanguageDocument({
      ...document,
      list_code_language: document.list_code_language.map((code, currentIndex) => (currentIndex === index ? baselineCode : code)),
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

    const currentValue = (document.list_translate[key] as Record<string, string> | undefined)?.[code] ?? '';
    const baselineValue = (baselineLanguage.list_translate[baselineKey] as Record<string, string> | undefined)?.[code] ?? '';
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
      baselineLanguage.list_translate[baselineKey]
      ?? Object.fromEntries(document.list_code_language.map((code) => [code, ''])),
    );

    updateLanguageDocument({
      ...document,
      list_inner: document.list_inner.map((item, currentIndex) => (currentIndex === index ? baselineKey : item)),
      list_translate: nextTranslate,
    });
  }

  const modifiedSections = loadedProject
    ? trackedDocumentSections.filter((section) => isModifiedPath([section]))
    : [];

  function updateProjectDocument(section: string, value: unknown) {
    if (!loadedProject) return;

    const document = { ...(loadedProject.document as Record<string, unknown>), [section]: value };
    applyLoadedProject({ ...loadedProject, document });
  }

  function updateProjectSections(sections: Record<string, unknown>) {
    if (!loadedProject) return;

    const document = { ...(loadedProject.document as Record<string, unknown>), ...sections };
    applyLoadedProject({ ...loadedProject, document });
  }

  function applyConfigEditor() {
    if (!loadedProject) return;

    try {
      const parsed = JSON.parse(configEditorText);
      const document = { ...(loadedProject.document as Record<string, unknown>) };
      if (activeModule.key === 'sdo') document.sdo_info = parsed;
      if (activeModule.key === 'pdo-simple') document.pdo_simple_send_recv = parsed;
      if (activeModule.key === 'language') document.language_info = parsed;
      if (activeModule.key === 'battery-monitor') document.battery_monitor_info = parsed;
      if (activeModule.key === 'pdo-advanced') {
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

  function batteryMonitorDocument(): BatteryMonitorInfo | null {
    if (!loadedProject) return null;
    return (loadedProject.document as Record<string, unknown>).battery_monitor_info as BatteryMonitorInfo;
  }

  function updateBatteryMonitorDocument(next: BatteryMonitorInfo) {
    updateProjectDocument('battery_monitor_info', next);
  }

  function updateBatteryMonitorField(field: keyof BatteryMonitorInfo, value: unknown) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, [field]: value });
  }

  function updateBatteryFrame(index: number, field: keyof BatteryMonitorFrame, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      frames: document.frames.map((frame, currentIndex) => (currentIndex === index ? { ...frame, [field]: value } : frame)),
    });
  }

  function updateBatteryFrameId(index: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updateBatteryFrame(index, 'can_id', nextId);
  }

  function addBatteryFrame() {
    const document = batteryMonitorDocument();
    if (!document) return;
    const index = document.frames.length;
    updateBatteryMonitorDocument({
      ...document,
      frames: [...document.frames, { frame_key: `bat_custom_${index + 1}`, can_id: 0, type: 0, desc: '新锂电帧', timeout_ticks: document.default_timeout_ticks ?? 200 }],
    });
  }

  function removeBatteryFrame(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, frames: document.frames.filter((_, currentIndex) => currentIndex !== index) });
  }

  function updateBatterySignal(index: number, field: keyof BatteryMonitorSignal, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) => (currentIndex === index ? { ...signal, [field]: value } : signal)),
    });
  }

  function addBatterySignal() {
    const document = batteryMonitorDocument();
    if (!document) return;
    const index = document.signals.length;
    updateBatteryMonitorDocument({
      ...document,
      signals: [...document.signals, { signal_key: `battery_signal_${index + 1}`, param_id: `BATTERY_MONITOR_CUSTOM_${index + 1}`, name: '新锂电信号', inner: -1, type: 0, def: '0', frame_key: document.frames[0]?.frame_key ?? '', pos: 0, len: 8, show_type: 0, handle: 0, handle_param: '' }],
    });
  }

  function removeBatterySignal(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, signals: document.signals.filter((_, currentIndex) => currentIndex !== index) });
  }

  function updateBatteryItem(index: number, field: keyof BatteryMonitorItem, value: string | number | boolean) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)),
    });
  }

  function updateBatteryItemFormatter(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) => (
        currentIndex === index ? { ...item, formatter: { ...item.formatter, [field]: value } } : item
      )),
    });
  }

  function updateBatteryItemValidity(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) => (
        currentIndex === index ? { ...item, validity: { ...item.validity, [field]: value } } : item
      )),
    });
  }

  function addBatteryItem() {
    const document = batteryMonitorDocument();
    if (!document) return;
    const index = document.items.length;
    updateBatteryMonitorDocument({
      ...document,
      items: [...document.items, { item_key: `battery_item_${index + 1}`, enabled: true, order: index, signal_key: document.signals[0]?.signal_key ?? '', name_key: '新锂电项', unit: '', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, display_base: 10 }, validity: { mode: 'frame_timeout', frame_key: document.frames[0]?.frame_key ?? '', empty_text: ' ' } }],
    });
  }

  function removeBatteryItem(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, items: document.items.filter((_, currentIndex) => currentIndex !== index) });
  }

  function generateSimplePdoTestData() {
    setGeneratingTestKey('pdo-simple');
    try {
      updatePdoSimpleDocument({
        pdo_recv: [
          {
            id: 0x181, type: 0, desc: '电机运行状态', data: [
              { pos: 0, len: 16, show_type: 0, pdo_param_index: 0, pdo_param_name: 'motor_speed' },
              { pos: 16, len: 8, show_type: 0, pdo_param_index: 1, pdo_param_name: 'motor_temp' },
              { pos: 24, len: 8, show_type: 0, pdo_param_index: 2, pdo_param_name: 'motor_status' },
            ]
          },
          {
            id: 0x182, type: 0, desc: '电池信息', data: [
              { pos: 0, len: 16, show_type: 0, pdo_param_index: 3, pdo_param_name: 'battery_voltage' },
              { pos: 16, len: 8, show_type: 0, pdo_param_index: 4, pdo_param_name: 'battery_current' },
              { pos: 24, len: 8, show_type: 0, pdo_param_index: 5, pdo_param_name: 'battery_soc' },
              { pos: 32, len: 8, show_type: 0, pdo_param_index: 6, pdo_param_name: 'battery_temp' },
            ]
          },
        ],
        pdo_send: [
          {
            id: 0x101, type: 0, desc: '控制指令', data: [
              { pos: 0, len: 8, show_type: 0, pdo_param_index: 7, pdo_param_name: 'control_cmd' },
              { pos: 8, len: 16, show_type: 0, pdo_param_index: 8, pdo_param_name: 'target_value' },
            ]
          },
          {
            id: 0x102, type: 0, desc: '参数配置', data: [
              { pos: 0, len: 16, show_type: 0, pdo_param_index: 9, pdo_param_name: 'param_value' },
              { pos: 16, len: 8, show_type: 0, pdo_param_index: 10, pdo_param_name: 'param_index' },
            ]
          },
        ],
      });
    } finally {
      setGeneratingTestKey(null);
    }
  }

  function generateAdvancedPdoTestData() {
    setGeneratingTestKey('pdo-advanced');
    try {
      updatePdoAdvancedDocument({
        pdo_global_param: [
          { param_id: '001', name: '电机转速', def: '0', reserved: 0, type: 0, inner: -1 },
          { param_id: '002', name: '电机温度', def: '25', reserved: 0, type: 0, inner: -1 },
          { param_id: '003', name: '电池电压', def: '480', reserved: 0, type: 0, inner: -1 },
          { param_id: '004', name: '电池SOC', def: '50', reserved: 0, type: 0, inner: -1 },
          { param_id: '005', name: '车速', def: '0', reserved: 0, type: 0, inner: -1 },
          { param_id: '006', name: '故障码', def: '0', reserved: 0, type: 0, inner: -1 },
        ],
        pdo_condition: [
          { param_id: '006', process: 0, data: [{ param_id: '003' }, { param_id: '004' }] },
        ],
        pdo_recv: [
          {
            id: 0x281, type: 0, desc: '电机状态帧', data: [
              { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '001' },
              { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '002' },
            ]
          },
          {
            id: 0x282, type: 0, desc: '电池状态帧', data: [
              { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '003' },
              { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '004' },
            ]
          },
        ],
        pdo_send: [
          {
            id: 0x201, type: 0, desc: '控制帧', data: [
              { pos: 0, len: 16, show_type: 0, handle: 0, handle_param: '', param_id: '005' },
              { pos: 16, len: 8, show_type: 0, handle: 0, handle_param: '', param_id: '006' },
            ]
          },
        ],
      });
    } finally {
      setGeneratingTestKey(null);
    }
  }

  function generateBatteryMonitorTestData() {
    setGeneratingTestKey('battery-monitor');
    try {
      updateBatteryMonitorDocument({
        enabled: true,
        version: 1,
        page_size: 4,
        default_timeout_ticks: 200,
        frames: [
          { frame_key: 'bat_2f0', can_id: 0x2F0, type: 0, desc: '锂电基础信息', timeout_ticks: 200 },
          { frame_key: 'bat_2f1', can_id: 0x2F1, type: 0, desc: '锂电温度信息', timeout_ticks: 200 },
          { frame_key: 'bat_2f2', can_id: 0x2F2, type: 0, desc: '锂电状态信息', timeout_ticks: 200 },
          { frame_key: 'bat_2f3', can_id: 0x2F3, type: 0, desc: '锂电故障信息', timeout_ticks: 200 },
        ],
        signals: [
          { signal_key: 'bat_total_voltage', param_id: 'BATTERY_MONITOR_TOTAL_VOLTAGE', name: '总电压', inner: -1, type: 0, def: '0', frame_key: 'bat_2f0', pos: 0, len: 16, show_type: 0 },
          { signal_key: 'bat_total_current', param_id: 'BATTERY_MONITOR_TOTAL_CURRENT', name: '总电流', inner: -1, type: 0, def: '0', frame_key: 'bat_2f0', pos: 16, len: 16, show_type: 0 },
          { signal_key: 'bat_soc', param_id: 'BATTERY_MONITOR_SOC', name: 'SOC', inner: -1, type: 0, def: '0', frame_key: 'bat_2f0', pos: 32, len: 8, show_type: 0 },
          { signal_key: 'bat_soh', param_id: 'BATTERY_MONITOR_SOH', name: 'SOH', inner: -1, type: 0, def: '0', frame_key: 'bat_2f0', pos: 40, len: 8, show_type: 0 },
          { signal_key: 'bat_remain_cap', param_id: 'BATTERY_MONITOR_REMAIN_CAP', name: '剩余容量', inner: -1, type: 0, def: '0', frame_key: 'bat_2f0', pos: 48, len: 16, show_type: 0 },
          { signal_key: 'bat_max_temp', param_id: 'BATTERY_MONITOR_MAX_TEMP', name: '最高温度', inner: -1, type: 0, def: '0', frame_key: 'bat_2f1', pos: 0, len: 8, show_type: 0 },
          { signal_key: 'bat_min_temp', param_id: 'BATTERY_MONITOR_MIN_TEMP', name: '最低温度', inner: -1, type: 0, def: '0', frame_key: 'bat_2f1', pos: 8, len: 8, show_type: 0 },
          { signal_key: 'bat_cell_avg_temp', param_id: 'BATTERY_MONITOR_AVG_TEMP', name: '平均温度', inner: -1, type: 0, def: '0', frame_key: 'bat_2f1', pos: 16, len: 8, show_type: 0 },
          { signal_key: 'bat_heat_status', param_id: 'BATTERY_MONITOR_HEAT', name: '加热状态', inner: -1, type: 0, def: '0', frame_key: 'bat_2f1', pos: 24, len: 8, show_type: 0 },
          { signal_key: 'bat_charge_status', param_id: 'BATTERY_MONITOR_CHARGE', name: '充电状态', inner: -1, type: 0, def: '0', frame_key: 'bat_2f2', pos: 0, len: 8, show_type: 0 },
          { signal_key: 'bat_discharge_status', param_id: 'BATTERY_MONITOR_DISCHARGE', name: '放电状态', inner: -1, type: 0, def: '0', frame_key: 'bat_2f2', pos: 8, len: 8, show_type: 0 },
          { signal_key: 'bat_usage_time', param_id: 'BATTERY_MONITOR_USAGE_TIME', name: '累计使用时间', inner: -1, type: 0, def: '0', frame_key: 'bat_2f2', pos: 16, len: 32, show_type: 0 },
          { signal_key: 'bat_error_code', param_id: 'BATTERY_MONITOR_ERROR', name: '故障码', inner: -1, type: 0, def: '0', frame_key: 'bat_2f3', pos: 0, len: 8, show_type: 0 },
          { signal_key: 'bat_error_detail', param_id: 'BATTERY_MONITOR_ERROR_DETAIL', name: '故障详情', inner: -1, type: 0, def: '0', frame_key: 'bat_2f3', pos: 8, len: 24, show_type: 0 },
        ],
        items: [
          { item_key: 'bat_voltage_item', enabled: true, order: 0, signal_key: 'bat_total_voltage', name_key: '锂电总电压', unit: 'V', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 10, decimals: 1 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f0', empty_text: ' ' } },
          { item_key: 'bat_current_item', enabled: true, order: 1, signal_key: 'bat_total_current', name_key: '锂电总电流', unit: 'A', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 10, decimals: 1 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f0', empty_text: ' ' } },
          { item_key: 'bat_soc_item', enabled: true, order: 2, signal_key: 'bat_soc', name_key: '锂电 SOC', unit: '%', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 1, decimals: 0 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f0', empty_text: ' ' } },
          { item_key: 'bat_soh_item', enabled: true, order: 3, signal_key: 'bat_soh', name_key: '锂电 SOH', unit: '%', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 1, decimals: 0 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f0', empty_text: ' ' } },
          { item_key: 'bat_remain_cap_item', enabled: true, order: 4, signal_key: 'bat_remain_cap', name_key: '剩余容量', unit: 'AH', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 100, decimals: 2 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f0', empty_text: ' ' } },
          { item_key: 'bat_max_temp_item', enabled: true, order: 5, signal_key: 'bat_max_temp', name_key: '最高温度', unit: '℃', formatter: { kind: 'linear', offset: -40, scale_num: 1, scale_den: 1, decimals: 0 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f1', empty_text: ' ' } },
          { item_key: 'bat_min_temp_item', enabled: true, order: 6, signal_key: 'bat_min_temp', name_key: '最低温度', unit: '℃', formatter: { kind: 'linear', offset: -40, scale_num: 1, scale_den: 1, decimals: 0 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f1', empty_text: ' ' } },
          { item_key: 'bat_avg_temp_item', enabled: true, order: 7, signal_key: 'bat_cell_avg_temp', name_key: '平均温度', unit: '℃', formatter: { kind: 'linear', offset: -40, scale_num: 1, scale_den: 1, decimals: 0 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f1', empty_text: ' ' } },
          { item_key: 'bat_heat_item', enabled: true, order: 8, signal_key: 'bat_heat_status', name_key: '加热状态', unit: '', formatter: { kind: 'bool_text', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, true_text: '加热中', false_text: '关闭' }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f1', empty_text: ' ' } },
          { item_key: 'bat_charge_item', enabled: true, order: 9, signal_key: 'bat_charge_status', name_key: '充电状态', unit: '', formatter: { kind: 'bool_text', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, true_text: '充电中', false_text: '未充电' }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f2', empty_text: ' ' } },
          { item_key: 'bat_discharge_item', enabled: true, order: 10, signal_key: 'bat_discharge_status', name_key: '放电状态', unit: '', formatter: { kind: 'bool_text', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, true_text: '放电中', false_text: '停止' }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f2', empty_text: ' ' } },
          { item_key: 'bat_usage_time_item', enabled: true, order: 11, signal_key: 'bat_usage_time', name_key: '累计使用时间', unit: 'H', formatter: { kind: 'packed_time_0p1h', offset: 0, scale_num: 1, scale_den: 1, decimals: 1 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f2', empty_text: ' ' } },
          { item_key: 'bat_error_item', enabled: true, order: 12, signal_key: 'bat_error_code', name_key: '故障码', unit: '', formatter: { kind: 'hex', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, display_base: 16 }, validity: { mode: 'frame_timeout', frame_key: 'bat_2f3', empty_text: ' ' } },
        ],
      });
    } finally {
      setGeneratingTestKey(null);
    }
  }

  async function handleGenerateCanTest() {
    if (!loadedProject) {
      setCanTestStatus('请先打开 .jcpro 项目。');
      return;
    }
    setIsGeneratingCanTest(true);
    setCanTestStatus(null);
    try {
      const result = await generateCanTestData(loadedProject.document);
      const frames = result.frames.map((f) => ({ ...f, cycleMs: canTestDefaultCycle }));
      setCanTestFrames(frames);
      setCanTestStatus(`已生成 ${result.frameCount} 个 CAN 帧`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingCanTest(false);
    }
  }

  function updateCanTestFrame(index: number, field: keyof CanTestFrame, value: number | string) {
    setCanTestFrames((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  function computeHexFromSignals(signals: CanTestSignalValue[], dlc: number): string {
    const bytes = new Uint8Array(dlc);
    for (const sig of signals) {
      let value = sig.rawValue >>> 0;
      let bitPos = sig.pos;
      let bitsRem = sig.len;
      while (bitsRem > 0) {
        const byteIdx = Math.floor(bitPos / 8);
        if (byteIdx >= dlc) break;
        const bitOff = bitPos % 8;
        const bitsThis = Math.min(8 - bitOff, bitsRem);
        bytes[byteIdx] |= (value & ((1 << bitsThis) - 1)) << bitOff;
        value >>>= bitsThis;
        bitPos += bitsThis;
        bitsRem -= bitsThis;
      }
    }
    return Array.from(bytes).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  }

  function updateCanTestSignalDisplayValue(frameIndex: number, signalIndex: number, displayValue: number) {
    setCanTestFrames((prev) => prev.map((frame, fi) => {
      if (fi !== frameIndex) return frame;
      const newSignals = frame.signals.map((sig, si) => {
        if (si !== signalIndex) return sig;
        const rawValue = Math.round((displayValue - sig.offset) * sig.scaleDen / sig.scaleNum);
        return { ...sig, displayValue, rawValue: Math.max(0, rawValue) };
      });
      const newData = computeHexFromSignals(newSignals, frame.dlc);
      return { ...frame, signals: newSignals, data: newData };
    }));
  }

  function fillCanTestSignals(mode: 'min' | 'max' | 'random' | 'zero' | 'ff') {
    setCanTestFrames((prev) => prev.map((frame) => {
      const newSignals = frame.signals.map((sig) => {
        let rawValue: number;
        if (mode === 'zero' || mode === 'min') {
          rawValue = 0;
        } else if (mode === 'ff' || mode === 'max') {
          rawValue = 0xFFFFFFFF >>> (32 - sig.len);
        } else {
          const maxRaw = 0xFFFFFFFF >>> (32 - sig.len);
          rawValue = Math.floor(Math.random() * (maxRaw + 1));
        }
        const displayValue = rawValue * sig.scaleNum / sig.scaleDen + sig.offset;
        return { ...sig, rawValue, displayValue };
      });
      const newData = computeHexFromSignals(newSignals, frame.dlc);
      return { ...frame, signals: newSignals, data: newData };
    }));
    const labels: Record<string, string> = { zero: '全部清零', min: '填充最小值', max: '填充最大值', random: '填充随机值', ff: '全填 FF' };
    setCanTestStatus(`已${labels[mode]}`);
  }

  async function handleExportCanTestTxt() {
    if (!loadedProject || canTestFrames.length === 0) {
      setCanTestStatus('请先生成测试数据。');
      return;
    }
    const selected = await open({
      filters: [{ name: '文本文件', extensions: ['txt'] }],
    });
    if (typeof selected !== 'string') return;

    const lines: string[] = [
      '# CAN Test Data',
      `# Generated: ${new Date().toISOString()}`,
      `# Source: ${loadedProject.summary.name || 'unknown'}`,
      '# ---',
      '# CAN_ID, TYPE, NAME, DLC, CYCLE_MS, DATA_HEX',
    ];
    for (const frame of canTestFrames) {
      const idStr = `0x${frame.id.toString(16).toUpperCase()}`;
      lines.push(`${idStr}, ${frame.frameType}, ${frame.name}, ${frame.dlc}, ${frame.cycleMs}, ${frame.data}`);
      for (const sig of frame.signals) {
        lines.push(`#   ${sig.name} = ${sig.displayValue} ${sig.unit} (raw=${sig.rawValue}, pos=${sig.pos}, len=${sig.len})`);
      }
    }

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(`已导出：${selected}`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleExportCanTestConfig() {
    if (canTestFrames.length === 0) {
      setCanTestStatus('请先生成测试数据。');
      return;
    }
    const selected = await open({
      filters: [{ name: 'CAN 测试配置文件', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      await saveJsonFile(selected, {
        version: 1,
        defaultCycleMs: canTestDefaultCycle,
        frames: canTestFrames,
      });
      setCanTestStatus(`已导出配置：${selected}`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleImportCanTestConfig() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'CAN 测试配置文件', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      const config = await loadJsonFile(selected) as { version?: number; defaultCycleMs?: number; frames?: CanTestFrame[] };
      if (!config.frames || !Array.isArray(config.frames)) {
        setCanTestStatus('配置文件中没有有效的帧数据。');
        return;
      }
      setCanTestFrames(config.frames);
      if (config.defaultCycleMs) setCanTestDefaultCycle(config.defaultCycleMs);
      setCanTestStatus(`已导入 ${config.frames.length} 个 CAN 帧`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function updateLanguageDocument(next: LanguageDocument) {
    updateProjectDocument('language_info', next);
  }

  function inferredLanguageLabels(document: LanguageDocument) {
    return Object.fromEntries(document.list_code_language.map((code, index) => [
      code,
      document.language_labels?.[code]?.trim() || document.list_inner[index] || `语言_${code}`,
    ]));
  }

  function languageConfigLabel(document: LanguageDocument, code: string) {
    return inferredLanguageLabels(document)[code] || `语言_${code}`;
  }

  function normalizeLanguageDocument(document: LanguageDocument, codes: string[], labels = inferredLanguageLabels(document)): LanguageDocument {
    const documentWithLabels = { ...document, language_labels: labels };
    const configKeys = codes.map((code) => languageConfigLabel(documentWithLabels, code));
    const existingConfigKeySet = new Set(document.list_code_language.map((code) => languageConfigLabel(document, code)));
    const customKeys = document.list_inner.filter((key, index) => index >= document.list_code_language.length || !existingConfigKeySet.has(key));
    const listInner = [...configKeys, ...customKeys.filter((key) => !configKeys.includes(key))];
    const listTranslate = { ...document.list_translate };
    for (const key of configKeys) delete listTranslate[key];

    return { ...document, list_code_language: codes, list_inner: listInner, list_translate: listTranslate, language_labels: labels };
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
    updateLanguageDocument(normalizeLanguageDocument(document, document.list_code_language, nextLabels));
  }

  function findOrphanLanguageKeys(document: LanguageDocument) {
    const innerKeySet = new Set(document.list_inner);
    return Object.keys(document.list_translate).filter((key) => !innerKeySet.has(key));
  }

  function validateLanguageCode(code: string, codes: string[], currentIndex?: number) {
    const normalizedCode = code.trim();
    if (!normalizedCode) return '语言代码不能为空。';
    if (!languageCodePattern.test(normalizedCode)) return '语言代码只能使用字母、数字和连字符，并且必须以字母开头。';
    if (codes.some((item, index) => item.toLowerCase() === normalizedCode.toLowerCase() && index !== currentIndex)) return `语言代码 ${normalizedCode} 已存在。`;
    return null;
  }

  function validateLanguageInnerKey(key: string, keys: string[], currentIndex?: number) {
    const normalizedKey = key.trim();
    if (!normalizedKey) return '语言内部键不能为空。';
    if (keys.some((item, index) => item === normalizedKey && index !== currentIndex)) return `语言内部键 ${normalizedKey} 已存在。`;
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
    const nextCodes = document.list_code_language.map((code, currentIndex) => (currentIndex === index ? nextCode : code));
    const nextLabels = { ...(document.language_labels ?? {}) };
    if (previousCode !== nextCode) {
      nextLabels[nextCode] = nextLabels[previousCode] ?? languageConfigLabel(document, previousCode);
      delete nextLabels[previousCode];
    }
    const nextTranslate = Object.fromEntries(document.list_inner.slice(document.list_code_language.length).map((key) => {
      const values = { ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}) };
      if (previousCode !== nextCode) {
        values[nextCode] = values[previousCode] ?? '';
        delete values[previousCode];
      }
      return [key, values];
    }));

    updateLanguageDocument(normalizeLanguageDocument({ ...document, list_translate: nextTranslate }, nextCodes, nextLabels));
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

    const nextTranslate = Object.fromEntries(document.list_inner.slice(document.list_code_language.length).map((key) => {
      const values = { ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}) };
      values[nextCode] = '';
      return [key, values];
    }));

    const nextLabels = { ...(document.language_labels ?? {}), [nextCode]: nextLabel };
    setLanguageEditorError(null);
    setNewLanguageCode('');
    setNewLanguageLabel('');
    updateLanguageDocument(normalizeLanguageDocument({ ...document, list_translate: nextTranslate }, [...document.list_code_language, nextCode], nextLabels));
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

    const nextTranslate = Object.fromEntries(document.list_inner.slice(document.list_code_language.length).map((key) => {
      const values = { ...((document.list_translate[key] as Record<string, string> | undefined) ?? {}) };
      delete values[removedCode];
      return [key, values];
    }));

    const nextLabels = { ...(document.language_labels ?? {}) };
    delete nextLabels[removedCode];
    setLanguageEditorError(null);
    updateLanguageDocument(normalizeLanguageDocument(
      { ...document, list_translate: nextTranslate },
      document.list_code_language.filter((_, currentIndex) => currentIndex !== index),
      nextLabels,
    ));
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
    setLanguageEditorError(keys.length > 0 ? `发现 ${keys.length} 个无主翻译条目。` : '未发现无主翻译条目。');
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
    const nextKeys = document.list_inner.map((key, currentIndex) => (currentIndex === index ? nextKey : key));
    const nextTranslate = { ...document.list_translate };
    nextTranslate[nextKey] = nextTranslate[previousKey] ?? Object.fromEntries(document.list_code_language.map((code) => [code, '']));
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

  function pdoSimpleDocument(): PdoSimpleDocument | null {
    if (!loadedProject) return null;
    return (loadedProject.document as Record<string, unknown>).pdo_simple_send_recv as PdoSimpleDocument;
  }

  function updatePdoSimpleDocument(next: PdoSimpleDocument) {
    updateProjectDocument('pdo_simple_send_recv', next);
  }

  function pdoFrames(kind: 'pdo_recv' | 'pdo_send') {
    return pdoSimpleDocument()?.[kind] ?? [];
  }

  function updatePdoFrame(kind: 'pdo_recv' | 'pdo_send', index: number, field: keyof PdoSimpleFrameDocument, value: string | number) {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: document[kind].map((frame, currentIndex) => (currentIndex === index ? { ...frame, [field]: value } : frame)),
    });
  }

  function addPdoFrame(kind: 'pdo_recv' | 'pdo_send') {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: [...document[kind], { id: 0, type: 0, desc: '', data: [] }],
    });
  }

  function removePdoFrame(kind: 'pdo_recv' | 'pdo_send', index: number) {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: document[kind].filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updatePdoSignal(
    kind: 'pdo_recv' | 'pdo_send',
    frameIndex: number,
    signalIndex: number,
    field: keyof PdoSimpleSignalDocument,
    value: string | number,
  ) {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => {
        if (currentFrameIndex !== frameIndex) return frame;
        return {
          ...frame,
          data: frame.data.map((signal, currentSignalIndex) => (
            currentSignalIndex === signalIndex ? { ...signal, [field]: value } : signal
          )),
        };
      }),
    });
  }

  function addPdoSignal(kind: 'pdo_recv' | 'pdo_send', frameIndex: number) {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => {
        if (currentFrameIndex !== frameIndex) return frame;
        return {
          ...frame,
          data: [...frame.data, { pos: 0, len: 1, show_type: 0, pdo_param_index: 0, pdo_param_name: '' }],
        };
      }),
    });
  }

  function removePdoSignal(kind: 'pdo_recv' | 'pdo_send', frameIndex: number, signalIndex: number) {
    const document = pdoSimpleDocument();
    if (!document) return;

    updatePdoSimpleDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => {
        if (currentFrameIndex !== frameIndex) return frame;
        return { ...frame, data: frame.data.filter((_, currentSignalIndex) => currentSignalIndex !== signalIndex) };
      }),
    });
  }

  function sdoDocument(): SdoNodeDocument | null {
    if (!loadedProject) return null;
    return (loadedProject.document as Record<string, unknown>).sdo_info as SdoNodeDocument;
  }

  function updateSdoDocument(next: SdoNodeDocument) {
    updateProjectDocument('sdo_info', next);
  }

  function updateSdoNodeAtPath(node: SdoNodeDocument, path: number[], updater: (node: SdoNodeDocument) => SdoNodeDocument): SdoNodeDocument {
    if (path.length === 0) return updater(node);
    const [index, ...rest] = path;
    return {
      ...node,
      children: (node.children ?? []).map((child, currentIndex) => (
        currentIndex === index ? updateSdoNodeAtPath(child, rest, updater) : child
      )),
    };
  }

  function updateSdoNode(path: number[], field: SdoNodeField, value: string | number) {
    const document = sdoDocument();
    if (!document) return;

    updateSdoDocument(updateSdoNodeAtPath(document, path, (node) => ({ ...node, [field]: value })));
  }

  function addSdoChild(path: number[]) {
    const document = sdoDocument();
    if (!document) return;

    const child: SdoNodeDocument = { type: 0, user_auth: 0, name_index: 0, name: '新节点', children: [] };
    updateSdoDocument(updateSdoNodeAtPath(document, path, (node) => ({ ...node, children: [...(node.children ?? []), child] })));
  }

  function removeSdoNode(path: number[]) {
    const document = sdoDocument();
    if (!document || path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const removeIndex = path[path.length - 1];
    updateSdoDocument(updateSdoNodeAtPath(document, parentPath, (node) => ({
      ...node,
      children: (node.children ?? []).filter((_, currentIndex) => currentIndex !== removeIndex),
    })));
  }

  function renderSdoNode(node: SdoNodeDocument, path: number[] = []) {
    const documentPath = sdoNodeDocumentPath(path);
    const isModified = isModifiedPath(documentPath);
    return (
      <article className={isModified ? 'sdo-node-card config-entry-modified' : 'sdo-node-card'} key={path.join('.') || 'root'}>
        <div className="sdo-node-header">
          <strong>{path.length === 0 ? '根节点' : `层级 ${path.join('.')}`} — {node.name || '未命名'}</strong>
          <div>
            {isModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(documentPath)} type="button">恢复节点</button> : null}
            <button onClick={() => addSdoChild(path)} type="button">新增子节点</button>
            {path.length > 0 ? <button onClick={() => removeSdoNode(path)} type="button">删除节点</button> : null}
          </div>
        </div>
        <div className="sdo-node-grid">
          <label>名称<input value={node.name ?? ''} onChange={(event) => updateSdoNode(path, 'name', event.target.value)} /></label>
          <label>类型<input type="number" value={node.type ?? 0} onChange={(event) => updateSdoNode(path, 'type', Number(event.target.value))} /></label>
          <label>权限<input type="number" value={node.user_auth ?? 0} onChange={(event) => updateSdoNode(path, 'user_auth', Number(event.target.value))} /></label>
          <label>语言索引<input type="number" value={node.name_index ?? 0} onChange={(event) => updateSdoNode(path, 'name_index', Number(event.target.value))} /></label>
        </div>
        <div className="sdo-node-grid">
          <label>协议<input type="number" value={node.control_protocol ?? 0} onChange={(event) => updateSdoNode(path, 'control_protocol', Number(event.target.value))} /></label>
          <label>读写<input type="number" value={node.control_rw ?? 0} onChange={(event) => updateSdoNode(path, 'control_rw', Number(event.target.value))} /></label>
          <label>使用默认值<input type="number" value={node.control_use_default ?? 0} onChange={(event) => updateSdoNode(path, 'control_use_default', Number(event.target.value))} /></label>
          <label>使用范围<input type="number" value={node.control_use_min_max ?? 0} onChange={(event) => updateSdoNode(path, 'control_use_min_max', Number(event.target.value))} /></label>
          <label>FID<input type="number" value={node.fid ?? 0} onChange={(event) => updateSdoNode(path, 'fid', Number(event.target.value))} /></label>
          <label>MID<input type="number" value={node.mid ?? 0} onChange={(event) => updateSdoNode(path, 'mid', Number(event.target.value))} /></label>
          <label>SID<input type="number" value={node.sid ?? 0} onChange={(event) => updateSdoNode(path, 'sid', Number(event.target.value))} /></label>
        </div>
        <div className="sdo-node-grid">
          <label>句柄<input type="number" value={node.handle ?? 0} onChange={(event) => updateSdoNode(path, 'handle', Number(event.target.value))} /></label>
          <label>句柄名<input value={node.handle_name ?? ''} onChange={(event) => updateSdoNode(path, 'handle_name', event.target.value)} /></label>
          <label>句柄参数<input value={node.handle_param ?? ''} onChange={(event) => updateSdoNode(path, 'handle_param', event.target.value)} /></label>
        </div>
        <div className="sdo-node-grid">
          <label>默认值<input value={node.data_default ?? ''} onChange={(event) => updateSdoNode(path, 'data_default', event.target.value)} /></label>
          <label>最小值<input value={node.data_min ?? ''} onChange={(event) => updateSdoNode(path, 'data_min', event.target.value)} /></label>
          <label>最大值<input value={node.data_max ?? ''} onChange={(event) => updateSdoNode(path, 'data_max', event.target.value)} /></label>
        </div>
        <div className="sdo-node-grid">
          <label>预处理<input type="number" value={node.pre_handle ?? 0} onChange={(event) => updateSdoNode(path, 'pre_handle', Number(event.target.value))} /></label>
          <label>预处理名<input value={node.pre_handle_name ?? ''} onChange={(event) => updateSdoNode(path, 'pre_handle_name', event.target.value)} /></label>
          <label>缩放<input value={node.pre_handle_scale ?? ''} onChange={(event) => updateSdoNode(path, 'pre_handle_scale', event.target.value)} /></label>
          <label>偏移<input value={node.pre_handle_offset ?? ''} onChange={(event) => updateSdoNode(path, 'pre_handle_offset', event.target.value)} /></label>
          <label>小数位<input type="number" value={node.pre_handle_decimal ?? 0} onChange={(event) => updateSdoNode(path, 'pre_handle_decimal', Number(event.target.value))} /></label>
          <label>小数位名<input value={node.pre_handle_decimal_name ?? ''} onChange={(event) => updateSdoNode(path, 'pre_handle_decimal_name', event.target.value)} /></label>
        </div>
        {(node.children ?? []).length > 0 ? (
          <div className="sdo-children">
            {(node.children ?? []).map((child, index) => renderSdoNode(child, [...path, index]))}
          </div>
        ) : null}
      </article>
    );
  }

  function pdoAdvancedDocument(): PdoAdvancedDocument | null {
    if (!loadedProject) return null;
    const document = loadedProject.document as Record<string, unknown>;
    return {
      pdo_global_param: (document.pdo_global_param as PdoGlobalParam[] | undefined) ?? [],
      pdo_condition: (document.pdo_condition as PdoCondition[] | undefined) ?? [],
      pdo_recv: (document.pdo_recv as PdoAdvancedFrame[] | undefined) ?? [],
      pdo_send: (document.pdo_send as PdoAdvancedFrame[] | undefined) ?? [],
    };
  }

  function updatePdoAdvancedDocument(next: PdoAdvancedDocument) {
    updateProjectSections(next as unknown as Record<string, unknown>);
  }

  function updatePdoGlobalParam(index: number, field: keyof PdoGlobalParam, value: string | number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_global_param: document.pdo_global_param.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)),
    });
  }

  function addPdoGlobalParam() {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_global_param: [...document.pdo_global_param, { param_id: '', name: '新全局变量', def: '0', reserved: 0, type: 0, inner: 0 }],
    });
  }

  function removePdoGlobalParam(index: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_global_param: document.pdo_global_param.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updatePdoCondition(index: number, field: keyof PdoCondition, value: string | number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_condition: document.pdo_condition.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)),
    });
  }

  function addPdoCondition() {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({ ...document, pdo_condition: [...document.pdo_condition, { param_id: '', process: 0, data: [] }] });
  }

  function removePdoCondition(index: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({ ...document, pdo_condition: document.pdo_condition.filter((_, currentIndex) => currentIndex !== index) });
  }

  function updatePdoConditionInput(conditionIndex: number, inputIndex: number, value: string) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_condition: document.pdo_condition.map((condition, currentIndex) => {
        if (currentIndex !== conditionIndex) return condition;
        return { ...condition, data: condition.data.map((item, currentInputIndex) => (currentInputIndex === inputIndex ? { param_id: value } : item)) };
      }),
    });
  }

  function addPdoConditionInput(conditionIndex: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_condition: document.pdo_condition.map((condition, currentIndex) => (
        currentIndex === conditionIndex ? { ...condition, data: [...condition.data, { param_id: '' }] } : condition
      )),
    });
  }

  function removePdoConditionInput(conditionIndex: number, inputIndex: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      pdo_condition: document.pdo_condition.map((condition, currentIndex) => (
        currentIndex === conditionIndex ? { ...condition, data: condition.data.filter((_, currentInputIndex) => currentInputIndex !== inputIndex) } : condition
      )),
    });
  }

  function updatePdoAdvancedFrame(kind: 'pdo_recv' | 'pdo_send', index: number, field: keyof PdoAdvancedFrame, value: string | number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({ ...document, [kind]: document[kind].map((frame, currentIndex) => (currentIndex === index ? { ...frame, [field]: value } : frame)) });
  }

  function addPdoAdvancedFrame(kind: 'pdo_recv' | 'pdo_send') {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({ ...document, [kind]: [...document[kind], { id: 0, type: 0, desc: '', data: [] }] });
  }

  function removePdoAdvancedFrame(kind: 'pdo_recv' | 'pdo_send', index: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({ ...document, [kind]: document[kind].filter((_, currentIndex) => currentIndex !== index) });
  }

  function updatePdoAdvancedSignal(
    kind: 'pdo_recv' | 'pdo_send',
    frameIndex: number,
    signalIndex: number,
    field: keyof PdoAdvancedSignal,
    value: string | number,
  ) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => {
        if (currentFrameIndex !== frameIndex) return frame;
        return {
          ...frame,
          data: frame.data.map((signal, currentSignalIndex) => (currentSignalIndex === signalIndex ? { ...signal, [field]: value } : signal)),
        };
      }),
    });
  }

  function addPdoAdvancedSignal(kind: 'pdo_recv' | 'pdo_send', frameIndex: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => (
        currentFrameIndex === frameIndex ? { ...frame, data: [...frame.data, { pos: 0, len: 1, show_type: 0, handle: 0, handle_param: '', param_id: '' }] } : frame
      )),
    });
  }

  function removePdoAdvancedSignal(kind: 'pdo_recv' | 'pdo_send', frameIndex: number, signalIndex: number) {
    const document = pdoAdvancedDocument();
    if (!document) return;
    updatePdoAdvancedDocument({
      ...document,
      [kind]: document[kind].map((frame, currentFrameIndex) => (
        currentFrameIndex === frameIndex ? { ...frame, data: frame.data.filter((_, currentSignalIndex) => currentSignalIndex !== signalIndex) } : frame
      )),
    });
  }

  async function handleCreateProject() {
    setOpenError(null);

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
      acceptLoadedProject(nextProject, selected);
      const nextPreview = await parseUiPreview(nextProject.document, nextProject.summary.path ?? selected);
      setUiPreview(nextPreview);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleOpenProject(path = projectPath) {
    setIsOpening(true);
    setOpenError(null);

    try {
      const nextProject = await loadProject(path);
      acceptLoadedProject(nextProject, path);
      void parseUiPreview(nextProject.document, nextProject.summary.path ?? path).then(setUiPreview);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  }

  async function handleSelectProjectFile() {
    setOpenError(null);

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
        await handleOpenProject(selected);
      }
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error));
    }
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

  async function confirmSaveProject() {
    if (!loadedProject?.summary.path) return;

    setSavingProjectAction('save');
    setSaveStatus(null);

    try {
      const savedProject = await saveProject({
        path: loadedProject.summary.path,
        document: loadedProject.document,
      });
      const nextBaseline = cloneJson(savedProject.document);
      setBaselineDocument(nextBaseline);
      applyLoadedProject(savedProject, nextBaseline);
      updateRecentProjects(savedProject, loadedProject.summary.path);
      setShowSaveModal(false);
      setSaveStatus('已保存');
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

    const currentName = sourcePath.split(/[\\/]/).pop() || `${loadedProject.summary.name || 'project'}.jcpro`;
    const selected = await save({
      defaultPath: currentName,
      filters: [{ name: '项目文件', extensions: ['jcpro'] }],
    });
    if (!selected) return;

    if (selected === sourcePath) {
      setSaveStatus('另存为目标不能与当前项目路径相同。');
      return;
    }

    setSavingProjectAction('saveAs');

    try {
      const report = await saveProjectAs({
        source_path: sourcePath,
        target_path: selected,
        document: loadedProject.document,
      });
      acceptLoadedProject(report.project, selected);
      const nextPreview = await parseUiPreview(report.project.document, report.project.summary.path ?? selected);
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
      const document = (loadedProject.document as Record<string, unknown>)[tableConfigSections[kind]];
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

  async function importTableConfig(kind: TableConfigKind, path: string, isCsv: boolean): Promise<TableImportReport> {
    if (kind === 'sdo') return isCsv ? importSdoCsv({ path }) : importSdoWorkbook({ path });
    if (kind === 'pdoSimple') return isCsv ? importPdoSimpleCsv({ path }) : importPdoSimpleWorkbook({ path });
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
      const report = await addUiResourceOptionDocument({ document: loadedProject.document, key, sources });
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
      const report = await removeUiResourceOptionDocument({ document: loadedProject.document, key, option_index: optionIndex });
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

  function handleJsonResizeStart(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = jsonPopupSize.w;
    const startH = jsonPopupSize.h;

    function onMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const newW = Math.max(360, Math.min(startW + dx, window.innerWidth - jsonPopupPos.x - 12));
      const newH = Math.max(240, Math.min(startH + dy, window.innerHeight - jsonPopupPos.y - 12));
      setJsonPopupSize({ w: newW, h: newH });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleJsonDragStart(event: React.MouseEvent) {
    if ((event.target as HTMLElement).tagName === 'BUTTON') return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPos = { ...jsonPopupPos };

    function onMouseMove(moveEvent: MouseEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setJsonPopupPos({
        x: Math.max(0, Math.min(startPos.x + dx, window.innerWidth - jsonPopupSize.w)),
        y: Math.max(0, Math.min(startPos.y + dy, window.innerHeight - 60)),
      });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleJumpToPdo(pdoParamIndex: number) {
    setPdoJumpTarget(pdoParamIndex);
    onNavigate('pdo-simple');
  }

  async function handleCopyUiImages() {
    setExportError(null);
    setImageCopyReport(null);

    try {
      const report = await copyUiResourceImages({
        project_path: loadedProject?.summary.path,
        output_dir: exportOutputDir,
        document: loadedProject?.document ?? previewDocument,
      });
      setImageCopyReport(report);
      if (!report.valid) {
        setExportError(report.errors.join('；') || 'UI 图片复制存在问题');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleBuildBinaryReport() {
    setExportError(null);
    setBinaryCompareReport(null);

    try {
      const report = await buildProjectBinaryReport(loadedProject?.document ?? previewDocument);
      setBinaryReport(report);
      if (!report.valid) {
        setExportError(report.errors.join('；') || '二进制构建报告存在问题');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCompareBinary() {
    setExportError(null);
    setBinaryCompareReport(null);

    if (!isTauriRuntime()) {
      setExportError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '设备二进制', extensions: ['bin'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      const report = await compareProjectBinaryReport({
        document: loadedProject?.document ?? previewDocument,
        legacy_binary_path: selected,
      });
      setBinaryCompareReport(report);
      setBinaryReport(report.build);
      if (!report.valid || !report.same) {
        setExportError(report.errors.join('；') || '新旧二进制不一致');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSelectExportDir() {
    setExportError(null);

    if (!isTauriRuntime()) {
      setExportError('系统目录选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setExportOutputDir(selected);
    }
  }

  async function handleExportPackage() {
    setIsExporting(true);
    setExportError(null);
    setExportReport(null);

    try {
      const report = await exportProjectPackage({
        project_path: loadedProject?.summary.path,
        output_dir: exportOutputDir,
        document: loadedProject?.document ?? previewDocument,
      });
      setExportReport(report);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenExportDir(dirPath: string) {
    try {
      await revealItemInDir(dirPath);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  }

  const currentSdoDocument = sdoDocument();
  const currentPdoSimpleDocument = pdoSimpleDocument();
  const currentPdoAdvancedDocument = pdoAdvancedDocument();
  const currentLanguageDocument = languageDocument();
  const currentBatteryMonitorDocument = batteryMonitorDocument();

  return (
    <main className="workspace">
      {loadedProject ? (
        <div className="action-bar">
          <div className="action-bar-left">
            <span className="action-bar-project">{loadedProject.summary.name || '未命名项目'}</span>
            <span className={`action-bar-dot ${hasUnsavedChanges ? 'action-bar-dot--dirty' : 'action-bar-dot--clean'}`} />
            {modifiedSections.length > 0 ? (
              <div className="action-bar-pills">
                {modifiedSections.map((section) => (
                  <button className="action-bar-pill" key={section} onClick={() => restoreModifiedPath([section])} type="button" title={`恢复 ${modifiedSectionLabels[section] ?? section}`}>
                    {modifiedSectionLabels[section] ?? section}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="action-bar-right">
            {(['sdo', 'pdo-simple', 'language'] as string[]).includes(activeModule.key) ? (
              <>
                <button
                  className="action-bar-btn action-bar-btn--secondary"
                  disabled={!loadedProject || isImportingTable}
                  onClick={() => void handleImportTableConfig(activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind)}
                  type="button"
                  title="从 CSV/XLS/XLSX/XML 文件导入"
                >
                  <span className="action-bar-icon">↓</span>
                  {isImportingTable ? '导入中...' : '导入'}
                </button>
                <button
                  className="action-bar-btn action-bar-btn--ghost"
                  disabled={!loadedProject || isExportingTable}
                  onClick={() => void handleExportTableConfig(activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind, 'csv')}
                  type="button"
                  title="导出为 CSV 格式"
                >
                  CSV
                </button>
                <button
                  className="action-bar-btn action-bar-btn--ghost"
                  disabled={!loadedProject || isExportingTable}
                  onClick={() => void handleExportTableConfig(activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind, 'xml')}
                  type="button"
                  title="导出为 Excel XML 格式"
                >
                  Excel
                </button>
                <span className="action-bar-sep" />
              </>
            ) : null}
            {(['pdo-simple', 'pdo-advanced', 'battery-monitor'] as string[]).includes(activeModule.key) ? (
              <button
                className="action-bar-btn action-bar-btn--secondary"
                disabled={!loadedProject || generatingTestKey !== null}
                onClick={() => {
                  if (activeModule.key === 'pdo-simple') generateSimplePdoTestData();
                  else if (activeModule.key === 'pdo-advanced') generateAdvancedPdoTestData();
                  else if (activeModule.key === 'battery-monitor') generateBatteryMonitorTestData();
                }}
                type="button"
                title="自动构建当前页面的 CAN 测试数据"
              >
                <span className="action-bar-icon">⚡</span>
                {generatingTestKey === activeModule.key ? '生成中...' : '生成测试数据'}
              </button>
            ) : null}
            {(['sdo', 'pdo-simple', 'pdo-advanced', 'battery-monitor', 'language'] as string[]).includes(activeModule.key) ? (
              <>
                <button
                  className={`action-bar-btn ${showJsonEditor ? 'action-bar-btn--secondary' : 'action-bar-btn--ghost'}`}
                  disabled={!loadedProject}
                  onClick={() => setShowJsonEditor((v) => !v)}
                  type="button"
                  title="打开 JSON 编辑器"
                >
                  {'{ }'}
                </button>
                <span className="action-bar-sep" />
              </>
            ) : null}
            {hasUnsavedChanges ? (
              <button
                className="action-bar-btn action-bar-btn--ghost"
                disabled={isSavingProject}
                onClick={restoreAllChanges}
                type="button"
                title="恢复所有未保存修改"
              >
                ↩ 恢复
              </button>
            ) : null}
            {activeModule.key === 'ui' ? (
              <>
                <button
                  className={`action-bar-btn ${showCanvasLabels ? 'action-bar-btn--secondary' : 'action-bar-btn--ghost'}`}
                  onClick={() => setShowCanvasLabels((v) => !v)}
                  title={showCanvasLabels ? '隐藏画布上的资源文字标注' : '显示画布上的资源文字标注'}
                  type="button"
                >
                  {showCanvasLabels ? '隐藏标注' : '显示标注'}
                </button>
                <span className="action-bar-sep" />
              </>
            ) : null}
            <button
              className="action-bar-btn action-bar-btn--ghost"
              disabled={!loadedProject?.summary.path || isSavingProject}
              onClick={() => void handleSaveProjectAs()}
              type="button"
            >
              {savingProjectAction === 'saveAs' ? '另存中...' : '另存为...'}
            </button>
            <button
              className="action-bar-btn action-bar-btn--save"
              disabled={!hasUnsavedChanges || !loadedProject.summary.path || isSavingProject}
              onClick={requestSaveProject}
              type="button"
            >
              {savingProjectAction === 'save' ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      ) : null}

      {showSaveModal && loadedProject ? (
        <div className="modal-overlay" onClick={cancelSaveProject}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>确认保存</h3>
            <p>将当前所有配置修改写入项目文件：</p>
            <div className="modal-path">{loadedProject.summary.path}</div>
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
              <button className="modal-btn-cancel" disabled={isSavingProject} onClick={cancelSaveProject} type="button">取消</button>
              <button className="modal-btn-confirm" disabled={isSavingProject} onClick={() => void confirmSaveProject()} type="button">
                {savingProjectAction === 'save' ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showJsonEditor && loadedProject ? (
        <div
          className="json-popup"
          ref={jsonPopupRef}
          style={{ left: jsonPopupPos.x, top: jsonPopupPos.y, width: jsonPopupSize.w, height: jsonPopupSize.h }}
        >
          <div className="json-popup-header" onMouseDown={handleJsonDragStart}>
            <strong>JSON 编辑器</strong>
            <div className="json-popup-actions">
              <button className="lang-btn" disabled={!loadedProject} onClick={() => setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2))} type="button">格式化</button>
              <button className="lang-btn" disabled={!loadedProject || !baselineDocument} onClick={restoreCurrentConfigSection} type="button">恢复段落</button>
              <button className="lang-btn lang-btn--primary" disabled={!loadedProject} onClick={applyConfigEditor} type="button">应用</button>
              <button className="lang-btn lang-btn--icon" onClick={() => setShowJsonEditor(false)} type="button" title="关闭">×</button>
            </div>
          </div>
          <textarea
            className="json-popup-editor"
            disabled={!loadedProject}
            onChange={(event) => setConfigEditorText(event.target.value)}
            value={configEditorText}
          />
          {configEditorError ? <p className="json-popup-error">{configEditorError}</p> : null}
          <div className="json-popup-resize-handle" onMouseDown={handleJsonResizeStart} />
        </div>
      ) : null}

      {showJsonEditor && loadedProject ? (
        <div className="json-active-banner">
          <span>JSON 编辑器已打开，配置项编辑已锁定</span>
          <button onClick={() => setShowJsonEditor(false)} type="button">关闭编辑器</button>
        </div>
      ) : null}

      <div className={showJsonEditor && loadedProject ? 'workspace-json-active' : undefined}>
        {activeModule.key === 'project' ? (
          <section className="project-page">
            {/* Open project */}
            <div className="project-section">
              <div className="project-open-row">
                <input
                  className="project-open-input"
                  placeholder="输入或粘贴 .jcpro 文件路径"
                  value={projectPath}
                  onChange={(event) => setProjectPath(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void handleOpenProject(); }}
                />
                <button className="project-open-btn" type="button" onClick={() => void handleSelectProjectFile()} disabled={isOpening}>
                  {isOpening ? '打开中...' : '浏览'}
                </button>
                <button className="project-open-btn project-open-btn--secondary" type="button" onClick={() => void handleOpenProject()} disabled={isOpening || projectPath.trim() === ''}>
                  打开
                </button>
              </div>
              {openError ? <p className="project-open-error">{openError}</p> : null}
            </div>

            {/* Recent projects */}
            {recentProjects.length > 0 ? (
              <div className="project-section">
                <div className="project-section-header">
                  <strong>最近项目</strong>
                  <button className="project-link-btn" disabled={recentProjects.length === 0} onClick={clearRecentProjects} type="button">清空</button>
                </div>
                <div className="project-recent-list">
                  {recentProjects.map((item) => (
                    <button className="project-recent-item" key={item.path} disabled={isOpening} onClick={() => void handleOpenProject(item.path)} type="button">
                      <span className="project-recent-name">{item.name || '未命名'}</span>
                      <span className="project-recent-path">{item.path}</span>
                    </button>
                  ))}
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
                  className="project-create-name"
                  placeholder="项目名称"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                />
                <div className="project-create-bottom">
                  <div className="project-create-resolution">
                    <span className="project-create-label">分辨率</span>
                    <input
                      className="project-create-num"
                      min="1"
                      type="number"
                      value={newResolutionW}
                      onChange={(event) => setNewResolutionW(Number(event.target.value))}
                    />
                    <span className="project-create-x">×</span>
                    <input
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
                    <button className="project-link-btn" disabled={isOpening} onClick={() => void handleParseProject()} type="button">解析</button>
                    <button className="project-link-btn" disabled={isOpening} onClick={() => void handleMigrateProject()} type="button">补齐结构</button>
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
                    <strong className={loadedProject.validation.valid ? 'text-success' : 'text-danger'}>
                      {loadedProject.validation.valid ? '通过' : '缺少段落'}
                    </strong>
                  </div>
                </div>
                {loadedProject.validation.missing_sections.length > 0 ? (
                  <p className="project-open-error">缺少：{loadedProject.validation.missing_sections.join('、')}</p>
                ) : null}
                {loadedProject.validation.warnings.length > 0 ? (
                  <p className="project-open-warning">警告：{loadedProject.validation.warnings.join('；')}</p>
                ) : null}
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
                    <strong className={projectParseReport.valid ? 'text-success' : 'text-danger'}>{projectParseReport.valid ? '是' : '否'}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>补齐段落</span>
                    <strong>{projectParseReport.added_sections.length}</strong>
                  </div>
                  <div className="project-info-item">
                    <span>错误</span>
                    <strong className={projectParseReport.errors.length > 0 ? 'text-danger' : undefined}>{projectParseReport.errors.length}</strong>
                  </div>
                </div>
                {projectParseReport.errors.length > 0 ? <p className="project-open-error">{projectParseReport.errors.join('；')}</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {(['sdo', 'pdoSimple', 'language'] as TableConfigKind[]).includes(activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind) ? (
          <section className="table-spec-card">
            <div>
              <h2>{tableConfigTitles[activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind]}</h2>
              <p>导入/导出操作请使用顶部工具栏按钮。支持 CSV、XLS、XLSX、XML 格式。</p>
            </div>
            {tableSpecs
              .filter((spec) => spec.kind === (activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key))
              .map((spec) => (
                <div className="table-format-ref" key={spec.kind}>
                  <strong>表头格式（{spec.headers.length} 列）</strong>
                  <div className="table-format-chips">
                    {spec.headers.map((header) => (
                      <span className="table-format-chip" key={header}>{header}</span>
                    ))}
                  </div>
                </div>
              ))}
            {tableImportError ? <p className="project-open-error">{tableImportError}</p> : null}
            {tableImportReport ? (
              <div className="table-io-result">
                <div className="table-io-result-row">
                  <span>导入校验</span>
                  <strong className={tableImportReport.valid ? 'text-success' : 'text-danger'}>{tableImportReport.valid ? '通过' : '存在问题'}</strong>
                </div>
                <div className="table-io-result-row">
                  <span>表头列数</span>
                  <strong>{tableImportReport.table.actual_headers.length}</strong>
                </div>
                <div className="table-io-result-row">
                  <span>写回段落</span>
                  <strong>{tableConfigSections[activeModule.key === 'pdo-simple' ? 'pdoSimple' : activeModule.key as TableConfigKind]}</strong>
                </div>
              </div>
            ) : null}
            {tableExportStatus ? <p className="config-helper-text">{tableExportStatus}</p> : null}
          </section>
        ) : null}

        {activeModule.key === 'sdo' ? (
          <section className="table-spec-card">
            <div>
              <h2>SDO 参数树</h2>
              <p>维护 SDO 菜单树、权限、CAN Open 参数、数据范围和预处理字段，修改后直接写回 sdo_info。</p>
            </div>
            {currentSdoDocument ? (
              <>
                <div className="config-summary-strip">
                  <article>
                    <span>根节点</span>
                    <strong>{currentSdoDocument.name}</strong>
                  </article>
                  <article>
                    <span>直接子节点</span>
                    <strong>{currentSdoDocument.children?.length ?? 0}</strong>
                  </article>
                  <article>
                    <span>写回段落</span>
                    <strong>sdo_info</strong>
                  </article>
                </div>
                <p className="config-helper-text">每个节点按基础信息、通信控制、数据范围和预处理字段分组展示；新增/删除会立即同步到内存项目文档。</p>
                <div className="sdo-tree-editor">{renderSdoNode(currentSdoDocument)}</div>
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'pdo-simple' ? (
          <section className="table-spec-card">
            <div>
              <h2>PDO 简化配置</h2>
              <p>维护接收表和发送表中的 CAN 帧、显示变量名、读取方式、位置和长度，修改后直接写回 pdo_simple_send_recv。</p>
            </div>
            {currentPdoSimpleDocument ? (
              <div className="pdo-simple-editor">
                <div className="config-summary-strip">
                  <article>
                    <span>接收帧</span>
                    <strong>{currentPdoSimpleDocument.pdo_recv.length}</strong>
                  </article>
                  <article>
                    <span>发送帧</span>
                    <strong>{currentPdoSimpleDocument.pdo_send.length}</strong>
                  </article>
                  <article>
                    <span>写回段落</span>
                    <strong>pdo_simple_send_recv</strong>
                  </article>
                </div>
                <p className="config-helper-text">帧信息在卡片顶部维护，帧 ID 以 16 进制显示和编辑；位置和长度沿用 bit/byte 数值含义。</p>
                {pdoJumpTarget !== null ? <p className="config-helper-text">来自 UI 资源跳转的 PDO 参数索引：{pdoJumpTarget}</p> : null}
                {(['pdo_recv', 'pdo_send'] as const).map((kind) => (
                  <section className="pdo-frame-section" key={kind}>
                    <div className="config-table-toolbar">
                      <strong>{kind === 'pdo_recv' ? '接收表' : '发送表'}（{pdoFrames(kind).length} 帧）</strong>
                      <button onClick={() => addPdoFrame(kind)} type="button">新增帧</button>
                    </div>
                    {pdoFrames(kind).map((frame, frameIndex) => {
                      const framePath: JsonPath = ['pdo_simple_send_recv', kind, frameIndex];
                      const frameModified = isModifiedPath(framePath);
                      return (
                        <article className={frameModified ? 'pdo-frame-card config-entry-modified' : 'pdo-frame-card'} key={`${kind}-${frameIndex}`}>
                          <div className="pdo-frame-grid">
                            <label>
                              帧 ID
                              <input inputMode="text" value={formatFrameId(frame.id)} onChange={(event) => updatePdoFrameId(kind, frameIndex, event.target.value)} />
                            </label>
                            <label>
                              帧类型
                              <select value={frame.type} onChange={(event) => updatePdoFrame(kind, frameIndex, 'type', Number(event.target.value))}>
                                <option value={0}>标准帧</option>
                                <option value={1}>扩展帧</option>
                              </select>
                            </label>
                            <label>
                              描述
                              <input value={frame.desc} onChange={(event) => updatePdoFrame(kind, frameIndex, 'desc', event.target.value)} />
                            </label>
                          </div>
                          <div className="pdo-frame-actions">
                            {frameModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(framePath)} type="button">恢复帧</button> : null}
                            <button onClick={() => removePdoFrame(kind, frameIndex)} type="button">删除帧</button>
                          </div>
                          <div className="config-table-toolbar">
                            <span>数据项（{frame.data.length}）</span>
                            <button onClick={() => addPdoSignal(kind, frameIndex)} type="button">新增数据项</button>
                          </div>
                          <div className="config-table-frame">
                            <table className="config-table">
                              <thead>
                                <tr>
                                  <th>变量名</th>
                                  <th>读取方式</th>
                                  <th>位置</th>
                                  <th>长度</th>
                                  <th>参数索引</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {frame.data.map((signal, signalIndex) => {
                                  const signalPath: JsonPath = ['pdo_simple_send_recv', kind, frameIndex, 'data', signalIndex];
                                  const signalModified = isModifiedPath(signalPath);
                                  const isJumpTarget = pdoJumpTarget === signal.pdo_param_index;
                                  return (
                                    <tr
                                      className={[isJumpTarget ? 'pdo-row-highlight' : '', signalModified ? 'config-entry-modified' : ''].filter(Boolean).join(' ') || undefined}
                                      key={`${kind}-${frameIndex}-${signalIndex}`}
                                      ref={isJumpTarget ? (element) => { pdoJumpRowRef.current = element; } : undefined}
                                    >
                                      <td><input value={signal.pdo_param_name ?? ''} onChange={(event) => updatePdoSignal(kind, frameIndex, signalIndex, 'pdo_param_name', event.target.value)} /></td>
                                      <td>
                                        <select value={signal.show_type} onChange={(event) => updatePdoSignal(kind, frameIndex, signalIndex, 'show_type', Number(event.target.value))}>
                                          <option value={0}>按字节</option>
                                          <option value={1}>按位</option>
                                          <option value={2}>按字符串</option>
                                        </select>
                                      </td>
                                      <td><input type="number" value={signal.pos} onChange={(event) => updatePdoSignal(kind, frameIndex, signalIndex, 'pos', Number(event.target.value))} /></td>
                                      <td><input type="number" value={signal.len} onChange={(event) => updatePdoSignal(kind, frameIndex, signalIndex, 'len', Number(event.target.value))} /></td>
                                      <td><input type="number" value={signal.pdo_param_index} onChange={(event) => updatePdoSignal(kind, frameIndex, signalIndex, 'pdo_param_index', Number(event.target.value))} /></td>
                                      <td>
                                        {signalModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(signalPath)} type="button">恢复</button> : null}
                                        <button onClick={() => removePdoSignal(kind, frameIndex, signalIndex)} type="button">删除</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'battery-monitor' ? (
          <section className="table-spec-card">
            <h2>锂电监控配置</h2>
            {currentBatteryMonitorDocument ? (
              <div className="pdo-simple-editor battery-monitor-editor">
                <div className="config-summary-strip">
                  <article><span>状态</span><strong>{currentBatteryMonitorDocument.enabled ? '启用' : '停用'}</strong></article>
                  <article><span>帧 / 信号</span><strong>{currentBatteryMonitorDocument.frames.length} / {currentBatteryMonitorDocument.signals.length}</strong></article>
                  <article><span>显示项</span><strong>{currentBatteryMonitorDocument.items.filter((item) => item.enabled).length} / {currentBatteryMonitorDocument.items.length}</strong></article>
                  <article><span>写回段落</span><strong>battery_monitor_info</strong></article>
                </div>
                <div className="battery-config-row">
                  <label>启用<select value={currentBatteryMonitorDocument.enabled ? 1 : 0} onChange={(event) => updateBatteryMonitorField('enabled', Number(event.target.value) === 1)}><option value={1}>启用</option><option value={0}>停用</option></select></label>
                  <label>版本<input type="number" value={currentBatteryMonitorDocument.version ?? 1} onChange={(event) => updateBatteryMonitorField('version', Number(event.target.value))} /></label>
                  <label>每页数量<input type="number" value={currentBatteryMonitorDocument.page_size ?? 4} onChange={(event) => updateBatteryMonitorField('page_size', Number(event.target.value))} /></label>
                  <label>默认超时 tick<input type="number" value={currentBatteryMonitorDocument.default_timeout_ticks ?? 200} onChange={(event) => updateBatteryMonitorField('default_timeout_ticks', Number(event.target.value))} /></label>
                </div>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>锂电 CAN 帧（{currentBatteryMonitorDocument.frames.length}）</strong><button onClick={addBatteryFrame} type="button">新增帧</button></div>
                  {currentBatteryMonitorDocument.frames.map((frame, frameIndex) => (
                    <article className={isModifiedPath(['battery_monitor_info', 'frames', frameIndex]) ? 'pdo-frame-card battery-frame-card config-entry-modified' : 'pdo-frame-card battery-frame-card'} key={`${frame.frame_key}-${frameIndex}`}>
                      <div className="battery-frame-grid">
                        <label>帧 key<input value={frame.frame_key} onChange={(event) => updateBatteryFrame(frameIndex, 'frame_key', event.target.value)} /></label>
                        <label>帧 ID<input inputMode="text" value={formatFrameId(frame.can_id)} onChange={(event) => updateBatteryFrameId(frameIndex, event.target.value)} /></label>
                        <label>帧类型<select value={frame.type} onChange={(event) => updateBatteryFrame(frameIndex, 'type', Number(event.target.value))}><option value={0}>标准帧</option><option value={1}>扩展帧</option></select></label>
                        <label>超时 tick<input type="number" value={frame.timeout_ticks ?? currentBatteryMonitorDocument.default_timeout_ticks} onChange={(event) => updateBatteryFrame(frameIndex, 'timeout_ticks', Number(event.target.value))} /></label>
                        <label>描述<input value={frame.desc ?? ''} onChange={(event) => updateBatteryFrame(frameIndex, 'desc', event.target.value)} /></label>
                      </div>
                      <div className="battery-frame-actions">
                        {isModifiedPath(['battery_monitor_info', 'frames', frameIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_monitor_info', 'frames', frameIndex])} type="button">恢复帧</button> : null}
                        <button onClick={() => removeBatteryFrame(frameIndex)} type="button">删除帧</button>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>锂电信号（{currentBatteryMonitorDocument.signals.length}）</strong><button onClick={addBatterySignal} type="button">新增信号</button></div>
                  <div className="config-table-frame"><table className="config-table"><thead><tr><th>key</th><th>参数ID</th><th>名称</th><th>内部变量</th><th>类型</th><th>帧</th><th>位置</th><th>长度</th><th>取数</th><th>操作</th></tr></thead><tbody>
                    {currentBatteryMonitorDocument.signals.map((signal, signalIndex) => (
                      <tr className={isModifiedPath(['battery_monitor_info', 'signals', signalIndex]) ? 'config-entry-modified' : undefined} key={`${signal.signal_key}-${signalIndex}`}>
                        <td><input value={signal.signal_key} onChange={(event) => updateBatterySignal(signalIndex, 'signal_key', event.target.value)} /></td>
                        <td><input value={signal.param_id} onChange={(event) => updateBatterySignal(signalIndex, 'param_id', event.target.value)} /></td>
                        <td><input value={signal.name} onChange={(event) => updateBatterySignal(signalIndex, 'name', event.target.value)} /></td>
                        <td><input type="number" value={signal.inner} onChange={(event) => updateBatterySignal(signalIndex, 'inner', Number(event.target.value))} /></td>
                        <td><input type="number" value={signal.type} onChange={(event) => updateBatterySignal(signalIndex, 'type', Number(event.target.value))} /></td>
                        <td><select value={signal.frame_key} onChange={(event) => updateBatterySignal(signalIndex, 'frame_key', event.target.value)}>{currentBatteryMonitorDocument.frames.map((frame) => <option key={frame.frame_key} value={frame.frame_key}>{frame.frame_key}</option>)}</select></td>
                        <td><input type="number" value={signal.pos} onChange={(event) => updateBatterySignal(signalIndex, 'pos', Number(event.target.value))} /></td>
                        <td><input type="number" value={signal.len} onChange={(event) => updateBatterySignal(signalIndex, 'len', Number(event.target.value))} /></td>
                        <td><input type="number" value={signal.show_type} onChange={(event) => updateBatterySignal(signalIndex, 'show_type', Number(event.target.value))} /></td>
                        <td>{isModifiedPath(['battery_monitor_info', 'signals', signalIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_monitor_info', 'signals', signalIndex])} type="button">恢复</button> : null}<button onClick={() => removeBatterySignal(signalIndex)} type="button">删除</button></td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>显示项（{currentBatteryMonitorDocument.items.length}）</strong><button onClick={addBatteryItem} type="button">新增显示项</button></div>
                  <div className="config-table-frame"><table className="config-table"><thead><tr><th>启用</th><th>顺序</th><th>key</th><th>信号</th><th>名称key</th><th>单位</th><th>格式</th><th>偏移</th><th>缩放</th><th>小数</th><th>有效帧</th><th>操作</th></tr></thead><tbody>
                    {currentBatteryMonitorDocument.items.map((item, itemIndex) => (
                      <tr className={isModifiedPath(['battery_monitor_info', 'items', itemIndex]) ? 'config-entry-modified' : undefined} key={`${item.item_key}-${itemIndex}`}>
                        <td><input checked={item.enabled} type="checkbox" onChange={(event) => updateBatteryItem(itemIndex, 'enabled', event.target.checked)} /></td>
                        <td><input type="number" value={item.order} onChange={(event) => updateBatteryItem(itemIndex, 'order', Number(event.target.value))} /></td>
                        <td><input value={item.item_key} onChange={(event) => updateBatteryItem(itemIndex, 'item_key', event.target.value)} /></td>
                        <td><select value={item.signal_key} onChange={(event) => updateBatteryItem(itemIndex, 'signal_key', event.target.value)}>{currentBatteryMonitorDocument.signals.map((signal) => <option key={signal.signal_key} value={signal.signal_key}>{signal.signal_key}</option>)}</select></td>
                        <td><input value={item.name_key} onChange={(event) => updateBatteryItem(itemIndex, 'name_key', event.target.value)} /></td>
                        <td><input value={item.unit} onChange={(event) => updateBatteryItem(itemIndex, 'unit', event.target.value)} /></td>
                        <td><select value={item.formatter?.kind ?? 'linear'} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'kind', event.target.value)}><option value="linear">线性</option><option value="bool_text">布尔文本</option><option value="hex">十六进制</option><option value="packed_time_0p1h">0.1H时间</option></select></td>
                        <td><input type="number" value={item.formatter?.offset ?? 0} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'offset', Number(event.target.value))} /></td>
                        <td><input type="number" value={item.formatter?.scale_num ?? 1} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'scale_num', Number(event.target.value))} />/<input type="number" value={item.formatter?.scale_den ?? 1} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'scale_den', Number(event.target.value))} /></td>
                        <td><input type="number" value={item.formatter?.decimals ?? 0} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'decimals', Number(event.target.value))} /></td>
                        <td><select value={item.validity?.frame_key ?? ''} onChange={(event) => updateBatteryItemValidity(itemIndex, 'frame_key', event.target.value)}>{currentBatteryMonitorDocument.frames.map((frame) => <option key={frame.frame_key} value={frame.frame_key}>{frame.frame_key}</option>)}</select></td>
                        <td>{isModifiedPath(['battery_monitor_info', 'items', itemIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_monitor_info', 'items', itemIndex])} type="button">恢复</button> : null}<button onClick={() => removeBatteryItem(itemIndex)} type="button">删除</button></td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </section>
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'can-test-data' ? (
          <section className="table-spec-card">
            <div>
              <h2>CAN 测试数据构建</h2>
              <p>从当前项目 PDO/锂电配置中提取 CAN 帧，生成测试数据并导出为 TXT 文件。</p>
            </div>
            {loadedProject ? (
              <div className="pdo-simple-editor">
                <div className="config-summary-strip">
                  <article><span>已生成帧</span><strong>{canTestFrames.length}</strong></article>
                  <article><span>默认周期</span><strong>{canTestDefaultCycle} ms</strong></article>
                </div>
                <div className="pdo-frame-grid">
                  <label>默认周期(ms)<input type="number" value={canTestDefaultCycle} onChange={(e) => setCanTestDefaultCycle(Number(e.target.value))} /></label>
                </div>
                <div className="config-table-toolbar" style={{ gap: 8 }}>
                  <button disabled={isGeneratingCanTest} onClick={() => void handleGenerateCanTest()} type="button">
                    {isGeneratingCanTest ? '生成中...' : '⚡ 生成'}
                  </button>
                  <button disabled={canTestFrames.length === 0} onClick={() => void handleExportCanTestTxt()} type="button">📤 导出 TXT</button>
                  <span className="action-bar-sep" />
                  <button onClick={() => void handleImportCanTestConfig()} type="button">📥 导入配置</button>
                  <button disabled={canTestFrames.length === 0} onClick={() => void handleExportCanTestConfig()} type="button">📤 导出配置</button>
                </div>
                {canTestFrames.length > 0 ? (
                  <>
                    <div className="config-table-toolbar" style={{ gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>信号填充：</span>
                      <button onClick={() => fillCanTestSignals('min')} type="button" title="所有信号填最小值 0">最小值</button>
                      <button onClick={() => fillCanTestSignals('max')} type="button" title="所有信号填最大值（对应位宽全 1）">最大值</button>
                      <button onClick={() => fillCanTestSignals('random')} type="button" title="所有信号填随机值">随机值</button>
                      <span className="action-bar-sep" />
                      <button onClick={() => fillCanTestSignals('zero')} type="button" title="所有信号填 0">清零</button>
                      <button onClick={() => fillCanTestSignals('ff')} type="button" title="所有信号原始值填 FF">全 FF</button>
                    </div>
                    {canTestFrames.map((frame, frameIndex) => (
                      <section className="pdo-frame-section" key={`${frame.id}-${frameIndex}`}>
                        <div className="pdo-frame-card">
                          <div className="pdo-frame-grid">
                            <label>CAN ID<code style={{ fontSize: '1.1em' }}>0x{frame.id.toString(16).toUpperCase().padStart(3, '0')}</code></label>
                            <label>类型<span>{frame.frameType === 0 ? '标准帧' : '扩展帧'}</span></label>
                            <label>名称<input value={frame.name} onChange={(e) => updateCanTestFrame(frameIndex, 'name', e.target.value)} /></label>
                            <label>DLC<span>{frame.dlc}</span></label>
                            <label>周期(ms)<input type="number" style={{ width: 80 }} value={frame.cycleMs} onChange={(e) => updateCanTestFrame(frameIndex, 'cycleMs', Number(e.target.value))} /></label>
                            <label>HEX<code style={{ fontSize: '0.85em' }}>{frame.data}</code></label>
                          </div>
                        </div>
                        {frame.signals.length > 0 ? (
                          <div className="config-table-frame" style={{ marginTop: 6 }}>
                            <table className="config-table">
                              <thead>
                                <tr>
                                  <th>信号名称</th>
                                  <th>值</th>
                                  <th>单位</th>
                                  <th>位置</th>
                                  <th>长度</th>
                                  <th>缩放</th>
                                  <th>偏移</th>
                                  <th>原始值</th>
                                </tr>
                              </thead>
                              <tbody>
                                {frame.signals.map((sig, sigIndex) => (
                                  <tr key={`${sig.name}-${sigIndex}`}>
                                    <td>{sig.name}</td>
                                    <td>
                                      <input
                                        type="number"
                                        step={sig.scaleDen > 1 ? 1 / sig.scaleDen : 'any'}
                                        style={{ width: 90 }}
                                        value={sig.displayValue}
                                        onChange={(e) => updateCanTestSignalDisplayValue(frameIndex, sigIndex, Number(e.target.value))}
                                      />
                                    </td>
                                    <td>{sig.unit}</td>
                                    <td>{sig.pos}</td>
                                    <td>{sig.len}</td>
                                    <td>{sig.scaleNum}/{sig.scaleDen}</td>
                                    <td>{sig.offset}</td>
                                    <td><code>0x{sig.rawValue.toString(16).toUpperCase()}</code></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </>
                ) : canTestStatus && canTestStatus.startsWith('已生成') ? null : (
                  <div className="empty-state"><div className="empty-state-icon">📂</div><p>点击「⚡ 生成」从项目配置中构建 CAN 测试数据</p></div>
                )}
                {canTestStatus ? <p className={canTestStatus.startsWith('已') ? 'text-success' : 'project-open-error'} style={{ marginTop: 8 }}>{canTestStatus}</p> : null}
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'language' ? (
          <section className="table-spec-card">
            <div>
              <h2>多语言配置</h2>
              <p>管理语言代码和翻译内容，修改后写回 language_info。</p>
            </div>
            {currentLanguageDocument ? (
              <>
                <div className="config-summary-strip">
                  <article>
                    <span>语言</span>
                    <strong>{currentLanguageDocument.list_code_language.length}</strong>
                  </article>
                  <article>
                    <span>翻译键</span>
                    <strong>{currentLanguageDocument.list_inner.length - currentLanguageDocument.list_code_language.length}</strong>
                  </article>
                  <article>
                    <span>总条目</span>
                    <strong>{currentLanguageDocument.list_inner.length}</strong>
                  </article>
                </div>

                <strong className="lang-section-title">语言列</strong>
                <div className="lang-code-list">
                  <div className="lang-code-header">
                    <span>代码</span>
                    <span>代码值</span>
                    <span>显示名</span>
                    <span />
                  </div>
                  {currentLanguageDocument.list_code_language.map((code, index) => {
                    const codePath: JsonPath = ['language_info', 'list_code_language', index];
                    const labelPath: JsonPath = ['language_info', 'language_labels', code];
                    const codeModified = isModifiedPath(codePath);
                    const labelModified = isModifiedPath(labelPath) || isModifiedPath(['language_info', 'list_inner', index]);
                    return (
                      <div className={`lang-code-row ${code === 'zh' ? 'lang-code-row--zh' : ''} ${codeModified || labelModified ? 'config-entry-modified' : ''}`} key={`${code}-${index}`}>
                        <div className="lang-code-cell lang-code-cell--badge">
                          <span className={`lang-code-badge ${code === 'zh' ? 'lang-code-badge--zh' : ''}`}>{code}</span>
                        </div>
                        <div className="lang-code-cell">
                          <input
                            className={`lang-code-input ${editingLanguageCodes[index] !== undefined ? 'config-field-modified' : ''}`}
                            disabled={code === 'zh'}
                            onBlur={() => applyLanguageCodeDraft(index)}
                            onChange={(event) => setLanguageCodeDraft(index, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') applyLanguageCodeDraft(index);
                              if (event.key === 'Escape') clearLanguageCodeDraft(index);
                            }}
                            value={editingLanguageCodes[index] ?? code}
                          />
                        </div>
                        <div className="lang-code-cell">
                          <input className="lang-code-input" value={languageConfigLabel(currentLanguageDocument, code)} onChange={(event) => updateLanguageLabel(index, event.target.value)} />
                        </div>
                        <div className="lang-code-cell lang-code-cell--actions">
                          {codeModified ? <button className="lang-btn lang-btn--icon lang-btn--restore" onClick={() => restoreLanguageCode(index)} type="button" title="恢复">↩</button> : null}
                          <button className="lang-btn lang-btn--icon lang-btn--danger" disabled={code === 'zh' || currentLanguageDocument.list_code_language.length <= 1} onClick={() => removeLanguageCode(index)} type="button" title="删除">×</button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="lang-code-row lang-code-row--add">
                    <div className="lang-code-cell lang-code-cell--badge">
                      <span className="lang-code-badge lang-code-badge--placeholder">+</span>
                    </div>
                    <div className="lang-code-cell">
                      <input
                        className="lang-code-input"
                        onChange={(event) => setNewLanguageCode(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') addLanguageCode(); }}
                        placeholder="语言代码，如 en"
                        value={newLanguageCode}
                      />
                    </div>
                    <div className="lang-code-cell">
                      <input
                        className="lang-code-input"
                        onChange={(event) => setNewLanguageLabel(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') addLanguageCode(); }}
                        placeholder="显示名，如 英文"
                        value={newLanguageLabel}
                      />
                    </div>
                    <div className="lang-code-cell lang-code-cell--actions">
                      <button
                        className="lang-btn lang-btn--primary"
                        disabled={!loadedProject || newLanguageCode.trim() === '' || newLanguageLabel.trim() === ''}
                        onClick={addLanguageCode}
                        type="button"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>

                {languageEditorError ? <p className="project-open-error">{languageEditorError}</p> : null}
                {orphanLanguageKeys.length > 0 ? <p className="project-open-warning">无主翻译：{orphanLanguageKeys.join('、')}</p> : null}

                <strong className="lang-section-title">翻译内容</strong>
                <div className="lang-filter-bar">
                  <input
                    className="lang-filter-input"
                    onChange={(event) => setNewLanguageInnerKey(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') addLanguageKey(); }}
                    placeholder="新增翻译键，如 用户设置"
                    value={newLanguageInnerKey}
                  />
                  <button
                    className="lang-btn lang-btn--primary"
                    disabled={!loadedProject || newLanguageInnerKey.trim() === ''}
                    onClick={addLanguageKey}
                    type="button"
                  >
                    添加键
                  </button>
                  <span className="action-bar-sep" />
                  <button className="lang-btn lang-btn--ghost" disabled={!loadedProject} onClick={syncLanguageConfigKeys} type="button" title="同步开头的语言名称配置段">同步配置键</button>
                  <button className="lang-btn lang-btn--ghost" disabled={!loadedProject} onClick={checkOrphanLanguageTranslations} type="button" title="检查无主翻译条目">检查无主</button>
                  <button className="lang-btn lang-btn--ghost" disabled={!loadedProject} onClick={cleanupOrphanLanguageTranslations} type="button" title="清理无主翻译条目">清理无主</button>
                </div>

                <div className="config-table-frame">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>翻译键</th>
                        {currentLanguageDocument.list_code_language.map((code) => <th key={code}>{languageConfigLabel(currentLanguageDocument, code)}</th>)}
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentLanguageDocument.list_inner.length === 0 ? (
                        <tr><td colSpan={currentLanguageDocument.list_code_language.length + 2} className="lang-table-empty">暂无翻译条目，请添加翻译键</td></tr>
                      ) : null}
                      {currentLanguageDocument.list_inner.map((key, index) => {
                        const keyPath: JsonPath = ['language_info', 'list_inner', index];
                        const rowPath: JsonPath = ['language_info', 'list_translate', key];
                        const isConfigKey = index < currentLanguageDocument.list_code_language.length;
                        const keyDraft = editingLanguageInnerKeys[index] ?? key;
                        const keyDraftModified = keyDraft !== key;
                        const keyModified = isModifiedPath(keyPath) || keyDraftModified;
                        const rowModified = keyModified || isModifiedPath(rowPath);
                        return (
                          <tr className={rowModified ? 'config-entry-modified' : undefined} key={`${key}-${index}`}>
                            <td>
                              <input
                                className={`lang-table-key-cell ${isConfigKey ? 'lang-table-key-cell--config' : ''} ${keyModified ? 'config-field-modified' : ''}`}
                                disabled={isConfigKey}
                                onBlur={() => updateLanguageKey(index, keyDraft)}
                                onChange={(event) => setLanguageInnerKeyDraft(index, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') updateLanguageKey(index, keyDraft);
                                  if (event.key === 'Escape') clearLanguageInnerKeyDraft(index);
                                }}
                                value={keyDraft}
                              />
                            </td>
                            {currentLanguageDocument.list_code_language.map((code) => (
                              <td key={`${key}-${code}`}>
                                <input
                                  className={isLanguageValueModified(index, key, code) ? 'config-field-modified' : undefined}
                                  value={String((currentLanguageDocument.list_translate[key] as Record<string, string> | undefined)?.[code] ?? '')}
                                  onChange={(event) => updateLanguageValue(key, code, event.target.value)}
                                />
                              </td>
                            ))}
                            <td>
                              <div className="lang-table-op">
                                {rowModified && !isConfigKey ? <button className="lang-btn lang-btn--icon lang-btn--restore" onClick={() => restoreLanguageKey(index, key)} type="button" title="恢复">↩</button> : null}
                                <button className="lang-btn lang-btn--icon lang-btn--danger" disabled={isConfigKey} onClick={() => removeLanguageKey(index)} type="button" title="删除">×</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'pdo-advanced' ? (
          <section className="table-spec-card">
            <div>
              <h2>PDO 高级配置</h2>
              <p>维护全局变量、条件表、PDO 接收帧和发送帧，修改后直接写回 pdo_global_param、pdo_condition、pdo_recv 和 pdo_send。</p>
            </div>
            {currentPdoAdvancedDocument ? (
              <div className="pdo-advanced-editor">
                <div className="config-summary-strip">
                  <article>
                    <span>全局变量</span>
                    <strong>{currentPdoAdvancedDocument.pdo_global_param.length}</strong>
                  </article>
                  <article>
                    <span>条件表</span>
                    <strong>{currentPdoAdvancedDocument.pdo_condition.length}</strong>
                  </article>
                  <article>
                    <span>接收 / 发送帧</span>
                    <strong>{currentPdoAdvancedDocument.pdo_recv.length} / {currentPdoAdvancedDocument.pdo_send.length}</strong>
                  </article>
                </div>
                <p className="config-helper-text">参数 ID 保持十六进制字符串，不会转换为数字；帧 ID 以 16 进制显示和编辑。</p>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>全局变量（{currentPdoAdvancedDocument.pdo_global_param.length}）</strong>
                    <button onClick={addPdoGlobalParam} type="button">新增全局变量</button>
                  </div>
                  <div className="config-table-frame">
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>参数 ID</th>
                          <th>名称</th>
                          <th>默认值</th>
                          <th>保留</th>
                          <th>类型</th>
                          <th>内部变量</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPdoAdvancedDocument.pdo_global_param.map((item, index) => {
                          const itemPath: JsonPath = ['pdo_global_param', index];
                          const itemModified = isModifiedPath(itemPath);
                          return (
                            <tr className={itemModified ? 'config-entry-modified' : undefined} key={`global-${index}`}>
                              <td><input value={item.param_id} onChange={(event) => updatePdoGlobalParam(index, 'param_id', event.target.value)} /></td>
                              <td><input value={item.name} onChange={(event) => updatePdoGlobalParam(index, 'name', event.target.value)} /></td>
                              <td><input value={item.def} onChange={(event) => updatePdoGlobalParam(index, 'def', event.target.value)} /></td>
                              <td><input type="number" value={item.reserved} onChange={(event) => updatePdoGlobalParam(index, 'reserved', Number(event.target.value))} /></td>
                              <td><input type="number" value={item.type} onChange={(event) => updatePdoGlobalParam(index, 'type', Number(event.target.value))} /></td>
                              <td><input type="number" value={item.inner} onChange={(event) => updatePdoGlobalParam(index, 'inner', Number(event.target.value))} /></td>
                              <td>
                                {itemModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(itemPath)} type="button">恢复</button> : null}
                                <button onClick={() => removePdoGlobalParam(index)} type="button">删除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>条件表（{currentPdoAdvancedDocument.pdo_condition.length}）</strong>
                    <button onClick={addPdoCondition} type="button">新增条件</button>
                  </div>
                  {currentPdoAdvancedDocument.pdo_condition.map((condition, conditionIndex) => {
                    const conditionPath: JsonPath = ['pdo_condition', conditionIndex];
                    const conditionModified = isModifiedPath(conditionPath);
                    return (
                      <article className={conditionModified ? 'pdo-frame-card config-entry-modified' : 'pdo-frame-card'} key={`condition-${conditionIndex}`}>
                        <div className="pdo-frame-grid">
                          <label>参数 ID<input value={condition.param_id} onChange={(event) => updatePdoCondition(conditionIndex, 'param_id', event.target.value)} /></label>
                          <label>处理方式<input type="number" value={condition.process} onChange={(event) => updatePdoCondition(conditionIndex, 'process', Number(event.target.value))} /></label>
                        </div>
                        <div className="pdo-frame-actions">
                          {conditionModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(conditionPath)} type="button">恢复条件</button> : null}
                          <button onClick={() => addPdoConditionInput(conditionIndex)} type="button">新增输入</button>
                          <button onClick={() => removePdoCondition(conditionIndex)} type="button">删除条件</button>
                        </div>
                        <div className="structured-list">
                          {condition.data.map((item, inputIndex) => (
                            <label key={`condition-${conditionIndex}-${inputIndex}`}>
                              输入参数 ID
                              <input value={item.param_id} onChange={(event) => updatePdoConditionInput(conditionIndex, inputIndex, event.target.value)} />
                              <button onClick={() => removePdoConditionInput(conditionIndex, inputIndex)} type="button">删除输入</button>
                            </label>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </section>

                {(['pdo_recv', 'pdo_send'] as const).map((kind) => (
                  <section className="pdo-frame-section" key={`advanced-${kind}`}>
                    <div className="config-table-toolbar">
                      <strong>{kind === 'pdo_recv' ? '高级接收帧' : '高级发送帧'}（{currentPdoAdvancedDocument[kind].length ?? 0}）</strong>
                      <button onClick={() => addPdoAdvancedFrame(kind)} type="button">新增帧</button>
                    </div>
                    {currentPdoAdvancedDocument[kind].map((frame, frameIndex) => {
                      const framePath: JsonPath = [kind, frameIndex];
                      const frameModified = isModifiedPath(framePath);
                      return (
                        <article className={frameModified ? 'pdo-frame-card config-entry-modified' : 'pdo-frame-card'} key={`advanced-${kind}-${frameIndex}`}>
                          <div className="pdo-frame-grid">
                            <label>帧 ID<input inputMode="text" value={formatFrameId(frame.id)} onChange={(event) => updatePdoAdvancedFrameId(kind, frameIndex, event.target.value)} /></label>
                            <label>帧类型<input type="number" value={frame.type} onChange={(event) => updatePdoAdvancedFrame(kind, frameIndex, 'type', Number(event.target.value))} /></label>
                            <label>描述<input value={frame.desc} onChange={(event) => updatePdoAdvancedFrame(kind, frameIndex, 'desc', event.target.value)} /></label>
                          </div>
                          <div className="pdo-frame-actions">
                            {frameModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(framePath)} type="button">恢复帧</button> : null}
                            <button onClick={() => removePdoAdvancedFrame(kind, frameIndex)} type="button">删除帧</button>
                          </div>
                          <div className="config-table-toolbar">
                            <span>数据项（{frame.data.length}）</span>
                            <button onClick={() => addPdoAdvancedSignal(kind, frameIndex)} type="button">新增数据项</button>
                          </div>
                          <div className="config-table-frame">
                            <table className="config-table">
                              <thead>
                                <tr>
                                  <th>参数 ID</th>
                                  <th>位置</th>
                                  <th>长度</th>
                                  <th>显示类型</th>
                                  <th>句柄</th>
                                  <th>句柄参数</th>
                                  <th>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {frame.data.map((signal, signalIndex) => {
                                  const signalPath: JsonPath = [kind, frameIndex, 'data', signalIndex];
                                  const signalModified = isModifiedPath(signalPath);
                                  return (
                                    <tr className={signalModified ? 'config-entry-modified' : undefined} key={`advanced-${kind}-${frameIndex}-${signalIndex}`}>
                                      <td><input value={signal.param_id} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'param_id', event.target.value)} /></td>
                                      <td><input type="number" value={signal.pos} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'pos', Number(event.target.value))} /></td>
                                      <td><input type="number" value={signal.len} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'len', Number(event.target.value))} /></td>
                                      <td><input type="number" value={signal.show_type} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'show_type', Number(event.target.value))} /></td>
                                      <td><input type="number" value={signal.handle} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'handle', Number(event.target.value))} /></td>
                                      <td><input value={signal.handle_param} onChange={(event) => updatePdoAdvancedSignal(kind, frameIndex, signalIndex, 'handle_param', event.target.value)} /></td>
                                      <td>
                                        {signalModified ? <button className="config-restore-button" onClick={() => restoreModifiedPath(signalPath)} type="button">恢复</button> : null}
                                        <button onClick={() => removePdoAdvancedSignal(kind, frameIndex, signalIndex)} type="button">删除</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'pdo-advanced' ? (
          <section className="table-spec-card">
            <div>
              <h2>PDO 高级配置校验</h2>
              <p>解析当前项目中的全局变量、条件表、PDO 接收帧和发送帧，展示结构统计与引用校验错误。</p>
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

        {activeModule.key === 'project' || activeModule.key === 'export' ? (
          <section className="table-spec-card">
            <div>
              <h2>表格格式参考</h2>
              <p>SDO、PDO 简化表和多语言表的表头定义，导入前可快速确认目标格式。</p>
            </div>
            {tableSpecs.map((spec) => (
              <div className="table-format-ref" key={spec.kind}>
                <strong>{spec.kind === 'sdo' ? 'SDO 参数表' : spec.kind === 'pdoSimple' ? 'PDO 简化表' : '多语言表'}（{spec.headers.length} 列）</strong>
                <div className="table-format-chips">
                  {spec.headers.map((header) => (
                    <span className="table-format-chip" key={header}>{header}</span>
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
              <p>查看当前软件版本、提交哈希、核心状态和项目运行信息。</p>
            </div>
            <strong className="section-label--muted">应用信息</strong>
            <div className="project-open-report">
              <article>
                <span>软件名称</span>
                <strong>{health?.app_name ?? '自定义开发平台'}</strong>
              </article>
              <article>
                <span>前端版本</span>
                <strong>{appVersion}</strong>
              </article>
              <article>
                <span>核心版本</span>
                <strong>{health?.version ?? '-'}</strong>
              </article>
              <article>
                <span>提交哈希</span>
                <strong>{health?.commit_hash ?? 'unknown'}</strong>
              </article>
              <article>
                <span>核心状态</span>
                <strong>{health?.core_status ?? 'loading'}</strong>
              </article>
            </div>
            <strong className="section-label--muted">项目信息</strong>
            <div className="project-open-report">
              <article>
                <span>当前项目</span>
                <strong>{project?.name ?? '未打开项目'}</strong>
              </article>
              <article>
                <span>项目路径</span>
                <strong>{loadedProject?.summary.path ?? (projectPath || '—')}</strong>
              </article>
            </div>
            <strong className="section-label--muted">外观</strong>
            <div className="theme-toggle-row">
              <div className="theme-toggle-info">
                <span>主题模式</span>
                <small>{theme === 'dark' ? '深色模式' : '浅色模式'}</small>
              </div>
              <button className="theme-toggle-btn" onClick={onToggleTheme} type="button">
                <span className={`theme-toggle-track ${theme === 'dark' ? 'theme-toggle-track--dark' : ''}`}>
                  <span className="theme-toggle-thumb" />
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {activeModule.key === 'export' ? (
          <section className="export-card">
            <div>
              <h2>项目导出</h2>
              <p>生成 jc_export、ConfigUpdate.json、UI 图片资源和 pdo_sdo_data.bin，用于设备配置发布。</p>
            </div>
            <div className="export-form">
              <label>
                导出目录
                <input value={exportOutputDir} onChange={(event) => setExportOutputDir(event.target.value)} />
              </label>
              <button type="button" onClick={() => void handleSelectExportDir()} disabled={isExporting}>
                选择目录
              </button>
              <button type="button" onClick={handleExportPackage} disabled={isExporting || exportOutputDir.trim() === ''}>
                {isExporting ? '导出中...' : '执行项目导出'}
              </button>
              {exportReport ? (
                <button type="button" onClick={() => void handleOpenExportDir(exportReport.export_root)}>
                  打开导出目录
                </button>
              ) : null}
            </div>
            <div className="section-divider" />
            <strong className="section-label--muted">辅助工具</strong>
            <div className="sample-actions">
              <button type="button" onClick={() => void handleCopyUiImages()}>
                仅复制 UI 图片
              </button>
              <button type="button" onClick={() => void handleBuildBinaryReport()}>
                生成二进制报告
              </button>
              <button type="button" onClick={() => void handleCompareBinary()}>
                选择参考 bin 对比
              </button>
            </div>
            {exportError ? <p className="export-error">{exportError}</p> : null}
            {imageCopyReport ? (
              <div className="export-report">
                <article>
                  <span>图片复制有效</span>
                  <strong>{imageCopyReport.valid ? '是' : '否'}</strong>
                </article>
                <article>
                  <span>导出根目录</span>
                  <strong>{imageCopyReport.export_root}</strong>
                </article>
                <article>
                  <span>复制数量</span>
                  <strong>{imageCopyReport.copied_files.length}</strong>
                </article>
                {imageCopyReport.warnings.length > 0 ? <p className="export-warning">{imageCopyReport.warnings.join('；')}</p> : null}
                <button type="button" onClick={() => void handleOpenExportDir(imageCopyReport.export_root)}>
                  打开导出目录
                </button>
              </div>
            ) : null}
            {binaryReport ? (
              <div className="export-report">
                <article>
                  <span>二进制有效</span>
                  <strong>{binaryReport.valid ? '是' : '否'}</strong>
                </article>
                <article>
                  <span>大小</span>
                  <strong>{binaryReport.file_size} bytes</strong>
                </article>
                <article>
                  <span>CRC</span>
                  <strong>{binaryReport.crc}</strong>
                </article>
                <article>
                  <span>语言数量</span>
                  <strong>{binaryReport.data_description.language_code.length}</strong>
                </article>
                {binaryReport.warnings.length > 0 ? <p className="export-warning">{binaryReport.warnings.join('；')}</p> : null}
              </div>
            ) : null}
            {binaryCompareReport ? (
              <div className="export-report">
                <article>
                  <span>是否一致</span>
                  <strong>{binaryCompareReport.same ? '一致' : '不一致'}</strong>
                </article>
                <article>
                  <span>生成/参考大小</span>
                  <strong>{binaryCompareReport.generated_size} / {binaryCompareReport.legacy_size}</strong>
                </article>
                <article>
                  <span>首个差异偏移</span>
                  <strong>{binaryCompareReport.first_diff_offset ?? '-'}</strong>
                </article>
                <article>
                  <span>生成/参考字节</span>
                  <strong>{binaryCompareReport.generated_byte ?? '-'} / {binaryCompareReport.legacy_byte ?? '-'}</strong>
                </article>
              </div>
            ) : null}
            {exportReport ? (
              <div className="export-report">
                <article>
                  <span>结果</span>
                  <strong>{exportReport.valid ? '有效' : '存在问题'}</strong>
                </article>
                <article>
                  <span>导出根目录</span>
                  <strong>{exportReport.export_root}</strong>
                </article>
                <article>
                  <span>ConfigUpdate.json</span>
                  <strong>{exportReport.manifest_path}</strong>
                </article>
                <article>
                  <span>pdo_sdo_data.bin</span>
                  <strong>{exportReport.binary_path}</strong>
                </article>
                <article>
                  <span>二进制大小 / CRC</span>
                  <strong>{exportReport.binary.file_size} bytes / {exportReport.binary.crc}</strong>
                </article>
                <article>
                  <span>图片复制</span>
                  <strong>{exportReport.copied_images.length} 个文件</strong>
                </article>
                {exportReport.errors.length > 0 ? <p className="export-error">{exportReport.errors.join('；')}</p> : null}
                {exportReport.warnings.length > 0 ? <p className="export-warning">{exportReport.warnings.join('；')}</p> : null}
                <button type="button" onClick={() => void handleOpenExportDir(exportReport.export_root)}>
                  打开导出目录
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
