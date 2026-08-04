//! Legacy 项目文档与统一协议模型之间的兼容适配器。
//!
//! 对外行为保持与旧 protocol_manager 一致：导出仍使用旧段落，flatten 只回写高级 PDO 三段。

use super::battery_monitor::parse_battery_monitor_protocol;
use super::canopen_projection::derive_canopen_transport;
use super::mapping::{canopen_transport_from_mappings, derive_mappings, parse_explicit_mappings};
use super::model::{
    CanOpenPdoFrame, CanOpenTransport, ProtocolCompatibilityReport, UnifiedProtocolModel,
};
use super::validation::validate_protocol_model;
use crate::domain::private_protocol::derive_private_protocol_from_legacy;
use crate::domain::signal::{
    derive_signal_dictionary_from_legacy, SignalDataType, SignalDefinition, SignalDictionary,
    SignalId,
};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub fn build_unified_protocol_model(document: &Value) -> UnifiedProtocolModel {
    let signal_dictionary = document
        .get("signal_dictionary")
        .and_then(|value| serde_json::from_value::<SignalDictionary>(value.clone()).ok())
        .unwrap_or_else(|| derive_signal_dictionary_from_legacy(document));
    let private_protocol = derive_private_protocol_from_legacy(document);
    let battery_monitor = parse_battery_monitor_protocol(document);
    let legacy_canopen = derive_canopen_transport(document);
    let explicit_mappings = parse_explicit_mappings(document);
    let (canopen, mappings) = if explicit_mappings.is_empty() {
        let mappings = derive_mappings(&legacy_canopen, &private_protocol);
        (legacy_canopen, mappings)
    } else {
        (
            canopen_transport_from_mappings(&legacy_canopen, &explicit_mappings),
            explicit_mappings,
        )
    };
    let validation = validate_protocol_model(
        &signal_dictionary,
        &canopen,
        &battery_monitor,
        &private_protocol,
        &mappings,
    );

    UnifiedProtocolModel {
        signal_dictionary,
        canopen,
        battery_monitor,
        private_protocol,
        mappings,
        validation,
    }
}

pub fn migrate_project_to_unified_protocol(document: Value) -> Value {
    let mut map = match document {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    let current = Value::Object(map.clone());
    let unified = build_unified_protocol_model(&current);
    map.entry("signal_dictionary".to_string())
        .or_insert_with(|| json!(unified.signal_dictionary));
    map.entry("private_protocol".to_string())
        .or_insert_with(|| json!(unified.private_protocol));
    map.insert("protocol_mapping".to_string(), json!(unified.mappings));
    Value::Object(map)
}

/// 将新三层模型拍平为旧版高级 PDO 段，供现有导出引擎继续使用。
///
/// 该适配器只更新 `pdo_global_param`、`pdo_recv`、`pdo_send`，不覆盖旧 SDO 树、
/// 简化 PDO 表或私有协议段，避免影响尚未迁移的配置。
pub fn flatten_unified_protocol_to_legacy(document: Value) -> ProtocolCompatibilityReport {
    let source_document = document.clone();
    let model = build_unified_protocol_model(&source_document);
    let mut errors = model.validation.errors.clone();
    let mut warnings = model.validation.warnings.clone();

    if !errors.is_empty() {
        return ProtocolCompatibilityReport {
            valid: false,
            document,
            updated_sections: Vec::new(),
            errors,
            warnings,
        };
    }

    let signal_map = model
        .signal_dictionary
        .signals
        .iter()
        .map(|signal| (signal.signal_id.clone(), signal))
        .collect::<HashMap<_, _>>();
    let pdo_signal_order = collect_pdo_signal_order(&model.canopen);

    if pdo_signal_order.is_empty() {
        warnings.push("协议映射中没有 CANopen PDO 映射，旧版 PDO 段未生成数据项".to_string());
    }

    let mut missing_signals = Vec::new();
    let pdo_global_param = pdo_signal_order
        .iter()
        .filter_map(|signal_id| {
            let Some(signal) = signal_map.get(signal_id) else {
                missing_signals.push(signal_id.clone());
                return None;
            };
            Some(signal_to_legacy_global_param(signal))
        })
        .collect::<Vec<_>>();

    if !missing_signals.is_empty() {
        errors.push(format!(
            "无法生成旧版 PDO，全局变量缺少 Signal：{}",
            missing_signals.join("、")
        ));
        return ProtocolCompatibilityReport {
            valid: false,
            document,
            updated_sections: Vec::new(),
            errors,
            warnings,
        };
    }

    let mut map = match document {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    map.insert(
        "pdo_global_param".to_string(),
        Value::Array(pdo_global_param),
    );
    map.insert(
        "pdo_recv".to_string(),
        Value::Array(legacy_pdo_frames(&model.canopen.pdo_recv)),
    );
    map.insert(
        "pdo_send".to_string(),
        Value::Array(legacy_pdo_frames(&model.canopen.pdo_send)),
    );

    ProtocolCompatibilityReport {
        valid: errors.is_empty(),
        document: Value::Object(map),
        updated_sections: vec![
            "pdo_global_param".to_string(),
            "pdo_recv".to_string(),
            "pdo_send".to_string(),
        ],
        errors,
        warnings,
    }
}

fn collect_pdo_signal_order(canopen: &CanOpenTransport) -> Vec<SignalId> {
    let mut ids = Vec::new();
    for frame in canopen.pdo_recv.iter().chain(canopen.pdo_send.iter()) {
        for item in &frame.mappings {
            if !ids.contains(&item.signal_id) {
                ids.push(item.signal_id.clone());
            }
        }
    }
    ids
}

fn signal_to_legacy_global_param(signal: &SignalDefinition) -> Value {
    json!({
        "param_id": signal.signal_id,
        "name": signal.name,
        "def": signal.default_value.clone().unwrap_or_default(),
        "reserved": 0,
        "type": signal_data_type_to_legacy(&signal.data_type),
        "inner": signal.inner.unwrap_or(-1)
    })
}

fn signal_data_type_to_legacy(data_type: &SignalDataType) -> i64 {
    match data_type {
        SignalDataType::U8 | SignalDataType::Bool => 0,
        SignalDataType::U16 => 1,
        SignalDataType::U32 => 2,
        SignalDataType::I8 => 9,
        SignalDataType::I16 => 10,
        SignalDataType::I32 => 11,
        SignalDataType::F32 => 12,
        SignalDataType::String => 30,
        SignalDataType::Bytes => 31,
        SignalDataType::Custom(value) => value.parse::<i64>().unwrap_or(0),
    }
}

fn legacy_pdo_frames(frames: &[CanOpenPdoFrame]) -> Vec<Value> {
    frames
        .iter()
        .map(|frame| {
            json!({
                "id": frame.frame_id,
                "type": frame.frame_type,
                "desc": frame.description,
                "data": frame.mappings.iter().map(|item| {
                    json!({
                        "pos": item.bit_offset,
                        "len": item.bit_length,
                        "show_type": item.show_type,
                        "handle": 0,
                        "handle_param": "",
                        "param_id": item.signal_id
                    })
                }).collect::<Vec<_>>()
            })
        })
        .collect()
}

fn object_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn object_u32(value: &Value, key: &str) -> u32 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0) as u32
}
