use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

use crate::domain::project::materialize_active_protocol_profiles;
use crate::domain::protocol::battery_monitor::{
    BATTERY_MONITOR_BINARY_VERSION, BATTERY_MONITOR_SCHEMA_VERSION,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestSignalValue {
    pub name: String,
    pub unit: String,
    pub pos: u32,
    pub len: u32,
    pub scale_num: i32,
    pub scale_den: i32,
    pub offset: f64,
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
    pub raw_value: u32,
    pub display_value: f64,
    pub source: String,
    pub test_role: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestFrame {
    pub id: u32,
    pub frame_type: u8,
    pub name: String,
    pub dlc: u8,
    pub cycle_ms: u16,
    pub data: String,
    pub source: String,
    pub scenario: String,
    pub signals: Vec<CanTestSignalValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestSettingEntry {
    pub name: String,
    pub menu_path: String,
    pub frame_id: u32,
    pub index: u32,
    pub subindex: u32,
    pub access: String,
    pub data_type: String,
    pub pos: u32,
    pub len: u32,
    pub role: String,
    pub value: String,
    pub default_value: Option<String>,
    pub min_value: Option<String>,
    pub max_value: Option<String>,
    pub scale: Option<String>,
    pub offset: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestCase {
    pub case_id: String,
    pub title: String,
    pub scenario: String,
    pub description: String,
    pub tags: Vec<String>,
    pub frames: Vec<CanTestFrame>,
    pub setting_entries: Vec<CanTestSettingEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestCoverage {
    pub frame_count: u32,
    pub signal_count: u32,
    pub setting_entry_count: u32,
    pub case_count: u32,
    pub generated_frame_count: u32,
    pub generated_setting_entry_count: u32,
    pub covered_scenarios: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanTestGenerateResponse {
    pub frames: Vec<CanTestFrame>,
    pub setting_entries: Vec<CanTestSettingEntry>,
    pub frame_count: u32,
    pub cases: Vec<CanTestCase>,
    pub coverage: CanTestCoverage,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GenerateProfile {
    Smoke,
    Boundary,
    Fault,
    Regression,
}

impl GenerateProfile {
    fn from_label(value: Option<&str>) -> Self {
        match value.unwrap_or("boundary") {
            "smoke" => Self::Smoke,
            "fault" => Self::Fault,
            "regression" => Self::Regression,
            _ => Self::Boundary,
        }
    }
}

#[derive(Debug, Clone)]
struct SignalSpec {
    key: String,
    name: String,
    unit: String,
    pos: u32,
    len: u32,
    scale_num: i32,
    scale_den: i32,
    offset: f64,
    min_value: Option<f64>,
    max_value: Option<f64>,
    source: String,
}

#[derive(Debug, Clone)]
struct FrameSpec {
    id: u32,
    frame_type: u8,
    name: String,
    cycle_ms: u16,
    source: String,
    signals: Vec<SignalSpec>,
}

#[derive(Debug, Clone)]
struct SettingSpec {
    key: String,
    name: String,
    menu_path: String,
    frame_id: u32,
    index: u32,
    subindex: u32,
    access: u8,
    data_type: String,
    pos: u32,
    len: u32,
    default_value: Option<String>,
    min_value: Option<String>,
    max_value: Option<String>,
    scale: Option<String>,
    offset: Option<String>,
}

fn object_u32(value: &Value, key: &str) -> Option<u32> {
    value.get(key).and_then(value_u32)
}

fn value_u32(value: &Value) -> Option<u32> {
    value.as_u64().map(|v| v as u32).or_else(|| {
        let text = value.as_str()?.trim();
        if let Some(hex) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
            u32::from_str_radix(hex, 16).ok()
        } else {
            text.parse::<u32>().ok()
        }
    })
}

fn object_u8(value: &Value, key: &str, fallback: u8) -> u8 {
    value
        .get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as u8)
        .unwrap_or(fallback)
}

fn object_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_str().and_then(|s| s.trim().parse::<f64>().ok()))
    })
}

fn object_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn max_raw(len: u32) -> u32 {
    if len == 0 {
        0
    } else if len >= 32 {
        u32::MAX
    } else {
        ((1u64 << len) - 1) as u32
    }
}

fn clamp_raw(raw: i64, len: u32) -> u32 {
    raw.clamp(0, max_raw(len) as i64) as u32
}

fn raw_to_display(raw: u32, sig: &SignalSpec) -> f64 {
    let den = if sig.scale_den == 0 { 1 } else { sig.scale_den };
    raw as f64 * sig.scale_num as f64 / den as f64 + sig.offset
}

fn display_to_raw(display: f64, sig: &SignalSpec) -> u32 {
    let num = if sig.scale_num == 0 { 1 } else { sig.scale_num };
    let raw = ((display - sig.offset) * sig.scale_den as f64 / num as f64).round() as i64;
    clamp_raw(raw, sig.len)
}

fn guess_display_value(name: &str, min_value: Option<f64>, max_value: Option<f64>) -> f64 {
    if let (Some(min), Some(max)) = (min_value, max_value) {
        if min.is_finite() && max.is_finite() && max >= min {
            return (min + max) / 2.0;
        }
    }

    let lower = name.to_lowercase();
    if lower.contains("电压") || lower.contains("voltage") {
        48.0
    } else if lower.contains("电流") || lower.contains("current") {
        10.0
    } else if lower.contains("soc") {
        50.0
    } else if lower.contains("温度") || lower.contains("temp") {
        25.0
    } else if lower.contains("soh") {
        80.0
    } else if lower.contains("容量") || lower.contains("capacity") {
        100.0
    } else if lower.contains("转速") || lower.contains("speed") {
        1000.0
    } else {
        0.0
    }
}

fn nominal_raw(sig: &SignalSpec) -> u32 {
    let display = guess_display_value(&sig.name, sig.min_value, sig.max_value);
    let raw = display_to_raw(display, sig);
    if raw == 0 && sig.min_value.is_none() && sig.max_value.is_none() && sig.len > 0 {
        (max_raw(sig.len) / 2).max(1)
    } else {
        raw
    }
}

fn build_signal_value(sig: &SignalSpec, raw_value: u32, test_role: &str) -> CanTestSignalValue {
    CanTestSignalValue {
        name: sig.name.clone(),
        unit: sig.unit.clone(),
        pos: sig.pos,
        len: sig.len,
        scale_num: sig.scale_num,
        scale_den: sig.scale_den,
        offset: sig.offset,
        min_value: sig.min_value,
        max_value: sig.max_value,
        raw_value: raw_value & max_raw(sig.len),
        display_value: raw_to_display(raw_value & max_raw(sig.len), sig),
        source: sig.source.clone(),
        test_role: test_role.to_string(),
    }
}

pub fn compute_data_bytes(dlc: u8, signals: &[CanTestSignalValue]) -> String {
    let mut bytes = vec![0u8; dlc as usize];
    for sig in signals {
        let mut value = sig.raw_value as u64;
        let mut bit_pos = sig.pos;
        let mut bits_rem = sig.len.min(32);
        while bits_rem > 0 {
            let byte_idx = (bit_pos / 8) as usize;
            if byte_idx >= dlc as usize {
                break;
            }
            let bit_off = bit_pos % 8;
            let bits_this = (8 - bit_off).min(bits_rem);
            let mask = (1u64 << bits_this) - 1;
            bytes[byte_idx] |= ((value & mask) as u8) << bit_off;
            value >>= bits_this;
            bit_pos += bits_this;
            bits_rem -= bits_this;
        }
    }
    bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

fn frame_dlc(signals: &[SignalSpec]) -> u8 {
    let max_bit = signals.iter().map(|s| s.pos + s.len).max().unwrap_or(0);
    ((max_bit + 7) / 8).clamp(1, 8) as u8
}

fn build_frame(
    spec: &FrameSpec,
    scenario: &str,
    signal_overrides: &HashMap<String, (u32, String)>,
    raw_pattern: Option<u8>,
) -> CanTestFrame {
    let dlc = 8;
    let signals = spec
        .signals
        .iter()
        .map(|sig| {
            let (raw, role) = signal_overrides
                .get(&sig.key)
                .cloned()
                .unwrap_or_else(|| (nominal_raw(sig), "nominal".to_string()));
            build_signal_value(sig, raw, &role)
        })
        .collect::<Vec<_>>();

    let data = if let Some(pattern) = raw_pattern {
        vec![format!("{:02X}", pattern); dlc as usize].join(" ")
    } else {
        compute_data_bytes(dlc, &signals)
    };

    CanTestFrame {
        id: spec.id,
        frame_type: spec.frame_type,
        name: spec.name.clone(),
        dlc,
        cycle_ms: spec.cycle_ms,
        data,
        source: spec.source.clone(),
        scenario: scenario.to_string(),
        signals,
    }
}

fn setting_signal_spec(spec: &SettingSpec) -> SignalSpec {
    SignalSpec {
        key: spec.key.clone(),
        name: spec.name.clone(),
        unit: String::new(),
        pos: spec.pos,
        len: spec.len,
        scale_num: 1,
        scale_den: 1,
        offset: 0.0,
        min_value: spec.min_value.as_deref().and_then(numeric_text),
        max_value: spec.max_value.as_deref().and_then(numeric_text),
        source: "设置数据/SDO".to_string(),
    }
}

fn build_setting_frames(
    specs: &[SettingSpec],
    scenario: &str,
    overrides: &HashMap<String, (String, String)>,
) -> Vec<CanTestFrame> {
    let mut grouped: HashMap<u32, Vec<&SettingSpec>> = HashMap::new();
    for spec in specs {
        grouped.entry(spec.frame_id).or_default().push(spec);
    }

    let mut frame_ids = grouped.keys().copied().collect::<Vec<_>>();
    frame_ids.sort_unstable();

    frame_ids
        .into_iter()
        .map(|frame_id| {
            let mut settings = grouped.remove(&frame_id).unwrap_or_default();
            settings.sort_by_key(|spec| (spec.index, spec.subindex, spec.pos, spec.name.clone()));
            let signals = settings
                .iter()
                .map(|spec| {
                    let (value, role) = overrides
                        .get(&spec.key)
                        .cloned()
                        .unwrap_or_else(|| (setting_nominal_value(spec), "default".to_string()));
                    let raw = numeric_text(&value).unwrap_or(0.0).round().max(0.0) as u32;
                    build_signal_value(&setting_signal_spec(spec), raw, &role)
                })
                .collect::<Vec<_>>();
            CanTestFrame {
                id: frame_id,
                frame_type: 0,
                name: format!("设置数据_SDO_0x{frame_id:X}"),
                dlc: 8,
                cycle_ms: 100,
                data: compute_data_bytes(8, &signals),
                source: "设置数据/SDO".to_string(),
                scenario: scenario.to_string(),
                signals,
            }
        })
        .collect()
}

fn build_case(
    case_id: String,
    title: String,
    scenario: &str,
    description: String,
    tags: Vec<&str>,
    frames: Vec<CanTestFrame>,
    setting_entries: Vec<CanTestSettingEntry>,
) -> CanTestCase {
    CanTestCase {
        case_id,
        title,
        scenario: scenario.to_string(),
        description,
        tags: tags.into_iter().map(str::to_string).collect(),
        frames,
        setting_entries,
    }
}

fn collect_signal_dictionary(document: &Value) -> HashMap<String, Value> {
    let mut map = HashMap::new();
    if let Some(signals) = document
        .get("signal_dictionary")
        .and_then(|v| v.get("signals"))
        .and_then(|v| v.as_array())
    {
        for signal in signals {
            if let Some(id) = object_string(signal, "signal_id") {
                map.insert(id, signal.clone());
            }
        }
    }
    map
}

fn signal_from_dictionary(
    signal_id: &str,
    pos: u32,
    len: u32,
    show_type: u8,
    source: &str,
    dictionary: &HashMap<String, Value>,
) -> SignalSpec {
    let dict = dictionary.get(signal_id);
    let scale = dict.and_then(|v| v.get("scale"));
    let display = dict.and_then(|v| v.get("display"));
    let name = dict
        .and_then(|v| object_string(v, "name"))
        .unwrap_or_else(|| signal_id.to_string());
    let unit = display
        .and_then(|v| object_string(v, "unit"))
        .unwrap_or_default();
    let scale_num = scale
        .and_then(|v| v.get("scale_num").and_then(|n| n.as_i64()))
        .unwrap_or(1) as i32;
    let scale_den = scale
        .and_then(|v| v.get("scale_den").and_then(|n| n.as_i64()))
        .unwrap_or(1) as i32;
    let offset = scale.and_then(|v| object_f64(v, "offset")).unwrap_or(0.0);

    SignalSpec {
        key: format!("{source}:{signal_id}:{pos}:{len}"),
        name,
        unit,
        pos,
        len,
        scale_num,
        scale_den,
        offset,
        min_value: dict.and_then(|v| object_f64(v, "min_value")),
        max_value: dict.and_then(|v| object_f64(v, "max_value")),
        source: format!("{source}/show_type={show_type}"),
    }
}

fn collect_pdo_frames(
    document: &Value,
    dictionary: &HashMap<String, Value>,
    warnings: &mut Vec<String>,
) -> Vec<FrameSpec> {
    let mut frames = Vec::new();

    if document.get("config_version").and_then(Value::as_str) != Some("jc002") {
        if let Some(simple) = document.get("pdo_simple_send_recv") {
            for kind in ["pdo_recv", "pdo_send"] {
                let label = if kind == "pdo_recv" {
                    "PDO接收"
                } else {
                    "PDO发送"
                };
                if let Some(arr) = simple.get(kind).and_then(|v| v.as_array()) {
                    for frame in arr {
                        frames.push(extract_pdo_frame(frame, label, dictionary, warnings));
                    }
                }
            }
        }
    }

    for kind in ["pdo_recv", "pdo_send"] {
        let label = if kind == "pdo_recv" {
            "高级PDO接收"
        } else {
            "高级PDO发送"
        };
        if let Some(arr) = document.get(kind).and_then(|v| v.as_array()) {
            for frame in arr {
                frames.push(extract_pdo_frame(frame, label, dictionary, warnings));
            }
        }
    }

    frames
}

fn extract_pdo_frame(
    frame: &Value,
    label: &str,
    dictionary: &HashMap<String, Value>,
    warnings: &mut Vec<String>,
) -> FrameSpec {
    let id = object_u32(frame, "id")
        .or_else(|| object_u32(frame, "can_id"))
        .unwrap_or(0);
    let desc = object_string(frame, "desc").unwrap_or_default();
    let name = if desc.is_empty() {
        format!("{label}_{id:03X}")
    } else {
        format!("{label}_{desc}")
    };

    let mut signals = Vec::new();
    if let Some(data) = frame.get("data").and_then(|v| v.as_array()) {
        for (index, sig) in data.iter().enumerate() {
            let pos = object_u32(sig, "pos").unwrap_or(0);
            let len = object_u32(sig, "len").unwrap_or(0);
            if len == 0 || pos + len > 64 {
                warnings.push(format!(
                    "{name} 第 {} 个信号位范围异常：pos={}, len={}",
                    index + 1,
                    pos,
                    len
                ));
            }
            let signal_id = object_string(sig, "param_id")
                .or_else(|| object_string(sig, "pdo_param_name"))
                .unwrap_or_else(|| format!("signal_{}", index + 1));
            let mut spec = signal_from_dictionary(
                &signal_id,
                pos,
                len,
                object_u8(sig, "show_type", 0),
                label,
                dictionary,
            );
            if spec.name == signal_id {
                spec.name = object_string(sig, "pdo_param_name").unwrap_or(signal_id);
            }
            signals.push(spec);
        }
    }

    FrameSpec {
        id,
        frame_type: object_u8(frame, "type", 0),
        name,
        cycle_ms: 100,
        source: label.to_string(),
        signals,
    }
}

fn battery_item_map(document: &Value) -> HashMap<String, (String, f64, i32, i32)> {
    let mut map = HashMap::new();
    if let Some(items) = document
        .get("battery_monitor")
        .and_then(|v| v.get("items"))
        .and_then(|v| v.as_array())
    {
        for item in items {
            let Some(signal_key) = object_string(item, "signal_key") else {
                continue;
            };
            let formatter = item.get("formatter");
            let unit = object_string(item, "unit").unwrap_or_default();
            let offset = formatter
                .and_then(|v| object_f64(v, "offset"))
                .unwrap_or(0.0);
            let scale_num = formatter
                .and_then(|v| v.get("scale_num").and_then(|n| n.as_i64()))
                .unwrap_or(1) as i32;
            let scale_den = formatter
                .and_then(|v| v.get("scale_den").and_then(|n| n.as_i64()))
                .unwrap_or(1) as i32;
            map.insert(signal_key, (unit, offset, scale_num, scale_den));
        }
    }
    map
}

fn collect_battery_monitor_frames(document: &Value, warnings: &mut Vec<String>) -> Vec<FrameSpec> {
    let Some(monitor) = document.get("battery_monitor") else {
        return Vec::new();
    };
    if monitor.get("schema_version").and_then(Value::as_u64)
        != Some(u64::from(BATTERY_MONITOR_SCHEMA_VERSION))
        || monitor.get("version").and_then(Value::as_u64)
            != Some(u64::from(BATTERY_MONITOR_BINARY_VERSION))
    {
        warnings.push("锂电监控仅解析 Battery V2 配置".to_string());
        return Vec::new();
    }
    if !monitor
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true)
    {
        return Vec::new();
    }
    collect_battery_frames_from_section(monitor, "锂电监控", &battery_item_map(document), warnings)
}

fn collect_battery_frames_from_section(
    section: &Value,
    label: &str,
    item_map: &HashMap<String, (String, f64, i32, i32)>,
    warnings: &mut Vec<String>,
) -> Vec<FrameSpec> {
    let mut frames = Vec::new();
    let signals = section
        .get("signals")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    if let Some(frame_array) = section.get("frames").and_then(|v| v.as_array()) {
        for frame in frame_array {
            let frame_key = object_string(frame, "frame_key").unwrap_or_default();
            let id = object_u32(frame, "can_id")
                .or_else(|| object_u32(frame, "id"))
                .unwrap_or(0);
            let desc = object_string(frame, "desc").unwrap_or_default();
            let name = if desc.is_empty() {
                format!("{label}_{id:03X}")
            } else {
                format!("{label}_{desc}")
            };
            let mut frame_signals = Vec::new();
            for sig in signals
                .iter()
                .filter(|sig| object_string(sig, "frame_key").unwrap_or_default() == frame_key)
            {
                let key = object_string(sig, "signal_key").unwrap_or_default();
                let pos = object_u32(sig, "pos").unwrap_or(0);
                let len = object_u32(sig, "len").unwrap_or(0);
                if len == 0 || pos + len > 64 {
                    warnings.push(format!(
                        "{name} 信号 {} 位范围异常：pos={}, len={}",
                        key, pos, len
                    ));
                }
                let (mapped_unit, mapped_offset, mapped_num, mapped_den) =
                    item_map.get(&key).cloned().unwrap_or_default();
                let scale_num = object_f64(sig, "parse_resolution")
                    .map(|v| (v * 1000.0).round() as i32)
                    .filter(|v| *v != 0)
                    .unwrap_or(mapped_num.max(1));
                let scale_den = if object_f64(sig, "parse_resolution").is_some() {
                    1000
                } else {
                    mapped_den.max(1)
                };
                let unit = object_string(sig, "unit").unwrap_or(mapped_unit);
                frame_signals.push(SignalSpec {
                    key: format!("{label}:{frame_key}:{key}:{pos}:{len}"),
                    name: object_string(sig, "name").unwrap_or_else(|| key.clone()),
                    unit,
                    pos,
                    len,
                    scale_num,
                    scale_den,
                    offset: object_f64(sig, "parse_offset").unwrap_or(mapped_offset),
                    min_value: None,
                    max_value: None,
                    source: label.to_string(),
                });
            }
            frames.push(FrameSpec {
                id,
                frame_type: object_u8(frame, "frame_type", 0),
                name,
                cycle_ms: object_u32(frame, "cycle_ms")
                    .or_else(|| object_u32(frame, "timeout_ticks"))
                    .unwrap_or(200) as u16,
                source: label.to_string(),
                signals: frame_signals,
            });
        }
    }

    frames
}

fn collect_frame_specs(document: &Value, warnings: &mut Vec<String>) -> Vec<FrameSpec> {
    let dictionary = collect_signal_dictionary(document);
    let mut frames = collect_pdo_frames(document, &dictionary, warnings);
    frames.extend(collect_battery_monitor_frames(document, warnings));

    let mut seen = HashSet::new();
    for frame in &frames {
        if !seen.insert((frame.id, frame.source.clone())) {
            warnings.push(format!(
                "{} 0x{:X} 重复出现，已保留为独立测试源",
                frame.source, frame.id
            ));
        }
        if frame.signals.is_empty() {
            warnings.push(format!(
                "{} 0x{:X} 没有可生成的信号",
                frame.source, frame.id
            ));
        }
    }
    frames
}

fn setting_access_label(value: u8) -> &'static str {
    match value {
        1 => "读写",
        2 => "只写",
        _ => "只读",
    }
}

