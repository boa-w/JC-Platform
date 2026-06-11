//! 统一协议管理器。
//!
//! 该模块把旧版 CANopen SDO/PDO、锂电私有帧和新私有协议段落投影为统一模型。
//! 目前它是旁路适配层：导出仍可继续使用旧段落，从而保持下位机二进制兼容。

use crate::domain::private_protocol::{
    derive_private_protocol_from_legacy, PrivateProtocolDocument,
};
use crate::domain::signal::{
    derive_signal_dictionary_from_legacy, normalize_signal_id, SignalDictionary, SignalId,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UnifiedProtocolModel {
    pub signal_dictionary: SignalDictionary,
    pub canopen: CanOpenTransport,
    pub private_protocol: PrivateProtocolDocument,
    pub mappings: Vec<ProtocolMapping>,
    pub validation: ProtocolValidationReport,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanOpenTransport {
    #[serde(default)]
    pub sdo_objects: Vec<CanOpenSdoObject>,
    #[serde(default)]
    pub pdo_recv: Vec<CanOpenPdoFrame>,
    #[serde(default)]
    pub pdo_send: Vec<CanOpenPdoFrame>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanOpenSdoObject {
    pub signal_id: Option<SignalId>,
    pub name: String,
    pub frame_id: u32,
    pub index: u16,
    pub subindex: u8,
    pub access: u8,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanOpenPdoFrame {
    pub frame_id: u32,
    pub frame_type: u8,
    pub direction: PdoMappingDirection,
    pub description: String,
    pub mappings: Vec<CanOpenPdoMapping>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanOpenPdoMapping {
    pub signal_id: SignalId,
    pub bit_offset: u16,
    pub bit_length: u16,
    pub show_type: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PdoMappingDirection {
    Receive,
    Send,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolMapping {
    pub signal_id: SignalId,
    pub target: MappingTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MappingTarget {
    CanOpenSdo {
        index: u16,
        subindex: u8,
    },
    CanOpenPdo {
        direction: PdoMappingDirection,
        frame_id: u32,
        bit_offset: u16,
        bit_length: u16,
    },
    PrivateFrame {
        frame_key: String,
        frame_id: u32,
        bit_offset: u16,
        bit_length: u16,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProtocolValidationReport {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

pub fn build_unified_protocol_model(document: &Value) -> UnifiedProtocolModel {
    let signal_dictionary = document
        .get("signal_dictionary")
        .and_then(|value| serde_json::from_value::<SignalDictionary>(value.clone()).ok())
        .unwrap_or_else(|| derive_signal_dictionary_from_legacy(document));
    let private_protocol = derive_private_protocol_from_legacy(document);
    let canopen = derive_canopen_transport(document);
    let mappings = derive_mappings(&canopen, &private_protocol);
    let validation =
        validate_protocol_model(&signal_dictionary, &canopen, &private_protocol, &mappings);

    UnifiedProtocolModel {
        signal_dictionary,
        canopen,
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

fn derive_canopen_transport(document: &Value) -> CanOpenTransport {
    let mut transport = CanOpenTransport::default();
    collect_sdo_objects(document.get("sdo_info"), &mut transport.sdo_objects);
    collect_advanced_pdo(document, &mut transport);
    if transport.pdo_recv.is_empty() && transport.pdo_send.is_empty() {
        collect_simple_pdo(document, &mut transport);
    }
    transport
}

fn collect_sdo_objects(node: Option<&Value>, target: &mut Vec<CanOpenSdoObject>) {
    let Some(node) = node else {
        return;
    };
    if node.get("type").and_then(Value::as_u64).unwrap_or(0) == 1 {
        let index = object_u32(node, "mid") as u16;
        let subindex = object_u32(node, "sid") as u8;
        let name = object_string(node, "name");
        target.push(CanOpenSdoObject {
            signal_id: Some(format!(
                "SDO_{index:04X}_{subindex:02X}_{}",
                normalize_signal_id(&name)
            )),
            name,
            frame_id: object_u32(node, "fid"),
            index,
            subindex,
            access: object_u32(node, "control_rw") as u8,
            data_type: object_string(node, "handle_name"),
        });
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_sdo_objects(Some(child), target);
        }
    }
}

fn collect_advanced_pdo(document: &Value, transport: &mut CanOpenTransport) {
    for (section, direction) in [
        ("pdo_recv", PdoMappingDirection::Receive),
        ("pdo_send", PdoMappingDirection::Send),
    ] {
        let Some(frames) = document.get(section).and_then(Value::as_array) else {
            continue;
        };
        let target = if direction == PdoMappingDirection::Receive {
            &mut transport.pdo_recv
        } else {
            &mut transport.pdo_send
        };
        for frame in frames {
            target.push(CanOpenPdoFrame {
                frame_id: object_u32(frame, "id"),
                frame_type: object_u32(frame, "type") as u8,
                direction: direction.clone(),
                description: object_string(frame, "desc"),
                mappings: frame
                    .get("data")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| {
                                let signal_id = object_string(item, "param_id");
                                if signal_id.is_empty() {
                                    return None;
                                }
                                Some(CanOpenPdoMapping {
                                    signal_id,
                                    bit_offset: object_u32(item, "pos") as u16,
                                    bit_length: object_u32(item, "len") as u16,
                                    show_type: object_u32(item, "show_type") as u8,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
    }
}

fn collect_simple_pdo(document: &Value, transport: &mut CanOpenTransport) {
    let Some(simple) = document.get("pdo_simple_send_recv") else {
        return;
    };
    for (section, direction) in [
        ("pdo_recv", PdoMappingDirection::Receive),
        ("pdo_send", PdoMappingDirection::Send),
    ] {
        let Some(frames) = simple.get(section).and_then(Value::as_array) else {
            continue;
        };
        let target = if direction == PdoMappingDirection::Receive {
            &mut transport.pdo_recv
        } else {
            &mut transport.pdo_send
        };
        for frame in frames {
            target.push(CanOpenPdoFrame {
                frame_id: object_u32(frame, "id"),
                frame_type: object_u32(frame, "type") as u8,
                direction: direction.clone(),
                description: object_string(frame, "desc"),
                mappings: frame
                    .get("data")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|item| {
                                let name = object_string(item, "pdo_param_name");
                                if name.is_empty() {
                                    return None;
                                }
                                Some(CanOpenPdoMapping {
                                    signal_id: normalize_signal_id(&name),
                                    bit_offset: object_u32(item, "pos") as u16,
                                    bit_length: object_u32(item, "len") as u16,
                                    show_type: object_u32(item, "show_type") as u8,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
    }
}

fn derive_mappings(
    canopen: &CanOpenTransport,
    private_protocol: &PrivateProtocolDocument,
) -> Vec<ProtocolMapping> {
    let mut mappings = Vec::new();
    mappings.extend(canopen.sdo_objects.iter().filter_map(|object| {
        object.signal_id.as_ref().map(|signal_id| ProtocolMapping {
            signal_id: signal_id.clone(),
            target: MappingTarget::CanOpenSdo {
                index: object.index,
                subindex: object.subindex,
            },
        })
    }));
    for frame in canopen.pdo_recv.iter().chain(canopen.pdo_send.iter()) {
        for item in &frame.mappings {
            mappings.push(ProtocolMapping {
                signal_id: item.signal_id.clone(),
                target: MappingTarget::CanOpenPdo {
                    direction: frame.direction.clone(),
                    frame_id: frame.frame_id,
                    bit_offset: item.bit_offset,
                    bit_length: item.bit_length,
                },
            });
        }
    }
    for frame in &private_protocol.frames {
        for item in &frame.payload {
            mappings.push(ProtocolMapping {
                signal_id: item.signal_id.clone(),
                target: MappingTarget::PrivateFrame {
                    frame_key: frame.frame_key.clone(),
                    frame_id: frame.frame_id,
                    bit_offset: item.bit_offset,
                    bit_length: item.bit_length,
                },
            });
        }
    }
    mappings
}

fn validate_protocol_model(
    signal_dictionary: &SignalDictionary,
    canopen: &CanOpenTransport,
    private_protocol: &PrivateProtocolDocument,
    mappings: &[ProtocolMapping],
) -> ProtocolValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let signal_ids = signal_dictionary.ids();
    let mut signal_targets: HashMap<&str, HashSet<&'static str>> = HashMap::new();

    for mapping in mappings {
        if !signal_ids.contains(&mapping.signal_id) {
            errors.push(format!("映射引用了不存在的 Signal：{}", mapping.signal_id));
        }
        match &mapping.target {
            MappingTarget::CanOpenPdo {
                bit_offset,
                bit_length,
                ..
            }
            | MappingTarget::PrivateFrame {
                bit_offset,
                bit_length,
                ..
            } => {
                if *bit_length == 0 {
                    errors.push(format!("{} 的映射长度不能为 0", mapping.signal_id));
                }
                if (*bit_offset as u32) + (*bit_length as u32) > 64 {
                    errors.push(format!("{} 的 CAN 帧映射超过 8 字节", mapping.signal_id));
                }
            }
            MappingTarget::CanOpenSdo { .. } => {}
        }
        signal_targets
            .entry(&mapping.signal_id)
            .or_default()
            .insert(mapping_target_family(&mapping.target));
    }

    for (signal_id, families) in signal_targets {
        if families.contains("canopen_pdo") && families.contains("private_frame") {
            warnings.push(format!(
                "{} 同时映射到 CANopen PDO 和私有帧，请确认是否为有意混杂",
                signal_id
            ));
        }
    }

    validate_overlaps("CANopen PDO", canopen, &mut errors);
    validate_private_overlaps(private_protocol, &mut errors);

    ProtocolValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn validate_overlaps(label: &str, canopen: &CanOpenTransport, errors: &mut Vec<String>) {
    for frame in canopen.pdo_recv.iter().chain(canopen.pdo_send.iter()) {
        let mut used = [false; 64];
        for item in &frame.mappings {
            for bit in item.bit_offset..item.bit_offset.saturating_add(item.bit_length) {
                if bit >= 64 {
                    continue;
                }
                if used[bit as usize] {
                    errors.push(format!(
                        "{label} 0x{:X} 存在位重叠：{} bit{}",
                        frame.frame_id, item.signal_id, bit
                    ));
                    break;
                }
                used[bit as usize] = true;
            }
        }
    }
}

fn validate_private_overlaps(protocol: &PrivateProtocolDocument, errors: &mut Vec<String>) {
    for frame in &protocol.frames {
        let mut used = [false; 64];
        for item in &frame.payload {
            for bit in item.bit_offset..item.bit_offset.saturating_add(item.bit_length) {
                if bit >= 64 {
                    continue;
                }
                if used[bit as usize] {
                    errors.push(format!(
                        "私有帧 0x{:X} 存在位重叠：{} bit{}",
                        frame.frame_id, item.signal_id, bit
                    ));
                    break;
                }
                used[bit as usize] = true;
            }
        }
    }
}

fn mapping_target_family(target: &MappingTarget) -> &'static str {
    match target {
        MappingTarget::CanOpenSdo { .. } => "canopen_sdo",
        MappingTarget::CanOpenPdo { .. } => "canopen_pdo",
        MappingTarget::PrivateFrame { .. } => "private_frame",
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_unified_model_from_legacy_pdo_and_sdo() {
        let document = json!({
            "pdo_global_param": [{ "param_id": "BATTERY_VOLTAGE", "name": "电压", "type": 1, "def": "0", "inner": 17 }],
            "pdo_condition": [],
            "pdo_recv": [{ "id": 0x201, "type": 0, "desc": "recv", "data": [{ "param_id": "BATTERY_VOLTAGE", "pos": 0, "len": 16, "show_type": 0, "handle": 0, "handle_param": "" }] }],
            "pdo_send": [],
            "sdo_info": { "type": 0, "name": "root", "children": [{ "type": 1, "name": "参数A", "fid": 1, "mid": 0x2000, "sid": 1, "control_rw": 1, "handle_name": "u8" }] },
            "battery_monitor_info": { "enabled": false }
        });

        let model = build_unified_protocol_model(&document);

        assert!(model.validation.valid, "{:?}", model.validation.errors);
        assert_eq!(model.signal_dictionary.signals.len(), 2);
        assert_eq!(model.canopen.pdo_recv.len(), 1);
        assert!(model
            .mappings
            .iter()
            .any(|mapping| mapping.signal_id == "BATTERY_VOLTAGE"));
    }

    #[test]
    fn validates_can_frame_bounds() {
        let document = json!({
            "signal_dictionary": { "signals": [{ "signal_id": "A", "name": "A" }] },
            "pdo_recv": [{ "id": 1, "type": 0, "desc": "", "data": [{ "param_id": "A", "pos": 63, "len": 2, "show_type": 0, "handle": 0, "handle_param": "" }] }],
            "pdo_send": [],
            "battery_monitor_info": { "enabled": false }
        });

        let model = build_unified_protocol_model(&document);

        assert!(!model.validation.valid);
        assert!(model
            .validation
            .errors
            .iter()
            .any(|error| error.contains("超过 8 字节")));
    }
}
