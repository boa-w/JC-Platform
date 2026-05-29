# 架构设计

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

## React 表现层

负责：

- 页面布局
- 表格交互
- 树形菜单交互
- UI 资源画布
- 表单校验展示
- 用户操作反馈

不负责：

- 直接拼二进制
- 直接修改 `.jcpro` 文件
- 直接复制导出资源
- 承载协议计算细节

## Tauri Commands

连接前端和 Rust 核心服务。

## Domain 领域核心

领域核心只表达业务概念，不依赖 UI。

主要模型：

- `ProjectDocument`
- `ProjectSummary`
- `DeviceConfig`
- `UiResource`
- `PdoFrame` / `PdoSignal`
- `SdoMenu` / `SdoParameter`
- `LanguageConfig`
- `ExportPackage`

## Infrastructure 基础设施层

负责和外部系统打交道：

- `json_store`：JSON 读写
- `csv_excel`：CSV/XLS/XLSX 表格读写
- `binary_writer`：小端二进制写入
- `file_system`：目录创建、资源复制