fn numeric_text(value: &str) -> Option<f64> {
    let text = value.trim();
    if let Some(hex) = text.strip_prefix("0x").or_else(|| text.strip_prefix("0X")) {
        u64::from_str_radix(hex, 16).ok().map(|v| v as f64)
    } else {
        text.parse::<f64>().ok()
    }
}

fn setting_nominal_value(spec: &SettingSpec) -> String {
    if let Some(value) = spec
        .default_value
        .clone()
        .filter(|value| !value.trim().is_empty())
    {
        return value;
    }
    match (
        spec.min_value.as_deref().and_then(numeric_text),
        spec.max_value.as_deref().and_then(numeric_text),
    ) {
        (Some(min), Some(max)) if max >= min => format!("{}", ((min + max) / 2.0).round()),
        (Some(min), _) => format!("{}", min.round()),
        (_, Some(max)) => format!("{}", max.round()),
        _ => "0".to_string(),
    }
}

fn build_setting_entry(spec: &SettingSpec, value: String, role: &str) -> CanTestSettingEntry {
    CanTestSettingEntry {
        name: spec.name.clone(),
        menu_path: spec.menu_path.clone(),
        frame_id: spec.frame_id,
        index: spec.index,
        subindex: spec.subindex,
        access: setting_access_label(spec.access).to_string(),
        data_type: spec.data_type.clone(),
        pos: spec.pos,
        len: spec.len,
        role: role.to_string(),
        value,
        default_value: spec.default_value.clone(),
        min_value: spec.min_value.clone(),
        max_value: spec.max_value.clone(),
        scale: spec.scale.clone(),
        offset: spec.offset.clone(),
        source: "设置数据/SDO".to_string(),
    }
}

