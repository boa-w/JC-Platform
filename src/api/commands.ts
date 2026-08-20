/**
 * 前端唯一 IPC 出入口:对所有 Tauri 后端命令的轻量封装。
 *
 * 每个函数对应一个 Rust `#[tauri::command]`(命令名见注释)。前端业务代码
 * 一律通过本模块与后端交互,不允许直接调用 `invoke()`。
 *
 * 浏览器预览模式(非 Tauri 运行,见 `isTauriRuntime`)下:
 * - 部分命令提供本地 fallback(健康检查、项目摘要等),保证 UI 可预览;
 * - 其余命令直接向后端 invoke,在浏览器中运行会抛错并进入各页面的降级路径。
 */
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir as revealPathInDir } from '@tauri-apps/plugin-opener';
import type {
  BackendHealth,
  BaiduTranslateRequest,
  BaiduTranslateResponse,
  BatteryMonitorFrame,
  BatteryMonitorSignal,
  BinaryBuildReport,
  BinaryCompareReport,
  BinaryCompareRequest,
  CanopenConversionReport,
  CanTestGenerateResponse,
  DbcImportReport,
  ExportPlanReport,
  ExportPlanRequest,
  ExportTableRequest,
  GitCommitReport,
  GitCommitRequest,
  GitProjectContext,
  GitProjectRequest,
  GitProjectStatus,
  GitReviewReport,
  GitRevision,
  GitRevisionSnapshot,
  GitWorktreeFileContent,
  LanguageImportReport,
  LegacyTableKind,
  LegacyTableSpec,
  LoadedProject,
  MigratedProject,
  NewProjectRequest,
  PdoAdvancedParseReport,
  PdoSimpleConversionReport,
  PdoSimpleImportReport,
  ProjectExportReport,
  ProjectParseReport,
  ProjectRecoveryDraft,
  ProjectSummary,
  ProjectValidationReport,
  ProjectWindowOpenResult,
  ProtocolCompatibilityReport,
  SaveProjectAsReport,
  SaveProjectAsRequest,
  SaveProjectRequest,
  SaveTranslationCredentialsRequest,
  SdoImportReport,
  SingleLanguageCsvImportRequest,
  SingleLanguageImportReport,
  TableDocument,
  TableFileRequest,
  TableValidationReport,
  TranslationCredentialStatus,
  UiImageCopyReport,
  UiResourceOptionAddRequest,
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
  core_status: 'browser-preview',
};

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const fallbackProject: ProjectSummary = {
  name: '未打开项目',
  version: '0.1.0',
  deviceResolution: '未加载',
};

/**
 * 调用后端命令 `backend_health` 获取运行状态。
 * 非 Tauri 环境返回 fallbackHealth;Tauri 环境但命令失败时返回 core_status='unavailable' 的副本。
 * @returns 后端健康报告
 */
export async function getBackendHealth(): Promise<BackendHealth> {
  try {
    return await invoke<BackendHealth>('backend_health');
  } catch {
    return isTauriRuntime() ? { ...fallbackHealth, core_status: 'unavailable' } : fallbackHealth;
  }
}

/**
 * 调用后端命令 `project_summary` 获取当前打开项目摘要。
 * 非 Tauri 环境返回 fallbackProject。
 * @returns 当前项目摘要
 */
export async function getProjectSummary(): Promise<ProjectSummary> {
  try {
    return await invoke<ProjectSummary>('project_summary');
  } catch {
    return fallbackProject;
  }
}

/**
 * 调用后端命令 `take_pending_project_path` 取出待打开的项目路径(单次消费)。
 * 用于应用启动时通过系统打开方式传入的 .jcpro。
 * @returns 待打开路径;无待处理项时返回 null
 */
export async function takePendingProjectPath(): Promise<string | null> {
  return invoke<string | null>('take_pending_project_path');
}

/**
 * 调用后端命令 `open_project_window`,为已存在项目打开/聚焦独立窗口。
 * @param path - 项目文件绝对路径
 * @returns 窗口动作结果
 */
export async function openProjectWindow(path: string): Promise<ProjectWindowOpenResult> {
  return invoke<ProjectWindowOpenResult>('open_project_window', { path });
}

/**
 * 调用后端命令 `create_project_window`,创建新项目并打开独立窗口。
 * @param request - 新建项目参数(路径、名称、分辨率)
 * @returns 窗口动作结果
 */
