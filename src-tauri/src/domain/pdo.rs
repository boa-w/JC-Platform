//! PDO（Process Data Object）领域模型。
//!
//! 支持两种格式：
//! - **简单模式**（`pdo_simple_send_recv`）：表格导入/导出，面向调试人员
//! - **高级模式**（`pdo_global_param` / `pdo_condition` / `pdo_recv` / `pdo_send`）：JSON 直接编辑，面向开发人员
//!
//! 两种模式最终都转换为 [`PdoAdvancedDocument`] 用于二进制打包。

use crate::infrastructure::csv_excel::{
    validate_headers, TableDocument, TableValidationReport, PDO_SIMPLE_HEADERS,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// CAN 帧类型：标准帧（11-bit ID）/ 扩展帧（29-bit ID）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CanFrameType {
    Standard,
    Extended,
}

/// PDO 方向：接收（设备→控制器）/ 发送（控制器→设备）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PdoDirection {
    Receive,
    Send,
}

/// 简单模式下的 PDO 帧描述。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoFrame {
    pub direction: PdoDirection,
    pub id: u32,
    pub frame_type: CanFrameType,
    pub description: String,
    pub signals: Vec<PdoSignal>,
}

/// PDO 帧内的信号定义：绑定的系统变量及其在帧中的位置。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoSignal {
    pub system_variable: String,
    pub start_bit: u16,
    pub bit_length: u16,
    pub read_mode: PdoReadMode,
}

/// 取数方式：按字节 / 按字节+bit / 按 bit。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PdoReadMode {
    Byte,
    ByteBit,
    Bit,
}

/// 简单模式 PDO 表格导入结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoSimpleImportReport {
    pub valid: bool,
    pub table: TableValidationReport,
    pub errors: Vec<String>,
    pub document: Option<Value>,
}

/// 简单模式菜单选项：接收表 / 发送表。
const PDO_MENUS: &[&str] = &["接收表", "发送表"];
const PDO_ID_TYPES: &[&str] = &["标准帧", "扩展帧"];
const PDO_READ_MODES: &[&str] = &["按照字节取数据", "按照字节+bit位取数据", "按照bit位取数据"];

/// 高级模式 PDO 文档 —— 二进制打包的直接输入。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoAdvancedDocument {
    pub pdo_global_param: Vec<PdoGlobalParam>,
    pub pdo_condition: Vec<PdoCondition>,
    pub pdo_recv: Vec<PdoAdvancedFrame>,
    pub pdo_send: Vec<PdoAdvancedFrame>,
}

/// 全局参数定义 —— 可被 PDO 帧信号引用，也可参与条件运算。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoGlobalParam {
    pub param_id: String,
    pub name: String,
    pub def: String,
    pub reserved: i64,
    #[serde(rename = "type")]
    pub data_type: i64,
    pub inner: i64,
}

/// 条件表达式 —— 基于多个输入参数计算输出参数值。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoCondition {
    pub param_id: String,
    pub process: i64,
    pub data: Vec<PdoConditionInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoConditionInput {
    pub param_id: String,
}

/// 高级模式 PDO 帧定义。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoAdvancedFrame {
    pub id: u32,
    #[serde(rename = "type")]
    pub frame_type: u8,
    pub desc: String,
    pub data: Vec<PdoAdvancedSignal>,
}

/// 高级模式帧内信号 —— 通过 `param_id` 引用全局参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoAdvancedSignal {
    pub pos: u32,
    pub len: u32,
    pub show_type: u8,
    pub handle: u8,
    pub handle_param: String,
    pub param_id: String,
}

/// 高级模式 PDO 解析报告。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoAdvancedParseReport {
    pub valid: bool,
    pub document: Option<PdoAdvancedDocument>,
    pub errors: Vec<String>,
}

