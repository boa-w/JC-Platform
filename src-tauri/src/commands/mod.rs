//! Tauri IPC 命令层。
//!
//! 每个 `#[tauri::command]` 函数对应前端的一次 `invoke()` 调用。
//! 命令职责：参数反序列化 → 调用 domain 层 → 结果序列化返回。
//! 命令函数本身不做业务校验，仅负责桥接前后端。

use crate::domain::export::{
    build_export_plan, build_project_binary, compare_project_binary, copy_ui_images,
    export_project_package, BinaryBuildReport, BinaryCompareReport, BinaryCompareRequest,
    ExportPlanReport, ExportPlanRequest, ProjectExportReport, UiImageCopyReport,
};
use crate::domain::language::{
    language_document_to_table, parse_language_table, LanguageImportReport,
};
use crate::domain::pdo::{
    parse_pdo_advanced_document, parse_pdo_simple_table, pdo_simple_document_to_table,
    PdoAdvancedParseReport, PdoSimpleImportReport,
};
use crate::domain::project::{
    create_legacy_project_document, migrate_legacy_project_document, parse_legacy_project_document,
    LoadedProject, MigratedProject, NewProjectRequest, ProjectParseReport, ProjectSummary,
    ProjectValidationReport, SaveProjectRequest,
};
use crate::domain::sdo::{parse_sdo_table, sdo_document_to_table, SdoImportReport};
use crate::domain::ui_resource::{
    add_ui_resource_option, parse_ui_info, remove_ui_resource_option, update_ui_resource,
    UiResourceOptionAddRequest, UiResourceOptionRemoveRequest, UiResourceParseReport,
    UiResourceUpdateReport, UiResourceUpdateRequest,
};
use crate::infrastructure::csv_excel::{
    read_csv, read_workbook, validate_headers, validate_language_headers, write_csv,
    write_workbook_xml, ExportTableRequest, TableDocument, TableFileRequest, TableValidationReport,
    LANGUAGE_REQUIRED_PREFIX_HEADERS, PDO_SIMPLE_HEADERS, SDO_HEADERS,
};
use crate::infrastructure::json_store;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// 后端健康检查响应。
#[derive(Debug, Serialize)]
pub struct BackendHealth {
    pub app_name: String,
    pub version: String,
    pub core_status: String,
}

/// 健康检查 —— 前端用于确认后端已就绪。
#[tauri::command]
pub fn backend_health() -> BackendHealth {
    BackendHealth {
        app_name: "自定义开发平台".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        core_status: "ready".to_string(),
    }
}

/// 返回空的项目摘要（无项目打开时的默认状态）。
#[tauri::command]
pub fn project_summary() -> ProjectSummary {
    ProjectSummary::empty()
}

/// 从磁盘加载 `.jcpro` 项目文件，返回摘要、校验结果与原始 JSON。
#[tauri::command]
pub fn load_project(path: String) -> Result<LoadedProject, String> {
    let resolved_path = resolve_project_path(&path).map_err(|error| error.to_string())?;
    let document =
        json_store::read_json::<Value>(&resolved_path).map_err(|error| error.to_string())?;
    load_project_from_document(resolved_path.to_string_lossy().to_string(), document)
}

/// 创建新项目文件并写入磁盘，返回加载后的项目状态。
#[tauri::command]
pub fn create_project(request: NewProjectRequest) -> Result<LoadedProject, String> {
    let document =
        create_legacy_project_document(&request.name, request.resolution_w, request.resolution_h);
    json_store::write_json(&request.path, &document).map_err(|error| error.to_string())?;
    load_project_from_document(request.path, document)
}

/// 将项目 JSON 写回磁盘并返回更新后的加载结果。
#[tauri::command]
pub fn save_project(request: SaveProjectRequest) -> Result<LoadedProject, String> {
    json_store::write_json(&request.path, &request.document).map_err(|error| error.to_string())?;
    load_project_from_document(request.path, request.document)
}

/// 校验项目 JSON 是否包含所有必要段落。
#[tauri::command]
pub fn validate_project_document(document: Value) -> ProjectValidationReport {
    ProjectValidationReport::from_legacy_value(&document)
}

/// 将旧版项目 JSON 迁移到当前版本（补齐缺失段落）。
#[tauri::command]
pub fn migrate_project_document(document: Value) -> MigratedProject {
    migrate_legacy_project_document(None, document)
}

