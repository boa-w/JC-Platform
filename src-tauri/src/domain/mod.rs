//! 领域层 —— 所有业务逻辑的实现。
//!
//! | 子模块 | 说明 |
//! |--------|------|
//! | `pdo` | CANopen PDO（过程数据对象）的解析与构建 |
//! | `sdo` | CANopen SDO（服务数据对象）的解析与构建 |
//! | `language` | 多语言翻译表的导入导出 |
//! | `ui_resource` | 屏幕 UI 资源（logo / 主页面元素）的解析与编辑 |
//! | `project` | `.jcpro` 项目文件的加载、保存、迁移、校验 |
//! | `export` | 项目导出：图片拷贝、二进制打包、ConfigUpdate.json 清单生成 |
//! | `can_test` | CAN 测试数据构建：从 PDO/锂电配置提取帧、生成测试 HEX |
//! | `canopen_convert` | 旧项目 CANopen 兼容模型、EDS 和测试帧转换 |

pub mod can_test;
pub mod canopen_convert;
pub mod export;
pub mod language;
pub mod pdo;
pub mod private_protocol;
pub mod project;
pub mod project_compat;
pub mod protocol;
pub mod protocol_manager;
pub mod sdo;
pub mod signal;
pub mod translation;
pub mod ui_resource;
