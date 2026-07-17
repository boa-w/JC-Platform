import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import {
  exportTableCsv,
  exportTableWorkbook,
  getLegacyTableSpec,
  importLanguageCsv,
  importLanguageWorkbook,
  importPdoSimpleCsv,
  importPdoSimpleWorkbook,
  importSdoCsv,
  importSdoWorkbook,
  languageDocumentTable,
  pdoSimpleDocumentTable,
  sdoDocumentTable,
} from '../../api/commands';
import { legacyTableKindForModule } from '../../modules/documentSections';
import type {
  LanguageImportReport,
  LegacyTableKind,
  LegacyTableSpec,
  LoadedProject,
  NavigationKey,
  PdoSimpleImportReport,
  SdoImportReport,
} from '../../types/platform';

export type TableConfigKind = Extract<LegacyTableKind, 'sdo' | 'pdoSimple' | 'language'>;
export type TableImportReport = SdoImportReport | PdoSimpleImportReport | LanguageImportReport;

export const tableConfigSections: Record<TableConfigKind, string> = {
  sdo: 'sdo_info',
  pdoSimple: 'pdo_simple_send_recv',
  language: 'language_info',
};

export const tableConfigTitles: Record<TableConfigKind, string> = {
  sdo: 'SDO 参数配置',
  pdoSimple: 'PDO 简化配置',
  language: '多国语言',
};

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseTableConfigControllerOptions {
  activeModuleKey: NavigationKey;
  loadedProject: LoadedProject | null;
  applyLoadedProject: (project: LoadedProject) => void;
}

export function useTableConfigController({
  activeModuleKey,
  loadedProject,
  applyLoadedProject,
}: UseTableConfigControllerOptions) {
  const [specs, setSpecs] = useState<LegacyTableSpec[]>([]);
  const [importReport, setImportReport] = useState<TableImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const currentKind = legacyTableKindForModule(activeModuleKey) as TableConfigKind | null;

  useEffect(() => {
    let active = true;
    void Promise.all([
      getLegacyTableSpec('sdo'),
      getLegacyTableSpec('pdoSimple'),
      getLegacyTableSpec('language'),
    ])
      .then((nextSpecs) => {
        if (active) setSpecs(nextSpecs);
      })
      .catch(() => {
        if (active && isTauriRuntime()) setImportError('表格格式规格加载失败，请重试。');
      });
    return () => {
      active = false;
    };
  }, []);

  async function exportableDocument(kind: TableConfigKind, document: unknown) {
    if (kind === 'sdo') return sdoDocumentTable(document);
    if (kind === 'pdoSimple') return pdoSimpleDocumentTable(document);
    return languageDocumentTable(document);
  }

  async function exportTable(kind: TableConfigKind, format: 'csv' | 'xml') {
    setExportStatus(null);
    if (!loadedProject) {
      setExportStatus('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setExportStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }

    const path = await save({
      filters: [{ name: format === 'csv' ? 'CSV 表格' : 'Excel XML 表格', extensions: [format] }],
    });
    if (!path) return;

    setIsExporting(true);
    try {
      const document = (loadedProject.document as Record<string, unknown>)[tableConfigSections[kind]];
      const table = await exportableDocument(kind, document);
      if (format === 'csv') await exportTableCsv({ path, document: table });
      else await exportTableWorkbook({ path, document: table });
      setExportStatus(`已导出：${path}`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExporting(false);
    }
  }

  async function importTableDocument(kind: TableConfigKind, path: string, isCsv: boolean) {
    if (kind === 'sdo') return isCsv ? importSdoCsv({ path }) : importSdoWorkbook({ path });
    if (kind === 'pdoSimple') {
      return isCsv ? importPdoSimpleCsv({ path }) : importPdoSimpleWorkbook({ path });
    }
    return isCsv ? importLanguageCsv({ path }) : importLanguageWorkbook({ path });
  }

  async function importTable(kind: TableConfigKind) {
    setImportError(null);
    setImportReport(null);
    if (!loadedProject) {
      setImportError('请先打开 .jcpro 项目。');
      return;
    }
    if (!isTauriRuntime()) {
      setImportError('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: '表格文件', extensions: ['csv', 'xls', 'xlsx', 'xml'] }],
    });
    if (typeof selected !== 'string') return;

    setIsImporting(true);
    try {
      const extension = selected.split('.').pop()?.toLowerCase();
      const report = await importTableDocument(kind, selected, extension === 'csv');
      setImportReport(report);
      if (!report.valid || !report.document) {
        setImportError(report.errors.join('；') || '表格导入失败');
        return;
      }

      applyLoadedProject({
        ...loadedProject,
        document: {
          ...(loadedProject.document as Record<string, unknown>),
          [tableConfigSections[kind]]: report.document,
        },
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  }

  return {
    currentKind,
    exportStatus,
    importError,
    importReport,
    isExporting,
    isImporting,
    specs,
    exportTable,
    importTable,
  };
}

export type TableConfigController = ReturnType<typeof useTableConfigController>;
