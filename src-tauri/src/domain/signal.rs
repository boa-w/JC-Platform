//! 业务信号字典领域模型。
//!
//! Signal 是协议配置的业务语义层：描述“是什么数据”，不描述它在 CANOpen
//! 或私有协议中的传输位置。传输位置由 protocol_manager 中的映射层维护。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

/// 全局唯一业务信号 ID。
pub type SignalId = String;

/// 业务信号字典。
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SignalDictionary {
    #[serde(default)]
    pub signals: Vec<SignalDefinition>,
}

/// 业务信号定义。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SignalDefinition {
    pub signal_id: SignalId,
    pub name: String,
    #[serde(default)]
    pub data_type: SignalDataType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_value: Option<String>,
    /// 旧版全局变量/系统变量索引。None 表示纯业务变量。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inner: Option<i64>,
    #[serde(default)]
    pub scale: SignalScale,
    #[serde(default)]
    pub display: SignalDisplay,
}

impl SignalDefinition {
    pub fn new(signal_id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            signal_id: signal_id.into(),
            name: name.into(),
            data_type: SignalDataType::default(),
            default_value: None,
            min_value: None,
            max_value: None,
            inner: None,
            scale: SignalScale::default(),
            display: SignalDisplay::default(),
        }
    }
}

impl SignalDictionary {
    pub fn upsert(&mut self, signal: SignalDefinition) {
        if signal.signal_id.trim().is_empty() {
            return;
        }
        if let Some(current) = self
            .signals
            .iter_mut()
            .find(|item| item.signal_id == signal.signal_id)
        {
            merge_signal_definition(current, signal);
            return;
        }
        self.signals.push(signal);
    }

    pub fn ids(&self) -> HashSet<SignalId> {
        self.signals
            .iter()
            .map(|signal| signal.signal_id.clone())
            .collect()
    }
}

/// 从旧版 `.jcpro` 文档中提取业务信号字典。
///
/// 该函数只读取旧段落并生成新字典，不修改旧 JSON，因此不会影响旧导出路径。
pub fn derive_signal_dictionary_from_legacy(document: &Value) -> SignalDictionary {
    let mut dictionary = SignalDictionary::default();
    collect_pdo_global_signals(document, &mut dictionary);
    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        collect_simple_pdo_signals(document, &mut dictionary);
    }
    collect_sdo_signals(document.get("sdo_info"), &mut dictionary);
    dictionary
        .signals
        .sort_by(|left, right| left.signal_id.cmp(&right.signal_id));
    dictionary
}

pub fn normalize_signal_id(value: &str) -> SignalId {
    let mut id = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    while id.contains("__") {
        id = id.replace("__", "_");
    }
    id = id.trim_matches('_').to_string();
    if id.is_empty() {
        "UNNAMED_SIGNAL".to_string()
    } else {
        id
    }
}

fn merge_signal_definition(current: &mut SignalDefinition, next: SignalDefinition) {
    if current.name.is_empty() {
        current.name = next.name;
    }
    if current.default_value.is_none() {
        current.default_value = next.default_value;
    }
    if current.min_value.is_none() {
        current.min_value = next.min_value;
    }
    if current.max_value.is_none() {
        current.max_value = next.max_value;
    }
    if current.inner.is_none() {
        current.inner = next.inner;
    }
    if current.display.unit.is_empty() {
        current.display.unit = next.display.unit;
    }
    if current.display.format.is_empty() {
        current.display.format = next.display.format;
    }
    if current.display.description.is_empty() {
        current.display.description = next.display.description;
    }
}

fn collect_pdo_global_signals(document: &Value, dictionary: &mut SignalDictionary) {
    let Some(items) = document.get("pdo_global_param").and_then(Value::as_array) else {
        return;
    };
    for item in items {
        let param_id = object_id(item.get("param_id"));
        if param_id.is_empty() {
            continue;
        }
        let mut signal =
            SignalDefinition::new(param_id.clone(), object_string(item.get("name"), &param_id));
        signal.default_value = optional_string(item.get("def"));
        signal.inner = item.get("inner").and_then(Value::as_i64);
        signal.data_type =
            legacy_type_to_signal_data_type(item.get("type").and_then(Value::as_i64));
        signal.display.description = "PDO 全局变量迁移生成".to_string();
        dictionary.upsert(signal);
    }
}

fn collect_simple_pdo_signals(document: &Value, dictionary: &mut SignalDictionary) {
    let Some(simple) = document.get("pdo_simple_send_recv") else {
        return;
    };
    for section in ["pdo_recv", "pdo_send"] {
        let Some(frames) = simple.get(section).and_then(Value::as_array) else {
            continue;
        };
        for frame in frames {
            let Some(data) = frame.get("data").and_then(Value::as_array) else {
                continue;
            };
            for item in data {
                let name = object_string(item.get("pdo_param_name"), "");
                if name.is_empty() {
                    continue;
                }
                let signal_id = normalize_signal_id(&name);
                let mut signal = SignalDefinition::new(signal_id, name);
                signal.inner = item.get("pdo_param_index").and_then(Value::as_i64);
                signal.display.description = "PDO 简化配置迁移生成".to_string();
                dictionary.upsert(signal);
            }
        }
    }
}

