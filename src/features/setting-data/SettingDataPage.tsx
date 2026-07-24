import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getStorageItem, setStorageItem } from '../../utils/safeStorage';
import {
  communicationIndexRadixStorageKey,
  settingColumnPresetOptions,
  settingColumnPresetStorageKey,
  settingParameterColumns,
} from './config';
import type {
  CommunicationIndexRadix,
  SettingColumnPreset,
  SettingDataPageProps,
  SettingEditorField,
  SettingParameterColumn,
  SettingParameterColumnKey,
  SettingParameterRow,
} from './types';
import { useSettingData } from './useSettingData';
import { formatCommunicationIndex, parseCommunicationIndex } from './communicationIndex';
import {
  parseSettingDataTypeValue,
  settingDataTypeByHandle,
  settingDataTypeIsDefaultWrite,
  validateDefaultWriteValue,
} from './settingDataTypes';
import {
  formatSettingPath,
  isSameOrDescendantPath,
  optionsWithCurrentValue,
  sdoNodeDocumentPath,
} from './utils';
import '../legacy-data.css';

const pinnedSettingColumnKeys: SettingParameterColumnKey[] = ['select', 'index', 'name'];
const communicationIndexFields = new Set(['fid', 'mid', 'sid']);

function readCommunicationIndexRadix(): CommunicationIndexRadix {
  if (typeof window === 'undefined') return 'hexadecimal';
  return getStorageItem(communicationIndexRadixStorageKey) === 'decimal'
    ? 'decimal'
    : 'hexadecimal';
}

interface CommunicationIndexInputProps {
  field: SettingEditorField;
  radix: CommunicationIndexRadix;
  value: number;
  onCommit: (value: number) => void;
}

function CommunicationIndexInput({
  field,
  radix,
  value,
  onCommit,
}: CommunicationIndexInputProps) {
  const hexWidth = field.field === 'mid' ? 4 : 2;
  const formattedValue = formatCommunicationIndex(value, radix, hexWidth);
  const [draft, setDraft] = useState(formattedValue);
  const parsedDraft = parseCommunicationIndex(draft, radix);
  const isInvalid = parsedDraft === null;

  useEffect(() => {
    setDraft(formattedValue);
  }, [formattedValue]);

  function commit() {
    if (parsedDraft === null) {
      setDraft(formattedValue);
      return;
    }
    onCommit(parsedDraft);
    setDraft(formatCommunicationIndex(parsedDraft, radix, hexWidth));
  }

  return (
    <label>
      {field.label}
      <input
        aria-invalid={isInvalid || undefined}
        inputMode={radix === 'decimal' ? 'numeric' : 'text'}
        spellCheck={false}
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(formattedValue);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="setting-index-input-hint">
        {radix === 'hexadecimal' ? '输入十六进制，例如 0x10' : '输入十进制，例如 16'}
      </span>
    </label>
  );
}

function readSettingColumnPreset(): SettingColumnPreset {
  if (typeof window === 'undefined') return 'common';
  const saved = getStorageItem(settingColumnPresetStorageKey);
  return settingColumnPresetOptions.some((option) => option.value === saved)
    ? (saved as SettingColumnPreset)
    : 'common';
}

function settingBreadcrumbEntries(pathNames: string[]) {
  let path = '';
  return pathNames.map((name) => {
    path = `${path}/${name}`;
    return { key: path, name };
  });
}

