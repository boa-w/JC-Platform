import { ListTree } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { SignalDefinition } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import type { ProtocolEditorController } from './useProtocolEditor';

interface SignalDictionaryPageProps {
  controller: ProtocolEditorController;
  isModifiedPath: (path: JsonPath) => boolean;
}

export function SignalDictionaryPage({ controller, isModifiedPath }: SignalDictionaryPageProps) {
  const {
    loaded: loadedProject,
    signalDictionary: currentSignalDictionary,
    privateProtocol: currentPrivateProtocol,
    unifiedProtocol,
    unifiedProtocolError,
    isParsingUnifiedProtocol,
    refreshUnifiedProtocol,
    updateSignalDefinition,
    addSignalDefinition,
    removeSignalDefinition,
    restoreSignalDictionaryFromUnified,
  } = controller;
  const stableKeys = useStableCollectionKeys();
  const signalKeys = stableKeys('signal-dictionary', currentSignalDictionary.signals);

  return (
    <section className="project-open-card">
      <div className="config-table-toolbar">
        <div>
          <h2>业务信号字典</h2>
          <p>
            从旧版 SDO、PDO 和锂电配置派生业务
            Signal，集中查看数据类型、单位、缩放和旧系统变量索引。
          </p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isParsingUnifiedProtocol}
            onClick={() => void refreshUnifiedProtocol()}
            type="button"
          >
            {isParsingUnifiedProtocol ? '解析中...' : '刷新字典'}
          </button>
          <button disabled={!loadedProject} onClick={addSignalDefinition} type="button">
            新增 Signal
          </button>
          <button
            disabled={!loadedProject || !unifiedProtocol}
            onClick={restoreSignalDictionaryFromUnified}
            type="button"
          >
            从旧配置派生
          </button>
        </div>
      </div>
      {unifiedProtocolError ? (
        <p className="project-open-error" role="alert">
          {unifiedProtocolError}
        </p>
      ) : null}
      {unifiedProtocol ? (
        <>
          <div className="project-open-report">
            <article>
              <span>Signal 总数</span>
              <strong>{currentSignalDictionary.signals.length}</strong>
            </article>
            <article>
              <span>CANopen PDO 映射</span>
              <strong>
                {unifiedProtocol.canopen.pdo_recv.reduce(
                  (total, frame) => total + frame.mappings.length,
                  0,
                ) +
                  unifiedProtocol.canopen.pdo_send.reduce(
                    (total, frame) => total + frame.mappings.length,
                    0,
                  )}
              </strong>
            </article>
            <article>
              <span>SDO 对象</span>
              <strong>{unifiedProtocol.canopen.sdo_objects.length}</strong>
            </article>
            <article>
              <span>私有协议帧</span>
              <strong>{currentPrivateProtocol.frames.length}</strong>
            </article>
          </div>
          <div className="config-table-frame">
            <table className="config-table">
              <thead>
                <tr>
                  <th>Signal ID</th>
                  <th>名称</th>
                  <th>类型</th>
                  <th>单位</th>
                  <th>缩放</th>
                  <th>默认值</th>
                  <th>旧索引</th>
                  <th>来源</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {currentSignalDictionary.signals.map((signal, signalIndex) => (
                  <tr
                    className={
                      isModifiedPath(['signal_dictionary', 'signals', signalIndex])
                        ? 'config-entry-modified'
                        : undefined
                    }
                    key={signalKeys[signalIndex]}
                  >
                    <td>
                      <input
                        value={signal.signal_id}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            signal_id: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={signal.name}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            name: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={
                          typeof signal.data_type === 'string'
                            ? signal.data_type
                            : signal.data_type.custom
                        }
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            data_type: event.target.value as SignalDefinition['data_type'],
                          }))
                        }
                      >
                        {[
                          'bool',
                          'u8',
                          'u16',
                          'u32',
                          'i8',
                          'i16',
                          'i32',
                          'f32',
                          'string',
                          'bytes',
                        ].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={signal.display.unit || ''}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            display: { ...item.display, unit: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={signal.scale.scale_num}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            scale: { ...item.scale, scale_num: Number(event.target.value) },
                          }))
                        }
                      />
                      <input
                        type="number"
                        value={signal.scale.scale_den}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            scale: { ...item.scale, scale_den: Number(event.target.value) },
                          }))
                        }
                      />
                      <input
                        type="number"
                        value={signal.scale.offset}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            scale: { ...item.scale, offset: Number(event.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={signal.default_value ?? ''}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            default_value: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={signal.inner ?? -1}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            inner: Number(event.target.value),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={signal.display.description || ''}
                        onChange={(event) =>
                          updateSignalDefinition(signalIndex, (item) => ({
                            ...item,
                            display: { ...item.display, description: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() => removeSignalDefinition(signalIndex)}
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
        </>
      ) : (
        <EmptyState icon={ListTree}>请先打开项目并刷新业务信号字典。</EmptyState>
      )}
    </section>
  );
}
