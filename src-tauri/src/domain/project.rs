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
use crate::domain::protocol_manager::migrate_project_to_unified_protocol;
use crate::domain::signal::SignalDictionary;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

const PROTOCOL_PROFILE_SCHEMA_VERSION: u64 = 2;
const PROTOCOL_PROFILE_ID_MAX_BYTES: usize = 63;
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
            Some("jc001") if value.get("canopen").is_some() => {
                warnings.push("jc001 项目禁止包含 jc002 canopen".to_string());
                schema_valid = false;
            }
            Some("jc001") if value.get("fault_code_info").is_some() => {
                warnings.push(
                    "jc001 项目不包含故障码管理；请在 jc002 fault_code_profiles 中配置".to_string(),
                );
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
                if let Err(error) = validate_fault_code_version_contract(value) {
                    warnings.push(error);
                    schema_valid = false;
                }
                if let Err(error) = validate_canopen_contract(value) {
                    warnings.push(error);
                    schema_valid = false;
                }
                if let Err(error) = validate_protocol_profiles_contract(value) {
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

        if let Err(error) = validate_battery_monitor_version_contract(value) {
            warnings.push(error);
            schema_valid = false;
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
    let result = match document.get("config_version").and_then(Value::as_str) {
        Some("jc001") if document.get("localization").is_some() => {
            Err("jc001 项目禁止包含 jc002 localization".to_string())
        }
        Some("jc001") if document.get("canopen").is_some() => {
            Err("jc001 项目禁止包含 jc002 canopen".to_string())
        }
        Some("jc001") => Ok(()),
        Some("jc002") if document.get("language_info").is_some() => {
            Err("jc002 项目禁止包含 jc001 language_info".to_string())
        }
        Some("jc002") => crate::domain::localization::validate_localization(document),
        Some(version) => Err(format!("不支持的 config_version：{version}")),
        None => Ok(()),
    };
    result?;
    validate_protocol_profiles_contract(document)?;
    validate_fault_code_version_contract(document)?;
    validate_canopen_contract(document)?;
    validate_battery_monitor_version_contract(document)
}

/// Validate the jc002 controller, battery, and fault-code protocol registries.
///
/// These protocol families intentionally have independent identity
/// spaces and active selections. The firmware receives their selected runtime
/// sections only after the exporter combines them into the existing ABI.
pub fn validate_protocol_profiles_contract(document: &Value) -> Result<(), String> {
    let Some(root) = document.get("protocol_profiles") else {
        return Ok(());
    };
    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        return Err("protocol_profiles 仅支持 jc002 项目".to_string());
    }
    let schema_version = root
        .get("schema_version")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    if schema_version != PROTOCOL_PROFILE_SCHEMA_VERSION {
        return Err(format!(
            "jc002 protocol_profiles 必须使用 schema_version={}，当前为 {schema_version}",
            PROTOCOL_PROFILE_SCHEMA_VERSION
        ));
    }
    let active_controller_profile_id = root
        .get("active_controller_profile_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "protocol_profiles.active_controller_profile_id 不能为空".to_string())?;
    if active_controller_profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
        return Err(
            "protocol_profiles.active_controller_profile_id 超过固件 63 字节限制".to_string(),
        );
    }
    let controller_profiles = root
        .get("controller_profiles")
        .and_then(Value::as_array)
        .ok_or_else(|| "protocol_profiles.controller_profiles 必须为数组".to_string())?;
    if controller_profiles.is_empty() {
        return Err("protocol_profiles.controller_profiles 不能为空".to_string());
    }
    let battery_profiles = root
        .get("battery_profiles")
        .and_then(Value::as_array)
        .ok_or_else(|| "protocol_profiles.battery_profiles 必须为数组".to_string())?;
    let active_battery_profile_id = match root.get("active_battery_profile_id") {
        None | Some(Value::Null) => None,
        Some(value) => Some(
            value
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    "protocol_profiles.active_battery_profile_id 必须为非空字符串".to_string()
                })?,
        ),
    };
    if let Some(profile_id) = active_battery_profile_id {
        if profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
            return Err(
                "protocol_profiles.active_battery_profile_id 超过固件 63 字节限制".to_string(),
            );
        }
    } else if !battery_profiles.is_empty() {
        return Err(
            "protocol_profiles.battery_profiles 非空时必须设置 active_battery_profile_id"
                .to_string(),
        );
    }
    let fault_code_profiles: &[Value] = root
        .get("fault_code_profiles")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let active_fault_code_profile_id = match root.get("active_fault_code_profile_id") {
        None | Some(Value::Null) => None,
        Some(value) => Some(
            value
                .as_str()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    "protocol_profiles.active_fault_code_profile_id 必须为非空字符串".to_string()
                })?,
        ),
    };
    if let Some(profile_id) = active_fault_code_profile_id {
        if profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
            return Err(
                "protocol_profiles.active_fault_code_profile_id 超过固件 63 字节限制".to_string(),
            );
        }
    } else if !fault_code_profiles.is_empty() {
        return Err(
            "protocol_profiles.fault_code_profiles 非空时必须设置 active_fault_code_profile_id"
                .to_string(),
        );
    }

    let mut controller_profile_ids = HashSet::new();
    let mut active_controller_found = false;
    for (index, profile) in controller_profiles.iter().enumerate() {
        let label = format!("controller profile {}", index + 1);
        let profile_id = profile
            .get("profile_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{label}.profile_id 不能为空"))?;
        if !controller_profile_ids.insert(profile_id.to_string()) {
            return Err(format!("controller profile_id 重复：{profile_id}"));
        }
        if profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
            return Err(format!(
                "{label}.profile_id 超过固件 63 字节限制：{profile_id}"
            ));
        }
        if profile_id == active_controller_profile_id {
            active_controller_found = true;
        }
        if profile
            .get("controller_family")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(format!("{label}.controller_family 不能为空"));
        }
        if profile
            .get("controller_revision")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(format!("{label}.controller_revision 必须为字符串"));
        }
        let protocol = profile
            .get("protocol")
            .and_then(Value::as_object)
            .ok_or_else(|| format!("{label}.protocol 必须为对象"))?;
        if protocol.contains_key("battery_monitor") {
            return Err(format!("{label}.protocol 不得包含 battery_monitor"));
        }
        for section in ["pdo_global_param", "pdo_condition", "pdo_recv", "pdo_send"] {
            if !protocol.get(section).is_some_and(Value::is_array) {
                return Err(format!("{label}.protocol.{section} 必须为数组"));
            }
        }
        if !protocol.get("sdo_info").is_some_and(Value::is_object) {
            return Err(format!("{label}.protocol.sdo_info 必须为对象"));
        }
        if let Some(overlay) = profile.get("localization_overlay") {
            crate::domain::localization::validate_localization_overlay(
                document,
                overlay,
                &format!("{label}.localization_overlay"),
            )?;
        }

        let mut materialized = document.clone();
        let object = materialized
            .as_object_mut()
            .ok_or_else(|| "jc002 项目根节点必须为对象".to_string())?;
        object.remove("protocol_profiles");
        for section in [
            "pdo_global_param",
            "pdo_condition",
            "pdo_recv",
            "pdo_send",
            "sdo_info",
            "canopen",
            "battery_monitor",
        ] {
            object.remove(section);
        }
        for (key, value) in protocol {
            object.insert(key.clone(), value.clone());
        }
        validate_canopen_contract(&materialized)?;
    }
    if !active_controller_found {
        return Err(format!(
            "protocol_profiles.active_controller_profile_id 不存在：{active_controller_profile_id}"
        ));
    }

    let mut battery_profile_ids = HashSet::new();
    let mut active_battery_found = false;
    for (index, profile) in battery_profiles.iter().enumerate() {
        let label = format!("battery profile {}", index + 1);
        let profile_id = profile
            .get("profile_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{label}.profile_id 不能为空"))?;
        if !battery_profile_ids.insert(profile_id.to_string()) {
            return Err(format!("battery profile_id 重复：{profile_id}"));
        }
        if profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
            return Err(format!(
                "{label}.profile_id 超过固件 63 字节限制：{profile_id}"
            ));
        }
        if Some(profile_id) == active_battery_profile_id {
            active_battery_found = true;
        }
        if profile
            .get("battery_family")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(format!("{label}.battery_family 不能为空"));
        }
        if profile
            .get("battery_revision")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(format!("{label}.battery_revision 必须为字符串"));
        }
        let protocol = profile
            .get("protocol")
            .and_then(Value::as_object)
            .ok_or_else(|| format!("{label}.protocol 必须为对象"))?;
        if protocol.keys().any(|key| key != "battery_monitor")
            || !protocol
                .get("battery_monitor")
                .is_some_and(Value::is_object)
        {
            return Err(format!("{label}.protocol 必须只包含 battery_monitor 对象"));
        }
        if let Some(overlay) = profile.get("localization_overlay") {
            crate::domain::localization::validate_localization_overlay(
                document,
                overlay,
                &format!("{label}.localization_overlay"),
            )?;
        }

        let mut materialized = document.clone();
        let object = materialized
            .as_object_mut()
            .ok_or_else(|| "jc002 项目根节点必须为对象".to_string())?;
        object.remove("protocol_profiles");
        for section in [
            "pdo_global_param",
            "pdo_condition",
            "pdo_recv",
            "pdo_send",
            "sdo_info",
            "canopen",
            "battery_monitor",
        ] {
            object.remove(section);
        }
        object.insert(
            "battery_monitor".to_string(),
            protocol
                .get("battery_monitor")
                .cloned()
                .ok_or_else(|| format!("{label}.protocol 缺少 battery_monitor"))?,
        );
        validate_battery_monitor_version_contract(&materialized)?;
    }
    if let Some(active_battery_profile_id) = active_battery_profile_id {
        if !active_battery_found {
            return Err(format!(
                "protocol_profiles.active_battery_profile_id 不存在：{active_battery_profile_id}"
            ));
        }
    }

    let mut fault_code_profile_ids = HashSet::new();
    let mut active_fault_code_found = false;
    for (index, profile) in fault_code_profiles.iter().enumerate() {
        let label = format!("fault code profile {}", index + 1);
        let profile_id = profile
            .get("profile_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{label}.profile_id 不能为空"))?;
        if !fault_code_profile_ids.insert(profile_id.to_string()) {
            return Err(format!("fault code profile_id 重复：{profile_id}"));
        }
        if profile_id.len() > PROTOCOL_PROFILE_ID_MAX_BYTES {
            return Err(format!(
                "{label}.profile_id 超过固件 63 字节限制：{profile_id}"
            ));
        }
        if Some(profile_id) == active_fault_code_profile_id {
            active_fault_code_found = true;
        }
        if profile
            .get("fault_family")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            return Err(format!("{label}.fault_family 不能为空"));
        }
        if profile
            .get("fault_revision")
            .and_then(Value::as_str)
            .is_none()
        {
            return Err(format!("{label}.fault_revision 必须为字符串"));
        }
        let protocol = profile
            .get("protocol")
            .and_then(Value::as_object)
            .ok_or_else(|| format!("{label}.protocol 必须为对象"))?;
        if protocol.keys().any(|key| key != "fault_code_info")
            || !protocol
                .get("fault_code_info")
                .is_some_and(Value::is_object)
        {
            return Err(format!("{label}.protocol 必须只包含 fault_code_info 对象"));
        }
        validate_fault_code_info_value(
            protocol
                .get("fault_code_info")
                .expect("validated fault_code_info object"),
            Some("jc002"),
        )?;
        if let Some(overlay) = profile.get("localization_overlay") {
            crate::domain::localization::validate_localization_overlay(
                document,
                overlay,
                &format!("{label}.localization_overlay"),
            )?;
        }
    }
    if let Some(active_fault_code_profile_id) = active_fault_code_profile_id {
        if !active_fault_code_found {
            return Err(format!(
                "protocol_profiles.active_fault_code_profile_id 不存在：{active_fault_code_profile_id}"
            ));
        }
    }

    // Validate every controller/battery/fault combination now so conflicting
    // overlay keys are reported while opening the project, not only during
    // export of a particular payload.
    if let Some(localization) = document.get("localization") {
        let battery_options = if battery_profiles.is_empty() {
            vec![None]
        } else {
            battery_profiles.iter().map(Some).collect::<Vec<_>>()
        };
        let fault_options = if fault_code_profiles.is_empty() {
            vec![None]
        } else {
            fault_code_profiles.iter().map(Some).collect::<Vec<_>>()
        };
        for controller_profile in controller_profiles {
            let controller_id = controller_profile
                .get("profile_id")
                .and_then(Value::as_str)
                .unwrap_or("unknown-controller");
            let controller_overlay = controller_profile.get("localization_overlay");
            for battery_profile in &battery_options {
                for fault_profile in &fault_options {
                    let mut overlays = Vec::new();
                    if let Some(overlay) = controller_overlay {
                        overlays.push((controller_id, overlay));
                    }
                    if let Some(profile) = battery_profile {
                        let profile_id = profile
                            .get("profile_id")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown-battery");
                        if let Some(overlay) = profile.get("localization_overlay") {
                            overlays.push((profile_id, overlay));
                        }
                    }
                    if let Some(profile) = fault_profile {
                        let profile_id = profile
                            .get("profile_id")
                            .and_then(Value::as_str)
                            .unwrap_or("unknown-fault");
                        if let Some(overlay) = profile.get("localization_overlay") {
                            overlays.push((profile_id, overlay));
                        }
                    }
                    crate::domain::localization::merge_localization_overlays(
                        localization,
                        &overlays,
                    )?;
                }
            }
        }
    }
    Ok(())
}