fn collect_setting_specs(document: &Value, warnings: &mut Vec<String>) -> Vec<SettingSpec> {
    let mut specs = Vec::new();
    let Some(root) = document.get("sdo_info") else {
        return specs;
    };

    fn visit(
        node: &Value,
        path: &mut Vec<String>,
        specs: &mut Vec<SettingSpec>,
        warnings: &mut Vec<String>,
    ) {
        let node_type = object_u32(node, "type").unwrap_or(0);
        let name = object_string(node, "name").unwrap_or_else(|| {
            if node_type == 1 {
                "未命名参数".to_string()
            } else {
                "未命名菜单".to_string()
            }
        });

        if node_type == 1 {
            let frame_id = object_u32(node, "fid").unwrap_or(0);
            let index = object_u32(node, "mid").unwrap_or(0);
            let subindex = object_u32(node, "sid").unwrap_or(0);
            let (pos, len) = parse_setting_bit_range(object_string(node, "handle_param"));
            if index == 0 {
                warnings.push(format!("设置数据 {} 缺少有效主索引 mid", name));
            }
            specs.push(SettingSpec {
                key: format!("setting:{frame_id}:{index}:{subindex}:{pos}:{len}:{name}"),
                name,
                menu_path: path.join(" -> "),
                frame_id,
                index,
                subindex,
                access: object_u8(node, "control_rw", 0),
                data_type: setting_data_type_label(node),
                pos,
                len,
                default_value: object_string(node, "data_default"),
                min_value: object_string(node, "data_min"),
                max_value: object_string(node, "data_max"),
                scale: object_string(node, "pre_handle_scale"),
                offset: object_string(node, "pre_handle_offset"),
            });
            return;
        }

        path.push(name);
        if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
            for child in children {
                visit(child, path, specs, warnings);
            }
        }
        path.pop();
    }

    let mut path = Vec::new();
    visit(root, &mut path, &mut specs, warnings);

    let mut used_bits: HashMap<(u32, u32), String> = HashMap::new();
    for spec in &specs {
        for bit in spec.pos..spec.pos.saturating_add(spec.len).min(64) {
            let key = (spec.frame_id, bit);
            if let Some(existing) = used_bits.get(&key) {
                warnings.push(format!(
                    "设置数据 0x{:X} bit{} 重叠：{} 与 {}",
                    spec.frame_id, bit, existing, spec.name
                ));
                break;
            }
            used_bits.insert(key, spec.name.clone());
        }
    }

    specs
}

