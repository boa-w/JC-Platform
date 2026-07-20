import { FolderOpen } from 'lucide-react';
import { lazy, useEffect, useId, useRef, useState } from 'react';
import { validateProjectDocument } from '../api/commands';
import { Breadcrumb } from '../components/Breadcrumb';
import { ProjectManagementPage } from '../components/project';
import { FeatureBoundary } from '../components/RecoveryBoundary';
import { featureModules } from '../data/modules';
import type { TestDataType } from '../data/test-data/metadata';
import { useBatteryLegacyController } from '../features/battery-legacy/useBatteryLegacyController';
import { DashboardActionBar, DashboardDialogs } from '../features/dashboard-shell';
import { useProjectJsonEditor } from '../features/json-editor/useProjectJsonEditor';
import {
  useProjectDocumentController,
  useProjectRecoveryDraft,
} from '../features/project-document';
import { useProjectExport } from '../features/project-export/useProjectExport';
import { useProjectGitController } from '../features/project-git';
import {
  useDesktopProjectIntegration,
  useDesktopProjectShortcuts,
  useProjectLifecycleController,
} from '../features/project-lifecycle';
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
  workspaceId: string;
  health: BackendHealth | null;
  project: ProjectSummary | null;
  loadedProject: LoadedProject | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (key: NavigationKey) => void;
  onUnsavedChangesChange: (hasChanges: boolean) => void;
  onRecoveryDraftFlushChange: (handler: () => Promise<boolean>) => void;
  isUpdateRelaunchAuthorized: () => boolean;
  onProjectLoaded: (project: LoadedProject) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function Dashboard({
  activeModule,
  workspaceId,
  loadedProject,
  theme,
  onToggleTheme,
  onNavigate,
  onUnsavedChangesChange,
  onRecoveryDraftFlushChange,
  isUpdateRelaunchAuthorized,
  onProjectLoaded,
}: DashboardProps) {
  const workspaceTitleId = useId();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [generatingTestKey, setGeneratingTestKey] = useState<string | null>(null);
  const [confirmGenerateType, setConfirmGenerateType] = useState<TestDataType | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const documentStateChangeRef = useRef<(hasChanges: boolean) => void>(() => undefined);
  const projectGitRefreshRef = useRef<() => void | Promise<void>>(() => undefined);
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
  const translationSettings = useTranslationSettings();
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
  const projectRecovery = useProjectRecoveryDraft({
    loadedProject,
    hasUnsavedChanges,
    onPersistenceError: projectLifecycle.setSaveStatus,
    onRestoreDocument: async (document) => {
      if (!loadedProject) return;
      const validation = await validateProjectDocument(document);
      applyLoadedProject(
        { ...loadedProject, document, validation },
        undefined,
        trackedDocumentSections,
      );
      void uiResource.refreshPreview(document, loadedProject.summary.path);
      projectLifecycle.setSaveStatus('已恢复异常退出前的未保存修改。');
    },
  });

  useEffect(() => {
    onRecoveryDraftFlushChange(projectRecovery.persistCurrentDraft);
    return () => onRecoveryDraftFlushChange(async () => true);
  }, [onRecoveryDraftFlushChange, projectRecovery.persistCurrentDraft]);
  useDesktopProjectShortcuts({
    canSave: hasUnsavedChanges && Boolean(loadedProject?.summary.path),
    canSaveAs: Boolean(loadedProject?.summary.path),
    isBusy: projectLifecycle.isOpening || projectLifecycle.isSavingProject,
    onOpen: () => void projectLifecycle.selectProjectFile(),
    onSave: projectLifecycle.requestSaveProject,
    onSaveAs: () => void projectLifecycle.saveProjectToNewPath(),
  });
  const projectGit = useProjectGitController({
    projectPath: loadedProject?.summary.path,
    sidecarPath: projectLifecycle.refactorConfigPath,
    hasUnsavedChanges,
    onNavigate,
    onReloadWorkingTree: projectLifecycle.reloadProject,
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

  const desktopProjectIntegration = useDesktopProjectIntegration({
    projectName: loadedProject?.summary.name,
    projectPath: loadedProject?.summary.path,
    hasUnsavedChanges,
    onOpenProject: (path) => {
      onNavigate('project');
      void projectLifecycle.openProject(path);
    },
    onStatusChange: projectLifecycle.setSaveStatus,
  });

  useEffect(() => {
    documentStateChangeRef.current = projectLifecycle.markDocumentState;
  }, [projectLifecycle.markDocumentState]);

  useEffect(() => {
    projectGitRefreshRef.current = projectGit.refresh;
  }, [projectGit.refresh]);

  useEffect(() => {
    onUnsavedChangesChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isUpdateRelaunchAuthorized()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let disposed = false;
    let unlisten: (() => void | Promise<void>) | null = null;
    if (isTauriRuntime()) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested((event) => {
            if (isUpdateRelaunchAuthorized()) return;
            event.preventDefault();
            setShowCloseConfirm(true);
          }),
        )
        .then((listener) => {
          if (disposed) {
            void Promise.resolve(listener()).catch(() => undefined);
            return;
          }
          unlisten = listener;
        })
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!unlisten) return;
      try {
        void Promise.resolve(unlisten()).catch(() => undefined);
      } catch {
        // The desktop event bridge may already be gone during window teardown.
      }
    };
  }, [hasUnsavedChanges, isUpdateRelaunchAuthorized]);

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

  async function confirmGenerateTestData() {
    if (!confirmGenerateType || !loadedProject) return;
    const type = confirmGenerateType;
    setGeneratingTestKey(type);
    setConfirmGenerateType(null);
    try {
      const { getTestData } = await import('../data/test-data');
      const data = getTestData(type);
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
    <main
      aria-labelledby={workspaceTitleId}
      className={projectGit.showReview ? 'workspace workspace--git-review' : 'workspace'}
      id={workspaceId}
      tabIndex={-1}
    >
      <h1 className="visually-hidden" id={workspaceTitleId}>
        {activeModule.title}
      </h1>
      {desktopProjectIntegration.isProjectDragActive ? (
        <div aria-live="polite" className="project-drop-overlay" role="status">
          <FolderOpen aria-hidden="true" size={28} strokeWidth={1.6} />
          <strong>释放以打开项目</strong>
          <span>当前未保存修改会在打开前请求确认</span>
        </div>
      ) : null}
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
        gitLoading={projectGit.refreshBusy}
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
            canEditWorkingTree={!hasUnsavedChanges}
            onLoadWorkingTreeFile={projectGit.loadWorktreeFile}
            onSaveWorkingTreeFile={projectGit.saveWorktreeFile}
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
        projectRecovery={projectRecovery}
        onCancelSave={projectLifecycle.cancelSaveProject}
        onConfirmSave={projectLifecycle.confirmSaveProject}
        onCancelTestData={() => setConfirmGenerateType(null)}
        onConfirmTestData={() => void confirmGenerateTestData()}
        onCancelClose={() => setShowCloseConfirm(false)}
        onConfirmClose={async () => {
          setShowCloseConfirm(false);
          const cleared = await projectRecovery.clearCurrentDraft(loadedProject?.summary.path);
          if (cleared !== null) {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().destroy();
          }
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
              gitLoading={projectGit.refreshBusy}
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
              translationConfigured={translationSettings.isConfigured}
              fullLanguageImportStatus={
                tableConfig.importError ??
                (tableConfig.importReport?.valid ? '完整语言表已导入。' : null)
              }
              isImportingFullLanguage={tableConfig.isImporting}
              onUpdate={updateLanguageDocument}
              onImportFullLanguage={() => tableConfig.importTable('language')}
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
              translationController={translationSettings}
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