export function SettingDataPage({
  loadedProject,
  isActive,
  sidebarCollapsed,
  setSidebarCollapsed,
  updateProjectDocument,
  isModifiedPath,
  restoreModifiedPath,
}: SettingDataPageProps) {
  const settingDrawerTitleId = useId();
  const settingDrawerDescriptionId = useId();
  const settingData = useSettingData({
    loadedDocument: loadedProject ? (loadedProject.document as Record<string, unknown>) : null,
    isActive,
    updateProjectDocument,
    isModifiedPath,
    restoreModifiedPath,
  });
  const [selectedParameterPaths, setSelectedParameterPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDeleteRows, setPendingDeleteRows] = useState<SettingParameterRow[]>([]);
  const [columnPreset, setColumnPreset] = useState<SettingColumnPreset>(readSettingColumnPreset);
  const [communicationIndexRadix, setCommunicationIndexRadix] =
    useState<CommunicationIndexRadix>(readCommunicationIndexRadix);
  const lastSelectedParameterPathRef = useRef<string | null>(null);
  const visibleParameterPathKeysRef = useRef<string[]>([]);
  const selectedColumnPreset =
    settingColumnPresetOptions.find((option) => option.value === columnPreset) ??
    settingColumnPresetOptions[0];
  const visibleColumnKeySet = new Set(selectedColumnPreset.columns);
  const visibleSettingParameterColumns = settingParameterColumns.filter((column) =>
    visibleColumnKeySet.has(column.key),
  );
  const pinnedColumnLeftOffsets = new Map<SettingParameterColumnKey, number>();
  let pinnedColumnOffset = 0;
  for (const column of visibleSettingParameterColumns) {
    if (!pinnedSettingColumnKeys.includes(column.key)) continue;
    pinnedColumnLeftOffsets.set(column.key, pinnedColumnOffset);
    pinnedColumnOffset += settingData.settingColumnWidth(column);
  }
  const visibleTableMinWidth = visibleSettingParameterColumns.reduce(
    (total, column) => total + settingData.settingColumnWidth(column),
    0,
  );
  const activeSettingBreadcrumbs = settingBreadcrumbEntries(settingData.activeSettingPathNames);
  const visibleParameterPathKeys = settingData.settingParameters.map((row) => row.path.join('/'));
  visibleParameterPathKeysRef.current = visibleParameterPathKeys;
  const selectedParameterRows = settingData.settingParameters.filter((row) =>
    selectedParameterPaths.has(row.path.join('/')),
  );
  const allVisibleParametersSelected =
    visibleParameterPathKeys.length > 0 &&
    visibleParameterPathKeys.every((key) => selectedParameterPaths.has(key));
  const someVisibleParametersSelected = visibleParameterPathKeys.some((key) =>
    selectedParameterPaths.has(key),
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return;
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && target.type !== 'checkbox') ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setSelectedParameterPaths(new Set(visibleParameterPathKeysRef.current));
      lastSelectedParameterPathRef.current = null;
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function clearParameterSelection() {
    setSelectedParameterPaths(new Set());
    setPendingDeleteRows([]);
    lastSelectedParameterPathRef.current = null;
  }

  function toggleParameterSelection(path: number[], selected: boolean, range: boolean) {
    const key = path.join('/');
    const targetIndex = visibleParameterPathKeys.indexOf(key);
    const anchorIndex = lastSelectedParameterPathRef.current
      ? visibleParameterPathKeys.indexOf(lastSelectedParameterPathRef.current)
      : -1;
    setSelectedParameterPaths((current) => {
      const next = new Set(current);
      if (range && anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        for (const rangeKey of visibleParameterPathKeys.slice(start, end + 1)) {
          if (selected) next.add(rangeKey);
          else next.delete(rangeKey);
        }
      } else if (selected) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    lastSelectedParameterPathRef.current = key;
  }

  function toggleAllVisibleParameters(selected: boolean) {
    setSelectedParameterPaths(selected ? new Set(visibleParameterPathKeys) : new Set());
    lastSelectedParameterPathRef.current = null;
  }

  function handleParameterSelectionChange(
    event: ChangeEvent<HTMLInputElement>,
    row: SettingParameterRow,
  ) {
    const nativeEvent = event.nativeEvent as Event & { shiftKey?: boolean };
    toggleParameterSelection(row.path, event.target.checked, Boolean(nativeEvent.shiftKey));
  }

  function handleColumnPresetChange(nextPreset: SettingColumnPreset) {
    setColumnPreset(nextPreset);
    setStorageItem(settingColumnPresetStorageKey, nextPreset);
  }

  function handleCommunicationIndexRadixChange(nextRadix: CommunicationIndexRadix) {
    setCommunicationIndexRadix(nextRadix);
    setStorageItem(communicationIndexRadixStorageKey, nextRadix);
  }

  function renderCommunicationIndexRadixControl(compact = false) {
    return (
      <fieldset
        className={`setting-index-radix${compact ? ' setting-index-radix--compact' : ''}`}
        aria-label="通信索引显示进制"
      >
        <button
          aria-pressed={communicationIndexRadix === 'decimal'}
          onClick={() => handleCommunicationIndexRadixChange('decimal')}
          type="button"
        >
          十进制
        </button>
        <button
          aria-pressed={communicationIndexRadix === 'hexadecimal'}
          onClick={() => handleCommunicationIndexRadixChange('hexadecimal')}
          type="button"
        >
          十六进制
        </button>
      </fieldset>
    );
  }

  function settingColumnClassName(column: SettingParameterColumn) {
    return [
      column.align ? `text-${column.align}` : '',
      pinnedColumnLeftOffsets.has(column.key) ? 'setting-table-sticky-left' : '',
      column.key === 'name' ? 'setting-table-sticky-left-edge' : '',
      column.key === 'actions' ? 'setting-table-sticky-right' : '',
      `setting-column-${column.key}`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  function settingColumnStyle(column: SettingParameterColumn) {
    const left = pinnedColumnLeftOffsets.get(column.key);
    if (left !== undefined) {
      const width = settingData.settingColumnWidth(column);
      return { left, maxWidth: width, minWidth: width, width };
    }
    if (column.key === 'actions') {
      const width = settingData.settingColumnWidth(column);
      return { maxWidth: width, minWidth: width, width };
    }
    return undefined;
  }

  function confirmDeleteParameters() {
    const paths = pendingDeleteRows.map((row) => row.path);
    settingData.removeSdoNodes(paths);
    if (
      settingData.editingSettingPath &&
      paths.some((path) => isSameOrDescendantPath(path, settingData.editingSettingPath!))
    ) {
      settingData.setEditingSettingPath(null);
    }
    clearParameterSelection();
  }

  function renderSettingParameterCell(row: SettingParameterRow, column: SettingParameterColumn) {
    if (column.key === 'select') {
      const key = row.path.join('/');
      return (
        <input
          aria-label={`选择参数 ${row.name}`}
          checked={selectedParameterPaths.has(key)}
          onChange={(event) => handleParameterSelectionChange(event, row)}
          title="按住 Shift 可连续选择"
          type="checkbox"
        />
      );
    }
    if (column.key === 'actions') {
      return (
        <>
          <button
            onClick={() => settingData.openSettingEditorDrawer(row.path)}
            title="修改参数配置定义，不写入当前运行状态"
            type="button"
          >
            编辑定义
          </button>
          <button className="danger" onClick={() => setPendingDeleteRows([row])} type="button">
            删除
          </button>
        </>
      );
    }
    if (column.key === 'access') {
      return (
        <span
          className={`setting-access-chip ${row.isReadonly ? 'setting-access-chip--readonly' : 'setting-access-chip--readwrite'}`}
          title={row.usageHint}
        >
          {row.access}
        </span>
      );
    }
    if (column.key === 'frameId') {
      return formatCommunicationIndex(row.frameIdValue, communicationIndexRadix, 2);
    }
    if (column.key === 'mainIndex') {
      return formatCommunicationIndex(row.mainIndexValue, communicationIndexRadix, 4);
    }
    if (column.key === 'subIndex') {
      return formatCommunicationIndex(row.subIndexValue, communicationIndexRadix, 2);
    }
    const value = row[column.key];
    return column.key === 'name' || column.key === 'dataType' || column.key === 'preprocess' ? (
      <span title={String(value)}>{value}</span>
    ) : (
      value
    );
  }

  function renderSettingEditorField(field: SettingEditorField, path: number[]) {
    const node = settingData.editingSettingNode;
    if (!node) return null;
    const value = settingData.settingEditorFieldValue(node, field);
    if (communicationIndexFields.has(field.field)) {
      return (
        <CommunicationIndexInput
          field={field}
          key={field.field}
          radix={communicationIndexRadix}
          value={typeof value === 'number' ? value : Number(value) || 0}
          onCommit={(nextValue) =>
            settingData.updateSettingEditorField(path, field, nextValue)
          }
        />
      );
    }
    if (field.kind === 'select') {
      const options = optionsWithCurrentValue(field.options ?? [], value);
      const dataTypeDefinition =
        field.field === 'data_type_label' ? parseSettingDataTypeValue(value) : null;
      return (
        <label key={field.field}>
          {field.label}
          <select
            value={String(value)}
            onChange={(event) =>
              settingData.updateSettingEditorField(
                path,
                field,
                typeof field.defaultValue === 'number'
                  ? Number(event.target.value)
                  : event.target.value,
              )
            }
          >
            {options.map((option) => (
              <option key={`${field.field}-${option.value}`} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          {dataTypeDefinition ? (
            <span className="setting-editor-field-hint">
              {dataTypeDefinition.description} · 配置写入 handle={dataTypeDefinition.handle}
            </span>
          ) : null}
        </label>
      );
    }
    if (field.kind === 'number') {
      return (
        <label key={field.field}>
          {field.label}
          <input
            type="number"
            value={value}
            onChange={(event) =>
              settingData.updateSettingEditorField(path, field, Number(event.target.value))
            }
          />
        </label>
      );
    }
    const defaultWriteDefinition =
      field.field === 'data_default' && settingDataTypeIsDefaultWrite(node.handle)
        ? settingDataTypeByHandle(node.handle)
        : null;
    const defaultWriteValueValid =
      !defaultWriteDefinition || validateDefaultWriteValue(String(value), node.handle);
    return (
      <label key={field.field}>
        {field.label}
        <input
          aria-invalid={!defaultWriteValueValid || undefined}
          placeholder={
            defaultWriteDefinition ? '必填，支持十进制或 0x 十六进制' : undefined
          }
          required={Boolean(defaultWriteDefinition)}
          value={String(value)}
          onChange={(event) =>
            settingData.updateSettingEditorField(path, field, event.target.value)
          }
        />
        {defaultWriteDefinition ? (
          <span className="setting-editor-field-hint">
            {defaultWriteDefinition.defaultWriteBytes} 字节无符号值，不能为空且不能超出范围
          </span>
        ) : null}
      </label>
    );
  }

  function renderSettingEditorDrawer() {
    if (!settingData.editingSettingPath || !settingData.editingSettingNode) return null;

    const editorPath = sdoNodeDocumentPath(settingData.editingSettingPath);
    const isMenu = settingData.editingSettingNode.type === 0;

    return (
      <div className="legacy-drawer-layer" role="presentation">
        <button
          className="legacy-drawer-backdrop"
          aria-label="关闭设置数据编辑面板"
          onClick={settingData.closeSettingEditorDrawer}
          type="button"
        />
        <aside
          className="legacy-drawer legacy-drawer--setting"
          ref={settingData.settingDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={settingDrawerTitleId}
          aria-describedby={settingDrawerDescriptionId}
        >
          <div className="legacy-drawer-header">
            <div>
              <strong id={settingDrawerTitleId}>
                {isMenu ? '菜单编辑' : '参数编辑'}：
                {settingData.editingSettingNode.name || '未命名'}
              </strong>
              <p id={settingDrawerDescriptionId}>编辑设置数据定义，不写入设备当前运行状态。</p>
            </div>
            <button
              ref={settingData.settingDrawerCloseRef}
              aria-label="关闭设置数据编辑面板"
              onClick={settingData.closeSettingEditorDrawer}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="legacy-drawer-body">
            <section className="legacy-edit-panel legacy-edit-panel--drawer">
              <div className="legacy-edit-panel-header">
                <strong>{isMenu ? '菜单定义' : '参数定义'}</strong>
                <div className="setting-editor-drawer-actions">
                  {settingData.isModifiedPath(editorPath) ? (
                    <button
                      className="config-restore-button"
                      onClick={() => settingData.restoreModifiedPath(editorPath)}
                      type="button"
                    >
                      恢复
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="legacy-edit-sections">
                {settingData
                  .visibleSettingEditorSections(settingData.editingSettingNode)
                  .map((section) => (
                    <section className="legacy-edit-section" key={section.title}>
                      <div className="legacy-edit-section-heading">
                        <div className="legacy-edit-section-title">{section.title}</div>
                        {section.title === '通信索引'
                          ? renderCommunicationIndexRadixControl(true)
                          : null}
                      </div>
                      <div className="legacy-edit-grid legacy-edit-grid--sectioned">
                        {section.fields.map((field) =>
                          renderSettingEditorField(field, settingData.editingSettingPath!),
                        )}
                      </div>
                    </section>
                  ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <section
        className={
          sidebarCollapsed ? 'legacy-data-page legacy-data-page--collapsed' : 'legacy-data-page'
        }
      >
        <div className="legacy-data-sidebar">
          <div className="legacy-data-sidebar-header">
            <div className="legacy-data-sidebar-title">菜单</div>
            <button
              className="legacy-sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              type="button"
              title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" size={15} strokeWidth={1.8} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={15} strokeWidth={1.8} />
              )}
            </button>
          </div>
          {!sidebarCollapsed ? (
            <div className="setting-menu-search">
              <input
                onChange={(event) => {
                  clearParameterSelection();
                  settingData.setSettingSearchQuery(event.target.value);
                }}
                placeholder="搜索菜单或参数，例如：开关、座椅、前进"
                value={settingData.settingSearchQuery}
              />
              {settingData.settingSearchQuery ? (
                <button
                  onClick={() => {
                    clearParameterSelection();
                    settingData.setSettingSearchQuery('');
                  }}
                  type="button"
                >
                  清空
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="legacy-menu-list">
            {settingData.settingMenus.map((menu) => (
              <button
                className={[
                  menu.key === settingData.activeSettingPath
                    ? 'legacy-menu-item active'
                    : 'legacy-menu-item',
                  menu.isSearchMatch ? 'setting-menu-match' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={menu.key}
                onClick={() => {
                  clearParameterSelection();
                  settingData.setSelectedSettingPath(menu.key);
                }}
                style={{ paddingLeft: `${16 + menu.level * 22}px` }}
                title={`${formatSettingPath(menu.pathNames)}｜参数 ${menu.parameterCount}`}
                type="button"
              >
                {menu.hasMenuChildren ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="legacy-menu-arrow"
                    size={14}
                    strokeWidth={1.8}
                  />
                ) : (
                  <span className="legacy-menu-arrow" />
                )}
                <span className="setting-menu-label">
                  <span className="setting-menu-main">{menu.name}</span>
                  <span
                    className={
                      menu.parameterCount > 0
                        ? 'setting-menu-count'
                        : 'setting-menu-count setting-menu-count--empty'
                    }
                  >
                    {menu.parameterCount}
                  </span>
                </span>
              </button>
            ))}
            {settingData.settingMenus.length === 0 ? (
              <div className="setting-menu-empty">
                {settingData.settingSearchQuery
                  ? '没有匹配的菜单或参数。可试试“开关”“座椅”“前进”“P/S”。'
                  : '暂无可显示菜单'}
              </div>
            ) : null}
          </div>
        </div>
        <div className="legacy-data-content">
          <div className="legacy-data-header">
            <div className="setting-data-heading">
              <div className="setting-breadcrumb">
                {activeSettingBreadcrumbs.map((item) => (
                  <span className="setting-breadcrumb-segment" key={item.key}>
                    {item.name}
                  </span>
                ))}
              </div>
              <div className="setting-menu-summary">
                <strong>{settingData.activeSettingNode?.name ?? '菜单'}</strong>
                <span className="setting-summary-chip">
                  {settingData.settingParameters.length} 个参数
                </span>
                <span className="setting-summary-chip">
                  {settingData.readonlySettingParameterCount} 个只读
                </span>
                <span className="setting-summary-chip">
                  {settingData.booleanMonitorParameterCount} 个 0/1 监测项
                </span>
              </div>
            </div>
            <div className="legacy-data-actions">
              <button
                disabled={!settingData.currentSdoDocument}
                onClick={() =>
                  settingData.addSdoMenu(
                    settingData.activeSettingNode ? settingData.activeSettingPathNumbers : [],
                  )
                }
                type="button"
              >
                新增菜单
              </button>
              <button
                disabled={!settingData.activeSettingNode}
                onClick={() =>
                  settingData.openSettingEditorDrawer(settingData.activeSettingPathNumbers)
                }
                type="button"
              >
                修改菜单
              </button>
              <button
                disabled={!settingData.activeSettingNode}
                onClick={() => settingData.addSdoParameter(settingData.activeSettingPathNumbers)}
                type="button"
              >
                新增参数
              </button>
              <button
                className="danger"
                disabled={!settingData.activeSettingNode}
                onClick={() => {
                  settingData.removeSdoNode(settingData.activeSettingPathNumbers);
                  settingData.setSelectedSettingPath(null);
                  settingData.setEditingSettingPath(null);
                }}
                type="button"
              >
                删除菜单
              </button>
            </div>
          </div>
          <div className="legacy-data-table-wrap setting-data-table-wrap">
            {settingData.hasBooleanMonitorParameters ? (
              <div className="setting-help-card">
                此菜单包含只读开关监测项。0/1
                表示设备上报的开关状态；本页可编辑名称、索引、位段、预处理等配置定义，不能直接写入当前状态。
              </div>
            ) : null}
            {settingData.activeSettingNode && settingData.settingParameters.length > 0 ? (
              <>
                <div className="setting-table-toolbar">
                  <div className="setting-table-view-controls">
                    <label className="setting-column-preset">
                      <span>列视图</span>
                      <select
                        value={columnPreset}
                        onChange={(event) =>
                          handleColumnPresetChange(event.target.value as SettingColumnPreset)
                        }
                      >
                        {settingColumnPresetOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {renderCommunicationIndexRadixControl()}
                    <button onClick={settingData.resetSettingColumnWidths} type="button">
                      重置列宽
                    </button>
                    <span className="setting-visible-column-count">
                      {visibleSettingParameterColumns.length} / {settingParameterColumns.length} 列
                    </span>
                  </div>
                  <div className="setting-table-bulk-actions">
                    {selectedParameterRows.length > 0 ? (
                      <>
                        <span>
                          已选择 <strong>{selectedParameterRows.length}</strong> 条
                        </span>
                        <button onClick={clearParameterSelection} type="button">
                          清除选择
                        </button>
                        <button
                          className="danger"
                          onClick={() => setPendingDeleteRows(selectedParameterRows)}
                          type="button"
                        >
                          删除已选
                        </button>
                      </>
                    ) : (
                      <span>共 {settingData.settingParameters.length} 条</span>
                    )}
                  </div>
                </div>
                <table className="legacy-data-table" style={{ minWidth: visibleTableMinWidth }}>
                  <colgroup>
                    {visibleSettingParameterColumns.map((column) => (
                      <col
                        key={column.key}
                        style={{ width: settingData.settingColumnWidth(column) }}
                      />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {visibleSettingParameterColumns.map((column) => {
                        if (column.key === 'select') {
                          return (
                            <th
                              className={`${settingColumnClassName(column)} setting-select-column`}
                              key={column.key}
                              style={settingColumnStyle(column)}
                            >
                              <input
                                aria-label="选择当前显示的全部参数"
                                checked={allVisibleParametersSelected}
                                onChange={(event) =>
                                  toggleAllVisibleParameters(event.target.checked)
                                }
                                ref={(element) => {
                                  if (element) {
                                    element.indeterminate =
                                      someVisibleParametersSelected &&
                                      !allVisibleParametersSelected;
                                  }
                                }}
                                type="checkbox"
                              />
                            </th>
                          );
                        }
                        return (
                          <th
                            key={column.key}
                            className={settingColumnClassName(column)}
                            style={settingColumnStyle(column)}
                          >
                            <span className="legacy-data-th-content">{column.label}</span>
                            <button
                              aria-label={`调整${column.label}列宽`}
                              className="legacy-data-column-resizer"
                              onMouseDown={(event) =>
                                settingData.handleSettingColumnResizeStart(event, column)
                              }
                              type="button"
                            />
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {settingData.settingParameters.map((row) => {
                      const rowKey = row.path.join('/');
                      return (
                        <tr
                          className={
                            selectedParameterPaths.has(rowKey)
                              ? 'setting-parameter-row--selected'
                              : undefined
                          }
                          key={rowKey}
                        >
                          {visibleSettingParameterColumns.map((column) => (
                            <td
                              key={column.key}
                              className={settingColumnClassName(column)}
                              style={settingColumnStyle(column)}
                            >
                              {renderSettingParameterCell(row, column)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : settingData.activeSettingNode ? (
              <div className="legacy-data-empty">
                {settingData.settingSearchQuery
                  ? '没有找到匹配的参数。可尝试搜索“开关”“座椅”“前进”“P/S”。'
                  : '当前菜单下没有参数。请展开左侧其它菜单，或使用搜索查找具体参数。'}
              </div>
            ) : (
              <div className="legacy-data-empty">
                请先在项目管理中打开 .jcpro 项目文件，然后进入“设置数据”查看菜单和参数。
              </div>
            )}
          </div>
        </div>
      </section>
      {renderSettingEditorDrawer()}
      {pendingDeleteRows.length > 0 ? (
        <ConfirmDialog
          title={pendingDeleteRows.length === 1 ? '删除参数' : '删除已选参数'}
          message={
            pendingDeleteRows.length === 1
              ? `确定要删除参数「${pendingDeleteRows[0].name}」吗？`
              : `确定要删除已选的 ${pendingDeleteRows.length} 个参数吗？此操作会同时移除其完整配置定义。`
          }
          confirmLabel="删除"
          danger
          onConfirm={confirmDeleteParameters}
          onCancel={() => setPendingDeleteRows([])}
        />
      ) : null}
    </>
  );
}
