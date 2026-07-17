import { save } from '@tauri-apps/plugin-dialog';
import { useCallback, useState } from 'react';
import { saveTextFile } from '../api/commands';
import { buildDiagnosticReport, recordRuntimeDiagnostic } from '../lib/runtimeDiagnostics';
import type { BackendHealth, NavigationKey, ProjectSummary } from '../types/platform';
import { runSystemDialog } from '../utils/systemDialog';

interface UseDiagnosticExportOptions {
  activeModule: NavigationKey;
  theme: 'light' | 'dark';
  health: BackendHealth | null;
  project: ProjectSummary | null;
}

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function diagnosticFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `JC-Platform-diagnostics-${stamp}.json`;
}

export function useDiagnosticExport(options: UseDiagnosticExportOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportDiagnostics = useCallback(async () => {
    setMessage(null);
    setError(null);
    if (!isTauriRuntime()) {
      setError('诊断报告只能在 Tauri 桌面应用中导出。');
      return;
    }

    const selected = await runSystemDialog(
      () =>
        save({
          defaultPath: diagnosticFileName(),
          filters: [{ name: '诊断报告', extensions: ['json'] }],
        }),
      setError,
    );
    if (!selected) return;

    setIsExporting(true);
    try {
      const report = buildDiagnosticReport(options);
      await saveTextFile(selected, `${JSON.stringify(report, null, 2)}\n`);
      setMessage(`诊断报告已导出：${selected}`);
      recordRuntimeDiagnostic('info', 'diagnostics.export', '诊断报告已导出');
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : String(cause);
      setError(nextError);
      recordRuntimeDiagnostic('error', 'diagnostics.export', cause);
    } finally {
      setIsExporting(false);
    }
  }, [options]);

  return { error, exportDiagnostics, isExporting, message };
}
