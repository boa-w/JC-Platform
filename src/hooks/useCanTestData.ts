import { useState } from 'react';
import { generateCanTestData, saveTextFile, saveJsonFile, loadJsonFile } from '../api/commands';
import type { CanTestCase, CanTestCoverage, CanTestFrame, CanTestProfile, CanTestSettingEntry, CanTestSignalValue, LoadedProject } from '../types/platform';
import { open } from '@tauri-apps/plugin-dialog';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useCanTestData() {
  const [canTestFrames, setCanTestFrames] = useState<CanTestFrame[]>([]);
  const [canTestSettingEntries, setCanTestSettingEntries] = useState<CanTestSettingEntry[]>([]);
  const [canTestCases, setCanTestCases] = useState<CanTestCase[]>([]);
  const [canTestCoverage, setCanTestCoverage] = useState<CanTestCoverage | null>(null);
  const [canTestWarnings, setCanTestWarnings] = useState<string[]>([]);
  const [canTestProfile, setCanTestProfile] = useState<CanTestProfile>('boundary');
  const [selectedCanTestCaseIndex, setSelectedCanTestCaseIndex] = useState(0);
  const [canTestDefaultCycle, setCanTestDefaultCycle] = useState(100);
  const [canTestStatus, setCanTestStatus] = useState<string | null>(null);
  const [isGeneratingCanTest, setIsGeneratingCanTest] = useState(false);

  function normalizeFrames(frames: CanTestFrame[]) {
    return frames.map((frame) => ({
      ...frame,
      cycleMs: frame.cycleMs ?? canTestDefaultCycle,
      source: frame.source ?? 'imported',
      scenario: frame.scenario ?? 'manual',
      signals: frame.signals.map((sig) => ({
        ...sig,
        minValue: sig.minValue ?? null,
        maxValue: sig.maxValue ?? null,
        source: sig.source ?? frame.source ?? 'imported',
        testRole: sig.testRole ?? 'manual',
      })),
    }));
  }

  function normalizeSettingEntries(entries: CanTestSettingEntry[] = []) {
    return entries.map((entry) => ({
      ...entry,
      menuPath: entry.menuPath ?? '',
      access: entry.access ?? '',
      dataType: entry.dataType ?? '',
      pos: entry.pos ?? 0,
      len: entry.len ?? 1,
      role: entry.role ?? 'manual',
      source: entry.source ?? '设置数据/SDO',
      defaultValue: entry.defaultValue ?? null,
      minValue: entry.minValue ?? null,
      maxValue: entry.maxValue ?? null,
      scale: entry.scale ?? null,
      offset: entry.offset ?? null,
    }));
  }

  async function generate(loadedProject: LoadedProject | null) {
    if (!loadedProject) {
      setCanTestStatus('请先打开 .jcpro 项目。');
      return;
    }
    setIsGeneratingCanTest(true);
    setCanTestStatus(null);
    try {
      const result = await generateCanTestData(loadedProject.document, canTestProfile);
      const cases = (result.cases ?? []).map((testCase) => ({
        ...testCase,
        frames: normalizeFrames(testCase.frames),
        settingEntries: normalizeSettingEntries(testCase.settingEntries),
      }));
      const frames = cases[0]?.frames ?? normalizeFrames(result.frames);
      const settingEntries = cases[0]?.settingEntries ?? normalizeSettingEntries(result.settingEntries);
      setCanTestCases(cases);
      setCanTestCoverage(result.coverage ?? null);
      setCanTestWarnings(result.warnings ?? []);
      setSelectedCanTestCaseIndex(0);
      setCanTestFrames(frames);
      setCanTestSettingEntries(settingEntries);
      setCanTestStatus(`已生成 ${result.coverage?.caseCount ?? cases.length} 个测试用例，${result.coverage?.generatedFrameCount ?? result.frameCount} 帧次，${result.coverage?.generatedSettingEntryCount ?? settingEntries.length} 个设置条目`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingCanTest(false);
    }
  }

  function updateFrame(index: number, field: keyof CanTestFrame, value: number | string) {
    setCanTestFrames((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  function maxRawForLength(len: number) {
    if (len <= 0) return 0;
    if (len >= 32) return 0xFFFFFFFF;
    return (2 ** len) - 1;
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

  function selectCanTestCase(index: number) {
    const testCase = canTestCases[index];
    if (!testCase) return;
    setSelectedCanTestCaseIndex(index);
    setCanTestFrames(normalizeFrames(testCase.frames));
    setCanTestSettingEntries(normalizeSettingEntries(testCase.settingEntries));
    setCanTestStatus(`正在查看：${testCase.caseId} ${testCase.title}`);
  }

  function fillSignals(mode: 'min' | 'max' | 'random' | 'zero' | 'ff') {
    setCanTestFrames((prev) => prev.map((frame) => {
      const newSignals = frame.signals.map((sig) => {
        let rawValue: number;
        if (mode === 'zero' || mode === 'min') {
          rawValue = 0;
        } else if (mode === 'ff' || mode === 'max') {
          rawValue = maxRawForLength(sig.len);
        } else {
          const maxRaw = maxRawForLength(sig.len);
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

  function exportableCases() {
    return canTestCases.length > 0
      ? canTestCases
      : [{ caseId: 'TC-MANUAL-001', title: '当前手动帧', scenario: 'manual', description: '', tags: [], frames: canTestFrames, settingEntries: canTestSettingEntries }];
  }

  function escapeCsvField(value: string | number) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function frameRows() {
    return exportableCases().flatMap((testCase) => testCase.frames.map((frame) => ({
      caseId: testCase.caseId,
      canId: `0x${frame.id.toString(16).toUpperCase()}`,
      type: frame.frameType,
      name: frame.name,
      dlc: frame.dlc,
      cycleMs: frame.cycleMs,
      dataHex: frame.data,
    })));
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

    const lines: string[] = ['CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX'];
    for (const row of frameRows()) {
      lines.push(`${row.canId},${row.type},${row.name},${row.dlc},${row.cycleMs},${row.dataHex}`);
    }

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(`已导出：${selected}`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportCsv(loadedProject: LoadedProject | null) {
    if (!loadedProject || canTestFrames.length === 0) {
      setCanTestStatus('请先生成测试数据。');
      return;
    }
    const selected = await open({
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    const lines = [
      'CASE_ID,CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX',
      ...frameRows().map((row) => [
        row.caseId,
        row.canId,
        row.type,
        row.name,
        row.dlc,
        row.cycleMs,
        row.dataHex,
      ].map(escapeCsvField).join(',')),
    ];

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(`已导出 CSV：${selected}`);
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
        version: 2,
        profile: canTestProfile,
        defaultCycleMs: canTestDefaultCycle,
        frames: canTestFrames,
        settingEntries: canTestSettingEntries,
        cases: canTestCases,
        coverage: canTestCoverage,
        warnings: canTestWarnings,
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
      const config = await loadJsonFile(selected) as {
        version?: number;
        profile?: CanTestProfile;
        defaultCycleMs?: number;
        frames?: CanTestFrame[];
        settingEntries?: CanTestSettingEntry[];
        cases?: CanTestCase[];
        coverage?: CanTestCoverage;
        warnings?: string[];
      };
      if (!config.frames || !Array.isArray(config.frames)) {
        setCanTestStatus('配置文件中没有有效的帧数据。');
        return;
      }
      setCanTestFrames(normalizeFrames(config.frames));
      setCanTestSettingEntries(normalizeSettingEntries(config.settingEntries));
      setCanTestCases((config.cases ?? []).map((testCase) => ({
        ...testCase,
        frames: normalizeFrames(testCase.frames),
        settingEntries: normalizeSettingEntries(testCase.settingEntries),
      })));
      setCanTestCoverage(config.coverage ?? null);
      setCanTestWarnings(config.warnings ?? []);
      setSelectedCanTestCaseIndex(0);
      if (config.profile) setCanTestProfile(config.profile);
      if (config.defaultCycleMs) setCanTestDefaultCycle(config.defaultCycleMs);
      setCanTestStatus(`已导入 ${config.frames.length} 个 CAN 帧`);
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    canTestFrames,
    canTestSettingEntries,
    canTestCases,
    canTestCoverage,
    canTestWarnings,
    canTestProfile,
    selectedCanTestCaseIndex,
    setCanTestProfile,
    canTestDefaultCycle,
    setCanTestDefaultCycle,
    canTestStatus,
    setCanTestStatus,
    isGeneratingCanTest,
    generate,
    updateFrame,
    updateSignalDisplayValue,
    selectCanTestCase,
    fillSignals,
    exportTxt,
    exportCsv,
    exportConfig,
    importConfig,
  };
}
