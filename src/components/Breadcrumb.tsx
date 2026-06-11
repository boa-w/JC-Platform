import type { FeatureModule, NavigationKey } from '../types/platform';
import { findGroupForKey } from '../data/navigation';

interface BreadcrumbProps {
  activeKey: NavigationKey;
  modules: FeatureModule[];
  onNavigate: (key: NavigationKey) => void;
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
    </nav>
  );
}
