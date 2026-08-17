# 自定义开发平台

基于 Tauri 2 + React + Rust 的仪表设备配置工具。项目以 `.jcpro` 为主配置载体，提供仪表 UI 资源、CAN/PDO/SDO 协议、锂电监控、故障码和多语言数据的编辑、校验、表格交换及设备发布包导出。

## 技术栈

- **前端**：React 18 + TypeScript + Vite
- **桌面端**：Tauri 2
- **后端**：Rust (serde, calamine, thiserror)

## 项目功能

### 配置编辑

- **项目管理**：创建、打开、保存、另存为和迁移 `.jcpro`；执行结构校验，维护最近项目，保存异常退出恢复草稿，并按项目路径提供独立窗口。
- **设置数据**：编辑 SDO 菜单树、参数权限、读写控制、默认值、上下限、数据类型和预处理。
- **实时数据**：以简化表格或高级结构维护 PDO 接收/发送帧、全局变量、条件表和信号绑定。
- **业务信号字典（已废弃）**：历史统一 Signal 模型，仅用于旧项目查看、迁移和兼容审阅。
- **私有协议**：维护自定义帧、周期、校验、字节序和载荷布局；当前主要用于重构协议模型和兼容迁移。
- **协议映射**：将业务 Signal 映射到 CANopen SDO/PDO 或私有帧，并执行跨层校验。
- **CANopen 导出**：从旧项目配置生成 CANopen EDS、厂商扩展、模型报告和 SDO/PDO 测试帧；这是协议交换工具，不等同于设备发布包导出。
- **UI 资源编辑**：管理分辨率画布、开机 Logo、主页面资源、静态图、列表图、动画帧、坐标、尺寸、默认选项和设备端目标路径。
- **锂电监控协议**：统一维护监控 CAN 帧、原始取数、位域解析、显示格式、单位、语言名称和超时策略。
- **故障代码**：维护故障来源帧、来源类型、取码字节、无效码、故障码、等级及多语言文案绑定。

### 数据交换与验证

- **多国语言**：v1 维护 `language_info` 和索引语言块；v2 使用独立 `localization` schema、稳定消息 key 和 LVGL `lv_i18n` 风格动态语言包。两套格式不混用、不隐式回退。
- **CAN 测试数据**：从 PDO、SDO 和锂电监控配置提取帧，生成冒烟、边界、故障和回归等测试场景，并导出 TXT、CSV 和说明 JSON。
- **二进制检查**：预览二进制大小、CRC、段地址和语言数量，也可与旧版 `.bin` 逐字节比较并报告首个差异。
- **Git 项目版本**：复用项目所在仓库，仅管理当前 `.jcpro` 和关联的 v1 废弃兼容 sidecar，不会自动提交源码、图片或导出目录。详见 [项目版本管理](docs/project-version-management.md)。

### 发布导出

项目导出会在输出目录下生成 `jc_export`（名称可配置），包含：

- `ConfigUpdate.json`（名称可配置）：设备信息、屏幕资源清单和二进制数据描述；
- `bin/pdo_sdo_data.bin`（名称可配置）：按设备兼容布局打包的 PDO、锂电监控、故障码、SDO 和语言数据；
- `img/`、`img/anim/`：按 UI 资源的默认选项复制的静态图片和动画帧。

版本边界见 [配置版本边界](docs/configuration-versions.md)。v1 导出见 [jc001 导出机制](docs/export-build.md)，v2 导出和 ABI 见 [jc002 发布包与二进制 ABI](docs/export-build-v2.md)。

## 目录结构

```text
src/                         React + TypeScript 前端
  api/                       Tauri command 调用封装
  components/                通用组件
  data/                      静态模块定义
  pages/                     页面级组件
  stores/                    前端状态边界
  styles/                    样式
  types/                     前端类型
  utils/                     工具函数

src-tauri/                   Rust / Tauri 后端
  src/commands/              Tauri 命令入口
  src/domain/                领域模型
  src/infrastructure/        文件、JSON、表格、二进制适配层
  capabilities/              Tauri 权限配置

docs/                        项目文档
```

## 文档索引

- [架构设计](docs/architecture.md)：前端、Tauri Commands、领域层和基础设施层的职责，以及配置生命周期。
- [配置版本边界](docs/configuration-versions.md)：`jc001`/`jc002` 的互斥字段、loader 和部署隔离规则。
- [jc001 数据格式](docs/data-format.md)：旧版项目、已废弃的 v1 sidecar、统一协议编辑态和兼容保存规则。
- [jc001 导出机制](docs/export-build.md)：旧索引语言块和 v1 二进制布局。
- [jc002 数据格式](docs/data-format-v2.md)：`localization`、稳定消息 key 和业务引用规则。
- [jc002 发布包与 ABI](docs/export-build-v2.md)：`LVI2`、v2 SDO、battery 和 fault 记录布局。
- [jc002 固件运行时](docs/firmware-i18n-v2.md)：加载、严格查询、测试和设备验收边界。
- [Inmotion6 jc002 测试构建](docs/jc002-inmotion6-test-build.md)：完整业务测试配置、发布包和可重复生成命令。
- [开发指南](docs/development.md)：环境、命令、代码组织和测试边界。
- [本地 CI 预检](docs/ci-preflight.md)：按 GitHub Actions 相同入口执行前端、Rust 和 Playwright 检查。

## 开发命令

安装依赖：

```bash
npm install
```

启动前端开发服务器：

```bash
npm run dev
```

启动 Tauri 桌面应用：

```bash
npm run tauri:dev
```

前端构建：

```bash
npm run build
```

提交前完整预检（包含 Playwright UI 测试）：

```powershell
npm run verify:ci
```

Rust 检查：

```bash
cd src-tauri
cargo check
```

Windows 安装包冒烟测试（需先生成 NSIS 安装包）：

```powershell
npm run test:installer:windows
```

该测试会在临时目录静默安装应用，确认主进程能启动，然后静默卸载并校验安装目录已清理。如果 `previous-installer` 目录中有上一版 NSIS 安装包，可运行：

```powershell
npm run test:upgrade:windows
```

升级测试会验证旧版安装、新版覆盖升级、主程序替换和启动，并确认外部 `.jcpro` 项目与 app-data 恢复草稿在升级和卸载后保持不变。

## CI 构建产物

GitHub Actions 会构建 Windows 与 macOS 桌面应用：

- Windows：冒烟验证 NSIS 安装、启动和卸载；存在上一版 nightly 时追加跨版本升级回归，然后上传 `.msi` / `.exe` 安装包。
- macOS：挂载 DMG，验证 Bundle 元数据、主程序启动和 app-data 保留后，上传 `.dmg` / `.app` 产物。

nightly macOS 产物可以未签名；stable Release 必须通过 Developer ID 签名、Gatekeeper 评估和 notarization ticket 验证，否则流水线不会上传产物。
