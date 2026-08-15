//! 多协议模型校验。

use super::battery_monitor::{
    BatteryMonitorProtocol, BatteryRawType, BatteryValueType, BATTERY_MONITOR_BINARY_VERSION,
    BATTERY_MONITOR_SCHEMA_VERSION, BATTERY_PARSE_NO_MASK,
};
use super::model::{CanOpenTransport, MappingTarget, ProtocolMapping, ProtocolValidationReport};
use crate::domain::private_protocol::PrivateProtocolDocument;
use crate::domain::signal::SignalDictionary;
use std::collections::{HashMap, HashSet};

pub(crate) fn validate_protocol_model(
    signal_dictionary: &SignalDictionary,
    canopen: &CanOpenTransport,
    battery_monitor: &BatteryMonitorProtocol,
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
    validate_battery_monitor(battery_monitor, &mut errors, &mut warnings);

    ProtocolValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn validate_battery_monitor(
    protocol: &BatteryMonitorProtocol,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    if protocol.schema_version != BATTERY_MONITOR_SCHEMA_VERSION {
        errors.push(format!(
            "锂电监控必须使用 schema_version={}，当前为 {}",
            BATTERY_MONITOR_SCHEMA_VERSION, protocol.schema_version
        ));
    }
    if protocol.version != BATTERY_MONITOR_BINARY_VERSION {
        errors.push(format!(
            "锂电监控必须使用 version={}，当前为 {}",
            BATTERY_MONITOR_BINARY_VERSION, protocol.version
        ));
    }
    if !protocol.enabled {
        return;
    }

    let mut frame_keys = HashSet::new();
    for frame in &protocol.frames {
        if frame.frame_key.trim().is_empty() {
            errors.push("锂电监控存在空 frame_key".to_string());
        } else if !frame_keys.insert(frame.frame_key.as_str()) {
            errors.push(format!("锂电监控 frame_key 重复：{}", frame.frame_key));
        }
        if frame.dlc == 0 || frame.dlc > 8 {
            errors.push(format!(
                "锂电监控帧 {} 的 DLC 必须在 1..=8 内",
                frame.frame_key
            ));
        }
        if frame.frame_type == 0 && frame.can_id > 0x7ff {
            errors.push(format!(
                "锂电监控标准帧 {} 的 CAN ID 超过 11 位：0x{:X}",
                frame.frame_key, frame.can_id
            ));
        }
    }

    let signal_keys = protocol
        .signals
        .iter()
        .map(|signal| signal.signal_key.as_str())
        .collect::<HashSet<_>>();
    let mut seen_signal_keys = HashSet::new();
    for signal in &protocol.signals {
        if signal.signal_key.trim().is_empty() {
            errors.push("锂电监控存在空 signal_key".to_string());
        } else if !seen_signal_keys.insert(signal.signal_key.as_str()) {
            errors.push(format!("锂电监控 signal_key 重复：{}", signal.signal_key));
        }
        let Some(frame) = protocol
            .frames
            .iter()
            .find(|frame| frame.frame_key == signal.frame_key)
        else {
            errors.push(format!(
                "锂电信号 {} 引用了不存在的帧 {}",
                signal.signal_key, signal.frame_key
            ));
            continue;
        };
        if signal.len == 0
            || u32::from(signal.pos) + u32::from(signal.len) > u32::from(frame.dlc) * 8
        {
            errors.push(format!(
                "锂电信号 {} 位范围超过帧 {}：pos={}, len={}, dlc={}",
                signal.signal_key, signal.frame_key, signal.pos, signal.len, frame.dlc
            ));
        }
        let raw_width = match signal.raw_type {
            BatteryRawType::U8 => 1,
            BatteryRawType::U16Le => 2,
            BatteryRawType::U32Le => 4,
            BatteryRawType::DateTimeYmdhms => 7,
        };
        if u16::from(signal.raw_offset) + raw_width > u16::from(frame.dlc) {
            errors.push(format!(
                "锂电信号 {} 的 raw_offset/raw_type 超过帧 {}：offset={}, width={}, dlc={}",
                signal.signal_key, signal.frame_key, signal.raw_offset, raw_width, frame.dlc
            ));
        }
        if signal.parse_resolution == 0.0 {
            warnings.push(format!("锂电信号 {} 的解析倍率为 0", signal.signal_key));
        }
        if signal.parse_mask != BATTERY_PARSE_NO_MASK && signal.parse_shift >= 32 {
            errors.push(format!(
                "锂电信号 {} 的 parse_shift 无效",
                signal.signal_key
            ));
        }
        if matches!(signal.value_type, BatteryValueType::DateTime)
            && !matches!(signal.raw_type, BatteryRawType::DateTimeYmdhms)
        {
            errors.push(format!(
                "锂电信号 {} 的 value_type=datetime 必须使用 datetime_ymdhms",
                signal.signal_key
            ));
        }
    }

    let mut item_keys = HashSet::new();
    let mut orders = HashSet::new();
    for item in &protocol.items {
        if item.item_key.trim().is_empty() || !item_keys.insert(item.item_key.as_str()) {
            errors.push(format!("锂电显示项 item_key 无效或重复：{}", item.item_key));
        }
        if !item.enabled {
            continue;
        }
        if !orders.insert(item.order) {
            warnings.push(format!("锂电显示项 order 重复：{}", item.order));
        }
        if !signal_keys.contains(item.signal_key.as_str()) {
            errors.push(format!(
                "锂电显示项 {} 引用了不存在的信号 {}",
                item.item_key, item.signal_key
            ));
        }
        if item.name_key.trim().is_empty() {
            errors.push(format!("锂电显示项 {} 缺少 name_key", item.item_key));
        }
        if !item.validity.frame_key.is_empty()
            && !frame_keys.contains(item.validity.frame_key.as_str())
        {
            errors.push(format!(
                "锂电显示项 {} 引用了不存在的有效性帧 {}",
                item.item_key, item.validity.frame_key
            ));
        }
        if item.formatter.scale_den == 0 {
            errors.push(format!(
                "锂电显示项 {} 的 scale_den 不能为 0",
                item.item_key
            ));
        }
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
