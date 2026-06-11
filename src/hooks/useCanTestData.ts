import { useState } from 'react';
import { generateCanTestData, saveTextFile, saveJsonFile, loadJsonFile } from '../api/commands';
import type { CanTestFrame, CanTestSignalValue, LoadedProject } from '../types/platform';
import { open } from '@tauri-apps/plugin-dialog';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useCanTestData() {
  const [canTestFrames, setCanTestFrames] = useState<CanTestFrame[]>([]);
  const [canTestDefaultCycle, setCanTestDefaultCycle] = useState(100);
  const [canTestStatus, setCanTestStatus] = useState<string | null>(null);
  const [isGeneratingCanTest, setIsGeneratingCanTest] = useState(false);

  async function generate(loadedProject: LoadedProject | null) {
    if (!loadedProject) {
      setCanTestStatus('请先打开 .jcpro 项目。');
      return;
    }
    setIsGeneratingCanTest(true);
    setCanTestStatus(null);
    try {
      const result = await generateCanTestData(loadedProject.document);
      const frames = result.frames.map((f) => ({ ...f, cycleMs: canTestDefaultCycle }));
      setCanTestFrames(frames);
      setCanTestStatus(`已生成 ${result.frameCount} 个 CAN 帧`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingCanTest(false);
    }
  }

  function updateFrame(index: number, field: keyof CanTestFrame, value: number | string) {
    setCanTestFrames((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  function computeHexFromSignals(signals: CanTestSignalValue[], dlc: number): string {
    const bytes = new Uint8Array(dlc);
    for (const sig of signals) {
      let value = sig.rawValue >>> 0;
      let bitPos = sig.pos;
      let bitsRem = sig.len;
      while (bitsRem > 0) {
        const byteIdx = Math.floor(bitPos / 8);
        if (byteIdx >= dlc) break;
        const bitOff = bitPos % 8;
        const bitsThis = Math.min(8 - bitOff, bitsRem);
        bytes[byteIdx] |= (value & ((1 << bitsThis) - 1)) << bitOff;
        value >>>= bitsThis;
        bitPos += bitsThis;
        bitsRem -= bitsThis;
      }
    }
    return Array.from(bytes).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  }

  function updateSignalDisplayValue(frameIndex: number, signalIndex: number, displayValue: number) {
    setCanTestFrames((prev) => prev.map((frame, fi) => {
      if (fi !== frameIndex) return frame;
      const newSignals = frame.signals.map((sig, si) => {
        if (si !== signalIndex) return sig;
        const rawValue = Math.round((displayValue - sig.offset) * sig.scaleDen / sig.scaleNum);
        return { ...sig, displayValue, rawValue: Math.max(0, rawValue) };
      });
      const newData = computeHexFromSignals(newSignals, frame.dlc);
      return { ...frame, signals: newSignals, data: newData };
    }));
  }

  function fillSignals(mode: 'min' | 'max' | 'random' | 'zero' | 'ff') {
    setCanTestFrames((prev) => prev.map((frame) => {
      const newSignals = frame.signals.map((sig) => {
        let rawValue: number;
        if (mode === 'zero' || mode === 'min') {
          rawValue = 0;
        } else if (mode === 'ff' || mode === 'max') {
          rawValue = 0xFFFFFFFF >>> (32 - sig.len);
        } else {
          const maxRaw = 0xFFFFFFFF >>> (32 - sig.len);
          rawValue = Math.floor(Math.random() * (maxRaw + 1));
        }
        const displayValue = rawValue * sig.scaleNum / sig.scaleDen + sig.offset;
        return { ...sig, rawValue, displayValue };
      });
      const newData = computeHexFromSignals(newSignals, frame.dlc);
      return { ...frame, signals: newSignals, data: newData };
    }));
    const labels: Record<string, string> = { zero: '全部清零', min: '填充最小值', max: '填充最大值', random: '填充随机值', ff: '全填 FF' };
    setCanTestStatus(`已${labels[mode]}`);
  }

  async function exportTxt(loadedProject: LoadedProject | null) {
    if (!loadedProject || canTestFrames.length === 0) {
      setCanTestStatus('请先生成测试数据。');
      return;
    }
    const selected = await open({
      filters: [{ name: '文本文件', extensions: ['txt'] }],
    });
    if (typeof selected !== 'string') return;

    const lines: string[] = [
      '# CAN Test Data',
      `# Generated: ${new Date().toISOString()}`,
      `# Source: ${loadedProject.summary.name || 'unknown'}`,
      '# ---',
      '# CAN_ID, TYPE, NAME, DLC, CYCLE_MS, DATA_HEX',
    ];
    for (const frame of canTestFrames) {
      const idStr = `0x${frame.id.toString(16).toUpperCase()}`;
      lines.push(`${idStr}, ${frame.frameType}, ${frame.name}, ${frame.dlc}, ${frame.cycleMs}, ${frame.data}`);
      for (const sig of frame.signals) {
        lines.push(`#   ${sig.name} = ${sig.displayValue} ${sig.unit} (raw=${sig.rawValue}, pos=${sig.pos}, len=${sig.len})`);
      }
    }

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(`已导出：${selected}`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportConfig() {
    if (canTestFrames.length === 0) {
      setCanTestStatus('请先生成测试数据。');
      return;
    }
    const selected = await open({
      filters: [{ name: 'CAN 测试配置文件', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      await saveJsonFile(selected, {
        version: 1,
        defaultCycleMs: canTestDefaultCycle,
        frames: canTestFrames,
      });
      setCanTestStatus(`已导出配置：${selected}`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function importConfig() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'CAN 测试配置文件', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      const config = await loadJsonFile(selected) as { version?: number; defaultCycleMs?: number; frames?: CanTestFrame[] };
      if (!config.frames || !Array.isArray(config.frames)) {
        setCanTestStatus('配置文件中没有有效的帧数据。');
        return;
      }
      setCanTestFrames(config.frames);
      if (config.defaultCycleMs) setCanTestDefaultCycle(config.defaultCycleMs);
      setCanTestStatus(`已导入 ${config.frames.length} 个 CAN 帧`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    canTestFrames,
    canTestDefaultCycle,
    setCanTestDefaultCycle,
    canTestStatus,
    setCanTestStatus,
    isGeneratingCanTest,
    generate,
    updateFrame,
    updateSignalDisplayValue,
    fillSignals,
    exportTxt,
    exportConfig,
    importConfig,
  };
}