fn collect_sdo_signals(node: Option<&Value>, dictionary: &mut SignalDictionary) {
    let Some(node) = node else {
        return;
    };
    if node.get("type").and_then(Value::as_u64).unwrap_or(0) == 1 {
        let mid = node.get("mid").and_then(Value::as_u64).unwrap_or(0);
        let sid = node.get("sid").and_then(Value::as_u64).unwrap_or(0);
        let name = object_string(node.get("name"), "SDO 参数");
        let signal_id = format!("SDO_{mid:04X}_{sid:02X}_{}", normalize_signal_id(&name));
        let mut signal = SignalDefinition::new(signal_id, name);
        signal.default_value = optional_string(node.get("data_default"));
        signal.min_value = optional_string(node.get("data_min"));
        signal.max_value = optional_string(node.get("data_max"));
        signal.data_type = legacy_handle_to_signal_data_type(node.get("handle_name"));
        signal.scale = SignalScale {
            scale_num: parse_i32(node.get("pre_handle_scale")).unwrap_or(1),
            scale_den: 1,
            offset: parse_f64(node.get("pre_handle_offset")).unwrap_or(0.0),
            decimals: node
                .get("pre_handle_decimal")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u8,
        };
        signal.display.description = "SDO 参数迁移生成".to_string();
        dictionary.upsert(signal);
    }

    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_sdo_signals(Some(child), dictionary);
        }
    }
}

fn object_id(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(item)) => item.trim().to_string(),
        Some(Value::Number(item)) => item.to_string(),
        _ => String::new(),
    }
}

fn object_string(value: Option<&Value>, default: &str) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or(default)
        .trim()
        .to_string()
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

fn parse_i32(value: Option<&Value>) -> Option<i32> {
    value
        .and_then(Value::as_str)
        .and_then(|item| item.trim().parse::<i32>().ok())
        .or_else(|| value.and_then(Value::as_i64).map(|item| item as i32))
}

fn parse_f64(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_str)
        .and_then(|item| item.trim().parse::<f64>().ok())
        .or_else(|| value.and_then(Value::as_f64))
}

fn legacy_type_to_signal_data_type(value: Option<i64>) -> SignalDataType {
    match value.unwrap_or(0) {
        0 => SignalDataType::U8,
        1 => SignalDataType::U16,
        2 => SignalDataType::U32,
        10 => SignalDataType::I16,
        20 => SignalDataType::U32,
        item => SignalDataType::Custom(item.to_string()),
    }
}

fn legacy_handle_to_signal_data_type(value: Option<&Value>) -> SignalDataType {
    match value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "bool" | "bit" => SignalDataType::Bool,
        "u8" | "uint8" => SignalDataType::U8,
        "u16" | "uint16" => SignalDataType::U16,
        "u32" | "uint32" => SignalDataType::U32,
        "i8" | "int8" => SignalDataType::I8,
        "i16" | "int16" => SignalDataType::I16,
        "i32" | "int32" => SignalDataType::I32,
        "f32" | "float" => SignalDataType::F32,
        "string" | "str" => SignalDataType::String,
        "" => SignalDataType::U8,
        item => SignalDataType::Custom(item.to_string()),
    }
}

/// 业务数据类型。Custom 用于保留旧项目或后续固件新增类型。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SignalDataType {
    Bool,
    U8,
    U16,
    U32,
    I8,
    I16,
    I32,
    F32,
    String,
    Bytes,
    Custom(String),
}

impl Default for SignalDataType {
    fn default() -> Self {
        Self::U8
    }
}

/// 线性缩放/显示精度配置。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SignalScale {
    #[serde(default = "default_scale_num")]
    pub scale_num: i32,
    #[serde(default = "default_scale_den")]
    pub scale_den: i32,
    #[serde(default)]
    pub offset: f64,
    #[serde(default)]
    pub decimals: u8,
}

impl Default for SignalScale {
    fn default() -> Self {
        Self {
            scale_num: default_scale_num(),
            scale_den: default_scale_den(),
            offset: 0.0,
            decimals: 0,
        }
    }
}

fn default_scale_num() -> i32 {
    1
}

fn default_scale_den() -> i32 {
    1
}

/// UI 展示语义，不包含任何传输位置。
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct SignalDisplay {
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub format: String,
    #[serde(default)]
    pub description: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signal_definition_round_trips_json() {
        let signal = SignalDefinition {
            signal_id: "BATTERY_VOLTAGE".to_string(),
            name: "电池总电压".to_string(),
            data_type: SignalDataType::U16,
            default_value: Some("0".to_string()),
            min_value: Some("0".to_string()),
            max_value: Some("1000".to_string()),
            inner: Some(17),
            scale: SignalScale {
                scale_num: 1,
                scale_den: 10,
                offset: 0.0,
                decimals: 1,
            },
            display: SignalDisplay {
                unit: "V".to_string(),
                format: "decimal".to_string(),
                description: "业务信号，不包含 CAN 位置".to_string(),
            },
        };

        let value = serde_json::to_value(&signal).unwrap();
        let parsed = serde_json::from_value::<SignalDefinition>(value).unwrap();

        assert_eq!(parsed, signal);
    }
}
