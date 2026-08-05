import { RadioTower } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { JsonPath } from '../../utils/projectDirty';
import { formatFrameId, parseFrameId } from '../realtime-data/usePdoEditor';
import type { ProtocolEditorController } from './useProtocolEditor';

interface PrivateProtocolPageProps {
  controller: ProtocolEditorController;
  isModifiedPath: (path: JsonPath) => boolean;
}

export function PrivateProtocolPage({ controller, isModifiedPath }: PrivateProtocolPageProps) {
  const { t } = useTranslation();
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
  const stableKeys = useStableCollectionKeys();
  const frameKeys = stableKeys('private-protocol-frames', currentPrivateProtocol.frames);

  return (
    <section className="project-open-card">
      <div className="private-protocol-header">
        <div className="private-protocol-header-text">
          <h2>{t('protocol.private.title')}</h2>
          <p>{t('protocol.private.description')}</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isParsingUnifiedProtocol}
            onClick={() => void refreshUnifiedProtocol()}
            type="button"
          >
            {t(isParsingUnifiedProtocol ? 'protocol.common.parsing' : 'protocol.private.refresh')}
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
            {t(currentPrivateProtocol.enabled ? 'protocol.common.disable' : 'protocol.common.enable')}
          </button>
          <button disabled={!loadedProject} onClick={addPrivateFrame} type="button">
            {t('protocol.private.addFrame')}
          </button>
          <button
            disabled={!loadedProject || !unifiedProtocol}
            onClick={restorePrivateProtocolFromUnified}
            type="button"
          >
            {t('protocol.common.deriveFromLegacy')}
          </button>
          <button
            disabled={!loadedProject || isExportingPrivateProtocol}
            onClick={() => void handleExportPrivateProtocol()}
            type="button"
          >
            {t(isExportingPrivateProtocol ? 'common.status.exporting' : 'protocol.common.exportConfig')}
          </button>
          <button
            disabled={!loadedProject || isImportingPrivateProtocol}
            onClick={() => void handleImportPrivateProtocol()}
            type="button"
          >
            {t(isImportingPrivateProtocol ? 'dashboard.actionBar.importing' : 'protocol.common.importConfig')}
          </button>
        </div>
      </div>
      {unifiedProtocolError ? (
        <p className="project-open-error" role="alert">
          {unifiedProtocolError}
        </p>
      ) : null}
      {privateProtocolExportStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {privateProtocolExportStatus}
        </p>
      ) : null}
      {privateProtocolImportStatus ? (
        <p aria-live="polite" className="config-helper-text" role="status">
          {privateProtocolImportStatus}
        </p>
      ) : null}
      {unifiedProtocol ? (
        <>
          <div className="config-summary-strip">
            <article>
              <span>{t('protocol.common.enabledStatus')}</span>
              <strong>
                {t(currentPrivateProtocol.enabled ? 'protocol.common.enabled' : 'protocol.common.notEnabled')}
              </strong>
            </article>
            <article>
              <span>{t('protocol.private.frameCount')}</span>
              <strong>{currentPrivateProtocol.frames.length}</strong>
            </article>
            <article>
              <span>{t('protocol.private.payloadSignals')}</span>
              <strong>
                {currentPrivateProtocol.frames.reduce(
                  (total, frame) => total + frame.payload.length,
                  0,
                )}
              </strong>
            </article>
            <article>
              <span>{t('protocol.common.validationStatus')}</span>
              <strong>
                {t(unifiedProtocol.validation.valid ? 'protocol.common.passed' : 'protocol.common.hasErrors')}
              </strong>
            </article>
          </div>
          {currentPrivateProtocol.frames.map((frame, frameIndex) => {
            const frameKey = frameKeys[frameIndex];
            const payloadKeys = stableKeys(`private-protocol-payload-${frameKey}`, frame.payload);
            return (
              <article
                className={
                  isModifiedPath(['private_protocol', 'frames', frameIndex])
                    ? 'pdo-frame-card config-entry-modified'
                    : 'pdo-frame-card'
                }
                key={frameKey}
              >
                <div className="pdo-frame-header">
                  <div className="pdo-frame-grid">
                    <label>
                      {t('protocol.private.frameKey')}
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
                      {t('protocol.private.frameId')}
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
                      {t('protocol.common.name')}
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
                      {t('protocol.private.deleteFrame')}
                    </button>
                  </div>
                </div>
                <div className="private-frame-props">
                  <label>
                    {t('protocol.private.frameType')}
                    <select
                      value={frame.frame_type}
                      onChange={(event) =>
                        updatePrivateFrame(frameIndex, (item) => ({
                          ...item,
                          frame_type: event.target.value,
                        }))
                      }
                    >
                      <option value="standard">{t('protocol.private.standardFrame')}</option>
                      <option value="extended">{t('protocol.private.extendedFrame')}</option>
                    </select>
                  </label>
                  <label>
                    {t('protocol.private.periodTimeout')}
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
                    {t('protocol.private.checksum')}
                    <select
                      value={frame.checksum}
                      onChange={(event) =>
                        updatePrivateFrame(frameIndex, (item) => ({
                          ...item,
                          checksum: event.target.value,
                        }))
                      }
                    >
                      <option value="none">{t('protocol.common.none')}</option>
                      <option value="crc">CRC</option>
                      <option value="xor">XOR</option>
                    </select>
                  </label>
                  <label>
                    {t('protocol.common.byteOrder')}
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
                  <span>{t('protocol.private.payloadTitle', { count: frame.payload.length })}</span>
                  <button onClick={() => addPrivatePayload(frameIndex)} type="button">
                    {t('protocol.private.addPayload')}
                  </button>
                </div>
                <div className="config-table-frame">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Signal ID</th>
                        <th>Bit Offset</th>
                        <th>Bit Length</th>
                        <th>{t('protocol.common.byteOrder')}</th>
                        <th>{t('protocol.common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frame.payload.map((mapping, mappingIndex) => (
                        <tr key={payloadKeys[mappingIndex]}>
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
                              {t('protocol.common.delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </>
      ) : (
        <EmptyState icon={RadioTower}>{t('protocol.private.empty')}</EmptyState>
      )}
    </section>
  );
}
