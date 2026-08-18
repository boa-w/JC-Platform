# 架构设计

> 维护边界：业务信号字典和基于 jc001 的重构外挂 JSON（sidecar）均已废弃。它们只保留历史项目查看、迁移和兼容保存路径；新功能应直接使用 jc002 的内置协议、Profile 和 localization 区段。

## 产品定位

本项目是面向仪表设备配置的桌面工具。它同时承担三类工作：

1. 把旧版 `.jcpro` JSON 转换为可编辑、可校验的内存文档；
2. 把 UI、CAN 协议、设备参数和语言数据组织成项目配置；
3. 把项目配置转换为设备升级程序可消费的图片目录、JSON 清单和二进制数据。

这里有三个需要区分的对象：

- **编辑文档**：前端当前使用的完整 JSON，可能合并了 `.jcpro` 和 v1 废弃 sidecar；
- **项目文件**：落盘的 `.jcpro` 或独立的 v1 `.refactor-config.json`，用于历史项目继续编辑和版本管理；
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
.jcpro / v1 废弃 refactor sidecar
          ↓ 读取、补全、统一协议迁移
完整编辑文档（前端状态）
          ↓ 保存时兼容裁剪       ↓ 导出时构建
.jcpro + 可选 v1 sidecar       jc_export/
                               ├─ ConfigUpdate.json
                               ├─ bin/*.bin
                               └─ img/
```

对于 jc002，编辑文档中的 `protocol_profiles` 分别保存控制器、锂电和故障码协议集合，
`active_controller_profile_id`、`active_battery_profile_id` 与
`active_fault_code_profile_id` 独立决定各自页面编辑内容和发布包默认生成的 Profile Bundle。
单套编辑文档在导出时自动包装为默认 Profile，所有组合进入同一个 data.bin；下位机选择后
仍以单套 PDO/SDO/battery/fault 二进制 ABI 运行，不把完整 Profile JSON 下发到设备。

## React 表现层

jc002 多国语言采用“公共语言目录 + Profile overlay”：根级 localization 统一维护
locale 集合、default_locale 和 locale_order；控制器、锂电和故障码 Profile 分别维护局部 overlay。
导出每个控制器 × 锂电 × 故障码组合时独立合并并生成 LVI2，因此不同 Profile 可以拥有不同文案，
同时保持固件语言索引一致。多国语言页的 Profile 作用域只编辑 overlay，公共作用域负责
语言集合和顺序。

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

前端会把用户编辑合并到完整文档中，但 `.jcpro` 是否能保存这些字段由后端兼容策略决定。例如历史 v1 的 `signal_dictionary`、`private_protocol` 和 `protocol_mapping` 在编辑态可用，保存为 `.jcpro` 时会写入已废弃的 sidecar，而不是写入旧格式主文件。

## 功能模块边界

| 模块 | 主要职责 | 主要文档段或产物 |
| --- | --- | --- |
| 项目管理 | 创建、打开、迁移、校验、保存、另存为、恢复草稿和项目窗口生命周期 | `.jcpro`、v1 废弃 sidecar |
| 设置数据 | 编辑 SDO 参数树和参数元数据 | `sdo_info` |
| 实时数据 | 导入简化 PDO 表并转换为高级 PDO，编辑高级 PDO 和 CANopen 节点/PDO 通信参数 | jc001 的 `pdo_simple_send_recv`、jc002 的 `pdo_*`、`canopen` |
| 控制器协议 Profile | 维护 ACM/Inmotion 的 PDO、SDO 和 CANopen 协议 | `protocol_profiles.controller_profiles` |
| 业务信号字典（已废弃） | 维护历史业务 Signal 及显示语义 | `signal_dictionary` |
| 私有协议 | 维护自定义传输帧和载荷 | `private_protocol` |
| 协议映射 | 维护 Signal 到 CANopen/私有帧的映射 | `protocol_mapping` |
| UI 资源 | 维护资源位置、选项和目标路径 | `ui_info`、`img/` |
| 锂电协议 Profile | 独立维护不同 BMS 的帧、信号解析、显示项和超时策略 | `protocol_profiles.battery_profiles` |
| 锂电监控运行时 | 消费当前激活锂电 Profile 的二进制扩展段 | `battery_monitor`、二进制扩展段 |
| 故障代码 Profile | 维护故障来源、定义、绑定和故障专属文案 | `protocol_profiles.fault_code_profiles`、二进制扩展段 |
| 多国语言 v1 | 维护旧语言列表、文本和编辑顺序索引 | `language_info`、索引语言块 |
| 多国语言 v2 | 维护 locale、稳定消息 key 和复数形式 | `localization`、`LVI2` 动态包 |
| 项目导出 | 构建发布目录和设备兼容格式 | `ConfigUpdate.json`、`bin/` |
| CAN 测试数据 | 生成测试场景和纯帧文件 | TXT、CSV、说明 JSON |
| Git 版本 | 只提交受管项目配置 | `.jcpro`、v1 废弃 sidecar |

统一协议页面用于维护更清晰的业务模型。jc001 仍以旧版 PDO/SDO 兼容段为直接输入；jc002
则把高级 PDO 四段作为唯一构建输入。用户需要通过“拍平统一协议”动作，把校验通过的
Signal/映射结果写回 `pdo_global_param`、`pdo_recv` 和 `pdo_send`，之后按当前配置版本的
导出路径构建二进制。

## Tauri Commands

连接前端和 Rust 核心服务，负责参数边界、异步任务和错误返回。当前命令按职责分为：

- 项目生命周期：`create_project`、`load_project`、`save_project`、`save_project_as`、`migrate_project_document`、`parse_project_document`；
- 项目窗口：`open_project_window`、`create_project_window`、`release_project_window`；
- 表格交换：SDO、简化 PDO 和语言表的校验与导入；简化 PDO 导入后转换为高级四段，jc002 不提供简化 PDO 导出；
- 协议模型：统一协议解析、迁移、校验和拍平；
- 导出：`build_project_export_plan`、`build_project_binary_report`、`copy_ui_resource_images`、`export_project_package_command`；
- 文件和版本：JSON/文本文件读写、Git 工作树状态、版本审阅和恢复。

Command 层不重新实现领域规则，主要把前端请求转换为领域请求，并把结构化报告传回前端。

## Domain 领域核心

领域核心只表达业务概念，不依赖 UI。协议编辑模型包含两条明确隔离的版本路径：

1. **jc001 旧格式路径**：保证现有 `.jcpro`、PDO/SDO 导出和设备二进制布局稳定，保留简化 PDO 的历史兼容回退；
2. **jc002 高级路径**：以高级 PDO 四段作为唯一构建输入，简化 PDO 只作为表格导入的临时格式；统一协议模型在需要时拍平回高级字段。

主要模型：

- 项目：`ProjectDocument`、`ProjectSummary`、`ProjectExportSettings`、`DeviceConfig`；
- UI：`UiResource`、`ResourceOption`；
- PDO：`PdoFrame` / `PdoSignal`、`PdoAdvancedDocument`；
- SDO：递归 `SdoNodeDocument`；
- 统一协议：`SignalDictionary`、`PrivateProtocolDocument`、`ProtocolMapping`、`UnifiedProtocolModel`；
- 专用协议：`BatteryMonitorProtocol`、`fault_code_profiles` 文档段；
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
2. 前端仅为 jc002 编辑态管理故障码 Profile；jc001 不补齐、不读取故障码段；
3. 对 v1 `.jcpro` 自动查找同名 `.refactor-config.json`（兼容查找同名 `.json`）；该 sidecar 机制已废弃，仅用于历史兼容；
4. 只把 sidecar 中的重构专属三段合并到编辑文档；
5. 运行项目结构校验，并按需解析统一协议；完整迁移由用户显式执行“迁移项目”操作。

### 保存项目

- 保存为 `.jcpro` 时写入 `jc001` 兼容格式，刷新 `project.update_time`，并移除 `signal_dictionary`、`private_protocol`、`protocol_mapping`；
- 保存 jc002 时保留 `config_version`、`localization` 和 `protocol_profiles`，不经过 jc001 清洗器；
- 如果这些 v1 重构专属段有修改，则写入或更新独立 sidecar；该路径仅用于历史兼容；
- 保存为非 `.jcpro` JSON 时保留完整编辑文档；
- 另存为项目时会复制 UI 图片，并把绝对资源路径转换为目标项目下的相对路径。

上述兼容保存流程只属于 v1 `.jcpro` 生命周期。v2 文件必须保留 `config_version: "jc002"`、
`localization` 和可选的 `protocol_profiles`，不得经过会强制生成 `jc001` 或剥离 v2 字段的兼容保存函数。

### 导出项目

导出由 `domain::export` 统一完成。入口先严格检查 `config_version` 和语言段互斥，再分派 v1 或 v2 编码。只有没有前置错误时才清理导出目录、复制图片、写二进制和写清单。v1 布局见 [jc001 导出机制](export-build.md)，v2 布局见 [jc002 发布包与二进制 ABI](export-build-v2.md)。
