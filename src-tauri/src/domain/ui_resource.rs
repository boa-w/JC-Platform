//! UI 资源领域模型。
//!
//! 管理屏幕上的 UI 元素（logo、主页面控件），每种资源有三种显示模式：
//! - **Show**：单张静态图片
//! - **List**：多张图片列表（如多语言切换图片）
//! - **Anim**：帧动画（按 base_name + 序号规则生成文件名）
//!
//! 资源位置由 `x, y, w, h` 定义，`dest` 指定导出时的目标标识。

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// UI 资源描述 —— 屏幕上一个可显示的元素。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResource {
    pub key: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub handle: UiResourceHandle,
    pub default_option: usize,
    pub dest: Vec<String>,
    pub options: Vec<ResourceOption>,
    pub pdo_param_index: Option<i64>,
}

/// UI 资源显示模式。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UiResourceHandle {
    Show,
    List,
    Anim,
    Unknown,
}

/// 资源选项 —— 一组图片源文件及其帧数和格式。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceOption {
    pub sources: Vec<String>,
    pub frame_count: usize,
    pub format: Option<String>,
}

/// UI 资源解析报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResourceParseReport {
    pub valid: bool,
    pub logo: Option<UiResource>,
    pub main_items: Vec<UiResource>,
    pub errors: Vec<String>,
}