fn parse_setting_bit_range(value: Option<String>) -> (u32, u32) {
    let parts = value
        .unwrap_or_default()
        .split("->")
        .filter_map(|item| item.trim().parse::<u32>().ok())
        .collect::<Vec<_>>();
    let start = parts.first().copied().unwrap_or(0);
    let end = parts.get(1).copied().unwrap_or(start);
    (start, end.saturating_sub(start) + 1)
}

fn setting_data_type_label(node: &Value) -> String {
    for key in ["handle_name", "data_type", "dataType"] {
        if let Some(value) = object_string(node, key) {
            return value;
        }
    }

    let Some(handle) = object_u32(node, "handle") else {
        return "unknown".to_string();
    };
    let label = match handle {
        0 => "u8",
        2 | 3 => "u16",
        4 | 7 => "u32",
        6 => "string",
        11 | 12 => "bit",
        _ => return format!("handle={handle}"),
    };
    format!("{label}(handle={handle})")
}

fn setting_nominal_entries(specs: &[SettingSpec]) -> Vec<CanTestSettingEntry> {
    specs
        .iter()
        .map(|spec| build_setting_entry(spec, setting_nominal_value(spec), "default"))
        .collect()
}

fn setting_boundary_cases(specs: &[SettingSpec]) -> Vec<CanTestCase> {
    let mut cases = Vec::new();
    for (index, spec) in specs.iter().enumerate() {
        if let Some(value) = spec
            .min_value
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            let mut overrides = HashMap::new();
            overrides.insert(spec.key.clone(), (value.clone(), "min".to_string()));
            cases.push(build_case(
                format!("TC-SETTING-{:04}-MIN", index + 1),
                format!("设置项下限：{}", spec.name),
                "setting-boundary",
                "根据设置数据中的最小值生成 SDO 参数测试条目。".to_string(),
                vec!["setting-data", "sdo", "min"],
                build_setting_frames(specs, "setting-min", &overrides),
                vec![build_setting_entry(spec, value, "min")],
            ));
        }
        if let Some(value) = spec
            .max_value
            .clone()
            .filter(|value| !value.trim().is_empty())
        {
            let mut overrides = HashMap::new();
            overrides.insert(spec.key.clone(), (value.clone(), "max".to_string()));
            cases.push(build_case(
                format!("TC-SETTING-{:04}-MAX", index + 1),
                format!("设置项上限：{}", spec.name),
                "setting-boundary",
                "根据设置数据中的最大值生成 SDO 参数测试条目。".to_string(),
                vec!["setting-data", "sdo", "max"],
                build_setting_frames(specs, "setting-max", &overrides),
                vec![build_setting_entry(spec, value, "max")],
            ));
        }
    }
    cases
}

