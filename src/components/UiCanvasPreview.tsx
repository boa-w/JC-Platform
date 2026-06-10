import { convertFileSrc } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import type { ParsedResourceOption, ParsedUiResource, UiResourceParseReport, UiResourceUpdateRequest } from '../types/platform';

interface UiCanvasPreviewProps {
  report: UiResourceParseReport | null;
  canApply?: boolean;
  isApplying?: boolean;
  showCanvasLabels?: boolean;
  onAddOption?: (key: string, sources: string[]) => Promise<void>;
  onApply?: (resource: Omit<UiResourceUpdateRequest, 'document'>) => Promise<void>;
  onSelectOptionSources?: () => Promise<string[]>;
  onJumpToPdo?: (pdoParamIndex: number) => void;
  onRemoveOption?: (key: string, optionIndex: number) => Promise<void>;
}

const DEFAULT_EXPANDED_KEYS = new Set(['root', 'main']);

function handleLabel(handle: ParsedUiResource['handle']) {
  if (handle === 'Show') return '静态图片';
  if (handle === 'List') return '状态列表';
  if (handle === 'Anim') return '帧动画';
  return '未知类型';
}

function optionTitle(option: ParsedResourceOption, index: number) {
  const parts = [`选项 ${index}`];
  if (option.frame_count > 0) parts.push(`${option.frame_count} 帧`);
  if (option.format) parts.push(option.format.toUpperCase());
  return parts.join(' · ');
}