/// 解析高级模式 PDO JSON 文档。
///
/// 依次解析全局参数 → 条件表达式 → 接收帧 → 发送帧，
/// 所有 `param_id` 引用都会校验是否在全局参数中存在。
pub fn parse_pdo_advanced_document(document: &Value) -> PdoAdvancedParseReport {
    let mut errors = Vec::new();
    let pdo_global_param = parse_global_params(document.get("pdo_global_param"), &mut errors);
    let param_ids = pdo_global_param
        .iter()
        .map(|item| item.param_id.clone())
        .collect::<HashSet<_>>();
    let pdo_condition = parse_conditions(document.get("pdo_condition"), &param_ids, &mut errors);
    let pdo_recv = parse_advanced_frames(
        "pdo_recv",
        document.get("pdo_recv"),
        &param_ids,
        &mut errors,
    );
    let pdo_send = parse_advanced_frames(
        "pdo_send",
        document.get("pdo_send"),
        &param_ids,
        &mut errors,
    );

    let valid = errors.is_empty();
    let document = if valid {
        Some(PdoAdvancedDocument {
            pdo_global_param,
            pdo_condition,
            pdo_recv,
            pdo_send,
        })
    } else {
        None
    };

    PdoAdvancedParseReport {
        valid,
        document,
        errors,
    }
}

/// 将简单模式 PDO JSON 转换为表格文档（用于导出 CSV/Excel）。
pub fn pdo_simple_document_to_table(document: &Value) -> TableDocument {
    let mut rows = Vec::new();
    append_pdo_simple_rows("接收表", document.get("pdo_recv"), &mut rows);
    append_pdo_simple_rows("发送表", document.get("pdo_send"), &mut rows);

    TableDocument {
        headers: PDO_SIMPLE_HEADERS
            .iter()
            .map(|item| (*item).to_string())
            .collect(),
        rows,
    }
}

/// 将表格文档解析为简单模式 PDO JSON。
///
/// 流程：校验表头 → 逐行解析为 `PdoSimpleRow` → 构建 JSON 文档。
pub fn parse_pdo_simple_table(document: TableDocument) -> PdoSimpleImportReport {
    let table = validate_headers(&document.headers, PDO_SIMPLE_HEADERS);
    let mut errors = table.errors.clone();
    let mut rows = Vec::new();

    if table.valid {
        for (index, row) in document.rows.iter().enumerate() {
            match PdoSimpleRow::from_cells(index + 1, row) {
                Ok(row) => rows.push(row),
                Err(row_errors) => errors.extend(row_errors),
            }
        }
    }

    let valid = errors.is_empty();
    let document = if valid {
        Some(build_pdo_simple_document(&rows))
    } else {
        None
    };

    PdoSimpleImportReport {
        valid,
        table,
        errors,
        document,
    }
}

fn append_pdo_simple_rows(menu: &str, frames: Option<&Value>, rows: &mut Vec<Vec<String>>) {
    let Some(frames) = frames.and_then(Value::as_array) else {
        return;
    };

    for frame in frames {
        let frame_id = frame
            .get("id")
            .and_then(Value::as_u64)
            .unwrap_or(0)
            .to_string();
        let frame_type = PDO_ID_TYPES
            .get(frame.get("type").and_then(Value::as_u64).unwrap_or(0) as usize)
            .unwrap_or(&PDO_ID_TYPES[0])
            .to_string();
        let desc = frame
            .get("desc")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let Some(data) = frame.get("data").and_then(Value::as_array) else {
            rows.push(vec![
                menu.to_string(),
                frame_id,
                frame_type,
                desc,
                String::new(),
                PDO_READ_MODES[0].to_string(),
                String::new(),
                String::new(),
            ]);
            continue;
        };

        for signal in data {
            let show_type = signal.get("show_type").and_then(Value::as_u64).unwrap_or(0) as usize;
            let mode = PDO_READ_MODES
                .get(show_type)
                .unwrap_or(&PDO_READ_MODES[0])
                .to_string();
            let pos = signal.get("pos").and_then(Value::as_u64).unwrap_or(0) as u32;
            let len = signal.get("len").and_then(Value::as_u64).unwrap_or(0) as u32;
            let (position, length) = format_position_length(show_type, pos, len);
            rows.push(vec![
                menu.to_string(),
                frame_id.clone(),
                frame_type.clone(),
                desc.clone(),
                signal
                    .get("pdo_param_name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                mode,
                position,
                length,
            ]);
        }
    }
}

/// 根据取数方式将内部 pos/len 格式化为可读的表格显示值。
fn format_position_length(show_type: usize, pos: u32, len: u32) -> (String, String) {
    match show_type {
        1 => (
            format!("byte{} bit{}", pos / 8, pos % 8),
            format!("{}个bits", len),
        ),
        2 => (format!("bit{}", pos), format!("{}个bits", len)),
        _ => (format!("byte{}", pos / 8), format!("{}个bytes", len / 8)),
    }
}

fn parse_global_params(value: Option<&Value>, errors: &mut Vec<String>) -> Vec<PdoGlobalParam> {
    let Some(items) = value.and_then(Value::as_array) else {
        errors.push("pdo_global_param 必须是数组".to_string());
        return Vec::new();
    };
    let mut names = HashSet::new();
    let mut ids = HashSet::new();
    items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let line = index + 1;
            let Some(object) = item.as_object() else {
                errors.push(format!("pdo_global_param 第 {} 项必须是对象", line));
                return None;
            };
            let param = PdoGlobalParam {
                param_id: object_id(object.get("param_id")),
                name: object_string(object.get("name")),
                def: object_string(object.get("def")),
                reserved: object_i64(object.get("reserved"), 0),
                data_type: object_i64(object.get("type"), -1),
                inner: object_i64(object.get("inner"), -1),
            };
            if param.param_id.is_empty() {
                errors.push(format!("pdo_global_param 第 {} 项 param_id 无效", line));
            }
            if param.name.is_empty() {
                errors.push(format!("pdo_global_param 第 {} 项 name 为空", line));
            } else if !names.insert(param.name.clone()) {
                errors.push(format!("pdo_global_param 名称重复：{}", param.name));
            }
            if !ids.insert(param.param_id.clone()) {
                errors.push(format!(
                    "pdo_global_param param_id 重复：{}",
                    param.param_id
                ));
            }
            if param.data_type < 0 {
                errors.push(format!("pdo_global_param 第 {} 项 type 无效", line));
            }
            Some(param)
        })
        .collect()
}

