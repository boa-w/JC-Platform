import { useMemo } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { LanguageDocument, LoadedProject } from '../../types/platform';
import { languageText } from '../fault-code/faultCodeModel';
import type { BatteryMonitorController } from './useBatteryMonitorController';

interface BatteryMonitorPageProps {
  loadedProject: LoadedProject | null;
  controller: BatteryMonitorController;
}

const rawTypeOptions = [
  ['u8', 'U8'],
  ['u16_le', 'U16 LE'],
  ['u32_le', 'U32 LE'],
  ['datetime_ymdhms', '年月日时分秒'],
] as const;

const valueTypeOptions = [
  ['u8', 'U8'],
  ['u16', 'U16'],
  ['u32', 'U32'],
  ['f32', 'F32'],
  ['datetime', '日期时间'],
] as const;

const formatterOptions = [
  ['linear', '线性'],
  ['bool_text', '布尔文本'],
  ['hex', '十六进制'],
  ['datetime', '日期时间'],
] as const;

function parseMask(value: string) {
  const text = value.trim();
  const parsed = /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(0xffffffff, Math.trunc(parsed))) : 0xffffffff;
}

function languageDocumentFor(project: LoadedProject | null): LanguageDocument {
  const document = project?.document as Record<string, unknown> | undefined;
  return (
    (document?.language_info as LanguageDocument | undefined) ?? {
      list_code_language: ['zh', 'en'],
      list_inner: ['中文', '英文'],
      list_translate: {},
    }
  );
}

