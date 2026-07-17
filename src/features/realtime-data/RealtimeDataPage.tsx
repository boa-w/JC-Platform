import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { JsonPath } from '../../utils/projectDirty';
import {
  formatFrameId,
  formatFrameIdPadded,
  type PdoEditorController,
} from './usePdoEditor';

interface RealtimeDataPageProps {
  controller: PdoEditorController;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  isModifiedPath: (path: JsonPath) => boolean;
  restoreModifiedPath: (path: JsonPath) => void;
}

export function RealtimeDataPage({
  controller,
  sidebarCollapsed,
  setSidebarCollapsed,
  isModifiedPath,
  restoreModifiedPath,
}: RealtimeDataPageProps) {
  const {
    simpleDocument: currentPdoSimpleDocument,
    advancedDocument: currentPdoAdvancedDocument,
    selectedKind: selectedRealtimeKind,
    selectedSimpleFrameId: selectedRealtimeFrameId,
    selectedAdvancedFrameId,
    mode: realtimeMode,
    jumpTarget: pdoJumpTarget,
    jumpRowRef: pdoJumpRowRef,
    activeSimpleFrame: activeRealtimeFrame,
    activeSimpleFrameIndex: activeRealtimeFrameIndex,
    activeAdvancedFrame,
    activeAdvancedFrameIndex,
    simpleFrames: realtimeFrames,
    advancedFrames,
    setMode: setRealtimeMode,
    setSelectedKind: setSelectedRealtimeKind,
    setSelectedSimpleFrameId: setSelectedRealtimeFrameId,
    setSelectedAdvancedFrameId,
    updateSimpleFrame: updatePdoFrame,
    updateSimpleFrameId: updatePdoFrameId,
    addSimpleFrame: addPdoFrame,
    removeSimpleFrame: removePdoFrame,
    updateSimpleSignal: updatePdoSignal,
    addSimpleSignal: addPdoSignal,
    removeSimpleSignal: removePdoSignal,
    updateGlobalParam: updatePdoGlobalParam,
    addGlobalParam: addPdoGlobalParam,
    removeGlobalParam: removePdoGlobalParam,
    updateCondition: updatePdoCondition,
    addCondition: addPdoCondition,
    removeCondition: removePdoCondition,
    updateConditionInput: updatePdoConditionInput,
    addConditionInput: addPdoConditionInput,
    removeConditionInput: removePdoConditionInput,
    updateAdvancedFrame: updatePdoAdvancedFrame,
    updateAdvancedFrameId: updatePdoAdvancedFrameId,
    addAdvancedFrame: addPdoAdvancedFrame,
    removeAdvancedFrame: removePdoAdvancedFrame,
    updateAdvancedSignal: updatePdoAdvancedSignal,
    addAdvancedSignal: addPdoAdvancedSignal,
    removeAdvancedSignal: removePdoAdvancedSignal,
  } = controller;
  const [advancedPdoDrawerOpen, setAdvancedPdoDrawerOpen] = useState(false);
  const [advancedPdoDrawerTab, setAdvancedPdoDrawerTab] = useState<'global' | 'condition'>(
    'global',
  );
  const advancedPdoDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const advancedPdoDrawerRef = useRef<HTMLElement | null>(null);
  const advancedPdoDrawerTitleId = useId();

  useDialogFocus({
    active: advancedPdoDrawerOpen,
    containerRef: advancedPdoDrawerRef,
    initialFocusRef: advancedPdoDrawerCloseRef,
    onEscape: () => setAdvancedPdoDrawerOpen(false),
  });

  useEffect(() => {
    if (realtimeMode !== 'advanced') setAdvancedPdoDrawerOpen(false);
  }, [realtimeMode]);

  function openAdvancedPdoDrawer(tab: 'global' | 'condition') {
    setAdvancedPdoDrawerTab(tab);
    setAdvancedPdoDrawerOpen(true);
  }

  function closeAdvancedPdoDrawer() {
    setAdvancedPdoDrawerOpen(false);
  }

  function renderAdvancedGlobalParamsPanel() {
    return (
      <section className="legacy-edit-panel legacy-edit-panel--drawer">
        <div className="legacy-edit-panel-header">
          <strong>全局变量</strong>
          <button onClick={addPdoGlobalParam} type="button">
            新增
          </button>
        </div>
        <div className="legacy-drawer-table-frame">
          <table className="legacy-data-table legacy-data-table--compact">
            <thead>
              <tr>
                <th />
                <th>参数ID</th>
                <th>名称</th>
                <th>默认值</th>
                <th>保留</th>
                <th>类型</th>
                <th>内部变量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {currentPdoAdvancedDocument?.pdo_global_param.map((item, index) => (
                <tr
                  className={
                    isModifiedPath(['pdo_global_param', index])
                      ? 'config-entry-modified'
                      : undefined
                  }
                  key={`global-${index}`}
                >
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={item.param_id}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'param_id', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={item.name}
                      onChange={(event) => updatePdoGlobalParam(index, 'name', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={item.def}
                      onChange={(event) => updatePdoGlobalParam(index, 'def', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.reserved}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'reserved', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.type}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'type', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.inner}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'inner', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="danger"
                      onClick={() => removePdoGlobalParam(index)}
                      type="button"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  function renderAdvancedConditionsPanel() {
    return (
      <section className="legacy-edit-panel legacy-edit-panel--drawer">
        <div className="legacy-edit-panel-header">
          <strong>条件表</strong>
          <button onClick={addPdoCondition} type="button">
            新增
          </button>
        </div>
        {(currentPdoAdvancedDocument?.pdo_condition ?? []).map((condition, conditionIndex) => (
          <div className="legacy-condition-row" key={`condition-${conditionIndex}`}>
            <label>
              参数 ID
              <input
                value={condition.param_id}
                onChange={(event) =>
                  updatePdoCondition(conditionIndex, 'param_id', event.target.value)
                }
              />
            </label>
            <label>
              处理方式
              <input
                type="number"
                value={condition.process}
                onChange={(event) =>
                  updatePdoCondition(conditionIndex, 'process', Number(event.target.value))
                }
              />
            </label>
            <button onClick={() => addPdoConditionInput(conditionIndex)} type="button">
              新增输入
            </button>
            <button
              className="danger"
              onClick={() => removePdoCondition(conditionIndex)}
              type="button"
            >
              删除条件
            </button>
            {condition.data.map((input, inputIndex) => (
              <label key={`condition-input-${conditionIndex}-${inputIndex}`}>
                输入参数
                <input
                  value={input.param_id}
                  onChange={(event) =>
                    updatePdoConditionInput(conditionIndex, inputIndex, event.target.value)
                  }
                />
                <button
                  className="danger"
                  onClick={() => removePdoConditionInput(conditionIndex, inputIndex)}
                  type="button"
                >
                  删除
                </button>
              </label>
            ))}
          </div>
        ))}
      </section>
    );
  }

  function renderAdvancedPdoDrawer() {
    if (!advancedPdoDrawerOpen) return null;

    return (
      <div className="legacy-drawer-layer" role="presentation">
        <button
          className="legacy-drawer-backdrop"
          aria-label="关闭高级配置编辑面板"
          onClick={closeAdvancedPdoDrawer}
          type="button"
        />
        <aside
          className="legacy-drawer"
          ref={advancedPdoDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={advancedPdoDrawerTitleId}
        >
          <div className="legacy-drawer-header">
            <div>
              <strong id={advancedPdoDrawerTitleId}>高级 CANopen 参数</strong>
              <p>编辑全局变量和条件表，同时保留主区域的帧/协议上下文。</p>
            </div>
            <button
              ref={advancedPdoDrawerCloseRef}
              aria-label="关闭高级 CANopen 参数面板"
              onClick={closeAdvancedPdoDrawer}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="legacy-drawer-tabs" role="tablist" aria-label="高级 CANopen 参数分类">
            <button
              aria-selected={advancedPdoDrawerTab === 'global'}
              className={advancedPdoDrawerTab === 'global' ? 'active' : ''}
              onClick={() => setAdvancedPdoDrawerTab('global')}
              role="tab"
              type="button"
            >
              全局变量
            </button>
            <button
              aria-selected={advancedPdoDrawerTab === 'condition'}
              className={advancedPdoDrawerTab === 'condition' ? 'active' : ''}
              onClick={() => setAdvancedPdoDrawerTab('condition')}
              role="tab"
              type="button"
            >
              条件表
            </button>
          </div>
          <div className="legacy-drawer-body">
            {advancedPdoDrawerTab === 'global'
              ? renderAdvancedGlobalParamsPanel()
              : renderAdvancedConditionsPanel()}
          </div>
        </aside>
      </div>
    );
  }

  return (
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
                  {sidebarCollapsed ? '▸' : '◂'}
                </button>
              </div>
              <div className="legacy-menu-list">
                {(['pdo_recv', 'pdo_send'] as const).map((kind) => (
                  <div key={kind}>
                    <button
                      className={
                        selectedRealtimeKind === kind
                          ? 'legacy-menu-item active'
                          : 'legacy-menu-item'
                      }
                      onClick={() => {
                        setSelectedRealtimeKind(kind);
                        setSelectedRealtimeFrameId(null);
                        setSelectedAdvancedFrameId(null);
                      }}
                      type="button"
                    >
                      <span className="legacy-menu-arrow">▾</span>
                      <span>{kind === 'pdo_recv' ? '接收表' : '发送表'}</span>
                    </button>
                    {selectedRealtimeKind === kind
                      ? (realtimeMode === 'simple'
                          ? realtimeFrames(kind)
                          : advancedFrames(kind)
                        ).map((frame) => {
                          const isActive =
                            realtimeMode === 'simple'
                              ? selectedRealtimeFrameId === frame.id
                              : selectedAdvancedFrameId === frame.id;
                          return (
                            <button
                              className={
                                isActive
                                  ? 'legacy-menu-item child active'
                                  : 'legacy-menu-item child'
                              }
                              key={`${realtimeMode}-${kind}-${frame.id}`}
                              onClick={() => {
                                setSelectedRealtimeKind(kind);
                                if (realtimeMode === 'simple') setSelectedRealtimeFrameId(frame.id);
                                else setSelectedAdvancedFrameId(frame.id);
                              }}
                              type="button"
                            >
                              {formatFrameIdPadded(frame.id)}
                            </button>
                          );
                        })
                      : null}
                  </div>
                ))}
                {realtimeMode === 'advanced' ? (
                  <>
                    <button
                      className={
                        advancedPdoDrawerOpen && advancedPdoDrawerTab === 'global'
                          ? 'legacy-menu-item child active'
                          : 'legacy-menu-item child'
                      }
                      onClick={() => {
                        setSelectedAdvancedFrameId(null);
                        openAdvancedPdoDrawer('global');
                      }}
                      type="button"
                    >
                      全局变量
                    </button>
                    <button
                      className={
                        advancedPdoDrawerOpen && advancedPdoDrawerTab === 'condition'
                          ? 'legacy-menu-item child active'
                          : 'legacy-menu-item child'
                      }
                      onClick={() => {
                        setSelectedAdvancedFrameId(null);
                        openAdvancedPdoDrawer('condition');
                      }}
                      type="button"
                    >
                      条件表
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="legacy-data-content">
              <div className="legacy-data-header">
                <div className="legacy-data-header-left">
                  <strong>
                    {selectedRealtimeKind === 'pdo_recv' ? '菜单->接收表' : '菜单->发送表'}（
                    {realtimeMode === 'simple' ? '简化配置' : '高级配置'}）
                  </strong>
                  <div className="legacy-mode-tabs-inline">
                    <button
                      className={realtimeMode === 'simple' ? 'active' : ''}
                      onClick={() => setRealtimeMode('simple')}
                      type="button"
                    >
                      简化配置
                    </button>
                    <button
                      className={realtimeMode === 'advanced' ? 'active' : ''}
                      onClick={() => setRealtimeMode('advanced')}
                      type="button"
                    >
                      高级配置
                    </button>
                  </div>
                </div>
                <div className="legacy-data-actions">
                  <button
                    onClick={() =>
                      realtimeMode === 'simple'
                        ? addPdoFrame(selectedRealtimeKind)
                        : addPdoAdvancedFrame(selectedRealtimeKind)
                    }
                    type="button"
                  >
                    新增帧ID
                  </button>
                  <button
                    disabled={
                      realtimeMode === 'simple' ? !activeRealtimeFrame : !activeAdvancedFrame
                    }
                    onClick={() => {
                      if (realtimeMode === 'simple' && activeRealtimeFrameIndex >= 0)
                        addPdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex);
                      if (realtimeMode === 'advanced' && activeAdvancedFrameIndex >= 0)
                        addPdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex);
                    }}
                    type="button"
                  >
                    新增协议
                  </button>
                  {realtimeMode === 'advanced' ? (
                    <>
                      <button
                        onClick={() => {
                          addPdoGlobalParam();
                          openAdvancedPdoDrawer('global');
                        }}
                        type="button"
                      >
                        新增全局变量
                      </button>
                      <button
                        onClick={() => {
                          addPdoCondition();
                          openAdvancedPdoDrawer('condition');
                        }}
                        type="button"
                      >
                        新增条件
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="legacy-data-table-wrap">
                {!currentPdoSimpleDocument && !currentPdoAdvancedDocument ? (
                  <div className="legacy-data-empty">请先在项目管理中打开 .jcpro 项目文件</div>
                ) : realtimeMode === 'simple' ? (
                  selectedRealtimeFrameId === null ? (
                    <table className="legacy-data-table">
                      <thead>
                        <tr>
                          <th />
                          <th>帧ID</th>
                          <th>帧类型</th>
                          <th>帧描述</th>
                          <th>数据项</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {realtimeFrames(selectedRealtimeKind).map((frame, index) => {
                          const framePath: JsonPath = [
                            'pdo_simple_send_recv',
                            selectedRealtimeKind,
                            index,
                          ];
                          return (
                            <tr
                              className={
                                isModifiedPath(framePath) ? 'config-entry-modified' : undefined
                              }
                              key={`${selectedRealtimeKind}-frame-${index}`}
                            >
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  inputMode="text"
                                  value={formatFrameId(frame.id)}
                                  onChange={(event) =>
                                    updatePdoFrameId(
                                      selectedRealtimeKind,
                                      index,
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={frame.type}
                                  onChange={(event) =>
                                    updatePdoFrame(
                                      selectedRealtimeKind,
                                      index,
                                      'type',
                                      Number(event.target.value),
                                    )
                                  }
                                >
                                  <option value={0}>标准帧</option>
                                  <option value={1}>扩展帧</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  value={frame.desc}
                                  onChange={(event) =>
                                    updatePdoFrame(
                                      selectedRealtimeKind,
                                      index,
                                      'desc',
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>{frame.data.length}</td>
                              <td>
                                <button
                                  onClick={() => setSelectedRealtimeFrameId(frame.id)}
                                  type="button"
                                >
                                  协议
                                </button>
                                {isModifiedPath(framePath) ? (
                                  <button
                                    onClick={() => restoreModifiedPath(framePath)}
                                    type="button"
                                  >
                                    恢复
                                  </button>
                                ) : null}
                                <button
                                  className="danger"
                                  onClick={() => removePdoFrame(selectedRealtimeKind, index)}
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : activeRealtimeFrame && activeRealtimeFrameIndex >= 0 ? (
                    <table className="legacy-data-table">
                      <thead>
                        <tr>
                          <th />
                          <th>参数名称</th>
                          <th>读取方式</th>
                          <th>bit开始位置</th>
                          <th>bit长度</th>
                          <th>参数索引</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRealtimeFrame.data.map((signal, index) => {
                          const signalPath: JsonPath = [
                            'pdo_simple_send_recv',
                            selectedRealtimeKind,
                            activeRealtimeFrameIndex,
                            'data',
                            index,
                          ];
                          const isJumpTarget = pdoJumpTarget === signal.pdo_param_index;
                          return (
                            <tr
                              className={
                                [
                                  isJumpTarget ? 'pdo-row-highlight' : '',
                                  isModifiedPath(signalPath) ? 'config-entry-modified' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ') || undefined
                              }
                              key={`${activeRealtimeFrame.id}-${index}`}
                              ref={
                                isJumpTarget
                                  ? (element) => {
                                      pdoJumpRowRef.current = element;
                                    }
                                  : undefined
                              }
                            >
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  value={signal.pdo_param_name || ''}
                                  onChange={(event) =>
                                    updatePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                      'pdo_param_name',
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={signal.show_type}
                                  onChange={(event) =>
                                    updatePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                      'show_type',
                                      Number(event.target.value),
                                    )
                                  }
                                >
                                  <option value={0}>按照字节取数据</option>
                                  <option value={1}>按照字节+bit位取数据</option>
                                  <option value={2}>按照bit位取数据</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.pos}
                                  onChange={(event) =>
                                    updatePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                      'pos',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.len}
                                  onChange={(event) =>
                                    updatePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                      'len',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.pdo_param_index}
                                  onChange={(event) =>
                                    updatePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                      'pdo_param_index',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                {isModifiedPath(signalPath) ? (
                                  <button
                                    onClick={() => restoreModifiedPath(signalPath)}
                                    type="button"
                                  >
                                    恢复
                                  </button>
                                ) : null}
                                <button
                                  className="danger"
                                  onClick={() =>
                                    removePdoSignal(
                                      selectedRealtimeKind,
                                      activeRealtimeFrameIndex,
                                      index,
                                    )
                                  }
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="legacy-data-empty">请选择或新增 PDO 帧</div>
                  )
                ) : (
                  <div className="legacy-advanced-main">
                    <div className="legacy-advanced-toolbar">
                      <div className="legacy-advanced-summary">
                        <strong>高级配置</strong>
                        <span>
                          全局变量 {currentPdoAdvancedDocument?.pdo_global_param.length ?? 0} 项
                        </span>
                        <span>条件 {currentPdoAdvancedDocument?.pdo_condition.length ?? 0} 项</span>
                        <span>
                          {selectedAdvancedFrameId === null
                            ? '当前：帧列表'
                            : `当前：${formatFrameIdPadded(selectedAdvancedFrameId)} 协议`}
                        </span>
                      </div>
                      <div className="legacy-advanced-actions">
                        <button onClick={() => openAdvancedPdoDrawer('global')} type="button">
                          管理全局变量
                        </button>
                        <button onClick={() => openAdvancedPdoDrawer('condition')} type="button">
                          管理条件表
                        </button>
                      </div>
                    </div>
                    {selectedAdvancedFrameId === null ? (
                      <table className="legacy-data-table">
                        <thead>
                          <tr>
                            <th />
                            <th>帧ID</th>
                            <th>帧类型</th>
                            <th>帧描述</th>
                            <th>数据项</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advancedFrames(selectedRealtimeKind).map((frame, index) => (
                            <tr
                              className={
                                isModifiedPath([selectedRealtimeKind, index])
                                  ? 'config-entry-modified'
                                  : undefined
                              }
                              key={`advanced-frame-${selectedRealtimeKind}-${index}`}
                            >
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  inputMode="text"
                                  value={formatFrameId(frame.id)}
                                  onChange={(event) =>
                                    updatePdoAdvancedFrameId(
                                      selectedRealtimeKind,
                                      index,
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={frame.type}
                                  onChange={(event) =>
                                    updatePdoAdvancedFrame(
                                      selectedRealtimeKind,
                                      index,
                                      'type',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  value={frame.desc}
                                  onChange={(event) =>
                                    updatePdoAdvancedFrame(
                                      selectedRealtimeKind,
                                      index,
                                      'desc',
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>{frame.data.length}</td>
                              <td>
                                <button
                                  onClick={() => setSelectedAdvancedFrameId(frame.id)}
                                  type="button"
                                >
                                  协议
                                </button>
                                <button
                                  className="danger"
                                  onClick={() =>
                                    removePdoAdvancedFrame(selectedRealtimeKind, index)
                                  }
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : activeAdvancedFrame && activeAdvancedFrameIndex >= 0 ? (
                      <table className="legacy-data-table">
                        <thead>
                          <tr>
                            <th />
                            <th>参数ID</th>
                            <th>位置</th>
                            <th>长度</th>
                            <th>显示类型</th>
                            <th>句柄</th>
                            <th>句柄参数</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeAdvancedFrame.data.map((signal, index) => (
                            <tr
                              className={
                                isModifiedPath([
                                  selectedRealtimeKind,
                                  activeAdvancedFrameIndex,
                                  'data',
                                  index,
                                ])
                                  ? 'config-entry-modified'
                                  : undefined
                              }
                              key={`advanced-signal-${index}`}
                            >
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  value={signal.param_id}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'param_id',
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.pos}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'pos',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.len}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'len',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.show_type}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'show_type',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={signal.handle}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'handle',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  value={signal.handle_param}
                                  onChange={(event) =>
                                    updatePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                      'handle_param',
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="danger"
                                  onClick={() =>
                                    removePdoAdvancedSignal(
                                      selectedRealtimeKind,
                                      activeAdvancedFrameIndex,
                                      index,
                                    )
                                  }
                                  type="button"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="legacy-data-empty">请选择或新增高级 PDO 帧</div>
                    )}
                    {renderAdvancedPdoDrawer()}
                  </div>
                )}
              </div>
            </div>
          </section>
  );
}
