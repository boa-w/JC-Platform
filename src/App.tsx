import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackendHealth, getProjectSummary } from './api/commands';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { resolveNavigationKey, useModuleVisibility } from './stores/moduleVisibility';
import { defaultNavigationKey } from './stores/navigation';
import { useTheme } from './stores/theme';
import type { BackendHealth, LoadedProject, NavigationKey, ProjectSummary } from './types/platform';
import './styles/tokens/primitives.css';
import './styles/tokens/semantic.css';
import './styles/tokens/components.css';
import './styles/app.css';
import './styles/theme-dark.css';

export default function App() {
  const { t } = useTranslation();
  const [activeKey, setActiveKey] = useState<NavigationKey>(defaultNavigationKey);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loadedProject, setLoadedProject] = useState<LoadedProject | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const updateRelaunchAuthorizedRef = useRef(false);
  const recoveryDraftFlushRef = useRef<() => Promise<boolean>>(async () => true);
  const workspaceId = useId();
  const [, startNavigationTransition] = useTransition();
  const { theme, toggleTheme } = useTheme();
  const moduleVisibility = useModuleVisibility();
  const { hiddenKeys, visibleModules } = moduleVisibility;

  useEffect(() => {
    void getBackendHealth().then(setHealth);
    void getProjectSummary().then(setProject);
  }, []);

  const activeModule = useMemo(
    () => visibleModules.find((module) => module.key === activeKey) ?? visibleModules[0],
    [activeKey, visibleModules],
  );

  // 当前激活页被用户隐藏时，回退到第一个可见功能页。
  useEffect(() => {
    if (!hiddenKeys.has(activeKey)) return;
    const target = resolveNavigationKey(activeKey, hiddenKeys);
    if (target) setActiveKey(target);
  }, [activeKey, hiddenKeys]);

  function navigate(key: NavigationKey) {
    const target = resolveNavigationKey(key, hiddenKeys);
    if (!target) return;
    startNavigationTransition(() => setActiveKey(target));
  }

  const authorizeUpdateRelaunch = useCallback(async () => {
    const persisted = await recoveryDraftFlushRef.current();
    if (!persisted) {
      throw new Error(t('app.updateDraftSaveFailed'));
    }
    updateRelaunchAuthorizedRef.current = true;
  }, [t]);

  const updateRecoveryDraftFlush = useCallback((handler: () => Promise<boolean>) => {
    recoveryDraftFlushRef.current = handler;
  }, []);

  const clearUpdateRelaunchAuthorization = useCallback(() => {
    updateRelaunchAuthorizedRef.current = false;
  }, []);

  const isUpdateRelaunchAuthorized = useCallback(() => updateRelaunchAuthorizedRef.current, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href={`#${workspaceId}`}>
        {t('app.skipToMain')}
      </a>
      <Sidebar
        modules={visibleModules}
        activeKey={activeKey}
        onSelect={navigate}
        theme={theme}
        onToggleTheme={toggleTheme}
        health={health}
        project={project}
        hasUnsavedChanges={hasUnsavedChanges}
        onBeforeUpdateRelaunch={authorizeUpdateRelaunch}
        onUpdateRelaunchError={clearUpdateRelaunchAuthorization}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <Dashboard
        activeModule={activeModule}
        moduleVisibility={moduleVisibility}
        visibleModules={visibleModules}
        workspaceId={workspaceId}
        health={health}
        project={project}
        loadedProject={loadedProject}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        onUnsavedChangesChange={setHasUnsavedChanges}
        onRecoveryDraftFlushChange={updateRecoveryDraftFlush}
        isUpdateRelaunchAuthorized={isUpdateRelaunchAuthorized}
        onProjectLoaded={(nextProject) => {
          setLoadedProject(nextProject);
          setProject(nextProject.summary);
        }}
      />
    </div>
  );
}
