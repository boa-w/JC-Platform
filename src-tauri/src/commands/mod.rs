//! Tauri IPC 命令层。
//!
//! 每个 `#[tauri::command]` 函数对应前端的一次 `invoke()` 调用。
//! 命令职责：参数反序列化 → 调用 domain 层 → 结果序列化返回。
//! 命令函数本身不做业务校验，仅负责桥接前后端。

use crate::domain::export::{
    build_export_plan, build_project_binary_with_options, compare_project_binary, copy_ui_images,
    export_project_package, BinaryBuildReport, BinaryCompareReport, BinaryCompareRequest,
    ExportBatteryOptions, ExportPlanReport, ExportPlanRequest, ProjectExportReport,
    UiImageCopyReport,
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
    save_project_as as save_project_as_document, LoadedProject, MigratedProject, NewProjectRequest,
    ProjectParseReport, ProjectSummary, ProjectValidationReport, SaveProjectAsReport,
    SaveProjectAsRequest, SaveProjectRequest,
};
use crate::domain::project_compat::sanitize_document_for_target;
use crate::domain::protocol_manager::{
    build_unified_protocol_model, flatten_unified_protocol_to_legacy,
    migrate_project_to_unified_protocol, ProtocolCompatibilityReport, UnifiedProtocolModel,
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
use can_dbc::{ByteOrder, Dbc, MessageId, NumericValue, ValueType};
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// 后端健康检查响应。
#[derive(Debug, Serialize)]
pub struct BackendHealth {
    pub app_name: String,
    pub version: String,
    pub commit_hash: String,
    pub core_status: String,
}

/// 健康检查 —— 前端用于确认后端已就绪。
#[tauri::command]
pub fn backend_health() -> BackendHealth {
    BackendHealth {
        app_name: "自定义开发平台".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        commit_hash: option_env!("JC_GIT_COMMIT_HASH")
            .unwrap_or("unknown")
            .to_string(),
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
    let document = sanitize_document_for_target(&request.path, request.document);
    json_store::write_json(&request.path, &document).map_err(|error| error.to_string())?;
    load_project_from_document(request.path, document)
}

/// 将当前项目另存为新文件，并复制引用的 UI 资源。
#[tauri::command]
pub fn save_project_as(request: SaveProjectAsRequest) -> Result<SaveProjectAsReport, String> {
    save_project_as_document(request)
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

#[tauri::command]
pub fn parse_unified_protocol_project(document: Value) -> UnifiedProtocolModel {
    build_unified_protocol_model(&document)
}

#[tauri::command]
pub fn migrate_unified_protocol_document(document: Value) -> Value {
    migrate_project_to_unified_protocol(document)
}

#[tauri::command]
pub fn flatten_unified_protocol_document(document: Value) -> ProtocolCompatibilityReport {
    flatten_unified_protocol_to_legacy(document)
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
pub fn build_project_binary_report(
    document: Value,
    export_options: Option<ExportBatteryOptions>,
) -> BinaryBuildReport {
    let options = export_options.unwrap_or_default();
    build_project_binary_with_options(&document, &options)
}

// ── CAN 测试数据构建 ──────────────────────────────────────────────

use crate::domain::{can_test, canopen_convert};

/// 从项目文档中提取所有 CAN 帧并生成测试数据。
#[tauri::command]
pub fn generate_can_test_data(
    document: Value,
    profile: Option<String>,
) -> can_test::CanTestGenerateResponse {
    can_test::generate_can_test_data(&document, profile.as_deref())
}

/// 分析旧项目并生成 CANopen 兼容转换报告。
#[tauri::command]
pub fn analyze_canopen_conversion(document: Value) -> canopen_convert::CanopenConversionReport {
    canopen_convert::convert_canopen_document(&document)
}

/// 导出 CANopen 转换包：EDS、vendor 扩展、测试帧和转换报告。
#[tauri::command]
pub fn export_canopen_package(
    output_dir: String,
    document: Value,
) -> Result<canopen_convert::CanopenConversionReport, String> {
    canopen_convert::export_canopen_package(&output_dir, &document)
}

/// 将文本内容写入到指定文件路径。
#[tauri::command]
pub fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("写入文件失败：{}", e))
}

/// 将 JSON Value 写入到指定文件路径。
#[tauri::command]
pub fn save_json_file(path: String, content: Value) -> Result<(), String> {
    let json_str =
        serde_json::to_string_pretty(&content).map_err(|e| format!("序列化 JSON 失败：{}", e))?;
    std::fs::write(&path, json_str).map_err(|e| format!("写入文件失败：{}", e))
}

/// 从指定文件路径读取 JSON 内容。
#[tauri::command]
pub fn load_json_file(path: String) -> Result<Value, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 JSON 失败：{}", e))
}

/// 从指定文件路径读取文本内容。
#[tauri::command]
pub fn load_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))
}