export async function createProjectWindow(
  request: NewProjectRequest,
): Promise<ProjectWindowOpenResult> {
  return invoke<ProjectWindowOpenResult>('create_project_window', { request });
}

/**
 * 调用后端命令 `release_project_window`,释放指定项目路径关联的窗口。
 * @param path - 项目文件绝对路径
 */
export async function releaseProjectWindow(path: string): Promise<void> {
  return invoke<void>('release_project_window', { path });
}

/**
 * 调用后端命令 `inspect_project_git`,检查项目目录的 git 仓库状态。
 * @param request - 项目路径(含可选 v1 sidecar)
 * @returns git 状态快照(不可用时 available=false)
 */
export async function inspectProjectGit(request: GitProjectRequest): Promise<GitProjectStatus> {
  return invoke<GitProjectStatus>('inspect_project_git', { request });
}

/**
 * 调用后端命令 `load_project_git_context`,加载 git 状态与提交历史。
 * @param request - 项目路径
 * @param limit - 历史条数上限,默认 20
 * @returns 状态 + 提交历史
 */
export async function loadProjectGitContext(
  request: GitProjectRequest,
  limit = 20,
): Promise<GitProjectContext> {
  return invoke<GitProjectContext>('load_project_git_context', { request, limit });
}

/**
 * 调用后端命令 `list_project_git_revisions` 列举提交历史。
 * @param request - 项目路径
 * @param limit - 条数上限,默认 20
 * @returns 提交历史列表
 */
export async function listProjectGitRevisions(
  request: GitProjectRequest,
  limit = 20,
): Promise<GitRevision[]> {
  return invoke<GitRevision[]>('list_project_git_revisions', { request, limit });
}

/**
 * 调用后端命令 `load_project_git_revision`,读取某历史提交中的项目文档快照。
 * @param request - 项目路径
 * @param revision - 提交 hash
 * @returns 该提交的文档与可选 sidecar 快照
 */
export async function loadProjectGitRevision(
  request: GitProjectRequest,
  revision: string,
): Promise<GitRevisionSnapshot> {
  return invoke<GitRevisionSnapshot>('load_project_git_revision', { request, revision });
}

/**
 * 调用后端命令 `commit_project_git_version`,为当前项目提交一个版本快照。
 * @param request - 项目路径 + 提交消息
 * @returns 提交结果报告
 */
export async function commitProjectGitVersion(request: GitCommitRequest): Promise<GitCommitReport> {
  return invoke<GitCommitReport>('commit_project_git_version', { request });
}

/**
 * 调用后端命令 `review_project_git_changes`,审阅工作区未提交改动。
 * @param request - 项目路径
 * @returns 差分报告
 */
export async function reviewProjectGitChanges(
  request: GitProjectRequest,
): Promise<GitReviewReport> {
  return invoke<GitReviewReport>('review_project_git_changes', { request });
}

/**
 * 调用后端命令 `review_project_git_revision`,审阅某历史提交相对其父提交的改动。
 * @param request - 项目路径
 * @param revision - 提交 hash
 * @returns 差分报告
 */
export async function reviewProjectGitRevision(
  request: GitProjectRequest,
  revision: string,
): Promise<GitReviewReport> {
  return invoke<GitReviewReport>('review_project_git_revision', { request, revision });
}

/**
 * 调用后端命令 `load_project_git_worktree_file`,读取工作区文件的原始与当前内容。
 * @param request - 项目路径
 * @param path - 相对仓库根的文件路径
 * @returns 编辑态文件内容
 */
export async function loadProjectGitWorktreeFile(
  request: GitProjectRequest,
  path: string,
): Promise<GitWorktreeFileContent> {
  return invoke<GitWorktreeFileContent>('load_project_git_worktree_file', { request, path });
}

/**
 * 调用后端命令 `save_project_git_worktree_file`,写回工作区文件内容(不自动提交)。
 * @param request - 项目路径
 * @param path - 相对仓库根的文件路径
 * @param content - 新内容
 */
export async function saveProjectGitWorktreeFile(
  request: GitProjectRequest,
  path: string,
  content: string,
): Promise<void> {
  return invoke<void>('save_project_git_worktree_file', { request, path, content });
}

/**
 * 调用后端命令 `load_project` 加载 .jcpro 项目。
 * @param path - 项目文件绝对路径
 * @returns 加载结果(摘要 + 校验 + 文档)
 */
