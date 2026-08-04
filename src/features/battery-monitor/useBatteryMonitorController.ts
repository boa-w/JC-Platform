import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import {
  exportDbc,
  importDbc,
  loadJsonFile,
  loadTextFile,
  saveJsonFile,
  saveTextFile,
} from '../../api/commands';
import { useOperationGuard } from '../../hooks/useOperationGuard';
import type {
  BatteryMonitorFrame,
  BatteryMonitorItem,
  BatteryMonitorProtocol,
  BatteryMonitorSignal,
  LanguageDocument,
} from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { runSystemDialog } from '../../utils/systemDialog';
import { formatFrameId, parseFrameId } from '../realtime-data/usePdoEditor';

interface UseBatteryMonitorControllerOptions {
  document: unknown | null;
  projectPath?: string;
  updateProjectDocument: (section: string, value: unknown) => void;
  updateProjectSections: (sections: Record<string, unknown>) => void;
  isModifiedPath: (path: JsonPath) => boolean;
  restoreModifiedPath: (path: JsonPath) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function cloneDefaultBatteryMonitor(): BatteryMonitorProtocol {
  return {
    schema_version: 1,
    enabled: true,
    version: 1,
    default_timeout_ticks: 200,
    page_size: 4,
    frames: [],
    signals: [],
    items: [],
  };
}

function defaultLanguageDocument(): LanguageDocument {
  return {
    list_code_language: ['zh', 'en'],
    list_inner: ['中文', '英文'],
    list_translate: {},
  };
}

function ensureLanguageEntry(language: LanguageDocument, key: string, zhText = ''): LanguageDocument {
  if (!key.trim()) return language;
  const listInner = language.list_inner.includes(key)
    ? language.list_inner
    : [...language.list_inner, key];
  const existing = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
  const values = Object.fromEntries(
    language.list_code_language.map((code) => [code, existing[code] ?? (code === 'zh' ? zhText : '')]),
  );
  return {
    ...language,
    list_inner: listInner,
    list_translate: { ...language.list_translate, [key]: values },
  };
}

function normalizeBatteryMonitor(value: unknown): BatteryMonitorProtocol {
  const fallback = cloneDefaultBatteryMonitor();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Partial<BatteryMonitorProtocol>;
  return {
    ...fallback,
    ...source,
    frames: Array.isArray(source.frames) ? source.frames : fallback.frames,
    signals: Array.isArray(source.signals) ? source.signals : fallback.signals,
    items: Array.isArray(source.items) ? source.items : fallback.items,
  } as BatteryMonitorProtocol;
}

function normalizeImportedBatteryMonitor(value: unknown): BatteryMonitorProtocol | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.frames) || !Array.isArray(source.signals) || !Array.isArray(source.items)) {
    return null;
  }
  return normalizeBatteryMonitor(value);
}

