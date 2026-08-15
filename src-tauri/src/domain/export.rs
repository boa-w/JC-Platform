//! 项目导出引擎。
//!
//! 将项目配置导出为嵌入式设备可直接消费的格式：
//! - **图片资源**：从项目路径拷贝到导出目录的 `img/` 下
//! - **二进制数据**（`pdo_sdo_data.bin`）：将 PDO / SDO / 语言数据打包为小端序二进制
//! - **清单文件**（`ConfigUpdate.json`）：描述导出内容的元数据
//!
//! # 二进制布局（低地址 → 高地址）
//!
//! ```text
//! [全局参数表] [全局参数索引表] [条件表达式表]
//! [PDO 接收帧描述+数据] [PDO 发送帧描述+数据]
//! [电池监控段] [故障码段] [SDO 菜单树] [语言包 × N] [CRC16]
//! ```

use crate::domain::localization::{build_dynamic_language_pack, DynamicLanguagePackBuild};
use crate::domain::pdo::{
    parse_pdo_advanced_document, PdoAdvancedDocument, PdoAdvancedFrame, PdoAdvancedSignal,
    PdoGlobalParam,
};
use crate::domain::project::ProjectExportSettings;
use crate::domain::protocol::battery_monitor::{
    BatteryByteOrder, BatteryMonitorProtocol, BatteryRawType, BatteryValueType,
    BATTERY_MONITOR_BINARY_VERSION, BATTERY_MONITOR_SCHEMA_VERSION,
};
use crate::domain::ui_resource::{parse_ui_info, ResourceOption, UiResource, UiResourceHandle};
use crate::infrastructure::file_system::{copy_file, ensure_dir};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::{fs, path::PathBuf};

/// 导出包摘要。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPackage {
    pub output_dir: String,
    pub image_count: usize,
    pub binary_files: Vec<String>,
    pub warnings: Vec<String>,
}

/// 导出计划请求 —— 指定项目文档和输出目录。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPlanRequest {
    pub project_path: Option<String>,
    #[serde(default)]
    pub output_dir: String,
    pub document: Value,
    #[serde(default)]
    pub folder_name: Option<String>,
    #[serde(default)]
    pub manifest_filename: Option<String>,
    #[serde(default)]
    pub binary_filename: Option<String>,
}

/// 导出计划报告 —— 描述将要创建的目录、文件和资源清单。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPlanReport {
    pub valid: bool,
    pub export_root: String,
    pub directories: Vec<String>,
    pub manifest_path: String,
    pub binary_path: String,
    pub screen_src: ScreenSourcePlan,
    pub data_description: DataDescriptionPlan,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// 项目导出执行报告 —— 包含实际拷贝的文件和构建的二进制信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectExportReport {
    pub valid: bool,
    pub export_root: String,
    pub manifest_path: String,
    pub binary_path: String,
    pub copied_images: Vec<UiImageCopyItem>,
    pub binary: BinaryBuildReport,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiImageCopyReport {
    pub valid: bool,
    pub export_root: String,
    pub copied_files: Vec<UiImageCopyItem>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiImageCopyItem {
    pub source: String,
    pub destination: String,
}

/// 二进制构建报告 —— 包含生成的字节流、CRC、数据描述和错误信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryBuildReport {
    pub valid: bool,
    pub file_size: usize,
    pub crc: u16,
    pub data_description: DataDescriptionPlan,
    pub bytes: Vec<u8>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

/// 二进制比较请求 —— 将新生成的二进制与旧版文件逐字节对比。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryCompareRequest {
    pub document: Value,
    pub legacy_binary_path: String,
}

/// 二进制比较报告 —— 标记是否一致及首个差异位置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryCompareReport {
    pub valid: bool,
    pub same: bool,
    pub generated_size: usize,
    pub legacy_size: usize,
    pub first_diff_offset: Option<usize>,
    pub generated_byte: Option<u8>,
    pub legacy_byte: Option<u8>,
    pub build: BinaryBuildReport,
    pub errors: Vec<String>,
}

/// 屏幕图片资源导出计划（兼容旧版 ConfigUpdate.json 的 screen_src 结构）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenSourcePlan {
    pub update: bool,
    pub num: usize,
    pub pages: Vec<ScreenPagePlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenPagePlan {
    pub key: String,
    pub name: String,
    pub num: usize,
    pub items: Vec<ScreenItemPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenItemPlan {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub dest: String,
    pub src: String,
    pub format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub p_num: Option<usize>,
}

#[derive(Debug, Clone)]
struct ExportScreenEntry {
    item: ScreenItemPlan,
    source_files: Vec<(String, String)>,
}

/// 数据描述 —— 记录二进制文件中各段的偏移地址和大小。
///
/// 嵌入式设备通过此描述定位各数据段在二进制文件中的位置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataDescriptionPlan {
    pub update: bool,
    pub format: String,
    pub src: String,
    pub dest: String,
    pub file_size: usize,
    pub crc: u16,
    pub global_param_base_addr: isize,
    pub global_param_total: usize,
    pub global_param_index_base_addr: isize,
    pub global_param_index_total: usize,
    pub global_condition_base_addr: isize,
    pub global_condition_total: usize,
    pub pdo_recv_base_addr: isize,
    pub pdo_recv_total: usize,
    pub pdo_send_base_addr: isize,
    pub pdo_send_total: usize,
    pub battery_monitor_base_addr: isize,
    pub battery_monitor_item_total: usize,
    pub battery_monitor_frame_total: usize,
    pub battery_monitor_version: usize,
    pub fault_code_base_addr: isize,
    pub fault_code_version: usize,
    pub fault_source_total: usize,
    pub fault_code_total: usize,
    pub sdo_base_addr: isize,
    pub sdo_version: usize,
    pub language_addr: Vec<isize>,
    pub language_code: Vec<String>,
    pub i18n_base_addr: isize,
    pub i18n_size: usize,
    pub i18n_version: usize,
    pub i18n_locale_total: usize,
    pub i18n_message_total: usize,
}

impl DataDescriptionPlan {
    fn empty(language_code: Vec<String>) -> Self {
        Self {
            update: true,
            format: "bin".to_string(),
            src: "bin/pdo_sdo_data".to_string(),
            dest: "bin/data".to_string(),
            file_size: 0,
            crc: 0,
            global_param_base_addr: -1,
            global_param_total: 0,
            global_param_index_base_addr: -1,
            global_param_index_total: 0,
            global_condition_base_addr: -1,
            global_condition_total: 0,
            pdo_recv_base_addr: -1,
            pdo_recv_total: 0,
            pdo_send_base_addr: -1,
            pdo_send_total: 0,
            battery_monitor_base_addr: -1,
            battery_monitor_item_total: 0,
            battery_monitor_frame_total: 0,
            battery_monitor_version: 0,
            fault_code_base_addr: -1,
            fault_code_version: 0,
            fault_source_total: 0,
            fault_code_total: 0,
            sdo_base_addr: -1,
            sdo_version: 0,
            language_addr: Vec::new(),
            language_code,
            i18n_base_addr: -1,
            i18n_size: 0,
            i18n_version: 0,
            i18n_locale_total: 0,
            i18n_message_total: 0,
        }
    }

    fn without_battery_monitor(mut self) -> Self {
        self.battery_monitor_base_addr = -1;
        self.battery_monitor_item_total = 0;
        self.battery_monitor_frame_total = 0;
        self.battery_monitor_version = 0;
        self
    }

    fn without_fault_code(mut self) -> Self {
        self.fault_code_base_addr = -1;
        self.fault_code_version = 0;
        self.fault_source_total = 0;
        self.fault_code_total = 0;
        self
    }
}

