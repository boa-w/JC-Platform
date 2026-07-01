import { useEffect, useRef, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  addUiResourceOptionDocument,
  buildProjectBinaryReport,
  compareProjectBinaryReport,
  copyUiResourceImages,
  createProject,
  exportCanopenPackage,
  exportProjectPackage,
  exportTableCsv,
  exportTableWorkbook,
  flattenUnifiedProtocolDocument,
  getLegacyTableSpec,
  importDbc,
  exportDbc,
  generateDbcContent,
  importLanguageCsv,
  importLanguageWorkbook,
  importPdoSimpleCsv,
  importPdoSimpleWorkbook,
  importSdoCsv,
  importSdoWorkbook,
  languageDocumentTable,
  loadJsonFile,
  loadProject,
  loadTextFile,
  migrateProjectDocument,
  parsePdoAdvancedProject,
  parseProjectDocument,
  parseUnifiedProtocolProject,
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
  validateProjectDocument,
} from '../api/commands';
import type {
  BackendHealth,
  BatteryMonitorFrame,
  BatteryMonitorInfo,
  BatteryProtocol,
  BatteryMonitorItem,
  BatteryMonitorSignal,
  BinaryBuildReport,
  BinaryCompareReport,
  CanopenConversionReport,
  CanTestProfile,
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
  PrivateFrame,
  PrivatePayloadSignal,
  ProjectExportReport,
  ProjectParseReport,
  ProjectSummary,
  ProtocolMapping,
  ProtocolMappingTarget,
  NavigationKey,
  SdoImportReport,
  SdoNodeDocument,
  SignalDictionary,
  SignalDefinition,
  UiImageCopyReport,
  UiResourceParseReport,
  UiResourceUpdateRequest,
  UnifiedProtocolModel,
} from '../types/platform';
import { UiCanvasPreview } from '../components/UiCanvasPreview';
import { Breadcrumb } from '../components/Breadcrumb';
import { LanguagePage } from '../components/language';
import { featureModules } from '../data/modules';
import { cloneJson, deepEqual, isPathModified, restorePath, type JsonPath } from '../utils/projectDirty';
import { getTestData, testDataLabels, type TestDataType } from '../data/test-data';
import { framesToCsv, csvToFrames, signalsToCsv, csvToSignals, itemsToCsv, csvToItems } from '../utils/batteryCsv';
import { useCanTestData } from '../hooks/useCanTestData';
import { useExportBatteryOptions } from '../stores/exportSettings';
import { APP_VERSION } from '../constants/app';
import {
  advancedConfigSections,
  configSectionForEditor,
  jsonEditorKeyForModule,
  legacyTableKindForModule,
  modifiedSectionLabels,
  refactorOnlySections,
  restorePathsForEditor,
  shouldRefreshUnifiedProtocol,
  trackedDocumentSections,
  type RefactorOnlySection,
} from '../modules/documentSections';

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

interface RecentProject {
  path: string;
  name?: string;
  openedAt: string;
}

type SdoNodeField = keyof Pick<SdoNodeDocument,
  'name' | 'type' | 'user_auth' | 'name_index' | 'control_protocol' | 'control_rw' | 'control_use_default' |
  'control_use_min_max' | 'handle' | 'handle_name' | 'handle_param' | 'fid' | 'mid' | 'sid' |
  'data_default' | 'data_min' | 'data_max' | 'pre_handle' | 'pre_handle_name' | 'pre_handle_scale' |
  'pre_handle_offset' | 'pre_handle_decimal' | 'pre_handle_decimal_name'
>;

type SettingParameterColumnKey =
  | 'index'
  | 'name'
  | 'auth'
  | 'protocol'
  | 'frameId'
  | 'mainIndex'
  | 'subIndex'
  | 'access'
  | 'maxValue'
  | 'minValue'
  | 'defaultValue'
  | 'dataType'
  | 'bitStart'
  | 'bitLength'
  | 'preprocess'
  | 'scale'
  | 'offset'
  | 'decimals'
  | 'actions';

interface SettingParameterColumn {
  key: SettingParameterColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: 'left' | 'center' | 'right';
}

type SettingEditorInputKind = 'text' | 'number' | 'select';

type SettingEditorOption = {
  value: number | string;
  label: string;
};

type SettingEditorField = {
  field: SdoNodeField;
  label: string;
  kind: SettingEditorInputKind;
  defaultValue: string | number;
  visibleFor?: 'all' | 'menu' | 'parameter';
  options?: SettingEditorOption[];
};

type SettingEditorSection = {
  title: string;
  fields: SettingEditorField[];
};

const settingColumnWidthStorageKey = 'jc-custom-platform.settingData.columnWidths';
const maxSettingColumnWidth = 480;

const settingParameterColumns: SettingParameterColumn[] = [
  { key: 'index', label: '', defaultWidth: 54, minWidth: 44, align: 'center' },
  { key: 'name', label: '参数名称', defaultWidth: 180, minWidth: 120, align: 'left' },
  { key: 'auth', label: '使用权限', defaultWidth: 96, minWidth: 76 },
  { key: 'protocol', label: '协议类型', defaultWidth: 110, minWidth: 86 },
  { key: 'frameId', label: '帧ID', defaultWidth: 90, minWidth: 72 },
  { key: 'mainIndex', label: '主索引', defaultWidth: 90, minWidth: 72 },
  { key: 'subIndex', label: '子索引', defaultWidth: 80, minWidth: 64 },
  { key: 'access', label: '读写权限', defaultWidth: 96, minWidth: 76 },
  { key: 'maxValue', label: '最大值', defaultWidth: 110, minWidth: 80 },
  { key: 'minValue', label: '最小值', defaultWidth: 110, minWidth: 80 },
  { key: 'defaultValue', label: '默认值', defaultWidth: 110, minWidth: 80 },
  { key: 'dataType', label: '数据类型', defaultWidth: 130, minWidth: 90 },
  { key: 'bitStart', label: 'bit开始位置', defaultWidth: 110, minWidth: 86 },
  { key: 'bitLength', label: 'bit长度', defaultWidth: 100, minWidth: 76 },
  { key: 'preprocess', label: '数据预处理', defaultWidth: 130, minWidth: 94 },
  { key: 'scale', label: '缩放值', defaultWidth: 100, minWidth: 76 },
  { key: 'offset', label: '偏移值', defaultWidth: 100, minWidth: 76 },
  { key: 'decimals', label: '保留小数', defaultWidth: 100, minWidth: 76 },
  { key: 'actions', label: '操作', defaultWidth: 120, minWidth: 100 },
];

const sdoTypeOptions: SettingEditorOption[] = [
  { value: 0, label: '菜单' },
  { value: 1, label: '参数' },
];

const sdoAuthOptions: SettingEditorOption[] = [
  { value: 0, label: '普通用户' },
  { value: 1, label: '普通用户' },
  { value: 2, label: '管理员' },
  { value: 3, label: '超级管理员' },
];

const sdoAccessOptions: SettingEditorOption[] = [
  { value: 0, label: '只读' },
  { value: 1, label: '读写' },
  { value: 2, label: '只写' },
];

const sdoProtocolOptions: SettingEditorOption[] = [
  { value: 0, label: 'CAN_OPEN' },
];

const sdoBooleanOptions: SettingEditorOption[] = [
  { value: 0, label: '否' },
  { value: 1, label: '是' },
];

const sdoPreHandleOptions: SettingEditorOption[] = [
  { value: 0, label: '原始数据' },
];

