import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { JsonPath } from '../../utils/projectDirty';
import {
  isKnownPdoInnerVariableId,
  PDO_INNER_VARIABLES,
  PDO_INNER_VARIABLE_UNBOUND_ID,
} from './pdoInnerVariableAbi';
import { pdoSignalLayout } from './pdoLayout';
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
    supportsSimpleMode,
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
    updateAdvancedDocument: updatePdoAdvancedDocument,
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

  function getPdoAdvancedSignalName(signal: { param_id: string }) {
    return (
      currentPdoAdvancedDocument?.pdo_global_param.find(
        (param) => param.param_id === signal.param_id,
      )?.name ?? signal.param_id
    );
  }

  /**
   * 普通编辑只需要维护协议名称；这里把名称映射回高级 PDO 的全局变量引用。
   */
  function updatePdoAdvancedSignalName(
    kind: 'pdo_recv' | 'pdo_send',
    frameIndex: number,
    signalIndex: number,
    value: string,
  ) {
    if (!currentPdoAdvancedDocument) return;
    const frame = currentPdoAdvancedDocument[kind][frameIndex];
    const signal = frame?.data[signalIndex];
    if (!signal) return;

    const currentParamIndex = currentPdoAdvancedDocument.pdo_global_param.findIndex(
      (param) => param.param_id === signal.param_id,
    );
    const matchingParamIndex = currentPdoAdvancedDocument.pdo_global_param.findIndex(
      (param) => param.name === value && param.param_id !== signal.param_id,
    );

    if (value && matchingParamIndex >= 0) {
      updatePdoAdvancedDocument({
        ...currentPdoAdvancedDocument,
        [kind]: updateAdvancedFrameSignals(
          currentPdoAdvancedDocument[kind],
          frameIndex,
          signalIndex,
          currentPdoAdvancedDocument.pdo_global_param[matchingParamIndex].param_id,
        ),
      });
      return;
    }

    if (currentParamIndex >= 0) {
      updatePdoAdvancedDocument({
        ...currentPdoAdvancedDocument,
        pdo_global_param: currentPdoAdvancedDocument.pdo_global_param.map((param, index) =>
          index === currentParamIndex ? { ...param, name: value } : param,
        ),
      });
      return;
    }

    if (!value) return;
    const paramId = nextPdoParamId(currentPdoAdvancedDocument.pdo_global_param);
    updatePdoAdvancedDocument({
      ...currentPdoAdvancedDocument,
      pdo_global_param: [
        ...currentPdoAdvancedDocument.pdo_global_param,
        { param_id: paramId, name: value, def: '0', reserved: 0, type: 0, inner: -1 },
      ],
      [kind]: updateAdvancedFrameSignals(
        currentPdoAdvancedDocument[kind],
        frameIndex,
        signalIndex,
        paramId,
      ),
    });
  }

  function renderPdoPositionEditor(
    signal: { show_type: number; pos: number; len: number },
    ariaLabel: string,
    onChange: (position: number) => void,
  ) {
    const layout = pdoSignalLayout(signal);
    return (
      <fieldset className="pdo-signal-position-editor" aria-label={ariaLabel}>
        <label>
          <span>{layout.positionUnit}</span>
          <input
            aria-label={`${ariaLabel} ${layout.positionUnit}`}
            min={0}
            type="number"
            value={layout.position}
            onChange={(event) => {
              const value = Number(event.target.value);
              const nextPosition =
                layout.mode === 0
                  ? value * 8
                  : layout.mode === 1
                    ? value * 8 + (layout.bit ?? 0)
                    : value;
              onChange(nextPosition);
            }}
          />
        </label>
        {layout.mode === 1 ? (
          <label>
            <span>bit</span>
            <input
              aria-label={`${ariaLabel} bit`}
              max={7}
              min={0}
              type="number"
              value={layout.bit ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange(layout.position * 8 + value);
              }}
            />
          </label>
        ) : null}
      </fieldset>
    );
  }

  function renderPdoLengthEditor(
    signal: { show_type: number; pos: number; len: number },
    ariaLabel: string,
    onChange: (lengthInBits: number) => void,
  ) {
    const layout = pdoSignalLayout(signal);
    return (
      <fieldset className="pdo-signal-length-editor" aria-label={ariaLabel}>
        <input
          aria-label={`${ariaLabel} ${layout.lengthUnit}`}
          min={1}
          type="number"
          value={layout.length}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange(layout.lengthUnit === 'bytes' ? value * 8 : value);
          }}
        />
        <span>{layout.lengthUnit}</span>
      </fieldset>
    );
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
                <th>{t('realtimeData.internalVariableBinding')}</th>
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
                    <select
                      aria-label={t('realtimeData.globalFieldAria', {
                        index: index + 1,
                        field: t('realtimeData.internalVariableBinding'),
                      })}
                      title={t('realtimeData.internalVariableDescription')}
                      value={Number.isInteger(item.inner) ? item.inner : PDO_INNER_VARIABLE_UNBOUND_ID}
                      onChange={(event) =>
                        updatePdoGlobalParam(index, 'inner', Number(event.target.value))
                      }
                    >
                      <option value={PDO_INNER_VARIABLE_UNBOUND_ID}>
                        {t('realtimeData.internalVariableUnbound')}
                      </option>
                      {Number.isInteger(item.inner) &&
                      item.inner !== PDO_INNER_VARIABLE_UNBOUND_ID &&
                      !isKnownPdoInnerVariableId(item.inner) ? (
                        <option value={item.inner}>
                          {t('realtimeData.internalVariableUnknown', { id: item.inner })}
                        </option>
                      ) : null}
                      {PDO_INNER_VARIABLES.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.id} · {entry.code} · {entry.label}
                        </option>
                      ))}
                    </select>
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
        <p className="pdo-inner-variable-note">
          {t('realtimeData.internalVariableDescription')}
        </p>
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
                <span>
                  {t(kind === 'pdo_recv' ? 'realtimeData.receiveTable' : 'realtimeData.sendTable')}
                </span>
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
            {supportsSimpleMode ? (
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
            ) : (
              <span className="config-mode-note">{t('realtimeData.advancedOnlyNotice')}</span>
            )}
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
          ) : realtimeMode === 'simple' && supportsSimpleMode ? (
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
              <table className="legacy-data-table legacy-data-table--pdo-signals">
                <thead>
                  <tr>
                    <th />
                    <th>{t('realtimeData.protocolName')}</th>
                    <th>{t('realtimeData.readMethod')}</th>
                    <th>{t('realtimeData.startPosition')}</th>
                    <th>{t('realtimeData.dataLength')}</th>
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
                              field: t('realtimeData.protocolName'),
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
                            value={pdoSignalLayout(signal).mode}
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
                          {renderPdoPositionEditor(
                            signal,
                            t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.startPosition'),
                            }),
                            (position) =>
                              updatePdoSignal(
                                selectedRealtimeKind,
                                activeRealtimeFrameIndex,
                                index,
                                'pos',
                                position,
                              ),
                          )}
                        </td>
                        <td>
                          {renderPdoLengthEditor(
                            signal,
                            t('realtimeData.signalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.dataLength'),
                            }),
                            (lengthInBits) =>
                              updatePdoSignal(
                                selectedRealtimeKind,
                                activeRealtimeFrameIndex,
                                index,
                                'len',
                                lengthInBits,
                              ),
                          )}
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
                <table className="legacy-data-table legacy-data-table--pdo-signals">
                  <thead>
                    <tr>
                      <th />
                      <th>{t('realtimeData.protocolName')}</th>
                      <th>{t('realtimeData.readMethod')}</th>
                      <th>{t('realtimeData.startPosition')}</th>
                      <th>{t('realtimeData.dataLength')}</th>
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
                              field: t('realtimeData.protocolName'),
                            })}
                            value={getPdoAdvancedSignalName(signal)}
                            onChange={(event) =>
                              updatePdoAdvancedSignalName(
                                selectedRealtimeKind,
                                activeAdvancedFrameIndex,
                                index,
                                event.target.value,
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.readMethod'),
                            })}
                            value={pdoSignalLayout(signal).mode}
                            onChange={(event) =>
                              updatePdoAdvancedSignal(
                                selectedRealtimeKind,
                                activeAdvancedFrameIndex,
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
                          {renderPdoPositionEditor(
                            signal,
                            t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.startPosition'),
                            }),
                            (position) =>
                              updatePdoAdvancedSignal(
                                selectedRealtimeKind,
                                activeAdvancedFrameIndex,
                                index,
                                'pos',
                                position,
                              ),
                          )}
                        </td>
                        <td>
                          {renderPdoLengthEditor(
                            signal,
                            t('realtimeData.advancedSignalFieldAria', {
                              index: index + 1,
                              field: t('realtimeData.dataLength'),
                            }),
                            (lengthInBits) =>
                              updatePdoAdvancedSignal(
                                selectedRealtimeKind,
                                activeAdvancedFrameIndex,
                                index,
                                'len',
                                lengthInBits,
                              ),
                          )}
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
                <div className="legacy-data-empty">
                  {t('realtimeData.selectOrAddAdvancedFrame')}
                </div>
              )}
              {renderAdvancedPdoDrawer()}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function updateAdvancedFrameSignals<T extends { data: Array<{ param_id: string }> }>(
  frames: T[],
  frameIndex: number,
  signalIndex: number,
  paramId: string,
) {
  return frames.map((frame, currentFrameIndex) =>
    currentFrameIndex === frameIndex
      ? {
          ...frame,
          data: frame.data.map((signal, currentSignalIndex) =>
            currentSignalIndex === signalIndex ? { ...signal, param_id: paramId } : signal,
          ),
        }
      : frame,
  );
}

function nextPdoParamId(params: Array<{ param_id: string }>) {
  const base = 'PDO_PARAM';
  const usedIds = new Set(params.map((param) => param.param_id));
  let suffix = params.length + 1;
  while (usedIds.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}