/// Return a project document with one controller/battery/fault protocol combination
/// materialized at the jc002 runtime locations used by the builder. The
/// returned document is only an export/build view; it is never persisted.
pub fn materialize_protocol_profiles_for_selection(
    document: &Value,
    controller_profile_id: &str,
    battery_profile_id: Option<&str>,
    fault_code_profile_id: Option<&str>,
) -> Result<Value, String> {
    let Some(root) = document.get("protocol_profiles") else {
        return Ok(document.clone());
    };
    validate_protocol_profiles_contract(document)?;
    let controller_profiles = root
        .get("controller_profiles")
        .and_then(Value::as_array)
        .ok_or_else(|| "protocol_profiles.controller_profiles 必须为数组".to_string())?;
    let controller_profile = controller_profiles
        .iter()
        .find(|profile| {
            profile.get("profile_id").and_then(Value::as_str) == Some(controller_profile_id)
        })
        .ok_or_else(|| format!("找不到 controller protocol profile：{controller_profile_id}"))?;
    let controller_protocol = controller_profile
        .get("protocol")
        .and_then(Value::as_object)
        .ok_or_else(|| "active controller protocol profile 缺少 protocol 对象".to_string())?;
    let battery_protocol = match battery_profile_id {
        Some(selected_id) => {
            let profiles = root
                .get("battery_profiles")
                .and_then(Value::as_array)
                .ok_or_else(|| "protocol_profiles.battery_profiles 必须为数组".to_string())?;
            let profile = profiles
                .iter()
                .find(|profile| {
                    profile.get("profile_id").and_then(Value::as_str) == Some(selected_id)
                })
                .ok_or_else(|| format!("找不到 battery protocol profile：{selected_id}"))?;
            Some(
                profile
                    .get("protocol")
                    .and_then(Value::as_object)
                    .ok_or_else(|| {
                        format!("battery protocol profile 缺少 protocol 对象：{selected_id}")
                    })?,
            )
        }
        None => None,
    };
    let fault_code_protocol = match fault_code_profile_id {
        Some(selected_id) => {
            let profiles = root
                .get("fault_code_profiles")
                .and_then(Value::as_array)
                .ok_or_else(|| "protocol_profiles.fault_code_profiles 必须为数组".to_string())?;
            let profile = profiles
                .iter()
                .find(|profile| {
                    profile.get("profile_id").and_then(Value::as_str) == Some(selected_id)
                })
                .ok_or_else(|| format!("找不到 fault code protocol profile：{selected_id}"))?;
            Some(
                profile
                    .get("protocol")
                    .and_then(Value::as_object)
                    .ok_or_else(|| {
                        format!("fault code protocol profile 缺少 protocol 对象：{selected_id}")
                    })?,
            )
        }
        None => None,
    };
    let controller_overlay = controller_profile.get("localization_overlay");
    let battery_overlay = match battery_profile_id {
        Some(selected_id) => root
            .get("battery_profiles")
            .and_then(Value::as_array)
            .and_then(|profiles| {
                profiles.iter().find(|profile| {
                    profile.get("profile_id").and_then(Value::as_str) == Some(selected_id)
                })
            })
            .and_then(|profile| profile.get("localization_overlay")),
        None => None,
    };
    let fault_code_overlay = match fault_code_profile_id {
        Some(selected_id) => root
            .get("fault_code_profiles")
            .and_then(Value::as_array)
            .and_then(|profiles| {
                profiles.iter().find(|profile| {
                    profile.get("profile_id").and_then(Value::as_str) == Some(selected_id)
                })
            })
            .and_then(|profile| profile.get("localization_overlay")),
        None => None,
    };
    let mut materialized = document.clone();
    let object = materialized
        .as_object_mut()
        .ok_or_else(|| "jc002 项目根节点必须为对象".to_string())?;
    object.remove("protocol_profiles");
    for section in [
        "pdo_global_param",
        "pdo_condition",
        "pdo_recv",
        "pdo_send",
        "sdo_info",
        "canopen",
        "battery_monitor",
        "fault_code_info",
    ] {
        object.remove(section);
    }
    for (key, value) in controller_protocol {
        object.insert(key.clone(), value.clone());
    }
    if let Some(battery_protocol) = battery_protocol {
        if let Some(value) = battery_protocol.get("battery_monitor") {
            object.insert("battery_monitor".to_string(), value.clone());
        }
    }
    if let Some(fault_code_protocol) = fault_code_protocol {
        if let Some(value) = fault_code_protocol.get("fault_code_info") {
            object.insert("fault_code_info".to_string(), value.clone());
        }
    }
    if let Some(localization) = document.get("localization") {
        let controller_label = format!("controller profile {controller_profile_id}");
        let battery_label = battery_profile_id.map(|value| format!("battery profile {value}"));
        let fault_label = fault_code_profile_id.map(|value| format!("fault code profile {value}"));
        let mut overlays = Vec::new();
        if let Some(overlay) = controller_overlay {
            overlays.push((controller_label.as_str(), overlay));
        }
        if let (Some(label), Some(overlay)) = (battery_label.as_deref(), battery_overlay) {
            overlays.push((label, overlay));
        }
        if let (Some(label), Some(overlay)) = (fault_label.as_deref(), fault_code_overlay) {
            overlays.push((label, overlay));
        }
        let merged =
            crate::domain::localization::merge_localization_overlays(localization, &overlays)?;
        object.insert("localization".to_string(), merged);
    }
    Ok(materialized)
}

