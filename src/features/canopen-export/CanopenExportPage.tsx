import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  FileCode2,
  FolderOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { ProtocolProfileBar } from '../../components/protocol/ProtocolProfileBar';
import type {
  CanOpenNodeDocument,
  CanOpenPdoDocument,
  CanOpenProjectDocument,
  CanOpenSdoChannelDocument,
  LoadedProject,
} from '../../types/platform';
import { activeControllerProtocolProfile } from '../protocol-profiles/protocolProfiles';
import './canopen-export.css';
import {
  formatNodeId,
  formatNodeIds,
  type NodeIdDisplayBase,
  parseNodeId,
  parseNodeIds,
} from './nodeIdDisplay';
import { useCanopenExport } from './useCanopenExport';

interface CanopenExportPageProps {
  loadedProject: LoadedProject | null;
  onUpdateDocument: (section: string, value: unknown) => void;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

const EMPTY_CANOPEN: CanOpenProjectDocument = {
  schema_version: 1,
  nodes: [],
  pdos: [],
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const text = value.trim();
  const parsed = /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function optionalNumeric(value: string): number | undefined {
  return value.trim() === '' ? undefined : numeric(value);
}

function cobIdText(value: number | undefined): string {
  return value === undefined ? '' : `0x${value.toString(16).toUpperCase()}`;
}

const nodeIdDisplayStorageKey = 'jc-platform.canopen.node-id-display';

function readNodeIdDisplayBase(): NodeIdDisplayBase {
  if (typeof window === 'undefined') return 'decimal';
  try {
    return window.localStorage.getItem(nodeIdDisplayStorageKey) === 'hexadecimal'
      ? 'hexadecimal'
      : 'decimal';
  } catch {
    return 'decimal';
  }
}

function sourceValue(document: unknown, section: string | undefined, index: number | undefined) {
  if (!section || index === undefined) return null;
  const root = record(document);
  const sources = root?.[section];
  return Array.isArray(sources) ? record(sources[index]) : null;
}

function sourceCount(document: unknown, section: 'pdo_recv' | 'pdo_send') {
  const root = record(document);
  return Array.isArray(root?.[section]) ? root[section].length : 0;
}

function sourceCobId(source: Record<string, unknown>): number | undefined {
  return numeric(source.id) ?? numeric(source.can_id);
}

function sourceFrameType(source: Record<string, unknown>): number {
  return numeric(source.type) ?? numeric(source.frame_type) ?? 0;
}

function readCanopen(document: unknown): CanOpenProjectDocument | null {
  const root = record(document);
  const value = record(root?.canopen);
  if (!value) return null;

  const nodes: CanOpenNodeDocument[] = Array.isArray(value.nodes)
    ? value.nodes.map((item) => {
        const node = record(item) ?? {};
        const sdoValue = record(node.sdo);
        const sdo: CanOpenSdoChannelDocument | undefined = sdoValue
          ? {
              cob_id_mode: String(sdoValue.cob_id_mode ?? ''),
              client_to_server_cob_id: numeric(sdoValue.client_to_server_cob_id) ?? 0,
              server_to_client_cob_id: numeric(sdoValue.server_to_client_cob_id) ?? 0,
            }
          : undefined;
        return {
          node_id: numeric(node.node_id) ?? 0,
          name: String(node.name ?? ''),
          role: String(node.role ?? ''),
          ...(sdo ? { sdo } : {}),
        };
      })
    : [];
  const pdos: CanOpenPdoDocument[] = Array.isArray(value.pdos)
    ? value.pdos.map((item) => {
        const pdo = record(item) ?? {};
        const consumerNodeIds = Array.isArray(pdo.consumer_node_ids)
          ? pdo.consumer_node_ids
              .map(numeric)
              .filter((id): id is number => id !== undefined)
          : [];
        const producerNodeId = numeric(pdo.producer_node_id);
        const pdoNumber = numeric(pdo.pdo_number);
        const consumerPdoNumber = numeric(pdo.consumer_pdo_number);
        const transmissionType = numeric(pdo.transmission_type);
        const sourceIndex = numeric(pdo.source_index);
        return {
          key: String(pdo.key ?? ''),
          direction: String(pdo.direction ?? ''),
          pdo_type: String(pdo.pdo_type ?? ''),
          cob_id: numeric(pdo.cob_id) ?? 0,
          cob_id_mode: String(pdo.cob_id_mode ?? ''),
          frame_type: numeric(pdo.frame_type) ?? 0,
          ...(producerNodeId !== undefined ? { producer_node_id: producerNodeId } : {}),
          consumer_node_ids: consumerNodeIds,
          ...(pdoNumber !== undefined ? { pdo_number: pdoNumber } : {}),
          ...(consumerPdoNumber !== undefined ? { consumer_pdo_number: consumerPdoNumber } : {}),
          ...(transmissionType !== undefined ? { transmission_type: transmissionType } : {}),
          ...(typeof pdo.source_section === 'string' ? { source_section: pdo.source_section } : {}),
          ...(sourceIndex !== undefined ? { source_index: sourceIndex } : {}),
        };
      })
    : [];

  return {
    schema_version: numeric(value.schema_version) ?? 0,
    nodes,
    pdos,
  };
}

function defaultPdoCobId(pdo: Pick<CanOpenPdoDocument, 'pdo_type' | 'pdo_number' | 'producer_node_id'>) {
  if (!pdo.pdo_number || !pdo.producer_node_id) return undefined;
  const base = pdo.pdo_type === 'tpdo' ? 0x180 : 0x200;
  return base + (pdo.pdo_number - 1) * 0x100 + pdo.producer_node_id;
}

function validateCanopen(document: unknown, config: CanOpenProjectDocument): string[] {
  const errors: string[] = [];
  if (config.schema_version !== 1) {
    errors.push(`schema_version 必须为 1，当前为 ${config.schema_version || '空值'}`);
  }

  const nodeIds = new Set<number>();
  const sdoIds = new Set<number>();
  config.nodes.forEach((node, index) => {
    const label = `节点 ${index + 1}`;
    if (!Number.isInteger(node.node_id) || node.node_id < 1 || node.node_id > 127) {
      errors.push(`${label}的 node_id 必须在 1..127 内`);
    } else if (nodeIds.has(node.node_id)) {
      errors.push(`node_id ${node.node_id} 重复`);
    } else {
      nodeIds.add(node.node_id);
    }
    if (!node.name.trim()) errors.push(`${label}缺少名称`);
    if (!node.role.trim()) errors.push(`${label}缺少 role`);

    if (node.sdo) {
      const sdoLabel = `节点 ${node.node_id || index + 1} SDO`;
      if (!['default', 'explicit'].includes(node.sdo.cob_id_mode)) {
        errors.push(`${sdoLabel}的 cob_id_mode 无效`);
      }
      [node.sdo.client_to_server_cob_id, node.sdo.server_to_client_cob_id].forEach((id) => {
        if (!Number.isInteger(id) || id < 0 || id > 0x7ff) {
          errors.push(`${sdoLabel}的 COB-ID 必须在标准帧范围内`);
        } else if (sdoIds.has(id)) {
          errors.push(`${sdoLabel}的 COB-ID 0x${id.toString(16).toUpperCase()} 重复`);
        } else {
          sdoIds.add(id);
        }
      });
      if (
        node.sdo.cob_id_mode === 'default' &&
        (node.sdo.client_to_server_cob_id !== 0x600 + node.node_id ||
          node.sdo.server_to_client_cob_id !== 0x580 + node.node_id)
      ) {
        errors.push(`${sdoLabel}使用默认模式时必须为 0x600/0x580 + node_id`);
      }
    }
  });

  const pdoKeys = new Set<string>();
  const pdoIds = new Set<string>();
  const endpointNumbers = new Set<string>();
  config.pdos.forEach((pdo, index) => {
    const label = `PDO ${pdo.key || index + 1}`;
    if (!pdo.key.trim()) errors.push(`PDO ${index + 1} 缺少 key`);
    else if (pdoKeys.has(pdo.key)) errors.push(`PDO key ${pdo.key} 重复`);
    else pdoKeys.add(pdo.key);
    if (!['receive', 'send'].includes(pdo.direction)) errors.push(`${label}的 direction 无效`);
    if (!['tpdo', 'rpdo'].includes(pdo.pdo_type)) errors.push(`${label}的 pdo_type 无效`);
    if (!['default', 'explicit'].includes(pdo.cob_id_mode)) errors.push(`${label}的 cob_id_mode 无效`);
    const maxCobId = pdo.frame_type === 0 ? 0x7ff : 0x1fffffff;
    if (
      ![0, 1].includes(pdo.frame_type) ||
      !Number.isInteger(pdo.cob_id) ||
      pdo.cob_id < 0 ||
      pdo.cob_id > maxCobId
    ) {
      errors.push(`${label}的 COB-ID/frame_type 无效`);
    }
    const pdoIdentity = `${pdo.cob_id}/${pdo.frame_type}`;
    if (pdoIds.has(pdoIdentity)) errors.push(`${label}的 COB-ID 与其他 PDO 重复`);
    else pdoIds.add(pdoIdentity);
    if (sdoIds.has(pdo.cob_id) && pdo.frame_type === 0) errors.push(`${label}的 COB-ID 与 SDO 通道重复`);
    if (pdo.producer_node_id !== undefined && !nodeIds.has(pdo.producer_node_id)) {
      errors.push(`${label}引用了不存在的 producer_node_id ${pdo.producer_node_id}`);
    }
    if (pdo.producer_node_id !== undefined && pdo.pdo_type !== 'tpdo') {
      errors.push(`${label}指定生产者时 pdo_type 必须为 tpdo`);
    }
    pdo.consumer_node_ids.forEach((nodeId) => {
      if (!nodeIds.has(nodeId)) errors.push(`${label}引用了不存在的 consumer_node_id ${nodeId}`);
    });
    if (pdo.pdo_number !== undefined) {
      if (!Number.isInteger(pdo.pdo_number) || pdo.pdo_number < 1 || pdo.pdo_number > 4) {
        errors.push(`${label}的 pdo_number 必须在 1..4 内`);
      } else if (pdo.producer_node_id !== undefined) {
        const endpoint = `${pdo.producer_node_id}/tpdo/${pdo.pdo_number}`;
        if (endpointNumbers.has(endpoint)) errors.push(`${label}与生产者端 PDO 编号重复`);
        else endpointNumbers.add(endpoint);
      }
    }
    if (pdo.consumer_pdo_number !== undefined) {
      if (!Number.isInteger(pdo.consumer_pdo_number) || pdo.consumer_pdo_number < 1 || pdo.consumer_pdo_number > 4) {
        errors.push(`${label}的 consumer_pdo_number 必须在 1..4 内`);
      } else if (pdo.consumer_node_ids.length === 0) {
        errors.push(`${label}声明 consumer_pdo_number 时必须至少有一个消费者`);
      }
    }
    const consumerNumber = pdo.consumer_pdo_number ?? pdo.pdo_number;
    if (consumerNumber !== undefined) {
      pdo.consumer_node_ids.forEach((nodeId) => {
        const endpoint = `${nodeId}/rpdo/${consumerNumber}`;
        if (endpointNumbers.has(endpoint)) errors.push(`${label}与消费者端 PDO 编号重复`);
        else endpointNumbers.add(endpoint);
      });
    }
    if (pdo.cob_id_mode === 'default') {
      const expected = defaultPdoCobId(pdo);
      if (expected === undefined) errors.push(`${label}使用默认 COB-ID 时必须有生产者和 pdo_number`);
      else if (pdo.cob_id !== expected) errors.push(`${label}的默认 COB-ID 应为 0x${expected.toString(16).toUpperCase()}`);
    }
    if (
      pdo.transmission_type !== undefined &&
      !(
        (pdo.transmission_type >= 0 && pdo.transmission_type <= 240) ||
        pdo.transmission_type === 254 ||
        pdo.transmission_type === 255
      )
    ) {
      errors.push(`${label}的 transmission_type 无效`);
    }
    if (!pdo.source_section || pdo.source_index === undefined) {
      errors.push(`${label}必须绑定 source_section/source_index`);
    } else if (!['pdo_recv', 'pdo_send'].includes(pdo.source_section)) {
      errors.push(`${label}的 source_section 无效`);
    } else {
      const expectedSection = pdo.direction === 'receive' ? 'pdo_recv' : 'pdo_send';
      if (pdo.source_section !== expectedSection) {
        errors.push(`${label}的 source_section 与 direction 不一致`);
      }
      const source = sourceValue(document, pdo.source_section, pdo.source_index);
      if (!source) errors.push(`${label}的源表索引不存在`);
      else if (sourceCobId(source) !== pdo.cob_id || sourceFrameType(source) !== pdo.frame_type) {
        errors.push(`${label}的 COB-ID/frame_type 与源表不一致`);
      }
    }
  });

  return errors;
}

function formatHex(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
}

export function CanopenExportPage({ loadedProject, onUpdateDocument, onUpdateSections }: CanopenExportPageProps) {
  const { t } = useTranslation();
  const canopenExport = useCanopenExport(loadedProject);
  const report = canopenExport.report;
  const document = loadedProject?.document;
  const isJc002 = record(document)?.config_version === 'jc002';
  const controllerProtocol = isJc002
    ? activeControllerProtocolProfile(document)?.protocol
    : record(document);
  const config = readCanopen(controllerProtocol);
  const errors = config ? validateCanopen(controllerProtocol, config) : [];
  const [nodeIdDisplayBase, setNodeIdDisplayBase] =
    useState<NodeIdDisplayBase>(readNodeIdDisplayBase);
  const [nodeIdDrafts, setNodeIdDrafts] = useState<Record<number, string>>({});
  const [consumerNodeIdsDrafts, setConsumerNodeIdsDrafts] = useState<Record<number, string>>({});

  function changeNodeIdDisplayBase(nextBase: NodeIdDisplayBase) {
    setNodeIdDisplayBase(nextBase);
    setNodeIdDrafts({});
    setConsumerNodeIdsDrafts({});
    try {
      window.localStorage.setItem(nodeIdDisplayStorageKey, nextBase);
    } catch {
      // Display preferences are optional when local storage is unavailable.
    }
  }

  function updateConfig(next: CanOpenProjectDocument) {
    if (!isJc002) return;
    onUpdateDocument('canopen', next);
  }

  function updateNode(index: number, patch: Partial<CanOpenNodeDocument>) {
    if (!config) return;
    const previous = config.nodes[index];
    const nextNode = { ...previous, ...patch };
    if (patch.node_id !== undefined && previous.sdo?.cob_id_mode === 'default') {
      nextNode.sdo = {
        ...previous.sdo,
        client_to_server_cob_id: 0x600 + patch.node_id,
        server_to_client_cob_id: 0x580 + patch.node_id,
      };
    }
    const nextNodeId = patch.node_id;
    const nextPdos =
      nextNodeId === undefined || nextNodeId === previous.node_id
        ? config.pdos
        : config.pdos.map((pdo) => {
            const nextPdo = {
              ...pdo,
              ...(pdo.producer_node_id === previous.node_id
                ? { producer_node_id: nextNodeId }
                : {}),
              consumer_node_ids: pdo.consumer_node_ids.map((id) =>
                id === previous.node_id ? nextNodeId : id,
              ),
            };
            if (pdo.producer_node_id === previous.node_id && pdo.cob_id_mode === 'default') {
              nextPdo.cob_id = defaultPdoCobId(nextPdo) ?? nextPdo.cob_id;
            }
            return nextPdo;
          });
    updateConfig({
      ...config,
      nodes: config.nodes.map((node, nodeIndex) => (nodeIndex === index ? nextNode : node)),
      pdos: nextPdos,
    });
  }

  function updateNodeSdo(index: number, patch: Partial<CanOpenSdoChannelDocument>) {
    if (!config) return;
    const node = config.nodes[index];
    if (!node.sdo) return;
    updateNode(index, { sdo: { ...node.sdo, ...patch } });
  }

  function removeNode(index: number) {
    if (!config) return;
    const removedId = config.nodes[index]?.node_id;
    if (removedId === undefined) return;
    updateConfig({
      ...config,
      nodes: config.nodes.filter((_, nodeIndex) => nodeIndex !== index),
      pdos: config.pdos.map((pdo) => ({
        ...pdo,
        ...(pdo.producer_node_id === removedId ? { producer_node_id: undefined } : {}),
        consumer_node_ids: pdo.consumer_node_ids.filter((nodeId) => nodeId !== removedId),
      })),
    });
  }

  function addNode() {
    if (!config) return;
    const used = new Set(config.nodes.map((node) => node.node_id));
    const nodeId = Array.from({ length: 127 }, (_, index) => index + 1).find((id) => !used.has(id));
    if (!nodeId) return;
    updateConfig({
      ...config,
      nodes: [
        ...config.nodes,
        {
          node_id: nodeId,
          name: `Node ${nodeId}`,
          role: 'remote',
          sdo: {
            cob_id_mode: 'default',
            client_to_server_cob_id: 0x600 + nodeId,
            server_to_client_cob_id: 0x580 + nodeId,
          },
        },
      ],
    });
  }

  function updatePdo(index: number, patch: Partial<CanOpenPdoDocument>) {
    if (!config) return;
    const previous = config.pdos[index];
    const nextPdo = { ...previous, ...patch };
    if (patch.direction !== undefined && patch.direction !== previous.direction) {
      nextPdo.source_section = patch.direction === 'receive' ? 'pdo_recv' : 'pdo_send';
    }
    if (nextPdo.cob_id_mode === 'default') {
      nextPdo.cob_id = defaultPdoCobId(nextPdo) ?? nextPdo.cob_id;
    }
    updateConfig({
      ...config,
      pdos: config.pdos.map((pdo, pdoIndex) => (pdoIndex === index ? nextPdo : pdo)),
    });
  }

  function removePdo(index: number) {
    if (!config) return;
    setConsumerNodeIdsDrafts({});
    updateConfig({ ...config, pdos: config.pdos.filter((_, pdoIndex) => pdoIndex !== index) });
  }

  function addPdo() {
    if (!config) return;
    const usedKeys = new Set(config.pdos.map((pdo) => pdo.key));
    let suffix = config.pdos.length + 1;
    while (usedKeys.has(`pdo_${suffix}`)) suffix += 1;
    const sourceSection = sourceCount(controllerProtocol, 'pdo_recv') > 0 ? 'pdo_recv' : 'pdo_send';
    const source = sourceValue(controllerProtocol, sourceSection, 0);
    updateConfig({
      ...config,
      pdos: [
        ...config.pdos,
        {
          key: `pdo_${suffix}`,
          direction: sourceSection === 'pdo_recv' ? 'receive' : 'send',
          pdo_type: 'tpdo',
          cob_id: source ? sourceCobId(source) ?? 0 : 0,
          cob_id_mode: 'explicit',
          frame_type: source ? sourceFrameType(source) : 0,
          consumer_node_ids: [],
          source_section: sourceSection,
          source_index: 0,
        },
      ],
    });
  }

  return (
    <section className="project-open-card canopen-page">
      <div className="config-table-toolbar canopen-page-header">
        <div>
          <h2>{t('canopenExport.title')}</h2>
          <p>{t('canopenExport.description')}</p>
        </div>
        <div className="sample-actions">
          <button
            disabled={!loadedProject || !isJc002 || !config || errors.length > 0 || canopenExport.isExporting}
            onClick={() => void canopenExport.exportPackage()}
            title={t('canopenExport.exportPackage')}
            type="button"
          >
            <Download aria-hidden="true" size={15} />
            {t(canopenExport.isExporting ? 'common.status.exporting' : 'canopenExport.exportPackage')}
          </button>
          {canopenExport.exportDir ? (
            <button onClick={() => void canopenExport.openExportDir()} type="button">
              <FolderOpen aria-hidden="true" size={15} />
              {t('canopenExport.openDirectory')}
            </button>
          ) : null}
        </div>
      </div>

      {loadedProject && isJc002 ? (
        <ProtocolProfileBar
          document={document}
          onUpdateSections={onUpdateSections}
          scope="controller"
        />
      ) : null}

      {!loadedProject ? (
        <EmptyState icon={FileCode2}>{t('canopenExport.openProjectPageFirst')}</EmptyState>
      ) : !isJc002 ? (
        <div className="canopen-version-warning" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>{t('canopenExport.jc002OnlyTitle')}</strong>
            <p>{t('canopenExport.jc002OnlyDescription')}</p>
          </div>
        </div>
      ) : !config ? (
        <div className="canopen-version-warning" role="status">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>{t('canopenExport.missingConfigTitle')}</strong>
            <p>{t('canopenExport.missingConfigDescription')}</p>
            <button className="canopen-inline-button" onClick={() => updateConfig(EMPTY_CANOPEN)} type="button">
              <Plus aria-hidden="true" size={15} />
              {t('canopenExport.initializeConfig')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="canopen-version-bar">
            <div>
              <span>{t('canopenExport.configVersion')}</span>
              <strong>JCPro V2 / jc002</strong>
            </div>
            <div>
              <span>{t('canopenExport.schemaVersion')}</span>
              <strong>CANopen schema {config.schema_version}</strong>
            </div>
            <div>
              <span>{t('canopenExport.orderingRule')}</span>
              <strong>{t('canopenExport.stableOrdering')}</strong>
            </div>
          </div>

          <div className="config-summary-strip canopen-summary-strip">
            <article>
              <span>{t('canopenExport.nodes')}</span>
              <strong>{config.nodes.length}</strong>
            </article>
            <article>
              <span>{t('canopenExport.sdoChannels')}</span>
              <strong>{config.nodes.filter((node) => node.sdo).length}</strong>
            </article>
            <article>
              <span>{t('canopenExport.pdoDefinitions')}</span>
              <strong>{config.pdos.length}</strong>
            </article>
            <article>
              <span>{t('canopenExport.explicitCobIds')}</span>
              <strong>
                {config.pdos.filter((pdo) => pdo.cob_id_mode === 'explicit').length +
                  config.nodes.filter((node) => node.sdo?.cob_id_mode === 'explicit').length}
              </strong>
            </article>
          </div>

          {errors.length > 0 ? (
            <div aria-live="polite" className="project-open-error canopen-validation" role="alert">
              <strong>{t('canopenExport.validationFailed')}</strong>
              <ul>
                {errors.slice(0, 10).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
              {errors.length > 10 ? (
                <p>{t('canopenExport.moreValidationErrors', { count: errors.length - 10 })}</p>
              ) : null}
            </div>
          ) : (
            <p className="canopen-validation-success" role="status">
              <CheckCircle2 aria-hidden="true" size={16} />
              {t('canopenExport.validationPassed')}
            </p>
          )}

          <section className="pdo-frame-section canopen-editor-section">
            <div className="config-table-toolbar">
              <div>
                <strong>{t('canopenExport.nodeConfiguration')}</strong>
                <p className="config-helper-text">{t('canopenExport.nodeConfigurationHint')}</p>
              </div>
              <div className="canopen-node-toolbar-actions">
                <fieldset
                  aria-label={t('canopenExport.nodeIdDisplay')}
                  className="canopen-node-id-display"
                >
                  <legend>{t('canopenExport.nodeIdDisplay')}</legend>
                  <div className="canopen-segmented-control">
                    <button
                      aria-pressed={nodeIdDisplayBase === 'decimal'}
                      className={nodeIdDisplayBase === 'decimal' ? 'active' : ''}
                      onClick={() => changeNodeIdDisplayBase('decimal')}
                      type="button"
                    >
                      {t('canopenExport.nodeIdDecimal')}
                    </button>
                    <button
                      aria-pressed={nodeIdDisplayBase === 'hexadecimal'}
                      className={nodeIdDisplayBase === 'hexadecimal' ? 'active' : ''}
                      onClick={() => changeNodeIdDisplayBase('hexadecimal')}
                      type="button"
                    >
                      {t('canopenExport.nodeIdHexadecimal')}
                    </button>
                  </div>
                </fieldset>
                <button onClick={addNode} type="button">
                  <Plus aria-hidden="true" size={15} />
                  {t('canopenExport.addNode')}
                </button>
              </div>
            </div>
            {config.nodes.length === 0 ? (
              <EmptyState icon={FileArchive}>{t('canopenExport.noNodes')}</EmptyState>
            ) : (
              <div className="canopen-editor-list">
                {config.nodes.map((node, index) => (
                  <article className="pdo-frame-card canopen-node-card" key={`${node.node_id}-${node.name}`}>
                    <div className="canopen-card-header">
                      <div>
                        <span className="canopen-card-index">
                          Node {index + 1} · {formatNodeId(node.node_id, nodeIdDisplayBase)}
                        </span>
                        <strong>{node.name || t('canopenExport.unnamedNode')}</strong>
                      </div>
                      <button
                        aria-label={t('canopenExport.removeNode')}
                        className="canopen-danger-button"
                        onClick={() => removeNode(index)}
                        title={t('canopenExport.removeNode')}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    </div>
                    <div className="canopen-editor-grid canopen-node-grid">
                      <label>
                        {t('canopenExport.nodeId')}
                        <input
                          inputMode={nodeIdDisplayBase === 'decimal' ? 'numeric' : 'text'}
                          onBlur={() =>
                            setNodeIdDrafts((drafts) => {
                              const nextDrafts = { ...drafts };
                              delete nextDrafts[index];
                              return nextDrafts;
                            })
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setNodeIdDrafts((drafts) => ({ ...drafts, [index]: value }));
                            const parsed = parseNodeId(value, nodeIdDisplayBase);
                            if (parsed === undefined) return;
                            updateNode(index, { node_id: parsed });
                            setNodeIdDrafts((drafts) => ({
                              ...drafts,
                              [index]: formatNodeId(parsed, nodeIdDisplayBase),
                            }));
                          }}
                          placeholder={
                            nodeIdDisplayBase === 'hexadecimal'
                              ? t('canopenExport.nodeIdHexadecimalPlaceholder')
                              : t('canopenExport.nodeIdDecimalPlaceholder')
                          }
                          type="text"
                          value={nodeIdDrafts[index] ?? formatNodeId(node.node_id, nodeIdDisplayBase)}
                        />
                      </label>
                      <label>
                        {t('canopenExport.nodeName')}
                        <input
                          onChange={(event) => updateNode(index, { name: event.target.value })}
                          type="text"
                          value={node.name}
                        />
                      </label>
                      <label>
                        {t('canopenExport.nodeRole')}
                        <select
                          onChange={(event) => updateNode(index, { role: event.target.value })}
                          value={node.role}
                        >
                          <option value="local">local</option>
                          <option value="remote">remote</option>
                        </select>
                      </label>
                      <label className="canopen-checkbox-field">
                        <span>{t('canopenExport.sdoChannel')}</span>
                        <input
                          checked={Boolean(node.sdo)}
                          onChange={(event) => {
                            const nodeId = node.node_id || 0;
                            updateNode(index, {
                              sdo: event.target.checked
                                ? {
                                    cob_id_mode: 'default',
                                    client_to_server_cob_id: 0x600 + nodeId,
                                    server_to_client_cob_id: 0x580 + nodeId,
                                  }
                                : undefined,
                            });
                          }}
                          type="checkbox"
                        />
                      </label>
                    </div>
                    {node.sdo ? (
                      <div className="canopen-sdo-grid">
                        <label>
                          {t('canopenExport.cobIdMode')}
                          <select
                            onChange={(event) => updateNodeSdo(index, { cob_id_mode: event.target.value })}
                            value={node.sdo.cob_id_mode}
                          >
                            <option value="default">default</option>
                            <option value="explicit">explicit</option>
                          </select>
                        </label>
                        <label>
                          {t('canopenExport.sdoClientCobId')}
                          <input
                            onChange={(event) =>
                              updateNodeSdo(index, {
                                client_to_server_cob_id: numeric(event.target.value) ?? 0,
                              })
                            }
                            type="text"
                            value={cobIdText(node.sdo.client_to_server_cob_id)}
                          />
                        </label>
                        <label>
                          {t('canopenExport.sdoServerCobId')}
                          <input
                            onChange={(event) =>
                              updateNodeSdo(index, {
                                server_to_client_cob_id: numeric(event.target.value) ?? 0,
                              })
                            }
                            type="text"
                            value={cobIdText(node.sdo.server_to_client_cob_id)}
                          />
                        </label>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="pdo-frame-section canopen-editor-section">
            <div className="config-table-toolbar">
              <div>
                <strong>{t('canopenExport.pdoConfiguration')}</strong>
                <p className="config-helper-text">{t('canopenExport.pdoConfigurationHint')}</p>
              </div>
              <button onClick={addPdo} type="button">
                <Plus aria-hidden="true" size={15} />
                {t('canopenExport.addPdo')}
              </button>
            </div>
            {config.pdos.length === 0 ? (
              <EmptyState icon={FileArchive}>{t('canopenExport.noPdos')}</EmptyState>
            ) : (
              <div className="canopen-editor-list">
                {config.pdos.map((pdo, index) => (
                  <article className="pdo-frame-card canopen-pdo-card" key={`${pdo.key}-${pdo.cob_id}-${pdo.frame_type}`}>
                    <div className="canopen-card-header">
                      <div>
                        <span className="canopen-card-index">PDO {index + 1}</span>
                        <strong>{pdo.key || t('canopenExport.unnamedPdo')}</strong>
                      </div>
                      <button
                        aria-label={t('canopenExport.removePdo')}
                        className="canopen-danger-button"
                        onClick={() => removePdo(index)}
                        title={t('canopenExport.removePdo')}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    </div>
                    <div className="canopen-editor-grid canopen-pdo-grid">
                      <label className="canopen-field-wide">
                        {t('canopenExport.pdoKey')}
                        <input
                          onChange={(event) => updatePdo(index, { key: event.target.value })}
                          type="text"
                          value={pdo.key}
                        />
                      </label>
                      <label>
                        {t('canopenExport.direction')}
                        <select
                          onChange={(event) => updatePdo(index, { direction: event.target.value })}
                          value={pdo.direction}
                        >
                          <option value="receive">receive</option>
                          <option value="send">send</option>
                        </select>
                      </label>
                      <label>
                        {t('canopenExport.pdoType')}
                        <select
                          onChange={(event) => updatePdo(index, { pdo_type: event.target.value })}
                          value={pdo.pdo_type}
                        >
                          <option value="tpdo">tpdo</option>
                          <option value="rpdo">rpdo</option>
                        </select>
                      </label>
                      <label>
                        {t('canopenExport.cobId')}
                        <input
                          onChange={(event) => updatePdo(index, { cob_id: numeric(event.target.value) ?? 0 })}
                          type="text"
                          value={cobIdText(pdo.cob_id)}
                        />
                      </label>
                      <label>
                        {t('canopenExport.cobIdMode')}
                        <select
                          onChange={(event) => updatePdo(index, { cob_id_mode: event.target.value })}
                          value={pdo.cob_id_mode}
                        >
                          <option value="default">default</option>
                          <option value="explicit">explicit</option>
                        </select>
                      </label>
                      <label>
                        {t('canopenExport.frameType')}
                        <select
                          onChange={(event) => updatePdo(index, { frame_type: numeric(event.target.value) ?? 0 })}
                          value={pdo.frame_type}
                        >
                          <option value={0}>standard (11-bit)</option>
                          <option value={1}>extended (29-bit)</option>
                        </select>
                      </label>
                      <label>
                        {t('canopenExport.producerNode')}
                        <select
                          onChange={(event) =>
                            updatePdo(index, { producer_node_id: optionalNumeric(event.target.value) })
                          }
                          value={pdo.producer_node_id ?? ''}
                        >
                          <option value="">-</option>
                          {config.nodes.map((node) => (
                            <option key={node.node_id} value={node.node_id}>
                              {formatNodeId(node.node_id, nodeIdDisplayBase)} ·{' '}
                              {node.name || t('canopenExport.unnamedNode')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="canopen-field-wide">
                        {t('canopenExport.consumerNodes')}
                        <input
                          onBlur={() =>
                            setConsumerNodeIdsDrafts((drafts) => {
                              const nextDrafts = { ...drafts };
                              delete nextDrafts[index];
                              return nextDrafts;
                            })
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            setConsumerNodeIdsDrafts((drafts) => ({ ...drafts, [index]: value }));
                            updatePdo(index, {
                              consumer_node_ids: parseNodeIds(value, nodeIdDisplayBase),
                            });
                          }}
                          placeholder={
                            nodeIdDisplayBase === 'hexadecimal'
                              ? t('canopenExport.consumerNodesHexadecimalPlaceholder')
                              : t('canopenExport.consumerNodesPlaceholder')
                          }
                          type="text"
                          value={
                            consumerNodeIdsDrafts[index] ??
                            formatNodeIds(pdo.consumer_node_ids, nodeIdDisplayBase)
                          }
                        />
                      </label>
                      <label>
                        {t('canopenExport.producerPdoNumber')}
                        <input
                          min={1}
                          max={4}
                          onChange={(event) =>
                            updatePdo(index, { pdo_number: optionalNumeric(event.target.value) })
                          }
                          type="number"
                          value={pdo.pdo_number ?? ''}
                        />
                      </label>
                      <label>
                        {t('canopenExport.consumerPdoNumber')}
                        <input
                          min={1}
                          max={4}
                          onChange={(event) =>
                            updatePdo(index, { consumer_pdo_number: optionalNumeric(event.target.value) })
                          }
                          type="number"
                          value={pdo.consumer_pdo_number ?? ''}
                        />
                      </label>
                      <label>
                        {t('canopenExport.transmissionType')}
                        <input
                          min={0}
                          max={255}
                          onChange={(event) =>
                            updatePdo(index, { transmission_type: optionalNumeric(event.target.value) })
                          }
                          type="number"
                          value={pdo.transmission_type ?? ''}
                        />
                      </label>
                      <label>
                        {t('canopenExport.sourceSection')}
                        <select
                          onChange={(event) => updatePdo(index, { source_section: event.target.value })}
                          value={pdo.source_section ?? ''}
                        >
                          <option value="pdo_recv">pdo_recv</option>
                          <option value="pdo_send">pdo_send</option>
                        </select>
                      </label>
                      <label>
                        {t('canopenExport.sourceIndex')}
                        <input
                          min={0}
                          onChange={(event) => updatePdo(index, { source_index: optionalNumeric(event.target.value) })}
                          type="number"
                          value={pdo.source_index ?? ''}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="project-open-report">
            <article>
              <span>{t('canopenExport.firmwareProtocol')}</span>
              <strong>{t('canopenExport.jc002Runtime')}</strong>
            </article>
            <article>
              <span>{t('canopenExport.sdoRequestRule')}</span>
              <strong>
                {config.nodes.filter((node) => node.sdo?.cob_id_mode === 'default').length} default /{' '}
                {config.nodes.filter((node) => node.sdo?.cob_id_mode === 'explicit').length} explicit
              </strong>
            </article>
            <article>
              <span>{t('canopenExport.exportDirectory')}</span>
              <strong>{canopenExport.exportDir ?? t('canopenExport.notExported')}</strong>
            </article>
            <article>
              <span>{t('canopenExport.outputFiles')}</span>
              <strong>{report?.files.length ?? 0}</strong>
            </article>
          </div>

          <div className="config-summary-strip" style={{ marginTop: 8 }}>
            <article>
              <span>{t('canopenExport.nodes')}</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>{t('canopenExport.edsFiles')}</span>
              <strong>{report?.nodes.length ?? 0}</strong>
            </article>
            <article>
              <span>{t('canopenExport.pdoCount')}</span>
              <strong>{report?.nodes.reduce((total, node) => total + node.pdoCount, 0) ?? 0}</strong>
            </article>
            <article>
              <span>{t('canopenExport.bitfieldMappings')}</span>
              <strong>
                {report?.nodes.reduce((total, node) => total + node.bitfieldCount, 0) ?? 0}
              </strong>
            </article>
            <article>
              <span>{t('canopenExport.conversionWarnings')}</span>
              <strong>{report?.warnings.length ?? 0}</strong>
            </article>
          </div>

          {canopenExport.status ? (
            <p
              aria-live="polite"
              className={canopenExport.statusTone === 'success' ? 'text-success' : 'project-open-error'}
              role="status"
            >
              {canopenExport.status}
            </p>
          ) : null}
          {report && report.nodes.length > 0 ? (
            <section className="pdo-frame-section">
              <div className="config-table-toolbar">
                <strong>{t('canopenExport.nodeSummary')}</strong>
              </div>
              <div className="config-table-frame">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Node-ID</th>
                      <th>{t('canopenExport.sdoRequestCobId')}</th>
                      <th>{t('canopenExport.sdoResponseCobId')}</th>
                      <th>{t('canopenExport.objectCount')}</th>
                      <th>{t('canopenExport.pdoCount')}</th>
                      <th>{t('canopenExport.bitfieldExtensions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.nodes.map((node) => (
                      <tr key={node.nodeId}>
                        <td>{node.nodeId}</td>
                        <td><code>{formatHex(node.sdoRxCobId)}</code></td>
                        <td><code>{formatHex(node.sdoTxCobId)}</code></td>
                        <td>{node.objectCount}</td>
                        <td>{node.pdoCount}</td>
                        <td>{node.bitfieldCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <EmptyState icon={FileArchive}>{t('canopenExport.emptyReport')}</EmptyState>
          )}
          {report && report.warnings.length > 0 ? (
            <div aria-live="polite" className="project-open-error" role="status">
              {report.warnings.slice(0, 5).map((warning) => <p key={warning}>{warning}</p>)}
              {report.warnings.length > 5 ? (
                <p>{t('canopenExport.moreWarnings', { count: report.warnings.length - 5 })}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
