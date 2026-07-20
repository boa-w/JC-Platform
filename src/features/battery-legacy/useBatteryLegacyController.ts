import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import {
  exportDbc,
  generateDbcContent,
  importDbc,
  loadJsonFile,
  loadTextFile,
  saveJsonFile,
  saveTextFile,
} from '../../api/commands';
import { useOperationGuard } from '../../hooks/useOperationGuard';
import type {
  BatteryMonitorFrame,
  BatteryMonitorInfo,
  BatteryMonitorItem,
  BatteryMonitorSignal,
  BatteryProtocol,
} from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { runSystemDialog } from '../../utils/systemDialog';
import { formatFrameId, parseFrameId } from '../realtime-data/usePdoEditor';

interface UseBatteryLegacyControllerOptions {
  document: unknown | null;
  projectPath?: string;
  updateProjectDocument: (section: string, value: unknown) => void;
  isModifiedPath: (path: JsonPath) => boolean;
  restoreModifiedPath: (path: JsonPath) => void;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useBatteryLegacyController({
  document,
  projectPath,
  updateProjectDocument,
  isModifiedPath,
  restoreModifiedPath,
}: UseBatteryLegacyControllerOptions) {
  const loadedProject = document ? { document } : null;
  const [batteryProtocolImportStatus, setBatteryProtocolImportStatus] = useState<string | null>(
    null,
  );
  const [batteryProtocolExportStatus, setBatteryProtocolExportStatus] = useState<string | null>(
    null,
  );
  const [isExportingBatteryProtocol, setIsExportingBatteryProtocol] = useState(false);
  const [isImportingBatteryProtocol, setIsImportingBatteryProtocol] = useState(false);
  const [batteryCsvStatus, setBatteryCsvStatus] = useState<string | null>(null);
  const [isExportingBatteryCsv, setIsExportingBatteryCsv] = useState(false);
  const [isImportingBatteryCsv, setIsImportingBatteryCsv] = useState(false);
  const [batteryDbcStatus, setBatteryDbcStatus] = useState<string | null>(null);
  const [isExportingBatteryDbc, setIsExportingBatteryDbc] = useState(false);
  const [isImportingBatteryDbc, setIsImportingBatteryDbc] = useState(false);
  const [batteryMonitorImportStatus, setBatteryMonitorImportStatus] = useState<string | null>(null);
  const [isImportingBatteryMonitor, setIsImportingBatteryMonitor] = useState(false);
  const [batteryMonitorExportStatus, setBatteryMonitorExportStatus] = useState<string | null>(null);
  const [isExportingBatteryMonitor, setIsExportingBatteryMonitor] = useState(false);
  const projectPathRef = useRef(projectPath);
  const documentGuard = useOperationGuard(document);
  const projectGuard = useOperationGuard(projectPath);
  const currentBatteryProtocolDocument = batteryProtocolDocument();
  const currentBatteryMonitorDocument = batteryMonitorDocument();

  useEffect(() => {
    projectPathRef.current = projectPath;
    setBatteryProtocolImportStatus(null);
    setBatteryProtocolExportStatus(null);
    setBatteryCsvStatus(null);
    setBatteryDbcStatus(null);
    setBatteryMonitorImportStatus(null);
    setBatteryMonitorExportStatus(null);
    setIsExportingBatteryProtocol(false);
    setIsImportingBatteryProtocol(false);
    setIsExportingBatteryCsv(false);
    setIsImportingBatteryCsv(false);
    setIsExportingBatteryDbc(false);
    setIsImportingBatteryDbc(false);
    setIsImportingBatteryMonitor(false);
    setIsExportingBatteryMonitor(false);
  }, [projectPath]);

  useEffect(() => {
    setIsImportingBatteryProtocol(false);
    setIsImportingBatteryMonitor(false);
    setIsImportingBatteryCsv(false);
    setIsImportingBatteryDbc(false);
    if (!document) {
      setBatteryProtocolImportStatus(null);
      setBatteryMonitorImportStatus(null);
      setBatteryCsvStatus(null);
      setBatteryDbcStatus(null);
    }
  }, [document]);

  function batteryProtocolDocument(): BatteryProtocol {
    if (!loadedProject) return { default_timeout_ticks: 200, frames: [], signals: [] };
    const doc = loadedProject.document as Record<string, unknown>;
    if (!doc.battery_protocol) {
      return { default_timeout_ticks: 200, frames: [], signals: [] };
    }
    return doc.battery_protocol as BatteryProtocol;
  }

  async function updateBatteryProtocolDocument(next: BatteryProtocol) {
    const operation = projectGuard.begin();
    updateProjectDocument('battery_protocol', next);
    if (next.frames.length > 0 || next.signals.length > 0) {
      try {
        const dbc = await generateDbcContent(next.frames, next.signals);
        if (projectGuard.isCurrent(operation)) {
          updateProjectDocument('battery_protocol', { ...next, dbc_content: dbc });
        }
      } catch {
        /* The editable protocol was already applied; DBC refresh is best-effort. */
      }
    }
  }

  function updateBatteryProtocolField(field: keyof BatteryProtocol, value: unknown) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({ ...document, [field]: value });
  }