/// Return a project document with the configured active protocol Profiles
/// materialized. This is the single-profile convenience entry point used by
/// validation and manifest generation.
pub fn materialize_active_protocol_profiles(document: &Value) -> Result<Value, String> {
    let Some(root) = document.get("protocol_profiles") else {
        return Ok(document.clone());
    };
    let controller_profile_id = root
        .get("active_controller_profile_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "protocol_profiles.active_controller_profile_id 不能为空".to_string())?;
    let battery_profile_id = root
        .get("active_battery_profile_id")
        .and_then(Value::as_str);
    let fault_code_profile_id = root
        .get("active_fault_code_profile_id")
        .and_then(Value::as_str);
    materialize_protocol_profiles_for_selection(
        document,
        controller_profile_id,
        battery_profile_id,
        fault_code_profile_id,
    )
}

/// Normalize every jc002 export to the multi-profile document shape.
///
/// Existing v2 editing documents may still have their single controller and
/// battery sections at the root. Export must not create a second runtime ABI
/// for that case, so it wraps those sections in stable default Profile IDs
/// before building the shared payload bundle. The normalized value is an
/// export-only view and is never written back implicitly.
pub fn normalize_protocol_profiles_for_export(document: &Value) -> Result<Value, String> {
    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        return Ok(document.clone());
    }
    if document.get("protocol_profiles").is_some() {
        validate_protocol_profiles_contract(document)?;
        let mut normalized = document.clone();
        let root_fault_code_info = normalized.get("fault_code_info").cloned();
        let profile_root = normalized
            .get_mut("protocol_profiles")
            .and_then(Value::as_object_mut)
            .ok_or_else(|| "jc002 protocol_profiles 必须为对象".to_string())?;
        for collection in [
            "controller_profiles",
            "battery_profiles",
            "fault_code_profiles",
        ] {
            if let Some(profiles) = profile_root
                .get_mut(collection)
                .and_then(Value::as_array_mut)
            {
                for profile in profiles {
                    if let Some(object) = profile.as_object_mut() {
                        object
                            .entry("localization_overlay".to_string())
                            .or_insert_with(|| json!({ "locales": {} }));
                    }
                }
            }
        }
        if !profile_root.contains_key("fault_code_profiles") {
            if let Some(fault_code_info) = root_fault_code_info {
                profile_root.insert(
                    "active_fault_code_profile_id".to_string(),
                    json!("fault.default"),
                );
                profile_root.insert(
                    "fault_code_profiles".to_string(),
                    json!([{
                        "profile_id": "fault.default",
                        "fault_family": "generic",
                        "fault_revision": "",
                        "localization_overlay": { "locales": {} },
                        "protocol": { "fault_code_info": fault_code_info }
                    }]),
                );
            }
        }
        return Ok(normalized);
    }

    let mut normalized = document.clone();
    let root = normalized
        .as_object_mut()
        .ok_or_else(|| "jc002 项目根节点必须为对象".to_string())?;
    let mut controller_protocol = Map::new();
    for section in ["pdo_global_param", "pdo_condition", "pdo_recv", "pdo_send"] {
        controller_protocol.insert(
            section.to_string(),
            document.get(section).cloned().unwrap_or_else(|| json!([])),
        );
    }
    controller_protocol.insert(
        "sdo_info".to_string(),
        document.get("sdo_info").cloned().unwrap_or_else(|| {
            json!({
                "type": 0,
                "user_auth": 0,
                "name_index": 0,
                "name": "",
                "children": []
            })
        }),
    );
    if let Some(canopen) = document.get("canopen") {
        controller_protocol.insert("canopen".to_string(), canopen.clone());
    }

    let mut controller_profile = Map::new();
    controller_profile.insert("profile_id".to_string(), json!("controller.default"));
    controller_profile.insert("controller_family".to_string(), json!("generic"));
    controller_profile.insert("controller_revision".to_string(), json!(""));
    controller_profile.insert("localization_overlay".to_string(), json!({ "locales": {} }));
    controller_profile.insert("protocol".to_string(), Value::Object(controller_protocol));

    let battery_profile = document
        .get("battery_monitor")
        .filter(|value| value.is_object())
        .map(|battery_monitor| {
            json!({
                "profile_id": "battery.default",
                "battery_family": "generic",
                "battery_revision": "",
                "localization_overlay": { "locales": {} },
                "protocol": { "battery_monitor": battery_monitor }
            })
        });
    let has_battery_profile = battery_profile.is_some();

    let mut profile_root = Map::new();
    profile_root.insert(
        "schema_version".to_string(),
        json!(PROTOCOL_PROFILE_SCHEMA_VERSION),
    );
    profile_root.insert(
        "active_controller_profile_id".to_string(),
        json!("controller.default"),
    );
    profile_root.insert(
        "controller_profiles".to_string(),
        Value::Array(vec![Value::Object(controller_profile)]),
    );
    profile_root.insert(
        "battery_profiles".to_string(),
        Value::Array(battery_profile.into_iter().collect()),
    );
    if has_battery_profile {
        profile_root.insert(
            "active_battery_profile_id".to_string(),
            json!("battery.default"),
        );
    }
    if let Some(fault_code_info) = document.get("fault_code_info") {
        profile_root.insert(
            "active_fault_code_profile_id".to_string(),
            json!("fault.default"),
        );
        profile_root.insert(
            "fault_code_profiles".to_string(),
            json!([{
                "profile_id": "fault.default",
                "fault_family": "generic",
                "fault_revision": "",
                "localization_overlay": { "locales": {} },
                "protocol": { "fault_code_info": fault_code_info }
            }]),
        );
    } else {
        profile_root.insert("fault_code_profiles".to_string(), Value::Array(Vec::new()));
    }
    root.insert("protocol_profiles".to_string(), Value::Object(profile_root));
    validate_protocol_profiles_contract(&normalized)?;
    Ok(normalized)
}