/// 构建导出计划（不执行实际文件操作）。
///
/// 分析 UI 资源和二进制数据，生成目录结构、文件路径和资源清单。
pub fn build_export_plan(request: ExportPlanRequest) -> ExportPlanReport {
    let export_root = export_root(&request);
    let manifest_filename = export_file_name(
        export_setting(
            &request,
            request.manifest_filename.as_deref(),
            "manifest_filename",
        ),
        "ConfigUpdate.json",
        "json",
    );
    let binary_filename = export_file_name(
        export_setting(
            &request,
            request.binary_filename.as_deref(),
            "binary_filename",
        ),
        "pdo_sdo_data.bin",
        "bin",
    );
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let ui_report = parse_ui_info(request.project_path.as_deref(), &request.document);
    errors.extend(ui_report.errors);
    let export_settings = project_export_settings(&request.document);
    let binary_report = build_project_binary(&request.document);
    warnings.extend(binary_report.warnings.clone());
    errors.extend(binary_report.errors.clone());

    let mut pages = Vec::new();
    let mut page_logo_items = Vec::new();
    if let Some(logo) = ui_report.logo.as_ref() {
        page_logo_items.extend(export_items_for_resource(logo, &mut warnings, &mut errors));
    }
    pages.push(ScreenPagePlan {
        key: "page_01".to_string(),
        name: "page_logo".to_string(),
        num: page_logo_items.len(),
        items: page_logo_items,
    });

    let page_main_items = ui_report
        .main_items
        .iter()
        .flat_map(|item| export_items_for_resource(item, &mut warnings, &mut errors))
        .collect::<Vec<_>>();
    pages.push(ScreenPagePlan {
        key: "page_02".to_string(),
        name: "page_main".to_string(),
        num: page_main_items.len(),
        items: page_main_items,
    });

    let language_code = request
        .document
        .get("language_info")
        .and_then(|value| value.get("list_code_language"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let data_description = if binary_report.valid {
        manifest_data_description(&binary_report.data_description, &export_settings)
    } else {
        DataDescriptionPlan::empty(language_code)
    };

    ExportPlanReport {
        valid: errors.is_empty(),
        export_root: export_root.clone(),
        directories: vec![
            join_fs_path(&export_root, "img"),
            join_fs_path(&export_root, "img/anim"),
            join_fs_path(&export_root, "bin"),
        ],
        manifest_path: join_fs_path(&export_root, &manifest_filename),
        binary_path: join_fs_path(&join_fs_path(&export_root, "bin"), &binary_filename),
        screen_src: ScreenSourcePlan {
            update: true,
            num: pages.len(),
            pages,
        },
        data_description,
        errors,
        warnings,
    }
}

/// 执行完整导出：创建目录 → 拷贝图片 → 写入二进制 → 生成清单。
pub fn export_project_package(request: ExportPlanRequest) -> ProjectExportReport {
    let plan = build_export_plan(request.clone());
    let export_settings = project_export_settings(&request.document);
    let binary = build_project_binary(&request.document);
    let mut errors = plan.errors.clone();
    let mut warnings = plan.warnings.clone();
    errors.extend(binary.errors.clone());
    warnings.extend(binary.warnings.clone());
    let mut image_report = UiImageCopyReport {
        valid: false,
        export_root: plan.export_root.clone(),
        copied_files: Vec::new(),
        errors: Vec::new(),
        warnings: Vec::new(),
    };

    if errors.is_empty() {
        if let Err(error) = prepare_export_directories(&plan.export_root) {
            errors.push(error);
        }
    }

    if errors.is_empty() {
        image_report = copy_ui_images_without_clean(request.clone());
        errors.extend(image_report.errors.clone());
        warnings.extend(image_report.warnings.clone());
    }

    if errors.is_empty() {
        if let Some(parent) = std::path::Path::new(&plan.binary_path).parent() {
            if let Err(error) = ensure_dir(parent) {
                errors.push(format!(
                    "创建二进制目录失败 {}：{}",
                    parent.display(),
                    error
                ));
            }
        }
        if errors.is_empty() {
            if let Err(error) = fs::write(&plan.binary_path, &binary.bytes) {
                errors.push(format!(
                    "写入导出二进制失败 {}：{}",
                    plan.binary_path, error
                ));
            }
        }
    }

    if errors.is_empty() {
        let manifest = build_config_update_manifest(
            &request,
            &manifest_data_description(&binary.data_description, &export_settings),
            &export_settings,
            &mut warnings,
            &mut errors,
        );
        if let Some(parent) = std::path::Path::new(&plan.manifest_path).parent() {
            if let Err(error) = ensure_dir(parent) {
                errors.push(format!(
                    "创建导出清单目录失败 {}：{}",
                    parent.display(),
                    error
                ));
            }
        }
        if errors.is_empty() {
            match serde_json::to_string_pretty(&manifest) {
                Ok(content) => {
                    if let Err(error) = fs::write(&plan.manifest_path, content) {
                        errors.push(format!(
                            "写入 ConfigUpdate.json 失败 {}：{}",
                            plan.manifest_path, error
                        ));
                    }
                }
                Err(error) => errors.push(format!("序列化 ConfigUpdate.json 失败：{}", error)),
            }
        }
    }

    ProjectExportReport {
        valid: errors.is_empty(),
        export_root: plan.export_root,
        manifest_path: plan.manifest_path,
        binary_path: plan.binary_path,
        copied_images: image_report.copied_files,
        binary,
        errors,
        warnings,
    }
}

pub fn copy_ui_images(request: ExportPlanRequest) -> UiImageCopyReport {
    let export_root = export_root(&request);
    let mut errors = Vec::new();
    if let Err(error) = prepare_image_directories(&export_root) {
        errors.push(error);
        return UiImageCopyReport {
            valid: false,
            export_root,
            copied_files: Vec::new(),
            errors,
            warnings: Vec::new(),
        };
    }
    copy_ui_images_without_clean(request)
}

fn copy_ui_images_without_clean(request: ExportPlanRequest) -> UiImageCopyReport {
    let export_root = export_root(&request);
    let directories = vec![
        join_fs_path(&export_root, "img"),
        join_fs_path(&export_root, "img/anim"),
    ];
    let ui_report = parse_ui_info(request.project_path.as_deref(), &request.document);
    let mut errors = ui_report.errors;
    let mut warnings = Vec::new();
    let mut copied_files = Vec::new();

    for directory in &directories {
        if let Err(error) = ensure_dir(directory) {
            errors.push(format!("创建导出目录失败 {}：{}", directory, error));
        }
    }
    if !errors.is_empty() {
        return UiImageCopyReport {
            valid: false,
            export_root,
            copied_files,
            errors,
            warnings,
        };
    }

    for resource in ui_report.logo.iter().chain(ui_report.main_items.iter()) {
        copy_resource_images(
            resource,
            &export_root,
            &mut copied_files,
            &mut warnings,
            &mut errors,
        );
    }

    UiImageCopyReport {
        valid: errors.is_empty(),
        export_root,
        copied_files,
        errors,
        warnings,
    }
}

/// 将新生成的二进制与旧版文件逐字节比较，报告首个差异位置。
pub fn compare_project_binary(request: BinaryCompareRequest) -> BinaryCompareReport {
    let build = build_project_binary(&request.document);
    let mut errors = build.errors.clone();
    let legacy_bytes = match fs::read(&request.legacy_binary_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            errors.push(format!(
                "读取旧版二进制失败 {}：{}",
                request.legacy_binary_path, error
            ));
            return BinaryCompareReport {
                valid: false,
                same: false,
                generated_size: build.bytes.len(),
                legacy_size: 0,
                first_diff_offset: None,
                generated_byte: None,
                legacy_byte: None,
                build,
                errors,
            };
        }
    };
    let first_diff_offset = first_diff_offset(&build.bytes, &legacy_bytes);
    let same = first_diff_offset.is_none() && build.bytes.len() == legacy_bytes.len();

    BinaryCompareReport {
        valid: errors.is_empty(),
        same,
        generated_size: build.bytes.len(),
        legacy_size: legacy_bytes.len(),
        first_diff_offset,
        generated_byte: first_diff_offset.and_then(|offset| build.bytes.get(offset).copied()),
        legacy_byte: first_diff_offset.and_then(|offset| legacy_bytes.get(offset).copied()),
        build,
        errors,
    }
}

/// 从项目 JSON 构建二进制数据。
///
/// PDO 与锂电监控分别构建，锂电帧不再投影到普通 PDO 表。
pub fn build_project_binary(document: &Value) -> BinaryBuildReport {
    let export_settings = project_export_settings(document);
    build_project_binary_from_settings(document, &export_settings)
}

fn build_project_binary_from_settings(
    document: &Value,
    export_settings: &ProjectExportSettings,
) -> BinaryBuildReport {
    let config_version = document
        .get("config_version")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !matches!(config_version, "jc001" | "jc002") {
        return BinaryBuildReport {
            valid: false,
            file_size: 0,
            crc: 0,
            data_description: DataDescriptionPlan::empty(Vec::new()),
            bytes: Vec::new(),
            warnings: Vec::new(),
            errors: vec![format!(
                "导出器只接受明确的 jc001 或 jc002，当前 config_version={config_version:?}"
            )],
        };
    }
    let schema_error = match config_version {
        "jc001" if document.get("language_info").is_none() => {
            Some("jc001 项目必须包含 language_info")
        }
        "jc001" if document.get("localization").is_some() => {
            Some("jc001 项目禁止包含 jc002 localization")
        }
        "jc002" if document.get("localization").is_none() => {
            Some("jc002 项目必须包含 localization")
        }
        "jc002" if document.get("language_info").is_some() => {
            Some("jc002 项目禁止包含 jc001 language_info")
        }
        _ => None,
    };
    if let Some(error) = schema_error {
        return BinaryBuildReport {
            valid: false,
            file_size: 0,
            crc: 0,
            data_description: DataDescriptionPlan::empty(Vec::new()),
            bytes: Vec::new(),
            warnings: Vec::new(),
            errors: vec![error.to_string()],
        };
    }
    let language_code = if config_version == "jc001" {
        document
            .get("language_info")
            .and_then(|value| value.get("list_code_language"))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut errors = Vec::new();
    let battery_enabled = export_settings.battery_monitor.bin && battery_monitor_enabled(document);
    let pdo_report = parse_pdo_advanced_document(document);
    if !battery_enabled {
        errors.extend(pdo_report.errors.clone());
    }

    if let Some(pdo_document) = pdo_report.document.as_ref() {
        if battery_enabled || pdo_document_has_content(pdo_document) {
            let pdo_document = pdo_document.clone();
            let mut report = build_binary_from_pdo(
                document,
                &pdo_document,
                language_code,
                export_settings,
                config_version,
            );
            report.errors.extend(errors);
            report.valid = report.errors.is_empty();
            return report;
        }
    }

    if let Some(pdo_document) = build_pdo_document_from_simple(document) {
        let mut report = build_binary_from_pdo(
            document,
            &pdo_document,
            language_code,
            export_settings,
            config_version,
        );
        report.errors.extend(errors);
        report.valid = report.errors.is_empty();
        return report;
    }

    BinaryBuildReport {
        valid: false,
        file_size: 0,
        crc: 0,
        data_description: DataDescriptionPlan::empty(language_code),
        bytes: Vec::new(),
        warnings: Vec::new(),
        errors,
    }
}

fn manifest_data_description(
    data_description: &DataDescriptionPlan,
    export_settings: &ProjectExportSettings,
) -> DataDescriptionPlan {
    let mut description = data_description.clone();
    if !export_settings.battery_monitor.config || !export_settings.battery_monitor.bin {
        description = description.without_battery_monitor();
    }
    if !export_settings.fault_code_info.config || !export_settings.fault_code_info.bin {
        description = description.without_fault_code();
    }
    description
}

fn build_config_update_manifest(
    request: &ExportPlanRequest,
    data_description: &DataDescriptionPlan,
    export_settings: &ProjectExportSettings,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Value {
    let mut manifest = Map::new();
    manifest.insert(
        "config_version".to_string(),
        request
            .document
            .get("config_version")
            .cloned()
            .unwrap_or(Value::Null),
    );
    if let Some(device) = request.document.get("device") {
        manifest.insert("device".to_string(), device.clone());
    } else {
        errors.push("导出项目失败：缺少 device".to_string());
    }
    manifest.insert(
        "screen_src".to_string(),
        build_legacy_screen_src(request, warnings, errors),
    );
    let mut manifest_data_description = json!(data_description);
    omit_disabled_export_descriptions(&mut manifest_data_description, export_settings);
    if let Some(description) = manifest_data_description.as_object_mut() {
        match request
            .document
            .get("config_version")
            .and_then(Value::as_str)
        {
            Some("jc001") => {
                for key in [
                    "i18n_base_addr",
                    "i18n_size",
                    "i18n_version",
                    "i18n_locale_total",
                    "i18n_message_total",
                    "sdo_version",
                ] {
                    description.remove(key);
                }
            }
            Some("jc002") => {
                description.remove("language_addr");
                description.remove("language_code");
            }
            _ => errors.push("清单导出要求 config_version 为 jc001 或 jc002".to_string()),
        }
    }
    manifest.insert("data_description".to_string(), manifest_data_description);
    // jc002 keeps the editable battery protocol in the .jcpro project, but
    // ships its runtime representation exclusively in the binary section.
    // The manifest only exposes the address/count/version index above so the
    // device cannot accidentally parse a second, stale copy from JSON.
    if request
        .document
        .get("config_version")
        .and_then(Value::as_str)
        != Some("jc002")
        && export_settings.battery_monitor.config
    {
        if let Some(battery_monitor) = request.document.get("battery_monitor") {
            manifest.insert("battery_monitor".to_string(), battery_monitor.clone());
        }
    }
    Value::Object(manifest)
}

fn omit_disabled_export_descriptions(
    data_description: &mut Value,
    export_settings: &ProjectExportSettings,
) {
    let Some(object) = data_description.as_object_mut() else {
        return;
    };
    if !export_settings.battery_monitor.config {
        for key in [
            "battery_monitor_base_addr",
            "battery_monitor_item_total",
            "battery_monitor_frame_total",
            "battery_monitor_version",
        ] {
            object.remove(key);
        }
    }
    if !export_settings.fault_code_info.config {
        for key in [
            "fault_code_base_addr",
            "fault_code_version",
            "fault_source_total",
            "fault_code_total",
        ] {
            object.remove(key);
        }
    }
}

fn build_legacy_screen_src(
    request: &ExportPlanRequest,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Value {
    let ui_report = parse_ui_info(request.project_path.as_deref(), &request.document);
    errors.extend(ui_report.errors);
    let mut root = Map::new();
    root.insert("update".to_string(), Value::Bool(true));
    root.insert("num".to_string(), Value::from(2));
    root.insert(
        "page_01".to_string(),
        build_legacy_screen_page("page_logo", ui_report.logo.iter(), warnings, errors),
    );
    root.insert(
        "page_02".to_string(),
        build_legacy_screen_page("page_main", ui_report.main_items.iter(), warnings, errors),
    );
    Value::Object(root)
}

fn build_legacy_screen_page<'a, I>(
    name: &str,
    resources: I,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Value
where
    I: IntoIterator<Item = &'a UiResource>,
{
    let mut page = Map::new();
    page.insert("name".to_string(), Value::String(name.to_string()));
    let mut index = 0usize;
    for resource in resources {
        if resource.dest.is_empty() {
            continue;
        }
        let entries = legacy_export_entries_for_resource(resource, warnings, errors);
        for entry in entries {
            page.insert(format!("img_{}", index), json!(entry.item));
            index += 1;
        }
    }
    page.insert("num".to_string(), Value::from(index));
    Value::Object(page)
}

fn prepare_export_directories(export_root: &str) -> Result<(), String> {
    ensure_dir(export_root)
        .map_err(|error| format!("创建导出根目录失败 {}：{}", export_root, error))?;
    prepare_image_directories(export_root)?;
    prepare_clean_directory(&join_fs_path(export_root, "bin"), "bin")
}

fn prepare_image_directories(export_root: &str) -> Result<(), String> {
    let image_dir = join_fs_path(export_root, "img");
    prepare_clean_directory(&image_dir, "img")?;
    ensure_dir(join_fs_path(&image_dir, "anim"))
        .map_err(|error| format!("创建导出目录失败 {}/anim：{}", image_dir, error))
}

fn prepare_clean_directory(path: &str, label: &str) -> Result<(), String> {
    let path_ref = std::path::Path::new(path);
    if path_ref.exists() {
        fs::remove_dir_all(path_ref)
            .map_err(|error| format!("清理旧导出 {} 目录失败 {}：{}", label, path, error))?;
    }
    ensure_dir(path_ref).map_err(|error| format!("创建导出 {} 目录失败 {}：{}", label, path, error))
}

fn pdo_document_has_content(document: &PdoAdvancedDocument) -> bool {
    !document.pdo_global_param.is_empty()
        || !document.pdo_condition.is_empty()
        || !document.pdo_recv.is_empty()
        || !document.pdo_send.is_empty()
}

fn battery_monitor_enabled(document: &Value) -> bool {
    document
        .get("battery_monitor")
        .and_then(|value| value.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn build_pdo_document_from_simple(document: &Value) -> Option<PdoAdvancedDocument> {
    let simple = document.get("pdo_simple_send_recv")?;
    let mut param_indexes = Vec::new();
    collect_simple_param_indexes(simple.get("pdo_recv"), &mut param_indexes);
    collect_simple_param_indexes(simple.get("pdo_send"), &mut param_indexes);
    let param_map = param_indexes
        .iter()
        .enumerate()
        .map(|(index, inner)| (*inner, generated_simple_param_id(*inner, index)))
        .collect::<HashMap<_, _>>();

    Some(PdoAdvancedDocument {
        pdo_global_param: param_indexes
            .iter()
            .enumerate()
            .map(|(index, inner)| {
                simple_global_param(*inner, generated_simple_param_id(*inner, index))
            })
            .collect(),
        pdo_condition: Vec::new(),
        pdo_recv: simple_frames_to_advanced(simple.get("pdo_recv"), &param_map),
        pdo_send: simple_frames_to_advanced(simple.get("pdo_send"), &param_map),
    })
}

fn collect_simple_param_indexes(frames: Option<&Value>, indexes: &mut Vec<i64>) {
    let Some(frames) = frames.and_then(Value::as_array) else {
        return;
    };
    for frame in frames {
        let Some(signals) = frame.get("data").and_then(Value::as_array) else {
            continue;
        };
        for signal in signals {
            let index = object_i64(signal, "pdo_param_index", -1);
            if index >= 0 && !indexes.contains(&index) {
                indexes.push(index);
            }
        }
    }
}

fn simple_global_param(inner: i64, param_id: String) -> PdoGlobalParam {
    PdoGlobalParam {
        param_id,
        name: system_inner_param_name(inner).to_string(),
        def: String::new(),
        reserved: 0,
        data_type: system_inner_param_data_type(inner),
        inner,
    }
}

fn simple_frames_to_advanced(
    frames: Option<&Value>,
    param_map: &HashMap<i64, String>,
) -> Vec<PdoAdvancedFrame> {
    let Some(frames) = frames.and_then(Value::as_array) else {
        return Vec::new();
    };
    frames
        .iter()
        .map(|frame| PdoAdvancedFrame {
            id: object_i64(frame, "id", 0) as u32,
            frame_type: object_i64(frame, "type", 0) as u8,
            desc: object_string(frame, "desc"),
            data: frame
                .get("data")
                .and_then(Value::as_array)
                .map(|signals| {
                    signals
                        .iter()
                        .map(|signal| {
                            let inner = object_i64(signal, "pdo_param_index", -1);
                            PdoAdvancedSignal {
                                pos: object_i64(signal, "pos", 0) as u32,
                                len: object_i64(signal, "len", 0) as u32,
                                show_type: object_i64(signal, "show_type", 0) as u8,
                                handle: 0,
                                handle_param: String::new(),
                                param_id: param_map.get(&inner).cloned().unwrap_or_default(),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect()
}

fn generated_simple_param_id(inner: i64, index: usize) -> String {
    format!("SIMPLE{:04X}{:04X}", inner.max(0), index)
}

fn system_inner_param_name(index: i64) -> &'static str {
    match index {
        -1 => "无效",
        0 => "速度",
        1 => "SOC",
        2 => "小时计",
        3 => "故障代码",
        4 => "手刹",
        5 => "座椅开关",
        6 => "车轮转向角度",
        7 => "工作模式",
        8 => "SPE设置值",
        9 => "锁车信号",
        10 => "安全带开关",
        11 => "左转向灯",
        12 => "右转向灯",
        13 => "提升锁止",
        14 => "档位",
        15 => "限速",
        16 => "远程管理",
        _ => "未知内部变量",
    }
}

fn system_inner_param_data_type(index: i64) -> i64 {
    match index {
        0 => 10,
        2 => 20,
        6 => 1,
        _ => 0,
    }
}

fn build_binary_from_pdo(
    source_document: &Value,
    document: &PdoAdvancedDocument,
    language_code: Vec<String>,
    export_settings: &ProjectExportSettings,
    config_version: &str,
) -> BinaryBuildReport {
    let mut bytes = Vec::new();
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    let language_count = language_code.len();
    let mut description = DataDescriptionPlan::empty(language_code.clone());
    description.language_code = language_code;

    if !document.pdo_global_param.is_empty() {
        description.global_param_base_addr = bytes.len() as isize;
        let global_data_offset = document.pdo_global_param.len() * 4;
        let mut global_data = Vec::new();
        for param in &document.pdo_global_param {
            write_global_variable_table(
                &mut bytes,
                global_data_offset + global_data.len(),
                param,
                &mut warnings,
            );
            write_default_value(&mut global_data, param, &mut warnings);
        }
        description.global_param_total = document.pdo_global_param.len();
        bytes.extend(global_data);
    }

    if document
        .pdo_global_param
        .iter()
        .any(|param| param.inner >= 0)
    {
        description.global_param_index_base_addr = bytes.len() as isize;
        for (index, param) in document.pdo_global_param.iter().enumerate() {
            if param.inner >= 0 {
                write_u16(&mut bytes, index as u16);
                write_u16(&mut bytes, param.inner as u16);
                description.global_param_index_total += 1;
            }
        }
    }

    let param_indexes = document
        .pdo_global_param
        .iter()
        .enumerate()
        .map(|(index, item)| (item.param_id.clone(), index as u16))
        .collect::<HashMap<_, _>>();
    let condition_param_ids = document
        .pdo_condition
        .iter()
        .flat_map(|condition| condition.data.iter().map(|input| input.param_id.clone()))
        .collect::<HashSet<_>>();
    let dynamic_pack = if config_version == "jc002" {
        match build_dynamic_language_pack(source_document) {
            Ok(pack) => Some(pack),
            Err(error) => {
                return BinaryBuildReport {
                    valid: false,
                    file_size: 0,
                    crc: 0,
                    data_description: description,
                    bytes: Vec::new(),
                    warnings,
                    errors: vec![error],
                };
            }
        }
    } else {
        None
    };
    let language_entries = if config_version == "jc001" {
        collect_language_entries(source_document, export_settings)
    } else {
        Vec::new()
    };
    let text_catalog = match dynamic_pack.as_ref() {
        Some(pack) => TextCatalog::Dynamic(pack),
        None => TextCatalog::Legacy(&language_entries),
    };

    if !document.pdo_condition.is_empty() {
        description.global_condition_base_addr = bytes.len() as isize;
        for condition in &document.pdo_condition {
            write_u8(&mut bytes, condition.data.len() as u8);
            write_u16(
                &mut bytes,
                param_indexes.get(&condition.param_id).copied().unwrap_or(0),
            );
            write_u8(&mut bytes, condition.process as u8);
            description.global_condition_total += 1;
            for input in &condition.data {
                write_u8(&mut bytes, 0);
                write_u16(
                    &mut bytes,
                    param_indexes.get(&input.param_id).copied().unwrap_or(0),
                );
                write_u8(&mut bytes, 0);
            }
        }
    }

    if !document.pdo_recv.is_empty() {
        description.pdo_recv_base_addr = bytes.len() as isize;
        write_pdo_frames(
            &mut bytes,
            &document.pdo_recv,
            &param_indexes,
            &condition_param_ids,
        );
        description.pdo_recv_total = document.pdo_recv.len();
    }

    if !document.pdo_send.is_empty() {
        description.pdo_send_base_addr = bytes.len() as isize;
        write_pdo_frames(
            &mut bytes,
            &document.pdo_send,
            &param_indexes,
            &condition_param_ids,
        );
        description.pdo_send_total = document.pdo_send.len();
    }

    let battery_bytes = if export_settings.battery_monitor.bin {
        build_battery_monitor_bytes(
            source_document,
            bytes.len(),
            text_catalog,
            &mut warnings,
            &mut errors,
        )
    } else {
        None
    };
    if let Some((battery_bytes, item_total, frame_total, version)) = battery_bytes {
        description.battery_monitor_base_addr = bytes.len() as isize;
        description.battery_monitor_item_total = item_total;
        description.battery_monitor_frame_total = frame_total;
        description.battery_monitor_version = version;
        bytes.extend(battery_bytes);
    }

    let fault_code_bytes = if export_settings.fault_code_info.bin {
        build_fault_code_bytes(
            source_document,
            bytes.len(),
            text_catalog,
            &mut warnings,
            &mut errors,
        )
    } else {
        None
    };
    if let Some((fault_code_bytes, source_total, code_total, version)) = fault_code_bytes {
        description.fault_code_base_addr = bytes.len() as isize;
        description.fault_source_total = source_total;
        description.fault_code_total = code_total;
        description.fault_code_version = version;
        bytes.extend(fault_code_bytes);
    }

    description.sdo_base_addr = bytes.len() as isize;
    let sdo_bytes = build_sdo_bytes(
        source_document.get("sdo_info"),
        bytes.len(),
        text_catalog,
        &mut warnings,
        &mut errors,
    );
    if sdo_bytes.is_empty() {
        description.sdo_base_addr = -1;
    } else {
        description.sdo_version = if config_version == "jc002" { 2 } else { 1 };
        bytes.extend(sdo_bytes);
    }

    match config_version {
        "jc001" => {
            description.language_addr = write_language_bytes(
                source_document,
                &language_entries,
                language_count,
                &mut bytes,
            );
        }
        "jc002" => match dynamic_pack {
            Some(pack) => {
                description.i18n_base_addr = bytes.len() as isize;
                description.i18n_size = pack.bytes.len();
                description.i18n_version = pack.summary.schema_version as usize;
                description.i18n_locale_total = pack.summary.locales.len();
                description.i18n_message_total = pack.summary.message_count;
                bytes.extend(pack.bytes);
            }
            None => errors.push("jc002 动态语言包未构建".to_string()),
        },
        _ => errors.push(format!("未知配置版本：{config_version}")),
    }
    description.file_size = bytes.len();
    description.crc = crc16_ccitt_false(&bytes);

    BinaryBuildReport {
        valid: errors.is_empty(),
        file_size: description.file_size,
        crc: description.crc,
        data_description: description,
        bytes,
        warnings,
        errors,
    }
}

#[derive(Clone)]
struct SdoBinaryNode {
    value: Value,
    parent: Option<usize>,
    bytes: Vec<u8>,
}

#[derive(Clone, Copy)]
enum TextCatalog<'a> {
    Legacy(&'a [String]),
    Dynamic(&'a DynamicLanguagePackBuild),
}

impl TextCatalog<'_> {
    fn is_dynamic(self) -> bool {
        matches!(self, Self::Dynamic(_))
    }

    fn index(self, key: &str, context: &str, errors: &mut Vec<String>) -> u32 {
        if key.trim().is_empty() {
            return if self.is_dynamic() {
                u32::MAX
            } else {
                u16::MAX.into()
            };
        }
        match self {
            Self::Legacy(entries) => {
                entries.iter().position(|item| item == key).unwrap_or(0) as u32
            }
            Self::Dynamic(pack) => match pack.require_message_index(key) {
                Ok(index) => index,
                Err(error) => {
                    errors.push(format!("{context}：{error}"));
                    u32::MAX
                }
            },
        }
    }
}

fn collect_language_entries(
    document: &Value,
    export_settings: &ProjectExportSettings,
) -> Vec<String> {
    let mut entries = Vec::new();
    if let Some(language_info) = document.get("language_info") {
        if let Some(items) = language_info.get("list_inner").and_then(Value::as_array) {
            for item in items.iter().filter_map(Value::as_str) {
                entries.push(item.to_string());
            }
        }
    }
    if let Some(sdo_info) = document.get("sdo_info") {
        collect_sdo_names(sdo_info, &mut entries);
    }
    if export_settings.fault_code_info.bin {
        collect_fault_code_language_entries(document, &mut entries);
    }
    entries.push(String::new());
    entries
}

fn collect_sdo_names(value: &Value, entries: &mut Vec<String>) {
    if let Some(name) = value.get("name").and_then(Value::as_str) {
        push_unique(entries, name);
    }
    if let Some(children) = value.get("children").and_then(Value::as_array) {
        for child in children {
            collect_sdo_names(child, entries);
        }
    }
}

fn collect_fault_code_language_entries(document: &Value, entries: &mut Vec<String>) {
    let Some(root) = document.get("fault_code_info") else {
        return;
    };
    if !root.get("enabled").and_then(Value::as_bool).unwrap_or(true) {
        return;
    }
    if document.get("config_version").and_then(Value::as_str) == Some("jc002") {
        if let Some(definitions) = root.get("definitions").and_then(Value::as_array) {
            for definition in definitions {
                if !definition
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
                {
                    continue;
                }
                let key = object_string(definition, "message_key");
                if !key.is_empty() {
                    push_unique(entries, &key);
                }
            }
        }
    } else if let Some(codes) = root.get("codes").and_then(Value::as_array) {
        for code in codes {
            if !code.get("enabled").and_then(Value::as_bool).unwrap_or(true) {
                continue;
            }
            let key = fault_code_language_key(code);
            if !key.is_empty() {
                push_unique(entries, &key);
            }
        }
    }
}

fn push_unique(entries: &mut Vec<String>, value: &str) {
    if !entries.iter().any(|item| item == value) {
        entries.push(value.to_string());
    }
}

fn build_battery_monitor_bytes(
    document: &Value,
    base_addr: usize,
    text_catalog: TextCatalog<'_>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Option<(Vec<u8>, usize, usize, usize)> {
    let root = document.get("battery_monitor")?;
    if !text_catalog.is_dynamic() {
        errors.push("锂电监控仅支持 jc002 Battery V2".to_string());
        return None;
    }
    let protocol: BatteryMonitorProtocol = match serde_json::from_value(root.clone()) {
        Ok(protocol) => protocol,
        Err(error) => {
            errors.push(format!("battery_monitor 配置无法解析：{error}"));
            return None;
        }
    };
    if protocol.schema_version != BATTERY_MONITOR_SCHEMA_VERSION
        || protocol.version != BATTERY_MONITOR_BINARY_VERSION
    {
        errors.push(format!(
            "battery_monitor 必须使用 schema_version={} 且 version={}，当前为 schema_version={}、version={}",
            BATTERY_MONITOR_SCHEMA_VERSION,
            BATTERY_MONITOR_BINARY_VERSION,
            protocol.schema_version, protocol.version
        ));
        return None;
    }
    if !protocol.enabled {
        return None;
    }
    let frames = protocol.frames;
    let signals = protocol.signals;
    let mut items = protocol.items;
    if frames.is_empty() || signals.is_empty() || items.is_empty() {
        warnings.push("锂电监控已启用但帧、信号或显示项为空，跳过 battery monitor 段".to_string());
        return None;
    }
    items.sort_by_key(|item| item.order);
    items.retain(|item| item.enabled);
    if items.is_empty() {
        warnings.push("锂电监控没有启用的显示项，跳过 battery monitor 段".to_string());
        return None;
    }

    let signal_map = signals
        .iter()
        .enumerate()
        .map(|(index, signal)| (signal.signal_key.as_str(), index))
        .collect::<HashMap<_, _>>();
    let frame_map = frames
        .iter()
        .enumerate()
        .map(|(index, frame)| (frame.frame_key.as_str(), index as u16))
        .collect::<HashMap<_, _>>();

    let version = protocol.version as usize;
    let header_len = 40usize;
    let frame_record_len = 12usize;
    let signal_record_len = 32usize;
    let item_record_len = if text_catalog.is_dynamic() {
        52usize
    } else {
        40usize
    };
    let frame_table_addr = base_addr + header_len;
    let signal_table_addr = frame_table_addr + frames.len() * frame_record_len;
    let item_table_addr = signal_table_addr + signals.len() * signal_record_len;
    let mut bytes = Vec::new();

    write_u16(&mut bytes, protocol.version);
    write_u16(&mut bytes, if text_catalog.is_dynamic() { 2 } else { 1 });
    write_u16(&mut bytes, protocol.page_size.max(1));
    write_u16(&mut bytes, items.len() as u16);
    write_u16(&mut bytes, frames.len() as u16);
    write_u16(&mut bytes, signals.len() as u16);
    write_u16(&mut bytes, protocol.default_timeout_ticks);
    write_u16(&mut bytes, frame_record_len as u16);
    write_u16(&mut bytes, signal_record_len as u16);
    write_u16(&mut bytes, item_record_len as u16);
    write_u32(&mut bytes, frame_table_addr as u32);
    write_u32(&mut bytes, signal_table_addr as u32);
    write_u32(&mut bytes, item_table_addr as u32);
    write_u32(&mut bytes, 0);
    write_u32(&mut bytes, 0);

    for frame in &frames {
        let frame_signals = signals
            .iter()
            .enumerate()
            .filter(|(_, signal)| signal.frame_key == frame.frame_key)
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        write_u32(&mut bytes, frame.can_id);
        write_u8(&mut bytes, frame.frame_type);
        write_u8(&mut bytes, frame.dlc);
        write_u16(&mut bytes, frame.timeout_ticks);
        write_u16(
            &mut bytes,
            frame_signals
                .first()
                .copied()
                .map(|index| index as u16)
                .unwrap_or(u16::MAX),
        );
        write_u16(&mut bytes, frame_signals.len() as u16);
    }

    for signal in &signals {
        let frame_index = frame_map
            .get(signal.frame_key.as_str())
            .copied()
            .unwrap_or(u16::MAX);
        write_u16(&mut bytes, frame_index);
        write_u16(&mut bytes, signal.pos);
        write_u16(&mut bytes, signal.len);
        write_u8(&mut bytes, signal.raw_offset);
        write_u8(&mut bytes, battery_raw_type_code(&signal.raw_type));
        write_u8(&mut bytes, battery_value_type_code(&signal.value_type));
        write_u8(&mut bytes, battery_byte_order_code(&signal.byte_order));
        write_f32(&mut bytes, signal.parse_resolution as f32);
        write_f32(&mut bytes, signal.parse_offset as f32);
        write_u32(&mut bytes, signal.parse_mask);
        write_u8(&mut bytes, signal.parse_shift);
        write_u8(&mut bytes, 0);
        write_u16(&mut bytes, u16::MAX);
        write_u16(&mut bytes, signed_index(signal.inner));
        if text_catalog.is_dynamic() {
            write_u32(
                &mut bytes,
                text_catalog.index(&signal.name, "锂电信号名称", errors),
            );
        } else {
            write_u16(
                &mut bytes,
                text_catalog.index(&signal.name, "锂电信号名称", errors) as u16,
            );
            write_u16(&mut bytes, 0);
        }
    }

    for item in &items {
        let signal_index = signal_map
            .get(item.signal_key.as_str())
            .copied()
            .unwrap_or(usize::MAX);
        if signal_index == usize::MAX {
            warnings.push(format!(
                "锂电显示项 {} 引用了不存在的信号 {}",
                item.item_key, item.signal_key
            ));
        }
        let signal = signals.get(signal_index);
        let frame_key = if item.validity.frame_key.is_empty() {
            signal.map(|signal| signal.frame_key.as_str()).unwrap_or("")
        } else {
            item.validity.frame_key.as_str()
        };
        let frame_index = frame_map.get(frame_key).copied().unwrap_or(u16::MAX);

        write_u16(&mut bytes, signal_index.min(u16::MAX as usize) as u16);
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.name_key,
            "锂电显示项 name_key",
            errors,
        );
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.fallback_name,
            "锂电显示项 fallback_name",
            errors,
        );
        write_u16(&mut bytes, frame_index);
        write_u8(&mut bytes, 1);
        write_u8(&mut bytes, item.order.min(u8::MAX as u16) as u8);
        write_u8(
            &mut bytes,
            signal
                .map(|signal| battery_value_type_code(&signal.value_type))
                .unwrap_or(0xff),
        );
        write_u8(&mut bytes, battery_formatter_kind(&item.formatter.kind));
        write_f32(&mut bytes, item.formatter.offset as f32);
        write_f32(&mut bytes, item.formatter.scale_num as f32);
        write_f32(
            &mut bytes,
            if item.formatter.scale_den == 0 {
                1.0
            } else {
                item.formatter.scale_den as f32
            },
        );
        write_u8(&mut bytes, item.formatter.decimals);
        write_u8(&mut bytes, item.formatter.display_base);
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.unit,
            "锂电显示项 unit",
            errors,
        );
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.formatter.true_text,
            "锂电显示项 true_text",
            errors,
        );
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.formatter.false_text,
            "锂电显示项 false_text",
            errors,
        );
        write_text_reference(
            &mut bytes,
            text_catalog,
            &item.validity.empty_text,
            "锂电显示项 empty_text",
            errors,
        );
        write_u16(
            &mut bytes,
            item.validity
                .timeout_ticks
                .or_else(|| {
                    frame_map
                        .get(frame_key)
                        .and_then(|index| frames.get(usize::from(*index)))
                        .map(|frame| frame.timeout_ticks)
                })
                .unwrap_or(protocol.default_timeout_ticks),
        );
        write_u16(&mut bytes, 0);
        write_u16(&mut bytes, 0);
    }

    Some((bytes, items.len(), frames.len(), version))
}

fn write_text_reference(
    bytes: &mut Vec<u8>,
    catalog: TextCatalog<'_>,
    key: &str,
    context: &str,
    errors: &mut Vec<String>,
) {
    let index = catalog.index(key, context, errors);
    if catalog.is_dynamic() {
        write_u32(bytes, index);
    } else {
        write_u16(bytes, index as u16);
    }
}

fn battery_raw_type_code(raw_type: &BatteryRawType) -> u8 {
    match raw_type {
        BatteryRawType::U8 => 0,
        BatteryRawType::U16Le => 1,
        BatteryRawType::U32Le => 2,
        BatteryRawType::DateTimeYmdhms => 3,
    }
}

fn battery_value_type_code(value_type: &BatteryValueType) -> u8 {
    match value_type {
        BatteryValueType::U8 => 0,
        BatteryValueType::U16 => 1,
        BatteryValueType::U32 => 2,
        BatteryValueType::F32 => 3,
        BatteryValueType::DateTime => 4,
    }
}

fn battery_byte_order_code(byte_order: &BatteryByteOrder) -> u8 {
    match byte_order {
        BatteryByteOrder::LittleEndian => 0,
        BatteryByteOrder::BigEndian => 1,
    }
}

fn signed_index(value: i64) -> u16 {
    if value < 0 {
        u16::MAX
    } else {
        value.min(u16::MAX as i64) as u16
    }
}

fn fault_code_export_records(
    root: &Value,
    dynamic: bool,
    errors: &mut Vec<String>,
) -> Option<Vec<Value>> {
    let schema_version = object_i64(root, "schema_version", 1);
    if !dynamic {
        if schema_version != 1 {
            errors.push(format!(
                "jc001 fault_code_info 仅支持 schema_version=1，当前为 {schema_version}"
            ));
            return None;
        }
        return Some(
            root.get("codes")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
        );
    }
    if schema_version != 2 {
        errors.push(format!(
            "jc002 fault_code_info 必须使用 schema_version=2 的 definitions/bindings，当前为 {schema_version}"
        ));
        return None;
    }

    let definitions = root
        .get("definitions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut definition_by_key = HashMap::<String, Value>::new();
    for definition in definitions {
        let fault_key = object_string(&definition, "fault_key");
        let message_key = object_string(&definition, "message_key");
        if fault_key.is_empty() || message_key.is_empty() {
            errors.push("jc002 故障定义的 fault_key 和 message_key 不能为空".to_string());
            continue;
        }
        if definition_by_key
            .insert(fault_key.clone(), definition)
            .is_some()
        {
            errors.push(format!("jc002 故障定义 fault_key 重复：{fault_key}"));
        }
    }

    let bindings = root
        .get("bindings")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut records = Vec::new();
    let mut identities = HashSet::<String>::new();
    for binding in bindings {
        if !binding
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
        {
            continue;
        }
        let source_key = object_string(&binding, "source_key");
        let fault_key = object_string(&binding, "fault_key");
        let code = object_i64(&binding, "code", -1);
        let identity = format!("{source_key}:{code}");
        if source_key.is_empty() || !(0..=u8::MAX as i64).contains(&code) {
            errors.push(format!("jc002 故障绑定无效：{identity}"));
            continue;
        }
        if !identities.insert(identity.clone()) {
            errors.push(format!("jc002 故障绑定重复：{identity}"));
            continue;
        }
        let Some(definition) = definition_by_key.get(&fault_key) else {
            errors.push(format!(
                "jc002 故障绑定 {identity} 引用了不存在的定义 {fault_key}"
            ));
            continue;
        };
        if !definition
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
        {
            continue;
        }
        records.push(json!({
            "source_key": source_key,
            "code": code,
            "message_key": object_string(definition, "message_key"),
            "severity": object_string(definition, "severity"),
            "enabled": true
        }));
    }
    Some(records)
}

fn build_fault_code_bytes(
    document: &Value,
    base_addr: usize,
    text_catalog: TextCatalog<'_>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Option<(Vec<u8>, usize, usize, usize)> {
    let root = document.get("fault_code_info")?;
    if !root.get("enabled").and_then(Value::as_bool).unwrap_or(true) {
        return None;
    }

    let mut sources = root
        .get("sources")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    sources.retain(|item| item.get("enabled").and_then(Value::as_bool).unwrap_or(true));
    let source_by_key = sources
        .iter()
        .filter_map(|source| {
            let key = fault_source_key(source);
            if key.is_empty() {
                None
            } else {
                Some((key, source))
            }
        })
        .collect::<HashMap<_, _>>();
    let source_by_id = sources
        .iter()
        .filter_map(|source| {
            let source_id = object_i64(source, "source_id", 0);
            if source_id <= 0 {
                None
            } else {
                Some((source_id, source))
            }
        })
        .collect::<HashMap<_, _>>();
    let mut codes = fault_code_export_records(root, text_catalog.is_dynamic(), errors)?;
    codes.retain(|item| item.get("enabled").and_then(Value::as_bool).unwrap_or(true));
    codes.retain(|code| {
        let source_key = object_string(code, "source_key");
        if !source_key.is_empty() {
            if source_by_key.contains_key(&source_key) {
                return true;
            }
            warnings.push(format!(
                "故障码 {} 引用的来源 {} 不存在或已禁用，已跳过",
                object_i64(code, "code", 0),
                source_key
            ));
            return false;
        }
        let source_id = object_i64(code, "source_id", 0);
        if source_id > 0 && !source_by_id.contains_key(&source_id) {
            warnings.push(format!(
                "故障码 {} 引用的来源 ID {} 不存在或已禁用，已跳过",
                object_i64(code, "code", 0),
                source_id
            ));
            return false;
        }
        true
    });

    if sources.is_empty() || codes.is_empty() {
        warnings.push("故障码配置已启用但来源规则或故障码为空，跳过 fault_code 段".to_string());
        return None;
    }

    let version = object_i64(root, "version", 1).max(0) as usize;
    let header_len = 20usize;
    let source_record_len = 16usize;
    let code_record_len = if text_catalog.is_dynamic() {
        12usize
    } else {
        8usize
    };
    let source_table_addr = base_addr + header_len;
    let code_table_addr = source_table_addr + sources.len() * source_record_len;
    let invalid_table_addr = code_table_addr + codes.len() * code_record_len;
    let mut bytes = Vec::new();
    let mut source_bytes = Vec::new();
    let mut code_bytes = Vec::new();
    let mut invalid_bytes = Vec::new();

    write_u16(&mut bytes, version as u16);
    write_u16(&mut bytes, if text_catalog.is_dynamic() { 2 } else { 1 });
    write_u16(&mut bytes, sources.len() as u16);
    write_u16(&mut bytes, codes.len() as u16);
    write_u32(&mut bytes, source_table_addr as u32);
    write_u32(&mut bytes, code_table_addr as u32);
    write_u32(&mut bytes, 0);

    for source in &sources {
        let invalid_codes = source
            .get("invalid_codes")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_i64)
                    .map(|item| item.clamp(0, u8::MAX as i64) as u8)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let invalid_addr = if invalid_codes.is_empty() {
            0xffff_ffff
        } else {
            let addr = invalid_table_addr + invalid_bytes.len();
            invalid_bytes.extend(invalid_codes.iter().copied());
            addr as u32
        };

        write_u32(
            &mut source_bytes,
            object_i64(source, "can_id", 0).max(0) as u32,
        );
        write_u32(&mut source_bytes, invalid_addr);
        write_u8(
            &mut source_bytes,
            object_i64(source, "frame_type", object_i64(source, "type", 0)).max(0) as u8,
        );
        write_u8(
            &mut source_bytes,
            object_i64(source, "source_id", 0).clamp(0, u8::MAX as i64) as u8,
        );
        write_u8(&mut source_bytes, fault_type_char(source, 0));
        write_u8(
            &mut source_bytes,
            object_i64(source, "code_byte", object_i64(source, "code_offset", 2)).clamp(0, 7) as u8,
        );
        write_u8(
            &mut source_bytes,
            object_i64(source, "clear_code", 0).clamp(0, u8::MAX as i64) as u8,
        );
        write_u8(
            &mut source_bytes,
            invalid_codes.len().min(u8::MAX as usize) as u8,
        );
        write_u16(&mut source_bytes, 0);
    }

    for code in &codes {
        let language_key = fault_code_language_key(code);
        write_u8(
            &mut code_bytes,
            fault_code_type_char(code, &source_by_key, &source_by_id),
        );
        write_u8(
            &mut code_bytes,
            object_i64(code, "code", 0).clamp(0, u8::MAX as i64) as u8,
        );
        write_text_reference(
            &mut code_bytes,
            text_catalog,
            &language_key,
            "故障码 message_key",
            errors,
        );
        write_u8(
            &mut code_bytes,
            fault_severity(&object_string(code, "severity")),
        );
        write_u8(&mut code_bytes, 0);
        write_u16(&mut code_bytes, 0);
        if text_catalog.is_dynamic() {
            write_u16(&mut code_bytes, 0);
        }
    }

    bytes.extend(source_bytes);
    bytes.extend(code_bytes);
    bytes.extend(invalid_bytes);
    Some((
        bytes,
        sources.len(),
        codes.len(),
        if text_catalog.is_dynamic() {
            2
        } else {
            version
        },
    ))
}

fn fault_source_key(value: &Value) -> String {
    let key = object_string(value, "source_key");
    if !key.is_empty() {
        return key;
    }
    let source_id = object_i64(value, "source_id", 0);
    if source_id > 0 {
        return format!("source_{source_id}");
    }
    String::new()
}

fn fault_code_language_key(value: &Value) -> String {
    for key in ["message_key", "name_key", "name"] {
        let item = object_string(value, key);
        if !item.is_empty() {
            return item;
        }
    }
    String::new()
}

fn fault_code_type_char(
    value: &Value,
    source_by_key: &HashMap<String, &Value>,
    source_by_id: &HashMap<i64, &Value>,
) -> u8 {
    let text = object_string(value, "type_char");
    if let Some(byte) = text.as_bytes().first().copied() {
        return byte;
    }

    let source_key = object_string(value, "source_key");
    if !source_key.is_empty() {
        if let Some(source) = source_by_key.get(&source_key) {
            return fault_type_char(source, object_i64(source, "source_id", 0) as u8);
        }
    }

    let source_id = object_i64(value, "source_id", 0);
    if source_id > 0 {
        if let Some(source) = source_by_id.get(&source_id) {
            return fault_type_char(source, source_id as u8);
        }
    }

    fault_type_char(value, source_id as u8)
}

fn fault_type_char(value: &Value, source_id: u8) -> u8 {
    let text = object_string(value, "type_char");
    if let Some(byte) = text.as_bytes().first().copied() {
        return byte;
    }
    match source_id {
        1 => b'T',
        2 => b'P',
        3 => b'S',
        4 => b'Z',
        5 => b'L',
        6 => b'V',
        _ => 0,
    }
}

fn fault_severity(value: &str) -> u8 {
    match value.trim().to_ascii_lowercase().as_str() {
        "info" => 1,
        "warning" | "warn" => 2,
        "critical" | "fatal" => 4,
        _ => 3,
    }
}

fn battery_formatter_kind(kind: &str) -> u8 {
    match kind {
        "bool_text" => 1,
        "hex" => 2,
        "packed_time_0p1h" => 3,
        "linear_u8_wrap" => 4,
        "packed_time_legacy_discharge_0p1h" => 5,
        "datetime" => 6,
        _ => 0,
    }
}

fn build_sdo_bytes(
    value: Option<&Value>,
    base_addr: usize,
    text_catalog: TextCatalog<'_>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Vec<u8> {
    let Some(root) = value else {
        warnings.push("缺少 sdo_info，跳过 SDO 菜单段打包".to_string());
        return Vec::new();
    };
    let mut nodes = Vec::new();
    flatten_sdo_children(root, None, &mut nodes, text_catalog, warnings, errors);
    let mut result_nodes = Vec::new();
    let mut root_bytes = menu_item_bytes(root, text_catalog, 1, 0, errors);
    result_nodes.push(SdoBinaryNode {
        value: root.clone(),
        parent: None,
        bytes: root_bytes.clone(),
    });
    let mut level = vec![None];
    let mut sdo_offset = root_bytes.len();
    let mut current_item_index = 0usize;

    for _ in 0..1000 {
        let mut next_level = Vec::new();
        let mut level_child_counts = Vec::new();
        let mut level_child_sizes = Vec::new();
        for parent in &level {
            let mut total = 0usize;
            let mut total_size = 0usize;
            for (node_index, node) in nodes.iter().enumerate() {
                if node.parent == *parent {
                    total += 1;
                    total_size += node.bytes.len();
                    result_nodes.push(node.clone());
                    next_level.push(Some(node_index));
                }
            }
            level_child_counts.push(total);
            level_child_sizes.push(total_size);
        }
        for index in 0..level.len() {
            if level_child_counts[index] > 0 {
                write_menu_children(
                    &mut result_nodes[current_item_index].bytes,
                    (base_addr + sdo_offset) as u32,
                    level_child_counts[index] as u32,
                );
                sdo_offset += level_child_sizes[index];
            }
            current_item_index += 1;
        }
        if next_level.is_empty() {
            break;
        }
        level = next_level;
    }

    root_bytes.clear();
    result_nodes
        .into_iter()
        .flat_map(|node| node.bytes)
        .collect()
}

fn flatten_sdo_children(
    value: &Value,
    parent: Option<usize>,
    nodes: &mut Vec<SdoBinaryNode>,
    text_catalog: TextCatalog<'_>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) {
    let Some(children) = value.get("children").and_then(Value::as_array) else {
        return;
    };
    for child in children {
        let index = nodes.len();
        let bytes = if object_i64(child, "type", 0) == 1 {
            menu_sdo_bytes(child, text_catalog, warnings, errors)
        } else {
            menu_item_bytes(
                child,
                text_catalog,
                object_i64(child, "user_auth", 0) as u16,
                object_i64(child, "type", 0) as u16,
                errors,
            )
        };
        nodes.push(SdoBinaryNode {
            value: child.clone(),
            parent,
            bytes,
        });
        flatten_sdo_children(child, Some(index), nodes, text_catalog, warnings, errors);
    }
}

fn menu_item_bytes(
    value: &Value,
    text_catalog: TextCatalog<'_>,
    user_auth: u16,
    ui_type: u16,
    errors: &mut Vec<String>,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_u16(&mut bytes, menu_control(0, user_auth, ui_type));
    let message_index = text_catalog.index(
        &sdo_message_key(value, text_catalog),
        "SDO 菜单名称",
        errors,
    );
    write_u16(&mut bytes, message_index as u16);
    write_u32(&mut bytes, 0);
    write_u32(&mut bytes, 0);
    if text_catalog.is_dynamic() {
        write_u16(&mut bytes, (message_index >> 16) as u16);
        bytes.extend([0xff; 26]);
    } else {
        bytes.extend([0xff; 28]);
    }
    bytes
}

fn menu_sdo_bytes(
    value: &Value,
    text_catalog: TextCatalog<'_>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_u16(
        &mut bytes,
        menu_control(1, object_i64(value, "user_auth", 0) as u16, 1),
    );
    if text_catalog.is_dynamic() {
        let message_index = text_catalog.index(
            &sdo_message_key(value, text_catalog),
            "SDO 参数名称",
            errors,
        );
        write_u16(&mut bytes, message_index as u16);
        write_u16(&mut bytes, (message_index >> 16) as u16);
    } else {
        write_u16(
            &mut bytes,
            text_catalog.index(
                &sdo_message_key(value, text_catalog),
                "SDO 参数名称",
                errors,
            ) as u16,
        );
        write_u16(&mut bytes, 0xffff);
    }
    write_u8(&mut bytes, sdo_control(value));
    write_u8(&mut bytes, object_i64(value, "handle", 0) as u8);
    write_u32(&mut bytes, sdo_handle_param(value));
    write_u8(&mut bytes, object_i64(value, "fid", 0) as u8);
    write_u16(&mut bytes, object_i64(value, "mid", 0) as u16);
    write_u8(&mut bytes, object_i64(value, "sid", 0) as u8);
    write_u32(&mut bytes, sdo_default_value(value, warnings));
    write_f32(
        &mut bytes,
        object_string(value, "data_min")
            .parse::<f32>()
            .unwrap_or(0.0),
    );
    write_f32(
        &mut bytes,
        object_string(value, "data_max")
            .parse::<f32>()
            .unwrap_or(0.0),
    );
    write_u32(&mut bytes, 0);
    write_u16(&mut bytes, sdo_cal_flag(value));
    write_i16(&mut bytes, sdo_pre_handle_scale(value));
    write_f32(
        &mut bytes,
        object_string(value, "pre_handle_offset")
            .parse::<f32>()
            .unwrap_or(0.0),
    );
    bytes
}

fn write_menu_children(bytes: &mut [u8], children_addr: u32, total: u32) {
    let offset = 4;
    bytes[offset..offset + 4].copy_from_slice(&children_addr.to_le_bytes());
    bytes[offset + 4..offset + 8].copy_from_slice(&total.to_le_bytes());
}

fn menu_control(data_type: u16, user_auth: u16, ui_type: u16) -> u16 {
    (data_type & 0x0f) | ((user_auth & 0x07) << 4) | ((ui_type & 0x01ff) << 7)
}

fn sdo_message_key(value: &Value, catalog: TextCatalog<'_>) -> String {
    let keys: &[&str] = if catalog.is_dynamic() {
        &["message_key", "name_key"]
    } else {
        &["name"]
    };
    for key in keys {
        let value = object_string(value, key);
        if !value.is_empty() {
            return value;
        }
    }
    String::new()
}

fn sdo_control(value: &Value) -> u8 {
    ((object_i64(value, "control_protocol", 0) as u8) & 0x0f)
        | (((object_i64(value, "control_rw", 0) as u8) & 0x03) << 4)
        | (((object_i64(value, "control_use_default", 0) as u8) & 0x01) << 6)
        | (((object_i64(value, "control_use_min_max", 0) as u8) & 0x01) << 7)
}

fn sdo_handle_param(value: &Value) -> u32 {
    let handle = object_i64(value, "handle", 0);
    let parts = object_string(value, "handle_param")
        .split("->")
        .map(parse_i64)
        .collect::<Vec<_>>();
    let first = parts.first().copied().unwrap_or(0) as u32;
    let second = parts.get(1).copied().unwrap_or(0) as u32;
    let third = parts.get(2).copied().unwrap_or(0) as u32;
    if (10..=12).contains(&handle) {
        (first & 0xff) | (((second + 1) & 0xff) << 8) | (1 << 16)
    } else {
        (first & 0x0f) | ((second & 0x0f) << 4) | ((third & 0xffff) << 8)
    }
}

fn sdo_default_value(value: &Value, warnings: &mut Vec<String>) -> u32 {
    let handle = object_i64(value, "handle", 0);
    let pre_handle = object_i64(value, "pre_handle", 0);
    let default_text = object_string(value, "data_default");
    if handle == 6 {
        let mut bytes = [0u8; 4];
        for (index, byte) in default_text.as_bytes().iter().take(4).enumerate() {
            bytes[index] = *byte;
        }
        return u32::from_le_bytes(bytes);
    }
    if pre_handle == 0 {
        parse_i64(&default_text) as u32
    } else {
        warnings.push(format!(
            "SDO {} 预处理默认值暂按原始浮点四舍五入",
            object_string(value, "name")
        ));
        default_text.parse::<f64>().unwrap_or(0.0).round() as u32
    }
}

fn sdo_cal_flag(value: &Value) -> u16 {
    ((object_i64(value, "pre_handle", 0) as u16) & 0x1f)
        | (((object_i64(value, "pre_handle_decimal", 0) as u16) & 0x07) << 5)
}

fn sdo_pre_handle_scale(value: &Value) -> i16 {
    let pre_handle = object_i64(value, "pre_handle", 0);
    let mut scale = value
        .get("pre_handle_scale")
        .and_then(Value::as_str)
        .map(|item| item.parse::<i16>().unwrap_or(0))
        .unwrap_or(1);
    if matches!(pre_handle, 1 | 3 | 5) && scale == 0 {
        scale = 1;
    }
    scale
}

fn write_language_bytes(
    document: &Value,
    entries: &[String],
    language_count: usize,
    bytes: &mut Vec<u8>,
) -> Vec<isize> {
    let selected = document
        .get("language_info")
        .and_then(|value| value.get("list_code_language"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let translations = document
        .get("language_info")
        .and_then(|value| value.get("list_translate"))
        .and_then(Value::as_object);
    let mut addrs = Vec::new();
    for code in selected.into_iter().take(language_count) {
        let start = bytes.len() as isize;
        addrs.push(start);
        let index_table_len = (entries.len() + 1) * 4;
        let mut text_bytes = Vec::new();
        let mut index_bytes = Vec::new();
        write_u32(&mut index_bytes, entries.len() as u32);
        for entry in entries {
            write_u32(
                &mut index_bytes,
                (start as usize + index_table_len + text_bytes.len()) as u32,
            );
            let text = translations
                .and_then(|items| items.get(entry))
                .and_then(|item| item.get(&code))
                .and_then(Value::as_str)
                .unwrap_or(entry);
            text_bytes.extend(text.as_bytes());
            text_bytes.push(0);
        }
        bytes.extend(index_bytes);
        bytes.extend(text_bytes);
    }
    addrs
}

fn object_i64(value: &Value, key: &str, default: i64) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(default)
}

fn object_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn parse_i64(value: &str) -> i64 {
    let value = value.trim();
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .and_then(|hex| i64::from_str_radix(hex, 16).ok())
        .unwrap_or_else(|| value.parse::<i64>().unwrap_or(0))
}

fn first_diff_offset(left: &[u8], right: &[u8]) -> Option<usize> {
    left.iter()
        .zip(right.iter())
        .position(|(left, right)| left != right)
        .or_else(|| (left.len() != right.len()).then_some(left.len().min(right.len())))
}

fn write_global_variable_table(
    bytes: &mut Vec<u8>,
    offset: usize,
    param: &PdoGlobalParam,
    warnings: &mut Vec<String>,
) {
    write_u16(bytes, offset as u16);
    write_u8(bytes, param.data_type as u8);
    write_u8(bytes, global_param_reserved(param, warnings));
}

fn global_param_reserved(param: &PdoGlobalParam, warnings: &mut Vec<String>) -> u8 {
    if is_string_param(param.data_type) {
        global_param_byte_len(param, warnings) as u8
    } else {
        param.reserved as u8
    }
}

fn write_default_value(bytes: &mut Vec<u8>, param: &PdoGlobalParam, warnings: &mut Vec<String>) {
    let byte_len = global_param_byte_len(param, warnings);
    let value = param.def.parse::<i64>().unwrap_or_else(|_| {
        if !param.def.is_empty() {
            warnings.push(format!(
                "全局变量 {} 默认值暂按 0 打包：{}",
                param.name, param.def
            ));
        }
        0
    });
    bytes.extend(value.to_le_bytes().into_iter().take(byte_len));
}

fn global_param_byte_len(param: &PdoGlobalParam, warnings: &mut Vec<String>) -> usize {
    if is_string_param(param.data_type) {
        return (param.reserved.max(0) as usize) + 1;
    }
    match param.data_type {
        0..=9 => 1,
        10..=19 => 2,
        20..=38 => 4,
        _ => {
            warnings.push(format!(
                "全局变量 {} type {} 未知，默认按 4 字节打包",
                param.name, param.data_type
            ));
            4
        }
    }
}

fn is_string_param(data_type: i64) -> bool {
    data_type == 74
}

fn write_pdo_frames(
    bytes: &mut Vec<u8>,
    frames: &[PdoAdvancedFrame],
    param_indexes: &HashMap<String, u16>,
    condition_param_ids: &HashSet<String>,
) {
    let description_base = bytes.len();
    let data_base = description_base + frames.len() * 12;
    let mut data_bytes = Vec::new();
    for frame in frames {
        write_u32(bytes, frame.id);
        write_u32(bytes, (data_base + data_bytes.len()) as u32);
        write_u16(bytes, frame.data.len() as u16);
        write_u8(bytes, frame.frame_type);
        write_u8(bytes, frame_trigger_condition(frame, condition_param_ids));
        for signal in &frame.data {
            write_u8(&mut data_bytes, signal.pos as u8);
            write_u8(&mut data_bytes, signal.len as u8);
            write_u16(
                &mut data_bytes,
                param_indexes.get(&signal.param_id).copied().unwrap_or(0),
            );
            write_u8(&mut data_bytes, signal.handle);
            write_u8(&mut data_bytes, 0);
            write_i16(
                &mut data_bytes,
                signal.handle_param.parse::<i16>().unwrap_or(0),
            );
        }
    }
    bytes.extend(data_bytes);
}

fn frame_trigger_condition(frame: &PdoAdvancedFrame, condition_param_ids: &HashSet<String>) -> u8 {
    if frame
        .data
        .iter()
        .any(|signal| condition_param_ids.contains(&signal.param_id))
    {
        0x80
    } else {
        0
    }
}

fn write_u8(bytes: &mut Vec<u8>, value: u8) {
    bytes.push(value);
}

fn write_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend(value.to_le_bytes());
}

fn write_i16(bytes: &mut Vec<u8>, value: i16) {
    bytes.extend(value.to_le_bytes());
}

fn write_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend(value.to_le_bytes());
}

fn write_i32(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend(value.to_le_bytes());
}

fn write_f32(bytes: &mut Vec<u8>, value: f32) {
    bytes.extend(value.to_le_bytes());
}

/// CRC16-CCITT-FALSE 校验（多项式 0x1021，初始值 0xFFFF）。
fn crc16_ccitt_false(bytes: &[u8]) -> u16 {
    let mut crc = 0xffffu16;
    for byte in bytes {
        crc ^= (*byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn copy_resource_images(
    resource: &UiResource,
    export_root: &str,
    copied_files: &mut Vec<UiImageCopyItem>,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) {
    let entries = legacy_export_entries_for_resource(resource, warnings, errors);
    for entry in entries {
        for (source, relative_destination) in entry.source_files {
            let destination = join_fs_path(export_root, &relative_destination);
            copy_one_image(&source, &destination, copied_files, errors);
        }
    }
}

fn copy_one_image(
    source: &str,
    destination: &str,
    copied_files: &mut Vec<UiImageCopyItem>,
    errors: &mut Vec<String>,
) {
    match copy_file(source, destination) {
        Ok(_) => copied_files.push(UiImageCopyItem {
            source: source.to_string(),
            destination: destination.to_string(),
        }),
        Err(error) => errors.push(format!(
            "复制 UI 图片失败 {} -> {}：{}",
            source, destination, error
        )),
    }
}

fn export_items_for_resource(
    resource: &UiResource,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Vec<ScreenItemPlan> {
    legacy_export_entries_for_resource(resource, warnings, errors)
        .into_iter()
        .map(|entry| entry.item)
        .collect()
}

fn legacy_export_entries_for_resource(
    resource: &UiResource,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Vec<ExportScreenEntry> {
    if resource.dest.is_empty() {
        warnings.push(format!(
            "UI 资源 {} 缺少 dest，旧版导出会跳过",
            resource.key
        ));
        return Vec::new();
    }
    let Some(option) = resource.options.get(resource.default_option) else {
        warnings.push(format!(
            "UI 资源 {} default_option 无有效资源",
            resource.key
        ));
        return Vec::new();
    };
    let missing_sources = option
        .sources
        .iter()
        .filter(|source| !std::path::Path::new(source.as_str()).exists())
        .cloned()
        .collect::<Vec<_>>();
    if !missing_sources.is_empty() {
        errors.push(format!(
            "UI 资源 {} 存在不存在的图片文件：{}",
            resource.name,
            missing_sources.join("；")
        ));
        return Vec::new();
    }

    match resource.handle {
        UiResourceHandle::Show => legacy_show_entries(resource, option),
        UiResourceHandle::List => legacy_list_entries(resource, option),
        UiResourceHandle::Anim => legacy_anim_entries(resource, option),
        UiResourceHandle::Unknown => Vec::new(),
    }
}

fn legacy_show_entries(resource: &UiResource, option: &ResourceOption) -> Vec<ExportScreenEntry> {
    let Some(dest) = resource.dest.first() else {
        return Vec::new();
    };
    let Some(source) = option.sources.first() else {
        return Vec::new();
    };
    let file_name = file_name(source);
    let relative = join_path("img", &file_name);
    vec![ExportScreenEntry {
        item: screen_item(
            resource,
            dest,
            &export_item_src(&relative),
            option.format.as_deref().unwrap_or("png"),
            None,
        ),
        source_files: vec![(source.clone(), relative)],
    }]
}

fn legacy_list_entries(resource: &UiResource, option: &ResourceOption) -> Vec<ExportScreenEntry> {
    resource
        .dest
        .iter()
        .enumerate()
        .filter_map(|(index, dest)| {
            let source = option.sources.get(index)?;
            let file_name = file_name(source);
            let relative = join_path("img", &file_name);
            Some(ExportScreenEntry {
                item: screen_item(
                    resource,
                    dest,
                    &export_item_src(&relative),
                    option.format.as_deref().unwrap_or("png"),
                    None,
                ),
                source_files: vec![(source.clone(), relative)],
            })
        })
        .collect()
}

fn legacy_anim_entries(resource: &UiResource, option: &ResourceOption) -> Vec<ExportScreenEntry> {
    let dest_total = resource.dest.len();
    if dest_total == 0 {
        return Vec::new();
    }
    let format = option.format.as_deref().unwrap_or("png");
    let frames_per_dest = option.sources.len() / dest_total;
    resource
        .dest
        .iter()
        .enumerate()
        .filter_map(|(dest_index, dest)| {
            let first_source = option.sources.get(dest_index * frames_per_dest)?;
            let base_src = export_anim_src_from_file(first_source, format);
            let mut source_files = Vec::new();
            for frame in 0..frames_per_dest {
                let source = option
                    .sources
                    .get(dest_index * frames_per_dest + frame)?
                    .clone();
                let file_name = legacy_anim_file_name(&source, frame, format);
                source_files.push((source, join_path("img/anim", &file_name)));
            }
            Some(ExportScreenEntry {
                item: screen_item(resource, dest, &base_src, format, Some(frames_per_dest)),
                source_files,
            })
        })
        .collect()
}

fn screen_item(
    resource: &UiResource,
    dest: &str,
    src: &str,
    format: &str,
    p_num: Option<usize>,
) -> ScreenItemPlan {
    ScreenItemPlan {
        x: resource.x,
        y: resource.y,
        w: resource.width,
        h: resource.height,
        dest: dest.to_string(),
        src: src.to_string(),
        format: format.to_string(),
        p_num,
    }
}

fn export_item_src(relative_path: &str) -> String {
    let normalized = relative_path.replace('\\', "/");
    let Some((path, extension)) = normalized.rsplit_once('.') else {
        return normalized;
    };
    if matches!(extension, "png" | "jpg") {
        path.to_string()
    } else {
        normalized
    }
}

fn export_anim_src_from_file(src: &str, format: &str) -> String {
    let file_name = legacy_anim_file_name(src, 0, format);
    let relative = join_path("img/anim", &file_name);
    strip_anim_frame_suffix(&strip_extension(&relative))
}

fn legacy_anim_file_name(source: &str, frame_index: usize, format: &str) -> String {
    let file_name = file_name(source);
    let stem = strip_extension(&file_name);
    let prefix = if stem.chars().count() >= 2 {
        stem.chars()
            .take(stem.chars().count() - 2)
            .collect::<String>()
    } else {
        stem
    };
    format!("{}{:02}.{}", prefix, frame_index, format)
}

fn strip_anim_frame_suffix(value: &str) -> String {
    if value.chars().count() >= 2 {
        value.chars().take(value.chars().count() - 2).collect()
    } else {
        value.to_string()
    }
}

fn file_name(path: &str) -> String {
    path.replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or(path)
        .to_string()
}

fn strip_extension(value: &str) -> String {
    value
        .rsplit_once('.')
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| value.to_string())
}

fn strip_trailing_digits(value: &str) -> String {
    value
        .trim_end_matches(|character: char| character.is_ascii_digit())
        .to_string()
}

fn count_array(document: &Value, key: &str) -> usize {
    document
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
}

fn join_path(base: &str, child: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches(['/', '\\']),
        child.replace('\\', "/")
    )
}

fn join_fs_path(base: &str, child: &str) -> String {
    let mut path = PathBuf::from(base);
    for segment in child
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
    {
        path.push(segment);
    }
    path.to_string_lossy().into_owned()
}

fn project_export_settings(document: &Value) -> ProjectExportSettings {
    document
        .get("export_info")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

fn export_root(request: &ExportPlanRequest) -> String {
    let output_dir = request.output_dir.trim().to_string();
    let output_dir = if output_dir.is_empty() {
        request
            .project_path
            .as_deref()
            .and_then(|path| std::path::Path::new(path).parent())
            .filter(|path| !path.as_os_str().is_empty())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|| ".".to_string())
    } else {
        output_dir
    };
    let configured = export_setting(request, request.folder_name.as_deref(), "folder_name");
    join_fs_path(&output_dir, &export_folder_name(configured, "jc_export"))
}

fn export_setting<'a>(
    request: &'a ExportPlanRequest,
    request_value: Option<&'a str>,
    key: &str,
) -> Option<&'a str> {
    request_value.or_else(|| {
        request
            .document
            .get("export_info")
            .and_then(|value| value.get(key))
            .and_then(Value::as_str)
    })
}

fn export_folder_name(value: Option<&str>, default_name: &str) -> String {
    value
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .and_then(|name| std::path::Path::new(name).file_name())
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .unwrap_or(default_name)
        .to_string()
}

fn export_file_name(value: Option<&str>, default_name: &str, extension: &str) -> String {
    let trimmed = value.map(str::trim).filter(|name| !name.is_empty());
    let Some(raw_name) = trimmed else {
        return default_name.to_string();
    };
    let file_name = std::path::Path::new(raw_name)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(default_name);
    if file_name
        .rsplit_once('.')
        .is_some_and(|(_, existing_extension)| existing_extension.eq_ignore_ascii_case(extension))
    {
        file_name.to_string()
    } else {
        format!("{}.{}", strip_extension(file_name), extension)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn i18n_fixture(name: &str) -> Value {
        let source = match name {
            "jc001-valid" => include_str!("../../tests/fixtures/i18n/jc001-valid.json"),
            "jc002-valid" => include_str!("../../tests/fixtures/i18n/jc002-valid.json"),
            "jc002-mixed-schema" => {
                include_str!("../../tests/fixtures/i18n/jc002-mixed-schema.json")
            }
            "jc002-missing-key" => {
                include_str!("../../tests/fixtures/i18n/jc002-missing-key.json")
            }
            _ => panic!("unknown i18n fixture: {name}"),
        };
        serde_json::from_str(source).unwrap()
    }

    fn fixture_manifest(document: Value, binary: &BinaryBuildReport) -> Value {
        let settings = project_export_settings(&document);
        let mut warnings = Vec::new();
        let mut errors = Vec::new();
        let manifest = build_config_update_manifest(
            &ExportPlanRequest {
                project_path: None,
                output_dir: "out".to_string(),
                document,
                folder_name: None,
                manifest_filename: None,
                binary_filename: None,
            },
            &binary.data_description,
            &settings,
            &mut warnings,
            &mut errors,
        );
        assert!(errors.is_empty(), "unexpected manifest errors: {errors:?}");
        manifest
    }

    fn jc001(mut document: Value) -> Value {
        document["config_version"] = json!("jc001");
        document
    }

    fn jc002(mut document: Value, keys: &[&str]) -> Value {
        document["config_version"] = json!("jc002");
        let translations = keys
            .iter()
            .map(|key| ((*key).to_string(), json!(format!("text:{key}"))))
            .collect::<Map<_, _>>();
        document["localization"] = json!({
            "default_locale": "en-US",
            "locale_order": ["en-US"],
            "locales": {
                "en-US": { "enabled": true, "translations": translations }
            }
        });
        document
    }

    fn battery_monitor_fixture() -> Value {
        json!({
            "schema_version": 2,
            "enabled": true,
            "version": 2,
            "default_timeout_ticks": 200,
            "page_size": 4,
            "frames": [{
                "frame_key": "test_frame",
                "can_id": 0x123,
                "frame_type": 0,
                "dlc": 8,
                "desc": "测试帧",
                "timeout_ticks": 200
            }],
            "signals": [{
                "signal_key": "test_signal",
                "name": "battery_monitor.test_signal",
                "inner": -1,
                "frame_key": "test_frame",
                "pos": 0,
                "len": 8,
                "byte_order": "little_endian",
                "raw_offset": 0,
                "raw_type": "u8",
                "value_type": "u8",
                "parse_resolution": 1,
                "parse_offset": 0,
                "parse_mask": u32::MAX,
                "parse_shift": 0,
                "receiver": "vcu",
                "comment": ""
            }],
            "items": [{
                "item_key": "test_item",
                "enabled": true,
                "order": 0,
                "signal_key": "test_signal",
                "name_key": "battery_monitor.test_item",
                "fallback_name": "battery_monitor.test_item.fallback",
                "unit": "",
                "formatter": {
                    "kind": "linear",
                    "offset": 0,
                    "scale_num": 1,
                    "scale_den": 1,
                    "decimals": 0,
                    "display_base": 10,
                    "true_text": "",
                    "false_text": ""
                },
                "validity": {
                    "mode": "frame_timeout",
                    "frame_key": "test_frame",
                    "empty_text": "battery_monitor.empty"
                }
            }]
        })
    }

    fn language_info_without_selected_languages() -> Value {
        json!({
            "list_code_language": [],
            "list_inner": [],
            "list_translate": {}
        })
    }

    fn enabled_battery_monitor_document() -> Value {
        jc002(
            json!({
                "device": { "resolution_w": 800, "resolution_h": 480 },
                "ui_info": { "main": { "item": {} } },
                "sdo_info": { "type": 0, "user_auth": 0, "message_key": "menu.root", "children": [] },
                "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
                "pdo_global_param": [{
                    "param_id": "TEST",
                    "name": "test",
                    "def": "0",
                    "reserved": 0,
                    "type": 0,
                    "inner": -1
                }],
                "pdo_condition": [],
                "pdo_recv": [{
                    "id": 0x111,
                    "type": 0,
                    "desc": "test",
                    "data": [{
                        "pos": 0,
                        "len": 8,
                        "show_type": 0,
                        "handle": 0,
                        "handle_param": "",
                        "param_id": "TEST"
                    }]
                }],
                "pdo_send": [],
                "battery_monitor": battery_monitor_fixture()
            }),
            &[
                "menu.root",
                "battery_monitor.test_signal",
                "battery_monitor.test_item",
                "battery_monitor.test_item.fallback",
                "battery_monitor.empty",
            ],
        )
    }

    fn build_battery_monitor_manifest(config: bool, bin: bool) -> (BinaryBuildReport, Value) {
        let mut document = enabled_battery_monitor_document();
        document["export_info"] = json!({
            "battery_monitor": { "config": config, "bin": bin },
            "fault_code_info": { "config": true, "bin": true }
        });
        let binary = build_project_binary(&document);
        assert!(
            binary.valid,
            "unexpected export errors: {:?}",
            binary.errors
        );
        let export_settings = project_export_settings(&document);
        let data_description =
            manifest_data_description(&binary.data_description, &export_settings);
        let mut warnings = Vec::new();
        let mut errors = Vec::new();
        let manifest = build_config_update_manifest(
            &ExportPlanRequest {
                project_path: None,
                output_dir: "out".to_string(),
                document,
                folder_name: None,
                manifest_filename: None,
                binary_filename: None,
            },
            &data_description,
            &export_settings,
            &mut warnings,
            &mut errors,
        );
        assert!(
            errors.is_empty(),
            "unexpected manifest errors: {:?}",
            errors
        );
        (binary, manifest)
    }

    fn empty_pdo_advanced_sections() -> Value {
        jc001(json!({
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": []
        }))
    }

    #[test]
    fn project_export_settings_default_enables_all_targets() {
        let options = ProjectExportSettings::default();

        assert!(options.battery_monitor.config);
        assert!(options.battery_monitor.bin);
        assert!(options.fault_code_info.config);
        assert!(options.fault_code_info.bin);
    }

    #[test]
    fn versioned_fixtures_emit_mutually_exclusive_manifest_fields() {
        let v1_document = i18n_fixture("jc001-valid");
        let v1_binary = build_project_binary(&v1_document);
        assert!(v1_binary.valid, "{:?}", v1_binary.errors);
        let v1_manifest = fixture_manifest(v1_document, &v1_binary);
        let v1_description = v1_manifest["data_description"].as_object().unwrap();
        assert!(v1_description.contains_key("language_addr"));
        assert!(v1_description.contains_key("language_code"));
        assert!(!v1_description.keys().any(|key| key.starts_with("i18n_")));
        assert!(!v1_description.contains_key("sdo_version"));

        let v2_document = i18n_fixture("jc002-valid");
        let v2_binary = build_project_binary(&v2_document);
        assert!(v2_binary.valid, "{:?}", v2_binary.errors);
        let v2_manifest = fixture_manifest(v2_document, &v2_binary);
        let v2_description = v2_manifest["data_description"].as_object().unwrap();
        assert!(!v2_description.contains_key("language_addr"));
        assert!(!v2_description.contains_key("language_code"));
        assert_eq!(v2_description["i18n_version"], 2);
        assert_eq!(v2_description["i18n_locale_total"], 2);
        assert_eq!(v2_description["sdo_version"], 2);
    }

    #[test]
    fn versioned_fixtures_reject_mixed_schema_and_missing_message_keys() {
        let mixed = build_project_binary(&i18n_fixture("jc002-mixed-schema"));
        assert!(!mixed.valid);
        assert!(mixed
            .errors
            .iter()
            .any(|error| error.contains("language_info")));

        let missing = build_project_binary(&i18n_fixture("jc002-missing-key"));
        assert!(!missing.valid);
        assert!(missing
            .errors
            .iter()
            .any(|error| error.contains("menu.root")));
    }

    #[test]
    fn build_project_binary_packs_fault_code_section() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh"],
                "list_inner": [],
                "list_translate": {
                    "fault.traction.001": { "zh": "牵引故障1" }
                }
            },
            "pdo_global_param": [
                { "param_id": "A", "name": "A", "def": "0", "reserved": 0, "type": 0, "inner": -1 }
            ],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] },
            "fault_code_info": {
                "enabled": true,
                "version": 3,
                "sources": [{
                    "source_id": 1,
                    "type_char": "T",
                    "can_id": 648,
                    "frame_type": 0,
                    "code_byte": 2,
                    "clear_code": 0,
                    "invalid_codes": [1, 5]
                }],
                "codes": [{
                    "type_char": "T",
                    "code": 1,
                    "message_key": "fault.traction.001",
                    "severity": "warning"
                }]
            }
        }));

        let report = build_project_binary(&document);

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.data_description.fault_code_version, 3);
        assert_eq!(report.data_description.fault_source_total, 1);
        assert_eq!(report.data_description.fault_code_total, 1);
        assert!(report.data_description.fault_code_base_addr >= 0);

        let base = report.data_description.fault_code_base_addr as usize;
        let source_table_addr =
            u32::from_le_bytes(report.bytes[base + 8..base + 12].try_into().unwrap()) as usize;
        let code_table_addr =
            u32::from_le_bytes(report.bytes[base + 12..base + 16].try_into().unwrap()) as usize;

        assert_eq!(
            u16::from_le_bytes(report.bytes[base..base + 2].try_into().unwrap()),
            3
        );
        assert_eq!(source_table_addr, base + 20);
        assert_eq!(code_table_addr, base + 36);
        assert_eq!(
            u32::from_le_bytes(
                report.bytes[source_table_addr..source_table_addr + 4]
                    .try_into()
                    .unwrap()
            ),
            648
        );
        assert_eq!(report.bytes[source_table_addr + 10], b'T');
        assert_eq!(report.bytes[source_table_addr + 11], 2);
        assert_eq!(report.bytes[code_table_addr], b'T');
        assert_eq!(report.bytes[code_table_addr + 1], 1);
        assert_eq!(
            u16::from_le_bytes(
                report.bytes[code_table_addr + 2..code_table_addr + 4]
                    .try_into()
                    .unwrap()
            ),
            1
        );
        assert_eq!(report.bytes[code_table_addr + 4], 2);

        let mut config_off = document.clone();
        config_off["export_info"] = json!({
            "battery_monitor": { "config": true, "bin": true },
            "fault_code_info": { "config": false, "bin": true }
        });
        let config_off_report = build_project_binary(&config_off);
        assert!(config_off_report.data_description.fault_code_base_addr >= 0);
        let config_off_manifest = manifest_data_description(
            &config_off_report.data_description,
            &project_export_settings(&config_off),
        );
        assert_eq!(config_off_manifest.fault_code_base_addr, -1);
        assert_eq!(config_off_manifest.fault_source_total, 0);
        assert_eq!(config_off_manifest.fault_code_total, 0);
        let mut config_off_manifest_value = json!(config_off_manifest);
        omit_disabled_export_descriptions(
            &mut config_off_manifest_value,
            &project_export_settings(&config_off),
        );
        let config_off_manifest_object = config_off_manifest_value.as_object().unwrap();
        for key in [
            "fault_code_base_addr",
            "fault_code_version",
            "fault_source_total",
            "fault_code_total",
        ] {
            assert!(
                config_off_manifest_object.get(key).is_none(),
                "unexpected key: {key}"
            );
        }

        let mut bin_off = document.clone();
        bin_off["export_info"] = json!({
            "battery_monitor": { "config": true, "bin": true },
            "fault_code_info": { "config": true, "bin": false }
        });
        let bin_off_report = build_project_binary(&bin_off);
        assert_eq!(bin_off_report.data_description.fault_code_base_addr, -1);
        assert_eq!(bin_off_report.data_description.fault_source_total, 0);
        assert_eq!(bin_off_report.data_description.fault_code_total, 0);
    }

    #[test]
    fn jc002_fault_catalog_flattens_shared_messages_without_merging_identities() {
        let document = jc002(
            json!({
                "project": { "name": "fault-v2" },
                "export_info": {},
                "device": { "resolution_w": 800, "resolution_h": 480 },
                "ui_info": { "main": { "item": {} } },
                "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
                "pdo_global_param": [],
                "pdo_condition": [],
                "pdo_recv": [],
                "pdo_send": [],
                "sdo_info": { "type": 0, "user_auth": 0, "message_key": "menu.root", "children": [] },
                "fault_code_info": {
                    "schema_version": 2,
                    "enabled": true,
                    "version": 2,
                    "sources": [
                        { "source_key": "traction", "source_id": 1, "type_char": "T", "can_id": 648 },
                        { "source_key": "pump", "source_id": 2, "type_char": "P", "can_id": 660 }
                    ],
                    "definitions": [
                        { "fault_key": "fault.traction.052", "message_key": "fault.message.low", "severity": "fault" },
                        { "fault_key": "fault.pump.052", "message_key": "fault.message.low", "severity": "fault" }
                    ],
                    "bindings": [
                        { "source_key": "traction", "code": 52, "fault_key": "fault.traction.052" },
                        { "source_key": "pump", "code": 52, "fault_key": "fault.pump.052" }
                    ]
                }
            }),
            &["menu.root", "fault.message.low"],
        );

        let report = build_project_binary(&document);
        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.data_description.fault_code_version, 2);
        assert_eq!(report.data_description.fault_source_total, 2);
        assert_eq!(report.data_description.fault_code_total, 2);

        let base = report.data_description.fault_code_base_addr as usize;
        let first = base + 20 + 2 * 16;
        let second = first + 12;
        assert_ne!(report.bytes[first], report.bytes[second]);
        assert_eq!(report.bytes[first + 1], 52);
        assert_eq!(report.bytes[second + 1], 52);
        assert_eq!(
            &report.bytes[first + 2..first + 6],
            &report.bytes[second + 2..second + 6]
        );
    }

    #[test]
    fn build_project_binary_keeps_same_fault_code_for_different_sources() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh"],
                "list_inner": [],
                "list_translate": {
                    "fault.traction.182": { "zh": "牵引 BMS 故障" },
                    "fault.pump.182": { "zh": "油泵容量过低" }
                }
            },
            "pdo_global_param": [
                { "param_id": "A", "name": "A", "def": "0", "reserved": 0, "type": 0, "inner": -1 }
            ],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] },
            "fault_code_info": {
                "enabled": true,
                "version": 1,
                "sources": [
                    {
                        "source_key": "traction",
                        "source_id": 1,
                        "type_char": "T",
                        "can_id": 648,
                        "frame_type": 0,
                        "code_byte": 2,
                        "clear_code": 0,
                        "invalid_codes": []
                    },
                    {
                        "source_key": "pump",
                        "source_id": 2,
                        "type_char": "P",
                        "can_id": 660,
                        "frame_type": 0,
                        "code_byte": 2,
                        "clear_code": 0,
                        "invalid_codes": []
                    }
                ],
                "codes": [
                    {
                        "source_key": "traction",
                        "source_id": 1,
                        "code": 182,
                        "message_key": "fault.traction.182",
                        "severity": "fault"
                    },
                    {
                        "source_key": "pump",
                        "source_id": 2,
                        "code": 182,
                        "message_key": "fault.pump.182",
                        "severity": "fault"
                    }
                ]
            }
        }));

        let report = build_project_binary(&document);

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.data_description.fault_source_total, 2);
        assert_eq!(report.data_description.fault_code_total, 2);

        let base = report.data_description.fault_code_base_addr as usize;
        let code_table_addr =
            u32::from_le_bytes(report.bytes[base + 12..base + 16].try_into().unwrap()) as usize;
        let first = &report.bytes[code_table_addr..code_table_addr + 8];
        let second = &report.bytes[code_table_addr + 8..code_table_addr + 16];

        assert_eq!(first[0], b'T');
        assert_eq!(first[1], 182);
        assert_eq!(second[0], b'P');
        assert_eq!(second[1], 182);
        assert_ne!(&first[2..4], &second[2..4]);
    }

    #[test]
    fn export_plan_uses_stable_legacy_paths_and_data_description_target() {
        let document = jc001(json!({
            "device": { "resolution_w": 800, "resolution_h": 480 },
            "ui_info": [],
            "language_info": language_info_without_selected_languages(),
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] }
        }));

        let report = build_export_plan(ExportPlanRequest {
            project_path: None,
            output_dir: "out".to_string(),
            document,
            folder_name: None,
            manifest_filename: None,
            binary_filename: None,
        });

        let export_root = join_fs_path("out", "jc_export");
        assert_eq!(report.export_root, export_root);
        assert_eq!(
            report.manifest_path,
            join_fs_path(&report.export_root, "ConfigUpdate.json")
        );
        assert_eq!(
            report.binary_path,
            join_fs_path(&report.export_root, "bin/pdo_sdo_data.bin")
        );
        assert_eq!(
            report.directories,
            vec![
                join_fs_path(&report.export_root, "img"),
                join_fs_path(&report.export_root, "img/anim"),
                join_fs_path(&report.export_root, "bin")
            ]
        );
        assert_eq!(report.screen_src.pages[0].key, "page_01");
        assert_eq!(report.screen_src.pages[1].key, "page_02");
        assert_eq!(report.data_description.src, "bin/pdo_sdo_data");
        assert_eq!(report.data_description.dest, "bin/data");
    }

    #[test]
    fn export_plan_uses_custom_manifest_and_binary_file_names() {
        let document = jc001(json!({
            "device": { "resolution_w": 800, "resolution_h": 480 },
            "ui_info": [],
            "language_info": language_info_without_selected_languages(),
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] }
        }));

        let report = build_export_plan(ExportPlanRequest {
            project_path: None,
            output_dir: "out".to_string(),
            document,
            folder_name: None,
            manifest_filename: Some("../release_config".to_string()),
            binary_filename: Some("release_data".to_string()),
        });

        assert_eq!(
            report.manifest_path,
            join_fs_path(&report.export_root, "release_config.json")
        );
        assert_eq!(
            report.binary_path,
            join_fs_path(
                &join_fs_path(&report.export_root, "bin"),
                "release_data.bin"
            )
        );
    }

    #[test]
    fn export_plan_uses_project_directory_and_document_export_settings() {
        let project_path = join_fs_path(&join_fs_path("workspace", "project"), "demo.jcpro");
        let document = jc001(json!({
            "export_info": {
                "folder_name": "release_bundle",
                "manifest_filename": "device_update",
                "binary_filename": "device_data"
            },
            "device": { "resolution_w": 800, "resolution_h": 480 },
            "ui_info": [],
            "language_info": language_info_without_selected_languages(),
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] }
        }));

        let report = build_export_plan(ExportPlanRequest {
            project_path: Some(project_path),
            output_dir: String::new(),
            document,
            folder_name: None,
            manifest_filename: None,
            binary_filename: None,
        });

        assert_eq!(
            report.export_root,
            join_fs_path(&join_fs_path("workspace", "project"), "release_bundle")
        );
        assert_eq!(
            report.manifest_path,
            join_fs_path(&report.export_root, "device_update.json")
        );
        assert_eq!(
            report.binary_path,
            join_fs_path(&report.export_root, "bin/device_data.bin")
        );
    }

    #[test]
    fn export_plan_request_names_override_document_export_settings() {
        let document = jc001(json!({
            "export_info": {
                "folder_name": "document_folder",
                "manifest_filename": "document_manifest.json",
                "binary_filename": "document_binary.bin"
            },
            "device": { "resolution_w": 800, "resolution_h": 480 },
            "ui_info": [],
            "language_info": language_info_without_selected_languages(),
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] }
        }));

        let report = build_export_plan(ExportPlanRequest {
            project_path: None,
            output_dir: "out".to_string(),
            document,
            folder_name: Some("request_folder".to_string()),
            manifest_filename: Some("request_manifest".to_string()),
            binary_filename: Some("request_binary".to_string()),
        });

        assert_eq!(report.export_root, join_fs_path("out", "request_folder"));
        assert_eq!(
            report.manifest_path,
            join_fs_path(&report.export_root, "request_manifest.json")
        );
        assert_eq!(
            report.binary_path,
            join_fs_path(&report.export_root, "bin/request_binary.bin")
        );
    }

    #[cfg(windows)]
    #[test]
    fn fs_path_join_preserves_windows_separators_for_absolute_paths() {
        assert_eq!(
            join_fs_path(r"C:\Users\JCSH\Downloads\111", "jc_export"),
            r"C:\Users\JCSH\Downloads\111\jc_export"
        );
    }

    #[test]
    fn collect_language_entries_includes_language_name_prefix() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh", "en"],
                "list_inner": ["中文", "English", "参数A"]
            },
            "sdo_info": {
                "name": "菜单根",
                "children": [
                    { "name": "参数B", "children": [] }
                ]
            }
        }));

        assert_eq!(
            collect_language_entries(&document, &ProjectExportSettings::default()),
            vec!["中文", "English", "参数A", "菜单根", "参数B", ""]
        );
    }

    #[test]
    fn collect_language_entries_deduplicates_sdo_names_against_list_inner() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh", "en"],
                "list_inner": ["中文", "English", "参数A"]
            },
            "sdo_info": {
                "name": "参数A",
                "children": [
                    { "name": "参数B", "children": [] },
                    { "name": "参数B", "children": [] }
                ]
            }
        }));

        assert_eq!(
            collect_language_entries(&document, &ProjectExportSettings::default()),
            vec!["中文", "English", "参数A", "参数B", ""]
        );
    }

    #[test]
    fn collect_language_entries_appends_empty_string_unconditionally() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh"],
                "list_inner": ["", "中文"]
            },
            "sdo_info": {
                "name": "菜单根",
                "children": []
            }
        }));

        assert_eq!(
            collect_language_entries(&document, &ProjectExportSettings::default()),
            vec!["", "中文", "菜单根", ""]
        );
    }

    #[test]
    fn sdo_name_index_accounts_for_language_prefix() {
        let document = jc001(json!({
            "language_info": {
                "list_code_language": ["zh", "en"],
                "list_inner": ["中文", "English", "参数A"]
            },
            "sdo_info": {
                "name": "菜单根",
                "children": []
            }
        }));
        let entries = collect_language_entries(&document, &ProjectExportSettings::default());
        let bytes = menu_item_bytes(
            document.get("sdo_info").unwrap(),
            TextCatalog::Legacy(&entries),
            1,
            0,
            &mut Vec::new(),
        );

        assert_eq!(u16::from_le_bytes([bytes[2], bytes[3]]), 3);
    }

    #[test]
    fn jc002_sdo_uses_dynamic_message_index_and_rejects_missing_key() {
        let base = json!({
            "pdo_global_param": [],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": {
                "type": 0,
                "user_auth": 0,
                "name": "不应参与 v2",
                "message_key": "menu.root",
                "children": []
            }
        });
        let document = jc002(base.clone(), &["menu.root"]);
        let pdo = parse_pdo_advanced_document(&document).document.unwrap();
        let report = build_binary_from_pdo(
            &document,
            &pdo,
            Vec::new(),
            &ProjectExportSettings::default(),
            "jc002",
        );
        assert!(report.valid, "{:?}", report.errors);
        assert!(report.data_description.language_addr.is_empty());
        assert_eq!(report.data_description.sdo_version, 2);
        assert_eq!(report.data_description.i18n_version, 2);
        let sdo = report.data_description.sdo_base_addr as usize;
        assert_eq!(
            u32::from_le_bytes(report.bytes[sdo + 2..sdo + 6].try_into().unwrap()),
            0
        );

        let missing = jc002(base, &["different.key"]);
        let pdo = parse_pdo_advanced_document(&missing).document.unwrap();
        let report = build_binary_from_pdo(
            &missing,
            &pdo,
            Vec::new(),
            &ProjectExportSettings::default(),
            "jc002",
        );
        assert!(!report.valid);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("menu.root")));
    }

    #[test]
    fn jc002_sdo_parameter_preserves_v1_business_field_offsets() {
        let value = json!({
            "type": 1,
            "user_auth": 2,
            "message_key": "sdo.parameter.test",
            "control_protocol": 0,
            "control_rw": 1,
            "control_use_default": 1,
            "control_use_min_max": 1,
            "handle": 3,
            "handle_param": "1->2->3",
            "fid": 8,
            "mid": 0x2030,
            "sid": 5,
            "data_default": "7",
            "data_min": "1",
            "data_max": "9"
        });
        let document = jc002(json!({}), &["sdo.parameter.test"]);
        let pack = build_dynamic_language_pack(&document).unwrap();
        let bytes = menu_sdo_bytes(
            &value,
            TextCatalog::Dynamic(&pack),
            &mut Vec::new(),
            &mut Vec::new(),
        );

        assert_eq!(bytes.len(), 40);
        assert_eq!(bytes[6] & 0x0f, 0);
        assert_eq!(bytes[7], 3);
        assert_eq!(bytes[12], 8);
        assert_eq!(u16::from_le_bytes([bytes[13], bytes[14]]), 0x2030);
        assert_eq!(bytes[15], 5);
        assert_eq!(u32::from_le_bytes(bytes[16..20].try_into().unwrap()), 7);
    }

    #[test]
    fn build_project_binary_prefers_advanced_pdo_over_simple_pdo() {
        let document = jc001(json!({
            "language_info": language_info_without_selected_languages(),
            "sdo_info": { "type": 0, "user_auth": 0, "name": "菜单", "children": [] },
            "pdo_simple_send_recv": {
                "pdo_recv": [{
                    "id": 0x222,
                    "type": 0,
                    "desc": "simple fallback must not be used",
                    "data": [{ "pos": 0, "len": 8, "show_type": 0, "pdo_param_index": 0, "pdo_param_name": "simple" }]
                }],
                "pdo_send": []
            },
            "pdo_global_param": [{
                "param_id": "ADV_SIGNAL",
                "name": "Advanced Signal",
                "def": "7",
                "reserved": 0,
                "type": 0,
                "inner": -1
            }],
            "pdo_condition": [],
            "pdo_recv": [{
                "id": 0x111,
                "type": 0,
                "desc": "advanced recv",
                "data": [{
                    "pos": 0,
                    "len": 8,
                    "show_type": 0,
                    "handle": 0,
                    "handle_param": "",
                    "param_id": "ADV_SIGNAL"
                }]
            }],
            "pdo_send": []
        }));

        let report = build_project_binary(&document);

        assert!(
            report.valid,
            "unexpected export errors: {:?}",
            report.errors
        );
        assert_eq!(report.data_description.global_param_total, 1);
        assert_eq!(report.data_description.pdo_recv_total, 1);
        assert_eq!(report.data_description.pdo_send_total, 0);
        let recv_base = report.data_description.pdo_recv_base_addr as usize;
        assert_eq!(
            u32::from_le_bytes(report.bytes[recv_base..recv_base + 4].try_into().unwrap()),
            0x111
        );
    }

    #[test]
    fn build_project_binary_uses_simple_pdo_when_advanced_sections_are_empty() {
        let mut document = empty_pdo_advanced_sections();
        let object = document.as_object_mut().unwrap();
        object.insert(
            "language_info".to_string(),
            language_info_without_selected_languages(),
        );
        object.insert(
            "sdo_info".to_string(),
            json!({ "type": 0, "user_auth": 0, "name": "菜单", "children": [] }),
        );
        object.insert(
            "pdo_simple_send_recv".to_string(),
            json!({
                "pdo_recv": [{
                    "id": 0x321,
                    "type": 0,
                    "desc": "simple recv",
                    "data": [{ "pos": 8, "len": 8, "show_type": 0, "pdo_param_index": 3, "pdo_param_name": "simple_signal" }]
                }],
                "pdo_send": []
            }),
        );

        let report = build_project_binary(&document);

        assert!(
            report.valid,
            "unexpected export errors: {:?}",
            report.errors
        );
        assert_eq!(report.data_description.global_param_total, 1);
        assert_eq!(report.data_description.global_param_index_total, 1);
        assert_eq!(report.data_description.pdo_recv_total, 1);
        let recv_base = report.data_description.pdo_recv_base_addr as usize;
        assert_eq!(
            u32::from_le_bytes(report.bytes[recv_base..recv_base + 4].try_into().unwrap()),
            0x321
        );
        let data_base = u32::from_le_bytes(
            report.bytes[recv_base + 4..recv_base + 8]
                .try_into()
                .unwrap(),
        ) as usize;
        assert_eq!(report.bytes[data_base], 8);
        assert_eq!(report.bytes[data_base + 1], 8);
    }

    #[test]
    fn build_project_binary_packs_unified_battery_monitor_segment() {
        let document = jc002(
            json!({
                "sdo_info": { "type": 0, "user_auth": 0, "message_key": "menu.root", "children": [] },
                "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
                "pdo_global_param": [],
                "pdo_condition": [],
                "pdo_recv": [],
                "pdo_send": [],
                "battery_monitor": battery_monitor_fixture()
            }),
            &[
                "menu.root",
                "battery_monitor.test_signal",
                "battery_monitor.test_item",
                "battery_monitor.test_item.fallback",
                "battery_monitor.empty",
            ],
        );

        let report = build_project_binary(&document);

        assert!(
            report.valid,
            "unexpected export errors: {:?}",
            report.errors
        );
        assert_eq!(report.data_description.global_param_total, 0);
        assert_eq!(report.data_description.pdo_recv_total, 0);
        assert_eq!(report.data_description.battery_monitor_item_total, 1);
        assert_eq!(report.data_description.battery_monitor_frame_total, 1);
        assert_eq!(report.data_description.battery_monitor_version, 2);

        let base = report.data_description.battery_monitor_base_addr as usize;
        let read_u16 = |offset: usize| {
            u16::from_le_bytes(report.bytes[offset..offset + 2].try_into().unwrap())
        };
        let read_u32 = |offset: usize| {
            u32::from_le_bytes(report.bytes[offset..offset + 4].try_into().unwrap())
        };
        let frame_table_addr = read_u32(base + 20) as usize;
        let signal_table_addr = read_u32(base + 24) as usize;
        let item_table_addr = read_u32(base + 28) as usize;

        assert_eq!(read_u16(base), 2);
        assert_eq!(read_u16(base + 2), 2);
        assert_eq!(read_u16(base + 4), 4);
        assert_eq!(read_u16(base + 6), 1);
        assert_eq!(read_u16(base + 8), 1);
        assert_eq!(read_u16(base + 10), 1);
        assert_eq!(read_u16(base + 12), 200);
        assert_eq!(read_u16(base + 14), 12);
        assert_eq!(read_u16(base + 16), 32);
        assert_eq!(read_u16(base + 18), 52);
        assert_eq!(frame_table_addr, base + 40);
        assert_eq!(signal_table_addr, frame_table_addr + 12);
        assert_eq!(item_table_addr, signal_table_addr + 32);
        assert_eq!(read_u32(frame_table_addr), 0x123);
        assert_eq!(read_u16(frame_table_addr + 6), 200);
        assert_eq!(read_u16(signal_table_addr), 0);
        assert_eq!(read_u16(item_table_addr), 0);
        assert!(report.bytes.len() >= item_table_addr + 52);
        assert!(
            report.data_description.sdo_base_addr
                > report.data_description.battery_monitor_base_addr
        );
    }

    #[test]
    fn build_project_binary_can_skip_battery_monitor_bin() {
        let mut document = enabled_battery_monitor_document();
        document["export_info"] = json!({
            "battery_monitor": { "config": true, "bin": false },
            "fault_code_info": { "config": true, "bin": true }
        });

        let report = build_project_binary(&document);

        assert!(
            report.valid,
            "unexpected export errors: {:?}",
            report.errors
        );
        assert_eq!(report.data_description.global_param_total, 1);
        assert_eq!(report.data_description.pdo_recv_total, 1);
        assert_eq!(report.data_description.battery_monitor_base_addr, -1);
        assert_eq!(report.data_description.battery_monitor_item_total, 0);
    }

    #[test]
    fn battery_monitor_config_and_bin_flags_control_manifest_independently() {
        for (config, bin) in [(false, false), (false, true), (true, false)] {
            let (binary, manifest) = build_battery_monitor_manifest(config, bin);
            let data_description = manifest
                .get("data_description")
                .and_then(Value::as_object)
                .expect("manifest data_description");

            assert!(manifest.get("battery_monitor").is_none());
            if config {
                assert_eq!(
                    data_description
                        .get("battery_monitor_base_addr")
                        .and_then(Value::as_i64),
                    Some(if bin {
                        binary.data_description.battery_monitor_base_addr as i64
                    } else {
                        -1
                    })
                );
                assert_eq!(
                    data_description
                        .get("battery_monitor_frame_total")
                        .and_then(Value::as_u64),
                    Some(if bin {
                        binary.data_description.battery_monitor_frame_total as u64
                    } else {
                        0
                    })
                );
                assert_eq!(
                    data_description
                        .get("battery_monitor_item_total")
                        .and_then(Value::as_u64),
                    Some(if bin {
                        binary.data_description.battery_monitor_item_total as u64
                    } else {
                        0
                    })
                );
                assert_eq!(
                    data_description
                        .get("battery_monitor_version")
                        .and_then(Value::as_u64),
                    Some(if bin {
                        binary.data_description.battery_monitor_version as u64
                    } else {
                        0
                    })
                );
            } else {
                for key in [
                    "battery_monitor_base_addr",
                    "battery_monitor_frame_total",
                    "battery_monitor_item_total",
                    "battery_monitor_version",
                ] {
                    assert!(data_description.get(key).is_none(), "unexpected key: {key}");
                }
            }
        }
    }

    #[test]
    fn jc002_manifest_keeps_battery_monitor_definition_in_binary_only() {
        let mut document = enabled_battery_monitor_document();
        document["export_info"] = json!({
            "battery_monitor": { "config": true, "bin": true },
            "fault_code_info": { "config": true, "bin": true }
        });

        let binary = build_project_binary(&document);
        assert!(
            binary.valid,
            "unexpected export errors: {:?}",
            binary.errors
        );
        let export_settings = project_export_settings(&document);
        let data_description =
            manifest_data_description(&binary.data_description, &export_settings);
        let mut warnings = Vec::new();
        let mut errors = Vec::new();
        let manifest = build_config_update_manifest(
            &ExportPlanRequest {
                project_path: None,
                output_dir: "out".to_string(),
                document,
                folder_name: None,
                manifest_filename: None,
                binary_filename: None,
            },
            &data_description,
            &export_settings,
            &mut warnings,
            &mut errors,
        );

        assert!(errors.is_empty(), "unexpected manifest errors: {errors:?}");
        assert!(manifest.get("battery_monitor").is_none());
        assert_eq!(
            manifest["data_description"]["battery_monitor_base_addr"],
            json!(binary.data_description.battery_monitor_base_addr)
        );
        assert_eq!(
            manifest["data_description"]["battery_monitor_item_total"],
            json!(binary.data_description.battery_monitor_item_total)
        );
        assert_eq!(
            manifest["data_description"]["battery_monitor_frame_total"],
            json!(binary.data_description.battery_monitor_frame_total)
        );
        assert_eq!(
            manifest["data_description"]["battery_monitor_version"],
            json!(binary.data_description.battery_monitor_version)
        );
    }

    #[test]
    fn build_project_binary_packs_sdo_parameter_and_reports_stable_crc() {
        let document = jc001(json!({
            "language_info": language_info_without_selected_languages(),
            "pdo_simple_send_recv": { "pdo_recv": [], "pdo_send": [] },
            "pdo_global_param": [{
                "param_id": "PARAM_A",
                "name": "参数A",
                "def": "1",
                "reserved": 0,
                "type": 0,
                "inner": -1
            }],
            "pdo_condition": [],
            "pdo_recv": [],
            "pdo_send": [],
            "sdo_info": {
                "type": 0,
                "user_auth": 0,
                "name": "菜单",
                "children": [{
                    "type": 1,
                    "user_auth": 2,
                    "name": "参数A",
                    "control_protocol": 0,
                    "control_rw": 1,
                    "control_use_default": 1,
                    "control_use_min_max": 1,
                    "handle": 0,
                    "handle_name": "u8",
                    "handle_param": "0->0->0",
                    "fid": 1,
                    "mid": 0x2000,
                    "sid": 1,
                    "data_default": "3",
                    "data_min": "1",
                    "data_max": "10",
                    "pre_handle": 0,
                    "pre_handle_scale": "1",
                    "pre_handle_offset": "0",
                    "pre_handle_decimal": 0
                }]
            }
        }));

        let report = build_project_binary(&document);

        assert!(
            report.valid,
            "unexpected export errors: {:?}",
            report.errors
        );
        assert_eq!(report.data_description.sdo_base_addr, 5);
        assert_eq!(report.data_description.file_size, 85);
        assert_eq!(report.bytes.len(), 85);
        assert_eq!(report.crc, crc16_ccitt_false(&report.bytes));
        let sdo_param_base = report.data_description.sdo_base_addr as usize + 40;
        assert_eq!(report.bytes[sdo_param_base], menu_control(1, 2, 1) as u8);
        assert_eq!(report.bytes[sdo_param_base + 12], 1);
        assert_eq!(
            u16::from_le_bytes([
                report.bytes[sdo_param_base + 13],
                report.bytes[sdo_param_base + 14],
            ]),
            0x2000
        );
        assert_eq!(report.bytes[sdo_param_base + 15], 1);
    }
}
