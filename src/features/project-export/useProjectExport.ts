import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import {
  buildProjectBinaryReport,
  compareProjectBinaryReport,
  copyUiResourceImages,
  exportProjectPackage,
  revealItemInDir,
} from '../../api/commands';
import type {
  BinaryBuildReport,
  BinaryCompareReport,
  ExportBatteryOptions,
  ProjectExportReport,
  UiImageCopyReport,
} from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';

interface UseProjectExportOptions {
  document: unknown;
  projectPath?: string;
  exportOptions: ExportBatteryOptions;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useProjectExport({
  document,
  projectPath,
  exportOptions,
}: UseProjectExportOptions) {
  const [outputDir, setOutputDir] = useState('jc-export');
  const [manifestFilename, setManifestFilename] = useState('ConfigUpdate.json');
  const [binaryFilename, setBinaryFilename] = useState('pdo_sdo_data.bin');
  const [exportReport, setExportReport] = useState<ProjectExportReport | null>(null);
  const [imageCopyReport, setImageCopyReport] = useState<UiImageCopyReport | null>(null);
  const [binaryReport, setBinaryReport] = useState<BinaryBuildReport | null>(null);
  const [binaryCompareReport, setBinaryCompareReport] = useState<BinaryCompareReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function copyUiImages() {
    setError(null);
    setImageCopyReport(null);
    try {
      const report = await copyUiResourceImages({
        project_path: projectPath,
        output_dir: outputDir,
        document,
      });
      setImageCopyReport(report);
      if (!report.valid) setError(report.errors.join('；') || 'UI 图片复制存在问题');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function buildBinaryReport() {
    setError(null);
    setBinaryCompareReport(null);
    try {
      const report = await buildProjectBinaryReport(document, exportOptions);
      setBinaryReport(report);
      if (!report.valid) setError(report.errors.join('；') || '二进制构建报告存在问题');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function compareBinary() {
    setError(null);
    setBinaryCompareReport(null);
    if (!isTauriRuntime()) {
      setError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: '设备二进制', extensions: ['bin'] }],
        }),
      setError,
    );
    if (typeof selected !== 'string') return;

    try {
      const report = await compareProjectBinaryReport({
        document,
        legacy_binary_path: selected,
        export_options: exportOptions,
      });
      setBinaryCompareReport(report);
      setBinaryReport(report.build);
      if (!report.valid || !report.same) setError(report.errors.join('；') || '新旧二进制不一致');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function selectOutputDir() {
    setError(null);
    if (!isTauriRuntime()) {
      setError('系统目录选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await runSystemDialog(
      () => open({ directory: true, multiple: false }),
      setError,
    );
    if (typeof selected === 'string') setOutputDir(selected);
  }

  async function exportPackage() {
    setIsExporting(true);
    setError(null);
    setExportReport(null);
    try {
      const report = await exportProjectPackage({
        project_path: projectPath,
        output_dir: outputDir,
        document,
        manifest_filename: manifestFilename,
        binary_filename: binaryFilename,
        export_options: exportOptions,
      });
      setExportReport(report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsExporting(false);
    }
  }

  async function openExportDir(dirPath: string) {
    try {
      await revealItemInDir(dirPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return {
    outputDir,
    setOutputDir,
    manifestFilename,
    setManifestFilename,
    binaryFilename,
    setBinaryFilename,
    exportReport,
    imageCopyReport,
    binaryReport,
    binaryCompareReport,
    error,
    isExporting,
    copyUiImages,
    buildBinaryReport,
    compareBinary,
    selectOutputDir,
    exportPackage,
    openExportDir,
  };
}

export type ProjectExportController = ReturnType<typeof useProjectExport>;