export async function loadProject(path: string): Promise<LoadedProject> {
  return invoke<LoadedProject>('load_project', { path });
}

/**
 * 调用后端命令 `create_project` 创建新 .jcpro 项目。
 * @param request - 新项目参数
 * @returns 加载后的项目
 */
export async function createProject(request: NewProjectRequest): Promise<LoadedProject> {
  return invoke<LoadedProject>('create_project', { request });
}

/**
 * 调用后端命令 `save_project` 保存项目文档到原路径。
 * @param request - 保存路径 + 文档
 * @returns 保存后的项目
 */
export async function saveProject(request: SaveProjectRequest): Promise<LoadedProject> {
  return invoke<LoadedProject>('save_project', { request });
}

/**
 * 调用后端命令 `save_project_as_locked`(锁定窗口下的另存为)。
 * 会同时迁移资源文件,并将写锁绑定到目标路径。
 * @param request - 另存为参数(源/目标路径 + 文档)
 * @returns 另存为报告(含复制的资源列表)
 */
export async function saveProjectAs(request: SaveProjectAsRequest): Promise<SaveProjectAsReport> {
  return invoke<SaveProjectAsReport>('save_project_as_locked', { request });
}

/**
 * 调用后端命令 `validate_project_document`,对内存中的文档做结构校验。
 * @param document - 待校验的项目文档
 * @returns 校验报告
 */
export async function validateProjectDocument(document: unknown): Promise<ProjectValidationReport> {
  return invoke<ProjectValidationReport>('validate_project_document', { document });
}

/**
 * 调用后端命令 `migrate_project_document`,将内存文档迁移到目标配置版本。
 * @param document - 待迁移文档
 * @returns 迁移结果(含新增 section 与迁移后版本)
 */
export async function migrateProjectDocument(document: unknown): Promise<MigratedProject> {
  return invoke<MigratedProject>('migrate_project_document', { document });
}

/**
 * 调用后端命令 `migrate_project_file`,迁移磁盘上的 .jcpro 文件。
 * @param path - 项目文件绝对路径
 * @returns 迁移结果
 */
export async function migrateProjectFile(path: string): Promise<MigratedProject> {
  return invoke<MigratedProject>('migrate_project_file', { path });
}

/**
 * 调用后端命令 `parse_project_document`,解析并校验内存文档。
 * @param document - 待解析文档
 * @returns 解析报告(document 解析失败时为 null)
 */
export async function parseProjectDocument(document: unknown): Promise<ProjectParseReport> {
  return invoke<ProjectParseReport>('parse_project_document', { document });
}

/**
 * 调用后端命令 `parse_project_file`,解析并校验磁盘上的 .jcpro 文件。
 * @param path - 项目文件绝对路径
 * @returns 解析报告
 */
export async function parseProjectFile(path: string): Promise<ProjectParseReport> {
  return invoke<ProjectParseReport>('parse_project_file', { path });
}

/**
 * 调用后端命令 `parse_unified_protocol_project`,从文档构建统一协议模型
 * (信号字典 + CANopen + 锂电监控 + 私有帧 + 映射)。
 * @param document - 项目文档
 * @returns 统一协议模型(含交叉校验结果)
 */
export async function parseUnifiedProtocolProject(
  document: unknown,
): Promise<UnifiedProtocolModel> {
  return invoke<UnifiedProtocolModel>('parse_unified_protocol_project', { document });
}

/**
 * 调用后端命令 `migrate_unified_protocol_document`,将 legacy 协议结构迁移到统一模型。
 * @param document - 待迁移文档
 * @returns 迁移后的统一模型文档
 */
export async function migrateUnifiedProtocolDocument(document: unknown): Promise<unknown> {
  return invoke<unknown>('migrate_unified_protocol_document', { document });
}

/**
 * 调用后端命令 `flatten_unified_protocol_document`,将统一协议模型扁平化为
 * 项目顶层各 section(jc002 持久化所需的展开)。
 * @param document - 统一协议模型文档
 * @returns 兼容性报告(含更新后的 document 与 errors/warnings)
 */
export async function flattenUnifiedProtocolDocument(
  document: unknown,
): Promise<ProtocolCompatibilityReport> {
  return invoke<ProtocolCompatibilityReport>('flatten_unified_protocol_document', { document });
}