/// Build the manifest-only identity block. Controller and battery payloads
/// remain in the selected jc002 data.bin runtime sections.
pub fn protocol_profiles_manifest(document: &Value) -> Option<Value> {
    let normalized = if document.get("config_version").and_then(Value::as_str) == Some("jc002") {
        normalize_protocol_profiles_for_export(document).ok()?
    } else {
        document.clone()
    };
    let root = normalized.get("protocol_profiles")?.as_object()?;
    let controller_profiles = root.get("controller_profiles")?.as_array()?;
    let battery_profiles = root.get("battery_profiles")?.as_array()?;
    let fault_code_profiles = root
        .get("fault_code_profiles")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let controller_entries = controller_profiles
        .iter()
        .filter_map(|profile| {
            Some(json!({
                "profile_id": profile.get("profile_id")?.as_str()?,
                "controller_family": profile.get("controller_family").and_then(Value::as_str).unwrap_or("generic"),
                "controller_revision": profile.get("controller_revision").and_then(Value::as_str).unwrap_or(""),
            }))
        })
        .collect::<Vec<_>>();
    let battery_entries = battery_profiles
        .iter()
        .filter_map(|profile| {
            Some(json!({
                "profile_id": profile.get("profile_id")?.as_str()?,
                "battery_family": profile.get("battery_family").and_then(Value::as_str).unwrap_or("generic"),
                "battery_revision": profile.get("battery_revision").and_then(Value::as_str).unwrap_or(""),
            }))
        })
        .collect::<Vec<_>>();
    let fault_code_entries = fault_code_profiles
        .iter()
        .filter_map(|profile| {
            Some(json!({
                "profile_id": profile.get("profile_id")?.as_str()?,
                "fault_family": profile.get("fault_family").and_then(Value::as_str).unwrap_or("generic"),
                "fault_revision": profile.get("fault_revision").and_then(Value::as_str).unwrap_or(""),
            }))
        })
        .collect::<Vec<_>>();
    let mut manifest = Map::new();
    manifest.insert(
        "schema_version".to_string(),
        json!(root
            .get("schema_version")
            .and_then(Value::as_u64)
            .unwrap_or(PROTOCOL_PROFILE_SCHEMA_VERSION)),
    );
    manifest.insert(
        "active_controller_profile_id".to_string(),
        json!(root
            .get("active_controller_profile_id")
            .and_then(Value::as_str)
            .unwrap_or("")),
    );
    if let Some(active_id) = root
        .get("active_battery_profile_id")
        .and_then(Value::as_str)
    {
        manifest.insert("active_battery_profile_id".to_string(), json!(active_id));
    }
    if let Some(active_id) = root
        .get("active_fault_code_profile_id")
        .and_then(Value::as_str)
    {
        manifest.insert("active_fault_code_profile_id".to_string(), json!(active_id));
    }
    manifest.insert("controller_profiles".to_string(), json!(controller_entries));
    manifest.insert("battery_profiles".to_string(), json!(battery_entries));
    manifest.insert("fault_code_profiles".to_string(), json!(fault_code_entries));
    Some(Value::Object(manifest))
}

