import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { localizationToLanguageDocument } from '../../components/language/localizationAdapter';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { LanguageDocument, LoadedProject, LocalizationDocument } from '../../types/platform';
import { languageText } from '../fault-code/faultCodeModel';
import type { BatteryMonitorController } from './useBatteryMonitorController';

interface BatteryMonitorPageProps {
  loadedProject: LoadedProject | null;
  controller: BatteryMonitorController;
}

const rawTypeOptions = [
  ['u8', 'batteryMonitor.rawTypes.u8'],
  ['u16_le', 'batteryMonitor.rawTypes.u16Le'],
  ['u32_le', 'batteryMonitor.rawTypes.u32Le'],
  ['datetime_ymdhms', 'batteryMonitor.rawTypes.datetimeYmdhms'],
] as const;

const valueTypeOptions = [
  ['u8', 'batteryMonitor.valueTypes.u8'],
  ['u16', 'batteryMonitor.valueTypes.u16'],
  ['u32', 'batteryMonitor.valueTypes.u32'],
  ['f32', 'batteryMonitor.valueTypes.f32'],
  ['datetime', 'batteryMonitor.valueTypes.datetime'],
] as const;

const batterySignalHeaders = [
  ['signal_key', 'batteryMonitor.signalHeaders.signalKey'],
  ['param_id', 'batteryMonitor.signalHeaders.paramId'],
  ['name', 'batteryMonitor.signalHeaders.name'],
  ['frame', 'batteryMonitor.signalHeaders.frame'],
  ['pos / len', 'batteryMonitor.signalHeaders.posLen'],
  ['raw offset', 'batteryMonitor.signalHeaders.rawOffset'],
  ['raw type', 'batteryMonitor.signalHeaders.rawType'],
  ['value type', 'batteryMonitor.signalHeaders.valueType'],
  ['byte order', 'batteryMonitor.signalHeaders.byteOrder'],
  ['resolution', 'batteryMonitor.signalHeaders.resolution'],
  ['offset', 'batteryMonitor.signalHeaders.offset'],
  ['mask', 'batteryMonitor.signalHeaders.mask'],
  ['shift', 'batteryMonitor.signalHeaders.shift'],
] as const;

const formatterOptions = [
  ['linear', 'batteryMonitor.formatters.linear'],
  ['bool_text', 'batteryMonitor.formatters.boolText'],
  ['hex', 'batteryMonitor.formatters.hex'],
  ['datetime', 'batteryMonitor.formatters.datetime'],
] as const;

function parseMask(value: string) {
  const text = value.trim();
  const parsed = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(0xffffffff, Math.trunc(parsed)))
    : 0xffffffff;
}

function languageDocumentFor(project: LoadedProject | null): LanguageDocument {
  const document = project?.document as Record<string, unknown> | undefined;
  if (document?.config_version === 'jc002' && document.localization) {
    return localizationToLanguageDocument(document.localization as LocalizationDocument);
  }
  return (
    (document?.language_info as LanguageDocument | undefined) ?? {
      list_code_language: ['zh', 'en'],
      list_inner: ['中文', '英文'],
      list_translate: {},
    }
  );
}

