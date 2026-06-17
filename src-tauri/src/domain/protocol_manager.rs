//! 统一协议管理器兼容门面。
//!
//! 实际实现已拆分到 domain::protocol。保留本模块的 public API，避免影响
//! Tauri command、CLI 和前端类型契约。

pub use crate::domain::protocol::model::*;

use crate::domain::protocol::legacy_adapter;
use serde_json::Value;

pub fn build_unified_protocol_model(document: &Value) -> UnifiedProtocolModel {
    legacy_adapter::build_unified_protocol_model(document)
}

pub fn migrate_project_to_unified_protocol(document: Value) -> Value {
    legacy_adapter::migrate_project_to_unified_protocol(document)
}

pub fn flatten_unified_protocol_to_legacy(document: Value) -> ProtocolCompatibilityReport {
    legacy_adapter::flatten_unified_protocol_to_legacy(document)
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

    #[test]
    fn explicit_protocol_mapping_drives_canopen_projection() {
        let document = json!({
            "signal_dictionary": { "signals": [{ "signal_id": "A", "name": "Signal A" }] },
            "pdo_recv": [{ "id": 0x101, "type": 0, "desc": "legacy", "data": [{ "param_id": "A", "pos": 0, "len": 8, "show_type": 0, "handle": 0, "handle_param": "" }] }],
            "pdo_send": [],
            "protocol_mapping": [{
                "signal_id": "A",
                "target": { "kind": "can_open_pdo", "direction": "receive", "frame_id": 0x202, "bit_offset": 16, "bit_length": 16 }
            }],
            "battery_monitor_info": { "enabled": false }
        });

        let model = build_unified_protocol_model(&document);

        assert!(model.validation.valid, "{:?}", model.validation.errors);
        assert_eq!(model.canopen.pdo_recv.len(), 1);
        assert_eq!(model.canopen.pdo_recv[0].frame_id, 0x202);
        assert_eq!(model.canopen.pdo_recv[0].mappings[0].bit_offset, 16);
    }

    #[test]
    fn flatten_unified_protocol_generates_legacy_pdo_sections() {
        let document = json!({
            "signal_dictionary": {
                "signals": [{
                    "signal_id": "A",
                    "name": "Signal A",
                    "data_type": "u16",
                    "default_value": "7",
                    "inner": 3
                }]
            },
            "protocol_mapping": [{
                "signal_id": "A",
                "target": { "kind": "can_open_pdo", "direction": "receive", "frame_id": 0x202, "bit_offset": 8, "bit_length": 16 }
            }],
            "battery_monitor_info": { "enabled": false }
        });

        let report = flatten_unified_protocol_to_legacy(document);

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(
            report.updated_sections,
            vec!["pdo_global_param", "pdo_recv", "pdo_send"]
        );
        assert_eq!(report.document["pdo_global_param"][0]["param_id"], "A");
        assert_eq!(report.document["pdo_global_param"][0]["type"], 1);
        assert_eq!(report.document["pdo_recv"][0]["id"], 0x202);
        assert_eq!(report.document["pdo_recv"][0]["data"][0]["pos"], 8);
        assert_eq!(report.document["pdo_recv"][0]["data"][0]["param_id"], "A");
    }

    #[test]
    fn flatten_unified_protocol_preserves_unrelated_legacy_sections() {
        let document = json!({
            "signal_dictionary": {
                "signals": [{ "signal_id": "A", "name": "Signal A", "data_type": "u8" }]
            },
            "protocol_mapping": [{
                "signal_id": "A",
                "target": { "kind": "can_open_pdo", "direction": "send", "frame_id": 0x301, "bit_offset": 0, "bit_length": 8 }
            }],
            "sdo_info": { "type": 0, "name": "root", "children": [] },
            "pdo_simple_send_recv": { "pdo_recv": [{ "id": 1 }], "pdo_send": [] },
            "private_protocol": { "enabled": true, "frames": [] },
            "battery_monitor_info": { "enabled": false }
        });

        let report = flatten_unified_protocol_to_legacy(document.clone());

        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.updated_sections, vec!["pdo_global_param", "pdo_recv", "pdo_send"]);
        assert_eq!(report.document["sdo_info"], document["sdo_info"]);
        assert_eq!(report.document["pdo_simple_send_recv"], document["pdo_simple_send_recv"]);
        assert_eq!(report.document["private_protocol"], document["private_protocol"]);
        assert_eq!(report.document["battery_monitor_info"], document["battery_monitor_info"]);
    }
}