fn setting_fault_cases(specs: &[SettingSpec]) -> Vec<CanTestCase> {
    let mut cases = Vec::new();
    for (index, spec) in specs.iter().enumerate() {
        if spec.access == 0 {
            let value = setting_nominal_value(spec);
            let mut overrides = HashMap::new();
            overrides.insert(
                spec.key.clone(),
                (value.clone(), "readonly-write-attempt".to_string()),
            );
            cases.push(build_case(
                format!("TC-SETTING-FAULT-{:04}-READONLY", index + 1),
                format!("只读设置项写入尝试：{}", spec.name),
                "setting-fault",
                "只读参数生成写入候选，用于验证设备拒绝非法写入。".to_string(),
                vec!["setting-data", "sdo", "readonly-write"],
                build_setting_frames(specs, "setting-readonly-write", &overrides),
                vec![build_setting_entry(spec, value, "readonly-write-attempt")],
            ));
        }

        if let Some(min) = spec.min_value.as_deref().and_then(numeric_text) {
            let value = format!("{}", (min - 1.0).round());
            let mut overrides = HashMap::new();
            overrides.insert(spec.key.clone(), (value.clone(), "below-min".to_string()));
            cases.push(build_case(
                format!("TC-SETTING-FAULT-{:04}-LOW", index + 1),
                format!("设置项低于下限：{}", spec.name),
                "setting-fault",
                "根据设置数据最小值生成 min-1 异常条目。".to_string(),
                vec!["setting-data", "sdo", "below-min"],
                build_setting_frames(specs, "setting-below-min", &overrides),
                vec![build_setting_entry(spec, value, "below-min")],
            ));
        }
        if let Some(max) = spec.max_value.as_deref().and_then(numeric_text) {
            let value = format!("{}", (max + 1.0).round());
            let mut overrides = HashMap::new();
            overrides.insert(spec.key.clone(), (value.clone(), "above-max".to_string()));
            cases.push(build_case(
                format!("TC-SETTING-FAULT-{:04}-HIGH", index + 1),
                format!("设置项高于上限：{}", spec.name),
                "setting-fault",
                "根据设置数据最大值生成 max+1 异常条目。".to_string(),
                vec!["setting-data", "sdo", "above-max"],
                build_setting_frames(specs, "setting-above-max", &overrides),
                vec![build_setting_entry(spec, value, "above-max")],
            ));
        }
    }
    cases
}

