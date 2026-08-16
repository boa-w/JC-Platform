# 架构设计

## 产品定位

本项目是面向仪表设备配置的桌面工具。它同时承担三类工作：

1. 把旧版 `.jcpro` JSON 转换为可编辑、可校验的内存文档；
2. 把 UI、CAN 协议、设备参数和语言数据组织成项目配置；
3. 把项目配置转换为设备升级程序可消费的图片目录、JSON 清单和二进制数据。

这里有三个需要区分的对象：

- **编辑文档**：前端当前使用的完整 JSON，可能合并了 `.jcpro` 和重构 sidecar；
- **项目文件**：落盘的 `.jcpro` 或独立 `.refactor-config.json`，用于继续编辑和版本管理；
- **发布包**：导出目录中的 `ConfigUpdate.json`、`bin/*.bin` 和 `img/`，面向设备更新流程。

发布包不是把编辑文档原样复制出去，而是经过兼容适配、二进制打包和资源路径转换。

## 总体架构

采用分层架构：

```text
React 表现层
  ↓
Tauri Commands 应用入口
  ↓
Domain 领域核心
  ↓
Infrastructure 基础设施适配层
```

跨层数据流可以概括为：

```text
.jcpro / refactor sidecar
          ↓ 读取、补全、统一协议迁移
完整编辑文档（前端状态）
          ↓ 保存时兼容裁剪       ↓ 导出时构建
.jcpro + 可选 sidecar          jc_export/
                               ├─ ConfigUpdate.json
                               ├─ bin/*.bin
                               └─ img/
```

## React 表现层

负责：

- 页面布局
- 表格、树形菜单和 UI 资源画布交互
- 前端表单编辑、脏状态和恢复草稿
- CSV/XLS/XLSX、JSON 和 DBC 的选择与结果展示
- 导出设置、导出报告、二进制比较报告和错误反馈
- 通过 `src/api/commands.ts` 调用 Tauri Commands

不负责：

- 直接拼二进制
- 直接修改 `.jcpro` 文件
- 直接复制导出资源
- 承载协议计算细节

前端会把用户编辑合并到完整文档中，但 `.jcpro` 是否能保存这些字段由后端兼容策略决定。例如 `signal_dictionary`、`private_protocol` 和 `protocol_mapping` 在编辑态可用，保存为 `.jcpro` 时会写入 sidecar，而不是写入旧格式主文件。

## 功能模块边界

| 模块 | 主要职责 | 主要文档段或产物 |
| --- | --- | --- |
| 项目管理 | 创建、打开、迁移、校验、保存、另存为、恢复草稿和项目窗口生命周期 | `.jcpro`、sidecar |
| 设置数据 | 编辑 SDO 参数树和参数元数据 | `sdo_info` |
| 实时数据 | 编辑简化 PDO、高级 PDO 和 CANopen 节点/PDO 通信参数 | `pdo_simple_send_recv`、`pdo_*`、`canopen` |
| 业务信号字典 | 维护业务 Signal 及显示语义 | `signal_dictionary` |
| 私有协议 | 维护自定义传输帧和载荷 | `private_protocol` |
| 协议映射 | 维护 Signal 到 CANopen/私有帧的映射 | `protocol_mapping` |
| UI 资源 | 维护资源位置、选项和目标路径 | `ui_info`、`img/` |
| 锂电监控 | 维护帧、信号解析、显示项和超时策略 | `battery_monitor`、二进制扩展段 |
| 故障代码 | 维护故障来源和故障码 | `fault_code_info`、二进制扩展段 |
| 多国语言 v1 | 维护旧语言列表、文本和编辑顺序索引 | `language_info`、索引语言块 |
| 多国语言 v2 | 维护 locale、稳定消息 key 和复数形式 | `localization`、`LVI2` 动态包 |
| 项目导出 | 构建发布目录和设备兼容格式 | `ConfigUpdate.json`、`bin/` |
| CAN 测试数据 | 生成测试场景和纯帧文件 | TXT、CSV、说明 JSON |
| Git 版本 | 只提交受管项目配置 | `.jcpro`、sidecar |

统一协议页面用于维护更清晰的业务模型，但设备导出当前仍以旧版 PDO/SDO 兼容段为直接输入。用户需要通过“拍平统一协议”动作，把校验通过的 Signal/映射结果写回 `pdo_global_param`、`pdo_recv` 和 `pdo_send`，之后再按旧导出路径构建二进制。

## Tauri Commands

连接前端和 Rust 核心服务，负责参数边界、异步任务和错误返回。当前命令按职责分为：

