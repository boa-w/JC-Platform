import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import type {
  BackendHealth,
  BinaryBuildReport,
  BinaryCompareReport,
  BinaryCompareRequest,
  CanTestGenerateResponse,
  ExportPlanReport,
  ExportPlanRequest,
  ExportTableRequest,
  LanguageImportReport,
  LegacyTableKind,
  LegacyTableSpec,
  LoadedProject,
  MigratedProject,
  NewProjectRequest,
  PdoAdvancedParseReport,
  PdoSimpleImportReport,
  ProjectExportReport,
  ProjectParseReport,
  ProjectSummary,
  ProjectValidationReport,
  ProtocolCompatibilityReport,
  SaveProjectAsReport,
  SaveProjectAsRequest,
  SaveProjectRequest,
  SdoImportReport,
  TableDocument,
  TableFileRequest,
  TableValidationReport,
  UiResourceOptionAddRequest,
  UiImageCopyReport,
  UiResourceOptionRemoveRequest,
  UiResourceParseReport,
  UiResourceParseRequest,
  UiResourceUpdateReport,
  UiResourceUpdateRequest,
  UnifiedProtocolModel,
} from '../types/platform';

const fallbackHealth: BackendHealth = {
  app_name: '自定义开发平台',
  version: '0.1.0',
  commit_hash: 'unknown',
  core_status: 'ready',
};

const fallbackProject: ProjectSummary = {
  name: '未打开项目',
  version: '0.1.0',
  deviceResolution: '未加载',
};

export async function getBackendHealth(): Promise<BackendHealth> {
  try {
    return await invoke<BackendHealth>('backend_health');
  } catch {
    return fallbackHealth;
  }
}

export async function getProjectSummary(): Promise<ProjectSummary> {
  try {
    return await invoke<ProjectSummary>('project_summary');
  } catch {
    return fallbackProject;
  }
}

export async function loadProject(path: string): Promise<LoadedProject> {
  return invoke<LoadedProject>('load_project', { path });
}

export async function createProject(request: NewProjectRequest): Promise<LoadedProject> {
  return invoke<LoadedProject>('create_project', { request });
}

export async function saveProject(request: SaveProjectRequest): Promise<LoadedProject> {
  return invoke<LoadedProject>('save_project', { request });
}

export async function saveProjectAs(request: SaveProjectAsRequest): Promise<SaveProjectAsReport> {
  return invoke<SaveProjectAsReport>('save_project_as', { request });
}

export async function validateProjectDocument(document: unknown): Promise<ProjectValidationReport> {
  return invoke<ProjectValidationReport>('validate_project_document', { document });
}

export async function migrateProjectDocument(document: unknown): Promise<MigratedProject> {
  return invoke<MigratedProject>('migrate_project_document', { document });
}

export async function migrateProjectFile(path: string): Promise<MigratedProject> {
  return invoke<MigratedProject>('migrate_project_file', { path });
}

export async function parseProjectDocument(document: unknown): Promise<ProjectParseReport> {
  return invoke<ProjectParseReport>('parse_project_document', { document });
}

export async function parseProjectFile(path: string): Promise<ProjectParseReport> {
  return invoke<ProjectParseReport>('parse_project_file', { path });
}

export async function parseUnifiedProtocolProject(document: unknown): Promise<UnifiedProtocolModel> {
  return invoke<UnifiedProtocolModel>('parse_unified_protocol_project', { document });
}

export async function migrateUnifiedProtocolDocument(document: unknown): Promise<unknown> {
  return invoke<unknown>('migrate_unified_protocol_document', { document });
}

export async function flattenUnifiedProtocolDocument(document: unknown): Promise<ProtocolCompatibilityReport> {
  return invoke<ProtocolCompatibilityReport>('flatten_unified_protocol_document', { document });
}

export async function parseUiResources(document: unknown): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resources', { document });
}

export async function parseUiResourcesWithProjectPath(request: UiResourceParseRequest): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resources_with_project_path', { request });
}

