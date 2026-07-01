import { findGroupForKey } from '../data/navigation';
import type { FeatureModule, ModuleLifecycle, NavigationKey } from '../types/platform';

interface BreadcrumbProps {
  activeKey: NavigationKey;
  modules: FeatureModule[];
  onNavigate: (key: NavigationKey) => void;
}

function lifecycleLabel(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated') return '实验性 / 待废弃';
  if (lifecycle === 'experimental') return '实验性';
  if (lifecycle === 'deprecated') return '废弃';
  return null;
}

export function Breadcrumb({ activeKey, modules, onNavigate }: BreadcrumbProps) {
  const group = findGroupForKey(activeKey);
  if (!group) return null;

  const currentModule = modules.find((m) => m.key === activeKey);

  return (
    <nav className="breadcrumb" aria-label="导航路径">
      <span className="breadcrumb-group">{group.label}</span>
      <span className="breadcrumb-sep">/</span>
      <span className="breadcrumb-current">{currentModule?.title ?? activeKey}</span>
      {lifecycleLabel(currentModule?.lifecycle) ? (
        <span
          className={`module-lifecycle-badge module-lifecycle-badge--${currentModule?.lifecycle}`}
          title={currentModule?.lifecycleReason}
        >
          {lifecycleLabel(currentModule?.lifecycle)}
        </span>
      ) : null}
    </nav>
  );
}
