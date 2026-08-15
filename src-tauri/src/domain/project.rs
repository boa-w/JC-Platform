//! 项目文件（`.jcpro`）的生命周期管理。
//!
//! 职责：
//! - 创建新项目文档
//! - 从磁盘加载并解析
//! - 旧版格式迁移到当前版本
//! - 结构完整性校验
//!
//! 项目文件为 JSON 格式，包含 `project`、`device`、`ui_info`、
//! `pdo_*`、`sdo_info`、`language_info` 等段落。

use crate::domain::private_protocol::PrivateProtocolDocument;
use crate::domain::protocol::battery_monitor::default_battery_monitor_protocol;
use crate::domain::protocol_manager::migrate_project_to_unified_protocol;
use crate::domain::signal::SignalDictionary;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// 项目摘要信息 —— 用于前端项目列表展示。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub name: String,
    pub version: String,
    pub path: Option<String>,
    #[serde(rename = "deviceResolution")]
    pub device_resolution: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
}

impl ProjectSummary {
    pub fn empty() -> Self {
        Self {
            name: "未打开项目".to_string(),
            version: "重构版初始化阶段".to_string(),
            path: None,
            device_resolution: "待读取 .jcpro".to_string(),
            updated_at: None,
        }
    }

    pub fn from_legacy_value(path: Option<String>, value: &Value) -> Self {
        let project = value.get("project");
        let device = value.get("device");
        let name = project
            .and_then(|project| project.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("未命名项目")
            .to_string();
        let version = value
            .get("config_version")
            .and_then(Value::as_str)
            .unwrap_or("未知配置版本")
            .to_string();
        let updated_at = project
            .and_then(|project| project.get("update_time"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let resolution_w = device
            .and_then(|device| device.get("resolution_w"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let resolution_h = device
            .and_then(|device| device.get("resolution_h"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let device_resolution = if resolution_w > 0 && resolution_h > 0 {
            format!("{} × {}", resolution_w, resolution_h)
        } else {
            "未声明分辨率".to_string()
        };

        Self {
            name,
            version,
            path,
            device_resolution,
            updated_at,
        }
    }
}

/// 项目校验报告 —— 列出缺失段落和警告信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectValidationReport {
    pub valid: bool,
    pub missing_sections: Vec<String>,
    pub warnings: Vec<String>,
}

impl ProjectValidationReport {
    pub fn from_legacy_value(value: &Value) -> Self {
        let config_version = value.get("config_version").and_then(Value::as_str);
        let required_sections = match config_version {
            Some("jc002") => required_v2_project_sections(),
            _ => required_project_sections(),
        };
        let missing_sections = required_sections
            .iter()
            .filter(|section| value.get(**section).is_none())
            .map(|section| (*section).to_string())
            .collect::<Vec<_>>();
        let mut warnings = Vec::new();
        let mut schema_valid = true;

        if value.get("config_version").is_none() {
            warnings.push("缺少 config_version，后续保存时需要决定版本迁移策略".to_string());
        }
        if value
            .get("project")
            .and_then(|project| project.get("name"))
            .and_then(Value::as_str)
            .is_none()
        {
            warnings.push("缺少 project.name，项目列表将显示默认名称".to_string());
        }

        match config_version {
            Some("jc001") if value.get("localization").is_some() => {
                warnings.push("jc001 项目禁止包含 jc002 localization".to_string());
                schema_valid = false;
            }
            Some("jc002") if value.get("language_info").is_some() => {
                warnings.push("jc002 项目禁止包含 jc001 language_info".to_string());
                schema_valid = false;
            }
            Some("jc002") => {
                if let Err(error) = crate::domain::localization::validate_localization(value) {
                    warnings.push(error);
                    schema_valid = false;
                }
            }
            Some(version) if version != "jc001" => {
                warnings.push(format!("不支持的 config_version：{version}"));
                schema_valid = false;
            }
            _ => {}
        }

        Self {
            valid: missing_sections.is_empty() && schema_valid,
            missing_sections,
            warnings,
        }
    }
}

/// 已加载的项目 —— 包含摘要、校验结果和原始 JSON 文档。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadedProject {
    pub summary: ProjectSummary,
    pub validation: ProjectValidationReport,
    pub document: Value,
}

/// 迁移后的项目 —— 包含迁移前的摘要、校验、文档，以及新增的段落列表。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigratedProject {
    pub summary: ProjectSummary,
    pub validation: ProjectValidationReport,
    pub document: Value,
    pub added_sections: Vec<String>,
    pub migrated_version: String,
}

/// 创建新项目的请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProjectRequest {
    pub path: String,
    pub name: String,
    #[serde(rename = "resolutionW")]
    pub resolution_w: u32,
    #[serde(rename = "resolutionH")]
    pub resolution_h: u32,
}

/// 保存项目的请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectRequest {
    pub path: String,
    pub document: Value,
}

pub fn validate_project_version_contract(document: &Value) -> Result<(), String> {
    match document.get("config_version").and_then(Value::as_str) {
        Some("jc001") if document.get("localization").is_some() => {
            Err("jc001 项目禁止包含 jc002 localization".to_string())
        }
        Some("jc001") => Ok(()),
        Some("jc002") if document.get("language_info").is_some() => {
            Err("jc002 项目禁止包含 jc001 language_info".to_string())
        }
        Some("jc002") => crate::domain::localization::validate_localization(document),
        Some(version) => Err(format!("不支持的 config_version：{version}")),
        None => Ok(()),
    }
}

/// 项目另存为请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectAsRequest {
    pub source_path: String,
    pub target_path: String,
    pub document: Value,
}

/// 项目另存为资源拷贝条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectResourceCopyItem {
    pub source: String,
    pub destination: String,
}