/// 从磁盘读取项目文件，执行迁移后写回磁盘。
#[tauri::command]
pub fn migrate_project_file(path: String) -> Result<MigratedProject, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    let migrated = migrate_legacy_project_document(Some(path.clone()), document);
    json_store::write_json(&path, &migrated.document).map_err(|error| error.to_string())?;
    Ok(migrated)
}

#[tauri::command]
pub fn parse_project_document(document: Value) -> ProjectParseReport {
    parse_legacy_project_document(None, document)
}

#[tauri::command]
pub fn parse_project_file(path: String) -> Result<ProjectParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_legacy_project_document(Some(path), document))
}

/// UI 资源解析请求（可选附带项目路径用于解析相对图片路径）。
#[derive(Debug, Deserialize)]
pub struct UiResourceParseRequest {
    pub project_path: Option<String>,
    pub document: Value,
}

#[tauri::command]
pub fn parse_ui_resources(document: Value) -> UiResourceParseReport {
    parse_ui_info(None, &document)
}

#[tauri::command]
pub fn parse_ui_resources_with_project_path(
    request: UiResourceParseRequest,
) -> UiResourceParseReport {
    parse_ui_info(request.project_path.as_deref(), &request.document)
}

#[tauri::command]
pub fn parse_ui_resource_file(path: String) -> Result<UiResourceParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_ui_info(Some(&path), &document))
}

#[tauri::command]
pub fn update_ui_resource_document(request: UiResourceUpdateRequest) -> UiResourceUpdateReport {
    update_ui_resource(request)
}

#[tauri::command]
pub fn add_ui_resource_option_document(
    request: UiResourceOptionAddRequest,
) -> UiResourceUpdateReport {
    add_ui_resource_option(request)
}

#[tauri::command]
pub fn remove_ui_resource_option_document(
    request: UiResourceOptionRemoveRequest,
) -> UiResourceUpdateReport {
    remove_ui_resource_option(request)
}

/// 从已解析的 JSON 文档构建 `LoadedProject`（摘要 + 校验 + 原始文档）。
fn load_project_from_document(path: String, document: Value) -> Result<LoadedProject, String> {
    let summary = ProjectSummary::from_legacy_value(Some(path), &document);
    let validation = ProjectValidationReport::from_legacy_value(&document);

    Ok(LoadedProject {
        summary,
        validation,
        document,
    })
}

/// 解析项目文件路径：支持绝对路径、相对路径，以及在当前目录祖先中按文件名搜索。
fn resolve_project_path(path: &str) -> Result<PathBuf, std::io::Error> {
    let project_path = PathBuf::from(path);
    if project_path.exists() || project_path.is_absolute() {
        return Ok(project_path);
    }

    let current_dir = std::env::current_dir()?;
    let ancestors = current_dir.ancestors().take(4);

    ancestors
        .clone()
        .map(|ancestor| ancestor.join(&project_path))
        .find(|candidate| candidate.exists())
        .or_else(|| {
            ancestors
                .filter_map(|ancestor| locate_by_file_name(ancestor, &project_path))
                .next()
        })
        .unwrap_or(project_path)
        .canonicalize()
}

