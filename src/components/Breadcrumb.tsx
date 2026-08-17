import { useTranslation } from 'react-i18next';
import { findGroupForKey } from '../data/navigation';
import type { FeatureModule, ModuleLifecycle, NavigationKey } from '../types/platform';

interface BreadcrumbProps {
  activeKey: NavigationKey;
  modules: FeatureModule[];
  onNavigate: (key: NavigationKey) => void;
}

function lifecycleLabelKey(lifecycle?: ModuleLifecycle) {
  if (lifecycle === 'experimental-deprecated') return 'common.lifecycle.experimentalDeprecated';
  if (lifecycle === 'experimental') return 'common.lifecycle.experimental';
  if (lifecycle === 'deprecated') return 'common.lifecycle.deprecated';
  return null;
}

export function Breadcrumb({ activeKey, modules, onNavigate }: BreadcrumbProps) {
  const { t } = useTranslation();
  const group = findGroupForKey(activeKey);
  if (!group) return null;

  const currentModule = modules.find((m) => m.key === activeKey);
  const groupEntryKey =
    group.keys.find((key) => modules.some((m) => m.key === key)) ?? group.keys[0];

  return (
    <nav className="breadcrumb" aria-label={t('navigation.breadcrumbLabel')}>
      {groupEntryKey === activeKey ? (
        <span className="breadcrumb-group">{t(group.labelKey)}</span>
      ) : (
        <button
          className="breadcrumb-group breadcrumb-group--link"
          onClick={() => onNavigate(groupEntryKey)}
          type="button"
        >
          {t(group.labelKey)}
        </button>
      )}
      <span className="breadcrumb-sep">/</span>
      <span aria-current="page" className="breadcrumb-current">
        {currentModule ? t(currentModule.titleKey) : activeKey}
      </span>
      {lifecycleLabelKey(currentModule?.lifecycle) ? (
        <span
          className={`module-lifecycle-badge module-lifecycle-badge--${currentModule?.lifecycle}`}
          title={
            currentModule?.lifecycleReasonKey ? t(currentModule.lifecycleReasonKey) : undefined
          }
        >
          {t(lifecycleLabelKey(currentModule?.lifecycle) ?? '')}
        </span>
      ) : null}
    </nav>
  );
}
