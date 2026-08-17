import { open, save } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  exportTableCsv,
  exportTableWorkbook,
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
import type { LocalizationScope } from '../../components/language/localizationAdapter';
import {
  localizationForScope,
  localizationToLanguageDocument,
  updateLocalizationFromLanguageDocument,
} from '../../components/language/localizationAdapter';
import { useOperationGuard } from '../../hooks/useOperationGuard';
import { legacyTableKindForModule } from '../../modules/documentSections';
import type {
  LanguageDocument,
  LanguageImportReport,
  LegacyTableKind,
  LoadedProject,
  LocalizationDocument,
  NavigationKey,
  PdoSimpleImportReport,
  SdoImportReport,
} from '../../types/platform';
import { runSystemDialog } from '../../utils/systemDialog';
import { readProtocolProfiles } from '../protocol-profiles/protocolProfiles';

export type TableConfigKind = Extract<LegacyTableKind, 'sdo' | 'pdoSimple' | 'language'>;
export type TableImportReport = SdoImportReport | PdoSimpleImportReport | LanguageImportReport;

export const tableConfigSections: Record<TableConfigKind, string> = {
  sdo: 'sdo_info',
  pdoSimple: 'pdo_simple_send_recv',
  language: 'language_info',
};

export const tableConfigTitleKeys: Record<TableConfigKind, string> = {
  sdo: 'tableConfig.titles.sdo',
  pdoSimple: 'tableConfig.titles.pdoSimple',
  language: 'tableConfig.titles.language',
};

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface UseTableConfigControllerOptions {
  activeModuleKey: NavigationKey;
  loadedProject: LoadedProject | null;
  languageScope: LocalizationScope;
  updateProjectSections: (sections: Record<string, unknown>) => void;
}

export function useTableConfigController({
  activeModuleKey,
  loadedProject,
  languageScope,
  updateProjectSections,
}: UseTableConfigControllerOptions) {
  const { t } = useTranslation();
  const [importReport, setImportReport] = useState<TableImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const currentKind = legacyTableKindForModule(activeModuleKey) as TableConfigKind | null;
  const projectDocument = loadedProject?.document ?? null;
  const operationGuard = useOperationGuard(projectDocument);

  useEffect(() => {
    if (!projectDocument) {
      setImportReport(null);
      setImportError(null);
      setExportStatus(null);
    }
    setIsImporting(false);
    setIsExporting(false);
  }, [projectDocument]);

  async function exportableDocument(kind: TableConfigKind, document: unknown) {
    if (kind === 'sdo') return sdoDocumentTable(document);
    if (kind === 'pdoSimple') return pdoSimpleDocumentTable(document);
    return languageDocumentTable(document);
  }

  async function exportTable(kind: TableConfigKind, format: 'csv' | 'xml') {
    setExportStatus(null);
    if (!loadedProject) {
      setExportStatus(t('tableConfig.status.openProjectFirst'));
      return;
    }
    if (!isTauriRuntime()) {
      setExportStatus(t('tableConfig.status.desktopSaveDialogOnly'));
      return;
    }

    const targetProject = loadedProject;
    const operation = operationGuard.begin();
    const path = await runSystemDialog(
      () =>
        save({
          filters: [
            {
              name:
                format === 'csv' ? t('tableConfig.filters.csv') : t('tableConfig.filters.excelXml'),
              extensions: [format],
            },
          ],
        }),
      setExportStatus,
    );
    if (!path) return;
    if (!operationGuard.isCurrent(operation)) return;

    setIsExporting(true);
    try {
      const root = targetProject.document as Record<string, unknown>;
      const document =
        kind === 'language' && root.config_version === 'jc002'
          ? localizationToLanguageDocument(
              localizationForScope(
                root.localization as LocalizationDocument,
                readProtocolProfiles(root) ?? undefined,
                languageScope,
              ),
            )
          : root[tableConfigSections[kind]];
      const table = await exportableDocument(kind, document);
      if (format === 'csv') await exportTableCsv({ path, document: table });
      else await exportTableWorkbook({ path, document: table });
      if (operationGuard.isCurrent(operation))
        setExportStatus(t('tableConfig.status.exported', { path }));
    } catch (error) {
      if (operationGuard.isCurrent(operation)) {
        setExportStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (operationGuard.isCurrent(operation)) setIsExporting(false);
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
      setImportError(t('tableConfig.status.openProjectFirst'));
      return;
    }
    if (!isTauriRuntime()) {
      setImportError(t('tableConfig.status.desktopFilePickerOnly'));
      return;
    }

    const targetProject = loadedProject;
    const operation = operationGuard.begin();
    const selected = await runSystemDialog(
      () =>
        open({
          multiple: false,
          filters: [
            { name: t('tableConfig.filters.table'), extensions: ['csv', 'xls', 'xlsx', 'xml'] },
          ],
        }),
      setImportError,
    );
    if (typeof selected !== 'string') return;
    if (!operationGuard.isCurrent(operation)) return;

    setIsImporting(true);
    try {
      const extension = selected.split('.').pop()?.toLowerCase();
      const report = await importTableDocument(kind, selected, extension === 'csv');
      if (!operationGuard.isCurrent(operation)) return;
      setImportReport(report);
      if (!report.valid || !report.document) {
        setImportError(
          report.errors.join(t('common.punctuation.semicolon')) ||
            t('tableConfig.status.importFailed'),
        );
        return;
      }

      const root = targetProject.document as Record<string, unknown>;
      let section = tableConfigSections[kind];
      let nextDocument: unknown = report.document;
      if (kind === 'language' && root.config_version === 'jc002') {
        section = 'localization';
        const localization = root.localization as LocalizationDocument;
        nextDocument = updateLocalizationFromLanguageDocument(
          localization,
          localizationToLanguageDocument(localization),
          report.document as LanguageDocument,
        );
      }
      updateProjectSections({ [section]: nextDocument });
    } catch (error) {
      if (operationGuard.isCurrent(operation)) {
        setImportError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (operationGuard.isCurrent(operation)) setIsImporting(false);
    }
  }

  return {
    currentKind,
    exportStatus,
    importError,
    importReport,
    isExporting,
    isImporting,
    exportTable,
    importTable,
  };
}

export type TableConfigController = ReturnType<typeof useTableConfigController>;
