import type { FeatureModule } from '../types/platform';
import { useTranslation } from 'react-i18next';

interface ModuleCardProps {
  module: FeatureModule;
}

export function ModuleCard({ module }: ModuleCardProps) {
  const { t } = useTranslation();
  return (
    <section className="module-card">
      <h2>{t(module.titleKey)}</h2>
      <p>{t(module.descriptionKey)}</p>
    </section>
  );
}
