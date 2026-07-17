import { open, save } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  flattenUnifiedProtocolDocument,
  loadJsonFile,
  parseUnifiedProtocolProject,
  saveJsonFile,
} from '../../api/commands';
import { shouldRefreshUnifiedProtocol } from '../../modules/documentSections';
import type {
  NavigationKey,
  PrivateFrame,
  PrivatePayloadSignal,
  ProtocolMapping,
  ProtocolMappingTarget,
  SignalDefinition,
  SignalDictionary,
  UnifiedProtocolModel,
} from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';

interface UseProtocolEditorOptions {
  activeModuleKey: NavigationKey;
  document: unknown | null;
  projectPath?: string;
  updateProjectDocument: (section: string, value: unknown) => void;
  updateProjectSections: (sections: Record<string, unknown>) => void;
  applyDocument: (document: unknown) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useProtocolEditor({
  activeModuleKey,
  document,
  projectPath,
  updateProjectDocument,
  updateProjectSections,
  applyDocument,
}: UseProtocolEditorOptions) {
  const [unifiedProtocol, setUnifiedProtocol] = useState<UnifiedProtocolModel | null>(null);
  const [unifiedProtocolError, setUnifiedProtocolError] = useState<string | null>(null);
  const [isParsingUnifiedProtocol, setIsParsingUnifiedProtocol] = useState(false);
  const [protocolFlattenStatus, setProtocolFlattenStatus] = useState<string | null>(null);
  const [privateProtocolImportStatus, setPrivateProtocolImportStatus] = useState<string | null>(
    null,
  );
  const [isImportingPrivateProtocol, setIsImportingPrivateProtocol] = useState(false);
  const [privateProtocolExportStatus, setPrivateProtocolExportStatus] = useState<string | null>(
    null,
  );
  const [isExportingPrivateProtocol, setIsExportingPrivateProtocol] = useState(false);
  const refreshGenerationRef = useRef(0);
  const documentRef = useRef(document);
  const projectPathRef = useRef(projectPath);
  documentRef.current = document;
  projectPathRef.current = projectPath;

  const source = document as Record<string, unknown> | null;
  const signalDictionary =
    (source?.signal_dictionary as SignalDictionary | undefined) ?? ({ signals: [] } as const);
  const privateProtocol = (source?.private_protocol as
    | { enabled: boolean; frames: PrivateFrame[] }
    | undefined) ?? {
    enabled: false,
    frames: [],
  };
  const protocolMappings = (source?.protocol_mapping as ProtocolMapping[] | undefined) ?? [];

  useEffect(() => {
    projectPathRef.current = projectPath;
    refreshGenerationRef.current += 1;
    setUnifiedProtocol(null);
    setUnifiedProtocolError(null);
    setProtocolFlattenStatus(null);
    setPrivateProtocolImportStatus(null);
    setPrivateProtocolExportStatus(null);
    setIsParsingUnifiedProtocol(false);
  }, [projectPath]);

  const refreshUnifiedProtocol = useCallback(
    async (documentOverride?: unknown) => {
      const nextDocument = documentOverride ?? document;
      if (!nextDocument) return null;

      const generation = ++refreshGenerationRef.current;
      setIsParsingUnifiedProtocol(true);
      setUnifiedProtocolError(null);
      try {
        const report = await parseUnifiedProtocolProject(nextDocument);
        if (generation !== refreshGenerationRef.current) return null;
        setUnifiedProtocol(report);
        if (!report.validation.valid) {
          setUnifiedProtocolError(report.validation.errors.join('；') || '协议映射校验存在问题');
        }
        return report;
      } catch (error) {
        if (generation === refreshGenerationRef.current) {
          setUnifiedProtocolError(error instanceof Error ? error.message : String(error));
        }
        return null;
      } finally {
        if (generation === refreshGenerationRef.current) setIsParsingUnifiedProtocol(false);
      }
    },
    [document],
  );

  useEffect(() => {
    refreshGenerationRef.current += 1;
    setIsParsingUnifiedProtocol(false);
    if (!document) {
      setUnifiedProtocol(null);
      setUnifiedProtocolError(null);
      setIsParsingUnifiedProtocol(false);
      return;
    }
    if (!shouldRefreshUnifiedProtocol(activeModuleKey)) return;

    const timer = window.setTimeout(() => void refreshUnifiedProtocol(document), 180);
    return () => {
      window.clearTimeout(timer);
      refreshGenerationRef.current += 1;
    };
  }, [activeModuleKey, document, refreshUnifiedProtocol]);

  function updateSignalDictionary(next: SignalDictionary) {
    updateProjectDocument('signal_dictionary', next);
  }

  function updateSignalDefinition(
    index: number,
    updater: (signal: SignalDefinition) => SignalDefinition,
  ) {
    updateSignalDictionary({
      ...signalDictionary,
      signals: signalDictionary.signals.map((signal, currentIndex) =>
        currentIndex === index ? updater(signal) : signal,
      ),
    });
  }

  function addSignalDefinition() {
    const index = signalDictionary.signals.length + 1;
    updateSignalDictionary({
      ...signalDictionary,
      signals: [
        ...signalDictionary.signals,
        {
          signal_id: `CUSTOM_SIGNAL_${index}`,
          name: `新业务信号${index}`,
          data_type: 'u16',
          default_value: '0',
          min_value: '',
          max_value: '',
          inner: -1,
          scale: { scale_num: 1, scale_den: 1, offset: 0, decimals: 0 },
          display: { unit: '', format: 'decimal', description: '' },
        },
      ],
    });
  }

  function removeSignalDefinition(index: number) {
    updateSignalDictionary({
      ...signalDictionary,
      signals: signalDictionary.signals.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updatePrivateProtocol(next: { enabled: boolean; frames: PrivateFrame[] }) {
    updateProjectDocument('private_protocol', next);
  }

  function updatePrivateFrame(index: number, updater: (frame: PrivateFrame) => PrivateFrame) {
    updatePrivateProtocol({
      ...privateProtocol,
      frames: privateProtocol.frames.map((frame, currentIndex) =>
        currentIndex === index ? updater(frame) : frame,
      ),
    });
  }

  function addPrivateFrame() {
    const index = privateProtocol.frames.length + 1;
    updatePrivateProtocol({
      ...privateProtocol,
      enabled: true,
      frames: [
        ...privateProtocol.frames,
        {
          frame_id: 0,
          frame_key: `private_frame_${index}`,
          name: `新私有帧${index}`,
          frame_type: 'standard',
          cycle_ms: 100,
          checksum: 'none',
          byte_order: 'little',
          payload: [],
          source: 'manual',
        },
      ],
    });
  }

  function removePrivateFrame(index: number) {
    updatePrivateProtocol({
      ...privateProtocol,
      frames: privateProtocol.frames.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updatePrivatePayload(
    frameIndex: number,
    payloadIndex: number,
    updater: (payload: PrivatePayloadSignal) => PrivatePayloadSignal,
  ) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: frame.payload.map((payload, currentIndex) =>
        currentIndex === payloadIndex ? updater(payload) : payload,
      ),
    }));
  }

  function addPrivatePayload(frameIndex: number) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: [
        ...frame.payload,
        { signal_id: '', bit_offset: 0, bit_length: 8, byte_order: frame.byte_order || 'little' },
      ],
    }));
  }

  function removePrivatePayload(frameIndex: number, payloadIndex: number) {
    updatePrivateFrame(frameIndex, (frame) => ({
      ...frame,
      payload: frame.payload.filter((_, currentIndex) => currentIndex !== payloadIndex),
    }));
  }

  async function exportPrivateProtocol() {
    setPrivateProtocolExportStatus(null);
    if (!document) {
      setPrivateProtocolExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setPrivateProtocolExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '私有协议配置', extensions: ['json'] }] }),
      setPrivateProtocolExportStatus,
    );
    if (!selected) return;

    setIsExportingPrivateProtocol(true);
    try {
      await saveJsonFile(selected, privateProtocol);
      setPrivateProtocolExportStatus(`已导出：${selected}`);
    } catch (error) {
      setPrivateProtocolExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingPrivateProtocol(false);
    }
  }

  async function importPrivateProtocol() {
    setPrivateProtocolImportStatus(null);
    if (!document) {
      setPrivateProtocolImportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setPrivateProtocolImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const targetDocument = document;
    const targetProjectPath = projectPath;
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '私有协议配置', extensions: ['json'] }],
        }),
      setPrivateProtocolImportStatus,
    );
    if (typeof selected !== 'string') return;

    setIsImportingPrivateProtocol(true);
    try {
      const data = (await loadJsonFile(selected)) as { enabled: boolean; frames: PrivateFrame[] };
      if (targetDocument !== documentRef.current || targetProjectPath !== projectPathRef.current) {
        return;
      }
      if (!data || typeof data.enabled !== 'boolean' || !Array.isArray(data.frames)) {
        setPrivateProtocolImportStatus('无效的私有协议配置文件。');
        return;
      }
      updatePrivateProtocol(data);
      setPrivateProtocolImportStatus(`已导入 ${data.frames.length} 个私有帧`);
    } catch (error) {
      setPrivateProtocolImportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingPrivateProtocol(false);
    }
  }

  function updateProtocolMappings(next: ProtocolMapping[]) {
    updateProjectDocument('protocol_mapping', next);
  }

  function updateProtocolMapping(
    index: number,
    updater: (mapping: ProtocolMapping) => ProtocolMapping,
  ) {
    updateProtocolMappings(
      protocolMappings.map((mapping, currentIndex) =>
        currentIndex === index ? updater(mapping) : mapping,
      ),
    );
  }

  function addProtocolMapping(kind: ProtocolMappingTarget['kind'] = 'can_open_pdo') {
    const target: ProtocolMappingTarget =
      kind === 'can_open_sdo'
        ? { kind: 'can_open_sdo', index: 0, subindex: 0 }
        : kind === 'private_frame'
          ? { kind: 'private_frame', frame_key: '', frame_id: 0, bit_offset: 0, bit_length: 8 }
          : {
              kind: 'can_open_pdo',
              direction: 'receive',
              frame_id: 0,
              bit_offset: 0,
              bit_length: 8,
            };
    updateProtocolMappings([...protocolMappings, { signal_id: '', target }]);
  }

  function removeProtocolMapping(index: number) {
    updateProtocolMappings(protocolMappings.filter((_, currentIndex) => currentIndex !== index));
  }

  function restoreSignalDictionaryFromUnified() {
    if (unifiedProtocol) updateSignalDictionary(unifiedProtocol.signal_dictionary);
  }

  function restorePrivateProtocolFromUnified() {
    if (unifiedProtocol) updatePrivateProtocol(unifiedProtocol.private_protocol);
  }

  function applyUnifiedTopology() {
    if (!unifiedProtocol) return;
    updateProjectSections({
      signal_dictionary: unifiedProtocol.signal_dictionary,
      private_protocol: unifiedProtocol.private_protocol,
      protocol_mapping: unifiedProtocol.mappings,
    });
  }

  async function flattenUnifiedProtocol() {
    if (!document) return;
    const targetDocument = document;
    const targetProjectPath = projectPath;
    setProtocolFlattenStatus(null);
    setUnifiedProtocolError(null);
    try {
      const report = await flattenUnifiedProtocolDocument(targetDocument);
      if (targetDocument !== documentRef.current || targetProjectPath !== projectPathRef.current) {
        return;
      }
      if (!report.valid) {
        setUnifiedProtocolError(report.errors.join('；') || '生成旧版 PDO 段失败');
        return;
      }
      applyDocument(report.document);
      setProtocolFlattenStatus(`已更新：${report.updated_sections.join('、')}`);
      if (report.warnings.length > 0) setUnifiedProtocolError(report.warnings.join('；'));
      void refreshUnifiedProtocol(report.document);
    } catch (error) {
      setUnifiedProtocolError(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    loaded: Boolean(document),
    signalDictionary,
    privateProtocol,
    protocolMappings,
    unifiedProtocol,
    unifiedProtocolError,
    isParsingUnifiedProtocol,
    protocolFlattenStatus,
    privateProtocolImportStatus,
    isImportingPrivateProtocol,
    privateProtocolExportStatus,
    isExportingPrivateProtocol,
    refreshUnifiedProtocol,
    updateSignalDictionary,
    updateSignalDefinition,
    addSignalDefinition,
    removeSignalDefinition,
    updatePrivateProtocol,
    updatePrivateFrame,
    addPrivateFrame,
    removePrivateFrame,
    updatePrivatePayload,
    addPrivatePayload,
    removePrivatePayload,
    exportPrivateProtocol,
    importPrivateProtocol,
    updateProtocolMappings,
    updateProtocolMapping,
    addProtocolMapping,
    removeProtocolMapping,
    restoreSignalDictionaryFromUnified,
    restorePrivateProtocolFromUnified,
    applyUnifiedTopology,
    flattenUnifiedProtocol,
  };
}

export type ProtocolEditorController = ReturnType<typeof useProtocolEditor>;