/// 校验 jc002 的 CANopen 拓扑元数据。
///
/// PDO 的实际数据映射仍由 `pdo_recv`/`pdo_send` 写入现有二进制 ABI，`canopen`
/// 只负责声明节点、SDO COB-ID、PDO 类型和显式 COB-ID。这样自定义 ID（例如
/// 0x3C0、0x294）不会再被默认连接集推断逻辑误判为无效帧。
pub fn validate_canopen_contract(document: &Value) -> Result<(), String> {
    let Some(value) = document.get("canopen") else {
        return Ok(());
    };
    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        return Err("canopen 拓扑仅支持 jc002 项目".to_string());
    }
    let config = serde_json::from_value::<CanOpenProjectDocument>(value.clone())
        .map_err(|error| format!("jc002 canopen 配置格式无效：{error}"))?;
    if config.schema_version != 1 {
        return Err(format!(
            "jc002 canopen 必须使用 schema_version=1，当前为 {}",
            config.schema_version
        ));
    }
    if value.get("nodes").and_then(Value::as_array).is_none()
        || value.get("pdos").and_then(Value::as_array).is_none()
    {
        return Err("jc002 canopen 必须同时声明 nodes 和 pdos 数组".to_string());
    }

    let mut node_ids = HashSet::new();
    let mut sdo_cob_ids = HashSet::<(u32, u8)>::new();
    for node in &config.nodes {
        if !(1..=127).contains(&node.node_id) || !node_ids.insert(node.node_id) {
            return Err(format!(
                "jc002 canopen 节点 node_id 无效或重复：{}",
                node.node_id
            ));
        }
        if let Some(sdo) = &node.sdo {
            validate_canopen_cob_id(
                sdo.client_to_server_cob_id,
                0,
                &format!("节点 {} SDO client_to_server", node.node_id),
            )?;
            validate_canopen_cob_id(
                sdo.server_to_client_cob_id,
                0,
                &format!("节点 {} SDO server_to_client", node.node_id),
            )?;
            if !sdo_cob_ids.insert((sdo.client_to_server_cob_id, 0))
                || !sdo_cob_ids.insert((sdo.server_to_client_cob_id, 0))
            {
                return Err(format!(
                    "节点 {} 的 SDO COB-ID 与其他 SDO 通道重复",
                    node.node_id
                ));
            }
            if sdo.cob_id_mode == "default"
                && (sdo.client_to_server_cob_id != 0x600 + node.node_id
                    || sdo.server_to_client_cob_id != 0x580 + node.node_id)
            {
                return Err(format!(
                    "节点 {} 的默认 SDO COB-ID 必须为 0x{:X}/0x{:X}",
                    node.node_id,
                    0x600 + node.node_id,
                    0x580 + node.node_id
                ));
            }
            if !matches!(sdo.cob_id_mode.as_str(), "default" | "explicit") {
                return Err(format!(
                    "节点 {} 的 SDO cob_id_mode 无效：{}",
                    node.node_id, sdo.cob_id_mode
                ));
            }
        }
    }

    let mut pdo_keys = HashSet::new();
    let mut pdo_ids = HashSet::new();
    let mut endpoint_pdo_numbers = HashSet::<(u32, String, u32)>::new();
    for pdo in &config.pdos {
        if pdo.key.trim().is_empty() || !pdo_keys.insert(pdo.key.as_str()) {
            return Err(format!("jc002 canopen PDO key 无效或重复：{}", pdo.key));
        }
        if !matches!(pdo.direction.as_str(), "receive" | "send") {
            return Err(format!(
                "CANopen PDO {} 的 direction 必须为 receive 或 send",
                pdo.key
            ));
        }
        if !matches!(pdo.pdo_type.as_str(), "tpdo" | "rpdo") {
            return Err(format!(
                "CANopen PDO {} 的 pdo_type 必须为 tpdo 或 rpdo",
                pdo.key
            ));
        }
        if pdo.producer_node_id.is_some() && pdo.pdo_type != "tpdo" {
            return Err(format!(
                "CANopen PDO {} 指定 producer_node_id 时，pdo_type 必须为 tpdo",
                pdo.key
            ));
        }
        if !matches!(pdo.cob_id_mode.as_str(), "default" | "explicit") {
            return Err(format!(
                "CANopen PDO {} 的 cob_id_mode 无效：{}",
                pdo.key, pdo.cob_id_mode
            ));
        }
        validate_canopen_cob_id(pdo.cob_id, pdo.frame_type, &format!("PDO {}", pdo.key))?;
        if sdo_cob_ids.contains(&(pdo.cob_id, pdo.frame_type)) {
            return Err(format!(
                "CANopen PDO {} 的 COB-ID 与 SDO 通道重复：0x{:X} frame_type={}",
                pdo.key, pdo.cob_id, pdo.frame_type
            ));
        }
        if !pdo_ids.insert((pdo.cob_id, pdo.frame_type)) {
            return Err(format!(
                "CANopen PDO COB-ID 重复：0x{:X} frame_type={}",
                pdo.cob_id, pdo.frame_type
            ));
        }
        if let Some(node_id) = pdo.producer_node_id {
            if !node_ids.contains(&node_id) {
                return Err(format!(
                    "CANopen PDO {} 引用了不存在的 producer node_id {}",
                    pdo.key, node_id
                ));
            }
        }
        for node_id in &pdo.consumer_node_ids {
            if !node_ids.contains(node_id) {
                return Err(format!(
                    "CANopen PDO {} 引用了不存在的 consumer node_id {}",
                    pdo.key, node_id
                ));
            }
        }
        if let Some(number) = pdo.consumer_pdo_number {
            if !(1..=4).contains(&number) {
                return Err(format!(
                    "CANopen PDO {} 的 consumer_pdo_number 必须在 1..=4 内",
                    pdo.key
                ));
            }
            if pdo.consumer_node_ids.is_empty() {
                return Err(format!(
                    "CANopen PDO {} 声明 consumer_pdo_number 时必须至少有一个 consumer_node_id",
                    pdo.key
                ));
            }
        }
        if let Some(number) = pdo.pdo_number {
            if let Some(node_id) = pdo.producer_node_id {
                if !endpoint_pdo_numbers.insert((node_id, pdo.pdo_type.clone(), number)) {
                    return Err(format!(
                        "CANopen PDO {} 与同一生产者节点的 PDO 编号重复：node_id={} pdo_type={} pdo_number={}",
                        pdo.key, node_id, pdo.pdo_type, number
                    ));
                }
            }
        }
        let consumer_number = pdo.consumer_pdo_number.or(pdo.pdo_number);
        if let Some(number) = consumer_number {
            for node_id in &pdo.consumer_node_ids {
                if !endpoint_pdo_numbers.insert((*node_id, "rpdo".to_string(), number)) {
                    return Err(format!(
                        "CANopen PDO {} 与同一消费者节点的 PDO 编号重复：node_id={} pdo_type=rpdo pdo_number={}",
                        pdo.key, node_id, number
                    ));
                }
            }
        }
        if let Some(number) = pdo.pdo_number {
            if !(1..=4).contains(&number) {
                return Err(format!(
                    "CANopen PDO {} 的 pdo_number 必须在 1..=4 内",
                    pdo.key
                ));
            }
            if pdo.cob_id_mode == "default" {
                let Some(node_id) = pdo.producer_node_id else {
                    return Err(format!(
                        "CANopen PDO {} 使用 default COB-ID 时必须声明 producer_node_id",
                        pdo.key
                    ));
                };
                let base = if pdo.pdo_type == "tpdo" { 0x180 } else { 0x200 };
                let expected = base + (number - 1) * 0x100 + node_id;
                if pdo.cob_id != expected {
                    return Err(format!(
                        "CANopen PDO {} 的默认 COB-ID 应为 0x{:X}，当前为 0x{:X}",
                        pdo.key, expected, pdo.cob_id
                    ));
                }
            }
        } else if pdo.cob_id_mode == "default" {
            return Err(format!(
                "CANopen PDO {} 使用 default COB-ID 时必须声明 pdo_number",
                pdo.key
            ));
        }
        if let Some(transmission_type) = pdo.transmission_type {
            if !(transmission_type <= 240 || transmission_type == 254 || transmission_type == 255) {
                return Err(format!(
                    "CANopen PDO {} 的 transmission_type 无效：{}",
                    pdo.key, transmission_type
                ));
            }
        }
        validate_canopen_pdo_source(document, pdo)?;
    }
    Ok(())
}