export function useBatteryMonitorController({
  document,
  projectPath,
  updateProjectDocument,
  updateProjectSections,
  isModifiedPath,
  restoreModifiedPath,
}: UseBatteryMonitorControllerOptions) {
  const loadedProject = document ? { document } : null;
  const [batteryMonitorImportStatus, setBatteryMonitorImportStatus] = useState<string | null>(null);
  const [batteryMonitorExportStatus, setBatteryMonitorExportStatus] = useState<string | null>(null);
  const [isExportingBatteryMonitor, setIsExportingBatteryMonitor] = useState(false);
  const [isImportingBatteryMonitor, setIsImportingBatteryMonitor] = useState(false);
  const [batteryCsvStatus, setBatteryCsvStatus] = useState<string | null>(null);
  const [isExportingBatteryCsv, setIsExportingBatteryCsv] = useState(false);
  const [isImportingBatteryCsv, setIsImportingBatteryCsv] = useState(false);
  const [batteryDbcStatus, setBatteryDbcStatus] = useState<string | null>(null);
  const [isExportingBatteryDbc, setIsExportingBatteryDbc] = useState(false);
  const [isImportingBatteryDbc, setIsImportingBatteryDbc] = useState(false);
  const documentGuard = useOperationGuard(document);
  const currentBatteryMonitorDocument = batteryMonitorDocument();

  // Project-path changes define a new editing session for transient import/export state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: projectPath intentionally triggers this reset boundary.
  useEffect(() => {
    setBatteryMonitorImportStatus(null);
    setBatteryMonitorExportStatus(null);
    setBatteryCsvStatus(null);
    setBatteryDbcStatus(null);
    setIsExportingBatteryMonitor(false);
    setIsImportingBatteryMonitor(false);
    setIsExportingBatteryCsv(false);
    setIsImportingBatteryCsv(false);
    setIsExportingBatteryDbc(false);
    setIsImportingBatteryDbc(false);
  }, [projectPath]);

  useEffect(() => {
    setIsImportingBatteryMonitor(false);
    setIsImportingBatteryCsv(false);
    setIsImportingBatteryDbc(false);
    if (!document) {
      setBatteryMonitorImportStatus(null);
      setBatteryCsvStatus(null);
      setBatteryDbcStatus(null);
    }
  }, [document]);

  function batteryMonitorDocument(): BatteryMonitorProtocol {
    if (!loadedProject) return cloneDefaultBatteryMonitor();
    const source = loadedProject.document as Record<string, unknown>;
    return normalizeBatteryMonitor(source.battery_monitor);
  }

  function languageDocument(): LanguageDocument {
    if (!loadedProject) return defaultLanguageDocument();
    const source = loadedProject.document as Record<string, unknown>;
    const language = source.language_info as LanguageDocument | undefined;
    return language ?? defaultLanguageDocument();
  }

  function batteryLanguageFor(next: BatteryMonitorProtocol) {
    let language = languageDocument();
    for (const item of next.items) {
      const key = item.name_key?.trim();
      if (!key) continue;
      language = ensureLanguageEntry(language, key, item.fallback_name || item.item_key);
    }
    return language;
  }

  function updateBatteryMonitorDocument(next: BatteryMonitorProtocol) {
    const normalized = normalizeBatteryMonitor(next);
    updateProjectSections({
      battery_monitor: normalized,
      language_info: batteryLanguageFor(normalized),
    });
  }

  function updateBatteryMonitorField(field: keyof BatteryMonitorProtocol, value: unknown) {
    updateBatteryMonitorDocument({ ...batteryMonitorDocument(), [field]: value });
  }

  function updateBatteryFrame(
    index: number,
    field: keyof BatteryMonitorFrame,
    value: string | number,
  ) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      frames: document.frames.map((frame, currentIndex) =>
        currentIndex === index ? { ...frame, [field]: value } : frame,
      ),
    });
  }

  function updateBatteryFrameId(index: number, value: string) {
    const nextId = parseFrameId(value);
    if (nextId !== null) updateBatteryFrame(index, 'can_id', nextId);
  }

  function addBatteryFrame() {
    const document = batteryMonitorDocument();
    const index = document.frames.length;
    updateBatteryMonitorDocument({
      ...document,
      frames: [
        ...document.frames,
        {
          frame_key: `battery_custom_${index + 1}`,
          can_id: 0,
          frame_type: 0,
          dlc: 8,
          desc: '新锂电监控帧',
          timeout_ticks: document.default_timeout_ticks || 200,
        },
      ],
    });
  }

  function removeBatteryFrame(index: number) {
    const document = batteryMonitorDocument();
    const removedFrameKey = document.frames[index]?.frame_key;
    if (!removedFrameKey) return;
    const frames = document.frames.filter((_, currentIndex) => currentIndex !== index);
    const signals = document.signals.filter((signal) => signal.frame_key !== removedFrameKey);
    const signalKeys = new Set(signals.map((signal) => signal.signal_key));
    const fallbackFrameKey = frames[0]?.frame_key ?? '';
    const items = document.items
      .filter((item) => signalKeys.has(item.signal_key))
      .map((item) =>
        item.validity.frame_key === removedFrameKey
          ? { ...item, validity: { ...item.validity, frame_key: fallbackFrameKey } }
          : item,
      );
    updateBatteryMonitorDocument({ ...document, frames, signals, items });
  }

  function updateBatterySignal(
    index: number,
    field: keyof BatteryMonitorSignal,
    value: string | number,
  ) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) =>
        currentIndex === index ? { ...signal, [field]: value } : signal,
      ),
    });
  }

  function addBatterySignal() {
    const document = batteryMonitorDocument();
    const index = document.signals.length;
    const frameKey = document.frames[0]?.frame_key ?? '';
    updateBatteryMonitorDocument({
      ...document,
      signals: [
        ...document.signals,
        {
          signal_key: `battery_signal_${index + 1}`,
          param_id: `BATTERY_MONITOR_CUSTOM_${index + 1}`,
          name: '新锂电监控信号',
          inner: -1,
          frame_key: frameKey,
          pos: 0,
          len: 8,
          byte_order: 'little_endian',
          raw_offset: 0,
          raw_type: 'u8',
          value_type: 'u8',
          parse_resolution: 1,
          parse_offset: 0,
          parse_mask: 0xffffffff,
          parse_shift: 0,
          receiver: 'vcu',
          comment: '',
        },
      ],
    });
  }

  function removeBatterySignal(index: number) {
    const document = batteryMonitorDocument();
    const removedSignalKey = document.signals[index]?.signal_key;
    if (!removedSignalKey) return;
    updateBatteryMonitorDocument({
      ...document,
      signals: document.signals.filter((_, currentIndex) => currentIndex !== index),
      items: document.items.filter((item) => item.signal_key !== removedSignalKey),
    });
  }

  function updateBatteryItem(
    index: number,
    field: keyof BatteryMonitorItem,
    value: string | number | boolean,
  ) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  }

  function updateBatteryItemFormatter(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, formatter: { ...item.formatter, [field]: value } }
          : item,
      ),
    });
  }

  function updateBatteryItemValidity(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index
          ? { ...item, validity: { ...item.validity, [field]: value } }
          : item,
      ),
    });
  }

  function updateBatteryItemLanguage(index: number, text: string) {
    const item = batteryMonitorDocument().items[index];
    if (!item?.name_key?.trim()) return;
    const language = languageDocument();
    const existing = (language.list_translate[item.name_key] as Record<string, string> | undefined) ?? {};
    const nextLanguage = ensureLanguageEntry(
      {
        ...language,
        list_translate: {
          ...language.list_translate,
          [item.name_key]: { ...existing, zh: text },
        },
      },
      item.name_key,
      text || item.fallback_name || item.item_key,
    );
    updateProjectDocument('language_info', nextLanguage);
  }

  function addBatteryItem() {
    const document = batteryMonitorDocument();
    const index = document.items.length;
    const signal = document.signals[0];
    const nameKey = `battery_monitor.battery_item_${index + 1}`;
    updateBatteryMonitorDocument({
      ...document,
      items: [
        ...document.items,
        {
          item_key: `battery_item_${index + 1}`,
          enabled: true,
          order: index,
          signal_key: signal?.signal_key ?? '',
          name_key: nameKey,
          fallback_name: '新锂电监控显示项',
          unit: '',
          formatter: {
            kind: 'linear',
            offset: 0,
            scale_num: 1,
            scale_den: 1,
            decimals: 0,
            display_base: 10,
            true_text: '',
            false_text: '',
          },
          validity: {
            mode: 'frame_timeout',
            frame_key: signal?.frame_key ?? '',
            empty_text: ' ',
          },
        },
      ],
    });
  }

  function removeBatteryItem(index: number) {
    const document = batteryMonitorDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function handleExportBatteryMonitor() {
    setBatteryMonitorExportStatus(null);
    if (!loadedProject) {
      setBatteryMonitorExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryMonitorExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '锂电监控协议配置', extensions: ['json'] }] }),
      setBatteryMonitorExportStatus,
    );
    if (!selected) return;
    setIsExportingBatteryMonitor(true);
    try {
      await saveJsonFile(selected, batteryMonitorDocument());
      setBatteryMonitorExportStatus(`已导出：${selected}`);
    } catch (error) {
      setBatteryMonitorExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryMonitor(false);
    }
  }

  async function handleImportBatteryMonitor() {
    setBatteryMonitorImportStatus(null);
    if (!loadedProject) {
      setBatteryMonitorImportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryMonitorImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '锂电监控协议配置', extensions: ['json'] }],
        }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryMonitorImportStatus(message);
      },
    );
    if (typeof selected !== 'string' || !documentGuard.isCurrent(operation)) return;
    setIsImportingBatteryMonitor(true);
    try {
      const imported = normalizeImportedBatteryMonitor(await loadJsonFile(selected));
      if (!documentGuard.isCurrent(operation)) return;
      if (!imported) {
        setBatteryMonitorImportStatus('无效的锂电监控协议配置文件，必须同时包含 frames、signals、items。');
        return;
      }
      updateBatteryMonitorDocument(imported);
      setBatteryMonitorImportStatus(
        `已导入 ${imported.frames.length} 帧 / ${imported.signals.length} 信号 / ${imported.items.length} 显示项`,
      );
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryMonitorImportStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryMonitor(false);
    }
  }

  async function handleExportBatteryFramesCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '帧 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;
    setIsExportingBatteryCsv(true);
    try {
      const { framesToCsv } = await import('../../utils/batteryCsv');
      await saveTextFile(selected, `\uFEFF${framesToCsv(batteryMonitorDocument().frames)}`);
      setBatteryCsvStatus(`帧 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryFramesCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '帧 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string' || !documentGuard.isCurrent(operation)) return;
    setIsImportingBatteryCsv(true);
    try {
      const { csvToFrames } = await import('../../utils/batteryCsv');
      const { frames, errors } = csvToFrames(await loadTextFile(selected));
      if (!documentGuard.isCurrent(operation)) return;
      if (errors.length > 0) return setBatteryCsvStatus(`导入帧 CSV 出错：${errors.join('；')}`);
      const current = batteryMonitorDocument();
      const frameKeys = new Set(frames.map((frame) => frame.frame_key));
      updateBatteryMonitorDocument({
        ...current,
        frames,
        signals: current.signals.filter((signal) => frameKeys.has(signal.frame_key)),
        items: current.items.filter((item) =>
          current.signals.some(
            (signal) => signal.signal_key === item.signal_key && frameKeys.has(signal.frame_key),
          ),
        ),
      });
      setBatteryCsvStatus(`已导入 ${frames.length} 帧`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '信号 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;
    setIsExportingBatteryCsv(true);
    try {
      const { signalsToCsv } = await import('../../utils/batteryCsv');
      await saveTextFile(selected, `\uFEFF${signalsToCsv(batteryMonitorDocument().signals)}`);
      setBatteryCsvStatus(`信号 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '信号 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string' || !documentGuard.isCurrent(operation)) return;
    setIsImportingBatteryCsv(true);
    try {
      const { csvToSignals } = await import('../../utils/batteryCsv');
      const { signals, errors } = csvToSignals(await loadTextFile(selected));
      if (!documentGuard.isCurrent(operation)) return;
      if (errors.length > 0) return setBatteryCsvStatus(`导入信号 CSV 出错：${errors.join('；')}`);
      const current = batteryMonitorDocument();
      const signalKeys = new Set(signals.map((signal) => signal.signal_key));
      updateBatteryMonitorDocument({
        ...current,
        signals,
        items: current.items.filter((item) => signalKeys.has(item.signal_key)),
      });
      setBatteryCsvStatus(`已导入 ${signals.length} 信号`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '显示项 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;
    setIsExportingBatteryCsv(true);
    try {
      const { itemsToCsv } = await import('../../utils/batteryCsv');
      await saveTextFile(selected, `\uFEFF${itemsToCsv(batteryMonitorDocument().items)}`);
      setBatteryCsvStatus(`显示项 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) return setBatteryCsvStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '显示项 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string' || !documentGuard.isCurrent(operation)) return;
    setIsImportingBatteryCsv(true);
    try {
      const { csvToItems } = await import('../../utils/batteryCsv');
      const { items, errors } = csvToItems(await loadTextFile(selected));
      if (!documentGuard.isCurrent(operation)) return;
      if (errors.length > 0) return setBatteryCsvStatus(`导入显示项 CSV 出错：${errors.join('；')}`);
      const current = batteryMonitorDocument();
      const signalKeys = new Set(current.signals.map((signal) => signal.signal_key));
      updateBatteryMonitorDocument({
        ...current,
        items: items.filter((item) => signalKeys.has(item.signal_key)),
      });
      setBatteryCsvStatus(`已导入 ${items.length} 显示项`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) return setBatteryDbcStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryDbcStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: 'DBC 文件', extensions: ['dbc'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryDbcStatus(message);
      },
    );
    if (typeof selected !== 'string' || !documentGuard.isCurrent(operation)) return;
    setIsImportingBatteryDbc(true);
    try {
      const report = await importDbc(selected);
      if (!documentGuard.isCurrent(operation)) return;
      if (report.errors.length > 0) return setBatteryDbcStatus(`导入 DBC 出错：${report.errors.join('；')}`);
      if (report.frames.length === 0) return setBatteryDbcStatus('DBC 文件中未找到任何消息。');
      const current = batteryMonitorDocument();
      const signalKeys = new Set(report.signals.map((signal) => signal.signal_key));
      const items = current.items.filter((item) => signalKeys.has(item.signal_key));
      updateBatteryMonitorDocument({ ...current, frames: report.frames, signals: report.signals, items });
      setBatteryDbcStatus(`已导入 ${report.frames.length} 帧 / ${report.signals.length} 信号`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) setBatteryDbcStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryDbc(false);
    }
  }

  async function handleExportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) return setBatteryDbcStatus('请先打开 .jcpro 项目。');
    if (!isTauriRuntime()) return setBatteryDbcStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
    const document = batteryMonitorDocument();
    if (document.frames.length === 0) return setBatteryDbcStatus('没有帧可导出。');
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: 'DBC 文件', extensions: ['dbc'] }] }),
      setBatteryDbcStatus,
    );
    if (!selected) return;
    setIsExportingBatteryDbc(true);
    try {
      await exportDbc(selected, document.frames, document.signals);
      setBatteryDbcStatus(`DBC 已导出：${selected}`);
    } catch (error) {
      setBatteryDbcStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryDbc(false);
    }
  }

  return {
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
    updateBatteryMonitorDocument,
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
  };
}

export type BatteryMonitorController = ReturnType<typeof useBatteryMonitorController>;
