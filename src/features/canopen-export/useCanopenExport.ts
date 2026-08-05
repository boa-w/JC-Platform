import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportCanopenPackage, revealItemInDir } from '../../api/commands';
import type { CanopenConversionReport, LoadedProject } from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useCanopenExport(loadedProject: LoadedProject | null) {
  const { t } = useTranslation();
  const [report, setReport] = useState<CanopenConversionReport | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'error' | null>(null);
  const [exportDir, setExportDir] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function exportPackage() {
    setStatus(null);
    setStatusTone(null);
    setReport(null);
    setExportDir(null);

    if (!loadedProject) {
      setStatus(t('canopenExport.openProjectFirst'));
      setStatusTone('error');
      return;
    }
    if (!isTauriRuntime()) {
      setStatus(t('canopenExport.desktopDirectoryPickerOnly'));
      setStatusTone('error');
      return;
    }

    const selected = await runSystemDialog(
      () => open({ directory: true, multiple: false }),
      (message) => {
        setStatus(message);
        setStatusTone('error');
      },
    );
    if (typeof selected !== 'string') return;

    setIsExporting(true);
    try {
      const nextReport = await exportCanopenPackage(selected, loadedProject.document);
      const nextExportDir = `${selected}\\canopen_export`;
      setReport(nextReport);
      setExportDir(nextExportDir);
      setStatus(
        t('canopenExport.success', {
          files: nextReport.files.length,
          nodes: nextReport.nodes.length,
          warnings: nextReport.warnings.length,
        }),
      );
      setStatusTone('success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setStatusTone('error');
    } finally {
      setIsExporting(false);
    }
  }

  async function openExportDir() {
    if (!exportDir) return;
    try {
      await revealItemInDir(exportDir);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setStatusTone('error');
    }
  }

  return {
    exportDir,
    exportPackage,
    isExporting,
    openExportDir,
    report,
    status,
    statusTone,
  };
}