- 项目生命周期：`create_project`、`load_project`、`save_project`、`save_project_as`、`migrate_project_document`、`parse_project_document`；
- 项目窗口：`open_project_window`、`create_project_window`、`release_project_window`；
- 表格交换：SDO、简化 PDO 和语言表的校验、导入和导出；
- 协议模型：统一协议解析、迁移、校验和拍平；
- 导出：`build_project_export_plan`、`build_project_binary_report`、`copy_ui_resource_images`、`export_project_package_command`；
- 文件和版本：JSON/文本文件读写、Git 工作树状态、版本审阅和恢复。

Command 层不重新实现领域规则，主要把前端请求转换为领域请求，并把结构化报告传回前端。

## Domain 领域核心

领域核心只表达业务概念，不依赖 UI。协议编辑模型包含两条兼容路径：

1. **旧格式路径**：保证现有 `.jcpro`、PDO/SDO 导出和设备二进制布局稳定；
2. **统一协议路径**：以 Signal、传输模型和显式映射表达协议，并在需要时拍平回旧字段。

主要模型：

- 项目：`ProjectDocument`、`ProjectSummary`、`ProjectExportSettings`、`DeviceConfig`；
- UI：`UiResource`、`ResourceOption`；
- PDO：`PdoFrame` / `PdoSignal`、`PdoAdvancedDocument`；
- SDO：递归 `SdoNodeDocument`；
- 统一协议：`SignalDictionary`、`PrivateProtocolDocument`、`ProtocolMapping`、`UnifiedProtocolModel`；
- 专用协议：`BatteryMonitorProtocol`、`fault_code_info` 文档段；
- 语言与导出：`LanguageConfig`、`ExportPlanReport`、`BinaryBuildReport`、`DataDescriptionPlan`。

导出领域服务的核心原则是：先计算所有路径、地址、数量和校验结果，再执行文件操作；二进制中的各段使用小端序，所有可选段通过 `-1` 地址和 `0` 数量表示缺失。

配置发布另有明确的版本路由：

```text
config_version == jc001 -> language_info -> v1 索引语言块 -> bin_generate()
config_version == jc002 -> localization  -> LVI2 动态语言包 -> bin_generate_jc002()
其他或混合字段          -> 构建/加载失败
```

两条发布路径只共享无版本差异的基础 PDO 和资源构建能力。语言 catalog、业务文本引用、清单专属字段和固件语言 loader 不共享。完整规则见 [配置版本边界](configuration-versions.md)。

## Infrastructure 基础设施层

负责和外部系统打交道：

- `json_store`：JSON 文档读写和格式化边界；
- `csv_excel`：CSV/XLS/XLSX 表格读取、表头校验和工作簿写出；
- `binary_writer`：基础小端二进制写入能力；
- `file_system`：目录创建、文件复制和路径适配；
- `git`：发现项目所在仓库、限定受管路径、读取版本和创建项目配置提交；
- `recovery`：app-data 中的异常退出恢复草稿；
- `credentials`：翻译服务凭据的安全存储；
- `can_test` / DBC 适配：CAN 测试数据和 DBC 文件交换。

## 关键生命周期

### 打开项目

1. 解析路径并加载 JSON；
2. 前端为编辑态补齐缺失的导出、锂电监控和故障码段；
3. 对 `.jcpro` 自动查找同名 `.refactor-config.json`（兼容查找同名 `.json`）；
4. 只把 sidecar 中的重构专属三段合并到编辑文档；
5. 运行项目结构校验，并按需解析统一协议；完整迁移由用户显式执行“迁移项目”操作。

### 保存项目

- 保存为 `.jcpro` 时写入 `jc001` 兼容格式，刷新 `project.update_time`，并移除 `signal_dictionary`、`private_protocol`、`protocol_mapping`；
- 如果这些重构专属段有修改，则写入或更新独立 sidecar；
- 保存为非 `.jcpro` JSON 时保留完整编辑文档；
- 另存为项目时会复制 UI 图片，并把绝对资源路径转换为目标项目下的相对路径。

上述兼容保存流程是当前 v1 `.jcpro` 生命周期。v2 文件必须保留 `config_version: "jc002"` 和 `localization`，不得经过会强制生成 `jc001` 或剥离 v2 字段的兼容保存函数。当前实现应在正式开放 v2 编辑保存前补充独立保存入口和端到端测试。

### 导出项目

导出由 `domain::export` 统一完成。入口先严格检查 `config_version` 和语言段互斥，再分派 v1 或 v2 编码。只有没有前置错误时才清理导出目录、复制图片、写二进制和写清单。v1 布局见 [jc001 导出机制](export-build.md)，v2 布局见 [jc002 发布包与二进制 ABI](export-build-v2.md)。
