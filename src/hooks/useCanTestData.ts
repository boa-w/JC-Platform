import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateCanTestData, loadJsonFile, saveJsonFile, saveTextFile } from '../api/commands';
import type {
  CanTestCase,
  CanTestCoverage,
  CanTestFrame,
  CanTestProfile,
  CanTestSettingEntry,
  CanTestSignalValue,
  LoadedProject,
} from '../types/platform';
import { runSystemDialog } from '../utils/systemDialog';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useCanTestData(sourceDocument: unknown | null) {
  const { t } = useTranslation();
  const [canTestFrames, setCanTestFrames] = useState<CanTestFrame[]>([]);
  const [canTestSettingEntries, setCanTestSettingEntries] = useState<CanTestSettingEntry[]>([]);
  const [canTestCases, setCanTestCases] = useState<CanTestCase[]>([]);
  const [canTestCoverage, setCanTestCoverage] = useState<CanTestCoverage | null>(null);
  const [canTestWarnings, setCanTestWarnings] = useState<string[]>([]);
  const [canTestProfile, setCanTestProfile] = useState<CanTestProfile>('boundary');
  const [selectedCanTestCaseIndex, setSelectedCanTestCaseIndex] = useState(0);
  const [canTestDefaultCycle, setCanTestDefaultCycle] = useState(100);
  const [canTestStatus, setCanTestStatus] = useState<string | null>(null);
  const [canTestStatusTone, setCanTestStatusTone] = useState<'success' | 'error' | 'neutral' | null>(
    null,
  );
  const [isGeneratingCanTest, setIsGeneratingCanTest] = useState(false);
  const sourceDocumentRef = useRef(sourceDocument);
  const generationRef = useRef(0);
  sourceDocumentRef.current = sourceDocument;

  useEffect(() => {
    sourceDocumentRef.current = sourceDocument;
    generationRef.current += 1;
    setCanTestFrames([]);
    setCanTestSettingEntries([]);
    setCanTestCases([]);
    setCanTestCoverage(null);
    setCanTestWarnings([]);
    setSelectedCanTestCaseIndex(0);
    setCanTestStatus(null);
    setCanTestStatusTone(null);
    setIsGeneratingCanTest(false);
  }, [sourceDocument]);

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
      setCanTestStatus(t('canTestData.openProjectFirst'));
      setCanTestStatusTone('error');
      return;
    }
    const targetDocument = loadedProject.document;
    const generation = ++generationRef.current;
    setIsGeneratingCanTest(true);
    setCanTestStatus(null);
    setCanTestStatusTone(null);
    try {
      const result = await generateCanTestData(targetDocument, canTestProfile);
      if (generation !== generationRef.current || targetDocument !== sourceDocumentRef.current) {
        return;
      }
      const cases = (result.cases ?? []).map((testCase) => ({
        ...testCase,
        frames: normalizeFrames(testCase.frames),
        settingEntries: normalizeSettingEntries(testCase.settingEntries),
      }));
      const frames = cases[0]?.frames ?? normalizeFrames(result.frames);
      const settingEntries =
        cases[0]?.settingEntries ?? normalizeSettingEntries(result.settingEntries);
      setCanTestCases(cases);
      setCanTestCoverage(result.coverage ?? null);
      setCanTestWarnings(result.warnings ?? []);
      setSelectedCanTestCaseIndex(0);
      setCanTestFrames(frames);
      setCanTestSettingEntries(settingEntries);
      setCanTestStatus(
        t('canTestData.generatedStatus', {
          cases: result.coverage?.caseCount ?? cases.length,
          frames: result.coverage?.generatedFrameCount ?? result.frameCount,
          entries: result.coverage?.generatedSettingEntryCount ?? settingEntries.length,
        }),
      );
      setCanTestStatusTone('success');
    } catch (error) {
      if (generation === generationRef.current) {
        setCanTestStatus(error instanceof Error ? error.message : String(error));
        setCanTestStatusTone('error');
      }
    } finally {
      if (generation === generationRef.current) setIsGeneratingCanTest(false);
    }
  }

  function updateFrame(index: number, field: keyof CanTestFrame, value: number | string) {
    setCanTestFrames((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  }

  function maxRawForLength(len: number) {
    if (len <= 0) return 0;
    if (len >= 32) return 0xffffffff;
    return 2 ** len - 1;
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
    return Array.from(bytes)
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }

  function updateSignalDisplayValue(frameIndex: number, signalIndex: number, displayValue: number) {
    setCanTestFrames((prev) =>
      prev.map((frame, fi) => {
        if (fi !== frameIndex) return frame;
        const newSignals = frame.signals.map((sig, si) => {
          if (si !== signalIndex) return sig;
          const rawValue = Math.round(((displayValue - sig.offset) * sig.scaleDen) / sig.scaleNum);
          return { ...sig, displayValue, rawValue: Math.max(0, rawValue) };
        });
        const newData = computeHexFromSignals(newSignals, frame.dlc);
        return { ...frame, signals: newSignals, data: newData };
      }),
    );
  }

  function selectCanTestCase(index: number) {
    const testCase = canTestCases[index];
    if (!testCase) return;
    setSelectedCanTestCaseIndex(index);
    setCanTestFrames(normalizeFrames(testCase.frames));
    setCanTestSettingEntries(normalizeSettingEntries(testCase.settingEntries));
    setCanTestStatus(t('canTestData.viewingCase', { id: testCase.caseId, title: testCase.title }));
    setCanTestStatusTone('neutral');
  }

  function fillSignals(mode: 'min' | 'max' | 'random' | 'zero' | 'ff') {
    setCanTestFrames((prev) =>
      prev.map((frame) => {
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
          const displayValue = (rawValue * sig.scaleNum) / sig.scaleDen + sig.offset;
          return { ...sig, rawValue, displayValue };
        });
        const newData = computeHexFromSignals(newSignals, frame.dlc);
        return { ...frame, signals: newSignals, data: newData };
      }),
    );
    const labelKeys: Record<string, string> = {
      zero: 'canTestData.fillStatus.zero',
      min: 'canTestData.fillStatus.min',
      max: 'canTestData.fillStatus.max',
      random: 'canTestData.fillStatus.random',
      ff: 'canTestData.fillStatus.ff',
    };
    setCanTestStatus(t(labelKeys[mode]));
    setCanTestStatusTone('success');
  }

  function exportableCases() {
    return canTestCases.length > 0
      ? canTestCases
      : [
          {
            caseId: 'TC-MANUAL-001',
            title: t('canTestData.manualCaseTitle'),
            scenario: 'manual',
            description: '',
            tags: [],
            frames: canTestFrames,
            settingEntries: canTestSettingEntries,
          },
        ];
  }

  function escapeCsvField(value: string | number) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function frameRows() {
    return exportableCases().flatMap((testCase) =>
      testCase.frames.map((frame) => ({
        caseId: testCase.caseId,
        canId: `0x${frame.id.toString(16).toUpperCase()}`,
        type: frame.frameType,
        name: frame.name,
        dlc: frame.dlc,
        cycleMs: frame.cycleMs,
        dataHex: frame.data,
      })),
    );
  }

  async function exportTxt(loadedProject: LoadedProject | null) {
    if (!loadedProject || canTestFrames.length === 0) {
      setCanTestStatus(t('canTestData.generateFirst'));
      setCanTestStatusTone('error');
      return;
    }
    if (!isTauriRuntime()) {
      setCanTestStatus(t('canTestData.desktopSaveDialogOnly'));
      setCanTestStatusTone('error');
      return;
    }
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: t('canTestData.textFileFilter'), extensions: ['txt'] }] }),
      (message) => {
        setCanTestStatus(message);
        setCanTestStatusTone('error');
      },
    );
    if (typeof selected !== 'string') return;

    const lines: string[] = ['CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX'];
    for (const row of frameRows()) {
      lines.push(`${row.canId},${row.type},${row.name},${row.dlc},${row.cycleMs},${row.dataHex}`);
    }

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(t('canTestData.exported', { path: selected }));
      setCanTestStatusTone('success');
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
      setCanTestStatusTone('error');
    }
  }

  async function exportCsv(loadedProject: LoadedProject | null) {
    if (!loadedProject || canTestFrames.length === 0) {
      setCanTestStatus(t('canTestData.generateFirst'));
      setCanTestStatusTone('error');
      return;
    }
    if (!isTauriRuntime()) {
      setCanTestStatus(t('canTestData.desktopSaveDialogOnly'));
      setCanTestStatusTone('error');
      return;
    }
    const selected = await runSystemDialog(
      () => save({ filters: [{ name: t('canTestData.csvFileFilter'), extensions: ['csv'] }] }),
      (message) => {
        setCanTestStatus(message);
        setCanTestStatusTone('error');
      },
    );
    if (typeof selected !== 'string') return;

    const lines = [
      'CASE_ID,CAN_ID,TYPE,NAME,DLC,CYCLE_MS,DATA_HEX',
      ...frameRows().map((row) =>
        [row.caseId, row.canId, row.type, row.name, row.dlc, row.cycleMs, row.dataHex]
          .map(escapeCsvField)
          .join(','),
      ),
    ];

    try {
      await saveTextFile(selected, lines.join('\n'));
      setCanTestStatus(t('canTestData.exportedCsv', { path: selected }));
      setCanTestStatusTone('success');
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
      setCanTestStatusTone('error');
    }
  }

  async function exportConfig() {
    if (canTestFrames.length === 0) {
      setCanTestStatus(t('canTestData.generateFirst'));
      setCanTestStatusTone('error');
      return;
    }
    if (!isTauriRuntime()) {
      setCanTestStatus(t('canTestData.desktopSaveDialogOnly'));
      setCanTestStatusTone('error');
      return;
    }
    const selected = await runSystemDialog(
      () =>
        save({ filters: [{ name: t('canTestData.configFileFilter'), extensions: ['json'] }] }),
      (message) => {
        setCanTestStatus(message);
        setCanTestStatusTone('error');
      },
    );
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
      setCanTestStatus(t('canTestData.exportedConfig', { path: selected }));
      setCanTestStatusTone('success');
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
      setCanTestStatusTone('error');
    }
  }

  async function importConfig() {
    if (!isTauriRuntime()) {
      setCanTestStatus(t('canTestData.desktopFilePickerOnly'));
      setCanTestStatusTone('error');
      return;
    }
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: t('canTestData.configFileFilter'), extensions: ['json'] }],
        }),
      (message) => {
        setCanTestStatus(message);
        setCanTestStatusTone('error');
      },
    );
    if (typeof selected !== 'string') return;

    try {
      const config = (await loadJsonFile(selected)) as {
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
        setCanTestStatus(t('canTestData.noValidFrames'));
        setCanTestStatusTone('error');
        return;
      }
      setCanTestFrames(normalizeFrames(config.frames));
      setCanTestSettingEntries(normalizeSettingEntries(config.settingEntries));
      setCanTestCases(
        (config.cases ?? []).map((testCase) => ({
          ...testCase,
          frames: normalizeFrames(testCase.frames),
          settingEntries: normalizeSettingEntries(testCase.settingEntries),
        })),
      );
      setCanTestCoverage(config.coverage ?? null);
      setCanTestWarnings(config.warnings ?? []);
      setSelectedCanTestCaseIndex(0);
      if (config.profile) setCanTestProfile(config.profile);
      if (config.defaultCycleMs) setCanTestDefaultCycle(config.defaultCycleMs);
      setCanTestStatus(t('canTestData.importedFrames', { count: config.frames.length }));
      setCanTestStatusTone('success');
    } catch (error) {
      setCanTestStatus(error instanceof Error ? error.message : String(error));
      setCanTestStatusTone('error');
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
    canTestStatusTone,
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