/// 项目另存为结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveProjectAsReport {
    pub project: LoadedProject,
    pub copied_resources: Vec<ProjectResourceCopyItem>,
    pub warnings: Vec<String>,
}

/// 创建包含所有必要段落的新项目 JSON 文档。
pub fn create_legacy_project_document(name: &str, resolution_w: u32, resolution_h: u32) -> Value {
    json!({
        "config_version": "jc001",
        "device": {
            "resolution_w": resolution_w,
            "resolution_h": resolution_h
        },
        "project": {
            "name": name,
            "from": "tauri-refactor",
            "base_path": "",
            "create_time": "",
            "update_time": ""
        },
        "export_info": ProjectExportSettings::default(),
        "ui_info": [],
        "language_info": default_language_info(),
        "fault_code_info": default_fault_code_info(),
        "pdo_simple_send_recv": default_pdo_simple(),
        "pdo_global_param": [],
        "pdo_condition": [],
        "pdo_recv": [],
        "pdo_send": [],
        "sdo_info": default_sdo_info(),
        "signal_dictionary": SignalDictionary::default(),
        "private_protocol": PrivateProtocolDocument::default(),
        "protocol_mapping": [],
        "battery_monitor": default_battery_monitor_protocol(),
    })
}

/// 将旧版项目文档迁移到当前版本。
///
/// 遍历所有必要段落，缺失的用默认值补齐，并更新 `config_version`。
pub fn migrate_legacy_project_document(path: Option<String>, value: Value) -> MigratedProject {
    let mut document = match value {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let initial_sections = document.keys().cloned().collect::<HashSet<_>>();
    let mut added_sections = Vec::new();

    for section in required_project_sections() {
        if is_unified_protocol_section(section) {
            continue;
        }
        if !document.contains_key(*section) {
            document.insert((*section).to_string(), default_section_value(section));
            added_sections.push((*section).to_string());
        }
    }

    document.insert(
        "config_version".to_string(),
        Value::String("0.1.0-tauri-refactor".to_string()),
    );
    let mut document = migrate_project_to_unified_protocol(Value::Object(document));
    if let Some(object) = document.as_object_mut() {
        for section in ["signal_dictionary", "private_protocol", "protocol_mapping"] {
            if !initial_sections.contains(section) {
                added_sections.push(section.to_string());
            }
        }
        object.insert(
            "config_version".to_string(),
            Value::String("0.1.0-tauri-refactor".to_string()),
        );
    }
    let summary = ProjectSummary::from_legacy_value(path, &document);
    let validation = ProjectValidationReport::from_legacy_value(&document);

    MigratedProject {
        summary,
        validation,
        document,
        added_sections,
        migrated_version: "0.1.0-tauri-refactor".to_string(),
    }
}

/// 将当前项目另存为新项目文件，并把 UI 资源复制到新项目目录。
pub fn save_project_as(request: SaveProjectAsRequest) -> Result<SaveProjectAsReport, String> {
    let source_path = PathBuf::from(&request.source_path);
    let target_path = PathBuf::from(&request.target_path);
    if same_project_target(&source_path, &target_path) {
        return Err("另存为目标不能与当前项目路径相同".to_string());
    }

    let source_dir = source_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let target_dir = target_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    fs::create_dir_all(&target_dir)
        .map_err(|error| format!("创建目标目录失败 {}：{}", target_dir.display(), error))?;

    validate_project_version_contract(&request.document)?;
    let mut document = sanitize_document_for_target(&target_path, request.document);
    let mut context = SaveAsResourceContext::new(source_dir, target_dir.clone());
    copy_project_resources(&mut document, &mut context);

    let content = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("序列化项目文件失败：{}", error))?;
    fs::write(&target_path, content)
        .map_err(|error| format!("写入另存为项目失败 {}：{}", target_path.display(), error))?;

    let target_path_text = target_path.to_string_lossy().to_string();
    let project = LoadedProject {
        summary: ProjectSummary::from_legacy_value(Some(target_path_text), &document),
        validation: ProjectValidationReport::from_legacy_value(&document),
        document,
    };

    Ok(SaveProjectAsReport {
        project,
        copied_resources: context.copied_resources,
        warnings: context.warnings,
    })
}

