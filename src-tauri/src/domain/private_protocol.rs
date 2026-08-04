//! 私有协议传输层模型。
//!
//! 私有协议只描述帧和载荷布局，不承载业务展示语义；业务语义通过 SignalId 引用。

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
    Imported,
}

pub fn derive_private_protocol_from_legacy(document: &Value) -> PrivateProtocolDocument {
    let mut protocol = document
        .get("private_protocol")
        .and_then(|value| serde_json::from_value::<PrivateProtocolDocument>(value.clone()).ok())
        .unwrap_or_default();

    protocol.enabled = protocol.enabled || !protocol.frames.is_empty();
    protocol
}
