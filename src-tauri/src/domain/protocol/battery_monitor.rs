//! 锂电监控协议领域模型。
//!
//! 锂电监控是独立协议，不再拆成“协议段 + 显示段”两个来源。帧、信号解析规则、
//! 页面显示项和超时策略必须从同一个 `battery_monitor` 根段生成和导出。

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const BATTERY_MONITOR_SCHEMA_VERSION: u16 = 2;
pub const BATTERY_MONITOR_BINARY_VERSION: u16 = 2;
pub const BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS: u16 = 200;
pub const BATTERY_MONITOR_PAGE_SIZE: u16 = 4;
pub const BATTERY_PARSE_NO_MASK: u32 = u32::MAX;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BatteryMonitorProtocol {
    #[serde(default = "default_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_binary_version")]
    pub version: u16,
    #[serde(default = "default_timeout_ticks")]
    pub default_timeout_ticks: u16,
    #[serde(default = "default_page_size")]
    pub page_size: u16,
    #[serde(default)]
    pub frames: Vec<BatteryMonitorFrame>,
    #[serde(default)]
    pub signals: Vec<BatteryMonitorSignal>,
    #[serde(default)]
    pub items: Vec<BatteryMonitorItem>,
}

impl Default for BatteryMonitorProtocol {
    fn default() -> Self {
        Self {
            schema_version: BATTERY_MONITOR_SCHEMA_VERSION,
            enabled: false,
            version: BATTERY_MONITOR_BINARY_VERSION,
            default_timeout_ticks: BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS,
            page_size: BATTERY_MONITOR_PAGE_SIZE,
            frames: Vec::new(),
            signals: Vec::new(),
            items: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorFrame {
    pub frame_key: String,
    pub can_id: u32,
    #[serde(default)]
    pub frame_type: u8,
    #[serde(default = "default_dlc")]
    pub dlc: u8,
    #[serde(default)]
    pub desc: String,
    #[serde(default = "default_timeout_ticks")]
    pub timeout_ticks: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorSignal {
    pub signal_key: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub inner: i64,
    pub frame_key: String,
    pub pos: u16,
    pub len: u16,
    #[serde(default)]
    pub byte_order: BatteryByteOrder,
    #[serde(default)]
    pub raw_offset: u8,
    #[serde(default)]
    pub raw_type: BatteryRawType,
    #[serde(default)]
    pub value_type: BatteryValueType,
    #[serde(default = "default_parse_resolution")]
    pub parse_resolution: f64,
    #[serde(default)]
    pub parse_offset: f64,
    #[serde(default = "default_parse_mask")]
    pub parse_mask: u32,
    #[serde(default)]
    pub parse_shift: u8,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub receiver: String,
    #[serde(default)]
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryByteOrder {
    #[default]
    LittleEndian,
    BigEndian,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryRawType {
    #[default]
    U8,
    U16Le,
    U32Le,
    #[serde(rename = "datetime_ymdhms")]
    DateTimeYmdhms,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatteryValueType {
    #[default]
    U8,
    U16,
    U32,
    F32,
    #[serde(rename = "datetime")]
    DateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BatteryMonitorItem {
    pub item_key: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub order: u16,
    pub signal_key: String,
    pub name_key: String,
    #[serde(default)]
    pub fallback_name: String,
    #[serde(default)]
    pub unit: String,
    #[serde(default)]
    pub formatter: BatteryMonitorFormatter,
    #[serde(default)]
    pub validity: BatteryMonitorValidity,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BatteryMonitorFormatter {
    #[serde(default = "default_formatter_kind")]
    pub kind: String,
    #[serde(default)]
    pub offset: f64,
    #[serde(default = "default_scale_num")]
    pub scale_num: i32,
    #[serde(default = "default_scale_den")]
    pub scale_den: i32,
    #[serde(default)]
    pub decimals: u8,
    #[serde(default = "default_display_base")]
    pub display_base: u8,
    #[serde(default)]
    pub true_text: String,
    #[serde(default)]
    pub false_text: String,
}

impl Default for BatteryMonitorFormatter {
    fn default() -> Self {
        Self {
            kind: default_formatter_kind(),
            offset: 0.0,
            scale_num: default_scale_num(),
            scale_den: default_scale_den(),
            decimals: 0,
            display_base: default_display_base(),
            true_text: String::new(),
            false_text: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct BatteryMonitorValidity {
    #[serde(default = "default_validity_mode")]
    pub mode: String,
    #[serde(default)]
    pub frame_key: String,
    #[serde(default = "default_empty_text")]
    pub empty_text: String,
    #[serde(default)]
    pub timeout_ticks: Option<u16>,
}

pub fn parse_battery_monitor_protocol(document: &Value) -> BatteryMonitorProtocol {
    let Some(value) = document.get("battery_monitor") else {
        return BatteryMonitorProtocol::default();
    };
    let is_v2 = value.get("schema_version").and_then(Value::as_u64) == Some(2)
        && value.get("version").and_then(Value::as_u64) == Some(2);
    if !is_v2 {
        return BatteryMonitorProtocol::default();
    }
    serde_json::from_value(value.clone()).unwrap_or_default()
}

/// Returns the empty protocol scaffold used for new and incomplete projects.
///
/// Actual frame, signal, and display-item definitions must be authored in the
/// project's `battery_monitor` section; they are intentionally not bundled here.
pub fn default_battery_monitor_protocol() -> Value {
    serde_json::to_value(BatteryMonitorProtocol::default())
        .expect("battery monitor scaffold must be serializable")
}

fn default_schema_version() -> u16 {
    BATTERY_MONITOR_SCHEMA_VERSION
}

fn default_binary_version() -> u16 {
    BATTERY_MONITOR_BINARY_VERSION
}

fn default_timeout_ticks() -> u16 {
    BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS
}

fn default_page_size() -> u16 {
    BATTERY_MONITOR_PAGE_SIZE
}

fn default_dlc() -> u8 {
    8
}

fn default_enabled() -> bool {
    true
}

fn default_parse_resolution() -> f64 {
    1.0
}

fn default_parse_mask() -> u32 {
    BATTERY_PARSE_NO_MASK
}

fn default_formatter_kind() -> String {
    "linear".to_string()
}

fn default_scale_num() -> i32 {
    1
}

fn default_scale_den() -> i32 {
    1
}

fn default_display_base() -> u8 {
    10
}

fn default_validity_mode() -> String {
    "frame_timeout".to_string()
}

fn default_empty_text() -> String {
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn default_protocol_is_disabled_and_empty() {
        let document = default_battery_monitor_protocol();
        let protocol: BatteryMonitorProtocol = serde_json::from_value(document).unwrap();

        assert!(!protocol.enabled);
        assert_eq!(protocol.frames.len(), 0);
        assert_eq!(protocol.signals.len(), 0);
        assert_eq!(protocol.items.len(), 0);
        assert_eq!(protocol.version, BATTERY_MONITOR_BINARY_VERSION);
        assert_eq!(
            protocol.default_timeout_ticks,
            BATTERY_MONITOR_DEFAULT_TIMEOUT_TICKS
        );
        assert_eq!(protocol.page_size, BATTERY_MONITOR_PAGE_SIZE);
    }

    #[test]
    fn parsing_missing_protocol_uses_the_empty_scaffold() {
        let protocol = parse_battery_monitor_protocol(&Value::Object(Default::default()));
        let expected =
            serde_json::from_value::<BatteryMonitorProtocol>(default_battery_monitor_protocol())
                .unwrap();

        assert_eq!(protocol, expected);
    }

    #[test]
    fn parsing_a_non_v2_protocol_returns_the_empty_v2_scaffold() {
        let protocol = parse_battery_monitor_protocol(&json!({
            "battery_monitor": {
                "schema_version": 1,
                "enabled": true,
                "version": 1,
                "signals": [{ "signal_key": "legacy_signal", "name": "旧信号" }]
            }
        }));

        assert!(!protocol.enabled);
        assert_eq!(protocol.schema_version, BATTERY_MONITOR_SCHEMA_VERSION);
        assert_eq!(protocol.version, BATTERY_MONITOR_BINARY_VERSION);
        assert!(protocol.signals.is_empty());
    }
}