fn sanitize_document_for_target(target_path: &Path, mut document: Value) -> Value {
    if !target_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("jcpro"))
        .unwrap_or(false)
    {
        return document;
    }

    if let Some(object) = document.as_object_mut() {
        for section in ["signal_dictionary", "private_protocol", "protocol_mapping"] {
            object.remove(section);
        }
    }
    crate::domain::project_compat::sanitize_document_for_target(
        &target_path.to_string_lossy(),
        document,
    )
}

struct SaveAsResourceContext {
    source_dir: PathBuf,
    target_dir: PathBuf,
    copied_resources: Vec<ProjectResourceCopyItem>,
    copied_destinations: HashSet<String>,
    absolute_resource_paths: HashMap<String, String>,
    used_absolute_destinations: HashMap<String, String>,
    warnings: Vec<String>,
}

impl SaveAsResourceContext {
    fn new(source_dir: PathBuf, target_dir: PathBuf) -> Self {
        Self {
            source_dir,
            target_dir,
            copied_resources: Vec::new(),
            copied_destinations: HashSet::new(),
            absolute_resource_paths: HashMap::new(),
            used_absolute_destinations: HashMap::new(),
            warnings: Vec::new(),
        }
    }
}

fn same_project_target(source_path: &Path, target_path: &Path) -> bool {
    if source_path == target_path {
        return true;
    }

    match (source_path.canonicalize(), target_path.canonicalize()) {
        (Ok(source), Ok(target)) => source == target,
        _ => false,
    }
}

fn copy_project_resources(document: &mut Value, context: &mut SaveAsResourceContext) {
    let Some(ui_info) = document.get_mut("ui_info").and_then(Value::as_object_mut) else {
        return;
    };

    if let Some(logo) = ui_info.get_mut("logo") {
        copy_resource_options(logo, context);
    }

    if let Some(items) = ui_info
        .get_mut("main")
        .and_then(|main| main.get_mut("item"))
        .and_then(Value::as_object_mut)
    {
        for resource in items.values_mut() {
            copy_resource_options(resource, context);
        }
    }
}

fn copy_resource_options(resource: &mut Value, context: &mut SaveAsResourceContext) {
    let Some(object) = resource.as_object_mut() else {
        return;
    };
    let handle = object
        .get("handle")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let Some(options) = object.get_mut("option").and_then(Value::as_array_mut) else {
        return;
    };

    match handle.as_str() {
        "show" => {
            for option in options {
                rewrite_string_resource(option, context);
            }
        }
        "list" => {
            for option in options {
                if let Some(items) = option.get_mut("list").and_then(Value::as_array_mut) {
                    for item in items {
                        rewrite_string_resource(item, context);
                    }
                }
            }
        }
        "anim" => {
            for option in options {
                copy_anim_resource(option, context);
            }
        }
        _ => {}
    }
}

