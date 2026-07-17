import { EmptyState } from '../../components/EmptyState';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { LoadedProject } from '../../types/platform';
import type { BatteryLegacyController } from './useBatteryLegacyController';

interface BatteryLegacyPageProps {
  loadedProject: LoadedProject | null;
  controller: BatteryLegacyController;
}

export function BatteryProtocolPage({ loadedProject, controller }: BatteryLegacyPageProps) {
  const {
    currentBatteryProtocolDocument,
    batteryProtocolExportStatus,
    batteryProtocolImportStatus,
    batteryCsvStatus,
    batteryDbcStatus,
    isExportingBatteryProtocol,
    isImportingBatteryProtocol,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    isExportingBatteryDbc,
    isImportingBatteryDbc,
    handleExportBatteryProtocol,
    handleImportBatteryProtocol,
    handleExportBatteryFramesCsv,
    handleImportBatteryFramesCsv,
    handleExportBatterySignalsCsv,
    handleImportBatterySignalsCsv,
    handleExportBatteryDbc,
    handleImportBatteryDbc,
    updateBatteryProtocolField,
    updateBatteryFrame,
    updateBatteryFrameId,
    addBatteryFrame,
    removeBatteryFrame,
    updateBatterySignal,
    addBatterySignal,
    removeBatterySignal,
    formatFrameId,
    isModifiedPath,
    restoreModifiedPath,
  } = controller;
  const stableKeys = useStableCollectionKeys();
  const frameKeys = stableKeys(
    'battery-protocol-frames',
    currentBatteryProtocolDocument?.frames ?? [],
  );
  const signalKeys = stableKeys(
    'battery-protocol-signals',
    currentBatteryProtocolDocument?.signals ?? [],
  );

  return (
    <section className="table-spec-card">
      <div className="private-protocol-header">
        <div className="private-protocol-header-text">
          <h2>锂电协议</h2>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isExportingBatteryProtocol}
            onClick={() => void handleExportBatteryProtocol()}
            type="button"
          >
            {isExportingBatteryProtocol ? '导出中...' : '导出配置'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryProtocol}
            onClick={() => void handleImportBatteryProtocol()}
            type="button"
          >
            {isImportingBatteryProtocol ? '导入中...' : '导入配置'}
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryFramesCsv()}
            type="button"
          >
            {isExportingBatteryCsv ? '导出中...' : '导出帧 CSV'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryFramesCsv()}
            type="button"
          >
            {isImportingBatteryCsv ? '导入中...' : '导入帧 CSV'}
          </button>
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatterySignalsCsv()}
            type="button"
          >
            {isExportingBatteryCsv ? '导出中...' : '导出信号 CSV'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatterySignalsCsv()}
            type="button"
          >
            {isImportingBatteryCsv ? '导入中...' : '导入信号 CSV'}
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
      {batteryProtocolExportStatus ? (
        <p className="config-helper-text">{batteryProtocolExportStatus}</p>
      ) : null}
      {batteryProtocolImportStatus ? (
        <p className="config-helper-text">{batteryProtocolImportStatus}</p>
      ) : null}
      {batteryCsvStatus ? <p className="config-helper-text">{batteryCsvStatus}</p> : null}
      {batteryDbcStatus ? <p className="config-helper-text">{batteryDbcStatus}</p> : null}
      {loadedProject ? (
        <div className="pdo-simple-editor battery-monitor-editor">
          <div className="config-summary-strip">
            <article>
              <span>帧</span>
              <strong>{currentBatteryProtocolDocument.frames.length}</strong>
            </article>
            <article>
              <span>信号</span>
              <strong>{currentBatteryProtocolDocument.signals.length}</strong>
            </article>
            <article>
              <span>写回段落</span>
              <strong>battery_protocol</strong>
            </article>
          </div>
          <div className="battery-config-row">
            <label title="帧数据的默认超时时间（单位：tick），各帧可单独覆盖">
              默认超时 tick
              <input
                type="number"
                value={currentBatteryProtocolDocument.default_timeout_ticks ?? 200}
                onChange={(event) =>
                  updateBatteryProtocolField('default_timeout_ticks', Number(event.target.value))
                }
              />
            </label>
          </div>
          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>锂电 CAN 帧（{currentBatteryProtocolDocument.frames.length}）</strong>
              <button onClick={addBatteryFrame} type="button">
                新增帧
              </button>
            </div>
            {currentBatteryProtocolDocument.frames.map((frame, frameIndex) => (
              <article
                className={
                  isModifiedPath(['battery_protocol', 'frames', frameIndex])
                    ? 'pdo-frame-card battery-frame-card config-entry-modified'
                    : 'pdo-frame-card battery-frame-card'
                }
                key={frameKeys[frameIndex]}
              >
                <div className="battery-frame-grid">
                  <label title="帧的唯一标识键名，用于信号和显示项引用">
                    帧 key
                    <input
                      value={frame.frame_key}
                      onChange={(event) =>
                        updateBatteryFrame(frameIndex, 'frame_key', event.target.value)
                      }
                    />
                  </label>
                  <label title="CAN 帧 ID，支持十进制或 0x 开头的十六进制格式">
                    帧 ID
                    <input
                      inputMode="text"
                      value={formatFrameId(frame.can_id)}
                      onChange={(event) => updateBatteryFrameId(frameIndex, event.target.value)}
                    />
                  </label>
                  <label title="标准帧使用 11 位 CAN ID，扩展帧使用 29 位 CAN ID">
                    帧类型
                    <select
                      value={frame.type}
                      onChange={(event) =>
                        updateBatteryFrame(frameIndex, 'type', Number(event.target.value))
                      }
                    >
                      <option value={0}>标准帧</option>
                      <option value={1}>扩展帧</option>
                    </select>
                  </label>
                  <label title="该帧的超时时间（tick），留空则使用上方默认值">
                    超时 tick
                    <input
                      type="number"
                      value={
                        frame.timeout_ticks ?? currentBatteryProtocolDocument.default_timeout_ticks
                      }
                      onChange={(event) =>
                        updateBatteryFrame(frameIndex, 'timeout_ticks', Number(event.target.value))
                      }
                    />
                  </label>
                  <label title="帧的描述说明">
                    描述
                    <input
                      value={frame.desc ?? ''}
                      onChange={(event) =>
                        updateBatteryFrame(frameIndex, 'desc', event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="battery-frame-actions">
                  {isModifiedPath(['battery_protocol', 'frames', frameIndex]) ? (
                    <button
                      className="config-restore-button"
                      onClick={() =>
                        restoreModifiedPath(['battery_protocol', 'frames', frameIndex])
                      }
                      type="button"
                    >
                      恢复帧
                    </button>
                  ) : null}
                  <button
                    className="danger"
                    onClick={() => removeBatteryFrame(frameIndex)}
                    type="button"
                  >
                    删除帧
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>锂电信号（{currentBatteryProtocolDocument.signals.length}）</strong>
              <button onClick={addBatterySignal} type="button">
                新增信号
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th title="信号的唯一标识键名">key</th>
                    <th title="信号的中文显示名称">名称</th>
                    <th title="信号在帧数据中的起始 bit 位置">起始位</th>
                    <th title="信号占用的 bit 长度">长度</th>
                    <th title="字节序：Intel(小端) / Motorola(大端)">字节序</th>
                    <th title="数据类型：U8（无符号8位）/ U16（无符号16位）/ U32（无符号32位）/ I16（有符号16位）/ U32（时间打包）">
                      类型
                    </th>
                    <th title="缩放系数：实际值 = 原始值 × 系数 + 偏移">系数</th>
                    <th title="偏移量：实际值 = 原始值 × 系数 + 偏移">偏移</th>
                    <th title="物理最小值">最小值</th>
                    <th title="物理最大值">最大值</th>
                    <th title="物理单位">单位</th>
                    <th title="DBC 接收节点">接收节点</th>
                    <th title="信号注释">注释</th>
                    <th title="信号所属的 CAN 帧">帧</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatteryProtocolDocument.signals.map((signal, signalIndex) => (
                    <tr
                      className={
                        isModifiedPath(['battery_protocol', 'signals', signalIndex])
                          ? 'config-entry-modified'
                          : undefined
                      }
                      key={signalKeys[signalIndex]}
                    >
                      <td>
                        <input
                          value={signal.signal_key}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'signal_key', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.name}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'name', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={signal.pos}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'pos', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={signal.len}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'len', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={signal.show_type}
                          onChange={(event) =>
                            updateBatterySignal(
                              signalIndex,
                              'show_type',
                              Number(event.target.value),
                            )
                          }
                        >
                          <option value={0}>Intel(小端)</option>
                          <option value={1}>Motorola(大端)</option>
                          <option value={2}>按位</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={signal.type}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'type', Number(event.target.value))
                          }
                        >
                          <option value={0}>U8（无符号8位）</option>
                          <option value={1}>U16（无符号16位）</option>
                          <option value={2}>U32（无符号32位）</option>
                          <option value={10}>I16（有符号16位）</option>
                          <option value={20}>U32（时间打包）</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={signal.factor ?? 1}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'factor', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={signal.offset ?? 0}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'offset', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={signal.min ?? 0}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'min', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={signal.max ?? 0}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'max', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.unit ?? ''}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'unit', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.receiver ?? 'dbc_export'}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'receiver', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={signal.comment ?? ''}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'comment', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={signal.frame_key}
                          onChange={(event) =>
                            updateBatterySignal(signalIndex, 'frame_key', event.target.value)
                          }
                        >
                          {currentBatteryProtocolDocument.frames.map((frame) => (
                            <option key={frame.frame_key} value={frame.frame_key}>
                              {frame.frame_key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {isModifiedPath(['battery_protocol', 'signals', signalIndex]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() =>
                              restoreModifiedPath(['battery_protocol', 'signals', signalIndex])
                            }
                            type="button"
                          >
                            恢复
                          </button>
                        ) : null}
                        <button
                          className="danger"
                          onClick={() => removeBatterySignal(signalIndex)}
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
        </div>
      ) : (
        <EmptyState>请先在项目管理中打开 .jcpro 项目文件</EmptyState>
      )}
    </section>
  );
}

export function BatteryMonitorPage({ loadedProject, controller }: BatteryLegacyPageProps) {
  const {
    currentBatteryProtocolDocument,
    currentBatteryMonitorDocument,
    batteryMonitorExportStatus,
    batteryMonitorImportStatus,
    batteryCsvStatus,
    isExportingBatteryMonitor,
    isImportingBatteryMonitor,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    handleExportBatteryMonitor,
    handleImportBatteryMonitor,
    handleExportBatteryItemsCsv,
    handleImportBatteryItemsCsv,
    updateBatteryMonitorField,
    updateBatteryItem,
    updateBatteryItemFormatter,
    updateBatteryItemValidity,
    addBatteryItem,
    removeBatteryItem,
    isModifiedPath,
    restoreModifiedPath,
  } = controller;
  const stableKeys = useStableCollectionKeys();
  const itemKeys = stableKeys('battery-monitor-items', currentBatteryMonitorDocument?.items ?? []);

  return (
    <section className="table-spec-card">
      <div className="private-protocol-header">
        <div className="private-protocol-header-text">
          <h2>锂电监控显示配置</h2>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isExportingBatteryMonitor}
            onClick={() => void handleExportBatteryMonitor()}
            type="button"
          >
            {isExportingBatteryMonitor ? '导出中...' : '导出配置'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryMonitor}
            onClick={() => void handleImportBatteryMonitor()}
            type="button"
          >
            {isImportingBatteryMonitor ? '导入中...' : '导入配置'}
          </button>
          <span className="action-bar-sep" />
          <button
            disabled={!loadedProject || isExportingBatteryCsv}
            onClick={() => void handleExportBatteryItemsCsv()}
            type="button"
          >
            {isExportingBatteryCsv ? '导出中...' : '导出显示项 CSV'}
          </button>
          <button
            disabled={!loadedProject || isImportingBatteryCsv}
            onClick={() => void handleImportBatteryItemsCsv()}
            type="button"
          >
            {isImportingBatteryCsv ? '导入中...' : '导入显示项 CSV'}
          </button>
        </div>
      </div>
      {batteryMonitorExportStatus ? (
        <p className="config-helper-text">{batteryMonitorExportStatus}</p>
      ) : null}
      {batteryMonitorImportStatus ? (
        <p className="config-helper-text">{batteryMonitorImportStatus}</p>
      ) : null}
      {batteryCsvStatus ? <p className="config-helper-text">{batteryCsvStatus}</p> : null}
      {loadedProject ? (
        <div className="pdo-simple-editor battery-monitor-editor">
          <div className="config-summary-strip">
            <article>
              <span>状态</span>
              <strong>{currentBatteryMonitorDocument.enabled ? '启用' : '停用'}</strong>
            </article>
            <article>
              <span>显示项</span>
              <strong>
                {currentBatteryMonitorDocument.items.filter((item) => item.enabled).length} /{' '}
                {currentBatteryMonitorDocument.items.length}
              </strong>
            </article>
            <article>
              <span>写回段落</span>
              <strong>battery_monitor_info</strong>
            </article>
          </div>
          <div className="battery-config-row">
            <label title="启用或停用锂电监控功能">
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
            <label title="每页显示的锂电数据条数">
              每页数量
              <input
                type="number"
                value={currentBatteryMonitorDocument.page_size ?? 4}
                onChange={(event) =>
                  updateBatteryMonitorField('page_size', Number(event.target.value))
                }
              />
            </label>
          </div>
          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>显示项（{currentBatteryMonitorDocument.items.length}）</strong>
              <button onClick={addBatteryItem} type="button">
                新增显示项
              </button>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th title="是否在界面中显示该项">启用</th>
                    <th title="显示顺序，数值越小越靠前">顺序</th>
                    <th title="显示项的唯一标识键名">key</th>
                    <th title="关联的信号，选择后显示该信号的数据">信号</th>
                    <th title="国际化键名，用于多语言显示名称">名称key</th>
                    <th title="显示单位">单位</th>
                    <th title="数据格式化方式（线性/布尔文本/十六进制/时间等）">格式</th>
                    <th title="显示值的偏移量：显示值 = 原始值 × 缩放 + 偏移">偏移</th>
                    <th title="原始值与显示值的缩放比例：显示值 = 原始值 × 分子/分母 + 偏移">
                      缩放
                    </th>
                    <th title="保留的小数位数">小数</th>
                    <th title="关联的有效性判断帧，用于检测数据是否超时">有效帧</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBatteryMonitorDocument.items.map((item, itemIndex) => (
                    <tr
                      className={
                        isModifiedPath(['battery_monitor_info', 'items', itemIndex])
                          ? 'config-entry-modified'
                          : undefined
                      }
                      key={itemKeys[itemIndex]}
                    >
                      <td>
                        <input
                          checked={item.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateBatteryItem(itemIndex, 'enabled', event.target.checked)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.order}
                          onChange={(event) =>
                            updateBatteryItem(itemIndex, 'order', Number(event.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={item.item_key}
                          onChange={(event) =>
                            updateBatteryItem(itemIndex, 'item_key', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={item.signal_key}
                          onChange={(event) =>
                            updateBatteryItem(itemIndex, 'signal_key', event.target.value)
                          }
                        >
                          {(currentBatteryProtocolDocument?.signals ?? []).map((signal) => (
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
                            updateBatteryItem(itemIndex, 'name_key', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={item.unit}
                          onChange={(event) =>
                            updateBatteryItem(itemIndex, 'unit', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={item.formatter?.kind ?? 'linear'}
                          onChange={(event) =>
                            updateBatteryItemFormatter(itemIndex, 'kind', event.target.value)
                          }
                        >
                          <option value="linear">线性</option>
                          <option value="bool_text">布尔文本</option>
                          <option value="hex">十六进制</option>
                          <option value="packed_time_0p1h">0.1H时间</option>
                          <option value="linear_u8_wrap">线性后uint8截断</option>
                          <option value="packed_time_legacy_discharge_0p1h">旧版放电时间</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.formatter?.offset ?? 0}
                          onChange={(event) =>
                            updateBatteryItemFormatter(
                              itemIndex,
                              'offset',
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.formatter?.scale_num ?? 1}
                          onChange={(event) =>
                            updateBatteryItemFormatter(
                              itemIndex,
                              'scale_num',
                              Number(event.target.value),
                            )
                          }
                        />
                        /
                        <input
                          type="number"
                          value={item.formatter?.scale_den ?? 1}
                          onChange={(event) =>
                            updateBatteryItemFormatter(
                              itemIndex,
                              'scale_den',
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.formatter?.decimals ?? 0}
                          onChange={(event) =>
                            updateBatteryItemFormatter(
                              itemIndex,
                              'decimals',
                              Number(event.target.value),
                            )
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={item.validity?.frame_key ?? ''}
                          onChange={(event) =>
                            updateBatteryItemValidity(itemIndex, 'frame_key', event.target.value)
                          }
                        >
                          {(currentBatteryProtocolDocument?.frames ?? []).map((frame) => (
                            <option key={frame.frame_key} value={frame.frame_key}>
                              {frame.frame_key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {isModifiedPath(['battery_monitor_info', 'items', itemIndex]) ? (
                          <button
                            className="config-restore-button"
                            onClick={() =>
                              restoreModifiedPath(['battery_monitor_info', 'items', itemIndex])
                            }
                            type="button"
                          >
                            恢复
                          </button>
                        ) : null}
                        <button
                          className="danger"
                          onClick={() => removeBatteryItem(itemIndex)}
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
        </div>
      ) : (
        <EmptyState>请先在项目管理中打开 .jcpro 项目文件</EmptyState>
      )}
    </section>
  );
}
