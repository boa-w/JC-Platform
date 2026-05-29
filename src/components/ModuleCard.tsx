import type { FeatureModule } from '../types/platform';

interface ModuleCardProps {
  module: FeatureModule;
}

export function ModuleCard({ module }: ModuleCardProps) {
  return (
    <section className="module-card">
      <h2>{module.title}</h2>
      <p>{module.description}</p>
    </section>
  );
}