  function batteryMonitorDocument(): BatteryMonitorInfo {
    if (!loadedProject) return { enabled: true, page_size: 4, items: [] };
    const doc = loadedProject.document as Record<string, unknown>;
    if (!doc.battery_monitor_info) {
      return { enabled: true, page_size: 4, items: [] };
    }
    return doc.battery_monitor_info as BatteryMonitorInfo;
  }

  function updateBatteryMonitorDocument(next: BatteryMonitorInfo) {
    updateProjectDocument('battery_monitor_info', next);
  }

  function updateBatteryMonitorField(field: keyof BatteryMonitorInfo, value: unknown) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({ ...document, [field]: value });
  }

  function updateBatteryFrame(
    index: number,
    field: keyof BatteryMonitorFrame,
    value: string | number,
  ) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
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
    const document = batteryProtocolDocument();
    if (!document) return;
    const index = document.frames.length;
    updateBatteryProtocolDocument({
      ...document,
      frames: [
        ...document.frames,
        {
          frame_key: `bat_custom_${index + 1}`,
          can_id: 0,
          type: 0,
          desc: '新锂电帧',
          timeout_ticks: document.default_timeout_ticks ?? 200,
        },
      ],
    });
  }

  function removeBatteryFrame(index: number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    const removedFrameKey = document.frames[index]?.frame_key;
    const remainingFrames = document.frames.filter((_, currentIndex) => currentIndex !== index);
    const firstFrameKey = remainingFrames[0]?.frame_key;
    const signals = document.signals.map((signal) =>
      signal.frame_key === removedFrameKey && firstFrameKey
        ? { ...signal, frame_key: firstFrameKey }
        : signal,
    );
    updateBatteryProtocolDocument({ ...document, frames: remainingFrames, signals });
  }

  function updateBatterySignal(
    index: number,
    field: keyof BatteryMonitorSignal,
    value: string | number,
  ) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      signals: document.signals.map((signal, currentIndex) =>
        currentIndex === index ? { ...signal, [field]: value } : signal,
      ),
    });
  }

  function addBatterySignal() {
    const document = batteryProtocolDocument();
    if (!document) return;
    const index = document.signals.length;
    let frames = document.frames;
    if (frames.length === 0) {
      frames = [
        {
          frame_key: 'bat_default',
          can_id: 0,
          type: 0,
          desc: '默认帧',
          timeout_ticks: document.default_timeout_ticks ?? 200,
        },
      ];
    }
    updateBatteryProtocolDocument({
      ...document,
      frames,
      signals: [
        ...document.signals,
        {
          signal_key: `battery_signal_${index + 1}`,
          param_id: `BATTERY_MONITOR_CUSTOM_${index + 1}`,
          name: '新锂电信号',
          inner: -1,
          type: 0,
          def: '0',
          frame_key: frames[0].frame_key,
          pos: 0,
          len: 8,
          show_type: 0,
          handle: 0,
          handle_param: '',
          factor: 1,
          offset: 0,
          min: 0,
          max: 0,
          unit: '',
          receiver: 'dbc_export',
          comment: '',
        },
      ],
    });
  }

  function removeBatterySignal(index: number) {
    const document = batteryProtocolDocument();
    if (!document) return;
    updateBatteryProtocolDocument({
      ...document,
      signals: document.signals.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateBatteryItem(
    index: number,
    field: keyof BatteryMonitorItem,
    value: string | number | boolean,
  ) {
    const document = batteryMonitorDocument();
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    });
  }

  function updateBatteryItemFormatter(index: number, field: string, value: string | number) {
    const document = batteryMonitorDocument();
    if (!document) return;
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
    if (!document) return;
    updateBatteryMonitorDocument({
      ...document,
      items: document.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, validity: { ...item.validity, [field]: value } } : item,
      ),
    });
  }

  function addBatteryItem() {
    const document = batteryMonitorDocument();
    if (!document) return;
    const index = document.items.length;
    const currentProtocol = batteryProtocolDocument();
    updateBatteryMonitorDocument({
      ...document,
      items: [
        ...document.items,
        {
          item_key: `battery_item_${index + 1}`,
          enabled: true,
          order: index,
          signal_key: currentProtocol?.signals[0]?.signal_key ?? '',
          name_key: '新锂电项',
          unit: '',
          formatter: {
            kind: 'linear',
            offset: 0,
            scale_num: 1,
            scale_den: 1,
            decimals: 0,
            display_base: 10,
          },
          validity: {
            mode: 'frame_timeout',
            frame_key: currentProtocol?.frames[0]?.frame_key ?? '',
            empty_text: ' ',
          },
        },
      ],
    });
  }

  function removeBatteryItem(index: number) {
    const document = batteryMonitorDocument();
    if (!document) return;
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
      () => save({ filters: [{ name: '锂电监控配置', extensions: ['json'] }] }),
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

  async function handleExportBatteryProtocol() {
    setBatteryProtocolExportStatus(null);
    if (!loadedProject) {
      setBatteryProtocolExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryProtocolExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '锂电协议', extensions: ['json'] }] }),
      setBatteryProtocolExportStatus,
    );
    if (!selected) return;

    setIsExportingBatteryProtocol(true);
    try {
      await saveJsonFile(selected, batteryProtocolDocument());
      setBatteryProtocolExportStatus(`已导出：${selected}`);
    } catch (error) {
      setBatteryProtocolExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryProtocol(false);
    }
  }

  async function handleImportBatteryProtocol() {
    setBatteryProtocolImportStatus(null);
    if (!loadedProject) {
      setBatteryProtocolImportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryProtocolImportStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '锂电协议', extensions: ['json'] }],
        }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryProtocolImportStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryProtocol(true);
    try {
      const data = (await loadJsonFile(selected)) as BatteryProtocol;
      if (!documentGuard.isCurrent(operation)) return;
      if (!data || !Array.isArray(data.frames) || !Array.isArray(data.signals)) {
        setBatteryProtocolImportStatus('无效的锂电协议配置文件。');
        return;
      }
      updateBatteryProtocolDocument(data);
      setBatteryProtocolImportStatus(
        `已导入 ${data.frames.length} 帧 / ${data.signals.length} 信号`,
      );
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryProtocolImportStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryProtocol(false);
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
          filters: [{ name: '锂电监控配置', extensions: ['json'] }],
        }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryMonitorImportStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryMonitor(true);
    try {
      const data = (await loadJsonFile(selected)) as BatteryMonitorInfo;
      if (!documentGuard.isCurrent(operation)) return;
      if (!data || !Array.isArray(data.items)) {
        setBatteryMonitorImportStatus('无效的锂电监控显示配置文件。');
        return;
      }
      updateBatteryMonitorDocument(data);
      setBatteryMonitorImportStatus(`已导入 ${data.items.length} 显示项`);
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
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '帧 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const { framesToCsv } = await import('../../utils/batteryCsv');
      const csv = framesToCsv(currentBatteryProtocolDocument?.frames ?? []);
      await saveTextFile(selected, `\uFEFF${csv}`);
      setBatteryCsvStatus(`帧 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryFramesCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '帧 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      if (!documentGuard.isCurrent(operation)) return;
      const { csvToFrames } = await import('../../utils/batteryCsv');
      const { frames, errors } = csvToFrames(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入帧 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryProtocolDocument();
      if (!document) return;
      updateBatteryProtocolDocument({ ...document, frames });
      setBatteryCsvStatus(`已导入 ${frames.length} 帧`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '信号 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const { signalsToCsv } = await import('../../utils/batteryCsv');
      const csv = signalsToCsv(currentBatteryProtocolDocument?.signals ?? []);
      await saveTextFile(selected, `\uFEFF${csv}`);
      setBatteryCsvStatus(`信号 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatterySignalsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '信号 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      if (!documentGuard.isCurrent(operation)) return;
      const { csvToSignals } = await import('../../utils/batteryCsv');
      const { signals, errors } = csvToSignals(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入信号 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryProtocolDocument();
      if (!document) return;
      updateBatteryProtocolDocument({ ...document, signals });
      setBatteryCsvStatus(`已导入 ${signals.length} 信号`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleExportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () => save({ filters: [{ name: '显示项 CSV', extensions: ['csv'] }] }),
      setBatteryCsvStatus,
    );
    if (!selected) return;

    setIsExportingBatteryCsv(true);
    try {
      const { itemsToCsv } = await import('../../utils/batteryCsv');
      const csv = itemsToCsv(currentBatteryMonitorDocument?.items ?? []);
      await saveTextFile(selected, `\uFEFF${csv}`);
      setBatteryCsvStatus(`显示项 CSV 已导出：${selected}`);
    } catch (error) {
      setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryItemsCsv() {
    setBatteryCsvStatus(null);
    if (!loadedProject) {
      setBatteryCsvStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: '显示项 CSV', extensions: ['csv'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryCsvStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryCsv(true);
    try {
      const text = await loadTextFile(selected);
      if (!documentGuard.isCurrent(operation)) return;
      const { csvToItems } = await import('../../utils/batteryCsv');
      const { items, errors } = csvToItems(text);
      if (errors.length > 0) {
        setBatteryCsvStatus(`导入显示项 CSV 出错：${errors.join('；')}`);
        return;
      }
      const document = batteryMonitorDocument();
      if (!document) return;
      updateBatteryMonitorDocument({ ...document, items });
      setBatteryCsvStatus(`已导入 ${items.length} 显示项`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryCsvStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryCsv(false);
    }
  }

  async function handleImportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) {
      setBatteryDbcStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryDbcStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const operation = documentGuard.begin();
    const selected = await runSystemDialog(
      () => open({ multiple: false, filters: [{ name: 'DBC 文件', extensions: ['dbc'] }] }),
      (message) => {
        if (documentGuard.isCurrent(operation)) setBatteryDbcStatus(message);
      },
    );
    if (typeof selected !== 'string') return;
    if (!documentGuard.isCurrent(operation)) return;

    setIsImportingBatteryDbc(true);
    try {
      const report = await importDbc(selected);
      if (!documentGuard.isCurrent(operation)) return;
      if (report.errors.length > 0) {
        setBatteryDbcStatus(`导入 DBC 出错：${report.errors.join('；')}`);
        return;
      }
      if (report.frames.length === 0) {
        setBatteryDbcStatus('DBC 文件中未找到任何消息。');
        return;
      }
      let rawDbc = '';
      try {
        rawDbc = await loadTextFile(selected);
      } catch {
        /* non-critical */
      }
      if (!documentGuard.isCurrent(operation)) return;
      const document = batteryProtocolDocument();
      updateBatteryProtocolDocument({
        ...document,
        frames: report.frames,
        signals: report.signals,
        dbc_content: rawDbc || undefined,
      });
      setBatteryDbcStatus(`已导入 ${report.frames.length} 帧 / ${report.signals.length} 信号`);
    } catch (error) {
      if (documentGuard.isCurrent(operation)) {
        setBatteryDbcStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (documentGuard.isCurrent(operation)) setIsImportingBatteryDbc(false);
    }
  }

  async function handleExportBatteryDbc() {
    setBatteryDbcStatus(null);
    if (!loadedProject) {
      setBatteryDbcStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setBatteryDbcStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const document = batteryProtocolDocument();
    if (document.frames.length === 0) {
      setBatteryDbcStatus('没有帧可导出。');
      return;
    }

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
    currentBatteryProtocolDocument,
    currentBatteryMonitorDocument,
    batteryProtocolExportStatus,
    batteryProtocolImportStatus,
    batteryMonitorExportStatus,
    batteryMonitorImportStatus,
    batteryCsvStatus,
    batteryDbcStatus,
    isExportingBatteryProtocol,
    isImportingBatteryProtocol,
    isExportingBatteryMonitor,
    isImportingBatteryMonitor,
    isExportingBatteryCsv,
    isImportingBatteryCsv,
    isExportingBatteryDbc,
    isImportingBatteryDbc,
    handleExportBatteryProtocol,
    handleImportBatteryProtocol,
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
    updateBatteryProtocolDocument,
    updateBatteryMonitorDocument,
    updateBatteryProtocolField,
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
    addBatteryItem,
    removeBatteryItem,
    formatFrameId,
    isModifiedPath,
    restoreModifiedPath,
  };
}

export type BatteryLegacyController = ReturnType<typeof useBatteryLegacyController>;