fn nominal_case(specs: &[FrameSpec], setting_specs: &[SettingSpec]) -> CanTestCase {
    let mut frames = specs
        .iter()
        .map(|spec| build_frame(spec, "nominal", &HashMap::new(), None))
        .collect::<Vec<_>>();
    frames.extend(build_setting_frames(
        setting_specs,
        "setting-default",
        &HashMap::new(),
    ));
    build_case(
        "TC-SMOKE-001".to_string(),
        "全帧正常值冒烟".to_string(),
        "nominal",
        "所有已识别 CAN 帧按正常业务值生成一次。".to_string(),
        vec!["smoke", "nominal"],
        frames,
        setting_nominal_entries(setting_specs),
    )
}

fn frame_boundary_cases(specs: &[FrameSpec]) -> Vec<CanTestCase> {
    let mut cases = Vec::new();
    for (index, spec) in specs.iter().enumerate() {
        let mut min_overrides = HashMap::new();
        let mut max_overrides = HashMap::new();
        for sig in &spec.signals {
            let min_raw = sig.min_value.map(|v| display_to_raw(v, sig)).unwrap_or(0);
            let max_raw = sig
                .max_value
                .map(|v| display_to_raw(v, sig))
                .unwrap_or_else(|| max_raw(sig.len));
            min_overrides.insert(sig.key.clone(), (min_raw, "min-boundary".to_string()));
            max_overrides.insert(sig.key.clone(), (max_raw, "max-boundary".to_string()));
        }
        cases.push(build_case(
            format!("TC-BOUNDARY-{:03}-MIN", index + 1),
            format!("{} 全信号最小边界", spec.name),
            "boundary",
            "同一帧内所有信号同时取最小边界，用于快速暴露下限处理问题。".to_string(),
            vec!["boundary", "min"],
            vec![build_frame(spec, "boundary-min", &min_overrides, None)],
            Vec::new(),
        ));
        cases.push(build_case(
            format!("TC-BOUNDARY-{:03}-MAX", index + 1),
            format!("{} 全信号最大边界", spec.name),
            "boundary",
            "同一帧内所有信号同时取最大边界，用于快速暴露上限和位宽处理问题。".to_string(),
            vec!["boundary", "max"],
            vec![build_frame(spec, "boundary-max", &max_overrides, None)],
            Vec::new(),
        ));
        cases.push(build_case(
            format!("TC-PATTERN-{:03}-AA", index + 1),
            format!("{} 交替位型 0xAA", spec.name),
            "bit-pattern",
            "整帧填充 0xAA，用于观察位偏移、掩码和保留位处理。".to_string(),
            vec!["pattern", "0xAA"],
            vec![build_frame(spec, "pattern-aa", &HashMap::new(), Some(0xAA))],
            Vec::new(),
        ));
        cases.push(build_case(
            format!("TC-PATTERN-{:03}-55", index + 1),
            format!("{} 交替位型 0x55", spec.name),
            "bit-pattern",
            "整帧填充 0x55，与 0xAA 配对检查相邻 bit 解析。".to_string(),
            vec!["pattern", "0x55"],
            vec![build_frame(spec, "pattern-55", &HashMap::new(), Some(0x55))],
            Vec::new(),
        ));
    }
    cases
}

