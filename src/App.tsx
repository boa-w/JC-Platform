import { useEffect, useMemo, useState } from 'react';
import { getBackendHealth, getProjectSummary } from './api/commands';
import { Sidebar } from './components/Sidebar';
import { featureModules } from './data/modules';
import { Dashboard } from './pages/Dashboard';
import { defaultNavigationKey } from './stores/navigation';
import { useTheme } from './stores/theme';
import type { BackendHealth, LoadedProject, NavigationKey, ProjectSummary } from './types/platform';
import './styles/app.css';

export default function App() {
  const [activeKey, setActiveKey] = useState<NavigationKey>(defaultNavigationKey);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loadedProject, setLoadedProject] = useState<LoadedProject | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    void getBackendHealth().then(setHealth);
    void getProjectSummary().then(setProject);
  }, []);

  const activeModule = useMemo(
    () => featureModules.find((module) => module.key === activeKey) ?? featureModules[0],
    [activeKey],
  );

  return (
    <div className="app-shell">
      <Sidebar
        modules={featureModules}
        activeKey={activeKey}
        onSelect={setActiveKey}
        theme={theme}
        onToggleTheme={toggleTheme}
        health={health}
        project={project}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <Dashboard
        activeModule={activeModule}
        health={health}
        project={project}
        loadedProject={loadedProject}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={setActiveKey}
        onProjectLoaded={(nextProject) => {
          setLoadedProject(nextProject);
          setProject(nextProject.summary);
        }}
      />
    </div>
  );
}
