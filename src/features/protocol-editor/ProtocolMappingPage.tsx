import { Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { useStableCollectionKeys } from '../../hooks/useStableCollectionKeys';
import type { ProtocolMappingTarget } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { formatFrameId } from '../realtime-data/usePdoEditor';
import type { ProtocolEditorController } from './useProtocolEditor';

interface ProtocolMappingPageProps {
  controller: ProtocolEditorController;
  isModifiedPath: (path: JsonPath) => boolean;
}
export function ProtocolMappingPage({ controller, isModifiedPath }: ProtocolMappingPageProps) {
  const { t } = useTranslation();
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
  const stableKeys = useStableCollectionKeys();
  const mappingKeys = stableKeys('protocol-mappings', currentProtocolMappings);
  const pdoOverviewFrames = unifiedProtocol
    ? [...unifiedProtocol.canopen.pdo_recv, ...unifiedProtocol.canopen.pdo_send]
    : [];
  const pdoOverviewKeys = stableKeys('protocol-overview-pdo', pdoOverviewFrames);
  const privateOverviewFrames = unifiedProtocol?.private_protocol.frames ?? [];
  const privateOverviewKeys = stableKeys('protocol-overview-private', privateOverviewFrames);

  return (
    <section className="project-open-card">
      <div className="config-table-toolbar">
        <div>
          <h2>{t('protocol.mapping.title')}</h2>
          <p>{t('protocol.mapping.description')}</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || isParsingUnifiedProtocol}
            onClick={() => void refreshUnifiedProtocol()}
            type="button"
          >
            {t(isParsingUnifiedProtocol ? 'protocol.common.parsing' : 'protocol.mapping.refresh')}
          </button>
          <button
            disabled={!loadedProject || !unifiedProtocol}
            onClick={applyUnifiedTopology}
            type="button"
          >
            {t('protocol.mapping.applyParsed')}
          </button>
          <button
            disabled={!loadedProject}
            onClick={() => addProtocolMapping('can_open_pdo')}
            type="button"
          >
            {t('protocol.mapping.addPdo')}
          </button>
          <button
            disabled={!loadedProject}
            onClick={() => addProtocolMapping('can_open_sdo')}
            type="button"
          >
            {t('protocol.mapping.addSdo')}
          </button>
          <button
            disabled={!loadedProject}
            onClick={() => addProtocolMapping('private_frame')}
            type="button"
          >
            {t('protocol.mapping.addPrivate')}
          </button>
          <button
            disabled={!loadedProject || isParsingUnifiedProtocol}
            onClick={() => void handleFlattenUnifiedProtocol()}
            type="button"
          >
            {t('protocol.mapping.generateLegacyPdo')}
          </button>
        </div>
      </div>
      {unifiedProtocol ? (
        <>
          <div className="project-open-report">
            <article>
              <span>{t('protocol.common.validationStatus')}</span>
              <strong>
                {t(unifiedProtocol.validation.valid ? 'protocol.common.passed' : 'protocol.common.hasErrors')}
              </strong>
            </article>
            <article>
              <span>{t('protocol.mapping.mappingCount')}</span>
              <strong>{currentProtocolMappings.length}</strong>
            </article>
            <article>
              <span>{t('protocol.mapping.canopenFrames')}</span>
              <strong>
                {unifiedProtocol.canopen.pdo_recv.length + unifiedProtocol.canopen.pdo_send.length}
              </strong>
            </article>
            <article>
              <span>{t('protocol.mapping.privateFrames')}</span>
              <strong>{unifiedProtocol.private_protocol.frames.length}</strong>
            </article>
          </div>
          {protocolFlattenStatus ? (
            <p aria-live="polite" className="text-success" role="status">
              {protocolFlattenStatus}
            </p>
          ) : null}
          {unifiedProtocol.validation.errors.length > 0 ? (
            <p className="project-open-error" role="alert">
              {unifiedProtocol.validation.errors.join('；')}
            </p>
          ) : null}
          {unifiedProtocol.validation.warnings.length > 0 ? (
            <p className="export-warning">{unifiedProtocol.validation.warnings.join('；')}</p>
          ) : null}
          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>{t('protocol.mapping.editorTitle')}</strong>
            </div>
            <div className="config-table-frame">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>Signal ID</th>
                    <th>{t('protocol.mapping.targetType')}</th>
                    <th>{t('protocol.mapping.directionFrameKey')}</th>
                    <th>Frame ID / Index</th>
                    <th>Subindex</th>
                    <th>Bit Offset</th>
                    <th>Bit Length</th>
                    <th>{t('protocol.common.actions')}</th>
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
                      key={mappingKeys[mappingIndex]}
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
                          <option value="private_frame">{t('protocol.mapping.privateFrame')}</option>
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
                          {t('protocol.common.delete')}
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
            {pdoOverviewFrames.map((frame, frameIndex) => {
              const frameKey = pdoOverviewKeys[frameIndex];
              const frameMappingKeys = stableKeys(
                `protocol-overview-pdo-${frameKey}`,
                frame.mappings,
              );
              return (
                <article className="pdo-frame-card" key={frameKey}>
                  <div className="pdo-frame-grid">
                    <label>
                      {t('protocol.mapping.direction')}
                      <input
                        readOnly
                        value={t(
                          frame.direction === 'receive'
                            ? 'protocol.mapping.receive'
                            : 'protocol.mapping.send',
                        )}
                      />
                    </label>
                    <label>
                      {t('protocol.private.frameId')}
                      <input readOnly value={formatFrameId(frame.frame_id)} />
                    </label>
                    <label>
                      {t('protocol.mapping.frameDescription')}
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
                          <tr key={frameMappingKeys[mappingIndex]}>
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
              );
            })}
          </section>
          <section className="pdo-frame-section">
            <div className="config-table-toolbar">
              <strong>{t('protocol.mapping.privateProtocolFrames')}</strong>
            </div>
            {privateOverviewFrames.map((frame, frameIndex) => {
              const frameKey = privateOverviewKeys[frameIndex];
              const payloadKeys = stableKeys(
                `protocol-overview-private-${frameKey}`,
                frame.payload,
              );
              return (
                <article className="pdo-frame-card" key={frameKey}>
                  <div className="pdo-frame-grid">
                    <label>
                      {t('protocol.private.frameKey')}
                      <input readOnly value={frame.frame_key || '-'} />
                    </label>
                    <label>
                      {t('protocol.private.frameId')}
                      <input readOnly value={formatFrameId(frame.frame_id)} />
                    </label>
                    <label>
                      {t('protocol.common.name')}
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
                          <th>{t('protocol.common.byteOrder')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frame.payload.map((mapping, mappingIndex) => (
                          <tr key={payloadKeys[mappingIndex]}>
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
              );
            })}
          </section>
        </>
      ) : (
        <EmptyState icon={Workflow}>{t('protocol.mapping.empty')}</EmptyState>
      )}
    </section>
  );
}
