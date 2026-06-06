//! 顺序写入的二进制缓冲区构建器。
//!
//! 提供类型安全的写入方法，所有数值均以小端序（Little-Endian）写入。

/// 顺序写入的二进制缓冲区。
///
/// 使用示例：
/// ```ignore
/// let mut writer = BinaryWriter::new();
/// writer.write_u8(0x01);
/// writer.write_u16_le(0x1234);
/// let bytes = writer.into_inner();
/// ```
#[derive(Debug, Default)]
pub struct BinaryWriter {
    buffer: Vec<u8>,
}

impl BinaryWriter {
    /// 创建空的写入器。
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// 当前写入位置（已写入的字节数）。
    pub fn position(&self) -> usize {
        self.buffer.len()
    }

    /// 写入一个字节。
    pub fn write_u8(&mut self, value: u8) {
        self.buffer.push(value);
    }

    /// 写入 16-bit 无符号整数（小端序）。
    pub fn write_u16_le(&mut self, value: u16) {
        self.buffer.extend_from_slice(&value.to_le_bytes());
    }

    /// 写入 32-bit 无符号整数（小端序）。
    pub fn write_u32_le(&mut self, value: u32) {
        self.buffer.extend_from_slice(&value.to_le_bytes());
    }

    /// 写入原始字节切片。
    pub fn write_bytes(&mut self, bytes: &[u8]) {
        self.buffer.extend_from_slice(bytes);
    }

    /// 消费写入器，返回内部缓冲区。
    pub fn into_inner(self) -> Vec<u8> {
        self.buffer
    }
}
