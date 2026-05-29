//! 基础设施层 —— 文件 I/O 与格式转换的底层工具。
//!
//! | 子模块 | 说明 |
//! |--------|------|
//! | `binary_writer` | 顺序写入的二进制缓冲区构建器 |
//! | `csv_excel` | CSV / Excel（`.xlsx`）表格的读写与表头校验 |
//! | `file_system` | 目录创建、文件拷贝等文件系统便捷操作 |
//! | `json_store` | JSON 文件的读取与序列化写入 |

pub mod binary_writer;
pub mod csv_excel;
pub mod file_system;
pub mod json_store;
