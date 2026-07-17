import type { ProtocolMappingTarget } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { formatFrameId } from '../realtime-data';
import type { ProtocolEditorController } from './useProtocolEditor';

interface ProtocolMappingPageProps {
  controller: ProtocolEditorController;
  isModifiedPath: (path: JsonPath) => boolean;
}
export function ProtocolMappingPage({
  controller,
  isModifiedPath,
}: ProtocolMappingPageProps) {
  const {
    loaded: loadedProject,
    protocolMappings: currentProtocolMappings,
    unifiedProtocol,
    isParsingUnifiedProtocol,
    protocolFlattenStatus,
    refreshUnifiedProtocol,
    updateProtocolMapping,
    addProtocolMapping,
    removeProtocolMapping,
    applyUnifiedTopology,
    flattenUnifiedProtocol: handleFlattenUnifiedProtocol,
  } = controller;

  return (
          <section className="project-open-card">
            <div className="config-table-toolbar">
              <div>
                <h2>协议拓扑概览</h2>
                <p>
                  统一查看业务 Signal 到 CANopen SDO/PDO
                  与私有协议帧的映射关系，并执行帧长度、引用和重叠校验。
                </p>
              </div>
              <div className="sample-actions">
                <button
                  disabled={!loadedProject || isParsingUnifiedProtocol}
                  onClick={() => void refreshUnifiedProtocol()}
                  type="button"
                >
                  {isParsingUnifiedProtocol ? '解析中...' : '刷新拓扑'}
                </button>
                <button
                  disabled={!loadedProject || !unifiedProtocol}
                  onClick={applyUnifiedTopology}
                  type="button"
                >
                  从解析结果写入
                </button>
                <button
                  disabled={!loadedProject}
                  onClick={() => addProtocolMapping('can_open_pdo')}
                  type="button"
                >
                  新增 PDO 映射
                </button>
                <button
                  disabled={!loadedProject}
                  onClick={() => addProtocolMapping('can_open_sdo')}
                  type="button"
                >
                  新增 SDO 映射
                </button>
                <button
                  disabled={!loadedProject}
                  onClick={() => addProtocolMapping('private_frame')}
                  type="button"
                >
                  新增私有映射
                </button>
                <button
                  disabled={!loadedProject || isParsingUnifiedProtocol}
                  onClick={() => void handleFlattenUnifiedProtocol()}
                  type="button"
                >
                  生成旧版 PDO 段
                </button>
              </div>
            </div>
            {unifiedProtocol ? (
              <>
                <div className="project-open-report">
                  <article>
                    <span>校验状态</span>
                    <strong>{unifiedProtocol.validation.valid ? '通过' : '存在错误'}</strong>
                  </article>
                  <article>
                    <span>映射总数</span>
                    <strong>{currentProtocolMappings.length}</strong>
                  </article>
                  <article>
                    <span>CANopen 帧</span>
                    <strong>
                      {unifiedProtocol.canopen.pdo_recv.length +
                        unifiedProtocol.canopen.pdo_send.length}
                    </strong>
                  </article>
                  <article>
                    <span>私有帧</span>
                    <strong>{unifiedProtocol.private_protocol.frames.length}</strong>
                  </article>
                </div>
                {protocolFlattenStatus ? (
                  <p className="text-success">{protocolFlattenStatus}</p>
                ) : null}
                {unifiedProtocol.validation.errors.length > 0 ? (
                  <p className="project-open-error">
                    {unifiedProtocol.validation.errors.join('；')}
                  </p>
                ) : null}
                {unifiedProtocol.validation.warnings.length > 0 ? (
                  <p className="export-warning">{unifiedProtocol.validation.warnings.join('；')}</p>
                ) : null}
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>协议映射编辑</strong>
                  </div>
                  <div className="config-table-frame">
                    <table className="config-table">
                      <thead>
                        <tr>
                          <th>Signal ID</th>
                          <th>目标类型</th>
                          <th>方向/Frame Key</th>
                          <th>Frame ID / Index</th>
                          <th>Subindex</th>
                          <th>Bit Offset</th>
                          <th>Bit Length</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentProtocolMappings.map((mapping, mappingIndex) => (
                          <tr
                            className={
                              isModifiedPath(['protocol_mapping', mappingIndex])
                                ? 'config-entry-modified'
                                : undefined
                            }
                            key={`protocol-mapping-${mappingIndex}`}
                          >
                            <td>
                              <input
                                value={mapping.signal_id}
                                onChange={(event) =>
                                  updateProtocolMapping(mappingIndex, (item) => ({
                                    ...item,
                                    signal_id: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <select
                                value={mapping.target.kind}
                                onChange={(event) => {
                                  const kind = event.target.value as ProtocolMappingTarget['kind'];
                                  const target: ProtocolMappingTarget =
                                    kind === 'can_open_sdo'
                                      ? { kind: 'can_open_sdo', index: 0, subindex: 0 }
                                      : kind === 'private_frame'
                                        ? {
                                            kind: 'private_frame',
                                            frame_key: '',
                                            frame_id: 0,
                                            bit_offset: 0,
                                            bit_length: 8,
                                          }
                                        : {
                                            kind: 'can_open_pdo',
                                            direction: 'receive',
                                            frame_id: 0,
                                            bit_offset: 0,
                                            bit_length: 8,
                                          };
                                  updateProtocolMapping(mappingIndex, (item) => ({
                                    ...item,
                                    target,
                                  }));
                                }}
                              >
                                <option value="can_open_pdo">CANopen PDO</option>
                                <option value="can_open_sdo">CANopen SDO</option>
                                <option value="private_frame">私有帧</option>
                              </select>
                            </td>
                            <td>
                              {mapping.target.kind === 'can_open_pdo' ? (
                                <select
                                  value={mapping.target.direction}
                                  onChange={(event) =>
                                    updateProtocolMapping(mappingIndex, (item) => ({
                                      ...item,
                                      target: {
                                        ...(item.target as Extract<
                                          ProtocolMappingTarget,
                                          { kind: 'can_open_pdo' }
                                        >),
                                        direction: event.target.value as 'receive' | 'send',
                                      },
                                    }))
                                  }
                                >
                                  <option value="receive">receive</option>
                                  <option value="send">send</option>
                                </select>
                              ) : mapping.target.kind === 'private_frame' ? (
                                <input
                                  value={mapping.target.frame_key}
                                  onChange={(event) =>
                                    updateProtocolMapping(mappingIndex, (item) => ({
                                      ...item,
                                      target: {
                                        ...(item.target as Extract<
                                          ProtocolMappingTarget,
                                          { kind: 'private_frame' }
                                        >),
                                        frame_key: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                value={
                                  mapping.target.kind === 'can_open_sdo'
                                    ? mapping.target.index
                                    : mapping.target.frame_id
                                }
                                onChange={(event) =>
                                  updateProtocolMapping(mappingIndex, (item) => {
                                    if (item.target.kind === 'can_open_sdo')
                                      return {
                                        ...item,
                                        target: {
                                          ...item.target,
                                          index: Number(event.target.value),
                                        },
                                      };
                                    return {
                                      ...item,
                                      target: {
                                        ...item.target,
                                        frame_id: Number(event.target.value),
                                      },
                                    };
                                  })
                                }
                              />
                            </td>
                            <td>
                              {mapping.target.kind === 'can_open_sdo' ? (
                                <input
                                  type="number"
                                  value={mapping.target.subindex}
                                  onChange={(event) =>
                                    updateProtocolMapping(mappingIndex, (item) => ({
                                      ...item,
                                      target: {
                                        ...(item.target as Extract<
                                          ProtocolMappingTarget,
                                          { kind: 'can_open_sdo' }
                                        >),
                                        subindex: Number(event.target.value),
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {mapping.target.kind !== 'can_open_sdo' ? (
                                <input
                                  type="number"
                                  value={mapping.target.bit_offset}
                                  onChange={(event) =>
                                    updateProtocolMapping(mappingIndex, (item) => ({
                                      ...item,
                                      target: {
                                        ...(item.target as Exclude<
                                          ProtocolMappingTarget,
                                          { kind: 'can_open_sdo' }
                                        >),
                                        bit_offset: Number(event.target.value),
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {mapping.target.kind !== 'can_open_sdo' ? (
                                <input
                                  type="number"
                                  value={mapping.target.bit_length}
                                  onChange={(event) =>
                                    updateProtocolMapping(mappingIndex, (item) => ({
                                      ...item,
                                      target: {
                                        ...(item.target as Exclude<
                                          ProtocolMappingTarget,
                                          { kind: 'can_open_sdo' }
                                        >),
                                        bit_length: Number(event.target.value),
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              <button
                                className="danger"
                                onClick={() => removeProtocolMapping(mappingIndex)}
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
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>CANopen PDO</strong>
                  </div>
                  {[...unifiedProtocol.canopen.pdo_recv, ...unifiedProtocol.canopen.pdo_send].map(
                    (frame, frameIndex) => (
                      <article
                        className="pdo-frame-card"
                        key={`overview-pdo-${frame.direction}-${frame.frame_id}-${frameIndex}`}
                      >
                        <div className="pdo-frame-grid">
                          <label>
                            方向
                            <input
                              readOnly
                              value={frame.direction === 'receive' ? '接收' : '发送'}
                            />
                          </label>
                          <label>
                            帧 ID
                            <input readOnly value={formatFrameId(frame.frame_id)} />
                          </label>
                          <label>
                            描述
                            <input readOnly value={frame.description || '-'} />
                          </label>
                        </div>
                        <div className="config-table-frame">
                          <table className="config-table">
                            <thead>
                              <tr>
                                <th>Signal ID</th>
                                <th>Bit Offset</th>
                                <th>Bit Length</th>
                                <th>Show Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {frame.mappings.map((mapping, mappingIndex) => (
                                <tr
                                  key={`pdo-map-${frame.frame_id}-${mapping.signal_id}-${mappingIndex}`}
                                >
                                  <td>
                                    <code>{mapping.signal_id}</code>
                                  </td>
                                  <td>{mapping.bit_offset}</td>
                                  <td>{mapping.bit_length}</td>
                                  <td>{mapping.show_type}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </article>
                    ),
                  )}
                </section>
                <section className="pdo-frame-section">
                  <div className="config-table-toolbar">
                    <strong>私有协议帧</strong>
                  </div>
                  {unifiedProtocol.private_protocol.frames.map((frame, frameIndex) => (
                    <article
                      className="pdo-frame-card"
                      key={`overview-private-${frame.frame_key}-${frameIndex}`}
                    >
                      <div className="pdo-frame-grid">
                        <label>
                          帧 Key
                          <input readOnly value={frame.frame_key || '-'} />
                        </label>
                        <label>
                          帧 ID
                          <input readOnly value={formatFrameId(frame.frame_id)} />
                        </label>
                        <label>
                          名称
                          <input readOnly value={frame.name || '-'} />
                        </label>
                      </div>
                      <div className="config-table-frame">
                        <table className="config-table">
                          <thead>
                            <tr>
                              <th>Signal ID</th>
                              <th>Bit Offset</th>
                              <th>Bit Length</th>
                              <th>字节序</th>
                            </tr>
                          </thead>
                          <tbody>
                            {frame.payload.map((mapping, mappingIndex) => (
                              <tr
                                key={`private-map-${frame.frame_key}-${mapping.signal_id}-${mappingIndex}`}
                              >
                                <td>
                                  <code>{mapping.signal_id}</code>
                                </td>
                                <td>{mapping.bit_offset}</td>
                                <td>{mapping.bit_length}</td>
                                <td>{mapping.byte_order}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </section>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">MAP</div>
                <p>请先打开项目并刷新协议拓扑。</p>
              </div>
            )}
          </section>
  );
}