fn parse_conditions(
    value: Option<&Value>,
    param_ids: &HashSet<String>,
    errors: &mut Vec<String>,
) -> Vec<PdoCondition> {
    let Some(items) = value.and_then(Value::as_array) else {
        errors.push("pdo_condition 必须是数组".to_string());
        return Vec::new();
    };
    let mut output_ids = HashSet::new();
    items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let line = index + 1;
            let Some(object) = item.as_object() else {
                errors.push(format!("pdo_condition 第 {} 项必须是对象", line));
                return None;
            };
            let param_id = object_id(object.get("param_id"));
            if !param_ids.contains(&param_id) {
                errors.push(format!(
                    "pdo_condition 第 {} 项 param_id 不存在：{}",
                    line, param_id
                ));
            }
            if !output_ids.insert(param_id.clone()) {
                errors.push(format!("pdo_condition 输出变量重复：{}", param_id));
            }
            let data = object
                .get("data")
                .and_then(Value::as_array)
                .map(|children| {
                    children
                        .iter()
                        .enumerate()
                        .filter_map(|(child_index, child)| {
                            let Some(child_object) = child.as_object() else {
                                errors.push(format!(
                                    "pdo_condition 第 {} 项第 {} 个输入必须是对象",
                                    line,
                                    child_index + 1
                                ));
                                return None;
                            };
                            let child_param_id = object_id(child_object.get("param_id"));
                            if child_param_id == param_id {
                                errors.push(format!(
                                    "pdo_condition 第 {} 项输入输出变量不能相同：{}",
                                    line, param_id
                                ));
                            }
                            if !param_ids.contains(&child_param_id) {
                                errors.push(format!(
                                    "pdo_condition 第 {} 项输入 param_id 不存在：{}",
                                    line, child_param_id
                                ));
                            }
                            Some(PdoConditionInput {
                                param_id: child_param_id,
                            })
                        })
                        .collect()
                })
                .unwrap_or_else(|| {
                    errors.push(format!("pdo_condition 第 {} 项 data 必须是数组", line));
                    Vec::new()
                });

            Some(PdoCondition {
                param_id,
                process: object_i64(object.get("process"), 0),
                data,
            })
        })
        .collect()
}

