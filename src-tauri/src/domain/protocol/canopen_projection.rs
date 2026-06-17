//! CANOpen legacy 段到统一传输模型的投影。

use super::model::{CanOpenPdoFrame, CanOpenPdoMapping, CanOpenSdoObject, CanOpenTransport, PdoMappingDirection};
use crate::domain::signal::normalize_signal_id;
use serde_json::Value;

pub(crate) fn derive_canopen_transport(document: &Value) -> CanOpenTransport {
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