fn numeric_value_to_f64(val: &NumericValue) -> f64 {
    match val {
        NumericValue::Uint(v) => *v as f64,
        NumericValue::Int(v) => *v as f64,
        NumericValue::Double(v) => *v,
    }
}

/// 从 DBC 文件导入帧和信号。
#[tauri::command]
pub fn import_dbc(path: String) -> Result<Value, String> {
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("读取 DBC 文件失败：{}", e))?;
    let dbc = Dbc::try_from(content.as_str()).map_err(|e| format!("解析 DBC 失败：{}", e))?;

    let mut frames: Vec<Value> = Vec::new();
    let mut signals: Vec<Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut key_counts: BTreeMap<String, usize> = BTreeMap::new();

    for msg in &dbc.messages {
        let (can_id, frame_type) = match &msg.id {
            MessageId::Standard(id) => (u32::from(*id), 0i64),
            MessageId::Extended(id) => (*id, 1i64),
        };

        let base_key = if msg.name.is_empty() {
            format!("dbc_msg_{:03X}", can_id)
        } else {
            msg.name
                .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
        };
        let entry = key_counts.entry(base_key.clone()).or_insert(0);
        *entry += 1;
        let frame_key = if *entry > 1 {
            format!("{}_{}", base_key, *entry - 1)
        } else {
            base_key
        };

        let desc = dbc
            .message_comment(msg.id.clone())
            .unwrap_or("")
            .to_string();

        frames.push(json!({
            "frame_key": frame_key,
            "can_id": can_id,
            "type": frame_type,
            "desc": desc,
            "timeout_ticks": 200,
        }));

        for sig in &msg.signals {
            let show_type = match &sig.byte_order {
                ByteOrder::BigEndian => 1i64,
                ByteOrder::LittleEndian => 0i64,
            };

            let sig_type = match &sig.value_type {
                ValueType::Unsigned => {
                    if sig.size <= 8 {
                        0i64
                    } else if sig.size <= 16 {
                        1i64
                    } else {
                        2i64
                    }
                }
                ValueType::Signed => 10i64,
            };

            let sig_name = if sig.name.is_empty() {
                format!("sig_{}", signals.len() + 1)
            } else {
                sig.name
                    .replace(|c: char| !c.is_alphanumeric() && c != '_', "_")
            };

            let comment = dbc
                .signal_comment(msg.id.clone(), &sig.name)
                .unwrap_or("")
                .to_string();
            let name = if comment.is_empty() {
                sig.name.clone()
            } else {
                comment.clone()
            };

            signals.push(json!({
                "signal_key": sig_name,
                "param_id": format!("BATTERY_DBC_{}", sig.name.to_uppercase()),
                "name": name,
                "inner": -1i64,
                "type": sig_type,
                "def": "0",
                "frame_key": frame_key.clone(),
                "pos": sig.start_bit as i64,
                "len": sig.size as i64,
                "show_type": show_type,
                "handle": 0,
                "handle_param": "",
                "factor": sig.factor,
                "offset": sig.offset,
                "min": numeric_value_to_f64(&sig.min),
                "max": numeric_value_to_f64(&sig.max),
                "unit": sig.unit.clone(),
                "receiver": sig.receivers.join(","),
                "comment": comment,
            }));
        }
    }

    if frames.is_empty() {
        errors.push("DBC 文件中未找到任何消息".to_string());
    }

    Ok(json!({
        "frames": frames,
        "signals": signals,
        "errors": errors,
    }))
}