fn parse_advanced_frames(
    section: &str,
    value: Option<&Value>,
    param_ids: &HashSet<String>,
    errors: &mut Vec<String>,
) -> Vec<PdoAdvancedFrame> {
    let Some(items) = value.and_then(Value::as_array) else {
        errors.push(format!("{} 必须是数组", section));
        return Vec::new();
    };
    items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let line = index + 1;
            let Some(object) = item.as_object() else {
                errors.push(format!("{} 第 {} 项必须是对象", section, line));
                return None;
            };
            let frame_type = object_i64(object.get("type"), -1);
            if !(0..=1).contains(&frame_type) {
                errors.push(format!("{} 第 {} 项 type 无效", section, line));
            }
            let data = object
                .get("data")
                .and_then(Value::as_array)
                .map(|children| {
                    children
                        .iter()
                        .enumerate()
                        .filter_map(|(child_index, child)| {
                            parse_advanced_signal(
                                section,
                                line,
                                child_index + 1,
                                child,
                                param_ids,
                                errors,
                            )
                        })
                        .collect()
                })
                .unwrap_or_else(|| {
                    errors.push(format!("{} 第 {} 项 data 必须是数组", section, line));
                    Vec::new()
                });

            Some(PdoAdvancedFrame {
                id: object_u32(object.get("id"), 0),
                frame_type: frame_type.max(0) as u8,
                desc: object_string(object.get("desc")),
                data,
            })
        })
        .collect()
}

fn parse_advanced_signal(
    section: &str,
    frame_line: usize,
    signal_line: usize,
    value: &Value,
    param_ids: &HashSet<String>,
    errors: &mut Vec<String>,
) -> Option<PdoAdvancedSignal> {
    let Some(object) = value.as_object() else {
        errors.push(format!(
            "{} 第 {} 项第 {} 个 data 必须是对象",
            section, frame_line, signal_line
        ));
        return None;
    };
    let param_id = object_id(object.get("param_id"));
    if !param_ids.contains(&param_id) {
        errors.push(format!(
            "{} 第 {} 项第 {} 个 data param_id 不存在：{}",
            section, frame_line, signal_line, param_id
        ));
    }
    let handle = object_i64(object.get("handle"), -1);
    if handle < 0 {
        errors.push(format!(
            "{} 第 {} 项第 {} 个 data handle 无效",
            section, frame_line, signal_line
        ));
    }

    Some(PdoAdvancedSignal {
        pos: object_u32(object.get("pos"), 0),
        len: object_u32(object.get("len"), 0),
        show_type: object_u32(object.get("show_type"), 0) as u8,
        handle: handle.max(0) as u8,
        handle_param: object_string(object.get("handle_param")),
        param_id,
    })
}

fn object_string(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn object_i64(value: Option<&Value>, default: i64) -> i64 {
    value.and_then(Value::as_i64).unwrap_or(default)
}

fn object_id(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(item)) => item.trim().to_string(),
        Some(Value::Number(item)) => item.to_string(),
        _ => String::new(),
    }
}

fn object_u32(value: Option<&Value>, default: u32) -> u32 {
    value
        .and_then(Value::as_u64)
        .map(|item| item as u32)
        .unwrap_or(default)
}

/// 将解析后的简单模式行数据构建为 JSON 文档。
///
/// 按 `menu + frame_id` 分组，生成 `pdo_recv` 和 `pdo_send` 数组。
fn build_pdo_simple_document(rows: &[PdoSimpleRow]) -> Value {
    let mut grouped: HashMap<String, Vec<&PdoSimpleRow>> = HashMap::new();
    let mut order = Vec::new();

    for row in rows {
        let key = format!("{}->{}", row.menu, row.frame_id);
        if !grouped.contains_key(&key) {
            order.push(key.clone());
        }
        grouped.entry(key).or_default().push(row);
    }

    let mut pdo_recv = Vec::new();
    let mut pdo_send = Vec::new();

    for key in order {
        let rows = grouped.get(&key).cloned().unwrap_or_default();
        let Some(first) = rows.first() else { continue };
        let mut data = Vec::new();

        for row in &rows {
            if row.variable.is_empty() {
                continue;
            }
            let Some((pos, len)) = parse_position_length(&row.mode, &row.position, &row.length)
            else {
                continue;
            };
            data.push(json!({
                "pos": pos,
                "len": len,
                "show_type": mode_index(&row.mode),
                "pdo_param_index": 0,
                "pdo_param_name": row.variable
            }));
        }

        let frame = json!({
            "id": parse_number(&first.frame_id).unwrap_or(0),
            "type": index_of(PDO_ID_TYPES, &first.frame_type).unwrap_or(0),
            "desc": first.description,
            "data": data
        });

        if first.menu == "接收表" {
            pdo_recv.push(frame);
        } else {
            pdo_send.push(frame);
        }
    }

    json!({
        "pdo_send": pdo_send,
        "pdo_recv": pdo_recv
    })
}

