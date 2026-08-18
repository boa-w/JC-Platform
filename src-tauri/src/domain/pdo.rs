//! PDO（Process Data Object）领域模型。
//!
//! 支持两种交换格式：
//! - **简单模式**（`pdo_simple_send_recv`）：CSV/Excel 导入输入，面向表格维护人员；
//! - **高级模式**（`pdo_global_param` / `pdo_condition` / `pdo_recv` / `pdo_send`）：项目持久化和二进制打包的唯一 PDO 输入。
//!
//! jc002 只允许高级模式进入保存和构建链路。简单模式仍保留独立的导入解析器，
//! 导入完成后必须显式转换为 [`PdoAdvancedDocument`]；jc001 的旧构建兼容路径由
//! 导出模块单独维护，不在本模块和 jc002 之间共享隐式回退。

use crate::domain::signal::normalize_signal_id;
use crate::infrastructure::csv_excel::{
    validate_headers, TableDocument, TableValidationReport, PDO_SIMPLE_HEADERS,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

const COMMON_CAN_PDO_INNER_ABI_JSON: &str =
    include_str!("../../../src/data/common-can-pdo-inner-abi.json");

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
///
/// `name` 是项目配置和语言资源使用的显示元数据；设备二进制只消费
/// `type`、参数槽位和可选的 `inner` 运行时绑定，不会根据 `inner` 反推名称。
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

/// 校验 jc002 使用的下位机内部变量绑定。
///
/// `inner` 是 CommonCanPdoConfig 的固定运行时 ABI，不是可自由编号的上位机
/// 参数索引。`-1` 表示普通参数，其它值必须来自与下位机同步的 ABI 清单。
/// 根级编辑镜像和控制器 Profile 都会校验，但不会校验电池或故障 Profile。
pub fn validate_v2_pdo_inner_bindings(document: &Value) -> Result<(), String> {
    let mut errors = Vec::new();
    validate_inner_bindings_in_params(
        document.get("pdo_global_param"),
        "pdo_global_param",
        &mut errors,
    );

    if let Some(profiles) = document
        .get("protocol_profiles")
        .and_then(|value| value.get("controller_profiles"))
        .and_then(Value::as_array)
    {
        for (index, profile) in profiles.iter().enumerate() {
            let profile_path = format!(
                "protocol_profiles.controller_profiles[{}].protocol.pdo_global_param",
                profile
                    .get("profile_id")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "#"),
            );
            validate_inner_bindings_in_params(
                profile
                    .get("protocol")
                    .and_then(|value| value.get("pdo_global_param")),
                &profile_path,
                &mut errors,
            );
            if profile.is_object() && profile.get("protocol").is_none() {
                errors.push(format!(
                    "protocol_profiles.controller_profiles 第 {} 项缺少 protocol",
                    index + 1
                ));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
}

fn validate_inner_bindings_in_params(value: Option<&Value>, path: &str, errors: &mut Vec<String>) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };
    for (index, item) in items.iter().enumerate() {
        let Some(object) = item.as_object() else {
            continue;
        };
        let Some(raw_inner) = object.get("inner") else {
            continue;
        };
        let Some(inner) = raw_inner.as_i64() else {
            errors.push(format!("{path}[{}].inner 必须是整数", index + 1));
            continue;
        };
        if inner != -1 && !common_can_pdo_inner_variable_ids().contains(&inner) {
            errors.push(format!(
                "{path}[{}].inner={} 不是 {} 支持的内部变量 ID",
                index + 1,
                inner,
                common_can_pdo_inner_abi_version()
            ));
        }
    }
}

fn common_can_pdo_inner_variable_ids() -> &'static [i64] {
    static IDS: OnceLock<Vec<i64>> = OnceLock::new();
    IDS.get_or_init(|| {
        let document: Value = serde_json::from_str(COMMON_CAN_PDO_INNER_ABI_JSON)
            .expect("CommonCanPdo inner ABI catalog must be valid JSON");
        document
            .get("variables")
            .and_then(Value::as_array)
            .expect("CommonCanPdo inner ABI catalog must contain variables[]")
            .iter()
            .filter_map(|item| item.get("id").and_then(Value::as_i64))
            .collect()
    })
}

fn common_can_pdo_inner_abi_version() -> &'static str {
    static VERSION: OnceLock<String> = OnceLock::new();
    VERSION.get_or_init(|| {
        let document: Value = serde_json::from_str(COMMON_CAN_PDO_INNER_ABI_JSON)
            .expect("CommonCanPdo inner ABI catalog must be valid JSON");
        document
            .get("abi_version")
            .and_then(Value::as_str)
            .unwrap_or("common-can-pdo-unknown")
            .to_string()
    })
}