/// 导出帧和信号到 DBC 文件。
#[tauri::command]
pub fn export_dbc(path: String, frames: Vec<Value>, signals: Vec<Value>) -> Result<(), String> {
    let mut lines: Vec<String> = Vec::new();
    let mut all_receivers: Vec<String> = vec!["dbc_export".to_string()];

    lines.push("VERSION \"\"\n\n".to_string());
    lines.push(
        "NS_ :\n\tNS_DESC_\n\tCM_\n\tBA_DEF_\n\tBA_\n\tVAL_\n\tCAT_DEF_\n\tCAT_\n\tFILTER\n\tBA_DEF_DEF_\n\tEV_DATA_\n\tENVVAR_DATA_\n\tSGTYPE_\n\tSGTYPE_VAL_\n\tBA_DEF_SGTYPE_\n\tBA_SGTYPE_\n\tSIG_VALTYPE_\n\tCOMTYPE_\n\tCM_DEF_\n\tCM_DEF_DEF_\n\n".to_string(),
    );
    lines.push("BS_:\n\n".to_string());

    for sig in &signals {
        let receiver = sig["receiver"].as_str().unwrap_or("");
        if !receiver.is_empty() && !all_receivers.contains(&receiver.to_string()) {
            all_receivers.push(receiver.to_string());
        }
    }
    lines.push(format!("BU_: {}\n\n", all_receivers.join(" ")));

    let mut comments: Vec<String> = Vec::new();

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;

        let mut signal_lines: Vec<String> = Vec::new();
        let frame_signals: Vec<&Value> = signals
            .iter()
            .filter(|s| s["frame_key"].as_str() == Some(frame_key))
            .collect();

        for sig in &frame_signals {
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let pos = sig["pos"].as_u64().unwrap_or(0);
            let len = sig["len"].as_u64().unwrap_or(8);
            let show_type = sig["show_type"].as_u64().unwrap_or(0);
            let sig_type = sig["type"].as_u64().unwrap_or(0);
            let factor = sig["factor"].as_f64().unwrap_or(1.0);
            let offset = sig["offset"].as_f64().unwrap_or(0.0);
            let min_val = sig["min"].as_f64().unwrap_or(0.0);
            let max_val = sig["max"].as_f64().unwrap_or(0.0);
            let unit = sig["unit"].as_str().unwrap_or("");
            let receiver = sig["receiver"].as_str().unwrap_or("dbc_export");

            let byte_order = if show_type == 1 { "0" } else { "1" };
            let value_sign = match sig_type {
                10 => "-",
                _ => "+",
            };

            signal_lines.push(format!(
                " SG_ {} : {}|{}@{}{} ({},{}) [{}|{}] \"{}\"  {}",
                sig_name,
                pos,
                len,
                byte_order,
                value_sign,
                factor,
                offset,
                min_val,
                max_val,
                unit,
                receiver,
            ));
        }

        lines.push(format!(
            "BO_ {} {}: 8 dbc_export\n{}\n",
            can_id,
            frame_key,
            signal_lines.join("\n"),
        ));
    }

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;
        let desc = frame_val["desc"].as_str().unwrap_or("");

        if !desc.is_empty() {
            comments.push(format!("CM_ BO_ {} \"{}\";\n", can_id, desc));
        }

        for sig in &signals {
            if sig["frame_key"].as_str() != Some(frame_key) {
                continue;
            }
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let comment = sig["comment"].as_str().unwrap_or("");
            let name = sig["name"].as_str().unwrap_or("");
            let sig_comment = if !comment.is_empty() {
                comment.to_string()
            } else if !name.is_empty() && name != sig_name {
                name.to_string()
            } else {
                String::new()
            };
            if !sig_comment.is_empty() {
                comments.push(format!(
                    "CM_ SG_ {} {} \"{}\";\n",
                    can_id, sig_name, sig_comment
                ));
            }
        }
    }

    lines.extend(comments);
    let dbc_content = lines.concat();
    std::fs::write(&path, &dbc_content).map_err(|e| format!("写入 DBC 文件失败：{}", e))
}