fn rewrite_string_resource(value: &mut Value, context: &mut SaveAsResourceContext) {
    let Some(source) = value.as_str().map(str::to_string) else {
        return;
    };
    if let Some(next_path) = copy_single_resource(&source, None, context) {
        if next_path != source {
            *value = Value::String(next_path);
        }
    }
}

fn copy_anim_resource(option: &mut Value, context: &mut SaveAsResourceContext) {
    let Some(object) = option.as_object_mut() else {
        return;
    };
    let total = object.get("total").and_then(Value::as_u64).unwrap_or(0) as usize;
    if total == 0 {
        return;
    }
    let reserved = object.get("reserved").and_then(Value::as_u64).unwrap_or(0) as usize;
    let format = object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("png")
        .to_string();
    let start_indexes = object
        .get("start_index")
        .map(number_list)
        .unwrap_or_default();
    let Some(base_name) = object.get_mut("base_name") else {
        return;
    };

    if let Some(base) = base_name.as_str().map(str::to_string) {
        if let Some(next_base) =
            copy_anim_base(&base, 0, &start_indexes, total, reserved, &format, context)
        {
            if next_base != base {
                *base_name = Value::String(next_base);
            }
        }
        return;
    }

    if let Some(base_names) = base_name.as_array_mut() {
        for (base_index, item) in base_names.iter_mut().enumerate() {
            let Some(base) = item.as_str().map(str::to_string) else {
                continue;
            };
            if let Some(next_base) = copy_anim_base(
                &base,
                base_index,
                &start_indexes,
                total,
                reserved,
                &format,
                context,
            ) {
                if next_base != base {
                    *item = Value::String(next_base);
                }
            }
        }
    }
}

fn copy_anim_base(
    base_name: &str,
    base_index: usize,
    start_indexes: &[i64],
    total: usize,
    reserved: usize,
    format: &str,
    context: &mut SaveAsResourceContext,
) -> Option<String> {
    let start_index = start_indexes
        .get(base_index)
        .copied()
        .unwrap_or_else(|| start_indexes.first().copied().unwrap_or(0));
    let base_path = Path::new(base_name);
    let next_base = if base_path.is_absolute() {
        Some(relative_resource_base_for_absolute(base_name, context))
    } else {
        None
    };

    for frame in 0..total {
        let number = start_index + frame as i64;
        let source = format!(
            "{}{:0width$}.{}",
            base_name,
            number,
            format,
            width = reserved
        );
        let forced_destination = next_base
            .as_ref()
            .map(|base| format!("{}{:0width$}.{}", base, number, format, width = reserved));
        let _ = copy_single_resource(&source, forced_destination.as_deref(), context);
    }

    next_base
}

fn copy_single_resource(
    source: &str,
    forced_destination: Option<&str>,
    context: &mut SaveAsResourceContext,
) -> Option<String> {
    if source.trim().is_empty() {
        return None;
    }

    let source_path = resolve_source_resource_path(source, &context.source_dir);
    let source_is_absolute = Path::new(source).is_absolute();
    let relative_destination = forced_destination.map(str::to_string).or_else(|| {
        if source_is_absolute {
            Some(relative_resource_path_for_absolute(&source_path, context))
        } else {
            Some(normalize_relative_path_text(source))
        }
    })?;
    let destination_path = context.target_dir.join(&relative_destination);

    if !source_path.exists() {
        context.warnings.push(format!(
            "资源文件不存在，已跳过拷贝：{}",
            source_path.display()
        ));
        return if source_is_absolute || forced_destination.is_some() {
            None
        } else {
            Some(relative_destination)
        };
    }

    if same_resource_path(&source_path, &destination_path) {
        return Some(relative_destination);
    }

    let destination_key = destination_path.to_string_lossy().to_string();
    if context.copied_destinations.insert(destination_key) {
        if let Some(parent) = destination_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                context
                    .warnings
                    .push(format!("创建资源目录失败 {}：{}", parent.display(), error));
                return None;
            }
        }
        match fs::copy(&source_path, &destination_path) {
            Ok(_) => context.copied_resources.push(ProjectResourceCopyItem {
                source: source_path.to_string_lossy().to_string(),
                destination: destination_path.to_string_lossy().to_string(),
            }),
            Err(error) => {
                context.warnings.push(format!(
                    "拷贝资源失败 {} -> {}：{}",
                    source_path.display(),
                    destination_path.display(),
                    error
                ));
                return None;
            }
        }
    }

    Some(relative_destination)
}