/// 简单 PDO 导入到高级 PDO 的转换报告。
///
/// 简单 PDO 只作为表格交换格式存在，转换成功后项目只保存高级 PDO
/// 四个正式段，不再把简单文档交给导出器做隐式回退。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdoSimpleConversionReport {
    pub valid: bool,
    pub document: Option<PdoAdvancedDocument>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub source_frame_total: usize,
    pub source_signal_total: usize,
    pub generated_param_total: usize,
}

#[derive(Debug, Default)]
struct SimplePdoConversionContext {
    params: Vec<PdoGlobalParam>,
    param_keys: HashMap<String, String>,
    used_ids: HashMap<String, String>,
    errors: Vec<String>,
    warnings: Vec<String>,
    source_frame_total: usize,
    source_signal_total: usize,
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

/// 将表格化简单 PDO 转换为可持久化的高级 PDO 文档。
///
/// 有名称的简单信号以名称生成稳定 `param_id`，并使用 `inner = -1`，
/// 因为表格中的旧 `pdo_param_index` 不足以表达业务变量身份。只有没有
/// 名称的旧条目才按内部索引生成参数，避免导入表格时所有行被错误合并。
pub fn convert_pdo_simple_document(document: &Value) -> PdoSimpleConversionReport {
    let mut context = SimplePdoConversionContext::default();
    let Some(simple) = document.as_object() else {
        return PdoSimpleConversionReport {
            valid: false,
            document: None,
            errors: vec!["简单 PDO 文档必须是对象".to_string()],
            warnings: Vec::new(),
            source_frame_total: 0,
            source_signal_total: 0,
            generated_param_total: 0,
        };
    };

    let pdo_recv = convert_simple_pdo_frames(simple.get("pdo_recv"), "pdo_recv", &mut context);
    let pdo_send = convert_simple_pdo_frames(simple.get("pdo_send"), "pdo_send", &mut context);
    let valid = context.errors.is_empty();
    let generated_param_total = context.params.len();
    let document = valid.then_some(PdoAdvancedDocument {
        pdo_global_param: context.params,
        pdo_condition: Vec::new(),
        pdo_recv,
        pdo_send,
    });

    PdoSimpleConversionReport {
        valid,
        document,
        errors: context.errors,
        warnings: context.warnings,
        source_frame_total: context.source_frame_total,
        source_signal_total: context.source_signal_total,
        generated_param_total,
    }
}

fn convert_simple_pdo_frames(
    value: Option<&Value>,
    section: &str,
    context: &mut SimplePdoConversionContext,
) -> Vec<PdoAdvancedFrame> {
    let Some(frames) = value.and_then(Value::as_array) else {
        context.errors.push(format!("{section} 必须是数组"));
        return Vec::new();
    };

    frames
        .iter()
        .enumerate()
        .filter_map(|(frame_index, value)| {
            let line = frame_index + 1;
            let Some(object) = value.as_object() else {
                context
                    .errors
                    .push(format!("{section} 第 {line} 项必须是对象"));
                return None;
            };
            let Some(id) = object.get("id").and_then(Value::as_u64) else {
                context
                    .errors
                    .push(format!("{section} 第 {line} 项 id 无效"));
                return None;
            };
            let frame_type = object.get("type").and_then(Value::as_i64).unwrap_or(-1);
            if !(0..=1).contains(&frame_type) {
                context
                    .errors
                    .push(format!("{section} 第 {line} 项 type 无效"));
            } else {
                let max_id = if frame_type == 0 { 0x7ff } else { 0x1fff_ffff };
                if id > max_id {
                    context.errors.push(format!(
                        "{section} 第 {line} 项 id 超出{}帧范围：0x{id:X}",
                        if frame_type == 0 { "标准" } else { "扩展" }
                    ));
                }
            }
            if id > u64::from(u32::MAX) {
                context
                    .errors
                    .push(format!("{section} 第 {line} 项 id 超出 u32 范围：{id}"));
            }
            let Some(signals) = object.get("data").and_then(Value::as_array) else {
                context
                    .errors
                    .push(format!("{section} 第 {line} 项 data 必须是数组"));
                return None;
            };

            context.source_frame_total += 1;
            let data = signals
                .iter()
                .enumerate()
                .filter_map(|(signal_index, signal)| {
                    convert_simple_signal(signal, section, line, signal_index + 1, context)
                })
                .collect();

            Some(PdoAdvancedFrame {
                id: id as u32,
                frame_type: frame_type.max(0) as u8,
                desc: object_string(object.get("desc")),
                data,
            })
        })
        .collect()
}

fn convert_simple_signal(
    value: &Value,
    section: &str,
    frame_line: usize,
    signal_line: usize,
    context: &mut SimplePdoConversionContext,
) -> Option<PdoAdvancedSignal> {
    let Some(object) = value.as_object() else {
        context.errors.push(format!(
            "{section} 第 {frame_line} 项第 {signal_line} 个 data 必须是对象"
        ));
        return None;
    };
    let pos = object_u32(object.get("pos"), 0);
    let len = object_u32(object.get("len"), 0);
    if len == 0 || pos.saturating_add(len) > 64 {
        context.errors.push(format!(
            "{section} 第 {frame_line} 项第 {signal_line} 个 data 位范围无效：pos={pos}, len={len}"
        ));
    }
    let show_type = object_u32(object.get("show_type"), 0);
    if show_type > 2 {
        context.errors.push(format!(
            "{section} 第 {frame_line} 项第 {signal_line} 个 data show_type 无效"
        ));
    }

    let name = object_string(object.get("pdo_param_name"));
    let inner = object_i64(object.get("pdo_param_index"), -1);
    if name.trim().is_empty() && inner < 0 {
        context.errors.push(format!(
            "{section} 第 {frame_line} 项第 {signal_line} 个 data 缺少 pdo_param_index"
        ));
    }
    let param_id = ensure_simple_param(&name, inner, context);
    context.source_signal_total += 1;

    Some(PdoAdvancedSignal {
        pos,
        len,
        show_type: show_type.min(2) as u8,
        handle: 0,
        handle_param: String::new(),
        param_id,
    })
}

fn ensure_simple_param(name: &str, inner: i64, context: &mut SimplePdoConversionContext) -> String {
    let name = name.trim();
    let (key, display_name, inner, data_type, candidate) = if name.is_empty() {
        let inner = inner.max(0);
        (
            format!("inner:{inner}"),
            format!("内部变量 {inner}"),
            inner,
            simple_inner_data_type(inner),
            format!("INNER_{inner:04X}"),
        )
    } else {
        let candidate = normalize_signal_id(name);
        let candidate = if candidate == "UNNAMED_SIGNAL" {
            format!("PDO_{:08X}", stable_name_hash(name))
        } else {
            candidate
        };
        (format!("name:{name}"), name.to_string(), -1, 0, candidate)
    };

    if let Some(param_id) = context.param_keys.get(&key) {
        return param_id.clone();
    }

    let param_id = unique_simple_param_id(&candidate, name, &context.used_ids);
    context.param_keys.insert(key, param_id.clone());
    context.used_ids.insert(
        param_id.clone(),
        if name.is_empty() {
            format!("inner:{inner}")
        } else {
            name.to_string()
        },
    );
    context.params.push(PdoGlobalParam {
        param_id: param_id.clone(),
        name: display_name,
        def: "0".to_string(),
        reserved: 0,
        data_type,
        inner,
    });
    param_id
}

fn unique_simple_param_id(
    candidate: &str,
    source_name: &str,
    used_ids: &HashMap<String, String>,
) -> String {
    let source_key = if source_name.is_empty() {
        candidate.to_string()
    } else {
        source_name.to_string()
    };
    if match used_ids.get(candidate) {
        None => true,
        Some(current) => current == &source_key,
    } {
        return candidate.to_string();
    }

    let base = format!("{candidate}_{:08X}", stable_name_hash(&source_key));
    if !used_ids.contains_key(&base) {
        return base;
    }
    let mut suffix = 2;
    loop {
        let next = format!("{base}_{suffix}");
        if !used_ids.contains_key(&next) {
            return next;
        }
        suffix += 1;
    }
}

fn stable_name_hash(value: &str) -> u32 {
    value.as_bytes().iter().fold(0x811C9DC5_u32, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(0x01000193)
    })
}

