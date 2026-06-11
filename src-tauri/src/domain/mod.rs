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

pub mod export;
pub mod language;
pub mod pdo;
pub mod private_protocol;
pub mod project;
pub mod protocol_manager;
pub mod sdo;
pub mod signal;
pub mod ui_resource;