export function BatteryMonitorPage({ loadedProject, controller }: BatteryMonitorPageProps) {
  const { t } = useTranslation();
  const {
    currentBatteryMonitorDocument,
    batteryMonitorExportStatus,
    batteryMonitorImportStatus,
    batteryCsvStatus,
    batteryDbcStatus,
    isExportingBatteryMonitor,
    isImportingBatteryMonitor,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    isExportingBatteryDbc,
    isImportingBatteryDbc,
    handleExportBatteryMonitor,
    handleImportBatteryMonitor,
    handleExportBatteryFramesCsv,
    handleImportBatteryFramesCsv,
    handleExportBatterySignalsCsv,
    handleImportBatterySignalsCsv,
    handleExportBatteryItemsCsv,
    handleImportBatteryItemsCsv,
    handleExportBatteryDbc,
    handleImportBatteryDbc,
    updateBatteryMonitorField,
    updateBatteryFrame,
    updateBatteryFrameId,
    addBatteryFrame,
    removeBatteryFrame,
    updateBatterySignal,
    addBatterySignal,
    removeBatterySignal,
    updateBatteryItem,
    updateBatteryItemFormatter,
    updateBatteryItemValidity,
    updateBatteryItemLanguage,
    addBatteryItem,
    removeBatteryItem,
    formatFrameId,
    isModifiedPath,
    restoreModifiedPath,
  } = controller;
  const stableKeys = useStableCollectionKeys();
  const frameKeys = stableKeys('battery-monitor-frames', currentBatteryMonitorDocument.frames);
  const signalKeys = stableKeys('battery-monitor-signals', currentBatteryMonitorDocument.signals);
  const itemKeys = stableKeys('battery-monitor-items', currentBatteryMonitorDocument.items);
  const language = useMemo(() => languageDocumentFor(loadedProject), [loadedProject]);
  const frameOptions = currentBatteryMonitorDocument.frames;
  const signalOptions = currentBatteryMonitorDocument.signals;

  return (
    <section className="table-spec-card">
      <div className="private-protocol-header">
        <div className="private-protocol-header-text">
          <h2>{t('batteryMonitor.title')}</h2>
          <p>{t('batteryMonitor.description')}</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isExportingBatteryMonitor}
            onClick={() => void handleExportBatteryMonitor()}
            type="button"
          >
            {isExportingBatteryMonitor
              ? t('batteryMonitor.actions.exporting')
              : t('batteryMonitor.actions.exportJson')}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryMonitor}
            onClick={() => void handleImportBatteryMonitor()}
            type="button"
          >
            {isImportingBatteryMonitor
              ? t('batteryMonitor.actions.importing')
              : t('batteryMonitor.actions.importJson')}
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryFramesCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.exportFramesCsv')}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryFramesCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.importFramesCsv')}
          </button>
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatterySignalsCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.exportSignalsCsv')}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatterySignalsCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.importSignalsCsv')}
          </button>
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryItemsCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.exportItemsCsv')}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryItemsCsv()}
            type="button"
          >
            {t('batteryMonitor.actions.importItemsCsv')}
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryDbc}
            onClick={() => void handleExportBatteryDbc()}
            type="button"
          >
            {isExportingBatteryDbc
              ? t('batteryMonitor.actions.exporting')
              : t('batteryMonitor.actions.exportDbc')}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryDbc}
            onClick={() => void handleImportBatteryDbc()}
            type="button"
          >
            {isImportingBatteryDbc
              ? t('batteryMonitor.actions.importing')
              : t('batteryMonitor.actions.importDbc')}
          </button>
        </div>
      </div>
      {batteryMonitorExportStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {batteryMonitorExportStatus}
        </p>
      ) : null}
      {batteryMonitorImportStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {batteryMonitorImportStatus}
        </p>
      ) : null}
      {batteryCsvStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {batteryCsvStatus}
        </p>
      ) : null}
      {batteryDbcStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {batteryDbcStatus}
        </p>
      ) : null}
      {loadedProject ? (
        <div className="pdo-simple-editor battery-monitor-editor">
          <div className="config-summary-strip">
            <article>
              <span>{t('batteryMonitor.summary.status')}</span>
              <strong>
                {currentBatteryMonitorDocument.enabled
                  ? t('batteryMonitor.enabled')
                  : t('batteryMonitor.disabled')}
              </strong>
            </article>
            <article>
              <span>{t('batteryMonitor.summary.framesSignals')}</span>
              <strong>
                {currentBatteryMonitorDocument.frames.length} /{' '}
                {currentBatteryMonitorDocument.signals.length}
              </strong>
            </article>
            <article>
              <span>{t('batteryMonitor.summary.enabledItems')}</span>
              <strong>
                {currentBatteryMonitorDocument.items.filter((item) => item.enabled).length} /{' '}
                {currentBatteryMonitorDocument.items.length}
              </strong>
            </article>
            <article>
              <span>{t('batteryMonitor.summary.configSection')}</span>
              <strong>battery_monitor</strong>
            </article>
          </div>

          <div className="battery-config-row">
            <label title={t('batteryMonitor.enableTitle')}>
              {t('batteryMonitor.enabled')}
              <select
                value={currentBatteryMonitorDocument.enabled ? 1 : 0}
                onChange={(event) =>
                  updateBatteryMonitorField('enabled', Number(event.target.value) === 1)
                }
              >
                <option value={1}>{t('batteryMonitor.enabled')}</option>
                <option value={0}>{t('batteryMonitor.disabled')}</option>
              </select>
            </label>
            <label>
              schema version
              <input
                min={1}
                type="number"
                value={currentBatteryMonitorDocument.schema_version}
                onChange={(event) =>
                  updateBatteryMonitorField('schema_version', Number(event.target.value))
                }
              />
            </label>
            <label>
              binary version
              <input
                min={1}
                type="number"
                value={currentBatteryMonitorDocument.version}
                onChange={(event) =>
                  updateBatteryMonitorField('version', Number(event.target.value))
                }
              />
            </label>
            <label>
              {t('batteryMonitor.fields.defaultTimeout')}
              <input
                min={0}
                type="number"
                value={currentBatteryMonitorDocument.default_timeout_ticks}
                onChange={(event) =>
                  updateBatteryMonitorField('default_timeout_ticks', Number(event.target.value))
                }
              />
            </label>
            <label>
              {t('batteryMonitor.fields.pageSize')}
              <input
                min={1}
                type="number"
                value={currentBatteryMonitorDocument.page_size}
                onChange={(event) =>
                  updateBatteryMonitorField('page_size', Number(event.target.value))
                }
              />
            </label>
          </div>

          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>
                {t('batteryMonitor.frames.title', {
                  count: currentBatteryMonitorDocument.frames.length,
                })}
              </strong>
              <button onClick={addBatteryFrame} type="button">
                {t('batteryMonitor.actions.addFrame')}
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>frame_key</th>
                    <th>CAN ID</th>
                    <th>{t('batteryMonitor.frames.type')}</th>
                    <th>DLC</th>
                    <th>{t('batteryMonitor.frames.description')}</th>
                    <th>{t('batteryMonitor.frames.timeout')}</th>
                    <th>{t('batteryMonitor.actions.column')}</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatteryMonitorDocument.frames.map((frame, index) => (
                    <tr
                      className={
                        isModifiedPath(['battery_monitor', 'frames', index])
                          ? 'config-entry-modified'
                          : undefined
                      }
                      key={frameKeys[index]}
                    >
                      <td>
                        <input
                          value={frame.frame_key}
                          onChange={(event) =>
                            updateBatteryFrame(index, 'frame_key', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={formatFrameId(frame.can_id)}
                          onChange={(event) => updateBatteryFrameId(index, event.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={frame.frame_type}
                          onChange={(event) =>
                            updateBatteryFrame(index, 'frame_type', Number(event.target.value))
                          }
                        >
                          <option value={0}>{t('batteryMonitor.frameTypes.standard')}</option>
                          <option value={1}>{t('batteryMonitor.frameTypes.extended')}</option>
                        </select>
                      </td>
                      <td>
                        <input
                          max={8}
                          min={1}
                          type="number"
                          value={frame.dlc}
                          onChange={(event) =>
                            updateBatteryFrame(index, 'dlc', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={frame.desc}
                          onChange={(event) =>
                            updateBatteryFrame(index, 'desc', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={frame.timeout_ticks}
                          onChange={(event) =>
                            updateBatteryFrame(index, 'timeout_ticks', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        {isModifiedPath(['battery_monitor', 'frames', index]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() =>
                              restoreModifiedPath(['battery_monitor', 'frames', index])
                            }
                            type="button"
                          >
                            {t('common.actions.restore')}
                          </button>
                        ) : null}
                        <button
                          className="danger"
                          onClick={() => removeBatteryFrame(index)}
                          type="button"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>
                {t('batteryMonitor.signals.title', {
                  count: currentBatteryMonitorDocument.signals.length,
                })}
              </strong>
              <button onClick={addBatterySignal} type="button">
                {t('batteryMonitor.actions.addSignal')}
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table battery-monitor-signal-table">
                <thead>
                  <tr>
                    {batterySignalHeaders.map(([key, labelKey]) => (
                      <th key={key} scope="col">
                        <span className="battery-signal-header-code">{key}</span>
                        <span className="battery-signal-header-label">{t(labelKey)}</span>
                      </th>
                    ))}
                    <th scope="col">{t('batteryMonitor.actions.column')}</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatteryMonitorDocument.signals.map((signal, index) => (
                    <tr
                      className={
                        isModifiedPath(['battery_monitor', 'signals', index])
                          ? 'config-entry-modified'
                          : undefined
                      }
                      key={signalKeys[index]}
                    >
                      <td>
                        <input
                          value={signal.signal_key}
                          onChange={(event) =>
                            updateBatterySignal(index, 'signal_key', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.param_id}
                          onChange={(event) =>
                            updateBatterySignal(index, 'param_id', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.name}
                          onChange={(event) =>
                            updateBatterySignal(index, 'name', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={signal.frame_key}
                          onChange={(event) =>
                            updateBatterySignal(index, 'frame_key', event.target.value)
                          }
                        >
                          {frameOptions.map((frame) => (
                            <option key={frame.frame_key} value={frame.frame_key}>
                              {frame.frame_key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={signal.pos}
                          onChange={(event) =>
                            updateBatterySignal(index, 'pos', Number(event.target.value))
                          }
                        />
                        <input
                          min={1}
                          type="number"
                          value={signal.len}
                          onChange={(event) =>
                            updateBatterySignal(index, 'len', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={signal.raw_offset}
                          onChange={(event) =>
                            updateBatterySignal(index, 'raw_offset', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={signal.raw_type}
                          onChange={(event) =>
                            updateBatterySignal(index, 'raw_type', event.target.value)
                          }
                        >
                          {rawTypeOptions.map(([value, labelKey]) => (
                            <option key={value} value={value}>
                              {t(labelKey)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={signal.value_type}
                          onChange={(event) =>
                            updateBatterySignal(index, 'value_type', event.target.value)
                          }
                        >
                          {valueTypeOptions.map(([value, labelKey]) => (
                            <option key={value} value={value}>
                              {t(labelKey)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={signal.byte_order}
                          onChange={(event) =>
                            updateBatterySignal(index, 'byte_order', event.target.value)
                          }
                        >
                          <option value="little_endian">
                            {t('batteryMonitor.byteOrder.little')}
                          </option>
                          <option value="big_endian">{t('batteryMonitor.byteOrder.big')}</option>
                        </select>
                      </td>
                      <td>
                        <input
                          step="any"
                          type="number"
                          value={signal.parse_resolution}
                          onChange={(event) =>
                            updateBatterySignal(
                              index,
                              'parse_resolution',
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          step="any"
                          type="number"
                          value={signal.parse_offset}
                          onChange={(event) =>
                            updateBatterySignal(index, 'parse_offset', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={`0x${signal.parse_mask.toString(16).toUpperCase()}`}
                          onChange={(event) =>
                            updateBatterySignal(index, 'parse_mask', parseMask(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={signal.parse_shift}
                          onChange={(event) =>
                            updateBatterySignal(index, 'parse_shift', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        {isModifiedPath(['battery_monitor', 'signals', index]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() =>
                              restoreModifiedPath(['battery_monitor', 'signals', index])
                            }
                            type="button"
                          >
                            {t('common.actions.restore')}
                          </button>
                        ) : null}
                        <button
                          className="danger"
                          onClick={() => removeBatterySignal(index)}
                          type="button"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>
                {t('batteryMonitor.items.title', {
                  count: currentBatteryMonitorDocument.items.length,
                })}
              </strong>
              <button onClick={addBatteryItem} type="button">
                {t('batteryMonitor.actions.addItem')}
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>{t('batteryMonitor.items.enabled')}</th>
                    <th>{t('batteryMonitor.items.order')}</th>
                    <th>item_key</th>
                    <th>{t('batteryMonitor.items.signal')}</th>
                    <th>name_key</th>
                    <th>{t('batteryMonitor.items.zhName')}</th>
                    <th>fallback</th>
                    <th>{t('batteryMonitor.items.unit')}</th>
                    <th>{t('batteryMonitor.items.format')}</th>
                    <th>{t('batteryMonitor.items.offset')}</th>
                    <th>{t('batteryMonitor.items.scale')}</th>
                    <th>{t('batteryMonitor.items.decimals')}</th>
                    <th>{t('batteryMonitor.items.validity')}</th>
                    <th>{t('batteryMonitor.actions.column')}</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatteryMonitorDocument.items.map((item, index) => {
                    const zhText = languageText(language, item.name_key);
                    return (
                      <tr
                        className={
                          isModifiedPath(['battery_monitor', 'items', index])
                            ? 'config-entry-modified'
                            : undefined
                        }
                        key={itemKeys[index]}
                      >
                        <td>
                          <input
                            checked={item.enabled}
                            type="checkbox"
                            onChange={(event) =>
                              updateBatteryItem(index, 'enabled', event.target.checked)
                            }
                          />
                        </td>
                        <td>
                          <input
                            min={0}
                            type="number"
                            value={item.order}
                            onChange={(event) =>
                              updateBatteryItem(index, 'order', Number(event.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item.item_key}
                            onChange={(event) =>
                              updateBatteryItem(index, 'item_key', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={item.signal_key}
                            onChange={(event) =>
                              updateBatteryItem(index, 'signal_key', event.target.value)
                            }
                          >
                            {signalOptions.map((signal) => (
                              <option key={signal.signal_key} value={signal.signal_key}>
                                {signal.signal_key}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={item.name_key}
                            onChange={(event) =>
                              updateBatteryItem(index, 'name_key', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={zhText || ''}
                            placeholder={item.fallback_name}
                            onChange={(event) =>
                              updateBatteryItemLanguage(index, event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item.fallback_name}
                            onChange={(event) =>
                              updateBatteryItem(index, 'fallback_name', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={item.unit}
                            onChange={(event) =>
                              updateBatteryItem(index, 'unit', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={item.formatter.kind}
                            onChange={(event) =>
                              updateBatteryItemFormatter(index, 'kind', event.target.value)
                            }
                          >
                            {formatterOptions.map(([value, labelKey]) => (
                              <option key={value} value={value}>
                                {t(labelKey)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            step="any"
                            type="number"
                            value={item.formatter.offset}
                            onChange={(event) =>
                              updateBatteryItemFormatter(
                                index,
                                'offset',
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.formatter.scale_num}
                            onChange={(event) =>
                              updateBatteryItemFormatter(
                                index,
                                'scale_num',
                                Number(event.target.value),
                              )
                            }
                          />
                          /
                          <input
                            type="number"
                            value={item.formatter.scale_den}
                            onChange={(event) =>
                              updateBatteryItemFormatter(
                                index,
                                'scale_den',
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            min={0}
                            type="number"
                            value={item.formatter.decimals}
                            onChange={(event) =>
                              updateBatteryItemFormatter(
                                index,
                                'decimals',
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={item.validity.frame_key ?? ''}
                            onChange={(event) =>
                              updateBatteryItemValidity(index, 'frame_key', event.target.value)
                            }
                          >
                            {frameOptions.map((frame) => (
                              <option key={frame.frame_key} value={frame.frame_key}>
                                {frame.frame_key}
                              </option>
                            ))}
                          </select>
                          <input
                            min={0}
                            placeholder={t('batteryMonitor.items.frameTimeout')}
                            type="number"
                            value={item.validity.timeout_ticks ?? ''}
                            onChange={(event) =>
                              updateBatteryItemValidity(
                                index,
                                'timeout_ticks',
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          {isModifiedPath(['battery_monitor', 'items', index]) ? (
                            <button
                              className="config-restore-button"
                              onClick={() =>
                                restoreModifiedPath(['battery_monitor', 'items', index])
                              }
                              type="button"
                            >
                              {t('common.actions.restore')}
                            </button>
                          ) : null}
                          <button
                            className="danger"
                            onClick={() => removeBatteryItem(index)}
                            type="button"
                          >
                            {t('common.actions.delete')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <EmptyState>{t('batteryMonitor.openProjectFirst')}</EmptyState>
      )}
    </section>
  );
}
