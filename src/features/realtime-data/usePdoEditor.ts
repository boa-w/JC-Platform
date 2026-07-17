import { useEffect, useRef, useState } from 'react';
import type {
  PdoAdvancedDocument,
  PdoAdvancedFrame,
  PdoAdvancedSignal,
  PdoCondition,
  PdoGlobalParam,
  PdoSimpleDocument,
  PdoSimpleFrameDocument,
  PdoSimpleSignalDocument,
} from '../../types/platform';

export type PdoDirection = 'pdo_recv' | 'pdo_send';
export type PdoEditorMode = 'simple' | 'advanced';

interface UsePdoEditorOptions {
  document: unknown | null;
  isActive: boolean;
  updateProjectDocument: (section: string, value: unknown) => void;
  updateProjectSections: (sections: Record<string, unknown>) => void;
}

export function formatFrameId(value: number) {
  return `0x${Math.max(0, value).toString(16).toUpperCase()}`;
}

export function formatFrameIdPadded(value: number, width = 3) {
  return `0x${Math.max(0, value).toString(16).toUpperCase().padStart(width, '0')}`;
}

export function parseFrameId(value: string) {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]*$/i.test(normalized)) return null;
  return normalized === '' ? 0 : Number.parseInt(normalized, 16);
}

export function usePdoEditor({
  document,
  isActive,
  updateProjectDocument,
  updateProjectSections,
}: UsePdoEditorOptions) {
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  const [selectedKind, setSelectedKind] = useState<PdoDirection>('pdo_recv');
  const [selectedSimpleFrameId, setSelectedSimpleFrameId] = useState<number | null>(null);
  const [mode, setMode] = useState<PdoEditorMode>('simple');
  const [selectedAdvancedFrameId, setSelectedAdvancedFrameId] = useState<number | null>(null);
  const jumpRowRef = useRef<HTMLTableRowElement | null>(null);

  const source = document as Record<string, unknown> | null;
  const simpleDocument = (source?.pdo_simple_send_recv as PdoSimpleDocument | undefined) ?? null;
  const advancedDocument: PdoAdvancedDocument | null = source
    ? {
        pdo_global_param: (source.pdo_global_param as PdoGlobalParam[] | undefined) ?? [],
        pdo_condition: (source.pdo_condition as PdoCondition[] | undefined) ?? [],
        pdo_recv: (source.pdo_recv as PdoAdvancedFrame[] | undefined) ?? [],
        pdo_send: (source.pdo_send as PdoAdvancedFrame[] | undefined) ?? [],
      }
    : null;

  const simpleFrames = (kind: PdoDirection) => simpleDocument?.[kind] ?? [];
  const advancedFrames = (kind: PdoDirection) => advancedDocument?.[kind] ?? [];
  const activeSimpleFrameIndex =
    selectedSimpleFrameId === null
      ? -1
      : simpleFrames(selectedKind).findIndex((frame) => frame.id === selectedSimpleFrameId);
  const activeSimpleFrame =
    activeSimpleFrameIndex < 0 ? null : simpleFrames(selectedKind)[activeSimpleFrameIndex];
  const activeAdvancedFrameIndex =
    selectedAdvancedFrameId === null
      ? -1
      : advancedFrames(selectedKind).findIndex((frame) => frame.id === selectedAdvancedFrameId);
  const activeAdvancedFrame =
    activeAdvancedFrameIndex < 0 ? null : advancedFrames(selectedKind)[activeAdvancedFrameIndex];

  useEffect(() => {
    if (isActive && mode === 'simple' && jumpTarget !== null) {
      jumpRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive, jumpTarget, mode]);

  function updateSimpleDocument(next: PdoSimpleDocument) {
    updateProjectDocument('pdo_simple_send_recv', next);
  }

  function updateAdvancedDocument(next: PdoAdvancedDocument) {
    updateProjectSections(next as unknown as Record<string, unknown>);
  }

  function selectKind(kind: PdoDirection) {
    setSelectedKind(kind);
    setSelectedSimpleFrameId(null);
    setSelectedAdvancedFrameId(null);
  }

  function focusPdoParam(pdoParamIndex: number) {
    setJumpTarget(pdoParamIndex);
    setMode('simple');
    setSelectedSimpleFrameId(null);
  }

  function updateSimpleFrame(
    kind: PdoDirection,
    index: number,
    field: keyof PdoSimpleFrameDocument,
    value: string | number,
  ) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: simpleDocument[kind].map((frame, currentIndex) =>
        currentIndex === index ? { ...frame, [field]: value } : frame,
      ),
    });
  }

  function updateSimpleFrameId(kind: PdoDirection, index: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updateSimpleFrame(kind, index, 'id', nextId);
  }

  function addSimpleFrame(kind: PdoDirection) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: [...simpleDocument[kind], { id: 0, type: 0, desc: '', data: [] }],
    });
  }

  function removeSimpleFrame(kind: PdoDirection, index: number) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: simpleDocument[kind].filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateSimpleSignal(
    kind: PdoDirection,
    frameIndex: number,
    signalIndex: number,
    field: keyof PdoSimpleSignalDocument,
    value: string | number,
  ) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: simpleDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: frame.data.map((signal, currentSignalIndex) =>
                currentSignalIndex === signalIndex ? { ...signal, [field]: value } : signal,
              ),
            }
          : frame,
      ),
    });
  }

  function addSimpleSignal(kind: PdoDirection, frameIndex: number) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: simpleDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: [
                ...frame.data,
                { pos: 0, len: 1, show_type: 0, pdo_param_index: 0, pdo_param_name: '' },
              ],
            }
          : frame,
      ),
    });
  }

  function removeSimpleSignal(kind: PdoDirection, frameIndex: number, signalIndex: number) {
    if (!simpleDocument) return;
    updateSimpleDocument({
      ...simpleDocument,
      [kind]: simpleDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: frame.data.filter(
                (_, currentSignalIndex) => currentSignalIndex !== signalIndex,
              ),
            }
          : frame,
      ),
    });
  }

  function updateGlobalParam(index: number, field: keyof PdoGlobalParam, value: string | number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_global_param: advancedDocument.pdo_global_param.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  }

  function addGlobalParam() {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_global_param: [
        ...advancedDocument.pdo_global_param,
        { param_id: '', name: '新全局变量', def: '0', reserved: 0, type: 0, inner: 0 },
      ],
    });
  }

  function removeGlobalParam(index: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_global_param: advancedDocument.pdo_global_param.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    });
  }

  function updateCondition(index: number, field: keyof PdoCondition, value: string | number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: advancedDocument.pdo_condition.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  }

  function addCondition() {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: [...advancedDocument.pdo_condition, { param_id: '', process: 0, data: [] }],
    });
  }

  function removeCondition(index: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: advancedDocument.pdo_condition.filter(
        (_, currentIndex) => currentIndex !== index,
      ),
    });
  }

  function updateConditionInput(conditionIndex: number, inputIndex: number, value: string) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: advancedDocument.pdo_condition.map((condition, currentIndex) =>
        currentIndex === conditionIndex
          ? {
              ...condition,
              data: condition.data.map((item, currentInputIndex) =>
                currentInputIndex === inputIndex ? { param_id: value } : item,
              ),
            }
          : condition,
      ),
    });
  }

  function addConditionInput(conditionIndex: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: advancedDocument.pdo_condition.map((condition, currentIndex) =>
        currentIndex === conditionIndex
          ? { ...condition, data: [...condition.data, { param_id: '' }] }
          : condition,
      ),
    });
  }

  function removeConditionInput(conditionIndex: number, inputIndex: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      pdo_condition: advancedDocument.pdo_condition.map((condition, currentIndex) =>
        currentIndex === conditionIndex
          ? {
              ...condition,
              data: condition.data.filter(
                (_, currentInputIndex) => currentInputIndex !== inputIndex,
              ),
            }
          : condition,
      ),
    });
  }

  function updateAdvancedFrame(
    kind: PdoDirection,
    index: number,
    field: keyof PdoAdvancedFrame,
    value: string | number,
  ) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: advancedDocument[kind].map((frame, currentIndex) =>
        currentIndex === index ? { ...frame, [field]: value } : frame,
      ),
    });
  }

  function updateAdvancedFrameId(kind: PdoDirection, index: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updateAdvancedFrame(kind, index, 'id', nextId);
  }

  function addAdvancedFrame(kind: PdoDirection) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: [...advancedDocument[kind], { id: 0, type: 0, desc: '', data: [] }],
    });
  }

  function removeAdvancedFrame(kind: PdoDirection, index: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: advancedDocument[kind].filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateAdvancedSignal(
    kind: PdoDirection,
    frameIndex: number,
    signalIndex: number,
    field: keyof PdoAdvancedSignal,
    value: string | number,
  ) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: advancedDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: frame.data.map((signal, currentSignalIndex) =>
                currentSignalIndex === signalIndex ? { ...signal, [field]: value } : signal,
              ),
            }
          : frame,
      ),
    });
  }

  function addAdvancedSignal(kind: PdoDirection, frameIndex: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: advancedDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: [
                ...frame.data,
                { pos: 0, len: 1, show_type: 0, handle: 0, handle_param: '', param_id: '' },
              ],
            }
          : frame,
      ),
    });
  }

  function removeAdvancedSignal(kind: PdoDirection, frameIndex: number, signalIndex: number) {
    if (!advancedDocument) return;
    updateAdvancedDocument({
      ...advancedDocument,
      [kind]: advancedDocument[kind].map((frame, currentFrameIndex) =>
        currentFrameIndex === frameIndex
          ? {
              ...frame,
              data: frame.data.filter(
                (_, currentSignalIndex) => currentSignalIndex !== signalIndex,
              ),
            }
          : frame,
      ),
    });
  }

  return {
    simpleDocument,
    advancedDocument,
    selectedKind,
    selectedSimpleFrameId,
    selectedAdvancedFrameId,
    mode,
    jumpTarget,
    jumpRowRef,
    activeSimpleFrame,
    activeSimpleFrameIndex,
    activeAdvancedFrame,
    activeAdvancedFrameIndex,
    simpleFrames,
    advancedFrames,
    updateSimpleDocument,
    updateAdvancedDocument,
    setMode,
    selectKind,
    setSelectedKind,
    setSelectedSimpleFrameId,
    setSelectedAdvancedFrameId,
    focusPdoParam,
    updateSimpleFrame,
    updateSimpleFrameId,
    addSimpleFrame,
    removeSimpleFrame,
    updateSimpleSignal,
    addSimpleSignal,
    removeSimpleSignal,
    updateGlobalParam,
    addGlobalParam,
    removeGlobalParam,
    updateCondition,
    addCondition,
    removeCondition,
    updateConditionInput,
    addConditionInput,
    removeConditionInput,
    updateAdvancedFrame,
    updateAdvancedFrameId,
    addAdvancedFrame,
    removeAdvancedFrame,
    updateAdvancedSignal,
    addAdvancedSignal,
    removeAdvancedSignal,
  };
}

export type PdoEditorController = ReturnType<typeof usePdoEditor>;