fn single_signal_cases(specs: &[FrameSpec]) -> Vec<CanTestCase> {
    let mut cases = Vec::new();
    let mut case_index = 1;
    for spec in specs {
        for sig in &spec.signals {
            let mut min_overrides = HashMap::new();
            let mut max_overrides = HashMap::new();
            min_overrides.insert(
                sig.key.clone(),
                (
                    sig.min_value.map(|v| display_to_raw(v, sig)).unwrap_or(0),
                    format!("{}-min", sig.name),
                ),
            );
            max_overrides.insert(
                sig.key.clone(),
                (
                    sig.max_value
                        .map(|v| display_to_raw(v, sig))
                        .unwrap_or_else(|| max_raw(sig.len)),
                    format!("{}-max", sig.name),
                ),
            );
            cases.push(build_case(
                format!("TC-SIGNAL-{:04}-MIN", case_index),
                format!("{} 单信号下限：{}", spec.name, sig.name),
                "single-signal",
                "只改变一个信号，其他信号保持正常值，便于定位字段解析问题。".to_string(),
                vec!["single-signal", "min"],
                vec![build_frame(spec, "signal-min", &min_overrides, None)],
                Vec::new(),
            ));
            cases.push(build_case(
                format!("TC-SIGNAL-{:04}-MAX", case_index),
                format!("{} 单信号上限：{}", spec.name, sig.name),
                "single-signal",
                "只改变一个信号，其他信号保持正常值，便于定位字段解析问题。".to_string(),
                vec!["single-signal", "max"],
                vec![build_frame(spec, "signal-max", &max_overrides, None)],
                Vec::new(),
            ));
            case_index += 1;
        }
    }
    cases
}

