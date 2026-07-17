import { formatFrameId, parseFrameId } from '../realtime-data';
import type { JsonPath } from '../../utils/projectDirty';
import type { ProtocolEditorController } from './useProtocolEditor';

interface PrivateProtocolPageProps {
  controller: ProtocolEditorController;
  isModifiedPath: (path: JsonPath) => boolean;
}

export function PrivateProtocolPage({
  controller,
  isModifiedPath,
}: PrivateProtocolPageProps) {
  const {
    loaded: loadedProject,
    privateProtocol: currentPrivateProtocol,
    unifiedProtocol,
    unifiedProtocolError,
    isParsingUnifiedProtocol,
    privateProtocolExportStatus,
    privateProtocolImportStatus,
    isExportingPrivateProtocol,
    isImportingPrivateProtocol,
    refreshUnifiedProtocol,
    updatePrivateProtocol: updatePrivateProtocolDocument,
    updatePrivateFrame,
    addPrivateFrame,
    removePrivateFrame,
    updatePrivatePayload,
    addPrivatePayload,
    removePrivatePayload,
    exportPrivateProtocol: handleExportPrivateProtocol,
    importPrivateProtocol: handleImportPrivateProtocol,
    restorePrivateProtocolFromUnified,
  } = controller;

  return (
          <section className="project-open-card">
            <div className="private-protocol-header">
              <div className="private-protocol-header-text">
                <h2>私有协议</h2>
                <p>
                  集中查看私有协议帧、校验方式、字节序和 Signal
                  载荷布局；当前会从锂电监控帧自动派生初始私有协议模型。
                </p>
              </div>
              <div className="sample-actions">
                <button
                  disabled={!loadedProject || isParsingUnifiedProtocol}
                  onClick={() => void refreshUnifiedProtocol()}
                  type="button"
                >
                  {isParsingUnifiedProtocol ? '解析中...' : '刷新私有协议'}
                </button>
                <button
                  disabled={!loadedProject}
                  onClick={() =>
                    updatePrivateProtocolDocument({
                      ...currentPrivateProtocol,
                      enabled: !currentPrivateProtocol.enabled,
                    })
                  }
                  type="button"
                >
                  {currentPrivateProtocol.enabled ? '停用' : '启用'}
                </button>
                <button disabled={!loadedProject} onClick={addPrivateFrame} type="button">
                  新增私有帧
                </button>
                <button
                  disabled={!loadedProject || !unifiedProtocol}
                  onClick={restorePrivateProtocolFromUnified}
                  type="button"
                >
                  从旧配置派生
                </button>
                <button
                  disabled={!loadedProject || isExportingPrivateProtocol}
                  onClick={() => void handleExportPrivateProtocol()}
                  type="button"
                >
                  {isExportingPrivateProtocol ? '导出中...' : '导出配置'}
                </button>
                <button
                  disabled={!loadedProject || isImportingPrivateProtocol}
                  onClick={() => void handleImportPrivateProtocol()}
                  type="button"
                >
                  {isImportingPrivateProtocol ? '导入中...' : '导入配置'}
                </button>
              </div>
            </div>
            {unifiedProtocolError ? (
              <p className="project-open-error">{unifiedProtocolError}</p>
            ) : null}
            {privateProtocolExportStatus ? (
              <p className="config-helper-text">{privateProtocolExportStatus}</p>
            ) : null}
            {privateProtocolImportStatus ? (
              <p className="config-helper-text">{privateProtocolImportStatus}</p>
            ) : null}
            {unifiedProtocol ? (
              <>
                <div className="config-summary-strip">
                  <article>
                    <span>启用状态</span>
                    <strong>{currentPrivateProtocol.enabled ? '启用' : '未启用'}</strong>
                  </article>
                  <article>
                    <span>私有帧数量</span>
                    <strong>{currentPrivateProtocol.frames.length}</strong>
                  </article>
                  <article>
                    <span>载荷 Signal</span>
                    <strong>
                      {currentPrivateProtocol.frames.reduce(
                        (total, frame) => total + frame.payload.length,
                        0,
                      )}
                    </strong>
                  </article>
                  <article>
                    <span>校验状态</span>
                    <strong>{unifiedProtocol.validation.valid ? '通过' : '存在错误'}</strong>
                  </article>
                </div>
                {currentPrivateProtocol.frames.map((frame, frameIndex) => (
                  <article
                    className={
                      isModifiedPath(['private_protocol', 'frames', frameIndex])
                        ? 'pdo-frame-card config-entry-modified'
                        : 'pdo-frame-card'
                    }
                    key={`private-protocol-${frame.frame_key}-${frameIndex}`}
                  >
                    <div className="pdo-frame-header">
                      <div className="pdo-frame-grid">
                        <label>
                          帧 Key
                          <input
                            value={frame.frame_key || ''}
                            onChange={(event) =>
                              updatePrivateFrame(frameIndex, (item) => ({
                                ...item,
                                frame_key: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          帧 ID
                          <input
                            inputMode="text"
                            value={formatFrameId(frame.frame_id)}
                            onChange={(event) => {
                              const nextId = parseFrameId(event.target.value);
                              if (nextId !== null)
                                updatePrivateFrame(frameIndex, (item) => ({
                                  ...item,
                                  frame_id: nextId,
                                }));
                            }}
                          />
                        </label>
                        <label>
                          名称
                          <input
                            value={frame.name || ''}
                            onChange={(event) =>
                              updatePrivateFrame(frameIndex, (item) => ({
                                ...item,
                                name: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="pdo-frame-actions">
                        <button
                          className="danger"
                          onClick={() => removePrivateFrame(frameIndex)}
                          type="button"
                        >
                          删除帧
                        </button>
                      </div>
                    </div>
                    <div className="private-frame-props">
                      <label>
                        帧类型
                        <select
                          value={frame.frame_type}
                          onChange={(event) =>
                            updatePrivateFrame(frameIndex, (item) => ({
                              ...item,
                              frame_type: event.target.value,
                            }))
                          }
                        >
                          <option value="standard">标准帧</option>
                          <option value="extended">扩展帧</option>
                        </select>
                      </label>
                      <label>
                        周期/超时
                        <input
                          type="number"
                          value={frame.cycle_ms}
                          onChange={(event) =>
                            updatePrivateFrame(frameIndex, (item) => ({
                              ...item,
                              cycle_ms: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        校验
                        <select
                          value={frame.checksum}
                          onChange={(event) =>
                            updatePrivateFrame(frameIndex, (item) => ({
                              ...item,
                              checksum: event.target.value,
                            }))
                          }
                        >
                          <option value="none">无</option>
                          <option value="crc">CRC</option>
                          <option value="xor">XOR</option>
                        </select>
                      </label>
                      <label>
                        字节序
                        <select
                          value={frame.byte_order}
                          onChange={(event) =>
                            updatePrivateFrame(frameIndex, (item) => ({
                              ...item,
                              byte_order: event.target.value,
                            }))
                          }
                        >
                          <option value="little">Little-Endian</option>
                          <option value="big">Big-Endian</option>
                        </select>
                      </label>
                    </div>
                    <div className="config-table-toolbar">
                      <span>载荷 Signal（{frame.payload.length}）</span>
                      <button onClick={() => addPrivatePayload(frameIndex)} type="button">
                        新增载荷
                      </button>
                    </div>
                    <div className="config-table-frame">
                      <table className="config-table">
                        <thead>
                          <tr>
                            <th>Signal ID</th>
                            <th>Bit Offset</th>
                            <th>Bit Length</th>
                            <th>字节序</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {frame.payload.map((mapping, mappingIndex) => (
                            <tr
                              key={`private-payload-${frame.frame_key}-${mapping.signal_id}-${mappingIndex}`}
                            >
                              <td>
                                <input
                                  value={mapping.signal_id}
                                  onChange={(event) =>
                                    updatePrivatePayload(frameIndex, mappingIndex, (item) => ({
                                      ...item,
                                      signal_id: event.target.value,
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={mapping.bit_offset}
                                  onChange={(event) =>
                                    updatePrivatePayload(frameIndex, mappingIndex, (item) => ({
                                      ...item,
                                      bit_offset: Number(event.target.value),
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={mapping.bit_length}
                                  onChange={(event) =>
                                    updatePrivatePayload(frameIndex, mappingIndex, (item) => ({
                                      ...item,
                                      bit_length: Number(event.target.value),
                                    }))
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={mapping.byte_order}
                                  onChange={(event) =>
                                    updatePrivatePayload(frameIndex, mappingIndex, (item) => ({
                                      ...item,
                                      byte_order: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="little">little</option>
                                  <option value="big">big</option>
                                </select>
                              </td>
                              <td>
                                <button
                                  className="danger"
                                  onClick={() => removePrivatePayload(frameIndex, mappingIndex)}
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
                  </article>
                ))}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">PRV</div>
                <p>请先打开项目并刷新私有协议。</p>
              </div>
            )}
          </section>
  );
}