/// 在 `root` 的直接子目录中查找包含 `project_path` 文件名的文件。
fn locate_by_file_name(root: &Path, project_path: &Path) -> Option<PathBuf> {
    let file_name = project_path.file_name()?;
    let direct_children = std::fs::read_dir(root).ok()?;

    for child in direct_children.flatten() {
        let child_path = child.path();
        if child_path.is_dir() {
            let candidate = child_path.join(file_name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

/// 旧版表格类型枚举，用于指定导入/导出的数据类型。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LegacyTableKind {
    Sdo,
    PdoSimple,
    Language,
}

/// 表格规范描述（类型标识 + 标准表头列表）。
#[derive(Debug, Serialize)]
pub struct LegacyTableSpec {
    pub kind: String,
    pub headers: Vec<String>,
}

/// 根据表格类型返回对应的表头规范，前端用于生成导入模板。
#[tauri::command]
pub fn legacy_table_spec(kind: LegacyTableKind) -> LegacyTableSpec {
    match kind {
        LegacyTableKind::Sdo => LegacyTableSpec {
            kind: "sdo".to_string(),
            headers: SDO_HEADERS.iter().map(|item| (*item).to_string()).collect(),
        },
        LegacyTableKind::PdoSimple => LegacyTableSpec {
            kind: "pdoSimple".to_string(),
            headers: PDO_SIMPLE_HEADERS
                .iter()
                .map(|item| (*item).to_string())
                .collect(),
        },
        LegacyTableKind::Language => LegacyTableSpec {
            kind: "language".to_string(),
            headers: LANGUAGE_REQUIRED_PREFIX_HEADERS
                .iter()
                .chain(["中文_zh"].iter())
                .map(|item| (*item).to_string())
                .collect(),
        },
    }
}

#[tauri::command]
pub fn validate_table_headers(
    kind: LegacyTableKind,
    headers: Vec<String>,
) -> TableValidationReport {
    match kind {
        LegacyTableKind::Sdo => validate_headers(&headers, SDO_HEADERS),
        LegacyTableKind::PdoSimple => validate_headers(&headers, PDO_SIMPLE_HEADERS),
        LegacyTableKind::Language => validate_language_headers(&headers),
    }
}

#[tauri::command]
pub fn import_sdo_table(document: TableDocument) -> SdoImportReport {
    parse_sdo_table(document)
}

#[tauri::command]
pub fn import_sdo_csv(request: TableFileRequest) -> Result<SdoImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_sdo_table(document))
}

#[tauri::command]
pub fn import_sdo_workbook(request: TableFileRequest) -> Result<SdoImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_sdo_table(document))
}

#[tauri::command]
pub fn import_pdo_simple_table(document: TableDocument) -> PdoSimpleImportReport {
    parse_pdo_simple_table(document)
}

#[tauri::command]
pub fn parse_pdo_advanced_project(document: Value) -> PdoAdvancedParseReport {
    parse_pdo_advanced_document(&document)
}

#[tauri::command]
pub fn parse_pdo_advanced_file(path: String) -> Result<PdoAdvancedParseReport, String> {
    let document = json_store::read_json::<Value>(&path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_advanced_document(&document))
}

#[tauri::command]
pub fn import_pdo_simple_csv(request: TableFileRequest) -> Result<PdoSimpleImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_simple_table(document))
}

#[tauri::command]
pub fn import_pdo_simple_workbook(
    request: TableFileRequest,
) -> Result<PdoSimpleImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_pdo_simple_table(document))
}

#[tauri::command]
pub fn import_language_table(document: TableDocument) -> LanguageImportReport {
    parse_language_table(document)
}

#[tauri::command]
pub fn import_language_csv(request: TableFileRequest) -> Result<LanguageImportReport, String> {
    let document = read_csv(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_language_table(document))
}

#[tauri::command]
pub fn import_language_workbook(request: TableFileRequest) -> Result<LanguageImportReport, String> {
    let document = read_workbook(&request.path).map_err(|error| error.to_string())?;
    Ok(parse_language_table(document))
}

#[tauri::command]
pub fn export_table_csv(request: ExportTableRequest) -> Result<(), String> {
    write_csv(&request.path, &request.document).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_table_workbook(request: ExportTableRequest) -> Result<(), String> {
    write_workbook_xml(&request.path, &request.document).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn language_document_table(document: Value) -> TableDocument {
    language_document_to_table(&document)
}

#[tauri::command]
pub fn pdo_simple_document_table(document: Value) -> TableDocument {
    pdo_simple_document_to_table(&document)
}

#[tauri::command]
pub fn sdo_document_table(document: Value) -> TableDocument {
    sdo_document_to_table(&document)
}

#[tauri::command]
pub fn build_project_export_plan(request: ExportPlanRequest) -> ExportPlanReport {
    build_export_plan(request)
}

#[tauri::command]
pub fn export_project_package_command(request: ExportPlanRequest) -> ProjectExportReport {
    export_project_package(request)
}

#[tauri::command]
pub fn copy_ui_resource_images(request: ExportPlanRequest) -> UiImageCopyReport {
    copy_ui_images(request)
}

#[tauri::command]
pub fn compare_project_binary_report(request: BinaryCompareRequest) -> BinaryCompareReport {
    compare_project_binary(request)
}

#[tauri::command]
pub fn build_project_binary_report(document: Value) -> BinaryBuildReport {
    build_project_binary(&document)
}