export function BatteryMonitorPage({ loadedProject, controller }: BatteryMonitorPageProps) {
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
          <h2>锂电监控协议</h2>
          <p>帧、解析规则、显示项和多语言名称均从 battery_monitor 单一配置段维护。</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isExportingBatteryMonitor}
            onClick={() => void handleExportBatteryMonitor()}
            type="button"
          >
            {isExportingBatteryMonitor ? '导出中...' : '导出 JSON'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryMonitor}
            onClick={() => void handleImportBatteryMonitor()}
            type="button"
          >
            {isImportingBatteryMonitor ? '导入中...' : '导入 JSON'}
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryFramesCsv()}
            type="button"
          >
            导出帧 CSV
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryFramesCsv()}
            type="button"
          >
            导入帧 CSV
          </button>
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatterySignalsCsv()}
            type="button"
          >
            导出信号 CSV
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatterySignalsCsv()}
            type="button"
          >
            导入信号 CSV
          </button>
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryItemsCsv()}
            type="button"
          >
            导出显示项 CSV
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryItemsCsv()}
            type="button"
          >
            导入显示项 CSV
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryDbc}
            onClick={() => void handleExportBatteryDbc()}
            type="button"
          >
            {isExportingBatteryDbc ? '导出中...' : '导出 DBC'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryDbc}
            onClick={() => void handleImportBatteryDbc()}
            type="button"
          >
            {isImportingBatteryDbc ? '导入中...' : '导入 DBC'}
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
              <span>状态</span>
              <strong>{currentBatteryMonitorDocument.enabled ? '启用' : '停用'}</strong>
            </article>
            <article>
              <span>帧 / 信号</span>
              <strong>
                {currentBatteryMonitorDocument.frames.length} / {currentBatteryMonitorDocument.signals.length}
              </strong>
            </article>
            <article>
              <span>启用显示项</span>
              <strong>
                {currentBatteryMonitorDocument.items.filter((item) => item.enabled).length} /{' '}
                {currentBatteryMonitorDocument.items.length}
              </strong>
            </article>
            <article>
              <span>配置段</span>
              <strong>battery_monitor</strong>
            </article>
          </div>

          <div className="battery-config-row">
            <label title="启用或停用锂电监控协议">
              启用
              <select
                value={currentBatteryMonitorDocument.enabled ? 1 : 0}
                onChange={(event) =>
                  updateBatteryMonitorField('enabled', Number(event.target.value) === 1)
                }
              >
                <option value={1}>启用</option>
                <option value={0}>停用</option>
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
                onChange={(event) => updateBatteryMonitorField('version', Number(event.target.value))}
              />
            </label>
            <label>
              默认超时 tick
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
              每页数量
              <input
                min={1}
                type="number"
                value={currentBatteryMonitorDocument.page_size}
                onChange={(event) => updateBatteryMonitorField('page_size', Number(event.target.value))}
              />
            </label>
          </div>

          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>CAN 帧（{currentBatteryMonitorDocument.frames.length}）</strong>
              <button onClick={addBatteryFrame} type="button">
                新增帧
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>frame_key</th>
                    <th>CAN ID</th>
                    <th>类型</th>
                    <th>DLC</th>
                    <th>描述</th>
                    <th>超时 tick</th>
                    <th>操作</th>
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
                          onChange={(event) => updateBatteryFrame(index, 'frame_key', event.target.value)}
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
                          onChange={(event) => updateBatteryFrame(index, 'frame_type', Number(event.target.value))}
                        >
                          <option value={0}>标准帧</option>
                          <option value={1}>扩展帧</option>
                        </select>
                      </td>
                      <td>
                        <input
                          max={8}
                          min={1}
                          type="number"
                          value={frame.dlc}
                          onChange={(event) => updateBatteryFrame(index, 'dlc', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          value={frame.desc}
                          onChange={(event) => updateBatteryFrame(index, 'desc', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={frame.timeout_ticks}
                          onChange={(event) => updateBatteryFrame(index, 'timeout_ticks', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        {isModifiedPath(['battery_monitor', 'frames', index]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() => restoreModifiedPath(['battery_monitor', 'frames', index])}
                            type="button"
                          >
                            恢复
                          </button>
                        ) : null}
                        <button className="danger" onClick={() => removeBatteryFrame(index)} type="button">
                          删除
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
              <strong>信号解析规则（{currentBatteryMonitorDocument.signals.length}）</strong>
              <button onClick={addBatterySignal} type="button">
                新增信号
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>signal_key</th>
                    <th>param_id</th>
                    <th>名称</th>
                    <th>帧</th>
                    <th>pos / len</th>
                    <th>raw offset</th>
                    <th>raw type</th>
                    <th>value type</th>
                    <th>字节序</th>
                    <th>resolution</th>
                    <th>offset</th>
                    <th>mask</th>
                    <th>shift</th>
                    <th>操作</th>
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
                          onChange={(event) => updateBatterySignal(index, 'signal_key', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={signal.param_id}
                          onChange={(event) => updateBatterySignal(index, 'param_id', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={signal.name}
                          onChange={(event) => updateBatterySignal(index, 'name', event.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={signal.frame_key}
                          onChange={(event) => updateBatterySignal(index, 'frame_key', event.target.value)}
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
                          onChange={(event) => updateBatterySignal(index, 'pos', Number(event.target.value))}
                        />
                        <input
                          min={1}
                          type="number"
                          value={signal.len}
                          onChange={(event) => updateBatterySignal(index, 'len', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={signal.raw_offset}
                          onChange={(event) => updateBatterySignal(index, 'raw_offset', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <select
                          value={signal.raw_type}
                          onChange={(event) => updateBatterySignal(index, 'raw_type', event.target.value)}
                        >
                          {rawTypeOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={signal.value_type}
                          onChange={(event) => updateBatterySignal(index, 'value_type', event.target.value)}
                        >
                          {valueTypeOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={signal.byte_order}
                          onChange={(event) => updateBatterySignal(index, 'byte_order', event.target.value)}
                        >
                          <option value="little_endian">小端</option>
                          <option value="big_endian">大端</option>
                        </select>
                      </td>
                      <td>
                        <input
                          step="any"
                          type="number"
                          value={signal.parse_resolution}
                          onChange={(event) => updateBatterySignal(index, 'parse_resolution', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          step="any"
                          type="number"
                          value={signal.parse_offset}
                          onChange={(event) => updateBatterySignal(index, 'parse_offset', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          value={`0x${signal.parse_mask.toString(16).toUpperCase()}`}
                          onChange={(event) => updateBatterySignal(index, 'parse_mask', parseMask(event.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          min={0}
                          type="number"
                          value={signal.parse_shift}
                          onChange={(event) => updateBatterySignal(index, 'parse_shift', Number(event.target.value))}
                        />
                      </td>
                      <td>
                        {isModifiedPath(['battery_monitor', 'signals', index]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() => restoreModifiedPath(['battery_monitor', 'signals', index])}
                            type="button"
                          >
                            恢复
                          </button>
                        ) : null}
                        <button className="danger" onClick={() => removeBatterySignal(index)} type="button">
                          删除
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
              <strong>页面显示项（{currentBatteryMonitorDocument.items.length}）</strong>
              <button onClick={addBatteryItem} type="button">
                新增显示项
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>启用</th>
                    <th>顺序</th>
                    <th>item_key</th>
                    <th>信号</th>
                    <th>name_key</th>
                    <th>中文名称</th>
                    <th>fallback</th>
                    <th>单位</th>
                    <th>格式</th>
                    <th>偏移</th>
                    <th>缩放分子 / 分母</th>
                    <th>小数</th>
                    <th>有效帧 / 超时</th>
                    <th>操作</th>
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
                            onChange={(event) => updateBatteryItem(index, 'enabled', event.target.checked)}
                          />
                        </td>
                        <td>
                          <input
                            min={0}
                            type="number"
                            value={item.order}
                            onChange={(event) => updateBatteryItem(index, 'order', Number(event.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            value={item.item_key}
                            onChange={(event) => updateBatteryItem(index, 'item_key', event.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            value={item.signal_key}
                            onChange={(event) => updateBatteryItem(index, 'signal_key', event.target.value)}
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
                            onChange={(event) => updateBatteryItem(index, 'name_key', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            value={zhText || ''}
                            placeholder={item.fallback_name}
                            onChange={(event) => updateBatteryItemLanguage(index, event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            value={item.fallback_name}
                            onChange={(event) => updateBatteryItem(index, 'fallback_name', event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            value={item.unit}
                            onChange={(event) => updateBatteryItem(index, 'unit', event.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            value={item.formatter.kind}
                            onChange={(event) => updateBatteryItemFormatter(index, 'kind', event.target.value)}
                          >
                            {formatterOptions.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            step="any"
                            type="number"
                            value={item.formatter.offset}
                            onChange={(event) => updateBatteryItemFormatter(index, 'offset', Number(event.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={item.formatter.scale_num}
                            onChange={(event) => updateBatteryItemFormatter(index, 'scale_num', Number(event.target.value))}
                          />
                          /
                          <input
                            type="number"
                            value={item.formatter.scale_den}
                            onChange={(event) => updateBatteryItemFormatter(index, 'scale_den', Number(event.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            min={0}
                            type="number"
                            value={item.formatter.decimals}
                            onChange={(event) => updateBatteryItemFormatter(index, 'decimals', Number(event.target.value))}
                          />
                        </td>
                        <td>
                          <select
                            value={item.validity.frame_key ?? ''}
                            onChange={(event) => updateBatteryItemValidity(index, 'frame_key', event.target.value)}
                          >
                            {frameOptions.map((frame) => (
                              <option key={frame.frame_key} value={frame.frame_key}>
                                {frame.frame_key}
                              </option>
                            ))}
                          </select>
                          <input
                            min={0}
                            placeholder="帧超时"
                            type="number"
                            value={item.validity.timeout_ticks ?? ''}
                            onChange={(event) =>
                              updateBatteryItemValidity(index, 'timeout_ticks', Number(event.target.value))
                            }
                          />
                        </td>
                        <td>
                          {isModifiedPath(['battery_monitor', 'items', index]) ? (
                            <button
                              className="config-restore-button"
                              onClick={() => restoreModifiedPath(['battery_monitor', 'items', index])}
                              type="button"
                            >
                              恢复
                            </button>
                          ) : null}
                          <button className="danger" onClick={() => removeBatteryItem(index)} type="button">
                            删除
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
        <EmptyState>请先在项目管理中打开 .jcpro 项目文件</EmptyState>
      )}
    </section>
  );
}
