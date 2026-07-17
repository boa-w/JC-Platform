import { getCurrentWindow } from '@tauri-apps/api/window';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { parsePdoAdvancedProject, validateProjectDocument } from '../api/commands';
import { Breadcrumb } from '../components/Breadcrumb';
import { ProjectManagementPage } from '../components/project';
import { useBatteryLegacyController } from '../features/battery-legacy/useBatteryLegacyController';
import { DashboardActionBar, DashboardDialogs } from '../features/dashboard-shell';
import { useProtocolEditor } from '../features/protocol-editor/useProtocolEditor';
import { useProjectExport } from '../features/project-export/useProjectExport';
import { useProjectGitController } from '../features/project-git';
import { useProjectLifecycleController } from '../features/project-lifecycle';
import { usePdoEditor } from '../features/realtime-data/usePdoEditor';
import {
  TableConfigStatusPanel,
  TableFormatReference,
  useTableConfigController,
} from '../features/table-config';
import {
  uiResourcePreviewDocument,
  useUiResourceController,
} from '../features/ui-resource/useUiResourceController';
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
  LanguageDocument,
  LoadedProject,
  NavigationKey,
  PdoAdvancedParseReport,
  ProjectSummary,
} from '../types/platform';
import {
  cloneJson,
  deepEqual,
  isPathModified,
  type JsonPath,
  restorePath,
} from '../utils/projectDirty';