fn simple_inner_data_type(inner: i64) -> i64 {
    match inner {
        0 => 10,
        2 => 20,
        6 => 1,
        _ => 0,
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
            if object.get("inner").is_some()
                && object.get("inner").and_then(Value::as_i64).is_none()
            {
                errors.push(format!("pdo_global_param 第 {} 项 inner 必须是整数", line));
            } else if param.inner < -1 || param.inner > u16::MAX as i64 {
                errors.push(format!(
                    "pdo_global_param 第 {} 项 inner 超出有效范围：{}",
                    line, param.inner
                ));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v2_inner_binding_contract_accepts_unbound_and_known_ids() {
        let document = json!({
            "pdo_global_param": [
                { "inner": -1 },
                { "inner": 0 },
                { "inner": 16 }
            ],
            "protocol_profiles": {
                "controller_profiles": [{
                    "profile_id": "inmotion6",
                    "protocol": {
                        "pdo_global_param": [{ "inner": 14 }]
                    }
                }]
            }
        });

        assert!(validate_v2_pdo_inner_bindings(&document).is_ok());
    }

    #[test]
    fn v2_inner_binding_contract_rejects_unknown_ids_and_non_integer_values() {
        let document = json!({
            "pdo_global_param": [
                { "inner": 17 },
                { "inner": "速度" }
            ]
        });

        let error = validate_v2_pdo_inner_bindings(&document).unwrap_err();

        assert!(error.contains("inner=17"));
        assert!(error.contains("必须是整数"));
    }

    #[test]
    fn converts_named_simple_signals_without_using_legacy_indexes() {
        let document = json!({
            "pdo_recv": [{
                "id": 0x181,
                "type": 0,
                "desc": "状态",
                "data": [
                    { "pos": 0, "len": 16, "show_type": 0, "pdo_param_index": 0, "pdo_param_name": "车辆速度" },
                    { "pos": 16, "len": 8, "show_type": 0, "pdo_param_index": 0, "pdo_param_name": "电机温度" },
                    { "pos": 24, "len": 1, "show_type": 1, "pdo_param_index": 0, "pdo_param_name": "车辆速度" }
                ]
            }],
            "pdo_send": []
        });

        let report = convert_pdo_simple_document(&document);

        assert!(
            report.valid,
            "unexpected conversion errors: {:?}",
            report.errors
        );
        let converted = report.document.unwrap();
        assert_eq!(report.source_frame_total, 1);
        assert_eq!(report.source_signal_total, 3);
        assert_eq!(report.generated_param_total, 2);
        assert_eq!(converted.pdo_global_param.len(), 2);
        assert!(converted
            .pdo_global_param
            .iter()
            .all(|param| param.inner == -1));
        assert_eq!(
            converted.pdo_recv[0].data[0].param_id,
            converted.pdo_recv[0].data[2].param_id
        );
        assert_ne!(
            converted.pdo_recv[0].data[0].param_id,
            converted.pdo_recv[0].data[1].param_id
        );
        assert!(converted
            .pdo_recv
            .iter()
            .flat_map(|frame| frame.data.iter())
            .all(|signal| signal.handle == 0 && signal.handle_param.is_empty()));
    }

    #[test]
    fn converts_unnamed_legacy_indexes_to_separate_internal_parameters() {
        let document = json!({
            "pdo_recv": [{
                "id": 1,
                "type": 0,
                "desc": "旧表",
                "data": [
                    { "pos": 0, "len": 8, "show_type": 0, "pdo_param_index": 2 },
                    { "pos": 8, "len": 8, "show_type": 0, "pdo_param_index": 3 }
                ]
            }],
            "pdo_send": []
        });

        let report = convert_pdo_simple_document(&document);

        assert!(
            report.valid,
            "unexpected conversion errors: {:?}",
            report.errors
        );
        let converted = report.document.unwrap();
        assert_eq!(converted.pdo_global_param.len(), 2);
        assert_eq!(converted.pdo_global_param[0].inner, 2);
        assert_eq!(converted.pdo_global_param[1].inner, 3);
        assert_ne!(
            converted.pdo_recv[0].data[0].param_id,
            converted.pdo_recv[0].data[1].param_id
        );
    }

    #[test]
    fn rejects_invalid_simple_signal_ranges() {
        let document = json!({
            "pdo_recv": [{
                "id": 1,
                "type": 0,
                "desc": "错误",
                "data": [{ "pos": 63, "len": 2, "show_type": 0, "pdo_param_index": 0, "pdo_param_name": "a" }]
            }],
            "pdo_send": []
        });

        let report = convert_pdo_simple_document(&document);

        assert!(!report.valid);
        assert!(report.document.is_none());
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("位范围无效")));
    }
}

fn cell(cells: &[String], index: usize) -> String {
    cells
        .get(index)
        .map(|item| item.trim().to_string())
        .unwrap_or_default()
}
