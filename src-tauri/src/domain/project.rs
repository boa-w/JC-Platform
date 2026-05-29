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

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

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
        let required_sections = required_project_sections();
        let missing_sections = required_sections
            .iter()
            .filter(|section| value.get(**section).is_none())
            .map(|section| (*section).to_string())
            .collect::<Vec<_>>();
        let mut warnings = Vec::new();

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

        Self {
            valid: missing_sections.is_empty(),
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

/// 创建包含所有必要段落的新项目 JSON 文档。
pub fn create_legacy_project_document(name: &str, resolution_w: u32, resolution_h: u32) -> Value {
    json!({
        "config_version": "0.1.0-tauri-refactor",
        "project": {
            "name": name,
            "from": "tauri-refactor",
            "base_path": "",
            "create_time": "",
            "update_time": ""
        },
        "device": {
            "resolution_w": resolution_w,
            "resolution_h": resolution_h
        },
        "ui_info": [],
        "pdo_simple_send_recv": default_pdo_simple(),
        "pdo_global_param": [],
        "pdo_condition": [],
        "pdo_recv": [],
        "pdo_send": [],
        "sdo_info": default_sdo_info(),
        "language_info": default_language_info()
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
    let mut added_sections = Vec::new();

    for section in required_project_sections() {
        if !document.contains_key(*section) {
            document.insert((*section).to_string(), default_section_value(section));
            added_sections.push((*section).to_string());
        }
    }

    document.insert(
        "config_version".to_string(),
        Value::String("0.1.0-tauri-refactor".to_string()),
    );
    let document = Value::Object(document);
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

fn required_project_sections() -> &'static [&'static str] {
    &[
        "project",
        "device",
        "ui_info",
        "pdo_simple_send_recv",
        "pdo_global_param",
        "pdo_condition",
        "pdo_recv",
        "pdo_send",
        "sdo_info",
        "language_info",
    ]
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
        "device" => json!({
            "resolution_w": 0,
            "resolution_h": 0
        }),
        "pdo_simple_send_recv" => default_pdo_simple(),
        "sdo_info" => default_sdo_info(),
        "language_info" => default_language_info(),
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
    json!({
        "list_code_language": ["zh", "en"],
        "language_labels": {
            "zh": "中文",
            "en": "英文"
        },
        "list_inner": ["中文", "英文"],
        "list_translate": {}
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
    pub language_info: LanguageDocument,
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
