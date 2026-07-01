//! 多协议统一模型。
//!
//! 本模块只保存跨协议共享的数据结构，不读取项目 JSON，也不执行 legacy 兼容投影。

use crate::domain::private_protocol::PrivateProtocolDocument;
use crate::domain::signal::{SignalDictionary, SignalId};
use serde::{Deserialize, Serialize};
use serde_json::Value;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolCompatibilityReport {
    pub valid: bool,
    pub document: Value,
    pub updated_sections: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}
