import { open } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { exportCanopenPackage, revealItemInDir } from '../../api/commands';
import type { CanopenConversionReport, LoadedProject } from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useCanopenExport(loadedProject: LoadedProject | null) {
  const [report, setReport] = useState<CanopenConversionReport | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exportDir, setExportDir] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function exportPackage() {
    setStatus(null);
    setReport(null);
    setExportDir(null);

    if (!loadedProject) {
      setStatus('请先打开项目，再导出 CANopen 转换包。');
      return;
    }
    if (!isTauriRuntime()) {
      setStatus('系统目录选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await runSystemDialog(
      () => open({ directory: true, multiple: false }),
      setStatus,
    );
    if (typeof selected !== 'string') return;

    setIsExporting(true);
    try {
      const nextReport = await exportCanopenPackage(selected, loadedProject.document);
      const nextExportDir = `${selected}\\canopen_export`;
      setReport(nextReport);
      setExportDir(nextExportDir);
      setStatus(
        `已导出 CANopen 转换包：${nextReport.files.length} 个文件，${nextReport.nodes.length} 个节点，${nextReport.warnings.length} 条提示。`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
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
    }
  }

  return {
    exportDir,
    exportPackage,
    isExporting,
    openExportDir,
    report,
    status,
  };
}
