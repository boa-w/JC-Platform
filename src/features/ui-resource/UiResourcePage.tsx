import { UiCanvasPreview } from '../../components/UiCanvasPreview';
import type { LoadedProject } from '../../types/platform';
import type { UiResourceController } from './useUiResourceController';

interface UiResourcePageProps {
  controller: UiResourceController;
  loadedProject: LoadedProject | null;
  onJumpToPdo: (pdoParamIndex: number) => void;
}

export function UiResourcePage({
  controller,
  loadedProject,
  onJumpToPdo,
}: UiResourcePageProps) {
  return (
    <div aria-busy={controller.isLoading} className="ui-resource-page">
      {controller.isLoading && loadedProject ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          正在解析 UI 资源...
        </p>
      ) : null}
      <UiCanvasPreview
        canApply={Boolean(loadedProject)}
        isApplying={controller.isApplying}
        showCanvasLabels={controller.showCanvasLabels}
        onAddOption={controller.addOption}
        onApply={controller.applyResource}
        onJumpToPdo={onJumpToPdo}
        onRemoveOption={controller.removeOption}
        onSelectOptionSources={controller.selectOptionSources}
        report={controller.report}
      />
      {controller.error ? (
        <p aria-live="assertive" className="ui-preview-errors" role="alert">
          {controller.error}
        </p>
      ) : null}
    </div>
  );
}
