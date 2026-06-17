//! 锂电监控配置到私有协议帧的历史兼容桥。
//!
//! 该桥接只服务旧项目兼容。CANOpen 主线后续可以选择不加载该扩展。

use crate::domain::private_protocol::{ByteOrder, ChecksumType, PrivateFrame, PrivateFrameSource, PrivateFrameType, PrivatePayloadSignal};
use serde_json::Value;

pub(crate) fn derive_battery_monitor_private_frames(document: &Value) -> Vec<PrivateFrame> {
    let Some(root) = document.get("battery_monitor_info") else {
        return Vec::new();
    };
    if !root
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Vec::new();
    }
    let Some(frames) = root.get("frames").and_then(Value::as_array) else {
        return Vec::new();
    };
    let signals = root
        .get("signals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    frames
        .iter()
        .filter_map(|frame| {
            let frame_key = object_string(frame, "frame_key");
            if frame_key.is_empty() {
                return None;
            }
            let payload = signals
                .iter()
                .filter(|signal| object_string(signal, "frame_key") == frame_key)
                .filter_map(|signal| {
                    let signal_id = object_string(signal, "param_id");
                    if signal_id.is_empty() {
                        return None;
                    }
                    Some(PrivatePayloadSignal {
                        signal_id,
                        bit_offset: object_u16(signal, "pos"),
                        bit_length: object_u16(signal, "len"),
                        byte_order: ByteOrder::LittleEndian,
                    })
                })
                .collect::<Vec<_>>();

            Some(PrivateFrame {
                frame_id: object_u32(frame, "can_id"),
                frame_key,
                name: object_string(frame, "desc"),
                frame_type: match object_u32(frame, "type") {
                    1 => PrivateFrameType::CanExtended,
                    _ => PrivateFrameType::CanStandard,
                },
                cycle_ms: object_u16(frame, "timeout_ticks"),
                checksum: ChecksumType::None,
                byte_order: ByteOrder::LittleEndian,
                payload,
                source: PrivateFrameSource::BatteryMonitor,
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

fn object_u16(value: &Value, key: &str) -> u16 {
    object_u32(value, key).min(u16::MAX as u32) as u16
}