fn resolve_source_resource_path(source: &str, source_dir: &Path) -> PathBuf {
    let source_path = Path::new(source);
    if source_path.is_absolute() {
        source_path.to_path_buf()
    } else {
        source_dir.join(source_path)
    }
}

fn same_resource_path(source_path: &Path, destination_path: &Path) -> bool {
    match (source_path.canonicalize(), destination_path.canonicalize()) {
        (Ok(source), Ok(destination)) => source == destination,
        _ => source_path == destination_path,
    }
}

fn normalize_relative_path_text(path: &str) -> String {
    path.replace('\\', "/")
}

fn relative_resource_path_for_absolute(
    source_path: &Path,
    context: &mut SaveAsResourceContext,
) -> String {
    let source_key = source_path.to_string_lossy().to_string();
    if let Some(relative_path) = context.absolute_resource_paths.get(&source_key) {
        return relative_path.clone();
    }

    let file_name = source_path
        .file_name()
        .and_then(|item| item.to_str())
        .unwrap_or("resource");
    let relative_path = unique_resource_path(file_name, &source_key, context);
    context
        .absolute_resource_paths
        .insert(source_key, relative_path.clone());
    relative_path
}

fn relative_resource_base_for_absolute(
    base_name: &str,
    context: &mut SaveAsResourceContext,
) -> String {
    let source_key = format!("anim-base:{base_name}");
    if let Some(relative_path) = context.absolute_resource_paths.get(&source_key) {
        return relative_path.clone();
    }

    let file_name = Path::new(base_name)
        .file_name()
        .and_then(|item| item.to_str())
        .filter(|item| !item.is_empty())
        .unwrap_or("frame_");
    let relative_path = unique_resource_path(file_name, &source_key, context);
    context
        .absolute_resource_paths
        .insert(source_key, relative_path.clone());
    relative_path
}

fn unique_resource_path(
    file_name: &str,
    source_key: &str,
    context: &mut SaveAsResourceContext,
) -> String {
    let mut candidate = format!("resources/{file_name}");
    if let Some(existing_source) = context.used_absolute_destinations.get(&candidate) {
        if existing_source == source_key {
            return candidate;
        }
    } else {
        context
            .used_absolute_destinations
            .insert(candidate.clone(), source_key.to_string());
        return candidate;
    }

    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|item| item.to_str())
        .unwrap_or("resource");
    let extension = path.extension().and_then(|item| item.to_str());
    let mut index = 2;
    loop {
        candidate = match extension {
            Some(extension) => format!("resources/{stem}-{index}.{extension}"),
            None => format!("resources/{stem}-{index}"),
        };
        if !context.used_absolute_destinations.contains_key(&candidate) {
            context
                .used_absolute_destinations
                .insert(candidate.clone(), source_key.to_string());
            return candidate;
        }
        index += 1;
    }
}

fn number_list(value: &Value) -> Vec<i64> {
    if let Some(items) = value.as_array() {
        items.iter().filter_map(Value::as_i64).collect()
    } else {
        value.as_i64().map(|item| vec![item]).unwrap_or_default()
    }
}

fn required_project_sections() -> &'static [&'static str] {
    &[
        "project",
        "export_info",
        "device",
        "ui_info",
        "pdo_simple_send_recv",
        "pdo_global_param",
        "pdo_condition",
        "pdo_recv",
        "pdo_send",
        "sdo_info",
        "signal_dictionary",
        "private_protocol",
        "protocol_mapping",
        "language_info",
        "battery_monitor",
        "fault_code_info",
    ]
}

fn required_v2_project_sections() -> &'static [&'static str] {
    &[
        "project",
        "export_info",
        "device",
        "ui_info",
        "pdo_simple_send_recv",
        "pdo_global_param",
        "pdo_condition",
        "pdo_recv",
        "pdo_send",
        "sdo_info",
        "localization",
    ]
}