/**
 * 调用后端命令 `parse_ui_resources`,解析文档中的 UI 资源(logo/主页)。
 * @param document - 项目文档
 * @returns 解析报告(含 ParsedUiResource 列表)
 */
export async function parseUiResources(document: unknown): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resources', { document });
}

/**
 * 调用后端命令 `parse_ui_resources_with_project_path`,按项目路径解析 UI 资源
 * (相对路径可定位磁盘资源)。
 * @param request - 项目路径 + 文档
 * @returns 解析报告
 */
export async function parseUiResourcesWithProjectPath(
  request: UiResourceParseRequest,
): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resources_with_project_path', { request });
}

/**
 * 调用后端命令 `parse_ui_resource_file`,从磁盘文件解析 UI 资源。
 * @param path - 项目文件绝对路径
 * @returns 解析报告
 */
export async function parseUiResourceFile(path: string): Promise<UiResourceParseReport> {
  return invoke<UiResourceParseReport>('parse_ui_resource_file', { path });
}

/**
 * 调用后端命令 `update_ui_resource_document`,更新 UI 资源的位置与默认选项。
 * @param request - 更新参数(文档 + 资源 key + 几何 + default_option)
 * @returns 更新后的文档报告
 */
export async function updateUiResourceDocument(
  request: UiResourceUpdateRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('update_ui_resource_document', { request });
}

/**
 * 调用后端命令 `add_ui_resource_option_document`,为 UI 资源新增可选图片集。
 * @param request - 文档 + 资源 key + 源图片路径列表
 * @returns 更新后的文档报告
 */
export async function addUiResourceOptionDocument(
  request: UiResourceOptionAddRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('add_ui_resource_option_document', { request });
}

/**
 * 调用后端命令 `remove_ui_resource_option_document`,移除 UI 资源的某个可选图片集。
 * @param request - 文档 + 资源 key + 选项索引
 * @returns 更新后的文档报告
 */
export async function removeUiResourceOptionDocument(
  request: UiResourceOptionRemoveRequest,
): Promise<UiResourceUpdateReport> {
  return invoke<UiResourceUpdateReport>('remove_ui_resource_option_document', { request });
}

/**
 * 调用后端命令 `legacy_table_spec`,获取旧版表格的期望表头规范。
 * @param kind - 表格种类(sdo/pdoSimple/language)
 * @returns 表头规范
 */
export async function getLegacyTableSpec(kind: LegacyTableKind): Promise<LegacyTableSpec> {
  return invoke<LegacyTableSpec>('legacy_table_spec', { kind });
}

/**
 * 调用后端命令 `validate_table_headers`,校验表头是否符合对应表格规范。
 * @param kind - 表格种类
 * @param headers - 待校验的表头
 * @returns 表头校验报告
 */
export async function validateTableHeaders(
  kind: LegacyTableKind,
  headers: string[],
): Promise<TableValidationReport> {
  return invoke<TableValidationReport>('validate_table_headers', { kind, headers });
}

/**
 * 调用后端命令 `import_sdo_table`,将二维表格转换为 SDO 文档。
 * @param document - 表格文档
 * @returns SDO 导入报告
 */
export async function importSdoTable(document: TableDocument): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_table', { document });
}

/**
 * 调用后端命令 `import_sdo_csv`,从 CSV 文件导入 SDO 表。
 * @param request - CSV 文件路径
 * @returns SDO 导入报告
 */
export async function importSdoCsv(request: TableFileRequest): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_csv', { request });
}

/**
 * 调用后端命令 `import_sdo_workbook`,从 Excel 工作簿导入 SDO 表。
 * @param request - Excel 文件路径
 * @returns SDO 导入报告
 */
export async function importSdoWorkbook(request: TableFileRequest): Promise<SdoImportReport> {
  return invoke<SdoImportReport>('import_sdo_workbook', { request });
}

/**
 * 调用后端命令 `import_pdo_simple_table`,将二维表格转换为 v1 简化 PDO 文档。
 * @param document - 表格文档
 * @returns PDO 导入报告
 */
export async function importPdoSimpleTable(
  document: TableDocument,
): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_table', { document });
}

/**
 * 调用后端命令 `convert_pdo_simple_project`,将 v1 简化 PDO 转换为 jc002 advanced PDO。
 * @param document - 项目文档(v1 PDO 结构)
 * @returns 转换报告(含 advanced 文档)
 */
