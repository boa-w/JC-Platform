//! 私有协议传输层模型。
//!
//! 私有协议只描述帧和载荷布局，不承载业务展示语义；业务语义通过 SignalId 引用。

use crate::domain::protocol::battery_bridge::derive_battery_monitor_private_frames;
use crate::domain::signal::SignalId;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct PrivateProtocolDocument {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub frames: Vec<PrivateFrame>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrivateFrame {
    pub frame_id: u32,
    #[serde(default)]
    pub frame_key: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub frame_type: PrivateFrameType,
    #[serde(default)]
    pub cycle_ms: u16,
    #[serde(default)]
    pub checksum: ChecksumType,
    #[serde(default)]
    pub byte_order: ByteOrder,
    #[serde(default)]
    pub payload: Vec<PrivatePayloadSignal>,
    #[serde(default)]
    pub source: PrivateFrameSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PrivatePayloadSignal {
    pub signal_id: SignalId,
    pub bit_offset: u16,
    pub bit_length: u16,
    #[serde(default)]
    pub byte_order: ByteOrder,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrivateFrameType {
    #[default]
    CanStandard,
    CanExtended,
    Serial,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChecksumType {
    #[default]
    None,
    Sum8,
    Crc8,
    Crc16,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ByteOrder {
    #[default]
    LittleEndian,
    BigEndian,
    Motorola,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrivateFrameSource {
    #[default]
    Manual,
    BatteryMonitor,
    Imported,
}

pub fn derive_private_protocol_from_legacy(document: &Value) -> PrivateProtocolDocument {
    let mut protocol = document
        .get("private_protocol")
        .and_then(|value| serde_json::from_value::<PrivateProtocolDocument>(value.clone()).ok())
        .unwrap_or_default();

    merge_battery_monitor_private_frames(document, &mut protocol);
    protocol.enabled = protocol.enabled || !protocol.frames.is_empty();
    protocol
}

fn merge_battery_monitor_private_frames(document: &Value, protocol: &mut PrivateProtocolDocument) {
    for frame in derive_battery_monitor_private_frames(document) {
        if protocol.frames.iter().any(|item| {
            item.source == PrivateFrameSource::BatteryMonitor && item.frame_key == frame.frame_key
        }) {
            continue;
        }
        protocol.frames.push(frame);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn derives_battery_monitor_frames_as_private_protocol() {
        let document = json!({
            "battery_monitor_info": {
                "enabled": true,
                "frames": [{ "frame_key": "bat_2f0", "can_id": 752, "type": 0, "desc": "battery", "timeout_ticks": 200 }],
                "signals": [{ "signal_key": "voltage", "param_id": "BATTERY_VOLTAGE", "frame_key": "bat_2f0", "pos": 0, "len": 16 }]
            }
        });

        let protocol = derive_private_protocol_from_legacy(&document);

        assert!(protocol.enabled);
        assert_eq!(protocol.frames.len(), 1);
        assert_eq!(protocol.frames[0].payload[0].signal_id, "BATTERY_VOLTAGE");
    }
}
