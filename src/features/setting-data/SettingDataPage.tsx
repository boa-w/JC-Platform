import { useState } from 'react';
import { ConfirmDialog } from '../../components/language/ConfirmDialog';
import { settingParameterColumns } from './config';
import type {
  SettingDataPageProps,
  SettingEditorField,
  SettingParameterColumn,
  SettingParameterRow,
} from './types';
import { useSettingData } from './useSettingData';
import {
  formatSettingPath,
  isSameOrDescendantPath,
  optionsWithCurrentValue,
  sdoNodeDocumentPath,
} from './utils';

export function SettingDataPage({
  loadedProject,
  isActive,
  sidebarCollapsed,
  setSidebarCollapsed,
  updateProjectDocument,
  isModifiedPath,
  restoreModifiedPath,
}: SettingDataPageProps) {
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
  const visibleParameterPathKeys = settingData.settingParameters.map((row) => row.path.join('/'));
  const selectedParameterRows = settingData.settingParameters.filter((row) =>
    selectedParameterPaths.has(row.path.join('/')),
  );
  const allVisibleParametersSelected =
    visibleParameterPathKeys.length > 0 &&
    visibleParameterPathKeys.every((key) => selectedParameterPaths.has(key));
  const someVisibleParametersSelected = visibleParameterPathKeys.some((key) =>
    selectedParameterPaths.has(key),
  );

  function clearParameterSelection() {
    setSelectedParameterPaths(new Set());
    setPendingDeleteRows([]);
  }

  function toggleParameterSelection(path: number[], selected: boolean) {
    const key = path.join('/');
    setSelectedParameterPaths((current) => {
      const next = new Set(current);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAllVisibleParameters(selected: boolean) {
    setSelectedParameterPaths(selected ? new Set(visibleParameterPathKeys) : new Set());
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
    setSelectedParameterPaths(new Set());
    setPendingDeleteRows([]);
  }

  function renderSettingParameterCell(row: SettingParameterRow, column: SettingParameterColumn) {
    if (column.key === 'select') {
      const key = row.path.join('/');
      return (
        <input
          aria-label={`选择参数 ${row.name}`}
          checked={selectedParameterPaths.has(key)}
          onChange={(event) => toggleParameterSelection(row.path, event.target.checked)}
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
          <button
            className="danger"
            onClick={() => setPendingDeleteRows([row])}
            type="button"
          >
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
    if (field.kind === 'select') {
      const options = optionsWithCurrentValue(field.options ?? [], value);
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
            onChange={(event) => settingData.updateSettingEditorField(path, field, Number(event.target.value))}
          />
        </label>
      );
    }
    return (
      <label key={field.field}>
        {field.label}
        <input
          value={String(value)}
          onChange={(event) => settingData.updateSettingEditorField(path, field, event.target.value)}
        />
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="setting-editor-drawer-title"
          aria-describedby="setting-editor-drawer-desc"
        >
          <div className="legacy-drawer-header">
            <div>
              <strong id="setting-editor-drawer-title">
                {isMenu ? '菜单编辑' : '参数编辑'}：{settingData.editingSettingNode.name || '未命名'}
              </strong>
              <p id="setting-editor-drawer-desc">编辑设置数据定义，不写入设备当前运行状态。</p>
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
                {settingData.visibleSettingEditorSections(settingData.editingSettingNode).map((section) => (
                  <section className="legacy-edit-section" key={section.title}>
                    <div className="legacy-edit-section-title">{section.title}</div>
                    <div className="legacy-edit-grid legacy-edit-grid--sectioned">
                      {section.fields.map((field) => renderSettingEditorField(field, settingData.editingSettingPath!))}
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
      <section className={sidebarCollapsed ? 'legacy-data-page legacy-data-page--collapsed' : 'legacy-data-page'}>
        <div className="legacy-data-sidebar">
          <div className="legacy-data-sidebar-header">
            <div className="legacy-data-sidebar-title">菜单</div>
            <button
              className="legacy-sidebar-collapse-btn"
              onClick={() => setSidebarCollapsed((v) => !v)}
              type="button"
              title={sidebarCollapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {sidebarCollapsed ? '▸' : '◂'}
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
                  menu.key === settingData.activeSettingPath ? 'legacy-menu-item active' : 'legacy-menu-item',
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
                <span className="legacy-menu-arrow">{menu.hasMenuChildren ? '▸' : ''}</span>
                <span className="setting-menu-label">
                  <span className="setting-menu-main">{menu.name}</span>
                  <span className={menu.parameterCount > 0 ? 'setting-menu-count' : 'setting-menu-count setting-menu-count--empty'}>
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
                {settingData.activeSettingPathNames.map((name, index) => (
                  <span className="setting-breadcrumb-segment" key={`${name}-${index}`}>
                    {name}
                  </span>
                ))}
              </div>
              <div className="setting-menu-summary">
                <strong>{settingData.activeSettingNode?.name ?? '菜单'}</strong>
                <span className="setting-summary-chip">{settingData.settingParameters.length} 个参数</span>
                <span className="setting-summary-chip">{settingData.readonlySettingParameterCount} 个只读</span>
                <span className="setting-summary-chip">{settingData.booleanMonitorParameterCount} 个 0/1 监测项</span>
              </div>
            </div>
            <div className="legacy-data-actions">
              <button
                disabled={!settingData.currentSdoDocument}
                onClick={() => settingData.addSdoMenu(settingData.activeSettingNode ? settingData.activeSettingPathNumbers : [])}
                type="button"
              >
                新增菜单
              </button>
              <button
                disabled={!settingData.activeSettingNode}
                onClick={() => settingData.openSettingEditorDrawer(settingData.activeSettingPathNumbers)}
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
              <button onClick={settingData.resetSettingColumnWidths} type="button">
                重置列宽
              </button>
              {selectedParameterRows.length > 0 ? (
                <button
                  className="danger"
                  onClick={() => setPendingDeleteRows(selectedParameterRows)}
                  type="button"
                >
                  删除已选 ({selectedParameterRows.length})
                </button>
              ) : null}
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
          <div className="legacy-data-table-wrap">
            {settingData.hasBooleanMonitorParameters ? (
              <div className="setting-help-card">
                此菜单包含只读开关监测项。0/1
                表示设备上报的开关状态；本页可编辑名称、索引、位段、预处理等配置定义，不能直接写入当前状态。
              </div>
            ) : null}
            {settingData.activeSettingNode && settingData.settingParameters.length > 0 ? (
              <table className="legacy-data-table" style={{ minWidth: settingData.settingTableMinWidth() }}>
                <colgroup>
                  {settingParameterColumns.map((column) => (
                    <col key={column.key} style={{ width: settingData.settingColumnWidth(column) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {settingParameterColumns.map((column) => {
                      if (column.key === 'select') {
                        return (
                          <th className="text-center setting-select-column" key={column.key}>
                            <input
                              aria-label="选择当前显示的全部参数"
                              checked={allVisibleParametersSelected}
                              onChange={(event) =>
                                toggleAllVisibleParameters(event.target.checked)
                              }
                              ref={(element) => {
                                if (element) {
                                  element.indeterminate =
                                    someVisibleParametersSelected && !allVisibleParametersSelected;
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
                          className={column.align ? `text-${column.align}` : undefined}
                        >
                          <span className="legacy-data-th-content">{column.label}</span>
                          <span
                            className="legacy-data-column-resizer"
                            onMouseDown={(event) =>
                              settingData.handleSettingColumnResizeStart(event, column)
                            }
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
                        {settingParameterColumns.map((column) => (
                          <td
                            key={column.key}
                            className={column.align ? `text-${column.align}` : undefined}
                          >
                            {renderSettingParameterCell(row, column)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