fn validate_canopen_cob_id(cob_id: u32, frame_type: u8, label: &str) -> Result<(), String> {
    let max = if frame_type == 0 { 0x7ff } else { 0x1fff_ffff };
    if frame_type > 1 || cob_id > max {
        return Err(format!(
            "{} 的 COB-ID/frame_type 无效：0x{:X}/{}",
            label, cob_id, frame_type
        ));
    }
    Ok(())
}

fn validate_canopen_pdo_source(document: &Value, pdo: &CanOpenPdoDocument) -> Result<(), String> {
    let Some(section) = pdo.source_section.as_deref() else {
        return Err(format!(
            "CANopen PDO {} 必须声明 source_section/source_index 以绑定 jc002 PDO 二进制表",
            pdo.key
        ));
    };
    let Some(index) = pdo.source_index else {
        return Err(format!(
            "CANopen PDO {} 指定了 source_section={} 但缺少 source_index",
            pdo.key, section
        ));
    };
    let section_matches_direction = match pdo.direction.as_str() {
        "receive" => matches!(section, "pdo_recv" | "pdo_simple_send_recv.pdo_recv"),
        "send" => matches!(section, "pdo_send" | "pdo_simple_send_recv.pdo_send"),
        _ => false,
    };
    if !section_matches_direction {
        return Err(format!(
            "CANopen PDO {} 的 source_section={} 与 direction={} 不一致",
            pdo.key, section, pdo.direction
        ));
    }
    let Some(frames) = document.get(section).and_then(Value::as_array) else {
        return Err(format!(
            "CANopen PDO {} 引用了不存在的源段 {}",
            pdo.key, section
        ));
    };
    let Some(frame) = frames.get(index) else {
        return Err(format!(
            "CANopen PDO {} 的 source_index 越界：{}[{}]",
            pdo.key, section, index
        ));
    };
    let source_id = frame
        .get("id")
        .and_then(Value::as_u64)
        .or_else(|| frame.get("can_id").and_then(Value::as_u64))
        .unwrap_or(u64::MAX);
    let source_type = frame
        .get("type")
        .and_then(Value::as_u64)
        .or_else(|| frame.get("frame_type").and_then(Value::as_u64))
        .unwrap_or(0);
    if source_id != u64::from(pdo.cob_id) || source_type != u64::from(pdo.frame_type) {
        return Err(format!(
            "CANopen PDO {} 与源段 {}[{}] 的 COB-ID/frame_type 不一致：0x{:X}/{} != 0x{:X}/{}",
            pdo.key, section, index, source_id, source_type, pdo.cob_id, pdo.frame_type
        ));
    }
    Ok(())
}

