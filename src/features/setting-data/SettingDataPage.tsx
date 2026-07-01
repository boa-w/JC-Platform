import { settingParameterColumns } from './config';
import type { SettingDataPageProps, SettingEditorField, SettingParameterColumn, SettingParameterRow } from './types';
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

  function renderSettingParameterCell(row: SettingParameterRow, column: SettingParameterColumn) {
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
            onClick={() => {
              settingData.removeSdoNode(row.path);
              if (
                settingData.editingSettingPath &&
                isSameOrDescendantPath(row.path, settingData.editingSettingPath)
              ) {
                settingData.setEditingSettingPath(null);
              }
            }}
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
                onChange={(event) => settingData.setSettingSearchQuery(event.target.value)}
                placeholder="搜索菜单或参数，例如：开关、座椅、前进"
                value={settingData.settingSearchQuery}
              />
              {settingData.settingSearchQuery ? (
                <button onClick={() => settingData.setSettingSearchQuery('')} type="button">
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
                onClick={() => settingData.setSelectedSettingPath(menu.key)}
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
                    {settingParameterColumns.map((column) => (
                      <th key={column.key} className={column.align ? `text-${column.align}` : undefined}>
                        <span className="legacy-data-th-content">{column.label}</span>
                        <span
                          className="legacy-data-column-resizer"
                          onMouseDown={(event) => settingData.handleSettingColumnResizeStart(event, column)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settingData.settingParameters.map((row) => (
                    <tr key={row.path.join('/')}>
                      {settingParameterColumns.map((column) => (
                        <td key={column.key} className={column.align ? `text-${column.align}` : undefined}>
                          {renderSettingParameterCell(row, column)}
                        </td>
                      ))}
                    </tr>
                  ))}
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
    </>
  );
}