/// UI 资源更新请求 —— 修改位置、大小和默认选项。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResourceUpdateRequest {
    pub document: Value,
    pub key: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub default_option: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResourceUpdateReport {
    pub valid: bool,
    pub document: Value,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResourceOptionAddRequest {
    pub document: Value,
    pub key: String,
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiResourceOptionRemoveRequest {
    pub document: Value,
    pub key: String,
    pub option_index: usize,
}

/// 更新指定 UI 资源的位置、大小和默认选项索引。
pub fn update_ui_resource(request: UiResourceUpdateRequest) -> UiResourceUpdateReport {
    let mut document = request.document;
    let mut errors = Vec::new();
    let Some(target) = find_resource_object_mut(&mut document, &request.key) else {
        errors.push(format!("未找到 UI 资源：{}", request.key));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    };

    target.insert("x".to_string(), Value::from(request.x));
    target.insert("y".to_string(), Value::from(request.y));
    target.insert("w".to_string(), Value::from(request.width));
    target.insert("h".to_string(), Value::from(request.height));
    target.insert(
        "default_option".to_string(),
        Value::from(request.default_option),
    );

    UiResourceUpdateReport {
        valid: true,
        document,
        errors,
    }
}

/// 为指定 UI 资源新增选项（Show 模式追加字符串，List 模式追加列表对象）。
pub fn add_ui_resource_option(request: UiResourceOptionAddRequest) -> UiResourceUpdateReport {
    let mut document = request.document;
    let mut errors = Vec::new();
    let Some(target) = find_resource_object_mut(&mut document, &request.key) else {
        errors.push(format!("未找到 UI 资源：{}", request.key));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    };
    let handle = target
        .get("handle")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let option = target
        .entry("option".to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(options) = option.as_array_mut() else {
        errors.push(format!("UI 资源 {} option 必须是数组", request.key));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    };

    match handle.as_str() {
        "show" => {
            for source in request.sources {
                options.push(Value::String(source));
            }
        }
        "list" => {
            options.push(Value::Object(Map::from_iter([(
                "list".to_string(),
                Value::Array(request.sources.into_iter().map(Value::String).collect()),
            )])));
        }
        _ => errors.push(format!(
            "UI 资源 {} 暂不支持新增 {} 选项",
            request.key, handle
        )),
    }

    UiResourceUpdateReport {
        valid: errors.is_empty(),
        document,
        errors,
    }
}

/// 移除指定 UI 资源的选项，并在必要时重置 default_option。
pub fn remove_ui_resource_option(request: UiResourceOptionRemoveRequest) -> UiResourceUpdateReport {
    let mut document = request.document;
    let mut errors = Vec::new();
    let Some(target) = find_resource_object_mut(&mut document, &request.key) else {
        errors.push(format!("未找到 UI 资源：{}", request.key));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    };
    let default_option = target
        .get("default_option")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let Some(options) = target.get_mut("option").and_then(Value::as_array_mut) else {
        errors.push(format!("UI 资源 {} option 必须是数组", request.key));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    };
    if request.option_index >= options.len() {
        errors.push(format!(
            "UI 资源 {} 选项索引越界：{}",
            request.key, request.option_index
        ));
        return UiResourceUpdateReport {
            valid: false,
            document,
            errors,
        };
    }
    options.remove(request.option_index);
    let should_reset_default = options.is_empty()
        || default_option >= options.len()
        || default_option == request.option_index;
    if should_reset_default {
        target.insert("default_option".to_string(), Value::from(0));
    }

    UiResourceUpdateReport {
        valid: true,
        document,
        errors,
    }
}

/// 解析项目 JSON 中的 `ui_info` 段落，提取 logo 和主页面资源列表。
///
/// `project_path` 用于解析图片的相对路径。
pub fn parse_ui_info(project_path: Option<&str>, document: &Value) -> UiResourceParseReport {
    let mut errors = Vec::new();
    let project_dir = resolve_project_dir(project_path, document);
    let Some(ui_info) = document.get("ui_info").and_then(Value::as_object) else {
        return UiResourceParseReport {
            valid: false,
            logo: None,
            main_items: Vec::new(),
            errors: vec!["ui_info 必须是对象".to_string()],
        };
    };

    let logo = ui_info
        .get("logo")
        .and_then(|value| parse_resource("logo", value, project_dir.as_deref(), &mut errors));
    let main_items = ui_info
        .get("main")
        .and_then(|main| main.get("item"))
        .and_then(Value::as_object)
        .map(|items| {
            items
                .iter()
                .filter_map(|(key, value)| {
                    parse_resource(key, value, project_dir.as_deref(), &mut errors)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            errors.push("ui_info.main.item 必须是对象".to_string());
            Vec::new()
        });

    UiResourceParseReport {
        valid: errors.is_empty(),
        logo,
        main_items,
        errors,
    }
}

fn find_resource_object_mut<'a>(
    document: &'a mut Value,
    key: &str,
) -> Option<&'a mut Map<String, Value>> {
    if key == "logo" {
        return document
            .get_mut("ui_info")?
            .get_mut("logo")?
            .as_object_mut();
    }
    document
        .get_mut("ui_info")?
        .get_mut("main")?
        .get_mut("item")?
        .get_mut(key)?
        .as_object_mut()
}

fn parse_resource(
    key: &str,
    value: &Value,
    project_dir: Option<&Path>,
    errors: &mut Vec<String>,
) -> Option<UiResource> {
    let Some(object) = value.as_object() else {
        errors.push(format!("UI 资源 {} 必须是对象", key));
        return None;
    };
    let handle_text = object
        .get("handle")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let handle = match handle_text {
        "show" => UiResourceHandle::Show,
        "list" => UiResourceHandle::List,
        "anim" => UiResourceHandle::Anim,
        _ => {
            errors.push(format!("UI 资源 {} handle 无效：{}", key, handle_text));
            UiResourceHandle::Unknown
        }
    };
    let options_value = object
        .get("option")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut default_option = object
        .get("default_option")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    if default_option < 0 {
        default_option += options_value.len() as i64;
    }
    if default_option < 0 || default_option as usize >= options_value.len().max(1) {
        default_option = 0;
    }

    let options = options_value
        .iter()
        .enumerate()
        .map(|(index, option)| parse_option(key, index, &handle, option, project_dir, errors))
        .collect::<Vec<_>>();

    Some(UiResource {
        key: key.to_string(),
        name: object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(key)
            .to_string(),
        x: object.get("x").and_then(Value::as_i64).unwrap_or(0) as i32,
        y: object.get("y").and_then(Value::as_i64).unwrap_or(0) as i32,
        width: object.get("w").and_then(Value::as_u64).unwrap_or(0) as u32,
        height: object.get("h").and_then(Value::as_u64).unwrap_or(0) as u32,
        handle,
        default_option: default_option as usize,
        dest: dest_list(object.get("dest")),
        options,
        pdo_param_index: object.get("pdo_param_index").and_then(Value::as_i64),
    })
}

fn parse_option(
    key: &str,
    index: usize,
    handle: &UiResourceHandle,
    value: &Value,
    project_dir: Option<&Path>,
    errors: &mut Vec<String>,
) -> ResourceOption {
    match handle {
        UiResourceHandle::Show => ResourceOption {
            sources: value
                .as_str()
                .map(|item| vec![resolve_path(project_dir, item)])
                .unwrap_or_default(),
            frame_count: 1,
            format: value.as_str().and_then(extension_from_path),
        },
        UiResourceHandle::List => {
            let sources = value
                .get("list")
                .map(list_sources)
                .unwrap_or_default()
                .into_iter()
                .map(|item| resolve_path(project_dir, &item))
                .collect::<Vec<_>>();
            ResourceOption {
                frame_count: sources.len(),
                format: sources.first().and_then(|item| extension_from_path(item)),
                sources,
            }
        }
        UiResourceHandle::Anim => parse_anim_option(project_dir, value, errors, key, index),
        UiResourceHandle::Unknown => ResourceOption {
            sources: Vec::new(),
            frame_count: 0,
            format: None,
        },
    }
}

/// 解析动画选项 —— 根据 base_name、start_index、total 生成帧文件路径序列。
fn parse_anim_option(
    project_dir: Option<&Path>,
    value: &Value,
    errors: &mut Vec<String>,
    key: &str,
    index: usize,
) -> ResourceOption {
    let Some(object) = value.as_object() else {
        errors.push(format!("UI 动画资源 {} 第 {} 项必须是对象", key, index + 1));
        return ResourceOption {
            sources: Vec::new(),
            frame_count: 0,
            format: None,
        };
    };
    let total = object.get("total").and_then(Value::as_u64).unwrap_or(0) as usize;
    let reserved = object.get("reserved").and_then(Value::as_u64).unwrap_or(0) as usize;
    let format = object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("png")
        .to_string();
    let base_names = list_sources(object.get("base_name").unwrap_or(&Value::Null));
    let start_indexes = object
        .get("start_index")
        .map(number_list)
        .unwrap_or_default();
    let mut sources = Vec::new();

    for (base_index, base_name) in base_names.iter().enumerate() {
        let start_index = start_indexes
            .get(base_index)
            .copied()
            .unwrap_or_else(|| start_indexes.first().copied().unwrap_or(0));
        for frame in 0..total {
            let number = start_index + frame as i64;
            let file_name = format!(
                "{}{:0width$}.{}",
                base_name,
                number,
                format,
                width = reserved
            );
            sources.push(resolve_path(project_dir, &file_name));
        }
    }

    ResourceOption {
        frame_count: sources.len(),
        format: Some(format),
        sources,
    }
}

fn dest_list(value: Option<&Value>) -> Vec<String> {
    value.map(list_sources).unwrap_or_default()
}

fn list_sources(value: &Value) -> Vec<String> {
    if let Some(items) = value.as_array() {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect()
    } else {
        value
            .as_str()
            .map(|item| vec![item.to_string()])
            .unwrap_or_default()
    }
}

fn number_list(value: &Value) -> Vec<i64> {
    if let Some(items) = value.as_array() {
        items.iter().filter_map(Value::as_i64).collect()
    } else {
        value.as_i64().map(|item| vec![item]).unwrap_or_default()
    }
}

fn resolve_project_dir(project_path: Option<&str>, document: &Value) -> Option<PathBuf> {
    if let Some(path) = project_path {
        let path = Path::new(path);
        if path.is_absolute() {
            return path.parent().map(Path::to_path_buf);
        }
        if path.exists() {
            return path.parent().map(Path::to_path_buf);
        }
    }

    document
        .get("project")
        .and_then(|project| project.get("base_path"))
        .and_then(Value::as_str)
        .map(PathBuf::from)
}

fn resolve_path(project_dir: Option<&Path>, path: &str) -> String {
    let path_ref = Path::new(path);
    if path_ref.is_absolute() {
        return path_ref.to_string_lossy().to_string();
    }
    project_dir
        .map(|dir| dir.join(path_ref))
        .unwrap_or_else(|| PathBuf::from(path_ref))
        .to_string_lossy()
        .to_string()
}

fn extension_from_path(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|item| item.to_str())
        .map(str::to_string)
}