fn validate_battery_monitor_version_contract(document: &Value) -> Result<(), String> {
    let Some(root) = document.get("battery_monitor") else {
        return Ok(());
    };
    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        return Err("battery_monitor 仅支持 jc002 Battery V2".to_string());
    }
    let schema_version = root
        .get("schema_version")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    let binary_version = root
        .get("version")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    if schema_version != 2 || binary_version != 2 {
        return Err(format!(
            "jc002 battery_monitor 必须使用 schema_version=2 且 version=2，当前为 schema_version={schema_version}、version={binary_version}"
        ));
    }
    Ok(())
}

fn validate_fault_code_version_contract(document: &Value) -> Result<(), String> {
    let Some(root) = document.get("fault_code_info") else {
        return Ok(());
    };
    validate_fault_code_info_value(root, document.get("config_version").and_then(Value::as_str))
}

fn validate_fault_code_info_value(
    root: &Value,
    config_version: Option<&str>,
) -> Result<(), String> {
    if config_version != Some("jc002") {
        return Err("故障码管理仅支持 jc002 fault_code_profiles".to_string());
    }
    let schema_version = root
        .get("schema_version")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    if schema_version != 2
        || root.get("definitions").and_then(Value::as_array).is_none()
        || root.get("bindings").and_then(Value::as_array).is_none()
        || root.get("codes").is_some()
    {
        return Err(
            "jc002 fault_code_info 必须使用 schema_version=2 的 definitions[]/bindings[]"
                .to_string(),
        );
    }

    let sources = root
        .get("sources")
        .and_then(Value::as_array)
        .ok_or_else(|| "jc002 fault_code_info.sources 必须为数组".to_string())?;
    let definitions = root
        .get("definitions")
        .and_then(Value::as_array)
        .expect("validated definitions array");
    let bindings = root
        .get("bindings")
        .and_then(Value::as_array)
        .expect("validated bindings array");
    let mut source_keys = HashSet::new();
    for source in sources {
        let key = source
            .get("source_key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if key.is_empty() || !source_keys.insert(key.to_string()) {
            return Err("jc002 故障来源 source_key 必须唯一且不能为空".to_string());
        }
    }
    let mut definition_keys = HashSet::new();
    for definition in definitions {
        let fault_key = definition
            .get("fault_key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let message_key = definition
            .get("message_key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if fault_key.is_empty()
            || message_key.is_empty()
            || !definition_keys.insert(fault_key.to_string())
        {
            return Err("jc002 故障定义 fault_key 必须唯一，且 message_key 不能为空".to_string());
        }
    }
    let mut binding_keys = HashSet::new();
    for binding in bindings {
        let source_key = binding
            .get("source_key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let fault_key = binding
            .get("fault_key")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let code = binding.get("code").and_then(Value::as_i64).unwrap_or(-1);
        if !source_keys.contains(source_key)
            || !definition_keys.contains(fault_key)
            || !(0..=u8::MAX as i64).contains(&code)
            || !binding_keys.insert(format!("{source_key}:{code}"))
        {
            return Err(format!("jc002 故障绑定无效或重复：{source_key}:{code}"));
        }
    }
    Ok(())
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
    let mut export_info = serde_json::to_value(ProjectExportSettings::default())
        .expect("default export settings must serialize");
    if let Some(object) = export_info.as_object_mut() {
        object.remove("fault_code_info");
    }
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
        "export_info": export_info,
        "ui_info": [],
        "language_info": default_language_info(),
        "pdo_simple_send_recv": default_pdo_simple(),
        "pdo_global_param": [],
        "pdo_condition": [],
        "pdo_recv": [],
        "pdo_send": [],
        "sdo_info": default_sdo_info(),
        "signal_dictionary": SignalDictionary::default(),
        "private_protocol": PrivateProtocolDocument::default(),
        "protocol_mapping": [],
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
    pub canopen: Option<CanOpenProjectDocument>,
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

/// jc002 CANopen 拓扑描述。该段是项目的协议语义层，不替代现有 PDO 二进制表。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanOpenProjectDocument {
    #[serde(default)]
    pub schema_version: u8,
    #[serde(default)]
    pub nodes: Vec<CanOpenNodeDocument>,
    #[serde(default)]
    pub pdos: Vec<CanOpenPdoDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanOpenNodeDocument {
    pub node_id: u32,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub role: String,
    pub sdo: Option<CanOpenSdoChannelDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanOpenSdoChannelDocument {
    #[serde(default)]
    pub cob_id_mode: String,
    pub client_to_server_cob_id: u32,
    pub server_to_client_cob_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanOpenPdoDocument {
    pub key: String,
    pub direction: String,
    pub pdo_type: String,
    pub cob_id: u32,
    #[serde(default)]
    pub cob_id_mode: String,
    #[serde(default)]
    pub frame_type: u8,
    pub producer_node_id: Option<u32>,
    #[serde(default)]
    pub consumer_node_ids: Vec<u32>,
    pub pdo_number: Option<u32>,
    pub consumer_pdo_number: Option<u32>,
    pub transmission_type: Option<u8>,
    pub source_section: Option<String>,
    pub source_index: Option<usize>,
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

    fn assert_legacy_project_has_no_battery_monitor(document: &Value) {
        assert!(document.get("battery_monitor").is_none());
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
    fn new_legacy_project_does_not_create_a_battery_monitor_section() {
        let document = create_legacy_project_document("demo", 800, 480);

        assert_legacy_project_has_no_battery_monitor(&document);
    }

    #[test]
    fn legacy_migration_does_not_create_a_battery_monitor_section() {
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

        assert_legacy_project_has_no_battery_monitor(&migrated.document);
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

    fn v2_document_with_protocol_profiles() -> Value {
        let mut document = valid_v2_document();
        document["protocol_profiles"] = json!({
            "schema_version": 2,
            "active_controller_profile_id": "inmotion",
            "active_battery_profile_id": "battery_a",
            "active_fault_code_profile_id": "fault.default",
            "controller_profiles": [
                {
                    "profile_id": "acm",
                    "controller_family": "ACM",
                    "controller_revision": "1.x",
                    "protocol": {
                        "pdo_global_param": [{ "name": "acm.speed" }],
                        "pdo_condition": [],
                        "pdo_recv": [],
                        "pdo_send": [],
                        "sdo_info": { "type": 0, "children": [] }
                    }
                },
                {
                    "profile_id": "inmotion",
                    "controller_family": "Inmotion",
                    "controller_revision": "2.x",
                    "protocol": {
                        "pdo_global_param": [{ "name": "inmotion.speed" }],
                        "pdo_condition": [],
                        "pdo_recv": [],
                        "pdo_send": [],
                        "sdo_info": { "type": 0, "children": [] }
                    }
                }
            ],
            "battery_profiles": [
                {
                    "profile_id": "battery_a",
                    "battery_family": "BMS-A",
                    "battery_revision": "1.x",
                    "protocol": {
                        "battery_monitor": {
                            "schema_version": 2,
                            "enabled": true,
                            "version": 2,
                            "default_timeout_ticks": 200,
                            "page_size": 4,
                            "frames": [],
                            "signals": [],
                            "items": []
                        }
                    }
                }
            ],
            "fault_code_profiles": [
                {
                    "profile_id": "fault.default",
                    "fault_family": "generic",
                    "fault_revision": "2.x",
                    "protocol": {
                        "fault_code_info": {
                            "schema_version": 2,
                            "enabled": false,
                            "version": 2,
                            "sources": [],
                            "definitions": [],
                            "bindings": []
                        }
                    }
                }
            ]
        });
        document
    }

    #[test]
    fn protocol_profiles_validate_and_materialize_only_active_sections() {
        let document = v2_document_with_protocol_profiles();

        assert!(validate_protocol_profiles_contract(&document).is_ok());
        let materialized = materialize_active_protocol_profiles(&document).unwrap();

        assert!(materialized.get("protocol_profiles").is_none());
        assert_eq!(
            materialized["pdo_global_param"][0]["name"],
            "inmotion.speed"
        );
        assert_eq!(materialized["battery_monitor"]["version"], 2);
        assert_eq!(materialized["config_version"], "jc002");
    }

    #[test]
    fn protocol_profiles_merge_common_catalog_and_selected_overlays() {
        let mut document = v2_document_with_protocol_profiles();
        document["protocol_profiles"]["controller_profiles"][1]["localization_overlay"] = json!({
            "locales": {
                "zh": {
                    "translations": {
                        "menu.root": "Inmotion 菜单",
                        "controller.inmotion.only": "Inmotion 专属"
                    }
                },
                "en": {
                    "translations": {
                        "menu.root": "Inmotion menu",
                        "controller.inmotion.only": "Inmotion only"
                    }
                }
            }
        });
        document["protocol_profiles"]["battery_profiles"][0]["localization_overlay"] = json!({
            "locales": {
                "zh": {
                    "translations": {
                        "battery.a.only": "电池专属"
                    }
                }
            }
        });

        assert!(validate_protocol_profiles_contract(&document).is_ok());
        let materialized = materialize_protocol_profiles_for_selection(
            &document,
            "inmotion",
            Some("battery_a"),
            None,
        )
        .unwrap();
        assert_eq!(
            materialized["localization"]["locales"]["zh"]["translations"]["menu.root"],
            "Inmotion 菜单"
        );
        assert_eq!(
            materialized["localization"]["locales"]["zh"]["translations"]
                ["controller.inmotion.only"],
            "Inmotion 专属"
        );
        assert_eq!(
            materialized["localization"]["locales"]["zh"]["translations"]["battery.a.only"],
            "电池专属"
        );
        assert_eq!(
            document["localization"]["locales"]["zh"]["translations"]["menu.root"],
            "菜单"
        );
    }

    #[test]
    fn fault_code_profile_is_materialized_independently_from_controller_and_battery() {
        let mut document = v2_document_with_protocol_profiles();
        document["protocol_profiles"]["fault_code_profiles"]
            .as_array_mut()
            .unwrap()
            .push(json!({
            "profile_id": "fault.inmotion",
            "fault_family": "Inmotion",
            "fault_revision": "6.x",
            "localization_overlay": {
                "locales": {
                    "zh": { "translations": { "fault.inmotion.only": "Inmotion 故障" } }
                }
            },
            "protocol": {
                "fault_code_info": {
                    "schema_version": 2,
                    "enabled": true,
                    "version": 2,
                    "sources": [{
                        "source_key": "inmotion",
                        "source_id": 1,
                        "type_char": "I",
                        "can_id": 648
                    }],
                    "definitions": [{
                        "fault_key": "inmotion.overheat",
                        "message_key": "fault.inmotion.only",
                        "severity": "critical"
                    }],
                    "bindings": [{
                        "source_key": "inmotion",
                        "code": 7,
                        "fault_key": "inmotion.overheat"
                    }]
                }
            }
            }));

        assert!(validate_protocol_profiles_contract(&document).is_ok());
        let materialized = materialize_protocol_profiles_for_selection(
            &document,
            "inmotion",
            Some("battery_a"),
            Some("fault.inmotion"),
        )
        .unwrap();
        assert_eq!(materialized["fault_code_info"]["version"], 2);
        assert_eq!(
            materialized["fault_code_info"]["definitions"][0]["message_key"],
            "fault.inmotion.only"
        );
        assert_eq!(
            materialized["localization"]["locales"]["zh"]["translations"]["fault.inmotion.only"],
            "Inmotion 故障"
        );
        assert_eq!(
            materialized["pdo_global_param"][0]["name"],
            "inmotion.speed"
        );
        assert_eq!(materialized["battery_monitor"]["version"], 2);
    }

    #[test]
    fn protocol_profiles_reject_conflicting_controller_and_battery_overlays() {
        let mut document = v2_document_with_protocol_profiles();
        document["protocol_profiles"]["controller_profiles"][1]["localization_overlay"] = json!({
            "locales": {
                "zh": { "translations": { "shared.key": "controller" } }
            }
        });
        document["protocol_profiles"]["battery_profiles"][0]["localization_overlay"] = json!({
            "locales": {
                "zh": { "translations": { "shared.key": "battery" } }
            }
        });

        let error = validate_protocol_profiles_contract(&document).unwrap_err();
        assert!(error.contains("Profile overlay 文案冲突"));
    }

    #[test]
    fn protocol_profiles_reject_duplicate_ids_and_unknown_active_profile() {
        let mut duplicate = v2_document_with_protocol_profiles();
        duplicate["protocol_profiles"]["controller_profiles"][1]["profile_id"] = json!("acm");
        assert!(validate_protocol_profiles_contract(&duplicate)
            .unwrap_err()
            .contains("profile_id 重复"));

        let mut unknown_active = v2_document_with_protocol_profiles();
        unknown_active["protocol_profiles"]["active_controller_profile_id"] = json!("missing");
        assert!(validate_protocol_profiles_contract(&unknown_active)
            .unwrap_err()
            .contains("active_controller_profile_id 不存在"));
    }
}