export async function convertPdoSimpleProject(
  document: unknown,
): Promise<PdoSimpleConversionReport> {
  return invoke<PdoSimpleConversionReport>('convert_pdo_simple_project', { document });
}

/**
 * 调用后端命令 `parse_pdo_advanced_project`,解析文档中的 advanced PDO。
 * @param document - 项目文档
 * @returns advanced PDO 解析报告
 */
export async function parsePdoAdvancedProject(document: unknown): Promise<PdoAdvancedParseReport> {
  return invoke<PdoAdvancedParseReport>('parse_pdo_advanced_project', { document });
}

/**
 * 调用后端命令 `parse_pdo_advanced_file`,从磁盘 .jcpro 解析 advanced PDO。
 * @param path - 项目文件绝对路径
 * @returns advanced PDO 解析报告
 */
export async function parsePdoAdvancedFile(path: string): Promise<PdoAdvancedParseReport> {
  return invoke<PdoAdvancedParseReport>('parse_pdo_advanced_file', { path });
}

/**
 * 调用后端命令 `import_pdo_simple_csv`,从 CSV 文件导入 v1 简化 PDO 表。
 * @param request - CSV 文件路径
 * @returns PDO 导入报告
 */
export async function importPdoSimpleCsv(
  request: TableFileRequest,
): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_csv', { request });
}

/**
 * 调用后端命令 `import_pdo_simple_workbook`,从 Excel 工作簿导入 v1 简化 PDO 表。
 * @param request - Excel 文件路径
 * @returns PDO 导入报告
 */
export async function importPdoSimpleWorkbook(
  request: TableFileRequest,
): Promise<PdoSimpleImportReport> {
  return invoke<PdoSimpleImportReport>('import_pdo_simple_workbook', { request });
}

/**
 * 调用后端命令 `import_language_table`，将二维表格转换为语言编辑器投影。
 * @param document - 表格文档
 * @returns 语言导入报告
 */
export async function importLanguageTable(document: TableDocument): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_table', { document });
}

/**
 * 调用后端命令 `import_language_csv`,从 CSV 文件导入语言表。
 * @param request - CSV 文件路径
 * @returns 语言导入报告
 */
export async function importLanguageCsv(request: TableFileRequest): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_csv', { request });
}

/**
 * 调用后端命令 `import_language_workbook`,从 Excel 工作簿导入语言表。
 * @param request - Excel 文件路径
 * @returns 语言导入报告
 */
export async function importLanguageWorkbook(
  request: TableFileRequest,
): Promise<LanguageImportReport> {
  return invoke<LanguageImportReport>('import_language_workbook', { request });
}

/**
 * 调用后端命令 `import_single_language_csv`,将单语言 CSV 填入指定语言的翻译数据。
 * @param request - 文件路径 + 目标语言编码 + 基础语言文档
 * @returns 单语言导入统计报告
 */
export async function importSingleLanguageCsv(
  request: SingleLanguageCsvImportRequest,
): Promise<SingleLanguageImportReport> {
  return invoke<SingleLanguageImportReport>('import_single_language_csv', { request });
}

/**
 * 调用后端命令 `export_table_csv`,将表格文档导出为 CSV 文件。
 * @param request - 导出路径 + 表格文档
 */
export async function exportTableCsv(request: ExportTableRequest): Promise<void> {
  return invoke<void>('export_table_csv', { request });
}

/**
 * 调用后端命令 `export_table_workbook`,将表格文档导出为 Excel 工作簿。
 * @param request - 导出路径 + 表格文档
 */
export async function exportTableWorkbook(request: ExportTableRequest): Promise<void> {
  return invoke<void>('export_table_workbook', { request });
}

/**
 * 调用后端命令 `language_document_table`，将语言编辑器投影为二维表格。
 * @param document - 语言文档
 * @returns 表格文档
 */
export async function languageDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('language_document_table', { document });
}

/**
 * 调用后端命令 `translate_baidu_text`,调用百度翻译批量翻译文本。
 * @param request - 翻译参数(源/目标语言 + 文本列表)
 * @returns 与请求顺序对应的译文
 */
export async function translateBaiduText(
  request: BaiduTranslateRequest,
): Promise<BaiduTranslateResponse> {
  return invoke<BaiduTranslateResponse>('translate_baidu_text', { request });
}

/**
 * 调用后端命令 `translation_credentials_status`,查询百度翻译凭据状态。
 * @returns 凭据状态(appId + 是否有 appKey)
 */