const GitReviewWorkspace = lazy(() =>
  import('../components/git/GitReviewWorkspace').then((module) => ({
    default: module.GitReviewWorkspace,
  })),
);
const JsonEditorPopup = lazy(() =>
  import('../components/json-editor/JsonEditorPopup').then((module) => ({
    default: module.JsonEditorPopup,
  })),
);
const LanguagePage = lazy(() =>
  import('../components/language/LanguagePage').then((module) => ({
    default: module.LanguagePage,
  })),
);
const BatteryProtocolPage = lazy(() =>
  import('../features/battery-legacy/BatteryLegacyPages').then((module) => ({
    default: module.BatteryProtocolPage,
  })),
);
const BatteryMonitorPage = lazy(() =>
  import('../features/battery-legacy/BatteryLegacyPages').then((module) => ({
    default: module.BatteryMonitorPage,
  })),
);
const CanTestDataPage = lazy(() =>
  import('../features/can-test-data/CanTestDataPage').then((module) => ({
    default: module.CanTestDataPage,
  })),
);
const CanopenExportPage = lazy(() =>
  import('../features/canopen-export/CanopenExportPage').then((module) => ({
    default: module.CanopenExportPage,
  })),
);
const FaultCodePage = lazy(() =>
  import('../features/fault-code/FaultCodePage').then((module) => ({
    default: module.FaultCodePage,
  })),
);
const PrivateProtocolPage = lazy(() =>
  import('../features/protocol-editor/PrivateProtocolPage').then((module) => ({
    default: module.PrivateProtocolPage,
  })),
);
const ProtocolMappingPage = lazy(() =>
  import('../features/protocol-editor/ProtocolMappingPage').then((module) => ({
    default: module.ProtocolMappingPage,
  })),
);
const SignalDictionaryPage = lazy(() =>
  import('../features/protocol-editor/SignalDictionaryPage').then((module) => ({
    default: module.SignalDictionaryPage,
  })),
);
const ProjectExportPage = lazy(() =>
  import('../features/project-export/ProjectExportPage').then((module) => ({
    default: module.ProjectExportPage,
  })),
);
const RealtimeDataPage = lazy(() =>
  import('../features/realtime-data/RealtimeDataPage').then((module) => ({
    default: module.RealtimeDataPage,
  })),
);
const SettingDataPage = lazy(() =>
  import('../features/setting-data/SettingDataPage').then((module) => ({
    default: module.SettingDataPage,
  })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);
const UiResourcePage = lazy(() =>
  import('../features/ui-resource/UiResourcePage').then((module) => ({
    default: module.UiResourcePage,
  })),
);

function WorkspaceLoading() {
  return (
    <section className="empty-state" role="status">
      正在加载...
    </section>
  );
}

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

export function Dashboard({
  activeModule,
  loadedProject,
  theme,
  onToggleTheme,
  onNavigate,
  onProjectLoaded,
}: DashboardProps) {
  const [baselineDocument, setBaselineDocument] = useState<unknown | null>(null);
  const {
    clearDirtySections,
    dirtySections,
    recalculateDirtySections,
    resetBaseline: resetDirtySectionBaseline,
  } = useDocumentDirtySections();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [configEditorText, setConfigEditorText] = useState('');
  const [configEditorError, setConfigEditorError] = useState<string | null>(null);
  const [pdoAdvancedReport, setPdoAdvancedReport] = useState<PdoAdvancedParseReport | null>(null);
  const [pdoAdvancedError, setPdoAdvancedError] = useState<string | null>(null);
  const [isParsingPdoAdvanced, setIsParsingPdoAdvanced] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [confirmGenerateType, setConfirmGenerateType] = useState<TestDataType | null>(null);
  const projectGitRefreshRef = useRef<() => void | Promise<void>>(() => undefined);
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
    document: loadedProject?.document ?? uiResourcePreviewDocument,
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
  const uiResource = useUiResourceController({ loadedProject, applyLoadedProject });
  const projectLifecycle = useProjectLifecycleController({
    loadedProject,
    hasUnsavedChanges,
    hasRefactorOnlyChanges,
    isLegacyJcproProject,
    onApplyProject: applyLoadedProject,
    onRefreshGit: () => projectGitRefreshRef.current(),
    onRefreshProtocol: protocolEditor.refreshUnifiedProtocol,
    onRefreshUi: uiResource.refreshPreview,
  });
  const projectGit = useProjectGitController({
    projectPath: loadedProject?.summary.path,
    sidecarPath: projectLifecycle.refactorConfigPath,
    hasUnsavedChanges,
    onNavigate,
    onStatusChange: projectLifecycle.setSaveStatus,
    onRestoreDocument: async (document, revision) => {
      if (!loadedProject) return;
      const validation = await validateProjectDocument(document);
      applyLoadedProject(
        { ...loadedProject, document, validation },
        undefined,
        trackedDocumentSections,
      );
      void uiResource.refreshPreview(document, loadedProject.summary.path);
      projectLifecycle.setSaveStatus(
        `已载入 Git 版本 ${revision.short_hash}，保存后将形成新的修改。`,
      );
    },
  });

  useEffect(() => {
    projectGitRefreshRef.current = projectGit.refresh;
  }, [projectGit.refresh]);

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
      const nextBaseline = cloneJson(document);
      resetDirtySectionBaseline(nextBaseline);
      applyLoadedProject({ ...loadedProject, document }, nextBaseline);
    }
  }, [loadedProject]);

  function activeJsonEditorKey() {
    return jsonEditorKeyForModule(activeModule.key, { realtimeMode: pdoEditor.mode });
  }

  function currentConfigSection() {
    if (!loadedProject) return null;
    const document = loadedProject.document as Record<string, unknown>;
    return configSectionForEditor(document, activeModule.key, { realtimeMode: pdoEditor.mode });
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
    if (baselineOverride !== undefined) setBaselineDocument(baselineOverride);
    const nextHasChanges = nextBaseline
      ? nextDirtySections.size > 0 || !deepEqual(nextProject.document, nextBaseline)
      : true;
    onProjectLoaded(nextProject);
    setHasUnsavedChanges(nextHasChanges);
    projectLifecycle.markDocumentState(nextHasChanges);
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

  function handleJumpToPdo(pdoParamIndex: number) {
    pdoEditor.focusPdoParam(pdoParamIndex);
    onNavigate('realtime-data');
  }

  const currentLanguageDocument = languageDocument();

  return (
    <main className={projectGit.showReview ? 'workspace workspace--git-review' : 'workspace'}>
      <DashboardActionBar
        activeModule={activeModule}
        loadedProject={loadedProject}
        projectPath={projectLifecycle.projectPath}
        isOpening={projectLifecycle.isOpening}
        hasUnsavedChanges={hasUnsavedChanges}
        modifiedSections={modifiedSections}
        isSavingProject={projectLifecycle.isSavingProject}
        savingProjectAction={projectLifecycle.savingProjectAction}
        saveStatus={projectLifecycle.saveStatus}
        currentLegacyTableKind={tableConfig.currentKind}
        isImportingTable={tableConfig.isImporting}
        isExportingTable={tableConfig.isExporting}
        generatingTestKey={generatingTestKey}
        pdoMode={pdoEditor.mode}
        showCanvasLabels={uiResource.showCanvasLabels}
        showJsonEditor={showJsonEditor}
        gitStatus={projectGit.status}
        gitBusy={projectGit.busy}
        gitError={projectGit.error}
        gitRevisions={projectGit.revisions}
        gitRepositoryName={projectGit.repositoryName}
        gitSummaryCommitDisabled={projectGit.commitDisabled}
        onRestoreSection={(section) => restoreModifiedPath([section])}
        onSelectProjectFile={projectLifecycle.selectProjectFile}
        onReloadProject={projectLifecycle.reloadProject}
        onRestoreAllChanges={restoreAllChanges}
        onSaveProjectAs={projectLifecycle.saveProjectToNewPath}
        onRequestSave={projectLifecycle.requestSaveProject}
        onImportTable={tableConfig.importTable}
        onExportTable={tableConfig.exportTable}
        onRequestTestData={setConfirmGenerateType}
        onToggleCanvasLabels={uiResource.toggleCanvasLabels}
        onToggleJsonEditor={() => setShowJsonEditor((visible) => !visible)}
        onRefreshGit={projectGit.refresh}
        onOpenGitReview={projectGit.openReview}
        onOpenGitRepository={projectGit.openRepository}
        onShowGitHistory={projectGit.showHistory}
        onCommitGitVersion={projectGit.commitVersion}
      />

      <Suspense fallback={<WorkspaceLoading />}>
        {projectGit.showReview ? (
          <GitReviewWorkspace
            report={projectGit.review}
            revision={projectGit.reviewRevision}
            statusBranch={projectGit.status?.branch}
            busy={projectGit.reviewBusy}
            error={projectGit.reviewError}
            commitBusy={projectGit.busy}
            commitDisabled={projectGit.commitDisabled}
            message={projectGit.message}
            onMessageChange={projectGit.setMessage}
            onCommit={() => void projectGit.commitVersion()}
            onRestore={() => void projectGit.restoreVersion()}
            onRefresh={() => void projectGit.refreshReview()}
            onClose={projectGit.closeReview}
          />
        ) : null}
      </Suspense>
      <DashboardDialogs
        loadedProject={loadedProject}
        showSaveModal={projectLifecycle.showSaveModal}
        isSavingProject={projectLifecycle.isSavingProject}
        savingProjectAction={projectLifecycle.savingProjectAction}
        isLegacyJcproProject={isLegacyJcproProject}
        hasRefactorOnlyChanges={hasRefactorOnlyChanges}
        refactorConfigPath={projectLifecycle.refactorConfigPath}
        modifiedSections={modifiedSections}
        confirmGenerateType={confirmGenerateType}
        onCancelSave={projectLifecycle.cancelSaveProject}
        onConfirmSave={projectLifecycle.confirmSaveProject}
        onCancelTestData={() => setConfirmGenerateType(null)}
        onConfirmTestData={confirmGenerateTestData}
      />

      <Suspense fallback={null}>
        {showJsonEditor && loadedProject ? (
          <JsonEditorPopup
            open
            text={configEditorText}
            error={configEditorError}
            canRestore={Boolean(baselineDocument)}
            onTextChange={setConfigEditorText}
            onFormat={() => setConfigEditorText(JSON.stringify(currentConfigSection(), null, 2))}
            onRestore={restoreCurrentConfigSection}
            onApply={applyConfigEditor}
            onClose={() => setShowJsonEditor(false)}
          />
        ) : null}
      </Suspense>

      <div className={showJsonEditor && loadedProject ? 'workspace-json-active' : undefined}>
        {activeModule.key !== 'project' ? (
          <Breadcrumb
            activeKey={activeModule.key}
            modules={featureModules}
            onNavigate={onNavigate}
          />
        ) : null}
        <Suspense fallback={<WorkspaceLoading />}>
          {activeModule.key === 'project' ? (
            <ProjectManagementPage
              projectPath={projectLifecycle.projectPath}
              setProjectPath={projectLifecycle.setProjectPath}
              isOpening={projectLifecycle.isOpening}
              openError={projectLifecycle.openError}
              recentProjects={projectLifecycle.recentProjects}
              selectedRecentProjectPath={projectLifecycle.selectedRecentProjectPath}
              clearRecentProjects={projectLifecycle.clearRecentProjects}
              removeRecentProject={projectLifecycle.removeRecentProject}
              newProjectName={projectLifecycle.newProjectName}
              setNewProjectName={projectLifecycle.setNewProjectName}
              newResolutionW={projectLifecycle.newResolutionW}
              setNewResolutionW={projectLifecycle.setNewResolutionW}
              newResolutionH={projectLifecycle.newResolutionH}
              setNewResolutionH={projectLifecycle.setNewResolutionH}
              loadedProject={loadedProject}
              effectiveProjectValid={effectiveProjectValid}
              refactorConfigPath={projectLifecycle.refactorConfigPath}
              refactorConfigStatus={projectLifecycle.refactorConfigStatus}
              compatibleMissingSections={compatibleMissingSections}
              sidecarMissingSections={sidecarMissingSections}
              projectGitSectionRef={projectGit.projectSectionRef}
              gitBusy={projectGit.busy}
              gitStatus={projectGit.status}
              gitMessage={projectGit.message}
              setGitMessage={projectGit.setMessage}
              hasUnsavedChanges={hasUnsavedChanges}
              gitRevisions={projectGit.revisions}
              gitError={projectGit.error}
              projectParseReport={projectLifecycle.projectParseReport}
              handleSelectProjectFile={projectLifecycle.selectProjectFile}
              handleOpenProject={projectLifecycle.openProject}
              handleCreateProject={projectLifecycle.createNewProject}
              handleParseProject={projectLifecycle.parseProject}
              handleMigrateProject={projectLifecycle.migrateProject}
              handleMountRefactorConfig={projectLifecycle.mountRefactorConfig}
              handleCreateRefactorConfig={projectLifecycle.createRefactorConfig}
              refreshProjectGit={projectGit.refresh}
              handleCommitProjectVersion={projectGit.commitVersion}
              handlePreviewProjectVersion={projectGit.previewVersion}
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
            <BatteryProtocolPage
              loadedProject={loadedProject}
              controller={batteryLegacyController}
            />
          ) : null}

          {activeModule.key === 'battery-monitor' ? (
            <BatteryMonitorPage
              loadedProject={loadedProject}
              controller={batteryLegacyController}
            />
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
            <SignalDictionaryPage controller={protocolEditor} isModifiedPath={isModifiedPath} />
          ) : null}

          {activeModule.key === 'private-protocol' ? (
            <PrivateProtocolPage controller={protocolEditor} isModifiedPath={isModifiedPath} />
          ) : null}

          {activeModule.key === 'protocol-mapping' ? (
            <ProtocolMappingPage controller={protocolEditor} isModifiedPath={isModifiedPath} />
          ) : null}

          {activeModule.key === 'canopen-export' ? (
            <CanopenExportPage loadedProject={loadedProject} />
          ) : null}

          {activeModule.key === 'project' || activeModule.key === 'export' ? (
            <TableFormatReference specs={tableConfig.specs} />
          ) : null}

          {activeModule.key === 'ui' ? (
            <UiResourcePage
              controller={uiResource}
              loadedProject={loadedProject}
              onJumpToPdo={handleJumpToPdo}
            />
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

          {activeModule.key === 'export' ? <ProjectExportPage controller={projectExport} /> : null}
        </Suspense>
      </div>
    </main>
  );
}
