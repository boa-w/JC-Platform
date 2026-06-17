//! 多协议模型校验。

use super::model::{CanOpenTransport, MappingTarget, ProtocolMapping, ProtocolValidationReport};
use crate::domain::private_protocol::PrivateProtocolDocument;
use crate::domain::signal::SignalDictionary;
use std::collections::{HashMap, HashSet};

pub(crate) fn validate_protocol_model(
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