/// 将表格中的可读位置/长度字符串解析回内部 pos/len 值（bit 精度）。
fn parse_position_length(mode: &str, position: &str, length: &str) -> Option<(u32, u32)> {
    match mode_index(mode) {
        0 => {
            let pos = parse_prefixed_number(position, "byte")?;
            let len = parse_suffixed_number(length, "个bytes")?;
            Some((pos * 8, len * 8))
        }
        1 => {
            let mut parts = position.split_whitespace();
            let byte = parse_prefixed_number(parts.next()?, "byte")?;
            let bit = parse_prefixed_number(parts.next()?, "bit")?;
            let len = parse_suffixed_number(length, "个bits")?;
            Some((byte * 8 + bit, len))
        }
        2 => {
            let bit = parse_prefixed_number(position, "bit")?;
            let len = parse_suffixed_number(length, "个bits")?;
            Some((bit, len))
        }
        _ => None,
    }
}

fn parse_prefixed_number(value: &str, prefix: &str) -> Option<u32> {
    value.trim().strip_prefix(prefix)?.parse::<u32>().ok()
}

fn parse_suffixed_number(value: &str, suffix: &str) -> Option<u32> {
    value.trim().strip_suffix(suffix)?.parse::<u32>().ok()
}

fn mode_index(value: &str) -> usize {
    index_of(PDO_READ_MODES, value).unwrap_or(0)
}

fn index_of(values: &[&str], value: &str) -> Option<usize> {
    values.iter().position(|item| *item == value)
}

/// 解析十进制或 `0x` 前缀十六进制数字字符串。
fn parse_number(value: &str) -> Option<u32> {
    let value = value.trim();
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .map_or_else(
            || value.parse::<u32>().ok(),
            |hex| u32::from_str_radix(hex, 16).ok(),
        )
}

/// 简单模式表格的单行数据（内部表示）。
#[derive(Debug, Clone)]
struct PdoSimpleRow {
    menu: String,
    frame_id: String,
    frame_type: String,
    description: String,
    variable: String,
    mode: String,
    position: String,
    length: String,
}

impl PdoSimpleRow {
    fn from_cells(line: usize, cells: &[String]) -> Result<Self, Vec<String>> {
        let mut errors = Vec::new();
        if cells.len() < PDO_SIMPLE_HEADERS.len() {
            errors.push(format!("数据长度错误 line:{}", line));
            return Err(errors);
        }

        let row = Self {
            menu: cell(cells, 0),
            frame_id: cell(cells, 1).to_lowercase(),
            frame_type: cell(cells, 2),
            description: cell(cells, 3),
            variable: cell(cells, 4),
            mode: cell(cells, 5),
            position: cell(cells, 6).to_lowercase(),
            length: cell(cells, 7).to_lowercase(),
        };

        row.validate(line, &mut errors);

        if errors.is_empty() {
            Ok(row)
        } else {
            Err(errors)
        }
    }

    fn validate(&self, line: usize, errors: &mut Vec<String>) {
        if index_of(PDO_MENUS, &self.menu).is_none() {
            errors.push(format!("主目录错误 line:{}", line));
        }
        if parse_number(&self.frame_id).is_none() {
            errors.push(format!("帧ID无效 行:{}", line));
        }
        if index_of(PDO_ID_TYPES, &self.frame_type).is_none() {
            errors.push(format!("帧类型错误 line:{}", line));
        }
        if !self.variable.is_empty() {
            if index_of(PDO_READ_MODES, &self.mode).is_none() {
                errors.push(format!("取数方式错误 line:{}", line));
            }
            if parse_position_length(&self.mode, &self.position, &self.length).is_none() {
                errors.push(format!("开始位置或数据长度无效 行:{}", line));
            }
        }
    }
}

fn cell(cells: &[String], index: usize) -> String {
    cells
        .get(index)
        .map(|item| item.trim().to_string())
        .unwrap_or_default()
}
