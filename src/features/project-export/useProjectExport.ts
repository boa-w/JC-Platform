import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  ProjectExportReport,
  ProjectExportTargetSettings,
  UiImageCopyReport,
} from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';
import { readProtocolProfiles } from '../protocol-profiles/protocolProfiles';
import {
  defaultProjectExportSettings,
  projectDirectory,
  readProjectExportSettings,
} from './exportSettings';

interface UseProjectExportOptions {
  document: unknown;
  projectPath?: string;
  updateProjectDocument: (section: string, value: unknown) => void;
}

type ExportTargetKey = 'battery_monitor' | 'fault_code_info';
type ExportTargetField = keyof ProjectExportTargetSettings;

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useProjectExport({
  document,
  projectPath,
  updateProjectDocument,
}: UseProjectExportOptions) {
  const { t } = useTranslation();
  const [outputDir, setOutputDir] = useState(() => projectDirectory(projectPath));
  const exportSettings = useMemo(() => readProjectExportSettings(document), [document]);
  const protocolProfiles = useMemo(() => readProtocolProfiles(document), [document]);
  const configuredVersion = (document as { config_version?: unknown } | null)?.config_version;
  const supportsV2Extensions = configuredVersion === 'jc002';
  const [exportReport, setExportReport] = useState<ProjectExportReport | null>(null);
  const [imageCopyReport, setImageCopyReport] = useState<UiImageCopyReport | null>(null);
  const [binaryReport, setBinaryReport] = useState<BinaryBuildReport | null>(null);
  const [binaryCompareReport, setBinaryCompareReport] = useState<BinaryCompareReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setOutputDir(projectDirectory(projectPath));
  }, [projectPath]);

  function updateExportSetting(key: keyof typeof exportSettings, value: string) {
    updateProjectDocument('export_info', { ...exportSettings, [key]: value });
  }

  function updateExportTarget(target: ExportTargetKey, field: ExportTargetField, value: boolean) {
    updateProjectDocument('export_info', {
      ...exportSettings,
      [target]: {
        ...exportSettings[target],
        [field]: value,
      },
    });
  }

  function resetExportNaming() {
    const { folder_name, manifest_filename, binary_filename } = defaultProjectExportSettings;
    updateProjectDocument('export_info', {
      ...exportSettings,
      folder_name,
      manifest_filename,
      binary_filename,
    });
  }

  function resetExportSettings() {
    updateProjectDocument('export_info', defaultProjectExportSettings);
  }

  async function copyUiImages() {
    setError(null);
    setImageCopyReport(null);
    try {
      const report = await copyUiResourceImages({
        project_path: projectPath,
        output_dir: outputDir,
        document,
        folder_name: exportSettings.folder_name,
      });
      setImageCopyReport(report);
      if (!report.valid)
        setError(
          report.errors.join(t('common.punctuation.semicolon')) || t('projectExport.errors.uiCopy'),
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function buildBinaryReport() {
    setError(null);
    setBinaryCompareReport(null);
    try {
      const report = await buildProjectBinaryReport(document);
      setBinaryReport(report);
      if (!report.valid)
        setError(
          report.errors.join(t('common.punctuation.semicolon')) ||
            t('projectExport.errors.binaryBuild'),
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function compareBinary() {
    setError(null);
    setBinaryCompareReport(null);
    if (!isTauriRuntime()) {
      setError(t('projectExport.errors.desktopFilePickerOnly'));
      return;
    }

    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [{ name: t('projectExport.filters.binary'), extensions: ['bin'] }],
        }),
      setError,
    );
    if (typeof selected !== 'string') return;

    try {
      const report = await compareProjectBinaryReport({
        document,
        legacy_binary_path: selected,
      });
      setBinaryCompareReport(report);
      setBinaryReport(report.build);
      if (!report.valid || !report.same)
        setError(
          report.errors.join(t('common.punctuation.semicolon')) ||
            t('projectExport.errors.binaryMismatch'),
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function selectOutputDir() {
    setError(null);
    if (!isTauriRuntime()) {
      setError(t('projectExport.errors.desktopDirectoryPickerOnly'));
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
        folder_name: exportSettings.folder_name,
        manifest_filename: exportSettings.manifest_filename,
        binary_filename: exportSettings.binary_filename,
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
    folderName: exportSettings.folder_name,
    setFolderName: (value: string) => updateExportSetting('folder_name', value),
    manifestFilename: exportSettings.manifest_filename,
    setManifestFilename: (value: string) => updateExportSetting('manifest_filename', value),
    binaryFilename: exportSettings.binary_filename,
    setBinaryFilename: (value: string) => updateExportSetting('binary_filename', value),
    batteryMonitorExport: exportSettings.battery_monitor,
    faultCodeExport: exportSettings.fault_code_info,
    protocolProfiles,
    supportsV2Extensions,
    updateExportTarget,
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
    resetExportNaming,
    resetExportSettings,
    exportPackage,
    openExportDir,
  };
}

export type ProjectExportController = ReturnType<typeof useProjectExport>;