/// 根据帧和信号生成 DBC 文本内容（不写文件）。
#[tauri::command]
pub fn generate_dbc_content(frames: Vec<Value>, signals: Vec<Value>) -> Result<String, String> {
    let mut lines: Vec<String> = Vec::new();
    let mut all_receivers: Vec<String> = vec!["dbc_export".to_string()];

    lines.push("VERSION \"\"\n\n".to_string());
    lines.push(
        "NS_ :\n\tNS_DESC_\n\tCM_\n\tBA_DEF_\n\tBA_\n\tVAL_\n\tCAT_DEF_\n\tCAT_\n\tFILTER\n\tBA_DEF_DEF_\n\tEV_DATA_\n\tENVVAR_DATA_\n\tSGTYPE_\n\tSGTYPE_VAL_\n\tBA_DEF_SGTYPE_\n\tBA_SGTYPE_\n\tSIG_VALTYPE_\n\tCOMTYPE_\n\tCM_DEF_\n\tCM_DEF_DEF_\n\n".to_string(),
    );
    lines.push("BS_:\n\n".to_string());

    for sig in &signals {
        let receiver = sig["receiver"].as_str().unwrap_or("");
        if !receiver.is_empty() && !all_receivers.contains(&receiver.to_string()) {
            all_receivers.push(receiver.to_string());
        }
    }
    lines.push(format!("BU_: {}\n\n", all_receivers.join(" ")));

    let mut comments: Vec<String> = Vec::new();

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;

        let mut signal_lines: Vec<String> = Vec::new();
        let frame_signals: Vec<&Value> = signals
            .iter()
            .filter(|s| s["frame_key"].as_str() == Some(frame_key))
            .collect();

        for sig in &frame_signals {
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let pos = sig["pos"].as_u64().unwrap_or(0);
            let len = sig["len"].as_u64().unwrap_or(8);
            let show_type = sig["show_type"].as_u64().unwrap_or(0);
            let sig_type = sig["type"].as_u64().unwrap_or(0);
            let factor = sig["factor"].as_f64().unwrap_or(1.0);
            let offset = sig["offset"].as_f64().unwrap_or(0.0);
            let min_val = sig["min"].as_f64().unwrap_or(0.0);
            let max_val = sig["max"].as_f64().unwrap_or(0.0);
            let unit = sig["unit"].as_str().unwrap_or("");
            let receiver = sig["receiver"].as_str().unwrap_or("dbc_export");

            let byte_order = if show_type == 1 { "0" } else { "1" };
            let value_sign = match sig_type {
                10 => "-",
                _ => "+",
            };

            signal_lines.push(format!(
                " SG_ {} : {}|{}@{}{} ({},{}) [{}|{}] \"{}\"  {}",
                sig_name,
                pos,
                len,
                byte_order,
                value_sign,
                factor,
                offset,
                min_val,
                max_val,
                unit,
                receiver,
            ));
        }

        lines.push(format!(
            "BO_ {} {}: 8 dbc_export\n{}\n",
            can_id,
            frame_key,
            signal_lines.join("\n"),
        ));
    }

    for frame_val in &frames {
        let frame_key = frame_val["frame_key"].as_str().unwrap_or("unknown");
        let can_id = frame_val["can_id"].as_u64().unwrap_or(0) as u32;
        let desc = frame_val["desc"].as_str().unwrap_or("");

        if !desc.is_empty() {
            comments.push(format!("CM_ BO_ {} \"{}\";\n", can_id, desc));
        }

        for sig in &signals {
            if sig["frame_key"].as_str() != Some(frame_key) {
                continue;
            }
            let sig_name = sig["signal_key"].as_str().unwrap_or("unknown");
            let comment = sig["comment"].as_str().unwrap_or("");
            let name = sig["name"].as_str().unwrap_or("");
            let sig_comment = if !comment.is_empty() {
                comment.to_string()
            } else if !name.is_empty() && name != sig_name {
                name.to_string()
            } else {
                String::new()
            };
            if !sig_comment.is_empty() {
                comments.push(format!(
                    "CM_ SG_ {} {} \"{}\";\n",
                    can_id, sig_name, sig_comment
                ));
            }
        }
    }

    lines.extend(comments);
    Ok(lines.concat())
}
