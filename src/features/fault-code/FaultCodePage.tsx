import type { LoadedProject } from '../../types/platform';
import { FaultCodeV2Page } from './FaultCodeV2Page';
import './fault-code.css';

interface FaultCodePageProps {
  loadedProject: LoadedProject | null;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

/** The new fault catalog is a jc002-only Profile editor. */
export function FaultCodePage({ loadedProject, onUpdateSections }: FaultCodePageProps) {
  if (!loadedProject) {
    return (
      <section className="table-spec-card">
        <h2>故障码</h2>
        <p>请先打开 jc002 项目。</p>
      </section>
    );
  }

  const document = loadedProject.document as Record<string, unknown>;
  if (document.config_version !== 'jc002') {
    return (
      <section className="table-spec-card">
        <h2>故障码</h2>
        <p>故障码 Profile 管理仅支持 jc002；jc001 不包含该管理模块。</p>
      </section>
    );
  }

  return <FaultCodeV2Page loadedProject={loadedProject} onUpdateSections={onUpdateSections} />;
}
