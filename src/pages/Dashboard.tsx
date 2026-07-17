import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { lazy, useEffect, useRef, useState } from 'react';
import { takePendingProjectPath, validateProjectDocument } from '../api/commands';
import { Breadcrumb } from '../components/Breadcrumb';
import { ProjectManagementPage } from '../components/project';
import { FeatureBoundary } from '../components/RecoveryBoundary';
import { featureModules } from '../data/modules';
import { getTestData, type TestDataType } from '../data/test-data';
import { useBatteryLegacyController } from '../features/battery-legacy/useBatteryLegacyController';
import { DashboardActionBar, DashboardDialogs } from '../features/dashboard-shell';
import { useProjectJsonEditor } from '../features/json-editor/useProjectJsonEditor';
import { useProjectDocumentController } from '../features/project-document';
import { useProjectExport } from '../features/project-export/useProjectExport';
import { useProjectGitController } from '../features/project-git';
import { useProjectLifecycleController } from '../features/project-lifecycle';
import { useProtocolEditor } from '../features/protocol-editor/useProtocolEditor';
import { PdoAdvancedReportPanel } from '../features/realtime-data/PdoAdvancedReportPanel';
import { usePdoAdvancedReport } from '../features/realtime-data/usePdoAdvancedReport';
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
import { useCanTestData } from '../hooks/useCanTestData';
import { trackedDocumentSections } from '../modules/documentSections';
import { useExportBatteryOptions } from '../stores/exportSettings';
import { useTranslationSettings } from '../stores/translationSettings';
import type {
  BackendHealth,
  FeatureModule,
  LanguageDocument,
  LoadedProject,
  NavigationKey,
  ProjectSummary,
} from '../types/platform';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [confirmGenerateType, setConfirmGenerateType] = useState<TestDataType | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const documentStateChangeRef = useRef<(hasChanges: boolean) => void>(() => undefined);
  const projectGitRefreshRef = useRef<() => void | Promise<void>>(() => undefined);
  const externalProjectOpenRef = useRef<(path: string) => void>(() => undefined);
  const externalProjectStatusRef = useRef<(message: string) => void>(() => undefined);
  const projectDocument = useProjectDocumentController({
    loadedProject,
    onDocumentStateChange: (hasChanges) => documentStateChangeRef.current(hasChanges),
    onProjectLoaded,
  });
  const {
    applyLoadedProject,
    baselineDocument,
    compatibleMissingSections,
    effectiveProjectValid,
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
  } = projectDocument;
  const canTestData = useCanTestData(loadedProject?.document ?? null);
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
  const pdoAdvancedReport = usePdoAdvancedReport(loadedProject?.document ?? null);
  const jsonEditor = useProjectJsonEditor({
    activeModuleKey: activeModule.key,
    applyLoadedProject,
    loadedProject,
    realtimeMode: pdoEditor.mode,
    restoreProjectPaths,
  });
  const protocolEditor = useProtocolEditor({
    activeModuleKey: activeModule.key,
    document: loadedProject?.document ?? null,
    projectPath: loadedProject?.summary.path,
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
    projectPath: loadedProject?.summary.path,
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

  externalProjectOpenRef.current = (path) => {
    onNavigate('project');
    void projectLifecycle.openProject(path);
  };
  externalProjectStatusRef.current = projectLifecycle.setSaveStatus;

  useEffect(() => {
    documentStateChangeRef.current = projectLifecycle.markDocumentState;
  }, [projectLifecycle.markDocumentState]);

  useEffect(() => {
    projectGitRefreshRef.current = projectGit.refresh;
  }, [projectGit.refresh]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let lastHandledPath = '';
    let lastHandledAt = 0;

    function openExternalProject(path: string) {
      const normalizedPath = path.trim();
      if (!normalizedPath) return;
      const now = Date.now();
      if (normalizedPath === lastHandledPath && now - lastHandledAt < 1000) return;
      lastHandledPath = normalizedPath;
      lastHandledAt = now;
      externalProjectOpenRef.current(normalizedPath);
    }

    async function bindProjectOpenEvents() {
      unlisten = await listen<string>('open-project', (event) =>
        openExternalProject(event.payload),
      );
      if (disposed) {
        unlisten();
        return;
      }
      const pendingPath = await takePendingProjectPath();
      if (!disposed && pendingPath) openExternalProject(pendingPath);
    }

    void bindProjectOpenEvents().catch((cause) => {
      if (!disposed) {
        externalProjectStatusRef.current(
          `无法接收系统项目打开请求：${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const unlistenPromise = isTauriRuntime()
      ? getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault();
          setShowCloseConfirm(true);
        })
      : Promise.resolve(() => undefined);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [hasUnsavedChanges]);

  function baselineLanguageDocument(): LanguageDocument | null {
    if (!baselineDocument) return null;
    return (
      ((baselineDocument as Record<string, unknown>).language_info as
        | LanguageDocument
        | undefined) ?? null
    );
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
        showJsonEditor={jsonEditor.open}
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
        onToggleJsonEditor={jsonEditor.toggle}
        onRefreshGit={projectGit.refresh}
        onOpenGitReview={projectGit.openReview}
        onOpenGitRepository={projectGit.openRepository}
        onShowGitHistory={projectGit.showHistory}
        onCommitGitVersion={projectGit.commitVersion}
      />

      <FeatureBoundary fallback={<WorkspaceLoading />} resetKey={`git-${projectGit.showReview}`}>
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
      </FeatureBoundary>
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
        showCloseConfirm={showCloseConfirm && hasUnsavedChanges}
        discardConfirmation={projectLifecycle.discardConfirmation}
        restoreConfirmation={projectGit.restoreConfirmation}
        onCancelSave={projectLifecycle.cancelSaveProject}
        onConfirmSave={projectLifecycle.confirmSaveProject}
        onCancelTestData={() => setConfirmGenerateType(null)}
        onConfirmTestData={confirmGenerateTestData}
        onCancelClose={() => setShowCloseConfirm(false)}
        onConfirmClose={() => {
          setShowCloseConfirm(false);
          void getCurrentWindow().destroy();
        }}
      />

      <FeatureBoundary fallback={null} resetKey={`json-${jsonEditor.open}`}>
        {jsonEditor.open && loadedProject ? (
          <JsonEditorPopup
            open
            text={jsonEditor.text}
            error={jsonEditor.error}
            canRestore={Boolean(baselineDocument)}
            onTextChange={jsonEditor.setText}
            onFormat={jsonEditor.format}
            onRestore={jsonEditor.restore}
            onApply={jsonEditor.apply}
            onClose={jsonEditor.close}
          />
        ) : null}
      </FeatureBoundary>

      <div className={jsonEditor.open && loadedProject ? 'workspace-json-active' : undefined}>
        {activeModule.key !== 'project' ? (
          <Breadcrumb
            activeKey={activeModule.key}
            modules={featureModules}
            onNavigate={onNavigate}
          />
        ) : null}
        <FeatureBoundary fallback={<WorkspaceLoading />} resetKey={activeModule.key}>
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
            <PdoAdvancedReportPanel controller={pdoAdvancedReport} />
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
        </FeatureBoundary>
      </div>
    </main>
  );
}
