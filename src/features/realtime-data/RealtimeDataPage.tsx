import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { JsonPath } from '../../utils/projectDirty';
import { formatFrameId, formatFrameIdPadded, type PdoEditorController } from './usePdoEditor';
import '../legacy-data.css';

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
  const { t } = useTranslation();
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
  const stableKeys = useStableCollectionKeys();
  const globalParamKeys = stableKeys(
    'pdo-global-params',
    currentPdoAdvancedDocument?.pdo_global_param ?? [],
  );
  const conditionKeys = stableKeys(
    'pdo-conditions',
    currentPdoAdvancedDocument?.pdo_condition ?? [],
  );
  const simpleFrameKeys = stableKeys(
    `pdo-simple-frames-${selectedRealtimeKind}`,
    realtimeFrames(selectedRealtimeKind),
  );
  const simpleSignalKeys = stableKeys(
    `pdo-simple-signals-${selectedRealtimeKind}-${selectedRealtimeFrameId ?? 'none'}`,
    activeRealtimeFrame?.data ?? [],
  );
  const advancedFrameKeys = stableKeys(
    `pdo-advanced-frames-${selectedRealtimeKind}`,
    advancedFrames(selectedRealtimeKind),
  );
  const advancedSignalKeys = stableKeys(
    `pdo-advanced-signals-${selectedRealtimeKind}-${selectedAdvancedFrameId ?? 'none'}`,
    activeAdvancedFrame?.data ?? [],
  );

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
          <strong>{t('realtimeData.globalParameters')}</strong>
          <button onClick={addPdoGlobalParam} type="button">
            {t('realtimeData.add')}
          </button>
        </div>
        <div className="legacy-drawer-table-frame">
          <table className="legacy-data-table legacy-data-table--compact">
            <thead>
              <tr>
                <th />
                <th>{t('realtimeData.parameterId')}</th>
                <th>{t('protocol.common.name')}</th>
                <th>{t('protocol.signalDictionary.defaultValue')}</th>
                <th>{t('realtimeData.reserved')}</th>
                <th>{t('protocol.common.type')}</th>
                <th>{t('realtimeData.internalVariable')}</th>
                <th>{t('protocol.common.actions')}</th>
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
                  key={globalParamKeys[index]}
                >
                  <td>{index + 1}</td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('realtimeData.parameterId'),
                      })}
                      value={item.param_id}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'param_id', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('protocol.common.name'),
                      })}
                      value={item.name}
                      onChange={(event) => updatePdoGlobalParam(index, 'name', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('protocol.signalDictionary.defaultValue'),
                      })}
                      value={item.def}
                      onChange={(event) => updatePdoGlobalParam(index, 'def', event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('realtimeData.reservedValue'),
                      })}
                      type="number"
                      value={item.reserved}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'reserved', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('protocol.common.type'),
                      })}
                      type="number"
                      value={item.type}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'type', Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('realtimeData.internalVariable'),
                      })}
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
                      {t('protocol.common.delete')}
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
          <strong>{t('realtimeData.conditions')}</strong>
          <button onClick={addPdoCondition} type="button">
            {t('realtimeData.add')}
          </button>
        </div>
        {(currentPdoAdvancedDocument?.pdo_condition ?? []).map((condition, conditionIndex) => {
          const conditionKey = conditionKeys[conditionIndex];
          const inputKeys = stableKeys(`pdo-condition-inputs-${conditionKey}`, condition.data);
          return (
            <div className="legacy-condition-row" key={conditionKey}>
              <label>
                {t('realtimeData.parameterId')}
                <input
                  value={condition.param_id}
                  onChange={(event) =>
                    updatePdoCondition(conditionIndex, 'param_id', event.target.value)
                  }
                />
              </label>
              <label>
                {t('realtimeData.processingMethod')}
                <input
                  type="number"
                  value={condition.process}
                  onChange={(event) =>
                    updatePdoCondition(conditionIndex, 'process', Number(event.target.value))
                  }
                />
              </label>
              <button onClick={() => addPdoConditionInput(conditionIndex)} type="button">
                {t('realtimeData.addInput')}
              </button>
              <button
                className="danger"
                onClick={() => removePdoCondition(conditionIndex)}
                type="button"
              >
                {t('realtimeData.deleteCondition')}
              </button>
              {condition.data.map((input, inputIndex) => (
                <label key={inputKeys[inputIndex]}>
                  {t('realtimeData.inputParameter')}
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
                    {t('protocol.common.delete')}
                  </button>
                </label>
              ))}
            </div>
          );
        })}
      </section>
    );
  }

  function renderAdvancedPdoDrawer() {
    if (!advancedPdoDrawerOpen) return null;

    return (
      <div className="legacy-drawer-layer" role="presentation">
        <button
          className="legacy-drawer-backdrop"
          aria-label={t('realtimeData.drawer.close')}
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
              <strong id={advancedPdoDrawerTitleId}>{t('realtimeData.drawer.title')}</strong>
              <p>{t('realtimeData.drawer.description')}</p>
            </div>
            <button
              ref={advancedPdoDrawerCloseRef}
              aria-label={t('realtimeData.drawer.closeParameters')}
              onClick={closeAdvancedPdoDrawer}
              type="button"
            >
              ×
            </button>
          </div>
          <div
            className="legacy-drawer-tabs"
            role="tablist"
            aria-label={t('realtimeData.drawer.categories')}
          >
            <button
              aria-selected={advancedPdoDrawerTab === 'global'}
              className={advancedPdoDrawerTab === 'global' ? 'active' : ''}
              onClick={() => setAdvancedPdoDrawerTab('global')}
              role="tab"
              type="button"
            >
              {t('realtimeData.globalParameters')}
            </button>
            <button
              aria-selected={advancedPdoDrawerTab === 'condition'}
              className={advancedPdoDrawerTab === 'condition' ? 'active' : ''}
              onClick={() => setAdvancedPdoDrawerTab('condition')}
              role="tab"
              type="button"
            >
              {t('realtimeData.conditions')}
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
          <div className="legacy-data-sidebar-title">{t('settingData.menu')}</div>
          <button
            className="legacy-sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            type="button"
            title={t(
              sidebarCollapsed ? 'settingData.expandSidebar' : 'settingData.collapseSidebar',
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={15} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={15} strokeWidth={1.8} />
            )}
          </button>
        </div>
        <div className="legacy-menu-list">
          {(['pdo_recv', 'pdo_send'] as const).map((kind) => (
            <div key={kind}>
              <button
                className={
                  selectedRealtimeKind === kind ? 'legacy-menu-item active' : 'legacy-menu-item'
                }
                onClick={() => {
                  setSelectedRealtimeKind(kind);
                  setSelectedRealtimeFrameId(null);
                  setSelectedAdvancedFrameId(null);
                }}
                type="button"
              >
                <ChevronDown
                  aria-hidden="true"
                  className="legacy-menu-arrow"
                  size={14}
                  strokeWidth={1.8}
                />
                <span>{t(kind === 'pdo_recv' ? 'realtimeData.receiveTable' : 'realtimeData.sendTable')}</span>
              </button>
              {selectedRealtimeKind === kind
                ? (realtimeMode === 'simple' ? realtimeFrames(kind) : advancedFrames(kind)).map(
                    (frame) => {
                      const isActive =
                        realtimeMode === 'simple'
                          ? selectedRealtimeFrameId === frame.id
                          : selectedAdvancedFrameId === frame.id;
                      return (
                        <button
                          className={
                            isActive ? 'legacy-menu-item child active' : 'legacy-menu-item child'
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
                    },
                  )
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
                {t('realtimeData.globalParameters')}
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
                {t('realtimeData.conditions')}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="legacy-data-content">
        <div className="legacy-data-header">
          <div className="legacy-data-header-left">
            <strong>
              {t('realtimeData.heading', {
                table: t(
                  selectedRealtimeKind === 'pdo_recv'
                    ? 'realtimeData.menuReceive'
                    : 'realtimeData.menuSend',
                ),
                mode: t(
                  realtimeMode === 'simple'
                    ? 'realtimeData.simpleConfiguration'
                    : 'realtimeData.advancedConfiguration',
                ),
              })}
            </strong>
            <div className="legacy-mode-tabs-inline">
              <button
                className={realtimeMode === 'simple' ? 'active' : ''}
                onClick={() => setRealtimeMode('simple')}
                type="button"
              >
                {t('realtimeData.simpleConfiguration')}
              </button>
              <button
                className={realtimeMode === 'advanced' ? 'active' : ''}
                onClick={() => setRealtimeMode('advanced')}
                type="button"
              >
                {t('realtimeData.advancedConfiguration')}
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
              {t('realtimeData.addFrameId')}
            </button>
            <button
              disabled={realtimeMode === 'simple' ? !activeRealtimeFrame : !activeAdvancedFrame}
              onClick={() => {
                if (realtimeMode === 'simple' && activeRealtimeFrameIndex >= 0)
                  addPdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex);
                if (realtimeMode === 'advanced' && activeAdvancedFrameIndex >= 0)
                  addPdoAdvancedSignal(selectedRealtimeKind, activeAdvancedFrameIndex);
              }}
              type="button"
            >
              {t('realtimeData.addProtocol')}
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
                  {t('realtimeData.addGlobalParameter')}
                </button>
                <button
                  onClick={() => {
                    addPdoCondition();
                    openAdvancedPdoDrawer('condition');
                  }}
                  type="button"
                >
                  {t('realtimeData.addCondition')}
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="legacy-data-table-wrap">
          {!currentPdoSimpleDocument && !currentPdoAdvancedDocument ? (
            <div className="legacy-data-empty">{t('language.page.openProjectFirst')}</div>
          ) : realtimeMode === 'simple' ? (
            selectedRealtimeFrameId === null ? (
              <table className="legacy-data-table">
                <thead>
                  <tr>
                    <th />
                    <th>{t('realtimeData.frameId')}</th>
                    <th>{t('protocol.private.frameType')}</th>
                    <th>{t('realtimeData.frameDescription')}</th>
                    <th>{t('realtimeData.dataItems')}</th>
                    <th>{t('protocol.common.actions')}</th>
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
                        className={isModifiedPath(framePath) ? 'config-entry-modified' : undefined}
                        key={simpleFrameKeys[index]}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <input
                            aria-label={t('realtimeData.frameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: 'ID',
                            })}
                            inputMode="text"
                            value={formatFrameId(frame.id)}
                            onChange={(event) =>
                              updatePdoFrameId(selectedRealtimeKind, index, event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={t('realtimeData.frameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: t('protocol.common.type'),
                            })}
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
                            <option value={0}>{t('protocol.private.standardFrame')}</option>
                            <option value={1}>{t('protocol.private.extendedFrame')}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={t('realtimeData.frameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: t('protocol.mapping.frameDescription'),
                            })}
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
                            {t('protocol.mapping.protocol')}
                          </button>
                          {isModifiedPath(framePath) ? (
                            <button onClick={() => restoreModifiedPath(framePath)} type="button">
                              {t('common.actions.restore')}
                            </button>
                          ) : null}
                          <button
                            className="danger"
                            onClick={() => removePdoFrame(selectedRealtimeKind, index)}
                            type="button"
                          >
                            {t('protocol.common.delete')}
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
                    <th>{t('realtimeData.parameterName')}</th>
                    <th>{t('realtimeData.readMethod')}</th>
                    <th>{t('settingData.columns.bitStart')}</th>
                    <th>{t('settingData.columns.bitLength')}</th>
                    <th>{t('realtimeData.parameterIndex')}</th>
                    <th>{t('protocol.common.actions')}</th>
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
                        key={simpleSignalKeys[index]}
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
                            aria-label={t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.parameterName'),
                            })}
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
                            aria-label={t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.readMethod'),
                            })}
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
                            <option value={0}>{t('realtimeData.readMethods.bytes')}</option>
                            <option value={1}>{t('realtimeData.readMethods.bytesBits')}</option>
                            <option value={2}>{t('realtimeData.readMethods.bits')}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('settingData.columns.bitStart'),
                            })}
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
                            aria-label={t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('settingData.columns.bitLength'),
                            })}
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
                            aria-label={t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.parameterIndex'),
                            })}
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
                            <button onClick={() => restoreModifiedPath(signalPath)} type="button">
                              {t('common.actions.restore')}
                            </button>
                          ) : null}
                          <button
                            className="danger"
                            onClick={() =>
                              removePdoSignal(selectedRealtimeKind, activeRealtimeFrameIndex, index)
                            }
                            type="button"
                          >
                            {t('protocol.common.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="legacy-data-empty">{t('realtimeData.selectOrAddFrame')}</div>
            )
          ) : (
            <div className="legacy-advanced-main">
              <div className="legacy-advanced-toolbar">
                <div className="legacy-advanced-summary">
                  <strong>{t('realtimeData.advancedConfiguration')}</strong>
                  <span>
                    {t('realtimeData.globalCount', {
                      count: currentPdoAdvancedDocument?.pdo_global_param.length ?? 0,
                    })}
                  </span>
                  <span>
                    {t('realtimeData.conditionCount', {
                      count: currentPdoAdvancedDocument?.pdo_condition.length ?? 0,
                    })}
                  </span>
                  <span>
                    {selectedAdvancedFrameId === null
                      ? t('realtimeData.currentFrameList')
                      : t('realtimeData.currentProtocol', {
                          id: formatFrameIdPadded(selectedAdvancedFrameId),
                        })}
                  </span>
                </div>
                <div className="legacy-advanced-actions">
                  <button onClick={() => openAdvancedPdoDrawer('global')} type="button">
                    {t('realtimeData.manageGlobals')}
                  </button>
                  <button onClick={() => openAdvancedPdoDrawer('condition')} type="button">
                    {t('realtimeData.manageConditions')}
                  </button>
                </div>
              </div>
              {selectedAdvancedFrameId === null ? (
                <table className="legacy-data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>{t('realtimeData.frameId')}</th>
                      <th>{t('protocol.private.frameType')}</th>
                      <th>{t('realtimeData.frameDescription')}</th>
                      <th>{t('realtimeData.dataItems')}</th>
                      <th>{t('protocol.common.actions')}</th>
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
                        key={advancedFrameKeys[index]}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <input
                            aria-label={t('realtimeData.advancedFrameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: 'ID',
                            })}
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
                            aria-label={t('realtimeData.advancedFrameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: t('protocol.common.type'),
                            })}
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
                            aria-label={t('realtimeData.advancedFrameFieldAria', {
                              direction: t(
                                selectedRealtimeKind === 'pdo_recv'
                                  ? 'protocol.mapping.receive'
                                  : 'protocol.mapping.send',
                              ),
                              index: index + 1,
                              field: t('protocol.mapping.frameDescription'),
                            })}
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
                            {t('protocol.mapping.protocol')}
                          </button>
                          <button
                            className="danger"
                            onClick={() => removePdoAdvancedFrame(selectedRealtimeKind, index)}
                            type="button"
                          >
                            {t('protocol.common.delete')}
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
                      <th>{t('realtimeData.parameterId')}</th>
                      <th>{t('realtimeData.position')}</th>
                      <th>{t('realtimeData.length')}</th>
                      <th>{t('realtimeData.displayType')}</th>
                      <th>{t('realtimeData.handler')}</th>
                      <th>{t('realtimeData.handlerParameter')}</th>
                      <th>{t('protocol.common.actions')}</th>
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
                        key={advancedSignalKeys[index]}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <input
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.parameterId'),
                            })}
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
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('settingData.columns.bitStart'),
                            })}
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
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('settingData.columns.bitLength'),
                            })}
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
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.displayType'),
                            })}
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
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.handler'),
                            })}
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
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.handlerParameter'),
                            })}
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
                            {t('protocol.common.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="legacy-data-empty">{t('realtimeData.selectOrAddAdvancedFrame')}</div>
              )}
              {renderAdvancedPdoDrawer()}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