export async function parseUiResourceFile(path: string): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resource_file', { path });
}

export async function updateUiResourceDocument(
  request: UiResourceUpdateRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('update_ui_resource_document', { request });
}

export async function addUiResourceOptionDocument(
  request: UiResourceOptionAddRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('add_ui_resource_option_document', { request });
}

export async function removeUiResourceOptionDocument(
  request: UiResourceOptionRemoveRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('remove_ui_resource_option_document', { request });
}

export async function getLegacyTableSpec(kind: LegacyTableKind): Promise<LegacyTableSpec> {
  return invoke<LegacyTableSpec>('legacy_table_spec', { kind });
}

export async function validateTableHeaders(
  kind: LegacyTableKind,
  headers: string[],
): Promise<TableValidationReport> {
  return invoke<TableValidationReport>('validate_table_headers', { kind, headers });
}

export async function importSdoTable(document: TableDocument): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_table', { document });
}

export async function importSdoCsv(request: TableFileRequest): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_csv', { request });
}

export async function importSdoWorkbook(request: TableFileRequest): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_workbook', { request });
}

export async function importPdoSimpleTable(document: TableDocument): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_table', { document });
}

export async function parsePdoAdvancedProject(document: unknown): Promise<PdoAdvancedParseReport> {
  return invoke<PdoAdvancedParseReport>('parse_pdo_advanced_project', { document });
}

export async function parsePdoAdvancedFile(path: string): Promise<PdoAdvancedParseReport> {
  return invoke<PdoAdvancedParseReport>('parse_pdo_advanced_file', { path });
}

export async function importPdoSimpleCsv(request: TableFileRequest): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_csv', { request });
}

export async function importPdoSimpleWorkbook(request: TableFileRequest): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_workbook', { request });
}

export async function importLanguageTable(document: TableDocument): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_table', { document });
}

export async function importLanguageCsv(request: TableFileRequest): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_csv', { request });
}

export async function importLanguageWorkbook(request: TableFileRequest): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_workbook', { request });
}

export async function exportTableCsv(request: ExportTableRequest): Promise<void> {
  return invoke<void>('export_table_csv', { request });
}

export async function exportTableWorkbook(request: ExportTableRequest): Promise<void> {
  return invoke<void>('export_table_workbook', { request });
}

export async function languageDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('language_document_table', { document });
}

export async function pdoSimpleDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('pdo_simple_document_table', { document });
}

export async function sdoDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('sdo_document_table', { document });
}

export async function buildProjectExportPlan(request: ExportPlanRequest): Promise<ExportPlanReport> {
  return invoke<ExportPlanReport>('build_project_export_plan', { request });
}

export async function exportProjectPackage(request: ExportPlanRequest): Promise<ProjectExportReport> {
  return invoke<ProjectExportReport>('export_project_package_command', { request });
}

export async function copyUiResourceImages(request: ExportPlanRequest): Promise<UiImageCopyReport> {
  return invoke<UiImageCopyReport>('copy_ui_resource_images', { request });
}

export async function compareProjectBinaryReport(
  request: BinaryCompareRequest,
): Promise<BinaryCompareReport> {
  return invoke<BinaryCompareReport>('compare_project_binary_report', { request });
}

export async function buildProjectBinaryReport(document: unknown): Promise<BinaryBuildReport> {
  return invoke<BinaryBuildReport>('build_project_binary_report', { document });
}

export async function revealItemInDir(path: string): Promise<void> {
  return openPath(path);
}

export async function generateCanTestData(document: unknown): Promise<CanTestGenerateResponse> {
  return invoke<CanTestGenerateResponse>('generate_can_test_data', { document });
}

export async function saveTextFile(path: string, content: string): Promise<void> {
  return invoke<void>('save_text_file', { path, content });
}

export async function saveJsonFile(path: string, content: unknown): Promise<void> {
  return invoke<void>('save_json_file', { path, content });
}

export async function loadJsonFile(path: string): Promise<unknown> {
  return invoke<unknown>('load_json_file', { path });
}