export async function getTranslationCredentialStatus(): Promise<TranslationCredentialStatus> {
  return invoke<TranslationCredentialStatus>('translation_credentials_status');
}

/**
 * 调用后端命令 `save_translation_credentials`,保存百度翻译凭据到系统 keyring。
 * @param request - appId 与 appKey;appKey 为 null 时可能导致存储完整性报错
 * @returns 保存后的凭据状态
 */
export async function saveTranslationCredentials(
  request: SaveTranslationCredentialsRequest,
): Promise<TranslationCredentialStatus> {
  return invoke<TranslationCredentialStatus>('save_translation_credentials', { request });
}

/**
 * 调用后端命令 `clear_translation_credentials`,清除系统 keyring 中的翻译凭据。
 */
export async function clearTranslationCredentials(): Promise<void> {
  return invoke<void>('clear_translation_credentials');
}

/**
 * 调用后端命令 `load_project_recovery_draft`,加载最近的异常退出恢复草稿。
 * @returns 恢复草稿;无草稿时返回 null
 */
export async function loadProjectRecoveryDraft(): Promise<ProjectRecoveryDraft | null> {
  return invoke<ProjectRecoveryDraft | null>('load_project_recovery_draft');
}

/**
 * 调用后端命令 `save_project_recovery_draft`,保存恢复草稿。
 * @param draft - 草稿内容(文档快照 + 项目路径)
 */
export async function saveProjectRecoveryDraft(draft: ProjectRecoveryDraft): Promise<void> {
  return invoke<void>('save_project_recovery_draft', { draft });
}

/**
 * 调用后端命令 `clear_project_recovery_draft`,清除指定项目的恢复草稿。
 * @param projectPath - 项目绝对路径;缺省时由后端决定清理范围
 * @returns 是否发生了清理
 */
export async function clearProjectRecoveryDraft(projectPath?: string): Promise<boolean> {
  return invoke<boolean>('clear_project_recovery_draft', { projectPath: projectPath ?? null });
}

/**
 * 调用后端命令 `pdo_simple_document_table`,将 v1 简化 PDO 文档投影为二维表格。
 * @param document - v1 PDO 文档
 * @returns 表格文档
 */
export async function pdoSimpleDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('pdo_simple_document_table', { document });
}

/**
 * 调用后端命令 `sdo_document_table`,将 SDO 文档投影为二维表格。
 * @param document - SDO 文档
 * @returns 表格文档
 */
export async function sdoDocumentTable(document: unknown): Promise<TableDocument> {
  return invoke<TableDocument>('sdo_document_table', { document });
}

/**
 * 调用后端命令 `build_project_export_plan`,先规划发布包结构(不写盘),供预览与确认。
 * @param request - 导出参数(输出目录 + 文档 + 可配置文件名)
 * @returns 导出计划(目录、清单、二进制与屏幕资源描述)
 */
export async function buildProjectExportPlan(
  request: ExportPlanRequest,
): Promise<ExportPlanReport> {
  return invoke<ExportPlanReport>('build_project_export_plan', { request });
}

/**
 * 调用后端命令 `export_project_package_command`,真正导出发布包
 * (manifest + bin/pdo_sdo_data.bin + 图片资源)。
 * @param request - 导出参数
 * @returns 导出结果报告
 */
export async function exportProjectPackage(
  request: ExportPlanRequest,
): Promise<ProjectExportReport> {
  return invoke<ProjectExportReport>('export_project_package_command', { request });
}

/**
 * 调用后端命令 `copy_ui_resource_images`,仅复制发布包需要的 UI 图片资源。
 * @param request - 导出参数
 * @returns 图片复制报告
 */
export async function copyUiResourceImages(request: ExportPlanRequest): Promise<UiImageCopyReport> {
  return invoke<UiImageCopyReport>('copy_ui_resource_images', { request });
}

/**
 * 调用后端命令 `compare_project_binary_report`,将生成的二进制与旧版 .bin 逐字节比较。
 * @param request - 文档 + 旧版 .bin 路径
 * @returns 比较报告(含首个差异偏移)
 */
export async function compareProjectBinaryReport(
  request: BinaryCompareRequest,
): Promise<BinaryCompareReport> {
  return invoke<BinaryCompareReport>('compare_project_binary_report', { request });
}

