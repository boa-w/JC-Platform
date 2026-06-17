//! 多协议管理领域。
//!
//! 该目录把协议模型、CANOpen 投影、映射、校验和 legacy 兼容适配拆开，
//! 让后续新增协议时不再继续扩大 protocol_manager facade。

pub mod battery_bridge;
pub mod canopen_projection;
pub mod legacy_adapter;
pub mod mapping;
pub mod model;
pub mod validation;
