//! 协议映射解析与投影。

use super::model::{
    CanOpenPdoFrame, CanOpenPdoMapping, CanOpenSdoObject, CanOpenTransport, MappingTarget,
    PdoMappingDirection, ProtocolMapping,
};
use crate::domain::private_protocol::PrivateProtocolDocument;
use serde_json::Value;
use std::collections::HashMap;

pub(crate) fn parse_explicit_mappings(document: &Value) -> Vec<ProtocolMapping> {
    document
        .get("protocol_mapping")
        .and_then(|value| serde_json::from_value::<Vec<ProtocolMapping>>(value.clone()).ok())
        .unwrap_or_default()
}

pub(crate) fn canopen_transport_from_mappings(
    legacy: &CanOpenTransport,
    mappings: &[ProtocolMapping],
) -> CanOpenTransport {
    let mut transport = CanOpenTransport::default();

    for mapping in mappings {
        if let MappingTarget::CanOpenSdo { index, subindex } = &mapping.target {
            let existing = legacy
                .sdo_objects
                .iter()
                .find(|item| item.index == *index && item.subindex == *subindex);
            transport.sdo_objects.push(match existing {
                Some(item) => CanOpenSdoObject {
                    signal_id: Some(mapping.signal_id.clone()),
                    ..item.clone()
                },
                None => CanOpenSdoObject {
                    signal_id: Some(mapping.signal_id.clone()),
                    name: mapping.signal_id.clone(),
                    frame_id: 0,
                    index: *index,
                    subindex: *subindex,
                    access: 0,
                    data_type: String::new(),
                },
            });
        }
    }

    for direction in [PdoMappingDirection::Receive, PdoMappingDirection::Send] {
        let frames = pdo_frames_from_mappings(legacy, mappings, direction.clone());
        match direction {
            PdoMappingDirection::Receive => transport.pdo_recv = frames,
            PdoMappingDirection::Send => transport.pdo_send = frames,
        }
    }

    transport
}

fn pdo_frames_from_mappings(
    legacy: &CanOpenTransport,
    mappings: &[ProtocolMapping],
    direction: PdoMappingDirection,
) -> Vec<CanOpenPdoFrame> {
    let legacy_frames = match direction {
        PdoMappingDirection::Receive => &legacy.pdo_recv,
        PdoMappingDirection::Send => &legacy.pdo_send,
    };
    let mut order = Vec::<u32>::new();
    let mut grouped = HashMap::<u32, Vec<CanOpenPdoMapping>>::new();

    for mapping in mappings {
        let MappingTarget::CanOpenPdo {
            direction: mapping_direction,
            frame_id,
            bit_offset,
            bit_length,
        } = &mapping.target
        else {
            continue;
        };
        if *mapping_direction != direction {
            continue;
        }
        if !grouped.contains_key(frame_id) {
            order.push(*frame_id);
        }
        let show_type = legacy_show_type(
            legacy_frames,
            *frame_id,
            &mapping.signal_id,
            *bit_offset,
            *bit_length,
        );
        grouped
            .entry(*frame_id)
            .or_default()
            .push(CanOpenPdoMapping {
                signal_id: mapping.signal_id.clone(),
                bit_offset: *bit_offset,
                bit_length: *bit_length,
                show_type,
            });
    }

    order
        .into_iter()
        .map(|frame_id| {
            let existing = legacy_frames
                .iter()
                .find(|frame| frame.frame_id == frame_id);
            CanOpenPdoFrame {
                frame_id,
                frame_type: existing.map(|frame| frame.frame_type).unwrap_or(0),
                direction: direction.clone(),
                description: existing
                    .map(|frame| frame.description.clone())
                    .unwrap_or_default(),
                mappings: grouped.remove(&frame_id).unwrap_or_default(),
                metadata: existing.and_then(|frame| frame.metadata.clone()),
            }
        })
        .collect()
}

fn legacy_show_type(
    frames: &[CanOpenPdoFrame],
    frame_id: u32,
    signal_id: &str,
    bit_offset: u16,
    bit_length: u16,
) -> u8 {
    frames
        .iter()
        .find(|frame| frame.frame_id == frame_id)
        .and_then(|frame| {
            frame.mappings.iter().find(|item| {
                item.signal_id == signal_id
                    && item.bit_offset == bit_offset
                    && item.bit_length == bit_length
            })
        })
        .map(|item| item.show_type)
        .unwrap_or(0)
}

pub(crate) fn derive_mappings(
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