/**
 * 调用后端命令 `build_project_binary_report`,构建二进制并返回布局/CRC/字节预览。
 * @param document - 项目文档
 * @returns 二进制构建报告
 */
export async function buildProjectBinaryReport(document: unknown): Promise<BinaryBuildReport> {
  return invoke<BinaryBuildReport>('build_project_binary_report', { document });
}

/**
 * 在系统资源管理器中显示指定路径(不经过后端,直接调用 opener 插件)。
 * @param path - 需要定位的资源路径
 */
export async function revealItemInDir(path: string): Promise<void> {
  return revealPathInDir(path);
}

/**
 * 调用后端命令 `generate_can_test_data`,由 PDO/锂电/故障配置生成 CAN 测试数据。
 * @param document - 项目文档
 * @param profile - 测试场景类型(smoke/boundary/fault/regression);缺省生成全部
 * @returns 测试帧 + 配置 + 用例 + 覆盖统计
 */
export async function generateCanTestData(
  document: unknown,
  profile?: string,
): Promise<CanTestGenerateResponse> {
  return invoke<CanTestGenerateResponse>('generate_can_test_data', { document, profile });
}

/**
 * 调用后端命令 `analyze_canopen_conversion`,分析文档做 CANopen 转换的可行性。
 * @param document - 项目文档
 * @returns 转换分析报告
 */
export async function analyzeCanopenConversion(
  document: unknown,
): Promise<CanopenConversionReport> {
  return invoke<CanopenConversionReport>('analyze_canopen_conversion', { document });
}

/**
 * 调用后端命令 `export_canopen_package`,导出 CANopen 兼容包(EDS 与测试帧)。
 * @param outputDir - 输出目录
 * @param document - 项目文档
 * @returns 转换/导出报告(含生成文件列表)
 */
export async function exportCanopenPackage(
  outputDir: string,
  document: unknown,
): Promise<CanopenConversionReport> {
  return invoke<CanopenConversionReport>('export_canopen_package', { outputDir, document });
}

/**
 * 调用后端命令 `save_text_file`,以 UTF-8 保存文本文件。
 * @param path - 目标文件路径
 * @param content - 文本内容
 */
export async function saveTextFile(path: string, content: string): Promise<void> {
  return invoke<void>('save_text_file', { path, content });
}

/**
 * 调用后端命令 `save_json_file`,格式化保存 JSON 文件(含 BOM 处理)。
 * @param path - 目标文件路径
 * @param content - 可序列化内容
 */
export async function saveJsonFile(path: string, content: unknown): Promise<void> {
  return invoke<void>('save_json_file', { path, content });
}

/**
 * 调用后端命令 `load_json_file`,读取并解析 JSON 文件。
 * @param path - 源文件路径
 * @returns 解析后的任意 JSON 值
 */
export async function loadJsonFile(path: string): Promise<unknown> {
  return invoke<unknown>('load_json_file', { path });
}

/**
 * 调用后端命令 `load_text_file`,读取文本文件内容。
 * @param path - 源文件路径
 * @returns 文件文本
 */
export async function loadTextFile(path: string): Promise<string> {
  return invoke<string>('load_text_file', { path });
}

/**
 * 调用后端命令 `import_dbc`,解析 DBC 文件生成锂电监控帧/信号。
 * @param path - DBC 文件路径
 * @returns 导入报告(帧 + 信号 + 错误)
 */
export async function importDbc(path: string): Promise<DbcImportReport> {
  return invoke<DbcImportReport>('import_dbc', { path });
}

/**
 * 调用后端命令 `export_dbc`,将锂电监控帧/信号导出为 DBC 文件。
 * @param path - 目标 DBC 文件路径
 * @param frames - 帧定义
 * @param signals - 信号定义
 */
export async function exportDbc(
  path: string,
  frames: BatteryMonitorFrame[],
  signals: BatteryMonitorSignal[],
): Promise<void> {
  return invoke<void>('export_dbc', { path, frames, signals });
}

/**
 * 调用后端命令 `generate_dbc_content`,生成 DBC 文本内容(不写盘)。
 * @param frames - 帧定义
 * @param signals - 信号定义
 * @returns DBC 文本
 */
export async function generateDbcContent(
  frames: BatteryMonitorFrame[],
  signals: BatteryMonitorSignal[],
): Promise<string> {
  return invoke<string>('generate_dbc_content', { frames, signals });
}