export function UiCanvasPreview({
  report,
  canApply = false,
  isApplying = false,
  showCanvasLabels = true,
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
  const parsedResourceKeys = useMemo(() => new Set(parsedResources.map((resource) => resource.key)), [parsedResources]);
  const parsedLogoKey = report?.logo?.key ?? null;
  const parsedMainKeys = useMemo(() => new Set(report?.main_items.map((resource) => resource.key) ?? []), [report]);

  const [draftResources, setDraftResources] = useState<ParsedUiResource[]>([]);
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED_KEYS));
  const [newOptionSources, setNewOptionSources] = useState('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDraftResources(parsedResources);
    setSelectedResourceKey((current) => (
      current && parsedResourceKeys.has(current) ? current : parsedResources[0]?.key ?? null
    ));
    setExpandedKeys((current) => {
      const next = new Set(current.size > 0 ? current : DEFAULT_EXPANDED_KEYS);
      next.add('root');
      next.add('main');
      return next;
    });
    setFailedImages(new Set());
  }, [parsedResourceKeys, parsedResources]);

  const logoResource = draftResources.find((resource) => resource.key === parsedLogoKey) ?? null;
  const mainResources = draftResources.filter((resource) => parsedMainKeys.has(resource.key));
  const selected = draftResources.find((resource) => resource.key === selectedResourceKey) ?? null;
  const width = Math.max(480, ...draftResources.map((item) => item.x + item.width));
  const height = Math.max(272, ...draftResources.map((item) => item.y + item.height));
  const scale = Math.min(1, 760 / width);
  const isRootExpanded = expandedKeys.has('root');
  const isMainExpanded = expandedKeys.has('main');
  const canAddOption = Boolean(onAddOption && selected && selected.handle !== 'Anim');

  function previewImageSource(resource: ParsedUiResource) {
    const source = resource.options[resource.default_option]?.sources[0];
    return source ? { original: source, converted: convertFileSrc(source) } : null;
  }

  function optionImageSource(option: ParsedResourceOption) {
    const source = option.sources[0];
    return source ? { original: source, converted: convertFileSrc(source) } : null;
  }

  function markImageFailed(source: string) {
    setFailedImages((current) => new Set(current).add(source));
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function ensureExpanded(key: string) {
    setExpandedKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }

  function selectResource(key: string) {
    setSelectedResourceKey(key);
    if (parsedMainKeys.has(key)) ensureExpanded('main');
  }

  function selectMainGroup() {
    ensureExpanded('main');
    if (mainResources.length > 0) {
      setSelectedResourceKey(mainResources[0].key);
    }
  }

  function updateSelected(field: 'x' | 'y' | 'width' | 'height' | 'default_option', value: number) {
    setDraftResources((items) => items.map((item) => {
      if (item.key !== selectedResourceKey) return item;
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
    if (!selected || !onAddOption || selected.handle === 'Anim') return;

    const sources = newOptionSources
      .split('\n')
      .map((source) => source.trim())
      .filter(Boolean);

    if (sources.length === 0) return;
    await onAddOption(selected.key, sources);
    setNewOptionSources('');
  }

  async function removeOption(optionIndex: number) {
    if (!selected || !onRemoveOption) return;
    await onRemoveOption(selected.key, optionIndex);
  }

  return (
    <section className="ui-preview-card ui-resource-editor">
      <div className="ui-editor-header">
        <h2 className="ui-editor-title">UI 资源编辑</h2>
      </div>
      <div className="ui-editor-grid">
        <aside className="ui-resource-tree-panel">
          <div className="ui-resource-tree-header">
            <strong>资源条目</strong>
            <span>{draftResources.length} 项</span>
          </div>
          <div className="ui-resource-tree" role="tree">
            <div className="ui-tree-group" role="treeitem" aria-expanded={isRootExpanded}>
              <button className="ui-tree-toggle" onClick={() => toggleExpanded('root')} type="button" aria-label={isRootExpanded ? '折叠 UI资源' : '展开 UI资源'}>
                {isRootExpanded ? '▾' : '▸'}
              </button>
              <button className="ui-tree-node ui-tree-node--group" onClick={() => toggleExpanded('root')} type="button">
                <span>UI资源</span>
                <small>{draftResources.length} 项</small>
              </button>
            </div>

            {isRootExpanded ? (
              <div className="ui-tree-children" role="group">
                {logoResource ? (
                  <button
                    className={`ui-tree-node ui-tree-node--resource ${selectedResourceKey === logoResource.key ? 'selected' : ''}`}
                    onClick={() => selectResource(logoResource.key)}
                    role="treeitem"
                    type="button"
                  >
                    <span>{logoResource.name}</span>
                    <small>{logoResource.key} · {handleLabel(logoResource.handle)}</small>
                  </button>
                ) : null}

                <div className="ui-tree-group" role="treeitem" aria-expanded={isMainExpanded}>
                  <button className="ui-tree-toggle" onClick={() => toggleExpanded('main')} type="button" aria-label={isMainExpanded ? '折叠 main' : '展开 main'}>
                    {isMainExpanded ? '▾' : '▸'}
                  </button>
                  <button className="ui-tree-node ui-tree-node--group" onClick={selectMainGroup} type="button">
                    <span>main</span>
                    <small>{mainResources.length} 项</small>
                  </button>
                </div>

                {isMainExpanded ? (
                  <div className="ui-tree-children ui-tree-children--nested" role="group">
                    {mainResources.map((resource) => (
                      <button
                        className={`ui-tree-node ui-tree-node--resource ${selectedResourceKey === resource.key ? 'selected' : ''}`}
                        key={resource.key}
                        onClick={() => selectResource(resource.key)}
                        role="treeitem"
                        type="button"
                      >
                        <span>{resource.name}</span>
                        <small>{resource.key} · {handleLabel(resource.handle)} · {resource.options.length} 选项</small>
                      </button>
                    ))}
                    {mainResources.length === 0 ? <p className="ui-tree-empty">main 下暂无资源项</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <div className="ui-canvas-frame">
          <div className="ui-canvas" style={{ width: width * scale, height: height * scale }}>
            {draftResources.map((resource) => {
              const imageSource = previewImageSource(resource);
              return (
                <button
                  className={`ui-canvas-item ${resource.key === selectedResourceKey ? 'selected' : ''}`}
                  key={resource.key}
                  onClick={() => selectResource(resource.key)}
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
                      onError={() => markImageFailed(imageSource.original)}
                      src={imageSource.converted}
                    />
                  ) : null}
                  {showCanvasLabels ? (
                    <span className="ui-canvas-label">
                      <strong>{resource.name}</strong>
                      <small>{resource.key} · {handleLabel(resource.handle)}</small>
                      <small>{resource.options[resource.default_option]?.frame_count ?? 0} refs</small>
                    </span>
                  ) : null}
                  {imageSource && failedImages.has(imageSource.original) ? (
                    <small className="ui-canvas-image-error">图片加载失败：{imageSource.original}</small>
                  ) : null}
                </button>
              );
            })}
            {draftResources.length === 0 ? <span className="ui-canvas-empty">打开项目后显示 UI 资源</span> : null}
          </div>
        </div>

        <aside className="ui-resource-side-panel">
          {selected ? (
            <>
              <section className="ui-option-gallery-panel">
                <div className="ui-panel-section-title">
                  <strong>资源选项</strong>
                  <span>{selected.options.length} 项</span>
                </div>
                <div className="ui-option-gallery">
                  {selected.options.map((option, index) => {
                    const imageSource = optionImageSource(option);
                    const isSelectedOption = selected.default_option === index;
                    return (
                      <article className={`ui-option-card ${isSelectedOption ? 'selected' : ''}`} key={`${selected.key}-${index}`}>
                        <button className="ui-option-preview" onClick={() => updateSelected('default_option', index)} type="button">
                          {imageSource && !failedImages.has(imageSource.original) ? (
                            <img
                              alt={optionTitle(option, index)}
                              onError={() => markImageFailed(imageSource.original)}
                              src={imageSource.converted}
                            />
                          ) : (
                            <span>{imageSource ? '图片加载失败' : '无预览'}</span>
                          )}
                        </button>
                        <div className="ui-option-meta">
                          <strong>{optionTitle(option, index)}</strong>
                          {isSelectedOption ? <span>默认</span> : null}
                          {option.sources.length > 0 ? <small title={option.sources[0]}>{option.sources[0]}</small> : null}
                        </div>
                        <button
                          className="ui-option-delete"
                          disabled={!canApply || isApplying || !onRemoveOption}
                          onClick={() => void removeOption(index)}
                          type="button"
                        >
                          ✕
                        </button>
                      </article>
                    );
                  })}
                  {selected.options.length === 0 ? <p className="ui-tree-empty">当前资源暂无选项</p> : null}
                </div>
              </section>

              <section className="ui-property-panel">
                <div className="ui-panel-section-title">
                  <strong>{selected.name}</strong>
                  <span>{selected.key}</span>
                </div>

                <div className="ui-property-section">
                  <h3>基本信息</h3>
                  <dl className="ui-property-facts">
                    <div><dt>类型</dt><dd>{handleLabel(selected.handle)}</dd></div>
                    <div><dt>选项数</dt><dd>{selected.options.length}</dd></div>
                    <div><dt>导出目标</dt><dd>{selected.dest.length > 0 ? selected.dest.join('、') : '未配置'}</dd></div>
                  </dl>
                </div>

                <div className="ui-property-section">
                  <h3>坐标尺寸</h3>
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
                        disabled={selected.options.length === 0}
                        onChange={(event) => updateSelected('default_option', Number(event.target.value))}
                        value={selected.default_option}
                      >
                        {selected.options.map((option, index) => (
                          <option key={`${selected.key}-select-${index}`} value={index}>
                            {optionTitle(option, index)}
                          </option>
                        ))}
                        {selected.options.length === 0 ? <option value={0}>无选项</option> : null}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="ui-property-section">
                  <h3>协议关联</h3>
                  {typeof selected.pdo_param_index === 'number' ? (
                    <button className="ui-editor-btn ui-editor-btn--secondary" onClick={() => onJumpToPdo?.(selected.pdo_param_index as number)} type="button">
                      跳转到 PDO 参数 {selected.pdo_param_index}
                    </button>
                  ) : (
                    <p className="ui-property-muted">当前资源未配置 PDO 参数关联。</p>
                  )}
                </div>

                <button className="ui-editor-btn ui-editor-btn--primary" disabled={!canApply || isApplying || !onApply} onClick={() => void applySelected()} type="button">
                  {isApplying ? '写回中...' : '应用到项目文档'}
                </button>

                <div className="ui-option-tools">
                  <label>
                    新增资源路径（每行一个）
                    <textarea
                      disabled={selected.handle === 'Anim'}
                      onChange={(event) => setNewOptionSources(event.target.value)}
                      placeholder={selected.handle === 'Anim' ? '动画资源新增需后端扩展' : 'image/main/resource.png'}
                      value={newOptionSources}
                    />
                  </label>
                  <div className="ui-option-actions">
                    <button className="ui-editor-btn ui-editor-btn--secondary" disabled={!canApply || isApplying || !onSelectOptionSources || selected.handle === 'Anim'} onClick={() => void selectOptionSources()} type="button">
                      选择图片
                    </button>
                    <button className="ui-editor-btn ui-editor-btn--primary" disabled={!canApply || isApplying || !canAddOption || newOptionSources.trim() === ''} onClick={() => void addOption()} type="button">
                      新增选项
                    </button>
                    <button className="ui-editor-btn ui-editor-btn--danger" disabled={!canApply || isApplying || selected.options.length === 0 || !onRemoveOption} onClick={() => void removeOption(selected.default_option)} type="button">
                      删除默认选项
                    </button>
                  </div>
                  {selected.handle === 'Anim' ? <p className="ui-property-muted">动画资源当前支持展示、切换默认项和删除；新增动画选项需扩展后端请求结构。</p> : null}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <p>点击左侧树或画布中的资源项进行编辑</p>
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