fn is_unified_protocol_section(section: &str) -> bool {
    matches!(
        section,
        "signal_dictionary" | "private_protocol" | "protocol_mapping"
    )
}

fn default_section_value(section: &str) -> Value {
    match section {
        "project" => json!({
            "name": "未命名项目",
            "from": "tauri-refactor",
            "base_path": "",
            "create_time": "",
            "update_time": ""
        }),
        "export_info" => json!(ProjectExportSettings::default()),
        "device" => json!({
            "resolution_w": 0,
            "resolution_h": 0
        }),
        "pdo_simple_send_recv" => default_pdo_simple(),
        "sdo_info" => default_sdo_info(),
        "signal_dictionary" => json!(SignalDictionary::default()),
        "private_protocol" => json!(PrivateProtocolDocument::default()),
        "protocol_mapping" => Value::Array(Vec::new()),
        "language_info" => default_language_info(),
        "battery_monitor" => default_battery_monitor_protocol(),
        "fault_code_info" => default_fault_code_info(),
        _ => Value::Array(Vec::new()),
    }
}

fn default_pdo_simple() -> Value {
    json!({
        "pdo_send": [],
        "pdo_recv": []
    })
}

fn default_sdo_info() -> Value {
    json!({
        "type": 0,
        "user_auth": 0,
        "name_index": 0,
        "name": "菜单",
        "children": []
    })
}

fn default_language_info() -> Value {
    let list_inner = vec![
        Value::String("中文".to_string()),
        Value::String("英文".to_string()),
    ];
    json!({
        "list_code_language": ["zh", "en"],
        "language_labels": {
            "zh": "中文",
            "en": "英文"
        },
        "list_inner": list_inner,
        "list_translate": {}
    })
}