fn fault_cases(specs: &[FrameSpec]) -> Vec<CanTestCase> {
    let mut cases = Vec::new();
    if let Some(first) = specs.first() {
        let normal = build_frame(first, "fault-baseline", &HashMap::new(), None);
        let mut short_dlc = normal.clone();
        short_dlc.scenario = "fault-dlc-short".to_string();
        short_dlc.dlc = short_dlc.dlc.saturating_sub(1).max(1);
        short_dlc.data = short_dlc
            .data
            .split_whitespace()
            .take(short_dlc.dlc as usize)
            .collect::<Vec<_>>()
            .join(" ");

        let mut unknown = normal.clone();
        unknown.scenario = "fault-unknown-id".to_string();
        unknown.id = if normal.frame_type == 0 {
            0x7FF
        } else {
            0x1FFF_FFFF
        };
        unknown.name = format!("未知帧_0x{:X}", unknown.id);

        let mut timeout = normal.clone();
        timeout.scenario = "fault-cycle-zero".to_string();
        timeout.cycle_ms = 0;

        cases.push(build_case(
            "TC-FAULT-001-DLC-SHORT".to_string(),
            "DLC 过短帧".to_string(),
            "fault",
            "模拟 payload 被截断，验证接收端长度校验和容错。".to_string(),
            vec!["fault", "dlc"],
            vec![short_dlc],
            Vec::new(),
        ));
        cases.push(build_case(
            "TC-FAULT-002-UNKNOWN-ID".to_string(),
            "未知 CAN ID".to_string(),
            "fault",
            "发送未配置 CAN ID，验证接收端过滤策略。".to_string(),
            vec!["fault", "unknown-id"],
            vec![unknown],
            Vec::new(),
        ));
        cases.push(build_case(
            "TC-FAULT-003-CYCLE-ZERO".to_string(),
            "周期为 0 的重复帧".to_string(),
            "fault",
            "周期置 0，用于标记单次/异常发送，验证调度配置不会被误当作正常周期。".to_string(),
            vec!["fault", "cycle"],
            vec![timeout],
            Vec::new(),
        ));
    }
    cases
}

pub fn generate_can_test_data(document: &Value, profile: Option<&str>) -> CanTestGenerateResponse {
    let selected = GenerateProfile::from_label(profile);
    let document = if document.get("config_version").and_then(Value::as_str) == Some("jc002") {
        match materialize_active_protocol_profiles(document) {
            Ok(document) => document,
            Err(error) => {
                return CanTestGenerateResponse {
                    frames: Vec::new(),
                    setting_entries: Vec::new(),
                    frame_count: 0,
                    cases: Vec::new(),
                    coverage: CanTestCoverage {
                        frame_count: 0,
                        signal_count: 0,
                        setting_entry_count: 0,
                        case_count: 0,
                        generated_frame_count: 0,
                        generated_setting_entry_count: 0,
                        covered_scenarios: Vec::new(),
                    },
                    warnings: vec![error],
                }
            }
        }
    } else {
        document.clone()
    };
    let mut warnings = Vec::new();
    let specs = collect_frame_specs(&document, &mut warnings);
    let setting_specs = collect_setting_specs(&document, &mut warnings);
    let mut cases = vec![nominal_case(&specs, &setting_specs)];

    if matches!(
        selected,
        GenerateProfile::Boundary | GenerateProfile::Regression
    ) {
        cases.extend(frame_boundary_cases(&specs));
        cases.extend(single_signal_cases(&specs));
        cases.extend(setting_boundary_cases(&setting_specs));
    }

    if matches!(
        selected,
        GenerateProfile::Fault | GenerateProfile::Regression
    ) {
        cases.extend(fault_cases(&specs));
        cases.extend(setting_fault_cases(&setting_specs));
    }

    let frames = cases
        .first()
        .map(|case| case.frames.clone())
        .unwrap_or_default();
    let setting_entries = cases
        .first()
        .map(|case| case.setting_entries.clone())
        .unwrap_or_default();
    let mut scenarios = cases
        .iter()
        .map(|case| case.scenario.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    scenarios.sort();

    let frame_count = frames.len() as u32;
    let signal_count = specs.iter().map(|frame| frame.signals.len() as u32).sum();
    let generated_frame_count = cases.iter().map(|case| case.frames.len() as u32).sum();
    let generated_setting_entry_count = cases
        .iter()
        .map(|case| case.setting_entries.len() as u32)
        .sum();
    let coverage = CanTestCoverage {
        frame_count: specs.len() as u32,
        signal_count,
        setting_entry_count: setting_specs.len() as u32,
        case_count: cases.len() as u32,
        generated_frame_count,
        generated_setting_entry_count,
        covered_scenarios: scenarios,
    };

    CanTestGenerateResponse {
        frames,
        setting_entries,
        frame_count,
        cases,
        coverage,
        warnings,
    }
}
