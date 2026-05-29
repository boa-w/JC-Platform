import { convertFileSrc } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import type { ParsedUiResource, UiResourceParseReport, UiResourceUpdateRequest } from '../types/platform';

interface UiCanvasPreviewProps {
  report: UiResourceParseReport | null;
  canApply?: boolean;
  isApplying?: boolean;
  onAddOption?: (key: string, sources: string[]) => Promise<void>;
  onApply?: (resource: Omit<UiResourceUpdateRequest, 'document'>) => Promise<void>;
  onSelectOptionSources?: () => Promise<string[]>;
  onJumpToPdo?: (pdoParamIndex: number) => void;
  onRemoveOption?: (key: string, optionIndex: number) => Promise<void>;
}

export function UiCanvasPreview({
  report,
  canApply = false,
  isApplying = false,
  onAddOption,
  onApply,
  onJumpToPdo,
  onRemoveOption,
  onSelectOptionSources,
}: UiCanvasPreviewProps) {
  const parsedResources = useMemo(
    () => (report ? [report.logo, ...report.main_items].filter(Boolean) as ParsedUiResource[] : []),
    [report],
  );
  const [resources, setResources] = useState<ParsedUiResource[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newOptionSources, setNewOptionSources] = useState('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    setResources(parsedResources);
    setSelectedKey(parsedResources[0]?.key ?? null);
    setFailedImages(new Set());
  }, [parsedResources]);

  const selected = resources.find((resource) => resource.key === selectedKey) ?? null;
  const width = Math.max(480, ...resources.map((item) => item.x + item.width));
  const height = Math.max(272, ...resources.map((item) => item.y + item.height));
  const scale = Math.min(1, 760 / width);

  function previewImageSource(resource: ParsedUiResource) {
    const source = resource.options[resource.default_option]?.sources[0];
    return source ? { original: source, converted: convertFileSrc(source) } : null;
  }

  function updateSelected(field: 'x' | 'y' | 'width' | 'height' | 'default_option', value: number) {
    setResources((items) => items.map((item) => {
      if (item.key !== selectedKey) return item;
      if (field === 'default_option') {
        return { ...item, default_option: Math.max(0, Math.min(value, item.options.length - 1)) };
      }
      return { ...item, [field]: Math.max(0, value) };
    }));
  }

  async function applySelected() {
    if (!selected || !onApply) return;

    await onApply({
      key: selected.key,
      x: selected.x,
      y: selected.y,
      width: selected.width,
      height: selected.height,
      default_option: selected.default_option,
    });
  }

  async function selectOptionSources() {
    if (!onSelectOptionSources) return;
    const sources = await onSelectOptionSources();
    if (sources.length > 0) {
      setNewOptionSources((current) => [current, ...sources].filter(Boolean).join('\n'));
    }
  }

  async function addOption() {
    if (!selected || !onAddOption) return;

    const sources = newOptionSources
      .split('\n')
      .map((source) => source.trim())
      .filter(Boolean);

    if (sources.length === 0) return;
    await onAddOption(selected.key, sources);
    setNewOptionSources('');
  }

  async function removeSelectedOption() {
    if (!selected || !onRemoveOption) return;
    await onRemoveOption(selected.key, selected.default_option);
  }

  return (
    <section className="ui-preview-card">
      <div className="ui-preview-copy">
        <h2>UI 资源画布</h2>
        <p>按坐标和尺寸展示 logo 与 main 资源项，支持图片预览、坐标编辑、选项维护和 PDO 参数跳转。</p>
      </div>

      <div className="ui-editor-grid">
        <div className="ui-canvas-frame">
          <div className="ui-canvas" style={{ width: width * scale, height: height * scale }}>
            {resources.map((resource) => {
              const imageSource = previewImageSource(resource);
              return (
                <button
                  className={`ui-canvas-item ${resource.key === selectedKey ? 'selected' : ''}`}
                  key={resource.key}
                  onClick={() => setSelectedKey(resource.key)}
                  style={{
                    left: resource.x * scale,
                    top: resource.y * scale,
                    width: Math.max(resource.width * scale, 24),
                    height: Math.max(resource.height * scale, 24),
                  }}
                  type="button"
                >
                  {imageSource && !failedImages.has(imageSource.original) ? (
                    <img
                      alt={resource.name}
                      className="ui-canvas-image"
                      onError={() => setFailedImages((current) => new Set(current).add(imageSource.original))}
                      src={imageSource.converted}
                    />
                  ) : null}
                  <span className="ui-canvas-label">
                    <strong>{resource.name}</strong>
                    <small>{resource.handle} · {resource.options[resource.default_option]?.frame_count ?? 0} refs</small>
                  </span>
                  {imageSource && failedImages.has(imageSource.original) ? (
                    <small className="ui-canvas-image-error">图片加载失败：{imageSource.original}</small>
                  ) : null}
                </button>
              );
            })}
            {resources.length === 0 ? <span className="ui-canvas-empty">打开项目后显示 UI 资源</span> : null}
          </div>
        </div>

        <aside className="ui-property-panel">
          {selected ? (
            <>
              <h3>{selected.name}</h3>
              <small>{selected.key} · {selected.handle}</small>
              <div className="ui-property-grid">
                <div className="ui-property-row">
                  {(['x', 'y'] as const).map((field) => (
                    <label key={field}>
                      {field === 'x' ? 'X 坐标' : 'Y 坐标'}
                      <input
                        min="0"
                        onChange={(event) => updateSelected(field, Number(event.target.value))}
                        type="number"
                        value={selected[field]}
                      />
                    </label>
                  ))}
                </div>
                <div className="ui-property-row">
                  {(['width', 'height'] as const).map((field) => (
                    <label key={field}>
                      {field === 'width' ? '宽度' : '高度'}
                      <input
                        min="0"
                        onChange={(event) => updateSelected(field, Number(event.target.value))}
                        type="number"
                        value={selected[field]}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  默认选项
                  <select
                    onChange={(event) => updateSelected('default_option', Number(event.target.value))}
                    value={selected.default_option}
                  >
                    {selected.options.map((option, index) => (
                      <option key={`${selected.key}-${index}`} value={index}>
                        选项 {index}（{option.frame_count} 帧）
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button disabled={!canApply || isApplying} onClick={() => void applySelected()} type="button">
                {isApplying ? '写回中...' : '应用到项目文档'}
              </button>
              {typeof selected.pdo_param_index === 'number' ? (
                <button onClick={() => onJumpToPdo?.(selected.pdo_param_index as number)} type="button">
                  跳转到 PDO 参数 {selected.pdo_param_index}
                </button>
              ) : null}
              <div className="ui-option-tools">
                <label>
                  新增资源路径（每行一个）
                  <textarea
                    onChange={(event) => setNewOptionSources(event.target.value)}
                    placeholder="image/main/resource.png"
                    value={newOptionSources}
                  />
                </label>
                <div className="ui-option-actions">
                  <button disabled={!canApply || isApplying || !onSelectOptionSources} onClick={() => void selectOptionSources()} type="button">
                    选择图片
                  </button>
                  <button disabled={!canApply || isApplying || newOptionSources.trim() === ''} onClick={() => void addOption()} type="button">
                    新增选项
                  </button>
                  <button disabled={!canApply || isApplying || selected.options.length === 0} onClick={() => void removeSelectedOption()} type="button">
                    删除当前选项
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <p>点击画布中的资源项进行编辑</p>
            </div>
          )}
        </aside>
      </div>

      {report?.errors.length ? (
        <ul className="ui-preview-errors">
          {report.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
