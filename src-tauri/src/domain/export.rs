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
//! [SDO 菜单树] [语言包 × N] [CRC16]
//! ```

use crate::domain::pdo::{
    parse_pdo_advanced_document, PdoAdvancedDocument, PdoAdvancedFrame, PdoAdvancedSignal,
    PdoGlobalParam,
};
use crate::domain::ui_resource::{parse_ui_info, ResourceOption, UiResource, UiResourceHandle};
use crate::infrastructure::file_system::{copy_file, ensure_dir};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;

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
    pub output_dir: String,
    pub document: Value,
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
    pub sdo_base_addr: isize,
    pub language_addr: Vec<isize>,
    pub language_code: Vec<String>,
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
            sdo_base_addr: -1,
            language_addr: Vec::new(),
            language_code,
        }
    }
}

/// 构建导出计划（不执行实际文件操作）。
///
/// 分析 UI 资源和二进制数据，生成目录结构、文件路径和资源清单。
pub fn build_export_plan(request: ExportPlanRequest) -> ExportPlanReport {
    let export_root = join_path(&request.output_dir, "jc_export");
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let ui_report = parse_ui_info(request.project_path.as_deref(), &request.document);
    errors.extend(ui_report.errors);
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
        binary_report.data_description
    } else {
        DataDescriptionPlan::empty(language_code)
    };

    ExportPlanReport {
        valid: errors.is_empty(),
        export_root: export_root.clone(),
        directories: vec![
            join_path(&export_root, "img"),
            join_path(&export_root, "img/anim"),
            join_path(&export_root, "bin"),
        ],
        manifest_path: join_path(&export_root, "ConfigUpdate.json"),
        binary_path: join_path(&export_root, "bin/pdo_sdo_data.bin"),
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
            &binary.data_description,
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
    let export_root = join_path(&request.output_dir, "jc_export");
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
    let export_root = join_path(&request.output_dir, "jc_export");
    let directories = vec![
        join_path(&export_root, "img"),
        join_path(&export_root, "img/anim"),
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
/// 优先使用高级 PDO 与锂电监控配置，避免简化 PDO 覆盖配置化锂电帧。
pub fn build_project_binary(document: &Value) -> BinaryBuildReport {
    let language_code = document
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

    let mut errors = Vec::new();
    let battery_enabled = battery_monitor_enabled(document);
    let pdo_report = parse_pdo_advanced_document(document);
    if !battery_enabled {
        errors.extend(pdo_report.errors.clone());
    }

    if let Some(pdo_document) = pdo_report.document.as_ref() {
        if battery_enabled || pdo_document_has_content(pdo_document) {
            let mut pdo_document = pdo_document.clone();
            merge_battery_monitor_pdo(document, &mut pdo_document, &mut errors);
            let mut report = build_binary_from_pdo(document, &pdo_document, language_code);
            report.errors.extend(errors);
            report.valid = report.errors.is_empty();
            return report;
        }
    }

    if let Some(mut pdo_document) = build_pdo_document_from_simple(document) {
        if battery_enabled {
            merge_battery_monitor_pdo(document, &mut pdo_document, &mut errors);
        }
        let mut report = build_binary_from_pdo(document, &pdo_document, language_code);
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

fn build_config_update_manifest(
    request: &ExportPlanRequest,
    data_description: &DataDescriptionPlan,
    warnings: &mut Vec<String>,
    errors: &mut Vec<String>,
) -> Value {
    let mut manifest = Map::new();
    manifest.insert(
        "config_version".to_string(),
        Value::String(
            request
                .document
                .get("config_version")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        ),
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
    manifest.insert("data_description".to_string(), json!(data_description));
    Value::Object(manifest)
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
    prepare_clean_directory(&join_path(export_root, "bin"), "bin")
}

fn prepare_image_directories(export_root: &str) -> Result<(), String> {
    let image_dir = join_path(export_root, "img");
    prepare_clean_directory(&image_dir, "img")?;
    ensure_dir(join_path(&image_dir, "anim"))
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
        .get("battery_monitor_info")
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

fn merge_battery_monitor_pdo(
    source_document: &Value,
    pdo_document: &mut PdoAdvancedDocument,
    errors: &mut Vec<String>,
) {
    let Some(root) = source_document.get("battery_monitor_info") else {
        return;
    };
    if !root.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
        return;
    }

    let frames = root
        .get("frames")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let signals = root
        .get("signals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut frame_map = HashMap::new();
    for frame in &frames {
        let key = object_string(frame, "frame_key");
        if key.is_empty() {
            errors.push("锂电监控存在空 frame_key".to_string());
            continue;
        }
        frame_map.insert(key, frame.clone());
    }

    let mut existing_params = pdo_document
        .pdo_global_param
        .iter()
        .map(|param| param.param_id.clone())
        .collect::<HashSet<_>>();
    for signal in &signals {
        let param_id = object_string(signal, "param_id");
        if param_id.is_empty() {
            errors.push(format!("锂电信号 {} 缺少 param_id", object_string(signal, "signal_key")));
            continue;
        }
        if existing_params.insert(param_id.clone()) {
            pdo_document.pdo_global_param.push(PdoGlobalParam {
                param_id,
                name: object_string(signal, "name"),
                def: object_string(signal, "def"),
                reserved: object_i64(signal, "reserved", 0),
                data_type: object_i64(signal, "type", 0),
                inner: object_i64(signal, "inner", -1),
            });
        }
    }

    let mut recv_by_key = pdo_document
        .pdo_recv
        .iter()
        .enumerate()
        .map(|(index, frame)| ((frame.id, frame.frame_type), index))
        .collect::<HashMap<_, _>>();

    for frame in &frames {
        let id = object_i64(frame, "can_id", 0) as u32;
        let frame_type = object_i64(frame, "type", 0) as u8;
        let key = (id, frame_type);
        recv_by_key.entry(key).or_insert_with(|| {
            let index = pdo_document.pdo_recv.len();
            pdo_document.pdo_recv.push(PdoAdvancedFrame {
                id,
                frame_type,
                desc: object_string(frame, "desc"),
                data: Vec::new(),
            });
            index
        });
    }

    for signal in &signals {
        let frame_key = object_string(signal, "frame_key");
        let Some(frame) = frame_map.get(&frame_key) else {
            errors.push(format!("锂电信号 {} 引用了不存在的帧 {}", object_string(signal, "signal_key"), frame_key));
            continue;
        };
        let key = (object_i64(frame, "can_id", 0) as u32, object_i64(frame, "type", 0) as u8);
        let Some(frame_index) = recv_by_key.get(&key).copied() else {
            continue;
        };
        let param_id = object_string(signal, "param_id");
        if param_id.is_empty() {
            continue;
        }
        if pdo_document.pdo_recv[frame_index]
            .data
            .iter()
            .any(|item| item.param_id == param_id)
        {
            continue;
        }
        pdo_document.pdo_recv[frame_index].data.push(PdoAdvancedSignal {
            pos: object_i64(signal, "pos", 0) as u32,
            len: object_i64(signal, "len", 0) as u32,
            show_type: object_i64(signal, "show_type", 0) as u8,
            handle: object_i64(signal, "handle", 0) as u8,
            handle_param: object_string(signal, "handle_param"),
            param_id,
        });
    }
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
) -> BinaryBuildReport {
    let mut bytes = Vec::new();
    let mut warnings = Vec::new();
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
    let language_entries = collect_language_entries(source_document);

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

    let battery_bytes = build_battery_monitor_bytes(
        source_document,
        bytes.len(),
        &param_indexes,
        &language_entries,
        &mut warnings,
    );
    if let Some((battery_bytes, item_total, frame_total, version)) = battery_bytes {
        description.battery_monitor_base_addr = bytes.len() as isize;
        description.battery_monitor_item_total = item_total;
        description.battery_monitor_frame_total = frame_total;
        description.battery_monitor_version = version;
        bytes.extend(battery_bytes);
    }

    description.sdo_base_addr = bytes.len() as isize;
    let sdo_bytes = build_sdo_bytes(
        source_document.get("sdo_info"),
        bytes.len(),
        &language_entries,
        &mut warnings,
    );
    if sdo_bytes.is_empty() {
        description.sdo_base_addr = -1;
    } else {
        bytes.extend(sdo_bytes);
    }

    description.language_addr = write_language_bytes(
        source_document,
        &language_entries,
        language_count,
        &mut bytes,
    );
    description.file_size = bytes.len();
    description.crc = crc16_ccitt_false(&bytes);

    BinaryBuildReport {
        valid: true,
        file_size: description.file_size,
        crc: description.crc,
        data_description: description,
        bytes,
        warnings,
        errors: Vec::new(),
    }
}

#[derive(Clone)]
struct SdoBinaryNode {
    value: Value,
    parent: Option<usize>,
    bytes: Vec<u8>,
}

fn collect_language_entries(document: &Value) -> Vec<String> {
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
    collect_battery_monitor_language_entries(document, &mut entries);
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

fn collect_battery_monitor_language_entries(document: &Value, entries: &mut Vec<String>) {
    let Some(root) = document.get("battery_monitor_info") else {
        return;
    };
    let Some(items) = root.get("items").and_then(Value::as_array) else {
        return;
    };
    for item in items {
        push_unique(entries, &object_string(item, "name_key"));
        push_unique(entries, &object_string(item, "unit"));
        if let Some(formatter) = item.get("formatter") {
            push_unique(entries, &object_string(formatter, "true_text"));
            push_unique(entries, &object_string(formatter, "false_text"));
        }
        if let Some(validity) = item.get("validity") {
            push_unique(entries, &object_string(validity, "empty_text"));
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
    param_indexes: &HashMap<String, u16>,
    language_entries: &[String],
    warnings: &mut Vec<String>,
) -> Option<(Vec<u8>, usize, usize, usize)> {
    let root = document.get("battery_monitor_info")?;
    if !root.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let frames = root.get("frames").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut items = root.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    if frames.is_empty() || items.is_empty() {
        warnings.push("锂电监控已启用但帧或显示项为空，跳过 battery monitor 段".to_string());
        return None;
    }
    items.sort_by_key(|item| object_i64(item, "order", 0));
    items.retain(|item| item.get("enabled").and_then(Value::as_bool).unwrap_or(true));
    if items.is_empty() {
        warnings.push("锂电监控没有启用的显示项，跳过 battery monitor 段".to_string());
        return None;
    }

    let signals = root.get("signals").and_then(Value::as_array).cloned().unwrap_or_default();
    let signal_map = signals
        .iter()
        .map(|signal| (object_string(signal, "signal_key"), signal.clone()))
        .collect::<HashMap<_, _>>();
    let frame_map = frames
        .iter()
        .enumerate()
        .map(|(index, frame)| (object_string(frame, "frame_key"), index as u16))
        .collect::<HashMap<_, _>>();

    let version = object_i64(root, "version", 1).max(0) as usize;
    let page_size = object_i64(root, "page_size", 4).max(1) as u16;
    let default_timeout = object_i64(root, "default_timeout_ticks", 200).max(0) as u16;
    let header_len = 20usize;
    let frame_table_addr = base_addr + header_len;
    let item_table_addr = frame_table_addr + frames.len() * 8;
    let mut bytes = Vec::new();

    write_u16(&mut bytes, version as u16);
    write_u16(&mut bytes, 0);
    write_u16(&mut bytes, page_size);
    write_u16(&mut bytes, items.len() as u16);
    write_u16(&mut bytes, frames.len() as u16);
    write_u16(&mut bytes, default_timeout);
    write_u32(&mut bytes, frame_table_addr as u32);
    write_u32(&mut bytes, item_table_addr as u32);

    for frame in &frames {
        write_u32(&mut bytes, object_i64(frame, "can_id", 0).max(0) as u32);
        write_u8(&mut bytes, object_i64(frame, "type", 0).max(0) as u8);
        write_u8(&mut bytes, 0);
        write_u16(&mut bytes, object_i64(frame, "timeout_ticks", default_timeout as i64).max(0) as u16);
    }

    for item in &items {
        let signal_key = object_string(item, "signal_key");
        let signal = signal_map.get(&signal_key);
        if signal.is_none() {
            warnings.push(format!("锂电显示项 {} 引用了不存在的信号 {}", object_string(item, "item_key"), signal_key));
        }
        let signal = signal.cloned().unwrap_or(Value::Null);
        let param_id = object_string(&signal, "param_id");
        let formatter = item.get("formatter").unwrap_or(&Value::Null);
        let validity = item.get("validity").unwrap_or(&Value::Null);
        let frame_key = object_string(validity, "frame_key");
        let scale_den = object_i64(formatter, "scale_den", 1);

        write_u16(&mut bytes, param_indexes.get(&param_id).copied().unwrap_or(0));
        write_u16(&mut bytes, object_i64(&signal, "inner", -1).max(0) as u16);
        write_u16(&mut bytes, language_text_index(&object_string(item, "name_key"), language_entries));
        write_u16(&mut bytes, frame_map.get(&frame_key).copied().unwrap_or(0xffff));
        write_u8(&mut bytes, 1);
        write_u8(&mut bytes, object_i64(item, "order", 0).max(0) as u8);
        write_u8(&mut bytes, object_i64(&signal, "type", 0).max(0) as u8);
        write_u8(&mut bytes, battery_formatter_kind(&object_string(formatter, "kind")));
        write_i32(&mut bytes, object_i64(formatter, "offset", 0) as i32);
        write_i32(&mut bytes, object_i64(formatter, "scale_num", 1) as i32);
        write_i32(&mut bytes, if scale_den == 0 { 1 } else { scale_den } as i32);
        write_u8(&mut bytes, object_i64(formatter, "decimals", 0).max(0) as u8);
        write_u8(&mut bytes, object_i64(formatter, "display_base", 10).max(0) as u8);
        write_u16(&mut bytes, language_text_index(&object_string(item, "unit"), language_entries));
        write_u16(&mut bytes, language_text_index(&object_string(formatter, "true_text"), language_entries));
        write_u16(&mut bytes, language_text_index(&object_string(formatter, "false_text"), language_entries));
        write_u16(&mut bytes, language_text_index(&object_string(validity, "empty_text"), language_entries));
        write_u32(&mut bytes, 0);
        write_u16(&mut bytes, 0);
    }

    Some((bytes, items.len(), frames.len(), version))
}

fn battery_formatter_kind(kind: &str) -> u8 {
    match kind {
        "bool_text" => 1,
        "hex" => 2,
        "packed_time_0p1h" => 3,
        _ => 0,
    }
}

fn language_text_index(value: &str, entries: &[String]) -> u16 {
    entries.iter().position(|item| item == value).unwrap_or(0) as u16
}

fn build_sdo_bytes(
    value: Option<&Value>,
    base_addr: usize,
    language_entries: &[String],
    warnings: &mut Vec<String>,
) -> Vec<u8> {
    let Some(root) = value else {
        warnings.push("缺少 sdo_info，跳过 SDO 菜单段打包".to_string());
        return Vec::new();
    };
    let mut nodes = Vec::new();
    flatten_sdo_children(root, None, &mut nodes, language_entries, warnings);
    let mut result_nodes = Vec::new();
    let mut root_bytes = menu_item_bytes(root, language_entries, 1, 0);
    result_nodes.push(SdoBinaryNode {
        value: root.clone(),
        parent: None,
        bytes: root_bytes.clone(),
    });
    let mut level = vec![None];
    let mut sdo_offset = 40usize;
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
    language_entries: &[String],
    warnings: &mut Vec<String>,
) {
    let Some(children) = value.get("children").and_then(Value::as_array) else {
        return;
    };
    for child in children {
        let index = nodes.len();
        let bytes = if object_i64(child, "type", 0) == 1 {
            menu_sdo_bytes(child, language_entries, warnings)
        } else {
            menu_item_bytes(
                child,
                language_entries,
                object_i64(child, "user_auth", 0) as u16,
                object_i64(child, "type", 0) as u16,
            )
        };
        nodes.push(SdoBinaryNode {
            value: child.clone(),
            parent,
            bytes,
        });
        flatten_sdo_children(child, Some(index), nodes, language_entries, warnings);
    }
}

fn menu_item_bytes(
    value: &Value,
    language_entries: &[String],
    user_auth: u16,
    ui_type: u16,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_u16(&mut bytes, menu_control(0, user_auth, ui_type));
    write_u16(&mut bytes, language_index(value, language_entries));
    write_u32(&mut bytes, 0);
    write_u32(&mut bytes, 0);
    bytes.extend([0xff; 28]);
    bytes
}

fn menu_sdo_bytes(
    value: &Value,
    language_entries: &[String],
    warnings: &mut Vec<String>,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_u16(
        &mut bytes,
        menu_control(1, object_i64(value, "user_auth", 0) as u16, 1),
    );
    write_u16(&mut bytes, language_index(value, language_entries));
    write_u16(&mut bytes, 0xffff);
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
    bytes[4..8].copy_from_slice(&children_addr.to_le_bytes());
    bytes[8..12].copy_from_slice(&total.to_le_bytes());
}

fn menu_control(data_type: u16, user_auth: u16, ui_type: u16) -> u16 {
    (data_type & 0x0f) | ((user_auth & 0x07) << 4) | ((ui_type & 0x01ff) << 7)
}

fn language_index(value: &Value, entries: &[String]) -> u16 {
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    entries.iter().position(|item| item == name).unwrap_or(0) as u16
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
                .unwrap_or_default();
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
            let destination = join_path(export_root, &relative_destination);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_language_entries_includes_language_name_prefix() {
        let document = json!({
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
        });

        assert_eq!(
            collect_language_entries(&document),
            vec!["中文", "English", "参数A", "菜单根", "参数B", ""]
        );
    }

    #[test]
    fn collect_language_entries_deduplicates_sdo_names_against_list_inner() {
        let document = json!({
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
        });

        assert_eq!(
            collect_language_entries(&document),
            vec!["中文", "English", "参数A", "参数B", ""]
        );
    }

    #[test]
    fn collect_language_entries_appends_empty_string_unconditionally() {
        let document = json!({
            "language_info": {
                "list_code_language": ["zh"],
                "list_inner": ["", "中文"]
            },
            "sdo_info": {
                "name": "菜单根",
                "children": []
            }
        });

        assert_eq!(
            collect_language_entries(&document),
            vec!["", "中文", "菜单根", ""]
        );
    }

    #[test]
    fn sdo_name_index_accounts_for_language_prefix() {
        let document = json!({
            "language_info": {
                "list_code_language": ["zh", "en"],
                "list_inner": ["中文", "English", "参数A"]
            },
            "sdo_info": {
                "name": "菜单根",
                "children": []
            }
        });
        let entries = collect_language_entries(&document);
        let bytes = menu_item_bytes(document.get("sdo_info").unwrap(), &entries, 1, 0);

        assert_eq!(u16::from_le_bytes([bytes[2], bytes[3]]), 3);
    }
}