pub fn default_fault_code_info() -> Value {
    json!({
        "schema_version": 1,
        "enabled": true,
        "version": 1,
        "sources": [
            {
                "source_key": "traction",
                "source_id": 1,
                "type_char": "T",
                "name": "牵引",
                "can_id": 648,
                "frame_type": 0,
                "code_byte": 2,
                "clear_code": 0,
                "invalid_codes": [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
                "enabled": true
            },
            {
                "source_key": "pump",
                "source_id": 2,
                "type_char": "P",
                "name": "油泵",
                "can_id": 660,
                "frame_type": 0,
                "code_byte": 2,
                "clear_code": 0,
                "invalid_codes": [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
                "enabled": true
            }
        ],
        "codes": []
    })
}

/// 项目解析报告 —— 包含强类型解析结果和所有错误信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectParseReport {
    pub valid: bool,
    pub summary: ProjectSummary,
    pub validation: ProjectValidationReport,
    pub document: Option<ProjectDocument>,
    pub added_sections: Vec<String>,
    pub errors: Vec<String>,
}

/// 项目文件的强类型表示 —— 对应 `.jcpro` JSON 的完整结构。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectDocument {
    pub config_version: Option<String>,
    #[serde(default)]
    pub project: ProjectMetadata,
    #[serde(default)]
    pub export_info: ProjectExportSettings,
    #[serde(default)]
    pub device: DeviceConfig,
    #[serde(default)]
    pub ui_info: UiInfoDocument,
    #[serde(default)]
    pub pdo_simple_send_recv: PdoSimpleDocument,
    #[serde(default)]
    pub pdo_global_param: Vec<Value>,
    #[serde(default)]
    pub pdo_condition: Vec<Value>,
    #[serde(default)]
    pub pdo_recv: Vec<Value>,
    #[serde(default)]
    pub pdo_send: Vec<Value>,
    #[serde(default)]
    pub sdo_info: SdoNodeDocument,
    #[serde(default)]
    pub signal_dictionary: SignalDictionary,
    #[serde(default)]
    pub private_protocol: PrivateProtocolDocument,
    #[serde(default)]
    pub protocol_mapping: Vec<Value>,
    pub language_info: Option<LanguageDocument>,
    pub localization: Option<Value>,
    pub battery_monitor: Option<Value>,
    pub fault_code_info: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectExportSettings {
    #[serde(default = "default_export_folder_name")]
    pub folder_name: String,
    #[serde(default = "default_manifest_filename")]
    pub manifest_filename: String,
    #[serde(default = "default_binary_filename")]
    pub binary_filename: String,
    #[serde(default)]
    pub battery_monitor: ProjectExportTargetSettings,
    #[serde(default)]
    pub fault_code_info: ProjectExportTargetSettings,
}

impl Default for ProjectExportSettings {
    fn default() -> Self {
        Self {
            folder_name: default_export_folder_name(),
            manifest_filename: default_manifest_filename(),
            binary_filename: default_binary_filename(),
            battery_monitor: ProjectExportTargetSettings::default(),
            fault_code_info: ProjectExportTargetSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectExportTargetSettings {
    #[serde(default = "default_export_enabled")]
    pub config: bool,
    #[serde(default = "default_export_enabled")]
    pub bin: bool,
}

impl Default for ProjectExportTargetSettings {
    fn default() -> Self {
        Self {
            config: true,
            bin: true,
        }
    }
}

fn default_export_enabled() -> bool {
    true
}

fn default_export_folder_name() -> String {
    "jc_export".to_string()
}

fn default_manifest_filename() -> String {
    "ConfigUpdate.json".to_string()
}

fn default_binary_filename() -> String {
    "pdo_sdo_data.bin".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectMetadata {
    #[serde(default)]
    pub name: String,
    pub from: Option<String>,
    pub base_path: Option<String>,
    pub create_time: Option<String>,
    pub update_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceConfig {
    #[serde(default)]
    pub resolution_w: u32,
    #[serde(default)]
    pub resolution_h: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UiInfoDocument {
    pub logo: Option<UiResourceDocument>,
    pub main: Option<UiPageDocument>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UiPageDocument {
    pub name: Option<String>,
    #[serde(default)]
    pub item: Map<String, Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UiResourceDocument {
    pub name: Option<String>,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default)]
    pub options: Vec<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PdoSimpleDocument {
    #[serde(default)]
    pub pdo_send: Vec<PdoSimpleFrameDocument>,
    #[serde(default)]
    pub pdo_recv: Vec<PdoSimpleFrameDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PdoSimpleFrameDocument {
    #[serde(default)]
    pub id: u32,
    #[serde(default, rename = "type")]
    pub frame_type: u8,
    #[serde(default)]
    pub desc: String,
    #[serde(default)]
    pub data: Vec<PdoSimpleSignalDocument>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PdoSimpleSignalDocument {
    #[serde(default)]
    pub pos: u32,
    #[serde(default)]
    pub len: u32,
    #[serde(default)]
    pub show_type: u8,
    #[serde(default)]
    pub pdo_param_index: u32,
    pub pdo_param_name: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SdoNodeDocument {
    #[serde(default, rename = "type")]
    pub node_type: u8,
    #[serde(default)]
    pub user_auth: u8,
    #[serde(default)]
    pub name_index: u32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub children: Vec<SdoNodeDocument>,
    pub control_protocol: Option<u8>,
    pub control_rw: Option<u8>,
    pub control_use_default: Option<u8>,
    pub control_use_min_max: Option<u8>,
    pub handle: Option<u8>,
    pub handle_name: Option<String>,
    pub handle_param: Option<String>,
    pub fid: Option<u32>,
    pub mid: Option<u32>,
    pub sid: Option<u32>,
    pub data_default: Option<String>,
    pub data_min: Option<String>,
    pub data_max: Option<String>,
    pub pre_handle: Option<u8>,
    pub pre_handle_name: Option<String>,
    pub pre_handle_scale: Option<String>,
    pub pre_handle_offset: Option<String>,
    pub pre_handle_decimal: Option<u8>,
    pub pre_handle_decimal_name: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LanguageDocument {
    #[serde(default)]
    pub list_code_language: Vec<String>,
    #[serde(default)]
    pub language_labels: Map<String, Value>,
    #[serde(default)]
    pub list_inner: Vec<String>,
    #[serde(default)]
    pub list_translate: Map<String, Value>,
}

/// 解析项目文档：先迁移补齐，再尝试反序列化为强类型 `ProjectDocument`。
pub fn parse_legacy_project_document(path: Option<String>, value: Value) -> ProjectParseReport {
    if value.get("config_version").and_then(Value::as_str) == Some("jc002") {
        let summary = ProjectSummary::from_legacy_value(path, &value);
        let validation = ProjectValidationReport::from_legacy_value(&value);
        let mut errors = Vec::new();
        let document = match serde_json::from_value::<ProjectDocument>(value) {
            Ok(document) => Some(document),
            Err(error) => {
                errors.push(format!("jc002 强类型解析失败：{}", error));
                None
            }
        };
        return ProjectParseReport {
            valid: validation.valid && errors.is_empty(),
            summary,
            validation,
            document,
            added_sections: Vec::new(),
            errors,
        };
    }
    let migrated = migrate_legacy_project_document(path, value);
    let mut errors = Vec::new();
    let document = match serde_json::from_value::<ProjectDocument>(migrated.document.clone()) {
        Ok(document) => Some(document),
        Err(error) => {
            errors.push(format!(".jcpro 强类型解析失败：{}", error));
            None
        }
    };

    ProjectParseReport {
        valid: migrated.validation.valid && errors.is_empty(),
        summary: migrated.summary,
        validation: migrated.validation,
        document,
        added_sections: migrated.added_sections,
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_empty_battery_monitor(document: &Value) {
        let battery_monitor = document
            .get("battery_monitor")
            .expect("battery_monitor section");

        assert_eq!(battery_monitor.get("enabled"), Some(&Value::Bool(false)));
        assert_eq!(
            battery_monitor
                .get("frames")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        assert_eq!(
            battery_monitor
                .get("signals")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        assert_eq!(
            battery_monitor
                .get("items")
                .and_then(Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        assert!(!document
            .get("language_info")
            .and_then(|value| value.get("list_inner"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|key| key.starts_with("battery_monitor.")));
    }

    #[test]
    fn new_project_uses_only_the_battery_monitor_scaffold() {
        let document = create_legacy_project_document("demo", 800, 480);

        assert_empty_battery_monitor(&document);
    }

    #[test]
    fn migration_fills_only_the_battery_monitor_scaffold() {
        let migrated = migrate_legacy_project_document(
            None,
            json!({
                "project": { "name": "demo" },
                "language_info": {
                    "list_code_language": ["zh", "en"],
                    "list_inner": ["中文", "英文"],
                    "list_translate": {}
                }
            }),
        );

        assert_empty_battery_monitor(&migrated.document);
    }

    fn valid_v2_document() -> Value {
        json!({
            "config_version": "jc002",
            "project": { "name": "v2" },
            "export_info": {},
            "device": { "resolution_w": 800, "resolution_h": 480 },
            "ui_info": {},
            "pdo_simple_send_recv": { "pdo_send": [], "pdo_recv": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name_index": 0, "name": "", "children": [] },
            "localization": {
                "default_locale": "zh",
                "locale_order": ["zh", "en"],
                "locales": {
                    "zh": { "translations": { "menu.root": "菜单" } },
                    "en": { "translations": { "menu.root": "Menu" } }
                }
            }
        })
    }

    #[test]
    fn validation_accepts_v2_without_v1_or_optional_sections() {
        let report = ProjectValidationReport::from_legacy_value(&valid_v2_document());

        assert!(report.valid, "{:?}", report.warnings);
        assert!(report.missing_sections.is_empty());
    }

    #[test]
    fn parsing_v2_does_not_run_legacy_migration() {
        let report = parse_legacy_project_document(None, valid_v2_document());

        assert!(report.valid, "{:?}", report.errors);
        assert!(report.added_sections.is_empty());
        let document = report.document.unwrap();
        assert_eq!(document.config_version.as_deref(), Some("jc002"));
        assert!(document.localization.is_some());
        assert!(document.language_info.is_none());
        assert!(document.battery_monitor.is_none());
    }

    #[test]
    fn version_contract_rejects_mixed_v2_document() {
        let mut document = valid_v2_document();
        document["language_info"] = default_language_info();

        assert_eq!(
            validate_project_version_contract(&document),
            Err("jc002 项目禁止包含 jc001 language_info".to_string())
        );
    }
}