const settingEditorSections: SettingEditorSection[] = [
  {
    title: '基础信息',
    fields: [
      { field: 'name', label: '名称', kind: 'text', defaultValue: '', visibleFor: 'all' },
      { field: 'type', label: '类型', kind: 'select', defaultValue: 0, visibleFor: 'all', options: sdoTypeOptions },
      { field: 'user_auth', label: '权限', kind: 'select', defaultValue: 0, visibleFor: 'all', options: sdoAuthOptions },
      { field: 'name_index', label: '语言索引', kind: 'number', defaultValue: 0, visibleFor: 'all' },
    ],
  },
  {
    title: '通信索引',
    fields: [
      { field: 'control_protocol', label: '协议', kind: 'select', defaultValue: 0, visibleFor: 'parameter', options: sdoProtocolOptions },
      { field: 'control_rw', label: '读写', kind: 'select', defaultValue: 0, visibleFor: 'parameter', options: sdoAccessOptions },
      { field: 'fid', label: 'FID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'mid', label: 'MID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'sid', label: 'SID', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
    ],
  },
  {
    title: '默认值与范围',
    fields: [
      { field: 'control_use_default', label: '使用默认值', kind: 'select', defaultValue: 0, visibleFor: 'parameter', options: sdoBooleanOptions },
      { field: 'control_use_min_max', label: '使用范围', kind: 'select', defaultValue: 0, visibleFor: 'parameter', options: sdoBooleanOptions },
      { field: 'data_default', label: '默认值', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'data_min', label: '最小值', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'data_max', label: '最大值', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
    ],
  },
  {
    title: '数据处理',
    fields: [
      { field: 'handle', label: '句柄', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'handle_name', label: '句柄名', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'handle_param', label: '句柄参数', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'pre_handle', label: '预处理', kind: 'select', defaultValue: 0, visibleFor: 'parameter', options: sdoPreHandleOptions },
      { field: 'pre_handle_name', label: '预处理名', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'pre_handle_scale', label: '缩放', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'pre_handle_offset', label: '偏移', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
      { field: 'pre_handle_decimal', label: '小数位', kind: 'number', defaultValue: 0, visibleFor: 'parameter' },
      { field: 'pre_handle_decimal_name', label: '小数位名', kind: 'text', defaultValue: '', visibleFor: 'parameter' },
    ],
  },
];

function clampSettingColumnWidth(value: number, column: SettingParameterColumn) {
  return Math.max(column.minWidth, Math.min(maxSettingColumnWidth, value));
}

function loadSettingColumnWidths() {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(settingColumnWidthStorageKey);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    for (const column of settingParameterColumns) {
      const value = (parsed as Record<string, unknown>)[column.key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[column.key] = clampSettingColumnWidth(value, column);
      }
    }
    return next;
  } catch {
    return {};
  }
}

function saveSettingColumnWidths(widths: Record<string, number>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(settingColumnWidthStorageKey, JSON.stringify(widths));
}

function optionsWithCurrentValue(options: SettingEditorOption[], value: string | number) {
  return options.some((option) => String(option.value) === String(value))
    ? options
    : [...options, { value, label: `当前值：${value}` }];
}

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
  const [refactorConfigPath, setRefactorConfigPath] = useState<string | null>(null);
  const [refactorConfigStatus, setRefactorConfigStatus] = useState<string | null>(null);
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
  const [unifiedProtocol, setUnifiedProtocol] = useState<UnifiedProtocolModel | null>(null);
  const [unifiedProtocolError, setUnifiedProtocolError] = useState<string | null>(null);
  const [isParsingUnifiedProtocol, setIsParsingUnifiedProtocol] = useState(false);
  const [protocolFlattenStatus, setProtocolFlattenStatus] = useState<string | null>(null);
  const [privateProtocolImportStatus, setPrivateProtocolImportStatus] = useState<string | null>(null);
  const [isImportingPrivateProtocol, setIsImportingPrivateProtocol] = useState(false);
  const [privateProtocolExportStatus, setPrivateProtocolExportStatus] = useState<string | null>(null);
  const [isExportingPrivateProtocol, setIsExportingPrivateProtocol] = useState(false);
  const [batteryProtocolImportStatus, setBatteryProtocolImportStatus] = useState<string | null>(null);
  const [batteryProtocolExportStatus, setBatteryProtocolExportStatus] = useState<string | null>(null);
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
  const [exportOutputDir, setExportOutputDir] = useState('jc-export');
  const [exportReport, setExportReport] = useState<ProjectExportReport | null>(null);
  const [imageCopyReport, setImageCopyReport] = useState<UiImageCopyReport | null>(null);
  const [binaryReport, setBinaryReport] = useState<BinaryBuildReport | null>(null);
  const [binaryCompareReport, setBinaryCompareReport] = useState<BinaryCompareReport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pdoJumpTarget, setPdoJumpTarget] = useState<number | null>(null);
  const [selectedSettingPath, setSelectedSettingPath] = useState<string | null>(null);
  const [editingSettingPath, setEditingSettingPath] = useState<number[] | null>(null);
  const settingDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const settingDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [settingSearchQuery, setSettingSearchQuery] = useState('');
  const [settingColumnWidths, setSettingColumnWidths] = useState<Record<string, number>>(loadSettingColumnWidths);
  const [selectedRealtimeKind, setSelectedRealtimeKind] = useState<'pdo_recv' | 'pdo_send'>('pdo_recv');
  const [selectedRealtimeFrameId, setSelectedRealtimeFrameId] = useState<number | null>(null);
  const [realtimeMode, setRealtimeMode] = useState<'simple' | 'advanced'>('simple');
  const [selectedAdvancedFrameId, setSelectedAdvancedFrameId] = useState<number | null>(null);
  const [advancedPdoDrawerOpen, setAdvancedPdoDrawerOpen] = useState(false);
  const [advancedPdoDrawerTab, setAdvancedPdoDrawerTab] = useState<'global' | 'condition'>('global');
  const advancedPdoDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const advancedPdoDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [confirmGenerateType, setConfirmGenerateType] = useState<TestDataType | null>(null);
  const canTestData = useCanTestData();
  const [canopenConversionReport, setCanopenConversionReport] = useState<CanopenConversionReport | null>(null);
  const [canopenConvertStatus, setCanopenConvertStatus] = useState<string | null>(null);
  const [canopenExportDir, setCanopenExportDir] = useState<string | null>(null);
  const [isExportingCanopenPackage, setIsExportingCanopenPackage] = useState(false);
  const {
    options: exportBatteryOptions,
    updateOption: updateExportBatteryOption,
    resetOptions: resetExportBatteryOptions,
  } = useExportBatteryOptions();
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
    if (activeModule.key === 'realtime-data' && realtimeMode === 'simple' && pdoJumpTarget !== null) {
      pdoJumpRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeModule.key, realtimeMode, pdoJumpTarget]);

  useEffect(() => {
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
    if (Object.keys(defaults).length > 0) {
      const document = { ...doc, ...defaults };
      acceptLoadedProject({ ...loadedProject, document }, projectPath);
    }
  }, [loadedProject]);

  useEffect(() => {
    if (loadedProject && shouldRefreshUnifiedProtocol(activeModule.key)) {
      void refreshUnifiedProtocol(loadedProject.document);
    }
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

  useEffect(() => {
    const settingEditorDrawerOpen = Boolean(editingSettingPath && sdoNodeByNumberPath(sdoDocument(), editingSettingPath));
    if (!advancedPdoDrawerOpen && !settingEditorDrawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (settingEditorDrawerOpen) {
        closeSettingEditorDrawer();
        return;
      }
      closeAdvancedPdoDrawer();
    }

    document.addEventListener('keydown', handleKeyDown);
    window.setTimeout(() => {
      if (settingEditorDrawerOpen) {
        settingDrawerCloseRef.current?.focus();
        return;
      }
      advancedPdoDrawerCloseRef.current?.focus();
    }, 0);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [advancedPdoDrawerOpen, editingSettingPath, loadedProject?.document]);

  useEffect(() => {
    if (activeModule.key !== 'realtime-data' || realtimeMode !== 'advanced') {
      setAdvancedPdoDrawerOpen(false);
    }
    if (activeModule.key !== 'setting-data') {
      setEditingSettingPath(null);
    }
  }, [activeModule.key, realtimeMode]);

  useEffect(() => {
    if (editingSettingPath && !sdoNodeByNumberPath(sdoDocument(), editingSettingPath)) {
      setEditingSettingPath(null);
    }
  }, [editingSettingPath, loadedProject?.document]);

  function parseUiPreview(document: unknown, path?: string) {
    if (path) {
      return parseUiResourcesWithProjectPath({ project_path: path, document });
    }
    return parseUiResources(document);
  }

  function formatFrameId(value: number) {
    return `0x${Math.max(0, value).toString(16).toUpperCase()}`;
  }

  function formatFrameIdPadded(value: number, width = 3) {
    return `0x${Math.max(0, value).toString(16).toUpperCase().padStart(width, '0')}`;
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

  function openAdvancedPdoDrawer(tab: 'global' | 'condition') {
    advancedPdoDrawerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAdvancedPdoDrawerTab(tab);
    setAdvancedPdoDrawerOpen(true);
  }

  function closeAdvancedPdoDrawer() {
    setAdvancedPdoDrawerOpen(false);
    window.setTimeout(() => advancedPdoDrawerReturnFocusRef.current?.focus(), 0);
  }

  function openSettingEditorDrawer(path: number[]) {
    settingDrawerReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingSettingPath(path);
  }

  function closeSettingEditorDrawer() {
    setEditingSettingPath(null);
    window.setTimeout(() => settingDrawerReturnFocusRef.current?.focus(), 0);
  }

  function isSameOrDescendantPath(path: number[], target: number[]) {
    return target.length >= path.length && path.every((part, index) => target[index] === part);
  }

  function activeLegacyTableKind(): TableConfigKind | null {
    return legacyTableKindForModule(activeModule.key) as TableConfigKind | null;
  }

  function activeJsonEditorKey() {
    return jsonEditorKeyForModule(activeModule.key, { realtimeMode });
  }

  function currentConfigSection() {
    if (!loadedProject) return null;
    const document = loadedProject.document as Record<string, unknown>;
    return configSectionForEditor(document, activeModule.key, { realtimeMode });
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
    for (const path of restorePathsForEditor(activeModule.key, { realtimeMode })) {
      document = restorePath(document, baselineDocument, path as JsonPath);
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
  const hasRefactorOnlyChanges = modifiedSections.some((section) => (refactorOnlySections as readonly string[]).includes(section));
  const isLegacyJcproProject = loadedProject?.summary.path?.toLowerCase().endsWith('.jcpro') ?? false;
  const projectMissingSections = loadedProject?.validation.missing_sections ?? [];
  const compatibleMissingSections = projectMissingSections.filter((section) => !(refactorOnlySections as readonly string[]).includes(section));
  const sidecarMissingSections = projectMissingSections.filter((section) => (refactorOnlySections as readonly string[]).includes(section));
  const effectiveProjectValid = compatibleMissingSections.length === 0;

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

  function signalDictionaryDocument(): SignalDictionary {
    const document = loadedProject?.document as Record<string, unknown> | undefined;
    return (document?.signal_dictionary as SignalDictionary | undefined) ?? { signals: [] };
  }

  function privateProtocolDocument(): { enabled: boolean; frames: PrivateFrame[] } {
    const document = loadedProject?.document as Record<string, unknown> | undefined;
    return (document?.private_protocol as { enabled: boolean; frames: PrivateFrame[] } | undefined) ?? { enabled: false, frames: [] };
  }

  function protocolMappingsDocument(): ProtocolMapping[] {
    const document = loadedProject?.document as Record<string, unknown> | undefined;
    return (document?.protocol_mapping as ProtocolMapping[] | undefined) ?? [];
  }

  function refreshUnifiedProtocolFromDocument(document: unknown) {
    void refreshUnifiedProtocol(document);
  }

  function updateSignalDictionaryDocument(next: SignalDictionary) {
    updateProjectDocument('signal_dictionary', next);
    refreshUnifiedProtocolFromDocument({ ...((loadedProject?.document as Record<string, unknown>) ?? {}), signal_dictionary: next });
  }

  function updateSignalDefinition(index: number, updater: (signal: SignalDefinition) => SignalDefinition) {
    const document = signalDictionaryDocument();
    updateSignalDictionaryDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) => (currentIndex === index ? updater(signal) : signal)),
    });
  }

  function addSignalDefinition() {
    const document = signalDictionaryDocument();
    const index = document.signals.length + 1;
    updateSignalDictionaryDocument({
      ...document,
      signals: [
        ...document.signals,
        {
          signal_id: `CUSTOM_SIGNAL_${index}`,
          name: `新业务信号${index}`,
          data_type: 'u16',
          default_value: '0',
          min_value: '',
          max_value: '',
          inner: -1,
          scale: { scale_num: 1, scale_den: 1, offset: 0, decimals: 0 },
          display: { unit: '', format: 'decimal', description: '' },
        },
      ],
    });
  }

  function removeSignalDefinition(index: number) {
    const document = signalDictionaryDocument();
    updateSignalDictionaryDocument({ ...document, signals: document.signals.filter((_, currentIndex) => currentIndex !== index) });
  }

  function updatePrivateProtocolDocument(next: { enabled: boolean; frames: PrivateFrame[] }) {
    updateProjectDocument('private_protocol', next);
    refreshUnifiedProtocolFromDocument({ ...((loadedProject?.document as Record<string, unknown>) ?? {}), private_protocol: next });
  }

  function updatePrivateFrame(index: number, updater: (frame: PrivateFrame) => PrivateFrame) {
    const document = privateProtocolDocument();
    updatePrivateProtocolDocument({
      ...document,
      frames: document.frames.map((frame, currentIndex) => (currentIndex === index ? updater(frame) : frame)),
    });
  }

  function addPrivateFrame() {
    const document = privateProtocolDocument();
    const index = document.frames.length + 1;
    updatePrivateProtocolDocument({
      ...document,
      enabled: true,
      frames: [
        ...document.frames,
        {
          frame_id: 0,
          frame_key: `private_frame_${index}`,
          name: `新私有帧${index}`,
          frame_type: 'standard',
          cycle_ms: 100,
          checksum: 'none',
          byte_order: 'little',
          payload: [],
          source: 'manual',
        },
      ],
    });
  }

  function removePrivateFrame(index: number) {
    const document = privateProtocolDocument();
    updatePrivateProtocolDocument({ ...document, frames: document.frames.filter((_, currentIndex) => currentIndex !== index) });
  }

  function updatePrivatePayload(frameIndex: number, payloadIndex: number, updater: (payload: PrivatePayloadSignal) => PrivatePayloadSignal) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: frame.payload.map((payload, currentIndex) => (currentIndex === payloadIndex ? updater(payload) : payload)),
    }));
  }

  function addPrivatePayload(frameIndex: number) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: [...frame.payload, { signal_id: '', bit_offset: 0, bit_length: 8, byte_order: frame.byte_order || 'little' }],
    }));
  }

  function removePrivatePayload(frameIndex: number, payloadIndex: number) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: frame.payload.filter((_, currentIndex) => currentIndex !== payloadIndex),
    }));
  }

  async function handleExportPrivateProtocol() {
    setPrivateProtocolExportStatus(null);
    if (!loadedProject) { setPrivateProtocolExportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setPrivateProtocolExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

    const selected = await save({
      filters: [{ name: '私有协议配置', extensions: ['json'] }],
    });
    if (!selected) return;

    setIsExportingPrivateProtocol(true);
    try {
      await saveJsonFile(selected, currentPrivateProtocol);
      setPrivateProtocolExportStatus(`已导出：${selected}`);
    } catch (error) {
      setPrivateProtocolExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingPrivateProtocol(false);
    }
  }

  async function handleImportPrivateProtocol() {
    setPrivateProtocolImportStatus(null);
    if (!loadedProject) { setPrivateProtocolImportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setPrivateProtocolImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

    const selected = await open({
      multiple: false,
      filters: [{ name: '私有协议配置', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingPrivateProtocol(true);
    try {
      const data = await loadJsonFile(selected) as { enabled: boolean; frames: PrivateFrame[] };
      if (!data || typeof data.enabled !== 'boolean' || !Array.isArray(data.frames)) {
        setPrivateProtocolImportStatus('无效的私有协议配置文件。');
        return;
      }
      updatePrivateProtocolDocument(data);
      setPrivateProtocolImportStatus(`已导入 ${data.frames.length} 个私有帧`);
    } catch (error) {
      setPrivateProtocolImportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingPrivateProtocol(false);
    }
  }

  function updateProtocolMappings(next: ProtocolMapping[]) {
    updateProjectDocument('protocol_mapping', next);
    refreshUnifiedProtocolFromDocument({ ...((loadedProject?.document as Record<string, unknown>) ?? {}), protocol_mapping: next });
  }

  function updateProtocolMapping(index: number, updater: (mapping: ProtocolMapping) => ProtocolMapping) {
    const mappings = protocolMappingsDocument();
    updateProtocolMappings(mappings.map((mapping, currentIndex) => (currentIndex === index ? updater(mapping) : mapping)));
  }

  function addProtocolMapping(kind: ProtocolMappingTarget['kind'] = 'can_open_pdo') {
    const mappings = protocolMappingsDocument();
    const target: ProtocolMappingTarget = kind === 'can_open_sdo'
      ? { kind: 'can_open_sdo', index: 0, subindex: 0 }
      : kind === 'private_frame'
        ? { kind: 'private_frame', frame_key: '', frame_id: 0, bit_offset: 0, bit_length: 8 }
        : { kind: 'can_open_pdo', direction: 'receive', frame_id: 0, bit_offset: 0, bit_length: 8 };
    updateProtocolMappings([...mappings, { signal_id: '', target }]);
  }

  function removeProtocolMapping(index: number) {
    const mappings = protocolMappingsDocument();
    updateProtocolMappings(mappings.filter((_, currentIndex) => currentIndex !== index));
  }

  async function refreshUnifiedProtocol(documentOverride?: unknown) {
    const document = documentOverride ?? loadedProject?.document;
    if (!document) return null;

    setIsParsingUnifiedProtocol(true);
    setUnifiedProtocolError(null);

    try {
      const report = await parseUnifiedProtocolProject(document);
      setUnifiedProtocol(report);
      if (!report.validation.valid) {
        setUnifiedProtocolError(report.validation.errors.join('；') || '协议映射校验存在问题');
      }
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUnifiedProtocolError(message);
      return null;
    } finally {
      setIsParsingUnifiedProtocol(false);
    }
  }

  async function handleFlattenUnifiedProtocol() {
    if (!loadedProject) return;
    setProtocolFlattenStatus(null);
    setUnifiedProtocolError(null);

    try {
      const report = await flattenUnifiedProtocolDocument(loadedProject.document);
      if (!report.valid) {
        setUnifiedProtocolError(report.errors.join('；') || '生成旧版 PDO 段失败');
        return;
      }
      applyLoadedProject({ ...loadedProject, document: report.document });
      setProtocolFlattenStatus(`已更新：${report.updated_sections.join('、')}`);
      if (report.warnings.length > 0) {
        setUnifiedProtocolError(report.warnings.join('；'));
      }
      void refreshUnifiedProtocol(report.document);
    } catch (error) {
      setUnifiedProtocolError(error instanceof Error ? error.message : String(error));
    }
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
      } catch { /* fall through */ }
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

  function updateBatteryFrame(index: number, field: keyof BatteryMonitorFrame, value: string | number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      frames: document.frames.map((frame, currentIndex) => (currentIndex === index ? { ...frame, [field]: value } : frame)),
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
      frames: [...document.frames, { frame_key: `bat_custom_${index + 1}`, can_id: 0, type: 0, desc: '新锂电帧', timeout_ticks: document.default_timeout_ticks ?? 200 }],
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

  function updateBatterySignal(index: number, field: keyof BatteryMonitorSignal, value: string | number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) => (currentIndex === index ? { ...signal, [field]: value } : signal)),
    });
  }

  function addBatterySignal() {
    const document = batteryProtocolDocument();
    if (!document) return;
    const index = document.signals.length;
    let frames = document.frames;
    if (frames.length === 0) {
      frames = [{ frame_key: 'bat_default', can_id: 0, type: 0, desc: '默认帧', timeout_ticks: document.default_timeout_ticks ?? 200 }];
    }
    updateBatteryProtocolDocument({
      ...document,
      frames,
      signals: [...document.signals, { signal_key: `battery_signal_${index + 1}`, param_id: `BATTERY_MONITOR_CUSTOM_${index + 1}`, name: '新锂电信号', inner: -1, type: 0, def: '0', frame_key: frames[0].frame_key, pos: 0, len: 8, show_type: 0, handle: 0, handle_param: '', factor: 1, offset: 0, min: 0, max: 0, unit: '', receiver: 'dbc_export', comment: '' }],
    });
  }

  function removeBatterySignal(index: number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({ ...document, signals: document.signals.filter((_, currentIndex) => currentIndex !== index) });
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
    const currentProtocol = batteryProtocolDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: [...document.items, { item_key: `battery_item_${index + 1}`, enabled: true, order: index, signal_key: currentProtocol?.signals[0]?.signal_key ?? '', name_key: '新锂电项', unit: '', formatter: { kind: 'linear', offset: 0, scale_num: 1, scale_den: 1, decimals: 0, display_base: 10 }, validity: { mode: 'frame_timeout', frame_key: currentProtocol?.frames[0]?.frame_key ?? '', empty_text: ' ' } }],
    });
  }

  function removeBatteryItem(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, items: document.items.filter((_, currentIndex) => currentIndex !== index) });
  }

  async function handleExportBatteryMonitor() {
    setBatteryMonitorExportStatus(null);
    if (!loadedProject) { setBatteryMonitorExportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryMonitorExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryProtocolExportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryProtocolExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryProtocolImportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryProtocolImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

    const selected = await open({
      multiple: false,
      filters: [{ name: '锂电协议', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryProtocol(true);
    try {
      const data = await loadJsonFile(selected) as BatteryProtocol;
      if (!data || !Array.isArray(data.frames) || !Array.isArray(data.signals)) {
        setBatteryProtocolImportStatus('无效的锂电协议配置文件。');
        return;
      }
      updateBatteryProtocolDocument(data);
      setBatteryProtocolImportStatus(`已导入 ${data.frames.length} 帧 / ${data.signals.length} 信号`);
    } catch (error) {
      setBatteryProtocolImportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBatteryProtocol(false);
    }
  }

  async function handleImportBatteryMonitor() {
    setBatteryMonitorImportStatus(null);
    if (!loadedProject) { setBatteryMonitorImportStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryMonitorImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

    const selected = await open({
      multiple: false,
      filters: [{ name: '锂电监控配置', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImportingBatteryMonitor(true);
    try {
      const data = await loadJsonFile(selected) as BatteryMonitorInfo;
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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryCsvStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

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
    if (!loadedProject) { setBatteryDbcStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryDbcStatus('系统文件选择器只能在 Tauri 桌面应用中使用。'); return; }

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
      } catch { /* non-critical */ }
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
    if (!loadedProject) { setBatteryDbcStatus('请先打开 .jcpro 项目。'); return; }
    if (!isTauriRuntime()) { setBatteryDbcStatus('系统保存对话框只能在 Tauri 桌面应用中使用。'); return; }

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
      if (data.pdoSimple) updatePdoSimpleDocument(data.pdoSimple);
      if (data.pdoAdvanced) updatePdoAdvancedDocument(data.pdoAdvanced);
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

  interface SettingMenuRow {
    key: string;
    path: number[];
    name: string;
    pathNames: string[];
    level: number;
    auth: string;
    parameterCount: number;
    directParameterCount: number;
    hasMenuChildren: boolean;
    isSearchMatch?: boolean;
    hasSearchMatchInChildren?: boolean;
  }

  interface SettingParameterRow {
    index: number;
    path: number[];
    name: string;
    menuPath: string;
    pathNames: string[];
    auth: string;
    protocol: string;
    frameId: string;
    mainIndex: string;
    subIndex: string;
    access: string;
    maxValue: string;
    minValue: string;
    defaultValue: string;
    dataType: string;
    bitStart: string;
    bitLength: string;
    preprocess: string;
    scale: string;
    offset: string;
    decimals: string;
    isReadonly: boolean;
    isBooleanMonitor: boolean;
    usageHint: string;
  }

  function sdoAuthLabel(value?: number) {
    return ['普通用户', '普通用户', '管理员', '超级管理员'][value ?? 0] ?? '普通用户';
  }

  function sdoAccessLabel(value?: number) {
    return ['只读', '读写', '只写'][value ?? 0] ?? '只读';
  }

  function sdoProtocolLabel(value?: number) {
    return value === 0 || value === undefined ? 'CAN_OPEN' : String(value);
  }

  function settingDataTypeLabel(node: SdoNodeDocument) {
    const explicitType = [
      node.handle_name,
      typeof node.data_type === 'string' ? node.data_type : undefined,
      typeof node.dataType === 'string' ? node.dataType : undefined,
    ].find((item) => item?.trim());
    if (explicitType) return explicitType.trim();

    const handle = node.handle;
    const label = (() => {
      switch (handle) {
        case 0:
          return 'u8';
        case 2:
        case 3:
          return 'u16';
        case 4:
        case 7:
          return 'u32';
        case 6:
          return 'string';
        case 11:
        case 12:
          return 'bit';
        default:
          return undefined;
      }
    })();

    if (label) return `${label}(handle=${handle})`;
    return typeof handle === 'number' ? `handle=${handle}` : '';
  }

  function formatHex(value?: number, width = 0) {
    if (typeof value !== 'number') return '';
    return `0x${Math.max(0, value).toString(16).toUpperCase().padStart(width, '0')}`;
  }

  function parseHandleParam(value?: string) {
    const parts = (value ?? '').split('->').map((item) => Number.parseInt(item, 10));
    if (parts.length < 2 || parts.some((item) => Number.isNaN(item))) {
      return { bitStart: '', bitLength: '' };
    }
    const [start, end] = parts;
    return {
      bitStart: `bit${start}`,
      bitLength: `${Math.max(1, end - start + 1)}个bits`,
    };
  }

  function countSdoParameters(node: SdoNodeDocument): number {
    if (node.type === 1) return 1;
    return (node.children ?? []).reduce((total, child) => total + countSdoParameters(child), 0);
  }

  function countSdoDirectParameters(node: SdoNodeDocument): number {
    return (node.children ?? []).filter((child) => child.type === 1).length;
  }

  function normalizeSettingSearch(value: string) {
    return value.trim().toLowerCase();
  }

  function sdoNodeName(node: SdoNodeDocument, fallback: string) {
    return node.name?.trim() || fallback;
  }

  function formatSettingPath(pathNames: string[]) {
    return pathNames.length > 0 ? pathNames.join(' -> ') : '菜单';
  }

  function isBooleanMonitorParameter(node: SdoNodeDocument) {
    return String(node.data_min ?? '') === '0' && String(node.data_max ?? '') === '1';
  }

  function settingNodeSearchText(node: SdoNodeDocument, pathNames: string[]) {
    return normalizeSettingSearch([
      ...pathNames,
      node.name,
      sdoAuthLabel(node.user_auth),
      sdoAccessLabel(node.control_rw),
      sdoProtocolLabel(node.control_protocol),
      settingDataTypeLabel(node),
      formatHex(node.fid, 2),
      formatHex(node.mid, 4),
      node.sid,
      node.data_default,
      node.data_min,
      node.data_max,
    ].filter((item) => item !== undefined && item !== null).join(' '));
  }

  function settingNodeMatchesQuery(node: SdoNodeDocument, query: string, pathNames: string[]) {
    if (!query) return true;
    return settingNodeSearchText(node, pathNames).includes(query);
  }

  function settingMenuHasMatchedDescendant(node: SdoNodeDocument, query: string, pathNames: string[]): boolean {
    if (!query) return true;
    return (node.children ?? []).some((child, index) => {
      const childName = sdoNodeName(child, child.type === 0 ? `菜单${index + 1}` : `参数${index + 1}`);
      const childPathNames = child.type === 0 ? [...pathNames, childName] : pathNames;
      return settingNodeMatchesQuery(child, query, childPathNames)
        || settingMenuHasMatchedDescendant(child, query, childPathNames);
    });
  }

  function collectSettingMenus(root: SdoNodeDocument | null, rawQuery = ''): SettingMenuRow[] {
    if (!root) return [];
    const query = normalizeSettingSearch(rawQuery);
    const rows: SettingMenuRow[] = [];
    function visit(node: SdoNodeDocument, path: number[], level: number, parentNames: string[]) {
      if (node.type !== 0) return;
      const name = sdoNodeName(node, level === 0 ? `菜单${path[path.length - 1] + 1}` : `子菜单${path[path.length - 1] + 1}`);
      const pathNames = [...parentNames, name];
      const isSearchMatch = settingNodeMatchesQuery(node, query, pathNames);
      const hasSearchMatchInChildren = settingMenuHasMatchedDescendant(node, query, pathNames);
      if (!query || isSearchMatch || hasSearchMatchInChildren) {
        rows.push({
          key: path.join('/'),
          path,
          name,
          pathNames,
          level,
          auth: sdoAuthLabel(node.user_auth),
          parameterCount: countSdoParameters(node),
          directParameterCount: countSdoDirectParameters(node),
          hasMenuChildren: (node.children ?? []).some((child) => child.type === 0),
          isSearchMatch,
          hasSearchMatchInChildren,
        });
      }
      (node.children ?? []).forEach((child, index) => visit(child, [...path, index], level + 1, pathNames));
    }
    (root.children ?? []).forEach((node, index) => visit(node, [index], 0, [root.name || '菜单']));
    return rows;
  }

  function sdoNodeByPath(root: SdoNodeDocument | null, path: string | null) {
    if (!root || !path) return null;
    return path.split('/').reduce<SdoNodeDocument | null>((node, segment) => {
      if (!node) return null;
      return node.children?.[Number(segment)] ?? null;
    }, root);
  }

  function pathStringToNumbers(path: string | null): number[] {
    if (!path) return [];
    return path.split('/').map((segment) => Number(segment)).filter((segment) => Number.isFinite(segment));
  }

  function sdoNodeByNumberPath(root: SdoNodeDocument | null, path: number[] | null) {
    if (!root || !path) return null;
    return path.reduce<SdoNodeDocument | null>((node, segment) => {
      if (!node) return null;
      return node.children?.[segment] ?? null;
    }, root);
  }

  function settingPathNames(root: SdoNodeDocument | null, path: number[]) {
    const names = root?.name ? [root.name] : ['菜单'];
    let node = root;
    for (const segment of path) {
      node = node?.children?.[segment] ?? null;
      if (!node) break;
      names.push(sdoNodeName(node, node.type === 0 ? '菜单' : '参数'));
    }
    return names;
  }

  function collectSettingParameters(node: SdoNodeDocument | null, basePath: number[], basePathNames: string[] = [], rawQuery = ''): SettingParameterRow[] {
    if (!node) return [];
    const rows: SettingParameterRow[] = [];
    const query = normalizeSettingSearch(rawQuery);
    function visit(current: SdoNodeDocument, path: number[], pathNames: string[]) {
      if (current.type === 1) {
        const handle = parseHandleParam(current.handle_param);
        const isReadonly = current.control_rw === 0 || current.control_rw === undefined;
        const isBooleanMonitor = isBooleanMonitorParameter(current);
        const usageHint = isReadonly && isBooleanMonitor
          ? '只读监测项，0/1 表示开关状态；本页可编辑配置定义，不能直接写入运行状态。'
          : isReadonly
            ? '只读参数；本页可编辑配置定义，不能直接写入运行值。'
            : '读写参数；可根据权限编辑配置定义。';
        const row: SettingParameterRow = {
          index: rows.length + 1,
          path,
          name: current.name || '-',
          menuPath: formatSettingPath(pathNames),
          pathNames,
          auth: sdoAuthLabel(current.user_auth),
          protocol: sdoProtocolLabel(current.control_protocol),
          frameId: formatHex(current.fid, 2),
          mainIndex: formatHex(current.mid, 4),
          subIndex: String(current.sid ?? ''),
          access: sdoAccessLabel(current.control_rw),
          maxValue: current.data_max ?? '',
          minValue: current.data_min ?? '',
          defaultValue: current.data_default ?? '',
          dataType: settingDataTypeLabel(current),
          bitStart: handle.bitStart,
          bitLength: handle.bitLength,
          preprocess: current.pre_handle_name ?? '原始数据',
          scale: current.pre_handle_scale ?? '',
          offset: current.pre_handle_offset ?? '',
          decimals: current.pre_handle_decimal_name ?? String(current.pre_handle_decimal ?? ''),
          isReadonly,
          isBooleanMonitor,
          usageHint,
        };
        const searchText = normalizeSettingSearch([
          row.name,
          row.menuPath,
          row.usageHint,
          row.auth,
          row.protocol,
          row.frameId,
          row.mainIndex,
          row.subIndex,
          row.access,
          row.dataType,
        ].join(' '));
        if (!query || searchText.includes(query)) {
          row.index = rows.length + 1;
          rows.push(row);
        }
        return;
      }
      const nextPathNames = current.type === 0
        ? [...pathNames, sdoNodeName(current, `菜单${path[path.length - 1] + 1}`)]
        : pathNames;
      (current.children ?? []).forEach((child, index) => visit(child, [...path, index], nextPathNames));
    }
    (node.children ?? []).forEach((child, index) => visit(child, [...basePath, index], basePathNames));
    return rows;
  }

  function realtimeFrames(kind: 'pdo_recv' | 'pdo_send') {
    return pdoFrames(kind);
  }

  function selectedRealtimeFrame() {
    if (selectedRealtimeFrameId === null) return null;
    const frames = realtimeFrames(selectedRealtimeKind);
    return frames.find((frame) => frame.id === selectedRealtimeFrameId) ?? null;
  }

  function selectedRealtimeFrameIndex() {
    if (selectedRealtimeFrameId === null) return -1;
    return realtimeFrames(selectedRealtimeKind).findIndex((frame) => frame.id === selectedRealtimeFrameId);
  }

  function advancedFrames(kind: 'pdo_recv' | 'pdo_send') {
    const document = pdoAdvancedDocument();
    return document?.[kind] ?? [];
  }

  function selectedAdvancedFrame() {
    if (selectedAdvancedFrameId === null) return null;
    return advancedFrames(selectedRealtimeKind).find((frame) => frame.id === selectedAdvancedFrameId) ?? null;
  }

  function selectedAdvancedFrameIndex() {
    if (selectedAdvancedFrameId === null) return -1;
    return advancedFrames(selectedRealtimeKind).findIndex((frame) => frame.id === selectedAdvancedFrameId);
  }

  function realtimeFrameTypeLabel(value?: number) {
    return value === 1 ? '扩展帧' : '标准帧';
  }

  function realtimeModeLabel(value?: number) {
    return ['按照字节取数据', '按照字节+bit位取数据', '按照bit位取数据'][value ?? 0] ?? '按照字节取数据';
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

  function settingColumnWidth(column: SettingParameterColumn) {
    return settingColumnWidths[column.key] ?? column.defaultWidth;
  }

  function settingTableMinWidth() {
    return settingParameterColumns.reduce((total, column) => total + settingColumnWidth(column), 0);
  }

  function resetSettingColumnWidths() {
    setSettingColumnWidths({});
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(settingColumnWidthStorageKey);
    }
  }

  function handleSettingColumnResizeStart(event: React.MouseEvent, column: SettingParameterColumn) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settingColumnWidth(column);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    let latestWidths = { ...settingColumnWidths };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = clampSettingColumnWidth(startWidth + moveEvent.clientX - startX, column);
      setSettingColumnWidths((current) => {
        const next = { ...current, [column.key]: nextWidth };
        latestWidths = next;
        return next;
      });
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      saveSettingColumnWidths(latestWidths);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }

  function renderSettingParameterCell(row: SettingParameterRow, column: SettingParameterColumn) {
    if (column.key === 'actions') {
      return (
        <>
          <button onClick={() => openSettingEditorDrawer(row.path)} title="修改参数配置定义，不写入当前运行状态" type="button">编辑定义</button>
          <button className="danger" onClick={() => {
            removeSdoNode(row.path);
            if (editingSettingPath && isSameOrDescendantPath(row.path, editingSettingPath)) {
              setEditingSettingPath(null);
            }
          }} type="button">删除</button>
        </>
      );
    }
    if (column.key === 'access') {
      return (
        <span className={`setting-access-chip ${row.isReadonly ? 'setting-access-chip--readonly' : 'setting-access-chip--readwrite'}`} title={row.usageHint}>
          {row.access}
        </span>
      );
    }
    const value = row[column.key];
    return column.key === 'name' || column.key === 'dataType' || column.key === 'preprocess'
      ? <span title={String(value)}>{value}</span>
      : value;
  }

  function visibleSettingEditorSections(node: SdoNodeDocument) {
    const nodeKind = node.type === 1 ? 'parameter' : 'menu';
    return settingEditorSections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.visibleFor === undefined || field.visibleFor === 'all' || field.visibleFor === nodeKind),
      }))
      .filter((section) => section.fields.length > 0);
  }

  function renderSettingEditorField(field: SettingEditorField, node: SdoNodeDocument, path: number[]) {
    const rawValue = node[field.field];
    const value = (rawValue ?? field.defaultValue) as string | number;
    if (field.kind === 'select') {
      const options = optionsWithCurrentValue(field.options ?? [], value);
      return (
        <label key={field.field}>
          {field.label}
          <select value={String(value)} onChange={(event) => updateSdoNode(path, field.field, typeof field.defaultValue === 'number' ? Number(event.target.value) : event.target.value)}>
            {options.map((option) => (
              <option key={`${field.field}-${option.value}`} value={String(option.value)}>{option.label}</option>
            ))}
          </select>
        </label>
      );
    }
    if (field.kind === 'number') {
      return (
        <label key={field.field}>
          {field.label}
          <input type="number" value={value} onChange={(event) => updateSdoNode(path, field.field, Number(event.target.value))} />
        </label>
      );
    }
    return (
      <label key={field.field}>
        {field.label}
        <input value={String(value)} onChange={(event) => updateSdoNode(path, field.field, event.target.value)} />
      </label>
    );
  }

  function addSdoMenu(parentPath: number[]) {
    const document = sdoDocument();
    if (!document) return;

    const parentNode = sdoNodeByNumberPath(document, parentPath);
    const nextIndex = parentNode?.children?.length ?? 0;
    const child: SdoNodeDocument = { type: 0, user_auth: 0, name_index: 0, name: `新菜单${nextIndex + 1}`, children: [] };
    updateSdoDocument(updateSdoNodeAtPath(document, parentPath, (node) => ({ ...node, children: [...(node.children ?? []), child] })));
    const nextPath = [...parentPath, nextIndex];
    setSelectedSettingPath(nextPath.join('/'));
    openSettingEditorDrawer(nextPath);
  }

  function addSdoParameter(parentPath: number[]) {
    const document = sdoDocument();
    if (!document) return;

    const parentNode = sdoNodeByNumberPath(document, parentPath);
    const nextIndex = parentNode?.children?.length ?? 0;
    const child: SdoNodeDocument = {
      type: 1,
      user_auth: 0,
      name_index: 0,
      name: `新参数${nextIndex + 1}`,
      children: [],
      control_protocol: 0,
      control_rw: 0,
      control_use_default: 0,
      control_use_min_max: 0,
      fid: 0,
      mid: 0,
      sid: 0,
      handle: 0,
      handle_name: '',
      handle_param: '',
      data_default: '',
      data_min: '',
      data_max: '',
      pre_handle: 0,
      pre_handle_name: '原始数据',
      pre_handle_scale: '',
      pre_handle_offset: '',
      pre_handle_decimal: 0,
      pre_handle_decimal_name: '',
    };
    updateSdoDocument(updateSdoNodeAtPath(document, parentPath, (node) => ({ ...node, children: [...(node.children ?? []), child] })));
    openSettingEditorDrawer([...parentPath, nextIndex]);
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
      setRefactorConfigPath(null);
      setRefactorConfigStatus(null);
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
      const mountedProject = await autoMountRefactorConfig(nextProject, nextProject.summary.path ?? path);
      acceptLoadedProject(mountedProject, path);
      void parseUiPreview(mountedProject.document, mountedProject.summary.path ?? path).then(setUiPreview);
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
      void refreshUnifiedProtocol(migrated.document);
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
      setSaveStatus('旧 .jcpro 的重构配置需要另存为 JSON；系统保存对话框只能在 Tauri 桌面应用中使用。');
      return false;
    }

    const sourcePath = loadedProject.summary.path ?? loadedProject.summary.name ?? 'project';
    const baseName = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'project';
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
      void refreshUnifiedProtocol(document);
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
      const validation = isLegacyJcproProject ? await validateProjectDocument(loadedProject.document) : savedProject.validation;
      const nextBaseline = isLegacyJcproProject ? cloneJson(loadedProject.document) : cloneJson(savedProject.document);
      setBaselineDocument(nextBaseline);
      applyLoadedProject(isLegacyJcproProject ? { ...loadedProject, validation } : savedProject, nextBaseline);
      updateRecentProjects(savedProject, loadedProject.summary.path);
      setShowSaveModal(false);
      setSaveStatus(isLegacyJcproProject && hasRefactorOnlyChanges ? '已保存 .jcpro 兼容段，并已导出重构专属 JSON。' : '已保存');
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
    const isRefactorSidecarSave = isLegacyJcproProject && hasRefactorOnlyChanges;
    const selected = await save({
      defaultPath: isRefactorSidecarSave ? currentName.replace(/\.[^.]+$/, '.refactor-config.json') : currentName,
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
        document: selected.toLowerCase().endsWith('.jcpro') ? stripRefactorOnlySections(loadedProject.document) : loadedProject.document,
      });
      acceptLoadedProject(report.project, selected);
      if (!selected.toLowerCase().endsWith('.jcpro')) {
        setRefactorConfigPath(null);
        setRefactorConfigStatus(null);
      }
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
    setRealtimeMode('simple');
    setSelectedRealtimeFrameId(null);
    onNavigate('realtime-data');
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
      const report = await buildProjectBinaryReport(loadedProject?.document ?? previewDocument, exportBatteryOptions);
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
        export_options: exportBatteryOptions,
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
        export_options: exportBatteryOptions,
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

  async function handleExportCanopenPackage() {
    setCanopenConvertStatus(null);
    setCanopenConversionReport(null);
    setCanopenExportDir(null);

    if (!loadedProject) {
      setCanopenConvertStatus('请先打开项目，再导出 CANopen 转换包。');
      return;
    }
    if (!isTauriRuntime()) {
      setCanopenConvertStatus('系统目录选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') return;

    setIsExportingCanopenPackage(true);
    try {
      const report = await exportCanopenPackage(selected, loadedProject.document);
      const exportDir = `${selected}\\canopen_export`;
      setCanopenConversionReport(report);
      setCanopenExportDir(exportDir);
      setCanopenConvertStatus(
        `已导出 CANopen 转换包：${report.files.length} 个文件，${report.nodes.length} 个节点，${report.warnings.length} 条提示。`,
      );
    } catch (error) {
      setCanopenConvertStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingCanopenPackage(false);
    }
  }

  const currentSdoDocument = sdoDocument();
  const currentPdoSimpleDocument = pdoSimpleDocument();
  const currentPdoAdvancedDocument = pdoAdvancedDocument();
  const currentLanguageDocument = languageDocument();
  const currentBatteryProtocolDocument = batteryProtocolDocument();
  const currentBatteryMonitorDocument = batteryMonitorDocument();
  const settingMenus = collectSettingMenus(currentSdoDocument, settingSearchQuery);
  const activeSettingPath = selectedSettingPath ?? settingMenus[0]?.key ?? null;
  const activeSettingPathNumbers = pathStringToNumbers(activeSettingPath);
  const activeSettingNode = sdoNodeByPath(currentSdoDocument, activeSettingPath);
  const activeSettingPathNames = settingPathNames(currentSdoDocument, activeSettingPathNumbers);
  const settingParameters = collectSettingParameters(activeSettingNode, activeSettingPathNumbers, activeSettingPathNames, settingSearchQuery);
  const readonlySettingParameterCount = settingParameters.filter((row) => row.isReadonly).length;
  const booleanMonitorParameterCount = settingParameters.filter((row) => row.isBooleanMonitor).length;
  const hasBooleanMonitorParameters = booleanMonitorParameterCount > 0;
  const editingSettingNode = sdoNodeByNumberPath(currentSdoDocument, editingSettingPath);
  const activeRealtimeFrame = selectedRealtimeFrame();
  const activeRealtimeFrameIndex = selectedRealtimeFrameIndex();
  const activeAdvancedFrame = selectedAdvancedFrame();
  const activeAdvancedFrameIndex = selectedAdvancedFrameIndex();
  const currentLegacyTableKind = activeLegacyTableKind();
  const currentSignalDictionary = signalDictionaryDocument();
  const currentPrivateProtocol = privateProtocolDocument();
  const currentProtocolMappings = protocolMappingsDocument();

  function renderSettingEditorDrawer() {
    if (!editingSettingPath || !editingSettingNode) return null;

    const editorPath = sdoNodeDocumentPath(editingSettingPath);
    const isMenu = editingSettingNode.type === 0;

    return (
      <div className="legacy-drawer-layer" role="presentation">
        <button className="legacy-drawer-backdrop" aria-label="关闭设置数据编辑面板" onClick={closeSettingEditorDrawer} type="button" />
        <aside className="legacy-drawer legacy-drawer--setting" role="dialog" aria-modal="true" aria-labelledby="setting-editor-drawer-title" aria-describedby="setting-editor-drawer-desc">
          <div className="legacy-drawer-header">
            <div>
              <strong id="setting-editor-drawer-title">{isMenu ? '菜单编辑' : '参数编辑'}：{editingSettingNode.name || '未命名'}</strong>
              <p id="setting-editor-drawer-desc">编辑设置数据定义，不写入设备当前运行状态。</p>
            </div>
            <button ref={settingDrawerCloseRef} aria-label="关闭设置数据编辑面板" onClick={closeSettingEditorDrawer} type="button">×</button>
          </div>
          <div className="legacy-drawer-body">
            <section className="legacy-edit-panel legacy-edit-panel--drawer">
              <div className="legacy-edit-panel-header">
                <strong>{isMenu ? '菜单定义' : '参数定义'}</strong>
                <div className="setting-editor-drawer-actions">
                  {isModifiedPath(editorPath) ? (
                    <button className="config-restore-button" onClick={() => restoreModifiedPath(editorPath)} type="button">恢复</button>
                  ) : null}
                </div>
              </div>
              <div className="legacy-edit-sections">
                {visibleSettingEditorSections(editingSettingNode).map((section) => (
                  <section className="legacy-edit-section" key={section.title}>
                    <div className="legacy-edit-section-title">{section.title}</div>
                    <div className="legacy-edit-grid legacy-edit-grid--sectioned">
                      {section.fields.map((field) => renderSettingEditorField(field, editingSettingNode, editingSettingPath))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    );
  }

  function renderAdvancedGlobalParamsPanel() {
    return (
      <section className="legacy-edit-panel legacy-edit-panel--drawer">
        <div className="legacy-edit-panel-header"><strong>全局变量</strong><button onClick={addPdoGlobalParam} type="button">新增</button></div>
        <div className="legacy-drawer-table-frame">
          <table className="legacy-data-table legacy-data-table--compact">
            <thead><tr><th /><th>参数ID</th><th>名称</th><th>默认值</th><th>保留</th><th>类型</th><th>内部变量</th><th>操作</th></tr></thead>
            <tbody>{currentPdoAdvancedDocument?.pdo_global_param.map((item, index) => (
              <tr className={isModifiedPath(['pdo_global_param', index]) ? 'config-entry-modified' : undefined} key={`global-${index}`}>
                <td>{index + 1}</td>
                <td><input value={item.param_id} onChange={(event) => updatePdoGlobalParam(index, 'param_id', event.target.value)} /></td>
                <td><input value={item.name} onChange={(event) => updatePdoGlobalParam(index, 'name', event.target.value)} /></td>
                <td><input value={item.def} onChange={(event) => updatePdoGlobalParam(index, 'def', event.target.value)} /></td>
                <td><input type="number" value={item.reserved} onChange={(event) => updatePdoGlobalParam(index, 'reserved', Number(event.target.value))} /></td>
                <td><input type="number" value={item.type} onChange={(event) => updatePdoGlobalParam(index, 'type', Number(event.target.value))} /></td>
                <td><input type="number" value={item.inner} onChange={(event) => updatePdoGlobalParam(index, 'inner', Number(event.target.value))} /></td>
                <td><button className="danger" onClick={() => removePdoGlobalParam(index)} type="button">删除</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderAdvancedConditionsPanel() {
    return (
      <section className="legacy-edit-panel legacy-edit-panel--drawer">
        <div className="legacy-edit-panel-header"><strong>条件表</strong><button onClick={addPdoCondition} type="button">新增</button></div>
        {(currentPdoAdvancedDocument?.pdo_condition ?? []).map((condition, conditionIndex) => (
          <div className="legacy-condition-row" key={`condition-${conditionIndex}`}>
            <label>参数 ID<input value={condition.param_id} onChange={(event) => updatePdoCondition(conditionIndex, 'param_id', event.target.value)} /></label>
            <label>处理方式<input type="number" value={condition.process} onChange={(event) => updatePdoCondition(conditionIndex, 'process', Number(event.target.value))} /></label>
            <button onClick={() => addPdoConditionInput(conditionIndex)} type="button">新增输入</button>
            <button className="danger" onClick={() => removePdoCondition(conditionIndex)} type="button">删除条件</button>
            {condition.data.map((input, inputIndex) => (
              <label key={`condition-input-${conditionIndex}-${inputIndex}`}>输入参数<input value={input.param_id} onChange={(event) => updatePdoConditionInput(conditionIndex, inputIndex, event.target.value)} /><button className="danger" onClick={() => removePdoConditionInput(conditionIndex, inputIndex)} type="button">删除</button></label>
            ))}
          </div>
        ))}
      </section>
    );
  }

  function renderAdvancedPdoDrawer() {
    if (!advancedPdoDrawerOpen) return null;

    return (
      <div className="legacy-drawer-layer" role="presentation">
        <button className="legacy-drawer-backdrop" aria-label="关闭高级配置编辑面板" onClick={closeAdvancedPdoDrawer} type="button" />
        <aside className="legacy-drawer" role="dialog" aria-modal="true" aria-labelledby="advanced-pdo-drawer-title">
          <div className="legacy-drawer-header">
            <div>
              <strong id="advanced-pdo-drawer-title">高级 CANopen 参数</strong>
              <p>编辑全局变量和条件表，同时保留主区域的帧/协议上下文。</p>
            </div>
            <button ref={advancedPdoDrawerCloseRef} aria-label="关闭高级 CANopen 参数面板" onClick={closeAdvancedPdoDrawer} type="button">×</button>
          </div>
          <div className="legacy-drawer-tabs" role="tablist" aria-label="高级 CANopen 参数分类">
            <button aria-selected={advancedPdoDrawerTab === 'global'} className={advancedPdoDrawerTab === 'global' ? 'active' : ''} onClick={() => setAdvancedPdoDrawerTab('global')} role="tab" type="button">全局变量</button>
            <button aria-selected={advancedPdoDrawerTab === 'condition'} className={advancedPdoDrawerTab === 'condition' ? 'active' : ''} onClick={() => setAdvancedPdoDrawerTab('condition')} role="tab" type="button">条件表</button>
          </div>
          <div className="legacy-drawer-body">
            {advancedPdoDrawerTab === 'global' ? renderAdvancedGlobalParamsPanel() : renderAdvancedConditionsPanel()}
          </div>
        </aside>
      </div>
    );
  }

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
            {currentLegacyTableKind ? (
              <>
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
                <span className="action-bar-sep" />
              </>
            ) : null}
            {(['realtime-data', 'battery-protocol', 'battery-monitor'] as string[]).includes(activeModule.key) ? (
              <button
                className="action-bar-btn action-bar-btn--secondary"
                disabled={!loadedProject || generatingTestKey !== null}
                onClick={() => {
                  if (!loadedProject) return;
                  const type: TestDataType = activeModule.key === 'realtime-data' && realtimeMode === 'simple' ? 'pdo-simple'
                    : activeModule.key === 'realtime-data' ? 'pdo-advanced'
                    : activeModule.key === 'battery-protocol' ? 'battery-protocol'
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
            {(['setting-data', 'realtime-data', 'battery-protocol', 'battery-monitor', 'language', 'signal-dictionary', 'private-protocol', 'protocol-mapping'] as string[]).includes(activeModule.key) ? (
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
              <button className="modal-btn-cancel" disabled={isSavingProject} onClick={cancelSaveProject} type="button">取消</button>
              <button className="modal-btn-confirm" disabled={isSavingProject} onClick={() => void confirmSaveProject()} type="button">
                {savingProjectAction === 'save' ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmGenerateType ? (
        <div className="modal-overlay" onClick={() => setConfirmGenerateType(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>确认生成测试数据</h3>
            <p>将使用 <strong>{testDataLabels[confirmGenerateType]}</strong> 模板覆盖当前配置，是否继续？</p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setConfirmGenerateType(null)} type="button">取消</button>
              <button className="modal-btn-confirm" onClick={confirmGenerateTestData} type="button">确认生成</button>
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
        {activeModule.key !== 'project' ? (
          <Breadcrumb activeKey={activeModule.key} modules={featureModules} onNavigate={onNavigate} />
        ) : null}
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
                    <button className="project-link-btn" disabled={isOpening} onClick={() => void handleMountRefactorConfig()} type="button">挂载重构配置</button>
                    <button className="project-link-btn" disabled={isOpening || !loadedProject} onClick={() => void handleCreateRefactorConfig()} type="button">
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
                {refactorConfigStatus ? <p className={refactorConfigPath ? 'text-success' : 'project-open-warning'}>{refactorConfigStatus}</p> : null}
                {compatibleMissingSections.length > 0 ? (
                  <p className="project-open-error">缺少兼容段：{compatibleMissingSections.join('、')}</p>
                ) : null}
                {!refactorConfigPath && sidecarMissingSections.length > 0 ? (
                  <p className="project-open-warning">重构专属段未在 .jcpro 中保存：{sidecarMissingSections.join('、')}。可通过“挂载重构配置”关联独立 JSON。</p>
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

        {activeModule.key === 'setting-data' ? (
          <>
            <section className={sidebarCollapsed ? 'legacy-data-page legacy-data-page--collapsed' : 'legacy-data-page'}>
            <div className="legacy-data-sidebar">
              <div className="legacy-data-sidebar-header">
                <div className="legacy-data-sidebar-title">菜单</div>
                <button className="legacy-sidebar-collapse-btn" onClick={() => setSidebarCollapsed((v) => !v)} type="button" title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}>
                  {sidebarCollapsed ? '▸' : '◂'}
                </button>
              </div>
              {!sidebarCollapsed ? (
                <div className="setting-menu-search">
                  <input
                    onChange={(event) => setSettingSearchQuery(event.target.value)}
                    placeholder="搜索菜单或参数，例如：开关、座椅、前进"
                    value={settingSearchQuery}
                  />
                  {settingSearchQuery ? <button onClick={() => setSettingSearchQuery('')} type="button">清空</button> : null}
                </div>
              ) : null}
              <div className="legacy-menu-list">
                {settingMenus.map((menu) => (
                  <button
                    className={[menu.key === activeSettingPath ? 'legacy-menu-item active' : 'legacy-menu-item', menu.isSearchMatch ? 'setting-menu-match' : ''].filter(Boolean).join(' ')}
                    key={menu.key}
                    onClick={() => setSelectedSettingPath(menu.key)}
                    style={{ paddingLeft: `${16 + menu.level * 22}px` }}
                    title={`${formatSettingPath(menu.pathNames)}｜参数 ${menu.parameterCount}`}
                    type="button"
                  >
                    <span className="legacy-menu-arrow">{menu.hasMenuChildren ? '▸' : ''}</span>
                    <span className="setting-menu-label">
                      <span className="setting-menu-main">{menu.name}</span>
                      <span className={menu.parameterCount > 0 ? 'setting-menu-count' : 'setting-menu-count setting-menu-count--empty'}>{menu.parameterCount}</span>
                    </span>
                  </button>
                ))}
                {settingMenus.length === 0 ? (
                  <div className="setting-menu-empty">{settingSearchQuery ? '没有匹配的菜单或参数。可试试“开关”“座椅”“前进”“P/S”。' : '暂无可显示菜单'}</div>
                ) : null}
              </div>
            </div>
            <div className="legacy-data-content">
              <div className="legacy-data-header">
                <div className="setting-data-heading">
                  <div className="setting-breadcrumb">
                    {activeSettingPathNames.map((name, index) => (
                      <span className="setting-breadcrumb-segment" key={`${name}-${index}`}>{name}</span>
                    ))}
                  </div>
                  <div className="setting-menu-summary">
                    <strong>{activeSettingNode?.name ?? '菜单'}</strong>
                    <span className="setting-summary-chip">{settingParameters.length} 个参数</span>
                    <span className="setting-summary-chip">{readonlySettingParameterCount} 个只读</span>
                    <span className="setting-summary-chip">{booleanMonitorParameterCount} 个 0/1 监测项</span>
                  </div>
                </div>
                <div className="legacy-data-actions">
                  <button disabled={!currentSdoDocument} onClick={() => addSdoMenu(activeSettingNode ? activeSettingPathNumbers : [])} type="button">新增菜单</button>
                  <button disabled={!activeSettingNode} onClick={() => openSettingEditorDrawer(activeSettingPathNumbers)} type="button">修改菜单</button>
                  <button disabled={!activeSettingNode} onClick={() => addSdoParameter(activeSettingPathNumbers)} type="button">新增参数</button>
                  <button onClick={resetSettingColumnWidths} type="button">重置列宽</button>
                  <button
                    className="danger"
                    disabled={!activeSettingNode}
                    onClick={() => {
                      removeSdoNode(activeSettingPathNumbers);
                      setSelectedSettingPath(null);
                      setEditingSettingPath(null);
                    }}
                    type="button"
                  >
                    删除菜单
                  </button>
                </div>
              </div>
              <div className="legacy-data-table-wrap">
                {hasBooleanMonitorParameters ? (
                  <div className="setting-help-card">
                    此菜单包含只读开关监测项。0/1 表示设备上报的开关状态；本页可编辑名称、索引、位段、预处理等配置定义，不能直接写入当前状态。
                  </div>
                ) : null}
                {activeSettingNode && settingParameters.length > 0 ? (
                  <table className="legacy-data-table" style={{ minWidth: settingTableMinWidth() }}>
                    <colgroup>
                      {settingParameterColumns.map((column) => (
                        <col key={column.key} style={{ width: settingColumnWidth(column) }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {settingParameterColumns.map((column) => (
                          <th key={column.key} className={column.align ? `text-${column.align}` : undefined}>
                            <span className="legacy-data-th-content">{column.label}</span>
                            <span
                              className="legacy-data-column-resizer"
                              onMouseDown={(event) => handleSettingColumnResizeStart(event, column)}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settingParameters.map((row) => (
                        <tr key={row.path.join('/')}>
                          {settingParameterColumns.map((column) => (
                            <td key={column.key} className={column.align ? `text-${column.align}` : undefined}>
                              {renderSettingParameterCell(row, column)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : activeSettingNode ? (
                  <div className="legacy-data-empty">
                    {settingSearchQuery ? '没有找到匹配的参数。可尝试搜索“开关”“座椅”“前进”“P/S”。' : '当前菜单下没有参数。请展开左侧其它菜单，或使用搜索查找具体参数。'}
                  </div>
                ) : (
                  <div className="legacy-data-empty">请先在项目管理中打开 .jcpro 项目文件，然后进入“设置数据”查看菜单和参数。</div>
                )}
              </div>
            </div>
            </section>
            {renderSettingEditorDrawer()}
          </>
        ) : null}

        {activeModule.key === 'realtime-data' ? (
          <section className={sidebarCollapsed ? 'legacy-data-page legacy-data-page--collapsed' : 'legacy-data-page'}>
            <div className="legacy-data-sidebar">
              <div className="legacy-data-sidebar-header">
                <div className="legacy-data-sidebar-title">菜单</div>
                <button className="legacy-sidebar-collapse-btn" onClick={() => setSidebarCollapsed((v) => !v)} type="button" title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}>
                  {sidebarCollapsed ? '▸' : '◂'}
                </button>
              </div>
              <div className="legacy-menu-list">
                {(['pdo_recv', 'pdo_send'] as const).map((kind) => (
                  <div key={kind}>
                    <button
                      className={selectedRealtimeKind === kind ? 'legacy-menu-item active' : 'legacy-menu-item'}
                      onClick={() => {
                        setSelectedRealtimeKind(kind);
                        setSelectedRealtimeFrameId(null);
                        setSelectedAdvancedFrameId(null);
                      }}
                      type="button"
                    >
                      <span className="legacy-menu-arrow">▾</span>
                      <span>{kind === 'pdo_recv' ? '接收表' : '发送表'}</span>
                    </button>
                    {selectedRealtimeKind === kind ? (realtimeMode === 'simple' ? realtimeFrames(kind) : advancedFrames(kind)).map((frame) => {
                      const isActive = realtimeMode === 'simple' ? selectedRealtimeFrameId === frame.id : selectedAdvancedFrameId === frame.id;
                      return (
                        <button
                          className={isActive ? 'legacy-menu-item child active' : 'legacy-menu-item child'}
                          key={`${realtimeMode}-${kind}-${frame.id}`}
                          onClick={() => {
                            setSelectedRealtimeKind(kind);
                            if (realtimeMode === 'simple') setSelectedRealtimeFrameId(frame.id);
                            else setSelectedAdvancedFrameId(frame.id);
                          }}
                          type="button"
                        >
                          {formatFrameIdPadded(frame.id)}
                        </button>
                      );
                    }) : null}
                  </div>
                ))}
                {realtimeMode === 'advanced' ? (
                  <>
                    <button
                      className={advancedPdoDrawerOpen && advancedPdoDrawerTab === 'global' ? 'legacy-menu-item child active' : 'legacy-menu-item child'}
                      onClick={() => {
                        setSelectedAdvancedFrameId(null);
                        openAdvancedPdoDrawer('global');
                      }}
                      type="button"
                    >
                      全局变量
                    </button>
                    <button
                      className={advancedPdoDrawerOpen && advancedPdoDrawerTab === 'condition' ? 'legacy-menu-item child active' : 'legacy-menu-item child'}
                      onClick={() => {
                        setSelectedAdvancedFrameId(null);
                        openAdvancedPdoDrawer('condition');
                      }}
                      type="button"
                    >
                      条件表
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="legacy-data-content">
              <div className="legacy-data-header">
                <div className="legacy-data-header-left">
                  <strong>{selectedRealtimeKind === 'pdo_recv' ? '菜单->接收表' : '菜单->发送表'}（{realtimeMode === 'simple' ? '简化配置' : '高级配置'}）</strong>
                  <div className="legacy-mode-tabs-inline">
                    <button className={realtimeMode === 'simple' ? 'active' : ''} onClick={() => setRealtimeMode('simple')} type="button">简化配置</button>
                    <button className={realtimeMode === 'advanced' ? 'active' : ''} onClick={() => setRealtimeMode('advanced')} type="button">高级配置</button>
                  </div>
                </div>
                <div className="legacy-data-actions">
                  <button onClick={() => realtimeMode === 'simple' ? addPdoFrame(selectedRealtimeKind) : addPdoAdvancedFrame(selectedRealtimeKind)} type="button">新增帧ID</button>
                  <button disabled={realtimeMode === 'simple' ? !activeRealtimeFrame : !activeAdvancedFrame} onClick={() => {
                    if (realtimeMode === 'simple' && activeRealtimeFrameIndex >= 0) addPdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex);
                    if (realtimeMode === 'advanced' && activeAdvancedFrameIndex >= 0) addPdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex);
                  }} type="button">新增协议</button>
                  {realtimeMode === 'advanced' ? (
                    <>
                      <button onClick={() => {
                        addPdoGlobalParam();
                        openAdvancedPdoDrawer('global');
                      }} type="button">新增全局变量</button>
                      <button onClick={() => {
                        addPdoCondition();
                        openAdvancedPdoDrawer('condition');
                      }} type="button">新增条件</button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="legacy-data-table-wrap">
                {!currentPdoSimpleDocument && !currentPdoAdvancedDocument ? (
                  <div className="legacy-data-empty">请先在项目管理中打开 .jcpro 项目文件</div>
                ) : realtimeMode === 'simple' ? (
                  selectedRealtimeFrameId === null ? (
                    <table className="legacy-data-table">
                      <thead><tr><th /><th>帧ID</th><th>帧类型</th><th>帧描述</th><th>数据项</th><th>操作</th></tr></thead>
                      <tbody>
                        {realtimeFrames(selectedRealtimeKind).map((frame, index) => {
                          const framePath: JsonPath = ['pdo_simple_send_recv', selectedRealtimeKind, index];
                          return (
                            <tr className={isModifiedPath(framePath) ? 'config-entry-modified' : undefined} key={`${selectedRealtimeKind}-frame-${index}`}>
                              <td>{index + 1}</td>
                              <td><input inputMode="text" value={formatFrameId(frame.id)} onChange={(event) => updatePdoFrameId(selectedRealtimeKind, index, event.target.value)} /></td>
                              <td><select value={frame.type} onChange={(event) => updatePdoFrame(selectedRealtimeKind, index, 'type', Number(event.target.value))}><option value={0}>标准帧</option><option value={1}>扩展帧</option></select></td>
                              <td><input value={frame.desc} onChange={(event) => updatePdoFrame(selectedRealtimeKind, index, 'desc', event.target.value)} /></td>
                              <td>{frame.data.length}</td>
                              <td>
                                <button onClick={() => setSelectedRealtimeFrameId(frame.id)} type="button">协议</button>
                                {isModifiedPath(framePath) ? <button onClick={() => restoreModifiedPath(framePath)} type="button">恢复</button> : null}
                                <button className="danger" onClick={() => removePdoFrame(selectedRealtimeKind, index)} type="button">删除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : activeRealtimeFrame && activeRealtimeFrameIndex >= 0 ? (
                    <table className="legacy-data-table">
                      <thead><tr><th /><th>参数名称</th><th>读取方式</th><th>bit开始位置</th><th>bit长度</th><th>参数索引</th><th>操作</th></tr></thead>
                      <tbody>
                        {activeRealtimeFrame.data.map((signal, index) => {
                          const signalPath: JsonPath = ['pdo_simple_send_recv', selectedRealtimeKind, activeRealtimeFrameIndex, 'data', index];
                          const isJumpTarget = pdoJumpTarget === signal.pdo_param_index;
                          return (
                            <tr
                              className={[isJumpTarget ? 'pdo-row-highlight' : '', isModifiedPath(signalPath) ? 'config-entry-modified' : ''].filter(Boolean).join(' ') || undefined}
                              key={`${activeRealtimeFrame.id}-${index}`}
                              ref={isJumpTarget ? (element) => { pdoJumpRowRef.current = element; } : undefined}
                            >
                              <td>{index + 1}</td>
                              <td><input value={signal.pdo_param_name || ''} onChange={(event) => updatePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index, 'pdo_param_name', event.target.value)} /></td>
                              <td><select value={signal.show_type} onChange={(event) => updatePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index, 'show_type', Number(event.target.value))}><option value={0}>按照字节取数据</option><option value={1}>按照字节+bit位取数据</option><option value={2}>按照bit位取数据</option></select></td>
                              <td><input type="number" value={signal.pos} onChange={(event) => updatePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index, 'pos', Number(event.target.value))} /></td>
                              <td><input type="number" value={signal.len} onChange={(event) => updatePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index, 'len', Number(event.target.value))} /></td>
                              <td><input type="number" value={signal.pdo_param_index} onChange={(event) => updatePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index, 'pdo_param_index', Number(event.target.value))} /></td>
                              <td>
                                {isModifiedPath(signalPath) ? <button onClick={() => restoreModifiedPath(signalPath)} type="button">恢复</button> : null}
                                <button className="danger" onClick={() => removePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index)} type="button">删除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <div className="legacy-data-empty">请选择或新增 PDO 帧</div>
                ) : (
                  <div className="legacy-advanced-main">
                    <div className="legacy-advanced-toolbar">
                      <div className="legacy-advanced-summary">
                        <strong>高级配置</strong>
                        <span>全局变量 {currentPdoAdvancedDocument?.pdo_global_param.length ?? 0} 项</span>
                        <span>条件 {currentPdoAdvancedDocument?.pdo_condition.length ?? 0} 项</span>
                        <span>{selectedAdvancedFrameId === null ? '当前：帧列表' : `当前：${formatFrameIdPadded(selectedAdvancedFrameId)} 协议`}</span>
                      </div>
                      <div className="legacy-advanced-actions">
                        <button onClick={() => openAdvancedPdoDrawer('global')} type="button">管理全局变量</button>
                        <button onClick={() => openAdvancedPdoDrawer('condition')} type="button">管理条件表</button>
                      </div>
                    </div>
                    {selectedAdvancedFrameId === null ? (
                      <table className="legacy-data-table">
                        <thead><tr><th /><th>帧ID</th><th>帧类型</th><th>帧描述</th><th>数据项</th><th>操作</th></tr></thead>
                        <tbody>
                          {advancedFrames(selectedRealtimeKind).map((frame, index) => (
                            <tr className={isModifiedPath([selectedRealtimeKind, index]) ? 'config-entry-modified' : undefined} key={`advanced-frame-${selectedRealtimeKind}-${index}`}>
                              <td>{index + 1}</td>
                              <td><input inputMode="text" value={formatFrameId(frame.id)} onChange={(event) => updatePdoAdvancedFrameId(selectedRealtimeKind, index, event.target.value)} /></td>
                              <td><input type="number" value={frame.type} onChange={(event) => updatePdoAdvancedFrame(selectedRealtimeKind, index, 'type', Number(event.target.value))} /></td>
                              <td><input value={frame.desc} onChange={(event) => updatePdoAdvancedFrame(selectedRealtimeKind, index, 'desc', event.target.value)} /></td>
                              <td>{frame.data.length}</td>
                              <td><button onClick={() => setSelectedAdvancedFrameId(frame.id)} type="button">协议</button><button className="danger" onClick={() => removePdoAdvancedFrame(selectedRealtimeKind, index)} type="button">删除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : activeAdvancedFrame && activeAdvancedFrameIndex >= 0 ? (
                      <table className="legacy-data-table">
                        <thead><tr><th /><th>参数ID</th><th>位置</th><th>长度</th><th>显示类型</th><th>句柄</th><th>句柄参数</th><th>操作</th></tr></thead>
                        <tbody>
                          {activeAdvancedFrame.data.map((signal, index) => (
                            <tr className={isModifiedPath([selectedRealtimeKind, activeAdvancedFrameIndex, 'data', index]) ? 'config-entry-modified' : undefined} key={`advanced-signal-${index}`}>
                              <td>{index + 1}</td>
                              <td><input value={signal.param_id} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'param_id', event.target.value)} /></td>
                              <td><input type="number" value={signal.pos} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'pos', Number(event.target.value))} /></td>
                              <td><input type="number" value={signal.len} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'len', Number(event.target.value))} /></td>
                              <td><input type="number" value={signal.show_type} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'show_type', Number(event.target.value))} /></td>
                              <td><input type="number" value={signal.handle} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'handle', Number(event.target.value))} /></td>
                              <td><input value={signal.handle_param} onChange={(event) => updatePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index, 'handle_param', event.target.value)} /></td>
                              <td><button className="danger" onClick={() => removePdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex, index)} type="button">删除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div className="legacy-data-empty">请选择或新增高级 PDO 帧</div>}
                    {renderAdvancedPdoDrawer()}
                  </div>
                )}
              </div>
            </div>
          </section>
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
                  <strong>{tableConfigSections[currentLegacyTableKind]}</strong>
                </div>
              </div>
            ) : null}
            {tableExportStatus ? <p className="config-helper-text">{tableExportStatus}</p> : null}
          </section>
        ) : null}

        {activeModule.key === 'battery-protocol' ? (
          <section className="table-spec-card">
            <div className="private-protocol-header">
              <div className="private-protocol-header-text">
                <h2>锂电协议</h2>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isExportingBatteryProtocol} onClick={() => void handleExportBatteryProtocol()} type="button">
                  {isExportingBatteryProtocol ? '导出中...' : '导出配置'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryProtocol} onClick={() => void handleImportBatteryProtocol()} type="button">
                  {isImportingBatteryProtocol ? '导入中...' : '导入配置'}
                </button>
                <span className="action-bar-sep" />
                <button disabled={!loadedProject || isExportingBatteryCsv} onClick={() => void handleExportBatteryFramesCsv()} type="button">
                  {isExportingBatteryCsv ? '导出中...' : '导出帧 CSV'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryCsv} onClick={() => void handleImportBatteryFramesCsv()} type="button">
                  {isImportingBatteryCsv ? '导入中...' : '导入帧 CSV'}
                </button>
                <button disabled={!loadedProject || isExportingBatteryCsv} onClick={() => void handleExportBatterySignalsCsv()} type="button">
                  {isExportingBatteryCsv ? '导出中...' : '导出信号 CSV'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryCsv} onClick={() => void handleImportBatterySignalsCsv()} type="button">
                  {isImportingBatteryCsv ? '导入中...' : '导入信号 CSV'}
                </button>
                <span className="action-bar-sep" />
                <button disabled={!loadedProject || isExportingBatteryDbc} onClick={() => void handleExportBatteryDbc()} type="button">
                  {isExportingBatteryDbc ? '导出中...' : '导出 DBC'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryDbc} onClick={() => void handleImportBatteryDbc()} type="button">
                  {isImportingBatteryDbc ? '导入中...' : '导入 DBC'}
                </button>
              </div>
            </div>
            {batteryProtocolExportStatus ? <p className="config-helper-text">{batteryProtocolExportStatus}</p> : null}
            {batteryProtocolImportStatus ? <p className="config-helper-text">{batteryProtocolImportStatus}</p> : null}
            {batteryCsvStatus ? <p className="config-helper-text">{batteryCsvStatus}</p> : null}
            {batteryDbcStatus ? <p className="config-helper-text">{batteryDbcStatus}</p> : null}
            {loadedProject ? (
              <div className="pdo-simple-editor battery-monitor-editor">
                <div className="config-summary-strip">
                  <article><span>帧</span><strong>{currentBatteryProtocolDocument.frames.length}</strong></article>
                  <article><span>信号</span><strong>{currentBatteryProtocolDocument.signals.length}</strong></article>
                  <article><span>写回段落</span><strong>battery_protocol</strong></article>
                </div>
                <div className="battery-config-row">
                  <label title="帧数据的默认超时时间（单位：tick），各帧可单独覆盖">默认超时 tick<input type="number" value={currentBatteryProtocolDocument.default_timeout_ticks ?? 200} onChange={(event) => updateBatteryProtocolField('default_timeout_ticks', Number(event.target.value))} /></label>
                </div>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>锂电 CAN 帧（{currentBatteryProtocolDocument.frames.length}）</strong><button onClick={addBatteryFrame} type="button">新增帧</button></div>
                  {currentBatteryProtocolDocument.frames.map((frame, frameIndex) => (
                    <article className={isModifiedPath(['battery_protocol', 'frames', frameIndex]) ? 'pdo-frame-card battery-frame-card config-entry-modified' : 'pdo-frame-card battery-frame-card'} key={`${frame.frame_key}-${frameIndex}`}>
                      <div className="battery-frame-grid">
                        <label title="帧的唯一标识键名，用于信号和显示项引用">帧 key<input value={frame.frame_key} onChange={(event) => updateBatteryFrame(frameIndex, 'frame_key', event.target.value)} /></label>
                        <label title="CAN 帧 ID，支持十进制或 0x 开头的十六进制格式">帧 ID<input inputMode="text" value={formatFrameId(frame.can_id)} onChange={(event) => updateBatteryFrameId(frameIndex, event.target.value)} /></label>
                        <label title="标准帧使用 11 位 CAN ID，扩展帧使用 29 位 CAN ID">帧类型<select value={frame.type} onChange={(event) => updateBatteryFrame(frameIndex, 'type', Number(event.target.value))}><option value={0}>标准帧</option><option value={1}>扩展帧</option></select></label>
                        <label title="该帧的超时时间（tick），留空则使用上方默认值">超时 tick<input type="number" value={frame.timeout_ticks ?? currentBatteryProtocolDocument.default_timeout_ticks} onChange={(event) => updateBatteryFrame(frameIndex, 'timeout_ticks', Number(event.target.value))} /></label>
                        <label title="帧的描述说明">描述<input value={frame.desc ?? ''} onChange={(event) => updateBatteryFrame(frameIndex, 'desc', event.target.value)} /></label>
                      </div>
                      <div className="battery-frame-actions">
                        {isModifiedPath(['battery_protocol', 'frames', frameIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_protocol', 'frames', frameIndex])} type="button">恢复帧</button> : null}
                        <button className="danger" onClick={() => removeBatteryFrame(frameIndex)} type="button">删除帧</button>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>锂电信号（{currentBatteryProtocolDocument.signals.length}）</strong><button onClick={addBatterySignal} type="button">新增信号</button></div>
                  <div className="config-table-frame"><table className="config-table"><thead><tr><th title="信号的唯一标识键名">key</th><th title="信号的中文显示名称">名称</th><th title="信号在帧数据中的起始 bit 位置">起始位</th><th title="信号占用的 bit 长度">长度</th><th title="字节序：Intel(小端) / Motorola(大端)">字节序</th><th title="数据类型：U8（无符号8位）/ U16（无符号16位）/ U32（无符号32位）/ I16（有符号16位）/ U32（时间打包）">类型</th><th title="缩放系数：实际值 = 原始值 × 系数 + 偏移">系数</th><th title="偏移量：实际值 = 原始值 × 系数 + 偏移">偏移</th><th title="物理最小值">最小值</th><th title="物理最大值">最大值</th><th title="物理单位">单位</th><th title="DBC 接收节点">接收节点</th><th title="信号注释">注释</th><th title="信号所属的 CAN 帧">帧</th><th>操作</th></tr></thead><tbody>
                    {currentBatteryProtocolDocument.signals.map((signal, signalIndex) => (
                      <tr className={isModifiedPath(['battery_protocol', 'signals', signalIndex]) ? 'config-entry-modified' : undefined} key={`${signal.signal_key}-${signalIndex}`}>
                        <td><input value={signal.signal_key} onChange={(event) => updateBatterySignal(signalIndex, 'signal_key', event.target.value)} /></td>
                        <td><input value={signal.name} onChange={(event) => updateBatterySignal(signalIndex, 'name', event.target.value)} /></td>
                        <td><input type="number" value={signal.pos} onChange={(event) => updateBatterySignal(signalIndex, 'pos', Number(event.target.value))} /></td>
                        <td><input type="number" value={signal.len} onChange={(event) => updateBatterySignal(signalIndex, 'len', Number(event.target.value))} /></td>
                        <td><select value={signal.show_type} onChange={(event) => updateBatterySignal(signalIndex, 'show_type', Number(event.target.value))}><option value={0}>Intel(小端)</option><option value={1}>Motorola(大端)</option><option value={2}>按位</option></select></td>
                        <td><select value={signal.type} onChange={(event) => updateBatterySignal(signalIndex, 'type', Number(event.target.value))}><option value={0}>U8（无符号8位）</option><option value={1}>U16（无符号16位）</option><option value={2}>U32（无符号32位）</option><option value={10}>I16（有符号16位）</option><option value={20}>U32（时间打包）</option></select></td>
                        <td><input type="number" step="any" value={signal.factor ?? 1} onChange={(event) => updateBatterySignal(signalIndex, 'factor', Number(event.target.value))} /></td>
                        <td><input type="number" step="any" value={signal.offset ?? 0} onChange={(event) => updateBatterySignal(signalIndex, 'offset', Number(event.target.value))} /></td>
                        <td><input type="number" step="any" value={signal.min ?? 0} onChange={(event) => updateBatterySignal(signalIndex, 'min', Number(event.target.value))} /></td>
                        <td><input type="number" step="any" value={signal.max ?? 0} onChange={(event) => updateBatterySignal(signalIndex, 'max', Number(event.target.value))} /></td>
                        <td><input value={signal.unit ?? ''} onChange={(event) => updateBatterySignal(signalIndex, 'unit', event.target.value)} /></td>
                        <td><input value={signal.receiver ?? 'dbc_export'} onChange={(event) => updateBatterySignal(signalIndex, 'receiver', event.target.value)} /></td>
                        <td><input value={signal.comment ?? ''} onChange={(event) => updateBatterySignal(signalIndex, 'comment', event.target.value)} /></td>
                        <td><select value={signal.frame_key} onChange={(event) => updateBatterySignal(signalIndex, 'frame_key', event.target.value)}>{currentBatteryProtocolDocument.frames.map((frame) => <option key={frame.frame_key} value={frame.frame_key}>{frame.frame_key}</option>)}</select></td>
                        <td>{isModifiedPath(['battery_protocol', 'signals', signalIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_protocol', 'signals', signalIndex])} type="button">恢复</button> : null}<button className="danger" onClick={() => removeBatterySignal(signalIndex)} type="button">删除</button></td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </section>
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'battery-monitor' ? (
          <section className="table-spec-card">
            <div className="private-protocol-header">
              <div className="private-protocol-header-text">
                <h2>锂电监控显示配置</h2>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isExportingBatteryMonitor} onClick={() => void handleExportBatteryMonitor()} type="button">
                  {isExportingBatteryMonitor ? '导出中...' : '导出配置'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryMonitor} onClick={() => void handleImportBatteryMonitor()} type="button">
                  {isImportingBatteryMonitor ? '导入中...' : '导入配置'}
                </button>
                <span className="action-bar-sep" />
                <button disabled={!loadedProject || isExportingBatteryCsv} onClick={() => void handleExportBatteryItemsCsv()} type="button">
                  {isExportingBatteryCsv ? '导出中...' : '导出显示项 CSV'}
                </button>
                <button disabled={!loadedProject || isImportingBatteryCsv} onClick={() => void handleImportBatteryItemsCsv()} type="button">
                  {isImportingBatteryCsv ? '导入中...' : '导入显示项 CSV'}
                </button>
              </div>
            </div>
            {batteryMonitorExportStatus ? <p className="config-helper-text">{batteryMonitorExportStatus}</p> : null}
            {batteryMonitorImportStatus ? <p className="config-helper-text">{batteryMonitorImportStatus}</p> : null}
            {batteryCsvStatus ? <p className="config-helper-text">{batteryCsvStatus}</p> : null}
            {loadedProject ? (
              <div className="pdo-simple-editor battery-monitor-editor">
                <div className="config-summary-strip">
                  <article><span>状态</span><strong>{currentBatteryMonitorDocument.enabled ? '启用' : '停用'}</strong></article>
                  <article><span>显示项</span><strong>{currentBatteryMonitorDocument.items.filter((item) => item.enabled).length} / {currentBatteryMonitorDocument.items.length}</strong></article>
                  <article><span>写回段落</span><strong>battery_monitor_info</strong></article>
                </div>
                <div className="battery-config-row">
                  <label title="启用或停用锂电监控功能">启用<select value={currentBatteryMonitorDocument.enabled ? 1 : 0} onChange={(event) => updateBatteryMonitorField('enabled', Number(event.target.value) === 1)}><option value={1}>启用</option><option value={0}>停用</option></select></label>
                  <label title="每页显示的锂电数据条数">每页数量<input type="number" value={currentBatteryMonitorDocument.page_size ?? 4} onChange={(event) => updateBatteryMonitorField('page_size', Number(event.target.value))} /></label>
                </div>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar"><strong>显示项（{currentBatteryMonitorDocument.items.length}）</strong><button onClick={addBatteryItem} type="button">新增显示项</button></div>
                  <div className="config-table-frame"><table className="config-table"><thead><tr><th title="是否在界面中显示该项">启用</th><th title="显示顺序，数值越小越靠前">顺序</th><th title="显示项的唯一标识键名">key</th><th title="关联的信号，选择后显示该信号的数据">信号</th><th title="国际化键名，用于多语言显示名称">名称key</th><th title="显示单位">单位</th><th title="数据格式化方式（线性/布尔文本/十六进制/时间等）">格式</th><th title="显示值的偏移量：显示值 = 原始值 × 缩放 + 偏移">偏移</th><th title="原始值与显示值的缩放比例：显示值 = 原始值 × 分子/分母 + 偏移">缩放</th><th title="保留的小数位数">小数</th><th title="关联的有效性判断帧，用于检测数据是否超时">有效帧</th><th>操作</th></tr></thead><tbody>
                    {currentBatteryMonitorDocument.items.map((item, itemIndex) => (
                      <tr className={isModifiedPath(['battery_monitor_info', 'items', itemIndex]) ? 'config-entry-modified' : undefined} key={`${item.item_key}-${itemIndex}`}>
                        <td><input checked={item.enabled} type="checkbox" onChange={(event) => updateBatteryItem(itemIndex, 'enabled', event.target.checked)} /></td>
                        <td><input type="number" value={item.order} onChange={(event) => updateBatteryItem(itemIndex, 'order', Number(event.target.value))} /></td>
                        <td><input value={item.item_key} onChange={(event) => updateBatteryItem(itemIndex, 'item_key', event.target.value)} /></td>
                        <td><select value={item.signal_key} onChange={(event) => updateBatteryItem(itemIndex, 'signal_key', event.target.value)}>{(currentBatteryProtocolDocument?.signals ?? []).map((signal) => <option key={signal.signal_key} value={signal.signal_key}>{signal.signal_key}</option>)}</select></td>
                        <td><input value={item.name_key} onChange={(event) => updateBatteryItem(itemIndex, 'name_key', event.target.value)} /></td>
                        <td><input value={item.unit} onChange={(event) => updateBatteryItem(itemIndex, 'unit', event.target.value)} /></td>
                        <td><select value={item.formatter?.kind ?? 'linear'} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'kind', event.target.value)}><option value="linear">线性</option><option value="bool_text">布尔文本</option><option value="hex">十六进制</option><option value="packed_time_0p1h">0.1H时间</option><option value="linear_u8_wrap">线性后uint8截断</option><option value="packed_time_legacy_discharge_0p1h">旧版放电时间</option></select></td>
                        <td><input type="number" value={item.formatter?.offset ?? 0} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'offset', Number(event.target.value))} /></td>
                        <td><input type="number" value={item.formatter?.scale_num ?? 1} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'scale_num', Number(event.target.value))} />/<input type="number" value={item.formatter?.scale_den ?? 1} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'scale_den', Number(event.target.value))} /></td>
                        <td><input type="number" value={item.formatter?.decimals ?? 0} onChange={(event) => updateBatteryItemFormatter(itemIndex, 'decimals', Number(event.target.value))} /></td>
                        <td><select value={item.validity?.frame_key ?? ''} onChange={(event) => updateBatteryItemValidity(itemIndex, 'frame_key', event.target.value)}>{(currentBatteryProtocolDocument?.frames ?? []).map((frame) => <option key={frame.frame_key} value={frame.frame_key}>{frame.frame_key}</option>)}</select></td>
                        <td>{isModifiedPath(['battery_monitor_info', 'items', itemIndex]) ? <button className="config-restore-button" onClick={() => restoreModifiedPath(['battery_monitor_info', 'items', itemIndex])} type="button">恢复</button> : null}<button className="danger" onClick={() => removeBatteryItem(itemIndex)} type="button">删除</button></td>
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
                  <article><span>已生成帧</span><strong>{canTestData.canTestFrames.length}</strong></article>
                  <article><span>测试用例</span><strong>{canTestData.canTestCoverage?.caseCount ?? canTestData.canTestCases.length}</strong></article>
                  <article><span>信号覆盖</span><strong>{canTestData.canTestCoverage?.signalCount ?? 0}</strong></article>
                  <article><span>设置条目</span><strong>{canTestData.canTestCoverage?.settingEntryCount ?? canTestData.canTestSettingEntries.length}</strong></article>
                  <article><span>默认周期</span><strong>{canTestData.canTestDefaultCycle} ms</strong></article>
                </div>
                <div className="pdo-frame-grid">
                  <label>生成模式
                    <select value={canTestData.canTestProfile} onChange={(e) => canTestData.setCanTestProfile(e.target.value as CanTestProfile)}>
                      <option value="smoke">快速冒烟</option>
                      <option value="boundary">边界覆盖</option>
                      <option value="fault">异常注入</option>
                      <option value="regression">全量回归</option>
                    </select>
                  </label>
                  <label>默认周期(ms)<input type="number" value={canTestData.canTestDefaultCycle} onChange={(e) => canTestData.setCanTestDefaultCycle(Number(e.target.value))} /></label>
                  {canTestData.canTestCases.length > 0 ? (
                    <label>当前用例
                      <select value={canTestData.selectedCanTestCaseIndex} onChange={(e) => canTestData.selectCanTestCase(Number(e.target.value))}>
                        {canTestData.canTestCases.map((testCase, index) => (
                          <option key={testCase.caseId} value={index}>{testCase.caseId} · {testCase.title}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="config-table-toolbar" style={{ gap: 8 }}>
                  <button disabled={canTestData.isGeneratingCanTest} onClick={() => void canTestData.generate(loadedProject)} type="button">
                    {canTestData.isGeneratingCanTest ? '生成中...' : '⚡ 生成'}
                  </button>
                  <button disabled={canTestData.canTestFrames.length === 0} onClick={() => void canTestData.exportTxt(loadedProject)} type="button">📤 导出纯帧 TXT</button>
                  <button disabled={canTestData.canTestFrames.length === 0} onClick={() => void canTestData.exportCsv(loadedProject)} type="button">📤 导出 CSV</button>
                  <span className="action-bar-sep" />
                  <button onClick={() => void canTestData.importConfig()} type="button">📥 导入配置</button>
                  <button disabled={canTestData.canTestFrames.length === 0} onClick={() => void canTestData.exportConfig()} type="button">📤 导出说明 JSON</button>
                </div>
                {canTestData.canTestCoverage ? (
                  <div className="config-table-toolbar" style={{ gap: 8, marginTop: 6 }}>
                    <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                      场景：{canTestData.canTestCoverage.coveredScenarios.join(' / ') || '无'}
                    </span>
                    <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                      帧次：{canTestData.canTestCoverage.generatedFrameCount}
                    </span>
                    <span style={{ fontSize: '0.85em', opacity: 0.75 }}>
                      设置条目次：{canTestData.canTestCoverage.generatedSettingEntryCount}
                    </span>
                  </div>
                ) : null}
                {canTestData.canTestWarnings.length > 0 ? (
                  <div className="project-open-error" style={{ marginTop: 8 }}>
                    {canTestData.canTestWarnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
                    {canTestData.canTestWarnings.length > 3 ? <p>还有 {canTestData.canTestWarnings.length - 3} 条警告，已写入导出配置。</p> : null}
                  </div>
                ) : null}
                {canTestData.canTestFrames.length > 0 || canTestData.canTestSettingEntries.length > 0 ? (
                  <>
                    {canTestData.canTestSettingEntries.length > 0 ? (
                      <div className="config-table-frame" style={{ marginBottom: 10 }}>
                        <table className="config-table">
                          <thead>
                            <tr>
                              <th>设置项</th>
                              <th>菜单路径</th>
                              <th>帧ID</th>
                              <th>主索引</th>
                              <th>子索引</th>
                              <th>权限</th>
                              <th>类型</th>
                              <th>位置</th>
                              <th>角色</th>
                              <th>测试值</th>
                              <th>范围</th>
                            </tr>
                          </thead>
                          <tbody>
                            {canTestData.canTestSettingEntries.map((entry, entryIndex) => (
                              <tr key={`${entry.index}-${entry.subindex}-${entry.role}-${entryIndex}`}>
                                <td>{entry.name}</td>
                                <td>{entry.menuPath || '-'}</td>
                                <td><code>0x{entry.frameId.toString(16).toUpperCase()}</code></td>
                                <td><code>0x{entry.index.toString(16).toUpperCase()}</code></td>
                                <td>{entry.subindex}</td>
                                <td>{entry.access}</td>
                                <td>{entry.dataType}</td>
                                <td>{entry.pos}/{entry.len}</td>
                                <td>{entry.role}</td>
                                <td>{entry.value}</td>
                                <td>{entry.minValue ?? '-'} / {entry.maxValue ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                    <div className="config-table-toolbar" style={{ gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>信号填充：</span>
                      <button onClick={() => canTestData.fillSignals('min')} type="button" title="所有信号填最小值 0">最小值</button>
                      <button onClick={() => canTestData.fillSignals('max')} type="button" title="所有信号填最大值（对应位宽全 1）">最大值</button>
                      <button onClick={() => canTestData.fillSignals('random')} type="button" title="所有信号填随机值">随机值</button>
                      <span className="action-bar-sep" />
                      <button onClick={() => canTestData.fillSignals('zero')} type="button" title="所有信号填 0">清零</button>
                      <button onClick={() => canTestData.fillSignals('ff')} type="button" title="所有信号原始值填 FF">全 FF</button>
                    </div>
                    {canTestData.canTestFrames.map((frame, frameIndex) => (
                      <section className="pdo-frame-section" key={`${frame.id}-${frameIndex}`}>
                        <div className="pdo-frame-card">
                          <div className="pdo-frame-grid">
                            <label>CAN ID<code style={{ fontSize: '1.1em' }}>0x{frame.id.toString(16).toUpperCase().padStart(3, '0')}</code></label>
                            <label>类型<span>{frame.frameType === 0 ? '标准帧' : '扩展帧'}</span></label>
                            <label>名称<input value={frame.name} onChange={(e) => canTestData.updateFrame(frameIndex, 'name', e.target.value)} /></label>
                            <label>场景<span>{frame.scenario ?? 'manual'}</span></label>
                            <label>来源<span>{frame.source ?? '-'}</span></label>
                            <label>DLC<span>{frame.dlc}</span></label>
                            <label>周期(ms)<input type="number" style={{ width: 80 }} value={frame.cycleMs} onChange={(e) => canTestData.updateFrame(frameIndex, 'cycleMs', Number(e.target.value))} /></label>
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
                                  <th>范围</th>
                                  <th>角色</th>
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
                                        onChange={(e) => canTestData.updateSignalDisplayValue(frameIndex, sigIndex, Number(e.target.value))}
                                      />
                                    </td>
                                    <td>{sig.unit}</td>
                                    <td>{sig.pos}</td>
                                    <td>{sig.len}</td>
                                    <td>{sig.scaleNum}/{sig.scaleDen}</td>
                                    <td>{sig.offset}</td>
                                    <td>{sig.minValue ?? '-'} / {sig.maxValue ?? '-'}</td>
                                    <td>{sig.testRole ?? 'manual'}</td>
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
                ) : canTestData.canTestStatus && canTestData.canTestStatus.startsWith('已生成') ? null : (
                  <div className="empty-state"><div className="empty-state-icon">📂</div><p>点击「⚡ 生成」从项目配置中构建 CAN 测试数据</p></div>
                )}
                {canTestData.canTestStatus ? <p className={canTestData.canTestStatus.startsWith('已') ? 'text-success' : 'project-open-error'} style={{ marginTop: 8 }}>{canTestData.canTestStatus}</p> : null}
              </div>
            ) : <div className="empty-state"><div className="empty-state-icon">📂</div><p>请先在项目管理中打开 .jcpro 项目文件</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'language' ? (
          <LanguagePage
            document={currentLanguageDocument ?? { list_code_language: [], list_inner: [], list_translate: {} }}
            baseline={baselineLanguageDocument()}
            loaded={!!loadedProject}
            onUpdate={updateLanguageDocument}
          />
        ) : null}

        {activeModule.key === 'realtime-data' && realtimeMode === 'advanced' ? (
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

        {activeModule.key === 'signal-dictionary' ? (
          <section className="project-open-card">
            <div className="config-table-toolbar">
              <div>
                <h2>业务信号字典</h2>
                <p>从旧版 SDO、PDO 和锂电配置派生业务 Signal，集中查看数据类型、单位、缩放和旧系统变量索引。</p>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isParsingUnifiedProtocol} onClick={() => void refreshUnifiedProtocol()} type="button">
                  {isParsingUnifiedProtocol ? '解析中...' : '刷新字典'}
                </button>
                <button disabled={!loadedProject} onClick={addSignalDefinition} type="button">
                  新增 Signal
                </button>
                <button
                  disabled={!loadedProject || !unifiedProtocol}
                  onClick={() => {
                    if (!unifiedProtocol) return;
                    updateProjectDocument('signal_dictionary', unifiedProtocol.signal_dictionary);
                  }}
                  type="button"
                >
                  从旧配置派生
                </button>
              </div>
            </div>
            {unifiedProtocolError ? <p className="project-open-error">{unifiedProtocolError}</p> : null}
            {unifiedProtocol ? (
              <>
                <div className="project-open-report">
                  <article>
                    <span>Signal 总数</span>
                    <strong>{currentSignalDictionary.signals.length}</strong>
                  </article>
                  <article>
                    <span>CANopen PDO 映射</span>
                    <strong>{unifiedProtocol.canopen.pdo_recv.reduce((total, frame) => total + frame.mappings.length, 0) + unifiedProtocol.canopen.pdo_send.reduce((total, frame) => total + frame.mappings.length, 0)}</strong>
                  </article>
                  <article>
                    <span>SDO 对象</span>
                    <strong>{unifiedProtocol.canopen.sdo_objects.length}</strong>
                  </article>
                  <article>
                    <span>私有协议帧</span>
                    <strong>{currentPrivateProtocol.frames.length}</strong>
                  </article>
                </div>
                <div className="config-table-frame">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Signal ID</th>
                        <th>名称</th>
                        <th>类型</th>
                        <th>单位</th>
                        <th>缩放</th>
                        <th>默认值</th>
                        <th>旧索引</th>
                        <th>来源</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSignalDictionary.signals.map((signal, signalIndex) => (
                        <tr className={isModifiedPath(['signal_dictionary', 'signals', signalIndex]) ? 'config-entry-modified' : undefined} key={`${signal.signal_id}-${signalIndex}`}>
                          <td><input value={signal.signal_id} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, signal_id: event.target.value }))} /></td>
                          <td><input value={signal.name} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, name: event.target.value }))} /></td>
                          <td>
                            <select value={typeof signal.data_type === 'string' ? signal.data_type : signal.data_type.custom} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, data_type: event.target.value as SignalDefinition['data_type'] }))}>
                              {['bool', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'string', 'bytes'].map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                          </td>
                          <td><input value={signal.display.unit || ''} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, display: { ...item.display, unit: event.target.value } }))} /></td>
                          <td>
                            <input type="number" value={signal.scale.scale_num} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, scale: { ...item.scale, scale_num: Number(event.target.value) } }))} />
                            <input type="number" value={signal.scale.scale_den} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, scale: { ...item.scale, scale_den: Number(event.target.value) } }))} />
                            <input type="number" value={signal.scale.offset} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, scale: { ...item.scale, offset: Number(event.target.value) } }))} />
                          </td>
                          <td><input value={signal.default_value ?? ''} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, default_value: event.target.value }))} /></td>
                          <td><input type="number" value={signal.inner ?? -1} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, inner: Number(event.target.value) }))} /></td>
                          <td><input value={signal.display.description || ''} onChange={(event) => updateSignalDefinition(signalIndex, (item) => ({ ...item, display: { ...item.display, description: event.target.value } }))} /></td>
                          <td><button className="danger" onClick={() => removeSignalDefinition(signalIndex)} type="button">删除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">SIG</div><p>请先打开项目并刷新业务信号字典。</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'private-protocol' ? (
          <section className="project-open-card">
            <div className="private-protocol-header">
              <div className="private-protocol-header-text">
                <h2>私有协议</h2>
                <p>集中查看私有协议帧、校验方式、字节序和 Signal 载荷布局；当前会从锂电监控帧自动派生初始私有协议模型。</p>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isParsingUnifiedProtocol} onClick={() => void refreshUnifiedProtocol()} type="button">
                  {isParsingUnifiedProtocol ? '解析中...' : '刷新私有协议'}
                </button>
                <button disabled={!loadedProject} onClick={() => updatePrivateProtocolDocument({ ...currentPrivateProtocol, enabled: !currentPrivateProtocol.enabled })} type="button">
                  {currentPrivateProtocol.enabled ? '停用' : '启用'}
                </button>
                <button disabled={!loadedProject} onClick={addPrivateFrame} type="button">
                  新增私有帧
                </button>
                <button
                  disabled={!loadedProject || !unifiedProtocol}
                  onClick={() => {
                    if (!unifiedProtocol) return;
                    updateProjectDocument('private_protocol', unifiedProtocol.private_protocol);
                  }}
                  type="button"
                >
                  从旧配置派生
                </button>
                <button disabled={!loadedProject || isExportingPrivateProtocol} onClick={() => void handleExportPrivateProtocol()} type="button">
                  {isExportingPrivateProtocol ? '导出中...' : '导出配置'}
                </button>
                <button disabled={!loadedProject || isImportingPrivateProtocol} onClick={() => void handleImportPrivateProtocol()} type="button">
                  {isImportingPrivateProtocol ? '导入中...' : '导入配置'}
                </button>
              </div>
            </div>
            {unifiedProtocolError ? <p className="project-open-error">{unifiedProtocolError}</p> : null}
            {privateProtocolExportStatus ? <p className="config-helper-text">{privateProtocolExportStatus}</p> : null}
            {privateProtocolImportStatus ? <p className="config-helper-text">{privateProtocolImportStatus}</p> : null}
            {unifiedProtocol ? (
              <>
                <div className="config-summary-strip">
                  <article>
                    <span>启用状态</span>
                    <strong>{currentPrivateProtocol.enabled ? '启用' : '未启用'}</strong>
                  </article>
                  <article>
                    <span>私有帧数量</span>
                    <strong>{currentPrivateProtocol.frames.length}</strong>
                  </article>
                  <article>
                    <span>载荷 Signal</span>
                    <strong>{currentPrivateProtocol.frames.reduce((total, frame) => total + frame.payload.length, 0)}</strong>
                  </article>
                  <article>
                    <span>校验状态</span>
                    <strong>{unifiedProtocol.validation.valid ? '通过' : '存在错误'}</strong>
                  </article>
                </div>
                {currentPrivateProtocol.frames.map((frame, frameIndex) => (
                  <article className={isModifiedPath(['private_protocol', 'frames', frameIndex]) ? 'pdo-frame-card config-entry-modified' : 'pdo-frame-card'} key={`private-protocol-${frame.frame_key}-${frameIndex}`}>
                    <div className="pdo-frame-header">
                      <div className="pdo-frame-grid">
                        <label>帧 Key<input value={frame.frame_key || ''} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, frame_key: event.target.value }))} /></label>
                        <label>帧 ID<input inputMode="text" value={formatFrameId(frame.frame_id)} onChange={(event) => {
                          const nextId = parseFrameId(event.target.value);
                          if (nextId !== null) updatePrivateFrame(frameIndex, (item) => ({ ...item, frame_id: nextId }));
                        }} /></label>
                        <label>名称<input value={frame.name || ''} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, name: event.target.value }))} /></label>
                      </div>
                      <div className="pdo-frame-actions">
                        <button className="danger" onClick={() => removePrivateFrame(frameIndex)} type="button">删除帧</button>
                      </div>
                    </div>
                    <div className="private-frame-props">
                      <label>帧类型<select value={frame.frame_type} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, frame_type: event.target.value }))}>
                        <option value="standard">标准帧</option>
                        <option value="extended">扩展帧</option>
                      </select></label>
                      <label>周期/超时<input type="number" value={frame.cycle_ms} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, cycle_ms: Number(event.target.value) }))} /></label>
                      <label>校验<select value={frame.checksum} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, checksum: event.target.value }))}>
                        <option value="none">无</option>
                        <option value="crc">CRC</option>
                        <option value="xor">XOR</option>
                      </select></label>
                      <label>字节序<select value={frame.byte_order} onChange={(event) => updatePrivateFrame(frameIndex, (item) => ({ ...item, byte_order: event.target.value }))}>
                        <option value="little">Little-Endian</option>
                        <option value="big">Big-Endian</option>
                      </select></label>
                    </div>
                    <div className="config-table-toolbar">
                      <span>载荷 Signal（{frame.payload.length}）</span>
                      <button onClick={() => addPrivatePayload(frameIndex)} type="button">新增载荷</button>
                    </div>
                    <div className="config-table-frame">
                      <table className="config-table">
                        <thead>
                          <tr>
                            <th>Signal ID</th>
                            <th>Bit Offset</th>
                            <th>Bit Length</th>
                            <th>字节序</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {frame.payload.map((mapping, mappingIndex) => (
                            <tr key={`private-payload-${frame.frame_key}-${mapping.signal_id}-${mappingIndex}`}>
                              <td><input value={mapping.signal_id} onChange={(event) => updatePrivatePayload(frameIndex, mappingIndex, (item) => ({ ...item, signal_id: event.target.value }))} /></td>
                              <td><input type="number" value={mapping.bit_offset} onChange={(event) => updatePrivatePayload(frameIndex, mappingIndex, (item) => ({ ...item, bit_offset: Number(event.target.value) }))} /></td>
                              <td><input type="number" value={mapping.bit_length} onChange={(event) => updatePrivatePayload(frameIndex, mappingIndex, (item) => ({ ...item, bit_length: Number(event.target.value) }))} /></td>
                              <td><select value={mapping.byte_order} onChange={(event) => updatePrivatePayload(frameIndex, mappingIndex, (item) => ({ ...item, byte_order: event.target.value }))}><option value="little">little</option><option value="big">big</option></select></td>
                              <td><button className="danger" onClick={() => removePrivatePayload(frameIndex, mappingIndex)} type="button">删除</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">PRV</div><p>请先打开项目并刷新私有协议。</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'protocol-mapping' ? (
          <section className="project-open-card">
            <div className="config-table-toolbar">
              <div>
                <h2>协议拓扑概览</h2>
                <p>统一查看业务 Signal 到 CANopen SDO/PDO 与私有协议帧的映射关系，并执行帧长度、引用和重叠校验。</p>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isParsingUnifiedProtocol} onClick={() => void refreshUnifiedProtocol()} type="button">
                  {isParsingUnifiedProtocol ? '解析中...' : '刷新拓扑'}
                </button>
                <button
                  disabled={!loadedProject || !unifiedProtocol}
                  onClick={() => {
                    if (!unifiedProtocol) return;
                    updateProjectSections({
                      signal_dictionary: unifiedProtocol.signal_dictionary,
                      private_protocol: unifiedProtocol.private_protocol,
                      protocol_mapping: unifiedProtocol.mappings,
                    });
                  }}
                  type="button"
                >
                  从解析结果写入
                </button>
                <button disabled={!loadedProject} onClick={() => addProtocolMapping('can_open_pdo')} type="button">新增 PDO 映射</button>
                <button disabled={!loadedProject} onClick={() => addProtocolMapping('can_open_sdo')} type="button">新增 SDO 映射</button>
                <button disabled={!loadedProject} onClick={() => addProtocolMapping('private_frame')} type="button">新增私有映射</button>
                <button disabled={!loadedProject || isParsingUnifiedProtocol} onClick={() => void handleFlattenUnifiedProtocol()} type="button">
                  生成旧版 PDO 段
                </button>
              </div>
            </div>
            {unifiedProtocol ? (
              <>
                <div className="project-open-report">
                  <article>
                    <span>校验状态</span>
                    <strong>{unifiedProtocol.validation.valid ? '通过' : '存在错误'}</strong>
                  </article>
                  <article>
                    <span>映射总数</span>
                    <strong>{currentProtocolMappings.length}</strong>
                  </article>
                  <article>
                    <span>CANopen 帧</span>
                    <strong>{unifiedProtocol.canopen.pdo_recv.length + unifiedProtocol.canopen.pdo_send.length}</strong>
                  </article>
                  <article>
                    <span>私有帧</span>
                    <strong>{unifiedProtocol.private_protocol.frames.length}</strong>
                  </article>
                </div>
                {protocolFlattenStatus ? <p className="text-success">{protocolFlattenStatus}</p> : null}
                {unifiedProtocol.validation.errors.length > 0 ? <p className="project-open-error">{unifiedProtocol.validation.errors.join('；')}</p> : null}
                {unifiedProtocol.validation.warnings.length > 0 ? <p className="export-warning">{unifiedProtocol.validation.warnings.join('；')}</p> : null}
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>协议映射编辑</strong>
                  </div>
                  <div className="config-table-frame">
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>Signal ID</th>
                          <th>目标类型</th>
                          <th>方向/Frame Key</th>
                          <th>Frame ID / Index</th>
                          <th>Subindex</th>
                          <th>Bit Offset</th>
                          <th>Bit Length</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentProtocolMappings.map((mapping, mappingIndex) => (
                          <tr className={isModifiedPath(['protocol_mapping', mappingIndex]) ? 'config-entry-modified' : undefined} key={`protocol-mapping-${mappingIndex}`}>
                            <td><input value={mapping.signal_id} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, signal_id: event.target.value }))} /></td>
                            <td>
                              <select value={mapping.target.kind} onChange={(event) => {
                                const kind = event.target.value as ProtocolMappingTarget['kind'];
                                const target: ProtocolMappingTarget = kind === 'can_open_sdo'
                                  ? { kind: 'can_open_sdo', index: 0, subindex: 0 }
                                  : kind === 'private_frame'
                                    ? { kind: 'private_frame', frame_key: '', frame_id: 0, bit_offset: 0, bit_length: 8 }
                                    : { kind: 'can_open_pdo', direction: 'receive', frame_id: 0, bit_offset: 0, bit_length: 8 };
                                updateProtocolMapping(mappingIndex, (item) => ({ ...item, target }));
                              }}>
                                <option value="can_open_pdo">CANopen PDO</option>
                                <option value="can_open_sdo">CANopen SDO</option>
                                <option value="private_frame">私有帧</option>
                              </select>
                            </td>
                            <td>
                              {mapping.target.kind === 'can_open_pdo' ? (
                                <select value={mapping.target.direction} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, target: { ...(item.target as Extract<ProtocolMappingTarget, { kind: 'can_open_pdo' }>), direction: event.target.value as 'receive' | 'send' } }))}>
                                  <option value="receive">receive</option>
                                  <option value="send">send</option>
                                </select>
                              ) : mapping.target.kind === 'private_frame' ? (
                                <input value={mapping.target.frame_key} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, target: { ...(item.target as Extract<ProtocolMappingTarget, { kind: 'private_frame' }>), frame_key: event.target.value } }))} />
                              ) : '-'}
                            </td>
                            <td><input type="number" value={mapping.target.kind === 'can_open_sdo' ? mapping.target.index : mapping.target.frame_id} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => {
                              if (item.target.kind === 'can_open_sdo') return { ...item, target: { ...item.target, index: Number(event.target.value) } };
                              return { ...item, target: { ...item.target, frame_id: Number(event.target.value) } };
                            })} /></td>
                            <td>{mapping.target.kind === 'can_open_sdo' ? <input type="number" value={mapping.target.subindex} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, target: { ...(item.target as Extract<ProtocolMappingTarget, { kind: 'can_open_sdo' }>), subindex: Number(event.target.value) } }))} /> : '-'}</td>
                            <td>{mapping.target.kind !== 'can_open_sdo' ? <input type="number" value={mapping.target.bit_offset} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, target: { ...(item.target as Exclude<ProtocolMappingTarget, { kind: 'can_open_sdo' }>), bit_offset: Number(event.target.value) } }))} /> : '-'}</td>
                            <td>{mapping.target.kind !== 'can_open_sdo' ? <input type="number" value={mapping.target.bit_length} onChange={(event) => updateProtocolMapping(mappingIndex, (item) => ({ ...item, target: { ...(item.target as Exclude<ProtocolMappingTarget, { kind: 'can_open_sdo' }>), bit_length: Number(event.target.value) } }))} /> : '-'}</td>
                            <td><button className="danger" onClick={() => removeProtocolMapping(mappingIndex)} type="button">删除</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>CANopen PDO</strong>
                  </div>
                  {[...unifiedProtocol.canopen.pdo_recv, ...unifiedProtocol.canopen.pdo_send].map((frame, frameIndex) => (
                    <article className="pdo-frame-card" key={`overview-pdo-${frame.direction}-${frame.frame_id}-${frameIndex}`}>
                      <div className="pdo-frame-grid">
                        <label>方向<input readOnly value={frame.direction === 'receive' ? '接收' : '发送'} /></label>
                        <label>帧 ID<input readOnly value={formatFrameId(frame.frame_id)} /></label>
                        <label>描述<input readOnly value={frame.description || '-'} /></label>
                      </div>
                      <div className="config-table-frame">
                        <table className="config-table">
                          <thead>
                            <tr>
                              <th>Signal ID</th>
                              <th>Bit Offset</th>
                              <th>Bit Length</th>
                              <th>Show Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {frame.mappings.map((mapping, mappingIndex) => (
                              <tr key={`pdo-map-${frame.frame_id}-${mapping.signal_id}-${mappingIndex}`}>
                                <td><code>{mapping.signal_id}</code></td>
                                <td>{mapping.bit_offset}</td>
                                <td>{mapping.bit_length}</td>
                                <td>{mapping.show_type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>私有协议帧</strong>
                  </div>
                  {unifiedProtocol.private_protocol.frames.map((frame, frameIndex) => (
                    <article className="pdo-frame-card" key={`overview-private-${frame.frame_key}-${frameIndex}`}>
                      <div className="pdo-frame-grid">
                        <label>帧 Key<input readOnly value={frame.frame_key || '-'} /></label>
                        <label>帧 ID<input readOnly value={formatFrameId(frame.frame_id)} /></label>
                        <label>名称<input readOnly value={frame.name || '-'} /></label>
                      </div>
                      <div className="config-table-frame">
                        <table className="config-table">
                          <thead>
                            <tr>
                              <th>Signal ID</th>
                              <th>Bit Offset</th>
                              <th>Bit Length</th>
                              <th>字节序</th>
                            </tr>
                          </thead>
                          <tbody>
                            {frame.payload.map((mapping, mappingIndex) => (
                              <tr key={`private-map-${frame.frame_key}-${mapping.signal_id}-${mappingIndex}`}>
                                <td><code>{mapping.signal_id}</code></td>
                                <td>{mapping.bit_offset}</td>
                                <td>{mapping.bit_length}</td>
                                <td>{mapping.byte_order}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </section>
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">MAP</div><p>请先打开项目并刷新协议拓扑。</p></div>}
          </section>
        ) : null}

        {activeModule.key === 'canopen-export' ? (
          <section className="project-open-card">
            <div className="config-table-toolbar">
              <div>
                <h2>CANopen 导出</h2>
                <p>基于「数据 / 设置数据」生成 SDO 对象，并只纳入能匹配 CANopen 默认 PDO 连接集的实时 PDO；无法归属到 Node-ID 的自定义实时帧会被排除。</p>
              </div>
              <div className="sample-actions">
                <button disabled={!loadedProject || isExportingCanopenPackage} onClick={() => void handleExportCanopenPackage()} type="button">
                  {isExportingCanopenPackage ? '导出中...' : '导出 CANopen 包'}
                </button>
                {canopenExportDir ? (
                  <button onClick={() => void revealItemInDir(canopenExportDir)} type="button">打开 CANopen 目录</button>
                ) : null}
              </div>
            </div>
            {loadedProject ? (
              <>
                <div className="project-open-report">
                  <article>
                    <span>固件协议</span>
                    <strong>保持不变</strong>
                  </article>
                  <article>
                    <span>SDO 请求规则</span>
                    <strong>0x600 + Node-ID</strong>
                  </article>
                  <article>
                    <span>导出目录</span>
                    <strong>{canopenExportDir ?? '尚未导出'}</strong>
                  </article>
                  <article>
                    <span>输出文件</span>
                    <strong>{canopenConversionReport?.files.length ?? 0}</strong>
                  </article>
                </div>
                <div className="config-summary-strip" style={{ marginTop: 8 }}>
                  <article><span>CANopen 节点</span><strong>{canopenConversionReport?.nodes.length ?? 0}</strong></article>
                  <article><span>EDS 文件</span><strong>{canopenConversionReport?.nodes.length ?? 0}</strong></article>
                  <article><span>PDO 数</span><strong>{canopenConversionReport?.nodes.reduce((total, node) => total + node.pdoCount, 0) ?? 0}</strong></article>
                  <article><span>转换提示</span><strong>{canopenConversionReport?.warnings.length ?? 0}</strong></article>
                </div>
                {canopenConvertStatus ? (
                  <p className={canopenConvertStatus.startsWith('已') ? 'text-success' : 'project-open-error'} style={{ marginTop: 8 }}>{canopenConvertStatus}</p>
                ) : null}
                {canopenConversionReport && canopenConversionReport.nodes.length > 0 ? (
                  <section className="pdo-frame-section">
                    <div className="config-table-toolbar">
                      <strong>节点转换摘要</strong>
                    </div>
                    <div className="config-table-frame">
                      <table className="config-table">
                        <thead>
                          <tr>
                            <th>Node-ID</th>
                            <th>SDO 请求 COB-ID</th>
                            <th>SDO 响应 COB-ID</th>
                            <th>对象数</th>
                            <th>PDO 数</th>
                            <th>位域扩展</th>
                          </tr>
                        </thead>
                        <tbody>
                          {canopenConversionReport.nodes.map((node) => (
                            <tr key={node.nodeId}>
                              <td>{node.nodeId}</td>
                              <td><code>0x{node.sdoRxCobId.toString(16).toUpperCase()}</code></td>
                              <td><code>0x{node.sdoTxCobId.toString(16).toUpperCase()}</code></td>
                              <td>{node.objectCount}</td>
                              <td>{node.pdoCount}</td>
                              <td>{node.bitfieldCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : (
                  <div className="empty-state"><div className="empty-state-icon">EDS</div><p>点击「导出 CANopen 包」生成 EDS、model、vendor 扩展和 SDO/PDO 测试帧。</p></div>
                )}
                {canopenConversionReport && canopenConversionReport.warnings.length > 0 ? (
                  <div className="project-open-error" style={{ marginTop: 8 }}>
                    {canopenConversionReport.warnings.slice(0, 5).map((warning) => <p key={warning}>{warning}</p>)}
                    {canopenConversionReport.warnings.length > 5 ? <p>还有 {canopenConversionReport.warnings.length - 5} 条提示，详见 conversion_report.json。</p> : null}
                  </div>
                ) : null}
              </>
            ) : <div className="empty-state"><div className="empty-state-icon">EDS</div><p>请先在项目管理中打开 .jcpro 项目文件。</p></div>}
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
                  onChange={(event) => updateExportBatteryOption('battery_protocol', 'config', event.target.checked)}
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_protocol.bin}
                  onChange={(event) => updateExportBatteryOption('battery_protocol', 'bin', event.target.checked)}
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
              <div className="settings-option-info">
                <span>锂电协议监控</span>
                <small>控制 battery_monitor_info 是否写入导出清单描述和 battery monitor 二进制段。</small>
              </div>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.config}
                  onChange={(event) => updateExportBatteryOption('battery_monitor_info', 'config', event.target.checked)}
                  type="checkbox"
                />
                <span>配置文件</span>
              </label>
              <label className="settings-check">
                <input
                  checked={exportBatteryOptions.battery_monitor_info.bin}
                  onChange={(event) => updateExportBatteryOption('battery_monitor_info', 'bin', event.target.checked)}
                  type="checkbox"
                />
                <span>bin 文件</span>
              </label>
            </div>
            <div className="settings-option-footer">
              <span>该设置影响项目导出、二进制报告和 bin 对比。</span>
              <button type="button" onClick={resetExportBatteryOptions}>恢复默认</button>
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
